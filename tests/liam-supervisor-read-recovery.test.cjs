const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('app.html', 'utf8');
const sw = fs.readFileSync('service-worker.js', 'utf8');

const activeEndpoint = 'AKfycbznzoWOzzPJLEh8PCwTLw8UfWEyiCXwawd0T49JXpK4MP70vTdrrfTMN1G2Grghd-Mv';
const retiredEndpoint = 'AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6';

test('private summary and patrol reads use the active deployment', () => {
  assert.equal((app.match(new RegExp(activeEndpoint, 'g')) || []).length, 2);
  assert.doesNotMatch(app, new RegExp(retiredEndpoint));
});

test('WKWebView read transport uses an encoded string URL and bounded hread timeout', () => {
  const read = app.match(/async function patrolRead[\s\S]+?async function patrolVisitWrite/)?.[0] || '';
  assert.doesNotMatch(read, /new URL\(|URLSearchParams/);
  assert.match(read, /encodeURIComponent\(key\)/);
  assert.match(read, /encodeURIComponent\(value\)/);
  assert.match(read, /action === 'hread' \? 3_000 : 8_000/);
  assert.match(read, /半月督導檢查讀取逾時（3 秒）/);
});

test('recovery release is cache-busted and formal half-month write remains disabled', () => {
  assert.match(html, /app\.js\?v=read-recovery-1/);
  assert.match(sw, /liam-supervisor-app-1-2-read-recovery-v1/);
  assert.doesNotMatch(app, /PATROL_WRITE_ACTIONS = new Set\(\[[^\]]*hwrite/);
  assert.doesNotMatch(app, /halfMonthWriteRows|patrolRead\(['"]hwrite|half_media_upload/);
});
