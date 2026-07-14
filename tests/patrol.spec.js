const { test, expect } = require('@playwright/test');
const path = require('path');

// 模擬 GAS 後端：ping / ptread / ptwrite（含 JSONP callback 與通行碼驗證）
// 驗證「電腦貼上 → 上雲 → 另一裝置載入」的跨裝置同步流程
const PT_KEY = 'test123';
let cloudRows;
let writeCalls;
let cloudConfig; // 模擬各區 GAS 回傳的 PT_STORES / PT_TITLE

async function stubGas(page) {
  await page.route('https://script.google.com/**', route => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action');
    const cb = url.searchParams.get('callback');
    const authed = url.searchParams.get('key') === PT_KEY;
    let body;
    if (action === 'ping') {
      body = JSON.stringify({ status: 'ok' });
    } else if (action === 'ptread') {
      body = authed
        ? JSON.stringify({ status: 'ok', rows: cloudRows, ...(cloudConfig || {}) })
        : JSON.stringify({ status: 'error', message: 'unauthorized' });
    } else if (action === 'ptwrite') {
      writeCalls++;
      if (!authed) {
        body = JSON.stringify({ status: 'error', message: 'unauthorized' });
      } else {
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
      }
    } else {
      body = JSON.stringify({ status: 'error', message: 'unknown action' });
    }
    route.fulfill({
      contentType: cb ? 'application/javascript' : 'application/json',
      body: cb ? `${cb}(${body})` : body,
    });
  });
}

// 通行碼輸入框自動作答
function answerKeyPrompt(page, answer) {
  page.on('dialog', d => d.accept(answer));
}

const PAGE_URL = 'file://' + path.resolve(__dirname, '../patrol.html');

function pasteLine(d, store, code, item, result, reason) {
  return `2026/7/${d} 16:43\t2026/7/${d} 16:00\t2026/7/${d} 18:00\t北一二B\t${code}\t${store}\t盧蔚榮\t${item}\t內容\t${result}\t${reason}`;
}

test.beforeEach(() => { cloudRows = []; writeCalls = 0; cloudConfig = null; });

test('電腦貼上後自動上雲，另一裝置輸入通行碼後看得到', async ({ browser }) => {
  // ── 裝置一（電腦）：輸入通行碼、連線並貼上 ──
  const desktop = await browser.newPage();
  await stubGas(desktop);
  answerKeyPrompt(desktop, PT_KEY);
  await desktop.goto(PAGE_URL);
  await expect(desktop.locator('#cloudStatus')).toHaveText(/已連線/);

  const lines = [
    pasteLine(1, '台北通化', 'DNB10059', 1, '', 'na'),
    pasteLine(1, '台北通化', 'DNB10059', 14, 'v', ''),
    pasteLine(2, '台北酒泉', 'DNB10062', 15, 'v', ''),
  ].join('\n');
  await desktop.fill('#pasteBox', lines);
  await desktop.click('button.btn-primary');
  // 上傳成功後會自動核對雲端，看板改以雲端資料為準
  await expect(desktop.locator('#parseMsg')).toHaveText(/雲端已載入 3 筆明細/);
  expect(cloudRows.length).toBe(3);

  // ── 裝置二（手機）：全新頁面，輸入通行碼後直接看到雲端資料 ──
  const mobile = await browser.newPage();
  await stubGas(mobile);
  answerKeyPrompt(mobile, PT_KEY);
  await mobile.goto(PAGE_URL);
  await expect(mobile.locator('#cloudStatus')).toHaveText(/已連線/);
  await expect(mobile.locator('#parseMsg')).toHaveText(/雲端已載入 3 筆明細/);
  await expect(mobile.locator('#content')).toContainText('台北通化');
  await expect(mobile.locator('#content')).toContainText('台北酒泉');

  await desktop.close();
  await mobile.close();
});

test('通行碼錯誤時拿不到資料', async ({ page }) => {
  await stubGas(page);
  answerKeyPrompt(page, '猜錯的密碼');
  await page.goto(PAGE_URL);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);
  await expect(page.locator('#parseMsg')).toHaveText(/通行碼錯誤/);
  await expect(page.locator('#content')).not.toContainText('台北通化');
});

test('重複貼上同一批資料，雲端自動去重', async ({ page }) => {
  await stubGas(page);
  answerKeyPrompt(page, PT_KEY);
  await page.goto(PAGE_URL);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  const line = pasteLine(3, '台北永吉', 'DNB10082', 16, 'v', '');
  await page.fill('#pasteBox', line);
  await page.click('button.btn-primary');
  await expect.poll(() => cloudRows.length).toBe(1);
  const callsAfterFirst = writeCalls;

  await page.fill('#pasteBox', line);
  await page.click('button.btn-primary');
  await expect.poll(() => writeCalls).toBeGreaterThan(callsAfterFirst);
  await expect(page.locator('#parseMsg')).toHaveText(/雲端已載入 1 筆明細/);
  expect(cloudRows.length).toBe(1);
});

test('盤點提醒框：題14-17每月與題18兩個月獨立顯示進度', async ({ page }) => {
  await stubGas(page);
  answerKeyPrompt(page, PT_KEY);
  await page.goto(PAGE_URL);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  // 通化完成 14-17 全部＋本期(7月)做過 18；酒泉只完成 14；
  // 三創 6/20 做過 18 → 屬「5–6月期」，在 7 月（7–8月期）應顯示未完成、記在上期
  const lines = [
    pasteLine(5, '台北通化', 'DNB10059', 14, 'v', ''),
    pasteLine(5, '台北通化', 'DNB10059', 15, 'v', ''),
    pasteLine(5, '台北通化', 'DNB10059', 16, 'v', ''),
    pasteLine(5, '台北通化', 'DNB10059', 17, 'v', ''),
    pasteLine(5, '台北通化', 'DNB10059', 18, 'v', ''),
    pasteLine(6, '台北酒泉', 'DNB10062', 14, 'v', ''),
    `2026/6/20 10:00\t2026/6/20 09:00\t2026/6/20 12:00\t北一二B\tDNB10307\t台北三創\t盧蔚榮\t18\t內容\tv\t`,
  ].join('\n');
  await page.fill('#pasteBox', lines);
  await page.click('button.btn-primary');
  await expect(page.locator('#parseMsg')).toHaveText(/雲端已載入 7 筆明細/);

  const panels = page.locator('#invPanels');
  // 每月盤點：只有通化 4 項全完成 → 1/9
  await expect(panels).toContainText('每月盤點提醒');
  await expect(panels).toContainText('1/9 店完成');
  // 到店全盤：固定週期 7–8月
  await expect(panels).toContainText('本期 7–8月');
  const table18 = panels.locator('table').nth(1);
  // 通化 7/5 完成 → 本期已完成
  await expect(table18.locator('tr', { hasText: '通化' })).toContainText('✓ 已完成');
  // 三創 6/20 是上一期（5–6月）→ 本期未完成，但上期紀錄看得到
  const sanchuang = table18.locator('tr', { hasText: '三創' });
  await expect(sanchuang).toContainText('✗ 未完成');
  await expect(sanchuang).toContainText('✓ 2026/6/20');
});

test('知悉宣導提醒：題19-33只看總進度與20日前完成狀態', async ({ page }) => {
  await stubGas(page);
  answerKeyPrompt(page, PT_KEY);
  await page.goto(PAGE_URL);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  // 通化 7/5 完成全部 19-33；酒泉只完成題 19
  const lines = [];
  for (let i = 19; i <= 33; i++) lines.push(pasteLine(5, '台北通化', 'DNB10059', i, 'v', ''));
  lines.push(pasteLine(6, '台北酒泉', 'DNB10062', 19, 'v', ''));
  await page.fill('#pasteBox', lines.join('\n'));
  await page.click('button.btn-primary');
  await expect(page.locator('#parseMsg')).toHaveText(/雲端已載入 16 筆明細/);

  const panels = page.locator('#invPanels');
  await expect(panels).toContainText('知悉宣導提醒');
  const table = panels.locator('table').nth(2);
  const tonghua = table.locator('tr', { hasText: '通化' });
  await expect(tonghua).toContainText('15/15');
  await expect(tonghua).toContainText('✓ 已完成');
  await expect(tonghua).toContainText('7/5');
  const jiuquan = table.locator('tr', { hasText: '酒泉' });
  await expect(jiuquan).toContainText('1/15');
  await expect(jiuquan).toContainText(/剩 \d+ 天|⚠ 逾期/);
});

test('其他督導：GAS 回傳自己的標題與門市清單，看板跟著切換', async ({ page }) => {
  cloudConfig = {
    title: '南區A · 王督導 · 33 項檢核追蹤',
    stores: [
      { code: 'DNS20001', name: '高雄夢時代' },
      { code: 'DNS20002', name: '高雄左營' },
    ],
  };
  await stubGas(page);
  answerKeyPrompt(page, PT_KEY);
  await page.goto(PAGE_URL);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  await expect(page.locator('#subTitle')).toHaveText('南區A · 王督導 · 33 項檢核追蹤');
  const panels = page.locator('#invPanels');
  await expect(panels).toContainText('0/2 店完成'); // 門市數變成該區的 2 店
  await expect(panels).toContainText('夢時代');
  await expect(panels).toContainText('左營');
  await expect(panels).not.toContainText('通化'); // 不會出現北一二B 的店
});

test('大量資料會分批上傳且全數送達', async ({ page }) => {
  await stubGas(page);
  answerKeyPrompt(page, PT_KEY);
  await page.goto(PAGE_URL);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  const lines = [];
  for (let i = 1; i <= 25; i++) {
    lines.push(pasteLine((i % 28) + 1, '台北三創', 'DNB10307', (i % 33) + 1, 'v', ''));
  }
  await page.fill('#pasteBox', lines.join('\n'));
  await page.click('button.btn-primary');
  await expect(page.locator('#parseMsg')).toHaveText(/雲端已載入 25 筆明細/);
  expect(cloudRows.length).toBe(25);
  expect(writeCalls).toBeGreaterThan(1); // 確實有分批
});
