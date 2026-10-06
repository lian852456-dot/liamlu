'use strict';
const {test,expect}=require('@playwright/test');
const path=require('node:path'),fixture=require('./threec-search-fixture.cjs'),Transport=require('../threec-price-transport.js');
const PAGE='file://'+path.resolve(__dirname,'../threec-query.html');
async function setup(page,width){
  const calls=[],errors=[];let version=1;
  page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});
  await page.addInitScript(()=>{window.optionCalls=0;let api;Object.defineProperty(window,'ThreecComparisonCore',{configurable:true,get:()=>api,set(value){api={...value,options(...args){window.optionCalls++;return value.options(...args);}};}});});
  await page.route(/^https?:/,async route=>{
    const request=route.request(),url=new URL(request.url());if(url.hostname!=='script.google.com'||!url.pathname.startsWith('/macros/s/'))return route.abort();
    let payload;try{payload=JSON.parse(request.postData());}catch{payload=JSON.parse(new URLSearchParams(request.postData()).get('payload'));}
    calls.push(payload);expect(payload.action).toBe('threec_snapshot_read');expect(payload.includeChanges).toBe(false);
    const body=Transport.encode(payload.kind==='shopping'?fixture.shopping({version}):fixture.tradein());
    if(url.searchParams.get('transport')==='iframe')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><script>top.postMessage('+JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body}).replace(/</g,'\\u003c')+',"*")</script>'});
    return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(PAGE);await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');
  if(width<700)await page.locator('.filter-details summary').click();
  await page.locator('#tableModeBtn').click();
  return {calls,errors,setVersion(value){version=value;}};
}
for(const width of [1440,390]){
  test(`${width}px cold options compute once; cross-brand invalid model resets before downstream options`,async({page})=>{
    const env=await setup(page,width);expect(await page.evaluate(()=>optionCalls)).toBe(1);
    await page.locator('#shoppingBrand').selectOption('APPLE');await page.locator('#shoppingModel').selectOption('iPhone 合成機 0');await page.locator('#shoppingCapacity').selectOption('512GB');
    const before=await page.evaluate(()=>optionCalls);await page.locator('#shoppingBrand').selectOption('示範牌');
    expect(await page.evaluate(()=>optionCalls)-before).toBe(2);
    await expect(page.locator('#shoppingModel')).toHaveValue('');await expect(page.locator('#shoppingCapacity')).toHaveValue('512GB');
    await expect(page.locator('#shoppingResults')).toContainText('中文示範機');await expect(page.locator('#shoppingProject option')).toContainText(['一般5G-續約']);
    expect(env.calls).toHaveLength(2);expect(env.errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
  test(`${width}px fresh publication resets obsolete model and rebuilds dependent options without retaining old catalog`,async({page})=>{
    const env=await setup(page,width);await page.locator('#shoppingBrand').selectOption('APPLE');await page.locator('#shoppingModel').selectOption('iPhone 合成機 0');await page.locator('#shoppingCapacity').selectOption('512GB');
    env.setVersion(2);await page.locator('#refreshBtn').click();await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');
    await expect(page.locator('#shoppingModel')).toHaveValue('');await expect(page.locator('#shoppingCapacity')).toHaveValue('512GB');
    await expect(page.locator('#shoppingResults')).toContainText('新版目錄機');await expect(page.locator('#shoppingModel option')).not.toContainText(['iPhone 合成機']);
    await expect(page.locator('#shoppingMeta')).toContainText('2026-10-02');
    await page.locator('#enterpriseSegmentBtn').click();await expect(page.locator('.comparison-table tbody')).not.toContainText('無報價');await page.locator('#consumerSegmentBtn').click();await expect(page.locator('#shoppingRent')).toHaveValue('common');
    expect(env.calls).toHaveLength(4);expect(env.errors).toEqual([]);
  });
}
