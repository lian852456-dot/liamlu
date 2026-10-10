'use strict';
(()=>{
 const OWNER='https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
 const $=id=>document.getElementById(id);let secret='',epoch=0,controller=null,passwordEpoch=null;
 const message=text=>{$('message').textContent=text;};
 function clearPasswords(){$('new-password').value='';$('confirm-password').value='';}
 function lock(){epoch++;passwordEpoch=null;clearPasswords();$('save-password').disabled=false;$('password-message').textContent='';controller?.abort();controller=null;secret='';$('secret').value='';$('users').replaceChildren();$('requests').replaceChildren();$('management').hidden=true;}
 async function rpc(action,args={}){const response=await fetch(OWNER,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,adminSecret:secret,...args}),signal:controller.signal});const data=await response.json();if(!response.ok||data.status==='error')throw Error('管理者驗證或操作未通過；請確認狀態後再試。');return data;}
 const cell=text=>{const e=document.createElement('td');e.textContent=text;return e;};
 function button(label,run){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=run;return b;}
 async function operate(question,action,args){if(!confirm(question))return;const expected=epoch;document.querySelectorAll('#management button').forEach(b=>b.disabled=true);try{await rpc(action,args);if(expected!==epoch)return;await load();message('操作完成，已重新讀回。');}catch(e){if(expected===epoch){message(e.message);$('management').hidden=true;}}}
 async function load(){const expected=epoch;const [data,pending]=await Promise.all([rpc('employee_admin_list'),rpc('private_admin_requests')]);if(expected!==epoch)return;
 passwordEpoch=data.passwordEpoch;$('password-version').textContent='目前密碼版本：'+passwordEpoch;
 const stamp=n=>new Date(n).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'});$('roster-status').textContent='名冊同步：'+stamp(data.roster.updatedAt)+'｜授權到期：'+stamp(data.roster.validUntil)+(data.roster.expired?'（已到期，需完成正式名冊同步）':'');
 const sync=data.roster.sync;$('sync-status').textContent=sync?'自動檢查：'+(sync.automatic?'每 6 小時':'尚未啟用，請更新一次名冊')+'｜最近結果：'+({updated:'更新成功','up-to-date':'來源未變更',failed:'更新失敗，請確認當日正式來源','not-run':'尚未執行'}[sync.result]||'待確認')+(sync.lastSuccess?'｜最近成功：'+stamp(sync.lastSuccess):''):'同步狀態待讀回';
 $('users').replaceChildren();for(const u of data.users){const row=document.createElement('tr');row.append(cell(u.employeeId+'／'+u.maskedName),cell(u.store+'／'+u.status));const actions=cell('');
 if(u.passwordBound)actions.append(button('解除密碼裝置',()=>operate('撤銷此員編的密碼登入連線及綁定，讓本人在新手機重新登入？','employee_admin_reset_device',{employeeId:u.employeeId})));
 if(u.status==='active')actions.append(button('停權',()=>operate('停用此員編並使現有登入失效？','private_admin_revoke',{employeeId:u.employeeId})));
 if(u.status==='revoked')actions.append(button('恢復資格',()=>operate('已核對正式名冊，確認此同仁仍在職並恢復資格？','private_admin_restore_eligibility',{employeeId:u.employeeId,restoreEligibility:true,currentRosterConfirmed:true})));
 if(!u.primarySupervisor&&(u.status==='active'||u.supervisor))actions.append(button(u.supervisor?'移除跨裝置資格':'授予督導跨裝置',()=>operate('確認變更此員編的密碼跨裝置資格？現有密碼登入將失效；獨立督導專區權限不變。','employee_admin_supervisor',{employeeId:u.employeeId,enabled:!u.supervisor})));
 row.append(actions);$('users').append(row);}
 $('requests').replaceChildren();for(const r of pending.requests||[]){const row=document.createElement('p');row.textContent=r.employeeId+'／'+r.requestedAt+' ';row.append(button('核准原通道裝置',()=>operate('核准這筆原員編通道裝置申請？','private_admin_approve',{requestId:r.requestId})));$('requests').append(row);}if(!(pending.requests||[]).length)$('requests').textContent='目前沒有待審核申請。';$('management').hidden=false;}
 $('unlock').onsubmit=async event=>{event.preventDefault();const value=$('secret').value;lock();secret=value;controller=new AbortController();const expected=epoch;message('驗證中…');try{await load();if(expected===epoch)message('已驗證，資料已讀回。');}catch(e){if(expected===epoch){lock();message(e.message);}}};$('lock').onclick=()=>{lock();message('管理區已鎖定。');};window.addEventListener('pagehide',lock);
 $('change-password').onsubmit=async event=>{
 event.preventDefault();let value=$('new-password').value;
 if(value.length<12||value.length>128||value!==$('confirm-password').value){$('password-message').textContent='請輸入 12～128 個字元，兩次密碼必須相同。';value='';return;}
 if(!Number.isSafeInteger(passwordEpoch)||passwordEpoch<1){clearPasswords();value='';$('password-message').textContent='請重新驗證管理者後再變更。';return;}
 if(!confirm('確定變更全體同仁指定密碼？所有既有密碼登入將立即失效，裝置綁定與停權設定保留。')){value='';return;}
 const expected=epoch,version=passwordEpoch;let submitted=false;
 $('save-password').disabled=true;$('password-message').textContent='正在安全處理並儲存…';clearPasswords();
 try{
 const salt=crypto.getRandomValues(new Uint8Array(32)),bytes=new TextEncoder().encode(value);value='';
 let key;try{key=await crypto.subtle.importKey('raw',bytes,'PBKDF2',false,['deriveBits']);}finally{bytes.fill(0);}
 const digest=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:600000,hash:'SHA-256'},key,256));
 const hex=a=>Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');
 const verifier={algorithm:'PBKDF2-HMAC-SHA256',iterations:600000,salt:hex(salt),digest:hex(digest)};digest.fill(0);
 if(expected!==epoch)return;
 submitted=true;const result=await rpc('employee_admin_rotate_password',{expectedEpoch:version,verifier});
 if(expected!==epoch)return;
 if(result.passwordEpoch!==version+1)throw Error('ROTATION_READBACK');
 await load();if(expected!==epoch)return;
 $('password-message').textContent='密碼已變更並讀回確認。舊密碼與既有密碼登入已失效，請通知同仁使用新密碼登入。';
 }catch(_){if(expected===epoch)$('password-message').textContent=submitted?'未取得變更成功確認，請重新驗證管理者並核對密碼版本，再使用新密碼測試登入；不要直接重送。':'密碼尚未送出，請確認瀏覽器支援安全連線後再試。';}
 finally{value='';if(expected===epoch){clearPasswords();$('save-password').disabled=false;}}
 };
 $('refresh-roster').onclick=async()=>{const expected=epoch;$('refresh-roster').disabled=true;message('正在核對當日正式來源並同步名冊…');try{const result=await rpc('employee_admin_refresh_roster');if(expected!==epoch)return;await load();message(result.result==='updated'?'名冊已更新，48 小時授權已續期並讀回。':'來源未變更，授權仍有效；已確認自動檢查。');}catch(e){if(expected===epoch){try{await load();}catch(_){lock();}message('名冊更新未完成；請查看同步狀態，既有停權與撤銷會保留。');}}finally{if(expected===epoch)$('refresh-roster').disabled=false;}};
})();
