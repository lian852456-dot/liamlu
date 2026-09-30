(function(){
  'use strict';
  const URL='https://script.google.com/macros/s/AKfycbxqBtW2yQw_u4qqJ9Knz6CK34hAiunaa6lIQu4pMa8Ff2voJZCWKEh8MXTJ6qAoGTax/exec';
  const KEY='bei12b_patrol_session_token_v2';
  const $=id=>document.getElementById(id);
  async function request(body){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);try{const response=await fetch(URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(body),signal:controller.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);const result=await response.json();if(result.status!=='ok')throw new Error(result.message||'讀取失敗');return result;}finally{clearTimeout(timer);}}
  function message(text){$('loginMessage').textContent=text;}
  async function open(token){const result=await request({action:'north12b_gold_read',token});window.openGoldDaily(result);$('loginPanel').hidden=true;$('viewerBadge').textContent='督導已驗證';$('viewerBadge').classList.add('ok');}
  $('loginForm').addEventListener('submit',async event=>{event.preventDefault();event.submitter.disabled=true;message('正在讀取日結…');try{const result=await request({action:'ptauth',key:$('passcode').value});sessionStorage.setItem(KEY,result.token);$('passcode').value='';await open(result.token);}catch(error){message(error.message);}finally{event.submitter.disabled=false;}});
  $('logoutButton').addEventListener('click',()=>{sessionStorage.removeItem(KEY);location.reload();});
  const token=sessionStorage.getItem(KEY);if(token)open(token).catch(error=>message(error.message));
})();
