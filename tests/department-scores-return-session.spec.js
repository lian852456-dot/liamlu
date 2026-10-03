'use strict';
const {test,expect}=require('@playwright/test');
const Gold=require('../department-gold-monthly-core.js'),Scores=require('../department-scores-core.js'),F=require('./helpers/department-scores-synthetic.cjs');
const PAGE=(process.env.TEST_BASE_URL||'http://127.0.0.1:8772/')+'department-ops.html',KEY='bei12b_patrol_session_token_v2';
const token=id=>Buffer.from(JSON.stringify({id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.synthetic';
function gold(id){const month=Gold.validateMonth({schema:Gold.SCHEMA,monthKey:'2026-09',sheetName:'動員(全員)',sourceName:'synthetic.xlsx',sourceHash:'a'.repeat(64),dateRange:{start:'2026-09-01',end:'2026-09-28',cutoff:'2026-09-28'},settlementStatus:'provisional',finalConfirmed:false,records:[{employeeId:'SYN001',employeeName:'合成'+id,region:'北一二B',storeCode:'SYN-B',store:'合成門市',role:'合成職稱',medal:12,sourceRow:4,sourceFields:[]}],validation:{sourceTotal:12}});return {status:'ok',available:true,gold:{months:[month]},monthly:{revision:'synthetic-'+id,history:{}}};}
async function setup(page){
 const a=token('A'),b=token('B'),errors=[],calls=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({key,a})=>sessionStorage.setItem(key,a),{key:KEY,a});
 await page.route('**/*',async route=>{
  const req=route.request(),u=new URL(req.url());if(u.hostname==='127.0.0.1')return route.continue();if(u.hostname!=='script.google.com')return route.abort('blockedbyclient');
  const p=req.postDataJSON();calls.push(p);let result;
  if(p.action==='ptauth')result={status:'ok',token:p.key?b:p.token,expiresAt:Math.floor(Date.now()/1000)+3600};
  else if(p.action==='department_ops_read')result=gold(p.token===b?'B':'A');
  else if(p.action==='department_scores_read')result={status:'ok',contract:Scores.CONTRACT,available:true,generation:1,months:[{month:F.month({month:7}),active:{revision:'synthetic'},history:[]}]};
  else if(p.action==='department_store_rules_read')result={status:'ok',available:false,contract:'store-rule-reminders-v1',expiresAt:Math.floor(Date.now()/1000)+3600};
  else if(p.action==='ptlogout')result={status:'ok'};
  else return route.abort('blockedbyclient');
  return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto(PAGE);await expect(page.locator('#peopleBody')).toContainText('合成A');
 await page.evaluate(()=>{
  const original=window.fetch;window.__returnRace=[];
  window.fetch=(u,o)=>{
   const p=JSON.parse(o?.body||'{}');
   if(p.action!=='ptauth'||p.key||!new URL(u).searchParams.has('_request'))return original(u,o);
   // Deliberately allow a late response even after abort to test the stale-response guard.
   return new Promise((resolve,reject)=>{
    const r={token:p.token,signal:o.signal,aborts:0,resolve,reject};window.__returnRace.push(r);
    o.signal.addEventListener('abort',()=>{r.aborts++;},{once:true});
   });
  };
  window.__settleReturn=(index,kind)=>{
   const r=window.__returnRace[index];
   if(kind==='timeout')return r.reject(new DOMException('Aborted','AbortError'));
   if(kind==='network')return r.reject(new TypeError('Synthetic transport failure'));
   if(kind==='http503')return r.resolve(new Response('Synthetic unavailable',{status:503}));
   const result=kind==='denied'?{status:'error',message:'unauthorized',reason:'AUTH_SESSION_REVOKED',auth:{reason:'AUTH_SESSION_REVOKED'}}:{status:'ok',token:r.token,expiresAt:Math.floor(Date.now()/1000)+3600};
   r.resolve(new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}}));
  };
 });
 return {a,b,errors,calls};
}
async function returned(page){await page.evaluate(()=>{document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'));});}
async function pending(page,count){await expect.poll(()=>page.evaluate(()=>__returnRace.length)).toBe(count);}
async function settle(page,index,kind){await page.evaluate(({index,kind})=>__settleReturn(index,kind),{index,kind});await page.waitForTimeout(50);}
async function relogin(page){await page.evaluate(()=>window.dispatchEvent(new Event('department-session-cleared')));await expect(page.locator('#workspace')).toBeHidden();await page.locator('#passcode').fill('synthetic-passcode');await page.locator('#authForm button').click();await expect(page.locator('#peopleBody')).toContainText('合成B');}
for(const kind of ['success','denied','timeout','network','http503'])test(`late A ${kind} cannot clear B pending auth or lock B`,async({page})=>{
 const s=await setup(page);await returned(page);await pending(page,1);await relogin(page);
 expect(await page.evaluate(()=>({aborted:__returnRace[0].signal.aborted,aborts:__returnRace[0].aborts}))).toEqual({aborted:true,aborts:1});
 await returned(page);await pending(page,2);expect(await page.evaluate(()=>__returnRace[1].signal.aborted)).toBe(false);
 await settle(page,0,kind);await expect(page.locator('#workspace')).toBeVisible();expect(await page.evaluate(key=>sessionStorage.getItem(key),KEY)).toBe(s.b);
 await returned(page);await page.waitForTimeout(50);await pending(page,2);
 await settle(page,1,'success');await expect(page.locator('#peopleBody')).toContainText('合成B');
 await returned(page);await pending(page,3);await settle(page,2,'denied');await expect(page.locator('#workspace')).toBeHidden();await expect(page.locator('#peopleBody')).toBeEmpty();expect(s.errors).toEqual([]);
});
test('late A timeout after the old retry horizon cannot affect a fresh B return',async({page})=>{
 await page.clock.install();const s=await setup(page);await returned(page);await pending(page,1);await relogin(page);await returned(page);await pending(page,2);await settle(page,1,'success');
 await page.clock.runFor(76000);await expect(page.locator('#peopleBody')).toContainText('合成B');await returned(page);await pending(page,3);
 await settle(page,0,'timeout');await returned(page);await pending(page,3);await settle(page,2,'success');await expect(page.locator('#workspace')).toBeVisible();expect(s.errors).toEqual([]);
});
for(const event of ['department-session-cleared','portal-before-logout'])test(`${event} cancels A and a late response cannot revive private data`,async({page})=>{
 const s=await setup(page);await returned(page);await pending(page,1);
 await page.evaluate(event=>{window.dispatchEvent(new Event(event));if(event==='portal-before-logout'){sessionStorage.removeItem('bei12b_patrol_session_token_v2');document.querySelector('#workspace').hidden=true;}},event);
 await expect(page.locator('#workspace')).toBeHidden();expect(await page.evaluate(()=>__returnRace[0].signal.aborted)).toBe(true);await settle(page,0,'success');await returned(page);
 await expect(page.locator('#peopleBody')).toBeEmpty();await expect(page.locator('#scoreBody')).toBeEmpty();await pending(page,1);expect(await page.evaluate(key=>sessionStorage.getItem(key),KEY)).toBeNull();expect(s.errors).toEqual([]);
});
test('same token reused after logout gets a new generation and a new return check',async({page})=>{
 const s=await setup(page);await returned(page);await pending(page,1);
 await page.evaluate(({key,a})=>{window.dispatchEvent(new Event('department-session-cleared'));sessionStorage.setItem(key,a);document.querySelector('#workspace').hidden=false;window.dispatchEvent(new Event('pageshow'));},{key:KEY,a:s.a});
 await returned(page);await pending(page,2);await settle(page,0,'denied');await returned(page);await pending(page,2);await expect(page.locator('#workspace')).toBeVisible();await settle(page,1,'denied');await expect(page.locator('#workspace')).toBeHidden();expect(s.errors).toEqual([]);
});
