const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const bundle = path.join(root, 'patrol-gas', 'PatrolCode.gs');
const halfMedia = path.join(root, 'patrol-gas', 'HalfMedia.gs');
const manifest = path.join(root, 'patrol-gas', 'appsscript.json');
const patrolPage = path.join(root, 'patrol.html');
const patrolUrl = 'https://script.google.com/macros/s/AKfycbxqBtW2yQw_u4qqJ9Knz6CK34hAiunaa6lIQu4pMa8Ff2voJZCWKEh8MXTJ6qAoGTax/exec';

function functionBlock(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1).trim();
  }
  throw new Error(`${name} is unterminated`);
}

test('Patrol GAS bundle has only the Patrol route surface and own session audience', () => {
  execFileSync(process.execPath, ['scripts/build-patrol-gas-bundle.mjs'], { cwd: root, stdio: 'pipe' });
  const code = fs.readFileSync(bundle, 'utf8');
  const media = fs.readFileSync(halfMedia, 'utf8');

  assert.match(code, /const PATROL_AUTH_DEPLOYMENT = 'patrol-isolated-v1';/);
  assert.match(code, /const PATROL_SESSION_SIGNING_KEY_PROPERTY = 'PATROL_SESSION_SIGNING_KEY';/);
  const mainSource = fs.readFileSync(path.join(root, 'gas', 'Code.gs'), 'utf8');
  ['ptWinMonths', 'ptDayOf', 'ptItemDone', 'ptStoreRows'].forEach(name => {
    assert.equal(
      functionBlock(code, name),
      functionBlock(mainSource, name),
      `${name} must be generated directly from the main Patrol source`,
    );
  });
  assert.match(code, /CacheService\.getScriptCache\(\)/);
  assert.match(code, /LockService\.getScriptLock\(\)/);
  [
    'ptauth', 'ptlogout', 'ptsummary', 'ptdetail', 'ptmileage',
    'ptvisit_read', 'ptvisit_write', 'hread', 'hwrite', 'sread', 'half_media_upload'
  ].forEach(action => assert.match(code, new RegExp(`['\\"]${action}['\\"]`)));
  assert.doesNotMatch(code, /audit_|AuditReport|auditReport|privateDashboard|reportUpload|kpicalc/i);
  assert.doesNotMatch(media, /audit_|AuditReport|auditReport/i);
});

test('Patrol frontend uses only the isolated deployment and v2-only session key', () => {
  const page = fs.readFileSync(patrolPage, 'utf8');
  assert.match(page, new RegExp(`const PATROL_GAS_URL = '${patrolUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}';`));
  assert.match(page, /const PT_SESSION_TOKEN_STORAGE = 'bei12b_patrol_session_token_v2';/);
  assert.match(page, /const PRIVATE_GAS_URL = PATROL_GAS_URL;/);
  assert.doesNotMatch(page, /bei12b_pt_session_token/);
});

test('Patrol manifest preserves the anonymous Web App health contract', () => {
  const config = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  assert.deepEqual(config.webapp, {
    access: 'ANYONE_ANONYMOUS',
    executeAs: 'USER_DEPLOYING',
  });
});
