'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const OWNER = 'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
const CLIENT_SOURCE = fs.readFileSync(path.join(__dirname, '../GasBClient.js'), 'utf8');

function makeStorage() {
  const data = new Map();
  return {
    data,
    getItem: key => data.get(key) || null,
    setItem: (key, value) => data.set(key, value),
    removeItem: key => data.delete(key),
  };
}

function makeChallenge(expiresAt) {
  return {
    challengeId: 'c'.repeat(32),
    nonceHash: 'd'.repeat(64),
    audience: 'north12b-city-formal-login',
    expiresAt,
    worldId: 'current-guests',
  };
}

function fixture({ gasNow, cityNow, response } = {}) {
  const base = gasNow ?? (Date.now() - 10 * 24 * 60 * 60 * 1_000);
  const cityClock = cityNow ?? base + 5 * 60 * 1_000;
  const storage = makeStorage();
  const calls = [];
  const deviceId = 'SYNTHETIC_CITY_DEVICE';
  const token = 'B1_a_' + 'b'.repeat(64);
  const ctx = vm.createContext({
    crypto: crypto.webcrypto,
    Date,
    AbortController,
    setTimeout,
    clearTimeout,
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, body });
      const value = typeof response === 'function' ? response(body, { base, cityClock }) : response;
      return { ok: true, json: async () => value || {
        status: 'ok',
        schema: 'city-employee-handoff/v1',
        challengeId: body.challengeId,
        code: 'CH1_' + 'a'.repeat(64),
        // CityEmployeeBridge creates the challenge with the city clock, but
        // the handoff response code is issued by GAS's verified time source.
        expiresAt: base + 30_000,
      } };
    },
  });
  vm.runInContext(CLIENT_SOURCE, ctx, { filename: 'GasBClient.js' });
  const api = ctx.createDashboardBClient(OWNER, {
    storage,
    now: () => base,
    cityNow: () => cityClock,
  });
  storage.setItem('north12b_password_session_v1', JSON.stringify({
    v: 1,
    owner: OWNER,
    logoutEpoch: '',
    deviceId,
    token,
    // This lease is still valid under GAS time, but already expired under
    // the intentionally five-minutes-ahead city invite clock.
    expiresAt: base + 2 * 60 * 1_000,
  }));
  return { api, calls, storage, base, cityClock, deviceId, token };
}

test('GAS clock 與城市 clock 相差五分鐘時，handoff 仍分別驗證 session 與城市挑戰', async () => {
  const f = fixture();
  f.api.restore(f.deviceId);
  const result = await f.api.issueCityHandoff(makeChallenge(f.cityClock + 60_000));

  assert.equal(result.schema, 'city-employee-handoff/v1');
  assert.equal(result.challengeId, 'c'.repeat(32));
  assert.equal(result.expiresAt, f.base + 30_000);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, OWNER);
  assert.equal(f.calls[0].body.deviceId, f.deviceId);
  assert.equal(f.calls[0].body.token, f.token);
});

test('過期 nonce/challenge 由 cityNow 拒絕，且不觸發 GAS handoff request', async () => {
  const f = fixture();
  f.api.restore(f.deviceId);
  await assert.rejects(
    f.api.issueCityHandoff(makeChallenge(f.cityClock - 1)),
    /CITY_CHALLENGE_INVALID/,
  );
  assert.equal(f.calls.length, 0);
});

test('過期 code 由 GAS now 拒絕，不因城市 clock 尚未過期而放行', async () => {
  const f = fixture({
    response: (body, clocks) => ({
      status: 'ok',
      schema: 'city-employee-handoff/v1',
      challengeId: body.challengeId,
      code: 'CH1_' + 'a'.repeat(64),
      expiresAt: clocks.base - 1,
    }),
  });
  f.api.restore(f.deviceId);
  await assert.rejects(
    f.api.issueCityHandoff(makeChallenge(f.cityClock + 60_000)),
    /CITY_HANDOFF_INVALID/,
  );
  assert.equal(f.calls.length, 1);
});

test('既有 device/token/source checks 保留，不因雙時鐘選項放寬', async () => {
  const wrongDevice = fixture();
  wrongDevice.storage.setItem('north12b_password_session_v1', JSON.stringify({
    v: 1,
    owner: OWNER,
    logoutEpoch: '',
    deviceId: 'OTHER_DEVICE',
    token: wrongDevice.token,
    expiresAt: wrongDevice.base + 10 * 60 * 1_000,
  }));
  assert.equal(wrongDevice.api.restore(wrongDevice.deviceId), null);
  await assert.rejects(wrongDevice.api.issueCityHandoff(makeChallenge(wrongDevice.cityClock + 60_000)), /B_AUTH_DENIED/);
  assert.equal(wrongDevice.calls.length, 0);

  const wrongSource = fixture({
    response: (body, clocks) => body.action === 'employee_login'
      ? {
        status: 'ok',
        token: 'B1_a_' + 'c'.repeat(64),
        expiresAt: clocks.base + 60_000,
        trustSource: 'phone-bound',
      }
      : undefined,
  });
  wrongSource.storage.removeItem('north12b_password_session_v1');
  await assert.rejects(
    wrongSource.api.login('E-SYNTHETIC', wrongSource.deviceId, 'synthetic-only-password'),
    /B_AUTH_DENIED/,
  );
  assert.equal(wrongSource.calls[0].body.deviceId, wrongSource.deviceId);
});
