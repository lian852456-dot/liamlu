'use strict';
const {test,expect}=require('@playwright/test');
const path=require('node:path');
const PAGE_URL='file://'+path.resolve(__dirname,'../gold-medal.html');
const ledger={schema:'north12b-daily-gold/v1',region:'北一二B',updatedAt:'2026-10-01T00:00:00Z',settlements:[{date:'2026-09-30',status:'confirmed',source:'測試結算',recordedAt:'2026-10-01T00:00:00Z',rows:[{personKey:'test-person-01',store:'三創',alias:'測試同仁',balance:9,reason:'',exemption:''}]}]};
for(const viewport of [{width:1280,height:900},{width:390,height:844}]){
  test(`${viewport.width}px 金牌空白裝置免登入載入、篩選及重新整理`,async({page})=>{
    const calls=[];
    await page.route('**/exec',route=>{calls.push(route.request().postDataJSON());return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'ok',ledger})});});
    await page.setViewportSize(viewport);await page.goto(PAGE_URL);
    await expect(page.locator('#viewerBody')).toContainText('測試同仁');
    await expect(page.locator('#viewerBadge')).toHaveText('免登入查詢');
    await expect(page.locator('#employeeId')).toHaveCount(0);
    await page.locator('#viewerStore').selectOption('三創');
    await expect(page.locator('#viewerBody')).toContainText('9');
    await expect(page.locator('#refreshButton')).toBeEnabled();
    await page.locator('#refreshButton').click();
    await expect(page.locator('#loadStatus')).toContainText('已載入');
    expect(calls).toEqual([{action:'department_gold_access'},{action:'department_gold_access'}]);
    expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
}
test('金牌讀取失敗可重試，不保留舊結果',async({page})=>{
  let fail=true;
  await page.route('**/exec',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(fail?{status:'error',message:'測試讀取失敗'}:{status:'ok',ledger})}));
  await page.goto(PAGE_URL);await expect(page.locator('#loadStatus')).toContainText('測試讀取失敗');
  await expect(page.locator('#goldViewer')).toBeHidden();
  fail=false;await page.locator('#refreshButton').click();await expect(page.locator('#viewerBody')).toContainText('測試同仁');
  fail=true;await page.locator('#refreshButton').click();await expect(page.locator('#goldViewer')).toBeHidden();
});
