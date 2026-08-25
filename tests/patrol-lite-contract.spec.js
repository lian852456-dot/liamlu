const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'patrol-lite.html');
const html = fs.readFileSync(htmlPath, 'utf8');

function installOpaqueOriginStorage(page) {
  return page.evaluate(() => {
    const memory = {};
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: key => Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null,
        setItem: (key, value) => { memory[key] = String(value); },
        removeItem: key => { delete memory[key]; },
      },
    });
    Object.defineProperty(window, 'indexedDB', { configurable: true, value: undefined });
  });
}

test('Patrol Lite has a fail-closed offline privacy boundary', async () => {
  expect(html).toContain("connect-src 'none'");
  expect(html).not.toContain('<script src=');
  expect(html).not.toContain('fetch(');
  expect(html).not.toContain('XMLHttpRequest');
  expect(html).not.toContain('script.google.com');
  expect(html).not.toContain('SPREADSHEET_ID');
  expect(html).not.toContain('PATROL_GAS_URL');
  expect(html).not.toContain('PT_KEY');
  expect(html).not.toContain('ptsummary');
  expect(html).not.toContain('ptwrite');
  expect(html).toContain('IndexedDB 本機資料庫');
  expect(html).toContain('完全本機模式');
  expect(html).toContain('accept=".xlsx,.csv,.tsv,.txt,.json"');
  expect(html).toContain('DecompressionStream');
  expect(html).toContain('匯出備份');
  expect(html).toContain('匯入備份');
});

test('CSV import builds dashboard and mileage without a backend', async ({ page }, testInfo) => {
  const csvPath = testInfo.outputPath('patrol-lite-fixture.csv');
  const headers = ['填表時間','到店時間','離店時間','區處別','營業點代碼','檢查店點','檢查人員','題號','檢查內容','是否合格','未查／不合格原因'];
  const rows = [];
  for (let item = 1; item <= 33; item += 1) rows.push(['2026/8/5 09:00:00','2026/8/5 09:10:00','2026/8/5 10:00:00','測試區','A001','測試甲店','督導A',item,`題目${item}`,'v','']);
  for (let item = 2; item <= 13; item += 1) rows.push(['2026/8/20 09:00:00','2026/8/20 09:10:00','2026/8/20 10:00:00','測試區','A001','測試甲店','督導A',item,`題目${item}`,'v','']);
  for (let item = 1; item <= 5; item += 1) rows.push(['2026/8/5 11:00:00','2026/8/5 11:10:00','2026/8/5 12:00:00','測試區','B001','測試乙店','督導A',item,`題目${item}`,'v','']);
  const csv = [headers, ...rows].map(row => row.map(value => String(value).includes(',') ? `"${String(value).replace(/"/g, '""')}"` : value).join(',')).join('\r\n');
  fs.writeFileSync(csvPath, `\uFEFF${csv}`, 'utf8');

  await installOpaqueOriginStorage(page);
  await page.setContent(html, { waitUntil: 'load' });
  await page.setInputFiles('#localFile', csvPath);
  await expect(page.locator('#importMsg')).toContainText('有效 50 筆');
  await page.click('#confirmImportBtn');
  await expect(page.locator('#importMsg')).toContainText('已儲存到本機');
  await expect(page.locator('#storeCards')).toContainText('測試甲店');
  await expect(page.locator('#storeCards')).toContainText('33/33');
  await expect(page.locator('#storeCards')).toContainText('測試乙店');

  await page.click('[data-tab="mileage"]');
  await expect(page.locator('#mileageRows')).toContainText('測試甲店 → 測試乙店');
  await expect(page.locator('#mileageRows')).toContainText('待查');
  await page.locator('[data-distance-key]').first().fill('3.5');
  await page.locator('[data-distance-key]').first().press('Tab');
  await expect(page.locator('#mileageRows')).toContainText('3.5 KM');

  await page.setContent(html, { waitUntil: 'load' });
  await page.click('[data-tab="mileage"]');
  await expect(page.locator('#mileageRows')).toContainText('測試甲店');
  await expect(page.locator('#mileageRows')).toContainText('3.5 KM');
});
