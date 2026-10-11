'use strict';

const { test, expect } = require('@playwright/test');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PORTAL = path.join(ROOT, 'portal-logout.js');
const GAS_B_CLIENT = path.join(ROOT, 'GasBClient.js');
const ORIGIN = 'https://epoch.test';
const B_API = 'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
const B_KEY = 'north12b_password_session_v1';
const DEVICE_KEY = 'north12b_private_dashboard_device_id';
const SEEN_KEY = 'north12b_portal_logout_seen_v1';
const EVENT_KEY = 'north12b_portal_logout_event_v1';
const PT_KEY = 'bei12b_patrol_session_token_v2';
const UAT_KEY = 'bei12b_patrol_uat_session_token_v1';
const AUDIT_KEY = 'bei12b_pt_session_token';
const SEED_KEY = 'synthetic_epoch_probe_seed_v1';
const CURRENT = '00000000-0000-4000-8000-000000000001';
const OLD = '00000000-0000-4000-8000-000000000002';
const NEW = '00000000-0000-4000-8000-000000000003';

function event(id, at = Date.now() - 1000) {
  return { type: 'logout', version: 1, id, at };
}

function bSession(epoch, overrides = {}) {
  return {
    v: 1,
    owner: B_API,
    logoutEpoch: epoch,
    deviceId: 'SYNTHETIC_DEVICE',
    token: 'B1_a_' + 'a'.repeat(64),
    expiresAt: Date.now() + 15 * 60 * 1000,
    ...overrides
  };
}

async function fixture(context, { eventId = CURRENT, seen = undefined, session = bSession(eventId), storedDevice = session?.deviceId || 'SYNTHETIC_DEVICE', extraSession = {} } = {}) {
  const calls = [];
  const expiresAt = Date.now() + 15 * 60 * 1000;
  await context.route(`${ORIGIN}/**`, route => route.fulfill({
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><main id="synthetic"></main></body></html>'
  }));
  await context.route('https://script.google.com/**', async route => {
    let payload = {};
    try { payload = route.request().postDataJSON() || {}; } catch {}
    calls.push(payload.action || '');
    let body = { status: 'ok' };
    if (payload.action === 'employee_session') {
      body = { status: 'ok', expiresAt, trustSource: 'password-bound', phoneEligible: false };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  const page = await context.newPage();
  await page.addInitScript(({ B_KEY, DEVICE_KEY, SEEN_KEY, EVENT_KEY, SEED_KEY, eventValue, seenValue, sessionValue, storedDevice, extraSession }) => {
    // Portal logout reloads the document. Keep the first synthetic storage
    // setup across that reload so a cleared proof cannot be re-seeded.
    if (sessionStorage.getItem(SEED_KEY) === '1') return;
    sessionStorage.clear();
    localStorage.clear();
    sessionStorage.setItem(SEED_KEY, '1');
    localStorage.setItem(EVENT_KEY, JSON.stringify(eventValue));
    localStorage.setItem(DEVICE_KEY, storedDevice);
    if (seenValue !== undefined) sessionStorage.setItem(SEEN_KEY, seenValue);
    if (sessionValue !== null) sessionStorage.setItem(B_KEY, JSON.stringify(sessionValue));
    for (const [key, value] of Object.entries(extraSession)) sessionStorage.setItem(key, value);
  }, {
    B_KEY, DEVICE_KEY, SEEN_KEY, EVENT_KEY, SEED_KEY, eventValue: event(eventId), seenValue: seen,
    sessionValue: session, storedDevice, extraSession
  });
  await page.goto(`${ORIGIN}/fixture`);
  await page.addScriptTag({ path: GAS_B_CLIENT });
  await page.addScriptTag({ path: PORTAL });
  return { page, calls };
}

async function storage(page) {
  return page.evaluate(({ B_KEY, SEEN_KEY, PT_KEY, UAT_KEY, AUDIT_KEY }) => ({
    b: sessionStorage.getItem(B_KEY), seen: sessionStorage.getItem(SEEN_KEY),
    pt: sessionStorage.getItem(PT_KEY), uat: sessionStorage.getItem(UAT_KEY), audit: sessionStorage.getItem(AUDIT_KEY)
  }), { B_KEY, SEEN_KEY, PT_KEY, UAT_KEY, AUDIT_KEY });
}

async function safeStorage(page) {
  try { return await storage(page); } catch { return { b: '__navigating__' }; }
}

test('missing seen epoch preserves only a valid current B proof, then requires backend session validation', async ({ context }) => {
  const { page, calls } = await fixture(context, { eventId: CURRENT, seen: undefined, session: bSession(CURRENT) });
  await expect.poll(async () => (await safeStorage(page)).b).toBeTruthy();
  expect(calls).not.toContain('employee_logout');

  const result = await page.evaluate(async ({ B_API, CURRENT }) => {
    const client = createDashboardBClient(B_API, {
      storage: sessionStorage,
      logoutEpoch: () => JSON.parse(localStorage.getItem('north12b_portal_logout_event_v1') || 'null')?.id || ''
    });
    const restored = client.restore('SYNTHETIC_DEVICE');
    const validated = await client.validate();
    return { restored: Boolean(restored), status: validated.status, seen: sessionStorage.getItem('north12b_portal_logout_seen_v1'), epoch: CURRENT };
  }, { B_API, CURRENT });
  expect(result).toEqual({ restored: true, status: 'ok', seen: CURRENT, epoch: CURRENT });
  expect(calls.filter(action => action === 'employee_session')).toHaveLength(1);
});

test('missing seen epoch clears a valid but old-epoch B proof', async ({ context }) => {
  const { page, calls } = await fixture(context, { eventId: CURRENT, seen: undefined, session: bSession(OLD) });
  await expect.poll(async () => (await safeStorage(page)).b).toBeNull();
  expect(calls).toContain('employee_logout');
});

for (const [label, overrides] of [
  ['expired', { expiresAt: Date.now() - 1 }],
  ['wrong owner', { owner: 'https://synthetic.invalid/owner' }],
  ['malformed token', { token: 'SYNTHETIC_INVALID_TOKEN' }]
]) {
  test(`missing seen epoch clears same-epoch B proof with ${label} format`, async ({ context }) => {
    const { page, calls } = await fixture(context, { eventId: CURRENT, seen: undefined, session: bSession(CURRENT, overrides) });
    await expect.poll(async () => (await safeStorage(page)).b).toBeNull();
    expect(calls).not.toContain('employee_session');
  });
}

test('missing seen epoch clears same-epoch B proof when the durable device identity differs', async ({ context }) => {
  const { page, calls } = await fixture(context, {
    eventId: CURRENT,
    seen: undefined,
    session: bSession(CURRENT),
    storedDevice: 'SYNTHETIC_OTHER_DEVICE'
  });
  await expect.poll(async () => (await safeStorage(page)).b).toBeNull();
  expect(calls).not.toContain('employee_session');
});

test('a current B proof cannot preserve a page that also has an old PT/UAT/AUDIT session', async ({ context }) => {
  const { page, calls } = await fixture(context, {
    eventId: CURRENT,
    seen: undefined,
    session: bSession(CURRENT),
    extraSession: { [PT_KEY]: 'SYNTHETIC_PT', [UAT_KEY]: 'SYNTHETIC_UAT', [AUDIT_KEY]: 'SYNTHETIC_AUDIT' }
  });
  await expect.poll(async () => (await safeStorage(page)).b).toBeNull();
  const after = await storage(page);
  expect(after).toMatchObject({ b: null, pt: null, uat: null, audit: null });
  expect(calls).toContain('employee_logout');
});

test('a newly observed logout event clears an existing B session on pageshow', async ({ context }) => {
  const { page, calls } = await fixture(context, { eventId: OLD, seen: OLD, session: bSession(OLD) });
  await expect.poll(async () => (await safeStorage(page)).b).toBeTruthy();
  await page.evaluate(({ EVENT_KEY, NEW }) => {
    localStorage.setItem(EVENT_KEY, JSON.stringify({ type: 'logout', version: 1, id: NEW, at: Date.now() }));
    window.dispatchEvent(new Event('pageshow'));
  }, { EVENT_KEY, NEW });
  await expect.poll(async () => (await safeStorage(page)).b).toBeNull();
  expect(calls).toContain('employee_logout');
});
