'use strict';

/* Short repeated renderer/resource QA.  This is deliberately limited to the
 * isolated portrait trial and writes only its evidence subtree. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, webkit, chromiumOptions } = require('./browser-runtime.cjs');

const BASE = process.env.THREE_PEOPLE_BASE || 'http://127.0.0.1:4744';
const ROOT = __dirname;
const EVIDENCE = process.env.THREE_PEOPLE_EVIDENCE || path.join(ROOT, 'evidence', 'three-people-trial');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, '.private-people-config', 'people.json'), 'utf8'));
const row = cfg.rows.find(item => item.key === 'a');
// studio.html loads avatar-deluxe.js as the confirmed generic comparison;
// its public state version is blender-hair.2.
const GENERIC_VERSION = 'blender-hair.2';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function login() {
  const response = await fetch(BASE + '/api/play-login', { method: 'POST', headers: { Origin: BASE, 'Content-Type': 'application/json' }, body: JSON.stringify({ employeeId: row.employeeId }) });
  const data = await response.json(); assert.equal(response.status, 200);
  const pair = String(response.headers.get('set-cookie') || '').split(';')[0], i = pair.indexOf('='); assert.ok(i > 0);
  return { cookie: pair, cookieName: pair.slice(0, i), cookieValue: pair.slice(i + 1), csrf: data.csrf, uid: data.profile.id };
}

async function runEngine(name, launch, session) {
  const browser = await launch();
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await context.addCookies([{ name: session.cookieName, value: session.cookieValue, domain: '127.0.0.1', path: '/' }]);
  const pageErrors = [];
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#frame-mount iframe', { timeout: 30000 });
  // WebKit can expose the iframe element before its navigation appears in
  // Playwright's frame list; wait for the same-origin studio global itself.
  await page.waitForFunction(() => document.querySelector('iframe')?.contentWindow?.AvatarArtLabStudio, null, { timeout: 30000 });
  let frame = page.frames().find(item => /\/studio\.html(?:\?|$)/.test(item.url()));
  assert.ok(frame, `${name}: studio frame missing`);
  await frame.waitForFunction(() => window.AvatarArtLabStudio?.metrics?.().frames > 8, null, { timeout: 60000 });
  const control = async (action, value) => { await frame.evaluate(({ action, value }) => AvatarArtLabStudio.control(action, value), { action, value }); await sleep(110); };
  const metrics = () => frame.evaluate(() => ({ metrics: AvatarArtLabStudio.metrics(), model: AvatarArtLabStudio.model.active.state(), portraitAsset: CozyPortraitHair.stats() }));
  await control('version', 'new'); await control('framing', 'head'); await control('view', 'front'); await sleep(400);
  const before = await metrics();
  assert.equal(before.model.version, 'portrait-trial.1', `${name}: initial new branch mismatch`);
  const versionSamples = [];
  for (let round = 0; round < 40; round++) {
    const expectedVersion = round % 2 ? GENERIC_VERSION : 'portrait-trial.1';
    await control('version', round % 2 ? 'old' : 'new');
    const switched = await metrics();
    assert.equal(switched.model.version, expectedVersion, `${name}: wrong version on round ${round}`);
    assert.ok(Number(switched.model.ownedGeometries) > 0 && Number(switched.metrics.modelGeometryBytes) > 0, `${name}: invalid geometry on round ${round}`);
    versionSamples.push({ round, requested: round % 2 ? 'old' : 'new', version: switched.model.version, modelTriangles: switched.metrics.modelTriangles, modelGeometries: switched.metrics.modelGeometries, modelMaterials: switched.metrics.modelMaterials });
    await control('framing', round % 2 ? 'full' : 'head');
    await control('view', ['front', 'quarter', 'side', 'back'][round % 4]);
    await control('motion', ['idle', 'walk', 'wave', 'sit'][round % 4]);
    await control('hair', ['bob', 'silver', 'pony', 'bob'][round % 4]);
    await control('outfit', ['uniform', 'forest', 'ocean', 'uniform'][round % 4]);
    await control('lighting', ['live', 'day', 'dusk', 'night'][round % 4]);
  }
  await control('version', 'new'); await control('hair', 'portrait'); await control('outfit', 'uniform'); await control('framing', 'full'); await sleep(900);
  const after = await metrics();
  assert.equal(after.metrics.contextLost, false, `${name}: context lost`);
  assert.equal(after.model.portraitKey, 'a', `${name}: portrait key changed`);
  assert.equal(after.model.version, 'portrait-trial.1', `${name}: final new branch mismatch`);
  assert.match(after.model.hairSource, /glb$/, `${name}: final hair is not GLB`);
  assert.equal(after.portraitAsset.liveInstances, 1, `${name}: portrait clone leak`);
  assert.deepEqual(pageErrors, [], `${name}: page errors ${pageErrors.join('; ')}`);
  const out = { pass: true, browser: name, rounds: 40, versionSamples, oldBranchVersion: GENERIC_VERSION, newBranchVersion: 'portrait-trial.1', pageErrors, before, after, memoryStable: { rendererGeometryDelta: after.metrics.geometries - before.metrics.geometries, rendererTextureDelta: after.metrics.textures - before.metrics.textures, portraitLiveInstances: after.portraitAsset.liveInstances, portraitCreated: after.portraitAsset.created, portraitReleased: after.portraitAsset.released }, viewport: { width: 390, height: 844, deviceScaleFactor: 1 } };
  await page.screenshot({ path: path.join(EVIDENCE, `toggles-${name}-final.png`) });
  await context.close(); await browser.close(); return out;
}

(async () => {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const receipt = { scope: 'isolated-three-people-portrait-toggle-resource-qa', base: BASE, generatedAt: new Date().toISOString(), formalWrites: 0, originalCityModified: false, physicalIphoneUat: false, engines: {}, errors: [] };
  const requestedEngines = new Set((process.env.THREE_PEOPLE_ENGINES || 'chromium,webkit').split(',').map(value => value.trim()).filter(Boolean));
  const sessionA = await login();
  if (requestedEngines.has('chromium')) try {
    receipt.engines.chromium = await runEngine('chromium', () => chromium.launch(chromiumOptions), sessionA);
  } catch (error) { receipt.engines.chromium = { pass: false, error: error.message }; receipt.errors.push(`chromium: ${error.message}`); }
  // WebKit uses its own native engine and does not accept Chromium launch args.
  if (requestedEngines.has('webkit')) { const sessionB = await login();
    try {
      receipt.engines.webkit = await runEngine('webkit', () => webkit.launch({ headless: true }), sessionB);
    } catch (error) { receipt.engines.webkit = { pass: false, error: error.message }; receipt.errors.push(`webkit: ${error.message}`); }
  }
  fs.writeFileSync(path.join(EVIDENCE, 'three-people-toggle-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.errors.length) process.exitCode = 1;
})().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
