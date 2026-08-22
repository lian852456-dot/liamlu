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
    const type = target.endsWith('.html') ? 'text/html; charset=utf-8' : target.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream';
    response.writeHead(200, { 'Content-Type': type });
    fs.createReadStream(target).pipe(response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
});

const STORES = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
const KPI_ITEM = 'AQ V+D 999 (含)以上';

function awardItems(seed = 0) {
  return Array.from({ length: 13 }, (_, index) => ({
    display_name: `正式機型 ${String(index + 1).padStart(2, '0')}`,
    actual: seed + index + 1,
    target: 20 + index,
    rate: Number(((seed + index + 1) / (20 + index)).toFixed(4)),
    difference: seed - index,
    incremental_award: 600 + seed * 10 + index,
    next_label: index === 12 ? '已達最高獎階' : `再 ${index + 1} 台解鎖下一階`,
    threshold_target: 10 + index,
    store_reward_50: 1000 + seed * 10 + index,
    store_reward_100: 2000 + seed * 10 + index,
    district_reward_80: 3000 + seed * 10 + index,
    district_reward_100: 4000 + seed * 10 + index,
  }));
}

function awardsFixture() {
  return {
    report_date: '2026-08-15',
    phone_items: 13,
    store_rows: 10,
    supervisor: { actual_total: 9234, projected: 12888, rank: 21, award: 'Y' },
    overall: {
      store: '北一二B整體',
      award: { actual_total: 9234, projected: 12888, rank: 21, award: 'Y' },
      priorities: awardItems().slice(0, 3),
      items: awardItems(),
    },
    stores: STORES.map((store, index) => ({
      store,
      award: {
        actual_total: 11000 - index * 777,
        projected: 15000 - index * 666,
        rank: 30 + index * 7,
        award: index < 4 ? 'Y' : 'N',
      },
      priorities: awardItems(index).slice(0, 3),
      items: awardItems(index),
    })),
  };
}

const KPICALC = {
  meta: { period: '2026/08/01 ~ 08/15', snapshotDay: 15, monthDays: 31, month: '2026-08', sourceFile: '0816.xlsx' },
  items: [{ key: KPI_ITEM, short: 'A999', step: 1 }],
  aggregateRates: { [KPI_ITEM]: 1.05 },
  stores: STORES.map((name, index) => ({ code: `DNB${index + 1}`, name, official: 1 + index / 100, items: { [KPI_ITEM]: { a: 10 + index, t: 20, reportRate: 1.05 } } })),
  persons: [],
};

const KPI_SNAPSHOT = {
  report_date: '2026-08-15',
  data_as_of_date: '2026-08-15',
  source_as_of_date: '2026-08-15',
  source_file: '0816.xlsx',
  source_date_range: '2026/08/01 ~ 08/15',
  aggregate: { overall_kpi: 1.1, company_rank: 20, addon_score: 13, insurance_attach_rate: 0.5 },
  stores: STORES.map((store, index) => ({ store, company_rank: 40 + index, addon_score: 12 + index / 10, insurance_attach_rate: 0.4 + index / 100 })),
  personal: [],
};

async function mockFormal(page, { accessError = '', awards = awardsFixture(), kpiError = '' } = {}) {
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
      await route.fulfill({ json: accessError
        ? { status: 'error', message: accessError }
        : { status: 'ok', profile: { maskedName: '測＊員', store: '大稻埕', role: '業代' }, snapshot: { kpiBattle: KPI_SNAPSHOT, awardsBattle: awards } } });
      return;
    }
    if (payload.action === 'kpicalc_access') {
      await route.fulfill({ json: kpiError ? { status: 'error', message: kpiError } : { status: 'ok', data: KPICALC } });
      return;
    }
    await route.fulfill({ json: { status: 'ok' } });
  });
  return actions;
}

async function openAwards(page, pageName) {
  await page.goto(`${baseUrl}/${pageName}`);
  if (pageName === 'index.html') await page.getByRole('button', { name: /台獎戰情/ }).click();
  await expect(page.locator('#awardsBattleContent')).toContainText('台獎戰情受保護');
}

async function loginAwards(page) {
  const content = page.locator('#awardsBattleContent');
  await content.locator('input[placeholder="輸入員工編號"]').fill('1234567');
  await content.getByRole('button', { name: '以員編登入' }).click();
  await expect(page.locator('#awardsBattleSourceNote')).toContainText('台獎戰報日期 2026-08-15');
}

function normalize(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

test('standalone 沿用 Approved Device 登入與 private_access → kpicalc_access，顯示 9 店與 13 款', async ({ page }) => {
  const actions = await mockFormal(page);
  await openAwards(page, 'awards-battle.html');
  await loginAwards(page);

  await expect(page.locator('#panel-awards-battle')).toHaveAttribute('data-ready', 'true');
  await expect(page.locator('.award-store-card')).toHaveCount(10);
  await expect(page.locator('#awardsStoreSelect option')).toHaveCount(10);
  await expect(page.locator('.award-model')).toHaveCount(13);
  await expect(page.locator('#awardsBattleContent')).toContainText('$9,234');
  await expect(page.locator('#awardsBattleContent')).toContainText('再 1 台解鎖下一階');
  expect(actions.filter(action => ['private_access', 'kpicalc_access'].includes(action))).toEqual(['private_access', 'kpicalc_access']);
});

test('推估獎金固定單行且三創只縮短顯示，不改篩選 value', async ({ page }) => {
  const awards = awardsFixture();
  awards.supervisor.projected = 11784;
  awards.overall.award.projected = 11784;
  awards.stores[2] = { ...awards.stores[2], store: '台灣大哥大台北三創' };
  await mockFormal(page, { awards });
  await page.setViewportSize({ width: 390, height: 844 });
  await openAwards(page, 'awards-battle.html');
  await loginAwards(page);

  const money = page.locator('.award-summary-money').nth(1);
  await expect(money).toHaveText('$11,784');
  const moneyLayout = await money.evaluate(element => {
    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      whiteSpace: getComputedStyle(element).whiteSpace,
      lines: new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size,
      fits: element.scrollWidth <= element.clientWidth,
    };
  });
  expect(moneyLayout).toEqual({ whiteSpace: 'nowrap', lines: 1, fits: true });

  const firstRowCards = page.locator('.summary-card').first().or(page.locator('.summary-card').nth(1));
  const cardBoxes = await firstRowCards.evaluateAll(cards => cards.map(card => {
    const rect = card.getBoundingClientRect();
    return { top: Math.round(rect.top), height: Math.round(rect.height) };
  }));
  expect(cardBoxes[0]).toEqual(cardBoxes[1]);

  const sanchuang = page.locator('#awardsStoreSelect option[value="台灣大哥大台北三創"]');
  await expect(sanchuang).toHaveText('台北三創');
  await expect(page.locator('#awardsBattleContent')).not.toContainText('台灣大哥大台北三創');
  await page.selectOption('#awardsStoreSelect', '台灣大哥大台北三創');
  await expect(page.locator('#awardsStoreSelect')).toHaveValue('台灣大哥大台北三創');
  await expect(page.locator('#awardsStoreSelect option:checked')).toHaveText('台北三創');
});

test('未授權與 KPI 讀取失敗均 fail-closed，不使用 localStorage 舊台獎', async ({ page }) => {
  const actions = await mockFormal(page, { accessError: '裝置尚未核准' });
  await page.addInitScript(() => localStorage.setItem('phone-awards-battle-latest', JSON.stringify({ actual_total: 999999 })));
  await openAwards(page, 'awards-battle.html');
  const content = page.locator('#awardsBattleContent');
  await content.locator('input[placeholder="輸入員工編號"]').fill('1234567');
  await content.getByRole('button', { name: '以員編登入' }).click();
  await expect(content.locator('.private-lock-status')).toContainText('裝置尚未核准');
  await expect(content).not.toContainText('$999,999');
  expect(actions.filter(action => action === 'private_access')).toHaveLength(1);
  expect(actions.filter(action => action === 'kpicalc_access')).toHaveLength(0);

  const second = await page.context().newPage();
  await mockFormal(second, { kpiError: 'KPI 正式資料無法讀取' });
  await openAwards(second, 'awards-battle.html');
  const secondContent = second.locator('#awardsBattleContent');
  await secondContent.locator('input[placeholder="輸入員工編號"]').fill('1234567');
  await secondContent.getByRole('button', { name: '以員編登入' }).click();
  await expect(secondContent).toContainText('台獎尚未同步');
  await expect(secondContent).toContainText('KPI 正式資料尚未讀回');
  await second.close();
});

test('原 index 與 standalone 9 店逐店 exact match', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const original = await context.newPage();
  const standalone = await context.newPage();
  const originalActions = await mockFormal(original);
  const standaloneActions = await mockFormal(standalone);

  await openAwards(original, 'index.html');
  await loginAwards(original);
  await openAwards(standalone, 'awards-battle.html');
  await loginAwards(standalone);

  for (const selector of ['#awardsBattleSourceNote', '#panel-awards-battle .summary-grid', '#panel-awards-battle .award-store-grid']) {
    expect(normalize(await original.locator(selector).textContent())).toBe(normalize(await standalone.locator(selector).textContent()));
  }
  for (const store of ['北一二B整體', ...STORES]) {
    await original.selectOption('#awardsStoreSelect', store);
    await standalone.selectOption('#awardsStoreSelect', store);
    expect(normalize(await original.locator('#awardsBattleContent > .card').textContent())).toBe(
      normalize(await standalone.locator('#awardsBattleContent > .card').textContent())
    );
    await expect(original.locator('.award-model')).toHaveCount(13);
    await expect(standalone.locator('.award-model')).toHaveCount(13);
  }

  expect(originalActions.filter(action => ['private_access', 'kpicalc_access'].includes(action))).toEqual(['private_access', 'kpicalc_access']);
  expect(standaloneActions.filter(action => ['private_access', 'kpicalc_access'].includes(action))).toEqual(['private_access', 'kpicalc_access']);
  await context.close();
});

test('日期不一致或缺店時不渲染任何正式台獎數值', async ({ page }) => {
  const wrongDate = { ...awardsFixture(), report_date: '2026-08-14' };
  await mockFormal(page, { awards: wrongDate });
  await openAwards(page, 'awards-battle.html');
  const content = page.locator('#awardsBattleContent');
  await content.locator('input[placeholder="輸入員工編號"]').fill('1234567');
  await content.getByRole('button', { name: '以員編登入' }).click();
  await expect(content).toContainText('台獎尚未同步');
  await expect(content).toContainText('2026-08-14');
  await expect(content).not.toContainText('$9,234');

  const second = await page.context().newPage();
  const incomplete = awardsFixture();
  incomplete.stores = incomplete.stores.slice(0, 8);
  await mockFormal(second, { awards: incomplete });
  await openAwards(second, 'awards-battle.html');
  const secondContent = second.locator('#awardsBattleContent');
  await secondContent.locator('input[placeholder="輸入員工編號"]').fill('1234567');
  await secondContent.getByRole('button', { name: '以員編登入' }).click();
  await expect(secondContent).toContainText('正式台獎資料不完整');
  await expect(secondContent).not.toContainText('$9,234');
  await second.close();
});

test('390px 無頁面級水平溢出且返回大廳正常', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await mockFormal(page);
  await openAwards(page, 'awards-battle.html');
  await loginAwards(page);
  await page.selectOption('#awardsStoreSelect', '杭州南');
  expect(await page.locator('body').evaluate(body => body.scrollWidth <= body.clientWidth)).toBe(true);
  expect(pageErrors).toEqual([]);
  await page.locator('.home-link').click();
  await expect(page).toHaveURL(`${baseUrl}/home.html`);
  await expect(page.getByRole('heading', { name: '同仁大廳' })).toBeVisible();
});
