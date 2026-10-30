/* Full-character QA runner for the isolated ArtLab candidate only.
 * The origin is explicit so this never accidentally tests an older 4714 preview.
 */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium, chromiumOptions } = require('./browser-runtime.cjs');

const origin = process.env.ARTLAB_ORIGIN || 'http://127.0.0.1:4734';
const outDir = 'evidence/full-character-integration';

(async () => {
  const browser = await chromium.launch(chromiumOptions);
  const out = {
    origin,
    scope: 'isolated full-character candidate',
    formalWrites: 0,
    physicalIphoneUat: false,
    cameraFraming: {},
    headPivot: {},
    errors: [],
  };
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 850 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => out.errors.push(error.message));
    await page.goto(`${origin}/studio.html`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.AvatarArtLabStudio?.metrics().frames > 8, null, { timeout: 60000 });
    await page.evaluate(() => {
      AvatarArtLabStudio.control('framing', 'full');
      AvatarArtLabStudio.control('version', 'new');
      AvatarArtLabStudio.control('motion', 'idle');
    });
    for (const view of ['front', 'quarter', 'side', 'back']) {
      await page.evaluate(viewName => AvatarArtLabStudio.control('view', viewName), view);
      await page.waitForTimeout(350);
      const result = await page.evaluate(() => {
        const s = AvatarArtLabStudio;
        const box = new THREE.Box3().setFromObject(s.model.group);
        const points = [];
        for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
          points.push(new THREE.Vector3(x, y, z).project(s.camera));
        }
        return {
          framing: s.framing,
          version: s.model.active.state().version,
          bounds: { min: box.min.toArray(), max: box.max.toArray() },
          ndc: { minX: Math.min(...points.map(p => p.x)), maxX: Math.max(...points.map(p => p.x)), minY: Math.min(...points.map(p => p.y)), maxY: Math.max(...points.map(p => p.y)) },
          metrics: s.metrics(),
        };
      });
      assert.equal(result.framing, 'full');
      assert.equal(result.version, 'blender-hair.2');
      assert.ok(result.ndc.minX > -0.98 && result.ndc.maxX < 0.98 && result.ndc.minY > -0.98 && result.ndc.maxY < 0.98, `character cropped at ${view}`);
      out.cameraFraming[view] = result;
    }

    // Verify a real head pivot: the GLB instance is parented beneath model.head,
    // and a head yaw changes its world transform. Camera yaw alone cannot satisfy this.
    out.headPivot = await page.evaluate(() => {
      const model = AvatarArtLabStudio.model.active;
      const asset = model.head.getObjectByName('blender-short-bob-instance');
      if (!(asset && asset.parent?.parent === model.head)) throw new Error('GLB hair must be under the head pivot');
      model.group.updateWorldMatrix(true, true);
      const before = asset.getWorldQuaternion(new THREE.Quaternion()).toArray();
      const prior = model.head.rotation.y;
      model.head.rotation.y = 0.42;
      model.head.updateWorldMatrix(true, true);
      const after = asset.getWorldQuaternion(new THREE.Quaternion()).toArray();
      model.head.rotation.y = prior;
      model.head.updateWorldMatrix(true, true);
      const delta = before.reduce((sum, value, index) => sum + Math.abs(value - after[index]), 0);
      return { parentedToHead: true, before, after, worldQuaternionDelta: delta, directHeadPivot: delta > 0.01, productHeadLookControl: false };
    });
    assert.equal(out.headPivot.parentedToHead, true);
    assert.equal(out.headPivot.directHeadPivot, true);
    // There is no dedicated look-at control in the candidate API; report that
    // boundary explicitly instead of mistaking studio camera views for head turns.
    assert.equal(out.headPivot.productHeadLookControl, false);
    assert.deepEqual(out.errors, []);
    out.pass = true;
    fs.writeFileSync(`${outDir}/full-character-qa.json`, JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ pass: true, origin, views: Object.keys(out.cameraFraming).length, directHeadPivot: out.headPivot.directHeadPivot, productHeadLookControl: out.headPivot.productHeadLookControl }));
  } catch (error) {
    out.pass = false;
    out.error = error.stack;
    fs.writeFileSync(`${outDir}/full-character-qa.json`, JSON.stringify(out, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
