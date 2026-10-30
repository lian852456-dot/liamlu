const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = __dirname;
const V1_SHA256 = 'f4434d435e4c8c7c71846759a8e4a824f42b44195f74697d9a0fbc1576694a9a';

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
      throw new Error('avatar V2 tests must not fetch external assets');
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
  run(context, 'avatar-deluxe-v1.js');
  run(context, 'avatar-v1-alias.js');
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
    v1: context.CozyAvatarDeluxeV1,
    v2: context.CozyAvatarDeluxe,
    gestures: context.CozyCharacterGestures,
    create,
    get fetchCalls() { return fetchCalls; },
  };
}

function intersection(left, right) {
  return new Set([...left].filter(value => right.has(value)));
}

function balancedSource(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `source marker exists: ${marker}`);
  const brace = source.indexOf('{', start);
  assert.ok(brace >= 0, `source body exists: ${marker}`);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unbalanced source: ${marker}`);
}

function vec(value) {
  return [value.x, value.y, value.z].map(number => Number(number));
}

function materialSignature(material) {
  if (!material) return null;
  return {
    type: material.type,
    color: material.color?.toArray?.() || null,
    emissive: material.emissive?.toArray?.() || null,
    roughness: material.roughness,
    metalness: material.metalness,
    vertexColors: material.vertexColors,
    transparent: material.transparent,
    opacity: material.opacity,
    side: material.side,
    depthWrite: material.depthWrite,
    alphaTest: material.alphaTest,
    map: Boolean(material.map),
  };
}

function geometrySignature(geometry) {
  if (!geometry) return null;
  const attributes = Object.keys(geometry.attributes || {}).sort().map(name => {
    const attribute = geometry.attributes[name];
    return [name, attribute.itemSize, attribute.normalized, Array.from(attribute.array)];
  });
  return {
    type: geometry.type,
    attributes,
    index: geometry.index ? [geometry.index.itemSize, Array.from(geometry.index.array)] : null,
    groups: (geometry.groups || []).map(group => [group.start, group.count, group.materialIndex]),
  };
}

function nodeSignature(node) {
  return {
    type: node.type,
    name: node.name,
    visible: node.visible,
    position: vec(node.position),
    rotation: vec(node.rotation),
    scale: vec(node.scale),
    geometry: node.isMesh ? geometrySignature(node.geometry) : null,
    material: node.isMesh ? (Array.isArray(node.material) ? node.material.map(materialSignature) : materialSignature(node.material)) : null,
    children: node.children.map(nodeSignature),
  };
}

function signature(node) {
  node.updateMatrixWorld(true);
  return JSON.stringify(nodeSignature(node));
}

function bodyGroup(model) {
  return model.group.children.find(node => node.isGroup && node.position.y === 0);
}

function allMeshes(node) {
  const meshes = [];
  node.traverse(item => { if (item.isMesh) meshes.push(item); });
  return meshes;
}

function bounds(THREE, node) {
  node.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(node);
}

function metrics(THREE, model) {
  const geometries = new Set();
  const materials = new Set();
  let meshCount = 0;
  let vertexCount = 0;
  let indexCount = 0;
  let triangleCount = 0;
  let bufferBytes = 0;
  model.group.traverse(node => {
    if (!node.isMesh) return;
    meshCount += 1;
    if (node.geometry) {
      geometries.add(node.geometry);
      const position = node.geometry.attributes?.position;
      if (position) {
        vertexCount += position.count;
        triangleCount += node.geometry.index ? node.geometry.index.count / 3 : position.count / 3;
      }
      if (node.geometry.index) indexCount += node.geometry.index.count;
      for (const attribute of Object.values(node.geometry.attributes || {})) {
        if (attribute.array) bufferBytes += attribute.array.byteLength;
      }
      if (node.geometry.index?.array) bufferBytes += node.geometry.index.array.byteLength;
    }
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
      if (material) materials.add(material);
    }
  });
  return {meshCount, drawUnits: meshCount, geometryCount: geometries.size, materialCount: materials.size, vertexCount, indexCount, triangleCount, bufferBytes};
}

function finiteTree(node) {
  let valid = true;
  node.traverse(item => {
    for (const vector of [item.position, item.rotation, item.scale]) {
      for (const value of [vector.x, vector.y, vector.z]) if (!Number.isFinite(value)) valid = false;
    }
    if (item.isMesh) {
      for (const attribute of Object.values(item.geometry.attributes || {})) {
        for (const value of attribute.array) if (!Number.isFinite(Number(value))) valid = false;
      }
      if (item.geometry.index) for (const value of item.geometry.index.array) if (!Number.isFinite(Number(value))) valid = false;
    }
  });
  return valid;
}

function trackDisposals(THREE) {
  const geometries = new WeakMap();
  const materials = new WeakMap();
  const originalGeometryDispose = THREE.BufferGeometry.prototype.dispose;
  const originalMaterialDispose = THREE.Material.prototype.dispose;
  THREE.BufferGeometry.prototype.dispose = function trackedGeometryDispose() {
    geometries.set(this, (geometries.get(this) || 0) + 1);
    return originalGeometryDispose.call(this);
  };
  THREE.Material.prototype.dispose = function trackedMaterialDispose() {
    materials.set(this, (materials.get(this) || 0) + 1);
    return originalMaterialDispose.call(this);
  };
  return {
    geometryCount: geometry => geometries.get(geometry) || 0,
    materialCount: material => materials.get(material) || 0,
    restore() {
      THREE.BufferGeometry.prototype.dispose = originalGeometryDispose;
      THREE.Material.prototype.dispose = originalMaterialDispose;
    },
  };
}

function approxRestore(actual, expected, label) {
  assert.equal(actual.length, expected.length, `${label} length`);
  for (let index = 0; index < actual.length; index += 1) {
    assert.ok(Math.abs(actual[index].x - expected[index].x) < 1e-9, `${label} arm ${index} x`);
    assert.ok(Math.abs(actual[index].z - expected[index].z) < 1e-9, `${label} arm ${index} z`);
  }
}

function exerciseMotion(fx, model) {
  assert.equal(model.arms.length, 2);
  assert.equal(model.legs.length, 2);
  const armBefore = model.arms.map(arm => ({x: arm.rotation.x, z: arm.rotation.z}));
  const legBefore = model.legs.map(leg => ({x: leg.rotation.x, z: leg.rotation.z}));
  model.animate(1.1, true, false, false);
  assert.notDeepEqual(model.arms.map(arm => arm.rotation.x), armBefore.map(arm => arm.x));
  assert.notDeepEqual(model.legs.map(leg => leg.rotation.x), legBefore.map(leg => leg.x));
  model.animate(1.1, false, true, true);
  assert.ok(model.legs.every(leg => Math.abs(leg.rotation.x + 1.16) < 1e-9));
  assert.ok(model.arms[1].rotation.z < -1.8);
  assert.ok(finiteTree(model.group));
  for (const kind of ['greet', 'highfive', 'stumble']) {
    fx.gestures.reset(model);
    const before = model.arms.map(arm => ({x: arm.rotation.x, z: arm.rotation.z}));
    const state = fx.gestures.start(model, kind, 0);
    assert.equal(state.update(fx.gestures.duration(kind) / 2).kind, kind);
    assert.ok(model.arms.some((arm, index) => arm.rotation.x !== before[index].x || arm.rotation.z !== before[index].z), `${kind} applies`);
    fx.gestures.reset(model);
    approxRestore(model.arms.map(arm => ({x: arm.rotation.x, z: arm.rotation.z})), before, `${kind} restores`);
  }
}

test('V1 frozen byte and V1/V2 head-hair-animation source remain exact', () => {
  const v1Source = read('avatar-deluxe-v1.js');
  const v2Source = read('avatar-deluxe.js');
  assert.equal(crypto.createHash('sha256').update(v1Source).digest('hex'), V1_SHA256, 'V1 matches b1762c6 frozen source');
  for (const marker of ['function buildHead(', 'function buildHair(', 'animate(phase,moving']) {
    assert.equal(balancedSource(v1Source, marker), balancedSource(v2Source, marker), `${marker} remains byte-identical`);
  }
});

test('V1/V2 head subtree is identical while body geometry changes and proportions/pivots stay valid', t => {
  const fx = makeFixture();
  const profile = {skin: 'teal', hair: 'hair-pony', hairColor: '#b98f7c', outfit: 'forest', avatarPreset: 'demo-only'};
  const v1 = fx.create(fx.v1.create, {color: 0x303036}).model;
  const v2 = fx.create(fx.v2.create, {color: 0x303036}).model;
  v1.setAppearance(profile);
  v2.setAppearance(profile);
  v1.animate(1.37, true, false, false);
  v2.animate(1.37, true, false, false);
  assert.equal(signature(v1.head), signature(v2.head), 'head geometry/transforms/material parameters match');
  assert.deepEqual([v1.group.position, v1.head.position, v1.head.rotation].map(vec), [v2.group.position, v2.head.position, v2.head.rotation].map(vec), 'root/head pivot matches');
  assert.notEqual(signature(bodyGroup(v1)), signature(bodyGroup(v2)), 'body geometry/shapes differ in V2');
  assert.ok(allMeshes(bodyGroup(v2)).some(mesh => mesh.geometry.type !== 'BoxGeometry'), 'V2 body is native curved geometry');
  for (const model of [v1, v2]) {
    const body = bodyGroup(model);
    const bodyBounds = bounds(fx.THREE, body);
    const totalBounds = bounds(fx.THREE, model.group);
    const headUnit = bounds(fx.THREE, model.head.children[0]);
    const ratio = (totalBounds.max.y - totalBounds.min.y) / (headUnit.max.y - headUnit.min.y);
    assert.ok(ratio >= 2.5 && ratio <= 3, `2.5-3 head proportion (${ratio})`);
    assert.ok(Number.isFinite(bodyBounds.min.y) && bodyBounds.max.y > bodyBounds.min.y);
    assert.ok(model.arms.every(arm => Math.abs(arm.position.x) > .2 && arm.position.y > 1.2));
    assert.ok(model.legs.every(leg => Math.abs(leg.position.x) > .1 && leg.position.y > .7));
  }
  t.diagnostic(`v1 metrics ${JSON.stringify(metrics(fx.THREE, v1))}`);
  t.diagnostic(`v2 metrics ${JSON.stringify(metrics(fx.THREE, v2))}`);
  v1.dispose();
  v2.dispose();
});

test('V1/V2 preserve motion and original gesture API without NaN transforms', () => {
  const fx = makeFixture();
  for (const factory of [fx.v1.create, fx.v2.create]) {
    const model = fx.create(factory, {color: 0x303036}).model;
    model.setAppearance({skin: 'purple', hair: 'hair-bob', outfit: 'uniform'});
    exerciseMotion(fx, model);
    model.dispose();
  }
});

test('adapter routes new to V2, old to V1, and ordinary peers to the original factory', () => {
  const fx = makeFixture();
  const ordinary = fx.create(fx.Models.character, {color: 0xe5814c}).model;
  const demo = fx.create(fx.Models.character, {artLabDemo: true, color: 0x303036}).model;
  const profile = {skin: 'teal', hair: 'hair-bob', outfit: 'forest', avatarPreset: 'demo-only'};
  demo.setAppearance(profile);
  assert.equal(ordinary.group.userData.artLabCandidate, undefined);
  assert.equal(ordinary.active, undefined);
  assert.equal(demo.active.state().version, 'deluxe.2');
  assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), profile);
  const oldActive = demo.active;
  fx.candidate.setVersion('old');
  assert.equal(oldActive.group.parent, null);
  assert.equal(demo.active.state().version, 'deluxe.1');
  assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), profile);
  const v1Active = demo.active;
  fx.candidate.setVersion('new');
  assert.equal(v1Active.group.parent, null);
  assert.equal(demo.active.state().version, 'deluxe.2');
  assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), profile);
  assert.equal(demo.profile.version, undefined);
  assert.equal(fx.candidate.instances.length, 1);
  demo.dispose();
  ordinary.dispose();
  assert.equal(fx.candidate.instances.length, 0);
});

test('V2 body variants plateau across 20 swaps and preserve shared cache ownership', t => {
  const fx = makeFixture();
  const v2a = fx.create(fx.v2.create, {color: 0x303036});
  const v2b = fx.create(fx.v2.create, {color: 0x303036});
  const baseA = fx.create(fx.original, {color: 0xe5814c});
  const baseB = fx.create(fx.original, {color: 0xe5814c});
  const sharedV2 = {
    geometries: intersection(v2a.resources.geometries, v2b.resources.geometries),
    materials: intersection(v2a.resources.materials, v2b.resources.materials),
  };
  const sharedBase = {
    geometries: intersection(baseA.resources.geometries, baseB.resources.geometries),
    materials: intersection(baseA.resources.materials, baseB.resources.materials),
  };
  assert.ok(sharedV2.geometries.size > 0, 'V2 shared geometry observed before static compilation');
  assert.ok(sharedBase.geometries.size + sharedBase.materials.size > 0, 'original shared cache observed');
  const tracker = trackDisposals(fx.THREE);
  try {
    const model = fx.create(fx.v2.create, {color: 0x303036}).model;
    const profiles = [
      {skin: 'teal', hair: 'hair-bob', outfit: 'uniform'},
      {skin: 'teal', hair: 'hair-pony', outfit: 'forest'},
      {skin: 'teal', hair: 'hair-braids', outfit: 'ocean'},
      {skin: 'teal', hair: 'hair-silver', outfit: 'rose'},
    ];
    profiles.forEach(profile => model.setAppearance(profile));
    const expected = new Map();
    profiles.forEach(profile => {
      model.setAppearance(profile);
      const state = model.state();
      expected.set(JSON.stringify(profile), {geometries: state.ownedGeometries, materials: state.ownedMaterials});
    });
    const history = [];
    for (let index = 0; index < 20; index += 1) {
      const profile = profiles[index % profiles.length];
      model.setAppearance(profile);
      const state = model.state();
      const plateau = expected.get(JSON.stringify(profile));
      history.push({index: index + 1, profile, geometries: state.ownedGeometries, materials: state.ownedMaterials});
      assert.equal(state.ownedGeometries, plateau.geometries, `body geometry plateau ${index + 1}`);
      assert.equal(state.ownedMaterials, plateau.materials, `body material plateau ${index + 1}`);
      assert.equal(state.profile.version, undefined);
    }
    t.diagnostic(`v2 body ownership ${JSON.stringify({expected: [...expected], history})}`);
    t.diagnostic(`v2 body metrics ${JSON.stringify(metrics(fx.THREE, model))}`);
    assert.equal(fx.fetchCalls, 0);
    model.dispose();
  } finally {
    v2a.model.dispose();
    v2b.model.dispose();
    baseA.model.dispose();
    baseB.model.dispose();
    for (const geometry of sharedV2.geometries) assert.equal(tracker.geometryCount(geometry), 0, 'V2 shared geometry is not disposed');
    for (const material of sharedV2.materials) assert.equal(tracker.materialCount(material), 0, 'V2 shared material is not disposed');
    for (const geometry of sharedBase.geometries) assert.equal(tracker.geometryCount(geometry), 0, 'original shared geometry is not disposed');
    for (const material of sharedBase.materials) assert.equal(tracker.materialCount(material), 0, 'original shared material is not disposed');
    tracker.restore();
  }
});
