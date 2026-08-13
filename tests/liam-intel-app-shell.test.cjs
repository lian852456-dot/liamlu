const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('App 1.1 retains the five required destinations and frozen home module order', () => {
  const html = read('app.html');
  for (const destination of ['home', 'battle', 'report', 'schedule', 'patrol']) {
    assert.match(html, new RegExp(`data-nav="${destination}"`));
  }
  const ordered = ['今日營運戰況', 'kpiHero', 'awardHome', 'scheduleHome', 'patrolHome'];
  let previous = -1;
  for (const marker of ordered) {
    const index = html.indexOf(marker);
    assert.ok(index > previous, `${marker} must appear after the previous home module`);
    previous = index;
  }
  assert.match(html, /data-view="schedule"[\s\S]*九店完整班表/);
  assert.match(html, /data-profile-entry/);
});

test('Recovery keeps existing patrol auth and disables half-month writes', () => {
  const js = read('app.js');
  assert.match(js, /action:'ptauth'/);
  assert.match(js, /patrolRead\('sread'/);
  assert.match(js, /patrolRead\('ptsummary',\{month\}\)/);
  assert.match(js, /new Set\(\['sread','ptsummary','ptdetail','ptvisit_read','hread'\]\)/);
  assert.doesNotMatch(js, /patrolRead\('ptread'/);
  assert.match(js, /new Set\(\['ptvisit_write'\]\)/);
  assert.doesNotMatch(js, /new Set\(\['ptvisit_write','hwrite'\]\)/);
  assert.doesNotMatch(js, /['"](?:ptwrite|swrite|write)['"]/);
  assert.doesNotMatch(js, /half_media_upload/);
  assert.doesNotMatch(js, /document\.cookie|localStorage\.setItem\([^,]+,\s*(?:employeeId|token|secret)/);
  assert.match(js, /new Set\(\['private_access','read','pread','kpicalc_access'\]\)/);
  assert.doesNotMatch(read('app.html'), /金牌|店務檢查|推播|Face ID|離線寫入/);
});

test('PWA uses safe-area, standalone manifest, and app-only offline cache', () => {
  const html = read('app.html');
  const css = read('app.css');
  const manifest = JSON.parse(read('manifest.webmanifest'));
  const worker = read('service-worker.js');
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /name="mobile-web-app-capable" content="yes"/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /overflow-x:hidden/);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait-primary');
  assert.match(worker, /offline\.html/);
  assert.match(worker, /liam-supervisor-app-1-2-emergency-rollback-20260813-v1/);
  assert.match(worker, /half-month-check-read-model\.js/);
  assert.match(worker, /half-month-check-write-prep\.js/);
  assert.match(worker, /event\.request\.method !== 'GET'/);
  assert.doesNotMatch(worker, /script\.google\.com/);
});
