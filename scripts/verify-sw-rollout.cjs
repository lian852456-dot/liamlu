#!/usr/bin/env node
// Verifies upgrade and rollback for a phone that already has the App (service
// worker) installed: the same origin first serves one checkout, then switches
// to the other, as a deploy or a revert of GitHub Pages would.
//
//   node scripts/verify-sw-rollout.cjs <oldRepoDir> <newRepoDir>
//
// For each direction it checks, after the switch: the new service worker is
// active, only the new cache remains, every page loads the deployed HTML and
// scripts (not cached ones), there are no page errors, and the phone-stock
// import still works offline-free. External hosts are blocked at DNS level.
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('@playwright/test');

const [oldRepo, newRepo] = process.argv.slice(2).map(p => path.resolve(p));
if (!oldRepo || !newRepo) { console.error('usage: verify-sw-rollout.cjs <oldRepo> <newRepo>'); process.exit(2); }
const PORT = 9800 + Math.floor(Math.random() * 100);
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
let root = oldRepo;
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(new URL(req.url, ORIGIN).pathname));
  fs.readFile(file, (err, body) => {
    if (err) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=600' });
    res.end(body);
  });
}).listen(PORT, '127.0.0.1');

const cacheNameOf = repo => fs.readFileSync(path.join(repo, 'service-worker.js'), 'utf8').match(/CACHE_NAME = '([^']+)'/)[1];
const lazyOf = repo => fs.existsSync(path.join(repo, 'vendor-loader.js'));

async function scenario(label, from, to) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sw-rollout-'));
  const context = await chromium.launchPersistentContext(dir, {
    args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
    viewport: { width: 390, height: 844 }, isMobile: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
  });
  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); };
  try {
    root = from;
    const tab = context.pages()[0] || await context.newPage();
    const errors = [];
    tab.on('pageerror', e => errors.push(e.message));
    await tab.goto(ORIGIN + 'app.html?preview=1', { waitUntil: 'load' });
    await tab.evaluate(() => navigator.serviceWorker.ready);
    await tab.reload({ waitUntil: 'load' });
    check('installed and controlling before the switch', await tab.evaluate(() => !!navigator.serviceWorker.controller));
    check('cache before the switch', JSON.stringify(await tab.evaluate(() => caches.keys())).includes(cacheNameOf(from)), cacheNameOf(from));

    root = to; // deploy or revert happens
    await tab.goto(ORIGIN + 'app.html?preview=1', { waitUntil: 'load' });
    const firstAfter = await tab.evaluate(() => ({ loader: typeof window.VendorLoader, xlsx: typeof window.XLSX }));
    check('first visit after the switch already runs the deployed scripts', lazyOf(to) ? firstAfter.loader === 'object' && firstAfter.xlsx === 'undefined' : firstAfter.loader === 'undefined' && firstAfter.xlsx === 'object', JSON.stringify(firstAfter));
    // Import right away, while the new worker may still be installing/activating.
    await tab.setInputFiles('#stockFile', { name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from('店點,機型,庫存數,庫存日期\n萬大,測試機,5,2026/11/07\n') });
    await tab.waitForFunction(() => /已匯入|匯入失敗/.test(document.getElementById('stockImportMessage').textContent), null, { timeout: 30000 });
    const duringSwap = await tab.textContent('#stockImportMessage');
    if (process.env.SW_DEBUG) console.log('  swap-debug', JSON.stringify(await tab.evaluate(async () => ({ loader: typeof window.VendorLoader, ready: window.VendorLoader && window.VendorLoader.isReady('xlsx'), xlsx: typeof window.XLSX, xlsxType: window.XLSX && Object.keys(window.XLSX).slice(0, 5), scripts: [...document.scripts].filter(x => /xlsx|vendor|phone-stock-app/.test(x.src)).map(x => x.src.split('/').pop() + (x.dataset.vendor ? '#' + x.dataset.vendor : '')), stockSrcHasEnsure: (await (await fetch('phone-stock-app.js?v=20261002-logout-2')).text()).includes('VendorLoader'), resources: performance.getEntriesByType('resource').filter(e => /xlsx|phone-stock|vendor/.test(e.name)).map(e => e.name.split('/').pop() + ' ' + e.transferSize) }))));
    check('phone-stock import during the worker swap', /已匯入 1 筆/.test(duringSwap), duringSwap);
    // The new worker installs and activates in the background after the first
    // visit; poll until its cache is the only one (up to 30 s).
    for (let i = 0; i < 60; i += 1) {
      const state = await tab.evaluate(async expected => { const keys = await caches.keys(); return { ready: !!navigator.serviceWorker.controller && keys.includes(expected), keys }; }, cacheNameOf(to));
      if (state.ready) break;
      await tab.waitForTimeout(500);
    }
    await tab.waitForTimeout(1500);
    await tab.reload({ waitUntil: 'load' });
    const keys = await tab.evaluate(() => caches.keys());
    const family = cacheNameOf(to).split('-v')[0];
    check('only the deployed cache remains', keys.filter(k => k.startsWith(family)).join(',') === cacheNameOf(to), keys.join(','));
    const swSource = await tab.evaluate(() => fetch('service-worker.js', { cache: 'no-store' }).then(r => r.text()));
    check('active worker matches the deployed file', swSource.includes(cacheNameOf(to)));

    for (const page of ['index.html', 'department-ops.html', 'readonly-dashboard.html', 'home.html']) {
      await tab.goto(ORIGIN + page, { waitUntil: 'load' });
      const html = await tab.evaluate(() => document.documentElement.outerHTML);
      const expected = fs.readFileSync(path.join(to, page), 'utf8');
      const marker = page === 'index.html' ? 'north12b-captain-144' : 'vendor-loader.js';
      check(`${page} is the deployed version`, html.includes(marker) === expected.includes(marker), `${marker} ${expected.includes(marker) ? 'expected' : 'not expected'}`);
    }

    await tab.goto(ORIGIN + 'app.html?preview=1', { waitUntil: 'load' });
    await tab.setInputFiles('#stockFile', { name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from('店點,機型,庫存數,庫存日期\n通化,測試機,3,2026/11/07\n') });
    await tab.waitForFunction(() => /已匯入|匯入失敗/.test(document.getElementById('stockImportMessage').textContent), null, { timeout: 30000 });
    const stockMessage = await tab.textContent('#stockImportMessage');
    check('phone-stock import works after the switch', /已匯入 1 筆/.test(stockMessage), stockMessage);
    check('no page errors', errors.length === 0, errors.join(' | '));
  } finally {
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
  console.log(`\n== ${label}`);
  for (const r of results) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? '（' + r.detail + '）' : ''}`);
  return results.every(r => r.ok);
}

(async () => {
  const up = await scenario(`升級：${path.basename(oldRepo)} → ${path.basename(newRepo)}`, oldRepo, newRepo);
  const down = await scenario(`回復：${path.basename(newRepo)} → ${path.basename(oldRepo)}`, newRepo, oldRepo);
  server.close();
  process.exit(up && down ? 0 : 1);
})().catch(error => { console.error(error); server.close(); process.exit(1); });
