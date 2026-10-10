'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Reuse the existing bounded synthetic GAS fixture without changing that
// fixture or causing its tests to run on import.
const fixturePath = path.join(__dirname, 'dashboard-password-roster-renewal.test.cjs');
const fixturePrefix = fs.readFileSync(fixturePath, 'utf8').split('\ntest(')[0];
const fixtureModule = { exports: {} };
vm.runInNewContext(fixturePrefix + '\nmodule.exports = { fixture, members, sync, rotationRequest, passwordLogin, STORES, CONFIG, ADMIN };', {
  require,
  process,
  module: fixtureModule,
  exports: fixtureModule.exports,
  __dirname: path.dirname(fixturePath),
  __filename: fixturePath,
  console,
  Buffer,
  setTimeout,
  clearTimeout
}, { filename: fixturePath });

const { fixture, members, sync, rotationRequest, passwordLogin, CONFIG, ADMIN } = fixtureModule.exports;
const PHONE_TTL = 90 * 24 * 60 * 60 * 1000;
const PRIMARY = 'SYNTH001';
const DEVICE_A = 'SYNTHETIC_OWNER_DEVICE_A';
const DEVICE_B = 'SYNTHETIC_OWNER_DEVICE_B';

function hex(ch) {
  return /^[a-f0-9]$/.test(ch) ? ch.repeat(64) : 'a'.repeat(64);
}

function makeApi(f, clock) {
  return f.ctx.privateDashboardCreateGasB_({
    mode: 'LOCAL_SYNTHETIC_ONLY',
    now: () => clock.value,
    verify: () => true
  });
}

function invoke(api, payload) {
  return api.handle(JSON.stringify(payload));
}

function assertDenied(result) {
  assert.equal(result.status, 'error');
}

function login(api, employeeId, deviceId, suffix) {
  const nonceChar = /^[a-f0-9]$/.test(suffix) ? suffix : 'a';
  return invoke(api, passwordLogin(
    employeeId,
    deviceId,
    'SYNTHETIC_PASSWORD',
    'SYNTHETIC_LOGIN_REQUEST_' + suffix,
    nonceChar
  ));
}

function enroll(api, token, deviceId, nonceChar) {
  return invoke(api, {
    action: 'employee_phone_enroll',
    deviceId,
    token,
    phoneNonce: hex(nonceChar)
  });
}

function resume(phoneToken, deviceId, suffix) {
  return {
    action: 'employee_phone_resume',
    deviceId,
    phoneToken,
    sessionNonce: hex(suffix),
    idempotencyKey: 'SYNTHETIC_RESUME_REQUEST_' + suffix
  };
}

test('primary owner enrollment and resume are device-bound and idempotent', () => {
  const started = Date.now();
  const clock = { value: started };
  const f = fixture({ clock: started });
  f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID', PRIMARY);
  const api = makeApi(f, clock);

  const loggedIn = login(api, PRIMARY, DEVICE_A, 'a');
  assert.equal(loggedIn.status, 'ok');
  const enrollment = { action: 'employee_phone_enroll', deviceId: DEVICE_A, token: loggedIn.token, phoneNonce: hex('a') };
  const first = invoke(api, enrollment);
  const second = invoke(api, enrollment);
  assert.equal(first.status, 'ok');
  assert.equal(second.status, 'ok');
  assert.equal(first.phoneToken, second.phoneToken);
  assert.equal(first.expiresAt, second.expiresAt);
  assert.equal(first.expiresAt - started, PHONE_TTL);

  const resumeRequest = resume(first.phoneToken, DEVICE_A, 'b');
  const resumed = invoke(api, resumeRequest);
  const resumedAgain = invoke(api, resumeRequest);
  assert.equal(resumed.status, 'ok');
  assert.equal(resumedAgain.status, 'ok');
  assert.equal(resumed.token, resumedAgain.token);
  assert.equal(resumed.expiresAt, resumedAgain.expiresAt);
  assert.equal(resumed.phoneExpiresAt, resumedAgain.phoneExpiresAt);
  assert.equal(invoke(api, { action: 'employee_session', token: resumed.token, deviceId: DEVICE_A }).status, 'ok');
});

test('only the primary owner may enroll; staff, extra supervisors and no-session callers are denied', () => {
  const started = Date.now();
  const clock = { value: started };
  const f = fixture({ clock: started });
  f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID', PRIMARY);
  f.props.set('DASHBOARD_AUTH_B_SUPERVISORS_V1', JSON.stringify(['SYNTH003']));
  const api = makeApi(f, clock);

  assertDenied(invoke(api, {
    action: 'employee_phone_enroll', deviceId: DEVICE_A,
    token: 'B1_a_' + 'a'.repeat(64), phoneNonce: hex('a')
  }));

  const staff = login(api, 'SYNTH002', 'SYNTHETIC_STAFF_DEVICE', 'b');
  assert.equal(staff.status, 'ok');
  assertDenied(enroll(api, staff.token, 'SYNTHETIC_STAFF_DEVICE', 'b'));

  const supervisor = login(api, 'SYNTH003', 'SYNTHETIC_SUPERVISOR_DEVICE', 'c');
  assert.equal(supervisor.status, 'ok');
  assertDenied(enroll(api, supervisor.token, 'SYNTHETIC_SUPERVISOR_DEVICE', 'c'));
});

test('wrong phone proof, second device, forget and replay denial', () => {
  const started = Date.now();
  const clock = { value: started };
  const f = fixture({ clock: started });
  f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID', PRIMARY);
  const api = makeApi(f, clock);
  const firstLogin = login(api, PRIMARY, DEVICE_A, 'd');
  const firstEnrollment = enroll(api, firstLogin.token, DEVICE_A, 'd');
  assert.equal(firstEnrollment.status, 'ok');

  assertDenied(invoke(api, resume('BP1_' + 'b'.repeat(64), DEVICE_A, 'e')));
  assertDenied(invoke(api, resume(firstEnrollment.phoneToken, DEVICE_B, 'f')));

  const secondLogin = login(api, PRIMARY, DEVICE_B, 'g');
  assert.equal(secondLogin.status, 'ok');
  assertDenied(enroll(api, secondLogin.token, DEVICE_B, 'e'));

  assert.equal(invoke(api, { action: 'employee_phone_forget', deviceId: DEVICE_A, phoneToken: firstEnrollment.phoneToken }).status, 'ok');
  assert.equal(invoke(api, { action: 'employee_phone_forget', deviceId: DEVICE_A, phoneToken: firstEnrollment.phoneToken }).status, 'ok');
  assertDenied(invoke(api, resume(firstEnrollment.phoneToken, DEVICE_A, 'h')));
});

test('admin reset removes the owner phone grant and old short session', () => {
  const started = Date.now();
  const clock = { value: started };
  const f = fixture({ clock: started });
  f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID', PRIMARY);
  const api = makeApi(f, clock);
  const loggedIn = login(api, PRIMARY, DEVICE_A, 'i');
  const enrolled = enroll(api, loggedIn.token, DEVICE_A, 'i');
  assert.equal(enrolled.status, 'ok');

  const reset = invoke(api, { action: 'employee_admin_reset_device', adminSecret: ADMIN, employeeId: PRIMARY });
  assert.equal(reset.status, 'ok');
  assertDenied(invoke(api, { action: 'employee_session', token: loggedIn.token, deviceId: DEVICE_A }));
  assertDenied(invoke(api, resume(enrolled.phoneToken, DEVICE_A, 'j')));
});

test('native revoke and inactive native row invalidate an enrolled phone', () => {
  const revokedStarted = Date.now();
  const revokedClock = { value: revokedStarted };
  const revokedFixture = fixture({ clock: revokedStarted });
  revokedFixture.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID', PRIMARY);
  const revokedApi = makeApi(revokedFixture, revokedClock);
  const revokedLogin = login(revokedApi, PRIMARY, DEVICE_A, 'k');
  const revokedEnrollment = enroll(revokedApi, revokedLogin.token, DEVICE_A, 'k');
  assert.equal(revokedEnrollment.status, 'ok');
  assert.equal(revokedFixture.ctx.privateDashboardAdminRevoke({ adminSecret: ADMIN, employeeId: PRIMARY }).revoked, true);
  assertDenied(invoke(revokedApi, resume(revokedEnrollment.phoneToken, DEVICE_A, 'l')));

  const inactiveStarted = Date.now();
  const inactiveClock = { value: inactiveStarted };
  const inactiveFixture = fixture({ clock: inactiveStarted });
  inactiveFixture.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID', PRIMARY);
  const inactiveApi = makeApi(inactiveFixture, inactiveClock);
  const inactiveLogin = login(inactiveApi, PRIMARY, DEVICE_A, 'm');
  const inactiveEnrollment = enroll(inactiveApi, inactiveLogin.token, DEVICE_A, 'm');
  assert.equal(inactiveEnrollment.status, 'ok');
  inactiveFixture.rows.DashboardUsers[1][4] = 'inactive';
  assertDenied(invoke(inactiveApi, resume(inactiveEnrollment.phoneToken, DEVICE_A, 'n')));
});

test('password epoch rotation invalidates the enrolled phone grant', () => {
  const started = Date.now();
  const clock = { value: started };
  const f = fixture({ clock: started });
  f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID', PRIMARY);
  const api = makeApi(f, clock);
  const loggedIn = login(api, PRIMARY, DEVICE_A, 'o');
  const enrolled = enroll(api, loggedIn.token, DEVICE_A, 'o');
  assert.equal(enrolled.status, 'ok');
  const epoch = JSON.parse(f.props.get(CONFIG)).epoch;
  const rotated = invoke(api, rotationRequest(epoch, {
    algorithm: 'PBKDF2-HMAC-SHA256',
    iterations: 600000,
    salt: '12'.repeat(16),
    digest: '34'.repeat(32)
  }));
  assert.equal(rotated.status, 'ok');
  assertDenied(invoke(api, resume(enrolled.phoneToken, DEVICE_A, 'p')));
});

test('expired authority denies resume until full roster renewal, then permits a new session', () => {
  const started = Date.now();
  const clock = { value: started };
  const f = fixture({ clock: started });
  f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID', PRIMARY);
  const api = makeApi(f, clock);
  const loggedIn = login(api, PRIMARY, DEVICE_A, 'q');
  const enrolled = enroll(api, loggedIn.token, DEVICE_A, 'q');
  assert.equal(enrolled.status, 'ok');

  const expired = JSON.parse(f.props.get(CONFIG));
  expired.authority.effectiveAt = started - 3600000;
  expired.authority.validUntil = started - 1;
  f.props.set(CONFIG, JSON.stringify(expired));
  assertDenied(invoke(api, resume(enrolled.phoneToken, DEVICE_A, 'r')));

  const renewed = sync(f, members());
  assert.equal(renewed.synced, 9);
  clock.value = Date.now();
  const resumed = invoke(api, resume(enrolled.phoneToken, DEVICE_A, 'r'));
  assert.equal(resumed.status, 'ok');
});

test('the same resume request can mint a new session after an authority fingerprint update', () => {
  const started = Date.now();
  const clock = { value: started };
  const f = fixture({ clock: started });
  f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID', PRIMARY);
  const api = makeApi(f, clock);
  const loggedIn = login(api, PRIMARY, DEVICE_A, 'u');
  const enrolled = enroll(api, loggedIn.token, DEVICE_A, 'u');
  assert.equal(enrolled.status, 'ok');

  const request = resume(enrolled.phoneToken, DEVICE_A, 'b');
  const first = invoke(api, request);
  assert.equal(first.status, 'ok');
  const beforeFingerprint = JSON.parse(f.props.get(CONFIG)).authority.sourceHash;

  assert.equal(sync(f, members()).synced, 9);
  clock.value = Date.now();
  const afterFingerprint = JSON.parse(f.props.get(CONFIG)).authority.sourceHash;
  assert.notEqual(afterFingerprint, beforeFingerprint);

  const second = invoke(api, request);
  assert.equal(second.status, 'ok');
  assert.notEqual(second.token, first.token);
});

test('employee logout revokes the phone grant and every short session on that device', () => {
  const started = Date.now();
  const clock = { value: started };
  const f = fixture({ clock: started });
  f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID', PRIMARY);
  const api = makeApi(f, clock);
  const loggedIn = login(api, PRIMARY, DEVICE_A, 'v');
  const enrolled = enroll(api, loggedIn.token, DEVICE_A, 'v');
  assert.equal(enrolled.status, 'ok');

  const first = invoke(api, resume(enrolled.phoneToken, DEVICE_A, 'c'));
  const second = invoke(api, resume(enrolled.phoneToken, DEVICE_A, 'd'));
  assert.equal(first.status, 'ok');
  assert.equal(second.status, 'ok');

  const logout = invoke(api, { action: 'employee_logout', deviceId: DEVICE_A, token: loggedIn.token });
  assert.equal(logout.status, 'ok');
  for (const token of [loggedIn.token, first.token, second.token]) {
    assertDenied(invoke(api, { action: 'employee_session', token, deviceId: DEVICE_A }));
  }
  assertDenied(invoke(api, resume(enrolled.phoneToken, DEVICE_A, 'e')));
});

test('owner phone grant expires after 90 days', () => {
  const started = Date.now();
  const clock = { value: started };
  const f = fixture({ clock: started });
  f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID', PRIMARY);
  const api = makeApi(f, clock);
  const loggedIn = login(api, PRIMARY, DEVICE_A, 's');
  const enrolled = enroll(api, loggedIn.token, DEVICE_A, 's');
  assert.equal(enrolled.status, 'ok');
  assert.equal(enrolled.expiresAt, started + PHONE_TTL);
  clock.value = enrolled.expiresAt;
  assertDenied(invoke(api, resume(enrolled.phoneToken, DEVICE_A, 't')));
});
