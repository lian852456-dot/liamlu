(function(scope){
'use strict';
const DASHBOARD_B_CLIENT_ENABLED_ = true;
const OWNER='https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
const DEVICE_KEY='north12b_private_dashboard_device_id';
let host,client,active=false,epoch=0,expiresAt=0,expiryTimer,ready=false,loading=false,guarded=false,checking=null,panel;
const pendingHost=scope.DashboardBHost;
let legacyObserver;
function message(text){if(panel)panel.querySelector('[data-b-message]').textContent=text;}
function state(name){if(panel){panel.dataset.state=name;panel.querySelector('h2').textContent=name==='active'?(host?.ownerPhone&&client?.hasPhone()?'手機自動登入已啟用':'同仁專區已登入'):(host?.ownerPhone?'首次驗證與手機綁定':'員編與密碼登入');panel.querySelector('[data-b-phone]').hidden=!(name==='active'&&host?.ownerPhone&&host.phoneEligible&&!client?.hasPhone());}}
function markLegacyRoots(){
 const roots=[];
 const appForm=document.querySelector('#privateAccessForm');
 if(appForm)roots.push(appForm.closest('.access-panel')||appForm);
 const kpiLock=document.querySelector('#lockCard');
 if(kpiLock)roots.push(kpiLock);
 document.querySelectorAll('.private-lock').forEach(root=>roots.push(root));
 roots.forEach(root=>root.classList.add('dashboard-b-legacy-root'));
}
function setAccessMode(mode){
 document.body.classList.toggle('dashboard-b-password-mode',mode==='password');
 document.body.classList.toggle('dashboard-b-legacy-mode',mode==='legacy');
 markLegacyRoots();
}
function showLegacyAccess(){
 setAccessMode('legacy');
 if(typeof host?.showLegacyAccess==='function')host.showLegacyAccess();
 else host?.navigate('kpi');
}
function wipe(note='請重新輸入員編與指定密碼。',clearTransport=true){
 epoch++;active=false;loading=false;expiresAt=0;scope.clearTimeout(expiryTimer);if(clearTransport)client?.clear();checking=null;host?.clear();state('locked');message(note);
 if(panel)panel.querySelector('[data-b-password]').value='';
}
function device(){let value=scope.localStorage.getItem(DEVICE_KEY);if(value)return value;
 value=Array.from(scope.crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');scope.localStorage.setItem(DEVICE_KEY,value);return value;}
async function logout(note='已登出指定密碼通道；裝置綁定保留。',transport){
 const operation=client?.logout(transport);wipe(host.ownerPhone?'已登出並取消手機自動登入。':note,false);
 try{await operation;return true;}catch{message(host.ownerPhone?'本機已登出；伺服器撤銷未確認，請連線後由人員與裝置管理解除手機自動登入。':'畫面已清除；伺服器登出未確認，請關閉本頁。原 session 最多存活至原30分鐘期限。');return false;}
}
function checkProfile(result){if(!result?.profile || result.profile.role!=='employee' || result.profile.isTrusted!==false || result.trustSource!=='password-bound')throw Error('B_AUTH_DENIED');}
async function refresh(allowPhone=true){
 if(!active)return false;if(checking)return checking;
 const expected=epoch;host.clear();state('checking');
 checking=(async()=>{try{
  const status=await client.status();if(!status.enabled || !status.passwordAvailable)throw Error('B_DISABLED');
  const lease=await client.validate();host.phoneEligible=lease.phoneEligible===true;if(lease.expiresAt!==expiresAt || expiresAt<=Date.now())throw Error('B_AUTH_DENIED');
  if(host.sessionOnly){if(expected!==epoch)return false;host.accept({lease});state('active');message('可直接開啟同仁專區；登入至 '+new Date(expiresAt).toLocaleTimeString('zh-TW',{hour:'2-digit',minute:'2-digit'})+'，換頁不延長。');return true;}
  const [privateResult,kpiResult]=await Promise.all([client.read('private'),client.read('kpi')]);
  if(expected!==epoch)return false;checkProfile(privateResult);checkProfile(kpiResult);
  host.accept({privateResult,kpiResult});state('active');message(host.ownerPhone&&client.hasPhone()?'這支手機已驗證，下次開啟 App 會自動登入。':'指定密碼已驗證；KPI、台獎、個績唯讀。');return true;
 }catch(error){if(expected===epoch && allowPhone && host.ownerPhone && client.hasPhone()){checking=null;active=false;return resumePhone();}if(expected===epoch)wipe(error.message==='B_TIMEOUT'?'服務逾時，畫面已清除；請重新登入。':'登入已失效或通道關閉，請重新登入。');return false;}
 finally{if(expected===epoch)checking=null;}
 })();return checking;
}
async function login(event){event.preventDefault();const employee=panel.querySelector('[data-b-employee]').value.trim().toUpperCase();
 let password=panel.querySelector('[data-b-password]').value;panel.querySelector('[data-b-password]').value='';
 // Existing grants are ended before replacement; late old responses cannot repaint a new context.
 const previous=client.logout();wipe(undefined,false);checking=null;const expected=epoch;loading=true;state('loading');message('正在驗證指定密碼與這台裝置…');
 const submit=panel.querySelector('[data-b-submit]');submit.disabled=true;
 try{await previous;const status=await client.status();if(expected!==epoch)return;
  if(!status.enabled || !status.passwordAvailable)throw Error('B_DISABLED');
  const lease=await client.login(employee,device(),password);password='';if(expected!==epoch)return;
  active=true;expiresAt=lease.expiresAt;
  const ok=await refresh(false);if(!ok)return;scope.PortalLogout?.notifyLogin();
  if(host.ownerPhone && host.phoneEligible){try{await client.enrollPhone();state('active');message('已綁定這支手機，下次開啟 App 不用再輸入帳密。');}catch{message('本次已登入，但手機綁定未完成；可登出後重試，或請管理者撤銷舊手機。');}}
  scope.clearTimeout(expiryTimer);expiryTimer=scope.setTimeout(()=>{active=false;void resumePhone();},Math.max(0,expiresAt-Date.now()));
 }catch(error){if(expected===epoch)wipe(error.message==='B_DISABLED'?'指定密碼通道尚未開放，請使用原員編通道。':error.message==='B_TIMEOUT'?'服務逾時，請重新登入；不會自動重送。':'無法登入，請核對員編、指定密碼及裝置。');}
 finally{password='';if(expected===epoch)loading=false;if(!loading)submit.disabled=false;}
}
async function resumePhone(){
 if(!host.ownerPhone){wipe('登入已到期，請重新輸入指定密碼。');return false;}
 let id='';try{id=scope.localStorage.getItem(DEVICE_KEY)||'';}catch{}
 if(!client.hasPhone(id)){wipe('請完成首次驗證，綁定這支手機。');return false;}
 epoch++;const expected=epoch;loading=true;checking=null;host.clear();state('checking');message('正在辨識這支手機…');
 try{
  const lease=await client.resumePhone(id);if(expected!==epoch || !lease)return false;
  active=true;expiresAt=lease.expiresAt;loading=false;
  const ok=await refresh(false);if(!ok)return false;
  scope.PortalLogout?.notifyLogin();scope.clearTimeout(expiryTimer);
  expiryTimer=scope.setTimeout(()=>{active=false;void resumePhone();},Math.max(0,expiresAt-Date.now()));return true;
 }catch{if(expected===epoch)wipe('手機驗證未完成，請確認連線；若裝置已撤銷，請重新驗證。');return false;}
 finally{if(expected===epoch)loading=false;}
}
async function resume(){
 if(active || loading || checking)return;
 let existingDevice='';try{existingDevice=scope.localStorage.getItem(DEVICE_KEY)||'';}catch{}
 const lease=client.restore(existingDevice);if(!lease){if(host.ownerPhone)await resumePhone();return;}
 epoch++;active=true;expiresAt=lease.expiresAt;
 await refresh();
 if(active){scope.clearTimeout(expiryTimer);expiryTimer=scope.setTimeout(()=>{active=false;void resumePhone();},Math.max(0,expiresAt-Date.now()));}
}
function navigateVerified(module){guarded=true;try{host.navigate(module);}finally{guarded=false;}}
function configure(value){host=value;if(ready)mount();}
function mount(){if(!host || panel || !DASHBOARD_B_CLIENT_ENABLED_)return;
 let storage,phoneStorage;try{storage=scope.sessionStorage;if(host.ownerPhone)phoneStorage=scope.localStorage;}catch{}
 client=createDashboardBClient(OWNER,{storage,phoneStorage,logoutEpoch:()=>{try{return JSON.parse(scope.localStorage.getItem('north12b_portal_logout_event_v1')||'null')?.id||'';}catch{return '';}}});panel=document.createElement('section');panel.id='dashboard-b-access';panel.setAttribute('aria-label','指定密碼登入');panel.dataset.state='locked';
 panel.innerHTML=`<h2>員編與密碼登入</h2>
 <form data-b-form><label>員工編號<input data-b-employee required autocomplete="username" autocapitalize="characters" maxlength="12" placeholder="輸入員工編號"></label><label>指定密碼<input data-b-password required type="password" autocomplete="off" maxlength="1024" placeholder="輸入指定密碼"></label><button data-b-submit type="submit">登入這台裝置</button></form>
 <p data-b-message role="status">同仁首次登入會綁定這台裝置；已授權督導可跨裝置登入。</p>
 <div class="b-toolbar"><nav class="b-modules" aria-label="資料入口"><button type="button" data-b-module="kpi">KPI</button><button type="button" data-b-module="awards">台獎</button><button type="button" data-b-module="personal">個績</button><button type="button" data-b-return>返回</button></nav><nav class="b-account" aria-label="登入管理"><button type="button" data-b-a>原員編通道</button><button type="button" data-b-phone hidden>綁定這支手機，之後免輸帳密</button><button type="button" data-b-refresh>重新核驗</button><button type="button" data-b-logout>登出</button></nav></div>`;
 const style=document.createElement('style');style.textContent=`
 body.dashboard-b-password-mode .dashboard-b-legacy-root{display:none!important}
 body.dashboard-b-legacy-mode #dashboard-b-access{display:none!important}
 body.dashboard-b-legacy-mode .dashboard-b-legacy-root{display:block!important}
 #dashboard-b-access{box-sizing:border-box;width:calc(100% - 40px);max-width:1640px;margin:0 auto 20px;padding:14px 0 16px;border-bottom:1px solid #e5e7eb;background:transparent;color:inherit;font-family:inherit;font-size:15px;line-height:1.55}
 #home-login #dashboard-b-access{width:100%;max-width:none;margin:0;padding:0 0 18px}
 #home-login [data-b-return]{display:none}
 #dashboard-b-access *{box-sizing:border-box}
 #dashboard-b-access h2{margin:0 0 14px;font-size:18px;line-height:1.45;font-weight:700;color:inherit}
 #dashboard-b-access[data-state="active"] form{display:none}
 #dashboard-b-access form{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;align-items:end;gap:14px;margin:0}
 #dashboard-b-access label{display:grid;gap:6px;min-width:0;margin:0;font-size:13px;font-weight:600}
 #dashboard-b-access input{display:block;width:100%;height:44px;min-height:44px;margin:0;padding:9px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#172033;font:inherit;font-size:16px;font-weight:400}
 #dashboard-b-access button{min-height:40px;margin:0;padding:8px 14px;border:1px solid #d8dee8;border-radius:8px;background:#fff;color:#475569;font:inherit;font-size:14px;font-weight:600;line-height:1.4;white-space:nowrap;cursor:pointer}
 #dashboard-b-access [data-b-submit]{height:44px;padding:9px 22px;border-color:#ea580c;background:#ea580c;color:#fff;font-size:15px}
 #dashboard-b-access [data-b-message]{margin:10px 0 16px;color:#64748b;font-size:13px;line-height:1.6}
 #dashboard-b-access .b-toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-top:14px;border-top:1px solid #edf0f4}
 #dashboard-b-access nav{display:flex;flex-wrap:wrap;gap:8px}
 #dashboard-b-access .b-modules button{border-color:#fed7aa;background:#fff7ed;color:#9a3412}
 #dashboard-b-access [data-b-logout]{color:#b91c1c}
 #dashboard-b-access button:hover{filter:brightness(.96)}
 #dashboard-b-access input:focus-visible,#dashboard-b-access button:focus-visible{outline:3px solid #fdba74;outline-offset:2px}
 #dashboard-b-access button:disabled{opacity:.6;cursor:wait}
 @media(max-width:1100px){#dashboard-b-access{width:calc(100% - 40px)}}
 @media(max-width:760px){#dashboard-b-access{width:calc(100% - 40px)}}
 @media(max-width:600px){#dashboard-b-access{margin-bottom:12px;padding:12px 0 14px}#dashboard-b-access form{grid-template-columns:1fr;gap:12px}#dashboard-b-access [data-b-submit]{width:100%}#dashboard-b-access .b-toolbar{align-items:stretch;gap:12px}#dashboard-b-access nav{width:100%}#dashboard-b-access nav button{flex:1;padding:8px 10px}}
 `;document.head.append(style);setAccessMode('password');const mountPoint=host.mountSelector&&document.querySelector(host.mountSelector);if(mountPoint)mountPoint.prepend(panel);else{const header=document.querySelector('header');if(header)header.insertAdjacentElement('afterend',panel);else document.body.prepend(panel);}if(!legacyObserver){legacyObserver=new MutationObserver(markLegacyRoots);legacyObserver.observe(document.body,{childList:true,subtree:true});}panel.querySelector('form').addEventListener('submit',login);if(host.ownerPhone){panel.querySelector('[data-b-submit]').textContent='首次驗證並綁定這支手機';state('locked');message('只需首次驗證；綁定後平常開啟 App 免輸入帳密。登出會取消自動登入。');}
 panel.addEventListener('click',async event=>{const target=event.target.closest('button');if(!target)return;
  if(target.hasAttribute('data-b-a')){await scope.DashboardB.leaveForA();showLegacyAccess();return;}
  if(target.hasAttribute('data-b-logout')){await logout();return;}
  if(target.hasAttribute('data-b-phone')){target.disabled=true;try{await client.enrollPhone();state('active');message('已綁定這支手機，下次開啟 App 不用再輸入帳密。');}catch{message('手機綁定未完成；請確認連線或請管理者撤銷舊手機。');}finally{target.disabled=false;}return;}
  if(target.hasAttribute('data-b-refresh')){await refresh();return;}
  if(target.hasAttribute('data-b-return') || target.hasAttribute('data-b-module')){
   if(target.hasAttribute('data-b-return') && loading){await logout('已取消登入，返回原頁面。');host.navigate('return');return;}
   if(!active){message('請先登入指定密碼通道。');return;}
   if(await refresh())navigateVerified(target.dataset.bModule||'return');
  }
 });
 document.addEventListener('click',async event=>{
  if(!active || guarded || panel.contains(event.target) || !event.target.closest(host.navigationSelector))return;
  event.preventDefault();event.stopImmediatePropagation();const target=event.target.closest(host.navigationSelector);
  if(await refresh()){guarded=true;try{target.click();}finally{guarded=false;}}
 },true);
 for(const name of ['focus','pageshow'])scope.addEventListener(name,()=>{if(active)void refresh();else void resume();});
 document.addEventListener('visibilitychange',()=>{if(active && !document.hidden)void refresh();});
 const portalRegistered=Boolean(scope.PortalLogout?.registerMemoryRevoker);
 if(portalRegistered)scope.PortalLogout.registerMemoryRevoker(transport=>logout('網站已登出；指定密碼畫面已清除。',transport));
 scope.addEventListener('portal-before-logout',()=>{if(portalRegistered)wipe('網站已登出。',false);else void logout('網站已登出；指定密碼畫面已清除。');});
 scope.addEventListener('pagehide',()=>{epoch++;active=false;loading=false;checking=null;expiresAt=0;scope.clearTimeout(expiryTimer);client.suspend();host.clear();state('locked');});
 void resume();
}
scope.DashboardB=Object.freeze({configure,active:()=>active,refresh,context:()=>epoch,leaveForA:async()=>{if(!DASHBOARD_B_CLIENT_ENABLED_)return;if(active || checking || loading)await logout('已返回原員編通道。');else{epoch++;client?.clear();}},clear:()=>wipe()});
if(pendingHost)configure(pendingHost);
document.addEventListener('DOMContentLoaded',()=>{ready=true;mount();},{once:true});
})(window);
