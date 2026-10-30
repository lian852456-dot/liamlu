const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const test = require('node:test');
const vm = require('node:vm');

const ROOT = __dirname;
const AVATAR_PATH = 'prototypes/city-avatar-artlab-20261030/avatar-deluxe.js';
const BASELINE_COMMIT = 'd64145cf75d1a0dd68515abdfbb3bd57a8d1c1fb';
const GLB_PATH = 'assets/hair-glb/short-bob-v1.glb';
const FROZEN_AVATAR_FILE = fs.existsSync(path.join(ROOT, 'avatar-deluxe-integrated.js'))
  ? 'avatar-deluxe-integrated.js'
  : null;
const CURRENT_AVATAR_FILE = 'avatar-deluxe.js';
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');
const baselineCommitAvatar = () => execFileSync('git', ['show', `${BASELINE_COMMIT}:${AVATAR_PATH}`], {cwd: ROOT, encoding: 'utf8'});
const baselineAvatar = () => FROZEN_AVATAR_FILE ? read(FROZEN_AVATAR_FILE) : baselineCommitAvatar();

function readGLB() {
  const bytes = fs.readFileSync(path.join(ROOT, GLB_PATH));
  assert.equal(bytes.toString('ascii', 0, 4), 'glTF', 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB declared length');
  const chunks = [];
  for (let offset = 12; offset < bytes.length;) {
    assert.ok(offset + 8 <= bytes.length, 'GLB chunk header stays in file');
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    assert.ok(end <= bytes.length, 'GLB chunk stays in file');
    chunks.push({type, data: bytes.subarray(start, end)});
    offset = end;
  }
  const jsonChunk = chunks.find(chunk => chunk.type === 0x4e4f534a);
  const binChunk = chunks.find(chunk => chunk.type === 0x004e4942);
  assert.ok(jsonChunk, 'GLB has JSON chunk');
  assert.ok(binChunk, 'GLB has BIN chunk');
  return {bytes, json: JSON.parse(jsonChunk.data.toString('utf8').trim()), bin: binChunk.data};
}

function pngSize(bytes) {
  assert.equal(bytes.toString('ascii', 1, 4), 'PNG', 'embedded image is PNG');
  assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', 'PNG has IHDR');
  return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
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
  return meshes(node).map(mesh => ({
    name: mesh.name,
    geometry: geometrySnapshot(mesh.geometry),
    position: mesh.position.toArray(),
    rotation: mesh.rotation.toArray(),
    scale: mesh.scale.toArray(),
  })).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

function transformSnapshot(model) {
  const part = node => node ? ({
    position: node.position.toArray(),
    rotation: node.rotation.toArray(),
    scale: node.scale.toArray(),
  }) : null;
  return {
    group: part(model.group),
    head: part(model.head),
    body: part(model.bodyProportions),
    arms: model.arms.map(part),
    legs: model.legs.map(part),
  };
}

function makeHairProvider(THREE, {failed = false} = {}) {
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
        // Attach a handler before returning so a production caller that starts
        // a best-effort preload cannot turn the expected fallback into an
        // unhandled-rejection failure.
        const rejected = Promise.reject(failure);
        rejected.catch(() => {});
        return rejected;
      }
      if (THREE) sharedGeometry = new THREE.SphereGeometry(.49, 10, 6);
      isReady = true;
      return Promise.resolve({source: 'synthetic-blender-glb'});
    },
    ready() { return isReady; },
    create(tone) {
      if (!isReady) return null;
      assert.ok(isReady, 'GLB create requires a completed load');
      const group = new THREE.Group();
      group.name = 'blender-glb-hair';
      group.userData.blenderHair = true;
      group.userData.hairSource = 'blender-glb';
      const material = new THREE.MeshStandardMaterial({color: tone ?? 0xd2ad84, roughness: .66});
      const mesh = new THREE.Mesh(sharedGeometry, material);
      mesh.name = 'blender-glb-hair-mesh';
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
        source: 'synthetic-blender-glb',
        loadCalls,
        created: created.length,
        released: released.size,
        live: created.filter(group => !released.has(group)).length,
      };
    },
  };
  return provider;
}

function fixture(provider) {
  const context = {
    console,
    performance: {now: () => 1000},
    fetch() { throw new Error('avatar GLB test must not fetch external assets'); },
    CozyHairGLB: provider,
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

  // The frozen copy is the pre-GLB snapshot from BASELINE_COMMIT. Loading it
  // beside the working implementation keeps preservation assertions stable
  // after this worktree receives a later commit.
  vm.runInContext(baselineAvatar(), context, {filename: `${AVATAR_PATH}#baseline`});
  context.CozyAvatarDeluxeBaseline = context.CozyAvatarDeluxe;
  if (fs.existsSync(path.join(ROOT, 'avatar-integrated-alias.js')))
    vm.runInContext(read('avatar-integrated-alias.js'), context, {filename: path.join(ROOT, 'avatar-integrated-alias.js')});
  vm.runInContext(read(CURRENT_AVATAR_FILE), context, {filename: path.join(ROOT, CURRENT_AVATAR_FILE)});
  vm.runInContext(read('avatar-candidate.js'), context, {filename: path.join(ROOT, 'avatar-candidate.js')});
  return {context, THREE: context.THREE, provider};
}

function runtimeFixture(options = {}) {
  // THREE is created inside the VM. Install a placeholder only while loading
  // source files, then replace the provider with one bound to that VM's
  // THREE constructors before creating any model.
  const fx = fixture(makeHairProvider(null, options));
  const provider = makeHairProvider(fx.THREE, options);
  fx.context.CozyHairGLB = provider;
  fx.provider = provider;
  return fx;
}

function hairModuleFixture({failed = false} = {}) {
  const context = {console, fetch() { throw new Error('GLB unit test must not fetch'); }};
  context.window = context;
  context.self = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(read('base/vendor/three.js'), context, {filename: path.join(ROOT, 'base/vendor/three.js')});
  context.CozyGLTFLoader = class {
    load(url, onLoad, onProgress, onError) {
      assert.equal(url, 'assets/hair-glb/short-bob-v1.glb');
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
  vm.runInContext(read('hair-glb.js'), context, {filename: path.join(ROOT, 'hair-glb.js')});
  return context;
}

function create(fx, factory, options = {}) {
  const parent = new fx.THREE.Group();
  const model = factory(parent, options);
  return {parent, model};
}

function glbHair(model) {
  return model.head.children[2].getObjectByName('blender-glb-hair')
    || model.head.children[2].getObjectByName('blender-short-bob-instance')
    || model.head.children[2].getObjectByProperty?.('userData.blenderHair', true);
}

test('GLB binary is one opaque Blender hair primitive with embedded PBR images', () => {
  const {json, bin} = readGLB();
  assert.match(json.asset?.generator || '', /Blender/i, 'generator identifies Blender');
  const serialized = JSON.stringify(json).toLowerCase();
  assert.equal(serialized.includes('body'), false, 'GLB metadata has no body object');
  assert.equal(serialized.includes('face'), false, 'GLB metadata has no face object');
  assert.equal(json.meshes?.length, 1, 'GLB contains one mesh');
  assert.equal(json.meshes[0].primitives?.length, 1, 'GLB contains one primitive');
  const primitive = json.meshes[0].primitives[0];
  assert.ok(primitive.attributes?.TANGENT !== undefined, 'primitive contains tangents');
  assert.equal(json.materials?.length, 1, 'GLB contains one material');
  assert.equal(json.materials[0].alphaMode || 'OPAQUE', 'OPAQUE', 'hair material is opaque');
  assert.equal(json.images?.length, 3, 'GLB embeds color, normal, and ORM images');
  const imageSizes = new Map();
  for (const image of json.images) {
    assert.equal(image.mimeType, 'image/png', `${image.name} mime type`);
    const view = json.bufferViews[image.bufferView];
    const start = view.byteOffset || 0;
    const end = start + view.byteLength;
    imageSizes.set(image.name, pngSize(bin.subarray(start, end)));
  }
  assert.deepEqual(imageSizes.get('hair-color'), {width: 512, height: 512});
  assert.deepEqual(imageSizes.get('hair-normal'), {width: 256, height: 256});
  assert.deepEqual(imageSizes.get('hair-orm'), {width: 256, height: 256});
});

test('hair-glb.js exposes the promised async load, fallback error, clone, and release contract', async () => {
  const context = hairModuleFixture();
  const provider = context.CozyHairGLB;
  assert.deepEqual(Object.keys(provider).sort(), ['create', 'dispose', 'load', 'ready', 'release', 'stats']);
  assert.equal(provider.ready(), false);
  await provider.load();
  assert.equal(provider.ready(), true);
  const first = provider.create(0x8e6b57);
  const second = provider.create(0xbabec7);
  assert.ok(first && second);
  assert.strictEqual(first.children[0].geometry, second.children[0].geometry);
  assert.notStrictEqual(first.children[0].material, second.children[0].material);
  assert.equal(first.children[0].material.color.getHex(), 0x8e6b57);
  assert.equal(second.children[0].material.color.getHex(), 0xbabec7);
  assert.equal(provider.stats().liveInstances, 2);
  provider.release(first);
  provider.release(second);
  assert.deepEqual(provider.stats().liveInstances, 0);

  const failed = hairModuleFixture({failed: true}).CozyHairGLB;
  await assert.rejects(failed.load(), /synthetic loader failure/);
  assert.equal(failed.ready(), false);
  assert.equal(failed.create(0xd2ad84), null);
  assert.equal(failed.stats().liveInstances, 0);
});

test('GLB provider contract loads once, clones by tone, and releases resources', async () => {
  const fx = runtimeFixture();
  const provider = fx.provider;
  await provider.load();
  assert.equal(provider.ready(), true);
  const first = provider.create(0x8e6b57);
  const second = provider.create(0xbabec7);
  assert.notStrictEqual(first, second);
  assert.strictEqual(first.children[0].geometry, second.children[0].geometry, 'GLB geometry stays shared');
  assert.equal(first.children[0].material.color.getHex(), 0x8e6b57);
  assert.equal(second.children[0].material.color.getHex(), 0xbabec7);
  assert.deepEqual(provider.stats(), {
    source: 'synthetic-blender-glb', loadCalls: 1, created: 2, released: 0, live: 2,
  });
  provider.release(first);
  provider.release(second);
  assert.equal(provider.stats().live, 0);
});

test('GLB hair leaves approved face, eyes, body, limbs, and animation unchanged', async () => {
  const fx = runtimeFixture();
  const provider = fx.provider;
  await provider.load();
  const options = {scale: 1, color: 0x303036, hair: 0xd2ad84};
  const baseline = create(fx, fx.context.CozyAvatarDeluxeBaseline.create, options).model;
  const current = create(fx, fx.context.CozyAvatarDeluxe.create, options).model;
  const profile = {character: 'violet', skin: 'orange', hair: 'hair-bob', hairColor: 0xd2ad84, outfit: 'outfit-uniform'};
  baseline.setAppearance(profile);
  current.setAppearance(profile);

  assert.ok(glbHair(current), 'new bob uses the GLB group');
  assert.equal(glbHair(baseline), undefined, 'pre-GLB snapshot has no GLB group');
  assert.deepEqual(nodeSnapshot(current.head.children[0]), nodeSnapshot(baseline.head.children[0]), 'face skin is unchanged');
  assert.deepEqual(nodeSnapshot(current.head.children[1]), nodeSnapshot(baseline.head.children[1]), 'eye and brow layers are unchanged');
  assert.deepEqual(nodeSnapshot(current.bodyProportions), nodeSnapshot(baseline.bodyProportions), 'body geometry is unchanged');
  assert.deepEqual(current.legs.map(nodeSnapshot), baseline.legs.map(nodeSnapshot), 'leg geometry is unchanged');

  baseline.animate(1.75, true, false, true);
  current.animate(1.75, true, false, true);
  assert.deepEqual(transformSnapshot(current), transformSnapshot(baseline), 'animation pivots and phase are unchanged');

  baseline.dispose();
  current.dispose();
  assert.equal(provider.stats().live, 0, 'disposing the avatar releases the active GLB group');
});

test('failed GLB load falls back to the existing procedural bob without throwing', async () => {
  const fx = runtimeFixture({failed: true});
  const provider = fx.provider;
  await assert.rejects(provider.load(), /synthetic GLB read failure/);
  const {model} = create(fx, fx.context.CozyAvatarDeluxe.create, {hair: 0xd2ad84});
  assert.equal(provider.ready(), false);
  assert.equal(provider.stats().created, 0);
  assert.equal(glbHair(model), undefined, 'fallback does not attach a partial GLB group');
  assert.ok(meshes(model.head.children[2]).length > 0, 'fallback keeps procedural hair meshes');
  assert.doesNotThrow(() => model.animate(2.25, false, false, false));
  model.dispose();
});

test('repeated wardrobe and old/new switches do not accumulate GLB resources', async () => {
  const fx = runtimeFixture();
  const provider = fx.provider;
  await provider.load();
  const parent = new fx.THREE.Group();
  const demo = fx.context.CozyAvatarCandidate.create(parent, {artLabDemo: true, color: 0x303036, hair: 0xd2ad84});
  const profile = {character: 'violet', skin: 'orange', hair: 'hair-bob', hairColor: 0xd2ad84, outfit: 'outfit-uniform'};
  demo.setAppearance(profile);
  const hairChildCount = demo.head.children.length;
  for (let i = 0; i < 24; i += 1) {
    demo.setAppearance({...profile, hair: i % 2 ? 'hair-pony' : 'hair-bob', hairColor: i % 2 ? 0x6a4f3e : 0xd2ad84});
    assert.equal(demo.head.children.length, hairChildCount, `head child count remains stable at round ${i}`);
    fx.context.CozyAvatarCandidate.setVersion(i % 2 ? 'old' : 'new');
    assert.equal(parent.children.length, 1, `candidate wrapper remains single at round ${i}`);
    fx.context.CozyAvatarCandidate.setVersion('new');
    demo.setAppearance({...profile, hair: 'hair-bob', hairColor: 0xd2ad84});
  }
  const beforeDispose = provider.stats();
  assert.equal(beforeDispose.live, 1, 'exactly one GLB group remains active');
  assert.ok(beforeDispose.released >= beforeDispose.created - 1, 'old GLB groups are released');
  demo.dispose();
  assert.equal(provider.stats().live, 0, 'candidate dispose releases the last GLB group');
  assert.equal(provider.stats().released, provider.stats().created, 'all created GLB groups are released');
});

test('frozen baseline is the current pre-GLB avatar source', () => {
  if (!FROZEN_AVATAR_FILE) return;
  assert.equal(crypto.createHash('sha256').update(baselineAvatar()).digest('hex'),
    crypto.createHash('sha256').update(baselineCommitAvatar()).digest('hex'));
});
