'use strict';
const {test,expect}=require('@playwright/test'),path=require('node:path'),Transport=require('../threec-price-transport.js');
const PAGE='file://'+path.resolve(__dirname,'../threec-query.html');
const multi='企客特殊專案(2)／4G_ihouse智能499H(24)_799H(24)',slow='企客特殊專案(2)／4G_ihouse智能_499H(30)限高速21Mbps',fast='企客特殊專案(2)／4G_ihouse智能_799H(30)';
const cam499='企客特殊專案(2)／4G行動寬頻IP_Cam案499H',cam799='企客特殊專案(2)／4G行動寬頻IP_Cam案799H',five='企客5G員工眷5力全開_XH(24)-新申裝/續約／(企客_5G)5力全開799H(24)_iPhone';
const consumer='5G_iPhone_XH(24)-新申裝/續約／999H',consumer1399='5G_iPhone_XH(48)-新申裝/續約／1399H';
function fixture(){const row=(model,prices)=>({source_sheet:'合成測試表',brand:'QA',model,colorless_model:model,code:model,retail_price:'29,900',project_prices:Object.fromEntries(Object.entries(prices).map(([key,value])=>[key,String(value??'')]))});return {status:'ok',snapshot:{kind:'shopping',row_count:9,snapshot_hash:'synthetic-enterprise',source_version_date:'2026-10-21',source_file_sha256:'a'.repeat(64),rows:[
 ...Array.from({length:6},(_,i)=>row('合成路由器 '+i,{[multi]:'0',[slow]:'',[fast]:null})),row('合成30期路由器',{[slow]:1234,[fast]:2345}),row('合成IP Cam',{[cam499]:0,[cam799]:0}),row('iPhone 合成機 256GB',{[five]:12345,[consumer]:999,[consumer1399]:1399})
 ]}};}
async function setup(page,width){
 const calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});
 await page.route(/^https?:/,async route=>{
  const req=route.request(),url=new URL(req.url());if(url.hostname!=='script.google.com')return route.abort();
  let payload;try{payload=JSON.parse(req.postData());}catch{payload=JSON.parse(new URLSearchParams(req.postData()).get('payload'));}calls.push(payload);
  const body=Transport.encode(payload.kind==='shopping'?fixture():{status:'ok',snapshot:null});
  if(url.searchParams.get('transport')==='iframe')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><script>top.postMessage('+JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body}).replace(/</g,'\\u003c')+',"*")</script>'});
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(PAGE);await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');
 if(width<700)await page.locator('.filter-details summary').click();
 await page.locator('#enterpriseSegmentBtn').click();return {calls,errors};
}
for(const width of [1440,390])test(`${width}px 企業4G雙月租、24期零元、切換清除與既有5G搜尋比較`,async({page})=>{
 const {calls,errors}=await setup(page,width);
 await expect(page.locator('#shoppingProject option')).toContainText(['4G 行動寬頻 IP Cam','4G iHouse 智能']);
 await page.locator('#shoppingProject').selectOption('4G iHouse 智能');await page.locator('#shoppingTerm').selectOption('24');
 await page.locator('#cardModeBtn').click();
 for(const rent of ['799','499','799','']){
  await page.locator('#shoppingRent').selectOption(rent);await expect(page.locator('#shoppingSummary')).toContainText('6 組機款報價 · 篩選共 1 個有價條件');
  await expect(page.locator('#shoppingCardCondition')).toHaveValue(multi);await expect(page.locator('#shoppingCardCondition option')).toHaveCount(1);await expect(page.locator('#shoppingCardCondition option')).toContainText('499／799 元 · 24期');
  await expect(page.locator('#shoppingResults .quote')).toHaveCount(6);await expect(page.locator('#shoppingResults')).not.toContainText('無報價');
 }
 await page.locator('#tableModeBtn').click();await expect(page.locator('#shoppingResults .rent-label')).toHaveText(['499／799 元']);
 await expect(page.locator('#shoppingResults .quote')).toHaveCount(6);await expect(page.locator('#shoppingResults')).toContainText('0');
 await page.locator('#shoppingTerm').selectOption('30');await page.locator('#shoppingRent').selectOption('799');await expect(page.locator('#shoppingSummary')).toContainText('1 組機款報價 · 篩選共 1 個有價條件');await expect(page.locator('#shoppingResults')).toContainText('2,345');
 await page.locator('#shoppingProject').selectOption('4G 行動寬頻 IP Cam');await expect(page.locator('#shoppingTerm')).toHaveValue('');await expect(page.locator('#shoppingResults')).toContainText('期數未標示');
 await page.locator('#shoppingReset').click();await expect(page.locator('#shoppingRent')).toHaveValue('');await expect(page.locator('#shoppingTerm')).toHaveValue('');await expect(page.locator('#shoppingSummary')).toContainText('6 個有價條件');
 await page.locator('#shoppingSearch').fill('iphone合成機');await expect(page.locator('#shoppingResults')).toContainText('12,345');await expect(page.locator('#shoppingSummary')).toContainText('1 個有價條件');
 await page.locator('#consumerSegmentBtn').click();await expect(page.locator('#shoppingRent')).toHaveValue('common');await expect(page.locator('#shoppingResults')).toContainText('999');await expect(page.locator('#shoppingResults')).toContainText('1,399');
 await page.locator('#enterpriseSegmentBtn').click();await expect(page.locator('#shoppingResults')).toContainText('12,345');await page.locator('#shoppingReset').click();
 expect(calls).toHaveLength(2);expect(calls.every(c=>c.action==='threec_snapshot_read'&&!c.employeeId&&!c.deviceId)).toBe(true);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
