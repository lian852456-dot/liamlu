const { test, expect } = require('@playwright/test');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let server;
let baseUrl;

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(ROOT, relative);
    if (!target.startsWith(ROOT + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    const type = target.endsWith('.html')
      ? 'text/html; charset=utf-8'
      : target.endsWith('.js')
        ? 'text/javascript; charset=utf-8'
        : 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(target).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

const METRIC_NAMES = [
  'AQ V+D 999 (含)以上', 'AQ V+D 1399 (含)以上', '好速案銷售點數', 'RT V+D 1399 (含)以上',
  'RT V+D 999 (含)以上', 'RT上線點數', '特殊維繫用戶續約數', '配件及其他營收', '包膜與保貼營收',
  'Netflix', 'Disney+', 'MyVideo', 'KKBOX', 'Google One', 'Apple Music', '影音服務', '裝置險',
  '家電搭售', '舊換新', '續約率', '新申裝', '攜碼', '加值服務', '企業方案', '客戶滿意度',
];

const STORE_NAMES = [
  '台北通化', '台北酒泉', '台灣大哥大數位生活台北三創', '台北萬大', '台北六張犁',
  '台北復興南', '台北永吉', '台北大稻埕', '台北杭州南',
];

function metricValues(storeIndex) {
  return Object.fromEntries(METRIC_NAMES.map((name, metricIndex) => [name, {
    a: 10 + storeIndex + metricIndex,
    t: 20 + metricIndex,
    w: 0.02,
    reportRate: Number((0.82 + storeIndex * 0.01 + metricIndex * 0.003).toFixed(4)),
  }]));
}

const KPICALC_FIXTURE = {
  meta: {
    period: '2026/08/01 ~ 08/14', snapshotDay: 14, monthDays: 31, month: '2026-08',
    sourceFile: 'report-upload-temp-a71b372c443449d5b05e6d8a226130b6-0815.xlsx',
  },
  items: METRIC_NAMES.map((key, index) => ({ key, short: `KPI ${index + 1}`, step: 1 })),
  aggregateRates: Object.fromEntries(METRIC_NAMES.map((name, index) => [name, Number((0.9 + index * 0.004).toFixed(4))])),
  stores: STORE_NAMES.map((name, index) => ({
    code: `DNB${String(index + 1).padStart(5, '0')}`,
    name,
    official: Number((1.02 + index * 0.01).toFixed(4)),
    items: metricValues(index),
  })),
  persons: [{
    store: 'DNB00008', role: '業務代表(I)', pname: '測＊員', official: 1.056,
    items: metricValues(0),
  }],
};

const SNAPSHOT_FIXTURE = {
  report_date: '2026-08-15',
  data_as_of_date: '2026-08-14',
  source_as_of_date: '2026-08-14',
  source_file: '0815.xlsx',
  source_date_range: '2026/08/01 ~ 08/14',
  aggregate: {
    overall_kpi: 1.0918, overall_kpi_dod: -0.0087,
    company_rank: 29, company_rank_dod: 1,
    addon_score: 12.89, addon_score_dod: -0.09,
    insurance_attach_rate: 0.47951,
  },
  stores: STORE_NAMES.map((store, index) => ({
    store,
    company_rank: 40 + index,
    company_rank_dod: index % 2 ? -1 : 1,
    addon_score: Number((12.1 + index * 0.1).toFixed(2)),
    addon_score_dod: index % 2 ? -0.1 : 0.1,
    insurance_attach_rate: Number((0.42 + index * 0.01).toFixed(3)),
  })),
  personal: [{
    store: '台北大稻埕', name: '測＊員', rank: 8, rank_dod: 2,
    phone_award_actual: 1800, phone_award_projected: 3200,
    phone_award_rank: 8, phone_award_eligible: 'Y', insurance_attach_rate: 0.42,
  }],
};

async function mockKpi(page, { accessError = '' } = {}) {
  const actions = [];
  await page.route('https://script.google.com/**', async route => {
    const request = route.request();
    if (request.method() !== 'POST') {
      await route.fulfill({ json: { status: 'ok', data: {} } });
      return;
    }
    const payload = JSON.parse(request.postData() || '{}');
    actions.push(payload.action);
    if (payload.action === 'private_access') {
      if (accessError) {
        await route.fulfill({ json: { status: 'error', message: accessError } });
      } else {
        await route.fulfill({ json: {
          status: 'ok',
          profile: { maskedName: '測＊員', store: '大稻埕', role: '業代' },
          snapshot: { kpiBattle: SNAPSHOT_FIXTURE, awardsBattle: null },
        } });
      }
      return;
    }
    if (payload.action === 'kpicalc_access') {
      await route.fulfill({ json: { status: 'ok', data: KPICALC_FIXTURE } });
      return;
    }
    await route.fulfill({ json: { status: 'ok', data: {} } });
  });
  return actions;
}

function normalize(text) {
  return String(text || '').replace(/\s+/g, ' ').trim();
}

async function loginKpi(root) {
  const content = root.locator('#kpiBattleContent');
  await content.locator('input[placeholder="輸入員工編號"]').fill('1234567');
  await content.getByRole('button', { name: '以員編登入' }).click();
  await expect(root.locator('#kpiBattleSourceNote')).toContainText('戰報日期 2026-08-15');
}

test('獨立頁與原 KPI 戰情維持同一權限行為，失敗時不吃 localStorage 舊值', async ({ page }) => {
  const actions = await mockKpi(page, { accessError: '裝置尚未核准' });
  await page.addInitScript(() => {
    localStorage.setItem('kpi-battle-latest', JSON.stringify({ overall_kpi: 9.99, company_rank: 1 }));
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/kpi-battle.html`);

  await expect(page.locator('#panel-kpi-battle')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#panel-kpi-battle')).toBeVisible();
  await expect(page.locator('#kpiBattleContent')).toContainText('KPI 戰情受保護');
  await expect(page.locator('#kpiBattleContent')).not.toContainText('999.0%');

  await page.locator('#kpiBattleContent input[placeholder="輸入員工編號"]').fill('1234567');
  await page.locator('#kpiBattleContent').getByRole('button', { name: '以員編登入' }).click();
  await expect(page.locator('#kpiBattleContent .private-lock-status')).toContainText('裝置尚未核准');
  expect(actions.filter(action => action === 'private_access')).toHaveLength(1);
  expect(actions.filter(action => action === 'kpicalc_access')).toHaveLength(0);

  expect(await page.locator('body').evaluate(body => body.scrollWidth <= body.clientWidth)).toBe(true);
});

test('Safari 不提供全域 event 時共用 controller 仍會啟動既有 KPI 正式載入流程', async ({ page }) => {
  const actions = await mockKpi(page);
  await page.addInitScript(() => {
    Object.defineProperty(window, 'event', {
      configurable: false,
      get: () => undefined,
    });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/kpi-battle.html`);

  await expect(page.locator('#panel-kpi-battle')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('#panel-kpi-battle')).toBeVisible();
  await expect(page.locator('#kpiBattleContent')).toContainText('KPI 戰情受保護');

  await loginKpi(page);
  await expect(page.locator('#kpiBattleContent tbody tr')).toHaveCount(10);
  await page.getByRole('button', { name: '個績排名' }).click();
  await expect(page.locator('#kpiBattleContent tbody tr')).toHaveCount(1);
  await expect(page.locator('#kpiBattleContent')).toContainText('測＊員');
  expect(actions.filter(action => ['private_access', 'kpicalc_access'].includes(action))).toEqual(['private_access', 'kpicalc_access']);

  expect(await page.locator('body').evaluate(body => body.scrollWidth <= body.clientWidth)).toBe(true);
  await page.locator('.home-link').click();
  await expect(page).toHaveURL(`${baseUrl}/home.html`);
  await expect(page.getByRole('heading', { name: '同仁大廳' })).toBeVisible();
});

test('新舊 KPI 畫面逐區同值：日期、來源、整體、9 店、排名、DOD、加掛、保險與 25 項明細', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  const oldPage = await context.newPage();
  const newPage = await context.newPage();
  const oldActions = await mockKpi(oldPage);
  const newActions = await mockKpi(newPage);

  await oldPage.goto(`${baseUrl}/index.html`);
  await oldPage.getByRole('button', { name: /KPI戰情/ }).click();
  await loginKpi(oldPage);

  await newPage.goto(`${baseUrl}/kpi-battle.html`);
  await expect(newPage.locator('#panel-kpi-battle')).toHaveAttribute('data-ready', 'true');
  await loginKpi(newPage);

  await oldPage.selectOption('#kpiBattleStoreSelect', '北一二B整體');
  await newPage.locator('#kpiBattleStoreSelect').selectOption('北一二B整體');

  const selectors = [
    '#kpiBattleSourceNote',
    '#kpiBattleContent .summary-grid',
    '#kpiBattleContent .table-wrap',
    '#kpiBattleContent .kpi-metric-grid',
  ];
  for (const selector of selectors) {
    expect(normalize(await oldPage.locator(selector).textContent())).toBe(
      normalize(await newPage.locator(selector).textContent())
    );
  }

  await expect(oldPage.locator('#kpiBattleContent tbody tr')).toHaveCount(10);
  await expect(newPage.locator('#kpiBattleContent tbody tr')).toHaveCount(10);
  await expect(oldPage.locator('#kpiBattleContent .kpi-metric-card')).toHaveCount(25);
  await expect(newPage.locator('#kpiBattleContent .kpi-metric-card')).toHaveCount(25);

  for (const expected of ['109.2%', '29', '12.89', '48.0%', '較昨日下降 0.9pp', 'DOD ↑ 1名']) {
    await expect(oldPage.locator('#kpiBattleContent')).toContainText(expected);
    await expect(newPage.locator('#kpiBattleContent')).toContainText(expected);
  }

  expect(oldActions.filter(action => ['private_access', 'kpicalc_access'].includes(action))).toEqual(['private_access', 'kpicalc_access']);
  expect(newActions.filter(action => ['private_access', 'kpicalc_access'].includes(action))).toEqual(['private_access', 'kpicalc_access']);

  const screenshotDir = process.env.PHASE1A_SCREENSHOT_DIR;
  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    const evidenceLabel = 'Phase 1A 本機合約比對｜合成正式形狀 fixture，非正式網站 readback';
    await oldPage.evaluate(label => {
      const banner = document.createElement('div');
      banner.textContent = label;
      banner.style.cssText = 'padding:10px 16px;background:#fff3cd;color:#7c4a03;font:800 14px system-ui;text-align:center;border-bottom:1px solid #f3c86b';
      document.body.prepend(banner);
    }, evidenceLabel);
    await newPage.locator('#panel-kpi-battle').evaluate((element, label) => {
      const banner = document.createElement('div');
      banner.textContent = label;
      banner.style.cssText = 'padding:10px 16px;background:#fff3cd;color:#7c4a03;font:800 14px system-ui;text-align:center;border-bottom:1px solid #f3c86b';
      element.before(banner);
    }, evidenceLabel);
    await oldPage.screenshot({
      path: path.join(screenshotDir, '2026-08-16_Phase1A_原index_KPI_本機合約比對.png'),
      fullPage: true,
    });
    await newPage.screenshot({
      path: path.join(screenshotDir, '2026-08-16_Phase1A_獨立KPI_本機合約比對.png'),
      fullPage: true,
    });
  }

  await context.close();
});

test('390px 新 KPI 獨立頁無頁面級水平溢出', async ({ page }) => {
  await mockKpi(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/kpi-battle.html`);
  await expect(page.locator('#panel-kpi-battle')).toHaveAttribute('data-ready', 'true');
  await loginKpi(page);

  expect(await page.locator('body').evaluate(body => body.scrollWidth <= body.clientWidth)).toBe(true);
  await expect(page.locator('.home-link')).toBeVisible();
});

test('原 kpi.html 同仁 KPI 試算維持鎖定入口且 390px 無水平溢出', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${baseUrl}/kpi.html`);

  await expect(page).toHaveTitle('北一二B KPI 試算');
  await expect(page.locator('#lockCard')).toBeVisible();
  await expect(page.locator('#lockCard')).toContainText('北一二B 同仁專用');
  expect(await page.locator('body').evaluate(body => body.scrollWidth <= body.clientWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
});
