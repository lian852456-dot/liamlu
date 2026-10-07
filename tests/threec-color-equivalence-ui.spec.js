'use strict';
const {test,expect}=require('@playwright/test'),path=require('node:path');
const Compare=require('../threec-comparison-core.js'),Core=require('../threec-query-core.js');
const formal=require('./fixtures/threec-color-equivalence-formal.json'),dense=require('./threec-compact-layout-fixture.cjs');
const PAGE='file://'+path.resolve(__dirname,'../threec-query.html'),c0=dense.consumer[0],c1=dense.consumer[1],ent=dense.enterprise;
const originals=formal.snapshot.rows.slice(0,5),names=originals.map(r=>r.model);
function source(sheet,models,prices,retail=32900){return models.map((model,i)=>({...originals[0],source_sheet:sheet,code:'SYNTHETIC-'+sheet+'-'+i,model,retail_price:retail,project_prices:{...prices}}));}
function scenario(rows){return JSON.parse(JSON.stringify({status:'ok',changesDeferred:true,snapshot:{kind:'shopping',source_version_date:'2026-10-07',snapshot_hash:'synthetic-color-equivalence',rows,row_count:rows.length}}));}
const cases=[
 ['same sets with numeric formatting',()=>scenario([...source('A',names,{[c0]:1000,[ent]:0}),...source('B',[...names].reverse(),{[c0]:'1,000',[ent]:' 0 '},'32,900')]),false],
 ['same sets with disjoint condition availability',()=>scenario([...source('A',names,{[c0]:0,[ent]:0}),...source('B',names,{[c1]:1000,[dense.enterpriseLong]:0})]),false],
 ['same sets with genuine cross-source amount differences',()=>scenario([...source('A',names,{[c0]:0,[ent]:0}),...source('B',names,{[c0]:10,[ent]:20})]),true],
 ['different original color sets at equal amounts',()=>scenario([...source('A',names.slice(0,3),{[c0]:1000,[ent]:0}),...source('B',names.slice(3),{[c0]:1000,[ent]:0})]),true],
 ['nonadjacent conflicting condition including zero',()=>scenario([...source('A',names,{[c0]:0,[ent]:0}),...source('B',names,{[c1]:1234,[ent]:0}),...source('C',names,{[c0]:1,[ent]:1})]),true],
 ['missing values and all-missing variants do not create zero conflicts',()=>scenario([...source('A',names,{[c0]:0,[ent]:0}),...source('B',names,{[c0]:' ',[c1]:1000,[ent]:null},''),...source('C',['iPhone missing color'],{[c0]:null,[ent]:undefined},0)]),false],
 ['valid zero retail versus another amount',()=>scenario([...source('A',names,{[c0]:0,[ent]:0},0),...source('B',names,{[c0]:0,[ent]:0},100)]),true],
];
async function setup(page,width,shopping){
 const errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});
 await page.addInitScript(()=>{let api;window.cacheStats={index:0,options:0};Object.defineProperty(window,'ThreecComparisonCore',{configurable:true,get:()=>api,set(value){api={...value,buildIndex(...args){cacheStats.index++;const index=value.buildIndex(...args);window.testIndex=index;return index;},options(...args){cacheStats.options++;return value.options(...args);}};}});});
 await page.route(/^https?:/,route=>{const url=new URL(route.request().url());if(!url.pathname.startsWith('/macros/s/'))return route.abort();let p;try{p=JSON.parse(route.request().postData());}catch{p=JSON.parse(new URLSearchParams(route.request().postData()).get('payload'));}calls.push(p);expect(p.action).toBe('threec_snapshot_read');const body=p.kind==='shopping'?shopping:dense.tradein;return url.searchParams.get('transport')==='iframe'?route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><script>top.postMessage('+JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body}).replace(/</g,'\\u003c')+',"*")</script>'}):route.fulfill({contentType:'application/json',body:JSON.stringify(body)});});
 await page.goto(PAGE);await expect(page.locator('#queryStatus')).toContainText('已讀取');return {errors,calls};
}
async function verify(page,shopping,segment,split){
 await page.locator(segment==='enterprise'?'#enterpriseSegmentBtn':'#consumerSegmentBtn').click();await page.locator('#shoppingReset').click();await page.locator('#tableModeBtn').click();
 const filters={segment,rent:segment==='enterprise'?'':'common'},index=Compare.buildIndex(shopping.snapshot),view=Compare.buildView(index,filters,{includeOptions:false});
 await expect(page.locator('.comparison-table tbody tr')).toHaveCount(view.rows.length);expect(await page.locator('.comparison-table thead .raw-condition').allTextContents()).toEqual(view.columns.map(c=>c.key));
 const trs=page.locator('.comparison-table tbody tr');for(let i=0;i<view.rows.length;i++){expect(await trs.nth(i).locator('td').allTextContents()).toEqual(view.columns.map(c=>Compare.hasQuote(view.rows[i],c)?Core.formatPrice(view.rows[i].prices[c.key]):''));for(const model of view.rows[i].models)await expect(trs.nth(i).locator('.spec-cell details')).toContainText(model);}
 await expect(page.locator('.comparison-table tbody .variant-label')).toHaveCount(split?view.rows.length:0);await expect(page.locator('#shoppingSummary')).toContainText(view.totalRows+' 組機款報價');
 expect(await page.evaluate(()=>JSON.stringify(testIndex))).toBe(JSON.stringify(index));
 await page.locator('#cardModeBtn').click();const key=await page.locator('#shoppingCardCondition').inputValue(),cards=Compare.buildView(index,filters,{includeOptions:false,cardConditionKey:key});
 await expect(page.locator('.quote-card')).toHaveCount(cards.rows.length);await expect(page.locator('.quote-card .variant-label')).toHaveCount(split?cards.rows.length:0);expect(await page.locator('.quote-card .quote').allTextContents()).toEqual(cards.rows.map(r=>Core.formatPrice(r.prices[key])));
 await expect(page.locator('#shoppingResults')).not.toContainText('顏色同價');expect(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)).toBe(0);
}
for(const width of [1280,390]){
 test(`${width}px original formal 12-source five-color fixture hides redundant lines without losing quotes`,async({page})=>{const shopping=structuredClone(formal),before=JSON.stringify(shopping),env=await setup(page,width,shopping);expect(Compare.buildIndex(shopping.snapshot).rows).toHaveLength(12);await verify(page,shopping,'consumer',false);await verify(page,shopping,'enterprise',false);expect(JSON.stringify(shopping)).toBe(before);expect(env.errors).toEqual([]);expect(env.calls).toHaveLength(2);});
 for(const [name,make,split]of cases)test(`${width}px ${name}`,async({page})=>{const shopping=make(),env=await setup(page,width,shopping);await verify(page,shopping,'consumer',split);await verify(page,shopping,'enterprise',split);expect(env.errors).toEqual([]);expect(env.calls).toHaveLength(2);});
 test(`${width}px refresh from genuine conflict back to equivalent sources resets labels and search cache`,async({page})=>{const shopping=cases[2][1](),env=await setup(page,width,shopping);await verify(page,shopping,'consumer',true);shopping.snapshot.rows=cases[0][1]().snapshot.rows;shopping.snapshot.row_count=shopping.snapshot.rows.length;await page.locator('#refreshBtn').click();await expect(page.locator('.quote-card .variant-label')).toHaveCount(0);await verify(page,shopping,'consumer',false);const before=await page.evaluate(()=>({...cacheStats}));await page.evaluate(()=>{const el=document.querySelector('#shoppingSearch');for(let i=0;i<101;i++){el.value=i%2?'iphone17':'iPhone  17';el.dispatchEvent(new Event('input',{bubbles:true}));}});expect(await page.evaluate(()=>cacheStats)).toEqual(before);expect(before.index).toBe(2);expect(env.errors).toEqual([]);expect(env.calls).toHaveLength(4);});
}
