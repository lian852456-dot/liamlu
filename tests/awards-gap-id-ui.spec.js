const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { fixture } = require('./helpers/awards-gap-id-fixture.cjs');

let server, base;
test.beforeAll(async () => {
  const root = path.resolve(__dirname, '..');
  server = http.createServer((req, res) => {
    const file = path.resolve(root, new URL(req.url, 'http://localhost').pathname.slice(1));
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html; charset=utf-8');
    res.end(fs.readFileSync(file));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(async () => { await new Promise(resolve => server.close(resolve)); });

async function open(page, pageName, conflict = false) {
  const value = fixture(), actions = [];
  if (conflict) value.snapshot.awardsBattle.overall.items[2].modelId = 'vivo-v80';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-11-05T09:00:00Z'));
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname !== 'script.google.com') return route.abort();
    const payload = request.method() === 'POST' ? JSON.parse(request.postData() || '{}') : Object.fromEntries(url.searchParams);
    actions.push(payload.action);
    let body = { status: 'ok', data: {}, entries: [] };
    if (payload.action === 'private_access') body = { status: 'ok', profile: { maskedName: '合＊員' }, snapshot: value.snapshot };
    if (payload.action === 'kpicalc_access') body = { status: 'ok', data: value.kpi };
    const callback = url.searchParams.get('callback');
    return route.fulfill({ contentType: callback ? 'text/javascript' : 'application/json', body: callback ? `${callback}(${JSON.stringify(body)})` : JSON.stringify(body) });
  });
  await page.goto(`${base}/${pageName}`);
  if (pageName === 'index.html') await page.getByRole('button', { name: /台獎戰情/ }).click();
  const legacy = page.getByRole('button', { name: '原員編通道', exact: true });
  if (await legacy.isVisible()) await legacy.click();
  // The original index channel normally returns to the KPI login panel.
  const login = page.locator(pageName === 'index.html' ? '#kpiBattleContent' : '#awardsBattleContent');
  await login.locator('input[placeholder="輸入員工編號"]').fill('1234567');
  await login.getByRole('button', { name: '以員編登入' }).click();
  if (pageName === 'index.html') {
    await expect(page.locator('#kpiBattleContent .private-lock')).toHaveCount(0);
    await page.getByRole('button', { name: /台獎戰情/ }).click();
  }
  return { value, actions };
}

for (const pageName of ['index.html', 'awards-battle.html', 'kpi-battle.html#awards']) {
  test(`${pageName}: complete current-shape rows show signed gaps in all ten units`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const { value, actions } = await open(page, pageName);
    const content = page.locator('#awardsBattleContent');
    await expect(page.locator('#awardsBattleSourceNote')).toContainText('發布日期 2026-11-05｜資料截至 2026-11-04');
    await expect(page.locator('.award-store-card')).toHaveCount(10);
    await expect(page.locator('#awardsStoreSelect option')).toHaveCount(10);
    for (const [index, unit] of [value.snapshot.awardsBattle.overall, ...value.snapshot.awardsBattle.stores].entries()) {
      await page.locator('#awardsStoreSelect').selectOption(unit.store);
      await expect(page.locator('.award-model')).toHaveCount(10);
      for (const [itemIndex, item] of unit.items.entries()) {
        const difference = item.actual - item.threshold_target;
        const signed = `${difference > 0 ? '+' : ''}${difference}`;
        await expect(page.locator('.award-model').nth(itemIndex)).toContainText(`${index === 0 ? '80%' : '50%'}差異 ${signed}`);
      }
      await expect(content).not.toContainText('差異 尚未有資料');
      await expect(content).not.toContainText('資料待核');
    }
    await page.locator('#awardsStoreSelect').selectOption('北一二B整體');
    await page.locator('.award-model').first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath('current-gap-id-mobile.png'), fullPage: false });
    await page.locator('.award-model-grid').screenshot({ path: test.info().outputPath('current-gap-id-models.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(actions.filter(action => ['private_access', 'kpicalc_access'].includes(action))).toEqual(['private_access', 'kpicalc_access']);
    expect(errors).toEqual([]);
  });

  test(`${pageName}: a valid display label cannot conceal a conflicting model ID`, async ({ page }) => {
    await open(page, pageName, true);
    await expect(page.locator('#awardsBattleContent')).toContainText('正式台獎資料不完整');
    await expect(page.locator('.award-model')).toHaveCount(0);
    await expect(page.locator('.award-store-card')).toHaveCount(0);
  });
}
