const { test, expect } = require('@playwright/test');
const path = require('path');

const PAGE_URL = process.env.TEST_BASE_URL
  ? new URL('live-battle.html', process.env.TEST_BASE_URL).href
  : 'file://' + path.resolve(__dirname, '../live-battle.html');
const stores = ['通化', '酒泉', '台北三創', '萬大', '六張犁', '復興南', '永吉', '大稻埕', '杭州南'];

function kpiData() {
  return {
    meta: { month: '2026-08', snapshotDay: 29, sourceFile: '0830.xlsx' },
    stores: stores.map((name, index) => ({
      name, code: `DNB${String(index + 1).padStart(3, '0')}`,
      items: {
        'TTL AQ上線點數': { a: index, t: 10, reportRate: index / 10 },
        'RT上線點數': { a: index, t: 20, reportRate: index / 20 }
      }
    }))
  };
}

test('督導載入正式目標後，本機雙檔產生九店戰報，不傳送檔案內容', async ({ page }) => {
  const actions = [];
  await page.route('https://script.google.com/**', async route => {
    const payload = JSON.parse(route.request().postData() || '{}');
    actions.push(payload.action);
    const body = payload.action === 'private_access'
      ? { status: 'ok', snapshot: {}, profile: { maskedName: 'L***' } }
      : { status: 'ok', profile: { maskedName: 'L***', isTrusted: true }, data: kpiData() };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(PAGE_URL);
  await page.locator('#employeeId').fill('9000001');
  await page.locator('#loadTargetsBtn').click();
  await expect(page.locator('#targetBadge')).toHaveText('目標已載入');

  const aqRows = stores.flatMap((name, index) => Array.from({ length: index === 0 ? 1 : 12 }, (_, row) => `AQ新申裝,DNB${String(index + 1).padStart(3, '0')},A-${index}-${row},1`));
  const rtRows = stores.flatMap((name, index) => Array.from({ length: index === 0 ? 2 : 22 }, (_, row) => `RT續約,${name},R-${index}-${row},1`));
  await page.locator('#aqFile').setInputFiles({ name: 'AQ.csv', mimeType: 'text/csv', buffer: Buffer.from(['案件類型,營業點代碼,受理編號,上線點數', ...aqRows].join('\n')) });
  await expect(page.locator('#aqFileStatus')).toContainText('AQ.csv');
  await page.locator('#rtFile').setInputFiles({ name: 'RT.csv', mimeType: 'text/csv', buffer: Buffer.from(['案件類型,門市,受理編號,上線點數', ...rtRows].join('\n')) });
  await expect(page.locator('#rtFileStatus')).toContainText('RT.csv');
  await expect(page.locator('#analyzeBtn')).toBeEnabled();
  await page.locator('#analyzeBtn').click();

  await expect(page.locator('#storeRows tr')).toHaveCount(9);
  await expect(page.locator('#reportText')).toHaveValue(/北一二B 行進間戰報/);
  await expect(page.locator('#reportText')).toHaveValue(/通化｜AQ 1\/10/);
  expect(actions).toEqual(['private_access', 'kpicalc_access']);
  expect(await page.locator('body').evaluate(body => body.scrollWidth <= body.clientWidth)).toBe(true);
});

test('非督導 Approved Device 仍 fail closed', async ({ page }) => {
  await page.route('https://script.google.com/**', async route => {
    const payload = JSON.parse(route.request().postData() || '{}');
    const body = payload.action === 'private_access'
      ? { status: 'ok', snapshot: {}, profile: { maskedName: '門***' } }
      : { status: 'ok', profile: { maskedName: '門***', isTrusted: false }, data: kpiData() };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(PAGE_URL);
  await page.locator('#employeeId').fill('1234567');
  await page.locator('#loadTargetsBtn').click();
  await expect(page.locator('#targetMessage')).toContainText('只開放督導帳號');
  await expect(page.locator('#analyzeBtn')).toBeDisabled();
});
