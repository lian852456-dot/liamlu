'use strict';
const {test,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),BASE=process.env.TEST_BASE_URL;
const plan='5G_XH(24)-續約／999H',other='5G_XH(48)-續約／1399H';
const trade=color=>({source_sheet:'合成回收表',brand:'APPLE',model:'APPLE 合成手機_128G-('+color+')(5G)',quotes:{'點子行動':{S:null,A:1000,B:800,C:0},'FutureDial（FDI）':{S:1100,A:900,B:400,C:null},'愛鋒派':{S:null,A:null,B:null,C:null,'未分級':null}}});
function tradeRows(){const rows=['午夜','星光','紅','藍','紅','紅','紅','紅'].map(trade);rows[3].quotes['FutureDial（FDI）'].A=901;rows[4].model=rows[4].model.replace('128G','256G');rows[5].model=rows[5].model.replace('(5G)','(4G)');rows[6].model=rows[6].model.replace('128G','8G/128G');rows[7].model+=' +鍵盤甲';return rows;}
const phone=color=>({source_sheet:'合成手機方案',brand:'APPLE',code:'SYNTHETIC-'+color,model:'APPLE 合成手機_128G-('+color+')(5G)',colorless_model:'APPLE 合成手機_128G-('+color+')(5G)',retail_price:29900,project_prices:{[plan]:0,[other]:1000}});
function phoneRows(){const rows=['午夜','星光','紅','藍','紅','紅'].map(phone);rows[3].project_prices[other]=1001;rows[4].model=rows[4].model.replace('128G','256G');rows[4].colorless_model=rows[4].model;rows[5].model=rows[5].model.replace('(5G)','(4G)');rows[5].colorless_model=rows[5].model;return rows;}
const hasHelper=file=>fs.existsSync(path.join(root,file))&&fs.readFileSync(path.join(root,file),'utf8').includes('price-model-view.js');
const entries=[
 {name:'internal',file:'tradein-query.html',target:'#tradeinResults',keyword:'#tradeinSearch',model:'#tradeinModel',provider:'#tradeinProvider',grade:'#tradeinGrade'},
 {name:'share',file:'tradein-price-share.html',target:'#results',keyword:'#keyword',model:'#model',provider:'#provider',grade:'#grade'}
].filter(entry=>hasHelper(entry.file));
async function mock(page){
 const calls=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin===new URL(BASE).origin)return route.continue();
  if(url.hostname!=='script.google.com')return route.abort();
  const raw=route.request().postData();let payload;try{payload=JSON.parse(raw);}catch{payload=JSON.parse(new URLSearchParams(raw).get('payload'));}
  calls.push(payload);const rows=payload.kind==='shopping'?phoneRows():tradeRows();
  const body={status:'ok',changesDeferred:true,snapshot:{kind:payload.kind,source_version_date:'2026-10-01',snapshot_hash:'SYNTHETIC_COLOR_MATRIX',rows,row_count:rows.length}};
  if(url.searchParams.get('transport')==='iframe'){
   const message=JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body}).replace(/</g,'\\u003c');
   return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><script>top.postMessage('+message+',"*")</script>'});
  }
  return route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });return {calls,errors};
}
for(const entry of entries)for(const width of [390,1280])test(entry.name+' '+width+'px merges equal colors, searches every color and retains hidden quote conflicts',async({page},info)=>{
 const {calls,errors}=await mock(page);await page.setViewportSize({width,height:900});await page.goto(BASE+entry.file);
 const target=page.locator(entry.target);await expect(target.locator('.tc-item')).toHaveCount(6);const reads=calls.length;
 await expect(target.locator('.tc-item h3').first()).toContainText('合成手機_128G(5G)');await expect(target.locator('.tc-item').first().locator('.tc-source')).toContainText('午夜');await expect(target.locator('.tc-item').first().locator('.tc-source')).toContainText('星光');await expect(target.locator('.tc-item').first().locator('.tc-source')).toContainText('紅');
 await page.locator(entry.keyword).fill('藍');await expect(target.locator('.tc-item')).toHaveCount(1);await expect(target.locator('.price-variant')).toContainText('藍');await expect(target.locator('.tc-number')).toContainText(['1,000','800','0','1,100','901','400']);
 await page.locator(entry.keyword).fill('');
 const option=page.locator(entry.model+' option').filter({hasText:'合成手機_128G(5G)'}).first();await page.locator(entry.model).selectOption(await option.getAttribute('value'));
 await expect(target.locator('.tc-item')).toHaveCount(2);await expect(target.locator('.price-variant')).toHaveCount(2);
 await page.locator(entry.provider).selectOption('點子行動');await page.locator(entry.grade).selectOption('A');await expect(target.locator('.tc-number')).toHaveText(['1,000','1,000']);
 await page.locator(entry.provider).selectOption('FutureDial（FDI）');await expect(target.locator('.tc-number')).toHaveText(['900','901']);
 for(const color of ['午夜','星光','紅']){await page.locator(entry.keyword).fill(color);await expect(target.locator('.tc-item')).toHaveCount(1);await expect(target.locator('.tc-number')).toHaveText('900');}
 await page.locator(entry.keyword).fill('');await page.locator(entry.model).selectOption('');await page.locator(entry.provider).selectOption('');await page.locator(entry.grade).selectOption('');
 await expect(target.locator('.tc-item')).toHaveCount(6);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await target.screenshot({path:info.outputPath('SYNTHETIC-colors-'+entry.name+'-'+width+'.png')});
 expect(calls.length).toBe(reads);expect(calls.every(p=>p.action==='threec_snapshot_read'&&p.includeChanges===false)).toBe(true);expect(errors).toEqual([]);
});
if(hasHelper('threec-query.html'))for(const width of [390,1280])test('phone '+width+'px equal colors share one table row and card while plan differences remain exact',async({page},info)=>{
 const {calls,errors}=await mock(page);await page.setViewportSize({width,height:900});await page.goto(BASE+'threec-query.html');
 await expect(page.locator('#queryStatus')).toContainText('已讀取');await page.locator('#tableModeBtn').click();
 await expect(page.locator('.comparison-table tbody tr')).toHaveCount(4);const reads=calls.length;
 await page.locator('#shoppingCapacity').selectOption('128GB');
 await page.locator('#shoppingModel').selectOption({label:'APPLE 合成手機 (5G)'});
 await expect(page.locator('.comparison-table tbody tr')).toHaveCount(2);await expect(page.locator('.comparison-table tbody .variant-label')).toHaveCount(2);
 await expect(page.locator('.comparison-table tbody tr').first().locator('details')).toContainText('午夜');await expect(page.locator('.comparison-table tbody tr').first().locator('details')).toContainText('星光');await expect(page.locator('.comparison-table tbody tr').first().locator('details')).toContainText('紅');
 await page.locator('#cardModeBtn').click();await page.locator('#shoppingCardCondition').selectOption(other);
 await expect(page.locator('.quote-card')).toHaveCount(2);await expect(page.locator('.quote-card .quote')).toHaveText(['1,000 元','1,001 元']);
 for(const color of ['午夜','星光','紅']){await page.locator('#shoppingSearch').fill(color);await expect(page.locator('.quote-card')).toHaveCount(1);await expect(page.locator('.quote-card .quote')).toHaveText('1,000 元');}
 await page.locator('#shoppingSearch').fill('');await expect(page.locator('.quote-card')).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('#shoppingResults').screenshot({path:info.outputPath('SYNTHETIC-colors-phone-'+width+'.png')});
 expect(calls.length).toBe(reads);expect(calls.every(p=>p.action==='threec_snapshot_read'&&p.includeChanges===false)).toBe(true);expect(errors).toEqual([]);
});
