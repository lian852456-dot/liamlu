const {test}=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const Core=require('../tradein-performance-core.js'),Public=require('../tradein-public-core.js');
const {createRuntime,parsed,OPERATOR,hash}=require('./helpers/tradein-synthetic-runtime.cjs');
const digest=v=>hash(JSON.stringify(v));
function auth(source){return {employeeId:OPERATOR,adminSecret:'SYNTHETIC_ADMIN_ONLY',month:source.month,sourceHash:source.source_sha256,source};}
function publish(r,source){const p=r.a.tradeinPerformancePreview(auth(source));return r.a.tradeinPerformancePublish({...auth(source),...p});}
function setup(){
 const r=createRuntime(),source=parsed();r.configure(source);publish(r,source);
 const next={...structuredClone(source),source_sha256:'b'.repeat(64)};
 next.records[0].store_code='DNB10146';next.records[0].trade_date='2026-10-03';
 const row=next.records[0],approval={transaction_key:digest([row.store_code,row.trade_date,row.order_number.trim(),row.recycle_code.trim()]),employee_key:'ZX00001',home_store:'萬大',store:'杭州南',trade_date:'2026-10-03',review_status:'verified'};
 r.configure(next,{support_approvals:[approval]});return {r,source,next,approval};
}
test('reviewed support credits the selling store and the original employee once, including daily counts',()=>{
 const {r,next}=setup(),writes=r.writes.length,p=r.a.tradeinPerformancePreview(auth(next));
 assert.equal(r.writes.length,writes);assert.equal(p.snapshot.summary.total_units,4);assert.equal(p.snapshot.summary.pending_identity_units,0);
 const out=publish(r,next),snapshot=r.a.tradeinPerformanceSnapshot_(r.a.tradeinPerformanceRegistry_().months[next.month].active);
 const person=snapshot.people.find(p=>p.employee_key==='ZX00001');assert.equal(person.store,'萬大');assert.equal(person.actual_units,1);assert.equal(person.identity_status,'confirmed');
 assert.equal(snapshot.stores.find(s=>s.store==='萬大').total_units,2);assert.equal(snapshot.stores.find(s=>s.store==='杭州南').total_units,2);
 assert.deepEqual(JSON.parse(JSON.stringify(snapshot.stores.find(s=>s.store==='杭州南').recovered_days)),[{date:'2026-10-02',actual_units:1},{date:'2026-10-03',actual_units:1}]);
 assert.equal(snapshot.support_evidence.length,1);
 r.a.tradeinPerformancePublicPublish({...auth(next),expectedActiveHash:out.snapshotHash});
 const value=r.a.tradeinPerformancePublicRead({month:next.month,includeDays:true}).snapshot;Public.validate(value);
 assert.equal(value.people.find(p=>p.masked_name==='合＊5').actual_units,1);
 for(const key of ['employee_key','transaction_key','support_approvals','support_evidence','SYNTHETIC-REC','SYNTHETIC-ORDER'])assert.equal(JSON.stringify(value).includes(key),false,key);
 const withoutDays=r.a.tradeinPerformancePublicRead({month:next.month}).snapshot;assert.ok(withoutDays.stores.every(s=>!Object.hasOwn(s,'recovered_days')));Public.validate(withoutDays);
 const before=r.writes.length;assert.equal(publish(r,next).status,'unchanged');assert.equal(r.writes.length,before);
});
test('later complete exports reuse only the approved transaction, retaining original observations',()=>{
 const {r,next}=setup();publish(r,next);
 const later={...structuredClone(next),source_sha256:'c'.repeat(64),source_end:'2026-10-09',status_as_of_date:'2026-10-09'};
 later.records.push({...later.records[1],trade_date:'2026-10-09',recycle_code:'SYNTHETIC-LATER',order_number:'SYNTHETIC-LATER'});
 assert.equal(publish(r,later).snapshot.summary.total_units,5);
});
test('a payload cannot approve a cross-store transaction',()=>{
 const {r,next,approval}=setup();r.configs.delete('north12b-tradein-reference-'+next.source_sha256+'.json');
 const before=r.writes.length;
 assert.throws(()=>r.a.tradeinPerformancePreview({...auth(next),support_approvals:[approval],privateConfig:{support_approvals:[approval]}}),/店點異動待核/);
 assert.equal(r.writes.length,before);
});
for(const field of ['transaction_key','employee_key','home_store','store','trade_date','review_status'])test('approval '+field+' tampering never admits a source',()=>{
 const {r,next,approval}=setup(),bad={...approval};
 bad[field]={transaction_key:'f'.repeat(64),employee_key:'ZX00003',home_store:'三創',store:'酒泉',trade_date:'2026-10-04',review_status:'pending'}[field];
 r.configure(next,{support_approvals:[bad]});const before=r.writes.length;
 assert.throws(()=>r.a.tradeinPerformancePreview(auth(next)),/跨店/);assert.equal(r.writes.length,before);
});
for(const field of ['order_number','recycle_code','store_code','source_employee_id'])test('a later source cannot change reviewed '+field,()=>{
 const {r,next}=setup();publish(r,next);const later={...structuredClone(next),source_sha256:'c'.repeat(64)};
 later.records[0][field]={order_number:'SYNTHETIC-CHANGED',recycle_code:'SYNTHETIC-CHANGED',store_code:'DNB10307',source_employee_id:'12346'}[field];
 const before=r.writes.length;assert.throws(()=>r.a.tradeinPerformancePreview(auth(later)),/跨店|店點異動/);assert.equal(r.writes.length,before);
});
test('a reviewed support can be canceled in the same month without changing personnel or counting twice',()=>{
 const {r,next}=setup();publish(r,next);
 const later={...structuredClone(next),source_sha256:'c'.repeat(64)};later.records[0].cancel_date='2026-10-04';
 const result=publish(r,later);assert.equal(result.snapshot.summary.total_units,3);assert.equal(result.snapshot.summary.cancelled_units,1);
 const saved=r.a.tradeinPerformanceSnapshot_(r.a.tradeinPerformanceRegistry_().months[next.month].active);
 assert.equal(saved.people.find(p=>p.employee_key==='ZX00001').actual_units,0);assert.equal(saved.support_evidence.length,1);
 const projected=Public.project(saved,crypto.randomUUID);Public.validate(projected);assert.equal(projected.stores.reduce((n,s)=>n+s.support_in_units,0),0);
});
test('public aggregates refuse altered flow counts or daily store attribution',()=>{
 const {r,next}=setup();publish(r,next);const snapshot=r.a.tradeinPerformanceSnapshot_(r.a.tradeinPerformanceRegistry_().months[next.month].active);
 for(const mutate of [v=>v.stores[3].support_in_units++,v=>v.stores[4].support_out_units=0,v=>v.stores[3].recovered_days[0].actual_units++]){
  const value=Public.project(snapshot,crypto.randomUUID);mutate(value);assert.throws(()=>Public.validate(value),/跨店|逐日/);
 }
});
test('reviewed support cannot disappear from a later full-month source',()=>{
 const {r,next}=setup();publish(r,next);const later={...structuredClone(next),source_sha256:'c'.repeat(64),records:next.records.slice(1)};
 const before=r.writes.length;assert.throws(()=>r.a.tradeinPerformancePreview(auth(later)),/跨店支援.*缺漏/);assert.equal(r.writes.length,before);
});
test('C1 restores the preceding month and retains immutable support history',()=>{
 const {r,next}=setup(),p=r.a.tradeinPerformancePreview(auth(next));
 const status=r.a.tradeinPerformanceCheckpointStatus(auth(next));
 const expected=s=>({expectedRegistryExists:s.registryExists,expectedRegistryHash:s.registryHash,expectedPublicRegistryExists:s.publicRegistryExists,expectedPublicRegistryHash:s.publicRegistryHash,expectedActiveHash:s.activeHash,expectedMonthlyHash:s.monthlyHash,expectedReferenceHash:s.referenceHash});
 const cp=r.a.tradeinPerformanceCheckpointCapture({...auth(next),...expected(status),stage:'C1',previewHash:p.previewHash,rosterHash:p.rosterHash});
 publish(r,next);const count=r.files.size;
 const restored=r.a.tradeinPerformanceCheckpointRestore({...auth(next),...expected(r.a.tradeinPerformanceCheckpointStatus(auth(next))),checkpointId:cp.checkpointId,checkpointHash:cp.checkpointHash,restoreMonth:true});
 assert.equal(restored.status,'checkpoint_restored');assert.equal(r.files.size,count);
 const snapshot=r.a.tradeinPerformanceSnapshot_(r.a.tradeinPerformanceRegistry_().months[next.month].active);
 assert.equal(snapshot.support_evidence,undefined);assert.equal(snapshot.stores.find(s=>s.store==='萬大').total_units,3);
});
module.exports={setup,publish,auth};
