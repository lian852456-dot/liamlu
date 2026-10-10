'use strict';
(()=>{
 const OWNER='https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
 const $=id=>document.getElementById(id);let secret='',epoch=0,controller=null;
 const message=text=>{$('message').textContent=text;};
 function lock(){epoch++;controller?.abort();controller=null;secret='';$('secret').value='';$('users').replaceChildren();$('requests').replaceChildren();$('management').hidden=true;}
 async function rpc(action,args={}){const response=await fetch(OWNER,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,adminSecret:secret,...args}),signal:controller.signal});const data=await response.json();if(!response.ok||data.status==='error')throw Error('管理者驗證或操作未通過；請確認狀態後再試。');return data;}
 const cell=text=>{const e=document.createElement('td');e.textContent=text;return e;};
 function button(label,run){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=run;return b;}
 async function operate(question,action,args){if(!confirm(question))return;const expected=epoch;document.querySelectorAll('#management button').forEach(b=>b.disabled=true);try{await rpc(action,args);if(expected!==epoch)return;await load();message('操作完成，已重新讀回。');}catch(e){if(expected===epoch){message(e.message);$('management').hidden=true;}}}
 async function load(){const expected=epoch;const [data,pending]=await Promise.all([rpc('employee_admin_list'),rpc('private_admin_requests')]);if(expected!==epoch)return;
 const stamp=n=>new Date(n).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'});$('roster-status').textContent='名冊同步：'+stamp(data.roster.updatedAt)+'｜授權到期：'+stamp(data.roster.validUntil)+(data.roster.expired?'（已到期，需完成正式名冊同步）':'');
 $('users').replaceChildren();for(const u of data.users){const row=document.createElement('tr');row.append(cell(u.employeeId+'／'+u.maskedName),cell(u.store+'／'+u.status));const actions=cell('');
 if(u.passwordBound)actions.append(button('解除密碼裝置',()=>operate('撤銷此員編的密碼登入連線及綁定，讓本人在新手機重新登入？','employee_admin_reset_device',{employeeId:u.employeeId})));
 if(u.status==='active')actions.append(button('停權',()=>operate('停用此員編並使現有登入失效？','private_admin_revoke',{employeeId:u.employeeId})));
 if(u.status==='revoked')actions.append(button('恢復資格',()=>operate('已核對正式名冊，確認此同仁仍在職並恢復資格？','private_admin_restore_eligibility',{employeeId:u.employeeId,restoreEligibility:true,currentRosterConfirmed:true})));
 if(!u.primarySupervisor&&(u.status==='active'||u.supervisor))actions.append(button(u.supervisor?'移除跨裝置資格':'授予督導跨裝置',()=>operate('確認變更此員編的密碼跨裝置資格？現有密碼登入將失效；獨立督導專區權限不變。','employee_admin_supervisor',{employeeId:u.employeeId,enabled:!u.supervisor})));
 row.append(actions);$('users').append(row);}
 $('requests').replaceChildren();for(const r of pending.requests||[]){const row=document.createElement('p');row.textContent=r.employeeId+'／'+r.requestedAt+' ';row.append(button('核准原通道裝置',()=>operate('核准這筆原員編通道裝置申請？','private_admin_approve',{requestId:r.requestId})));$('requests').append(row);}if(!(pending.requests||[]).length)$('requests').textContent='目前沒有待審核申請。';$('management').hidden=false;}
 $('unlock').onsubmit=async event=>{event.preventDefault();const value=$('secret').value;lock();secret=value;controller=new AbortController();const expected=epoch;message('驗證中…');try{await load();if(expected===epoch)message('已驗證，資料已讀回。');}catch(e){if(expected===epoch){lock();message(e.message);}}};$('lock').onclick=()=>{lock();message('管理區已鎖定。');};window.addEventListener('pagehide',lock);
})();
