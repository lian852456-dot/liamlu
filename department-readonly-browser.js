(function(){
  'use strict';
  const button=document.getElementById('departmentExportHTML'),status=document.getElementById('departmentExportStatus');
  if(!button)return;
  let busy=false;
  button.addEventListener('click',async()=>{
    if(busy)return;busy=true;button.disabled=true;status.textContent='正在核對已保存的店務與金牌來源…';
    try{
      if(!window.DepartmentReadonlyCore||!window.DepartmentReadonlyAssets||!window.DepartmentScoresReadonlySource||!window.DepartmentGoldReadonlySource)throw Error('HTML 匯出元件未載入，請重新整理。');
      await window.DepartmentGoldReadonlySource(true);
      await window.DepartmentScoresReadonlySource(true);
      // Recheck both domains after all asynchronous reads. Session or version
      // changes, background suspension and in-progress writes fail closed.
      const gold=window.DepartmentGoldReadonlySource(false);
      const scores=window.DepartmentScoresReadonlySource(false);
      const html=window.DepartmentReadonlyCore.createHTML({scores,gold},window.DepartmentReadonlyAssets);
      // No asynchronous boundary between the last checks and local download.
      const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
      const a=document.createElement('a');a.href=url;a.download='北一二部_店務金牌_唯讀_'+new Date().toISOString().slice(0,10)+'.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      status.textContent='已下載 HTML 唯讀版。包含已保存月份，可離線篩選；檔案只供本人保管，資料不會自動更新。';
    }catch(error){status.textContent='匯出停止：'+error.message;}
    finally{busy=false;button.disabled=false;}
  });
})();
