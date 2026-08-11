const { test, expect } = require('@playwright/test');
const path = require('node:path');

const BASE=`file://${path.resolve(__dirname,'../app.html')}?preview=1`;
test.use({viewport:{width:390,height:844},serviceWorkers:'block'});

async function expectMobileSafe(page) {
  const result=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    ellipsis:Array.from(document.querySelectorAll('[data-view]:not([hidden]) *')).filter(node=>node instanceof HTMLElement&&getComputedStyle(node).textOverflow==='ellipsis'&&node.scrollWidth>node.clientWidth).map(node=>node.textContent.trim()),
    shortTargets:Array.from(document.querySelectorAll('[data-view]:not([hidden]) button')).filter(node=>node.getBoundingClientRect().height<44).map(node=>node.textContent.trim())
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

test('App 1.2 personal performance uses two-level rows and ten formal metrics',async({page})=>{
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${BASE}#battle`);
  await page.locator('[data-battle-kind="personal"]').click();
  await expect(page.locator('#battleContent .personal-performance-item')).toHaveCount(9);
  await expect(page.locator('#battleContent')).toContainText('需要關注人數—正式來源未定義');
  const first=page.locator('.personal-performance-item').first();
  await first.locator('.personal-performance-button').click();
  await expect(first.locator('.personal-metric-grid article')).toHaveCount(10);
  await expect(first).toContainText('A999');
  await expect(first).toContainText('A1399');
  await expect(first).toContainText('R999');
  await expect(first).toContainText('R1399');
  await expectMobileSafe(page);
  expect(errors).toEqual([]);
});
