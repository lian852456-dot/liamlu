const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = __dirname;
const NECK_V1_SHA256 = 'ecdd9f078acf2c37cb0638a9ec2ef38a66149f8743d74a2ad116d92bb925bad1';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

function sourceBlock(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `source marker exists: ${marker}`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unbalanced source: ${marker}`);
}

function fixture() {
  let externalFetches = 0;
  const context = {console, performance: {now: () => 1000}, fetch() { externalFetches += 1; throw new Error('collar candidate must not fetch external assets'); }};
  context.window = context; context.self = context; context.globalThis = context; vm.createContext(context);
  for (const file of ['base/vendor/three.js', 'base/r2-geometry-index.js', 'base/static-mesh.js', 'base/models.js', 'base/character-gestures.js', 'avatar-deluxe-neck-v1.js', 'avatar-neck-v1-alias.js', 'avatar-deluxe.js', 'avatar-candidate.js']) vm.runInContext(read(file), context, {filename: path.join(ROOT, file)});
  const compile = context.CozyStaticMesh.compile; let resources;
  context.CozyStaticMesh.compile = function collect(group, options) {
    if (resources) group.traverse(node => {
      if (!node.isMesh) return;
      resources.geometries.add(node.geometry);
      for (const material of (Array.isArray(node.material) ? node.material : [node.material])) if (material) resources.materials.add(material);
    });
    return compile.call(this, group, options);
  };
  const create = (factory, options = {}) => { const parent = new context.THREE.Group(); resources = {geometries: new Set(), materials: new Set()}; const model = factory(parent, options); const captured = resources; resources = null; return {parent, model, resources: captured}; };
  return {context, THREE: context.THREE, Models: context.CozyModels, candidate: context.CozyAvatarCandidate, neckV1: context.CozyAvatarNeckV1, collar: context.CozyAvatarDeluxe, gestures: context.CozyCharacterGestures, create, get externalFetches() { return externalFetches; }};
}

function bounds(THREE, node) { node.updateMatrixWorld(true); return new THREE.Box3().setFromObject(node); }
function finite(node) { let ok = true; node.traverse(item => { for (const vector of [item.position, item.rotation, item.scale]) for (const value of [vector.x, vector.y, vector.z]) ok &&= Number.isFinite(value); }); return ok; }
function intersect(a, b) { return new Set([...a].filter(value => b.has(value))); }
function region(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker); assert.ok(start >= 0, startMarker);
  const end = source.indexOf(endMarker, start); assert.ok(end >= 0, endMarker);
  return source.slice(start, end + endMarker.length);
}
function geometryDigest(node) {
  const rows = [];
  node.traverse(item => {
    if (!item.isMesh) return;
    const attributes = {};
    for (const [name, attribute] of Object.entries(item.geometry.attributes || {})) attributes[name] = Array.from(attribute.array);
    rows.push({name: item.name, attributes, index: item.geometry.index ? Array.from(item.geometry.index.array) : null});
  });
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}
function bodyOnlyDigest(model) {
  const rows = [];
  model.group.children[0].traverse(item => {
    if (!item.isMesh || String(item.name).startsWith('artlab-collar-')) return;
    const attributes = {};
    for (const [name, attribute] of Object.entries(item.geometry.attributes || {})) attributes[name] = Array.from(attribute.array);
    rows.push({name: item.name, attributes, index: item.geometry.index ? Array.from(item.geometry.index.array) : null});
  });
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

test('neck V1 snapshot is frozen and collar revision keeps every non-collar builder exact', () => {
  const frozen = read('avatar-deluxe-neck-v1.js');
  assert.equal(crypto.createHash('sha256').update(frozen).digest('hex'), NECK_V1_SHA256);
  const revised = read('avatar-deluxe.js');
  for (const marker of ['function buildHead(', 'function buildHair(', 'function buildLeg(', 'animate(phase,moving', 'for(const side of[-1,1])arms.push']) assert.equal(sourceBlock(frozen, marker), sourceBlock(revised, marker), marker);
  assert.ok(revised.includes("version:'deluxe.4-neck.2'"));
  assert.ok(revised.includes("name='artlab-collar-outer'"));
  assert.ok(revised.includes("name='artlab-collar-inner'"));
});

test('only the two collar lofts change while neck seat and body geometry stay exact', () => {
  const frozen = read('avatar-deluxe-neck-v1.js');
  const revised = read('avatar-deluxe.js');
  const collarStart = '   // Two open surfaces meet at a rolled lip.';
  const collarEnd = "collarInside.name='artlab-collar-inner';";
  const oldCollar = region(frozen, '   const collar=loft(body,[', collarEnd);
  const newCollar = region(revised, '   const collar=loft(body,[', collarEnd);
  assert.notEqual(oldCollar, newCollar, 'collar ring levels changed');
  assert.equal(region(frozen, '   const neck=loft(body,[', "neck.name='artlab-neck-seat';"), region(revised, '   const neck=loft(body,[', "neck.name='artlab-neck-seat';"), 'neck seat ring levels stay exact');
  const cleanRevised = revised.replace(newCollar, 'const collar=loft(/* collar-only local region */').replaceAll('deluxe.4-neck.2', 'deluxe.4-neck.1');
  const cleanFrozen = frozen.replace(oldCollar, 'const collar=loft(/* collar-only local region */');
  assert.equal(cleanRevised, cleanFrozen, 'only the local collar region changed in source');
  const fx = fixture(); const old = fx.create(fx.neckV1.create).model; const current = fx.create(fx.collar.create).model;
  assert.notEqual(geometryDigest(old.group.children[0]), geometryDigest(current.group.children[0]));
  old.dispose(); current.dispose();
});

test('collar revision preserves 2.5 ratio, head, neck seat, height and leg length', () => {
  const fx = fixture(); const old = fx.create(fx.neckV1.create).model; const current = fx.create(fx.collar.create).model;
  const profile = {skin: 'teal', hair: 'hair-pony', hairColor: '#b98f7c', outfit: 'forest'}; old.setAppearance(profile); current.setAppearance(profile);
  const headOld = bounds(fx.THREE, old.head), headCurrent = bounds(fx.THREE, current.head);
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs((headOld.max[axis] - headOld.min[axis]) - (headCurrent.max[axis] - headCurrent.min[axis])) < 1e-9, `head ${axis}`);
  assert.equal(old.head.position.y, current.head.position.y); assert.equal(old.legs[0].position.y, current.legs[0].position.y); assert.equal(old.arms[0].position.y, current.arms[0].position.y);
  const totalOld = bounds(fx.THREE, old.group), totalCurrent = bounds(fx.THREE, current.group), headSkin = bounds(fx.THREE, current.head.children[0]), unit = headSkin.max.y - headSkin.min.y;
  const ratio = (totalCurrent.max.y - totalCurrent.min.y) / unit;
  assert.ok(Math.abs((totalOld.max.y - totalOld.min.y) - (totalCurrent.max.y - totalCurrent.min.y)) < 0.01); assert.ok(Math.abs(ratio - 2.5) < 0.02); assert.ok(Math.abs(totalCurrent.min.y - 0.01) < 0.02); assert.ok(finite(current.group));
  const legsOld = old.legs.map(leg => { const b = bounds(fx.THREE, leg); return b.max.y - b.min.y; }); const legsCurrent = current.legs.map(leg => { const b = bounds(fx.THREE, leg); return b.max.y - b.min.y; });
  assert.deepEqual(legsCurrent.map(x => Number(x.toFixed(6))), legsOld.map(x => Number(x.toFixed(6))));
  console.log(`COLLAR_METRICS ${JSON.stringify({headHeight: unit, totalHeight: totalCurrent.max.y - totalCurrent.min.y, ratio, legHeights: legsCurrent, neckY: current.group.children[0].position.y})}`);
  old.dispose(); current.dispose();
});

test('adapter routes new to collar revision, old to neck V1, and peers/profile stay isolated', () => {
  const fx = fixture(); const peer = fx.create(fx.Models.character, {color: 0xe5814c}).model; const demo = fx.create(fx.Models.character, {artLabDemo: true, color: 0x303036}).model;
  const profile = {skin: 'teal', hair: 'hair-bob', outfit: 'forest', avatarPreset: 'demo-only'}; demo.setAppearance(profile);
  assert.equal(peer.active, undefined); assert.equal(demo.active.state().version, 'deluxe.4-neck.2'); assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), profile);
  fx.candidate.setVersion('old'); assert.equal(demo.active.state().version, 'deluxe.4-neck.1'); assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), profile); assert.equal(demo.profile.version, undefined);
  demo.dispose(); peer.dispose(); assert.equal(fx.candidate.instances.length, 0);
});

test('collar revision animations, gestures, and clothing resource ownership remain stable', () => {
  const fx = fixture(); const old = fx.create(fx.neckV1.create).model; const current = fx.create(fx.collar.create).model;
  for (const model of [old, current]) {
    model.setAppearance({skin: 'purple', hair: 'hair-bob', outfit: 'uniform'}); model.animate(1.1, true, false, false); assert.notDeepEqual(model.legs.map(leg => leg.rotation.x), [0, 0]); model.animate(1.1, false, true, true); assert.ok(model.arms[1].rotation.z < -1.8); for (const kind of ['greet', 'highfive', 'stumble']) { fx.gestures.reset(model); const state = fx.gestures.start(model, kind, 0); assert.equal(state.update(fx.gestures.duration(kind) / 2).kind, kind); fx.gestures.reset(model); } assert.ok(finite(model.group)); }
  const a = fx.create(fx.collar.create), b = fx.create(fx.collar.create); assert.ok(intersect(a.resources.geometries, b.resources.geometries).size > 0); const profiles = [{skin: 'teal', hair: 'hair-bob', outfit: 'uniform'}, {skin: 'teal', hair: 'hair-pony', outfit: 'forest'}, {skin: 'teal', hair: 'hair-braids', outfit: 'ocean'}, {skin: 'teal', hair: 'hair-silver', outfit: 'rose'}]; const expected = new Map(); for (const profile of profiles) current.setAppearance(profile); for (const profile of profiles) { current.setAppearance(profile); const state = current.state(); expected.set(JSON.stringify(profile), [state.ownedGeometries, state.ownedMaterials]); } for (let i = 0; i < 20; i += 1) { const profile = profiles[i % profiles.length]; current.setAppearance(profile); const state = current.state(); assert.deepEqual([state.ownedGeometries, state.ownedMaterials], expected.get(JSON.stringify(profile))); assert.equal(state.profile.version, undefined); }
  assert.equal(fx.externalFetches, 0); old.dispose(); current.dispose(); a.model.dispose(); b.model.dispose();
});
