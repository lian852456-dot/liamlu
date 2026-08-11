const { test, expect } = require('@playwright/test');
const path = require('node:path');

const FORMAL_FILE_URL = process.env.LIAM_APP_BASE_URL || `file://${path.resolve(__dirname, '../app.html')}`;
const FILE_URL = `${FORMAL_FILE_URL}${FORMAL_FILE_URL.includes('?')?'&':'?'}preview=1`;

test.use({ viewport:{ width:390, height:844 }, serviceWorkers:'block' });

test('formal mode boots without Preview data or JavaScript errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(FORMAL_FILE_URL);
  await expect(page.locator('#dataMode')).toHaveText('解鎖正式資料');
  await expect(page.locator('#previewBanner')).toBeHidden();
  await expect(page.locator('#viewerState')).toHaveText('未登入');
  await expect(page.locator('#kpiHero')).toContainText('解鎖正式資料');
  expect(errors).toEqual([]);
});

test('390x844 home gives the supervisor summary without horizontal overflow', async ({ page }) => {
  let formalRequests = 0;
  await page.route('https://script.google.com/**', route => { formalRequests += 1; return route.abort(); });
  await page.goto(FILE_URL);
  await expect(page).toHaveTitle('Liam Supervisor App 1.1');
  await expect(page.locator('#dataMode')).toHaveText('Preview／示意資料');
  await expect(page.locator('#previewBanner')).toContainText('非正式營運數據');
  await expect(page.locator('#operationsRows')).toContainText('16:00');
  await expect(page.locator('#operationsRows')).toContainText('21:00');
  await expect(page.locator('#kpiHero')).toContainText('113.1%');
  await expect(page.locator('.store-item')).toHaveCount(9);
  await expect(page.locator('#awardHome .award-row:not(.header)')).toHaveCount(9);
  await expect(page.locator('#awardHome')).not.toContainText('Top 1');
  await expect(page.locator('#awardHome')).not.toContainText('Top 2');
  await expect(page.locator('#awardHome')).not.toContainText('區領獎總額');
  const kpiValues = await page.locator('.store-row .store-metric b').allTextContents();
  expect(kpiValues.every(value => value && !value.includes('...'))).toBe(true);
  const rowHeights = await page.locator('.store-row').evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
  expect(rowHeights.every(height => height >= 44)).toBe(true);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(formalRequests).toBe(0);
});

test('store rows, battle modes, report rows, schedule and patrol dashboard are interactive', async ({ page }) => {
  await page.goto(FILE_URL);
  const secondStore = page.locator('.store-item').nth(1);
  await secondStore.locator('.store-row').click();
  await expect(secondStore).toHaveClass(/expanded/);
  await expect(secondStore.locator('.core-cell')).toHaveCount(6);

  await page.locator('.bottom-nav [data-nav="battle"]').click();
  await expect(page.locator('[data-view="battle"]')).toBeVisible();
  await expect(page.locator('#battleContent')).toContainText('九店比較');
  await page.locator('[data-battle-kind="award"]').click();
  await expect(page.locator('#battleContent .award-battle-row:not(.header)')).toHaveCount(9);
  await expect(page.locator('#battleContent')).not.toContainText('區領獎總額');
  await expect(page.locator('#battleContent')).not.toContainText('Top 1');
  await page.locator('[data-battle-scope="store"]').click();
  await expect(page.locator('#battleStorePicker')).toBeVisible();
  await expect(page.locator('#battleContent')).toContainText('店領獎金額');

  await page.locator('.bottom-nav [data-nav="report"]').click();
  await page.locator('[data-report-segment="21"]').click();
  await expect(page.locator('#reportOverview')).toContainText('5/9');
  const firstReportStore = page.locator('.report-store').first();
  await firstReportStore.locator('button').click();
  await expect(firstReportStore).toHaveClass(/expanded/);

  await page.locator('.bottom-nav [data-nav="schedule"]').click();
  await expect(page.locator('[data-view="schedule"]')).toBeVisible();
  await page.locator('#scheduleDate').fill('2026-08-10');
  await page.locator('#scheduleDate').dispatchEvent('change');
  await expect(page.locator('#scheduleList .schedule-store')).toHaveCount(9);
  await expect(page.locator('[data-profile-entry]')).toBeVisible();

  await page.locator('.bottom-nav [data-nav="patrol"]').click();
  await expect(page.locator('[data-view="patrol"]')).toBeVisible();
  await expect(page.locator('#patrolOverview')).toContainText('本月已巡店數');
  await expect(page.locator('#patrolOverview')).toContainText('6');
  await expect(page.locator('#patrolTodayDetail')).toContainText('下一站');
});

test('formal unlock is explicit and does not load summaries before Approved Device succeeds', async ({ page }) => {
  const actions = [];
  await page.route('https://script.google.com/**', async route => {
    const payload = JSON.parse(route.request().postData() || '{}');
    actions.push(payload.action);
    await route.fulfill({ json:{ status:'error', message:'此員編尚未核准此裝置，請先「首次申請綁定」並等待督導核准' } });
  });
  await page.goto(FORMAL_FILE_URL);
  await page.locator('#dataMode').click();
  await expect(page.locator('[data-view="me"]')).toBeVisible();
  await page.locator('#employeeId').fill('TEST01');
  await page.locator('#privateAccessForm').getByRole('button').click();
  await expect(page.locator('#dataMode')).toHaveText('裝置待核准');
  await expect(page.locator('#privateDeviceStatus')).toHaveText('此 iPhone App 裝置待核准');
  await expect(page.locator('#privateAccessMessage')).toContainText('此 iPhone App 裝置待核准');
  expect(actions).toEqual(['private_access']);
  const stored = await page.evaluate(() => ({ employee:localStorage.getItem('north12b_private_dashboard_employee_id'), device:Boolean(localStorage.getItem('north12b_private_dashboard_device_id')) }));
  expect(stored).toEqual({ employee:'TEST01', device:true });
  await page.locator('#privateLogout').click();
  const afterLogout = await page.evaluate(() => ({ employee:localStorage.getItem('north12b_private_dashboard_employee_id'), device:Boolean(localStorage.getItem('north12b_private_dashboard_device_id')) }));
  expect(afterLogout).toEqual({ employee:null, device:true });
});

test('existing device request flow clears the activation code and reports pending', async ({ page }) => {
  let submittedCode = '';
  await page.route('https://script.google.com/**', async route => {
    const payload = JSON.parse(route.request().postData() || '{}');
    if (payload.action === 'private_request') {
      submittedCode = payload.bootstrapCode;
      await route.fulfill({ json:{ status:'ok', requestStatus:'pending' } });
      return;
    }
    await route.fulfill({ json:{ status:'ok', requestStatus:'pending' } });
  });
  await page.goto(FORMAL_FILE_URL + '#me');
  await page.locator('#employeeId').fill('TEST01');
  await page.locator('#privateBindingDetails').click();
  await page.locator('#bootstrapCode').fill('654321');
  await page.locator('#privateBindingForm').getByRole('button').click();
  await expect(page.locator('#bootstrapCode')).toHaveValue('');
  await expect(page.locator('#privateDeviceStatus')).toHaveText('此 iPhone App 裝置待核准');
  expect(submittedCode).toBe('654321');
  const storedValues = await page.evaluate(() => {
    const values = storage => Array.from({ length:storage.length }, (_,index) => storage.getItem(storage.key(index)));
    return [...values(localStorage), ...values(sessionStorage)];
  });
  expect(storedValues).not.toContain('654321');
});

test('patrol passcode exists only during submission and only the short token persists', async ({ page }) => {
  let submittedPasscode = '';
  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      submittedPasscode = payload.key || '';
      await route.fulfill({ json:{ status:'ok', token:'short-lived-test-token' } });
      return;
    }
    const action = new URL(request.url()).searchParams.get('action');
    await route.fulfill({ json:action === 'sread' ? { status:'ok', schedule:{ month:'2026-08', stores:[] } } : { status:'ok', records:[] } });
  });
  await page.goto(FORMAL_FILE_URL + '#me');
  await page.locator('#patrolPasscode').fill('test-passcode');
  await page.locator('#patrolAccessForm').getByRole('button').click();
  await expect(page.locator('#patrolPasscode')).toHaveValue('');
  await expect(page.locator('#patrolAccessMessage')).toContainText('短效 session 已驗證');
  expect(submittedPasscode).toBe('test-passcode');
  const storage = await page.evaluate(() => {
    const values = target => Array.from({ length:target.length }, (_,index) => target.getItem(target.key(index)));
    return { local:values(localStorage), session:values(sessionStorage) };
  });
  expect(storage.local).not.toContain('test-passcode');
  expect(storage.session).not.toContain('test-passcode');
  expect(storage.session).toContain('short-lived-test-token');
});
