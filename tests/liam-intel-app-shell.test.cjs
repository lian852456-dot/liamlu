const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('App shell retains the five required bottom navigation destinations', () => {
  const html = read('app.html');
  for (const destination of ['home', 'battle', 'report', 'patrol', 'me']) {
    assert.match(html, new RegExp(`data-nav="${destination}"`));
  }
  assert.match(html, /Liam AI 指揮室/);
  assert.match(html, /data-supervisor-only/);
});

test('PWA shell uses safe-area, standalone manifest, and no data-write endpoints', () => {
  const html = read('app.html');
  const css = read('app.css');
  const manifest = JSON.parse(read('manifest.webmanifest'));
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /overflow-x:hidden/);
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.orientation, 'portrait-primary');
  assert.doesNotMatch(read('app.js'), /fetch\(|XMLHttpRequest|\.post\(/);
});

test('service worker is app-shell only and has an offline fallback', () => {
  const worker = read('service-worker.js');
  assert.match(worker, /offline\.html/);
  assert.match(worker, /event\.request\.method !== 'GET'/);
  assert.match(worker, /CACHE_NAME/);
});
