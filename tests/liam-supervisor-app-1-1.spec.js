const { test, expect } = require('@playwright/test');
const path = require('node:path');

const FILE_URL = `file://${path.resolve(__dirname, '../app.html')}?preview=1`;

test.use({ viewport:{ width:390, height:844 } });

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
  await expect(page.locator('#battleContent')).toContainText('區領獎總額');
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
  await expect(page.locator('#patrolOverview')).toContainText('6/9');
  await expect(page.locator('#patrolTodayDetail')).toContainText('下一站');
});
