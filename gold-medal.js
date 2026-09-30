(function(){
  'use strict';
  const GAS_URL='https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
  const EMPLOYEE_KEY='north12b_private_dashboard_employee_id';
  const DEVICE_KEY='north12b_private_dashboard_device_id';
  const $=id=>document.getElementById(id);
  function deviceId(){let id=localStorage.getItem(DEVICE_KEY);if(id)return id;id=crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');localStorage.setItem(DEVICE_KEY,id);return id;}
  function message(text,type){$('loginMessage').textContent=text||'';$('loginMessage').className=`message${type?` ${type}`:''}`;}
  async function request(body){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),45000);try{const response=await fetch(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),signal:controller.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);const result=await response.json();if(result?.status!=='ok')throw new Error(result?.message||'讀取失敗');return result;}finally{clearTimeout(timer);}}
  function openViewer(result,employeeId){
    if(!result.ledger) throw new Error('日結讀取服務尚未更新，請稍後再試');
    window.openGoldDaily(result);
    localStorage.setItem(EMPLOYEE_KEY,employeeId);
    $('loginPanel').hidden=true;
    $('viewerBadge').textContent=`${result.profile?.maskedName||'已登入'}｜${result.profile?.store||''}`;
    $('viewerBadge').classList.add('ok');
  }
  async function login(employeeId){message('正在讀取受保護資料…');const result=await request({action:'department_gold_access',employeeId,deviceId:deviceId()});openViewer(result,employeeId);}
  $('loginForm').addEventListener('submit',async event=>{event.preventDefault();const employeeId=$('employeeId').value.trim().toUpperCase();event.submitter.disabled=true;try{await login(employeeId);}catch(error){message(error.message||'讀取失敗','error');}finally{event.submitter.disabled=false;}});
  $('bindingForm').addEventListener('submit',async event=>{event.preventDefault();event.submitter.disabled=true;try{const employeeId=$('bindingEmployeeId').value.trim().toUpperCase();const result=await request({action:'private_request',employeeId,bootstrapCode:$('bootstrapCode').value,deviceId:deviceId()});message(result.message||'已送出核准申請','success');}catch(error){message(error.message||'申請失敗','error');}finally{event.submitter.disabled=false;}});
  $('logoutButton').addEventListener('click',()=>{localStorage.removeItem(EMPLOYEE_KEY);location.reload();});
  const saved=localStorage.getItem(EMPLOYEE_KEY)||'';$('employeeId').value=saved;$('bindingEmployeeId').value=saved;
})();
