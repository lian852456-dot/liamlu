const { test, expect } = require('@playwright/test');
const path = require('node:path');

const BASE=`file://${path.resolve(__dirname,'../app.html')}?preview=1`;
test.use({viewport:{width:390,height:844},serviceWorkers:'block'});

async function expectMobileSafe(page) {
  const result=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    ellipsis:Array.from(document.querySelectorAll('[data-view]:not([hidden]) *')).filter(node=>node instanceof HTMLElement&&getComputedStyle(node).textOverflow==='ellipsis'&&node.scrollWidth>node.clientWidth).map(node=>node.textContent.trim()),
    shortTargets:Array.from(document.querySelectorAll('[data-view]:not([hidden]) button:not([hidden])')).filter(node=>node.getBoundingClientRect().height<44).map(node=>node.textContent.trim())
  }));
  expect(result.overflow).toBeLessThanOrEqual(0);
  expect(result.ellipsis).toEqual([]);
  expect(result.shortTargets).toEqual([]);
}

test('App 1.2 daily report shows the formal summary layout without mobile overflow',async({page})=>{
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${BASE}#report`);
  await expect(page.locator('#reportOperations .report-operation-grid article')).toHaveCount(6);
  for(const value of ['A999 上線數','12','好速銷售點數','8.5','R1399 上線數','7','R999 上線數','11','保險搭售率','67.4%','設備案佔比','61.2%']) {
    await expect(page.locator('#reportOperations')).toContainText(value);
  }
  const store=page.locator('.report-store').first();
  await store.locator('.report-store-button').click();
  await expect(store.locator('.report-store-operation-grid > span')).toHaveCount(6);
  await expectMobileSafe(page);
  expect(errors).toEqual([]);
});

test('App 1.2 personal area groups formal roles, filters under-target metrics and keeps ten metric details',async({page})=>{
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${BASE}#battle`);
  await page.locator('[data-battle-kind="personal"]').click();
  await expect(page.locator('[data-personal-view="role"]')).toHaveClass(/active/);
  await expect(page.locator('#personalRoleSelect')).toHaveValue('店長');
  await expect(page.locator('#battleContent .personal-performance-item')).toHaveCount(3);
  await expect(page.locator('#battleContent')).toContainText('AQ需關注店長');
  await expect(page.locator('#battleContent')).toContainText('AQ 點數 < 10');
  await expect(page.locator('.personal-aq-row')).toHaveCount(2);
  await expect(page.locator('.personal-management-note')).toContainText('App 只作提示，不重算正式總績效、KPI 或公司排名');
  await expect(page.locator('#battleContent')).toContainText('店長店績');
  expect(await page.locator('.personal-performance-item .personal-primary b').allTextContents()).toEqual(['同仁＊1','同仁＊4','同仁＊7']);
  expect(await page.locator('.personal-performance-item .personal-rate b').allTextContents()).toEqual(['128.6%','112.7%','98.3%']);
  await expect(page.locator('.personal-performance-item').first()).toContainText('公司排名 12');
  await expect(page.locator('.personal-performance-item').first()).toContainText('店 KPI DOD +6.2pp');
  await expect(page.locator('.personal-performance-item').first()).toContainText('店排名變化 ↑2');
  await expect(page.locator('.personal-performance-item').first()).toContainText('AQ 12 點');
  await expect(page.locator('.personal-performance-item').first()).toContainText('缺 0 點');
  await expect(page.locator('.personal-performance-item').first()).not.toContainText('總績效');
  await expect(page.locator('.personal-performance-item').first()).not.toContainText('0.0%');
  await expect(page.locator('#battleContent')).not.toContainText('正式排名');
  await expect(page.locator('#battleContent')).not.toContainText('1326');
  await expect(page.locator('#battleContent .personal-performance-button')).toHaveCount(0);
  await expect(page.locator('#battleContent .personal-metric-grid')).toHaveCount(0);
  await page.locator('#personalRoleSelect').selectOption('副店');
  let ranks=await page.locator('.personal-performance-item .personal-priority small:nth-child(2)').allTextContents();
  expect(ranks).toEqual(['正式排名 19','正式排名 40','正式排名 61']);
  const deputy=page.locator('.personal-performance-item').first();
  await deputy.locator('.personal-performance-button').click();
  await expect(deputy.locator('.personal-metric-grid article')).toHaveCount(10);
  await page.locator('#personalRoleSelect').selectOption('其他業代');
  await expect(page.locator('#battleContent .personal-performance-item')).toHaveCount(3);

  await page.locator('[data-personal-view="gap"]').click();
  await expect(page.locator('#personalGapMetricSelect')).toHaveValue('A999');
  await expect(page.locator('#battleContent .personal-performance-item')).toHaveCount(3);
  const a999Rates=await page.locator('.personal-performance-item .personal-rate b').allTextContents();
  expect(a999Rates).toEqual(['98.7%','91.7%','88.2%']);
  expect(await page.locator('.personal-performance-item .personal-primary b').allTextContents()).toEqual(['同仁＊6','同仁＊8','同仁＊9']);
  await page.locator('#personalGapMetricSelect').selectOption('好速');
  await expect(page.locator('#battleContent')).toContainText('好速 未達');
  await page.locator('#personalGapMetricSelect').selectOption('R1399');
  await expect(page.locator('#battleContent')).toContainText('R1399 未達');

  await page.locator('[data-battle-scope="store"]').click();
  await expect(page.locator('.personal-region-controls')).toHaveCount(0);
  await expect(page.locator('#battleContent .personal-performance-item')).toHaveCount(1);
  await expectMobileSafe(page);
  expect(errors).toEqual([]);
});
