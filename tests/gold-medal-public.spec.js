'use strict';
const {test,expect}=require('@playwright/test');
const path=require('node:path');
const PAGE_URL='file://'+path.resolve(__dirname,'../gold-medal.html');
const ledger={schema:'north12b-public-gold/v1',settlements:[{date:'2026-09-29',rows:[{store:'三創',alias:'測試同仁',balance:7,delta:null},{store:'通化',alias:'測試同仁',balance:-3,delta:null}]},{date:'2026-09-30',rows:[{store:'三創',alias:'測試同仁',balance:9,delta:2},{store:'通化',alias:'測試同仁',balance:-4,delta:-1}]}]};
for(const viewport of [{width:1920,height:1080},{width:1280,height:900},{width:390,height:844}]){
  test(`${viewport.width}px 金牌空白裝置免登入載入、篩選及重新整理`,async({page})=>{
    const calls=[];
    await page.route('**/exec',route=>{calls.push(route.request().postDataJSON());return route.fulfill({contentType:'application/json',body:JSON.stringify({status:'ok',ledger})});});
    await page.setViewportSize(viewport);await page.goto(PAGE_URL);
    await expect(page.locator('#viewerBody')).toContainText('測試同仁');
    await expect(page.locator('#viewerBadge')).toHaveText('免登入查詢');
    await expect(page.locator('#employeeId')).toHaveCount(0);
    await page.locator('#viewerStore').selectOption('三創');
    await expect(page.locator('#viewerBody')).toContainText('9');
    await expect(page.locator('#viewerDailyBody')).toContainText('+2');
    await expect(page.getByText('原因／免扣',{exact:true})).toHaveCount(0);
    await page.locator('#viewerEmployee').selectOption(JSON.stringify(['三創','測試同仁']));
    await page.locator('#viewerMonth').selectOption('2026-09-29');
    await expect(page.locator('#viewerBody')).toContainText('7');
    await expect(page.locator('#viewerDailyBody')).toContainText('—');
    await expect(page.locator('#refreshButton')).toBeEnabled();
    await page.locator('#refreshButton').click();
    await expect(page.locator('#loadStatus')).toContainText('已載入');
    expect(calls).toEqual([{action:'department_gold_access'},{action:'department_gold_access'}]);
    expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const layout=await page.evaluate(()=>({width:document.querySelector('.page').getBoundingClientRect().width,cellFont:parseFloat(getComputedStyle(document.querySelector('#viewerBody td')).fontSize),controlFont:parseFloat(getComputedStyle(document.querySelector('#viewerStore')).fontSize)}));
    expect(layout.width).toBeGreaterThanOrEqual(viewport.width>=1280?viewport.width-200:viewport.width-40);
    expect(layout.cellFont).toBeGreaterThanOrEqual(18);
    expect(layout.controlFont).toBeGreaterThanOrEqual(18);
    await page.screenshot({path:`test-results/gold-${viewport.width}.png`,fullPage:true});
  });
}
test('店點、同名個人與日期起迄一起篩選，跨日總牌數不重複加總',async({page})=>{
  await page.route('**/exec',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({status:'ok',ledger})}));
  await page.goto(PAGE_URL);await expect(page.locator('#viewerBody tr')).toHaveCount(2);
  await expect(page.locator('#viewerSummary .summary-card').first()).toContainText('5');
  await page.locator('#viewerDateTo').fill('2026-09-29');
  await expect(page.locator('#viewerMeta')).toContainText('2026-09-29');
  await expect(page.locator('#viewerSummary .summary-card').first()).toContainText('4');
  await expect(page.locator('#viewerDailyBody tr')).toHaveCount(2);
  await page.locator('#viewerDateFrom').fill('2026-09-30');
  await expect(page.locator('#viewerFilterStatus')).toContainText('起日不能晚於迄日');
  await expect(page.locator('#viewerBody')).toContainText('目前篩選沒有資料');
  await page.locator('#viewerDateTo').fill('2026-09-30');
  await expect(page.locator('#viewerFilterStatus')).toBeHidden();
  await page.locator('#viewerStore').selectOption('通化');
  await page.locator('#viewerEmployee').selectOption(JSON.stringify(['通化','測試同仁']));
  await expect(page.locator('#viewerBody tr')).toHaveCount(1);
  await expect(page.locator('#viewerDailyBody tr')).toHaveCount(1);
  await expect(page.locator('#viewerBody')).toContainText('-4');
  await expect(page.locator('#viewerDailyBody')).toContainText('-1');
  await page.locator('#viewerMonth').selectOption('2026-09-29');
  await expect(page.locator('#viewerBody')).toContainText('目前篩選沒有資料');
  await expect(page.locator('#viewerDailyBody')).toContainText('目前篩選沒有日結紀錄');
  await page.locator('#viewerReset').click();
  await expect(page.locator('#viewerBody tr')).toHaveCount(2);
  await expect(page.locator('#viewerDailyBody tr')).toHaveCount(4);
  await page.locator('#viewerDateFrom').fill('2026-10-01');
  await expect(page.locator('#viewerMeta')).toHaveText('目前篩選沒有結算資料');
});
test('金牌讀取失敗可重試，不保留舊結果',async({page})=>{
  let fail=true;
  await page.route('**/exec',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(fail?{status:'error',message:'測試讀取失敗'}:{status:'ok',ledger})}));
  await page.goto(PAGE_URL);await expect(page.locator('#loadStatus')).toContainText('測試讀取失敗');
  await expect(page.locator('#goldViewer')).toBeHidden();
  fail=false;await page.locator('#refreshButton').click();await expect(page.locator('#viewerBody')).toContainText('測試同仁');
  fail=true;await page.locator('#refreshButton').click();await expect(page.locator('#goldViewer')).toBeHidden();
});

test('public page refuses a private ledger response',async({page})=>{
 await page.route('**/exec',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({status:'ok',ledger:{schema:'north12b-daily-gold/v1',settlements:[]}})}));
 await page.goto(PAGE_URL);await expect(page.locator('#loadStatus')).toContainText('金牌資料讀取失敗');await expect(page.locator('#goldViewer')).toBeHidden();
});
test('verified supervisor renderer retains full private notes',async({page})=>{
 const privateLedger={schema:'north12b-daily-gold/v1',region:'北一二B',updatedAt:'2026-10-01T00:00:00Z',settlements:[{date:'2026-09-30',status:'confirmed',source:'管理來源',recordedAt:'2026-10-01T00:00:00Z',rows:[{personKey:'synthetic-person-01',store:'三創',alias:'測試同仁',balance:9,reason:'測試詳細原因',exemption:'測試免扣'}]}]};
 await page.route('**/exec',route=>{const body=route.request().postDataJSON();return route.fulfill({contentType:'application/json',body:JSON.stringify(body.action==='ptauth'?{status:'ok',token:'synthetic-token'}:{status:'ok',ledger:privateLedger})});});
 await page.goto('file://'+path.resolve(__dirname,'../north12b-gold-ops.html'));
 await expect(page.locator('#loginPanel')).toBeVisible();await expect(page.locator('#goldViewer')).toBeHidden();
 await page.locator('#passcode').fill('synthetic-only');await page.locator('#loginForm button').click();
 await expect(page.locator('#viewerDailyBody')).toContainText('測試詳細原因／測試免扣');await expect(page.locator('#viewerMeta')).toContainText('管理來源');
});
