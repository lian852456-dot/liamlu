const { test, expect } = require('@playwright/test');
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:4176/';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => {
    return new URL(route.request().url()).origin === new URL(base).origin
      ? route.continue() : route.abort();
  });
  await page.goto(base + 'index.html', { waitUntil:'domcontentloaded' });
  await page.evaluate(async () => {
    window.__closingCalls = [];
    window.__closingSaved = null;
    privateDashboardPost = async payload => {
      window.__closingCalls.push(payload.action);
      if (payload.action === 'write') {
        window.__closingSaved = { ...payload.data, date:payload.date, store:payload.store, seg:payload.seg };
        return {
          status:'ok', rowWritten:true, spreadsheetId:'synthetic', sheetName:'回報資料',
          date:payload.date, store:payload.store, seg:payload.seg,
          reportReadback:window.__closingSaved
        };
      }
      return {status:'ok',data:window.__closingSaved ? {'酒泉':window.__closingSaved} : {}};
    };
    document.getElementById('fillDate').value = '2026-10-02';
    _cache[cacheKey('2026-10-02',21)] = {};
    _cache[cacheKey('2026-10-02',16)] = {'酒泉':{date:'2026-10-02',store:'酒泉',seg:16,kpi:91.2,rank:156}};
    currentSeg = 21;
    document.querySelector('.tab-btn.report-tab').click();
    selectStore('酒泉');
    await Promise.resolve();
    await Promise.resolve();
  });
});

for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  test(`missing fields are visible and block the save on ${viewport.width}px`, async ({page}, testInfo) => {
    await page.setViewportSize(viewport);
    await page.locator('.btn-save-main').click();
    await expect(page.locator('#closingReportError')).toContainText('A999、A1399、好速、R1399、R999、保險分子、保險分母');
    await expect(page.locator('#closingReportError')).toContainText('OP 上線');
    await expect(page.locator('#closingReportError')).toContainText('今日貼標數');
    await expect(page.locator('#f_aq999')).toBeFocused();
    await expect(page.locator('#underModal')).not.toHaveClass(/show/);
    expect(await page.evaluate(() => window.__closingCalls.includes('write'))).toBe(false);
    await page.locator('#closingReportError').scrollIntoViewIfNeeded();
    await page.locator('.save-btn-wrap').screenshot({path:testInfo.outputPath(`closing-required-${viewport.width}.png`)});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('21:00 carries 16:00 KPI and rank and removes device / award inputs', async ({page}) => {
  await expect(page.locator('#f_kpi')).toHaveValue('91.2');
  await expect(page.locator('#f_rank')).toHaveValue('156');
  await expect(page.locator('#f_kpi')).toHaveAttribute('readonly','');
  await expect(page.locator('#f_rank')).toHaveAttribute('readonly','');
  await expect(page.locator('#f_device_num')).toHaveCount(0);
  await expect(page.locator('#f_device_den')).toHaveCount(0);
  await expect(page.locator('#f_device_ratio')).toHaveCount(0);
  await expect(page.locator('#awardModelsV1Grid')).toHaveCount(0);
  await expect(page.getByText('管理重點',{exact:true})).toBeVisible();
});

test('complete data verifies closing fields and management before displaying saved', async ({page}) => {
  for (const key of ['aq999','aq1399','haosu','rt1399','rt999','insurance_num']) await page.locator('#f_'+key).fill('1');
  await page.locator('#f_insurance_den').fill('2');
  for (const [id,value] of [
    ['#f_management_op_online','1'],
    ['#f_management_op_cumulative','3'],
    ['#f_management_op_target','10'],
    ['#f_management_mycharge_ebm_clicked','2'],
    ['#f_management_mycharge_ebm_taggedToday','4']
  ]) await page.locator(id).fill(value);
  await expect(page.locator('#f_management_mycharge_ebm_rate')).toHaveValue('50.0');
  await page.locator('.btn-save-main').click();
  await expect(page.locator('#toast')).toContainText('已儲存');
  expect(await page.evaluate(() => window.__closingCalls.filter(action => ['write','read'].includes(action)).slice(-2))).toEqual(['write','read']);
  await expect(page.locator('#closingReportError')).toBeHidden();
  const saved=await page.evaluate(()=>window.__closingSaved);
  expect(saved.kpi).toBe(91.2);
  expect(saved.rank).toBe(156);
  expect(JSON.parse(saved.management_json).items.find(item=>item.id==='mycharge-ebm').values.rate).toBe(50);
});
