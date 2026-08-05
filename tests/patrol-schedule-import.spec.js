const { test, expect } = require('@playwright/test');
const path = require('path');

// 班表匯入：門市電腦連得到 GAS 但不一定連得到 docs.google.com，
// 所以驗證重點是「不開試算表也能把整個月寫進去」，以及分批/清舊資料的協定正確。
const PT_KEY = 'test123';
const PT_TOKEN = 'test-session-token';
const PAGE_URL = 'file://' + path.resolve(__dirname, '../patrol.html');

let swriteCalls;
let sheet;          // 模擬 班表明細，只留 (月份, 門市, 日期, 同仁)
let failBatch;      // 讓第 N 批失敗，用來測部分失敗的行為

function scheduleFixture(month, rows) {
  const stores = {};
  rows.forEach(r => {
    const s = stores[r[1]] || (stores[r[1]] = { store: r[1], title: '台北' + r[1], staff: [], days: {} });
    const d = s.days[r[2]] || (s.days[r[2]] = { date: r[2], staff: [], managers: [], workingStaff: [] });
    const a = { name: r[5], role: r[6], status: r[7], working: r[8] === '是' };
    d.staff.push(a);
    if (a.working) d.workingStaff.push(a);
    if (r[9] === '是') d.managers.push(a);
  });
  return {
    month, rocMonth: '115/08',
    stores: Object.keys(stores).sort().map(k => ({
      ...stores[k], days: Object.keys(stores[k].days).sort().map(d => stores[k].days[d]),
    })),
  };
}

async function stubGas(page) {
  await page.route('https://script.google.com/**', route => {
    const request = route.request();
    const url = request.url();

    if (request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      if (payload.action === 'ptauth') {
        return route.fulfill({ json: payload.key === PT_KEY
          ? { status: 'ok', token: PT_TOKEN, expiresIn: 1800 }
          : { status: 'error', message: 'unauthorized' } });
      }
      if (payload.action === 'swrite') {
        swriteCalls.push(payload);
        if (failBatch === swriteCalls.length) {
          return route.fulfill({ json: { status: 'error', message: '模擬伺服器錯誤' } });
        }
        let removed = 0;
        if (payload.replace) {
          const before = sheet.length;
          sheet = sheet.filter(r => r[0] !== payload.month);
          removed = before - sheet.length;
        }
        payload.rows.forEach(r => sheet.push(r));
        const out = { status: 'ok', written: payload.rows.length, removed, month: payload.month };
        if (payload.finalize) {
          const mine = sheet.filter(r => r[0] === payload.month);
          out.total = mine.length;
          out.storeCount = new Set(mine.map(r => r[1])).size;
          out.version = 'inserted';
        }
        return route.fulfill({ json: out });
      }
      return route.fulfill({ json: { status: 'ok' } });
    }

    if (url.includes('action=sread')) {
      const month = decodeURIComponent((url.match(/[?&]month=([^&]*)/) || [])[1] || '');
      const rows = sheet.filter(r => !month || r[0] === month);
      const body = JSON.stringify(rows.length
        ? { status: 'ok', schedule: scheduleFixture(month || rows[0][0], rows) }
        : { status: 'error', message: '尚無已匯入的班表資料' });
      return route.fulfill({ contentType: 'application/json', body });
    }
    const cb = (url.match(/[?&]callback=([^&]*)/) || [])[1];
    const body = JSON.stringify(url.includes('action=pthealth')
      ? { status: 'ok', configured: true, contract: 'patrol-auth-v3' }
      : { status: 'ok', rows: [], stores: [], title: 'T' });
    return route.fulfill({
      contentType: cb ? 'application/javascript' : 'application/json',
      body: cb ? `${cb}(${body})` : body,
    });
  });
}

async function openImportPanel(page) {
  await page.goto(PAGE_URL);
  await page.locator('#patrolPasscode').fill(PT_KEY);
  await page.getByRole('button', { name: '驗證並進入' }).click();
  await expect(page.locator('#patrolAuthGate')).toBeHidden();
  await page.getByRole('button', { name: '每月班表' }).click();
  await page.getByRole('button', { name: '班表匯入' }).click();
  await expect(page.locator('#scheduleImportPanel')).toBeVisible();
}

/** 產生 n 位同仁 × 整個 8 月的 12 欄資料，格式與正式匯入檔相同。 */
function augRows(store, staff, days = 31) {
  const rows = [];
  for (let d = 1; d <= days; d++) {
    const date = `2026-08-${String(d).padStart(2, '0')}`;
    staff.forEach(([name, role]) => {
      const shift = d % 5 === 0 ? '例V' : '全';
      const att = shift.endsWith('V') ? '否' : '是';
      const mgr = (['店長', '代理店長', '副店長'].includes(role) && att === '是') ? '是' : '否';
      rows.push(['2026-08', store, date, String(d), '一', name, role, shift, att, mgr, `${store}.png`, '']);
    });
  }
  return rows;
}

const tsv = rows => rows.map(r => r.join('\t')).join('\n');

test.beforeEach(() => { swriteCalls = []; sheet = []; failBatch = 0; });

test('貼上整個月的班表可直接匯入，不必開試算表', async ({ page }) => {
  await stubGas(page);
  await openImportPanel(page);

  // 刻意超過單批 400 列，讓分批送出的協定真的被執行到
  const rows = [...augRows('酒泉', [['賴秋雯', '店長'], ['李鴻文', '副店長'],
                                    ...Array.from({ length: 6 }, (_, i) => [`酒員${i}`, '業務代表'])]),
                ...augRows('大稻埕', [['黃國勛', '店長'],
                                      ...Array.from({ length: 5 }, (_, i) => [`稻員${i}`, '業務代表'])])];
  expect(rows.length).toBeGreaterThan(400);
  await page.locator('#schImpMonth').fill('2026-08');
  await page.locator('#schImpText').fill(tsv(rows));

  await page.getByRole('button', { name: '檢查資料' }).click();
  await expect(page.locator('#schImpReport')).toContainText('檢查通過');
  await expect(page.locator('#schImpReport')).toContainText(`${rows.length} 列`);
  await expect(page.locator('#schImpReport')).toContainText('2 間門市');

  await page.getByRole('button', { name: '確認匯入' }).click();
  await expect(page.locator('#schImpReport')).toContainText('匯入完成', { timeout: 10000 });

  expect(sheet.length).toBe(rows.length);
  // 分批送出：第一批清舊資料，最後一批才寫版本列
  expect(swriteCalls.length).toBeGreaterThan(1);
  expect(swriteCalls[0].replace).toBe(true);
  expect(swriteCalls.slice(1).every(c => c.replace !== true)).toBe(true);
  expect(swriteCalls.filter(c => c.finalize === true).length).toBe(1);
  expect(swriteCalls[swriteCalls.length - 1].finalize).toBe(true);
  expect(swriteCalls.every(c => c.month === '2026-08')).toBe(true);

  // 匯入完直接讀回畫面，不用手動重整
  await expect(page.locator('#scheduleStatus')).toContainText('已載入 2 間門市');
});

test('重跑同一個月不會變成兩份', async ({ page }) => {
  await stubGas(page);
  await openImportPanel(page);
  const rows = augRows('酒泉', [['賴秋雯', '店長']]);

  for (let i = 0; i < 2; i++) {
    await page.locator('#schImpMonth').fill('2026-08');
    await page.locator('#schImpText').fill(tsv(rows));
    await page.getByRole('button', { name: '檢查資料' }).click();
    await page.getByRole('button', { name: '確認匯入' }).click();
    await expect(page.locator('#schImpReport')).toContainText('匯入完成', { timeout: 10000 });
  }
  expect(sheet.length).toBe(rows.length);
});

test('匯入不動到其他月份的資料', async ({ page }) => {
  await stubGas(page);
  sheet = [['2026-07', '酒泉', '2026-07-01', '1', '三', '賴秋雯', '店長', '全', '是', '是', 'x', 't']];
  await openImportPanel(page);

  await page.locator('#schImpMonth').fill('2026-08');
  await page.locator('#schImpText').fill(tsv(augRows('酒泉', [['賴秋雯', '店長']])));
  await page.getByRole('button', { name: '檢查資料' }).click();
  await page.getByRole('button', { name: '確認匯入' }).click();
  await expect(page.locator('#schImpReport')).toContainText('匯入完成', { timeout: 10000 });

  expect(sheet.filter(r => r[0] === '2026-07').length).toBe(1);
});

test('月份對不上時擋在前端，一列都不送出', async ({ page }) => {
  await stubGas(page);
  await openImportPanel(page);

  await page.locator('#schImpMonth').fill('2026-08');
  await page.locator('#schImpText').fill(tsv(augRows('酒泉', [['賴秋雯', '店長']], 2)
    .concat([['2026-07', '酒泉', '2026-07-01', '1', '三', 'X', '店長', '全', '是', '是', 'x', '']])));

  await page.getByRole('button', { name: '檢查資料' }).click();
  await expect(page.locator('#schImpReport')).toContainText('與匯入月份 2026-08 不符');
  await expect(page.getByRole('button', { name: '確認匯入' })).toBeDisabled();
  expect(swriteCalls.length).toBe(0);
});

test('同門市同日期同人重複時擋下並指出是哪兩列', async ({ page }) => {
  await stubGas(page);
  await openImportPanel(page);
  const rows = augRows('酒泉', [['賴秋雯', '店長']], 2);
  await page.locator('#schImpMonth').fill('2026-08');
  await page.locator('#schImpText').fill(tsv([...rows, rows[0]]));

  await page.getByRole('button', { name: '檢查資料' }).click();
  await expect(page.locator('#schImpReport')).toContainText('重複');
  expect(swriteCalls.length).toBe(0);
});

test('接受帶標題列的匯入檔', async ({ page }) => {
  await stubGas(page);
  await openImportPanel(page);
  const header = ['版本月份', '門市', '日期', '日', '週', '同仁', '職務', '班別', '出勤', '值班主管', '來源檔', '匯入時間'];
  const rows = augRows('酒泉', [['賴秋雯', '店長']], 3);

  await page.locator('#schImpMonth').fill('2026-08');
  await page.locator('#schImpText').fill(tsv([header, ...rows]));
  await page.getByRole('button', { name: '檢查資料' }).click();

  await expect(page.locator('#schImpReport')).toContainText('檢查通過');
  await expect(page.locator('#schImpReport')).toContainText(`${rows.length} 列`);
});

test('中途失敗會說清楚並允許重試，重試後不重複', async ({ page }) => {
  await stubGas(page);
  await openImportPanel(page);
  const rows = augRows('三創', Array.from({ length: 20 }, (_, i) => [`員${i}`, '業務代表']));
  expect(rows.length).toBeGreaterThan(400);   // 確定會分批

  failBatch = 2;
  await page.locator('#schImpMonth').fill('2026-08');
  await page.locator('#schImpText').fill(tsv(rows));
  await page.getByRole('button', { name: '檢查資料' }).click();
  await page.getByRole('button', { name: '確認匯入' }).click();
  await expect(page.locator('#schImpReport')).toContainText('模擬伺服器錯誤', { timeout: 10000 });
  await expect(page.getByRole('button', { name: '確認匯入' })).toBeEnabled();

  failBatch = 0;
  await page.getByRole('button', { name: '確認匯入' }).click();
  await expect(page.locator('#schImpReport')).toContainText('匯入完成', { timeout: 15000 });
  expect(sheet.length).toBe(rows.length);
});
