/* Private publication state machine. No network, credentials or gold operations. */
var InsuranceSourceCore=(function(){
 'use strict';
 const schema='insurance-source-state/v1';
 const copy=v=>JSON.parse(JSON.stringify(v));
 function canonical(v){if(Array.isArray(v))return '['+v.map(canonical).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';return JSON.stringify(v);}
 function empty(){return {schema,revision:0,version:'',lastAttempt:null,entries:[]};}
 function assertState(s){if(!s||s.schema!==schema||!Number.isSafeInteger(s.revision)||s.revision<0||!Array.isArray(s.entries)||s.entries.length>1000)throw Error('INSURANCE_SOURCE_STATE_INVALID');const keys=new Set();for(const r of s.entries){const k=r.kind+'|'+r.id;if(!r.id||!['store','personal'].includes(r.kind)||keys.has(k))throw Error('INSURANCE_SOURCE_STATE_INVALID');keys.add(k);}return s;}
 function seal(s,hash){s.revision++;delete s.version;s.version=hash(canonical(s));return s;}
 function attempt(a,C,hash,today){if(!a||Object.keys(a).sort().join('|')!=='reportDate|sourceFile|sourceSha256'||!C.day(a.reportDate)||a.reportDate>today||typeof a.sourceFile!=='string'||!/^\d{4}\.xlsx$/.test(a.sourceFile)||a.sourceFile.slice(0,4)!==a.reportDate.slice(5).replace('-','')||!/^[a-f0-9]{64}$/.test(a.sourceSha256))throw Error('INSURANCE_ATTEMPT_INVALID');return {...a,id:hash(canonical(a))};}
 function begin(state,input,C,hash,today){
  const s=copy(assertState(state)),a=attempt(input,C,hash,today);
  if(s.lastAttempt?.id===a.id&&['pending','complete'].includes(s.lastAttempt.status))return s;
  if(s.lastAttempt&&a.reportDate<s.lastAttempt.reportDate)throw Error('INSURANCE_SOURCE_OLDER_BATCH');
  s.lastAttempt={...a,status:'pending',payloadHash:null};return seal(s,hash);
 }
 function finish(state,{attemptId,outcome,payload},C,hash){
  const s=copy(assertState(state)),a=s.lastAttempt;
  if(!a||a.id!==attemptId||!['complete','missing','failed'].includes(outcome))throw Error('INSURANCE_ATTEMPT_CHANGED');
  const payloadHash=payload?hash(canonical(payload)):null;
  if(a.status!=='pending'){
   if(a.status===outcome&&a.payloadHash===payloadHash)return s;
   throw Error('INSURANCE_ATTEMPT_ALREADY_FINISHED');
  }
  if(outcome==='complete'){
   if(!payload||payload.schema!=='insurance-source-payload/v1'||Object.keys(payload).sort().join('|')!=='data|schema'||!payload.data||Object.keys(payload.data).sort().join('|')!=='meta|stores')throw Error('INSURANCE_SOURCE_PAYLOAD_INVALID');
   const d=payload.data,m=d.meta,source=m?.insuranceConsultationSource;
   if(m?.reportDate!==a.reportDate||m?.sourceFile!==a.sourceFile||m?.sourceSha256!==a.sourceSha256||source?.schema!=='insurance-consultation-source/v2'||source.publicationDate!==a.reportDate||source.sourceSha256!==a.sourceSha256||source.sourceFile!==a.sourceFile||!/^[a-f0-9]{64}$/.test(source.version||''))throw Error('INSURANCE_SOURCE_BATCH_MISMATCH');
   const incoming=C.source(d,a.reportDate),seen=new Set(),entries=new Map(s.entries.map(r=>[r.kind+'|'+r.id,r]));
   for(const row of incoming){
    const key=row.kind+'|'+row.id;if(seen.has(key))continue;seen.add(key);
    const old=entries.get(key),valid=['required','exempt'].includes(row.requirement);
    if(valid&&(!old?.progress?.cutoff||row.progress.cutoff>=old.progress.cutoff))entries.set(key,{...row,observedAttemptId:a.id});
    else if(!old)entries.set(key,{...row,progress:null,requirement:'pending',observedAttemptId:null});
   }
   s.entries=[...entries.values()];assertState(s);
  }else if(payload!==null&&payload!==undefined)throw Error('INSURANCE_FAILED_SOURCE_MUST_BE_EMPTY');
  s.lastAttempt={...a,status:outcome,payloadHash};return seal(s,hash);
 }
 function project(state,date,C){
  assertState(state);return state.entries.map(row=>{
   const p=row.progress?copy(row.progress):null;
   const current=state.lastAttempt?.status==='complete'&&row.observedAttemptId===state.lastAttempt.id&&p?.publicationDate===date;
   const requirement=current?C.classify(p,date):'pending';
   if(p){p.freshness=current&&requirement!=='pending'?'current':'retained';p.referenceOnly=p.freshness==='retained';p.lastAttemptDate=state.lastAttempt?.reportDate||null;p.lastAttemptStatus=state.lastAttempt?.status||'pending';}
   return {...row,progress:p,requirement};
  });
 }
 function receipt(s){return {schema,version:s.version,revision:s.revision,lastAttempt:s.lastAttempt,retainedEntries:s.entries.length};}
 return {canonical,empty,assertState,begin,finish,project,receipt};
})();
if(typeof module==='object'&&module.exports)module.exports=InsuranceSourceCore;
