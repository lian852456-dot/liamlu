(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./north12-trends'):root.North12Trends,
    node?require('./north12-officer-core'):root.North12OfficerCore);
  if(node)module.exports=api;else root.North12TrendReport=api;
})(globalThis,function(T,C){
  'use strict';
  const {ALL,OFFICE,first,last,shift,span,week,months,earlierWeek,unique}=T;
  const tiers=[...'ABCDEF'];
  function build(history,end,scope=ALL,whole=false) {
    const E=T.engine(history),month=first(end),parts=E.pieces(end,ALL),allStores=parts.flatMap(p=>p.stores);
    const current=span(month,end), weekly=week(end), oldWeek=earlierWeek(weekly);
    const lastMonth=shift(month,-1);
    const full=end===last(end)&&E.read(current,scope,false,true).complete&&E.read(span(first(lastMonth),lastMonth),scope,false,true).complete;
    const [monthly,oldMonth]=months(end,whole&&full);
    const storeById=new Map(allStores.map(s=>[s.id,s]));
    const name=id=>storeById.get(id)?.short||id;
    const selected=allStores.filter(s=>scope===ALL||s.region===scope||s.id===scope);
    const children=scope===ALL?C.REGIONS:[scope];
    const groups=unique([scope,...children,...selected.map(s=>s.id)]);
    const office=E.pieces(end,OFFICE)[0];
    function periodResult(s,p,monthly=false){
      const a=E.read(p,s,false,monthly);
      return {total:a.totals,complete:a.complete,days:a.days,gaps:a.gaps,regions:a.regions,stores:a.byId.size};
    }
    const comparisons=groups.map(id=>({id,label:name(id),region:storeById.get(id)?.region,
      summary:periodResult(id,current,true),wow:E.compare(weekly,oldWeek,id),mom:E.compare(monthly,oldMonth,id,true)}));
    // Select weeks with real records. Preserve a calendar break between non-adjacent weeks.
    const starts=unique([...history.values()].filter(p=>p.region!==OFFICE).flatMap(p=>p.records
      .filter(r=>r.date<=end).map(r=>T.monday(r.date)))).sort().slice(-8);
    const series=starts.map(start=>{
      const stop=shift(start,6),p=span(start,stop<end?stop:end),before=earlierWeek(p);
      const point=id=>Object.fromEntries(['aq','rt'].map(ch=>[ch,E.metric(p,before,id,ch)]));
      const offices=unique([p.start,p.end].flatMap(date=>E.pieces(date,OFFICE).map(part=>part.name)));
      const officeMatch=office&&offices.length===1&&offices[0]===office.name;
      const officePoint=officeMatch?point(OFFICE):null;
      if(officePoint && [before.start,before.end].some(d=>E.pieces(d,OFFICE)[0]?.name!==office.name))
        for(const ch of ['aq','rt'])officePoint[ch].growth=null;
      return {period:p,partial:p.days<7,incomplete:children.some(id=>!E.read(p,id).complete),values:Object.fromEntries(children.map(id=>[id,point(id)])),
        department:point(ALL),office:officePoint};
    });
    function tierData(id,p,origin='store') {
      const available=E.pieces(p.start,id).map(v=>v.tierSnapshots?.[p.end]||v), expected=id===ALL?4:1;
      const source=origin==='store'?'tiers':'observation';
      if(origin!=='store'&&storeById.has(id))return null;
      if(available.length<expected||available.some(v=>v.period_start!==p.start||v.cutoff!==p.end||!v.coverage[source]))return null;
      const rows=available.flatMap(v=>origin==='store'?v.tiers.filter(r=>id===OFFICE||id===ALL||id===v.region||id===r.store):v.observation.filter(r=>r.origin===origin));
      if(!rows.length)return null;
      const total=rows.reduce((a,r)=>a+r.visitors,0);
      return (origin==='store'?tiers:tiers.slice(0,5)).map(tier=>{
        const items=rows.filter(r=>r.tier===tier);
        if(!items.length)return {tier,visitors:null,renewals:null,rate:null,share:null,unrenewed:null};
        const counts=Object.fromEntries((origin==='store'?['visitors','renewals','npOut','terminated','visitOnly']:['visitors','renewals']).map(k=>[k,items.reduce((a,r)=>a+r[k],0)]));
        const {visitors,renewals}=counts;
        return {tier,...counts,rate:visitors?renewals/visitors:null,share:total?visitors/total:null,unrenewed:visitors-renewals};
      });
    }
    function heatFor(origin){
      const departmentTier=tierData(ALL,current,origin),officeTier=tierData(OFFICE,current,origin);
      return groups.filter(id=>origin==='store'||!storeById.has(id)).map(id=>{
        const now=tierData(id,current,origin),prior=tierData(id,oldMonth,origin);
        const comp=E.compare(monthly,oldMonth,id,true);
        const comparable=comp.complete&&!comp.exclusions.length&&monthly.end===current.end;
        return {id,label:name(id),rows:now?.map((t,i)=>({...t,department:departmentTier?.[i]?.rate??null,
          office:officeTier?.[i]?.rate??null,previous:comparable?prior?.[i]??null:null}))||null};
      });
    }
    const heat=heatFor('store'),originHeat={TWM:heatFor('TWM'),TST:heatFor('TST')};
    const sources=E.pieces(end,scope).map(p=>({name:p.source_name,start:p.period_start,end:p.cutoff,hash:p.sha256,
      region:p.region,stores:p.stores.filter(s=>scope===ALL||scope===p.region||s.id===scope).map(s=>s.id+' '+s.short),
      grain:p.monthlyTotals?'月累計':'逐日',coverage:p.coverage,issues:p.issues,officeIssue:p.officeIssue}));
    const observation=C.REGIONS.includes(scope)||scope===ALL?E.pieces(end,scope)
      .map(p=>p.tierSnapshots?.[end]||p).filter(p=>p.cutoff===end).flatMap(p=>p.observation):[];
    const planMap=new Map();
    for(const p of E.pieces(end,scope).filter(p=>p.cutoff===end))
      for(const row of p.plans.filter(r=>selected.some(s=>s.id===r.store)))planMap.set(row.plan,(planMap.get(row.plan)||0)+row.unrenewed);
    const daily=Array.from({length:current.days},(_,i)=>shift(current.start,i)).map(d=>({date:d,...periodResult(scope,span(d,d))}));
    const present=parts.map(p=>p.region);
    return {scope,label:name(scope),end,month,full,whole:!!(whole&&full),weekly,oldWeek,monthly,oldMonth,
      comparisons,series,heat,originHeat,sources,observation,daily,children,available:present,
      office:office?{name:office.name,regions:office.regions,stores:office.stores.length,source:office.source_name,hash:office.sha256,cutoff:office.cutoff}:null,
      provenance:unique([...history.values()].filter(p=>p.period_start<=month && p.cutoff>=(starts.length?shift(starts[0],-7):oldMonth.start) && (scope===ALL||p.region===OFFICE||p.region===scope||p.stores.some(s=>s.id===scope))).flatMap(p=>[p,...Object.values(p.tierSnapshots||{}).filter(s=>s.cutoff===end||s.cutoff===oldMonth.end)].map(s=>s.source_name+' ｜ '+s.period_start+' ～ '+s.cutoff+' ｜ '+s.sha256))),
      historicalSources:unique(comparisons.flatMap(r=>[...r.wow.sources,...r.mom.sources])),
      plans:[...planMap].sort((a,b)=>b[1]-a[1]).slice(0,5)};
  }
  return {build};
});
