const { test, expect } = require('@playwright/test');
const path = require('path');

const FILE_URL = 'file://' + path.resolve(__dirname, '../index.html');

// Mock GAS 回應（讓 fetch 不需要真正連線）
async function mockGAS(page, { readData = {} } = {}) {
  await page.route('https://script.google.com/**', async route => {
    const url = route.request().url();
    const request = route.request();
    if (request.method() === 'POST') {
      const payload = JSON.parse(request.postData() || '{}');
      if (payload.action === 'private_access') {
        await route.fulfill({ json: { status: 'ok', profile: { maskedName: '測＊員', store: '大稻埕', role: '業代' }, snapshot: { kpiBattle: KPI_BATTLE_FIXTURE, awardsBattle: AWARDS_BATTLE_FIXTURE } } });
      } else if (payload.action === 'kpicalc_access') {
        await route.fulfill({ json: { status: 'ok', data: KPICALC_FIXTURE, profile: { maskedName: '測＊員', store: '大稻埕', role: '業代' } } });
      } else {
        await route.fulfill({ json: { status: 'ok' } });
      }
    } else if (url.includes('action=ping')) {
      await route.fulfill({ json: { status: 'ok' } });
    } else if (url.includes('action=read')) {
      await route.fulfill({ json: { status: 'ok', data: readData } });
    } else if (url.includes('action=write')) {
      await route.fulfill({ json: { status: 'ok' } });
    } else {
      await route.fulfill({ json: { status: 'ok', data: {} } });
    }
  });
}

const KPI_BATTLE_FIXTURE = {
  report_date: '2026-07-16',
  previous_report_date: '2026-07-15',
  source_date_range: '2026/07/01 ~ 07/15',
  aggregate: {
    overall_kpi: 1.0547, overall_kpi_dod: 0.009, company_rank: 27, company_rank_dod: 2, addon_score: 13.36, addon_score_dod: 0.09,
    core: {
      a999: { actual: 72, target: 80, daily_target: 38.7, daily_gap: 33.3, rate: 0.9, dod: 0.01 },
      a1399: { actual: 31, target: 40, daily_target: 19.4, daily_gap: 11.6, rate: 0.775, dod: 0.02 },
      haosu: { actual: 46, target: 45, daily_target: 21.8, daily_gap: 24.2, rate: 1.0222, dod: 0.01 },
      r1399: { actual: 60, target: 70, daily_target: 33.9, daily_gap: 26.1, rate: 0.8571, dod: -0.01 },
    },
    metrics: { '好速案銷售點數': { actual: 46, target: 45, daily_target: 21.8, daily_gap: 24.2, rate: 1.0222, dod: 0.01 } },
  },
  stores: [{
    store: '大稻埕', company_rank: 65, company_rank_dod: -3, overall_kpi: 1.2435, overall_kpi_dod: 0.056, addon_score: 13.57, addon_score_dod: 0.23,
    core: {
      a999: { actual: 10, target: 16, daily_target: 7.7, daily_gap: 2.3, rate: 1.2917, dod: 0.012 },
      a1399: { actual: 6, target: 8, daily_target: 3.9, daily_gap: 2.1, rate: 1.55, dod: -0.02 },
      haosu: { actual: 4.25, target: 18, daily_target: 8.7, daily_gap: -4.5, rate: 0.488, dod: 0.01 },
      r1399: { actual: 18, target: 33, daily_target: 16, daily_gap: 2, rate: 1.1273, dod: 0.03 },
    },
    metrics: { '好速案銷售點數': { actual: 4.25, target: 18, daily_target: 8.7, daily_gap: -4.5, rate: 0.488, dod: 0.01 } },
  }],
  personal: [{
    store: '大稻埕', role: '業務代表(I)', category: '業代', name: '測＊員', rank: 8, rank_dod: 2, overall_rate: 1.056, overall_rate_dod: 0.01,
    phone_award_actual: 1800, phone_award_projected: 3200, phone_award_rank: 8, phone_award_eligible: 'Y', insurance_attach_rate: 0.42,
    metrics: {
      A999: { actual: 4, target: 3, rate: 1.3333 },
      A1399: { actual: 2, target: 2, rate: 1 },
      '好速': { actual: 2, target: 3, rate: 0.6667 },
      R1399: { actual: 3, target: 2, rate: 1.5 },
      RT: { actual: 8, target: 10, rate: 0.8 },
      R999: { actual: 4, target: 5, rate: 0.8 },
      '特維': { actual: 3, target: 4, rate: 0.75 },
      '配件': { actual: 9000, target: 10000, rate: 0.9 },
      '包膜': { actual: 1800, target: 2000, rate: 0.9 },
    },
  }],
};

const AWARD_ITEMS = [
  ['Samsung S26/S26+/A57', 8, 17, 0.4706, -1, 2335],
  ['vivo X300/X300 Pro/V70 FE', 7, 10, 0.7, 2, 1500],
  ['Google Pixel 10/10 Pro/10 Pro XL/10a', 3, 8, 0.375, -1, 1105],
  ['OPPO Reno16 F', 4, 6, 0.6667, 1, 780],
  ['OPPO A6x', 2, 5, 0.4, -1, 600],
  ['SHARP AQUOS R11', 1, 4, 0.25, -1, 470],
  ['Samsung S26 Ultra', 1, 3, 0.3333, -1, 405],
  ['moto razr fold', 0, 2, 0, -1, 300],
  ['Samsung A27/A17', 2, 3, 0.6667, 0, 250],
  ['vivo Y21/Redmi Note 15 Pro', 1, 2, 0.5, 0, 100],
].map(([display_name, actual, target, rate, difference, incremental_award]) => ({
  display_name, actual, target, rate, difference, incremental_award,
  next_label: '下一獎階', threshold_target: Math.ceil(target * 0.5),
}));

const AWARDS_BATTLE_FIXTURE = {
  supervisor: { actual_total: 2431, projected: 11260, rank: '22', award: 'Y' },
  overall: {
    store: '北一二B整體', award: { actual_total: 2431, projected: 11260, rank: '22', award: 'Y' },
    priorities: AWARD_ITEMS.slice(0, 3), items: AWARD_ITEMS,
  },
  stores: [
    { store: '通化', award: { actual_total: 11465, projected: 14860, rank: '18', award: 'Y' }, priorities: AWARD_ITEMS.slice(0, 3), items: AWARD_ITEMS },
    { store: '酒泉', award: { actual_total: 8645, projected: 11460, rank: '189', award: 'N' }, priorities: AWARD_ITEMS.slice(1, 4), items: AWARD_ITEMS },
  ],
};

// 方案 A（2026-07-31）：KPI 戰情頁籤唯一正式來源是 kpicalc JSON（與 kpi.html 同一份）。
// KPI_BATTLE_FIXTURE（snapshot 形狀）保留給「舊數字不得出現」的反向斷言用。
const KPICALC_FIXTURE = {
  meta: { period: '2026/07/01 ~ 07/29', snapshotDay: 29, monthDays: 31, month: '2026-07', sourceFile: '0730.xlsx' },
  items: [
    { key: 'AQ V+D 999 (含)以上', short: 'AQ V+D≧999', step: 1 },
    { key: 'AQ V+D 1399 (含)以上', short: 'AQ V+D≧1399', step: 1 },
    { key: '好速案銷售點數', short: '好速案點數', step: 0.25 },
    { key: 'RT V+D 1399 (含)以上', short: 'RT V+D≧1399', step: 1 },
    { key: 'RT V+D 999 (含)以上', short: 'RT V+D≧999', step: 1 },
    { key: '配件及其他營收', short: '配件及其他營收', step: 1 },
  ],
  stores: [
    { code: 'DNB10284', name: '台北大稻埕', official: 1.1035, items: {
        'AQ V+D 999 (含)以上': { a: 11, t: 16, w: 0.03 }, 'AQ V+D 1399 (含)以上': { a: 6, t: 8, w: 0.02 },
        '好速案銷售點數': { a: 12, t: 18, w: 0.04 }, 'RT V+D 1399 (含)以上': { a: 20, t: 33, w: 0.05 },
        'RT V+D 999 (含)以上': { a: 25, t: 40, w: 0.03 }, '配件及其他營收': { a: 90000, t: 100000, w: 0.02 } } },
    { code: 'DNB10174', name: '台北通化', official: 0.9821, items: {
        'AQ V+D 999 (含)以上': { a: 9, t: 12, w: 0.03 }, 'AQ V+D 1399 (含)以上': { a: 4, t: 6, w: 0.02 },
        '好速案銷售點數': { a: 8, t: 15, w: 0.04 }, 'RT V+D 1399 (含)以上': { a: 15, t: 28, w: 0.05 },
        'RT V+D 999 (含)以上': { a: 18, t: 30, w: 0.03 }, '配件及其他營收': { a: 70000, t: 90000, w: 0.02 } } },
  ],
  persons: [
    { store: 'DNB10284', role: '業務代表(I)', pname: '測＊員', official: 1.056, items: {
        'AQ V+D 999 (含)以上': { a: 4, t: 3, w: 0.03 }, 'AQ V+D 1399 (含)以上': { a: 2, t: 2, w: 0.02 },
        '好速案銷售點數': { a: 2, t: 3, w: 0.04 }, 'RT V+D 1399 (含)以上': { a: 3, t: 2, w: 0.05 },
        'RT V+D 999 (含)以上': { a: 4, t: 5, w: 0.03 }, '配件及其他營收': { a: 9000, t: 10000, w: 0.02 } } },
    { store: 'DNB10174', role: '店長', pname: '測＊二', official: 0.91, items: {
        'AQ V+D 999 (含)以上': { a: 2, t: 3, w: 0.03 }, 'AQ V+D 1399 (含)以上': { a: 1, t: 2, w: 0.02 },
        '好速案銷售點數': { a: 1, t: 3, w: 0.04 }, 'RT V+D 1399 (含)以上': { a: 2, t: 2, w: 0.05 },
        'RT V+D 999 (含)以上': { a: 3, t: 5, w: 0.03 }, '配件及其他營收': { a: 8000, t: 10000, w: 0.02 } } },
  ],
};

async function kpiBattleLogin(page) {
  await page.goto(FILE_URL);
  await page.getByRole('button', { name: /KPI戰情/ }).click();
  await page.locator('#kpiBattleContent input[placeholder="輸入員工編號"]').fill('1234567');
  await page.getByRole('button', { name: '以員編登入' }).click();
}

async function mockAwardsBattle(page) {
  await page.addInitScript(data => { window.__AWARDS_BATTLE_DATA__ = data; }, AWARDS_BATTLE_FIXTURE);
}

test.describe('頁面載入', () => {
  test('標題與頁籤顯示正確', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await expect(page).toHaveTitle(/北一二B/);
    await expect(page.locator('.site-title')).toContainText('北一二');
    await expect(page.locator('.tab-btn')).toHaveCount(6);
    await expect(page.getByRole('button', { name: '🏆 KPI/個績' })).toHaveCount(0);
  });

  test('日期 badge 顯示今日日期', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    const badge = page.locator('#todayBadge');
    await expect(badge).toBeVisible();
    const text = await badge.textContent();
    expect(text).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

test.describe('填報頁籤 - 門市選擇', () => {
  test('預設顯示填報面板', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await expect(page.locator('#panel-fill')).toBeVisible();
    await expect(page.locator('#panel-summary')).not.toBeVisible();
  });

  test('點選門市後顯示填報表單', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    // 填報表單初始隱藏
    await expect(page.locator('#fillFormArea')).not.toBeVisible();
    // 點選「通化」門市
    await page.locator('.store-card[data-store="通化"]').click();
    await expect(page.locator('#fillFormArea')).toBeVisible();
  });

  test('點選門市後 hero sub 更新', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.store-card[data-store="酒泉"]').click();
    const sub = page.locator('#fillHeroSub');
    await expect(sub).toContainText('酒泉');
  });

  test('九間門市卡片都存在', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    const stores = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
    for (const s of stores) {
      await expect(page.locator(`.store-card[data-store="${s}"]`)).toBeVisible();
    }
  });

  test('杭州南顯示 NEW badge', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    // new-badge class 表示新店
    await expect(page.locator('.store-card[data-store="杭州南"].new-badge')).toBeVisible();
  });

  test('選擇門市後 selected class 正確', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.store-card[data-store="萬大"]').click();
    await expect(page.locator('.store-card[data-store="萬大"]')).toHaveClass(/selected/);
    // 其他不應被選中
    await expect(page.locator('.store-card[data-store="通化"]')).not.toHaveClass(/selected/);
  });
});

test.describe('填報頁籤 - 時段切換', () => {
  test('預設 16:00 時段被選中', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await expect(page.locator('#newSeg16')).toHaveClass(/sel-16/);
    await expect(page.locator('#newSeg21')).not.toHaveClass(/sel-21/);
  });

  test('切換到 21:00 時段', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('#newSeg21').click();
    await expect(page.locator('#newSeg21')).toHaveClass(/sel-21/);
    await expect(page.locator('#newSeg16')).not.toHaveClass(/sel-16/);
  });
});

test.describe('填報頁籤 - 表單輸入', () => {
  test('台獎填報維持 10 款且只保留 moto', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.store-card[data-store="通化"]').click();
    await expect(page.locator('#f_tw_sony1')).toBeVisible();
    await expect(page.locator('label').filter({ hasText: 'moto razr fold' })).toBeVisible();
    await expect(page.locator('#f_tw_pixel10fold, #f_tw_findx9s, #f_tw_poketomo, #f_tw_myfirst')).toHaveCount(0);
  });

  test('KPI 欄位可以輸入數值', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.store-card[data-store="通化"]').click();
    const kpiInput = page.locator('#f_kpi');
    await kpiInput.fill('105');
    await expect(kpiInput).toHaveValue('105');
  });

  test('清除按鈕清空表單', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.store-card[data-store="通化"]').click();
    await page.locator('#f_kpi').fill('95');
    await page.locator('#f_5g').fill('80');
    // 點清除
    await page.locator('button:has-text("清除重填")').click();
    await expect(page.locator('#f_kpi')).toHaveValue('');
    await expect(page.locator('#f_5g')).toHaveValue('');
  });

  test('複製回報訊息顯示預覽區', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.store-card[data-store="六張犁"]').click();
    await page.locator('#f_kpi').fill('92');
    await page.locator('button:has-text("複製回報訊息")').click();
    await expect(page.locator('#copyPreview')).toBeVisible();
    const text = await page.locator('#copyText').inputValue();
    expect(text).toContain('六張犁');
    expect(text).toContain('16:00');
  });
});

test.describe('頁籤切換', () => {
  test('切換到彙整大盤', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.tab-btn:has-text("彙整大盤")').click();
    await expect(page.locator('#panel-summary')).toBeVisible();
    await expect(page.locator('#panel-fill')).not.toBeVisible();
  });

  test('切換到日期回放', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.tab-btn:has-text("日期回放")').click();
    await expect(page.locator('#panel-playback')).toBeVisible();
  });

  test('彙整大盤顯示填報狀態', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.tab-btn:has-text("彙整大盤")').click();
    // 填報狀態欄應有 9 個 chip（每間門市一個）
    const chips = page.locator('#fillStatus .fill-chip');
    await expect(chips).toHaveCount(9);
  });

  test('彙整大盤顯示 GAS 回傳的純時間，不顯示 1899 基準日', async ({ page }) => {
    await mockGAS(page, {
      readData: {
        '萬大': { store: '萬大', date: '2026-07-20', seg: 16, savedAt: '下午 3:42:26' },
      },
    });
    await page.goto(FILE_URL);
    await page.locator('.tab-btn:has-text("彙整大盤")').click();
    await expect(page.locator('#fillStatus')).toContainText('萬大 下午 3:42:26');
    await expect(page.locator('#fillStatus')).not.toContainText('1899-12-30');
  });

  test('彙整大盤 16:00/21:00 時段切換', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.tab-btn:has-text("彙整大盤")').click();
    // 點 21:00
    await page.locator('#sumSeg21').click();
    await expect(page.locator('#summaryDateLabel')).toContainText('21:00');
  });
});

test.describe('KPI 戰情', () => {
  test('公開頁面未提供私有資料，必須先登入', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.getByRole('button', { name: /KPI戰情/ }).click();
    await expect(page.locator('#kpiBattleContent')).toContainText('KPI 戰情受保護');
    await expect(page.locator('#kpiBattleContent input[placeholder="輸入員工編號"]')).toBeVisible();
    await expect(page.locator('#kpiBattleContent')).not.toContainText('大稻埕');
  });

  test('核准裝置只需輸入員編即可讀取私有戰情（方案 A：kpicalc 來源）', async ({ page }) => {
    await mockGAS(page);
    await kpiBattleLogin(page);
    await expect(page.locator('#kpiBattleContent')).toContainText('台北大稻埕');
    await expect(page.locator('#kpiBattleContent')).toContainText('KPI總達成');
  });

  test('店點總覽顯示 kpicalc 最新欄位，來源列標明資料日期與來源檔', async ({ page }) => {
    await mockGAS(page);
    await kpiBattleLogin(page);
    await expect(page.locator('#panel-kpi-battle')).toBeVisible();
    await expect(page.locator('#kpiBattleContent')).toContainText('台北大稻埕');
    await expect(page.locator('#kpiBattleContent')).toContainText('A999');
    await expect(page.locator('#kpiBattleContent')).toContainText('R1399');
    await expect(page.locator('#kpiBattleSourceNote')).toContainText('kpi.html 同一份');
    await expect(page.locator('#kpiBattleSourceNote')).toContainText('資料日期 2026-07-29');
    await expect(page.locator('#kpiBattleSourceNote')).toContainText('來源檔 0730.xlsx');
    await expect(page.locator('#kpiBattleSourceNote')).toContainText('更新時間 尚未同步');
  });

  test('缺少欄位顯示尚未同步，且不得出現 snapshot 舊數字', async ({ page }) => {
    await mockGAS(page);
    await kpiBattleLogin(page);
    // 公司排名／加掛分／整體 KPI：kpicalc 沒有 → 尚未同步
    await expect(page.locator('#kpiBattleContent')).toContainText('尚未同步');
    const text = await page.locator('#kpiBattleContent').textContent();
    // snapshot fixture 的舊數字一個都不准出現：加掛 13.36、整體 105.5%、DOD 字樣
    for (const stale of ['13.36', '105.5%', '105.4', 'DOD']) {
      expect(text, `snapshot 舊數字 ${stale} 不得出現`).not.toContain(stale);
    }
    // 公司排名欄只在有排名值時才會產生 val-gold 節點——kpicalc 沒排名，必須為 0
    await expect(page.locator('#kpiBattleContent .val-gold')).toHaveCount(0);
    // kpicalc 的最新店點總達成率必須出現（110.4% = 1.1035）
    await expect(page.locator('#kpiBattleContent')).toContainText('110.3%');
  });

  test('北一二B整體列置頂（逐項加總），且可查看整體 KPI 明細', async ({ page }) => {
    await mockGAS(page);
    await kpiBattleLogin(page);
    await expect(page.locator('#kpiBattleContent tbody tr').first()).toContainText('北一二B整體');
    await page.selectOption('#kpiBattleStoreSelect', '北一二B整體');
    await expect(page.locator('#kpiBattleContent')).toContainText('好速案銷售點數');
    // 整體 A999 = 11+9=20、目標 16+12=28 → 71.4%（純加總，非發明數字）
    await expect(page.locator('#kpiBattleContent')).toContainText('71.4%');
  });

  test('可切換至個績排名且顯示遮罩姓名', async ({ page }) => {
    await mockGAS(page);
    await kpiBattleLogin(page);
    await page.locator('#kpiBattlePersonalBtn').click();
    await expect(page.locator('#kpiBattleContent')).toContainText('測＊員');
    await expect(page.locator('#kpiBattleContent')).toContainText('總達成率');
    await expect(page.locator('#kpiBattleContent')).toContainText('個人台獎');
    await expect(page.locator('#kpiBattleContent')).toContainText('特維');
    await expect(page.locator('#kpiBattleContent')).toContainText('保險搭售率');
    // 方案 A：個人排名／台獎／保險搭售率不在 kpicalc → 尚未同步，不得出現舊獎金數字
    await expect(page.locator('#kpiBattleContent')).toContainText('尚未同步');
    await expect(page.locator('#kpiBattleContent')).not.toContainText('實際獎金');
    await expect(page.locator('#kpiBattleContent')).not.toContainText('$1,800');
    const headers = await page.locator('#kpiBattleContent thead th').allTextContents();
    expect(headers.indexOf('保險搭售率')).toBe(headers.indexOf('個人台獎') + 1);
    expect(headers.indexOf('R999')).toBe(headers.indexOf('R1399') + 1);
  });
});

test.describe('台獎戰情', () => {
  test('督導六卡、店點實際獎金排序與 10 台篩選顯示正確', async ({ page }) => {
    await mockGAS(page);
    await mockAwardsBattle(page);
    await page.goto(FILE_URL);
    await page.locator('.tab-btn:has-text("台獎戰情")').click();
    await expect(page.locator('#panel-awards-battle')).toBeVisible();
    await expect(page.locator('#awardsBattleContent')).toContainText('督導區實際獎金');
    await expect(page.locator('#awardsBattleContent')).toContainText('督導區推估獎金');
    await expect(page.locator('#awardsBattleContent')).toContainText('有領獎店');
    await expect(page.locator('#awardsBattleContent')).toContainText('會增加多少獎金');
    await expect(page.locator('#awardsBattleContent')).toContainText('通化');
    await expect(page.locator('.award-store-card').nth(1)).toContainText('通化');
    await expect(page.locator('#awardsStoreSelect')).toHaveValue('通化');
    await expect(page.locator('#awardsBattleContent .award-model')).toHaveCount(10);
    await page.selectOption('#awardsStoreSelect', '酒泉');
    await expect(page.locator('#awardsStoreSelect')).toHaveValue('酒泉');
  });
});

test.describe('日期回放', () => {
  test('選日期後點查詢顯示結果', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.tab-btn:has-text("日期回放")').click();
    // 設日期
    await page.locator('#playbackDate').fill('2026-06-25');
    await page.locator('#panel-playback button:has-text("查詢")').click();
    // 結果區出現回放標題
    await expect(page.locator('#playbackResult')).toContainText('回放');
  });

  test('日期回放只保留16:00與21:00', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('.tab-btn:has-text("日期回放")').click();
    await expect(page.locator('#pbSeg13')).toHaveCount(0);
    await expect(page.locator('#pbSeg16')).toBeVisible();
    await expect(page.locator('#pbSeg21')).toBeVisible();
  });
});

test.describe('設定 Modal', () => {
  test('點設定按鈕開啟 Modal', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('#connBadge').click();
    await expect(page.locator('#settingsModal')).toBeVisible();
  });

  test('取消關閉 Modal', async ({ page }) => {
    await mockGAS(page);
    await page.goto(FILE_URL);
    await page.locator('#connBadge').click();
    await page.locator('button.btn-secondary[onclick="closeSettings()"]').click();
    await expect(page.locator('#settingsModal')).not.toBeVisible();
  });
});

test.describe('個人追蹤 - 新增人員', () => {
  test('新增人員後可被選擇且表單顯示', async ({ page }) => {
    await page.goto(FILE_URL);
    await page.click('button:has-text("個人追蹤")');
    await page.click('button[onclick="openAddNameModal()"]');
    await page.selectOption('#addNameStore', { index: 1 });
    await page.fill('#addNameInput', '測試員工A');
    await page.click('button[onclick="saveNewName()"]');
    await page.waitForTimeout(200);
    const name = await page.$eval('#personalName', el => el.value);
    expect(name).toBe('測試員工A');
    await expect(page.locator('#personalFormSection')).toBeVisible();
  });
});
