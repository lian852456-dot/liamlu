(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./north12-officer-core'):root.North12OfficerCore,
    node?require('./readonly-dashboard-core'):root.ReadonlyDashboardCore,
    node?require('./readonly-renewal-detail'):root.ReadonlyRenewalDetail);
  if(node)module.exports=api;else root.North12OfficeSource=api;
})(globalThis,function(C,Base,Detail){
  'use strict';
  function read(raw,X,data){
    const book=C.normalizeWorkbook(raw,X);
    const [aq,rt,total]=['AQ締結率','RT每日','RT締結率'].map(n=>X.utils.sheet_to_json(book.Sheets[n],{header:1,raw:true,defval:null}));
    const member=r=>/^DNB\d{5}$/.test(r[3]);
    const names=new Set(aq.filter(r=>member(r)&&C.REGIONS.includes(r[2])).map(r=>r[0]));
    const [name]=names;
    if(names.size!==1||typeof name!=='string'||!name.trim())throw Error('處級基準未提供');
    function summary(rows){
      const items=rows.filter(r=>!r[0]&&!r[1]&&!r[2]&&r[3]===name&&r.slice(5,8).some(Number.isFinite));
      if(items.length!==1)throw Error('缺少可核對的 '+name+' 合計列');
      return items[0];
    }
    const [aSum,rSum,tSum]=[aq,rt,total].map(summary);
    function catalog(rows){
      const result=new Map();
      for(const row of rows.filter(r=>member(r)&&r[0]===name)){
        if(result.has(row[3]))throw Error('處級店碼重複');
        result.set(row[3],row);
      }
      return result;
    }
    const [aa,rr,tt]=[aq,rt,total].map(catalog);
    const stores=[...aa.values()].map(r=>({id:r[3],region:r[2],name:r[4],short:r[4]}));
    const map=Base.workbookLayout(aq,rt,total,stores,{includePrior:false,allowMissingRtRate:true});
    const {aq:A,rt:R,totals:T}=map,records=[];
    const integer=v=>{if(!Number.isSafeInteger(v)||v<0)throw Error('處級分子分母或店日缺值');return v;};
    function values(a,r,j){return {aq_n:integer(a[A.n+j]),aq_d:integer(a[A.d+j]),
      rt_n:integer(r[R.twN+j])+integer(r[R.tsN+j]),rt_d:integer(r[R.twD+j])+integer(r[R.tsD+j])};}
    if(aa.size!==tt.size)throw Error('處級 AQ／RT 名冊不同');
    for(const s of stores){
      const a=aa.get(s.id),r=rr.get(s.id),t=tt.get(s.id);
      if(!r||!t||!s.name||!s.region||[r,t].some(other=>[0,1,2,3,4].some(i=>other[i]!==a[i])))throw Error('處級店名或組織無法核對');
      const rows=map.dates.filter(d=>d<=data.cutoff).map((date,j)=>({store:s.id,date,...values(a,r,j)}));
      const summed=C.aggregate(rows);
      if(summed.aq_n!==a[A.total.n]||summed.aq_d!==a[A.total.d]||summed.rt_n!==t[T.n]||summed.rt_d!==t[T.d])throw Error('處級名冊逐日與店月合計不同');
      records.push(...rows);
    }
    for(const [j,date] of map.dates.entries()){
      if(date>data.cutoff)break;
      const summed=C.aggregate(records.filter(r=>r.date===date)),stated=values(aSum,rSum,j);
      if(Base.FIELDS.some(k=>summed[k]!==stated[k]))throw Error('處級 '+date+' 合計與涵蓋門市不一致');
    }
    const sum=C.aggregate(records);
    if(sum.rt_n!==tSum[T.n]||sum.rt_d!==tSum[T.d]||sum.aq_n!==aSum[A.total.n]||sum.aq_d!==aSum[A.total.d])throw Error('處級月合計不一致');
    const context={...data,stores},detail=Detail.parseAvailable({Sheets:Object.fromEntries(Object.entries(book.Sheets).filter(([n])=>['RT用戶進店行為_店','Tier觀察'].includes(n.trim())))},X,context);
    return {name,source_name:data.source_name,sha256:data.sha256,period_start:data.period_start,cutoff:data.cutoff,
      stores,records,tiers:detail.tiers,observation:detail.observation,coverage:detail.coverage,regions:[...new Set(stores.map(s=>s.region))]};
  }
  return {read};
});
