'use strict';
const {test,expect}=require('@playwright/test');
const Model=require('../home-reminder-model.js'),Q=require('../patrol-question-versions.js');
const {runtime}=require('./helpers/department-ops-integration-runtime.cjs');
const BASE='http://127.0.0.1:8875/',EMP='north12b_private_dashboard_employee_id',DEVICE='north12b_private_dashboard_device_id',PT='bei12b_patrol_session_token_v2';
function sales(){const c=Model.dateContext(new Date());return {status:'ok',summary:{semantics:'formal-index-summary-v1',date:c.yesterday,segment:21,totalStores:9,completedStores:9,missingStores:[],updatedAt:'SYNTHETIC',stores:Model.STORES.map((st,i)=>({name:st.name,reported:true,metrics:{A999:{value:i===0?0:1,unit:'count',sourceField:'aq999'},'好速':{value:1,unit:'points',sourceField:'haosu'}}}))}};}
function patrol(){const c=Model.dateContext(new Date()),stores=Model.STORES.map(s=>({...s}));return {status:'ok',contract:'patrol-dashboard-sep25-v1',version:1,month:c.month,months:Q.bimWindow(c.month).months.filter(m=>m<=c.month),stores,storeCount:9,rowCount:0,sourceRowCount:0,maxRows:5000,summary:Q.overview([],stores,c.month),sourceVersion:'SYNTHETIC',sourceUpdatedAt:new Date().toISOString(),generatedAt:new Date().toISOString()};}
async function intercept(context,{holdRead=false,holdLogout=false}={}){
 const b=runtime(),calls=[],errors=[];let releaseRead,releaseLogout;
 const readWait=new Promise(r=>releaseRead=r),logoutWait=new Promise(r=>releaseLogout=r);
 context.on('page',p=>p.on('pageerror',e=>errors.push(e.stack)));
 await context.route('**/*',async route=>{
  if(new URL(route.request().url()).origin===new URL(BASE).origin)return route.continue();
  if(new URL(route.request().url()).hostname!=='script.google.com')return route.abort('blockedbyclient');
  let p;try{p=route.request().postDataJSON();}catch{}if(!p)return route.abort('blockedbyclient');calls.push(p);
  if(p.action==='read'&&holdRead)await readWait;
  if(p.action==='ptlogout'&&holdLogout)await logoutWait;
  const result=p.action==='private_access'?{status:'ok'}:p.action==='read'?sales():p.action==='ptdashboard'?patrol():b.post(p);
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)}).catch(()=>{});
 });
 return {b,calls,errors,releaseRead,releaseLogout};
}
async function identify(page,{employee='SYNTHETIC_EMPLOYEE',token='',legacy=false}={}){
 await page.goto(BASE+'home.html');
 await page.evaluate(({EMP,DEVICE,PT,employee,token,legacy})=>{localStorage.setItem(DEVICE,'SYNTHETIC_DEVICE');if(employee)(legacy?localStorage:sessionStorage).setItem(EMP,employee);if(token)sessionStorage.setItem(PT,token);}, {EMP,DEVICE,PT,employee,token,legacy});
 await page.reload();await expect(page.locator('#reminder-refresh')).toBeEnabled();
}
async function logout(page,selector='#portal-logout'){page.once('dialog',d=>d.accept());await page.locator(selector).click();}

test('same-tab department password login, home return, refresh and history retain the original validated deadline',async({context,page})=>{
 const {calls,errors}=await intercept(context);await page.goto(BASE+'department-ops.html');
 await page.locator('#passcode').fill('synthetic-passcode');await page.locator('#authForm button').click();await expect(page.locator('#workspace')).toBeVisible();
 const deadline=calls.find(c=>c.action==='ptauth'&&c.key);expect(deadline).toBeTruthy();
 await page.goto(BASE+'home.html');await expect(page.locator('#portal-access-status')).toContainText('督導登入已驗證');
 await expect(page.locator('#reminder-count')).toHaveText('1 / 2');await expect(page.locator('#reminder-title')).toContainText('巡店');await expect(page.locator('#reminder-text')).not.toContainText('請先');
 await page.locator('#reminder-next').click();await expect(page.locator('#reminder-title')).toContainText('大盤');
 await page.reload();await expect(page.locator('#portal-access-status')).toContainText('督導登入已驗證');
 await page.goBack();await expect(page.locator('#workspace')).toBeVisible();await page.goForward();await expect(page.locator('#portal-access-status')).toContainText('督導登入已驗證');
 expect(calls.filter(c=>c.action==='ptauth'&&c.key)).toHaveLength(1);expect(errors).toEqual([]);
});

test('existing local employee identity must pass approved-device gate before reminders and logout prevents auto restoration',async({context,page})=>{
 const {calls}=await intercept(context);await identify(page,{legacy:true});
 await expect(page.locator('#portal-access-status')).toContainText('業績登入已驗證');await expect(page.locator('#reminder-text')).toContainText('通化');await expect(page.locator('#reminder-count')).toHaveText('1 / 2');
 expect(calls.findIndex(c=>c.action==='private_access')).toBeLessThan(calls.findIndex(c=>c.action==='read'));
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/session-controls/SYNTHETIC-home-verified.png'});
 await logout(page);await expect(page.locator('#portal-session-note')).toContainText('已同步登出');const count=calls.length;
 await page.reload();await expect(page.locator('#portal-logout')).toBeHidden();expect(calls).toHaveLength(count);await expect(page.locator('#reminder-text')).toContainText('請先');
});

test('two tabs clear immediately, revoke their distinct sessions, retain device and calculation/draft state, no secret in event',async({context,page})=>{
 const {b,calls,releaseLogout,errors}=await intercept(context,{holdLogout:true});const other=await context.newPage();
 const one=b.post({action:'ptauth',key:'synthetic-passcode'}).token,two=b.post({action:'ptauth',key:'synthetic-passcode'}).token;
 await identify(page,{token:one});await identify(other,{token:two});
 await other.evaluate(()=>{localStorage.setItem('bei12b_kpi_v1','SYNTHETIC_INPUT');localStorage.setItem('bei12b_audit_draft_v1','SYNTHETIC_DRAFT');sessionStorage.setItem('patrol-summary-safe-v1:synthetic','SYNTHETIC_CACHE');});
 await logout(page);await expect(page.locator('#portal-logout-screen')).toBeVisible();await expect(other.locator('#portal-logout-screen')).toBeVisible();
 for(const p of [page,other]){await expect(p.locator('#reminder-display')).toHaveCount(0);expect(await p.evaluate(({PT,EMP})=>[sessionStorage.getItem(PT),sessionStorage.getItem(EMP),localStorage.getItem(EMP)],{PT,EMP})).toEqual([null,null,null]);}
 const event=await page.evaluate(()=>JSON.parse(localStorage.getItem('north12b_portal_logout_event_v1')));expect(Object.keys(event).sort()).toEqual(['at','id','type','version']);expect(event.type).toBe('logout');
 expect(await other.evaluate(()=>[localStorage.getItem('north12b_private_dashboard_device_id'),localStorage.getItem('bei12b_kpi_v1'),localStorage.getItem('bei12b_audit_draft_v1'),sessionStorage.getItem('patrol-summary-safe-v1:synthetic')])).toEqual(['SYNTHETIC_DEVICE','SYNTHETIC_INPUT','SYNTHETIC_DRAFT',null]);
 releaseLogout();await expect(other.locator('#portal-session-note')).toContainText('已同步登出');await expect(page.locator('#portal-session-note')).toContainText('已同步登出');
 expect(new Set(calls.filter(c=>c.action==='ptlogout').map(c=>c.token)).size).toBe(2);
 for(const token of [one,two])expect(b.post({action:'ptauth',token}).reason).toBe('AUTH_SESSION_REVOKED');
 await other.reload();await expect(other.locator('#portal-logout')).toBeHidden();expect(errors).toEqual([]);
});

test('cancelled logout leaves both tabs and unsaved work intact',async({context,page})=>{
 await intercept(context);const other=await context.newPage();await identify(page);await identify(other);
 page.once('dialog',d=>d.dismiss());await page.locator('#portal-logout').click();
 for(const p of [page,other])await expect(p.locator('#reminder-text')).toContainText('通化');
 expect(await page.evaluate(()=>localStorage.getItem('north12b_portal_logout_event_v1'))).toBeNull();
});

test('late read cannot repaint during pending revocation or after reload in another tab',async({context,page})=>{
 const {b,releaseRead,releaseLogout,errors}=await intercept(context,{holdRead:true,holdLogout:true});const other=await context.newPage();
 const token=b.post({action:'ptauth',key:'synthetic-passcode'}).token;
 await identify(page,{employee:'',token});await other.goto(BASE+'home.html');
 await other.evaluate(({EMP,DEVICE,PT,token})=>{sessionStorage.setItem(EMP,'SYNTHETIC_EMPLOYEE');sessionStorage.setItem(PT,token);localStorage.setItem(DEVICE,'SYNTHETIC_DEVICE');window.PortalLogout.notifyLogin();},{EMP,DEVICE,PT,token});
 await expect(other.locator('#portal-access-status')).toContainText('業績登入已驗證');await logout(page);
 await expect(other.locator('#portal-logout-screen')).toBeVisible();releaseRead();
 await expect(other.locator('body')).not.toContainText('通化');releaseLogout();await expect(other.locator('#portal-logout')).toBeHidden();await expect(other.locator('#reminder-text')).toContainText('請先');expect(errors).toEqual([]);
});

test('login notification refreshes a home tab with existing local identity without transporting credentials',async({context,page})=>{
 const {calls}=await intercept(context);await page.goto(BASE+'home.html');const other=await context.newPage();await other.goto(BASE+'kpi.html');
 await other.evaluate(({EMP,DEVICE})=>{localStorage.setItem(EMP,'SYNTHETIC_EMPLOYEE');localStorage.setItem(DEVICE,'SYNTHETIC_DEVICE');window.PortalLogout.notifyLogin();},{EMP,DEVICE});
 await expect(page.locator('#reminder-text')).toContainText('通化');expect(calls.some(c=>c.action==='private_access')).toBe(true);
 const event=await other.evaluate(()=>JSON.parse(localStorage.getItem('north12b_portal_login_event_v1')));expect(Object.keys(event).sort()).toEqual(['at','id','type','version']);expect(event.type).toBe('login');
});

test('independent new tab cannot inherit sessionStorage employee or supervisor token via notifications',async({context,page})=>{
 await intercept(context);await identify(page);const other=await context.newPage();await other.goto(BASE+'home.html');await page.evaluate(()=>window.PortalLogout.notifyLogin());
 await expect(other.locator('#portal-access-status')).toContainText('尚未驗證');expect(await other.evaluate(({EMP,PT})=>[sessionStorage.getItem(EMP),sessionStorage.getItem(PT)],{EMP,PT})).toEqual([null,null]);
});

for(const filename of ['index.html','kpi-battle.html','awards-battle.html','kpi.html','app.html','patrol.html','audit-report.html','north12b-gold-ops.html','live-battle.html','phone-stock-dashboard.html']){
 test(filename+' listens for logout and clears private DOM without invoking business writes',async({context,page})=>{
  const {calls}=await intercept(context,{holdLogout:true});await page.goto(BASE+'home.html');const other=await context.newPage();await other.goto(BASE+filename);
  await other.evaluate(({EMP})=>{sessionStorage.setItem(EMP,'SYNTHETIC_EMPLOYEE');const div=document.createElement('div');div.id='synthetic-private-marker';div.textContent='SYNTHETIC_PRIVATE_VALUE';document.body.append(div);},{EMP});
  await page.evaluate(({EMP})=>{sessionStorage.setItem(EMP,'SYNTHETIC_EMPLOYEE');},{EMP});await page.locator('#reminder-refresh').click();await logout(page);
  await expect(other.locator('body')).not.toContainText('SYNTHETIC_PRIVATE_VALUE');expect(await other.evaluate(({EMP})=>sessionStorage.getItem(EMP),{EMP})).toBeNull();
  expect(calls.filter(c=>/(write|publish|commit|restore)$/.test(c.action))).toEqual([]);
 });
}


test('KPI employee entry validates before same-tab navigation back to home reminders',async({context,page})=>{
 const {calls}=await intercept(context);await page.goto(BASE+'kpi-battle.html');
 await page.locator('#privateEmployeeId').fill('SYNTHETIC_EMPLOYEE');await page.locator('[data-private-dashboard-action="login"]').click();
 await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('north12b_private_dashboard_employee_id'))).toBe('SYNTHETIC_EMPLOYEE');
 await page.goto(BASE+'home.html');await expect(page.locator('#reminder-text')).toContainText('通化');await expect(page.locator('#reminder-count')).toHaveText('1 / 2');
 expect(calls.filter(c=>c.action==='private_access').length).toBeGreaterThanOrEqual(2);
});

test('missed notification is enforced on history/pageshow and does not restore old session credentials',async({context,page})=>{
 await intercept(context);await identify(page);const other=await context.newPage();
 await other.addInitScript(()=>{window.BroadcastChannel=undefined;window.addEventListener('storage',e=>{if(e.key==='north12b_portal_logout_event_v1')e.stopImmediatePropagation();},true);});
 await identify(other);await logout(page);await expect(page.locator('#portal-session-note')).toContainText('已同步登出');
 expect(await other.evaluate(()=>sessionStorage.getItem('north12b_private_dashboard_employee_id'))).toBe('SYNTHETIC_EMPLOYEE');
 await other.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 await expect(other.locator('#portal-session-note')).toContainText('已同步登出');expect(await other.evaluate(()=>sessionStorage.getItem('north12b_private_dashboard_employee_id'))).toBeNull();
});

test('verified login with missing data is described as unavailable data rather than requiring unlock',async({context,page})=>{
 await intercept(context);await context.route('https://script.google.com/**',route=>{const p=route.request().postDataJSON();return route.fulfill({json:p.action==='private_access'?{status:'ok'}:{status:'error',message:'SYNTHETIC_MISSING_DATA'}});});
 await identify(page);await expect(page.locator('#portal-access-status')).toContainText('業績登入已驗證');await expect(page.locator('#reminder-text')).toContainText('已驗證業績登入');await expect(page.locator('#reminder-status')).toHaveAttribute('data-status','pending');await expect(page.locator('#reminder-text')).not.toContainText('請先');
});


test('common controls hide anonymously and a new verified login removes the old logout message',async({context,page})=>{
 await intercept(context);await page.goto(BASE+'kpi-battle.html');await expect(page.locator('#portal-session-controls')).toBeHidden();
 await page.evaluate(()=>{sessionStorage.setItem('north12b_private_dashboard_employee_id','SYNTHETIC_EMPLOYEE');window.PortalLogout.notifyLogin();});
 await expect(page.locator('#portal-session-controls')).toBeVisible();page.once('dialog',d=>d.accept());await page.locator('[data-portal-logout]').click();
 await expect(page.locator('#portal-session-note')).toContainText('已同步登出');
 await page.locator('#privateEmployeeId').fill('SYNTHETIC_EMPLOYEE');await page.locator('[data-private-dashboard-action="login"]').click();
 await expect.poll(()=>page.evaluate(()=>sessionStorage.getItem('north12b_private_dashboard_employee_id'))).toBe('SYNTHETIC_EMPLOYEE');
 await expect(page.locator('#portal-session-note')).not.toContainText('已同步登出');
});

test('first logout missed by a tab with an initialized empty epoch is enforced after full reload',async({context,page})=>{
 const {b,calls}=await intercept(context);const other=await context.newPage();
 await other.addInitScript(()=>{window.BroadcastChannel=undefined;window.addEventListener('storage',e=>{if(e.key==='north12b_portal_logout_event_v1')e.stopImmediatePropagation();},true);});
 const token=b.post({action:'ptauth',key:'synthetic-passcode'}).token;
 await identify(page);await identify(other,{token});expect(await other.evaluate(()=>sessionStorage.getItem('north12b_portal_logout_seen_v1'))).toBe('');
 await logout(page);await expect(page.locator('#portal-session-note')).toContainText('已同步登出');
 expect(await other.evaluate(()=>sessionStorage.getItem('bei12b_patrol_session_token_v2'))).toBe(token);
 await other.reload();await expect(other.locator('#portal-session-note')).toContainText('已同步登出');
 expect(await other.evaluate(({EMP,PT})=>[sessionStorage.getItem(EMP),sessionStorage.getItem(PT)],{EMP,PT})).toEqual([null,null]);
 expect(calls.some(c=>c.action==='ptlogout'&&c.token===token)).toBe(true);expect(b.post({action:'ptauth',token}).reason).toBe('AUTH_SESSION_REVOKED');
});

for(const [filename,key] of [['patrol-import.html',PT],['patrol-uat.html','bei12b_patrol_uat_session_token_v1']]){
 test(filename+' shares logout, cancels without discarding work and revokes its stored supervisor token',async({context,page})=>{
  const {b,calls,releaseLogout}=await intercept(context,{holdLogout:true});const token=b.post({action:'ptauth',key:'synthetic-passcode'}).token;
  await page.goto(BASE+filename);await page.evaluate(({key,token})=>{sessionStorage.setItem(key,token);const marker=document.createElement('p');marker.id='synthetic-private-marker';marker.textContent='SYNTHETIC_IMPORT_PREVIEW';document.body.append(marker);},{key,token});
  await expect(page.locator('[data-portal-logout]')).toBeVisible();page.once('dialog',d=>d.dismiss());await page.locator('[data-portal-logout]').click();await expect(page.locator('#synthetic-private-marker')).toHaveText('SYNTHETIC_IMPORT_PREVIEW');
  const home=await context.newPage();await identify(home);await logout(home);await expect(page.locator('#portal-logout-screen')).toBeVisible();expect(await page.evaluate(key=>sessionStorage.getItem(key),key)).toBeNull();
  releaseLogout();await expect(page.locator('#portal-session-note')).toContainText('已同步登出');expect(calls.some(c=>c.action==='ptlogout'&&c.token===token)).toBe(true);expect(b.post({action:'ptauth',token}).reason).toBe('AUTH_SESSION_REVOKED');
 });
}

test('audit accepts its legitimate nested GAS sandbox and rejects foreign frame, wrong nonce and wrong origin',async({context,page})=>{
 let release;const wait=new Promise(r=>release=r);let requested;
 await context.route('https://script.google.com/**',async route=>{
  const url=new URL(route.request().url());requested=url.searchParams.get('requestId');
  await route.fulfill({contentType:'text/html',body:`<iframe src="https://script.googleusercontent.com/_session-test/nested?requestId=${requested}"></iframe>`});
 });
 await context.route('https://script.googleusercontent.com/**',async route=>{
  const id=new URL(route.request().url()).searchParams.get('requestId');await wait;
  await route.fulfill({contentType:'text/html',body:`<script>top.postMessage(${JSON.stringify({type:'north12b-gas-response-v1',requestId:id,body:{status:'ok'}})},'${new URL(BASE).origin}');</script>`});
 });
 await page.goto(BASE+'kpi-battle.html');await page.evaluate(()=>sessionStorage.setItem('bei12b_pt_session_token','SYNTHETIC_AUDIT_TOKEN'));
 page.once('dialog',d=>d.accept());await page.locator('[data-portal-logout]').click();await expect(page.locator('#portal-logout-screen')).toBeVisible();await expect.poll(()=>requested).toBeTruthy();
 await expect.poll(()=>page.evaluate(()=>document.querySelector('iframe[name^="portal_logout_"]')?.contentWindow.length)).toBe(1);
 const invalid=await page.evaluate(id=>{
  const frame=document.querySelector('iframe[name^="portal_logout_"]');const child=frame.contentWindow.frames[0];const other=document.createElement('iframe');document.body.append(other);
  const body={type:'north12b-gas-response-v1',requestId:id,body:{status:'ok'}};
  window.dispatchEvent(new MessageEvent('message',{origin:'https://script.googleusercontent.com',source:other.contentWindow,data:body}));
  window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.example',source:child,data:body}));
  window.dispatchEvent(new MessageEvent('message',{origin:'https://script.googleusercontent.com',source:child,data:{...body,requestId:'wrong-nonce'}}));
  return Boolean(document.querySelector('iframe[name^="portal_logout_"]'));
 },requested);
 expect(invalid).toBe(true);await expect(page.locator('#portal-logout-screen')).toBeVisible();release();
 await expect(page.locator('#portal-session-note')).toContainText('已同步登出');await expect(page.locator('#portal-session-note')).not.toContainText('撤銷未確認');
});

test('formal import holds logout through its actual write and readback and permits cancellation without clearing preview',async({context,page})=>{
 const {b}=await intercept(context);let releaseWrite,releaseRead;const writeWait=new Promise(r=>releaseWrite=r),readWait=new Promise(r=>releaseRead=r);let writing=false,reading=false,rows=[];
 await context.route('https://script.google.com/**',async route=>{
  const url=new URL(route.request().url());let p;try{p=route.request().postDataJSON();}catch{}
  if(url.searchParams.get('action')==='ptwrite'){rows=JSON.parse(url.searchParams.get('payload'));writing=true;await writeWait;return route.fulfill({contentType:'application/javascript',body:`${url.searchParams.get('callback')}(${JSON.stringify({status:'ok',written:rows.length})})`});}
  if(p?.action==='ptdetail'){reading=true;await readWait;return route.fulfill({json:{status:'ok',rows,totalRows:rows.length}});}
  return route.fallback();
 });
 await page.goto(BASE+'patrol-import.html');await page.locator('#passcode').fill('synthetic-passcode');await page.locator('#loginBtn').click();await expect(page.locator('#authStatus')).toContainText('督導連線正常');
 await page.evaluate(async()=>{
  const r=await import('./patrol-import-runtime.js?v=20261002-logout-2');
  const row={fillTime:'2026/10/2 10:00',arriveTime:'2026/10/2 10:00',leaveTime:'2026/10/2 11:00',district:'北一二B',code:'DNB10174',store:'台北通化',inspector:'SYNTHETIC_INSPECTOR',item:1,result:'v',reason:'',month:'2026-10'};
  r.state.pending={fileName:'SYNTHETIC.csv',parsedRows:[row],classified:{writeRows:[row]},groups:[{month:row.month,store:row.store}],blocked:false};document.getElementById('preview').classList.add('show');r.setBusy(false);
 });
 page.once('dialog',d=>d.dismiss());await page.locator('[data-portal-logout]').click();await expect(page.locator('#preview')).toBeVisible();
 await page.locator('#confirmBtn').click();await expect.poll(()=>writing).toBe(true);
 const busy=async()=>{const dialog=page.waitForEvent('dialog'),clicking=page.locator('[data-portal-logout]').click();const warning=await dialog;expect(warning.type()).toBe('alert');await warning.accept();await clicking;expect(await page.evaluate(()=>sessionStorage.getItem('bei12b_patrol_session_token_v2'))).toBeTruthy();};
 await busy();releaseWrite();await expect.poll(()=>reading).toBe(true);await busy();releaseRead();await expect(page.locator('#writeMessage')).toContainText('讀回驗證 1/1 筆一致');
 page.once('dialog',d=>d.dismiss());await page.locator('[data-portal-logout]').click();await expect(page.locator('#preview')).toBeVisible();
});

async function reloginPersistentApp(page){
 await page.goto(BASE+'app.html');await page.locator('#dataMode').click();await page.locator('#employeeId').fill('SYNTHETIC_EMPLOYEE');await page.locator('#privateAccessForm button').click();
 await expect(page.locator('#privateDeviceStatus')).toContainText('裝置已核准');await expect(page.locator('#privateAccessForm button')).toBeEnabled();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('north12b_private_dashboard_employee_id'))).toBe('SYNTHETIC_EMPLOYEE');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('north12b_portal_login_event_v1')).at>JSON.parse(localStorage.getItem('north12b_portal_logout_event_v1')).at)).toBe(true);
}
for(const filename of ['home.html','app.html']){
 test('logout then explicit persistent App login survives a new independent '+filename+' tab and its server gate',async({context,page})=>{
  const {calls}=await intercept(context);await identify(page,{legacy:true});await logout(page);await expect(page.locator('#portal-session-note')).toContainText('已同步登出');await reloginPersistentApp(page);
  const gates=calls.filter(c=>c.action==='private_access').length,other=await context.newPage();await other.goto(BASE+filename);
  if(filename==='home.html')await expect(other.locator('#portal-access-status')).toContainText('業績登入已驗證');
  else{await other.locator('#dataMode').click();await expect(other.locator('#privateDeviceStatus')).toContainText('裝置已核准');}
  expect(calls.filter(c=>c.action==='private_access').length).toBeGreaterThan(gates);
  for(const tab of [page,other]){expect(await tab.evaluate(()=>window.PortalLogout.isLocked())).toBe(false);expect(await tab.evaluate(()=>localStorage.getItem('north12b_private_dashboard_employee_id'))).toBe('SYNTHETIC_EMPLOYEE');}
  expect(await other.evaluate(()=>sessionStorage.getItem('bei12b_patrol_session_token_v2'))).toBeNull();
 });
}

test('later persistent login event never revives an old uninitialized-tab PT or session employee and stale cleanup preserves the new shared login',async({context,page})=>{
 const {b,calls}=await intercept(context);const stale=await context.newPage();
 await stale.addInitScript(()=>{window.BroadcastChannel=undefined;window.addEventListener('storage',e=>{if(e.key==='north12b_portal_logout_event_v1')e.stopImmediatePropagation();},true);});
 const token=b.post({action:'ptauth',key:'synthetic-passcode'}).token;
 await identify(page,{legacy:true});await identify(stale,{token});await stale.evaluate(()=>sessionStorage.removeItem('north12b_portal_logout_seen_v1'));
 await logout(page);await expect(page.locator('#portal-session-note')).toContainText('已同步登出');await reloginPersistentApp(page);
 expect(await stale.evaluate(()=>sessionStorage.getItem('bei12b_patrol_session_token_v2'))).toBe(token);
 await stale.reload();await expect(stale.locator('#portal-session-note')).toContainText('已同步登出');expect(await stale.evaluate(()=>sessionStorage.getItem('bei12b_patrol_session_token_v2'))).toBeNull();
 await expect.poll(()=>stale.evaluate(()=>sessionStorage.getItem('north12b_private_dashboard_employee_id'))).toBeNull();
 await expect.poll(()=>calls.some(c=>c.action==='ptlogout'&&c.token===token)).toBe(true);expect(b.post({action:'ptauth',token}).reason).toBe('AUTH_SESSION_REVOKED');
 expect(await page.evaluate(()=>localStorage.getItem('north12b_private_dashboard_employee_id'))).toBe('SYNTHETIC_EMPLOYEE');
 await expect(stale.locator('#portal-access-status')).not.toContainText('督導登入已驗證');
});

test('post-logout persistent login notification does not bypass the unapproved-device gate in a new tab',async({context,page})=>{
 const {calls}=await intercept(context);await identify(page,{legacy:true});await logout(page);await expect(page.locator('#portal-session-note')).toContainText('已同步登出');await reloginPersistentApp(page);
 await context.route('https://script.google.com/**',route=>{let p;try{p=route.request().postDataJSON();}catch{}if(p?.action==='private_access'){calls.push(p);return route.fulfill({json:{status:'error',message:'尚未核准此裝置'}});}return route.fallback();});
 const before=calls.filter(c=>c.action==='read').length,other=await context.newPage();await other.goto(BASE+'home.html');await expect(other.locator('#portal-access-status')).toContainText('尚未驗證');await expect(other.locator('#reminder-text')).toContainText('驗證未通過');
 expect(calls.filter(c=>c.action==='read')).toHaveLength(before);expect(await page.evaluate(()=>localStorage.getItem('north12b_private_dashboard_employee_id'))).toBe('SYNTHETIC_EMPLOYEE');
});
