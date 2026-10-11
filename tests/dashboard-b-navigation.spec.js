'use strict';
const {test,expect}=require('@playwright/test');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const shell=fs.readFileSync(process.env.B_BASELINE_SHELL||path.join(root,'dashboard-b-shell.js'),'utf8');
const client=fs.readFileSync(process.env.B_BASELINE_CLIENT||path.join(root,'GasBClient.js'),'utf8');
const baseline=Boolean(process.env.B_BASELINE_SHELL);
const origin='https://n12b-navigation.test';

function html(name){
 const home=name==='home',app=name==='app';
 const selector=app?(baseline?'[data-nav]':null):'a[data-nav]';
 return `<!doctype html><html><head><script src="/GasBClient.js" defer></script><script src="/dashboard-b-shell.js" defer></script></head><body>
 <header>North12B synthetic navigation</header><main><a data-nav href="/awards.html">台獎</a><button data-nav type="button">App KPI</button></main>
 <script>window.__counts={clear:0,accept:0,nav:0};window.DashboardBHost={sessionOnly:${home},ownerPhone:false,navigationSelector:${JSON.stringify(selector)},
 clear(){window.__counts.clear++;document.body.dataset.private='hidden'},
 accept(){window.__counts.accept++;document.body.dataset.private='visible'},
 navigate(module){if(${home})location.href=module==='awards'?'/awards.html':'/kpi.html';else{window.__counts.nav++;document.body.dataset.view=module}},
 };document.addEventListener('click',e=>{if(e.target.matches('button[data-nav]')){window.__counts.nav++;document.body.dataset.view='kpi'}});</script></body></html>`;
}
async function fixture(context){
 const calls=[],control={readFail:false,revoked:false},expiresAt=Date.now()+25*60*1000;
 await context.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===origin){
   if(url.pathname==='/GasBClient.js')return route.fulfill({contentType:'text/javascript',body:client});
   if(url.pathname==='/dashboard-b-shell.js')return route.fulfill({contentType:'text/javascript',body:shell});
   const name=url.pathname.includes('home')?'home':url.pathname.includes('app')?'app':'kpi';
   return route.fulfill({contentType:'text/html',body:html(name)});
  }
  if(url.hostname!=='script.google.com')return route.abort();
  const payload=request.postDataJSON();calls.push(payload.action);
  await new Promise(resolve=>setTimeout(resolve,25));
  let result={status:'ok'};
  if(payload.action==='employee_status')result={status:'ok',enabled:true,passwordAvailable:true};
  if(payload.action==='employee_login')result={status:'ok',token:'B1_a_'+'a'.repeat(64),expiresAt,trustSource:'password-bound'};
  if(payload.action==='employee_session')result=control.revoked?{status:'error'}:{status:'ok',expiresAt,trustSource:'password-bound'};
  if(payload.action==='employee_private_read'||payload.action==='employee_kpi_read')result=control.readFail||control.revoked?{status:'error'}:{status:'ok',profile:{role:'employee',isTrusted:false},trustSource:'password-bound'};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 return {calls,control};
}
async function login(page,url){
 await page.goto(origin+'/'+url+'.html');
 await page.locator('[data-b-employee]').fill('SYNTHETIC');
 await page.locator('[data-b-password]').fill('SYNTHETIC_PASSWORD');
 await page.locator('[data-b-submit]').click();
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
}
const counts=page=>page.evaluate(()=>({...window.__counts}));

test('website first load and cross-page navigation keep the same short session',async({context,page})=>{
 const f=await fixture(context),start=Date.now();await login(page,'home');
 const initial={ms:Date.now()-start,requests:f.calls.length};
 const from=f.calls.length,t=Date.now();await page.locator('[data-b-module="kpi"]').click();
 await expect(page).toHaveURL(origin+'/kpi.html');await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
 const cross={ms:Date.now()-t,requests:f.calls.length-from};
 expect(f.calls.filter(action=>action==='employee_login')).toHaveLength(1);
 expect(await page.evaluate(()=>document.body.dataset.private)).toBe('visible');
 if(!baseline)f.control.readFail=true; // The next page must use recently verified data, not re-read both sources.
 const second=f.calls.length,s=Date.now();await page.locator('a[data-nav]').click();
 await expect(page).toHaveURL(origin+'/awards.html');await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
 const awards={ms:Date.now()-s,requests:f.calls.length-second};
 console.log('NAV_METRICS '+JSON.stringify({version:baseline?'before':'after',initial,cross,awards}));
 if(!baseline){
  expect(cross.requests).toBe(4);expect(awards.requests).toBe(2);
  expect(f.calls.slice(second)).toEqual(expect.arrayContaining(['employee_status','employee_session']));
  expect(f.calls.slice(second)).not.toContain('employee_private_read');
  expect(f.calls.slice(second)).not.toContain('employee_kpi_read');
  f.control.readFail=false;
  await page.evaluate(()=>{const key='north12b_password_data_v1',value=JSON.parse(sessionStorage.getItem(key));value.savedAt=Date.now()-61001;sessionStorage.setItem(key,JSON.stringify(value));});
  const expired=f.calls.length;await page.goto(origin+'/kpi.html');
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
  expect(f.calls.slice(expired)).toEqual(expect.arrayContaining(['employee_private_read','employee_kpi_read']));
  f.control.revoked=true;await page.locator('[data-b-refresh]').click();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','pending');
  expect(await page.evaluate(()=>document.body.dataset.private)).toBe('hidden');
  expect(await page.evaluate(()=>sessionStorage.getItem('north12b_password_data_v1'))).toBeNull();
 }
});

test('App bottom tabs switch without protected requests or repaint',async({context,page})=>{
 const f=await fixture(context),start=Date.now();await login(page,'app');
 const initial={ms:Date.now()-start,requests:f.calls.length},before=f.calls.length,paint=await counts(page),t=Date.now();
 await page.locator('button[data-nav]').click();await expect(page.locator('body')).toHaveAttribute('data-view','kpi');
 const switchView={ms:Date.now()-t,requests:f.calls.length-before,clear:(await counts(page)).clear-paint.clear,accept:(await counts(page)).accept-paint.accept};
 console.log('APP_METRICS '+JSON.stringify({version:baseline?'before':'after',initial,switchView}));
 if(!baseline){expect(switchView.requests).toBe(0);expect(switchView.clear).toBe(0);expect(switchView.accept).toBe(0);}
});

test('temporary read failure preserves the lease but hides data; revocation never reveals data',async({context,page})=>{
 test.skip(baseline,'before version intentionally clears the lease');
 const f=await fixture(context);await login(page,'app');
 f.control.readFail=true;await page.locator('[data-b-refresh]').click();
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','pending');
 expect(await page.evaluate(()=>document.body.dataset.private)).toBe('hidden');
 expect(await page.evaluate(()=>Boolean(sessionStorage.getItem('north12b_password_session_v1')))).toBe(true);
 f.control.readFail=false;await page.locator('[data-b-refresh]').click();
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
 expect(f.calls.filter(action=>action==='employee_login')).toHaveLength(1);
 f.control.revoked=true;await page.locator('[data-b-refresh]').click();
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','pending');
 expect(await page.evaluate(()=>document.body.dataset.private)).toBe('hidden');
 await page.locator('button[data-nav]').click();expect(await page.evaluate(()=>document.body.dataset.private)).toBe('hidden');
 await page.locator('[data-b-logout]').click();
 expect(await page.evaluate(()=>sessionStorage.getItem('north12b_password_session_v1'))).toBeNull();
});
