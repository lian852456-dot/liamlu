'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const UI = require('../city-employee-link.js');
const VERIFIED_FORMAL_ORIGIN = 'https://lian852456-dot.github.io';
const VERIFIED_FORMAL_PATH = '/liamlu/city-employee-link.html';

class EventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    const list = this.listeners.get(type) || [];
    list.push(handler);
    this.listeners.set(type, list);
  }
  removeEventListener(type, handler) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== handler));
  }
  dispatchEvent(event) {
    event.target = this;
    for (const handler of [...(this.listeners.get(event.type) || [])]) handler(event);
  }
}

class Element extends EventTarget {
  constructor(id = '') {
    super();
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.dataset = {};
    this.attributes = {};
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
}

class Document {
  constructor() {
    this.title = '綁定目前城市角色';
    this.nodes = new Map();
    this.body = new Element('body');
  }
  add(id) {
    const node = new Element(id);
    this.nodes.set(id, node);
    return node;
  }
  getElementById(id) { return this.nodes.get(id) || null; }
}

function makeDocument() {
  const doc = new Document();
  ['employee-link-app', 'employee-link-status', 'employee-link-handoff-status',
    'employee-link-login-form', 'employee-link-employee-id', 'employee-link-password',
    'employee-link-login-submit', 'employee-link-handoff-submit'].forEach(id => doc.add(id));
  return doc;
}

function encodeChallenge(challenge) {
  return encodeURIComponent(JSON.stringify(challenge));
}

function makeWindow(hash, doc, { origin = UI.FORMAL_ORIGIN, opener = null } = {}) {
  const events = new EventTarget();
  const messages = [];
  const actualOpener = opener || { postMessage(payload, targetOrigin) { messages.push({ payload, targetOrigin }); } };
  const win = {
    document: doc,
    location: { origin, hash, pathname: VERIFIED_FORMAL_PATH, search: '' },
    history: { replaceState(_state, _title, url) { win.replacedUrl = url; win.location.hash = ''; } },
    opener: actualOpener,
    addEventListener: events.addEventListener.bind(events),
    removeEventListener: events.removeEventListener.bind(events),
    dispatchEvent: events.dispatchEvent.bind(events),
    messages,
  };
  return win;
}

function validChallenge(overrides = {}) {
  return {
    challengeId: 'Q2hhbGxlbmdlX2lkXzEyMzQ1Njc4',
    nonceHash: 'a'.repeat(64),
    audience: UI.AUDIENCE,
    expiresAt: 1_700_000_060_000,
    worldId: 'current-guests',
    ...overrides,
  };
}

test('rejects raw nonce, role UID, expired and malformed fragment without clearing into a return URL', () => {
  const now = 1_700_000_000_000;
  for (const challenge of [
    validChallenge({ nonce: 'b'.repeat(43) }),
    validChallenge({ roleUID: 'role-secret' }),
    validChallenge({ expiresAt: now - 1 }),
    validChallenge({ nonceHash: 'not-a-hash' }),
  ]) {
    const parsed = UI.parseChallengeHash(`#cityChallenge=${encodeChallenge(challenge)}`, now);
    assert.equal(parsed.ok, false);
  }
  const parsed = UI.parseChallengeHash('#https%3A%2F%2Fevil.example%2F%3FreturnUrl%3Dformal', now);
  assert.equal(parsed.ok, false);
  assert.equal(UI.parseChallengeHash(`#${encodeChallenge(validChallenge({ expiresAt: now + UI.MAX_CHALLENGE_TTL_MS + 1 }))}`, now).error, 'CITY_CHALLENGE_EXPIRY_INVALID');
});

test('pins the verified formal origin and /liamlu/ path instead of accepting lookalikes', async () => {
  assert.equal(UI.FORMAL_ORIGIN, VERIFIED_FORMAL_ORIGIN);
  assert.equal(UI.FORMAL_PATH_PREFIX, '/liamlu/');
  const wrongPathDoc = makeDocument();
  const wrongPathWindow = makeWindow(`#${encodeChallenge(validChallenge())}`, wrongPathDoc, { origin: VERIFIED_FORMAL_ORIGIN });
  wrongPathWindow.location.pathname = '/formal-gold/employee-link-review/city-employee-link.html';
  const wrongPathUI = UI.create({ window: wrongPathWindow, document: wrongPathDoc, now: () => 1_700_000_000_000 });
  await wrongPathUI.ready;
  assert.equal(wrongPathUI.state.originOk, false);
  assert.equal(wrongPathDoc.getElementById('employee-link-login-submit').disabled, true);
});

test('fails closed when formal origin, opener or adapter is unavailable', async () => {
  const challenge = validChallenge();
  const noOrigin = makeWindow(`#${encodeChallenge(challenge)}`, makeDocument(), { origin: 'https://evil.example' });
  const noOriginUI = UI.create({ window: noOrigin, document: noOrigin.document, now: () => 1_700_000_000_000 });
  await noOriginUI.ready;
  assert.equal(noOriginUI.state.originOk, false);
  assert.equal(noOrigin.document.getElementById('employee-link-login-submit').disabled, true);
  assert.equal(noOrigin.replacedUrl.includes('#'), false);

  const missingAdapterDoc = makeDocument();
  const missingAdapter = makeWindow(`#${encodeChallenge(challenge)}`, missingAdapterDoc);
  const owner = {
    deviceId: 'device-QA-123456',
    async restore() {},
    async session() { return { token: 'B1_original-token-must-not-leave' }; },
    async login() {},
  };
  const missingAdapterUI = UI.create({ window: missingAdapter, document: missingAdapterDoc, ownerClient: owner, now: () => 1_700_000_000_000 });
  await missingAdapterUI.ready;
  assert.equal(missingAdapterUI.state.authenticated, true);
  assert.equal(missingAdapterUI.state.handoffEnabled, false);
  assert.match(missingAdapterDoc.getElementById('employee-link-status').textContent, /尚未啟用/);
  assert.equal(missingAdapterDoc.getElementById('employee-link-handoff-submit').disabled, true);
});

test('requires manual formal login, then sends only a one-time code to the exact city origin', async () => {
  const challenge = validChallenge({ worldId: 'legacy-owners' });
  const doc = makeDocument();
  const win = makeWindow(`#cityChallenge=${encodeChallenge(challenge)}`, doc);
  const calls = [];
  let currentSession = null;
  const ownerClient = {
    deviceId: 'device-QA-987654',
    async restore(deviceId) { calls.push(['restore', deviceId]); },
    async session(deviceId) { calls.push(['session', deviceId]); return currentSession; },
    async login(input) {
      calls.push(['login', input]);
      currentSession = { token: 'B1_original-token-must-not-leave', expiresAt: 1_900_000_000_000 };
      return currentSession;
    },
  };
  let issuedChallenge = null;
  const ui = UI.create({
    window: win,
    document: doc,
    ownerClient,
    issueCityHandoff: async incoming => {
      issuedChallenge = incoming;
      return { code: `CH1_${'d'.repeat(64)}` };
    },
    now: () => 1_700_000_000_000,
  });
  await ui.ready;
  assert.deepEqual(calls, [['restore', ownerClient.deviceId], ['session', ownerClient.deviceId]]);
  assert.equal(ui.state.authenticated, false);
  assert.equal(doc.getElementById('employee-link-handoff-submit').disabled, true);

  doc.getElementById('employee-link-employee-id').value = 'E123456';
  doc.getElementById('employee-link-password').value = 'qa-password-only';
  await ui.login();
  assert.equal(ui.state.authenticated, true);
  assert.equal(doc.getElementById('employee-link-password').value, '');
  assert.deepEqual(calls.slice(-2), [
    ['login', { employeeId: 'E123456', deviceId: ownerClient.deviceId, password: 'qa-password-only' }],
    ['session', ownerClient.deviceId],
  ]);

  await ui.handoff();
  assert.deepEqual(issuedChallenge, challenge);
  assert.equal(Object.prototype.hasOwnProperty.call(issuedChallenge, 'nonce'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(issuedChallenge, 'roleUID'), false);
  assert.equal(win.messages.length, 1);
  assert.deepEqual(Object.keys(win.messages[0].payload).sort(), ['challengeId', 'code', 'type']);
  assert.deepEqual(win.messages[0].payload, {
    type: UI.HANDOFF_TYPE,
    challengeId: challenge.challengeId,
    code: `CH1_${'d'.repeat(64)}`,
  });
  assert.equal(win.messages[0].targetOrigin, UI.CITY_ORIGIN);
  assert.equal(JSON.stringify(win.messages[0].payload).includes('B1_original-token'), false);
  assert.equal(JSON.stringify(win.messages[0].payload).includes(ownerClient.deviceId), false);
  assert.equal(ui.state.sent, true);
  await ui.handoff();
  assert.equal(win.messages.length, 1);
});

test('rejects a non-CH1 handoff response rather than posting arbitrary text', async () => {
  const doc = makeDocument();
  const win = makeWindow(`#${encodeChallenge(validChallenge())}`, doc);
  const ownerClient = {
    deviceId: 'device-QA-222222',
    async restore() {},
    async session() { return { token: 'B1_private' }; },
    async login() {},
  };
  const ui = UI.create({
    window: win,
    document: doc,
    ownerClient,
    issueCityHandoff: async () => ({ code: 'not-a-city-lease' }),
    now: () => 1_700_000_000_000,
  });
  await ui.ready;
  await ui.handoff();
  assert.equal(win.messages.length, 0);
  assert.match(doc.getElementById('employee-link-handoff-status').textContent, /不符合/);
});

test('ignores forged city acknowledgements unless origin and opener source both match', async () => {
  const doc = makeDocument();
  const win = makeWindow(`#${encodeChallenge(validChallenge())}`, doc);
  const ownerClient = {
    deviceId: 'device-QA-111111',
    async restore() {},
    async session() { return { token: 'B1_private' }; },
  };
  const ui = UI.create({ window: win, document: doc, ownerClient, issueCityHandoff: async () => ({ code: 'once' }), now: () => 1_700_000_000_000 });
  await ui.ready;
  const before = doc.getElementById('employee-link-handoff-status').textContent;
  win.dispatchEvent({ type: 'message', origin: UI.CITY_ORIGIN, source: {}, data: { type: 'city-employee-handoff/ack/v1', challengeId: ui.state.challenge.challengeId } });
  win.dispatchEvent({ type: 'message', origin: 'https://evil.example', source: win.opener, data: { type: 'city-employee-handoff/ack/v1', challengeId: ui.state.challenge.challengeId } });
  assert.equal(doc.getElementById('employee-link-handoff-status').textContent, before);
  win.dispatchEvent({ type: 'message', origin: UI.CITY_ORIGIN, source: win.opener, data: { type: 'city-employee-handoff/ack/v1', challengeId: ui.state.challenge.challengeId } });
  assert.match(doc.getElementById('employee-link-handoff-status').textContent, /已收到/);
});

test('candidate HTML keeps the handoff boundary explicit and never opts into noopener or arbitrary return URLs', () => {
  const html = fs.readFileSync(path.join(__dirname, '../city-employee-link.html'), 'utf8');
  assert.match(html, /city-employee-link\.js/);
  assert.match(html, /city-employee-link-bootstrap\.js/);
  assert.match(html, new RegExp(VERIFIED_FORMAL_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /city-formal-path-prefix" content="\/liamlu\//);
  assert.doesNotMatch(html, /noopener/i);
  assert.doesNotMatch(html, /returnUrl/i);
  assert.match(html, /city-employee-link\.js/);
});


test('clock synchronization clears the fragment first and fails closed before any credentials are used',async()=>{
  const doc=makeDocument(),win=makeWindow('#cityChallenge='+encodeChallenge(validChallenge()),doc);let credentials=0;
  const ui=UI.create({window:win,document:doc,ownerClient:{restore(){credentials++;},session(){credentials++;},login(){credentials++;}},now:()=>1700000000000,
    syncClock:async id=>{assert.equal(id,validChallenge().challengeId);assert.equal(win.location.hash,'');throw Error('CLOCK_UNAVAILABLE');}});
  await ui.ready;assert.equal(credentials,0);assert.equal(ui.state.challenge,null);
  assert.equal(doc.getElementById('employee-link-login-submit').disabled,true);
  assert.match(doc.getElementById('employee-link-status').textContent,/核對伺服器時間/);
});
