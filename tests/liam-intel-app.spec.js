const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { patrolSummaryResponse } = require('./fixtures/patrol-summary-response.cjs');

const PAGE_URL = process.env.LIAM_PILOT_URL || (process.env.TEST_BASE_URL
  ? new URL('app.html',process.env.TEST_BASE_URL).href
  : 'file://' + path.resolve(__dirname, '../app.html'));
const PREVIEW_URL = `${PAGE_URL}${PAGE_URL.includes('?') ? '&' : '?'}preview=1`;
const stores = ['酒泉', '萬大', '大稻埕', '復興南', '三創', '杭州南', '永吉', '通化', '六張犁'];

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });

test('mobile App 1.1 has no horizontal overflow and exposes all five tabs', async ({ page }) => {
  const consoleErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  await page.goto(PREVIEW_URL);
  await expect(page.locator('.bottom-nav button')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const button of await page.locator('.bottom-nav button').all()) {
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await expect(page.locator('#operationsTitle')).toHaveText('16:00 與 21:00 回報狀態');
  await expect(page.locator('#kpiHero')).toContainText('KPI DOD');
  await expect(page.locator('#awardHome')).toContainText('台獎總覽');
  await expect(page.locator('#awardHome .award-row:not(.header)')).toHaveCount(9);
  expect(consoleErrors).toEqual([]);
  await page.screenshot({ path: 'test-output/liam-supervisor-pilot-mobile.png', fullPage: true });
});

test('existing short session renders real-shape schedule and patrol data read-only', async ({ page }) => {
  const patrolRows = stores.map((store, index) => ({
    fillTime: `2026/8/${index + 1} 10:00`, arriveTime: `2026/8/${index + 1} 10:00`, store,
    code: String(index + 1), item: 2, result: index === 0 ? '' : 'v', reason: index === 0 ? '待追蹤' : '', month: '2026-08', savedAt: `2026/8/${index + 1} 11:00`
  }));
  const configuredStores=stores.map((name,index)=>({name,code:String(index+1)}));
  const patrolSummary=patrolSummaryResponse('2026-08',patrolRows,new Date('2026-08-09T12:00:00+08:00'),configuredStores);
  await page.addInitScript(({ stores, patrolSummary }) => {
    sessionStorage.setItem('bei12b_patrol_session_token_v2', 'test-short-token');
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
    const response = body => ({ ok:true, status:200, headers:{ get:()=>'application/json' }, text:async()=>JSON.stringify(body) });
    window.fetch = async (input, options = {}) => {
      if (options.method === 'POST') {
        const payload=JSON.parse(String(options.body||'{}'));
        if(payload.action==='ptsummary') return response(patrolSummary);
        return response({ status: 'ok', token: 'renewed-short-token' });
      }
      const url = String(input);
      if (url.includes('action=sread')) return response({ status: 'ok', schedule: { month: '2026-08', rocMonth: '民國115年08月', stores: scheduleStores } });
      if (url.includes('action=ptsummary')) return response(patrolSummary);
      if (url.includes('action=ptvisit_read')) return response({ status:'ok', events:[], openVisit:null });
      throw new Error(`unexpected request ${url}`);
    };
  }, { stores, patrolSummary });

  await page.goto(PAGE_URL);
  await page.locator('[data-nav="schedule"]').last().click();
  await expect(page.locator('#scheduleList .schedule-store')).toHaveCount(9);
  await expect(page.locator('#scheduleSourceTime')).not.toHaveText('尚未讀取');

  await page.locator('#scheduleStoreFilter').selectOption('酒泉');
  await expect(page.locator('.schedule-store')).toHaveCount(1);
  const initialDate = await page.locator('#scheduleDate').inputValue();
  await page.locator('[data-date-step="-1"]').click();
  const expectedPrevious = new Date(`${initialDate}T12:00:00Z`);
  expectedPrevious.setUTCDate(expectedPrevious.getUTCDate() - 1);
  await expect(page.locator('#scheduleDate')).toHaveValue(expectedPrevious.toISOString().slice(0, 10));
  await page.locator('[data-date-today]').click();
  await expect(page.locator('#scheduleDate')).toHaveValue(initialDate);

  await page.locator('[data-nav="patrol"]').last().click();
  await expect(page.locator('#patrolStoreList .patrol-store-row')).toHaveCount(9);
  await expect(page.locator('#patrolOverview')).toContainText('本期已巡店數');
  await expect(page.getByRole('heading', { name: '最近巡店紀錄' })).toBeVisible();
  await expect(page.getByRole('link', { name: '完整巡店看板' })).toBeVisible();
});

test('profile and settings moved outside bottom navigation', async ({ page }) => {
  await page.goto(PAGE_URL);
  await expect(page.locator('.bottom-nav [data-nav="me"]')).toHaveCount(0);
  await page.locator('[data-profile-entry]').click();
  await expect(page.getByRole('heading', { name: '個人與系統設定' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '班表／巡店' })).toBeVisible();
  await expect(page.getByRole('heading', { name: '系統狀態' })).toBeVisible();
});
