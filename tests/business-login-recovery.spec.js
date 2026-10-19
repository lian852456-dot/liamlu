'use strict';
const {test,expect}=require('@playwright/test'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..'),ORIGIN='https://business-recovery.test';
const B='north12b_password_session_v1',DEVICE='north12b_private_dashboard_device_id';
async function fixture(page,mode){
 const calls=[];let current=mode,expiresAt=Date.now()+1200000;
 await page.clock.install({time:new Date()});
 await page.addInitScript(({B,DEVICE,expiresAt})=>{
  localStorage.setItem(DEVICE,'SYNTHETIC_DEVICE');
  sessionStorage.setItem(B,JSON.stringify({v:1,owner:'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec',
   logoutEpoch:'',deviceId:'SYNTHETIC_DEVICE',token:'B1_a_'+'a'.repeat(64),expiresAt}));
 },{B,DEVICE,expiresAt});
 await page.route(ORIGIN+'/**',route=>{
  const file=path.resolve(ROOT,'.'+new URL(route.request().url()).pathname);
  if(!file.startsWith(ROOT+path.sep)||!fs.existsSync(file))return route.abort();
  const types={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
  return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 await page.route('https://script.google.com/**',async route=>{
  const action=route.request().postDataJSON().action;calls.push(action);
  if(action==='employee_status')return route.fulfill({json:{status:'ok',enabled:true,passwordAvailable:true}});
  if(action==='employee_logout')return route.fulfill({json:{status:'ok'}});
  if(action==='employee_login')return route.fulfill({json:{status:'ok',token:'B1_a_'+'b'.repeat(64),expiresAt,trustSource:'password-bound'}});
  if(action!=='employee_session')return route.fulfill({json:{status:'error'}});
  if(current==='network')return route.abort('failed');
  if(current==='timeout')return; // AbortController's unchanged deadline ends this request.
  if(current==='service')return route.fulfill({status:503,body:'SYNTHETIC_RAW_SERVICE_DETAIL'});
  if(current==='response')return route.fulfill({contentType:'text/html',body:'SYNTHETIC_RAW_RESPONSE_DETAIL'});
  return route.fulfill({json:current==='auth'?{status:'error',message:'SYNTHETIC_RAW_BACKEND_DETAIL'}:
   {status:'ok',expiresAt,trustSource:'password-bound',phoneEligible:false}});
 });
 await page.goto(ORIGIN+'/home.html?timing=1');
 await expect.poll(()=>calls.includes('employee_session')).toBe(true);
 if(mode==='timeout')await page.clock.fastForward(90001);
 return {calls,setMode:value=>{current=value;},proof:()=>page.evaluate(key=>sessionStorage.getItem(key),B)};
}
for(const width of [1280,390])for(const [mode,label]of [['network','NETWORK'],['service','SERVICE'],['response','RESPONSE'],['auth','AUTH'],['timeout','TIMEOUT']]){
 test(`SYNTHETIC ${width}px ${mode}: pending form, safe message and same-lease recovery`,async({page})=>{
  await page.setViewportSize({width,height:844});const f=await fixture(page,mode);
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','pending');
  const before=await f.proof();expect(before).toBeTruthy();
  await expect(page.locator('[data-b-employee]')).toBeVisible();await expect(page.locator('[data-b-password]')).toBeVisible();
  await expect(page.locator('[data-b-message]')).toContainText(label);await expect(page.locator('[data-b-message]')).toContainText('尚未確認失敗原因');
  expect(await page.locator('[data-b-message]').textContent()).not.toContain('SYNTHETIC_RAW');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(f.calls.every(action=>action==='employee_session')).toBe(true);
  if(mode==='network')await page.screenshot({path:`test-results/business-login-recovery/SYNTHETIC-pending-${width}.png`});
  f.setMode('ok');await page.locator('[data-b-refresh]').click();
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
  await expect(page.locator('#portal-access-status')).toContainText('同仁專區登入已驗證');
  await expect(page.locator('[data-b-password]')).toBeHidden();expect(await f.proof()).toBe(before);
  expect(f.calls.every(action=>action==='employee_session')).toBe(true);
 });
}
test('SYNTHETIC pending permits explicit normal login; no automatic logout, login or fallback',async({page})=>{
 const f=await fixture(page,'auth');await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','pending');
 expect(f.calls.every(action=>action==='employee_session')).toBe(true);
 f.setMode('ok');await page.locator('[data-b-employee]').fill('SYNTH001');await page.locator('[data-b-password]').fill('SYNTHETIC_PASSWORD');
 await page.locator('[data-b-submit]').click();await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
 expect(f.calls.filter(action=>action==='employee_login')).toHaveLength(1);
 expect(f.calls.filter(action=>action==='employee_logout')).toHaveLength(1); // Existing user-submitted login path only.
 expect(f.calls).not.toContain('private_access');expect(f.calls).not.toContain('read');
 expect(await f.proof()).not.toContain('SYNTHETIC_PASSWORD');
});
