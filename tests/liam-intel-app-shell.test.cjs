const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Pilot retains the five required destinations and exact home module order', () => {
  const html = read('app.html');
  for (const destination of ['home', 'battle', 'report', 'patrol', 'me']) {
    assert.match(html, new RegExp(`data-nav="${destination}"`));
  }
  const ordered = ['今日營運狀態', '>KPI<', '>台獎<', '16:00／21:00 回報', 'id="homeScheduleTitle">今日班表', 'id="homePatrolTitle">巡店提醒'];
  let previous = -1;
  for (const marker of ordered) {
    const index = html.indexOf(marker);
    assert.ok(index > previous, `${marker} must appear after the previous home module`);
    previous = index;
  }
  assert.match(html, /data-view="me"[\s\S]*今日班表/);
});

test('Pilot uses only the existing patrol auth and read-only actions', () => {
  const js = read('app.js');
  assert.match(js, /action: 'ptauth'/);
  assert.match(js, /patrolRead\('sread'/);
  assert.match(js, /patrolRead\('ptread'/);
  assert.match(js, /\['sread', 'ptread'\]\.includes\(action\)/);
  assert.doesNotMatch(js, /['"](?:ptwrite|hwrite|swrite|write)['"]/);
  assert.doesNotMatch(js, /document\.cookie|localStorage\.setItem|private_access|kpicalc_access/);
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
  assert.match(worker, /liam-supervisor-pilot-v3/);
  assert.match(worker, /event\.request\.method !== 'GET'/);
  assert.doesNotMatch(worker, /script\.google\.com/);
});
