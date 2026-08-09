const { test, expect } = require('@playwright/test');
const path = require('node:path');

const PAGE_URL = process.env.LIAM_PILOT_URL || ('file://' + path.resolve(__dirname, '../app.html'));
const stores = ['酒泉', '萬大', '大稻埕', '復興南', '三創', '杭州南', '永吉', '通化', '六張犁'];

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

test('mobile Pilot has no horizontal overflow and exposes all five tabs', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(PAGE_URL);
  await expect(page.locator('.bottom-nav button')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const button of await page.locator('.bottom-nav button').all()) {
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.getByRole('heading', { name: 'KPI' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '台獎' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '16:00／21:00 回報' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
  await page.screenshot({ path: 'test-output/liam-supervisor-pilot-mobile.png', fullPage: true });
});

test('existing short session renders real-shape schedule and patrol data read-only', async ({ page }) => {
  await page.addInitScript(({ stores }) => {
    sessionStorage.setItem('bei12b_pt_session_token', 'test-short-token');
    const scheduleStores = stores.map((store, index) => ({
      store,
      title: store,
      staff: [],
      days: [{
        date: '2026-08-09',
        staff: [
          { name: `同仁${index + 1}`, role: index === 0 ? '店長' : '業代', status: 'A班', working: true },
          { name: `休假${index + 1}`, role: '業代', status: '休', working: false }
        ],
        managers: [{ name: `同仁${index + 1}`, role: index === 0 ? '店長' : '業代', status: 'A班', working: true }],
        workingStaff: [{ name: `同仁${index + 1}`, role: index === 0 ? '店長' : '業代', status: 'A班', working: true }]
      }]
    }));
    const patrolRows = stores.map((store, index) => ({
      fillTime: `2026/8/${index + 1} 10:00`, arriveTime: `2026/8/${index + 1} 10:00`, store,
      code: String(index + 1), item: 2, result: index === 0 ? '' : 'v', reason: index === 0 ? '待追蹤' : '', month: '2026-08', savedAt: `2026/8/${index + 1} 11:00`
    }));
    window.fetch = async (input, options = {}) => {
      if (options.method === 'POST') return { json: async () => ({ status: 'ok', token: 'renewed-short-token' }) };
      const url = String(input);
      if (url.includes('action=sread')) return { json: async () => ({ status: 'ok', schedule: { month: '2026-08', rocMonth: '民國115年08月', stores: scheduleStores } }) };
      if (url.includes('action=ptread')) return { json: async () => ({ status: 'ok', stores: stores.map((name, index) => ({ name, code: String(index + 1) })), rows: patrolRows }) };
      throw new Error(`unexpected request ${url}`);
    };
  }, { stores });

  await page.goto(PAGE_URL);
  await expect(page.getByText('班表／巡店 session 已驗證')).toBeVisible();
  await expect(page.locator('.schedule-store')).toHaveCount(9);
  await expect(page.locator('#patrolSummary .patrol-store')).toHaveCount(9);
  await expect(page.getByText('同仁1')).toBeVisible();
  await expect(page.getByText('休假1')).toBeVisible();
  await expect(page.locator('#scheduleUpdatedAt')).toContainText('updatedAt');
  await expect(page.locator('#patrolUpdatedAt')).toContainText('updatedAt');

  await page.locator('#scheduleStoreFilter').selectOption('酒泉');
  await expect(page.locator('.schedule-store')).toHaveCount(1);
  await page.locator('#patrolStoreFilter').selectOption('酒泉');
  await expect(page.locator('#patrolSummary .patrol-store')).toHaveCount(1);

  await page.locator('[data-date-step="-1"]').click();
  await expect(page.locator('#scheduleDate')).toHaveValue('2026-08-08');
  await page.locator('[data-date-today]').click();
  await expect(page.locator('#scheduleDate')).toHaveValue('2026-08-09');

  await page.locator('[data-nav="patrol"]').last().click();
  await expect(page.getByRole('heading', { name: '最近巡店紀錄' })).toBeVisible();
  await expect(page.getByRole('link', { name: '前往完整巡店看板' })).toBeVisible();
});

test('my page exposes today schedule without extra architecture', async ({ page }) => {
  await page.goto(PAGE_URL);
  await page.locator('[data-nav="me"]').last().click();
  await expect(page.getByRole('heading', { name: '我的' })).toBeVisible();
  await expect(page.getByRole('link', { name: /今日班表/ })).toBeVisible();
  await expect(page.getByText('單人、正式、唯讀整合')).toBeVisible();
});
