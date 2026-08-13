const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const gasSource = fs.readFileSync(path.join(root, 'gas', 'Code.gs'), 'utf8');
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function loadGas() {
  const properties = new Map([
    ['NOTIFY_EMAIL', 'disabled@example.invalid'],
    ['PT_KEY', 'existing-website-passcode'],
    ['PATROL_DEVICE_ASSERTION_SECRET', 'test-only-shared-secret-with-at-least-32-bytes']
  ]);
  const cache = new Map();
  const cacheService = { get:key => cache.get(key) || null, put:(key,value) => cache.set(key,value), remove:key => cache.delete(key) };
  const context = vm.createContext({
    console,
    PropertiesService:{ getScriptProperties:() => ({ getProperty:key => properties.get(key) || '' }) },
    CacheService:{ getScriptCache:() => cacheService },
    LockService:{ getScriptLock:() => ({ waitLock() {}, releaseLock() {} }) },
    Utilities:{
      Charset:{ UTF_8:'UTF-8' }, DigestAlgorithm:{ SHA_256:'SHA_256' },
      getUuid:() => crypto.randomUUID(),
      base64EncodeWebSafe:value => Buffer.from(Array.isArray(value) ? value : String(value)).toString('base64url'),
      base64DecodeWebSafe:value => [...Buffer.from(String(value), 'base64url')],
      newBlob:value => ({ getDataAsString:() => Buffer.from(value).toString('utf8') }),
      computeHmacSha256Signature:(value,secret) => [...crypto.createHmac('sha256',secret).update(String(value)).digest()],
      computeDigest:(_algorithm,value) => [...crypto.createHash('sha256').update(String(value)).digest()],
      formatDate:() => ''
    }
  });
  vm.runInContext(gasSource, context);
  return { context, properties };
}

function approvedLookup(deviceId = 'approved-device-1234567890') {
  return { user:{ status:'active', device_id:deviceId } };
}

test('approved device receives a one-time assertion and the existing short patrol session', () => {
  const { context } = loadGas();
  context.privateDashboardUserByEmployeeId = () => approvedLookup();
  const credential = { employeeId:'EMP001', deviceId:'approved-device-1234567890' };
  const issued = context.privateDashboardPatrolAssertion(credential);
  assert.equal(typeof issued.assertion, 'string');
  assert.equal(issued.expiresIn, 60);
  const session = context.ptAuthenticateDevicePayload({ ...credential, assertion:issued.assertion });
  assert.match(session.token, /^[A-Za-z0-9]{20,160}$/);
  assert.equal(session.expiresIn, 1800);
  assert.throws(() => context.ptAuthenticateDevicePayload({ ...credential, assertion:issued.assertion }), /replayed/);
});

test('revoked, random, mismatched, and expired device assertions fail closed', () => {
  const { context } = loadGas();
  const credential = { employeeId:'EMP001', deviceId:'approved-device-1234567890' };
  context.privateDashboardUserByEmployeeId = () => approvedLookup('different-device-1234567890');
  assert.throws(() => context.privateDashboardPatrolAssertion(credential), /尚未核准/);

  context.privateDashboardUserByEmployeeId = () => approvedLookup();
  const issued = context.privateDashboardPatrolAssertion(credential);
  assert.throws(() => context.ptAuthenticateDevicePayload({ ...credential, deviceId:'random-device-123456789012', assertion:issued.assertion }), /mismatch/);
  assert.throws(() => context.ptAuthenticateDevicePayload({ ...credential, employeeId:'EMP002', assertion:issued.assertion }), /mismatch/);

  const now = Math.floor(Date.now() / 1000);
  const claims = { v:1, aud:'liam-supervisor-patrol', employeeId:credential.employeeId, deviceId:credential.deviceId, iat:now - 120, exp:now - 60, nonce:crypto.randomUUID() };
  const encoded = context.patrolDeviceBase64Url_(JSON.stringify(claims));
  const expired = `${encoded}.${context.patrolDeviceSign_(encoded)}`;
  assert.throws(() => context.ptAuthenticateDevicePayload({ ...credential, assertion:expired }), /expired/);
});

test('website passcode behavior is unchanged and App never stores a passcode', () => {
  const { context } = loadGas();
  const session = context.ptAuthenticatePayload({ key:'existing-website-passcode' });
  assert.equal(session.expiresIn, 1800);
  assert.throws(() => context.ptAuthenticatePayload({ key:'wrong' }), /unauthorized/);
  assert.match(appSource, /NATIVE_MODE/);
  assert.match(appSource, /private_patrol_assertion/);
  assert.match(appSource, /ptauth_device/);
  assert.match(appSource, /dom\('#patrolAccessForm'\)\.hidden=true/);
  assert.doesNotMatch(appSource, /localStorage\.setItem\([^\n]*passcode/i);
  assert.doesNotMatch(appSource, /sessionStorage\.setItem\([^\n]*passcode/i);
});

test('device bridge uses POST bodies and does not accept client approved flags', () => {
  assert.match(appSource, /postDeviceAccess\(\{action:'private_patrol_assertion',\.\.\.credential\}\)/);
  assert.match(appSource, /postPatrolAuth\(\{action:'ptauth_device',assertion,\.\.\.credential\}\)/);
  assert.doesNotMatch(appSource, /approved\s*:\s*true/);
  assert.doesNotMatch(appSource, /private_patrol_assertion[^\n]*\?/);
  assert.match(gasSource, /lookup\.user\.device_id !== deviceId/);
  assert.match(gasSource, /trusted-employee convenience path[\s\S]*not accepted here/);
});
