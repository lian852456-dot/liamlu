const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'gas/Code.gs'), 'utf8');
const media = fs.readFileSync(path.join(root, 'gas/HalfMedia.gs'), 'utf8');

const protectedActions = ['debug', 'ptread', 'ptwrite', 'sread', 'hread', 'hwrite'];

test('PT_KEY comes only from Script Properties and fails closed when absent', () => {
  assert.match(code, /getScriptProperties\(\)\.getProperty\('PT_KEY'\)/);
  assert.doesNotMatch(code, /const PT_KEY\s*=/);
  assert.match(code, /configured:\s*Boolean\(ptConfiguredKey_\(\)\)/);
});

test('every protected patrol GET action checks ptAuthorized before data access', () => {
  for (const action of protectedActions) {
    const branch = code.match(new RegExp(`if \\(action === '${action}'\\) \\{([\\s\\S]*?)\\n  \\}`));
    assert.ok(branch, `missing ${action} action`);
    assert.match(branch[1], /ptAuthorized\(e\)/, `${action} does not call ptAuthorized`);
    const authIndex = branch[1].indexOf('ptAuthorized(e)');
    const firstDataAccess = branch[1].search(/JSON\.parse|SpreadsheetApp|readPatrol|writePatrol|readSchedule|readHalfCheck|writeHalfCheck/);
    assert.ok(firstDataAccess === -1 || authIndex < firstDataAccess, `${action} touches data before authorization`);
  }
});

test('public health actions expose no patrol data or credentials', () => {
  const ping = code.match(/if \(action === 'ping'\) \{([\s\S]*?)\n  \}/);
  const health = code.match(/if \(action === 'pthealth'\) \{([\s\S]*?)\n  \}/);
  assert.ok(ping);
  assert.ok(health);
  for (const body of [ping[1], health[1]]) {
    assert.doesNotMatch(body, /PT_KEY|readPatrol|readSchedule|readHalfCheck|SpreadsheetApp|DriveApp|PT_STORES/);
  }
});

test('media POST uses the same property-backed credential or short-lived token', () => {
  assert.match(media, /ptCredentialAuthorized_/);
  assert.doesNotMatch(media, /PT_KEY\s*!==\s*'CHANGE_ME'/);
});

test('patrol session tokens are short-lived and revocable', () => {
  assert.match(code, /CacheService\.getScriptCache\(\)/);
  assert.match(code, /PATROL_SESSION_TTL_SECONDS\s*=\s*1800/);
  assert.match(code, /\.put\(ptSessionCacheKey_\(token\),\s*'ok',\s*PATROL_SESSION_TTL_SECONDS\)/);
  assert.match(code, /\.remove\(ptSessionCacheKey_\(token\)\)/);
});
