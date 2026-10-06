const {test,expect}=require('@playwright/test');
const {install}=require('./fixtures/daily-report-summary-synthetic.cjs');
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8875/';
test.beforeEach(async({page})=>{
 page.__errors=[];page.__external=[];
 page.on('pageerror',e=>page.__errors.push(e.message));
 page.on('request',r=>{if(!r.url().startsWith(base))page.__external.push(new URL(r.url()).hostname);});
 await page.route('**/*',r=>r.request().url().startsWith(base)?r.continue():r.abort());
 await page.addInitScript(install);await page.goto(base+'index.html',{waitUntil:'load'});
});
test.afterEach(async({page})=>{expect(page.__errors).toEqual([]);expect(page.__external).toEqual([]);});
const summary=page=>page.locator('.tab-btn').filter({hasText:'彙整大盤'}).click();
test('cold fill does not preload hidden data; summary reads only its selected segment, filters do not read',async({page})=>{
 expect(await page.evaluate(()=>__summaryCalls.length)).toBe(0);
 await page.evaluate(()=>dispatchEvent(new Event('portal-login-changed')));
 expect(await page.evaluate(()=>__summaryCalls.length)).toBe(0);
 await summary(page);await expect(page.locator('#sumCoverage')).toHaveText('已回報 7 / 9 店');
 expect(await page.evaluate(()=>__summaryCalls.map(x=>x.seg))).toEqual([16]);
 await page.locator('#sumStore').selectOption('酒泉');await page.locator('[data-summary-group="insurance"]').click();
 expect(await page.evaluate(()=>__summaryCalls.length)).toBe(1);
});
test('fill and summary share a pending formal read, never shadow projection or a completed cache',async({page})=>{
 await page.evaluate(()=>{__holdRead=true;localStorage.setItem(shadowKey('2099-10-02',16),JSON.stringify({酒泉:{date:'2099-10-02',store:'酒泉',seg:16,aq999:9000}}));});
 await page.locator('.store-card[data-store="酒泉"]').click();await page.waitForFunction(()=>__heldReads.length===1);
 await summary(page);await page.waitForTimeout(30);expect(await page.evaluate(()=>__heldReads.length)).toBe(1);
 await page.evaluate(()=>__heldReads[0].release());await expect(page.locator('#sumCoverage')).toHaveText('已回報 7 / 9 店');
 await expect(page.locator('[data-summary-total="aq999"]')).not.toHaveText('9,000');
 await page.locator('.tab-btn').first().click();await summary(page);await page.waitForFunction(()=>__heldReads.length===2);
 await page.evaluate(()=>__heldReads[1].release());await expect(page.locator('#sumCoverage')).toHaveText('已回報 7 / 9 店');
});
test('hide/reopen and auth transition cannot join or display abandoned ABA responses',async({page})=>{
 await page.evaluate(()=>{__holdRead=true;__readMode='error';});await summary(page);await page.waitForFunction(()=>__heldReads.length===1);
 await page.locator('.tab-btn').first().click();await page.evaluate(()=>__readMode='ok');await summary(page);await page.waitForFunction(()=>__heldReads.length===2);
 await page.evaluate(()=>__heldReads[0].release());await expect(page.locator('#summaryCards')).toContainText('正在讀取');
 await page.evaluate(()=>dispatchEvent(new Event('portal-login-changed')));await page.waitForFunction(()=>__heldReads.length===3);
 await page.evaluate(()=>__heldReads[1].release());await expect(page.locator('#summaryCards')).toContainText('正在讀取');
 await page.evaluate(()=>__heldReads[2].release());await expect(page.locator('#sumCoverage')).toHaveText('已回報 7 / 9 店');
});
test('summary timeout is manual-only; late completion cannot revive values and retry is fresh',async({page})=>{
 await page.clock.install({time:new Date('2099-10-02T07:00:00Z')});await page.evaluate(()=>__holdRead=true);await summary(page);await page.waitForFunction(()=>__heldReads.length===1);
 await page.clock.fastForward(30001);await expect(page.locator('#summaryCards')).toContainText('讀取超過 30 秒');
 expect(await page.evaluate(()=>__summaryCalls.length)).toBe(1);await expect(page.locator('[data-summary-total]')).toHaveCount(0);
 await page.evaluate(()=>__heldReads[0].release());await expect(page.locator('#summaryCards')).toContainText('讀取超過 30 秒');
 await page.locator('.sum-toolbar [data-summary-retry]').click();await page.waitForFunction(()=>__heldReads.length===2);
 await page.evaluate(()=>__heldReads[1].release());await expect(page.locator('#sumCoverage')).toHaveText('已回報 7 / 9 店');
});
test('fill timeout stays disabled; retry restores only its own draft and logout clears the auth context',async({page})=>{
 await page.locator('.store-card[data-store="酒泉"]').click();await expect(page.locator('.btn-save-main')).toBeEnabled();await page.locator('#f_aq999').fill('55');
 await page.clock.install({time:new Date('2099-10-02T07:00:00Z')});await page.evaluate(()=>{Object.keys(_cache).forEach(k=>delete _cache[k]);__holdRead=true;selectStore('酒泉');});await page.waitForFunction(()=>__heldReads.length===1);
 await page.clock.fastForward(30001);await expect(page.locator('#dailyReadRetry')).toBeVisible();await expect(page.locator('.btn-save-main')).toBeDisabled();
 await page.evaluate(()=>__heldReads[0].release());await expect(page.locator('.btn-save-main')).toBeDisabled();
 await page.evaluate(()=>__holdRead=false);await page.locator('#dailyReadRetry').click();await expect(page.locator('.btn-save-main')).toBeEnabled();await expect(page.locator('#f_aq999')).toHaveValue('55');
 await page.evaluate(()=>dispatchEvent(new Event('portal-login-changed')));
 await page.locator('.store-card[data-store="酒泉"]').click();await expect(page.locator('.btn-save-main')).toBeEnabled();await expect(page.locator('#f_aq999')).not.toHaveValue('55');
});
for (const seg of [16,21]) test(`late ${seg}:00 save after login change cannot abort the new read or restore old cache/shadow/readback`,async({page})=>{
 await page.evaluate(seg=>{
  window.__holdRead=true;window.__writeCount=0;window.__saveOutcome='pending';window.__newReadOutcome='pending';
  const original=window.fetch;
  window.fetch=(url,options={})=>{
   const p=JSON.parse(options.body||'{}');
   if(p.action!=='write')return original(url,options);
   __writeCount++;
   return new Promise(resolve=>{window.__releaseWrite=()=>resolve(new Response(JSON.stringify({status:'ok',rowWritten:true,spreadsheetId:'synthetic-only',date:p.date,store:p.store,seg:p.seg,readbackMatches:true})));});
  };
  const data={aq999:9,aq1399:1,haosu:1,rt1399:1,rt999:1,insurance_num:0,insurance_den:2,insurance_pct:0,management_focus_json:JSON.stringify({op_online:0,op_accum:0,op_target:0,mycharge_clicked:0,mycharge_tagged:0,mycharge_pct:null})};
  window.__oldSave=saveToStorage('2099-10-02','酒泉',seg,data).then(()=>__saveOutcome='ok',e=>__saveOutcome=e.name);
 },seg);
 await page.waitForFunction(()=>typeof __releaseWrite==='function');
 await page.evaluate(seg=>{
  dispatchEvent(new Event('portal-login-changed'));
  window.__newRead=privateDashboardPost({action:'read',date:'2099-10-02',seg}).then(()=>__newReadOutcome='ok',e=>__newReadOutcome=e.name);
 },seg);
 await page.waitForFunction(()=>__heldReads.length===1);
 await page.evaluate(async()=>{__releaseWrite();await __oldSave;});
 expect(await page.evaluate(()=>__saveOutcome)).toBe('AbortError');
 expect(await page.evaluate(()=>__newReadOutcome)).toBe('pending');
 expect(await page.evaluate(()=>__writeCount)).toBe(1);
 expect(await page.evaluate(()=>__summaryCalls.length)).toBe(1);
 expect(await page.evaluate(seg=>_cache[cacheKey('2099-10-02',seg)]===undefined&&localStorage.getItem(shadowKey('2099-10-02',seg))===null,seg)).toBe(true);
 await page.evaluate(async()=>{__heldReads[0].release();await __newRead;});
 expect(await page.evaluate(()=>__newReadOutcome)).toBe('ok');
});
for(const panel of ['playback','perf']) test(`${panel} timeout is unknown, not zeros/unreported; manual retry succeeds`,async({page})=>{
 await page.clock.install({time:new Date('2099-10-02T07:00:00Z')});
 await page.evaluate(panel=>{
  __holdRead=true;
  // Perf is a retained legacy caller without a current panel. Exercise it in a
  // local DOM harness; do not add a retired flow to the shipped page.
  if(panel==='perf'){
   const el=document.createElement('div');el.id='panel-perf';el.className='panel';
   el.innerHTML='<input id="perfDate"><div id="perfResult"></div>';document.body.append(el);
  }
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.getElementById('panel-'+panel).classList.add('active');
  if(panel==='playback'){document.getElementById('playbackDate').value='2099-10-02';renderPlayback();}
  else {document.getElementById('perfDate').value='2099-10-02';renderPerf();}
 },panel);
 await page.waitForFunction(()=>__heldReads.length===1);await page.clock.fastForward(30001);
 const el=page.locator('#'+panel+'Result');await expect(el).toContainText('讀取超過 30 秒');await expect(el).toContainText('無法確認');
 await expect(el).not.toContainText('未填：');await expect(el).not.toContainText('未回報');
 expect(await page.evaluate(()=>__summaryCalls.length)).toBe(1);
 await page.evaluate(()=>__heldReads[0].release());await expect(el).toContainText('讀取超過 30 秒');
 await page.evaluate(()=>__holdRead=false);await el.locator('[data-daily-read-retry]').click();
 await expect(el).not.toContainText('讀取超過 30 秒');await expect(el).toContainText(panel==='playback'?'回放':'店點 KPI 達成');
});
test('cancelling a coalesced fill consumer does not discard the surviving playback data/cache',async({page})=>{
 await page.evaluate(()=>{
  __holdRead=true;document.getElementById('playbackDate').value='2099-10-02';
  window.__playback=renderPlayback();
 });
 await page.waitForFunction(()=>__heldReads.length===1);
 await page.evaluate(()=>selectStore('酒泉'));await page.waitForTimeout(30);
 expect(await page.evaluate(()=>__heldReads.length)).toBe(1);
 await page.evaluate(()=>fillSelectionController.abort());
 await page.evaluate(async()=>{__heldReads[0].release();await __playback;});
 expect(await page.evaluate(()=>_cache[cacheKey('2099-10-02',16)]?.酒泉?.aq999)).toBe(1);
 expect(await page.locator('#playbackResult').textContent()).not.toContain('未填：通化、酒泉');
 expect(await page.evaluate(()=>__summaryCalls.filter(p=>p.action==='read').length)).toBe(1);
});
