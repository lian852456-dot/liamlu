const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = __dirname;
const AVATAR_PATH = 'prototypes/city-avatar-artlab-20261030/avatar-deluxe.js';
const BASELINE_V1_COMMIT = '41075e9a933c939d745467402438e47f89c961b7';
const PROCEDURAL_COMMIT = 'd64145cf75d1a0dd68515abdfbb3bd57a8d1c1fb';
const V1_GLB_PATH = 'assets/hair-glb/short-bob-v1.glb';
const V2_GLB_PATH = 'assets/hair-glb-v2/short-bob-v2.glb';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const gitSource = commit => execFileSync('git', ['show', `${commit}:${AVATAR_PATH}`], {
  cwd: ROOT,
  encoding: 'utf8',
});
const baselineV1Source = () => gitSource(BASELINE_V1_COMMIT);
const proceduralSource = () => gitSource(PROCEDURAL_COMMIT);

function readGLB(file) {
  const bytes = fs.readFileSync(path.join(ROOT, file));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', `${file} magic`);
  assert.equal(bytes.readUInt32LE(4), 2, `${file} version`);
  assert.equal(bytes.readUInt32LE(8), bytes.length, `${file} declared length`);
  const chunks = [];
  for (let offset = 12; offset < bytes.length;) {
    assert.ok(offset + 8 <= bytes.length, `${file} chunk header stays in file`);
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    assert.ok(end <= bytes.length, `${file} chunk stays in file`);
    chunks.push({type, data: bytes.subarray(start, end)});
    offset = end;
  }
  const jsonChunk = chunks.find(chunk => chunk.type === 0x4e4f534a);
  const binChunk = chunks.find(chunk => chunk.type === 0x004e4942);
  assert.ok(jsonChunk, `${file} has JSON chunk`);
  assert.ok(binChunk, `${file} has BIN chunk`);
  return {bytes, json: JSON.parse(jsonChunk.data.toString('utf8').trim()), bin: binChunk.data};
}

function pngSize(bytes) {
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG', 'embedded image is PNG');
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', 'PNG has IHDR');
  return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}

function assertHairGLB(file) {
  const {json, bin} = readGLB(file);
  assert.match(json.asset?.generator || '', /Blender/i, `${file} generator identifies Blender`);
  const serialized = JSON.stringify(json).toLowerCase();
  assert.equal(serialized.includes('body'), false, `${file} has no body object`);
  assert.equal(serialized.includes('face'), false, `${file} has no face object`);
  assert.equal(json.meshes?.length, 1, `${file} contains one mesh`);
  assert.equal(json.meshes[0].primitives?.length, 1, `${file} contains one primitive`);
  const primitive = json.meshes[0].primitives[0];
  assert.ok(primitive.attributes?.TANGENT !== undefined, `${file} primitive contains tangents`);
  assert.equal(json.materials?.length, 1, `${file} contains one material`);
  assert.equal(json.materials[0].alphaMode || 'OPAQUE', 'OPAQUE', `${file} hair is opaque`);
  assert.equal(json.images?.length, 3, `${file} embeds color, normal, and ORM images`);
  const imageSizes = json.images.map(image => {
    assert.equal(image.mimeType, 'image/png', `${file} ${image.name} mime type`);
    const view = json.bufferViews[image.bufferView];
    const start = view.byteOffset || 0;
    const end = start + view.byteLength;
    return pngSize(bin.subarray(start, end));
  }).map(size => `${size.width}x${size.height}`).sort();
  assert.deepEqual(imageSizes, ['256x256', '256x256', '512x512'], `${file} PBR image sizes`);
}

function geometrySnapshot(geometry) {
  const attributes = {};
  for (const [name, attribute] of Object.entries(geometry?.attributes || {})) {
    attributes[name] = Array.from(attribute.array);
  }
  return {
    type: geometry?.type || null,
    attributes,
    index: geometry?.index ? Array.from(geometry.index.array) : null,
  };
}

function meshes(node) {
  const found = [];
  node?.traverse?.(item => { if (item.isMesh) found.push(item); });
  return found;
}

function nodeSnapshot(node) {
  const snapshot = meshes(node).map(mesh => ({
    name: mesh.name,
    geometry: geometrySnapshot(mesh.geometry),
    position: mesh.position.toArray(),
    rotation: mesh.rotation.toArray(),
    scale: mesh.scale.toArray(),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  // Vector3.toArray() uses the VM's Array constructor. Normalize snapshots so
  // exact cross-context comparisons do not fail on realm-specific prototypes.
  return JSON.parse(JSON.stringify(snapshot));
}

function transformSnapshot(model) {
  const part = node => node ? ({
    position: node.position.toArray(),
    rotation: node.rotation.toArray(),
    scale: node.scale.toArray(),
  }) : null;
  return JSON.parse(JSON.stringify({
    group: part(model.group),
    head: part(model.head),
    body: part(model.bodyProportions),
    arms: model.arms.map(part),
    legs: model.legs.map(part),
  }));
}

function makeHairProvider(THREE, {asset, source, failed = false} = {}) {
  const created = [];
  const released = new Set();
  let loadCalls = 0;
  let isReady = false;
  let sharedGeometry = null;
  const failure = new Error('synthetic GLB read failure');
  const provider = {
    load() {
      loadCalls += 1;
      if (failed) {
        const rejected = Promise.reject(failure);
        rejected.catch(() => {});
        return rejected;
      }
      if (THREE) sharedGeometry = new THREE.SphereGeometry(.49, 10, 6);
      isReady = true;
      return Promise.resolve({source, asset});
    },
    ready() { return isReady; },
    create(tone) {
      if (!isReady) return null;
      const group = new THREE.Group();
      group.name = `${source}-instance`;
      group.userData.blenderHair = true;
      group.userData.hairSource = source;
      const material = new THREE.MeshStandardMaterial({color: tone ?? 0xd2ad84, roughness: .66});
      const mesh = new THREE.Mesh(sharedGeometry, material);
      mesh.name = `${source}-mesh`;
      mesh.castShadow = true;
      group.add(mesh);
      created.push(group);
      return group;
    },
    release(group) {
      if (!group || released.has(group)) return;
      released.add(group);
      group.traverse(node => {
        if (!node.isMesh) return;
        for (const material of (Array.isArray(node.material) ? node.material : [node.material])) material?.dispose?.();
      });
      group.removeFromParent?.();
    },
    stats() {
      return {
        source,
        asset,
        loadCalls,
        created: created.length,
        released: released.size,
        live: created.filter(group => !released.has(group)).length,
      };
    },
  };
  return provider;
}

function sharedFixture({v1, v2}) {
  const context = {
    console,
    performance: {now: () => 1000},
    fetch() { throw new Error('avatar GLB test must not fetch external assets'); },
    CozyHairGLBV1: v1,
    CozyHairGLB: v2,
  };
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);
  for (const file of [
    'base/vendor/three.js', 'base/r2-geometry-index.js', 'base/static-mesh.js',
    'base/models.js', 'base/character-gestures.js', 'head-art-previous.js',
    'avatar-deluxe-head-art-v1.js', 'avatar-head-v1-alias.js', 'head-art.js',
  ]) vm.runInContext(read(file), context, {filename: path.join(ROOT, file)});
  return {context, THREE: context.THREE, v1, v2};
}

function avatarFixture({v2Failed = false} = {}) {
  const fx = sharedFixture({
    v1: makeHairProvider(null, {asset: V1_GLB_PATH, source: 'synthetic-v1'}),
    v2: makeHairProvider(null, {asset: V2_GLB_PATH, source: 'synthetic-v2', failed: v2Failed}),
  });
  fx.v1 = makeHairProvider(fx.THREE, {asset: V1_GLB_PATH, source: 'synthetic-v1'});
  fx.v2 = makeHairProvider(fx.THREE, {asset: V2_GLB_PATH, source: 'synthetic-v2', failed: v2Failed});
  fx.context.CozyHairGLBV1 = fx.v1;
  fx.context.CozyHairGLB = fx.v2;

  // The old path is pinned to the procedural source at d64145c.
  vm.runInContext(proceduralSource(), fx.context, {filename: `${AVATAR_PATH}#procedural`});
  vm.runInContext(read('avatar-integrated-alias.js'), fx.context, {filename: path.join(ROOT, 'avatar-integrated-alias.js')});
  assert.ok(fx.context.CozyAvatarIntegrated, 'old alias exports CozyAvatarIntegrated');

  // V1 is a separate factory and helper. The alias is loaded before V2
  // replaces the default CozyAvatarDeluxe export.
  vm.runInContext(read('avatar-deluxe-blender-v1.js'), fx.context, {filename: path.join(ROOT, 'avatar-deluxe-blender-v1.js')});
  vm.runInContext(read('avatar-blender-v1-alias.js'), fx.context, {filename: path.join(ROOT, 'avatar-blender-v1-alias.js')});
  assert.ok(fx.context.CozyAvatarBlenderV1, 'V1 alias exports CozyAvatarBlenderV1');
  vm.runInContext(read('avatar-deluxe.js'), fx.context, {filename: path.join(ROOT, 'avatar-deluxe.js')});
  assert.ok(fx.context.CozyAvatarDeluxe, 'new path exports CozyAvatarDeluxe');
  vm.runInContext(read('avatar-candidate.js'), fx.context, {filename: path.join(ROOT, 'avatar-candidate.js')});
  return fx;
}

function baselineV1Fixture() {
  const fx = sharedFixture({
    v1: makeHairProvider(null, {asset: V1_GLB_PATH, source: 'synthetic-v1'}),
    v2: makeHairProvider(null, {asset: V1_GLB_PATH, source: 'synthetic-v1'}),
  });
  fx.v1 = makeHairProvider(fx.THREE, {asset: V1_GLB_PATH, source: 'synthetic-v1'});
  fx.v2 = fx.v1;
  fx.context.CozyHairGLB = fx.v1;
  fx.context.CozyHairGLBV1 = fx.v1;
  vm.runInContext(baselineV1Source(), fx.context, {filename: `${AVATAR_PATH}#41075e9`});
  return fx;
}

function hairModuleFixture(file, globalName, asset, {failed = false} = {}) {
  const context = {console, fetch() { throw new Error('GLB unit test must not fetch'); }};
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read('base/vendor/three.js'), context, {filename: path.join(ROOT, 'base/vendor/three.js')});
  context.CozyGLTFLoader = class {
    load(url, onLoad, onProgress, onError) {
      assert.equal(url, asset, `${file} loads its pinned asset`);
      if (failed) {
        onError(new Error('synthetic loader failure'));
        return;
      }
      const scene = new context.THREE.Group();
      scene.name = 'synthetic-glb-scene';
      const geometry = new context.THREE.SphereGeometry(.5, 8, 4);
      const material = new context.THREE.MeshStandardMaterial({color: 0xffffff});
      scene.add(new context.THREE.Mesh(geometry, material));
      onLoad({scene});
    }
  };
  vm.runInContext(read(file), context, {filename: path.join(ROOT, file)});
  return context;
}

function create(fx, factory, options = {}) {
  const parent = new fx.THREE.Group();
  const model = factory(parent, options);
  return {parent, model};
}

function glbHair(model) {
  let found = null;
  model?.head?.children?.[2]?.traverse?.(node => {
    if (!found && node.userData?.blenderHair) found = node;
  });
  return found;
}

function assertPreserved(reference, candidate, label) {
  const referenceSkin = nodeSnapshot(reference.head.children[0]);
  const candidateSkin = nodeSnapshot(candidate.head.children[0]);
  assert.deepEqual(candidateSkin, referenceSkin, `${label}: skin`);
  assert.deepEqual(nodeSnapshot(candidate.head.children[1]), nodeSnapshot(reference.head.children[1]), `${label}: eyes/face`);
  assert.deepEqual(nodeSnapshot(candidate.bodyProportions), nodeSnapshot(reference.bodyProportions), `${label}: body`);
  const candidateArms = JSON.parse(JSON.stringify(candidate.arms.map(nodeSnapshot)));
  const referenceArms = JSON.parse(JSON.stringify(reference.arms.map(nodeSnapshot)));
  assert.deepEqual(candidateArms, referenceArms, `${label}: arms`);
  assert.deepEqual(JSON.parse(JSON.stringify(candidate.legs.map(nodeSnapshot))),
    JSON.parse(JSON.stringify(reference.legs.map(nodeSnapshot))), `${label}: legs`);
}

test('V2 GLB is one opaque Blender hair primitive with embedded PBR images', () => {
  assertHairGLB(V2_GLB_PATH);
});

test('V1 and V2 helpers expose the async load, fallback, clone, and release contract', async () => {
  for (const [file, globalName, asset] of [
    ['hair-glb-v1.js', 'CozyHairGLBV1', V1_GLB_PATH],
    ['hair-glb.js', 'CozyHairGLB', V2_GLB_PATH],
  ]) {
    const context = hairModuleFixture(file, globalName, asset);
    const provider = context[globalName];
    assert.ok(provider, `${globalName} is exported`);
    assert.deepEqual(Object.keys(provider).sort(), ['create', 'dispose', 'load', 'ready', 'release', 'stats']);
    assert.equal(provider.ready(), false);
    const firstLoad = provider.load();
    assert.strictEqual(firstLoad, provider.load(), `${globalName} deduplicates concurrent loads`);
    await firstLoad;
    assert.equal(provider.ready(), true);
    const first = provider.create(0x8e6b57);
    const second = provider.create(0xbabec7);
    assert.ok(first && second);
    assert.strictEqual(first.children[0].geometry, second.children[0].geometry, `${globalName} shares GLB geometry`);
    assert.notStrictEqual(first.children[0].material, second.children[0].material, `${globalName} clones materials`);
    assert.equal(first.children[0].material.color.getHex(), 0x8e6b57);
    assert.equal(second.children[0].material.color.getHex(), 0xbabec7);
    assert.equal(provider.stats().liveInstances, 2);
    provider.release(first);
    provider.release(second);
    assert.equal(provider.stats().liveInstances, 0);
    provider.dispose();
    assert.equal(provider.ready(), false, `${globalName} disposes its template`);

    const failedContext = hairModuleFixture(file, globalName, asset, {failed: true});
    const failed = failedContext[globalName];
    await assert.rejects(failed.load(), /synthetic loader failure/);
    assert.equal(failed.ready(), false);
    assert.equal(failed.create(0xd2ad84), null);
    assert.equal(failed.stats().liveInstances, 0);
  }
});

test('V2 preserves the fixed V1 and procedural face, eyes, skin, body, and animation baselines', async () => {
  const fx = avatarFixture();
  await fx.v1.load();
  await fx.v2.load();
  const options = {scale: 1, color: 0x303036, hair: 0xd2ad84};
  const profile = {character: 'violet', skin: 'orange', hair: 'hair-bob', hairColor: 0xd2ad84, outfit: 'outfit-uniform'};
  const procedural = create(fx, fx.context.CozyAvatarIntegrated.create, options).model;
  const v1 = create(fx, fx.context.CozyAvatarBlenderV1.create, options).model;
  const v2 = create(fx, fx.context.CozyAvatarDeluxe.create, options).model;
  for (const model of [procedural, v1, v2]) model.setAppearance(profile);
  await Promise.resolve();

  assert.equal(procedural.state().version, 'head-integrated.1');
  assert.equal(v1.state().version, 'blender-hair.1');
  assert.equal(v2.state().version, 'blender-hair.2');
  assert.equal(glbHair(procedural), null, 'procedural original remains procedural');
  assert.ok(glbHair(v1), 'fixed V1 baseline uses its GLB helper');
  assert.ok(glbHair(v2), 'V2 uses its GLB helper');
  assertPreserved(procedural, v1, 'V1 vs d64145c');
  assertPreserved(v1, v2, 'V2 vs fixed V1');

  for (const model of [procedural, v1, v2]) model.animate(1.75, true, false, true);
  assert.deepEqual(transformSnapshot(v1), transformSnapshot(procedural), 'V1 animation matches d64145c');
  assert.deepEqual(transformSnapshot(v2), transformSnapshot(v1), 'V2 animation matches fixed V1');

  // The factory used by the branch is compared with the immutable V1 source,
  // rather than trusting the mutable working-tree copy as its own baseline.
  const baseline = baselineV1Fixture();
  await baseline.v1.load();
  const baselineModel = create(baseline, baseline.context.CozyAvatarDeluxe.create, options).model;
  baselineModel.setAppearance(profile);
  await Promise.resolve();
  assertPreserved(baselineModel, v1, 'working V1 vs 41075e9');
  baselineModel.animate(1.75, true, false, true);
  assert.deepEqual(transformSnapshot(v1), transformSnapshot(baselineModel), 'working V1 animation matches 41075e9');

  procedural.dispose();
  v1.dispose();
  v2.dispose();
  baselineModel.dispose();
  assert.equal(fx.v1.stats().live, 0);
  assert.equal(fx.v2.stats().live, 0);
  assert.equal(baseline.v1.stats().live, 0);
});

test('three-version candidate switches preserve profile and release V1/V2 hair resources', async () => {
  const fx = avatarFixture();
  await fx.v1.load();
  await fx.v2.load();
  const parent = new fx.THREE.Group();
  const demo = fx.context.CozyAvatarCandidate.create(parent, {artLabDemo: true, color: 0x303036, hair: 0xd2ad84});
  const profile = {character: 'violet', skin: 'orange', hair: 'hair-bob', hairColor: 0xd2ad84, outfit: 'outfit-uniform', avatarPreset: 'three-version-check'};
  demo.setAppearance(profile);
  for (const version of ['old', 'v1', 'new', 'v1', 'old', 'new']) {
    fx.context.CozyAvatarCandidate.setVersion(version);
    assert.equal(demo.version, version, `candidate switched to ${version}`);
    assert.deepEqual(JSON.parse(JSON.stringify(demo.profile)), profile, `profile survives ${version} switch`);
    assert.deepEqual(JSON.parse(JSON.stringify(demo.active.state().profile)), profile, `active factory receives profile at ${version}`);
    assert.equal(parent.children.length, 1, `candidate wrapper remains single at ${version}`);
  }
  assert.equal(fx.v1.stats().live, 0, 'inactive V1 instances are released');
  assert.equal(fx.v2.stats().live, 1, 'active V2 instance is the only live GLB group');
  demo.dispose();
  assert.equal(fx.v1.stats().live, 0);
  assert.equal(fx.v2.stats().live, 0);
});

test('failed V2 GLB load falls back to procedural bob without throwing', async () => {
  const fx = avatarFixture({v2Failed: true});
  await assert.rejects(fx.v2.load(), /synthetic GLB read failure/);
  const {model} = create(fx, fx.context.CozyAvatarDeluxe.create, {hair: 0xd2ad84});
  await Promise.resolve();
  assert.equal(fx.v2.ready(), false);
  assert.equal(fx.v2.stats().created, 0);
  assert.equal(glbHair(model), null, 'fallback does not attach a partial V2 GLB group');
  assert.ok(meshes(model.head.children[2]).length > 0, 'fallback keeps procedural hair meshes');
  assert.equal(model.state().hairSource, 'procedural');
  assert.doesNotThrow(() => model.animate(2.25, false, false, false));
  model.dispose();
  assert.equal(fx.v2.stats().live, 0);
});

test('baseline commit pins remain explicit and immutable', () => {
  assert.equal(BASELINE_V1_COMMIT, '41075e9a933c939d745467402438e47f89c961b7');
  assert.equal(PROCEDURAL_COMMIT, 'd64145cf75d1a0dd68515abdfbb3bd57a8d1c1fb');
  assert.equal(crypto.createHash('sha256').update(baselineV1Source()).digest('hex'),
    '67f9a6c55df6beacd22e401846862a51705c818f49c9afbac885ddb0ad579940');
  const normalizedV1Source = read('avatar-deluxe-blender-v1.js').replaceAll('CozyHairGLBV1', 'CozyHairGLB');
  assert.equal(crypto.createHash('sha256').update(normalizedV1Source).digest('hex'),
    crypto.createHash('sha256').update(baselineV1Source()).digest('hex'),
    'V1 factory only changes the helper global name from the fixed 41075e9 source');
  assert.equal(crypto.createHash('sha256').update(proceduralSource()).digest('hex'),
    '0b0623999d41cd6bcc7cbc8283ea211790b354eeb56e600600d2939dd4c66673');
});
