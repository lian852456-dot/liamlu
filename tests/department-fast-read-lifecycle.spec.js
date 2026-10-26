'use strict';
const {test,expect}=require('@playwright/test'),crypto=require('node:crypto');
const Gold=require('../department-gold-monthly-core.js'),Scores=require('../department-scores-core.js'),XLSX=require('../assets/vendor/xlsx.full.min.js'),F=require('./helpers/department-scores-synthetic.cjs');
const PAGE=new URL('department-ops.html',process.env.TEST_BASE_URL||'http://127.0.0.1:8772/').href,KEY='bei12b_patrol_session_token_v2';
const gate=()=>{let release;const promise=new Promise(r=>release=r);return {promise,release};};
function gold(medal){return Gold.validateMonth({schema:Gold.SCHEMA,monthKey:'2026-09',sheetName:'動員(全員)',sourceName:'synthetic.xlsx',sourceHash:crypto.createHash('sha256').update(String(medal)).digest('hex'),dateRange:{start:'2026-09-01',end:'2026-09-28',cutoff:'2026-09-28'},settlementStatus:'provisional',records:[{employeeId:'SYN001',employeeName:'合成同仁',region:'北一二B',storeCode:'SYN-B',store:'合成店',role:'合成職稱',medal,sourceRow:4,sourceFields:[]}],validation:{sourceTotal:medal}});}
async function setup(page,ttl=3600,{beforeAuth,afterGoto}={}){
 const exp=Math.floor(Date.now()/1000)+ttl,token=Buffer.from(JSON.stringify({exp})).toString('base64url')+'.synthetic',state={goldVersion:1,denyGold:false,denyScores:false,denyAuth:false,hold:null},calls=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(({key,token})=>sessionStorage.setItem(key,token),{key:KEY,token});
 await page.route('**/*',async route=>{
  const host=new URL(route.request().url()).hostname;if(host==='127.0.0.1')return route.continue();if(host!=='script.google.com')return route.abort();
  const p=route.request().postDataJSON();calls.push(p);let result,status=200;
  if(p.action==='ptauth'){if(beforeAuth)await beforeAuth();result=state.denyAuth?{status:'error',message:'AUTH_SESSION_REVOKED'}:{status:'ok',token,expiresAt:exp};}
  else if(p.action==='department_ops_read'){
   if(state.denyGold){status=503;result={status:'error',message:'unauthorized',auth:{reason:'AUTH_SESSION_REVOKED'}};}
   else result=p.knownVersion==='gold-v'+state.goldVersion?{status:'ok',notModified:true,readContract:'department-version-read/v1',readVersion:p.knownVersion,monthly:{revision:p.knownVersion}}:{status:'ok',readVersion:'gold-v'+state.goldVersion,gold:{months:[gold(state.goldVersion*10)]},monthly:{revision:'gold-v'+state.goldVersion,history:{}}};
  }else if(p.action==='department_scores_read'){
   result=state.denyScores?{status:'error',message:'AUTH_SESSION_REVOKED'}:p.knownVersion==='scores-v1'?{status:'ok',contract:Scores.CONTRACT,notModified:true,readContract:'department-version-read/v1',readVersion:'scores-v1',generation:1}:{status:'ok',contract:Scores.CONTRACT,readVersion:'scores-v1',generation:1,available:true,months:[{month:F.month({month:7}),active:{revision:'synthetic'},history:[]}]};
   if(state.hold)await state.hold.promise;
  }else if(p.action==='department_store_rules_read')result={status:'ok',available:false,contract:'store-rule-reminders-v1',expiresAt:exp};
  else if(p.action==='ptlogout')result={status:'ok'};
  else return route.abort();
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(result)}).catch(()=>{});
 });
 await page.goto(PAGE);if(afterGoto)await afterGoto();if(ttl>0)await expect(page.locator('#peopleBody tr')).toHaveCount(1);return {state,calls,errors};
}
test('return before initial session restoration finishes cannot strand an authenticated blank workspace',async({page})=>{
 const held=gate();
 const s=await setup(page,3600,{beforeAuth:()=>held.promise,afterGoto:async()=>{
  await page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('focus'));});
  held.release();
 }});
 await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#goldDashboard')).toBeVisible();await expect(page.locator('#securityBadge')).toHaveText('督導權限已驗證');expect(s.errors).toEqual([]);
});
const returned=page=>page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));});
async function store(page){await page.locator('[data-tab="store"]').click();await expect(page.locator('#scoreBody tr')).toHaveCount(9);}
async function holdFile(page){
 const buffer=Buffer.from(XLSX.write(F.workbook({month:7}),{type:'array',bookType:'xlsx'}));await page.locator('#scoreYear').fill('2026');await page.locator('#scoreFile').setInputFiles({name:'synthetic.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer});
 await page.evaluate(()=>{const original=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){return new Promise(resolve=>{window.__releaseFile=async()=>resolve(await original.call(this));});};});
 await page.locator('#scoreImport').click();await expect.poll(()=>page.evaluate(()=>Boolean(window.__releaseFile))).toBe(true);
}
test('coalesced return hides private scores until backend proof then preserves filters and detail',async({page})=>{
 const s=await setup(page);await store(page);await page.locator('#scorePeriod').selectOption('2026-07');await page.locator('#scoreRegion').selectOption('北一二B');await page.locator('#scoreStore').selectOption('合成店B1');await page.locator('[data-score-detail]').click();
 s.state.hold=gate();await returned(page);await expect(page.locator('#scoreDashboard')).toBeHidden();await expect(page.locator('#departmentReturn')).toBeVisible();await expect(page.locator('#workspace')).toHaveJSProperty('inert',true);await expect.poll(()=>s.calls.filter(p=>p.action==='department_scores_read').length).toBe(2);
 s.state.hold.release();await expect(page.locator('#scoreDashboard')).toBeVisible();await expect(page.locator('#departmentReturn')).toBeHidden();await expect(page.locator('#workspace')).toHaveJSProperty('inert',false);await expect(page.locator('#scoreBody tr')).toHaveCount(1);await expect(page.locator('#scoreStore')).toHaveValue('合成店B1');await expect(page.locator('#scoreDetail')).toBeVisible();expect(s.errors).toEqual([]);
});
for(const width of [1440,390])test(`gold return shows progress, recovers after repeated backgrounding and exposes retry on failure at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const s=await setup(page);
 await page.evaluate(()=>{
  const original=window.fetch;window.__goldReturns=[];
  window.fetch=(u,o)=>{
   const p=JSON.parse(o?.body||'{}');
   if(p.action!=='department_ops_read'||!p.knownVersion)return original(u,o);
   return new Promise(resolve=>window.__goldReturns.push({resolve,version:p.knownVersion}));
  };
  window.__finishGoldReturn=(index,failed=false)=>{
   const r=window.__goldReturns[index];r.resolve(new Response(JSON.stringify(failed?{status:'error',message:'合成暫時讀取失敗'}:{status:'ok',notModified:true,readContract:'department-version-read/v1',readVersion:r.version,monthly:{revision:r.version}}),{headers:{'Content-Type':'application/json'}}));
  };
 });
 for(let i=0;i<3;i++){
  await page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));window.dispatchEvent(new Event('pageshow'));window.dispatchEvent(new Event('focus'));});
  await expect.poll(()=>page.evaluate(()=>__goldReturns.length)).toBe(i+1);
  await expect(page.locator('#departmentReturn')).toBeVisible();await expect(page.locator('#goldDashboard')).toBeHidden();
 }
 await page.evaluate(()=>__finishGoldReturn(2));await expect(page.locator('#goldDashboard')).toBeVisible();
 await page.evaluate(()=>{__finishGoldReturn(0);__finishGoldReturn(1);});await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#departmentReturn')).toBeHidden();
 await returned(page);await expect.poll(()=>page.evaluate(()=>__goldReturns.length)).toBe(4);await page.evaluate(()=>__finishGoldReturn(3,true));
 await expect(page.locator('#workspace')).toBeVisible();await expect(page.locator('#departmentReturn')).toBeHidden();await expect(page.locator('#goldMessage')).toContainText('合成暫時讀取失敗');await expect(page.locator('#goldDashboard')).toBeHidden();
 await page.locator('#monthlyReload').click();await expect(page.locator('#goldDashboard')).toBeVisible();await expect(page.locator('#goldFile')).toHaveValue('');expect(s.errors).toEqual([]);
});
test('gold explicit denial over HTTP 503 clears both domains immediately without retry',async({page})=>{
 await page.clock.install();const s=await setup(page);await store(page);await page.locator('[data-tab="gold"]').click();s.state.denyGold=true;await returned(page);await expect(page.locator('#workspace')).toBeHidden();await page.clock.runFor(80000);
 await expect(page.locator('#peopleBody')).toBeEmpty();await expect(page.locator('#scoreBody')).toBeEmpty();expect(s.calls.filter(p=>p.action==='department_ops_read')).toHaveLength(2);expect(s.errors).toEqual([]);
});
test('session expiry clears both domains without waiting for a ten-second poll or a return event',async({page})=>{
 await page.clock.install();const s=await setup(page,3);await store(page);await page.clock.runFor(3100);await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#scoreBody')).toBeEmpty();await expect(page.locator('#peopleBody')).toBeEmpty();expect(await page.evaluate(key=>sessionStorage.getItem(key),KEY)).toBeNull();expect(s.errors).toEqual([]);
});
test('a server response with an already expired local deadline cannot unlock private views',async({page})=>{
 const s=await setup(page,-1);await expect(page.locator('#workspace')).toHaveJSProperty('hidden',true);await expect(page.locator('#authPanel')).toBeVisible();expect(s.calls.map(p=>p.action)).toEqual(['ptauth']);await expect(page.locator('#peopleBody')).toBeEmpty();await expect(page.locator('#scoreBody')).toBeEmpty();expect(s.errors).toEqual([]);
});
test('a pre-background score read cannot replace the new return-time revocation check',async({page})=>{
 const s=await setup(page);await store(page);const held=gate();s.state.hold=held;await page.locator('#scoreRefresh').click();await expect.poll(()=>s.calls.filter(p=>p.action==='department_scores_read').length).toBe(2);
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));s.state.hold=null;s.state.denyScores=true;await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));
 await expect(page.locator('#workspace')).toBeHidden();expect(s.calls.filter(p=>p.action==='department_scores_read')).toHaveLength(3);held.release();await page.waitForTimeout(100);await expect(page.locator('#scoreBody')).toBeEmpty();expect(s.errors).toEqual([]);
});
test('a pre-background gold read cannot satisfy the fresh return check',async({page})=>{
 const s=await setup(page);await page.evaluate(()=>{const original=window.fetch;window.fetch=(u,o)=>{const p=JSON.parse(o?.body||'{}');if(p.action==='department_ops_read'&&p.knownVersion&&!window.__heldGold){window.__heldGold=true;return new Promise(resolve=>{window.__releaseGold=()=>resolve(new Response(JSON.stringify({status:'ok',notModified:true,readContract:'department-version-read/v1',readVersion:'gold-v1',monthly:{revision:'gold-v1'}}),{headers:{'Content-Type':'application/json'}}));});}return original(u,o);};});
 await page.locator('#monthlyReload').click();await expect.poll(()=>page.evaluate(()=>Boolean(window.__releaseGold))).toBe(true);await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));s.state.denyGold=true;await page.evaluate(()=>window.dispatchEvent(new Event('pageshow')));await expect(page.locator('#workspace')).toBeHidden();await page.evaluate(()=>window.__releaseGold());await page.waitForTimeout(100);await expect(page.locator('#peopleBody')).toBeEmpty();expect(s.errors).toEqual([]);
});
for(const kind of ['logout','busy-return-revocation'])test(`late local parse cannot revive private preview after ${kind}`,async({page})=>{
 const s=await setup(page);await store(page);await holdFile(page);
 if(kind==='logout')await page.evaluate(()=>window.dispatchEvent(new Event('department-session-cleared')));
 else {s.state.denyAuth=true;await returned(page);}
  await expect(page.locator('#workspace')).toHaveJSProperty('hidden',true);expect(await page.evaluate(()=>DepartmentScoresWorkState())).toEqual({busy:false,unsaved:false});await page.evaluate(()=>window.__releaseFile());await page.waitForTimeout(100);
 await expect(page.locator('#scorePreview')).toBeHidden();await expect(page.locator('#scoreDiff')).toBeEmpty();await expect(page.locator('#scoreBody')).toBeEmpty();expect(s.calls.filter(p=>/publish|restore/.test(p.action))).toEqual([]);expect(s.errors).toEqual([]);
});
