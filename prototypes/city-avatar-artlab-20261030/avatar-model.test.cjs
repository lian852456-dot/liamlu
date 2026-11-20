const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = __dirname;

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function run(context, file) {
  vm.runInContext(read(file), context, {filename: path.join(ROOT, file)});
}

function makeFixture() {
  let fetchCalls = 0;
  const context = {
    console,
    fetch() {
      fetchCalls += 1;
      throw new Error('avatar model tests must not fetch external assets');
    },
    performance: {now: () => 1000},
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);

  run(context, 'base/vendor/three.js');
  run(context, 'base/r2-geometry-index.js');
  run(context, 'base/static-mesh.js');
  run(context, 'base/models.js');
  run(context, 'base/character-gestures.js');
  run(context, 'avatar-deluxe.js');
  run(context, 'avatar-candidate.js');

  const realCompile = context.CozyStaticMesh.compile;
  let collection = null;
  context.CozyStaticMesh.compile = function collectCompile(group, options) {
    if (collection) {
      group.traverse(node => {
        if (!node.isMesh) return;
        if (node.geometry) collection.geometries.add(node.geometry);
        for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
          if (material) collection.materials.add(material);
        }
      });
    }
    return realCompile.call(this, group, options);
  };

  function create(factory, options = {}) {
    const parent = new context.THREE.Group();
    const resources = {geometries: new Set(), materials: new Set()};
    collection = resources;
    const model = factory(parent, options);
    collection = null;
    return {parent, model, resources};
  }

  return {
    context,
    THREE: context.THREE,
    Models: context.CozyModels,
    original: context.CozyAvatarCandidate.originalFactory,
    candidate: context.CozyAvatarCandidate,
    deluxe: context.CozyAvatarDeluxe,
    gestures: context.CozyCharacterGestures,
    create,
    get fetchCalls() { return fetchCalls; },
  };
}

function intersection(left, right) {
  return new Set([...left].filter(value => right.has(value)));
}

function collectFinal(model) {
  const geometries = new Set();
  const materials = new Set();
  model.group.traverse(node => {
    if (!node.isMesh) return;
    if (node.geometry) geometries.add(node.geometry);
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
      if (material) materials.add(material);
    }
  });
  return {geometries, materials};
}

function metrics(model) {
  const geometries = new Set();
  const materials = new Set();
  let meshes = 0;
  let vertices = 0;
  let indices = 0;
  let bufferBytes = 0;
  model.group.traverse(node => {
    if (!node.isMesh) return;
    meshes += 1;
    if (node.geometry) {
      geometries.add(node.geometry);
      const positions = node.geometry.attributes?.position;
      if (positions) vertices += positions.count;
      if (node.geometry.index) indices += node.geometry.index.count;
      for (const attribute of Object.values(node.geometry.attributes || {})) {
        if (attribute.array) bufferBytes += attribute.array.byteLength;
      }
      if (node.geometry.index?.array) bufferBytes += node.geometry.index.array.byteLength;
    }
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
      if (material) materials.add(material);
    }
  });
  return {
    meshCount: meshes,
    drawUnits: meshes,
    geometryCount: geometries.size,
    materialCount: materials.size,
    vertexCount: vertices,
    indexCount: indices,
    bufferBytes,
  };
}

function allMeshes(model) {
  const result = [];
  model.group.traverse(node => { if (node.isMesh) result.push(node); });
  return result;
}

function allMaterialsHaveNoTexture(model) {
  return allMeshes(model).every(mesh => {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    return materials.every(material => !material?.map && !material?.normalMap && !material?.emissiveMap);
  });
}

function trackDisposals(THREE) {
  const disposedGeometries = new WeakMap();
  const disposedMaterials = new WeakMap();
  const originalGeometryDispose = THREE.BufferGeometry.prototype.dispose;
  const originalMaterialDispose = THREE.Material.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function trackedGeometryDispose() {
    disposedGeometries.set(this, (disposedGeometries.get(this) || 0) + 1);
    return originalGeometryDispose.call(this);
  };
  THREE.Material.prototype.dispose = function trackedMaterialDispose() {
    disposedMaterials.set(this, (disposedMaterials.get(this) || 0) + 1);
    return originalMaterialDispose.call(this);
  };
  return {
    geometryCount: geometry => disposedGeometries.get(geometry) || 0,
    materialCount: material => disposedMaterials.get(material) || 0,
    restore() {
      THREE.BufferGeometry.prototype.dispose = originalGeometryDispose;
      THREE.Material.prototype.dispose = originalMaterialDispose;
    },
  };
}

test('Art Lab routing is opt-in and the native character contract remains available', () => {
  const fx = makeFixture();
  const normal = fx.create(fx.Models.character, {color: 0xe5814c});
  const demo = fx.create(fx.Models.character, {artLabDemo: true, color: 0x303036});

  assert.equal(fx.candidate.originalFactory, fx.original);
  assert.equal(normal.model.group.userData.artLabCandidate, undefined);
  assert.equal(normal.model.active, undefined, 'ordinary/peer model must remain the original API');
  assert.equal(demo.model.group.userData.artLabDemo, true);
  assert.equal(demo.model.version, 'new');
  assert.equal(demo.model.active.group.parent, demo.model.group);
  for (const key of ['setAppearance', 'setColor', 'setHairStyle', 'animate', 'dispose']) {
    assert.equal(typeof demo.model[key], 'function', `demo keeps ${key} contract`);
    assert.equal(typeof normal.model[key], 'function', `ordinary keeps ${key} contract`);
  }
  assert.equal(fx.candidate.instances.length, 1);
  demo.model.dispose();
  normal.model.dispose();
  assert.equal(fx.candidate.instances.length, 0);
  assert.equal(normal.parent.children.length, 0);
  assert.equal(demo.parent.children.length, 0);
});

test('appearance profile is cloned, version stays outside it, and old/new toggles preserve API state', () => {
  const fx = makeFixture();
  const demo = fx.create(fx.Models.character, {artLabDemo: true, color: 0x303036}).model;
  const profile = Object.freeze({
    character: 'teal',
    skin: 'purple',
    hair: 'hair-pony',
    hairColor: '#b98f7c',
    outfit: 'forest',
    avatarPreset: 'demo-only',
  });
  demo.setAppearance(profile);
  assert.equal(JSON.stringify(demo.profile), JSON.stringify(profile));
  assert.notStrictEqual(demo.profile, profile);
  assert.equal(demo.profile.version, undefined);
  assert.equal(demo.version, 'new');
  assert.equal(demo.group.userData.avatarVersion, 'new');

  let previous = demo.active;
  for (let i = 0; i < 30; i += 1) {
    const nextVersion = i % 2 === 0 ? 'old' : 'new';
    fx.candidate.setVersion(nextVersion);
    assert.equal(previous.group.parent, null, 'toggle disposes the prior active model');
    assert.equal(demo.version, nextVersion);
    assert.equal(JSON.stringify(demo.profile), JSON.stringify(profile));
    assert.equal(demo.group.children.length, 1, 'toggle leaves one active child');
    assert.equal(fx.candidate.instances.length, 1, 'toggle does not create an extra candidate instance');
    previous = demo.active;
  }
  demo.dispose();
  assert.equal(fx.candidate.instances.length, 0);
});

test('deluxe geometry is native, layered, animated, texture-free, and gesture-compatible', t => {
  const fx = makeFixture();
  const demo = fx.create(fx.Models.character, {artLabDemo: true, color: 0x303036}).model;
  demo.setAppearance({skin: 'teal', hair: 'hair-bob', outfit: 'uniform'});
  const modelMetrics = metrics(demo);
  t.diagnostic(`avatar metrics ${JSON.stringify(modelMetrics)}`);
  assert.ok(modelMetrics.meshCount > 0 && modelMetrics.vertexCount > 0 && modelMetrics.bufferBytes > 0);
  assert.ok(allMeshes(demo).some(mesh => mesh.geometry.type !== 'BoxGeometry'), 'new head/limbs use rounded native geometry');
  assert.equal(fx.fetchCalls, 0, 'model construction does not fetch textures or external assets');
  assert.equal(allMaterialsHaveNoTexture(demo), true);

  const headGroups = demo.head.children.filter(node => node.isGroup);
  assert.ok(headGroups.length >= 3, 'head exposes skin, face and layered hair groups');
  const face = headGroups.find(group => group.children.some(child => child.name === 'smile'));
  assert.ok(face, 'face group is present');
  const eyes = face.children.filter(child => child.isGroup && Math.abs(child.position.x) > .1 && child.children.some(node => node.isMesh));
  assert.equal(eyes.length, 2, 'both eye groups are present');
  const skinGroup = headGroups.find(group => group !== face && group.children.some(node => node.isMesh && node.geometry?.boundingBox?.max?.z > .43));
  assert.ok(skinGroup, 'face/nose projection is present in the head geometry');
  const layeredHair = headGroups.find(group => group !== face && group.children.filter(node => node.isMesh).length >= 2);
  assert.ok(layeredHair, 'hair is made from layered native meshes');

  const eyeScaleBefore = eyes.map(eye => eye.scale.y);
  const body = demo.active.group.children.find(node => node.isGroup && node.position.y === 0);
  assert.ok(body, 'body group is present');
  demo.animate(0, false, false, false);
  const breathingBefore = body.scale.y;
  demo.animate(12.5, false, false, false);
  assert.notDeepEqual(eyes.map(eye => eye.scale.y), eyeScaleBefore, 'blink changes eye scale');
  assert.notEqual(body.scale.y, breathingBefore, 'idle breathing changes body scale');
  const armBefore = demo.arms.map(arm => arm.rotation.x);
  const legBefore = demo.legs.map(leg => leg.rotation.x);
  demo.animate(1.1, true, false, false);
  assert.notDeepEqual(demo.arms.map(arm => arm.rotation.x), armBefore, 'walking moves arms');
  assert.notDeepEqual(demo.legs.map(leg => leg.rotation.x), legBefore, 'walking moves legs');
  demo.animate(1.1, false, true, true);
  assert.ok(demo.legs.every(leg => Math.abs(leg.rotation.x + 1.16) < 1e-9), 'sitting pose is supported');
  assert.ok(demo.arms[1].rotation.z < -1.8, 'wave pose is supported');

  for (const kind of ['greet', 'highfive', 'stumble']) {
    fx.gestures.reset(demo);
    const before = demo.arms.map(arm => ({x: arm.rotation.x, z: arm.rotation.z}));
    const state = fx.gestures.start(demo, kind, 0);
    const pose = state.update(fx.gestures.duration(kind) / 2);
    assert.equal(pose.kind, kind);
    assert.ok(demo.arms.some((arm, index) => arm.rotation.x !== before[index].x || arm.rotation.z !== before[index].z), `${kind} gesture changes arm pose`);
    fx.gestures.reset(demo);
    const restored = demo.arms.map(arm => ({x: arm.rotation.x, z: arm.rotation.z}));
    for (let index = 0; index < before.length; index += 1) {
      assert.ok(Math.abs(restored[index].x - before[index].x) < 1e-9, `${kind} restores arm x offset`);
      assert.ok(Math.abs(restored[index].z - before[index].z) < 1e-9, `${kind} restores arm z offset`);
    }
  }
  demo.dispose();
});

test('repeated hair/outfit rebuilds do not grow owned resources', t => {
  const fx = makeFixture();
  const demo = fx.create(fx.Models.character, {artLabDemo: true, color: 0x303036}).model;
  const profiles = ['bob', 'pony', 'braids', 'silver'].flatMap(hair =>
    ['uniform', 'forest', 'ocean', 'rose'].map(outfit => ({skin: 'teal', hair: `hair-${hair}`, outfit})));
  profiles.forEach(profile => demo.setAppearance(profile));
  profiles.forEach(profile => demo.setAppearance(profile));
  const expected = new Map();
  profiles.forEach(profile => {
    demo.setAppearance(profile);
    const state = demo.active.state();
    expected.set(JSON.stringify(profile), {geometries: state.ownedGeometries, materials: state.ownedMaterials});
  });
  const history = [];
  for (let i = 0; i < 50; i += 1) {
    const profile = profiles[i % profiles.length];
    demo.setAppearance(profile);
    const state = demo.active.state();
    const plateau = expected.get(JSON.stringify(profile));
    history.push({cycle: i + 1, profile, geometries: state.ownedGeometries, materials: state.ownedMaterials, expected: plateau});
  }
  t.diagnostic(`ownership per-profile plateau=${JSON.stringify([...expected])} history=${JSON.stringify(history)}`);
  for (const state of history) {
    assert.equal(state.geometries, state.expected.geometries, `cycle ${state.cycle} geometry ownership is bounded for its profile`);
    assert.equal(state.materials, state.expected.materials, `cycle ${state.cycle} material ownership is bounded for its profile`);
  }
  demo.dispose();
});

test('disposal preserves shared baseline and deluxe geometry/material resources', () => {
  const fx = makeFixture();
  const baseA = fx.create(fx.original);
  const baseB = fx.create(fx.original);
  const deluxeA = fx.create(fx.deluxe.create);
  const deluxeB = fx.create(fx.deluxe.create);
  const sharedBaseline = {
    geometries: intersection(baseA.resources.geometries, baseB.resources.geometries),
    materials: intersection(baseA.resources.materials, baseB.resources.materials),
  };
  const sharedDeluxe = {
    geometries: intersection(deluxeA.resources.geometries, deluxeB.resources.geometries),
    materials: intersection(deluxeA.resources.materials, deluxeB.resources.materials),
  };
  assert.ok(sharedBaseline.geometries.size + sharedBaseline.materials.size > 0, 'baseline cache resources were observed');
  assert.ok(sharedDeluxe.geometries.size > 0, 'deluxe shared geometry was observed');

  const tracker = trackDisposals(fx.THREE);
  const demo = fx.create(fx.Models.character, {artLabDemo: true, color: 0x303036}).model;
  demo.setAppearance({skin: 'purple', hair: 'hair-pony', outfit: 'forest'});
  for (let i = 0; i < 30; i += 1) {
    fx.candidate.setVersion(i % 2 ? 'old' : 'new');
    demo.setAppearance({skin: 'purple', hair: i % 2 ? 'hair-bob' : 'hair-pony', outfit: 'forest'});
  }
  demo.dispose();
  baseA.model.dispose();
  baseB.model.dispose();
  deluxeA.model.dispose();
  deluxeB.model.dispose();
  for (const geometry of sharedBaseline.geometries) assert.equal(tracker.geometryCount(geometry), 0, 'baseline shared geometry remains live');
  for (const material of sharedBaseline.materials) assert.equal(tracker.materialCount(material), 0, 'baseline shared material remains live');
  for (const geometry of sharedDeluxe.geometries) assert.equal(tracker.geometryCount(geometry), 0, 'deluxe shared geometry remains live');
  for (const material of sharedDeluxe.materials) assert.equal(tracker.materialCount(material), 0, 'deluxe shared material remains live');
  tracker.restore();
  assert.equal(fx.candidate.instances.length, 0);
});

test('turning eases the visible model while the authoritative root heading stays unchanged', () => {
  const fx = makeFixture();
  let now = 1000;
  fx.context.performance.now = () => now;
  const demo = fx.create(fx.Models.character, {artLabDemo: true}).model;
  demo.animate(0, false);
  demo.group.rotation.y = Math.PI / 2;
  now += 50;
  demo.animate(1, true);
  const first = demo.group.rotation.y + demo.active.group.rotation.y;
  assert.ok(first > 0 && first < Math.PI / 2);
  assert.equal(demo.group.rotation.y, Math.PI / 2);
  for (let i = 0; i < 20; i++) { now += 50; demo.animate(i + 2, true); }
  const settled = demo.group.rotation.y + demo.active.group.rotation.y;
  assert.ok(Math.abs(settled - Math.PI / 2) < .001);
  fx.candidate.setVersion('old');
  demo.animate(25, true);
  assert.equal(demo.active.group.rotation.y, 0);
  assert.equal(demo.group.rotation.y, Math.PI / 2);
  demo.dispose();
});
