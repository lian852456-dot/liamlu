'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
const sessionSource = source.slice(
  source.indexOf('const PATROL_SESSION_TTL_SECONDS'),
  source.indexOf("const PATROL_SHEET = '巡店明細'")
);

function runtime() {
  const properties = new Map([['PT_KEY', 'test-passcode']]);
  const cache = new Map();
  const logs = [];
  let now = 1_787_000_000;
  let uuid = 0;
  const blob = data => {
    const bytes = Buffer.isBuffer(data) ? data : Array.isArray(data) ? Buffer.from(data.map(value => value < 0 ? value + 256 : value)) : Buffer.from(String(data));
    return { getBytes:() => [...bytes], getDataAsString:() => bytes.toString('utf8') };
  };
  const context = vm.createContext({
    console,
    Date,
    PropertiesService:{getScriptProperties:() => ({
      getProperty:key => properties.get(key) || null,
      setProperty:(key, value) => { properties.set(key, String(value)); }
    })},
    CacheService:{getScriptCache:() => ({
      get:key => cache.get(key) || null,
      put:(key, value) => { cache.set(key, String(value)); },
      remove:key => cache.delete(key)
    })},
    LockService:{getScriptLock:() => ({waitLock:() => {}, releaseLock:() => {}})},
    Logger:{log:value => logs.push(String(value))},
    Utilities:{
      DigestAlgorithm:{SHA_256:'sha256'},
      computeDigest:(_algorithm, value) => [...crypto.createHash('sha256').update(String(value)).digest()],
      computeHmacSha256Signature:(value, key) => [...crypto.createHmac('sha256', String(key)).update(String(value)).digest()],
      base64EncodeWebSafe:value => Buffer.from(value.map ? value.map(byte => byte < 0 ? byte + 256 : byte) : value).toString('base64url'),
      base64DecodeWebSafe:value => [...Buffer.from(String(value), 'base64url')],
      newBlob:blob,
      getUuid:() => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`
    }
  });
  vm.runInContext(sessionSource, context);
  context.ptSessionNowSeconds_ = () => now;
  context.patrolSummaryMonth_ = month => String(month || '');
  context.readPatrolSummary_ = month => ({month, visitCount:18});
  context.readPatrolDetail_ = options => ({status:'ok', ...options, rows:[]});
  return {context, properties, cache, logs, setNow:value => { now = value; }, getNow:() => now};
}

function authReason(fn) {
  try { fn(); }
  catch (error) { return error.authReason; }
  assert.fail('expected an auth error');
}

test('signed session survives cache loss and immediately authorizes summary plus nine detail reads', () => {
  const env = runtime();
  const auth = env.context.ptAuthenticatePayload({key:'test-passcode'});
  assert.equal(auth.sessionContract, 'patrol-session-v2');
  env.cache.clear();
  assert.equal(env.context.ptSummaryPostPayload_({token:auth.token, month:'2026-08'}).summary.visitCount, 18);
  for (let index = 0; index < 9; index++) {
    assert.equal(env.context.ptDetailPostPayload_({token:auth.token, month:'2026-08', store:`store-${index}`, page:1, limit:100}).status, 'ok');
  }
  assert.ok(env.logs.some(line => line.includes('AUTH_CACHE_MISS')));
});

test('legal session remains valid for five minutes and is restored without rotation', () => {
  const env = runtime();
  const auth = env.context.ptAuthenticatePayload({key:'test-passcode'});
  env.setNow(env.getNow() + 300);
  const restored = env.context.ptAuthenticatePayload({token:auth.token});
  assert.equal(restored.token, auth.token);
  assert.equal(restored.expiresIn, 1500);
});

test('missing, malformed, legacy cache miss, expiry, revocation and deployment mismatch are distinct', () => {
  const env = runtime();
  assert.equal(authReason(() => env.context.ptRequireSession_('', 'ptsummary')), 'AUTH_TOKEN_MISSING');
  assert.equal(authReason(() => env.context.ptRequireSession_('bad token', 'ptsummary')), 'AUTH_TOKEN_INVALID');
  assert.equal(authReason(() => env.context.ptRequireSession_('a'.repeat(32), 'ptsummary')), 'AUTH_SESSION_NOT_FOUND');

  const expiring = env.context.ptAuthenticatePayload({key:'test-passcode'});
  env.setNow(env.getNow() + 1800);
  assert.equal(authReason(() => env.context.ptRequireSession_(expiring.token, 'ptsummary')), 'AUTH_SESSION_EXPIRED');

  const revokedEnv = runtime();
  const revoked = revokedEnv.context.ptAuthenticatePayload({key:'test-passcode'});
  revokedEnv.context.ptLogoutPayload({token:revoked.token});
  assert.equal(authReason(() => revokedEnv.context.ptRequireSession_(revoked.token, 'ptdetail')), 'AUTH_SESSION_REVOKED');

  const mismatchEnv = runtime();
  const issued = mismatchEnv.context.ptAuthenticatePayload({key:'test-passcode'});
  const claims = JSON.parse(mismatchEnv.context.ptBase64UrlDecodeText_(issued.token.split('.')[0]));
  claims.aud = 'different-formal-deployment';
  const payload = mismatchEnv.context.ptBase64UrlEncode_(mismatchEnv.context.Utilities.newBlob(JSON.stringify(claims)).getBytes());
  const mismatch = `${payload}.${mismatchEnv.context.ptSessionSignature_(payload)}`;
  assert.equal(authReason(() => mismatchEnv.context.ptRequireSession_(mismatch, 'ptsummary')), 'AUTH_DEPLOYMENT_MISMATCH');
});

test('auth error payload is diagnostic and never echoes the token', () => {
  const env = runtime();
  const token = 'a'.repeat(32);
  let error;
  try { env.context.ptRequireSession_(token, 'ptsummary'); } catch (caught) { error = caught; }
  const response = env.context.ptAuthErrorPayload_(error, 'ptsummary', token);
  assert.equal(response.reason, 'AUTH_SESSION_NOT_FOUND');
  assert.equal(response.auth.action, 'ptsummary');
  assert.equal(response.auth.tokenPresent, true);
  assert.equal(JSON.stringify(response).includes(token), false);
});
