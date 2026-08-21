const { test, expect } = require('@playwright/test');
const path = require('path');
const { patrolSummaryResponse } = require('./fixtures/patrol-summary-response.cjs');

const PAGE_URL = 'file://' + path.resolve(__dirname, '../patrol.html');
const GAS_PATTERN = 'https://script.google.com/**';
const VALID_KEY = 'correct-test-key';
const SESSION_TOKEN = 'test-session-token';
const PROTECTED_ACTIONS = new Set(['debug', 'ptread', 'ptsummary', 'ptdetail', 'ptwrite', 'ptvisit_read', 'sread', 'hread', 'hwrite']);

async function installAuthGas(page, options = {}) {
  const state = {
    authCalls: 0,
    protectedCalls: [],
    writes: 0,
    configured: options.configured !== false,
  };
  await page.route(GAS_PATTERN, async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      if (payload.action === 'ptauth') {
        state.authCalls++;
        const valid = state.configured && (payload.key === VALID_KEY || payload.token === SESSION_TOKEN);
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(valid
            ? { status: 'ok', token: SESSION_TOKEN, expiresIn: 1800, sessionContract:'patrol-session-v2' }
            : { status: 'error', message: 'unauthorized', reason:'AUTH_CREDENTIAL_INVALID' }),
        });
      }
      if (payload.action === 'ptlogout') {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
      }
      if (payload.action === 'ptsummary' || payload.action === 'ptdetail') {
        const valid = payload.token === SESSION_TOKEN;
        state.protectedCalls.push({ action:payload.action, valid });
        const result = !valid ? { status:'error', message:'unauthorized', reason:'AUTH_TOKEN_INVALID' }
          : payload.action === 'ptsummary' ? patrolSummaryResponse(payload.month || '2026-08')
          : { status:'ok', rows:[], totalRows:0, page:1, limit:50 };
        return route.fulfill({ contentType:'application/json', body:JSON.stringify(result) });
      }
      if (payload.action === 'half_media_upload') {
        const valid = payload.token === SESSION_TOKEN;
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(valid
            ? { status: 'ok', media: { id: 'm1', name: 'm1.jpg', mimeType: 'image/jpeg' } }
            : { status: 'error', message: 'unauthorized', reason:'AUTH_TOKEN_INVALID' }),
        });
      }
    }

    const url = new URL(request.url());
    const action = url.searchParams.get('action');
    const callback = url.searchParams.get('callback');
    const valid = url.searchParams.get('token') === SESSION_TOKEN;
    let result;
    if (action === 'ping') {
      result = { status: 'ok' };
    } else if (action === 'pthealth') {
      result = { status: 'ok', configured: state.configured, contract: 'patrol-auth-v3', sessionContract:'patrol-session-v2', authDeployment:'test' };
    } else if (PROTECTED_ACTIONS.has(action)) {
      state.protectedCalls.push({ action, valid });
      if (!valid) {
        result = { status: 'error', message: 'unauthorized', reason:'AUTH_TOKEN_INVALID' };
      } else if (action === 'ptsummary') {
        result = patrolSummaryResponse(url.searchParams.get('month') || '2026-08');
      } else if (action === 'sread') {
        result = { status: 'ok', schedule: { month: '2026-07', stores: [] } };
      } else if (action === 'hread') {
        result = { status: 'ok', rows: [] };
      } else {
        state.writes++;
        result = { status: 'ok', written: 1 };
      }
    } else {
      result = { status: 'error', message: 'unknown action' };
    }
    const body = JSON.stringify(result);
    return route.fulfill({
      contentType: callback ? 'application/javascript' : 'application/json',
      body: callback ? `${callback}(${body})` : body,
    });
  });
  return state;
}

async function unlock(page, key) {
  await page.locator('#patrolPasscode').fill(key);
  await page.getByRole('button', { name: '驗證並進入' }).click();
  await expect(page.locator('#patrolAuthSubmit')).toBeEnabled();
}

test('新無痕頁面只建立全頁鎖定畫面，驗證前不載入敏感資料', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const state = await installAuthGas(page);
  await page.goto(PAGE_URL);

  await expect(page.locator('#patrolAuthGate')).toBeVisible();
  await expect(page.locator('#patrolAppHost')).toBeEmpty();
  await expect(page.locator('#pasteBox')).toHaveCount(0);
  await expect(page.locator('#mileageView')).toHaveCount(0);
  await expect(page.getByText('台北通化')).toHaveCount(0);
  expect(state.authCalls).toBe(0);
  expect(state.protectedCalls).toEqual([]);
  await context.close();
});

test('空白密碼不送往後端且維持全頁鎖定', async ({ page }) => {
  const state = await installAuthGas(page);
  await page.goto(PAGE_URL);
  await page.getByRole('button', { name: '驗證並進入' }).click();
  await expect(page.locator('#patrolAuthGate')).toBeVisible();
  await expect(page.locator('#patrolAppHost')).toBeEmpty();
  expect(state.authCalls).toBe(0);
  expect(state.protectedCalls).toEqual([]);
});

test('錯誤密碼連續兩次都鎖定，且不保存或讀取資料', async ({ page }) => {
  const state = await installAuthGas(page);
  await page.goto(PAGE_URL);
  await unlock(page, 'wrong-one');
  await expect(page.locator('#patrolAuthGate')).toBeVisible();
  await unlock(page, 'wrong-two');
  await expect(page.locator('#patrolAuthGate')).toBeVisible();
  await expect(page.locator('#patrolAppHost')).toBeEmpty();

  const storage = await page.evaluate(() => ({
    localKey: localStorage.getItem('bei12b_pt_key'),
    sessionToken: sessionStorage.getItem('bei12b_patrol_session_token_v2'),
    legacyEndpoint: localStorage.getItem('bei12b_pt_key_endpoint'),
  }));
  expect(storage).toEqual({ localKey: null, sessionToken: null, legacyEndpoint: null });
  expect(state.authCalls).toBe(2);
  expect(state.protectedCalls).toEqual([]);
});

test('手動偽造 localStorage PT_KEY 並重新整理仍不會解鎖', async ({ page }) => {
  const state = await installAuthGas(page);
  await page.addInitScript(() => {
    localStorage.setItem('bei12b_pt_key', 'forged');
    localStorage.setItem('bei12b_pt_key_endpoint', 'forged-endpoint');
  });
  await page.goto(PAGE_URL);
  await expect(page.locator('#patrolAuthGate')).toBeVisible();
  await expect(page.locator('#patrolAppHost')).toBeEmpty();
  expect(state.authCalls).toBe(0);
  expect(state.protectedCalls).toEqual([]);
});

test('正確密碼取得後端 token 後才建立看板並載入資料', async ({ page }) => {
  const state = await installAuthGas(page);
  await page.goto(PAGE_URL);
  await unlock(page, VALID_KEY);

  await expect(page.locator('#patrolAuthGate')).toBeHidden();
  await expect(page.locator('#pasteBox')).toBeVisible();
  await expect(page.locator('#mileageView')).toHaveCount(1);
  await expect(page.locator('#patrolAppHost #content')).toBeVisible();
  await expect(page.locator('#patrolAppHost #invPanels')).toContainText('通化');
  await expect.poll(() => state.protectedCalls.filter(call => call.action === 'ptsummary').length).toBe(1);
  expect(state.protectedCalls.every(call => call.valid)).toBe(true);
  const storage = await page.evaluate(() => ({
    localKey: localStorage.getItem('bei12b_pt_key'),
    sessionToken: sessionStorage.getItem('bei12b_patrol_session_token_v2'),
  }));
  expect(storage).toEqual({ localKey: null, sessionToken: SESSION_TOKEN });
});

test('API timeout 與 deployment mismatch 都保留 session 且不開啟重新驗證', async ({ page }) => {
  await installAuthGas(page);
  await page.goto(PAGE_URL);
  await unlock(page, VALID_KEY);

  const result = await page.evaluate(async () => {
    const timeout = await patrolRequestWithReauth(() => Promise.reject(new Error('巡店資料讀取逾時')))
      .then(() => '').catch(error => error.message);
    const mismatch = await patrolRequestWithReauth(() => Promise.resolve({status:'error',message:'unauthorized',reason:'AUTH_DEPLOYMENT_MISMATCH'}));
    return {
      timeout,
      mismatch,
      token:sessionStorage.getItem('bei12b_patrol_session_token_v2'),
      modalHidden:document.getElementById('patrolReauthModal').hidden
    };
  });
  expect(result.timeout).toBe('巡店資料讀取逾時');
  expect(result.mismatch.message).toContain('正式部署版本不相容');
  expect(result.token).toBe(SESSION_TOKEN);
  expect(result.modalHidden).toBe(true);
});

test('多個同時過期 request 共用 single-flight reauth 且各只重播一次', async ({ page }) => {
  const state=await installAuthGas(page);
  await page.goto(PAGE_URL);
  await unlock(page, VALID_KEY);
  await page.evaluate(() => {
    let firstCalls=0;let secondCalls=0;
    window.__reauthCounts=()=>({firstCalls,secondCalls});
    window.__reauthPromise=Promise.all([
      patrolRequestWithReauth(() => Promise.resolve(++firstCalls===1?{status:'error',message:'unauthorized',reason:'AUTH_SESSION_EXPIRED'}:{status:'ok'})),
      patrolRequestWithReauth(() => Promise.resolve(++secondCalls===1?{status:'error',message:'unauthorized',reason:'AUTH_SESSION_EXPIRED'}:{status:'ok'}))
    ]);
  });
  await expect(page.locator('#patrolReauthModal')).toBeVisible();
  await page.locator('#patrolReauthPasscode').fill(VALID_KEY);
  await page.getByRole('button',{name:'重新驗證並繼續同步'}).click();
  await expect(page.locator('#patrolReauthModal')).toBeHidden();
  expect(await page.evaluate(() => window.__reauthPromise.then(results => ({results,counts:window.__reauthCounts()})))).toEqual({
    results:[{status:'ok'},{status:'ok'}],counts:{firstCalls:2,secondCalls:2}
  });
  expect(state.authCalls).toBe(2);
});

test('登出立即移除督導 DOM 與 session，重新載入後再次鎖定', async ({ page }) => {
  await installAuthGas(page);
  await page.goto(PAGE_URL);
  await unlock(page, VALID_KEY);
  await expect(page.locator('#pasteBox')).toBeVisible();
  await page.getByRole('button', { name: '登出' }).click();

  await expect(page.locator('#patrolAuthGate')).toBeVisible();
  await expect(page.locator('#patrolAppHost')).toBeEmpty();
  await expect(page.locator('#mileageView')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('bei12b_patrol_session_token_v2'))).toBeNull();
  await page.reload();
  await expect(page.locator('#patrolAuthGate')).toBeVisible();
  await expect(page.locator('#patrolAppHost')).toBeEmpty();
});

test('服務未設定 PT_KEY 時維持鎖定並顯示管理者設定錯誤', async ({ page }) => {
  await installAuthGas(page, { configured: false });
  await page.goto(PAGE_URL);
  await unlock(page, VALID_KEY);
  await expect(page.locator('#patrolAuthGate')).toBeVisible();
  await expect(page.locator('#patrolAuthMessage')).toContainText('管理者尚未完成安全設定');
  await expect(page.locator('#patrolAppHost')).toBeEmpty();
});
