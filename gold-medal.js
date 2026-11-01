(function(){
  'use strict';
  const GAS_URL='https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
  const $=id=>document.getElementById(id);
  let generation=0, loadedAt='', loading=false;
  function message(text,type){$('loadStatus').textContent=text;$('loadStatus').className=`message${type?` ${type}`:''}`;}
  async function refresh(){
    if(loading)return;
    loading=true;
    const current=++generation;
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),45000);
    $('refreshButton').disabled=true;
    message(loadedAt?`正在更新，仍顯示上次資料（${loadedAt}）…`:'正在讀取金牌資料…');
    try{
      const response=await fetch(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'department_gold_access'}),cache:'no-store',credentials:'omit',signal:controller.signal});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const result=await response.json();
      if(current!==generation)return;
      if(result?.status!=='ok'||result.ledger?.schema!=='north12b-public-gold/v1')throw new Error(result?.message||'金牌資料讀取失敗');
      window.openGoldDaily(result);
      loadedAt=new Date().toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
      message(`已載入已確認的金牌結算。上次讀取：${loadedAt}；需要最新資料時請按「更新資料」。`,'success');
    }catch(error){
      if(current!==generation)return;
      if(!loadedAt)$('goldViewer').hidden=true;
      const detail=error.name==='AbortError'?'讀取逾時':(error.message||'金牌資料讀取失敗');
      message(loadedAt?`更新失敗：${detail}。仍顯示上次資料（${loadedAt}），請稍後手動更新。`:detail,'error');
    }finally{clearTimeout(timer);loading=false;if(current===generation)$('refreshButton').disabled=false;}
  }
  $('refreshButton').addEventListener('click',refresh);
  // Keep the document, its filters and completed read when restored from bfcache.
  refresh();
})();
