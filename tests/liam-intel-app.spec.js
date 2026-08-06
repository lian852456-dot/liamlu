const { test, expect } = require('@playwright/test');
const path = require('node:path');

const PAGE_URL = 'file://' + path.resolve(__dirname, '../app.html');

test.use({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 1 });

test('mobile App shell has no horizontal overflow and exposes all five tabs', async ({ page }) => {
  await page.goto(PAGE_URL);
  await expect(page.locator('.bottom-nav button')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const button of await page.locator('.bottom-nav button').all()) {
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: 'test-output/liam-intel-app-mobile.png', fullPage: true });
});

test('supervisor preview exposes the command center without pretending to authenticate', async ({ page }) => {
  await page.goto(PAGE_URL);
  await page.locator('[data-nav="me"]').last().click();
  await expect(page.locator('.command-card')).toBeHidden();
  await page.locator('.preview-toggle').click();
  await expect(page.locator('.command-card')).toBeVisible();
  await expect(page.getByText('只切換靜態 UI，不會建立登入或變更權限。')).toBeVisible();
  await page.locator('.command-card').click();
  await expect(page.getByRole('heading', { name: 'Liam AI 指揮室' })).toBeVisible();
});
