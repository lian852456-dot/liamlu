#!/usr/bin/env node
// Repeatable front-end performance measurements for the phase-2 work.
// Serves a checkout the way GitHub Pages does (gzip, ETag/304, max-age=600)
// and measures it in headless Chromium with mobile throttling. Off-origin
// requests (Apps Script etc.) are blocked, so only the static site is measured.
//
//   node scripts/measure-performance.cjs [repoDir] [--json out.json]
//
// Needs Playwright's Chromium (npx playwright install chromium) or
// PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH pointing at a Chrome binary.
'use strict';

const http = require('http');
const fs = require('fs');
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

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

function serve() {
  return http.createServer((req, res) => {
    const file = path.join(repo, decodeURIComponent(new URL(req.url, ORIGIN).pathname));
    if (!file.startsWith(repo)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, body) => {
      if (err) { res.writeHead(404); return res.end(); }
      const type = TYPES[path.extname(file)] || 'application/octet-stream';
      const etag = '"' + crypto.createHash('md5').update(body).digest('hex') + '"';
      const headers = { 'Content-Type': type, 'Cache-Control': 'max-age=600', ETag: etag };
      if (req.headers['if-none-match'] === etag) { res.writeHead(304, headers); return res.end(); }
      const gzip = /text|javascript|json|svg|manifest/.test(type);
      res.writeHead(200, gzip ? { ...headers, 'Content-Encoding': 'gzip' } : headers);
      res.end(gzip ? zlib.gzipSync(body, { level: 6 }) : body);
    });
  }).listen(PORT, '127.0.0.1');
}

const median = values => values.slice().sort((a, b) => a - b)[Math.floor(values.length / 2)];
const launchOptions = { args: ['--no-sandbox', '--js-flags=--expose-gc'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) };

async function throttle(context, page, cpu = 4) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  let bytes = 0;
  cdp.on('Network.loadingFinished', e => { bytes += e.encodedDataLength; });
  return { cdp, bytes: () => bytes };
}

async function firstVisit(browser, page) {
  const runs = [];
  for (let i = 0; i < RUNS; i += 1) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const tab = await context.newPage();
    await tab.route(u => !u.href.startsWith(ORIGIN), r => r.abort());
    const net = await throttle(context, tab);
    await tab.goto(ORIGIN + page, { waitUntil: 'load', timeout: 120000 });
    await tab.waitForTimeout(400);
    const m = await tab.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const fcp = performance.getEntriesByName('first-contentful-paint')[0];
      return { fcp: Math.round(fcp ? fcp.startTime : 0), load: Math.round(nav.loadEventEnd) };
    });
    runs.push({ ...m, kb: Math.round(net.bytes() / 1024) });
    await context.close();
  }
  return { fcpMs: median(runs.map(r => r.fcp)), loadMs: median(runs.map(r => r.load)), transferKB: median(runs.map(r => r.kb)) };
}

// Repeat visits of a page controlled by the app's service worker: how much is
// downloaded again on the second and third visit.
async function repeatVisits(page) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'perf-sw-'));
  const context = await chromium.launchPersistentContext(dir, { ...launchOptions, viewport: { width: 390, height: 844 }, isMobile: true });
  try {
    const tab = context.pages()[0] || await context.newPage();
    await tab.route(u => !u.href.startsWith(ORIGIN), r => r.abort());
    await tab.goto(ORIGIN + 'app.html?preview=1', { waitUntil: 'load' });
    await tab.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready);
    await tab.waitForTimeout(1500);
    const net = await throttle(context, tab, 1);
    const visits = [];
    for (let i = 0; i < 2; i += 1) {
      const start = net.bytes();
      await tab.goto(ORIGIN + page, { waitUntil: 'load', timeout: 120000 });
      await tab.waitForTimeout(800);
      visits.push(Math.round((net.bytes() - start) / 1024));
    }
    const controlled = await tab.evaluate(() => !!(navigator.serviceWorker && navigator.serviceWorker.controller));
    return { controlled, repeatTransferKB: median(visits) };
  } finally {
    await context.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Main-thread blocking while a 40,000-row workbook is read, the way the
// upload pages read it (old: XLSX.read on the page; new: VendorLoader).
async function parseFreeze(browser) {
  const context = await browser.newContext();
  const tab = await context.newPage();
  await tab.goto(ORIGIN + 'offline.html');
  await tab.addScriptTag({ url: '/assets/vendor/xlsx.full.min.js' });
  const hasLoader = fs.existsSync(path.join(repo, 'vendor-loader.js'));
  if (hasLoader) await tab.addScriptTag({ url: '/vendor-loader.js' });
  await tab.evaluate(() => {
    const aoa = [Array.from({ length: 30 }, (_, i) => '欄位' + i)];
    for (let r = 0; r < 40000; r += 1) aoa.push(Array.from({ length: 30 }, (_, c) => (c % 3 === 0 ? '台北通化門市' + (r % 97) : c % 3 === 1 ? r * c % 9973 : '2026-10-' + String(1 + r % 28).padStart(2, '0'))));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), '明細');
    window.__buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  });
  const cdp = await context.newCDPSession(tab);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const result = await tab.evaluate(async useLoader => {
    const tasks = [];
    const observer = new PerformanceObserver(list => list.getEntries().forEach(e => tasks.push(e.duration)));
    observer.observe({ type: 'longtask' });
    const t0 = performance.now();
    if (useLoader) await window.VendorLoader.readWorkbook(window.__buf, { type: 'array', cellDates: true, cellHTML: false });
    else XLSX.read(window.__buf, { type: 'array', cellDates: true });
    const total = performance.now() - t0;
    await new Promise(r => setTimeout(r, 300));
    observer.disconnect();
    return { totalMs: Math.round(total), longestFreezeMs: Math.round(Math.max(0, ...tasks)), frozenMs: Math.round(tasks.reduce((a, b) => a + b, 0)) };
  }, hasLoader);
  await context.close();
  return { mode: hasLoader ? 'worker' : 'main-thread', ...result };
}

(async () => {
  const server = serve();
  const browser = await chromium.launch(launchOptions);
  const report = { repo, measuredAt: new Date().toISOString(), firstVisit: {}, repeatVisit: {}, parse: null };
  try {
    for (const page of PAGES) {
      report.firstVisit[page] = await firstVisit(browser, page);
      console.log('first visit', page.padEnd(26), JSON.stringify(report.firstVisit[page]));
    }
    for (const page of ['app.html?preview=1', 'index.html', 'department-ops.html']) {
      report.repeatVisit[page] = await repeatVisits(page);
      console.log('repeat visit', page.padEnd(25), JSON.stringify(report.repeatVisit[page]));
    }
    report.parse = await parseFreeze(browser);
    console.log('parse 40k rows', JSON.stringify(report.parse));
  } finally {
    await browser.close();
    server.close();
  }
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
})().catch(error => { console.error(error); process.exit(1); });
