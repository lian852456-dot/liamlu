const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('app.html', 'utf8');
const sw = fs.readFileSync('service-worker.js', 'utf8');

const patrolEndpoint = 'AKfycbznzoWOzzPJLEh8PCwTLw8UfWEyiCXwawd0T49JXpK4MP70vTdrrfTMN1G2Grghd-Mv';
const privateEndpoint = 'AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6';

test('private summary and patrol reads use separate formal deployments', () => {
  assert.equal((app.match(new RegExp(privateEndpoint, 'g')) || []).length, 1);
  assert.equal((app.match(new RegExp(patrolEndpoint, 'g')) || []).length, 1);
  assert.match(app, /postReadOnly[\s\S]*fetchJsonWithRecovery\(DAILY_REPORT_API/);
  assert.match(app, /postDeviceAccess[\s\S]*fetchJsonWithRecovery\(DAILY_REPORT_API/);
  assert.match(app, /postPatrolAuth[\s\S]*fetchJsonWithRecovery\(PATROL_API/);
  assert.match(app, /async function patrolRead[\s\S]*method:'POST'[\s\S]*`\$\{PATROL_API\}\?\$\{/);
});

test('WKWebView read transport uses encoded string URL and independent bounded timeouts', () => {
  const read = app.match(/async function patrolRead[\s\S]+?async function patrolVisitWrite/)?.[0] || '';
  assert.doesNotMatch(read, /new URL\(|URLSearchParams/);
  assert.match(read, /encodeURIComponent\(key\)/);
  assert.match(read, /encodeURIComponent\(value\)/);
  assert.match(read, /action === 'ptsummary' \|\| action === 'ptdetail'[\s\S]*body:JSON\.stringify/);
  assert.match(app, /PRIVATE_TIMEOUT_MS = 20_000/);
  assert.match(app, /sread:30_000, ptsummary:20_000, ptdetail:30_000, hread:90_000, ptvisit_read:30_000/);
  assert.doesNotMatch(app, /patrolRead\('ptread'/);
  assert.match(read, /const timeoutMs = PATROL_TIMEOUT_MS\[action\]/);
  assert.match(read, /巡店資料讀取逾時/);
});

test('only retryable transport failures receive one bounded retry', () => {
  assert.match(app, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(app, /googleHtml404[\s\S]*'google-html-404'[\s\S]*googleHtml404/);
  assert.match(app, /'timeout',[^\n]+true/);
  assert.match(app, /'network',[^\n]+true/);
  assert.match(app, /'http',[^\n]+false/);
  assert.match(app, /if \(!error \|\| !error\.retryable \|\| attempt === 1\) throw error/);
  assert.match(app, /RETRY_DELAY_MS = 1_000/);
});

test('transport failures fail closed and do not become zero-shaped formal data', () => {
  assert.match(app, /resetPrivateSummary\(state,note\)/);
  assert.match(app, /PRIVATE_MODULE_KEYS\.forEach\(key => \{ contract\[key\] = statusModule\(key,status,null,note\); \}\)/);
  assert.match(app, /return statusModule\(key,'error',null,note\)/);
  assert.match(app, /status:'stale',stale:true,note:`上次成功資料/);
  assert.match(app, /reportRows\[segment\]=null/);
  assert.doesNotMatch(app, /reportResult\.status==='rejected'[\s\S]{0,300}adaptReport\(segment,\{\}/);
});

test('recovery release is cache-busted and formal half-month write remains disabled', () => {
  assert.match(html, /app\.js\?v=patrol-summary-1/);
  assert.match(sw, /liam-supervisor-app-1-2-patrol-summary-v1/);
  assert.doesNotMatch(app, /PATROL_WRITE_ACTIONS = new Set\(\[[^\]]*hwrite/);
  assert.doesNotMatch(app, /halfMonthWriteRows|patrolRead\(['"]hwrite|half_media_upload/);
  assert.match(app, /if\(!PREVIEW_MODE\) return/);
});
