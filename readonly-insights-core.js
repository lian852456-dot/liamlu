(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./readonly-dashboard-core.js'):root.ReadonlyDashboardCore);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ReadonlyInsightsCore=api;
})(typeof globalThis==='object'?globalThis:this,function(C){
  'use strict';
  const MIN_SAMPLE=30;
  function ratio(n,d){return d>0?n/d:null;}
  function growth(now,before){return before>0?(now-before)/before:null;}
  function deltaRate(now,before){return now==null||before==null?null:now-before;}
  function comparable(now,prior){
    return prior?{
      traffic:growth(now.rt_d,prior.rt_d),
      renewals:growth(now.rt_n,prior.rt_n),
      ratePP:deltaRate(now.rt_rate,prior.rt_rate),
      aqTraffic:growth(now.aq_d,prior.aq_d)
    }:null;
  }
  function evaluate(data,authorizedStores){
    if(!data||!Array.isArray(data.records))throw Error('缺少已驗證的締結率資料');
    const ids=new Set(authorizedStores.map(s=>s.id));
    const selected=C.STORES.filter(s=>ids.has(s.id));
    if(!selected.length)throw Error('缺少授權門市');
    const currentRows=data.records.filter(r=>ids.has(r.store));
    const overall=C.aggregate(currentRows);
    const previous=data.prior?C.aggregate(data.prior.filter(r=>ids.has(r.store))):null;
    const stores=selected.map(s=>{
      const now=C.aggregate(currentRows.filter(r=>r.store===s.id));
      const prev=data.prior?C.aggregate(data.prior.filter(r=>r.store===s.id)):null;
      const sampleOK=now.rt_d>=MIN_SAMPLE;
      const gapPP=sampleOK?deltaRate(now.rt_rate,overall.rt_rate):null;
      const achievable=sampleOK&&gapPP<0&&overall.rt_rate!=null?
        Math.max(0,Math.ceil(overall.rt_rate*now.rt_d-1e-10)-now.rt_n):null;
      const mom=comparable(now,prev);
      let severity=0,trigger=null;
      if(gapPP!=null&&gapPP<=-0.05){severity=3;trigger='締結率落後區平均';}
      else if(sampleOK&&mom?.ratePP!=null&&mom.ratePP<=-0.05){severity=2;trigger='締結率 MoM 下滑';}
      else if(sampleOK&&mom?.traffic!=null&&mom.traffic<=-0.10){severity=1;trigger='符合資格來客 MoM 下滑';}
      return {...s,now,prev,mom,gapPP,achievable,trigger,severity,sampleOK};
    });
    const prioritized=stores.filter(s=>s.severity>0).sort((a,b)=>b.severity-a.severity||(b.achievable||0)-(a.achievable||0)||a.short.localeCompare(b.short,'zh-TW'));
    const visible=stores.slice().sort((a,b)=>b.severity-a.severity||(a.now.rt_rate??-1)-(b.now.rt_rate??-1)||a.short.localeCompare(b.short,'zh-TW'));
    return {
      period_start:data.period_start,cutoff:data.cutoff,source_name:data.source_name,sha256:data.sha256,
      total:overall,previous,mom:comparable(overall,previous),stores:visible,prioritized,
      opportunity:stores.reduce((sum,s)=>sum+(s.achievable||0),0),
      sampleMinimum:MIN_SAMPLE,hasPrior:!!data.prior
    };
  }
  function actions(row){
    if(!row.sampleOK)return [{title:'先確認樣本',detail:'本期符合資格進店人次不足 30；先累積有效資料，不以短期波動判定門市績效。'}];
    const list=[];
    if(row.gapPP!=null&&row.gapPP<=-0.05)list.push({
      title:'抽查未續約原因',
      detail:'店長每日抽查 3 筆符合續約資格但未成交的案例，將原因分類為價格、設備、方案資格、需求不符或其他；核對是否有提供適用維繫選項。'
    });
    if(row.mom?.ratePP!=null&&row.mom.ratePP<=-0.05)list.push({
      title:'比對上月轉換差異',
      detail:'比較同期間的有效來客與續約數，並確認 Tier／TWM-TST 結構是否改變；結構資料未接入前，不歸因於個人銷售能力。'
    });
    if(row.mom?.traffic!=null&&row.mom.traffic<=-0.10)list.push({
      title:'檢視來客動能',
      detail:'檢視平假日、時段及既有預約邀約狀況，確認來客減少是客源波動、營業日差異或缺少邀約；不以未查證原因直接定案。'
    });
    if(!list.length)list.push({
      title:'維持並複製有效作法',
      detail:'目前沒有達到明確異常門檻的訊號；持續追蹤週別來客與締結效率，並分享本店可驗證的服務流程。'
    });
    return list.slice(0,3);
  }
  return Object.freeze({MIN_SAMPLE,evaluate,actions,ratio,growth,deltaRate});
});