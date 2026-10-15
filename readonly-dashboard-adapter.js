(function(root,factory){const node=typeof module==='object'&&module.exports;const api=factory(node?require('./readonly-dashboard-core.js'):root.ReadonlyDashboardCore,node?require('./kpi-battle-controller.js'):root.KpiBattleController,node?require('./awards-battle-controller.js'):root.AwardsBattleController);if(node)module.exports=api;else root.ReadonlyDashboardAdapter=api;})(typeof globalThis==='object'?globalThis:this,function(Core,Kpi,Awards){
  'use strict';
  function maskedName(value){const name=String(value||'').trim();if(/[＊*]/.test(name))return name;const letters=Array.from(name);return letters.length?letters[0]+'＊'.repeat(Math.max(1,letters.length-1)):'姓名未提供';}
  function fromBundle(bundle){
    const privateResult=bundle?.privateResult,kpiResult=bundle?.kpiResult;
    if(privateResult?.status!=='ok'||kpiResult?.status!=='ok'||!privateResult.profile||!kpiResult.data?.meta||!Array.isArray(kpiResult.data.stores)||!Array.isArray(kpiResult.data.persons))throw Error('尚未取得已驗證的正式資料');
    const snapshot=privateResult.snapshot;
    if(!snapshot?.kpiBattle||!snapshot.awardsBattle)throw Error('私有戰情來源不完整');
    const view=Kpi.mergeKpiBattleSupplement(Kpi.kpicalcToKpiBattleView(kpiResult.data,''),snapshot.kpiBattle);
    if(!/^20\d\d-\d\d-\d\d$/.test(view.data_as_of_date||''))throw Error('KPI 缺少可核實截止日');
    const storeRows=view.stores.map(row=>{const id=Core.storeId(row.store);if(!id)throw Error('KPI 含未核定門市');return {...row,id};});
    const personal=view.personal.map(row=>{const id=Core.storeId(row.store);if(!id)throw Error('個績含未核定門市');return {...row,id,name:maskedName(row.name)};});
    const ids=new Set(storeRows.map(row=>row.id));if(ids.size!==storeRows.length)throw Error('KPI 店點重複');
    const metadata={cutoff:view.data_as_of_date,reportDate:view.report_run_date||view.report_date,sourceName:view.source_file,period:view.source_date_range,version:String(snapshot.kpiBattle.processing_run_id||snapshot.kpiBattle.kpi_run_id||snapshot.publishedAt||'來源未提供版本')};
    const awardCheck=Awards.validateAwardsBattle(snapshot.awardsBattle,view,snapshot.kpiBattle);
    let conversion=null,conversionReason='尚未匯入已核實的 AQ／RT 締結率報表。';
    if(snapshot.conversionBattle){try{conversion=Core.validateConversion(snapshot.conversionBattle);}catch{conversionReason='締結率來源未通過完整性檢查，請核對原檔後重新更新。';}}
    return {profile:{store:privateResult.profile.store,role:privateResult.profile.role},stores:Core.STORES.filter(s=>ids.has(s.id)),
      kpi:{...metadata,data:view,stores:storeRows,available:true},personal:{...metadata,records:personal,available:personal.length>0},
      awards:{available:awardCheck.ok,data:awardCheck.ok?snapshot.awardsBattle:null,reason:awardCheck.reason,
        cutoff:snapshot.awardsBattle.data_as_of_date||snapshot.awardsBattle.source_as_of_date||'',reportDate:snapshot.awardsBattle.report_run_date||snapshot.awardsBattle.report_date||'',version:String(snapshot.awardsBattle.processing_run_id||snapshot.publishedAt||'來源未提供版本')},
      conversion,conversionReason};
  }
  return Object.freeze({fromBundle});
});
