import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

const GAS_URL = process.env.PATROL_GAS_URL || '';
const WRONG_KEY = `invalid-${crypto.randomUUID()}`;
const skip = GAS_URL ? false : 'set PATROL_GAS_URL to the deployed Web App URL';

async function get(action, params = {}) {
  const url = new URL(GAS_URL);
  url.searchParams.set('action', action);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { cache: 'no-store' });
  return response.json();
}

async function post(payload) {
  const response = await fetch(GAS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  return response.json();
}

function assertUnauthorized(result, label) {
  assert.deepEqual(
    { status: result.status, message: result.message },
    { status: 'error', message: 'unauthorized' },
    label,
  );
}

test('public ping and pthealth disclose no protected data', { skip }, async () => {
  assert.equal((await get('ping')).status, 'ok');
  const health = await get('pthealth');
  assert.equal(health.status, 'ok');
  assert.equal(typeof health.configured, 'boolean');
  assert.equal(health.contract, 'patrol-auth-v3');
  for (const forbidden of ['key', 'PT_KEY', 'rows', 'stores', 'schedule', 'sheets', 'headers', 'sample', 'folderId']) {
    assert.equal(Object.hasOwn(health, forbidden), false, `pthealth leaked ${forbidden}`);
  }
});

test('debug is absent from the isolated Patrol route surface', { skip }, async () => {
  for (const result of [await get('debug'), await get('debug', { key: WRONG_KEY })]) {
    assert.deepEqual(
      { status: result.status, message: result.message },
      { status: 'error', message: 'unknown patrol action' },
    );
  }
});

for (const action of ['ptread', 'ptsummary', 'ptdetail', 'ptvisit_read', 'sread', 'hread']) {
  test(`${action} rejects missing and incorrect credentials`, { skip }, async () => {
    assertUnauthorized(await get(action), `${action} missing credential`);
    assertUnauthorized(await get(action, { key: WRONG_KEY }), `${action} incorrect key`);
  });
}

test('ptvisit_write rejects missing and incorrect short-session tokens', { skip }, async () => {
  assertUnauthorized(await post({ action:'ptvisit_write', visitAction:'arrival', store:'台北通化' }), 'ptvisit_write missing token');
  assertUnauthorized(await post({ action:'ptvisit_write', token:WRONG_KEY, visitAction:'arrival', store:'台北通化' }), 'ptvisit_write incorrect token');
});

test('ptmileage rejects missing and incorrect short-session tokens', { skip }, async () => {
  assertUnauthorized(await post({ action:'ptmileage', month:'2026-08', page:1, limit:500 }), 'ptmileage missing token');
  assertUnauthorized(await post({ action:'ptmileage', token:WRONG_KEY, month:'2026-08', page:1, limit:500 }), 'ptmileage incorrect token');
});

for (const action of ['ptwrite', 'hwrite']) {
  test(`${action} rejects before parsing or writing`, { skip }, async () => {
    const invalidPayload = '{this-is-not-json';
    assertUnauthorized(await get(action, { payload: invalidPayload }), `${action} missing credential`);
    assertUnauthorized(await get(action, { key: WRONG_KEY, payload: invalidPayload }), `${action} incorrect key`);
  });
}

test('half_media_upload rejects missing and incorrect credentials before file handling', { skip }, async () => {
  assertUnauthorized(await post({ action: 'half_media_upload' }), 'media missing credential');
  assertUnauthorized(await post({ action: 'half_media_upload', key: WRONG_KEY }), 'media incorrect key');
});
