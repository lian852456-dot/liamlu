const { test, expect } = require('@playwright/test');
const path = require('node:path');
const questionVersions = require('../patrol-question-versions.js');
const { patrolSummaryResponse, stores } = require('./fixtures/patrol-summary-response.cjs');

const PAGE_URL = 'file://' + path.resolve(__dirname, '../patrol.html');
const GAS_PATTERN = 'https://script.google.com/**';
const VALID_KEY = 'synthetic-patrol-key';
const SESSION_TOKEN = 'synthetic-session-token';
const SESSION_STORAGE_KEY = 'bei12b_patrol_session_token_v2';
const SUMMARY_CACHE_KEY = 'patrol-summary-safe-v1:sep25-v-only-two-visits-7d-v1:2026-09';
const READ_UNAVAILABLE = '巡店後端暫時無回應，已自動重試3次。session仍保留，可按重新連線，不需要登出。';

const legacySummaryRows = [{
  fillTime: '2026/9/1 10:00', arriveTime: '2026/9/1 10:00', leaveTime: '',
  district: 'synthetic', code: stores[0].code, store: stores[0].name,
  inspector: 'synthetic inspector', item: 1, result: 'V', reason: '', month: '2026-09'
}];

function syntheticDashboard() {
  const rows = stores.slice(0, 4).flatMap(store => ['2026-09-01', '2026-09-09'].flatMap(date => (
    Array.from({length: 25}, (_, index) => ({
      fillTime: `${date} 10:00`, arriveTime: `${date} 10:00`,
      store: store.name, code: store.code, item: index + 1, result: 'V'
    }))
  )));
  return {
    status: 'ok', contract: 'patrol-dashboard-sep25-v1', version: 1,
    month: '2026-09', months: ['2026-09'], storeCount: 9, maxRows: 5000,
    rowCount: rows.length, sourceRowCount: rows.length, stores,
    summary: questionVersions.overview(rows, stores, '2026-09')
  };
}

async function installFastReadRetry(page) {
  await page.addInitScript(() => {
    const originalSetTimeout = window.setTimeout.bind(window);
    window.setTimeout = (callback, delay, ...args) => originalSetTimeout(
      callback, delay === 2000 || delay === 5000 ? 0 : delay, ...args
    );
  });
}

async function installReadGas(page, options = {}) {
  const state = {
    authCalls: 0,
    logoutCalls: 0,
    dashboardCalls: 0,
    summaryCalls: 0,
    detailCalls: 0,
    actions: [],
    dashboardMode: options.dashboardMode || 'unknown',
    summary404Count: options.summary404Count || 0,
    summaryAlways404: Boolean(options.summaryAlways404),
    holdSummary: false,
    summaryRelease: null,
    summaryGate: null
  };
  await page.route(GAS_PATTERN, async route => {
    const request = route.request();
    const method = request.method();
    if (method === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      const action = String(payload.action || '');
      state.actions.push(action);
      if (action === 'ptauth') {
        state.authCalls++;
        const valid = payload.key === VALID_KEY || payload.token === SESSION_TOKEN;
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(valid
            ? {status: 'ok', token: SESSION_TOKEN, expiresIn: 1800, sessionContract: 'patrol-session-v2'}
            : {status: 'error', message: 'unauthorized', reason: 'AUTH_CREDENTIAL_INVALID'})
        });
      }
      if (action === 'ptlogout') {
        state.logoutCalls++;
        return route.fulfill({contentType: 'application/json', body: JSON.stringify({status: 'ok'})});
      }
      if (action === 'ptdashboard') {
        state.dashboardCalls++;
        const body = state.dashboardMode === 'ok'
          ? syntheticDashboard()
          : {status: 'error', message: 'unknown action'};
        return route.fulfill({contentType: 'application/json', body: JSON.stringify(body)});
      }
      if (action === 'ptsummary') {
        state.summaryCalls++;
        if (state.holdSummary) {
          state.holdSummary = false;
          state.summaryGate = new Promise(resolve => { state.summaryRelease = resolve; });
          await state.summaryGate;
        }
        const fail = state.summaryAlways404 || state.summaryCalls <= state.summary404Count;
        if (fail) {
          return route.fulfill({
            status: 404, contentType: 'application/json',
            body: JSON.stringify({status: 'error', message: 'temporary synthetic 404'})
          });
        }
        return route.fulfill({
          contentType: 'application/json', body: JSON.stringify(patrolSummaryResponse('2026-09', legacySummaryRows))
        });
      }
      if (action === 'ptdetail') {
        state.detailCalls++;
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({status: 'ok', rows: [], totalRows: 0, page: payload.page || 1, limit: payload.limit || 100})
        });
      }
      return route.fulfill({
        contentType: 'application/json', body: JSON.stringify({status: 'error', message: 'unknown action'})
      });
    }

    const url = new URL(request.url());
    const action = url.searchParams.get('action');
    state.actions.push(action);
    if (action === 'ping') {
      return route.fulfill({contentType: 'application/json', body: JSON.stringify({status: 'ok'})});
    }
    if (action === 'pthealth') {
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({status: 'ok', configured: true, contract: 'patrol-auth-v3', sessionContract: 'patrol-session-v2', authDeployment: 'synthetic'})
      });
    }
    return route.fulfill({contentType: 'application/json', body: JSON.stringify({status: 'error', message: 'unknown action'})});
  });
  return state;
}

async function unlock(page) {
  await page.locator('#patrolPasscode').fill(VALID_KEY);
  await page.getByRole('button', {name: '驗證並進入'}).click();
  await expect(page.locator('#patrolAuthSubmit')).toBeEnabled();
}

async function seedSessionAndSummary(page) {
  await page.addInitScript(({tokenKey, token, cacheKey, cache}) => {
    sessionStorage.setItem(tokenKey, token);
    sessionStorage.setItem(cacheKey, JSON.stringify(cache));
  }, {
    tokenKey: SESSION_STORAGE_KEY,
    token: SESSION_TOKEN,
    cacheKey: SUMMARY_CACHE_KEY,
    cache: {
      month: '2026-09', contract: 'sep25-v-only-two-visits-7d-v1',
      updatedAt: '2026-09-15T01:00:00.000Z', totalStores: 9,
      visitedStores: 4, fullyDoneStores: 4
    }
  });
}

test('ptsummary 404 then success recovers without reauth and safely falls back from unknown ptdashboard', async ({browser}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installFastReadRetry(page);
  const state = await installReadGas(page, {summary404Count: 1});
  await page.goto(PAGE_URL);
  await unlock(page);

  await expect(page.locator('#patrolAuthGate')).toBeHidden();
  await expect(page.locator('#patrolReauthModal')).toBeHidden();
  await expect(page.locator('#sep25Dashboard')).toBeVisible();
  await expect(page.locator('#sep25LoadState')).toContainText('正式 ptdetail 唯讀驗證完成');
  await expect.poll(() => state.summaryCalls).toBe(2);
  expect(state.dashboardCalls).toBe(1);
  expect(state.detailCalls).toBeGreaterThan(0);
  expect(state.authCalls).toBe(1);
  expect(state.logoutCalls).toBe(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), SESSION_STORAGE_KEY)).toBe(SESSION_TOKEN);
  await context.close();
});

test('valid ptdashboard response renders the complete summary with one request and no ptdetail calls', async ({browser}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installFastReadRetry(page);
  const state = await installReadGas(page, {dashboardMode: 'ok'});
  await page.goto(PAGE_URL);
  await unlock(page);

  await expect(page.locator('#patrolAuthGate')).toBeHidden();
  await expect(page.locator('#sep25Dashboard')).toBeVisible();
  await expect(page.locator('#sep25LoadState')).toContainText('正式 ptdashboard 唯讀驗證完成');
  await expect(page.locator('#sep25Overview')).toContainText('4');
  await expect(page.locator('#sep25Overview')).toContainText('本月有到店');
  await expect(page.locator('#sep25Overview')).toContainText('25 項完成店數');
  await expect.poll(() => state.dashboardCalls).toBe(1);
  expect(state.summaryCalls).toBe(0);
  expect(state.detailCalls).toBe(0);
  expect(state.authCalls).toBe(1);
  expect(await page.evaluate(key => sessionStorage.getItem(key), SESSION_STORAGE_KEY)).toBe(SESSION_TOKEN);
  await context.close();
});

test('three 404 responses keep the session and cached aggregate summary visible with the specified error', async ({browser}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installFastReadRetry(page);
  await page.addInitScript(({cacheKey}) => {
    sessionStorage.setItem(cacheKey, JSON.stringify({
      month: '2026-09', contract: 'sep25-v-only-two-visits-7d-v1',
      updatedAt: '2026-09-15T01:00:00.000Z', totalStores: 9,
      visitedStores: 4, fullyDoneStores: 2
    }));
  }, {cacheKey: SUMMARY_CACHE_KEY});
  const state = await installReadGas(page, {summaryAlways404: true});
  await page.goto(PAGE_URL);
  await unlock(page);

  await expect(page.locator('#patrolAuthGate')).toBeHidden();
  await expect(page.locator('#sep25LoadState')).toContainText(READ_UNAVAILABLE);
  await expect(page.locator('#sep25Overview')).toContainText('上次成功資料');
  await expect(page.locator('#sep25Overview')).toContainText('本月有到店 4/9 店');
  await expect(page.locator('#sep25Overview')).toContainText('巡店完整完成 2/9 店');
  await expect(page.locator('#patrolReauthModal')).toBeHidden();
  await expect.poll(() => state.summaryCalls).toBe(3);
  expect(state.authCalls).toBe(1);
  expect(state.logoutCalls).toBe(0);
  expect(await page.evaluate(key => sessionStorage.getItem(key), SESSION_STORAGE_KEY)).toBe(SESSION_TOKEN);
  await context.close();
});

test('reload renders only sessionStorage aggregate counts before the backend responds, without personal details', async ({browser}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await installFastReadRetry(page);
  await seedSessionAndSummary(page);
  const state = await installReadGas(page, {dashboardMode: 'ok'});
  await page.goto(PAGE_URL);
  await expect(page.locator('#patrolAuthGate')).toBeHidden();
  await expect(page.locator('#sep25Dashboard')).toBeVisible();
  await expect.poll(() => state.dashboardCalls).toBe(1);
  await expect(page.locator('#sep25LoadState')).toContainText('正式 ptdashboard 唯讀驗證完成');
  await expect(page.locator('#sep25Overview')).toContainText('4');
  await expect(page.locator('#sep25Overview')).toContainText('本月有到店');
  await expect(page.locator('#sep25Overview')).toContainText('巡店完整完成店數');

  state.dashboardMode = 'unknown';
  state.holdSummary = true;
  await page.reload();
  await expect(page.locator('#patrolAuthGate')).toBeHidden();
  await expect(page.locator('#sep25Overview')).toContainText('上次成功資料');
  await expect(page.locator('#sep25Overview')).toContainText('本月有到店 4/9 店');
  await expect(page.locator('#sep25Overview')).toContainText('巡店完整完成 4/9 店');
  const earlyView = await page.locator('#sep25Overview').innerText();
  expect(earlyView).not.toContain('檢查人員');
  expect(earlyView).not.toContain('SYNTHETIC_INSPECTOR');
  expect(earlyView).not.toContain('台北通化');
  expect(await page.evaluate(key => {
    const value = JSON.parse(sessionStorage.getItem(key));
    return Object.keys(value).sort();
  }, SUMMARY_CACHE_KEY)).toEqual([
    'contract', 'fullyDoneStores', 'month', 'totalStores', 'updatedAt', 'visitedStores'
  ]);
  expect(await page.evaluate(key => sessionStorage.getItem(key), SESSION_STORAGE_KEY)).toBe(SESSION_TOKEN);

  state.summaryRelease();
  await expect(page.locator('#sep25LoadState')).toContainText('正式 ptdetail 唯讀驗證完成');
  await context.close();
});
