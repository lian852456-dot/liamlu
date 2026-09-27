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
  await expect(page.locator('#shoppingAnalysis')).toContainText('解析驗收摘要');
  await expect(page.locator('#shoppingAnalysis')).toContainText('欄位映射');
  await expect(page.locator('#shoppingAnalysis')).toContainText('資料品質與解析異常');
  await expect(page.locator('#shoppingAnalysis')).toContainText('標準化資料預覽（Wide → Long）');
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

test('舊換新寬表可轉 Long Format，並支援搜尋與前 50 筆預覽', async ({ page }) => {
  await page.goto(PAGE_URL);
  await page.setInputFiles('#tradeinFile', {
    name:'company-tradein-wide.csv',
    mimeType:'text/csv',
    buffer:Buffer.from([
      '機型(A等級),品名 Item(A等級),回收價(A等級),機型(B等級),品名 Item(B等級),回收價(B等級),機型(S等級),品名 Item(S等級),回收價(S等級)',
      'iPhone 17 Pro,APPLE IPHONE 17 PRO 256G,24500,iPhone 17 Pro,APPLE IPHONE 17 PRO 256G,21800,iPhone 17 Pro,APPLE IPHONE 17 PRO 256G,26500',
      'Pixel 11,GOOGLE PIXEL 11,,Pixel 11,GOOGLE PIXEL 11,12000,,,'
    ].join('\n'))
  });
  const analysis = page.locator('#tradeinAnalysis');
  await expect(analysis).toContainText('標準化資料預覽（Wide → Long）');
  await expect(analysis).toContainText('標準化');
  await expect(analysis).toContainText('失敗');
  await expect(analysis).toContainText('S');
  await page.getByRole('searchbox', { name:'搜尋標準化資料' }).fill('Pixel 11');
  await expect(analysis.locator('.normalized-wrap tbody')).toContainText('Pixel 11');
  await expect(analysis.locator('.normalized-wrap tbody')).not.toContainText('iPhone 17 Pro');
});

test('去識別化驗收報告可複製，剪貼簿失敗時保留可手動複製的唯讀內容', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable:true,
      value:{ writeText:async value => { window.__copiedAcceptanceReport = value; } }
    });
  });
  await page.goto(PAGE_URL);
  await page.setInputFiles('#shoppingFile', {
    name:'private-file-name.csv',
    mimeType:'text/csv',
    buffer:Buffer.from('廠牌,代碼,機型,商品名稱,單機價\nApple,SECRET-CODE,PRIVATE-MODEL,PRIVATE-PRODUCT,39888\n')
  });
  const analysis = page.locator('#shoppingAnalysis');
  const report = page.getByRole('textbox', { name:'去識別化驗收報告內容' });
  await expect(analysis.getByText('本機完整驗收報告')).toBeVisible();
  await expect(report).not.toHaveValue(/private-file-name|SECRET-CODE|PRIVATE-MODEL|PRIVATE-PRODUCT|39888/);
  await analysis.getByRole('button', { name:'一鍵複製驗收報告' }).click();
  await expect(analysis.getByText('已複製去識別化驗收報告。')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__copiedAcceptanceReport || '')).toContain('"privacyBoundary"');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable:true,
      value:{ writeText:async () => { throw new Error('denied'); } }
    });
  });
  await analysis.getByRole('button', { name:'一鍵複製驗收報告' }).click();
  await expect(analysis.getByText(/無法自動複製；報告已選取/)).toBeVisible();
  await expect(report).toBeFocused();
  const downloadPromise = page.waitForEvent('download');
  await analysis.getByRole('button', { name:'下載驗收報告 JSON' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^local-shopping-acceptance-\d{4}-\d{2}-\d{2}\.json$/);
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const downloaded = Buffer.concat(chunks).toString('utf8');
  expect(downloaded).toContain('"privacyBoundary"');
  expect(downloaded).not.toContain('PRIVATE-MODEL');
  await expect(analysis.getByText(/已下載去識別化驗收報告 JSON/)).toBeVisible();
});
