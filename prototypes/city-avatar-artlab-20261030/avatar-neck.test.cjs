const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = __dirname;
const V4_SHA256 = '04b4ecd7507b9ffa4e7908c0ec851c4c00240e673bda1d182096d18a508f34f3';
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
  const context = {console, performance: {now: () => 1000}, fetch() { externalFetches += 1; throw new Error('neck candidate must not fetch external assets'); }};
  context.window = context; context.self = context; context.globalThis = context; vm.createContext(context);
  for (const file of ['base/vendor/three.js', 'base/r2-geometry-index.js', 'base/static-mesh.js', 'base/models.js', 'base/character-gestures.js', 'avatar-deluxe-v4.js', 'avatar-v4-alias.js', 'avatar-deluxe.js', 'avatar-candidate.js']) vm.runInContext(read(file), context, {filename: path.join(ROOT, file)});
  const compile = context.CozyStaticMesh.compile; let resources;
  context.CozyStaticMesh.compile = function collect(group, options) {
    if (resources) group.traverse(node => {
      if (!node.isMesh) return;
      resources.geometries.add(node.geometry);
      for (const material of (Array.isArray(node.material) ? node.material : [node.material])) if (material) resources.materials.add(material);
    });
    return compile.call(this, group, options);
  };
  const create = (factory, options = {}) => {
    const parent = new context.THREE.Group();
    resources = {geometries: new Set(), materials: new Set()};
    const model = factory(parent, options);
    const captured = resources; resources = null;
    return {parent, model, resources: captured};
  };
  return {context, THREE: context.THREE, Models: context.CozyModels, candidate: context.CozyAvatarCandidate, v4: context.CozyAvatarDeluxeV4, neck: context.CozyAvatarDeluxe, gestures: context.CozyCharacterGestures, create, get externalFetches() { return externalFetches; }};
}

function bounds(THREE, node) { node.updateMatrixWorld(true); return new THREE.Box3().setFromObject(node); }
function finite(node) { let ok = true; node.traverse(item => { for (const vector of [item.position, item.rotation, item.scale]) for (const value of [vector.x, vector.y, vector.z]) ok &&= Number.isFinite(value); }); return ok; }
function intersect(a, b) { return new Set([...a].filter(value => b.has(value))); }
function normalizedBody(source) {
  return source
    .replace(/\n   ell\(body,skin,0,1\.46,0,\.085,\.105,\.079,true\);[\s\S]*?\n   const collarGeo=new T\.TorusGeometry\([\s\S]*?collar\.rotation\.x=Math\.PI\/2;/, '\n   /* neck/collar region */')
    .replace(/\n   \/\/ A broad seated neck base[\s\S]*?\n   collarInside\.name='artlab-collar-inner';/, '\n   /* neck/collar region */');
}
function digest(node) {
  const rows = [];
  node.traverse(item => {
    if (!item.isMesh) return;
    const attributes = {};
    for (const [name, attribute] of Object.entries(item.geometry.attributes || {})) attributes[name] = Array.from(attribute.array);
    rows.push({attributes, index: item.geometry.index ? Array.from(item.geometry.index.array) : null});
  });
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

test('V4 is frozen and neck revision preserves face, hair, animation, legs, and arms', () => {
  const frozen = read('avatar-deluxe-v4.js');
  assert.equal(crypto.createHash('sha256').update(frozen).digest('hex'), V4_SHA256);
  const revised = read('avatar-deluxe.js');
  for (const marker of ['function buildHead(', 'function buildHair(', 'function buildLeg(', 'animate(phase,moving']) assert.equal(sourceBlock(frozen, marker), sourceBlock(revised, marker), marker);
  assert.equal(sourceBlock(frozen, 'for(const side of[-1,1])arms.push'), sourceBlock(revised, 'for(const side of[-1,1])arms.push'));
  assert.ok(revised.includes("artlab-neck-seat"), 'neck seat is present in the local revision');
});

test('neck revision keeps V4 2.5 ratio, head size, height, leg length, and floor', () => {
  const fx = fixture();
  const base = fx.create(fx.v4.create, {color: 0x303036}).model;
  const revised = fx.create(fx.neck.create, {color: 0x303036}).model;
  const profile = {skin: 'teal', hair: 'hair-pony', hairColor: '#b98f7c', outfit: 'forest'};
  base.setAppearance(profile); revised.setAppearance(profile);
  const headA = bounds(fx.THREE, base.head), headB = bounds(fx.THREE, revised.head);
  for (const axis of ['x', 'y', 'z']) assert.ok(Math.abs((headA.max[axis] - headA.min[axis]) - (headB.max[axis] - headB.min[axis])) < 1e-9, `head ${axis}`);
  assert.equal(base.head.position.y, revised.head.position.y); assert.equal(base.legs[0].position.y, revised.legs[0].position.y);
  const totalA = bounds(fx.THREE, base.group), totalB = bounds(fx.THREE, revised.group), headUnit = bounds(fx.THREE, revised.head.children[0]).max.y - bounds(fx.THREE, revised.head.children[0]).min.y;
  const ratio = (totalB.max.y - totalB.min.y) / headUnit;
  assert.ok(Math.abs((totalA.max.y - totalA.min.y) - (totalB.max.y - totalB.min.y)) < 0.01);
  assert.ok(Math.abs(ratio - 2.5) < 0.02, `ratio=${ratio}`); assert.ok(Math.abs(totalB.min.y - 0.01) < 0.02); assert.ok(finite(revised.group));
  const legHeights = revised.legs.map(leg => { const box = bounds(fx.THREE, leg); return box.max.y - box.min.y; });
  console.log(`NECK_METRICS ${JSON.stringify({headHeight: headUnit, totalHeight: totalB.max.y - totalB.min.y, ratio, legHeights, baseNeck: base.group.children[0]?.children.length, revisedNeck: revised.group.children[0]?.children.length})}`);
  base.dispose(); revised.dispose();
});

test('neck collar changes only local shoulder geometry and keeps operations valid', () => {
  const fx = fixture(); const base = fx.create(fx.v4.create).model; const revised = fx.create(fx.neck.create).model;
  assert.notEqual(digest(base.group.children[0]), digest(revised.group.children[0]), 'neck/collar geometry differs');
  for (const model of [base, revised]) {
    model.setAppearance({skin: 'purple', hair: 'hair-bob', outfit: 'uniform'});
    model.animate(1.1, true, false, false); assert.notDeepEqual(model.legs.map(leg => leg.rotation.x), [0, 0]);
    model.animate(1.1, false, true, true); assert.ok(model.arms[1].rotation.z < -1.8);
    for (const kind of ['greet', 'highfive', 'stumble']) { fx.gestures.reset(model); const state = fx.gestures.start(model, kind, 0); assert.equal(state.update(fx.gestures.duration(kind) / 2).kind, kind); fx.gestures.reset(model); }
    assert.ok(finite(model.group));
  }
  assert.equal(fx.externalFetches, 0); base.dispose(); revised.dispose();
});

test('adapter routes new to neck revision, old to V4, and peers/profile stay isolated', () => {
  const fx = fixture(); const peer = fx.create(fx.Models.character, {color: 0xe5814c}).model; const demo = fx.create(fx.Models.character, {artLabDemo: true, color: 0x303036}).model;
  const profile = {skin: 'teal', hair: 'hair-bob', outfit: 'forest', avatarPreset: 'demo-only'}; demo.setAppearance(profile);
  assert.equal(peer.active, undefined); assert.equal(demo.active.state().version, 'deluxe.4-neck.1'); assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), profile);
  fx.candidate.setVersion('old'); assert.equal(demo.active.state().version, 'deluxe.4'); assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), profile); assert.equal(demo.profile.version, undefined);
  demo.dispose(); peer.dispose(); assert.equal(fx.candidate.instances.length, 0);
});

test('neck revision clothing variants plateau across repeated swaps and shared resources release', () => {
  const fx = fixture(); const a = fx.create(fx.neck.create), b = fx.create(fx.neck.create); const shared = {geometries: intersect(a.resources.geometries, b.resources.geometries), materials: intersect(a.resources.materials, b.resources.materials)}; assert.ok(shared.geometries.size > 0);
  const model = fx.create(fx.neck.create).model; const profiles = [{skin: 'teal', hair: 'hair-bob', outfit: 'uniform'}, {skin: 'teal', hair: 'hair-pony', outfit: 'forest'}, {skin: 'teal', hair: 'hair-braids', outfit: 'ocean'}, {skin: 'teal', hair: 'hair-silver', outfit: 'rose'}]; profiles.forEach(profile => model.setAppearance(profile)); const expected = new Map(); profiles.forEach(profile => { model.setAppearance(profile); const state = model.state(); expected.set(JSON.stringify(profile), [state.ownedGeometries, state.ownedMaterials]); }); for (let i = 0; i < 20; i += 1) { const profile = profiles[i % profiles.length]; model.setAppearance(profile); const state = model.state(); assert.deepEqual([state.ownedGeometries, state.ownedMaterials], expected.get(JSON.stringify(profile))); assert.equal(state.profile.version, undefined); } model.dispose(); a.model.dispose(); b.model.dispose();
});
