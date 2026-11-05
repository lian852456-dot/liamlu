'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {createRuntime,parsed,OPERATOR}=require('./helpers/tradein-synthetic-runtime.cjs');
const auth=source=>({employeeId:OPERATOR,adminSecret:'SYNTHETIC_ADMIN_ONLY',source});
function publish(r,source){const p=r.a.tradeinPerformancePreview(auth(source));return r.a.tradeinPerformancePublish({...auth(source),...p});}
function setup(){
 const r=createRuntime(),source=parsed();
 // An owner-configured prior batch already has one unresolved cross-store row.
 source.records[0].store_code='DNB10174';r.configure(source);publish(r,source);
 const next={...structuredClone(source),source_sha256:'b'.repeat(64),source_end:'2026-10-09',status_as_of_date:'2026-10-09'};
 next.records.push({...source.records[1],trade_date:'2026-10-09',recycle_code:'SYNTHETIC-LATER',order_number:'SYNTHETIC-LATER'});
 return {r,source,next};
}
test('an existing unresolved observation does not block the next complete monthly export',()=>{
 const {r,next}=setup(),writes=r.writes.length,p=r.a.tradeinPerformancePreview(auth(next));
 assert.equal(r.writes.length,writes,'preview is read-only');
 assert.equal(p.snapshot.summary.total_units,5);assert.equal(p.snapshot.summary.assigned_units,4);assert.equal(p.snapshot.summary.pending_identity_units,1);
 assert.equal(p.snapshot.people.find(p=>p.masked_name==='合＊5').actual_units,null);
 const saved=publish(r,next);assert.equal(saved.snapshot.summary.pending_identity_units,1);
 const stored=r.a.tradeinPerformanceSnapshot_(r.a.tradeinPerformanceRegistry_().months[next.month].active);
 assert.equal(stored.people.find(p=>p.employee_key==='ZX00001').identity_status,'conflict');
 assert.equal(stored.support_evidence,undefined,'reuse does not approve support');
 const before=r.writes.length;assert.equal(publish(r,next).status,'unchanged');assert.equal(r.writes.length,before);
});
test('the affected employee can add a home-store sale while the original conflict remains pending',()=>{
 const {r,next}=setup();next.records.push({...next.records[0],store_code:'DNB10168',trade_date:'2026-10-09',recycle_code:'SYNTHETIC-HOME',order_number:'SYNTHETIC-HOME'});
 const out=publish(r,next);assert.equal(out.snapshot.summary.total_units,6);assert.equal(out.snapshot.summary.pending_identity_units,2);
 assert.equal(out.snapshot.people.find(p=>p.masked_name==='合＊5').actual_units,null);
});
for(const change of [{trade_date:'2026-10-09'},{store_code:'DNB10307'}])test('a new unresolved store/date is still denied: '+JSON.stringify(change),()=>{
 const {r,next}=setup();Object.assign(next.records[0],change);const before=r.writes.length;
 assert.throws(()=>r.a.tradeinPerformancePreview(auth(next)),/新增員編或店點異動待核/);assert.equal(r.writes.length,before);
});
test('an unknown employee is still denied with an actionable private diagnostic',()=>{
 const {r,next}=setup();next.records.push({...next.records[1],source_employee_id:'99999',recycle_code:'SYNTHETIC-UNKNOWN',order_number:'SYNTHETIC-UNKNOWN'});
 const before=r.writes.length;
 assert.throws(()=>r.a.tradeinPerformancePreview(auth(next)),error=>/1 組新增員編或店點異動待核/.test(error.message)&&/尾碼 999/.test(error.message)&&/萬大/.test(error.message)&&!error.message.includes('SYNTHETIC-UNKNOWN'));
 assert.equal(r.writes.length,before);
});
test('canceling the old cross-store row resolves it through the existing same-month policy',()=>{
 const {r,next}=setup();next.records[0].cancel_date='2026-10-09';
 const out=publish(r,next);assert.equal(out.snapshot.summary.total_units,4);assert.equal(out.snapshot.summary.cancelled_units,1);assert.equal(out.snapshot.summary.pending_identity_units,0);
 assert.equal(out.snapshot.people.find(p=>p.masked_name==='合＊5').actual_units,0);
 const later={...structuredClone(next),source_sha256:'c'.repeat(64)};
 assert.equal(publish(r,later).snapshot.summary.pending_identity_units,0,'a resolved historical conflict does not block tomorrow');
 const reverted={...structuredClone(later),source_sha256:'e'.repeat(64)};reverted.records[0].cancel_date=null;
 const writes=r.writes.length;assert.throws(()=>r.a.tradeinPerformancePreview(auth(reverted)),/待核|取消/);assert.equal(r.writes.length,writes);
});
test('source or monthly reference tampering remains a whole-batch refusal',()=>{
 for(const field of ['reference','roster']){
  const {r,source,next}=setup(),file=r.a.tradeinPerformanceFile_(field==='reference'?'north12b-tradein-reference-'+source.source_sha256+'.json':'north12b-tradein-monthly-roster-'+source.month+'.json');
  const config=JSON.parse(file.getBlob().getDataAsString());
  if(field==='reference')config.employees[0].observations[0].store_code='DNB10307';else config.people[0].store='酒泉';
  file.tamperForTest(JSON.stringify(config));const before=r.writes.length;
  assert.throws(()=>r.a.tradeinPerformancePreview(auth(next)),/已變更/);assert.equal(r.writes.length,before);
 }
});
