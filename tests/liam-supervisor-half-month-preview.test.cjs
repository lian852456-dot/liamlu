const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const patrol = fs.readFileSync(path.join(root, 'patrol.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');
const preview = fs.readFileSync(path.join(root, 'app-preview-data.js'), 'utf8');
const sourceMatrix = fs.readFileSync(path.join(root, 'docs/HALF_MONTH_CHECK_SOURCE_MATRIX.md'), 'utf8');

test('half period canonical rule remains the formal patrol.html rule', () => {
  const source = patrol.match(/function halfPeriod\(date\)\{[^}]+\}/)?.[0];
  assert.ok(source, 'formal halfPeriod(date) must exist');
  const halfPeriod = Function(`${source}; return halfPeriod;`)();
  assert.equal(halfPeriod('2026-08-01'), 'H1');
  assert.equal(halfPeriod('2026-08-15'), 'H1');
  assert.equal(halfPeriod('2026-08-16'), 'H2');
  assert.equal(halfPeriod('2026-08-31'), 'H2');
  assert.doesNotMatch(app, /function halfPeriod\(/, 'App must not create a second period rule');
});

test('preview mirrors the formal 18-item and result semantics', () => {
  assert.match(patrol, /const HALF_ITEMS = Array\.from\(\{length:18\}/);
  for (const value of ["'ok'", "'abnormal'", "'na'"]) assert.match(preview, new RegExp(value));
  assert.match(preview, /const halfMonthQuestions = \[/);
  assert.match(preview, /'督導駐點'/);
  assert.match(preview, /'到店全盤作業（2月1次）'/);
  assert.match(sourceMatrix, /第 1–18 題/);
});

test('half-month preview is isolated from formal read and write actions', () => {
  assert.match(app, /const PATROL_READ_ACTIONS = new Set\(\['sread','ptread','ptvisit_read','hread'\]\)/);
  assert.match(app, /const PATROL_WRITE_ACTIONS = new Set\(\['ptvisit_write'\]\)/);
  assert.doesNotMatch(app.match(/function renderHalfMonthOverview[\s\S]+?async function loadHalfMonthFormalRead/)?.[0] || '', /fetch\(|patrolRead\(|patrolVisitWrite\(|privateInspectionRequest\(|privateInspectionMediaUpload\(/);
  assert.match(html, /data-patrol-check-view="patrol"/);
  assert.match(html, /data-patrol-check-view="half-month"/);
});

test('source discovery records formal read, write, auth, schema and fail-closed gaps', () => {
  for (const marker of ['hread','hwrite','half_media_upload','半月督導檢查','1800 秒','建立時間','填寫狀態','fail-closed']) {
    assert.match(sourceMatrix, new RegExp(marker));
  }
});
