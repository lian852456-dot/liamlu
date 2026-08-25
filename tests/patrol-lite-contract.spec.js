const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'patrol-lite.html'), 'utf8');

test('Patrol Lite exposes only local import, patrol dashboard and mileage', async () => {
  expect(html).toContain('本機匯入巡店報表');
  expect(html).toContain('accept=".xlsx,.xls,.csv,.tsv,.txt"');
  expect(html).toContain('data-tab="dashboard"');
  expect(html).toContain('data-tab="mileage"');
  expect(html).not.toContain('貼上巡店紀錄');
  expect(html).not.toContain('半月檢查');
  expect(html).not.toContain('班表');
  expect(html).not.toContain('稽核');
});

test('Patrol Lite reuses protected Patrol contracts and readback flow', async () => {
  expect(html).toContain("postAction('ptsummary'");
  expect(html).toContain("postAction('ptmileage2'");
  expect(html).toContain("postAction('ptdetail'");
  expect(html).toContain("jsonpAction('ptwrite'");
  expect(html).toContain('verifyRows');
  expect(html).toContain('讀回驗證不一致');
});

test('Patrol Lite does not persist the access key', async () => {
  expect(html).toContain("localStorage.setItem(STORAGE_URL,gasUrl)");
  expect(html).toContain("sessionStorage.setItem(SESSION_KEY,token)");
  expect(html).not.toMatch(/localStorage\.setItem\([^\n]*accessKey/i);
  expect(html).not.toMatch(/PT_KEY\s*=\s*['\"][^'\"]+/);
});
