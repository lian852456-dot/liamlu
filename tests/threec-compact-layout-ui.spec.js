'use strict';
const {test,expect}=require('@playwright/test'),path=require('node:path');
const fixture=require('./threec-compact-layout-fixture.cjs');
const PAGE='file://'+path.resolve(__dirname,'../threec-query.html');
async function setup(page,width,shopping=fixture.shopping){
 const calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});
 await page.addInitScript(()=>{let api;window.optionCalls=0;Object.defineProperty(window,'ThreecComparisonCore',{configurable:true,get:()=>api,set(value){api={...value,options(...args){window.optionCalls++;return value.options(...args);}};}});});
 await page.route(/^https?:/,route=>{
  const url=new URL(route.request().url());if(!url.pathname.startsWith('/macros/s/'))return route.abort();
  let p;try{p=JSON.parse(route.request().postData());}catch{p=JSON.parse(new URLSearchParams(route.request().postData()).get('payload'));}
  calls.push(p);expect(p.action).toBe('threec_snapshot_read');const body=p.kind==='shopping'?shopping:fixture.tradein;
  if(url.searchParams.get('transport')==='iframe')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><script>top.postMessage('+JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body}).replace(/</g,'\\u003c')+',"*")</script>'});
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(PAGE);await expect(page.locator('#queryStatus')).toContainText('已讀取');await expect(page.locator('#shoppingSummary')).toContainText('組機款報價');return {calls,errors};
}
async function fit(page){return page.evaluate(()=>{
 const region=document.querySelector('.comparison-scroll');
 const overflow=[...region.querySelectorAll('td .quote')].filter(q=>{const range=document.createRange();range.selectNodeContents(q.querySelector('.price-value'));const lines=new Set([...range.getClientRects()].filter(r=>r.width&&r.height).map(r=>Math.round(r.top)));return lines.size!==1||q.scrollWidth>q.clientWidth+1||range.getBoundingClientRect().right>q.closest('td').getBoundingClientRect().right-1;});
 return {x:region.scrollWidth-region.clientWidth,y:region.scrollHeight-region.clientHeight,body:document.documentElement.scrollWidth-innerWidth,priceOverflow:overflow.length};
});}
for(const width of [1280,1366,1440,1920,1279,1024,390,360])test(`${width}px dense matrix keeps all prices aligned, source details and useful scrolling`,async({page})=>{
 const env=await setup(page,width);expect(await page.evaluate(()=>optionCalls)).toBe(1);await page.locator('#tableModeBtn').click();
 await expect(page.locator('.comparison-table tbody tr')).toHaveCount(20);await expect(page.locator('.comparison-table thead th')).toHaveCount(13);
 await expect(page.locator('#shoppingResults')).not.toContainText('顏色同價');await expect(page.locator('#shoppingSummary')).not.toContainText('同價顏色');
 await expect(page.locator('.spec-cell>.variant-label')).toHaveCount(0);
 const align=await page.evaluate(()=>({spec:getComputedStyle(document.querySelector('.spec-cell')).textAlign,head:getComputedStyle(document.querySelector('thead th:not(.spec-cell)')).textAlign,price:getComputedStyle(document.querySelector('td')).textAlign}));expect(align).toEqual({spec:'left',head:'center',price:'center'});
 const layout=await fit(page);expect(layout.body).toBe(0);expect(layout.priceOverflow).toBe(0);
 if(width>=1280){expect(layout.x).toBe(0);expect(layout.y).toBe(0);await expect(page.locator('.comparison-table')).toContainText('專案價單位：元');
  const top=await page.locator('.comparison-scroll').evaluate(el=>el.getBoundingClientRect().top+scrollY);await page.evaluate(y=>scrollTo(0,y+180),top);expect((await page.locator('.comparison-table thead th').last().boundingBox()).y).toBeCloseTo(0,0);
 }else{const region=page.locator('.comparison-scroll'),before=await page.locator('.comparison-table tbody .spec-cell').first().boundingBox();await region.evaluate(el=>el.scrollLeft=400);const after=await page.locator('.comparison-table tbody .spec-cell').first().boundingBox();expect(Math.abs(before.x-after.x)).toBeLessThan(2);if(width>700)expect(layout.y).toBe(0);}
 // Row data remains keyed to each complete condition, including large and zero amounts.
 const heads=await page.locator('.comparison-table thead .raw-condition').allTextContents();const values=await page.locator('.comparison-table tbody tr').first().locator('td').allTextContents();expect(values).toEqual(heads.map(k=>fixture.shopping.snapshot.rows[0].project_prices[k].toLocaleString('en-US')+' 元'));
 await page.locator('.comparison-table tbody .spec-cell details').first().click();await expect(page.locator('.comparison-table tbody .spec-cell details').first()).toContainText('黑色');await expect(page.locator('.comparison-table tbody .spec-cell details').first()).toContainText('白色');
 await page.locator('#rowNext').click();await expect(page.locator('.comparison-table tbody tr')).toHaveCount(4);await page.locator('#columnNext').click();await expect(page.locator('#rowPage')).toHaveText('1 / 2 頁');await expect(page.locator('.comparison-table thead th')).toHaveCount(5);
 const count=await page.evaluate(()=>optionCalls);for(const q of ['iphone合成機0','iPhone 合成機 0']){await page.locator('#shoppingSearch').fill(q);await expect(page.locator('.comparison-table tbody tr')).toHaveCount(1);}expect(await page.evaluate(()=>optionCalls)).toBe(count);
 await page.locator('#enterpriseSegmentBtn').click();await page.locator('#shoppingSearch').fill('');await expect(page.locator('.comparison-table .quote.zero')).toHaveCount(20);
 const details=page.locator('.comparison-table thead details').filter({hasText:fixture.enterpriseLong});await details.locator('summary').click();await expect(details.locator('.raw-condition')).toBeVisible();expect((await fit(page)).body).toBe(0);
 await page.locator('#cardModeBtn').click();await expect(page.locator('.quote-card')).toHaveCount(20);await expect(page.locator('.quote-card .quote.zero')).toHaveCount(20);expect(await page.locator('.quote-card .quote').first().evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(28);
 await page.locator('#shoppingSearch').fill('找不到');await expect(page.locator('#shoppingResults')).toContainText('沒有符合');await expect(page.locator('#rowNext')).toBeDisabled();await page.locator('#shoppingReset').click();await expect(page.locator('.quote-card')).toHaveCount(20);
 expect(env.errors).toEqual([]);expect(env.calls).toHaveLength(2);expect(env.calls.every(p=>!p.employeeId&&!p.adminSecret&&!p.deviceId)).toBe(true);
});
for(const width of [1280,390])test(`${width}px price-affecting colors remain identifiable while equal-price color counts disappear`,async({page})=>{
 const shopping=JSON.parse(JSON.stringify(fixture.shopping));shopping.snapshot.rows=shopping.snapshot.rows.slice(0,3);shopping.snapshot.row_count=3;
 const env=await setup(page,width,shopping);await page.locator('#tableModeBtn').click();
 await expect(page.locator('.comparison-table tbody tr')).toHaveCount(1);await expect(page.locator('.variant-label')).toHaveCount(0);
 // An all-missing color must not turn the single priced spec into a split-price spec.
 const missing={...shopping.snapshot.rows[0],model:'iPhone 合成機 0 256GB 未知色',project_prices:{}};shopping.snapshot.rows.push(missing);
 await page.locator('#refreshBtn').click();await expect(page.locator('.comparison-table tbody tr')).toHaveCount(1);await expect(page.locator('.variant-label')).toHaveCount(0);
 shopping.snapshot.rows[1].project_prices[fixture.consumer[0]]=200099;shopping.snapshot.rows[1].model='iPhone 合成機 0 256GB 鈦原色';
 shopping.snapshot.rows[2].project_prices[fixture.consumer[0]]=200199;shopping.snapshot.rows[2].model='iPhone 合成機 0 256GB 特製琥珀';
 await page.locator('#refreshBtn').click();await expect(page.locator('.comparison-table tbody tr')).toHaveCount(3);
 const labels=await page.locator('.variant-label').allTextContents();expect(labels.some(s=>s.includes('黑色'))).toBe(true);expect(labels.some(s=>s.includes('鈦原色'))).toBe(true);expect(labels.some(s=>s.includes('特製琥珀'))).toBe(true);
 await expect(page.locator('#shoppingResults')).not.toContainText('顏色同價');await expect(page.locator('#shoppingResults')).not.toContainText('款顏色');
 const heads=await page.locator('.comparison-table thead .raw-condition').allTextContents(),column=heads.indexOf(fixture.consumer[0]);expect(column).toBeGreaterThanOrEqual(0);
 expect(await page.locator('.comparison-table tbody tr').evaluateAll((rows,j)=>rows.map(row=>row.querySelectorAll('td')[j].textContent),column)).toEqual(['199,999 元','200,099 元','200,199 元']);
 await page.locator('#cardModeBtn').click();await page.locator('#shoppingCardCondition').selectOption(fixture.consumer[0]);await expect(page.locator('.quote-card')).toHaveCount(3);await expect(page.locator('.quote-card .variant-label')).toHaveCount(3);
 await page.locator('.quote-card .spec-cell details').first().click();await expect(page.locator('.quote-card .spec-cell details').first()).toContainText('黑色');expect(env.errors).toEqual([]);
});
