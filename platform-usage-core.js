/* Pure metric contract v1. No network, identity lookup, storage, or DOM. */
(function(root) {
  'use strict';
  const DAY = 86400000, OFFSET = 28800000;
  const FEATURES = Object.freeze({home:'營運中心首頁',kpi:'KPI 戰情',awards:'台獎戰情',personal:'個績'});
  const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
  const ERRORS = ['network','timeout','auth','format','service'];
  function fail() { throw Error('USAGE_INVALID'); }
  function shape(value, keys) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some(k => !keys.includes(k)) || keys.some(k => !Object.hasOwn(value,k))) fail();
  }
  function integer(x,min,max) { if (!Number.isSafeInteger(x) || x<min || x>max) fail(); return x; }
  function dateKey(ms) { return new Date(ms+OFFSET).toISOString().slice(0,10); }
  function midnight(date) {
    if (typeof date!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) fail();
    const time=Date.parse(date+'T00:00:00+08:00');
    if (!Number.isFinite(time) || dateKey(time)!==date) fail(); return time;
  }
  function filters(q,now) {
    shape(q,['start','end','store','feature']);
    const start=midnight(q.start), end=midnight(q.end)+DAY;
    if (end<=start || end-start>30*DAY || q.end>dateKey(now) ||
      typeof q.store!=='string' || q.store.length>32 || /[<>\x00-\x1f]/.test(q.store) ||
      q.feature!=='all' && !Object.hasOwn(FEATURES,q.feature)) fail();
    return {start,end,store:q.store,feature:q.feature};
  }
  function event(input,now,lease) {
    const common=['id','v','type','feature','visit','tab','at'];
    const extra=input?.type==='engaged_interval'?['start','end']:input?.type==='feature_ready'?['latency']:input?.type==='client_error'?['error']:[];
    shape(input,common.concat(extra));
    if (input.v!==1 || !['feature_open','engaged_interval','feature_ready','client_error'].includes(input.type) ||
      !Object.hasOwn(FEATURES,input.feature) || ![input.id,input.visit,input.tab].every(x=>typeof x==='string' && UUID.test(x))) fail();
    integer(input.at,now-DAY,now+60000);
    if (input.at<lease.from || input.at>=lease.until) fail();
    if (input.type==='engaged_interval') {
      integer(input.start,lease.from,input.at); integer(input.end,input.start+1,input.at);
      if (input.end-input.start>30000 || input.start<now-DAY || input.end>=lease.until) fail();
    }
    if (input.type==='feature_ready') integer(input.latency,0,120000);
    if (input.type==='client_error' && !ERRORS.includes(input.error)) fail();
    return {...input};
  }
  function union(intervals) {
    const sorted=intervals.filter(x=>x[1]>x[0]).map(x=>x.slice()).sort((a,b)=>a[0]-b[0]);
    const merged=[];
    for (const pair of sorted) {
      const last=merged[merged.length-1];
      if (last && pair[0]<=last[1]) last[1]=Math.max(last[1],pair[1]); else merged.push(pair);
    }
    return merged;
  }
  function duration(intervals) { return union(intervals).reduce((n,x)=>n+x[1]-x[0],0); }
  function percentile(values,p) {
    if (!values.length) return null;
    const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];
  }
  function aggregate(rows,roster,options) {
    const q=filters(options.filters,options.now), since=options.since, availableFrom=Math.max(since,options.availableFrom??since);
    const dataStart=Math.max(q.start,availableFrom), weeklyStart=q.end-7*DAY, dayStart=q.end-DAY;
    // Read the full selected range plus trailing seven days for correctly labelled DAU/WAU.
    const earliest=Math.max(Math.min(q.start,weeklyStart)-1800000,availableFrom);
    const visible=rows.filter(r=>(r.type==='engaged_interval'?r.end>earliest&&r.start<q.end:r.at>=earliest&&r.at<q.end) &&
      (q.store==='all'||r.store===q.store) && (!r.test) && (!r.automation));
    const actorRows=new Map(), sessions=[];
    visible.filter(r=>r.type==='engaged_interval').forEach(r=>{
      if (!actorRows.has(r.actor)) actorRows.set(r.actor,[]);actorRows.get(r.actor).push(r);
    });
    for (const [actor,list] of actorRows) {
      list.sort((a,b)=>a.start-b.start);
      let session;
      for(const row of list) {
        if (!session || row.start-session.end>=1800000) {
          session={actor,store:row.store,start:row.start,end:row.end,features:{}};sessions.push(session);
        }
        session.end=Math.max(session.end,row.end);
        (session.features[row.feature]||=([])).push([row.start,row.end,row.store]);
      }
    }
    const units=[], allIntervals=[];
    for (const s of sessions) for (const [feature,list] of Object.entries(s.features)) {
      const merged=union(list);
      // A short open is never adoption. Session qualification is independent of reload/tab IDs.
      if (duration(merged)<10000) continue;
      const chosen=merged.map(x=>[Math.max(x[0],dataStart),Math.min(x[1],q.end)]).filter(x=>x[1]>x[0]);
      const week=merged.some(x=>x[1]>Math.max(weeklyStart,availableFrom) && x[0]<q.end);
      const today=merged.some(x=>x[1]>Math.max(dayStart,availableFrom) && x[0]<q.end);
      if(q.feature==='all'||q.feature===feature) {
        units.push({actor:s.actor,session:s,feature,store:s.store,intervals:chosen,ms:duration(chosen),week,today,assigned:chosen.slice()});
        chosen.forEach(x=>allIntervals.push({actor:s.actor,feature,pair:x}));
      }
    }
    const selected=units.filter(x=>x.ms>0), active=new Set(selected.map(x=>x.actor));
    const observable=q.end>availableFrom && (q.feature==='all'?Object.values(options.features).includes('connected'):options.features[q.feature]==='connected');
    const daily=[];
    for(let d=q.start;d<q.end;d+=DAY) {
      const people=new Set();
      selected.forEach(u=>{if(u.intervals.some(x=>x[1]>d&&x[0]<d+DAY))people.add(u.actor);});
      daily.push({date:dateKey(d),active:!observable||d+DAY<=availableFrom?null:people.size,partial:d<availableFrom&&d+DAY>availableFrom});
    }
    const mapped=observable && roster?.complete===true && Number.isSafeInteger(roster.validFrom) && Number.isSafeInteger(roster.validUntil) &&
      roster.validFrom<=dataStart && roster.validUntil>=q.end && Array.isArray(roster.members);
    const eligible=mapped?new Set(roster.members.filter(m=>m.from<q.end&&m.until>dataStart &&
      (q.store==='all'||m.store===q.store) && (q.feature==='all'||m.features.includes(q.feature))).map(m=>m.actor)):null;
    // Unknown identity/eligibility never silently becomes a numerator or a current-roster historical denominator.
    const eligibleActive=eligible?new Set(selected.filter(u=>roster.members.some(m=>m.actor===u.actor&&
      (q.store==='all'||m.store===q.store)&&m.features.includes(u.feature)&&u.intervals.some(x=>x[1]>m.from&&x[0]<m.until))).map(u=>u.actor)):null;
    // Remove ambiguous cross-feature overlap from feature dwell; retain platform union.
    let unassignedMs=0;
    for(const actor of active) {
      const spans=allIntervals.filter(x=>x.actor===actor), edges=Array.from(new Set(spans.flatMap(x=>x.pair))).sort((a,b)=>a-b);
      const unique=[];
      for(let i=1;i<edges.length;i++) {
        const ids=new Set(spans.filter(x=>x.pair[0]<edges[i]&&x.pair[1]>edges[i-1]).map(x=>x.feature));
        if(ids.size>1)unassignedMs+=edges[i]-edges[i-1];
        else if(ids.size===1)unique.push({feature:Array.from(ids)[0],pair:[edges[i-1],edges[i]]});
      }
      selected.filter(x=>x.actor===actor).forEach(u=>{u.assigned=unique.filter(x=>x.feature===u.feature).flatMap(x=>u.intervals.map(y=>[Math.max(y[0],x.pair[0]),Math.min(y[1],x.pair[1])]).filter(y=>y[1]>y[0]));});
    }
    const assignedUnits=list=>list.map(u=>({...u,intervals:u.assigned}));
    const featureRows=Object.entries(FEATURES).map(([id,label])=>{
      const status=options.features[id]||'unconnected';
      const list=selected.filter(x=>x.feature===id), actors=new Set(list.map(x=>x.actor));
      const weekly=units.filter(x=>x.feature===id&&x.week),weekActors=new Set(weekly.map(x=>x.actor));
      const events=visible.filter(x=>x.feature===id&&x.at>=dataStart);
      const ready=events.filter(x=>x.type==='feature_ready'),errors=events.filter(x=>x.type==='client_error');
      const assignedMs=durationByActor(assignedUnits(list)),ambiguousMs=durationByActor(list)-assignedMs;
      const dwellKnown=status==='connected' && !(list.length && assignedMs===0 && ambiguousMs>0);
      return {id,label,status,active:status==='connected'?actors.size:null,count:status==='connected'?list.length:null,
        weeklyFrequency:status==='connected'&&weekActors.size?weekly.length/weekActors.size:null,
        activeMs:dwellKnown?assignedMs:null,ambiguousMs,
        medianMs:dwellKnown?percentile(list.filter(x=>duration(x.assigned)>0).map(x=>duration(x.assigned)),.5):null,
        p75Ms:dwellKnown?percentile(list.filter(x=>duration(x.assigned)>0).map(x=>duration(x.assigned)),.75):null,
        loadSamples:status==='connected'?ready.length:null,loadP50:status==='connected'?percentile(ready.map(x=>x.latency),.5):null,loadP95:status==='connected'?percentile(ready.map(x=>x.latency),.95):null,
        errors:status==='connected'?errors.length:null,errorRate:status==='connected'&&ready.length+errors.length?errors.length/(ready.length+errors.length):null};
    }).filter(x=>q.feature==='all'||x.id===q.feature);
    const people=Array.from(new Set([...selected.map(x=>x.actor),...(eligible||[])])).sort().map(actor=>{
      const list=selected.filter(x=>x.actor===actor), days=daily.filter(d=>list.some(u=>u.intervals.some(x=>dateKey(x[0])<=d.date&&dateKey(x[1]-1)>=d.date)));
      return {actor,store:Array.from(new Set(list.map(x=>x.store).concat(mapped?roster.members.filter(m=>m.actor===actor&&(q.store==='all'||m.store===q.store)&&m.from<q.end&&m.until>dataStart).map(m=>m.store):[]))).join('／'),activeDays:days.length,count:list.length,
        activeMs:durationByActor(list),lastDate:days.at(-1)?.date||null,identity:'已驗證帳號',
        features:Object.keys(FEATURES).filter(id=>list.some(x=>x.feature===id)).map(id=>{const items=list.filter(x=>x.feature===id),ms=durationByActor(assignedUnits(items));return {id,label:FEATURES[id],count:items.length,activeMs:ms||null};})};
    });
    const workSessions=new Map();selected.forEach(u=>{if(!workSessions.has(u.session))workSessions.set(u.session,[]);workSessions.get(u.session).push(...u.intervals);});
    return {v:1,metricVersion:'engaged-v1',timezone:'Asia/Taipei',since,updatedAt:options.now,filters:options.filters,
      coverage:{start:dateKey(since),availableFrom,partial:q.start<availableFrom,roster:mapped?'verified':'unknown',rosterVersion:mapped?roster.version:null,
        connected:Object.values(options.features).filter(x=>x==='connected').length,total:Object.keys(FEATURES).length},
      summary:{active:observable?active.size:null,dau:observable?new Set(units.filter(x=>x.today).map(x=>x.actor)).size:null,wau:observable?new Set(units.filter(x=>x.week).map(x=>x.actor)).size:null,
        eligible:eligible?.size??null,eligibleActive:eligibleActive?.size??null,usageRate:eligible?.size?eligibleActive.size/eligible.size:null,
        activeMs:observable?durationByActor(selected):null,medianMs:percentile(Array.from(workSessions.values()).map(duration),.5),unassignedMs},
      daily,features:featureRows,people};
  }
  function durationByActor(units) {
    const byActor=new Map();units.forEach(x=>{if(!byActor.has(x.actor))byActor.set(x.actor,[]);byActor.get(x.actor).push(...x.intervals);});
    return Array.from(byActor.values()).reduce((n,x)=>n+duration(x),0);
  }
  function prune(state,now) {
    // Adapter must include its backups here; omitted backup deletion blocks production enablement.
    return {...state,events:(state.events||[]).filter(x=>x.at>now-30*DAY),
      daily:(state.daily||[]).filter(x=>midnight(x.date)+DAY>now-90*DAY),
      audit:(state.audit||[]).filter(x=>x.at>now-180*DAY),
      backups:(state.backups||[]).filter(x=>x.expiresAt>now)};
  }
  const api=Object.freeze({FEATURES,DAY,dateKey,midnight,filters,event,union,duration,percentile,aggregate,prune,shape});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PlatformUsageCore=api;
})(typeof globalThis==='object'?globalThis:this);
