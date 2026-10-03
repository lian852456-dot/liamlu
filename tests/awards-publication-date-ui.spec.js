const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const config = require('../config/award-config-2026-10.json');

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

async function open(page, pageName, sourceMismatch = false) {
  const actions = [];
  await page.clock.setFixedTime(new Date('2026-10-02T09:00:00Z'));
  const items = config.modelGroups.map(group => ({ name: group.modelId, display_name: group.displayName, actual: 8, target: 10, rate: .8 }));
  const stores = Array.from({ length: 9 }, (_, i) => `合成店${i + 1}`);
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname !== 'script.google.com') return route.abort();
    const payload = request.method() === 'POST' ? JSON.parse(request.postData() || '{}') : Object.fromEntries(url.searchParams);
    actions.push(payload.action);
    let body = { status: 'ok', data: {}, entries: [] };
    if (payload.action === 'private_access') body = {
      status: 'ok', profile: { maskedName: '合＊員' }, snapshot: {
        kpiBattle: { report_date: '2026-10-01', report_run_date: '2026-10-02', data_as_of_date: '2026-10-01', source_file: sourceMismatch ? '1003.xlsx' : '1002.xlsx', processing_run_id: 'synthetic', aggregate: {}, stores: [], personal: [] },
        awardsBattle: { report_date: '2026-10-01', report_run_date: '2026-10-02', data_as_of_date: '2026-10-01', processing_run_id: 'synthetic', phone_items: 10, store_rows: 10, supervisor: { actual_total: 12345, projected: 23456, award: 'Y' }, overall: { store: '北一二B整體', award: {}, items }, stores: stores.map(store => ({ store, award: {}, items })) },
      },
    };
    if (payload.action === 'kpicalc_access') body = { status: 'ok', data: { meta: { month: '2026-10', snapshotDay: 1, sourceFile: '1002.xlsx' }, items: [], stores: [], persons: [] } };
    const callback = url.searchParams.get('callback');
    return route.fulfill({ contentType: callback ? 'text/javascript' : 'application/json', body: callback ? `${callback}(${JSON.stringify(body)})` : JSON.stringify(body) });
  });
  await page.goto(`${base}/${pageName}`);
  if (pageName === 'index.html') await page.getByRole('button', { name: /台獎戰情/ }).click();
  const content = page.locator('#awardsBattleContent');
  await content.locator('input[placeholder="輸入員工編號"]').fill('1234567');
  await content.getByRole('button', { name: '以員編登入' }).click();
  return actions;
}

for (const pageName of ['index.html', 'awards-battle.html']) {
  test(`${pageName}: same-source D+1 renders the original protected awards screen`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const actions = await open(page, pageName);
    await expect(page.locator('#awardsBattleSourceNote')).toContainText('發布日期 2026-10-02｜資料截至 2026-10-01');
    await expect(page.locator('.award-model')).toHaveCount(10);
    await expect(page.locator('#awardsBattleContent')).toContainText('$12,345');
    await expect(page.locator('#awardsStoreSelect option')).toHaveCount(10);
    expect(actions.filter(action => ['private_access', 'kpicalc_access'].includes(action))).toEqual(['private_access', 'kpicalc_access']);
    expect(errors).toEqual([]);
    await page.screenshot({ path: test.info().outputPath('d1-rendered.png'), fullPage: true });
  });
  test(`${pageName}: a different source remains blocked after the same mocked login`, async ({ page }) => {
    await open(page, pageName, true);
    await expect(page.locator('#awardsBattleContent')).toContainText('台獎尚未有資料');
    await expect(page.locator('#awardsBattleContent')).not.toContainText('$12,345');
    await expect(page.locator('.award-model')).toHaveCount(0);
  });
}
