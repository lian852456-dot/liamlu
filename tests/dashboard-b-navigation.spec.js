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
 const calls=[],control={readFail:false,revoked:false,validateDelay:0},expiresAt=Date.now()+25*60*1000;
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
  await new Promise(resolve=>setTimeout(resolve,25+(payload.action==='employee_session'?control.validateDelay:0)));
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
 if(!baseline)await expect.poll(()=>page.evaluate(()=>Boolean(sessionStorage.getItem('north12b_password_data_v1')))).toBe(true);
 const initial={ms:Date.now()-start,requests:f.calls.length};
 if(!baseline)f.control.validateDelay=600;
 const from=f.calls.length,t=Date.now();await page.locator('[data-b-module="kpi"]').click();
 await expect(page).toHaveURL(origin+'/kpi.html');
 if(!baseline){
  await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','checking');
  await expect(page.locator('#dashboard-b-access form')).toBeHidden();
 }
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');f.control.validateDelay=0;
 const cross={ms:Date.now()-t,requests:f.calls.length-from};
 expect(f.calls.filter(action=>action==='employee_login')).toHaveLength(1);
 expect(await page.evaluate(()=>document.body.dataset.private)).toBe('visible');
 if(!baseline)f.control.readFail=true; // The next page must use recently verified data, not re-read both sources.
 const second=f.calls.length,s=Date.now();await page.locator('a[data-nav]').click();
 await expect(page).toHaveURL(origin+'/awards.html');await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
 const awards={ms:Date.now()-s,requests:f.calls.length-second};
 console.log('NAV_METRICS '+JSON.stringify({version:baseline?'before':'after',initial,cross,awards}));
 if(!baseline){
  expect(cross.requests).toBe(2);expect(awards.requests).toBe(2);
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

test('website KPI, awards and personal views switch in one verified document',async({context,page})=>{
 test.skip(baseline,'single-page battle hub is only in the updated version');
 const actions=[],control={revoked:false},expiresAt=Date.now()+25*60*1000;
 const names=['通化','酒泉','三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
 const item=i=>({display_name:'測試機型 '+i,actual:i,target:20,rate:i/20,difference:i-10,incremental_award:100,
  threshold_target:10,store_reward_50:100,store_reward_100:200,district_reward_80:300,district_reward_100:400});
 const items=Array.from({length:13},(_,i)=>item(i+1));
 const awardRow=(store,i)=>({store,award:{actual_total:1000+i,projected:2000+i,rank:i+1,award:'Y'},priorities:items.slice(0,3),items});
 const snapshot={report_date:'2026-08-15',data_as_of_date:'2026-08-15',source_file:'0816.xlsx',
  aggregate:{overall_kpi:1.1,company_rank:20,addon_score:12,insurance_attach_rate:.5},
  stores:names.map((store,i)=>({store,company_rank:40+i,addon_score:10,insurance_attach_rate:.4})),personal:[]};
 const awards={report_date:'2026-08-15',data_as_of_date:'2026-08-15',phone_items:13,store_rows:10,
  supervisor:{actual_total:9000,projected:12000,rank:21,award:'Y'},overall:awardRow('北一二B整體',0),
  stores:names.map((name,i)=>awardRow(name,i+1))};
 const kpi={meta:{period:'2026/08/01 ~ 08/15',snapshotDay:15,monthDays:31,month:'2026-08',sourceFile:'0816.xlsx'},
  items:[{key:'AQ V+D 999 (含)以上',short:'A999',step:1}],aggregateRates:{'AQ V+D 999 (含)以上':1.05},
  stores:names.map((name,i)=>({code:'DNB'+i,name,official:1.1,items:{'AQ V+D 999 (含)以上':{a:10,t:20,reportRate:1.05}}})),persons:[]};
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin===origin){
   const name=path.basename(url.pathname);
   if(!['kpi-battle.html','portal-logout.js','GasBClient.js','dashboard-b-shell.js','kpi-battle-controller.js','award-model-catalog.js','awards-battle-controller.js'].includes(name))return route.abort();
   return route.fulfill({contentType:name.endsWith('.html')?'text/html':'text/javascript',body:fs.readFileSync(path.join(root,name))});
  }
  if(url.hostname!=='script.google.com')return route.abort();
  const action=route.request().postDataJSON().action;actions.push(action);
  const proof={profile:{role:'employee',isTrusted:false},trustSource:'password-bound'};
  const result=action==='employee_status'?{status:'ok',enabled:true,passwordAvailable:true}
   :action==='employee_login'?{status:'ok',token:'B1_a_'+'a'.repeat(64),expiresAt,trustSource:'password-bound'}
   :control.revoked&&action==='employee_session'?{status:'error'}
   :action==='employee_session'?{status:'ok',expiresAt,trustSource:'password-bound'}
   :action==='employee_private_read'?{status:'ok',...proof,snapshot:{kpiBattle:snapshot,awardsBattle:awards}}
   :action==='employee_kpi_read'?{status:'ok',...proof,data:kpi}:{status:'ok'};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 await page.goto(origin+'/kpi-battle.html#awards');
 await page.locator('[data-b-a]').click();
 const legacyInput=page.locator('#awardsBattleContent #privateEmployeeId');
 await expect(legacyInput).toBeVisible();
 await expect(legacyInput).toBeFocused();
 await page.goto(origin+'/kpi-battle.html');
 await page.locator('[data-b-employee]').fill('SYNTHETIC');await page.locator('[data-b-password]').fill('SYNTHETIC_PASSWORD');
 await page.locator('[data-b-submit]').click();await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','active');
 await expect(page.locator('#kpiBattleContent .summary-grid')).toBeVisible();
 const initial=actions.length,before=page.url(),start=Date.now();
 await page.locator('#kpiBattleContent .summary-grid').evaluate(node=>{window.__verifiedKpiNode=node;});
 await page.locator('[data-b-module="awards"]').click();await expect(page.locator('#awardsBattleContent .summary-grid')).toBeVisible();
 await page.locator('[data-b-module="kpi"]').click();await expect(page.locator('#kpiBattleContent .summary-grid')).toBeVisible();
 expect(await page.evaluate(()=>window.__verifiedKpiNode===document.querySelector('#kpiBattleContent .summary-grid'))).toBe(true);
 await page.locator('[data-b-module="awards"]').click();await expect(page.locator('#awardsBattleContent .summary-grid')).toBeVisible();
 await page.locator('[data-b-module="personal"]').click();await expect(page.locator('#kpiBattlePersonalBtn')).toHaveClass(/active/);
 await page.locator('[data-b-module="kpi"]').click();await expect(page.locator('#kpiBattleContent .summary-grid')).toBeVisible();
 const desktopMs=Date.now()-start;
 await page.setViewportSize({width:390,height:844});
 const mobileStart=Date.now();await page.locator('[data-b-module="awards"]').click();
 await expect(page.locator('#awardsBattleContent .summary-grid')).toBeVisible();
 await page.locator('[data-b-module="kpi"]').click();await expect(page.locator('#kpiBattleContent .summary-grid')).toBeVisible();
 const mobileMs=Date.now()-mobileStart;
 expect(await page.locator('body').evaluate(body=>body.scrollWidth<=body.clientWidth)).toBe(true);
 console.log('BATTLE_HUB_METRICS '+JSON.stringify({desktopSwitches:6,desktopMs,mobileSwitches:2,mobileMs,requests:actions.length-initial}));
 expect(actions.length-initial).toBe(0);expect(new URL(page.url()).pathname).toBe(new URL(before).pathname);
 control.revoked=true;await page.locator('[data-b-refresh]').click();
 await expect(page.locator('#dashboard-b-access')).toHaveAttribute('data-state','pending');
 await expect(page.locator('#kpiBattleContent .summary-grid')).toHaveCount(0);
 await expect(page.locator('#awardsBattleContent .summary-grid')).toHaveCount(0);
});
