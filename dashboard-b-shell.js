(function(scope){
'use strict';
const DASHBOARD_B_CLIENT_ENABLED_ = true;
const OWNER='https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
const DEVICE_KEY='north12b_private_dashboard_device_id';
let host,client,active=false,epoch=0,expiresAt=0,expiryTimer,ready=false,loading=false,guarded=false,checking=null,panel;
const pendingHost=scope.DashboardBHost;
function message(text){if(panel)panel.querySelector('[data-b-message]').textContent=text;}
function state(name){if(panel)panel.dataset.state=name;}
function wipe(note='請重新輸入員編與指定密碼。',clearTransport=true){
 epoch++;active=false;loading=false;expiresAt=0;scope.clearTimeout(expiryTimer);if(clearTransport)client?.clear();checking=null;host?.clear();state('locked');message(note);
 if(panel)panel.querySelector('[data-b-password]').value='';
}
function device(){let value=scope.localStorage.getItem(DEVICE_KEY);if(value)return value;
 value=Array.from(scope.crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');scope.localStorage.setItem(DEVICE_KEY,value);return value;}
async function logout(note='已登出指定密碼通道；裝置綁定保留。',transport){
 const operation=client?.logout(transport);wipe(note,false);
 try{await operation;return true;}catch{message('畫面已清除；伺服器登出未確認，請關閉本頁。原 session 最多存活至原30分鐘期限。');return false;}
}
function checkProfile(result){if(!result?.profile || result.profile.role!=='employee' || result.profile.isTrusted!==false || result.trustSource!=='password-bound')throw Error('B_AUTH_DENIED');}
async function refresh(){
 if(!active)return false;if(checking)return checking;
 const expected=epoch;host.clear();state('checking');
 checking=(async()=>{try{
  const status=await client.status();if(!status.enabled || !status.passwordAvailable)throw Error('B_DISABLED');
  const lease=await client.validate();if(lease.expiresAt!==expiresAt || expiresAt<=Date.now())throw Error('B_AUTH_DENIED');
  const [privateResult,kpiResult]=await Promise.all([client.read('private'),client.read('kpi')]);
  if(expected!==epoch)return false;checkProfile(privateResult);checkProfile(kpiResult);
  host.accept({privateResult,kpiResult});state('active');message('指定密碼已驗證；KPI、台獎、個績唯讀。');return true;
 }catch(error){if(expected===epoch)wipe(error.message==='B_TIMEOUT'?'服務逾時，畫面已清除；請重新登入。':'登入已失效或通道關閉，請重新登入。');return false;}
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
  const ok=await refresh();if(!ok)return;scope.PortalLogout?.notifyLogin();
  scope.clearTimeout(expiryTimer);expiryTimer=scope.setTimeout(()=>wipe('登入已到期，請重新輸入指定密碼。'),Math.max(0,expiresAt-Date.now()));
 }catch(error){if(expected===epoch)wipe(error.message==='B_DISABLED'?'指定密碼通道尚未開放，請使用原員編通道。':error.message==='B_TIMEOUT'?'服務逾時，請重新登入；不會自動重送。':'無法登入，請核對員編、指定密碼及裝置。');}
 finally{password='';if(expected===epoch)loading=false;if(!loading)submit.disabled=false;}
}
function navigateVerified(module){guarded=true;try{host.navigate(module);}finally{guarded=false;}}
function configure(value){host=value;if(ready)mount();}
function mount(){if(!host || panel || !DASHBOARD_B_CLIENT_ENABLED_)return;
 client=createDashboardBClient(OWNER);panel=document.createElement('section');panel.id='dashboard-b-access';panel.setAttribute('aria-label','指定密碼登入');panel.dataset.state='locked';
 panel.style.cssText='box-sizing:border-box;max-width:680px;margin:16px auto;padding:16px;border:1px solid #cbd5e1;border-radius:12px;background:white;color:#172033;font:16px/1.6 system-ui';
 panel.innerHTML='<h2 style="margin:0 0 8px;font-size:20px">指定密碼登入</h2><form data-b-form style="display:flex;flex-wrap:wrap;gap:10px"><label>員工編號 <input data-b-employee required autocomplete="username" autocapitalize="characters" maxlength="12"></label><label>指定密碼 <input data-b-password required type="password" autocomplete="off" maxlength="1024"></label><button data-b-submit type="submit">登入這台裝置</button></form><p data-b-message role="status">首次登入會綁定這台裝置。指定密碼僅用於本次驗證。</p><nav style="display:flex;flex-wrap:wrap;gap:10px" aria-label="指定密碼資料"><button type="button" data-b-module="kpi">KPI</button><button type="button" data-b-module="awards">台獎</button><button type="button" data-b-module="personal">個績</button><button type="button" data-b-return>返回</button><button type="button" data-b-a>原員編通道</button><button type="button" data-b-refresh>重新核驗</button><button type="button" data-b-logout>登出指定密碼</button></nav>';
 const style=document.createElement('style');style.textContent='#dashboard-b-access{width:calc(100% - 32px)}#dashboard-b-access label{display:grid;gap:4px;flex:1;min-width:160px}#dashboard-b-access input{box-sizing:border-box;width:100%;min-height:44px;padding:8px;border:1px solid #94a3b8;border-radius:6px;background:#fff;color:#172033;font:inherit}#dashboard-b-access button{min-height:44px;padding:8px 12px;border:1px solid #0369a1;border-radius:6px;background:#0369a1;color:#fff;font:inherit;cursor:pointer}#dashboard-b-access button:disabled{opacity:.6;cursor:wait}#dashboard-b-access h2{color:#172033}';document.head.append(style);document.body.prepend(panel);panel.querySelector('form').addEventListener('submit',login);
 panel.addEventListener('click',async event=>{const target=event.target.closest('button');if(!target)return;
  if(target.hasAttribute('data-b-a')){await scope.DashboardB.leaveForA();host.navigate('kpi');return;}
  if(target.hasAttribute('data-b-logout')){await logout();return;}
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
 for(const name of ['focus','pageshow'])scope.addEventListener(name,()=>{if(active)void refresh();});
 document.addEventListener('visibilitychange',()=>{if(active && !document.hidden)void refresh();});
 const portalRegistered=Boolean(scope.PortalLogout?.registerMemoryRevoker);
 if(portalRegistered)scope.PortalLogout.registerMemoryRevoker(transport=>logout('網站已登出；指定密碼畫面已清除。',transport));
 scope.addEventListener('portal-before-logout',()=>{if(portalRegistered)wipe('網站已登出。',false);else void logout('網站已登出；指定密碼畫面已清除。');});
 scope.addEventListener('pagehide',()=>wipe());
}
scope.DashboardB=Object.freeze({configure,active:()=>active,refresh,context:()=>epoch,leaveForA:async()=>{if(!DASHBOARD_B_CLIENT_ENABLED_)return;if(active || checking || loading)await logout('已返回原員編通道。');else{epoch++;client?.clear();}},clear:()=>wipe()});
if(pendingHost)configure(pendingHost);
document.addEventListener('DOMContentLoaded',()=>{ready=true;mount();},{once:true});
})(window);
