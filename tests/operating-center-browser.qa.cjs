/* All external requests are intercepted. These fixtures never reach production. */
const test=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const fs=require('node:fs/promises');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const base=process.env.OPERATING_QA_BASE_URL||'http://127.0.0.1:8766';
const out=process.env.OPERATING_QA_OUTPUT||path.resolve(__dirname,'../../output/optimization/screenshots');
const shots=[];
const finalUi=[];
async function shot(page,name){await fs.mkdir(out,{recursive:true});await page.screenshot({path:path.join(out,name+'.png'),fullPage:false});shots.push(name);}
async function context(browser,width){const c=await browser.newContext({viewport:{width,height:width===390?844:900},serviceWorkers:'block'});return c;}

test('actual index UI: unknown, loading, failed, empty, zero, nonzero, reload and return at both widths',async()=>{
 const browser=await chromium.launch({headless:true});
 try{for(const width of [1440,390]){
   const c=await context(browser,width);let response={status:'ok',data:{}};let hold;let externalWrites=0;
   await c.route('**/*',async route=>{
     const r=route.request();if(r.url().startsWith(base+'/'))return route.continue();
     let body;try{body=JSON.parse(r.postData()||'{}');}catch{}
     if(body?.action==='read'){
       if(hold)await hold.promise;
       return route.fulfill({status:response.http||200,contentType:'application/json',body:JSON.stringify(response)});
     }
     if(r.method()!=='GET')externalWrites++;
     return route.abort();
   });
   const page=await c.newPage();await page.goto(base+'/index.html');
   await page.locator('#connBadge').getByText('尚未取得回報',{exact:false}).waitFor();
   assert.doesNotMatch(await page.locator('#marqueeText').innerText(),/A999 為 0|均已開出|尚未開出/);
   const meta=await page.evaluate(()=>({date:today(),stores:STORES}));
   const read=()=>page.evaluate(()=>readReportForDisplay({action:'read',date:today(),seg:16},undefined,GAS_URL));
   let release;hold={promise:new Promise(r=>release=r)};
   let reading=read();await page.locator('#connBadge').getByText('讀取中',{exact:false}).waitFor();
   await shot(page,`index-loading-${width}`);release();await reading;hold=null;
   assert.match(await page.locator('#marqueeText').innerText(),/本時段尚無回報/);
   await shot(page,`index-empty-${width}`);
   response={http:503,status:'error'};await assert.rejects(read());
   assert.match(await page.locator('#connBadge').innerText(),/讀取失敗/);
   assert.doesNotMatch(await page.locator('#marqueeText').innerText(),/A999 為 0/);
   await shot(page,`index-error-${width}`);
   const rows=value=>Object.fromEntries(meta.stores.map((store,i)=>[store,{date:meta.date,seg:16,store,aq999:i===0?value:2}]));
   response={status:'ok',data:rows(0)};await read();
   assert.match(await page.locator('#marqueeText').innerText(),/A999 為 0/);
   await shot(page,`index-zero-${width}`);
   response={status:'ok',data:rows(1)};await read();
   assert.match(await page.locator('#marqueeText').innerText(),/所有門市 A999 均已開出/);
   await page.reload();assert.match(await page.locator('#connBadge').innerText(),/尚未取得/);
   assert.doesNotMatch(await page.locator('#marqueeText').innerText(),/A999 為 0|均已開出/);
   await page.goto(base+'/app.html');await page.goBack();
   assert.match(await page.locator('#connBadge').innerText(),/尚未取得/);
   assert.equal(externalWrites,0,'no production write or authentication call');
   const box=await page.locator('#connBadge').boundingBox();assert.ok(box.height>=44&&box.width>=44);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
   await c.close();
 }}finally{await browser.close();}
});

test('immutable main versus changed UI: comparable desktop and mobile screenshots',async()=>{
 const browser=await chromium.launch({headless:true});
 const files=['app.html','app.css','app.js','index.html','daily-report-summary.css','daily-report-summary-controller.js'];
 const baseline=Object.fromEntries(files.map(file=>[file,execFileSync('git',['show','8468a77fd814a6240d33b611fb9ba7b2c645d9f4:'+file],{cwd:path.join(__dirname,'..'),encoding:'utf8'})]));
 try{for(const width of [1440,390])for(const version of ['before','after']){
   const c=await context(browser,width);
   await c.route('**/*',route=>{
     const url=new URL(route.request().url());if(!url.href.startsWith(base+'/'))return route.abort();
     const file=url.pathname.slice(1);
     if(version==='before'&&baseline[file])return route.fulfill({contentType:file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html',body:baseline[file]});
     return route.continue();
   });
   const page=await c.newPage();
   for(const type of ['app','index']){
     await page.goto(base+'/'+type+'.html');
     await page.locator(type==='app'?'#patrolHome':'#connBadge').waitFor();
     await shot(page,`${type}-${version}-${width===390?'mobile':'desktop'}`);
     if(version==='after')finalUi.push({type,width,result:await page.evaluate(()=>{
       const box=e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height};};
       const msg=document.querySelector('[data-b-message]');
       return {viewport:{width:document.documentElement.clientWidth,height:document.documentElement.clientHeight,scrollWidth:document.documentElement.scrollWidth},
         message:msg?{color:getComputedStyle(msg).color,fontSize:getComputedStyle(msg).fontSize}:null,
         unlock:document.querySelector('#dataMode')?box(document.querySelector('#dataMode')):null,
         settings:document.querySelector('.profile-entry')?box(document.querySelector('.profile-entry')):null,
         connection:document.querySelector('#connBadge')?.innerText,marquee:document.querySelector('#marqueeText')?.innerText,
         patrol:document.querySelector('#patrolHome')?.innerText};
     })});
   }
   await c.close();
 }}finally{await browser.close();}
 await fs.writeFile(path.join(out,'../after-ui.json'),JSON.stringify({utc:new Date().toISOString(),baseCommit:'8468a77fd814a6240d33b611fb9ba7b2c645d9f4',browser:'isolated Chromium on Mac',finalUi},null,2));
});

test('actual App UI: locked patrol, fixture loading/error/empty, visible zero and responsive reading scale',async()=>{
 const browser=await chromium.launch({headless:true});
 try{for(const width of [1440,390]){
   const c=await context(browser,width);let scenario='formal';let external=0;
   await c.route('**/*',async route=>{
     const r=route.request();if(!r.url().startsWith(base+'/')){external++;return route.abort();}
     if(r.url().includes('/app-preview-data.js')&&scenario!=='formal'){
       const source=await fs.readFile(path.join(__dirname,'../app-preview-data.js'),'utf8');
       const status={loading:'stale',error:'error',empty:'no_data',zero:'ok',stale:'stale'}[scenario];
       const note=scenario==='loading'?'巡店資料讀取中':scenario==='error'?'合成讀取失敗':scenario==='stale'?'上次成功資料 · 本次讀取失敗':'';
       const data=scenario==='stale'?{route:['合成門市'],distanceKm:0,completed:0,total:1,nextStop:'—'}:null;
       const injected=`\nwindow.LiamSupervisorPreviewData.patrolToday=window.LiamSupervisorContract.moduleState({status:${JSON.stringify(status)},data:${JSON.stringify(data)},note:${JSON.stringify(note)},source:{label:'隔離合成資料',href:'patrol.html'},updatedAt:'',sourceUpdatedAt:'',stale:${scenario==='stale'}});\nwindow.LiamSupervisorPreviewData.kpiSummary.data.kpi=0;window.LiamSupervisorPreviewData.kpiSummary.data.reportDate='2099-10-11';`;
       return route.fulfill({contentType:'text/javascript',body:source+injected});
     }
     return route.continue();
   });
   const page=await c.newPage();await page.goto(base+'/app.html');
   await page.locator('#patrolHome').getByText('尚未取得資料，請先解鎖班表／巡店。',{exact:true}).waitFor();
   assert.doesNotMatch(await page.locator('#patrolHome').innerText(),/無排定/);
   assert.doesNotMatch(await page.locator('#patrolTodayDetail').innerText(),/無排定/);
   assert.match(await page.locator('#patrolVisitToday').innerText(),/尚未取得/);
   assert.match(await page.locator('#appUpdatedAt').innerText(),/頁面更新/);
   for(const selector of ['#dataMode','.profile-entry','.unlock-cta']){
     const box=await page.locator(selector).first().boundingBox();assert.ok(box.width>=44&&box.height>=44,selector);
   }
   const copy=await page.locator('[data-b-message]').evaluate(e=>({font:getComputedStyle(e).fontSize,color:getComputedStyle(e).color}));
   assert.equal(copy.font,'15px');assert.equal(copy.color,'rgb(195, 210, 227)');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
   await shot(page,`app-formal-locked-${width}`);
   for(scenario of ['loading','error','empty','zero','stale']){
     await page.goto(base+'/app.html?preview=1&qa='+scenario);
     const expected={loading:'讀取中',error:'讀取失敗',empty:'今日尚無巡店紀錄',zero:'今日尚無巡店紀錄',stale:'上次成功資料'}[scenario];
     await page.locator('#patrolHome').getByText(expected,{exact:false}).first().waitFor();
     assert.doesNotMatch(await page.locator('#patrolHome').innerText(),/無排定/);
     await page.locator('#patrolHome').scrollIntoViewIfNeeded();await shot(page,`app-fixture-${scenario}-${width}`);
     if(scenario==='zero'){
       assert.match(await page.locator('#kpiHero').innerText(),/0\.0%/);
       assert.match(await page.locator('#kpiStoreUpdated').innerText(),/資料截止 2099-10-11/);
       assert.equal(await page.locator('.store-metric b').first().evaluate(e=>getComputedStyle(e).fontVariantNumeric),'tabular-nums');
     }
     if(scenario==='stale')assert.match(await page.locator('#patrolTodayDetail').innerText(),/\b0(?:\.0)? KM/);
   }
   assert.equal(external,0,'App fixtures make no production calls');
   await c.close();
 }}finally{await browser.close();}
 await fs.writeFile(path.join(out,'browser-fixture-receipt.json'),JSON.stringify({utc:new Date().toISOString(),base,widths:[1440,390],shots,productionWrites:0,physicalPhone:false},null,2));
});
