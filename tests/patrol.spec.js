const { test, expect } = require('@playwright/test');
const path = require('path');

// 模擬 GAS 後端：ping / ptread / ptwrite（含 JSONP callback）
// 驗證「電腦貼上 → 上雲 → 另一裝置載入」的跨裝置同步流程
let cloudRows;

async function stubGas(page) {
  await page.route('https://script.google.com/**', route => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action');
    const cb = url.searchParams.get('callback');
    let body;
    if (action === 'ping') {
      body = JSON.stringify({ status: 'ok' });
    } else if (action === 'ptread') {
      body = JSON.stringify({ status: 'ok', rows: cloudRows });
    } else if (action === 'ptwrite') {
      const rows = JSON.parse(url.searchParams.get('payload'));
      const seen = new Set(cloudRows.map(r => `${r.fillTime}|${r.store}|${r.item}`));
      let written = 0;
      rows.forEach(r => {
        const k = `${r.fillTime}|${r.store}|${r.item}`;
        if (seen.has(k)) return;
        seen.add(k);
        cloudRows.push({ ...r, savedAt: new Date().toISOString() });
        written++;
      });
      body = JSON.stringify({ status: 'ok', written });
    } else {
      body = JSON.stringify({ status: 'error', message: 'unknown action' });
    }
    route.fulfill({
      contentType: cb ? 'application/javascript' : 'application/json',
      body: cb ? `${cb}(${body})` : body,
    });
  });
}

const PAGE_URL = 'file://' + path.resolve(__dirname, '../patrol.html');

function pasteLine(d, store, code, item, result, reason) {
  return `2026/7/${d} 16:43\t2026/7/${d} 16:00\t2026/7/${d} 18:00\t北一二B\t${code}\t${store}\t盧蔚榮\t${item}\t內容\t${result}\t${reason}`;
}

test.beforeEach(() => { cloudRows = []; });

test('電腦貼上後自動上雲，另一裝置重新載入看得到', async ({ browser }) => {
  // ── 裝置一（電腦）：連線並貼上 ──
  const desktop = await browser.newPage();
  await stubGas(desktop);
  await desktop.goto(PAGE_URL);
  await expect(desktop.locator('#cloudStatus')).toHaveText(/已連線/);

  const lines = [
    pasteLine(1, '台北通化', 'DNB10059', 1, '', 'na'),
    pasteLine(1, '台北通化', 'DNB10059', 14, 'v', ''),
    pasteLine(2, '台北酒泉', 'DNB10062', 15, 'v', ''),
  ].join('\n');
  await desktop.fill('#pasteBox', lines);
  await desktop.click('button.btn-primary');
  await expect(desktop.locator('#parseMsg')).toHaveText(/已同步至雲端（新增 3 筆/);
  expect(cloudRows.length).toBe(3);

  // ── 裝置二（手機）：全新頁面載入，應直接看到雲端資料 ──
  const mobile = await browser.newPage();
  await stubGas(mobile);
  await mobile.goto(PAGE_URL);
  await expect(mobile.locator('#cloudStatus')).toHaveText(/已連線/);
  await expect(mobile.locator('#parseMsg')).toHaveText(/雲端已載入 3 筆明細/);
  await expect(mobile.locator('#content')).toContainText('台北通化');
  await expect(mobile.locator('#content')).toContainText('台北酒泉');

  await desktop.close();
  await mobile.close();
});

test('重複貼上同一批資料，雲端自動去重', async ({ page }) => {
  await stubGas(page);
  await page.goto(PAGE_URL);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  const line = pasteLine(3, '台北永吉', 'DNB10082', 16, 'v', '');
  await page.fill('#pasteBox', line);
  await page.click('button.btn-primary');
  await expect(page.locator('#parseMsg')).toHaveText(/新增 1 筆/);

  await page.fill('#pasteBox', line);
  await page.click('button.btn-primary');
  await expect(page.locator('#parseMsg')).toHaveText(/新增 0 筆/);
  expect(cloudRows.length).toBe(1);
});

test('超過 10 筆會分批上傳且全數送達', async ({ page }) => {
  await stubGas(page);
  await page.goto(PAGE_URL);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  const lines = [];
  for (let i = 1; i <= 25; i++) {
    lines.push(pasteLine((i % 28) + 1, '台北三創', 'DNB10307', (i % 33) + 1, 'v', ''));
  }
  await page.fill('#pasteBox', lines.join('\n'));
  await page.click('button.btn-primary');
  await expect(page.locator('#parseMsg')).toHaveText(/新增 25 筆/);
  expect(cloudRows.length).toBe(25);
});
