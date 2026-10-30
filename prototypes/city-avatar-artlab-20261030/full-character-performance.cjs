/* Current-candidate WebKit performance check; origin is explicit and isolated. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { webkit } = require('./browser-runtime.cjs');
const origin = process.env.ARTLAB_ORIGIN || 'http://127.0.0.1:4734';
const outPath = 'evidence/full-character-integration/performance-webkit.json';

(async () => {
  const browser = await webkit.launch({ headless: true });
  const out = { origin, engine: 'Mac WebKit', viewport: { width: 390, height: 844 }, physicalIphoneUat: false, gpuResidentMemoryMeasured: false, versions: {} };
  try {
    for (const version of ['old', 'v1', 'new']) {
      const context = await browser.newContext({ viewport: out.viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.goto(`${origin}/studio.html?version=${version}`, { waitUntil: 'commit' });
      await page.waitForFunction(() => window.AvatarArtLabStudio?.metrics().frames > 10, null, { timeout: 60000 });
      await page.waitForTimeout(2000);
      const samples = [];
      for (const view of ['front', 'quarter', 'side', 'front']) {
        await page.evaluate(viewName => AvatarArtLabStudio.control('view', viewName), view);
        await page.waitForTimeout(1200);
        samples.push(await page.evaluate(() => AvatarArtLabStudio.metrics()));
      }
      const data = await page.evaluate(() => {
        const s = AvatarArtLabStudio;
        const context = s.renderer.getContext();
        return { metrics: s.metrics(), nativeVersion: s.model.active.state().version, maxTextureSize: context.getParameter(context.MAX_TEXTURE_SIZE), webgl2: s.renderer.capabilities.isWebGL2, errors: [] };
      });
      assert.equal(data.metrics.contextLost, false);
      assert.ok(data.metrics.calls <= 22, `unexpected calls for ${version}: ${data.metrics.calls}`);
      assert.deepEqual(errors, []);
      out.versions[version] = { ...data, samples, errors };
      await context.close();
    }
    out.frameP50Ratio = out.versions.new.metrics.frameP50Ms / out.versions.old.metrics.frameP50Ms;
    out.pass = true;
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ pass: true, origin, frameP50Ratio: out.frameP50Ratio, old: out.versions.old.metrics, new: out.versions.new.metrics }));
  } catch (error) {
    out.pass = false;
    out.error = error.stack;
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
