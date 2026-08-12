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
            ? { status: 'ok', token: SESSION_TOKEN, expiresIn: 1800 }
            : { status: 'error', message: 'unauthorized' }),
        });
      }
      if (payload.action === 'ptlogout') {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
      }
      if (payload.action === 'half_media_upload') {
        const valid = payload.token === SESSION_TOKEN;
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(valid
            ? { status: 'ok', media: { id: 'm1', name: 'm1.jpg', mimeType: 'image/jpeg' } }
            : { status: 'error', message: 'unauthorized' }),
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
      result = { status: 'ok', configured: state.configured, contract: 'patrol-auth-v3' };
    } else if (PROTECTED_ACTIONS.has(action)) {
      state.protectedCalls.push({ action, valid });
      if (!valid) {
        result = { status: 'error', message: 'unauthorized' };
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
    sessionToken: sessionStorage.getItem('bei12b_pt_session_token'),
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
    sessionToken: sessionStorage.getItem('bei12b_pt_session_token'),
  }));
  expect(storage).toEqual({ localKey: null, sessionToken: SESSION_TOKEN });
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
  expect(await page.evaluate(() => sessionStorage.getItem('bei12b_pt_session_token'))).toBeNull();
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
