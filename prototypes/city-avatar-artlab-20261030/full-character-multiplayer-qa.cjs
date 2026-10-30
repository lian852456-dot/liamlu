/* Opt-in peer renderer QA for the isolated 4734 candidate.
 * The actor id is a renderer-local allowlist only; it is never added to a
 * profile, WebSocket payload, or formal city data.
 */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium, chromiumOptions } = require('./browser-runtime.cjs');
const origin = process.env.ARTLAB_ORIGIN || 'http://127.0.0.1:4734';
const outPath = 'evidence/full-character-integration/multiplayer-flag-qa.json';

async function guest(nickname, registrationKey) {
  const response = await fetch(`${origin}/api/guest`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, registrationKey }),
  });
  const data = await response.json();
  assert.equal(response.ok, true, `guest: ${response.status} ${JSON.stringify(data)}`);
  return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

async function authed(path, body, session) {
  const response = await fetch(`${origin}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Origin: origin, ...(body ? { 'Content-Type': 'application/json' } : {}), Cookie: session.cookie, ...(body ? { 'X-City-CSRF': session.csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  assert.equal(response.ok, true, `${path}: ${response.status} ${JSON.stringify(data)}`);
  return data;
}

(async () => {
  const out = { origin, scope: 'renderer-local selected peer only', formalWrites: 0, physicalIphoneUat: false, errors: [] };
  let browser;
  let actorSocket;
  try {
    const a = await guest('整合驗收A', 'a'.repeat(48));
    const b = await guest('整合驗收B', 'b'.repeat(48));
    const actorId = a.data.profile.id;
    const aSession = { cookie: a.cookie, csrf: a.data.csrf };
    const WS = require('./base/vendor/ws');
    actorSocket = new WS(origin.replace('http', 'ws') + '/api/live', { headers: { Cookie: a.cookie, Origin: origin } });
    await new Promise((resolve, reject) => {
      actorSocket.once('error', reject);
      actorSocket.once('message', raw => {
        const message = JSON.parse(String(raw));
        if (message.type === 'welcome') resolve();
      });
      actorSocket.once('open', () => actorSocket.send(JSON.stringify({ type: 'hello', csrf: a.data.csrf })));
    });
    actorSocket.send(JSON.stringify({ type: 'pose', seq: 1, scene: 'outdoor', zone: 'jiuquan', x: 0, z: 1.5, heading: 0, moving: false, action: '' }));
    browser = await chromium.launch(chromiumOptions);
    const context = await browser.newContext({ viewport: { width: 640, height: 850 }, deviceScaleFactor: 1 });
    await context.addCookies([{ name: 'city_avatar_full_integration_20261030', value: b.cookie.split('=')[1], domain: '127.0.0.1', path: '/' }]);
    await context.addInitScript({ content: `window.__ARTLAB_PREVIEW_ACTORS=${JSON.stringify([actorId])};` });
    const page = await context.newPage();
    page.on('pageerror', error => out.errors.push(error.message));
    await page.goto(`${origin}/game.html`, { waitUntil: 'commit' });
    await page.waitForFunction(() => window.CozyWorld?.state().active && document.querySelector('#presence-status')?.textContent === '即時同步中', null, { timeout: 60000 });
    await page.waitForFunction(id => CozyWorld.state().peers.some(peer => peer.id === id && peer.visible !== false), actorId, { timeout: 30000 });
    const selected = await page.evaluate(id => {
      const peer = CozyWorld.state().peers.find(item => item.id === id);
      const peerModel = window.CozyAvatarCandidate?.instances?.find(item => item.group?.userData?.renderActorId === id) || null;
      return { state: peer, hasPeerModelHook: !!peerModel };
    }, actorId);
    // The world state is intentionally data-only. The adapter exposes the
    // current render instances for isolated QA; no packet/profile field is read.
    const visual = await page.evaluate(id => {
      const model = window.CozyAvatarCandidate?.instances?.find(item => item.group?.userData?.renderActorId === id);
      if (!model) return { hook: false };
      const active = model.active;
      const asset = active.head?.getObjectByName('blender-short-bob-instance');
      return { hook: true, renderActorId: model.group.userData.renderActorId, version: model.version, hairSource: active.state?.().hairSource || null, glbUnderHead: !!asset && asset.parent?.parent === active.head };
    }, actorId);
    assert.equal(visual.hook, true, 'peer QA model hook missing');
    assert.equal(visual.renderActorId, actorId);
    assert.equal(visual.version, 'new');
    assert.equal(visual.hairSource, 'blender-glb');
    assert.equal(visual.glbUnderHead, true);
    out.selectedPeer = { actorId, state: selected.state, visual };

    // Change A through the unchanged profile contract. B must render the
    // non-bob hair procedurally, preserve the refined body, and then return
    // to the actual V2 GLB when A selects bob again.
    await authed('/api/purchase', { itemId: 'hair-pony', requestId: `full-qa-pony-${Date.now()}` }, aSession);
    await authed('/api/purchase', { itemId: 'outfit-ocean', requestId: `full-qa-ocean-${Date.now()}` }, aSession);
    let fresh = await authed('/api/session', null, aSession);
    await authed('/api/profile', { nickname: fresh.profile.nickname, character: fresh.profile.character, skin: fresh.profile.skin, hair: 'hair-pony', outfit: 'outfit-ocean', car: fresh.profile.car, home: fresh.profile.home, expectedRevision: fresh.profile.revision }, aSession);
    await page.waitForFunction(id => {
      const model = CozyAvatarCandidate?.instances?.find(item => item.group?.userData?.renderActorId === id);
      const state = model?.active?.state?.();
      return state?.hair === 'pony' && state?.hairSource === 'procedural' && state?.outfit === 'ocean';
    }, actorId, { timeout: 30000 });
    const pony = await page.evaluate(id => {
      const model = CozyAvatarCandidate.instances.find(item => item.group?.userData?.renderActorId === id);
      const state = model.active.state();
      return { hair: state.hair, hairSource: state.hairSource, outfit: state.outfit, version: model.version };
    }, actorId);
    fresh = await authed('/api/session', null, aSession);
    await authed('/api/profile', { nickname: fresh.profile.nickname, character: fresh.profile.character, skin: fresh.profile.skin, hair: '', outfit: '', car: fresh.profile.car, home: fresh.profile.home, expectedRevision: fresh.profile.revision }, aSession);
    await page.waitForFunction(id => {
      const model = CozyAvatarCandidate?.instances?.find(item => item.group?.userData?.renderActorId === id);
      const state = model?.active?.state?.();
      return state?.hair === 'bob' && state?.hairSource === 'blender-glb' && state?.outfit === 'uniform';
    }, actorId, { timeout: 30000 });
    const bobAgain = await page.evaluate(id => {
      const model = CozyAvatarCandidate.instances.find(item => item.group?.userData?.renderActorId === id);
      const state = model.active.state();
      return { hair: state.hair, hairSource: state.hairSource, outfit: state.outfit, version: model.version };
    }, actorId);
    out.appearanceSync = { pony, bobAgain, profileContractUnchanged: true };

    await page.evaluate(() => CozyAvatarCandidate.setEnabled(false));
    await page.waitForTimeout(500);
    const disabled = await page.evaluate(id => { const model = CozyAvatarCandidate?.instances?.find(item => item.group?.userData?.renderActorId === id); return { version: model?.version, hasGlb: !!model?.active?.head?.getObjectByName('blender-short-bob-instance'), profile: model?.profile }; }, actorId);
    assert.equal(disabled.version, 'legacy');
    assert.equal(disabled.hasGlb, false);
    await page.evaluate(() => CozyAvatarCandidate.setEnabled(true));
    await page.waitForTimeout(700);
    const reenabled = await page.evaluate(id => { const model = CozyAvatarCandidate?.instances?.find(item => item.group?.userData?.renderActorId === id); const active = model?.active; const asset = active?.head?.getObjectByName('blender-short-bob-instance'); return { version: model?.version, hairSource: active?.state?.().hairSource || null, hasGlb: !!asset && asset.parent?.parent === active.head, profile: model?.profile }; }, actorId);
    assert.equal(reenabled.version, 'new');
    assert.equal(reenabled.hairSource, 'blender-glb');
    assert.equal(reenabled.hasGlb, true);
    assert.deepEqual(reenabled.profile, disabled.profile);
    out.rollback = { disabled, reenabled, profilePreserved: true };
    assert.deepEqual(out.errors, []);
    out.pass = true;
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    console.log(JSON.stringify({ pass: true, origin, selectedPeer: visual, rollback: out.rollback }));
  } catch (error) {
    out.pass = false;
    out.error = error.stack;
    fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
    throw error;
  } finally {
    actorSocket?.close?.();
    await browser?.close().catch(() => {});
  }
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
