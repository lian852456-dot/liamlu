'use strict';
const {test,expect}=require('@playwright/test');
const path=require('node:path');
const fixture=require('./threec-search-fixture.cjs');
const Transport=require('../threec-price-transport.js');
const PAGE='file://'+path.resolve(__dirname,'../threec-query.html');
const fields=['shoppingBrand','shoppingModel','shoppingCapacity','shoppingProject','shoppingVersion','shoppingRent','shoppingTerm'];
for(const width of [1440,390])test(`${width}px compact iPhone model query, deletion, conflicting filters and enterprise work locally`,async({page})=>{
 const calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});
 const shopping=fixture.shopping({count:4});shopping.snapshot.rows=shopping.snapshot.rows.slice(0,4).map((row,i)=>({...row,brand:i===3?'Samsung':'APPLE',model:['iPhone 17 Pro 256GB(黑)','iPhone 17 512GB(白)','iPhone 16 256GB(黑)','Galaxy S 25 256GB(黑)'][i],colorless_model:['iPhone 17 Pro 256GB','iPhone 17 512GB','iPhone 16 256GB','Galaxy S 25 256GB'][i],project_prices:{[fixture.plans[0]]:i===0?'0':'1299',[fixture.enterprise[0]]:i===0?'2999':''}}));shopping.snapshot.row_count=4;
 await page.route(/^https?:/,async route=>{
  if(!route.request().url().includes('/macros/s/'))return route.abort();
  let p;try{p=JSON.parse(route.request().postData());}catch{p=JSON.parse(new URLSearchParams(route.request().postData()).get('payload'));}calls.push(p);expect(p.action).toBe('threec_snapshot_read');
  const body=Transport.encode(p.kind==='shopping'?shopping:fixture.tradein()),url=new URL(route.request().url());
  if(url.searchParams.get('transport')==='iframe')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><script>top.postMessage('+JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body}).replace(/</g,'\\u003c')+',"*")</script>'});
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(PAGE);await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');if(width<700)await page.locator('.filter-details summary').click();
 const values=()=>page.evaluate(ids=>ids.map(id=>({id,value:document.getElementById(id).value,html:document.getElementById(id).innerHTML})),fields);
 const before=await values(),reads=calls.length;
 for(const query of ['iphone17','iPhone 17','IPHONE17','iphone  17']){await page.locator('#shoppingSearch').fill(query);await expect(page.locator('#shoppingSummary')).toContainText('2 組');await expect(page.locator('#shoppingResults')).toContainText('iPhone 17 Pro');await expect(page.locator('#shoppingResults')).not.toContainText('iPhone 16');expect(await values()).toEqual(before);}
 await page.locator('#shoppingSearch').fill('');await page.locator('#shoppingSearch').pressSequentially('iphone17pro',{delay:10});await expect(page.locator('#shoppingSummary')).toContainText('1 組');await expect(page.locator('#shoppingResults')).toContainText('0 元');
 for(let i=0;i<11;i++)await page.locator('#shoppingSearch').press('Backspace');await expect(page.locator('#shoppingSummary')).toContainText('4 組');
 await page.locator('#shoppingSearch').fill('iphone17');await page.locator('#shoppingBrand').selectOption('Samsung');await expect(page.locator('#shoppingResults')).toContainText('沒有符合');await page.locator('#shoppingReset').click();await expect(page.locator('#shoppingSummary')).toContainText('4 組');
 await page.locator('#enterpriseSegmentBtn').click();await page.locator('#shoppingSearch').fill('iphone17');await expect(page.locator('#shoppingSummary')).toContainText('1 組');await expect(page.locator('#shoppingResults')).toContainText('2,999 元');
 expect(calls).toHaveLength(reads);expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:path.resolve(__dirname,`../../diagnostic/search-spacing-evidence/ui-${width}.png`),fullPage:true});
});
