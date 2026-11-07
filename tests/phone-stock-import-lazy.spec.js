// App 手機庫存匯入：SheetJS 改為選檔時才載入、在 Worker 解析後，
// 匯入結果必須與原本完全相同。
const { test, expect } = require('@playwright/test');

const BASE = 'http://127.0.0.1:8875/';
const ROWS = [
  ['店點', '機型', '庫存數', '庫存日期'],
  ['通化', 'iPhone 17 Pro 256G', 3, '2026/11/07'],
  ['萬大', 'iPhone 17 Pro 256G', 5, '2026/11/07'],
  ['酒泉', 'Galaxy S26', 2, '2026/11/07'],
];

async function openApp(page) {
  await page.route(u => !u.href.startsWith(BASE), r => r.abort());
  await page.goto(BASE + 'app.html?preview=1', { waitUntil: 'load' });
}
async function importAndRead(page, file) {
  await page.setInputFiles('#stockFile', file);
  await page.waitForFunction(() => !/正在/.test(document.getElementById('stockImportMessage').textContent), null, { timeout: 20000 });
  return {
    message: await page.textContent('#stockImportMessage'),
    total: await page.textContent('#stockTotal'),
    items: await page.locator('#stockResults .stock-item').count(),
  };
}

test('stock CSV import loads SheetJS on demand and keeps the same result', async ({ page }) => {
  await openApp(page);
  expect(await page.evaluate(() => typeof window.XLSX)).toBe('undefined');
  const csv = ROWS.map(r => r.join(',')).join('\n') + '\n';
  const result = await importAndRead(page, { name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  expect(result.message).toBe('已匯入 3 筆庫存；資料保存在此裝置。');
  expect(result.total).toBe('符合條件 10 台');
  expect(result.items).toBe(2);
  expect(await page.evaluate(() => typeof window.XLSX)).toBe('object');
});

test('stock XLSX import gives the same result as the CSV', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => window.VendorLoader.ensure('xlsx'));
  const bytes = await page.evaluate(rows => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['說明'], ['此頁不是庫存']]), '封面');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '庫存');
    return Array.from(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
  }, ROWS);
  const result = await importAndRead(page, { name: 'stock.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(bytes) });
  expect(result.message).toBe('已匯入 3 筆庫存；資料保存在此裝置。');
  expect(result.total).toBe('符合條件 10 台');
});

test('a failed SheetJS download shows a retryable message instead of breaking the page', async ({ page }) => {
  await page.route('**/assets/vendor/xlsx.full.min.js*', r => r.abort());
  await openApp(page);
  const result = await importAndRead(page, { name: 'stock.csv', mimeType: 'text/csv', buffer: Buffer.from('店點,機型,庫存數\n通化,A,1\n') });
  expect(result.message).toContain('載入失敗');
});
