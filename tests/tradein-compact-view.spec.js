'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const configs=[
 {name:'internal',file:'tradein-query.html',target:'#tradeinResults',brand:'#tradeinBrand',model:'#tradeinModel',provider:'#tradeinProvider',grade:'#tradeinGrade',keyword:'#tradeinSearch'},
 {name:'share',file:'tradein-price-share.html',target:'#results',brand:'#brand',model:'#model',provider:'#provider',grade:'#grade',keyword:'#keyword'}
].filter(config=>fs.existsSync(path.join(root,config.file))&&fs.readFileSync(path.join(root,config.file),'utf8').includes('tradein-compact-view.js'));
function response(kind){return {status:'ok',changesDeferred:true,snapshot:{kind,snapshot_hash:'compact-synthetic-v1',source_version_date:'2026-10-01',published_at:'2026-10-01T10:00:00+08:00',row_count:kind==='shopping'?0:2,rows:kind==='shopping'?[]:[
 {brand:'Apple',source_sheet:'價格設定',model:'Apple iPad Air M2(11吋)_128GB(5G)',quotes:{'點子行動':{S:'',A:'5,700',B:'4,560',C:'1,140'},'FutureDial（FDI）':{S:'5,700',A:'4,900',B:'1,500',C:'700'}}},
 {brand:'Samsung',source_sheet:'價格設定',model:'Galaxy S25 512GB',quotes:{'愛鋒派':{S:0,A:'8,000',B:'',C:null,'未分級':'100,000'}}}
]}};}
async function mock(page){
 const calls=[];let failed=false;
 await page.route('https://**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(!url.pathname.endsWith('/exec'))return route.abort();
  const raw=request.postData()||'{}';const payload=raw.startsWith('{')?JSON.parse(raw):JSON.parse(new URLSearchParams(raw).get('payload')||'{}');calls.push(payload);
  const body=failed?{status:'error',message:'合成測試：拒絕讀取'}:response(payload.kind);
  if(url.searchParams.get('transport')==='iframe'){
   const msg=JSON.stringify({type:'north12b-gas-response-v1',requestId:url.searchParams.get('requestId'),body}).replace(/</g,'\\u003c');
   return route.fulfill({contentType:'text/html',body:'<script>window.top.postMessage('+msg+',"*")</script>'});
  }
  return route.fulfill({contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
 });
 return {calls,fail:()=>{failed=true;}};
}
test('compact source is presentation-only and at least one updated page is included',()=>{
 expect(configs.length).toBeGreaterThan(0);
 const source=fs.readFileSync(path.join(root,'tradein-compact-view.js'),'utf8');
 expect(source).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|employeeId|deviceId|adminSecret|innerHTML\s*=/);
});
for(const config of configs){
 for(const width of [320,390,1280]){
  test(`${config.name} ${width}px same item once with aligned provider rows`,async({page},testInfo)=>{
   const errors=[];page.on('pageerror',error=>errors.push(error.message));
   const api=await mock(page);await page.setViewportSize({width,height:900});
   await page.goto('file://'+path.join(root,config.file));
   const target=page.locator(config.target);await expect(target.locator('.tc-item')).toHaveCount(2);
   await page.locator(config.brand).selectOption('Apple');
   await expect(target.locator('.tc-item')).toHaveCount(1);
   await expect(target.locator('h3')).toHaveText('Apple iPad Air M2(11吋)_128GB(5G)');
   await expect(target.locator('.tc-repeat-model:visible')).toHaveCount(0);
   await expect(target.locator('.tc-grade-head')).toHaveCount(1);
   expect(await target.locator('.tc-number').allTextContents()).toEqual(['5,700','4,560','1,140','5,700','4,900','1,500','700']);
   const a=target.locator('.tc-cell[data-grade="A"]');
   const first=await a.nth(0).boundingBox(),second=await a.nth(1).boundingBox();
   expect(Math.abs(first.x-second.x)).toBeLessThan(1);
   await expect(target.locator('.tc-missing[data-grade="S"]')).toHaveText('－');
   const dimensions=await page.evaluate(()=>({root:document.documentElement.scrollWidth,inner:innerWidth}));expect(dimensions.root).toBeLessThanOrEqual(dimensions.inner);
   const itemHeight=(await target.locator('.tc-item').boundingBox()).height;expect(itemHeight).toBeLessThan(260);
   expect(await target.locator('.tc-number').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
   const requests=api.calls.length;await page.locator(config.grade).selectOption('A');
   await expect(target.locator('.tc-heading-grade')).toHaveText(['A級']);
   await page.locator(config.provider).selectOption('FutureDial（FDI）');await expect(target.locator('.tc-provider-row')).toHaveCount(1);
   await expect(target.locator('.tc-number')).toHaveText('4,900');expect(api.calls.length).toBe(requests);
   await page.locator(config.grade).selectOption('');await page.locator(config.provider).selectOption('');
   await expect(target.locator('.tc-grade-head')).toHaveCount(1);
   await target.screenshot({path:testInfo.outputPath('compact-'+config.name+'-'+width+'.png')});
   if(config.name==='share')expect(api.calls.every(call=>call.action==='threec_snapshot_read'&&call.kind==='tradein')).toBe(true);
   expect(errors).toEqual([]);
  });
 }
 test(`${config.name} zero and ungraded stay distinct, re-render and failure do not retain old results`,async({page})=>{
  const api=await mock(page);await page.setViewportSize({width:320,height:900});await page.goto('file://'+path.join(root,config.file));
  const target=page.locator(config.target);await expect(target.locator('.tc-item')).toHaveCount(2);
  await page.locator(config.brand).selectOption('Samsung');await expect(target.locator('.tc-number').first()).toHaveText('0');
  await expect(target.locator('.tc-heading-grade')).toHaveText(['S級','A級','未分級']);await expect(target.locator('.tc-number').last()).toHaveText('100,000');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(let i=0;i<4;i++){await page.locator(config.keyword).fill(i%2?'':'Galaxy');await expect(target.locator('.tc-grade-head')).toHaveCount(1);}
  api.fail();await page.locator('#refreshBtn').click();await expect(page.locator('#queryStatus')).toContainText('失敗');await expect(target.locator('.tc-item')).toHaveCount(0);await expect(target).not.toContainText('100,000');
 });
}
