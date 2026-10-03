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
        return { status:'ok', rowWritten:true, spreadsheetId:'synthetic', sheetName:'回報資料',
          date:payload.date, store:payload.store, seg:payload.seg, readbackMatches:true };
      }
      return {status:'ok',data:window.__closingSaved ? {'酒泉':window.__closingSaved} : {}};
    };
    document.getElementById('fillDate').value = '2099-10-02';
    _cache[cacheKey('2099-10-02',21)] = {};
    currentSeg = 21;
    document.querySelector('.tab-btn.report-tab').click();
    selectStore('酒泉');
    await Promise.resolve();
  });
});

for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  test(`missing fields are visible and block the save on ${viewport.width}px`, async ({page}, testInfo) => {
    await page.setViewportSize(viewport);
    await page.locator('.btn-save-main').click();
    await expect(page.locator('#closingReportError')).toContainText('A999、A1399、好速、R999、R1399、保險分子、保險分母、OP 上線、OP 累積、OP 目標、MyCharge 已點選、MyCharge 今日貼標數');
    await expect(page.locator('#f_aq999')).toBeFocused();
    await expect(page.locator('#underModal')).not.toHaveClass(/show/);
    expect(await page.evaluate(() => window.__closingCalls.includes('write'))).toBe(false);
    await page.locator('#closingReportError').scrollIntoViewIfNeeded();
    await page.locator('.save-btn-wrap').screenshot({path:testInfo.outputPath(`closing-required-${viewport.width}.png`)});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('complete data verifies the closing fields before displaying saved', async ({page}) => {
  for (const key of ['aq999','aq1399','haosu','rt1399','rt999','insurance_num']) await page.locator('#f_'+key).fill('1');
  await page.locator('#f_insurance_den').fill('2');
  for (const key of ['op_online','op_accum','op_target','mycharge_clicked','mycharge_tagged']) {
    await page.locator('#f_mgmt_'+key).fill(key === 'mycharge_tagged' ? '2' : '1');
  }
  await page.locator('.btn-save-main').click();
  await expect(page.locator('#toast')).toContainText('已儲存');
  expect(await page.evaluate(() => window.__closingCalls.filter(action => ['write','read'].includes(action)).slice(-2))).toEqual(['write','read']);
  await expect(page.locator('#closingReportError')).toBeHidden();
});

test('21:00 KPI and rank are inherited from 16:00 and locked', async ({page}) => {
  await page.evaluate(async () => {
    const date='2099-10-02';
    _cache[cacheKey(date,16)]={酒泉:{date,store:'酒泉',seg:16,kpi:88.8,rank:123}};
    _cache[cacheKey(date,21)]={};
    currentSeg=21;
    selectStore('酒泉');
    await Promise.resolve();
  });
  await expect(page.locator('#f_kpi')).toHaveValue('88.8');
  await expect(page.locator('#f_rank')).toHaveValue('123');
  await expect(page.locator('#f_kpi')).toHaveAttribute('readonly','');
  await expect(page.locator('#f_rank')).toHaveAttribute('readonly','');
});
