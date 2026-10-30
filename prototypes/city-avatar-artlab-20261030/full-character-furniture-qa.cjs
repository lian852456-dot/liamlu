const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium, chromiumOptions } = require('./browser-runtime.cjs');
const origin = process.env.ARTLAB_ORIGIN || 'http://127.0.0.1:4734';
const outPath = 'evidence/full-character-integration/furniture-current.json';

async function guest() {
  const response = await fetch(`${origin}/api/guest`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname: '家具驗收', registrationKey: 'f'.repeat(48) }),
  });
  const data = await response.json();
  assert.equal(response.ok, true, JSON.stringify(data));
  return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

(async () => {
  const out = { origin, scope: 'current-source furniture interaction', formalWrites: 0, physicalIphoneUat: false, errors: [] };
  let browser;
  try {
    const account = await guest();
    browser = await chromium.launch(chromiumOptions);
    const context = await browser.newContext({ viewport: { width: 640, height: 850 }, deviceScaleFactor: 1 });
    await context.addCookies([{ name: 'city_avatar_full_integration_20261030', value: account.cookie.split('=')[1], domain: '127.0.0.1', path: '/' }]);
    const page = await context.newPage();
    page.on('pageerror', error => out.errors.push(error.message));
    await page.goto(`${origin}/game.html`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.CozyWorld?.state().active && document.querySelector('#presence-status')?.textContent === '即時同步中', null, { timeout: 60000 });
    await page.evaluate(() => { for (const button of document.querySelectorAll('button')) if (button.textContent === '不再提示') button.click(); for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close(); });
    await page.evaluate(() => CozyWorld.enter('quick'));
    await page.waitForFunction(() => CozyWorld.getScene() === 'indoor', null, { timeout: 15000 });
    await page.evaluate(() => CozyWorld.interact('sofa'));
    await page.waitForFunction(() => CozyWorld.getPose().action === 'sit', null, { timeout: 20000 });
    const sit = await page.evaluate(() => ({ scene: CozyWorld.getScene(), pose: CozyWorld.getPose(), legRotation: Math.abs(AvatarArtLabGame.model.active.legs[0].rotation.x), state: AvatarArtLabGame.model.active.state() }));
    assert.ok(sit.legRotation > 1, `sofa pose did not animate legs: ${JSON.stringify(sit)}`);
    await page.evaluate(() => CozyWorld.leave());
    await page.waitForFunction(() => CozyWorld.getScene() === 'outdoor', null, { timeout: 15000 });
    const left = await page.evaluate(() => ({ scene: CozyWorld.getScene(), pose: CozyWorld.getPose(), contextLost: CozyWorld.state().contextLost }));
    assert.equal(left.contextLost, false);
    assert.deepEqual(out.errors, []);
    Object.assign(out, { sit, left, pass: true });
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ pass: true, sit: { scene: sit.scene, legRotation: sit.legRotation }, left: left.scene }));
  } catch (error) {
    out.pass = false; out.error = error.stack; fs.writeFileSync(outPath, JSON.stringify(out, null, 2)); throw error;
  } finally { await browser?.close().catch(() => {}); }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
