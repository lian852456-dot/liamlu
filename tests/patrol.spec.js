const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs/promises');

// 模擬 GAS 後端：每日回報、巡店、班表與半月督導檢查（含通行碼驗證）
// 驗證「電腦貼上 → 上雲 → 另一裝置載入」的跨裝置同步流程
const PT_KEY = 'test123';
const PT_TOKEN = 'test-session-token';
let cloudRows;
let halfRows;
let writeCalls;
let ptReadCalls;
let cloudConfig; // 模擬各區 GAS 回傳的 PT_STORES / PT_TITLE
let mediaUploads;
let failPtwrite; // 測試用：強制 ptwrite 回錯，模擬雲端寫入失敗
let expireHalfWriteAt;
let halfWriteCalls;

function privateScheduleFixture() {
  const names = ['酒泉', '萬大', '大稻埕', '復興', '三創', '杭州', '永吉', '通化', '六張犁'];
  return {
    generatedAt: '2026-07-15T00:00:00+08:00',
    month: '2026-07',
    rocMonth: '115/07',
    stores: names.map(store => ({
      store,
      title: `台北${store}`,
      staff: [{ name: '測試主管', role: '店長' }, { name: '測試副店', role: '副店長' }, { name: '測試同仁', role: '業務代表' }],
      days: [{
        date: '2026-07-15', day: 15, weekday: '三',
        staff: [
          { name: '測試主管', role: '店長', status: '全', working: true },
          { name: '測試副店', role: '副店長', status: '休假', working: false },
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
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      if (payload.action === 'ptauth') {
        const authed = payload.key === PT_KEY || payload.token === PT_TOKEN;
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify(authed
            ? { status: 'ok', token: PT_TOKEN, expiresIn: 1800 }
            : { status: 'error', message: 'unauthorized' }),
        });
      }
      if (payload.action === 'ptlogout') {
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ok' }) });
      }
      if (payload.action === 'half_media_upload') {
        const authed = payload.token === PT_TOKEN;
        if (!authed) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'unauthorized' }) });
        const file = payload.file || {};
        const id = `media-${mediaUploads.length + 1}`;
        const media = {
          id,
          name: file.name,
          mimeType: file.type,
          viewUrl: `https://drive.google.com/file/d/${id}/view`,
          previewUrl: /^image\//.test(file.type) ? `https://drive.google.com/uc?export=view&id=${id}` : `https://drive.google.com/file/d/${id}/preview`,
        };
        mediaUploads.push(media);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'ok', media }) });
      }
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ status: 'error', message: 'unknown action' }) });
    }
    const url = new URL(route.request().url());
    const action = url.searchParams.get('action');
    const cb = url.searchParams.get('callback');
    const authed = url.searchParams.get('token') === PT_TOKEN;
    let body;
    if (action === 'ping') {
      body = JSON.stringify({ status: 'ok' });
    } else if (action === 'pthealth') {
      body = JSON.stringify({ status: 'ok', configured: true, contract: 'patrol-auth-v3' });
    } else if (action === 'ptread') {
      ptReadCalls++;
      body = authed
        ? JSON.stringify({ status: 'ok', rows: cloudRows, ...(cloudConfig || {}) })
        : JSON.stringify({ status: 'error', message: 'unauthorized' });
    } else if (action === 'ptwrite') {
      writeCalls++;
      if (failPtwrite) {
        body = JSON.stringify({ status: 'error', message: '伺服器忙碌，請稍後再試' });
      } else if (!authed) {
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
      halfWriteCalls++;
      if (expireHalfWriteAt === halfWriteCalls) {
        expireHalfWriteAt = null;
        body = JSON.stringify({ status: 'error', message: 'unauthorized' });
      } else if (!authed) {
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

async function openAndUnlock(page, answer = PT_KEY) {
  await page.goto(PAGE_URL);
  await page.locator('#patrolPasscode').fill(answer);
  await page.getByRole('button', { name: '驗證並進入' }).click();
  if (answer === PT_KEY) await expect(page.locator('#patrolAuthGate')).toBeHidden();
}

const PAGE_URL = 'file://' + path.resolve(__dirname, '../patrol.html');

function pasteLine(d, store, code, item, result, reason) {
  const { line } = currentMonthFixture(d, store, code, item, result, reason);
  return line;
}

function currentMonthFixture(day, store, code, item, result, reason) {
  const month = new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    line: `${year}/${monthNumber}/${day} 16:43\t${year}/${monthNumber}/${day} 16:00\t${year}/${monthNumber}/${day} 18:00\t北一二B\t${code}\t${store}\t測試督導\t${item}\t內容\t${result}\t${reason}`,
    month,
    fillDate: `${year}/${monthNumber}/${day}`,
  };
}

test.beforeEach(() => { cloudRows = []; halfRows = []; writeCalls = 0; ptReadCalls = 0; cloudConfig = null; mediaUploads = []; failPtwrite = false; expireHalfWriteAt = null; halfWriteCalls = 0; });

test('電腦貼上後自動上雲，另一裝置輸入通行碼後看得到', async ({ browser }) => {
  // ── 裝置一（電腦）：輸入通行碼、連線並貼上 ──
  const desktop = await browser.newPage();
  await stubGas(desktop);
  await openAndUnlock(desktop);
  await expect(desktop.locator('#cloudStatus')).toHaveText(/已連線/);

  const lines = [
    pasteLine(1, '台北通化', 'DNB10059', 1, '', 'na'),
    pasteLine(1, '台北通化', 'DNB10059', 14, 'v', ''),
    pasteLine(2, '台北酒泉', 'DNB10062', 15, 'v', ''),
  ].join('\n');
  await desktop.fill('#pasteBox', lines);
  await desktop.click('button.btn-primary');
  await expect(desktop.locator('#parseMsg')).toHaveText(/已同步至雲端/);
  expect(cloudRows.length).toBe(3);

  // ── 裝置二（手機）：全新頁面，輸入通行碼後直接看到雲端資料 ──
  const mobile = await browser.newPage();
  await stubGas(mobile);
  await openAndUnlock(mobile);
  await expect(mobile.locator('#cloudStatus')).toHaveText(/已連線/);
  await expect(mobile.locator('#parseMsg')).toHaveText(/雲端已載入 3 筆明細/);
  await expect(mobile.locator('#content')).toContainText('台北通化');
  await expect(mobile.locator('#content')).toContainText('台北酒泉');

  await desktop.close();
  await mobile.close();
});

test('通行碼錯誤時拿不到資料', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page, '猜錯的密碼');
  await expect(page.locator('#patrolAuthGate')).toBeVisible();
  await expect(page.locator('#patrolAuthMessage')).toHaveText(/通行碼錯誤/);
  await expect(page.locator('#patrolAppHost')).toBeEmpty();
});

test('重複貼上同一批資料，雲端自動去重', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  const line = pasteLine(3, '台北永吉', 'DNB10082', 16, 'v', '');
  await page.fill('#pasteBox', line);
  await page.click('button.btn-primary');
  await expect.poll(() => cloudRows.length).toBe(1);
  const callsAfterFirst = writeCalls;

  await page.fill('#pasteBox', line);
  await page.click('button.btn-primary');
  await expect.poll(() => writeCalls).toBeGreaterThan(callsAfterFirst);
  await expect(page.locator('#parseMsg')).toHaveText(/已同步至雲端/);
  expect(cloudRows.length).toBe(1);
});

// ── 解析狀態訊息與雲端同步防呆（2026-08-03 修 showMsg inline display:none 蓋住訊息）──
test.describe('解析狀態訊息', () => {
  test('訊息自動隱藏後，第二次解析仍看得到（防 inline display:none 蓋住）', async ({ page }) => {
    await stubGas(page);
    await openAndUnlock(page);
    await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

    await page.fill('#pasteBox', pasteLine(1, '台北通化', 'DNB10059', 1, 'v', ''));
    await page.click('button.btn-primary');
    await expect(page.locator('#parseMsg')).toHaveText(/已同步至雲端/);

    // 模擬自動隱藏計時器把 inline display 設成 none 之後的狀態
    await page.evaluate(() => { document.getElementById('parseMsg').style.display = 'none'; });
    await expect(page.locator('#parseMsg')).toBeHidden();

    // 第二批：修好前 inline none 會蓋住新訊息，這裡必須重新看得到
    await page.fill('#pasteBox', pasteLine(2, '台北酒泉', 'DNB10062', 2, 'v', ''));
    await page.click('button.btn-primary');
    await expect(page.locator('#parseMsg')).toBeVisible();
    await expect(page.locator('#parseMsg')).toHaveText(/已同步至雲端/);
  });

  test('新資料顯示新增筆數；重複貼上顯示新增 0 筆（不是沒反應）', async ({ page }) => {
    await stubGas(page);
    await openAndUnlock(page);
    await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

    const line = pasteLine(3, '台北永吉', 'DNB10082', 16, 'v', '');
    await page.fill('#pasteBox', line);
    await page.click('button.btn-primary');
    await expect(page.locator('#parseMsg')).toHaveText(/新增 1 筆/);

    await page.fill('#pasteBox', line);
    await page.click('button.btn-primary');
    await expect(page.locator('#parseMsg')).toBeVisible();
    await expect(page.locator('#parseMsg')).toHaveText(/新增 0 筆/);
  });

  test('雲端寫入失敗時，紅色錯誤訊息保持顯示、不自動消失', async ({ page }) => {
    await stubGas(page);
    await openAndUnlock(page);
    await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

    failPtwrite = true;
    await page.fill('#pasteBox', pasteLine(4, '台北萬大', 'DNB10063', 5, 'v', ''));
    await page.click('button.btn-primary');
    await expect(page.locator('#parseMsg')).toHaveText(/雲端寫入失敗/);
    await expect(page.locator('#parseMsg')).toHaveClass(/err/);

    // 錯誤訊息不會自動消失
    await page.waitForTimeout(1200);
    await expect(page.locator('#parseMsg')).toBeVisible();
    await expect(page.locator('#parseMsg')).toHaveText(/雲端寫入失敗/);
  });

  test('看板渲染失敗時，仍會送出雲端且資料不靜默消失', async ({ page }) => {
    await stubGas(page);
    await openAndUnlock(page);
    await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

    // 讓看板渲染拋錯
    await page.evaluate(() => { window.render = () => { throw new Error('render 壞了'); }; });

    const before = writeCalls;
    await page.fill('#pasteBox', pasteLine(6, '台北三創', 'DNB10064', 7, 'v', ''));
    await page.click('button.btn-primary');

    // render 拋錯仍呼叫 ptwrite，資料成功進雲端（不因畫面壞掉而遺失）
    await expect.poll(() => writeCalls).toBeGreaterThan(before);
    await expect.poll(() => cloudRows.length).toBe(1);

    // 明確告知使用者：資料進了雲端、但看板沒畫出來（不是靜默消失）
    await expect(page.locator('#parseMsg')).toHaveText(/看板更新失敗/);
    await expect(page.locator('#parseMsg')).toBeVisible();
  });
});

test('貼上明細後切到督導檢查大盤不會用舊雲端資料覆蓋', async ({ page }) => {
  // 雲端原先只有酒泉的一筆；通化是這次剛貼上的新明細。
  cloudRows = [
    { fillTime: '2026/7/1 16:43', arriveTime: '2026/7/1 16:00', leaveTime: '2026/7/1 18:00', district: '北一二B', code: 'DNB10062', store: '台北酒泉', inspector: '測試督導', item: 14, result: 'v', reason: '', month: '2026-07' },
  ];
  await stubGas(page);
  await openAndUnlock(page);
  await expect(page.locator('#parseMsg')).toHaveText(/雲端已載入 1 筆明細/);

  await page.fill('#pasteBox', pasteLine(5, '台北通化', 'DNB10059', 14, 'v', ''));
  await page.click('button.btn-primary');
  await expect(page.locator('#parseMsg')).toHaveText(/已同步至雲端/);
  const readsBeforeSwitch = ptReadCalls;

  await page.click('[data-view="halfDashboard"]');
  await expect(page.locator('#halfDashboardView')).toContainText('目前已載入 2 筆巡店明細');
  await expect(page.locator('#halfDashboardView')).toContainText('台北通化');
  expect(ptReadCalls).toBe(readsBeforeSwitch);
});

test('盤點提醒框：題14-17每月與題18兩個月獨立顯示進度', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
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
  await expect(page.locator('#parseMsg')).toHaveText(/已同步至雲端/);

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
  await openAndUnlock(page);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  // 通化 7/5 完成全部 19-33；酒泉只完成題 19
  const lines = [];
  for (let i = 19; i <= 33; i++) lines.push(pasteLine(5, '台北通化', 'DNB10059', i, 'v', ''));
  lines.push(pasteLine(6, '台北酒泉', 'DNB10062', 19, 'v', ''));
  await page.fill('#pasteBox', lines.join('\n'));
  await page.click('button.btn-primary');
  await expect(page.locator('#parseMsg')).toHaveText(/已同步至雲端/);

  const panels = page.locator('#invPanels');
  await expect(panels).toContainText('知悉宣導提醒');
  const table = panels.locator('table').nth(2);
  const tonghua = table.locator('tr', { hasText: '通化' });
  await expect(tonghua).toContainText('15/15');
  await expect(tonghua).toContainText('✓ 已完成');
  const expectedDate = currentMonthFixture(5, '台北通化', 'DNB10059', 19, 'v', '').fillDate.replace(/^\d{4}\//, '');
  await expect(tonghua).toContainText(expectedDate);
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
  await openAndUnlock(page);
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
  await openAndUnlock(page);
  await expect(page.locator('#cloudStatus')).toHaveText(/已連線/);

  const lines = [];
  for (let i = 1; i <= 25; i++) {
    lines.push(pasteLine((i % 28) + 1, '台北三創', 'DNB10307', (i % 33) + 1, 'v', ''));
  }
  await page.fill('#pasteBox', lines.join('\n'));
  await page.click('button.btn-primary');
  await expect(page.locator('#parseMsg')).toHaveText(/已同步至雲端/);
  expect(cloudRows.length).toBe(25);
  expect(writeCalls).toBeGreaterThan(1); // 確實有分批
});

test('公開頁面不載入班表副本，未連線或未輸入通行碼時保持鎖定', async ({ page }) => {
  await page.route('https://script.google.com/**', route => route.abort());
  await page.goto(PAGE_URL);
  await expect(page.locator('script[src="data/schedule.js"]')).toHaveCount(0);
  await expect(page.locator('#patrolAuthGate')).toBeVisible();
  await expect(page.locator('.secure-tab')).toHaveCount(0);
  await expect(page.locator('#scheduleView')).toHaveCount(0);
});

test('加密頁籤：每月班表可切換日週月檢視', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await page.locator('.secure-tab[data-view="schedule"]').click();
  await expect(page.locator('#scheduleView')).toBeVisible();
  await expect(page.locator('#scheduleContent')).toContainText('通化');
  await page.locator('#scheduleMode').selectOption('week');
  await expect(page.locator('#scheduleContent')).toContainText('每週出勤');
  await page.locator('#scheduleMode').selectOption('month');
  await expect(page.locator('#scheduleContent')).toContainText('每月班表');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 Excel' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/TWM_班表_2026-07\.xls/);
  const xml = await fs.readFile(await download.path(), 'utf8');
  expect(xml).toContain('班表顏色備註');
  expect(xml).toContain('店長：淺膚色');
  expect(xml).toContain('副店長：淺藍色');
  expect(xml).toContain('休假：淺綠色');
  expect(xml).toContain('ss:StyleID="Manager"');
  expect(xml).toContain('ss:StyleID="AssistantManager"');
  expect(xml).toContain('ss:StyleID="Vacation"');
});

test('加密頁籤：半月督導檢查可回填缺失與改善說明', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await page.locator('.secure-tab[data-view="half"]').click();
  await expect(page.locator('#halfView')).toBeVisible();
  await expect(page.locator('.half-item')).toHaveCount(18);
  await page.locator('#halfInspector').fill('測試督導');
  await page.locator('.half-result').first().selectOption('abnormal');
  await page.locator('.half-note').first().fill('展示機未亮');
  await page.locator('.half-improvement').first().fill('當日完成開機並拍照回存');
  await page.getByRole('button', { name: '只暫存本機' }).click();
  await expect(page.locator('#halfHistory')).toContainText('通化');
  await expect(page.locator('#halfHistory')).toContainText('1 項異常');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 Excel' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/半月督導檢查_.*\.xls/);
  const xml = await fs.readFile(await download.path(), 'utf8');
  expect(xml).toContain('照片影片附件');
  expect(xml).toContain('第 1–18 項');
});

test('半月同步 token 逾時時保留本機資料，重新驗證後只續傳一次', async ({ page }) => {
  // 18 題依既有 URL 長度限制切成 3 個 hwrite；讓第 2 段失效，
  // 驗證不會從頭重送已成功的第 1 段。
  expireHalfWriteAt = 2;
  await stubGas(page);
  await openAndUnlock(page);
  await page.locator('.secure-tab[data-view="half"]').click();
  await page.locator('#halfInspector').fill('測試督導');
  await page.locator('.half-result').first().selectOption('abnormal');
  await page.locator('.half-note').first().fill('展示機未亮');
  await page.locator('.half-improvement').first().fill('當日完成開機並拍照回存');

  await page.getByRole('button', { name: '儲存並同步本期檢查' }).click();
  await expect(page.locator('#patrolReauthModal')).toBeVisible();
  await expect(page.locator('#patrolReauthModal')).toContainText('督導驗證已逾時，請重新驗證後繼續同步');
  await expect(page.locator('#halfInspector')).toHaveValue('測試督導');
  await expect(page.locator('.half-note').first()).toHaveValue('展示機未亮');
  expect(await page.evaluate(() => sessionStorage.getItem('bei12b_pt_session_token'))).toBeNull();
  expect(halfRows).toHaveLength(7);
  expect(new Set(halfRows.map(row => `${row.checkId}|${row.item}`)).size).toBe(7);

  await page.locator('#patrolReauthPasscode').fill(PT_KEY);
  await page.getByRole('button', { name: '重新驗證並繼續同步' }).click();
  await expect.poll(() => halfRows.length).toBe(18);
  await expect(page.locator('#halfMsg')).toContainText('已同步雲端');
  expect(halfWriteCalls).toBe(4); // 第 1 段成功 + 第 2 段失敗／續傳 + 第 3 段成功
  expect(new Set(halfRows.map(row => `${row.checkId}|${row.item}`)).size).toBe(18);

  await page.reload();
  await expect(page.locator('#patrolAuthGate')).toBeHidden();
  await page.locator('.secure-tab[data-view="half"]').click();
  await expect(page.locator('#halfHistory')).toContainText('測試督導');
  await expect(page.locator('#halfHistory')).toContainText('1 項異常');
});

test('加密頁籤：半月督導檢查可上傳照片影片並在歷史回放', async ({ page }) => {
  await stubGas(page);
  await openAndUnlock(page);
  await page.locator('.secure-tab[data-view="half"]').click();
  await page.locator('#halfInspector').fill('測試督導');
  const mediaInput = page.locator('.half-evidence-file').first();
  await mediaInput.setInputFiles({ name: '展示機.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('photo') });
  await expect(page.locator('.half-media-card .pending')).toHaveCount(1);
  await mediaInput.setInputFiles({ name: '展示機說明.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video') });
  await expect(page.locator('.half-media-card .pending')).toHaveCount(2);
  await page.getByRole('button', { name: '上傳選取的照片／影片' }).first().click();
  await expect.poll(() => mediaUploads.length).toBe(2);
  await expect(page.locator('.half-media-card img').first()).toBeVisible();
  await expect(page.locator('.half-media-card iframe').first()).toBeVisible();

  await page.getByRole('button', { name: '儲存並同步本期檢查' }).click();
  await expect.poll(() => halfRows.length).toBe(18);
  expect(halfRows[0].evidenceNames).toContain('media-1');
  await page.getByRole('button', { name: /預覽／回放 2 個檔案/ }).click();
  await expect(page.locator('#halfMediaModal')).toBeVisible();
  await expect(page.locator('#halfMediaModal img')).toBeVisible();
  await expect(page.locator('#halfMediaModal iframe')).toBeVisible();
  await page.locator('#halfMediaModal .half-media-modal-close').click();
  await expect(page.locator('#halfMediaModal')).toHaveCount(0);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '匯出 Excel' }).click();
  const xml = await fs.readFile(await (await downloadPromise).path(), 'utf8');
  expect(xml).toContain('開啟私有附件');
  expect(xml).toContain('ss:HRef="https://drive.google.com/file/d/media-1/view"');
});

test('督導檢查大盤直接採計貼上巡店紀錄的上下半月、月盤點與雙月第 18 項', async ({ page }) => {
  const full = (store, code, date, from, to) => Array.from({ length: to - from + 1 }, (_, index) => ({
    fillTime: `${date} 16:43`, arriveTime: `${date} 16:00`, leaveTime: `${date} 18:00`, district: '北一二B',
    code, store, inspector: '測試督導', item: from + index, result: 'v', reason: '', month: '2026-07',
  }));
  cloudRows = [
    ...full('台北通化', 'DNB10059', '2026/7/10', 2, 13),
    ...full('台北通化', 'DNB10059', '2026/7/20', 2, 13),
    ...full('台北通化', 'DNB10059', '2026/7/20', 14, 18),
    ...full('台北酒泉', 'DNB10062', '2026/7/10', 2, 5),
  ];
  await stubGas(page);
  await openAndUnlock(page);
  await page.locator('button[data-view="halfDashboard"]').click();
  await page.locator('#halfDashboardMonth').fill('2026-07');
  await page.locator('#halfDashboardMonth').press('Tab');
  const dashboard = page.locator('#halfDashboardView');
  await expect(dashboard).toBeVisible();
  await expect(dashboard).toContainText('資料來源：目前已載入 33 筆巡店明細');
  await expect(dashboard).toContainText('7–8月雙月全盤・題 18');
  await expect(dashboard).toContainText('巡店異常明細（檢查≥10項、到店≥5次）');
  const tonghua = dashboard.locator('.half-dashboard-store', { hasText: '台北通化' });
  await expect(tonghua).toContainText('完成');
  await expect(tonghua).toContainText('本月到店 2 次');
  const jiuquan = dashboard.locator('.half-dashboard-store', { hasText: '台北酒泉' });
  await expect(jiuquan).toContainText('缺 8 項');
  await expect(jiuquan).toContainText('尚未開始');
});

test('巡店異常明細只計入檢查至少 10 項且到店至少 5 次的門市', async ({ page }) => {
  const fixture = currentMonthFixture(1, '台北通化', 'DNB10059', 1, 'v', '');
  const rows = (store, code, days) => days.flatMap((day, index) => Array.from({ length: 10 }, (_, item) => ({
    fillTime: `${fixture.fillDate.replace(/\/1$/, `/${day}`)} 16:43`, arriveTime: `${fixture.fillDate.replace(/\/1$/, `/${day}`)} 16:00`, leaveTime: `${fixture.fillDate.replace(/\/1$/, `/${day}`)} 18:00`, district: '北一二B',
    code, store, inspector: '測試督導', item: item + 2, result: 'v', reason: '', month: fixture.month,
  })).concat(index === days.length - 1 ? [{
    fillTime: `${fixture.fillDate.replace(/\/1$/, `/${day}`)} 16:43`, arriveTime: `${fixture.fillDate.replace(/\/1$/, `/${day}`)} 16:00`, leaveTime: `${fixture.fillDate.replace(/\/1$/, `/${day}`)} 18:00`, district: '北一二B',
    code, store, inspector: '測試督導', item: 12, result: '', reason: '展示機異常', month: fixture.month,
  }] : []));
  cloudRows = [
    ...rows('台北通化', 'DNB10059', [2, 5, 10, 16, 20]),
    ...rows('台北酒泉', 'DNB10062', [2, 5, 10, 16]),
  ];
  await stubGas(page);
  await openAndUnlock(page);
  await page.locator('button[data-view="halfDashboard"]').click();
  const dashboard = page.locator('#halfDashboardView');
  await expect(dashboard).toContainText('本月到店 5 次');
  await expect(dashboard).toContainText('本月到店 4 次');
  const issueStat = dashboard.locator('.half-stat').filter({ hasText: '巡店異常明細' });
  await expect(issueStat).toHaveText(/1.*巡店異常明細/);
});

/* =========================================================================
   每日移動里程頁籤
   夾具＝2026-06 實際巡店明細（6/1～6/22，21 次到店）。刻意為部分到店重複
   多列題號，用來驗證「同店只取最早一筆」。
   ========================================================================= */
const JUNE_VISITS = [
  ['2026/6/1 20:13', '2026/6/1 10:11', 'DNB10062', '台北酒泉'],
  ['2026/6/2 17:47', '2026/6/2 10:22', 'DNB10284', '台北大稻埕'],
  ['2026/6/3 16:38', '2026/6/3 10:19', 'DNB10307', '台北三創'],
  ['2026/6/3 19:51', '2026/6/3 17:17', 'DNB10440', '台北六張犁'],
  ['2026/6/4 15:16', '2026/6/4 10:15', 'DNB10062', '台北酒泉'],
  ['2026/6/4 19:39', '2026/6/4 15:53', 'DNB10174', '台北通化'],
  ['2026/6/5 16:10', '2026/6/5 10:21', 'DNB10307', '台北三創'],
  ['2026/6/5 19:54', '2026/6/5 16:46', 'DNB10168', '台北萬大'],
  ['2026/6/8 19:27', '2026/6/8 10:26', 'DNB10284', '台北大稻埕'],
  ['2026/6/9 17:10', '2026/6/9 10:08', 'DNB10307', '台北三創'],
  ['2026/6/9 19:36', '2026/6/9 17:45', 'DNB10094', '台北復興南'],
  ['2026/6/10 19:32', '2026/6/10 10:20', 'DNB10062', '台北酒泉'],
  ['2026/6/15 14:49', '2026/6/15 10:20', 'DNB10307', '台北三創'],
  ['2026/6/15 17:26', '2026/6/15 15:24', 'DNB10082', '台北永吉'],
  ['2026/6/15 19:51', '2026/6/15 18:49', 'DNB10062', '台北酒泉'],
  ['2026/6/16 15:03', '2026/6/16 10:20', 'DNB10062', '台北酒泉'],
  ['2026/6/16 19:30', '2026/6/16 15:41', 'DNB10168', '台北萬大'],
  ['2026/6/18 14:05', '2026/6/18 10:10', 'DNB10284', '台北大稻埕'],
  ['2026/6/18 19:35', '2026/6/18 14:41', 'DNB10440', '台北六張犁'],
  ['2026/6/22 14:21', '2026/6/22 10:20', 'DNB10284', '台北大稻埕'],
  ['2026/6/22 16:38', '2026/6/22 14:50', 'DNB10094', '台北復興南'],
];
function juneDetails() {
  const rows = [];
  JUNE_VISITS.forEach(([fillTime, arriveTime, code, store]) => {
    // 每次到店產生 3 列題號；且第 2 列刻意給「更晚的到店時間」，
    // 驗證去重時取最早那筆、不會被較晚的覆蓋。
    for (let i = 1; i <= 3; i++) {
      const at = i === 2 ? arriveTime.replace(/(\d+):(\d+)$/, (m, h) => `${Number(h) + 1}:59`) : arriveTime;
      rows.push({
        fillTime, arriveTime: at, leaveTime: fillTime, district: '北一二B',
        code, store, inspector: '測試督導', item: String(i), content: '', result: 'v',
        reason: '', month: '2026-06',
      });
    }
  });
  return rows;
}
async function openMileage(page, details) {
  const rows = details || juneDetails();
  cloudRows = rows;
  await stubGas(page);
  await openAndUnlock(page);
  await page.evaluate(rows => { rawDetails = rows; currentMonth = '2026-06'; const monthInput = document.getElementById('monthInput'); if (monthInput) monthInput.value = '2026-06'; rows.forEach(r => {
    const s = r.store; if (!records[s]) records[s] = { code: r.code, entries: [] };
    records[s].entries.push({ month: r.month, date: r.arriveTime.split(' ')[0], half: 1, item: r.item, result: r.result });
  }); render(); }, rows);
  await page.click('.secure-tab[data-view="mileage"]');
  await expect(page.locator('#mileageView')).toHaveClass(/active/);
  await page.evaluate(() => MI.setMonth('2026-06'));
}

test('里程頁籤可正常開啟，且不影響原有頁籤', async ({ page }) => {
  await openMileage(page);
  await expect(page.locator('#miStats .mi-card')).toHaveCount(4);
  // 切回巡店看板，原功能仍在
  await page.click('.secure-tab[data-view="patrol"]');
  await expect(page.locator('#mileageView')).not.toHaveClass(/active/);
  await expect(page.locator('#patrolInputPanel')).toBeVisible();
  await expect(page.locator('#content')).toContainText('台北酒泉');
});

test('同日巡店依到店時間排序，同店重複只取最早一筆', async ({ page }) => {
  await openMileage(page);
  const plan = await page.evaluate(() => {
    const d = MI._days();
    return { names: d['2026-06-15'].map(n => n.name), times: d['2026-06-15'].map(n => n.time) };
  });
  expect(plan.names).toEqual(['台北三創', '台北永吉', '台北酒泉']);
  expect(plan.times).toEqual(['10:20', '15:24', '18:49']); // 皆為最早一筆，未被 +1 小時那列覆蓋
});

test('單店日公里數為 0 且備註為單店不計', async ({ page }) => {
  await openMileage(page);
  const p = await page.evaluate(() => { const d = MI._days(); return MI._dayPlan('2026-06-01', d['2026-06-01']); });
  expect(p.km).toBe(0);
  expect(p.note).toBe('單店，不計油料里程');
  expect(p.storeCount).toBe(1);
});

test('未知路段不會被填成 0，且維持待查狀態', async ({ page }) => {
  await openMileage(page);
  const r = await page.evaluate(() => {
    const nodes = [{ name: '台北杭州南', time: '10:00', key: '1000' }, { name: '台北通化', time: '15:00', key: '1500' }];
    const p = MI._dayPlan('2026-06-27', nodes);
    return { km: p.km, todo: p.todo, legKm: p.legs[0].km };
  });
  expect(r.km).toBeNull();      // 不是 0
  expect(r.legKm).toBeNull();   // 不是 0
  expect(r.todo).toEqual(['台北杭州南→台北通化']);
});

test('三店以上不平均拆分：可拆段就逐段加總，不可拆就不猜', async ({ page }) => {
  await openMileage(page);
  const p = await page.evaluate(() => { const d = MI._days(); return MI._dayPlan('2026-06-15', d['2026-06-15']); });
  expect(p.legs.map(l => l.km)).toEqual([4.4, 10]);   // 逐段各自查表，非 14.4/2
  expect(p.km).toBe(14.4);
  // 有未知段時整日不給總數、也不平均
  const q = await page.evaluate(() => MI._dayPlan('2026-06-28', [
    { name: '台北三創', key: '1000' }, { name: '台北杭州南', key: '1200' }, { name: '台北通化', key: '1500' }]));
  expect(q.legs[0].km).toBe(3);   // 已知段照給
  expect(q.legs[1].km).toBeNull();// 未知段留空
  expect(q.km).toBeNull();        // 不用已知段回推、不平均
});

test('台北電信為特殊地點，不計入巡店門市數但可作里程起訖點', async ({ page }) => {
  await openMileage(page);
  const r = await page.evaluate(() => {
    const nodes = [{ name: '台北電信', time: '09:00', key: '0900' }, { name: '台北萬大', time: '11:00', key: '1100' }];
    const p = MI._dayPlan('2026-06-27', nodes);
    return { isOffice: MI._isOffice('台北電信'), storeCount: p.storeCount, km: p.km, verify: p.legs[0].verify };
  });
  expect(r.isOffice).toBe(true);
  expect(r.storeCount).toBe(1);   // 兩個節點，只有萬大算巡店門市
  expect(r.km).toBe(6.4);         // 仍可作為里程起訖點
  expect(r.verify).toBe('manual');
});

test('1.5KM 路段為台北電信→台北復興南，且不存在萬大→復興南', async ({ page }) => {
  await openMileage(page);
  const r = await page.evaluate(() => ({
    telecom: MI._legFor('台北電信', '台北復興南'),
    wanda: MI._legFor('台北萬大', '台北復興南'),
  }));
  expect(r.telecom.km).toBe(1.5);
  expect(r.telecom.month).toBe('Y2511');
  expect(r.telecom.date).toBe('2025-11-18');
  expect(r.telecom.source).toContain('原文誤植');
  expect(r.wanda).toBeNull();     // 不建立不存在的路段
});

test('Excel 產出「油料」與「距離計算明細」兩張工作表，欄位順序與固定值正確', async ({ page }) => {
  await openMileage(page);
  const r = await page.evaluate(() => {
    const b = MI._buildSheets('2026-06');
    const val = c => (c && typeof c === 'object' && 'value' in c) ? c.value : c;
    return {
      names: b.sheets.map(s => s.name),
      fareHead: b.sheets[0].rows[0].map(val),
      detailHead: b.sheets[1].rows[1].map(val),
      row1: b.sheets[0].rows[1].map(val),
      tail: b.sheets[1].rows.slice(-2).map(r => r.map(val)),
      cols: b.sheets.map(s => s.cols),
      merges: b.sheets[1].merges,
      total: b.total,
    };
  });
  expect(r.names).toEqual(['油料', '距離計算明細']);
  // 9 欄，依公司正式報銷表；欄名含換行
  expect(r.fareHead).toEqual(['成本歸屬部門', '成本歸屬者', '出差日期\n(起)', '出差日期\n(迄)', '出差地點',
    '事由及\n洽訪目標', '油料補助\n里程數(KM)', '車號', '備註']);
  expect(r.detailHead).toEqual(['日期', '起點', '迄點', '騎車距離(KM)', '巡店順序', '距離來源', '驗證狀態']);
  // 單店 0 KM 日不列入正式報銷表，首列為 6/3；備註留白
  // 成本歸屬與日期格式依 2026-06 公司正式報銷表；備註留白
  expect(r.row1).toEqual(['北一二區直營部', '盧蔚榮', '2026/6/3', '2026/6/3', '台北三創/台北六張犁', '巡店', 4.5, 'NAS-9666', '']);
  expect(r.tail[0][0]).toBe('全月出差日');
  expect(r.tail[1][0]).toBe('全月油料里程合計');
  expect(r.cols).toEqual([[18, 18, 24, 24, 48, 14, 21, 18, 18], [12, 18, 18, 14, 12, 42, 14]]);
  expect(r.merges).toEqual([{ row: 0, col: 0, across: 6 }]);
  expect(r.total).toBe(74.5);
});

test('單店 0 KM 日不列入正式報銷表，但仍顯示於畫面', async ({ page }) => {
  await openMileage(page);
  const r = await page.evaluate(() => {
    const all = MI._monthPlans('2026-06'), bill = MI._billable(all);
    const b = MI._buildSheets('2026-06');
    const val = c => (c && typeof c === 'object' && 'value' in c) ? c.value : c;
    return {
      allDays: all.length, billDays: bill.length,
      zeroDays: all.filter(p => p.km === 0).map(p => p.date),
      fareDates: b.sheets[0].rows.slice(1).map(r => val(r[2])),
    };
  });
  expect(r.allDays).toBe(15);                 // 12 個巡店日 + 3 個由正式報銷表補入
  expect(r.billDays).toBe(11);                // 其中 11 天可報銷（＝正式報銷表天數）
  expect(r.zeroDays).toEqual(['2026-06-01', '2026-06-02', '2026-06-08', '2026-06-10']);
  r.zeroDays.forEach(d => expect(r.fareDates).not.toContain(d));
  await expect(page.locator('#miSummary')).toContainText('不列入報銷');
  await expect(page.locator('#miSummary')).toContainText('11 個報銷出差日');
});

test('與正式報銷表對帳：11 天／74.5 KM 為基準', async ({ page }) => {
  await openMileage(page);
  const off = await page.evaluate(() => MI.OFFICIAL['2026-06']);
  expect(off.days).toBe(11);
  expect(off.km).toBe(74.5);
  expect(Math.round(off.rows.reduce((a, r) => a + r[2], 0) * 10) / 10).toBe(74.5);
  // 逐日把正式報銷表的路線餵進計算引擎，驗證逐段加總可還原官方里程
  const rep = await page.evaluate(() => MI.OFFICIAL['2026-06'].rows.map(([d, place, km]) => {
    const nodes = place.split('/').map((n, i) => ({ name: n, time: `${10 + i}:00`, key: `${10 + i}00` }));
    const p = MI._dayPlan(d, nodes);
    return { date: d, place, offKm: km, gotKm: p.km, legs: p.legs.map(l => l.km) };
  }));
  const ok = rep.filter(r => r.gotKm === r.offKm);
  expect(ok).toHaveLength(11);            // 11/11 逐日相符
  expect(Math.round(rep.reduce((a, r) => a + r.gotKm, 0) * 10) / 10).toBe(74.5);
  // 6/15 三店：逐段加總 4.4 + 10.0 = 14.4，非平均
  const d15 = rep.find(r => r.date === '2026-06-15');
  expect(d15.legs).toEqual([4.4, 10]);
  expect(d15.gotKm).toBe(14.4);
});

test('對帳面板顯示正式基準與差異，不再出現 18 天', async ({ page }) => {
  await openMileage(page);
  const cov = page.locator('#miCoverage');
  await expect(cov).toContainText('正式出差日：11 天');
  await expect(cov).toContainText('74.5 KM');
  await expect(cov).toContainText('已與正式報銷表完成對帳');
  await expect(cov).not.toContainText('18 天');
  await expect(cov).not.toContainText('缺少日期');
  await expect(cov).toContainText('單店 0 KM 日，不列入報銷');
  // 6/22 依正式報銷表照片為台北大稻埕，與巡店明細一致
  const off22 = await page.evaluate(() => MI.OFFICIAL['2026-06'].rows.find(r => r[0] === '2026-06-22'));
  expect(off22[1]).toBe('台北大稻埕/台北復興南');
});

test('待查路段存在時不得產生正式報銷檔，只能匯出標示未完成的測試版', async ({ page }) => {
  await openMileage(page);
  // 製造一個未知路段：新增一天走「杭州南→通化」
  await page.evaluate(() => {
    rawDetails.push(
      { fillTime: '2026/6/27 20:00', arriveTime: '2026/6/27 10:00', code: 'DNB10146', store: '台北杭州南', item: '1', month: '2026-06' },
      { fillTime: '2026/6/27 20:00', arriveTime: '2026/6/27 15:00', code: 'DNB10174', store: '台北通化', item: '1', month: '2026-06' });
    MI.render();
  });
  await page.click('button:has-text("匯出公司報銷 Excel")');
  const dlg = page.locator('#miExportDlg');
  await expect(dlg).toContainText('待查路段數');
  await expect(dlg).toContainText('已停用正式匯出');
  await expect(dlg.locator('button:has-text("匯出正式報銷檔")')).toBeDisabled();
  await expect(dlg.locator('button:has-text("匯出測試版")')).toBeEnabled();
  const name = await page.evaluate(() => {
    let f = null;
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { f = this.download; };
    MI.doExport(true);
    HTMLAnchorElement.prototype.click = orig;
    return f;
  });
  expect(name).toContain('未完成請勿報銷');
});

test('無待查路段時可匯出正式報銷檔，檔名不帶測試標記', async ({ page }) => {
  await openMileage(page);
  await page.click('button:has-text("匯出公司報銷 Excel")');
  const dlg = page.locator('#miExportDlg');
  await expect(dlg).toContainText('出差日數');
  await expect(dlg.locator('button:has-text("匯出正式報銷檔")')).toBeEnabled();
  const out = await page.evaluate(() => {
    let f = null; const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { f = this.download; };
    MI.doExport(false);
    HTMLAnchorElement.prototype.click = orig;
    return { file: f, log: MI._store().exportLog };
  });
  expect(out.file).toBe('北一二B_巡店車資報銷_202606.xls');
  expect(out.file).not.toContain('未完成');
  expect(out.log[0].totalKm).toBe(74.5);
  expect(out.log[0].days).toBe(11);
});

test('6/23、6/24、6/30 由正式報銷表補入且標為正式受控，不再視為缺漏', async ({ page }) => {
  await openMileage(page);
  const r = await page.evaluate(() => ['2026-06-23', '2026-06-24', '2026-06-30'].map(d => {
    const p = MI._dayPlan(d, MI._days()[d]);
    return { date: d, place: p.nodes.map(n => n.name).join('/'), km: p.km, official: !!p.official,
             src: p.legs[0].source, verify: p.legs[0].verify };
  }));
  expect(r[0]).toMatchObject({ place: '台北酒泉/台北萬大', km: 6.6, official: true, verify: 'official' });
  expect(r[1]).toMatchObject({ place: '台北大稻埕/台北永吉', km: 7.2, official: true, verify: 'official' });
  expect(r[2]).toMatchObject({ place: '台北三創/台北通化', km: 3.6, official: true, verify: 'official' });
  r.forEach(x => expect(x.src).toBe('2026 年 6 月正式公司報銷表'));
  // 這三天必須進正式匯出
  const dates = await page.evaluate(() => {
    const b = MI._buildSheets('2026-06');
    const v = c => (c && typeof c === 'object' && 'value' in c) ? c.value : c;
    return b.sheets[0].rows.slice(1).map(r => v(r[2]));
  });
  ['2026/6/23', '2026/6/24', '2026/6/30'].forEach(d => expect(dates).toContain(d));
});

test('Y2606 完整對帳：油料 11 列、合計 74.5 KM、備註留白', async ({ page }) => {
  await openMileage(page);
  const r = await page.evaluate(() => {
    const b = MI._buildSheets('2026-06');
    const v = c => (c && typeof c === 'object' && 'value' in c) ? c.value : c;
    const rc = MI._reconcile('2026-06');
    return {
      rows: b.sheets[0].rows.slice(1).map(r => r.map(v)),
      detail: b.sheets[1].rows.slice(2, -3).map(r => r.map(v)),
      tail: b.sheets[1].rows.slice(-2).map(r => r.map(v)),
      total: b.total, match: rc.match, mineDays: rc.mineDays,
    };
  });
  expect(r.rows).toHaveLength(11);
  expect(r.total).toBe(74.5);
  expect(r.match).toBe(true);
  expect(r.mineDays).toBe(11);
  expect(Math.round(r.rows.reduce((a, x) => a + x[6], 0) * 10) / 10).toBe(74.5);
  r.rows.forEach(x => expect(x[8]).toBe(''));            // 備註全部留白
  // 距離計算明細涵蓋 11 天、共 12 段（6/15 拆兩段）
  expect(new Set(r.detail.map(x => x[0])).size).toBe(11);
  expect(r.detail).toHaveLength(12);
  const d15 = r.detail.filter(x => x[0] === '2026/6/15');
  expect(d15.map(x => [x[3], x[4]])).toEqual([[4.4, '第 1 段'], [10, '第 2 段']]);
  expect(r.tail[0]).toEqual(['全月出差日', 11]);
  expect(r.tail[1]).toEqual(['全月油料里程合計', 74.5]);
});

test('人工修改只寫入里程資料層，不改寫原始巡店紀錄', async ({ page }) => {
  await openMileage(page);
  const before = await page.evaluate(() => JSON.stringify(rawDetails));
  await page.evaluate(() => MI.setLegKm('2026-06-03', '台北三創', '台北六張犁', 4.9, '實走修正'));
  const after = await page.evaluate(() => ({
    raw: JSON.stringify(rawDetails),
    plan: MI._dayPlan('2026-06-03', MI._days()['2026-06-03']),
    saved: MI._store().dayEdits['2026-06-03'].legKm['台北三創|台北六張犁'],
  }));
  expect(after.raw).toBe(before);            // 原始明細一字未動
  expect(after.plan.km).toBe(4.9);           // 里程層生效
  expect(after.saved.prev).toBe(4.5);        // 保留修改前數值
  expect(after.saved.note).toBe('實走修正');
});

test('資料涵蓋日期以正式報銷表為完整依據，未列於報銷表者不憑空出現', async ({ page }) => {
  await openMileage(page);
  const cov = await page.evaluate(() => MI._coverage('2026-06'));
  expect(cov.first).toBe('2026-06-01');
  // 涵蓋範圍含正式報銷表補入的 6/23、6/24、6/30
  expect(cov.last).toBe('2026-06-30');
  expect(cov.have).toHaveLength(15);         // 12 巡店日 + 3 正式報銷表補入
  // 有正式報銷表基準的月份不再列缺漏
  expect(cov.missingTail).toEqual([]);
  await expect(page.locator('#miCoverage')).toContainText('正式出差日：11 天');
  // 未涵蓋日期不得憑空出現在彙整
  const plans = await page.evaluate(() => MI._monthPlans('2026-06').map(p => p.date));
  expect(plans).toContain('2026-06-23');   // 由正式報銷表補入
  expect(plans).not.toContain('2026-06-25'); // 不在報銷表內者仍不憑空出現
  expect(plans).toHaveLength(15);
});
