'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const { createRuntime, parsed, OPERATOR } = require('./helpers/tradein-synthetic-runtime.cjs');

// All credentials and records here are synthetic. Requests never reach Google.
const PT_API = 'https://script.google.com/macros/s/AKfycbxqBtW2yQw_u4qqJ9Knz6CK34hAiunaa6lIQu4pMa8Ff2voJZCWKEh8MXTJ6qAoGTax/exec';
const PT_SESSION = 'bei12b_patrol_session_token_v2';
const VALID_KEY = 'SYNTHETIC_BRIEF_SUPERVISOR_KEY';
const VALID_TOKEN = 'U1lOVEhFVElDX1NVUEVSVklTT1I.c3ludGhldGljLXNpZ25hdHVyZQ';
const NOW = new Date('2026-10-12T10:00:00Z');
let server, base;

test.beforeAll(async () => {
  const root = path.resolve(__dirname, '..');
  server = http.createServer(async (request, response) => {
    try {
      const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
      if (path.relative(root, file).startsWith('..')) throw Error('Outside fixture server');
      const type = { '.html':'text/html', '.js':'application/javascript', '.mjs':'application/javascript', '.css':'text/css', '.png':'image/png', '.svg':'image/svg+xml', '.json':'application/json' }[path.extname(file)];
      if (!type) throw Error('Unsupported fixture asset');
      const bytes = await fs.readFile(file);
      response.writeHead(200, { 'Content-Type': type + ';charset=utf-8' });
      response.end(bytes);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port + '/';
});
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); });

function deferred() {
  let release;
  const promise = new Promise(resolve => { release = resolve; });
  return { promise, release };
}

function publicRuntime() {
  const runtime = createRuntime(), source = parsed();
  runtime.configure(source);
  const authorization = { employeeId:OPERATOR, adminSecret:runtime.secret };
  const preview = runtime.a.tradeinPerformancePreview({ source, ...authorization });
  const published = runtime.a.tradeinPerformancePublish({ source, ...authorization, ...preview });
  runtime.a.tradeinPerformancePublicPublish({ ...authorization, month:source.month, sourceHash:source.source_sha256, expectedActiveHash:published.snapshotHash });
  return runtime;
}

async function start(page, { width=1280, savedToken='', staff=false, lifetime=3600, dataGate=null, entry='tradein-brief.html?month=2026-10' }={}) {
  const runtime = publicRuntime();
  const state = { authCalls:[], dataCalls:[], vendorCalls:0, downloads:[], errors:[], allow:true,
    expiresAt:Math.floor(NOW.getTime()/1000)+lifetime, dataGate, vendorGate:null };
  page.on('pageerror', error => state.errors.push(error.message));
  page.on('download', download => state.downloads.push(download.suggestedFilename()));
  await page.setViewportSize({ width, height:900 });
  await page.clock.install({ time:NOW });
  await page.addInitScript(({ savedToken, staff, sessionKey }) => {
    if (savedToken) sessionStorage.setItem(sessionKey, savedToken);
    if (staff) {
      sessionStorage.setItem('north12b_private_dashboard_employee_id', 'SYNTHETIC_STAFF');
      localStorage.setItem('north12b_private_dashboard_employee_id', 'SYNTHETIC_STAFF');
      localStorage.setItem('north12b_private_dashboard_device_id', 'SYNTHETIC_APPROVED_DEVICE');
      sessionStorage.setItem('north12b_password_session_v1', JSON.stringify({
        v:1, owner:'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec',
        token:'B1_a_'+'a'.repeat(64), deviceId:'SYNTHETIC_APPROVED_DEVICE', expiresAt:Date.now()+1800000,
        logoutEpoch:'', employeeId:'SYNTHETIC_STAFF', role:'督導'
      }));
      // A local role label or legacy passcode is not a supervisor server grant.
      localStorage.setItem('bei12b_pt_key', 'SYNTHETIC_UNVERIFIED_LOCAL_KEY');
      localStorage.setItem('bei12b_pt_gas_url', 'https://invalid.example.test/untrusted');
    }
    window.__briefPrintCount = 0;
    window.print = () => { window.__briefPrintCount += 1; };
  }, { savedToken, staff, sessionKey:PT_SESSION });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === new URL(base).origin) {
      if (url.pathname.endsWith('/pptxgenjs-4.0.1.bundle.js')) {
        state.vendorCalls += 1;
        if (state.vendorGate) await state.vendorGate.promise;
      }
      return route.continue();
    }
    if (url.hostname !== 'script.google.com') return route.abort();
    let payload;
    try { payload = JSON.parse(request.postData() || '{}'); }
    catch { payload = JSON.parse(new URLSearchParams(request.postData()).get('payload') || '{}'); }
    if (payload.action === 'ptauth') {
      state.authCalls.push({ endpoint:url.origin+url.pathname, payload });
      const valid = state.allow && (payload.key === VALID_KEY || payload.token === VALID_TOKEN);
      return route.fulfill({ json:valid ? {
        status:'ok', token:VALID_TOKEN, expiresAt:state.expiresAt,
        expiresIn:lifetime, sessionContract:'patrol-session-v2', deployment:'patrol-auth-stateless-20260821'
      } : { status:'error', message:'unauthorized', reason:'AUTH_TOKEN_INVALID' } });
    }
    if (payload.action === 'ptlogout') return route.fulfill({ json:{ status:'ok' } });
    state.dataCalls.push(payload);
    if (state.dataGate) await state.dataGate.promise;
    const body = runtime.dispatch(payload);
    if (url.searchParams.get('transport') === 'iframe') {
      const message = JSON.stringify({ type:'north12b-gas-response-v1', requestId:url.searchParams.get('requestId'), body }).replace(/</g, '\\u003c');
      return route.fulfill({ contentType:'text/html', body:'<!doctype html><meta charset="utf-8"><script>window.top.postMessage('+message+',"*")</script>' });
    }
    return route.fulfill({ json:body });
  });
  await page.goto(base + entry);
  return state;
}

async function unlock(page) {
  await page.locator('#briefPasscode').fill(VALID_KEY);
  await page.locator('#verifyBriefSupervisor').click();
}

async function ready(page) {
  await expect(page.locator('#briefAuth')).toBeHidden();
  await expect(page.locator('#briefWorkspace')).toBeVisible();
  await expect(page.locator('#briefPreview')).toContainText('北一二B舊換新成效');
  await expect(page.locator('#briefStatus')).toContainText('已核對 4 台');
  await expect(page.locator('#downloadPptx')).toBeEnabled();
  await expect(page.locator('#printBrief')).toBeEnabled();
}

async function locked(page) {
  await expect(page.locator('#briefAuth')).toBeVisible();
  await expect(page.locator('#briefWorkspace')).toBeHidden();
  await expect(page.locator('#briefPreview')).toBeEmpty();
  await expect(page.locator('#downloadPptx')).toBeDisabled();
  await expect(page.locator('#printBrief')).toBeDisabled();
}

async function sharedLogout(page) {
  await page.evaluate(sessionKey => {
    sessionStorage.removeItem(sessionKey);
    window.dispatchEvent(new Event('portal-before-logout'));
  }, PT_SESSION);
}

for (const staff of [false, true]) {
  test((staff ? 'staff and B login' : 'anonymous direct URL') + ' cannot read or export a brief', async ({ page }) => {
    const state = await start(page, { staff });
    await locked(page);
    // Programmatic events must also respect the gate, not just disabled buttons.
    for (const id of ['readBrief', 'downloadPptx', 'printBrief']) await page.locator('#'+id).dispatchEvent('click');
    await locked(page);
    expect(state.authCalls).toEqual([]);
    expect(state.dataCalls).toEqual([]);
    expect(state.vendorCalls).toBe(0);
    expect(state.downloads).toEqual([]);
    expect(await page.evaluate(() => window.__briefPrintCount)).toBe(0);
    expect(state.errors).toEqual([]);
  });
}

test('an invalid restored supervisor token is rejected and removed before any data read', async ({ page }) => {
  const state = await start(page, { savedToken:'aW52YWxpZA.c2lnbmF0dXJl' });
  await expect.poll(() => state.authCalls.length).toBe(1);
  await expect.poll(() => page.evaluate(key => sessionStorage.getItem(key), PT_SESSION)).toBeNull();
  await locked(page);
  expect(state.authCalls[0].endpoint).toBe(PT_API);
  expect(state.dataCalls).toEqual([]);
  expect(state.downloads).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('public navigation stays revoked after shared logout while the server still accepts the token', async ({ page }) => {
  const state = await start(page, { savedToken:VALID_TOKEN, entry:'tradein-progress.html' });
  const briefLink = page.locator('[data-supervisor-brief]');
  await expect(briefLink).toBeVisible();
  await expect(page.locator('#stats')).toContainText('4 台');
  const authCallsBeforeLogout = state.authCalls.length;
  await page.evaluate(() => {
    window.dispatchEvent(new StorageEvent('storage', {
      key:'north12b_portal_logout_event_v1',
      newValue:JSON.stringify({ type:'logout', version:1, id:crypto.randomUUID(), at:Date.now() })
    }));
  });
  await expect(briefLink).toBeHidden();
  await page.evaluate(() => {
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted:true }));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  // Public data remains usable and its round trip also drains any requests
  // incorrectly queued by the preceding navigation lifecycle events.
  const readsBeforeRefresh = state.dataCalls.length;
  await page.locator('#refreshData').click();
  await expect.poll(() => state.dataCalls.length).toBe(readsBeforeRefresh+1);
  await expect(page.locator('#refreshData')).toBeEnabled();
  await expect(page.locator('#publicWorkspace')).toBeVisible();
  await expect(page.locator('#stats')).toContainText('4 台');
  await expect(briefLink).toBeHidden();
  expect(state.allow).toBe(true);
  expect(state.authCalls.length).toBe(authCallsBeforeLogout);
  expect(state.errors).toEqual([]);
});

test('a verified supervisor gets the reconciled brief, a real PPTX and the print action', async ({ page }, info) => {
  const state = await start(page);
  await unlock(page);
  await ready(page);
  await expect(page.locator('#briefPreview')).toContainText('159 台');
  await expect(page.locator('#briefPreview')).toContainText('75%');
  const callsBeforeDownload = state.authCalls.length;
  const downloading = page.waitForEvent('download');
  await page.locator('#downloadPptx').click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^北一二B_舊換新成效_2026-10_截至.*\.pptx$/);
  await download.saveAs(info.outputPath('SYNTHETIC-supervisor-brief.pptx'));
  const bytes = await fs.readFile(await download.path());
  expect(bytes.length).toBeGreaterThan(1000);
  expect(bytes.subarray(0, 2).toString()).toBe('PK');
  expect(bytes.includes(Buffer.from('ppt/presentation.xml'))).toBe(true);
  expect(state.authCalls.length).toBeGreaterThan(callsBeforeDownload);
  await expect(page.locator('#printBrief')).toBeEnabled();
  const callsBeforePrint = state.authCalls.length;
  await page.locator('#printBrief').click();
  await expect.poll(() => page.evaluate(() => window.__briefPrintCount)).toBe(1);
  expect(state.authCalls.length).toBeGreaterThan(callsBeforePrint);
  expect(state.authCalls.every(call => call.endpoint === PT_API)).toBe(true);
  expect(state.dataCalls).toEqual([{ action:'tradein_performance_public_read', month:'2026-10', includeDays:true }]);
  expect(await page.evaluate(key => sessionStorage.getItem(key), PT_SESSION)).toBe(VALID_TOKEN);
  expect(await page.evaluate(secret => Object.values(localStorage).concat(Object.values(sessionStorage)).some(value => value.includes(secret)), VALID_KEY)).toBe(false);
  expect(state.errors).toEqual([]);
});

test('authorized print contains one slide with no portal controls and all ranking tables within it', async ({ page }, info) => {
  const state = await start(page, { savedToken:VALID_TOKEN });
  await ready(page);
  await expect(page.locator('#portal-session-controls')).toBeVisible();
  await expect(page.locator('.brief-controls')).toBeVisible();
  await expect(page.locator('.area-nav')).toBeVisible();
  const tablesFit = await page.locator('.brief-slide').evaluate(slide => {
    const outer = slide.getBoundingClientRect();
    return Array.from(slide.querySelectorAll('.ranking-columns table'), table => {
      const bounds = table.getBoundingClientRect();
      return bounds.left >= outer.left && bounds.right <= outer.right && bounds.bottom <= outer.bottom;
    });
  });
  expect(tablesFit.length).toBeGreaterThan(0);
  expect(tablesFit.every(Boolean)).toBe(true);

  // The button's live ptauth path is tested above. Set only the print flag to
  // isolate CSS pagination from a browser's interactive print-dialog lifecycle.
  await page.evaluate(() => { document.body.dataset.briefPrintAuthorized = 'true'; });
  await page.emulateMedia({ media:'print' });
  for (const selector of ['#portal-session-controls', '#briefAuth', '.hero', '.area-nav', '.brief-access', '.brief-controls']) {
    await expect(page.locator(selector)).toBeHidden();
  }
  await expect(page.locator('button:visible')).toHaveCount(0);
  await expect(page.locator('#briefPreview')).toBeVisible();
  const pdf = await page.pdf({ path:info.outputPath('SYNTHETIC-supervisor-brief-print.pdf'), preferCSSPageSize:true, printBackground:true });
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  // Chromium exposes its page dictionaries outside compressed drawing streams.
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).toHaveLength(1);
  expect(state.errors).toEqual([]);
});

for (const action of ['readBrief', 'downloadPptx', 'printBrief']) {
  test('server denial on '+action+' clears the displayed brief and stops the action', async ({ page }) => {
    const state = await start(page, { savedToken:VALID_TOKEN });
    await ready(page);
    const readsBefore = state.dataCalls.length;
    state.allow = false;
    await page.locator('#'+action).click();
    await locked(page);
    expect(await page.evaluate(key => sessionStorage.getItem(key), PT_SESSION)).toBeNull();
    expect(state.dataCalls.length).toBe(readsBefore);
    expect(state.downloads).toEqual([]);
    expect(await page.evaluate(() => window.__briefPrintCount)).toBe(0);
    expect(state.errors).toEqual([]);
  });
}

test('expiry clears an already rendered brief without another user action', async ({ page }) => {
  const state = await start(page, { savedToken:VALID_TOKEN, lifetime:60 });
  await ready(page);
  await page.clock.fastForward(61000);
  await locked(page);
  await page.locator('#downloadPptx').dispatchEvent('click');
  await page.locator('#printBrief').dispatchEvent('click');
  expect(state.downloads).toEqual([]);
  expect(await page.evaluate(() => window.__briefPrintCount)).toBe(0);
  expect(state.errors).toEqual([]);
});

test('shared logout during a pending read prevents its late response from rendering', async ({ page }) => {
  const gate = deferred(), state = await start(page, { savedToken:VALID_TOKEN, dataGate:gate });
  try {
    await expect.poll(() => state.dataCalls.length).toBe(1);
    await sharedLogout(page);
    await locked(page);
  } finally {
    gate.release();
  }
  await expect(page.locator('iframe[title="目標進度讀取"]')).toHaveCount(0);
  await page.locator('#downloadPptx').dispatchEvent('click');
  await locked(page);
  expect(state.downloads).toEqual([]);
  expect(state.errors).toEqual([]);
});

test('shared logout during PPTX preparation prevents a late download', async ({ page }) => {
  const state = await start(page, { savedToken:VALID_TOKEN });
  await ready(page);
  const gate = deferred();
  state.vendorGate = gate;
  try {
    await page.locator('#downloadPptx').click();
    await expect.poll(() => state.vendorCalls).toBe(1);
    await sharedLogout(page);
    await locked(page);
  } finally {
    gate.release();
  }
  await expect.poll(() => page.evaluate(() => typeof (window.pptxgen || window.PptxGenJS))).toBe('function');
  await locked(page);
  expect(state.downloads).toEqual([]);
  expect(state.errors).toEqual([]);
});

for (const width of [320, 390]) {
  test(width+'px supervisor gate and verified controls fit the mobile viewport', async ({ page }, info) => {
    const state = await start(page, { width });
    await locked(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path:info.outputPath('SYNTHETIC-brief-locked-'+width+'.png'), fullPage:true });
    await unlock(page);
    await ready(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path:info.outputPath('SYNTHETIC-brief-supervisor-'+width+'.png'), fullPage:true });
    expect(state.errors).toEqual([]);
  });
}

test('JavaScript disabled leaves the direct brief URL locked', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled:false, viewport:{ width:390, height:900 } });
  const page = await context.newPage(), externalRequests = [];
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === new URL(base).origin) return route.continue();
    externalRequests.push(route.request().url());
    return route.abort();
  });
  try {
    await page.goto(base+'tradein-brief.html?month=2026-10');
    await locked(page);
    expect(externalRequests).toEqual([]);
  } finally {
    await context.close();
  }
});
