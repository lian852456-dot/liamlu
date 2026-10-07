'use strict';
const {test,expect}=require('@playwright/test'),path=require('node:path'),fs=require('node:fs');
const fixture=require('./threec-price-visibility-fixture.cjs');
const PAGE='file://'+path.resolve(__dirname,'../threec-query.html');
async function setup(page,width,shopping=fixture.shopping){
  const errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});
  await page.route(/^https?:/,route=>{
    const url=new URL(route.request().url());if(!url.pathname.startsWith('/macros/s/'))return route.abort();
    let p;try{p=JSON.parse(route.request().postData());}catch{p=JSON.parse(new URLSearchParams(route.request().postData()).get('payload'));}
    calls.push(p);expect(p.action).toBe('threec_snapshot_read');
    const body=p.kind==='shopping'?shopping:fixture.tradein;
    if(url.searchParams.get('transport')==='iframe')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><script>top.postMessage('+JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body}).replace(/</g,'\\u003c')+',"*")</script>'});
    return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(PAGE);await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');return {errors,calls};
}
async function screenshot(page,name){const dir=process.env.VISIBILITY_QA_DIR;if(dir){fs.mkdirSync(dir,{recursive:true});await page.screenshot({path:path.join(dir,name+'.png'),fullPage:true});}}
for(const width of [1440,390,360]){
  test(`${width}px missing conditions disappear, mixed prices align and consumer/enterprise zero survives`,async({page})=>{
    const env=await setup(page,width);await page.locator('#tableModeBtn').click();
    await expect(page.locator('.comparison-table tbody tr')).toHaveCount(3);
    await expect(page.locator('.comparison-table thead th')).toHaveCount(3);
    await expect(page.locator('#shoppingResults')).not.toContainText('未列此條件');await expect(page.locator('#shoppingResults')).not.toContainText('無報價');await expect(page.locator('#shoppingResults')).not.toContainText('全缺價機');
    const headers=await page.locator('.comparison-table thead .raw-condition').allTextContents();
    for(const tr of await page.locator('.comparison-table tbody tr').all()){
      const name=await tr.locator('th strong').textContent(),values=await tr.locator('td').allTextContents();expect(values).toHaveLength(headers.length);
      const expected=name.startsWith('Galaxy')?{[fixture.general]:'0 元'}:{[fixture.iphone]:name.includes('Max')?'31,300 元':'70,300 元'};
      expect(values).toEqual(headers.map(key=>expected[key]||''));
    }
    await page.locator('#shoppingSearch').fill('iphone18');await expect(page.locator('.comparison-table tbody tr')).toHaveCount(2);await expect(page.locator('.comparison-table thead th')).toHaveCount(2);await expect(page.locator('#shoppingSummary')).toContainText('2 組機款報價');
    await screenshot(page,`table-${width}`);
    await page.locator('#shoppingSearch').fill('');await page.locator('#cardModeBtn').click();await page.locator('#shoppingCardCondition').selectOption(fixture.general);
    await expect(page.locator('.quote-card')).toHaveCount(1);await expect(page.locator('.quote-card')).toContainText('Galaxy');await expect(page.locator('.quote.zero')).toHaveCount(1);await expect(page.locator('#shoppingSummary')).toContainText('1 組機款報價');
    await page.locator('#shoppingCardCondition').selectOption(fixture.iphone);await expect(page.locator('.quote-card')).toHaveCount(2);await expect(page.locator('#shoppingSummary')).toContainText('2 組機款報價');await screenshot(page,`card-${width}`);
    await page.locator('#enterpriseSegmentBtn').click();await expect(page.locator('.quote-card')).toHaveCount(1);await expect(page.locator('.quote.zero')).toHaveCount(1);await expect(page.locator('#shoppingSummary')).toContainText('1 組機款報價');
    await screenshot(page,`enterprise-${width}`);
    await page.locator('#shoppingSearch').fill('無此機型');await expect(page.locator('#shoppingResults')).toContainText('沒有符合');await expect(page.locator('#shoppingSummary')).toContainText('0 組');await expect(page.locator('#rowNext')).toBeDisabled();await expect(page.locator('#columnNext')).toBeDisabled();
    await page.locator('#shoppingReset').click();await expect(page.locator('.quote.zero')).toHaveCount(1);
    expect(env.calls).toHaveLength(2);expect(env.errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  });
  test(`${width}px selected card prices determine row counts before pagination and condition change resets page`,async({page})=>{
    const shopping={...fixture.shopping,snapshot:{...fixture.shopping.snapshot,row_count:45,rows:Array.from({length:45},(_,i)=>fixture.row(`卡片機 ${i} 256GB`,{[fixture.general]:i%2?null:0,[fixture.iphone]:1000+i}))}};
    const env=await setup(page,width,shopping);await page.locator('#cardModeBtn').click();await page.locator('#shoppingCardCondition').selectOption(fixture.general);
    await expect(page.locator('#shoppingSummary')).toContainText('23 組機款報價');await expect(page.locator('#rowPage')).toHaveText('1 / 2 頁');await expect(page.locator('.quote-card')).toHaveCount(20);await expect(page.locator('.quote.zero')).toHaveCount(20);
    await page.locator('#rowNext').click();await expect(page.locator('.quote-card')).toHaveCount(3);await expect(page.locator('.quote.zero')).toHaveCount(3);await expect(page.locator('#rowPage')).toHaveText('2 / 2 頁');
    await page.locator('#shoppingCardCondition').selectOption(fixture.iphone);await expect(page.locator('#shoppingSummary')).toContainText('45 組機款報價');await expect(page.locator('#rowPage')).toHaveText('1 / 3 頁');await expect(page.locator('.quote-card')).toHaveCount(20);
    await page.locator('#tableModeBtn').click();await expect(page.locator('#shoppingSummary')).toContainText('45 組機款報價');await expect(page.locator('#rowPage')).toHaveText('1 / 3 頁');
    expect(env.errors).toEqual([]);expect(env.calls).toHaveLength(2);
  });
}
