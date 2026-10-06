'use strict';
const {test,expect}=require('@playwright/test');
const path=require('node:path');
const fixture=require('./threec-search-fixture.cjs');
const Transport=require('../threec-price-transport.js');
const PAGE='file://'+path.resolve(__dirname,'../threec-query.html');
const fields=['shoppingBrand','shoppingModel','shoppingCapacity','shoppingProject','shoppingVersion','shoppingRent','shoppingTerm'];
function payload(request){try{return JSON.parse(request.postData());}catch{return JSON.parse(new URLSearchParams(request.postData()).get('payload'));}}
async function fulfill(route,body){
 const url=new URL(route.request().url());
 if(url.searchParams.get('transport')==='iframe'){
  const message={type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body};
  return route.fulfill({contentType:'text/html',body:'<!doctype html><meta charset="utf-8"><script>top.postMessage('+JSON.stringify(message).replace(/</g,'\\u003c')+',"*")</script>'});
 }
 return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
}
async function setup(page,width){
 let version=1;const calls=[];const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width,height:900});
 await page.addInitScript(()=>{
  const counts={options:0,buildIndex:0,buildView:0,viewOptOut:[]};window.searchProbe=counts;let current;
  Object.defineProperty(window,'ThreecComparisonCore',{configurable:true,get:()=>current,set(api){current={...api,options(...args){counts.options++;return api.options(...args)},buildIndex(...args){counts.buildIndex++;return api.buildIndex(...args)},buildView(...args){counts.buildView++;counts.viewOptOut.push(args[2]?.includeOptions);return api.buildView(...args)}}}});
 });
 // Block every external URL; only the existing public read endpoint is fulfilled locally.
 await page.route(/^https?:/,async route=>{
  if(!route.request().url().includes('/macros/s/'))return route.abort();
  const p=payload(route.request());calls.push(p);
  if(p.action==='threec_snapshot_read')return fulfill(route,Transport.encode(p.kind==='shopping'?fixture.shopping({version}):fixture.tradein()));
  if(p.action==='threec_changes_read')return fulfill(route,{status:'ok',snapshotHash:p.snapshotHash,changeSet:{kind:p.kind,counts:{added:1,changed:0,unchanged:0,removed:0},addedCount:1,changedCount:0,unchangedCount:0,removedCount:0,offset:p.offset,limit:p.limit,hasMore:false,changeCount:1,totalChangeCount:1,changePage:[{status:'added',model:'異動合成 '+p.search,modelCapacity:'異動合成 '+p.search,condition:'合成條件',after:{kind:'zero',value:'0'}}]}});
  throw new Error('Unexpected action: '+p.action);
 });
 await page.goto(PAGE);await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');
 return {calls,errors,setVersion:n=>version=n};
}
async function selects(page){return page.evaluate(ids=>ids.map(id=>{const el=document.getElementById(id);return {id,value:el.value,html:el.innerHTML}}),fields);}
async function probe(page){return page.evaluate(()=>JSON.parse(JSON.stringify(window.searchProbe)));}
async function inputSequence(page,value){await page.locator('#shoppingSearch').fill('');await page.locator('#shoppingSearch').pressSequentially(value,{delay:10});}
for(const width of [1440,390]){
 test(`${width}px search, delete and Chinese composition preserve selected options and avoid catalog recomputation`,async({page})=>{
  const env=await setup(page,width);if(width<700)await page.locator('.filter-details summary').click();
  await page.locator('#shoppingBrand').selectOption('APPLE');await page.locator('#shoppingModel').selectOption('iPhone 合成機 0');await page.locator('#shoppingCapacity').selectOption('512GB');
  const before=await selects(page),counts=await probe(page),reads=env.calls.length;
  await inputSequence(page,'iPhone');await expect(page.locator('#shoppingResults')).toContainText('iPhone 合成機 0');
  for(let i=0;i<6;i++)await page.locator('#shoppingSearch').press('Backspace');
  await page.locator('#shoppingSearch').evaluate(el=>{
   el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
   for(const value of ['ㄓ','中','中文']){el.value=value;el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',data:value,isComposing:true}));el.dispatchEvent(new CompositionEvent('compositionupdate',{bubbles:true,data:value}));}
   el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'中文'}));el.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:'中文'}));
  });
  await expect(page.locator('#shoppingResults')).toContainText('沒有符合');
  await page.locator('#shoppingSearch').fill('');await expect(page.locator('#shoppingResults')).toContainText('iPhone 合成機 0');
  expect(await selects(page)).toEqual(before);const after=await probe(page);expect(after.options).toBe(counts.options);expect(after.buildIndex).toBe(counts.buildIndex);expect(after.buildView).toBeGreaterThan(counts.buildView);expect(after.viewOptOut.every(v=>v===false)).toBe(true);expect(env.calls).toHaveLength(reads);expect(env.errors).toEqual([]);
  await page.locator('#shoppingReset').click();await inputSequence(page,'中文');await expect(page.locator('#shoppingResults')).toContainText('中文示範機');await page.locator('#shoppingSearch').fill('');await expect(page.locator('#shoppingResults')).toContainText('iPhone 合成機');
 });
 test(`${width}px seven-filter linkage, prices, rows, columns, ordering and enterprise applicability remain intact`,async({page})=>{
  const env=await setup(page,width);if(width<700)await page.locator('.filter-details summary').click();await page.locator('#tableModeBtn').click();
  await expect(page.locator('.comparison-table tbody tr')).toHaveCount(20);await expect(page.locator('#rowPage')).toHaveText('1 / 3 頁');await expect(page.locator('#columnPage')).toHaveText('1 / 2 組');
  const first=await page.locator('.comparison-table tbody th strong').allTextContents();expect(first[0]).toBe('iPhone 合成機 0');
  await page.locator('#rowNext').click();const second=await page.locator('.comparison-table tbody th strong').allTextContents();expect(second[0]).toBe('iPhone 合成機 20');expect(second.some(s=>first.includes(s))).toBe(false);await page.locator('#rowPrev').click();expect(await page.locator('.comparison-table tbody th strong').allTextContents()).toEqual(first);
  await page.locator('#columnNext').click();await expect(page.locator('#columnPage')).toHaveText('2 / 2 組');await inputSequence(page,'iPhone 合成機');await expect(page.locator('#rowPage')).toHaveText('1 / 2 頁');await expect(page.locator('#columnPage')).toHaveText('1 / 2 組');
  await page.locator('#shoppingSearch').fill('');await page.locator('#shoppingBrand').selectOption('APPLE');
  expect(await page.locator('#shoppingModel option').allTextContents()).not.toContain('中文示範機 1');await page.locator('#shoppingModel').selectOption('iPhone 合成機 0');await page.locator('#shoppingCapacity').selectOption('512GB');
  await page.locator('#shoppingProject').selectOption({label:'一般5G-續約'});await page.locator('#shoppingVersion').selectOption('一般');await page.locator('#shoppingRent').selectOption('999');await page.locator('#shoppingTerm').selectOption('24');
  const selected=await selects(page);expect(selected.map(s=>s.value)).toEqual(['APPLE','iPhone 合成機 0','512GB','一般5G-續約','一般','999','24']);await expect(page.locator('.comparison-table tbody td')).toHaveText(['0 元']);
  await inputSequence(page,'iPhone');expect(await selects(page)).toEqual(selected);await expect(page.locator('.comparison-table tbody td')).toHaveText(['0 元']);await page.locator('#shoppingSearch').fill('');
  await page.locator('#enterpriseSegmentBtn').click();await expect(page.locator('#shoppingProject option')).not.toContainText(['Android']);await expect(page.locator('.comparison-table tbody')).not.toContainText('無報價');
  await page.locator('#shoppingRent').selectOption('999');await page.locator('#shoppingTerm').selectOption('24');await expect(page.locator('.comparison-table tbody td')).toHaveText(['10,016 元']);
  const enterprise=await selects(page),count=await probe(page);await inputSequence(page,'iPhone');expect(await selects(page)).toEqual(enterprise);expect((await probe(page)).options).toBe(count.options);await expect(page.locator('.comparison-table tbody td')).toHaveText(['10,016 元']);
  await page.locator('#shoppingReset').click();await expect(page.locator('#shoppingSearch')).toHaveValue('');await expect(page.locator('#shoppingBrand')).toHaveValue('');await expect(page.locator('#shoppingRent')).toHaveValue('');await page.locator('#consumerSegmentBtn').click();await expect(page.locator('#shoppingRent')).toHaveValue('common');expect(env.errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
 test(`${width}px refresh/new synthetic publication builds a fresh index and change search keeps its debounced public route`,async({page})=>{
  const env=await setup(page,width);await inputSequence(page,'iPhone 合成機');await expect(page.locator('#shoppingSummary')).toContainText('22 組');const before=await probe(page);
  env.setVersion(2);await page.locator('#refreshBtn').click();await expect(page.locator('#queryStatus')).toContainText('已讀取正式資料');await expect(page.locator('#shoppingResults')).toContainText('沒有符合');
  expect((await probe(page)).buildIndex).toBe(before.buildIndex+1);await page.locator('#shoppingSearch').fill('新版目錄機');await expect(page.locator('#shoppingResults')).toContainText('新版目錄機');await expect(page.locator('#shoppingResults')).not.toContainText('iPhone 合成機');await expect(page.locator('#shoppingMeta')).toContainText('2026-10-02');
  await page.clock.install();const reads=env.calls.filter(p=>p.action==='threec_changes_read').length;
  for(const value of ['續','續約','續約合約']){await page.locator('#changeSearch').fill(value);await page.clock.runFor(50);}expect(env.calls.filter(p=>p.action==='threec_changes_read')).toHaveLength(reads);
  await page.clock.runFor(249);await expect.poll(()=>env.calls.filter(p=>p.action==='threec_changes_read').length).toBe(reads+1);
  const change=env.calls.filter(p=>p.action==='threec_changes_read').at(-1);expect(change).toMatchObject({kind:'shopping',search:'續約合約',snapshotHash:'synthetic-search-2',offset:0,limit:100});expect(change.employeeId).toBeUndefined();await expect(page.locator('#changeResults')).toContainText('續約合約');expect(env.errors).toEqual([]);
 });
}
