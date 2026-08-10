const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const patrol = fs.readFileSync(path.join(__dirname, '..', 'patrol.html'), 'utf8');

function functionBody(name) {
  const start = patrol.indexOf(`function ${name}(`) !== -1
    ? patrol.indexOf(`function ${name}(`)
    : patrol.indexOf(`async function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const next = patrol.indexOf('\nfunction ', start + 1);
  return patrol.slice(start, next === -1 ? undefined : next);
}

test('expired patrol session only clears its session token and preserves local state', () => {
  const body = functionBody('openPatrolReauthModal');
  assert.match(body, /sessionStorage\.removeItem\(PT_SESSION_TOKEN_STORAGE\)/);
  assert.doesNotMatch(body, /localStorage\.(?:removeItem|clear|setItem)/);
  assert.doesNotMatch(body, /clearPatrolAuthState\(/);
  assert.match(patrol, /督導驗證已逾時，請重新驗證後繼續同步/);
});

test('all patrol transport helpers share one reauthentication wrapper and refresh PT_TOKEN for retries', () => {
  for (const helper of ['privateCloudCall', 'privateCloudCallJsonp', 'cloudCall', 'cloudCallJsonp']) {
    assert.match(functionBody(helper), /patrolRequestWithReauth\(/, `${helper} bypasses shared reauth`);
    assert.match(functionBody(helper), /url\.searchParams\.set\('token',PT_TOKEN\)/, `${helper} can retain a stale token`);
  }
  assert.match(functionBody('privateInspectionMediaUpload'), /patrolRequestWithReauth\(/);
});

test('an unauthorized response permits exactly one replay after reauthentication', () => {
  const body = functionBody('patrolRequestWithReauth');
  assert.match(body, /if\(retried\) return patrolReauthFailure\(\)/);
  assert.match(body, /patrolRequestWithReauth\(request,true\)/);
  assert.doesNotMatch(body, /patrolRequestWithReauth\(request,false\)/);
});
