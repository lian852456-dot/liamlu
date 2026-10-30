'use strict';

/* QA-only runner for the isolated three-person portrait trial.
 * It never touches the city source, assets, or formal data. Public evidence is
 * intentionally masked: employee IDs, cookies and CSRF values never leave this
 * process. Run with the local people-server already listening on :4744.
 */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, chromiumOptions } = require('./browser-runtime.cjs');

const BASE = process.env.THREE_PEOPLE_BASE || 'http://127.0.0.1:4744';
const ROOT = __dirname;
const EVIDENCE = process.env.THREE_PEOPLE_EVIDENCE || path.join(ROOT, 'evidence', 'three-people-trial');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, '.private-people-config', 'people.json'), 'utf8'));
const rows = cfg.rows.filter(row => row.active).sort((a, b) => a.key.localeCompare(b.key));
const expected = Object.fromEntries(rows.map(row => [row.key, row]));
const masked = id => `***${String(id).slice(-3)}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const jsonHeaders = origin => ({ Origin: origin, 'Content-Type': 'application/json' });
const cookiePair = raw => {
  const pair = String(raw || '').split(';')[0];
  const i = pair.indexOf('=');
  assert.ok(i > 0, 'missing session Set-Cookie');
  return { name: pair.slice(0, i), value: pair.slice(i + 1), pair };
};

async function request(pathname, body, session) {
  const headers = body ? jsonHeaders(BASE) : { Origin: BASE };
  if (session) {
    headers.Cookie = session.cookie;
    if (session.csrf) headers['X-City-CSRF'] = session.csrf;
  }
  const response = await fetch(BASE + pathname, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try { data = await response.json(); } catch { data = {}; }
  return { response, data, setCookie: response.headers.get('set-cookie') };
}

async function login(row) {
  const result = await request('/api/play-login', { employeeId: row.employeeId });
  assert.equal(result.response.status, 200, `${row.key} login ${result.response.status}`);
  const c = cookiePair(result.setCookie);
  const session = {
    cookie: c.pair,
    cookieName: c.name,
    cookieValue: c.value,
    csrf: result.data.csrf,
    uid: result.data.profile?.id,
    key: row.key,
  };
  assert.equal(result.data.playLogin?.employeeIdMasked, masked(row.employeeId));
  assert.equal(result.data.playLogin?.mode, 'employee-id-game-only');
  assert.equal(result.data.playLogin?.formalIdentityVerified, false);
  assert.equal(result.data.profile?.nickname, row.nickname);
  assert.equal(result.data.profile?.avatarPreset, row.preset);
  return { ...session, bootstrap: result.data };
}

async function logout(session) {
  const result = await request('/api/logout', {}, session);
  assert.equal(result.response.status, 200, `logout ${session.key}`);
}

async function installCookie(context, session) {
  await context.addCookies([{ name: session.cookieName, value: session.cookieValue, domain: '127.0.0.1', path: '/' }]);
}

function cloneForEvidence(value) {
  return JSON.parse(JSON.stringify(value, (key, item) => {
    if (['employeeId', 'employee_id', 'csrf', 'cookie', 'cookieValue', 'token', 'tokenHash'].includes(key)) return undefined;
    if (key === 'employeeIdMasked') return String(item);
    return item;
  }));
}

async function waitStudio(page) {
  await page.waitForSelector('#trial-area:not([hidden])', { timeout: 30000 });
  await page.waitForSelector('#frame-mount iframe', { timeout: 30000 });
  const frame = page.frames().find(f => /\/studio\.html(?:\?|$)/.test(f.url()));
  assert.ok(frame, 'studio iframe not found');
  await frame.waitForFunction(() => window.AvatarArtLabStudio?.metrics?.().frames > 8, null, { timeout: 60000 });
  return frame;
}

async function studioState(frame) {
  return frame.evaluate(() => ({
    studio: AvatarArtLabStudio.metrics(),
    model: AvatarArtLabStudio.model?.active?.state?.(),
    profile: AvatarArtLabStudio.model?.profile,
    // The factory exposes state on the active instance; CozyAvatarPortraits is
    // the factory namespace and intentionally has no mutable global state.
    portrait: AvatarArtLabStudio.model?.active?.state?.(),
    glassesNode: !!AvatarArtLabStudio.model?.active?.group?.getObjectByName?.('portrait-glasses'),
  }));
}

async function clickControl(page, action, value) {
  await page.locator(`[data-action="${action}"][data-value="${value}"]`).click();
  await sleep(500);
}

async function captureStudioSet(page, frame, key) {
  const dir = path.join(EVIDENCE, 'screens');
  fs.mkdirSync(dir, { recursive: true });
  await clickControl(page, 'framing', 'head');
  await clickControl(page, 'view', 'front');
  await page.locator('#frame-mount iframe').screenshot({ path: path.join(dir, `${key}-head-front.png`) });
  await clickControl(page, 'view', 'quarter');
  await page.locator('#frame-mount iframe').screenshot({ path: path.join(dir, `${key}-head-quarter.png`) });
  await clickControl(page, 'framing', 'full');
  await clickControl(page, 'view', 'front');
  await page.locator('#frame-mount iframe').screenshot({ path: path.join(dir, `${key}-full-front.png`) });
}

async function run() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  assert.deepEqual(rows.map(row => row.key), ['a', 'b', 'c']);
  const report = {
    scope: 'isolated-three-people-portrait-trial',
    base: BASE,
    generatedAt: new Date().toISOString(),
    formalWrites: 0,
    originalCityModified: false,
    physicalIphoneUat: false,
    mappings: {},
    checks: {},
    screenshots: [],
    errors: [],
  };

  // API identity, stable role mapping, unknown rejection, and logout boundary.
  const first = {};
  for (const row of rows) {
    const session = await login(row);
    first[row.key] = session;
    report.mappings[row.key] = {
      employeeId: masked(row.employeeId), nickname: row.nickname, preset: row.preset,
      uid: session.uid, cookieName: session.cookieName,
      profileIdMatchesSession: session.uid === session.bootstrap.profile?.id,
      mode: session.bootstrap.playLogin.mode,
    };
    assert.equal(session.uid, session.bootstrap.profile.id);
    await logout(session);
  }
  const unknown = await request('/api/play-login', { employeeId: '9999999' });
  assert.equal(unknown.response.status, 404, 'unknown ID must be rejected');
  assert.equal(unknown.data.error, 'PLAY_EMPLOYEE_UNAVAILABLE');
  const noSession = await request('/api/session');
  assert.equal(noSession.response.status, 401, 'unknown login must not create a session');

  const sameA = await login(expected.a);
  const repeatA = await login(expected.a);
  assert.equal(repeatA.uid, sameA.uid, 'same ID should resolve same trial role');
  assert.equal(repeatA.bootstrap.profile.avatarPreset, expected.a.preset);
  await logout(repeatA);
  const afterLogoutB = await login(expected.b);
  assert.notEqual(afterLogoutB.uid, sameA.uid, 'different ID must not reuse A role');
  await logout(afterLogoutB);
  await logout(sameA);
  report.checks.apiIdentity = { pass: true, unknownRejected: true, sameIdStableUid: true, logoutNoCrossPersonMix: true };

  // Browser UI and studio screenshots. Each context receives only the session cookie
  // generated above; no hard-coded cookie name/value is used.
  const browser = await chromium.launch(chromiumOptions);
  try {
    for (const row of rows) {
      const session = await login(row);
      const context = await browser.newContext({ viewport: { width: 720, height: 850 }, deviceScaleFactor: 1 });
      const pageErrors = [];
      await installCookie(context, session);
      const page = await context.newPage();
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
      const frame = await waitStudio(page);
      const initial = await studioState(frame);
      assert.equal(initial.profile.id, session.uid, `${row.key} browser/session uid mismatch`);
      assert.equal(initial.profile.avatarPreset, row.preset);
      assert.equal(initial.portrait.portraitKey, row.key);
      assert.match(initial.model.hairSource, /glb$/, `${row.key} must use the portrait GLB hair asset`);
      assert.equal(initial.model.version, 'portrait-trial.1');
      if (row.key === 'b') assert.equal(initial.glassesNode, true, 'B glasses missing');
      if (row.key !== 'b') assert.notEqual(initial.glassesNode, true, `${row.key} must not have B glasses`);
      await captureStudioSet(page, frame, row.key);
      report.screenshots.push(`${row.key}-head-front.png`, `${row.key}-head-quarter.png`, `${row.key}-full-front.png`);

      // Renderer-only old/new toggle must leave authenticated profile and wallet untouched.
      const before = await page.evaluate(async () => (await fetch('/api/session', { credentials: 'same-origin' })).json());
      await clickControl(page, 'version', 'old');
      const oldState = await studioState(frame);
      await clickControl(page, 'version', 'new');
      const newState = await studioState(frame);
      const after = await page.evaluate(async () => (await fetch('/api/session', { credentials: 'same-origin' })).json());
      assert.deepEqual(after.profile, before.profile);
      assert.deepEqual(after.wallet, before.wallet);
      assert.equal(newState.portrait.portraitKey, row.key);
      assert.equal(oldState.profile.id, session.uid);

      // Reload keeps same identity/preset and does not create an anonymous guest.
      await page.reload({ waitUntil: 'domcontentloaded' });
      const reloadFrame = await waitStudio(page);
      const reloaded = await studioState(reloadFrame);
      assert.equal(reloaded.profile.id, session.uid);
      assert.equal(reloaded.profile.avatarPreset, row.preset);
      assert.equal(reloaded.portrait.portraitKey, row.key);
      assert.deepEqual((await page.evaluate(async () => (await fetch('/api/session', { credentials: 'same-origin' })).json())).wallet, before.wallet);
      assert.deepEqual(pageErrors, [], `${row.key} UI page errors: ${pageErrors.join('; ')}`);
      report.checks[row.key] = {
        pass: true, uid: session.uid, portraitKey: reloaded.portrait.portraitKey,
        preset: reloaded.profile.avatarPreset, hairSource: reloaded.model.hairSource,
        oldNewProfileWalletUnchanged: true, reloadIdentityStable: true,
        pageErrors,
        metrics: cloneForEvidence(reloaded.studio),
      };
      await context.close();
      await logout(session);
    }

    // Independent browser contexts with the same ID resolve to the same role.
    const contextA = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const contextB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const sessionA = await login(expected.a);
    const sessionB = await login(expected.a);
    await installCookie(contextA, sessionA); await installCookie(contextB, sessionB);
    const pageA = await contextA.newPage(); const pageB = await contextB.newPage();
    await Promise.all([pageA.goto(BASE + '/', { waitUntil: 'domcontentloaded' }), pageB.goto(BASE + '/', { waitUntil: 'domcontentloaded' })]);
    const [frameA, frameB] = await Promise.all([waitStudio(pageA), waitStudio(pageB)]);
    const [stateA, stateB] = await Promise.all([studioState(frameA), studioState(frameB)]);
    assert.equal(stateA.profile.id, stateB.profile.id);
    assert.equal(stateA.portrait.portraitKey, 'a');
    assert.equal(stateB.portrait.portraitKey, 'a');
    report.checks.independentContexts = { pass: true, sameUid: true, samePortraitKey: true, contexts: 2 };
    await contextA.close(); await contextB.close(); await logout(sessionA); await logout(sessionB);
  } finally { await browser.close(); }

  fs.writeFileSync(path.join(EVIDENCE, 'three-people-qa-receipt.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

run().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
