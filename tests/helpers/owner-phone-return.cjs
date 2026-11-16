'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../..'),origin='https://owner-return.test';
const shell=fs.readFileSync(process.env.B_RETURN_BASELINE_SHELL||path.join(root,'dashboard-b-shell.js'),'utf8');
async function fixture(page,{owner=true,hold=false}={}){
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const actions=[],clock={now:Date.now()},control={denied:false,network:false,release:null};
 await page.clock.install({time:new Date(clock.now)});
 await page.addInitScript(()=>{
  const timeout=window.setTimeout;
  window.setTimeout=function(callback,delay,...args){
   if(typeof callback==='function'&&delay>1000000&&delay<=1800000)window.__queuedExpiry=()=>callback(...args);
   return timeout.call(this,callback,delay,...args);
  };
 });
 let deadline=clock.now+1800000,serial=1,token='B1_a_'+'a'.repeat(64),phone='';
 const gate=hold?new Promise(resolve=>control.release=resolve):Promise.resolve();
 await page.context().route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===origin){
   if(url.pathname==='/GasBClient.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(root,'GasBClient.js'))});
   if(url.pathname==='/dashboard-b-shell.js')return route.fulfill({contentType:'text/javascript',body:shell});
   return route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><head><meta charset="utf-8"><script defer src="/GasBClient.js"></script><script defer src="/dashboard-b-shell.js"></script></head><body><header>合成手機返回測試</header><main id="protected" hidden>合成成績</main><script>
    window.__paint=0;window.__clear=0;window.DashboardBHost={ownerPhone:${owner},
    clear(){window.__clear++;document.querySelector('#protected').hidden=true;},
    accept(){window.__paint++;document.querySelector('#protected').hidden=false;},navigate(){}};
   </script></body></html>`});
  }
  if(url.hostname!=='script.google.com')return route.abort();
  const p=route.request().postDataJSON();actions.push(p.action);
  let result={status:'ok'};
  if(p.action==='employee_status')result={status:'ok',enabled:true,passwordAvailable:true};
  if(p.action==='employee_login')result={status:'ok',token,expiresAt:deadline,trustSource:'password-bound'};
  if(p.action==='employee_phone_enroll'){phone='BP1_'+'b'.repeat(64);result={status:'ok',phoneToken:phone,expiresAt:clock.now+89*86400000};}
  if(p.action==='employee_phone_resume'){
   await gate;
   if(control.network)return route.fulfill({status:503,body:'synthetic unavailable'}).catch(()=>{});
   if(control.denied||!phone||p.phoneToken!==phone)result={status:'error'};
   else{deadline=clock.now+1800000;token='B1_a_'+String(++serial).padStart(64,'b');result={status:'ok',token,expiresAt:deadline,phoneExpiresAt:clock.now+89*86400000,trustSource:'password-bound'};}
  }
  if(p.action==='employee_phone_forget')phone='';
  if(p.action==='employee_dashboard_read')result=control.denied||clock.now>=deadline||p.token!==token?{status:'error'}:
   {status:'ok',expiresAt:deadline,phoneEligible:owner,trustSource:'password-bound',
    privateResult:{status:'ok',profile:{role:'employee',isTrusted:false},trustSource:'password-bound'},
    kpiResult:{status:'ok',profile:{role:'employee',isTrusted:false},trustSource:'password-bound'}};
  await route.fulfill({json:result}).catch(()=>{});
 });
 await page.goto(origin+'/app.html');await page.locator('[data-b-employee]').fill('SYNTHETIC');await page.locator('[data-b-password]').fill('SYNTHETIC_PASSWORD');
 await page.locator('[data-b-submit]').click();await expect(page.locator('#protected')).toBeVisible();
 if(owner)await expect(page.locator('h2')).toHaveText('手機自動登入已啟用');
 return {actions,control,errors,async expireThen(event){
  clock.now=deadline+1;
  if(event==='timer'){await page.clock.fastForward(1800001);return;}
  // Background throttling can leave the expiry timer pending while a foreground
  // lifecycle check observes the server deadline first. Do not fire that timer.
  await page.clock.setSystemTime(new Date(clock.now));
  await page.evaluate(name=>{
   if(name==='visibilitychange'){Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event(name));}
   else window.dispatchEvent(new Event(name));
  },event);
 }};
}

for(const event of ['visibilitychange','focus','pageshow'])test('approved owner phone resumes when '+event+' observes expiry before the timer',async({page})=>{
 const f=await fixture(page,{hold:true}),before=f.actions.length;
 await f.expireThen(event);
 await expect.poll(()=>f.actions.filter(a=>a==='employee_phone_resume').length,{timeout:2000}).toBe(1);
 await expect(page.locator('#protected')).toBeHidden(); // never expose the expired lease
 await page.evaluate(()=>window.__queuedExpiry()); // a previously queued timer must not start a second resume
 for(let i=0;i<3;i++)await page.evaluate(()=>{dispatchEvent(new Event('focus'));dispatchEvent(new Event('pageshow'));document.dispatchEvent(new Event('visibilitychange'));});
 expect(f.actions.filter(a=>a==='employee_phone_resume')).toHaveLength(1);
 f.control.release();await expect(page.locator('#protected')).toBeVisible();
 expect(f.actions.slice(before)).toEqual(['employee_phone_resume','employee_dashboard_read']);
 expect(f.actions.filter(a=>a==='employee_login')).toHaveLength(1);
 expect(f.errors).toEqual([]);
});

for(const mode of ['denied','network'])test('expired phone return stays locked after '+mode+' reauthentication failure',async({page})=>{
 const f=await fixture(page);f.control[mode]=true;await f.expireThen('visibilitychange');
 await expect.poll(()=>f.actions.filter(a=>a==='employee_phone_resume').length,{timeout:2000}).toBe(1);
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','locked');await expect(page.locator('#protected')).toBeHidden();
 expect(await page.evaluate(()=>sessionStorage.getItem('north12b_password_session_v1'))).toBeNull();
 expect(await page.evaluate(()=>Boolean(localStorage.getItem('north12b_owner_phone_v1')))).toBe(mode==='network');
 expect(f.errors).toEqual([]);
});

test('existing scheduled owner-phone expiry still uses the same guarded reauthentication',async({page})=>{
 const f=await fixture(page,{hold:true});await f.expireThen('timer');
 await expect.poll(()=>f.actions.filter(a=>a==='employee_phone_resume').length,{timeout:2000}).toBe(1);
 await expect(page.locator('#protected')).toBeHidden();f.control.release();
 await expect(page.locator('#protected')).toBeVisible();expect(f.errors).toEqual([]);
});

test('an owner without a saved phone grant cannot silently resume after hard expiry',async({page})=>{
 const f=await fixture(page),before=f.actions.length;
 await page.evaluate(()=>localStorage.removeItem('north12b_owner_phone_v1'));
 await f.expireThen('focus');await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','locked');
 await expect(page.locator('#protected')).toBeHidden();expect(f.actions.slice(before)).toEqual([]);expect(f.errors).toEqual([]);
});

test('ordinary browser hard expiry remains locked and never enrolls or resumes a phone',async({page})=>{
 const f=await fixture(page,{owner:false}),before=f.actions.length;await f.expireThen('visibilitychange');
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','locked');await expect(page.locator('#protected')).toBeHidden();
 expect(f.actions.slice(before)).toEqual([]);expect(f.actions).not.toContain('employee_phone_enroll');
 expect(f.errors).toEqual([]);
});

test('logout while expired owner phone is reauthenticating prevents a late result from repainting',async({page})=>{
 const f=await fixture(page,{hold:true});await f.expireThen('focus');
 await expect.poll(()=>f.actions.filter(a=>a==='employee_phone_resume').length,{timeout:2000}).toBe(1);
 await page.locator('[data-b-logout]').click();f.control.release();
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','locked');await expect(page.locator('#protected')).toBeHidden();
 await page.waitForTimeout(100);expect(await page.evaluate(()=>window.__paint)).toBe(1);
 expect(await page.evaluate(()=>localStorage.getItem('north12b_owner_phone_v1'))).toBeNull();
 expect(f.errors).toEqual([]);
});
