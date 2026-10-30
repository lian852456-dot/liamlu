const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = __dirname;
const V3_SHA256 = 'ee36c4decb9813ab7465171c6e589c9155009a5c41401dd738681a21c8e270d8';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

function fixture() {
  let externalFetches = 0;
  const context = {console, performance: {now: () => 1000}, fetch() { externalFetches += 1; throw new Error('V4 must not fetch external assets'); }};
  context.window = context; context.self = context; context.globalThis = context; vm.createContext(context);
  for (const file of ['base/vendor/three.js', 'base/r2-geometry-index.js', 'base/static-mesh.js', 'base/models.js', 'base/character-gestures.js', 'avatar-deluxe-v3.js', 'avatar-v3-alias.js', 'avatar-deluxe.js', 'avatar-candidate.js']) vm.runInContext(read(file), context, {filename: path.join(ROOT, file)});
  const compile = context.CozyStaticMesh.compile; let resources;
  context.CozyStaticMesh.compile = function collect(group, options) { if (resources) group.traverse(node => { if (!node.isMesh) return; resources.geometries.add(node.geometry); for (const material of (Array.isArray(node.material) ? node.material : [node.material])) if (material) resources.materials.add(material); }); return compile.call(this, group, options); };
  const create = (factory, options = {}) => { const parent = new context.THREE.Group(); resources = {geometries: new Set(), materials: new Set()}; const model = factory(parent, options); const captured = resources; resources = null; return {parent, model, resources: captured}; };
  return {context, THREE: context.THREE, Models: context.CozyModels, original: context.CozyAvatarCandidate.originalFactory, candidate: context.CozyAvatarCandidate, v3: context.CozyAvatarDeluxeV3, v4: context.CozyAvatarDeluxe, gestures: context.CozyCharacterGestures, create, get externalFetches() { return externalFetches; }};
}

function bounds(THREE, node) { node.updateMatrixWorld(true); return new THREE.Box3().setFromObject(node); }
function sourceBlock(source, marker) { const start = source.indexOf(marker); assert.ok(start >= 0, marker); const brace = source.indexOf('{', start); let depth = 0; for (let i = brace; i < source.length; i += 1) { if (source[i] === '{') depth += 1; if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1); } throw new Error(`unbalanced ${marker}`); }
function finite(node) { let ok = true; node.traverse(item => { for (const vector of [item.position, item.rotation, item.scale]) for (const value of [vector.x, vector.y, vector.z]) ok &&= Number.isFinite(value); }); return ok; }
function intersect(a, b) { return new Set([...a].filter(value => b.has(value))); }
function bodyGeometryDigest(model) {
  const rows = [];
  model.group.children[0].traverse(node => {
    if (!node.isMesh) return;
    const attributes = {};
    for (const [name, attribute] of Object.entries(node.geometry.attributes || {})) attributes[name] = Array.from(attribute.array);
    rows.push({attributes, index: node.geometry.index ? Array.from(node.geometry.index.array) : null});
  });
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

test('V3 frozen source and V4 keep face, hair, animation builders exact', () => {
  const v3Source = read('avatar-deluxe-v3.js'); const v4Source = read('avatar-deluxe.js');
  assert.equal(crypto.createHash('sha256').update(v3Source).digest('hex'), V3_SHA256);
  for (const marker of ['function buildHead(', 'function buildHair(', 'animate(phase,moving']) assert.equal(sourceBlock(v3Source, marker), sourceBlock(v4Source, marker), marker);
});

test('V4 keeps the V3 2.5 head ratio, head size, height and leg length', () => {
  const fx = fixture(); const v3 = fx.create(fx.v3.create, {color: 0x303036}).model; const v4 = fx.create(fx.v4.create, {color: 0x303036}).model;
  const profile = {skin: 'teal', hair: 'hair-pony', hairColor: '#b98f7c', outfit: 'forest'}; v3.setAppearance(profile); v4.setAppearance(profile);
  for (const axis of ['x', 'y', 'z']) { const a = bounds(fx.THREE, v3.head), b = bounds(fx.THREE, v4.head); assert.ok(Math.abs((a.max[axis] - a.min[axis]) - (b.max[axis] - b.min[axis])) < 1e-9, `head ${axis}`); }
  assert.equal(v3.head.position.y, v4.head.position.y); assert.equal(v3.legs[0].position.y, v4.legs[0].position.y); assert.equal(v3.arms[0].position.y, v4.arms[0].position.y);
  const total3 = bounds(fx.THREE, v3.group), total4 = bounds(fx.THREE, v4.group); const head3 = bounds(fx.THREE, v3.head.children[0]); const ratio4 = (total4.max.y - total4.min.y) / (head3.max.y - head3.min.y);
  assert.ok(Math.abs((total3.max.y - total3.min.y) - (total4.max.y - total4.min.y)) < 0.01); assert.ok(Math.abs(ratio4 - 2.5) < 0.02); assert.ok(Math.abs(total4.min.y - 0.01) < 0.02); assert.ok(finite(v4.group));
  const legHeights = v4.legs.map(leg => { const box = bounds(fx.THREE, leg); return box.max.y - box.min.y; });
  let meshes = 0; const geometries = new Set(); const materials = new Set(); v4.group.traverse(node => { if (!node.isMesh) return; meshes += 1; geometries.add(node.geometry); for (const material of (Array.isArray(node.material) ? node.material : [node.material])) if (material) materials.add(material); });
  console.log(`V4_METRICS ${JSON.stringify({headHeight: head3.max.y - head3.min.y, totalHeight: total4.max.y - total4.min.y, ratio: ratio4, legHeights, meshes, geometries: geometries.size, materials: materials.size, ownedGeometries: v4.state().ownedGeometries, ownedMaterials: v4.state().ownedMaterials})}`);
  v3.dispose(); v4.dispose();
});

test('V4 body/clothing differs while operations, gestures and no external assets remain valid', () => {
  const fx = fixture(); const v3 = fx.create(fx.v3.create).model; const v4 = fx.create(fx.v4.create).model; const sig = model => model.group.children.map(child => `${child.position.x}:${child.position.y}:${child.position.z}:${child.children.length}`).join('|');
  assert.notEqual(bodyGeometryDigest(v3), bodyGeometryDigest(v4), 'V4 body/clothing geometry differs');
  for (const model of [v3, v4]) { model.setAppearance({skin: 'purple', hair: 'hair-bob', outfit: 'uniform'}); model.animate(1.1, true, false, false); assert.notDeepEqual(model.legs.map(leg => leg.rotation.x), [0, 0]); model.animate(1.1, false, true, true); assert.ok(model.arms[1].rotation.z < -1.8); for (const kind of ['greet', 'highfive', 'stumble']) { fx.gestures.reset(model); const state = fx.gestures.start(model, kind, 0); assert.equal(state.update(fx.gestures.duration(kind) / 2).kind, kind); fx.gestures.reset(model); } assert.ok(finite(model.group)); }
  assert.equal(fx.externalFetches, 0); v3.dispose(); v4.dispose();
});

test('adapter routes new to V4, old to V3, peers stay original and profile data is preserved', () => {
  const fx = fixture(); const peer = fx.create(fx.Models.character, {color: 0xe5814c}).model; const demo = fx.create(fx.Models.character, {artLabDemo: true, color: 0x303036}).model; const profile = {skin: 'teal', hair: 'hair-bob', outfit: 'forest', avatarPreset: 'demo-only'}; demo.setAppearance(profile);
  assert.equal(peer.active, undefined); assert.equal(demo.active.state().version, 'deluxe.4'); assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), profile); const v4 = demo.active; fx.candidate.setVersion('old'); assert.equal(v4.group.parent, null); assert.equal(demo.active.state().version, 'deluxe.3'); assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), profile); assert.equal(demo.profile.version, undefined); demo.dispose(); peer.dispose(); assert.equal(fx.candidate.instances.length, 0);
});

test('V4 clothing variants plateau across repeated swaps and shared resources release', () => {
  const fx = fixture(); const a = fx.create(fx.v4.create), b = fx.create(fx.v4.create); const shared = {geometries: intersect(a.resources.geometries, b.resources.geometries), materials: intersect(a.resources.materials, b.resources.materials)}; assert.ok(shared.geometries.size > 0);
  const model = fx.create(fx.v4.create).model; const profiles = [{skin: 'teal', hair: 'hair-bob', outfit: 'uniform'}, {skin: 'teal', hair: 'hair-pony', outfit: 'forest'}, {skin: 'teal', hair: 'hair-braids', outfit: 'ocean'}, {skin: 'teal', hair: 'hair-silver', outfit: 'rose'}]; profiles.forEach(profile => model.setAppearance(profile)); const expected = new Map(); profiles.forEach(profile => { model.setAppearance(profile); const state = model.state(); expected.set(JSON.stringify(profile), [state.ownedGeometries, state.ownedMaterials]); }); for (let i = 0; i < 20; i += 1) { const profile = profiles[i % profiles.length]; model.setAppearance(profile); const state = model.state(); assert.deepEqual([state.ownedGeometries, state.ownedMaterials], expected.get(JSON.stringify(profile))); assert.equal(state.profile.version, undefined); } model.dispose(); a.model.dispose(); b.model.dispose();
});
