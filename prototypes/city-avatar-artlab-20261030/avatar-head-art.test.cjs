const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = __dirname;
const BASELINE_SHA256 = '93a34c4ec9224967ea8617afa5f6beeb91cab07c84adc9993b7ef23b2978a4dd';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

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

function geometrySnapshot(geometry) {
  const attributes = {};
  for (const [name, attribute] of Object.entries(geometry.attributes || {})) attributes[name] = Array.from(attribute.array);
  return {type: geometry.type, attributes, index: geometry.index ? Array.from(geometry.index.array) : null};
}

function fixture() {
  const context = {console, performance: {now: () => 1000}, fetch() { throw new Error('head-art must not fetch external assets'); }};
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);

  for (const file of [
    'base/vendor/three.js', 'base/r2-geometry-index.js', 'base/static-mesh.js',
    'base/models.js', 'base/character-gestures.js', 'avatar-deluxe-approved.js',
    'avatar-approved-alias.js', 'head-art.js', 'avatar-deluxe.js', 'avatar-candidate.js',
  ]) vm.runInContext(read(file), context, {filename: path.join(ROOT, file)});

  const compileInputs = [];
  const realCompile = context.CozyStaticMesh.compile;
  context.CozyStaticMesh.compile = function captureCompile(group, options) {
    const rows = [];
    group.traverse(node => {
      if (!node.isMesh) return;
      rows.push({
        geometry: geometrySnapshot(node.geometry),
        position: node.position.toArray(),
        scale: node.scale.toArray(),
        rotation: node.rotation.toArray(),
        color: node.material?.color?.getHex?.() ?? null,
        map: node.material?.map?.name || null,
        normalMap: node.material?.normalMap?.name || null,
        roughnessMap: node.material?.roughnessMap?.name || null,
      });
    });
    compileInputs.push({group, rows});
    return realCompile.call(this, group, options);
  };

  function create(factory, options = {}) {
    const parent = new context.THREE.Group();
    const from = compileInputs.length;
    const model = factory(parent, options);
    return {parent, model, captures: compileInputs.slice(from)};
  }

  return {
    context,
    THREE: context.THREE,
    baseline: context.CozyAvatarHeadBaseline,
    deluxe: context.CozyAvatarDeluxe,
    candidate: context.CozyAvatarCandidate,
    models: context.CozyModels,
    gestures: context.CozyCharacterGestures,
    create,
    compileInputs,
  };
}

function meshes(node) {
  const result = [];
  node.traverse(item => { if (item.isMesh) result.push(item); });
  return result;
}

function pointKey(point) {
  return point.map(value => Math.round(value * 1e6)).join(',');
}

function positions(node, filter = () => true) {
  const result = [];
  for (const mesh of meshes(node)) {
    const attribute = mesh.geometry.attributes.position;
    for (let i = 0; i < attribute.count; i += 1) {
      const point = [attribute.getX(i), attribute.getY(i), attribute.getZ(i)];
      if (filter(point)) result.push(point);
    }
  }
  return result;
}

function positionKeys(node, filter) {
  return positions(node, filter).map(pointKey).sort();
}

function modelBounds(THREE, model) {
  model.group.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(model.group);
}

function nodeBounds(THREE, node) {
  node.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(node);
}

function headUnitHeight(THREE, model) {
  const face = model.head.children[0];
  const box = new THREE.Box3().setFromObject(face);
  return box.max.y - box.min.y;
}

function sortedScaleRows(captures) {
  return captures.flatMap(item => item.rows)
    .filter(row => row.geometry.type === 'SphereGeometry' &&
      row.position.every(value => Math.abs(value) < 1e-12) &&
      row.scale.every((value, index) => Math.abs(value - [.1, .115, .014][index]) < 1e-12))
    .map(row => ({position: row.position, scale: row.scale}))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function eyeGroups(model) {
  return model.head.children[1].children
    .filter(node => node.isGroup && Math.abs(node.position.x) > .1)
    .sort((a, b) => a.position.x - b.position.x);
}

function materialTextures(model) {
  const result = [];
  for (const mesh of meshes(model.head)) {
    const material = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const item of material) if (item?.map || item?.normalMap || item?.roughnessMap) result.push(item);
  }
  return result;
}

test('frozen approved baseline is the 58fd45e source and alias is an exact API snapshot', () => {
  const frozen = read('avatar-deluxe-approved.js');
  const commit = execFileSync('git', ['show', '58fd45e:prototypes/city-avatar-artlab-20261030/avatar-deluxe.js'], {cwd: ROOT, encoding: 'utf8'});
  assert.equal(hash(frozen), BASELINE_SHA256);
  assert.equal(hash(frozen), hash(commit));
  const fx = fixture();
  assert.strictEqual(fx.baseline, fx.context.CozyAvatarHeadBaseline);
  assert.equal(read('avatar-approved-alias.js').includes('root.CozyAvatarHeadBaseline=root.CozyAvatarDeluxe'), true);
});

test('head-art.1 changes only the head art source while body, legs and animation stay byte-identical', () => {
  const baseline = read('avatar-deluxe-approved.js');
  const revised = read('avatar-deluxe.js');
  for (const marker of ['function buildBody(t)', 'function buildLeg(leg,t)', 'animate(phase,moving,sit=false,wave=false)']) {
    assert.equal(sourceBlock(baseline, marker), sourceBlock(revised, marker), marker);
  }
  assert.ok(revised.includes("version:'head-art.1'"));
  const fx = fixture();
  const old = fx.create(fx.baseline.create).model;
  const current = fx.create(fx.deluxe.create).model;
  assert.equal(current.state().version, 'head-art.1');
  assert.equal(old.head.position.x, current.head.position.x);
  assert.equal(old.head.position.y, current.head.position.y);
  assert.equal(old.head.position.z, current.head.position.z);
  old.dispose();
  current.dispose();
});

test('face, features, eye-white ellipse and 2.5-head proportions remain unchanged without using hair bounds', () => {
  const fx = fixture();
  const old = fx.create(fx.baseline.create);
  const current = fx.create(fx.deluxe.create);
  const oldSkinMeshes = meshes(old.model.head.children[0]);
  const oldFaceMesh = [...oldSkinMeshes].sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count)[0];
  const oldFace = new Set(positions(oldFaceMesh).map(pointKey));
  const newSkin = new Set(positions(current.model.head.children[0]).map(pointKey));
  assert.ok(oldFace.size >= 500, 'skin face local vertex set is substantial and uniquely identifiable');
  assert.equal([...oldFace].filter(point => !newSkin.has(point)).length, 0, 'skin face local vertex set stays exact');

  assert.deepEqual(positionKeys(old.model.head.children[1].children[0]), positionKeys(current.model.head.children[1].children[0]), 'eyebrows stay in place');
  assert.deepEqual(positionKeys(old.model.head.children[1].children.find(node => node.name === 'smile'), position => true), positionKeys(current.model.head.children[1].children.find(node => node.name === 'smile'), position => true), 'mouth stays in place');
  const noseFilter = ([x, , z]) => z > .42 && Math.abs(x) < .08;
  assert.deepEqual(positionKeys(old.model.head.children[0], noseFilter), positionKeys(current.model.head.children[0], noseFilter), 'nose local vertex set stays exact');

  assert.deepEqual(sortedScaleRows(old.captures), sortedScaleRows(current.captures), 'eye-white ellipse source geometry retains dimensions and local position');
  assert.deepEqual(eyeGroups(old.model).map(eye => [eye.position.toArray(), eye.rotation.toArray()]), eyeGroups(current.model).map(eye => [eye.position.toArray(), eye.rotation.toArray()]), 'eye group pivots stay exact');

  const oldBounds = modelBounds(fx.THREE, old.model);
  const currentBounds = modelBounds(fx.THREE, current.model);
  const oldUnit = headUnitHeight(fx.THREE, old.model);
  const currentUnit = headUnitHeight(fx.THREE, current.model);
  assert.ok(Math.abs(oldUnit - currentUnit) < 1e-9, 'face skin unit is unchanged');
  assert.ok(Math.abs((oldBounds.max.y - oldBounds.min.y) - (currentBounds.max.y - currentBounds.min.y)) < 1e-9, 'total height is unchanged');
  assert.ok(Math.abs((currentBounds.max.y - currentBounds.min.y) / currentUnit - 2.5) < .02, '2.5 head ratio uses skin face unit, not hair bounds');
  const oldLegs = old.model.legs.map(leg => new fx.THREE.Box3().setFromObject(leg).max.y - new fx.THREE.Box3().setFromObject(leg).min.y);
  const currentLegs = current.model.legs.map(leg => new fx.THREE.Box3().setFromObject(leg).max.y - new fx.THREE.Box3().setFromObject(leg).min.y);
  assert.deepEqual(currentLegs.map(value => Number(value.toFixed(9))), oldLegs.map(value => Number(value.toFixed(9))), 'leg lengths stay exact');
  old.model.dispose();
  current.model.dispose();
});

test('hair and iris geometry/materials are genuinely upgraded and texture maps survive compilation', () => {
  const fx = fixture();
  const old = fx.create(fx.baseline.create);
  const current = fx.create(fx.deluxe.create);
  assert.notEqual(hash(JSON.stringify(geometrySnapshot(meshes(old.model.head.children[2])[0].geometry))), hash(JSON.stringify(geometrySnapshot(meshes(current.model.head.children[2])[0].geometry))), 'hair geometry changes');

  const oldIrisInputs = old.captures.flatMap(item => item.rows).filter(row => row.color === 0x8c5a36);
  const newIrisInputs = current.captures.flatMap(item => item.rows).filter(row => row.map === 'head-art/iris-color');
  assert.equal(oldIrisInputs.length, 2);
  assert.equal(newIrisInputs.length, 2);
  assert.notEqual(hash(JSON.stringify(oldIrisInputs[0].geometry)), hash(JSON.stringify(newIrisInputs[0].geometry)), 'iris geometry changes');

  const textured = materialTextures(current.model);
  assert.ok(textured.some(material => material.map?.name === 'head-art/skin-color' && material.normalMap?.name === 'head-art/skin-normal' && material.roughnessMap?.name === 'head-art/skin-roughness'));
  assert.ok(textured.some(material => material.map?.name === 'head-art/hair-color' && material.normalMap?.name === 'head-art/hair-normal' && material.roughnessMap?.name === 'head-art/hair-roughness'));
  assert.equal(textured.filter(material => material.map?.name === 'head-art/iris-color').length, 2);
  for (const mesh of meshes(current.model.head)) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some(material => material?.map || material?.normalMap || material?.roughnessMap)) continue;
    assert.ok(mesh.geometry.attributes.uv, 'textured geometry keeps UV');
    assert.equal(mesh.geometry.attributes.uv.count, mesh.geometry.attributes.position.count, 'UV remains aligned after compile');
  }
  const stats = fx.context.CozyHeadArt.stats();
  assert.equal(stats.textureCount, 7);
  assert.ok(stats.textures.every(texture => texture.width <= 512 && texture.height <= 512));
  assert.ok(stats.textures.every(texture => texture.rgbaBytes === texture.width * texture.height * 4));
  assert.deepEqual(JSON.parse(JSON.stringify(stats.textures.map(texture => texture.name).sort())), ['hair-color', 'hair-normal', 'hair-roughness', 'iris-color', 'skin-color', 'skin-normal', 'skin-roughness']);
  old.model.dispose();
  current.model.dispose();
});

test('default studio profile keeps the complete head envelope within the approved baseline', () => {
  const fx = fixture();
  const profile = {character: 'violet', skin: 'orange', hair: 'hair-bob', outfit: 'outfit-uniform', hairColor: 0xd2ad84};
  const options = {scale: 1, color: 0x303036, hair: 0xd2ad84};
  const old = fx.create(fx.baseline.create, options).model;
  const current = fx.create(fx.deluxe.create, options).model;
  old.setAppearance(profile);
  current.setAppearance(profile);
  const oldBox = nodeBounds(fx.THREE, old.head);
  const currentBox = nodeBounds(fx.THREE, current.head);
  const bodyBox = modelBounds(fx.THREE, current);
  console.log('HEAD_ENVELOPE_METRICS ' + JSON.stringify({baseline: {min: oldBox.min.toArray(), max: oldBox.max.toArray()}, refined: {min: currentBox.min.toArray(), max: currentBox.max.toArray()}, headUnitHeight: headUnitHeight(fx.THREE, current), totalHeight: bodyBox.max.y-bodyBox.min.y, headRatio: (bodyBox.max.y-bodyBox.min.y)/headUnitHeight(fx.THREE, current)}));
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(currentBox.min[axis] >= oldBox.min[axis] - .002, `${axis} min stays within approved envelope tolerance`);
    assert.ok(currentBox.max[axis] <= oldBox.max[axis] + .002, `${axis} max stays within approved envelope tolerance`);
  }
  old.dispose();
  current.dispose();
});

test('profile, old/new switch, peer isolation, wardrobe plateau and shared texture disposal stay safe', () => {
  const fx = fixture();
  const parent = new fx.THREE.Group();
  const demo = fx.models.character(parent, {artLabDemo: true, color: 0x303036});
  const peerParent = new fx.THREE.Group();
  const peer = fx.models.character(peerParent, {color: 0xe5814c});
  const profile = {character: 'violet', skin: 'teal', hair: 'hair-bob', hairColor: '#b98f7c', outfit: 'outfit-uniform', avatarPreset: 'head-art-demo'};
  demo.setAppearance(profile);
  assert.equal(demo.active.state().version, 'head-art.1');
  assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), profile);
  assert.equal(peer.active, undefined, 'ordinary peers stay on the original factory');
  assert.equal(meshes(peer.group).some(mesh => materialTextures({head: peer.group}).includes(mesh.material)), false, 'peer has no head-art material');

  let activeProfile = {...profile};
  for (let i = 0; i < 20; i += 1) {
    fx.candidate.setVersion(i % 2 ? 'old' : 'new');
    assert.equal(demo.group.children.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), activeProfile);
    assert.equal(demo.active.state().version, i % 2 ? 'deluxe.4-neck.2' : 'head-art.1');
    activeProfile = {...activeProfile, hair: ['hair-bob', 'hair-pony', 'hair-braids', 'hair-silver'][i % 4], outfit: ['outfit-uniform', 'outfit-forest', 'outfit-ocean', 'outfit-rose'][i % 4]};
    demo.setAppearance(activeProfile);
  }

  fx.candidate.setVersion('new');
  const wardrobes = [
    {skin: 'teal', hair: 'hair-bob', outfit: 'outfit-uniform'},
    {skin: 'teal', hair: 'hair-pony', outfit: 'outfit-forest'},
    {skin: 'teal', hair: 'hair-braids', outfit: 'outfit-ocean'},
    {skin: 'purple', hair: 'hair-silver', outfit: 'outfit-rose'},
  ];
  for (const wardrobe of wardrobes) demo.setAppearance(wardrobe);
  const plateau = [demo.active.state().ownedGeometries, demo.active.state().ownedMaterials];
  const history = [];
  for (let i = 0; i < 20; i += 1) {
    const wardrobe = wardrobes[i % wardrobes.length];
    demo.setAppearance(wardrobe);
    history.push([demo.active.state().ownedGeometries, demo.active.state().ownedMaterials]);
  }
  assert.ok(history.every(([geometries, materials]) => geometries === plateau[0] && materials === plateau[1]), `wardrobe resources plateau ${JSON.stringify({plateau, history})}`);

  const a = fx.create(fx.deluxe.create).model;
  const b = fx.create(fx.deluxe.create).model;
  const sharedTextures = fx.context.CozyHeadArt.textures().map(([, texture]) => texture);
  const disposeCounts = new Map(sharedTextures.map(texture => [texture, 0]));
  const originals = new Map();
  for (const texture of sharedTextures) {
    originals.set(texture, texture.dispose);
    texture.dispose = () => disposeCounts.set(texture, disposeCounts.get(texture) + 1);
  }
  const bMaterials = materialTextures(b);
  a.dispose();
  assert.ok(bMaterials.every(material => material.map?.image?.data && material.map.image.width <= 512), 'other model textures remain valid');
  assert.ok([...disposeCounts.values()].every(count => count === 0), 'disposing one model does not dispose shared textures');
  for (const texture of sharedTextures) texture.dispose = originals.get(texture);
  b.dispose();
  demo.dispose();
  peer.dispose();
  assert.equal(fx.candidate.instances.length, 0);
});
