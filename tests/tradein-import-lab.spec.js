const { test, expect } = require('@playwright/test');
const path = require('node:path');

const PAGE_URL = 'file://' + path.resolve(__dirname, '../tradein-import-lab.html');

test.use({ serviceWorkers:'block' });

test('3C 與舊換新資料都能在本機上傳、辨識與預覽', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(PAGE_URL);
  await expect(page.getByRole('heading', { name:'3C／舊換新資料匯入測試區' })).toBeVisible();
  await page.setInputFiles('#shoppingFile', {
    name:'3c-shopping.csv',
    mimeType:'text/csv',
    buffer:Buffer.from('\ufeff品牌,商品名稱,商品型號,售價,備註\r\nApple,"iPhone, 18 Pro",A18P,39900,\r\n')
  });
  await expect(page.locator('#shoppingAnalysis')).toContainText('3c-shopping.csv');
  await expect(page.locator('#shoppingAnalysis')).toContainText('CSV（UTF-8）');
  await expect(page.locator('#shoppingAnalysis')).toContainText('iPhone, 18 Pro');
  await expect(page.locator('#shoppingAnalysis')).toContainText('無法分類的欄位');
  await page.setInputFiles('#tradeinFile', {
    name:'tradein.csv',
    mimeType:'text/csv',
    buffer:Buffer.from('品牌,機型,回收價,機況\nApple,iPhone 18 Pro,22000,A級\n')
  });
  await expect(page.locator('#tradeinAnalysis')).toContainText('tradein.csv');
  await expect(page.locator('#tradeinAnalysis')).toContainText('回收價 ← 回收價');
  await expect(page.locator('#tradeinAnalysis')).toContainText('22000');
  expect(errors).toEqual([]);
});
