(function(){
  'use strict';
  const GAS_URL='https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
  const $=id=>document.getElementById(id);
  let generation=0;
  function message(text,type){$('loadStatus').textContent=text;$('loadStatus').className=`message${type?` ${type}`:''}`;}
  async function refresh(){
    const current=++generation;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),45000);
    $('refreshButton').disabled=true;
    $('goldViewer').hidden=true;
    message('正在讀取金牌資料…');
    try{
      const response=await fetch(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'department_gold_access'}),cache:'no-store',credentials:'omit',signal:controller.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const result=await response.json();
      if(current!==generation)return;
      if(result?.status!=='ok'||!result.ledger)throw new Error(result?.message||'金牌資料讀取失敗');
      window.openGoldDaily(result);
      message('已載入已確認的金牌結算。','success');
    }catch(error){
      if(current!==generation)return;
      $('goldViewer').hidden=true;
      message(error.name==='AbortError'?'讀取逾時，請重新整理。':(error.message||'金牌資料讀取失敗'),'error');
    }finally{clearTimeout(timer);if(current===generation)$('refreshButton').disabled=false;}
  }
  $('refreshButton').addEventListener('click',refresh);
  window.addEventListener('pagehide',()=>{generation++;$('goldViewer').hidden=true;});
  window.addEventListener('pageshow',event=>{if(event.persisted)refresh();});
  refresh();
})();
