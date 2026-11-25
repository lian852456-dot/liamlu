(function(root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./north12-officer-core') : root.North12OfficerCore);
  if (node) module.exports = api; else root.North12Trends = api;
})(globalThis, function(C) {
  'use strict';
  const ALL = '北一二部', OFFICE = '@office', DAY = 86400000;
  const date = n => new Date(n).toISOString().slice(0, 10);
  const shift = (s, days) => date(Date.parse(s) + days * DAY);
  const first = s => s.slice(0, 7) + '-01';
  const last = s => date(Date.UTC(+s.slice(0,4), +s.slice(5,7), 0));
  const span = (s,e) => ({start:s,end:e,days:1 + (Date.parse(e)-Date.parse(s))/DAY});
  const monday = s => shift(s, -((new Date(s).getUTCDay()+6)%7));
  const week = end => span(monday(end),end);
  const earlierWeek = p => span(shift(p.start,-7),shift(p.end,-7));
  const sum = rows => rows.length ? C.aggregate(rows) : null;
  const unique = entries => [...new Set(entries)];
  function months(end, whole) {
    const pe = shift(first(end), -1), ps = first(pe);
    if (whole) return [span(first(end),end),span(ps,pe)];
    const days = Math.min(+end.slice(-2),+pe.slice(-2));
    return [span(first(end),shift(first(end),days-1)),span(ps,shift(ps,days-1))];
  }
  function changes(a,b,ch) {
    const d=ch+'_d', r=ch+'_rate';
    if (!a || !b) return {delta:null,growth:null,points:null};
    return {delta:a[d]-b[d],growth:b[d]?(a[d]-b[d])/b[d]:null,
      points:a[r]!=null && b[r]!=null ? 100*(a[r]-b[r]) : null};
  }
  function apply(previous, incoming) {
    const next = new Map(previous), touched = new Map();
    // Validate the entire selection before committing any file.
    for (const input of incoming) {
      const d = C.validate(input), regionIds = unique(d.stores.map(s=>s.region));
      for (const region of regionIds) {
        const stores=d.stores.filter(s=>s.region===region), ids=new Set(stores.map(s=>s.id));
        const pick=rows=>rows?.filter(r=>ids.has(r.store));
        const detail=d.renewalDetail;
        const part={...d,officeIssue:input.officeIssue,stores,records:pick(d.records),monthlyTotals:pick(d.monthlyTotals),prior:pick(d.prior),region,
          tiers:pick(detail?.tiers)||[], observation:detail?.observation.filter(r=>r.region===region)||[],
          plans:pick(detail?.plans)||[], coverage:detail?.coverage||{}, issues:detail?.issues||{}};
        delete part.renewalDetail;
        put(region,part);
      }
      if (input.office) put(OFFICE,{...input.office,region:OFFICE});
      else if (next.get(d.period_start+OFFICE)?.cutoff===d.cutoff) next.delete(d.period_start+OFFICE);
      function put(region,part) {
        const key=d.period_start+region, same=touched.get(key+part.cutoff);
        if (same && same!==d.sha256) throw Error(region+' 同期有兩份不同來源，請分次匯入更正版');
        touched.set(key+part.cutoff,d.sha256);
        const old=next.get(key), snapshots={...old?.tierSnapshots};
        snapshots[part.cutoff]={cutoff:part.cutoff,period_start:part.period_start,region,stores:part.stores,
          tiers:part.tiers,observation:part.observation,coverage:part.coverage,issues:part.issues,source_name:part.source_name,sha256:part.sha256};
        const latest=old && old.cutoff>part.cutoff?old:part;
        next.set(key,{...latest,tierSnapshots:snapshots});
      }
    }
    for(const part of next.values()){
      if(part.region===OFFICE)continue;
      const ids=new Set(part.stores.map(s=>s.id));
      for(const other of next.values())if(other.period_start===part.period_start && other.region!==OFFICE &&
        other.region!==part.region && other.stores.some(s=>ids.has(s.id)))throw Error('同月店碼跨區重複，請一併匯入更正後的區域來源');
    }
    return next;
  }
  function engine(history) {
    const periods=new Map(), comparisons=new Map();
    function pieces(start,scope) {
      const all=[...history.values()].filter(p=>p.period_start===first(start));
      if(scope===OFFICE)return all.filter(p=>p.region===OFFICE);
      return all.filter(p=>p.region!==OFFICE && (scope===ALL || p.region===scope || p.stores.some(s=>s.id===scope)));
    }
    function read(p,scope,usePivot=false,allowMonthly=false) {
      const cache=[p.start,p.end,scope,usePivot,allowMonthly].join('|');
      if(periods.has(cache))return periods.get(cache);
      const byId=new Map(),missing=new Set(), sources=new Set(),seen=new Set();
      const monthsInRange=unique(Array.from({length:p.days},(_,i)=>first(shift(p.start,i))));
      function add(row,s,days) {
        const item=byId.get(s.id)||{store:s,rows:[],days:0,regions:new Set()};
        item.rows.push(row);item.days+=days;item.regions.add(s.region);byId.set(s.id,item);
      }
      for(const m of monthsInRange) {
        let parts=pieces(m,scope);
        const expected=scope===ALL?C.REGIONS:(scope===OFFICE||C.REGIONS.includes(scope)?[scope]:[]);
        for(const region of expected)if(!parts.some(v=>v.region===region))missing.add(region+' '+m.slice(0,7));
        if(!parts.length)missing.add(m.slice(0,7)+' 缺來源');
        for(const part of parts) {
          const stores=part.stores.filter(s=>scope===ALL||scope===OFFICE||s.region===scope||s.id===scope);
          const index=new Map(stores.map(s=>[s.id,s]));
          sources.add(part.source_name);
          seen.add(part.region);
          const end=p.end<last(m)?p.end:last(m);
          if(part.cutoff<end)missing.add(part.region+' 缺 '+shift(part.cutoff,1)+'～'+end);
          if(part.monthlyTotals){
            if(allowMonthly && p.start===part.period_start && p.end===part.cutoff){
              for(const row of part.monthlyTotals)if(index.has(row.store))add(row,index.get(row.store),p.days);
            }else missing.add(part.region+' 僅有月累計，無所選期間逐日數');
          }
          for(const r of part.records)if(index.has(r.store)&&r.date>=p.start&&r.date<=p.end)add(r,index.get(r.store),1);
        }
      }
      if(usePivot && monthsInRange.length===1 && p.start===first(p.start)) {
        const next=shift(last(p.start),1);
        for(const part of pieces(next,scope)){
          if(part.prior_period?.start!==p.start||part.prior_period.end!==p.end||!part.prior)continue;
          const old=pieces(p.start,scope).find(x=>x.region===part.region);
          if(old && old.cutoff>=p.end && (!old.monthlyTotals||old.cutoff===p.end))continue;
          // A checked same-period total supersedes the partial daily source for this region.
          for(const [id,v] of byId)if(v.store.region===part.region)byId.delete(id);
          const index=new Map(part.stores.map(s=>[s.id,s]));
          for(const r of part.prior){
            const s=index.get(r.store);
            if(scope===ALL||scope===s.region||scope===s.id)add(r,s,p.days);
          }
          for(const reason of missing)if(reason.startsWith(part.region+' ')||reason===first(p.start).slice(0,7)+' 缺來源')missing.delete(reason);
          seen.add(part.region);sources.add(part.source_name+'（樞紐同期）');
        }
      }
      const values=[...byId.values()];
      const totals=sum(values.flatMap(v=>v.rows)), days=values.reduce((n,v)=>n+v.days,0);
      const incomplete=values.filter(v=>v.days!==p.days||v.regions.size!==1).map(v=>v.store.id);
      const out={byId,totals,days,regions:[...seen],complete:!!totals&&!missing.size&&!incomplete.length,
        gaps:[...missing,...incomplete.map(id=>id+' 店日或歸屬不完整')],sources:[...sources]};
      periods.set(cache,out);return out;
    }
    function compare(now,before,scope,pivot=false) {
      const key=[now.start,now.end,before.start,before.end,scope,pivot].join('|');
      if(comparisons.has(key))return comparisons.get(key);
      const a=read(now,scope,false,pivot),b=read(before,scope,pivot,pivot),common=[], exclusions=[];
      for(const id of unique([...a.byId.keys(),...b.byId.keys()])) {
        const x=a.byId.get(id),y=b.byId.get(id);
        let reason='';
        if(!x||!y){
          const other=read(x?before:now,scope===OFFICE?OFFICE:ALL,pivot&&!!x).byId.get(id);
          reason=other?'歸屬變動':(x?'僅本期列報':'僅前期列報');
        }else if(x.store.region!==y.store.region||x.regions.size!==1||y.regions.size!==1)reason='歸屬變動';
        else if(x.days!==now.days||y.days!==before.days)reason='缺店日';
        if(reason)exclusions.push(id+' '+(x||y).store.short+'・'+reason);
        else common.push(id);
      }
      const gaps=unique([...a.gaps,...b.gaps]);
      const valid=a.complete&&b.complete&&common.length>0;
      const extract=side=>valid?sum(common.flatMap(id=>side.byId.get(id).rows)):null;
      const result={now,before,a:extract(a),b:extract(b),actual:a.totals,previousActual:b.totals,
        complete:!!valid,count:common.length,exclusions,gaps,sources:unique([...a.sources,...b.sources])};
      comparisons.set(key,result);return result;
    }
    function metric(now,before,scope,ch,pivot=false) {
      const a=read(now,scope), c=compare(now,before,scope,pivot), delta=changes(c.a,c.b,ch);
      return {level:a.complete?a.totals[ch+'_d']/a.days:null,rate:a.complete?a.totals[ch+'_rate']:null,
        growth:delta.growth,days:a.days,stores:a.byId.size,visitors:a.totals?.[ch+'_d']??null,
        numerator:a.totals?.[ch+'_n']??null,common:c.count};
    }
    return {read,compare,metric,pieces};
  }
  function gap(value,base,kind) {
    if(value==null||base==null)return null;
    if(kind==='level')return base===0?null:100*(value/base-1);
    return 100*(value-base);
  }
  return {ALL,OFFICE,apply,engine,span,shift,first,last,monday,week,earlierWeek,months,changes,gap,unique};
});
