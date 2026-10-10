'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('fs');
const BASE=process.env.TEST_BASE_URL||'http://127.0.0.1:8875/',PHONE='north12b_owner_phone_v1';
async function setup(context,{owner=true}={}){
 let grant='',revoked=false,seq=0;const calls=[],errors=[];
 const expiry=()=>Date.now()+1700000;
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin===new URL(BASE).origin){
   if(u.pathname==='/phone-test.html')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta charset="utf-8"><script src="portal-logout.js"></script><script>window.DashboardBHost={ownerPhone:true,sessionOnly:true,clear(){document.body.dataset.accepted='no'},accept(){document.body.dataset.accepted='yes'},navigate(){},navigationSelector:'[data-nav]'};</script><script defer src="GasBClient.js"></script><script defer src="dashboard-b-shell.js"></script></head><body><header>手機設定測試</header></body></html>`});
   return route.continue();
  }
  if(u.hostname!=='script.google.com')return route.abort();
  let p;try{p=route.request().postDataJSON();}catch{return route.abort();}calls.push(p);
  let r={status:'ok'};
  if(p.action==='employee_status')r={...r,enabled:true,passwordAvailable:true};
  else if(p.action==='employee_login'){seq++;r={...r,token:'B1_a_'+String(seq).padStart(64,'a'),expiresAt:expiry(),trustSource:'password-bound'};}
  else if(p.action==='employee_session')r=revoked?{status:'error'}:{...r,expiresAt:expiry(),phoneEligible:owner};
  else if(p.action==='employee_phone_enroll'){grant='BP1_'+'b'.repeat(64);r={...r,phoneToken:grant,expiresAt:Date.now()+89*86400000};}
  else if(p.action==='employee_phone_resume')r=revoked||p.phoneToken!==grant?{status:'error'}:{...r,token:'B1_a_'+'c'.repeat(64),expiresAt:expiry(),trustSource:'password-bound',phoneExpiresAt:Date.now()+89*86400000};
  else if(p.action==='employee_phone_forget'){revoked=true;grant='';}
  else if(p.action==='employee_logout')r={status:'ok'};
  else r={status:'error'};
  // Match the fixed lease deadline instead of extending it on validate.
  if(p.action==='employee_login'||p.action==='employee_phone_resume')setup.deadline=r.expiresAt;
  if(p.action==='employee_session'&&r.status==='ok')r.expiresAt=setup.deadline;
  await route.fulfill({contentType:'application/json',body:JSON.stringify(r)});
 });
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
 return {calls,errors,revoke:()=>revoked=true};
}
async function login(page){await page.goto(BASE+'phone-test.html');await page.locator('[data-b-employee]').fill('SYNTH001');await page.locator('[data-b-password]').fill('SYNTHETIC_PASSWORD');await page.locator('[data-b-submit]').click();await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');}
test('phone survives closing the app, automatically signs in without a password, and logout revokes it',async({context,page})=>{
 const f=await setup(context);await page.setViewportSize({width:390,height:844});await login(page);await expect(page.locator('h2')).toHaveText('手機自動登入已啟用');
 expect(await page.evaluate(k=>!!localStorage.getItem(k),PHONE)).toBe(true);expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('SYNTHETIC_PASSWORD');
 await page.close();const next=await context.newPage();await next.goto(BASE+'phone-test.html');await expect(next.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
 expect(f.calls.filter(p=>p.action==='employee_login')).toHaveLength(1);expect(f.calls.filter(p=>p.action==='employee_phone_resume')).toHaveLength(1);
 await next.screenshot({path:'test-results/owner-phone-auto-login.png'});
 await next.locator('[data-b-logout]').click();await expect(next.locator('#dashboard-b-access')).toHaveAttribute('data-state','locked');expect(await next.evaluate(k=>localStorage.getItem(k),PHONE)).toBeNull();expect(f.calls.some(p=>p.action==='employee_phone_forget')).toBe(true);
 await next.reload();await expect(next.locator('[data-b-submit]')).toBeVisible();expect(f.calls.filter(p=>p.action==='employee_phone_resume')).toHaveLength(1);expect(f.errors).toEqual([]);
});
test('server revocation and a different browser cannot silently sign in',async({browser,context,page})=>{
 const f=await setup(context);await login(page);await expect(page.locator('h2')).toHaveText('手機自動登入已啟用');f.revoke();await page.close();const next=await context.newPage();await next.goto(BASE+'phone-test.html');await expect(next.locator('[data-b-message]')).toContainText('手機驗證未完成');expect(await next.evaluate(()=>document.body.dataset.accepted)).toBe('no');
 const other=await browser.newContext();await setup(other);const unbound=await other.newPage();await unbound.goto(BASE+'phone-test.html');await expect(unbound.locator('[data-b-submit]')).toBeVisible();expect(await unbound.evaluate(k=>localStorage.getItem(k),PHONE)).toBeNull();await other.close();
});
test('regular employees keep short sessions without being enrolled as the owner phone',async({context,page})=>{const f=await setup(context,{owner:false});await login(page);await expect(page.locator('[data-b-phone]')).toBeHidden();expect(f.calls.some(p=>p.action==='employee_phone_enroll')).toBe(false);expect(await page.evaluate(k=>localStorage.getItem(k),PHONE)).toBeNull();});
test('real mobile App shows the first-time phone setup without horizontal overflow',async({context,page})=>{await setup(context);await page.setViewportSize({width:390,height:844});await page.goto(BASE+'app.html#me');await expect(page.locator('h2').filter({hasText:'首次驗證與手機綁定'})).toBeVisible();await expect(page.locator('[data-b-submit]')).toHaveText('首次驗證並綁定這支手機');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'test-results/owner-phone-first-setup.png'});});
test('global website logout revokes the phone grant before reopening the App',async({context,page})=>{
 const f=await setup(context);await login(page);await expect(page.locator('h2')).toHaveText('手機自動登入已啟用');
 await page.goto(BASE+'home.html');await expect(page.locator('#portal-logout')).toBeVisible();page.once('dialog',d=>d.accept());await page.locator('#portal-logout').click();
 await expect.poll(()=>page.evaluate(k=>localStorage.getItem(k),PHONE)).toBeNull();await expect.poll(()=>f.calls.some(p=>p.action==='employee_phone_forget')).toBe(true);
 await page.goto(BASE+'phone-test.html');await expect(page.locator('[data-b-submit]')).toBeVisible();expect(f.calls.filter(p=>p.action==='employee_phone_resume')).toHaveLength(0);
});
