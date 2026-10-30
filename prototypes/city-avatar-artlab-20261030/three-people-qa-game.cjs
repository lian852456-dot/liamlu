'use strict';

/* QA-only game-path checks for the isolated people-server.  This file is
 * deliberately additive and never opens the original city database. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, chromiumOptions } = require('./browser-runtime.cjs');
const WS = require('./base/vendor/ws');

const BASE = process.env.THREE_PEOPLE_BASE || 'http://127.0.0.1:4744';
const ROOT = __dirname;
const EVIDENCE = process.env.THREE_PEOPLE_EVIDENCE || path.join(ROOT, 'evidence', 'three-people-trial');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, '.private-people-config', 'people.json'), 'utf8'));
const rows = Object.fromEntries(cfg.rows.filter(row => row.active).map(row => [row.key, row]));
const mask = id => `***${String(id).slice(-3)}`;
const rid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function request(pathname, body, session) {
  const headers = body ? { Origin: BASE, 'Content-Type': 'application/json' } : { Origin: BASE };
  if (session) { headers.Cookie = session.cookie; if (session.csrf) headers['X-City-CSRF'] = session.csrf; }
  const r = await fetch(BASE + pathname, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined });
  let data = {}; try { data = await r.json(); } catch {}
  return { r, data, setCookie: r.headers.get('set-cookie') };
}

async function login(row) {
  const x = await request('/api/play-login', { employeeId: row.employeeId });
  assert.equal(x.r.status, 200, `${row.key} login ${x.r.status}`);
  const pair = String(x.setCookie || '').split(';')[0];
  const i = pair.indexOf('='); assert.ok(i > 0);
  const session = { key: row.key, cookie: pair, cookieName: pair.slice(0, i), cookieValue: pair.slice(i + 1), csrf: x.data.csrf, uid: x.data.profile.id, bootstrap: x.data };
  assert.equal(x.data.profile.avatarPreset, row.preset);
  return session;
}

async function logout(session) {
  const x = await request('/api/logout', {}, session);
  assert.equal(x.r.status, 200, `${session.key} logout`);
}

async function install(context, session) {
  await context.addCookies([{ name: session.cookieName, value: session.cookieValue, domain: '127.0.0.1', path: '/' }]);
}

async function waitGame(page) {
  await page.waitForFunction(() => window.CozyWorld?.state?.().active && window.AvatarArtLabGame?.model?.active?.state, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
}

function poseDistance(a, b) { return Math.hypot(Number(a.x) - Number(b.x), Number(a.z) - Number(b.z)); }

async function run() {
  fs.mkdirSync(EVIDENCE, { recursive: true });
  const receipt = {
    scope: 'isolated-three-people-game-trial', base: BASE, generatedAt: new Date().toISOString(),
    formalWrites: 0, originalCityModified: false, physicalIphoneUat: false,
    employeeIdMasks: { a: mask(rows.a.employeeId), b: mask(rows.b.employeeId) }, checks: {}, errors: []
  };
  const a = await login(rows.a);
  const b = await login(rows.b);
  const browser = await chromium.launch(chromiumOptions);
  let peer;
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await install(context, a);
    const pageErrors = [];
    const page = await context.newPage();
    page.on('pageerror', e => pageErrors.push(e.message));
    await page.goto(BASE + '/game.html', { waitUntil: 'domcontentloaded' });
    await waitGame(page);
    const initial = await page.evaluate(() => ({ world: CozyWorld.state(), model: AvatarArtLabGame.model.active.state(), profile: AvatarArtLabGame.model.profile }));
    assert.equal(initial.profile.id, a.uid);
    assert.equal(initial.profile.avatarPreset, rows.a.preset);
    assert.equal(initial.model.portraitKey, 'a');

    // Find a legal short pedestrian route from the actual scene rules.
    const target = await page.evaluate(() => {
      const R = window.CozySceneRules, N = window.CozyNav;
      const start = CozyWorld.getPose();
      const candidates = (R.cityLayout?.pedestrianRoutes || []).flat().filter(p => Math.hypot(p.x - start.x, p.z - start.z) > .7 && Math.hypot(p.x - start.x, p.z - start.z) < 8);
      return candidates.find(p => !R.overlaps?.(p, R.obstacles.outdoor, R.bounds.outdoor) && (!N?.blocked || !N.blocked(p, R.obstacles.outdoor, R.bounds.outdoor))) || { x: 3, z: 1.5 };
    });
    const startPose = await page.evaluate(() => CozyWorld.getPose());
    await page.evaluate(p => CozyWorld.walkTo(p), target);
    await page.waitForFunction(() => !CozyWorld.getPose().moving, null, { timeout: 20000 });
    const walked = await page.evaluate(() => CozyWorld.getPose());
    assert.ok(poseDistance(walked, startPose) > .45, `walk did not move: ${JSON.stringify({ startPose, walked, target })}`);
    await sleep(500);
    const location = await request('/api/location', null, a);
    assert.equal(location.r.status, 200);
    assert.ok(poseDistance(location.data.pose, walked) < 1.2, 'server position did not read back');

    // Reload through the real game entry and require the same pose and portrait.
    await page.reload({ waitUntil: 'domcontentloaded' }); await waitGame(page);
    const reloaded = await page.evaluate(() => ({ world: CozyWorld.state(), model: AvatarArtLabGame.model.active.state(), profile: AvatarArtLabGame.model.profile }));
    assert.equal(reloaded.profile.id, a.uid);
    assert.equal(reloaded.model.portraitKey, 'a');
    assert.ok(poseDistance(reloaded.world.position, walked) < 1.2, 'reload lost saved position');

    // Trial wardrobe: purchase one inexpensive hair/outfit item, read it back,
    // then restore the original equipped appearance. Inventory remains trial-only.
    const before = await request('/api/session', null, a);
    const ownedItem = (before.data.catalog || []).find(item => ['hair', 'outfit'].includes(item.category) && (before.data.inventory || []).some(inv => inv.item_id === item.id));
    const item = ownedItem || (before.data.catalog || []).find(item => ['hair', 'outfit'].includes(item.category) && !(before.data.inventory || []).some(inv => inv.item_id === item.id) && Number(item.coins || 0) <= Number(before.data.wallet?.coins || 0));
    assert.ok(item, 'no unowned hair/outfit trial item');
    const bought = ownedItem ? before : await request('/api/purchase', { itemId: item.id, requestId: rid('qa-wardrobe') }, a);
    assert.equal(bought.r.status, 200, `purchase ${item.id}`);
    const equipped = await request('/api/profile', { [item.category]: item.id, expectedRevision: bought.data.profile.revision }, a);
    assert.equal(equipped.r.status, 200, `equip ${item.id}`);
    const restored = await request('/api/profile', { character: before.data.profile.character, skin: before.data.profile.skin, hair: before.data.profile.hair, outfit: before.data.profile.outfit, car: before.data.profile.car, home: before.data.profile.home, expectedRevision: equipped.data.profile.revision }, a);
    assert.equal(restored.r.status, 200, 'restore original appearance');

    // Furniture is intentionally checked as a guest-trial boundary: purchase is
    // allowed in the trial wallet, while shared store editing remains read-only.
    const ownedFurniture = (before.data.catalog || []).find(item => ['furniture', 'supplies'].includes(item.category) && (before.data.inventory || []).some(inv => inv.item_id === item.id));
    const furniture = ownedFurniture || (before.data.catalog || []).find(item => ['furniture', 'supplies'].includes(item.category) && !(before.data.inventory || []).some(inv => inv.item_id === item.id) && Number(item.coins || 0) <= Number(before.data.wallet?.coins || 0));
    let furnitureResult = { available: false };
    if (furniture) {
      const boughtFurniture = ownedFurniture ? before : await request('/api/purchase', { itemId: furniture.id, requestId: rid('qa-furniture') }, a);
      assert.equal(boughtFurniture.r.status, 200, `purchase ${furniture.id}`);
      const space = await request('/api/space?id=store:jiuquan', null, a);
      assert.equal(space.r.status, 200);
      furnitureResult = { available: true, itemId: furniture.id, preOwned: !!ownedFurniture, storeEditable: space.data.space?.editable === true, guestReadOnlyExpected: space.data.space?.editable !== true };
    }

    // Live peer: connect B through the unchanged websocket protocol and require
    // a real personal B presence in A's outdoor scene.
    const wsUrl = BASE.replace(/^http/, 'ws') + '/api/live';
    peer = new WS(wsUrl, { headers: { Cookie: b.cookie, Origin: BASE } });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('peer websocket timeout')), 15000);
      peer.once('error', reject);
      peer.once('open', () => peer.send(JSON.stringify({ type: 'hello', csrf: b.csrf })));
      peer.on('message', raw => { try { const msg = JSON.parse(String(raw)); if (msg.type === 'welcome') { clearTimeout(timer); resolve(); } } catch {} });
    });
    await page.waitForFunction(id => CozyWorld.state().peers.some(peer => peer.id === id && peer.visible), b.uid, { timeout: 20000 });
    const peerState = await page.evaluate(id => CozyWorld.state().peers.find(peer => peer.id === id), b.uid);
    assert.ok(peerState?.visible);
    await page.screenshot({ path: path.join(EVIDENCE, 'screens', 'a-city-with-b-peer.png') });

    const final = await page.evaluate(() => ({ world: CozyWorld.state(), model: AvatarArtLabGame.model.active.state(), profile: AvatarArtLabGame.model.profile }));
    assert.equal(final.world.contextLost, false);
    assert.deepEqual(pageErrors, []);
    receipt.checks = {
      aGameIdentity: { pass: true, portraitKey: initial.model.portraitKey, reloadPortraitKey: reloaded.model.portraitKey, uidStable: initial.profile.id === reloaded.profile.id },
      walkSaveReload: { pass: true, moved: poseDistance(walked, startPose), serverReadback: true, reloadPositionRetained: true },
      wardrobe: { pass: true, itemId: item.id, itemCategory: item.category, preOwned: !!ownedItem, restoredOriginalEquippedAppearance: true },
      furniture: furnitureResult,
      multiplayer: { pass: true, peerKey: 'b', peerUid: b.uid, peerVisible: true, peerScene: peerState.scene, peerNickname: peerState.nickname },
      renderer: { pass: true, contextLost: final.world.contextLost, pageErrors, mobileRenderPolicy: final.world.renderBudget, triangles: final.world.triangles, drawCalls: final.world.drawCalls },
    };
    await context.close();
  } finally {
    peer?.terminate?.();
    await browser.close();
    await logout(a).catch(() => {}); await logout(b).catch(() => {});
  }
  fs.writeFileSync(path.join(EVIDENCE, 'three-people-game-receipt.json'), JSON.stringify(receipt, null, 2));
  console.log(JSON.stringify(receipt, null, 2));
}

run().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
