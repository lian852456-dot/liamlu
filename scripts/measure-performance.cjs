#!/usr/bin/env node
// Repeatable front-end performance measurements for the phase-2 work.
//
//   node scripts/measure-performance.cjs <repoDir> [--json out.json]
//
// What is measured, and how:
// - The checkout is served the way GitHub Pages serves it: gzip, ETag + 304,
//   Cache-Control max-age=600.
// - Off-origin hosts (Apps Script, Google) are blocked at DNS level with
//   --host-resolver-rules. Playwright's page.route() is NOT used, because it
//   disables the browser's HTTP cache and would distort repeat visits.
// - Only the static site is measured. Nothing here says how fast the live
//   Apps Script data loads after login.
// - Transfer = bytes the server sent: response bodies, plus response header
//   bytes counted separately. Request headers are not counted.
// - "Phone" = 390x844 viewport, Slow 4G (150 ms, 1.6 Mbps down) and CPU x4.
//
// Needs Playwright's Chromium (npx playwright install chromium) or
// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH pointing at a Chrome binary.
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const { chromium } = require('@playwright/test');

const repo = path.resolve(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : path.join(__dirname, '..'));
const jsonOut = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : null;
const PORT = 9300 + Math.floor(Math.random() * 500);
const ORIGIN = `http://127.0.0.1:${PORT}/`;
const RUNS = 3;
const PAGES = ['index.html', 'home.html', 'app.html', 'department-ops.html', 'readonly-dashboard.html'];
const SLOW_4G = { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 };
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

// ---- server with byte accounting -------------------------------------------
const served = { body: 0, headers: 0, full: 0, notModified: 0, paths: [] };
const snapshot = () => ({ ...served, paths: served.paths.length });
const delta = start => ({
  bodyKB: +((served.body - start.body) / 1024).toFixed(1),
  headerKB: +((served.headers - start.headers) / 1024).toFixed(1),
  full: served.full - start.full,
  notModified: served.notModified - start.notModified,
  fullPaths: served.paths.slice(start.paths),
});
function headerBytes(status, headers) {
  return Buffer.byteLength(`HTTP/1.1 ${status}\r\n` + Object.entries(headers).map(([k, v]) => `${k}: ${v}\r\n`).join('') + 'Date: Sun, 08 Nov 2026 00:00:00 GMT\r\nConnection: keep-alive\r\n\r\n');
}
function serve() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, ORIGIN);
    const file = path.join(repo, decodeURIComponent(url.pathname));
    if (!file.startsWith(repo)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404); return res.end(); }
      const type = TYPES[path.extname(file)] || 'application/octet-stream';
      const etag = '"' + crypto.createHash('md5').update(body).digest('hex') + '"';
      const headers = { 'Content-Type': type, 'Cache-Control': 'max-age=600', ETag: etag };
      if (req.headers['if-none-match'] === etag) {
        served.notModified += 1; served.headers += headerBytes(304, headers);
        res.writeHead(304, headers); return res.end();
      }
      const gzip = /text|javascript|json|svg|manifest/.test(type);
      const payload = gzip ? zlib.gzipSync(body, { level: 6 }) : body;
      const out = gzip ? { ...headers, 'Content-Encoding': 'gzip', 'Content-Length': payload.length } : { ...headers, 'Content-Length': payload.length };
      served.body += payload.length; served.headers += headerBytes(200, out); served.full += 1;
      served.paths.push(url.pathname.slice(1) + url.search);
      res.writeHead(200, out); res.end(payload);
    });
  }).listen(PORT, '127.0.0.1');
}

const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const launchArgs = ['--no-sandbox', '--js-flags=--expose-gc', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'];
const executable = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {};

async function throttle(context, page, cpu = 4) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  return cdp;
}
// Long-task timeline for "interactive": the end of the last long task (>50 ms)
// before a 1.5 s quiet window, not earlier than DOMContentLoaded.
const INTERACTIVE_PROBE = () => {
  window.__longTasks = [];
  try { new PerformanceObserver(l => l.getEntries().forEach(e => window.__longTasks.push([e.startTime, e.startTime + e.duration]))).observe({ type: 'longtask', buffered: true }); } catch (_) {}
};
async function pageMetrics(tab) {
  await tab.waitForTimeout(2000);
  return tab.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    const tasks = (window.__longTasks || []).sort((a, b) => a[0] - b[0]);
    let interactive = nav.domContentLoadedEventEnd;
    for (const [start, end] of tasks) { if (start - interactive < 1500) interactive = Math.max(interactive, end); }
    return { fcpMs: Math.round(fcp ? fcp.startTime : 0), interactiveMs: Math.round(interactive), loadMs: Math.round(nav.loadEventEnd) };
  });
}

async function profile(options, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-'));
  const context = await chromium.launchPersistentContext(dir, { ...executable, args: launchArgs, ...PHONE, ...(options || {}) });
  try { return await fn(context); } finally { await context.close(); fs.rmSync(dir, { recursive: true, force: true }); }
}

// 1. First visit on a fresh phone browser (service worker blocked, so this is
//    the page alone, as for someone who never opened the App).
async function firstVisit(browser, page) {
  const runs = [];
  for (let i = 0; i < RUNS; i += 1) {
    const context = await browser.newContext({ ...PHONE, serviceWorkers: 'block' });
    const tab = await context.newPage();
    await tab.addInitScript(INTERACTIVE_PROBE);
    await throttle(context, tab);
    const start = snapshot();
    await tab.goto(ORIGIN + page, { waitUntil: 'load', timeout: 120000 });
    const metrics = await pageMetrics(tab);
    runs.push({ ...metrics, ...delta(start) });
    await context.close();
  }
  const pick = key => median(runs.map(r => r[key]));
  return { fcpMs: pick('fcpMs'), interactiveMs: pick('interactiveMs'), loadMs: pick('loadMs'), bodyKB: pick('bodyKB'), headerKB: pick('headerKB') };
}

// 2. First App install: opening app.html registers the service worker, which
//    then downloads its precache list in the background.
async function appInstall() {
  return profile(null, async context => {
    const tab = context.pages()[0] || await context.newPage();
    await tab.addInitScript(INTERACTIVE_PROBE);
    await throttle(context, tab);
    const start = snapshot();
    const t0 = Date.now();
    await tab.goto(ORIGIN + 'app.html', { waitUntil: 'load', timeout: 120000 });
    const page = delta(start);
    const loadMs = Date.now() - t0;
    await tab.evaluate(() => navigator.serviceWorker.ready);
    await tab.waitForTimeout(1500);
    const total = delta(start);
    return { pageLoadMs: loadMs, pageBodyKB: page.bodyKB, backgroundBodyKB: +(total.bodyKB - page.bodyKB).toFixed(1), installedWithinMs: Date.now() - t0, totalBodyKB: total.bodyKB, totalHeaderKB: total.headerKB };
  });
}

// 3. Repeat visits on a phone where the App is installed (SW controls the
//    whole site), and on a browser without the App (HTTP cache only, within
//    the 10-minute max-age). Desktop CPU, Slow 4G.
async function repeatVisits(page, withApp) {
  return profile(withApp ? null : { serviceWorkers: 'block' }, async context => {
    const tab = context.pages()[0] || await context.newPage();
    if (withApp) {
      await tab.goto(ORIGIN + 'app.html', { waitUntil: 'load' });
      await tab.evaluate(() => navigator.serviceWorker.ready);
      await tab.waitForTimeout(1500);
    }
    await tab.goto(ORIGIN + page, { waitUntil: 'load', timeout: 120000 });
    await tab.waitForTimeout(800);
    await throttle(context, tab, 1);
    const visits = [];
    for (let i = 0; i < 3; i += 1) {
      const start = snapshot();
      const t0 = Date.now();
      await tab.goto(ORIGIN + page, { waitUntil: 'load', timeout: 120000 });
      const loadMs = Date.now() - t0;
      await tab.waitForTimeout(800);
      visits.push({ loadMs, ...delta(start) });
    }
    const controlled = await tab.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    const mid = visits.slice().sort((a, b) => a.bodyKB - b.bodyKB)[1];
    return { controlled, loadMs: mid.loadMs, bodyKB: mid.bodyKB, headerKB: mid.headerKB, fullDownloads: mid.full, notModified: mid.notModified, fullPaths: mid.fullPaths };
  });
}

// 4. First import/export cost: the one-time SheetJS (and officecrypto)
//    download that the lazy pages now pay when a file is picked or an export
//    is clicked. Cold cache, Slow 4G. On main these load with every page.
async function firstUseCost(browser) {
  const hasLoader = fs.existsSync(path.join(repo, 'vendor-loader.js'));
  if (!hasLoader) return { applicable: false, note: 'main 於開頁時即載入，首次匯入／匯出無額外下載' };
  const out = {};
  for (const libs of [['xlsx'], ['xlsx', 'officecrypto']]) {
    const runs = [];
    for (let i = 0; i < RUNS; i += 1) {
      const context = await browser.newContext({ ...PHONE, serviceWorkers: 'block' });
      const tab = await context.newPage();
      await tab.goto(ORIGIN + 'offline.html');
      await tab.addScriptTag({ url: '/vendor-loader.js' });
      await throttle(context, tab);
      const start = snapshot();
      const ms = await tab.evaluate(async names => { const t = performance.now(); await window.VendorLoader.ensure(...names); return Math.round(performance.now() - t); }, libs);
      runs.push({ ms, ...delta(start) });
      await context.close();
    }
    out[libs.join('+')] = { waitMs: median(runs.map(r => r.ms)), bodyKB: median(runs.map(r => r.bodyKB)) };
  }
  // Stock import in the App, file chosen immediately (worst case: no time to
  // pre-download while the picker is open). Cold cache, phone.
  const runs = [];
  for (let i = 0; i < RUNS; i += 1) {
    const context = await browser.newContext({ ...PHONE, serviceWorkers: 'block' });
    const tab = await context.newPage();
    await tab.goto(ORIGIN + 'app.html?preview=1', { waitUntil: 'load' });
    await throttle(context, tab);
    const ms = await tab.evaluate(async () => {
      const input = document.getElementById('stockFile');
      const file = new File(['店點,機型,庫存數,庫存日期\n通化,測試機,3,2026/11/07\n'], 'stock.csv', { type: 'text/csv' });
      const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
      const t = performance.now();
      input.dispatchEvent(new Event('change', { bubbles: true }));
      const message = document.getElementById('stockImportMessage');
      while (!/已匯入|匯入失敗/.test(message.textContent)) await new Promise(r => setTimeout(r, 20));
      return Math.round(performance.now() - t);
    });
    runs.push(ms);
    await context.close();
  }
  out.stockImportImmediateMs = median(runs);
  return out;
}
async function stockImportBaseline(browser) {
  if (fs.existsSync(path.join(repo, 'vendor-loader.js'))) return null;
  const runs = [];
  for (let i = 0; i < RUNS; i += 1) {
    const context = await browser.newContext({ ...PHONE, serviceWorkers: 'block' });
    const tab = await context.newPage();
    await tab.goto(ORIGIN + 'app.html?preview=1', { waitUntil: 'load' });
    await throttle(context, tab);
    runs.push(await tab.evaluate(async () => {
      const input = document.getElementById('stockFile');
      const dt = new DataTransfer(); dt.items.add(new File(['店點,機型,庫存數,庫存日期\n通化,測試機,3,2026/11/07\n'], 'stock.csv', { type: 'text/csv' })); input.files = dt.files;
      const t = performance.now(); input.dispatchEvent(new Event('change', { bubbles: true }));
      const message = document.getElementById('stockImportMessage');
      while (!/已匯入|匯入失敗/.test(message.textContent)) await new Promise(r => setTimeout(r, 20));
      return Math.round(performance.now() - t);
    }));
    await context.close();
  }
  return { stockImportImmediateMs: median(runs) };
}

// 5. Parsing a 40,000-row workbook (desktop CPU; phones are ~3-4x slower).
async function parseCost(browser) {
  const context = await browser.newContext();
  const tab = await context.newPage();
  await tab.goto(ORIGIN + 'offline.html');
  await tab.addScriptTag({ url: '/assets/vendor/xlsx.full.min.js' });
  const lazy = fs.existsSync(path.join(repo, 'vendor-loader.js'));
  await tab.evaluate(() => {
    const aoa = [Array.from({ length: 30 }, (_, i) => '欄位' + i)];
    for (let r = 0; r < 40000; r += 1) aoa.push(Array.from({ length: 30 }, (_, c) => (c % 3 === 0 ? '台北通化門市' + (r % 97) : c % 3 === 1 ? r * c % 9973 : '2026-10-' + String(1 + r % 28).padStart(2, '0'))));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '明細');
    window.__buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  });
  const times = [];
  for (let i = 0; i < 3; i += 1) {
    times.push(await tab.evaluate(useNew => { gc(); const t = performance.now(); XLSX.read(window.__buf, { type: 'array', cellDates: true, ...(useNew ? { cellHTML: false } : {}) }); return Math.round(performance.now() - t); }, lazy));
  }
  await context.close();
  return { options: lazy ? 'cellHTML:false' : 'default', parseMs: median(times) };
}

(async () => {
  const server = serve();
  const browser = await chromium.launch({ ...executable, args: launchArgs });
  const report = { repo, measuredAt: new Date().toISOString(), method: 'see header of scripts/measure-performance.cjs', firstVisit: {}, appInstall: null, repeatWithApp: {}, repeatWithoutApp: {}, firstUse: null, parse: null };
  const log = (label, value) => console.log(label.padEnd(40), JSON.stringify(value));
  try {
    for (const page of PAGES) log('first visit ' + page, report.firstVisit[page] = await firstVisit(browser, page));
    log('app install', report.appInstall = await appInstall());
    for (const page of ['app.html?preview=1', 'index.html', 'department-ops.html']) {
      const withApp = await repeatVisits(page, true); log('repeat (App installed) ' + page, { ...withApp, fullPaths: withApp.fullPaths.length }); report.repeatWithApp[page] = withApp;
      const without = await repeatVisits(page, false); log('repeat (no App) ' + page, { ...without, fullPaths: without.fullPaths.length }); report.repeatWithoutApp[page] = without;
    }
    log('first import/export', report.firstUse = (await firstUseCost(browser)) || {});
    const base = await stockImportBaseline(browser); if (base) { report.firstUse = { ...report.firstUse, ...base }; log('stock import (main)', base); }
    log('parse 40k rows', report.parse = await parseCost(browser));
  } finally {
    await browser.close();
    server.close();
  }
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
