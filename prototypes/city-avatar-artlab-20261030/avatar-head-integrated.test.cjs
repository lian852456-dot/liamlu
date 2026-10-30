const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = __dirname;
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

function eyeSource(source) {
  const start = source.indexOf('const brows=group(face);');
  const endMarker = 'compile(brows);';
  const end = source.indexOf(endMarker, start);
  assert.ok(start >= 0 && end >= start, 'eye source markers exist');
  return source.slice(start, end + endMarker.length);
}

function geometrySnapshot(geometry) {
  const attributes = {};
  for (const [name, attribute] of Object.entries(geometry.attributes || {})) {
    attributes[name] = Array.from(attribute.array);
  }
  return {type: geometry.type, attributes, index: geometry.index ? Array.from(geometry.index.array) : null};
}

function materialSnapshot(material) {
  return {
    type: material?.type || null,
    color: material?.color?.getHex?.() ?? null,
    roughness: material?.roughness ?? null,
    metalness: material?.metalness ?? null,
    ior: material?.ior ?? null,
    clearcoat: material?.clearcoat ?? null,
    clearcoatRoughness: material?.clearcoatRoughness ?? null,
    specularIntensity: material?.specularIntensity ?? null,
    anisotropy: material?.anisotropy ?? null,
    anisotropyRotation: material?.anisotropyRotation ?? null,
    side: material?.side ?? null,
    vertexColors: material?.vertexColors ?? null,
    map: material?.map?.name || null,
    normalMap: material?.normalMap?.name || null,
    roughnessMap: material?.roughnessMap?.name || null,
  };
}

function fixture() {
  const context = {
    console,
    performance: {now: () => 1000},
    fetch() { throw new Error('head-integrated test must not fetch external assets'); },
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);

  // Keep the baseline alias and previous art factory before the integrated
  // factory replaces the global name. This mirrors the runtime's opt-in path.
  for (const file of [
    'base/vendor/three.js', 'base/r2-geometry-index.js', 'base/static-mesh.js',
    'base/models.js', 'base/character-gestures.js', 'avatar-deluxe-approved.js',
    'avatar-approved-alias.js', 'head-art-previous.js', 'avatar-deluxe-head-art-v1.js',
    'avatar-head-v1-alias.js', 'head-art.js', 'avatar-deluxe.js', 'avatar-candidate.js',
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
        material: materialSnapshot(node.material),
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
    previous: context.CozyAvatarHeadArtV1,
    deluxe: context.CozyAvatarDeluxe,
    candidate: context.CozyAvatarCandidate,
    models: context.CozyModels,
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

function positions(node) {
  const result = [];
  for (const mesh of meshes(node)) {
    const attribute = mesh.geometry.attributes.position;
    for (let i = 0; i < attribute.count; i += 1) {
      result.push([attribute.getX(i), attribute.getY(i), attribute.getZ(i)]);
    }
  }
  return result;
}

function positionKeys(node) {
  return positions(node).map(pointKey).sort();
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

function allMaterials(node) {
  const result = [];
  for (const mesh of meshes(node)) {
    for (const material of (Array.isArray(mesh.material) ? mesh.material : [mesh.material])) {
      if (material) result.push(material);
    }
  }
  return result;
}

function texturedMaterials(node) {
  return allMaterials(node).filter(material => material.map || material.normalMap || material.roughnessMap);
}

function textureMap(helper) {
  return new Map(helper.textures());
}

function eyeRows(captures) {
  return captures.filter(item => item.rows.some(row => row.color === 0xfff7ec))
    .flatMap(item => item.rows)
    .map(row => ({
      geometry: row.geometry,
      position: row.position,
      scale: row.scale,
      rotation: row.rotation,
      material: row.material,
    }));
}

function stableEyeRows(captures) {
  return eyeRows(captures).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

test('frozen approved baseline and previous head-art snapshot remain exact', () => {
  const approved = read('avatar-deluxe-approved.js');
  const approvedCommit = execFileSync('git', ['show', '58fd45e:prototypes/city-avatar-artlab-20261030/avatar-deluxe.js'], {cwd: ROOT, encoding: 'utf8'});
  const previous = read('avatar-deluxe-head-art-v1.js');
  const previousCommit = execFileSync('git', ['show', '62435e9:prototypes/city-avatar-artlab-20261030/avatar-deluxe.js'], {cwd: ROOT, encoding: 'utf8'});
  assert.equal(hash(approved), hash(approvedCommit));
  assert.equal(hash(previous), hash(previousCommit));
  assert.equal(read('avatar-approved-alias.js').includes('root.CozyAvatarHeadBaseline=root.CozyAvatarDeluxe'), true);
  assert.equal(read('avatar-head-v1-alias.js').includes('root.CozyAvatarHeadArtV1=root.CozyAvatarDeluxe'), true);
  const fx = fixture();
  assert.strictEqual(fx.baseline, fx.context.CozyAvatarHeadBaseline);
  assert.strictEqual(fx.previous, fx.context.CozyAvatarHeadArtV1);
});

test('integrated head keeps refined body, legs, animation, pivot and skin geometry unchanged', () => {
  const previous = read('avatar-deluxe-head-art-v1.js');
  const integrated = read('avatar-deluxe.js');
  for (const marker of ['function buildBody(t)', 'function buildLeg(leg,t)', 'animate(phase,moving,sit=false,wave=false)']) {
    assert.equal(sourceBlock(previous, marker), sourceBlock(integrated, marker), marker);
  }
  assert.ok(integrated.includes("version:'head-integrated.1'"));
  const fx = fixture();
  const old = fx.create(fx.previous.create).model;
  const current = fx.create(fx.deluxe.create).model;
  assert.equal(old.state().version, 'head-art.1');
  assert.equal(current.state().version, 'head-integrated.1');
  assert.deepEqual(old.head.position.toArray(), current.head.position.toArray());
  assert.deepEqual(old.bodyProportions?.position?.toArray?.() || [], current.bodyProportions?.position?.toArray?.() || []);
  assert.deepEqual(positionKeys(old.head.children[0]), positionKeys(current.head.children[0]), 'skin face local vertices stay exact');
  assert.deepEqual(old.head.children[0].position.toArray(), current.head.children[0].position.toArray());
  assert.deepEqual(old.head.children[0].scale.toArray(), current.head.children[0].scale.toArray());
  old.dispose();
  current.dispose();
});

test('original seven-layer eye source, geometry, material and pivots are restored exactly', () => {
  const approved = read('avatar-deluxe-approved.js');
  const integrated = read('avatar-deluxe.js');
  assert.equal(eyeSource(approved), eyeSource(integrated), 'integrated eye source equals approved eye source');
  const fx = fixture();
  const baseline = fx.create(fx.baseline.create);
  const current = fx.create(fx.deluxe.create);
  assert.equal(eyeRows(baseline.captures).length, 18, 'approved eyes retain 9 source layers per side');
  assert.equal(eyeRows(current.captures).length, 18, 'integrated eyes retain 9 source layers per side');
  assert.deepEqual(stableEyeRows(baseline.captures), stableEyeRows(current.captures), 'eye source geometry/material signatures stay exact');
  const eyePivots = model => model.head.children[1].children
    .filter(node => node.isGroup && Math.abs(node.position.x) > .1)
    .sort((a, b) => a.position.x - b.position.x)
    .map(node => [node.position.toArray(), node.rotation.toArray()]);
  assert.deepEqual(eyePivots(baseline.model), eyePivots(current.model));
  assert.ok(allMaterials(current.model.head).every(material => material.map?.name !== 'head-art/iris-color'), 'new eye does not use legacy iris texture');
  baseline.model.dispose();
  current.model.dispose();
});

test('2.5-head proportions, complete head envelope and face features remain stable', () => {
  const fx = fixture();
  const profile = {character: 'violet', skin: 'orange', hair: 'hair-bob', outfit: 'outfit-uniform', hairColor: 0xd2ad84};
  const options = {scale: 1, color: 0x303036, hair: 0xd2ad84};
  const old = fx.create(fx.previous.create, options);
  const current = fx.create(fx.deluxe.create, options);
  old.model.setAppearance(profile);
  current.model.setAppearance(profile);
  const oldBox = nodeBounds(fx.THREE, old.model.head);
  const currentBox = nodeBounds(fx.THREE, current.model.head);
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(currentBox.min[axis] >= oldBox.min[axis] - .002, `${axis} min remains in previous head envelope`);
    assert.ok(currentBox.max[axis] <= oldBox.max[axis] + .002, `${axis} max remains in previous head envelope`);
  }
  const oldUnit = headUnitHeight(fx.THREE, old.model);
  const currentUnit = headUnitHeight(fx.THREE, current.model);
  assert.ok(Math.abs(oldUnit - currentUnit) < 1e-9, 'skin face unit remains exact');
  const oldBounds = modelBounds(fx.THREE, old.model);
  const currentBounds = modelBounds(fx.THREE, current.model);
  assert.ok(Math.abs((oldBounds.max.y - oldBounds.min.y) - (currentBounds.max.y - currentBounds.min.y)) < 1e-9, 'total height remains exact');
  assert.ok(Math.abs((currentBounds.max.y - currentBounds.min.y) / currentUnit - 2.5) < .02, '2.5-head ratio stays based on face skin');
  const oldLegs = old.model.legs.map(leg => new fx.THREE.Box3().setFromObject(leg).max.y - new fx.THREE.Box3().setFromObject(leg).min.y);
  const newLegs = current.model.legs.map(leg => new fx.THREE.Box3().setFromObject(leg).max.y - new fx.THREE.Box3().setFromObject(leg).min.y);
  assert.deepEqual(newLegs.map(value => Number(value.toFixed(9))), oldLegs.map(value => Number(value.toFixed(9))), 'leg lengths stay exact');
  const oldFace = old.model.head.children[0];
  const newFace = current.model.head.children[0];
  assert.deepEqual(positionKeys(oldFace), positionKeys(newFace), 'head skin vertices remain exact');
  old.model.dispose();
  current.model.dispose();
});

test('integrated hair materially changes while retaining UV/PBR maps and six shared textures', () => {
  const fx = fixture();
  const old = fx.create(fx.previous.create);
  const current = fx.create(fx.deluxe.create);
  const oldHair = meshes(old.model.head.children[2]);
  const newHair = meshes(current.model.head.children[2]);
  assert.ok(oldHair.length > 0 && newHair.length > 0);
  assert.notEqual(hash(JSON.stringify(geometrySnapshot(oldHair[0].geometry))), hash(JSON.stringify(geometrySnapshot(newHair[0].geometry))), 'hair geometry changes');
  const oldHairMaterial = texturedMaterials(old.model.head).find(material => material.map?.name === 'head-art/hair-color');
  const newHairMaterial = texturedMaterials(current.model.head).find(material => material.map?.name === 'head-art/hair-color');
  assert.ok(oldHairMaterial && newHairMaterial);
  const oldSkinMaterial = texturedMaterials(old.model.head).find(material => material.map?.name === 'head-art/skin-color');
  const newSkinMaterial = texturedMaterials(current.model.head).find(material => material.map?.name === 'head-art/skin-color');
  assert.ok(oldSkinMaterial && newSkinMaterial);
  assert.deepEqual(materialSnapshot(oldSkinMaterial), materialSnapshot(newSkinMaterial), 'skin material remains unchanged');
  assert.ok(newHairMaterial.roughness > oldHairMaterial.roughness, 'hair roughness increases');
  assert.ok(newHairMaterial.specularIntensity < oldHairMaterial.specularIntensity, 'hair specular decreases');
  assert.notEqual(newHairMaterial.normalScale.x, oldHairMaterial.normalScale.x);
  assert.notEqual(newHairMaterial.anisotropy, oldHairMaterial.anisotropy);

  for (const mesh of meshes(current.model.head)) {
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (!materials.some(material => material?.map || material?.normalMap || material?.roughnessMap)) continue;
    assert.ok(mesh.geometry.attributes.uv, 'textured geometry keeps UV');
    assert.equal(mesh.geometry.attributes.uv.count, mesh.geometry.attributes.position.count, 'UV remains aligned after compile');
    assert.ok(materials.every(material => material.map?.name !== 'head-art/iris-color'), 'no legacy iris map reaches integrated head');
  }

  const oldMaps = textureMap(fx.context.CozyHeadArt);
  const newMaps = textureMap(fx.context.CozyHeadArtIntegrated);
  assert.equal(oldMaps.size, 7);
  assert.equal(newMaps.size, 6);
  assert.deepEqual([...newMaps.keys()].sort(), ['hair-color', 'hair-normal', 'hair-roughness', 'skin-color', 'skin-normal', 'skin-roughness']);
  for (const [name, texture] of newMaps) assert.strictEqual(texture, oldMaps.get(name), `${name} texture object is shared`);
  assert.equal(new Set([...oldMaps.values(), ...newMaps.values()]).size, 7, 'helpers do not allocate duplicate shared maps');
  const stats = fx.context.CozyHeadArtIntegrated.stats();
  assert.equal(stats.textureCount, 6);
  assert.ok(stats.textures.every(texture => texture.width <= 512 && texture.height <= 512));
  assert.ok(stats.textures.every(texture => texture.rgbaBytes === texture.width * texture.height * 4));
  old.model.dispose();
  current.model.dispose();
});

test('head-art profile switch, peer isolation, twenty wardrobe rounds and shared dispose remain safe', () => {
  const fx = fixture();
  const parent = new fx.THREE.Group();
  const demo = fx.models.character(parent, {artLabDemo: true, color: 0x303036});
  const peerParent = new fx.THREE.Group();
  const peer = fx.models.character(peerParent, {color: 0xe5814c});
  const profile = {character: 'violet', skin: 'teal', hair: 'hair-bob', hairColor: '#b98f7c', outfit: 'outfit-uniform', avatarPreset: 'head-integrated-demo'};
  demo.setAppearance(profile);
  assert.equal(demo.active.state().version, 'head-integrated.1');
  assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), profile);
  assert.equal(peer.active, undefined, 'ordinary peers stay on the original factory');
  assert.equal(allMaterials(peer.group).some(material => material.map), false, 'peer has no head-art maps');

  let activeProfile = {...profile};
  for (let i = 0; i < 20; i += 1) {
    fx.candidate.setVersion(i % 2 ? 'old' : 'new');
    assert.equal(demo.group.children.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), activeProfile);
    assert.equal(demo.active.state().version, i % 2 ? 'head-art.1' : 'head-integrated.1');
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
    demo.setAppearance(wardrobes[i % wardrobes.length]);
    history.push([demo.active.state().ownedGeometries, demo.active.state().ownedMaterials]);
  }
  assert.ok(history.every(([geometries, materials]) => geometries === plateau[0] && materials === plateau[1]), `wardrobe resources plateau ${JSON.stringify({plateau, history})}`);

  const a = fx.create(fx.deluxe.create).model;
  const b = fx.create(fx.deluxe.create).model;
  const sharedTextures = [...textureMap(fx.context.CozyHeadArtIntegrated).values()];
  const disposeCounts = new Map(sharedTextures.map(texture => [texture, 0]));
  const originals = new Map();
  for (const texture of sharedTextures) {
    originals.set(texture, texture.dispose);
    texture.dispose = () => disposeCounts.set(texture, disposeCounts.get(texture) + 1);
  }
  const bMaterials = texturedMaterials(b.head);
  a.dispose();
  assert.ok(bMaterials.every(material => material.map?.image?.data && material.map.image.width <= 512), 'other model texture maps remain valid');
  assert.ok([...disposeCounts.values()].every(count => count === 0), 'disposing one model does not dispose shared textures');
  for (const texture of sharedTextures) texture.dispose = originals.get(texture);
  b.dispose();
  demo.dispose();
  assert.equal(fx.candidate.instances.length, 0);
  peer.dispose();
});
