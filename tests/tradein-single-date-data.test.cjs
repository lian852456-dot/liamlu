const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const C=require('../tradein-performance-core.js'),P=require('../tradein-public-core.js'),Ref=require('./tradein-reference-fixture.cjs');
const {createRuntime,parsed,employee,OPERATOR,DEVICE}=require('./helpers/tradein-synthetic-runtime.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){const input=parsed();input.records[1].trade_date='2026-10-03';input.records[2].trade_date='2026-10-03';const source=C.build(input,[employee('12345'),employee('12346','店長'),employee('12347','代理店長','杭州南'),employee('12348','資深業務代表','三創')],Ref.reference(input));source.published_at='2026-10-10T10:00:00+08:00';const pub=P.project(source,()=>crypto.randomUUID());return {source,pub,input};}
test('daily aggregates follow deduplication and cancellations; zero staff retain complete empty days',()=>{
 const {input}=fixture();input.records.push({...input.records[0]});input.records.push({...input.records[3],cancel_date:'2026-10-05'});
 const s=C.build(input,[employee('12345'),employee('12346','店長'),employee('12347','代理店長','杭州南'),employee('12348','資深業務代表','三創')],Ref.reference(input));
 assert.equal(s.summary.total_units,3);assert.equal(s.summary.duplicate_rows,2);assert.equal(s.summary.cancelled_units,1);
 assert.deepEqual(s.people.map(p=>p.recovered_days.reduce((n,d)=>n+d.actual_units,0)),s.people.map(p=>p.actual_units));
 assert.deepEqual(s.people[2].recovered_days,[]);assert.deepEqual(s.people[3].recovered_days,[]);
});
for(const kind of ['bad date','duplicate date','outside source','wrong total','wrong models','private field'])test('daily public allowlist rejects '+kind,()=>{
 const {pub}=fixture(),d=pub.people[0].recovered_days[0];
 if(kind==='bad date')d.date='2026-02-30';if(kind==='duplicate date')pub.people[0].recovered_days.push(clone(d));
 if(kind==='outside source')d.date='2026-10-08';if(kind==='wrong total')d.actual_units=2;
 if(kind==='wrong models')d.recovered_models[0].model='Other Model';if(kind==='private field')d.imei='SYNTHETIC_PRIVATE';
 assert.throws(()=>P.validate(pub));
});
test('private daily supplement enriches legacy projection without revealing identity or changing monthly values',()=>{
 const {pub,source}=fixture(),basis={schema_version:'tradein-recovered-days/v1',review_status:'verified',month:pub.month,source_sha256:source.source_sha256,source_start:pub.source_period.start,source_end:pub.source_period.end,roster_hash:'r',people:source.people.map(p=>({employee_key:p.employee_key,store:p.store,actual_units:p.actual_units,recovered_days:p.recovered_days}))};
 const legacy=clone(pub);legacy.people.forEach(p=>delete p.recovered_days);const out=P.withDays(legacy,source,basis,'r');assert.deepEqual(out,pub);assert.deepEqual(out.summary,legacy.summary);
 for(const p of source.people)assert.equal(JSON.stringify(out).includes(p.employee_key),false);
 for(const patch of [{source_sha256:'x'},{roster_hash:'x'},{people:basis.people.slice(1)}])assert.throws(()=>P.withDays(legacy,source,{...basis,...patch},'r'));
});
test('daily responses are opt-in for cached clients and anonymous reads never mutate files',()=>{
 const r=createRuntime(),input=parsed();r.configure(input);const auth={employeeId:OPERATOR,deviceId:DEVICE,adminSecret:'SYNTHETIC_ADMIN_ONLY',month:input.month,sourceHash:input.source_sha256};
 const preview=r.a.tradeinPerformancePreview({...auth,source:input});const saved=r.a.tradeinPerformancePublish({...auth,source:input,...preview});r.a.tradeinPerformancePublicPublish({...auth,expectedActiveHash:saved.snapshotHash});
 const writes=r.writes.length;const old=r.a.tradeinPerformancePublicRead({month:input.month});assert.ok(old.snapshot.people.every(p=>!Object.hasOwn(p,'recovered_days')));
 const days=r.a.tradeinPerformancePublicRead({month:input.month,includeDays:true});assert.equal(days.snapshot.people.reduce((n,p)=>n+p.recovered_days.reduce((a,d)=>a+d.actual_units,0),0),4);assert.equal(r.writes.length,writes);
});
test('anonymous retry admits only the explicit daily boolean; identities and invalid flags remain blocked',async()=>{
 const {createPublicReader}=await import('../tradein-public-read.mjs'),payload={action:'tradein_performance_public_read',month:'2026-10',includeDays:true};let received;
 const read=createPublicReader({endpoint:'https://example.invalid',frame:async p=>{received=p;return {status:'ok',snapshot:null};},post:()=>assert.fail()});await read(payload);assert.deepEqual(received,payload);
 for(const p of [{...payload,includeDays:false},{...payload,includeDays:'true'},{...payload,employeeId:'SYNTHETIC'}])await assert.rejects(read(p),/只允許公開/);
});
