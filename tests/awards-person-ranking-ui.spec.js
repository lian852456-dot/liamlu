const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { fixture } = require('./helpers/awards-gap-id-fixture.cjs');
const { november } = require('../award-model-catalog.js');

const root = path.resolve(__dirname, '..');
const origin = 'https://awards-ranking.test';

async function login(page, entry, mode) {
  const value = fixture(), awards = value.snapshot.awardsBattle;
  const source = { source_data_date: awards.data_as_of_date, run_id: awards.processing_run_id, sha256: 'a'.repeat(64) };
  Object.assign(awards, {
    config_version: november.configVersion, config_hash: 'b'.repeat(64),
    source_files: { store: source, person: { ...source } },
    person_awards: [{ name: 'SYNTHETIC_RAW_NAME', employeeId: 'SYNTHETIC_RAW_ID' }],
    viewer: {
      schema: 'north12b-awards-viewer/v1', mode, store: '合成店2',
      actual: mode === 'member' ? { rank: 2, amount: 50, gap: 20 } : { leaders: ['甲＊'], amount: 70 },
      projected: mode === 'member' ? { rank: 1, amount: 120, gap: 0 } : { leaders: ['乙＊', '甲＊'], amount: 120 },
      rankings: {
        actual: [
          { name: '甲＊', store: '合成店1', amount: 70, rank: 1, gap: 0 },
          { name: '乙＊', store: '合成店2', amount: 50, rank: 2, gap: 20, self: mode === 'member' },
          { name: '丙＊', store: '合成店3', amount: 50, rank: 2, gap: 20 },
          { name: '丁＊', store: '合成店4', amount: 0, rank: 4, gap: 50 },
        ],
        projected: [
          { name: '乙＊', store: '合成店2', amount: 120, rank: 1, gap: 0, self: mode === 'member' },
          { name: '甲＊', store: '合成店1', amount: 120, rank: 1, gap: 0 },
          { name: '丁＊', store: '合成店4', amount: 80, rank: 3, gap: 40 },
        ],
      },
    },
  });
  const rewards = Object.fromEntries(november.rewardRules.map(rule => [rule.role, rule.amounts]));
  for (const [index, unit] of [awards.overall, ...awards.stores].entries()) {
    unit.award = { actual_total: 100 - index, projected: 200 - index, rank: index + 1, award: 'Y' };
    for (const item of unit.items) Object.assign(item, {
      store_reward_50: rewards.manager[item.name][0], store_reward_100: rewards.manager[item.name][2],
      district_reward_80: rewards.supervisor[item.name][0], district_reward_100: rewards.supervisor[item.name][2],
    });
  }
  const calls = [], control = { denied: false }, errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(new Date('2026-11-05T09:00:00Z'));
  const expiresAt = Date.parse('2026-11-05T09:25:00Z');
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === origin) {
      const file = path.resolve(root, '.' + url.pathname);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css' };
      return route.fulfill({ contentType: types[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
    }
    if (url.hostname !== 'script.google.com') return route.abort();
    const { action } = request.postDataJSON(); calls.push(action);
    const proof = { profile: { role: 'employee', isTrusted: false }, trustSource: 'password-bound' };
    let result = { status: 'ok' };
    if (action === 'employee_status') result = { status: 'ok', enabled: true, passwordAvailable: true };
    if (action === 'employee_login') result = { status: 'ok', trustSource: 'password-bound', token: 'B1_a_' + 'a'.repeat(64), expiresAt };
    if (action === 'employee_dashboard_read') result = control.denied
      ? { status: 'error', code: 'B_AUTH_DENIED' }
      : { status: 'ok', trustSource: 'password-bound', expiresAt, phoneEligible: false,
        privateResult: { status: 'ok', ...proof, snapshot: value.snapshot },
        kpiResult: { status: 'ok', ...proof, data: value.kpi } };
    return route.fulfill({ json: result });
  });
  await page.goto(origin + '/' + entry);
  await page.locator('[data-b-employee]').fill('SYNTHETIC');
  await page.locator('[data-b-password]').fill('SYNTHETIC_PASSWORD');
  await page.locator('[data-b-submit]').click();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state', 'active');
  if (entry === 'index.html') await page.getByRole('button', { name: /台獎戰情/ }).click();
  return { calls, control, errors };
}

for (const entry of ['index.html', 'awards-battle.html', 'kpi-battle.html#awards']) {
  for (const mode of ['member', 'supervisor']) {
    test(`${entry}: ${mode} rankings through the protected password transport`, async ({ page }, info) => {
      const { calls, control, errors } = await login(page, entry, mode);
      const panel = page.locator('#awardsBattleContent');
      const stores = panel.getByRole('table', { name: '區內門市獎金排名' });
      await expect(stores.locator('tbody tr')).toHaveCount(9);
      await expect(stores.locator('tbody tr').first().locator('td')).toHaveText(['1', '$99', '目前領先']);
      await page.selectOption('#awardsRankingType', 'people');
      const table = panel.getByRole('table', { name: '區內同仁獎金排名' });
      await expect(table.locator('tbody tr')).toHaveCount(4);
      await expect(table.locator('tbody tr').nth(1).locator('td')).toHaveText(['2', '$50', '$20']);
      await expect(table.locator('tbody tr').nth(2).locator('td')).toHaveText(['2', '$50', '$20']);
      await expect(table.locator('tbody tr').nth(3).locator('td')).toHaveText(['4', '$0', '$50']);
      await page.selectOption('#awardsStoreSelect', '合成店8');
      if (mode === 'member') {
        await expect(table).toContainText('乙＊（我）');
        await expect(panel).toContainText('我的店 · 合成店2');
        await expect(panel).toContainText('區內第 2 名 · $50 · 追平前一名還差 $20');
        await expect(panel).not.toContainText('全區同仁第一名');
      } else {
        await expect(panel).toContainText('全區同仁第一名');
        await expect(panel).not.toContainText('我的台獎');
        await expect(table).not.toContainText('（我）');
      }
      await page.selectOption('#awardsRankingBasis', 'projected');
      await expect(table.locator('tbody tr')).toHaveCount(3);
      await expect(table.locator('tbody tr').nth(0).locator('td')).toHaveText(['1', '$120', '目前領先']);
      await expect(table.locator('tbody tr').nth(1).locator('td')).toHaveText(['1', '$120', '目前領先']);
      await expect(table.locator('tbody tr').nth(2).locator('td')).toHaveText(['3', '$80', '$40']);
      await expect(panel).not.toContainText('SYNTHETIC_RAW');
      expect(calls.filter(action => ['employee_login', 'employee_dashboard_read'].includes(action))).toEqual(['employee_login', 'employee_dashboard_read']);
      expect(calls).not.toContain('private_access');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await table.scrollIntoViewIfNeeded();
      await page.screenshot({ path: info.outputPath('SYNTHETIC-ranking.png') });
      await table.locator('..').evaluate(element => { element.scrollLeft = element.scrollWidth; });
      await expect(table.getByRole('columnheader', { name: '追平前一名還差' })).toBeInViewport();
      await page.screenshot({ path: info.outputPath('SYNTHETIC-ranking-gap.png') });
      await page.selectOption('#awardsRankingType', 'stores');
      await expect(stores.locator('tbody tr').first().locator('td')).toHaveText(['1', '$199', '目前領先']);
      await page.selectOption('#awardsRankingType', 'people');
      await expect(table.locator('tbody tr')).toHaveCount(3);

      // Revoke the mocked lease through the same normal refresh path.
      control.denied = true;
      const more = page.locator('#dashboard-b-access .b-more');
      if (await more.count() && await more.getAttribute('open') === null) await more.locator('summary').click();
      await page.locator('[data-b-refresh]').click();
      await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state', 'locked');
      await expect(panel).not.toContainText('乙＊');
      await expect(panel.getByRole('table', { name: '區內同仁獎金排名' })).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }
}
