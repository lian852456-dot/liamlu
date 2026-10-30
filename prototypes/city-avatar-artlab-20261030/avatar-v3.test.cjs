const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = __dirname;
const V2_SHA256 = '02e55e68452bfb7c3082623c8c0bd32d65285b80a1b57a2bb825ca22b6a9c0ac';

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
      throw new Error('avatar V3 tests must not fetch external assets');
    },
    performance: {now: () => 1000},
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const file of [
    'base/vendor/three.js', 'base/r2-geometry-index.js', 'base/static-mesh.js',
    'base/models.js', 'base/character-gestures.js', 'avatar-deluxe-v2.js',
    'avatar-v2-alias.js', 'avatar-deluxe.js', 'avatar-candidate.js',
  ]) run(context, file);

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
    v2: context.CozyAvatarDeluxeV2,
    v3: context.CozyAvatarDeluxe,
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
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unbalanced source: ${marker}`);
}

function vec(value) {
  return [value.x, value.y, value.z].map(Number);
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
  return {
    type: geometry.type,
    attributes: Object.keys(geometry.attributes || {}).sort().map(name => {
      const attribute = geometry.attributes[name];
      return [name, attribute.itemSize, attribute.normalized, Array.from(attribute.array)];
    }),
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

function localHeadSignature(model) {
  return JSON.stringify(model.head.children.map(nodeSignature));
}

function allMeshes(node) {
  const result = [];
  node.traverse(item => { if (item.isMesh) result.push(item); });
  return result;
}

function bounds(THREE, node) {
  node.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(node);
}

function metrics(model) {
  const geometries = new Set();
  const materials = new Set();
  let meshCount = 0, vertexCount = 0, indexCount = 0, triangleCount = 0, bufferBytes = 0;
  model.group.traverse(node => {
    if (!node.isMesh) return;
    meshCount += 1;
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
  const geometries = new WeakMap(), materials = new WeakMap();
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

function exerciseMotion(fx, model) {
  const armsBefore = model.arms.map(arm => ({x: arm.rotation.x, z: arm.rotation.z}));
  const legsBefore = model.legs.map(leg => leg.rotation.x);
  model.animate(1.1, true, false, false);
  assert.notDeepEqual(model.arms.map(arm => arm.rotation.x), armsBefore.map(arm => arm.x));
  assert.notDeepEqual(model.legs.map(leg => leg.rotation.x), legsBefore);
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
    model.arms.forEach((arm, index) => {
      assert.ok(Math.abs(arm.rotation.x - before[index].x) < 1e-9, `${kind} restores x`);
      assert.ok(Math.abs(arm.rotation.z - before[index].z) < 1e-9, `${kind} restores z`);
    });
  }
}

test('V2 frozen byte and V2/V3 head-hair-animation source stay exact', () => {
  const v2Source = read('avatar-deluxe-v2.js');
  const v3Source = read('avatar-deluxe.js');
  assert.equal(crypto.createHash('sha256').update(v2Source).digest('hex'), V2_SHA256, 'V2 matches 5d7e6fd frozen source');
  for (const marker of ['function buildHead(', 'function buildHair(', 'animate(phase,moving']) {
    assert.equal(balancedSource(v2Source, marker), balancedSource(v3Source, marker), `${marker} remains byte-identical`);
  }
});

test('V3 keeps local face geometry/materials, lowers head pivot, and reaches 2.50 heads with a shorter body', t => {
  const fx = makeFixture();
  const profile = {skin: 'teal', hair: 'hair-pony', hairColor: '#b98f7c', outfit: 'forest', avatarPreset: 'demo-only'};
  const v2 = fx.create(fx.v2.create, {color: 0x303036}).model;
  const v3 = fx.create(fx.v3.create, {color: 0x303036}).model;
  v2.setAppearance(profile);
  v3.setAppearance(profile);
  assert.equal(localHeadSignature(v2), localHeadSignature(v3), 'head local geometry/materials are unchanged');
  const v2Head = bounds(fx.THREE, v2.head);
  const v3Head = bounds(fx.THREE, v3.head);
  for (const dimension of ['x', 'y', 'z']) assert.ok(Math.abs((v2Head.max[dimension] - v2Head.min[dimension]) - (v3Head.max[dimension] - v3Head.min[dimension])) < 1e-9, `${dimension} head dimension unchanged`);
  assert.ok(Math.abs(v2.head.scale.y - 1) < 1e-9 && Math.abs(v3.head.scale.y - 1) < 1e-9, 'head itself is not scaled');
  assert.ok(Math.abs(v2.head.position.y - 1.99) < 1e-9);
  assert.ok(Math.abs(v3.head.position.y - 1.784) < 1e-9);
  assert.ok(v3.head.position.y < v2.head.position.y, 'V3 uses body-proportion head pivot');
  for (const [label, model, target] of [['V2', v2, 2.724], ['V3', v3, 2.50]]) {
    const total = bounds(fx.THREE, model.group);
    const skinHead = bounds(fx.THREE, model.head.children[0]);
    const ratio = (total.max.y - total.min.y) / (skinHead.max.y - skinHead.min.y);
    assert.ok(Math.abs(ratio - target) <= (label === 'V3' ? .025 : .035), `${label} head ratio ${ratio}`);
    assert.ok(Math.abs(total.min.y - .01) < .02, `${label} foot bottom stays near .01`);
  }
  const v2LegHeight = bounds(fx.THREE, v2.legs[0]).max.y - bounds(fx.THREE, v2.legs[0]).min.y;
  const v3LegHeight = bounds(fx.THREE, v3.legs[0]).max.y - bounds(fx.THREE, v3.legs[0]).min.y;
  assert.equal(v2.legs[0].position.y, .85);
  assert.ok(v3.legs.every(leg => leg.position.y < .85 && leg.position.y > .66));
  assert.ok(v3LegHeight < v2LegHeight, 'V3 thigh/calf is shorter');
  const v2Body = bounds(fx.THREE, v2.group.children[0]);
  const v3Body = bounds(fx.THREE, v3.group.children[0]);
  assert.ok(v3Body.max.x - v3Body.min.x > v2Body.max.x - v2Body.min.x, 'V3 torso wrapper widens in X');
  assert.ok(v3Body.max.z - v3Body.min.z > v2Body.max.z - v2Body.min.z, 'V3 torso wrapper rounds/widens in Z');
  assert.notEqual(JSON.stringify(v2.group.children[0].children.map(nodeSignature)), JSON.stringify(v3.group.children[0].children.map(nodeSignature)), 'V3 body geometry differs');
  t.diagnostic(`v2 metrics ${JSON.stringify(metrics(v2))}`);
  t.diagnostic(`v3 metrics ${JSON.stringify(metrics(v3))}`);
  v2.dispose();
  v3.dispose();
});

test('V2/V3 preserve animation, original gestures, finite transforms, and no external assets', () => {
  const fx = makeFixture();
  for (const factory of [fx.v2.create, fx.v3.create]) {
    const model = fx.create(factory, {color: 0x303036}).model;
    model.setAppearance({skin: 'purple', hair: 'hair-bob', outfit: 'uniform'});
    exerciseMotion(fx, model);
    model.dispose();
  }
  assert.equal(fx.fetchCalls, 0);
});

test('adapter routes new to V3, old to V2, and ordinary peers to original without profile version fields', () => {
  const fx = makeFixture();
  const ordinary = fx.create(fx.Models.character, {color: 0xe5814c}).model;
  const demo = fx.create(fx.Models.character, {artLabDemo: true, color: 0x303036}).model;
  const profile = {skin: 'teal', hair: 'hair-bob', outfit: 'forest', avatarPreset: 'demo-only'};
  demo.setAppearance(profile);
  assert.equal(ordinary.active, undefined);
  assert.equal(ordinary.group.userData.artLabCandidate, undefined);
  assert.equal(demo.active.state().version, 'deluxe.3');
  assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), profile);
  const v3Active = demo.active;
  fx.candidate.setVersion('old');
  assert.equal(v3Active.group.parent, null);
  assert.equal(demo.active.state().version, 'deluxe.2');
  assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), profile);
  assert.equal(demo.profile.version, undefined);
  demo.dispose();
  ordinary.dispose();
  assert.equal(fx.candidate.instances.length, 0);
});

test('V3 body variants plateau across 20 swaps and preserve shared cache ownership', t => {
  const fx = makeFixture();
  const v3a = fx.create(fx.v3.create, {color: 0x303036});
  const v3b = fx.create(fx.v3.create, {color: 0x303036});
  const baseA = fx.create(fx.original, {color: 0xe5814c});
  const baseB = fx.create(fx.original, {color: 0xe5814c});
  const sharedV3 = {
    geometries: intersection(v3a.resources.geometries, v3b.resources.geometries),
    materials: intersection(v3a.resources.materials, v3b.resources.materials),
  };
  const sharedBase = {
    geometries: intersection(baseA.resources.geometries, baseB.resources.geometries),
    materials: intersection(baseA.resources.materials, baseB.resources.materials),
  };
  assert.ok(sharedV3.geometries.size > 0);
  assert.ok(sharedBase.geometries.size + sharedBase.materials.size > 0);
  const tracker = trackDisposals(fx.THREE);
  let model = null;
  try {
    model = fx.create(fx.v3.create, {color: 0x303036}).model;
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
    for (let index = 0; index < 20; index += 1) {
      const profile = profiles[index % profiles.length];
      model.setAppearance(profile);
      const state = model.state();
      const plateau = expected.get(JSON.stringify(profile));
      assert.equal(state.ownedGeometries, plateau.geometries, `geometry plateau ${index + 1}`);
      assert.equal(state.ownedMaterials, plateau.materials, `material plateau ${index + 1}`);
      assert.equal(state.profile.version, undefined);
    }
    t.diagnostic(`v3 body metrics ${JSON.stringify(metrics(model))}`);
    t.diagnostic(`v3 ownership plateau ${JSON.stringify([...expected])}`);
  } finally {
    model?.dispose();
    v3a.model.dispose();
    v3b.model.dispose();
    baseA.model.dispose();
    baseB.model.dispose();
    for (const geometry of sharedV3.geometries) assert.equal(tracker.geometryCount(geometry), 0);
    for (const material of sharedV3.materials) assert.equal(tracker.materialCount(material), 0);
    for (const geometry of sharedBase.geometries) assert.equal(tracker.geometryCount(geometry), 0);
    for (const material of sharedBase.materials) assert.equal(tracker.materialCount(material), 0);
    tracker.restore();
  }
});
