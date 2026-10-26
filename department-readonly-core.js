(function(root,factory){
  const api=typeof module==='object'&&module.exports?factory(require('./department-scores-core.js'),require('./department-gold-monthly-core.js')):factory(root.DepartmentScoresCore,root.DepartmentGoldMonthlyCore);
  if(typeof module==='object'&&module.exports)module.exports=api;else root.DepartmentReadonlyCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(S,G){
  'use strict';
  const SCHEMA='north12-department-readonly/v1';
  const text=v=>String(v==null?'':v);
  const pick=(value,keys)=>Object.fromEntries(keys.map(k=>[k,text(value?.[k])]));
  function unique(months){const keys=months.map(m=>m.monthKey||m.month?.monthKey);if(new Set(keys).size!==keys.length)throw Error('保存月份重複');return months;}
  // Only display fields enter the file. Never serialize a backend response, auth state,
  // registry, history, receipt or the unrelated source/activity columns wholesale.
  function project({scores,gold,capturedAt=new Date().toISOString()}){
    if(!Number.isFinite(Date.parse(capturedAt)))throw Error('匯出時間不正確');
    const out={schema:SCHEMA,capturedAt:new Date(capturedAt).toISOString(),scores:null,gold:null};
    if(scores){
      if(scores.contract!==S.CONTRACT||!Number.isInteger(scores.generation)||!Array.isArray(scores.months)||!scores.months.length)throw Error('店務保存來源不完整');
      out.scores={generation:scores.generation,readVersion:text(scores.readVersion),months:unique(scores.months.map(slot=>({month:S.validateMonth(slot.month),active:pick(slot.active,['revision','publishedAt','sourceName','sourceHash','contentHash'])})))};
    }
    if(gold){
      if(!gold.monthly?.revision||!Array.isArray(gold.gold?.months)||!gold.gold.months.length)throw Error('金牌保存來源不完整');
      out.gold={revision:text(gold.monthly.revision),readVersion:text(gold.readVersion),months:unique(gold.gold.months.map(m=>{
        G.quarter(m.monthKey);
        const meta={monthKey:m.monthKey,sheetName:text(m.sheetName),sourceName:text(m.sourceName),sourceHash:text(m.sourceHash),versionId:text(m.versionId),publishedAt:text(m.publishedAt),dateRange:pick(m.dateRange,['start','end','cutoff'])};
        if(m.monthKey<'2026-07')return {...meta,settlementStatus:'archived',records:[]};
        // Legacy rows have no v2 hash. Preserve their existing provisional status.
        const rows=m.legacy?m.records:G.validateMonth(m).records;
        if(!Array.isArray(rows)||!rows.length)throw Error('金牌月份沒有保存人員');
        const ids=new Set();
        const records=rows.map(r=>{
          if(!G.REGIONS.includes(r.region)||!r.employeeId||!r.employeeName||!r.storeCode||!r.store||!Number.isFinite(r.medal)||ids.has(r.employeeId))throw Error('金牌保存人員不完整或重複');
          ids.add(r.employeeId);
          return {...pick(r,['employeeId','employeeName','region','storeCode','store','role']),medal:r.medal};
        });
        G.summarize(records);
        return {...meta,settlementStatus:m.settlementStatus==='final'?'final':'provisional',records};
      }))};
    }
    if(!out.scores&&!out.gold)throw Error('沒有可核對的保存來源');
    return out;
  }
  const json=v=>JSON.stringify(v).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  function createHTML(input,assets){
    const data=project(input);
    if(!assets?.template||!assets.css||!assets.runtime||!assets.scoresCore||!assets.goldCore)throw Error('離線顯示元件未載入');
    const script=s=>'<script>'+s.replace(/<\/script/gi,'<\\/script')+'</script>';
    return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex,nofollow,noarchive"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; connect-src \'none\'; img-src data:; form-action \'none\'; base-uri \'none\'; frame-src \'none\'; object-src \'none\'"><title>北一二部｜店務／金牌唯讀快照</title><style>'+assets.css.replace(/<\/style/gi,'<\\/style')+'</style></head><body>'+assets.template+'<script type="application/json" id="departmentSnapshot">'+json(data)+'</script>'+script(assets.scoresCore)+script(assets.goldCore)+script(assets.runtime)+'</body></html>';
  }
  return {SCHEMA,project,createHTML};
});
