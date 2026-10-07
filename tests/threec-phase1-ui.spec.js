'use strict';
const {test,expect}=require('@playwright/test'),path=require('node:path');
const fixture=require('./threec-phase1-fixture.cjs');
const URL='file://'+path.resolve(__dirname,'../threec-query.html');
function fulfill(route,body){const url=new globalThis.URL(route.request().url());return url.searchParams.get('transport')==='iframe'?route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><script>top.postMessage('+JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body}).replace(/</g,'\\u003c')+',"*")</script>'}):route.fulfill({contentType:'application/json',body:JSON.stringify(body)});}
function payload(route){try{return JSON.parse(route.request().postData());}catch{return JSON.parse(new URLSearchParams(route.request().postData()).get('payload'));}}
async function setup(page,viewport){
 const calls=[];const errors=[];page.on('pageerror',err=>errors.push(err.message));
 await page.route('**/exec*',route=>{const body=payload(route);calls.push(body);return fulfill(route,body.action==='threec_changes_read'?{status:'ok',changeSet:{changes:[],changeCount:0}}:fixture[body.kind]);});
 if(viewport)await page.setViewportSize(viewport);await page.goto(URL);await expect(page.locator('#shoppingSummary')).toContainText('5 組');return {calls,errors};
}
test('品牌機款容量拆分，合併顏色但隱藏差價仍分列，只呈現有價與零元',async({page})=>{
 const {calls,errors}=await setup(page);
 await expect(page.locator('#shoppingMeta .source-date')).toContainText('2026-10-01');
 expect(await page.locator('#shoppingModel option').allTextContents()).toEqual(['全部機款','Galaxy 示範機','iPhone 示範機','Mac 示範機']);
 await page.locator('#shoppingBrand').selectOption('Apple');
 await expect(page.locator('#shoppingModel')).not.toContainText('Galaxy');
 await page.locator('#shoppingModel').selectOption('iPhone 示範機');
 await page.locator('#shoppingCapacity').selectOption('256GB');
 await expect(page.locator('.comparison-table tbody tr')).toHaveCount(2);
 await expect(page.locator('#shoppingResults')).toContainText('2 款顏色同價');
 await page.locator('#shoppingReset').click();
 await expect(page.locator('#shoppingResults')).toContainText('RAM 16GB');
 await expect(page.locator('#shoppingResults')).toContainText('0 元');
 await expect(page.locator('#shoppingResults')).not.toContainText('無報價（缺價）');
 await expect(page.locator('#shoppingResults')).not.toContainText('未列此條件');
 expect(calls.every(call=>!call.employeeId&&!call.adminSecret&&!call.deviceId)).toBe(true);expect(errors).toEqual([]);
});
test('月租跨期快捷、版本、搜尋空結果、重設及重複刷新保留操作',async({page})=>{
 const {calls,errors}=await setup(page);
 await page.locator('[data-shortcut="common"]').click();await page.locator('[data-shortcut="common"]').click();
 await expect(page.locator('.comparison-table thead')).toContainText('24 期');await expect(page.locator('.comparison-table thead')).toContainText('48 期');
 await expect(page.locator('.comparison-table thead')).not.toContainText('599 元');
 await page.locator('#shoppingVersion').selectOption('VIP');await expect(page.locator('.comparison-table thead th')).toHaveCount(2);
 await page.locator('#shoppingSearch').fill('無此機款');await expect(page.locator('#shoppingResults')).toContainText('沒有符合');
 await page.locator('#shoppingReset').click();await expect(page.locator('.comparison-table tbody tr')).toHaveCount(5);
 await page.locator('[data-shortcut="999-24"]').click();await expect(page.locator('.comparison-table thead')).not.toContainText('48 期');
 await page.locator('#refreshBtn').click();await expect(page.locator('#queryStatus')).toContainText('已讀取');
 await page.locator('#refreshBtn').click();await expect(page.locator('#queryStatus')).toContainText('已讀取');
 expect(calls.filter(c=>c.action==='threec_snapshot_read')).toHaveLength(6);expect(errors).toEqual([]);
 await page.reload();await expect(page.locator('#shoppingRent')).toHaveValue('common');
});
for(const width of [1280,390,360])test(`${width}px 橫滑固定規格、卡片方案選擇與窄屏布局`,async({page})=>{
 const {errors}=await setup(page,{width,height:900});
 if(width<=700){await expect(page.locator('.quote-cards')).toBeVisible();await expect(page.locator('.filter-details')).not.toHaveAttribute('open','');}
 await page.locator('#tableModeBtn').click();
 const scroll=page.locator('.comparison-scroll');const before=await page.locator('.comparison-table tbody .spec-cell').first().boundingBox();
 await scroll.evaluate(el=>{el.scrollLeft=400;});const after=await page.locator('.comparison-table tbody .spec-cell').first().boundingBox();
 expect(Math.abs(before.x-after.x)).toBeLessThan(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#cardModeBtn').click();await page.locator('#shoppingCardCondition').selectOption(fixture.p(1399,48));
 await expect(page.locator('.quote-cards .quote.zero')).toHaveCount(4);
 await expect(page.locator('#shoppingCardCondition option')).not.toContainText(['加碼']);
 await page.locator('#shoppingCardCondition').selectOption(fixture.p(999,24,'VIP'));
 await expect(page.locator('.quote-cards')).not.toContainText('無報價（缺價）');
 await page.locator('#tradeinTab').click();await expect(page.locator('#tradeinResults')).toContainText('FutureDial（FDI）（獨立報價）');
 await page.locator('#shoppingTab').click();await expect(page.locator('.quote-cards')).toBeVisible();expect(errors).toEqual([]);
});
test('大量條件與機款獨立分页，不一次展開所有維度',async({page})=>{
 const response=JSON.parse(JSON.stringify(fixture.shopping));response.snapshot.rows=Array.from({length:25},(_,i)=>({...fixture.shopping.snapshot.rows[0],model:'大量機款 '+i+' 256GB',colorless_model:'大量機款 '+i+' 256GB',project_prices:Object.fromEntries(Array.from({length:18},(_,j)=>[fixture.p(999,24+j),j]))}));
 await page.route('**/exec*',route=>fulfill(route,response));await page.goto(URL);
 await expect(page.locator('.comparison-table tbody tr')).toHaveCount(20);await expect(page.locator('.comparison-table thead th')).toHaveCount(13);
 await page.locator('#columnNext').click();await expect(page.locator('.comparison-table thead th')).toHaveCount(7);
 await page.locator('#rowNext').click();await expect(page.locator('.comparison-table tbody tr')).toHaveCount(5);
 await page.locator('#shoppingSearch').fill('大量機款 0 ');await expect(page.locator('.comparison-table tbody tr')).toHaveCount(1);await expect(page.locator('#rowPage')).toHaveText('1 / 1 頁');
});

for(const width of [1280,390,360])test(`${width}px 第一階段審核畫面（合成價格）`,async({page})=>{
 await setup(page,{width,height:900});
 if(width<=700)await page.locator('.filter-details summary').click();
 await page.locator('#shoppingBrand').selectOption('Apple');
 await page.locator('#shoppingModel').selectOption('iPhone 示範機');
 await page.locator('#shoppingCapacity').selectOption('256GB');
 const folder=process.env.PHASE1_QA_SCREENSHOT_DIR;if(!folder)return;
 require('node:fs').mkdirSync(folder,{recursive:true});
 if(width>=1000){await page.locator('#tableModeBtn').click();await page.screenshot({path:path.join(folder,`desktop-${width}.png`),fullPage:true});}
 else{await page.locator('#cardModeBtn').click();await page.screenshot({path:path.join(folder,`mobile-card-${width}.png`),fullPage:true});await page.locator('#tableModeBtn').click();await page.screenshot({path:path.join(folder,`mobile-table-${width}.png`),fullPage:true});}
});
