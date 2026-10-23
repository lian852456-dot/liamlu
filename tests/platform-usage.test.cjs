const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {randomUUID}=require('node:crypto');
const core=require('../platform-usage-core.js');
const collector=require('../platform-usage-collector.js');
const {fixture,interval,NOW,SINCE,FEATURES}=require('./helpers/platform-usage-fixture.cjs');
function service(change={}) {
  const f=fixture(),state={events:f.events,roster:f.roster,audit:[],quality:{accepted:7,duplicate:0,rejected:0}};
  let ownerCalls=0,storeCalls=0,proof='OWNER';
  const ctx=vm.createContext({PlatformUsageCore:core,Date,Object,Set,Map});
  vm.runInContext(fs.readFileSync('gas/UsageMonitor.gs','utf8'),ctx);
  const deps={config:()=>f.config,now:()=>NOW,uuid:randomUUID,
    verifyOwner:p=>{ownerCalls++;return p===proof?{method:'independent-owner',subject:f.config.ownerSubject,scope:'usage:read',revoked:false,expiresAt:NOW+60000}:null;},
    verifyEmployee:p=>p==='EMPLOYEE'?{level:'verified-account',actor:'SYNTHETIC-ACTOR',store:'酒泉',session:'SYNTHETIC-SESSION',revoked:false,expiresAt:NOW+60000}:null,
    verifyLease:p=>p==='LEASE'?{actor:'SYNTHETIC-ACTOR',session:'SYNTHETIC-SESSION',from:NOW-60000,until:NOW+60000,revoked:false}:null,
    rosterAt:actor=>({actor,store:'酒泉',from:SINCE,until:NOW+core.DAY,features:Object.keys(FEATURES)}),
    transaction:fn=>{storeCalls++;return fn(state);},...change};
  return {f,state,deps,api:ctx.createPlatformUsageService(deps),request:()=>({action:'usage_read',proof,filters:f.filters}),stats:()=>({ownerCalls,storeCalls}),setProof:p=>{proof=p;}};
}
test('five eligible accounts, three WAU and two DAU produce 60%, without summing daily counts',()=>{
  const f=fixture(),r=core.aggregate(f.events,f.roster,f.options);
  assert.equal(r.summary.dau,2);assert.equal(r.summary.wau,3);assert.equal(r.summary.usageRate,.6);
  assert.equal(r.summary.eligible,5);assert.equal(r.people.length,5);assert.equal(r.people[4].count,0);assert.equal(r.summary.activeMs,95000);
});
test('same actor overlapping tabs/devices use union; ambiguous feature dwell is unassigned',()=>{
  const f=fixture();f.events.push({...f.events[0],id:randomUUID(),tab:randomUUID()});
  const r=core.aggregate(f.events,f.roster,f.options);
  assert.equal(r.summary.activeMs,95000);assert.equal(r.summary.unassignedMs,30000);
  assert.equal(r.features.find(x=>x.id==='home').activeMs,30000);assert.equal(r.features.find(x=>x.id==='kpi').activeMs,null);assert.equal(r.features.find(x=>x.id==='kpi').ambiguousMs,30000);
});
test('platform median uses the union for a whole working session across features',()=>{
  const f=fixture(),r=core.aggregate([interval('合成帳號 A',NOW-100000,30000,'home'),interval('合成帳號 A',NOW-60000,20000,'kpi')],f.roster,f.options);
  assert.equal(r.summary.medianMs,50000);
});
test('refresh and repeated opens do not inflate qualified sessions; 30 minute inactivity splits',()=>{
  const f=fixture(),rows=[interval('合成帳號 A',NOW-120000,10000),interval('合成帳號 A',NOW-100000,10000)];
  let r=core.aggregate(rows,f.roster,f.options);assert.equal(r.features[0].count,1);
  rows.push(interval('合成帳號 A',NOW-2000000,10000));r=core.aggregate(rows,f.roster,f.options);assert.equal(r.features[0].count,2);
});
test('short opening and unqualified activity never count as adoption',()=>{
  const f=fixture(),r=core.aggregate([interval('合成帳號 A',NOW-60000,9999)],f.roster,f.options);
  assert.equal(r.summary.dau,0);assert.equal(r.summary.wau,0);assert.equal(r.summary.usageRate,0);assert.equal(r.summary.medianMs,null);
});
test('missing, stale or incomplete date roster leaves percentage unknown while preserving observed DAU',()=>{
  const f=fixture();for(const roster of [null,{...f.roster,complete:false},{...f.roster,validFrom:NOW},{...f.roster,validUntil:NOW-1}]) {
    const r=core.aggregate(f.events,roster,f.options);assert.equal(r.summary.usageRate,null);assert.equal(r.summary.dau,2);
  }
});
test('numerator only includes qualification during dated eligibility; retired identities do not enter rate',()=>{
  const f=fixture();f.roster.members[0].until=NOW-2*core.DAY;
  const r=core.aggregate(f.events,f.roster,f.options);assert.equal(r.summary.active,3);assert.equal(r.summary.eligibleActive,2);assert.equal(r.summary.usageRate,.4);
});
test('store and feature filters retain correct denominator and qualified counts',()=>{
  const f=fixture();f.options.filters={...f.filters,store:'萬大',feature:'awards'};
  const r=core.aggregate(f.events,f.roster,f.options);assert.equal(r.summary.dau,1);assert.equal(r.summary.eligible,2);assert.equal(r.summary.usageRate,.5);
});
test('unknown and disabled features differ from a connected observed zero',()=>{
  const f=fixture();f.options.features={home:'connected',kpi:'unconnected',awards:'disabled',personal:'connected'};
  const r=core.aggregate([],f.roster,f.options);assert.equal(r.features[0].active,0);assert.equal(r.features[1].active,null);assert.equal(r.features[2].status,'disabled');
});
test('pre-collection dates and a never-connected feature remain unknown in summary',()=>{
  const f=fixture();f.options.filters={...f.filters,feature:'kpi'};f.options.features={...FEATURES,kpi:'unconnected'};
  let r=core.aggregate([],f.roster,f.options);assert.equal(r.summary.dau,null);assert.equal(r.summary.usageRate,null);assert.ok(r.daily.every(d=>d.active===null));assert.equal(r.features[0].loadSamples,null);
  f.options.filters={...f.filters,start:'2026-10-01',end:'2026-10-02'};r=core.aggregate([],f.roster,f.options);assert.equal(r.summary.wau,null);assert.equal(r.daily[0].active,null);
});
test('Taipei midnight splits day activity and pre-start history is unknown, never backfilled',()=>{
  const f=fixture(),mid=core.midnight('2026-10-23');f.options.since=mid-5000;
  const r=core.aggregate([interval('合成帳號 A',mid-5000,15000)],f.roster,f.options);
  assert.equal(r.daily.at(-1).active,1);assert.equal(r.daily.at(-2).active,1);assert.equal(r.daily[0].active,null);assert.equal(r.coverage.partial,true);
});
test('interval ending exactly at query midnight still contributes to the previous day',()=>{
  const f=fixture(),end=core.midnight('2026-10-23');f.options.filters={...f.filters,end:'2026-10-22'};
  const r=core.aggregate([interval('合成帳號 A',end-15000,15000)],f.roster,f.options);assert.equal(r.summary.dau,1);assert.equal(r.daily.at(-1).active,1);
});
test('expired raw coverage remains unknown instead of a fabricated historical zero',()=>{
  const f=fixture();f.options.availableFrom=NOW-core.DAY;f.options.filters={...f.filters,start:'2026-10-17',end:'2026-10-20'};
  const r=core.aggregate([],f.roster,f.options);assert.equal(r.summary.dau,null);assert.equal(r.summary.usageRate,null);assert.ok(r.daily.every(d=>d.active===null));
});
test('latency and errors remain unknown without samples; stable error categories aggregate',()=>{
  const f=fixture();f.events.push({...interval('合成帳號 A',NOW-60000,10),type:'feature_ready',at:NOW-60000,latency:400},
    {...interval('合成帳號 A',NOW-60000,10),type:'client_error',at:NOW-60000,error:'network'});
  const r=core.aggregate(f.events,f.roster,f.options);assert.equal(r.features[0].loadP95,400);assert.equal(r.features[0].errorRate,.5);assert.equal(r.features[1].errorRate,null);
});
test('date bounds reject reversed, non-date, normalized invalid dates, future, >30 days and injected fields',()=>{
  const f=fixture();for(const q of [{...f.filters,start:'2026-09-01'},{...f.filters,start:'2026-10-24'},
    {...f.filters,start:'2026-02-30'},{...f.filters,end:'2026-10-24'},{...f.filters,isOwner:true},{...f.filters,store:'<script>'}])assert.throws(()=>core.filters(q,NOW));
});
test('minimal event whitelist refuses identities, content, URLs, coordinates and arbitrary properties',()=>{
  const e=interval('IGNORE',NOW-15000,15000);delete e.actor;delete e.store;delete e.receivedAt;delete e.identity;
  const lease={from:NOW-60000,until:NOW+60000};assert.equal(core.event(e,NOW,lease).id,e.id);
  for(const field of ['employeeId','actor','name','store','input','customer','url','stack','location','x'])assert.throws(()=>core.event({...e,[field]:'x'},NOW,lease));
  for(const e2 of [{...e,end:NOW+1},{...e,start:NOW-31000},{...e,at:NOW-86400001},{...e,feature:'external'},{...e,id:'not-uuid'}])assert.throws(()=>core.event(e2,NOW,lease));
});
test('retention purges 30-day raw, 90-day personal, 180-day audit and expired backups',()=>{
  const state={events:[{at:NOW-31*core.DAY},{at:NOW-1000}],daily:[{date:'2026-06-01'},{date:'2026-10-22'}],audit:[{at:NOW-181*core.DAY},{at:NOW-1}],backups:[{expiresAt:NOW-1},{expiresAt:NOW+1}]};
  const r=core.prune(state,NOW);for(const k of ['events','daily','audit','backups'])assert.equal(r[k].length,1);
});
test('unconfigured service never calls identity verifier or private storage',()=>{
  const f=service({config:()=>null});assert.equal(f.api.read(f.request()).code,'USAGE_DISABLED');assert.deepEqual(f.stats(),{ownerCalls:0,storeCalls:0});
});
test('each missing approval or collection setting fails closed',()=>{
  for(const key of ['enabled','noticeApproved','retentionApproved','ownerVerificationApproved','storageApproved']){
    const f=service();f.f.config[key]=false;assert.equal(f.api.read(f.request()).code,'USAGE_DISABLED');assert.equal(f.stats().storeCalls,0);
  }
});
test('unauthenticated, staff, other supervisor, shared PT, owner B and phone tokens all reject without data',()=>{
  const f=service();for(const proof of [null,'EMPLOYEE','OTHER-SUPERVISOR','PT-SHARED','OWNER-B-SESSION','OWNER-PHONE']){
    const result=f.api.read({...f.request(),proof});assert.equal(result.code,'USAGE_DENIED');assert.equal('report'in result,false);
  }
  assert.equal(f.state.audit.length,6);assert.ok(f.state.audit.every(x=>!x.allowed));assert.doesNotMatch(JSON.stringify(f.state.audit),/PT-SHARED|OWNER-B-SESSION|OWNER-PHONE/);
});
test('forged isOwner, employeeId, role and claims are rejected even with a valid proof',()=>{
  const f=service();for(const field of ['isOwner','employeeId','role','claims'])assert.equal(f.api.read({...f.request(),[field]:'owner'}).code,'USAGE_DENIED');
});
test('revoked, expired, wrong subject, wrong scope and password-bound identity all reject',()=>{
  for(const change of [{revoked:true},{expiresAt:NOW},{subject:'OTHER'},{scope:'admin'},{method:'password-bound'}]){
    const f=service({verifyOwner:()=>({method:'independent-owner',subject:'SYNTHETIC-OWNER-SUBJECT',scope:'usage:read',revoked:false,expiresAt:NOW+1000,...change})});
    assert.equal(f.api.read(f.request()).code,'USAGE_DENIED');
  }
});
test('real server verifier contract is invoked anew per query and revocation immediately stops reads',()=>{
  const f=service();assert.equal(f.api.read(f.request()).status,'ok');assert.equal(f.api.read(f.request()).status,'ok');assert.equal(f.stats().ownerCalls,2);
  f.setProof('NEW');assert.equal(f.api.read({...f.request(),proof:'OWNER'}).code,'USAGE_DENIED');assert.equal(f.state.audit.at(-1).allowed,false);
});
test('export remains unavailable for owner and all other request types, no fallback route',()=>{
  const f=service();for(const proof of ['OWNER','PT','OTHER'])assert.equal(f.api.handle({action:'usage_export',proof}).code,'USAGE_EXPORT_DISABLED');
  assert.equal(f.api.handle({action:'private_access'}).code,'USAGE_DENIED');
});
function payload(){const e=interval('IGNORE',NOW-15000,15000);for(const k of ['actor','store','identity','receivedAt'])delete e[k];return {action:'usage_ingest',proof:'EMPLOYEE',lease:'LEASE',events:[e]};}
test('three repeated batches persist once, returning explicit accepted/duplicate IDs',()=>{
  const f=service(),p=payload();for(let i=0;i<3;i++){const r=f.api.ingest(p);assert.equal(r.status,'ok');assert.equal(r.ack[i?'duplicate':'accepted'][0],p.events[0].id);}
  assert.equal(f.state.events.filter(x=>x.actor==='SYNTHETIC-ACTOR').length,1);assert.equal(f.state.quality.duplicate,2);
});
test('partial invalid events are rejected without storing content or accepting client identity',()=>{
  const f=service(),p=payload();p.events.push({...p.events[0],id:randomUUID(),employeeId:'OTHER',input:'secret text'});
  const r=f.api.ingest(p);assert.equal(r.ack.accepted.length,1);assert.equal(r.ack.rejected.length,1);assert.doesNotMatch(JSON.stringify(f.state),/secret text|employeeId/);
});
test('wrong session, identity switch, revoked lease, stale lease or missing verified account deny the whole batch',()=>{
  const cases=[{verifyEmployee:()=>null},{verifyLease:()=>null},{verifyLease:()=>({actor:'OTHER',session:'SYNTHETIC-SESSION',from:NOW-60000,until:NOW+60000,revoked:false})},
    {verifyLease:()=>({actor:'SYNTHETIC-ACTOR',session:'OTHER',from:NOW-60000,until:NOW+60000,revoked:false})},
    {verifyLease:()=>({actor:'SYNTHETIC-ACTOR',session:'SYNTHETIC-SESSION',from:NOW-60000,until:NOW,revoked:false})}];
  for(const c of cases){const f=service(c);assert.equal(f.api.ingest(payload()).code,'USAGE_DENIED');assert.equal(f.state.events.length,7);}
});
test('bounded payloads, event counts and per-account rate prevent unbounded ingestion',()=>{
  const f=service(),p=payload();for(let i=0;i<4;i++)assert.equal(f.api.ingest(p).status,'ok');assert.equal(f.api.ingest(p).code,'USAGE_RATE_LIMIT');
  assert.equal(f.api.ingest({...p,events:Array(21).fill(p.events[0])}).code,'USAGE_DENIED');
});
test('failed transaction/verifier cannot return data or leak the internal error',()=>{
  const f=service({transaction:()=>{throw Error('SECRET INTERNAL');}});const r=f.api.read(f.request());assert.equal(r.code,'USAGE_UNAVAILABLE');assert.doesNotMatch(JSON.stringify(r),/SECRET/);
});
test('configuration change before transactional authorization prevents a stale allow decision',()=>{
  const f=service();f.deps.transaction=fn=>{f.f.config.ownerSubject='OTHER';return fn(f.state);};
  assert.equal(f.api.read(f.request()).code,'USAGE_DENIED');
});
test('ingestion rejects malformed expiry and lease timestamps instead of treating missing values as valid',()=>{
  const f=service({verifyEmployee:()=>({level:'verified-account',actor:'SYNTHETIC-ACTOR',store:'酒泉',session:'SYNTHETIC-SESSION',revoked:false})});
  assert.equal(f.api.ingest(payload()).code,'USAGE_DENIED');
});
test('event store is derived from dated roster, and unknown historical eligibility is rejected',()=>{
  const f=service({rosterAt:actor=>({actor,store:'萬大',from:SINCE,until:NOW+1000,features:['home']})}),p=payload();
  assert.equal(f.api.ingest(p).status,'ok');assert.equal(f.state.events.at(-1).store,'萬大');
  const g=service({rosterAt:()=>null});const r=g.api.ingest(payload());assert.equal(r.ack.accepted.length,0);assert.equal(r.ack.rejected.length,1);
});
function fakeCollector(extra={}) {
  let time=0,wall=NOW,hidden=false,focus=true;const handlers=new Map(),timers=[];
  const target={addEventListener:(k,fn)=>{if(!handlers.has(k))handlers.set(k,[]);handlers.get(k).push(fn);},removeEventListener:()=>{}};
  const doc={...target,get hidden(){return hidden;},get visibilityState(){return hidden?'hidden':'visible';},hasFocus:()=>focus};
  const sent=[],lease={id:'SYNTHETIC-LEASE',actor:'A',from:NOW-1000,until:NOW+3600000};
  const c=collector({scope:{...target,setInterval:fn=>{timers.push(fn);return 1;},clearInterval:()=>{}},document:doc,monotonic:()=>time,wall:()=>wall,uuid:randomUUID,validate:async()=>lease,
    send:async events=>{sent.push(events);return {status:'ok',ack:{accepted:events.map(x=>x.id),duplicate:[],rejected:[]}};},random:()=>.5,...extra});
  return {c,sent,lease,advance:(ms,wallMs=ms)=>{time+=ms;wall+=wallMs;},setHidden:x=>{hidden=x;},setFocus:x=>{focus=x;},
    event:k=>(handlers.get(k)||[]).forEach(fn=>fn({})),handlers};
}
test('collector is opt-in and does not register keyboard/input/clipboard/mousemove listeners',()=>{
  const f=fakeCollector();assert.equal(f.c.stats().ready,false);assert.deepEqual(f.sent,[]);
  for(const k of ['keydown','keyup','input','change','paste','mousemove'])assert.equal(f.handlers.has(k),false);f.c.stop();
});
test('120 active +120 hidden +30 active seconds produce exactly150 seconds, unknown background excluded',async()=>{
  const f=fakeCollector();await f.c.start('home');
  for(let i=0;i<8;i++){f.advance(15000);f.c.tick();f.c.activity();await f.c.flush();}
  f.c.pause();f.setHidden(true);f.advance(120000);f.c.tick();f.setHidden(false);await f.c.resume();
  for(let i=0;i<2;i++){f.advance(15000);f.c.tick();f.c.activity();await f.c.flush();}
  const rows=f.sent.flat().filter(x=>x.type==='engaged_interval');assert.equal(rows.reduce((n,x)=>n+x.end-x.start,0),150000);f.c.stop();
});
test('foreground with no activity caps at60 seconds over180 seconds',async()=>{
  const f=fakeCollector();await f.c.start('kpi');for(let i=0;i<12;i++){f.advance(15000);f.c.tick();await f.c.flush();}
  assert.equal(f.sent.flat().filter(x=>x.type==='engaged_interval').reduce((n,x)=>n+x.end-x.start,0),60000);f.c.stop();
});
test('sleep, long timer gaps, wall-clock jumps and blurred windows never backfill elapsed time',async()=>{
  const f=fakeCollector();await f.c.start('home');f.advance(60000);f.c.tick();f.advance(15000,120000);f.c.tick();f.setFocus(false);f.advance(15000);f.c.tick();await f.c.flush();
  assert.equal(f.sent.flat().filter(x=>x.type==='engaged_interval').length,0);f.c.stop();
});
test('ack lost retry keeps identical event IDs; duplicate acknowledgement deletes only confirmed batch',async()=>{
  let calls=0,ids;
  const f=fakeCollector({send:async rows=>{calls++;if(calls===1){ids=rows.map(x=>x.id);throw Error();}assert.deepEqual(rows.map(x=>x.id),ids);return {status:'ok',ack:{accepted:[],duplicate:ids,rejected:[]}};}});
  await f.c.start('home');await f.c.flush();assert.equal(f.c.stats().queued,1);f.advance(5000);await f.c.flush();assert.equal(f.c.stats().queued,0);f.c.stop();
});
test('malformed acknowledgements retain the queue, never silently accepting save success',async()=>{
  const f=fakeCollector({send:async()=>({status:'ok',ack:{accepted:['not-sent'],duplicate:[],rejected:[]}})});await f.c.start('home');await f.c.flush();assert.equal(f.c.stats().queued,1);f.c.stop();
});
test('identity change or new lease clears the previous queue; logout clears and stale async results do not restore',async()=>{
  const f=fakeCollector();await f.c.start('home');assert.equal(f.c.stats().queued,1);f.lease.actor='B';await f.c.resume();assert.equal(f.c.stats().queued,0);f.c.clear();assert.equal(f.c.stats().ready,false);f.c.stop();
  let resolve;const g=fakeCollector({validate:()=>new Promise(r=>{resolve=r;})});const p=g.c.start('home');g.c.clear();resolve(g.lease);await p;assert.equal(g.c.stats().ready,false);g.c.stop();
});
test('queue bounded to200 and24hours without disk storage or token/event body leakage',async()=>{
  const f=fakeCollector({send:async()=>{throw Error();}});await f.c.start('home');for(let i=0;i<250;i++)f.c.ready(10);
  assert.equal(f.c.stats().queued,200);assert.equal(f.c.stats().dropped,51);f.advance(86400001);await f.c.resume();f.c.ready(10);assert.ok(f.c.stats().queued<=1);f.c.stop();
});
test('production sources have no collection mounting, owner fallback or external analytics',()=>{
  const ui=fs.readFileSync('platform-usage.html','utf8'),code=fs.readFileSync('platform-usage.js','utf8'),gas=fs.readFileSync('gas/Code.gs','utf8');
  assert.match(ui,/connect-src 'none'/);assert.doesNotMatch(ui,/<script[^>]*https:/);assert.doesNotMatch(code,/localStorage|sessionStorage|innerHTML|fetch\(/);
  assert.doesNotMatch(gas,/usage_read|usage_ingest|createPlatformUsageService/);
});
