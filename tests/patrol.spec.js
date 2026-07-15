const { test, expect } = require('@playwright/test');
const path = require('path');

// 模擬 GAS 後端：每日回報、巡店、班表與半月督導檢查（含通行碼驗證）
// 驗證「電腦貼上 → 上雲 → 另一裝置載入」的跨裝置同步流程
const PT_KEY = 'test123';
let cloudRows;
let halfRows;
let writeCalls;
let cloudConfig; // 模擬各區 GAS 回傳的 PT_STORES / PT_TITLE

function privateScheduleFixture() {
  const names = ['酒泉', '萬大', '大稻埕', '復興', '三創', '杭州', '永吉', '通化', '六張犁'];
  return {
    generatedAt: '2026-07-15T00:00:00+08:00',
    month: '2026-07',
    rocMonth: '115/07',
    stores: names.map(store => ({
      store,
      title: `台北${store}`,
      staff: [{ name: '測試主管', role: '店長' }, { name: '測試同仁', role: '業務代表' }],
      days: [{
        date: '2026-07-15', day: 15, weekday: '三',
        staff: [
          { name: '測試主管', role: '店長', status: '全', working: true },
          { name: '測試同仁', role: '業務代表', status: '早1', working: true },
        ],
        workingStaff: [
          { name: '測試主管', role: '店長', status: '全', working: true },
          { name: '測試同仁', role: '業務代表', status: '早1', working: true },
        ],
        managers: [{ name: '測試主管', role: '店長', status: '全', working: true }],
      }],
    })),
  };
}

async function stubGas(page) {
  await page.addInitScript(schedule => {
    window.PATROL_LEGACY_GAS_URL = 'https://script.google.com/macros/s/test/exec';
  }, privateScheduleFixture());
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
    } else if (action === 'hread') {
      body = authed
        ? JSON.stringify({ status: 'ok', rows: halfRows })
        : JSON.stringify({ status: 'error', message: 'unauthorized' });
    } else if (action === 'hwrite') {
      if (!authed) {
        body = JSON.stringify({ status: 'error', message: 'unauthorized' });
      } else {
        const rows = JSON.parse(url.searchParams.get('payload'));
        const keys = new Set(halfRows.map(r => `${r.checkId}|${r.item}`));
        let written = 0;
        rows.forEach(r => {
          const key = `${r.checkId}|${r.item}`;
          const index = halfRows.findIndex(x => `${x.checkId}|${x.item}` === key);
          if (index >= 0) halfRows[index] = r;
          else { halfRows.push(r); keys.add(key); }
          written++;
        });
        body = JSON.stringify({ status: 'ok', written });
      }
    } else if (action === 'sread') {
      body = authed
        ? JSON.stringify({ status: 'ok', schedule: privateScheduleFixture() })
        : JSON.stringify({ status: 'error', message: 'unauthorized' });
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
  return `2026/7/${d} 16:43\t2026/7/${d} 16:00\t2026/7/${d} 18:00\t北一二B\t${code}\t${store}\t測試督導\t${item}\t內容\t${result}\t${reason}`;
}

test.beforeEach(() => { cloudRows = []; halfRows = []; writeCalls = 0; cloudConfig = null; });

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
    `2026/6/20 10:00\t2026/6/20 09:00\t2026/6/20 12:00\t北一二B\tDNB10307\t台北三創\t測試督導\t18\t內容\tv\t`,
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

test('公開頁面不載入班表副本，未連線或未輸入通行碼時保持鎖定', async ({ page }) => {
  await page.route('https://script.google.com/**', route => route.abort());
  await page.goto(PAGE_URL);
  await expect(page.locator('script[src="data/schedule.js"]')).toHaveCount(0);
  await page.locator('.secure-tab[data-view="schedule"]').click();
  await expect(page.locator('#privateAuthStatus')).toContainText('尚未解鎖');
  await expect(page.locator('#scheduleView')).not.toBeVisible();
});

test('加密頁籤：每月班表可切換日週月檢視', async ({ page }) => {
  await stubGas(page);
  answerKeyPrompt(page, PT_KEY);
  await page.goto(PAGE_URL);
  await page.locator('.secure-tab[data-view="schedule"]').click();
  await expect(page.locator('#scheduleView')).toBeVisible();
  await expect(page.locator('#scheduleContent')).toContainText('通化');
  await page.locator('#scheduleMode').selectOption('week');
  await expect(page.locator('#scheduleContent')).toContainText('每週出勤');
  await page.locator('#scheduleMode').selectOption('month');
  await expect(page.locator('#scheduleContent')).toContainText('每月班表');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 Excel' }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/TWM_班表_2026-07\.xls/);
});

test('加密頁籤：半月督導檢查可回填缺失與改善說明', async ({ page }) => {
  await stubGas(page);
  answerKeyPrompt(page, PT_KEY);
  await page.goto(PAGE_URL);
  await page.locator('.secure-tab[data-view="half"]').click();
  await expect(page.locator('#halfView')).toBeVisible();
  await expect(page.locator('.half-item')).toHaveCount(33);
  await page.locator('#halfInspector').fill('測試督導');
  await page.locator('.half-result').first().selectOption('abnormal');
  await page.locator('.half-note').first().fill('展示機未亮');
  await page.locator('.half-improvement').first().fill('當日完成開機並拍照回存');
  await page.getByRole('button', { name: '只暫存本機' }).click();
  await expect(page.locator('#halfHistory')).toContainText('通化');
  await expect(page.locator('#halfHistory')).toContainText('1 項異常');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 Excel' }).click();
  expect((await downloadPromise).suggestedFilename()).toMatch(/半月督導檢查_.*\.xls/);
});
