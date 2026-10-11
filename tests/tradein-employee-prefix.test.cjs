'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../tradein-performance-core.js');
const {createRuntime,parsed,employee,OPERATOR,DEVICE}=require('./helpers/tradein-synthetic-runtime.cjs');
function args(source,extra={}){return {source,employeeId:OPERATOR,deviceId:DEVICE,adminSecret:'SYNTHETIC_ADMIN_ONLY',...extra};}
function publish(r,source){const p=r.a.tradeinPerformancePreview(args(source));return r.a.tradeinPerformancePublish(args(source,{rosterHash:p.rosterHash,previewHash:p.previewHash,expectedActiveHash:p.expectedActiveHash}));}
function setup(id='12349',store='萬大',status='active'){
 const newcomer={employee_id:'55'+id,masked_name:'合＊新',store,role:'業務代表(I)',status,effective_from:'2026-10-01',effective_to:null};
 const r=createRuntime({monthlyRoster:[employee('12345'),employee('12346','店長'),employee('12347','代理店長','杭州南'),employee('12348','資深業務代表','三創'),newcomer]});
 const source=parsed();r.configure(source);publish(r,source);
 const next={...structuredClone(source),source_sha256:'b'.repeat(64),source_end:'2026-10-09',status_as_of_date:'2026-10-09',records:[...structuredClone(source.records),{...source.records[0],source_employee_id:id,trade_date:'2026-10-09',recycle_code:'SYNTHETIC-FIRST-SALE',order_number:'SYNTHETIC-FIRST-ORDER'}]};
 return {r,source,next,newcomer};
}
test('five and optional-55 seven character identities compare equally without altering source strings',()=>{
 for(const id of ['12349','0A1B2','8S999','55123']){assert.equal(C.sourceEmployeeId(id),id);assert.equal(C.sourceEmployeeId('55'+id),id);}
 for(const id of ['1234','123456','ZX12349','555512349',12349,' 12349','12349 '])assert.throws(()=>C.sourceEmployeeId(id));
});
test('parser keeps optional-55 export strings and mixed forms deduplicate one transaction',()=>{
 const {r,source}=setup();const initial=r.a.tradeinPerformancePrivateReference_(source,r.a.tradeinPerformanceMonthRoster_(source.month));
 const mixed=structuredClone(source);mixed.records.push({...mixed.records[0],source_employee_id:'55'+mixed.records[0].source_employee_id});
 const before=JSON.stringify(mixed);const s=C.build(mixed,r.a.tradeinPerformanceMonthRoster_(source.month),initial);
 assert.equal(s.summary.total_units,4);assert.equal(s.summary.duplicate_rows,1);assert.equal(JSON.stringify(mixed),before);
 const {csv}=require('./helpers/tradein-synthetic-runtime.cjs');const text=csv().toString().replace(',12345,',',5512345,');
 assert.equal(C.parseSar74(text).records[0].source_employee_id,'5512345');
});
test('a first-sale employee already in the verified month roster needs no manual per-file crosswalk',()=>{
 const {r,next,newcomer}=setup(),writes=r.writes.length;const p=r.a.tradeinPerformancePreview(args(next));
 assert.equal(r.writes.length,writes);assert.equal(p.snapshot.summary.assigned_units,5);assert.equal(p.snapshot.summary.pending_identity_units,0);
 assert.equal(p.snapshot.people.find(p=>p.masked_name===newcomer.masked_name).actual_units,1);
 const saved=publish(r,next);assert.equal(saved.snapshot.summary.total_units,5);
 const config=JSON.parse(r.a.tradeinPerformanceFile_('north12b-tradein-reference-'+next.source_sha256+'.json').getBlob().getDataAsString());
 assert.equal(config.employee_id_policy,'optional-55-prefix/v1');assert.equal(config.employees.find(p=>p.source_employee_id==='12349').employee_key,newcomer.employee_id);
});
test('seven-character first-sale export and subsequent prefix changes keep the same person',()=>{
 const {r,next,newcomer}=setup();next.records.at(-1).source_employee_id=newcomer.employee_id;publish(r,next);
 const again={...structuredClone(next),source_sha256:'c'.repeat(64)};again.records.at(-1).source_employee_id='12349';
 const result=publish(r,again);assert.equal(result.snapshot.summary.total_units,5);assert.equal(result.snapshot.people.find(p=>p.masked_name===newcomer.masked_name).actual_units,1);
});
test('a five-character ID beginning in 55 retains its five-character identity',()=>{
 const {r,next,newcomer}=setup('55123');const s=publish(r,next).snapshot;
 assert.equal(s.people.find(p=>p.masked_name===newcomer.masked_name).actual_units,1);
});
test('normalized duplicate private mappings are refused rather than choosing an identity',()=>{
 const {r,source}=setup();const config=r.a.tradeinPerformancePrivateReference_(source,r.a.tradeinPerformanceMonthRoster_(source.month));
 config.employees.push({...config.employees[0],source_employee_id:'55'+config.employees[0].source_employee_id,employee_key:'5512345'});
 assert.throws(()=>C.build(source,r.a.tradeinPerformanceMonthRoster_(source.month),config),/員編對照/);
});
for(const [label,store,status] of [['other store','酒泉','active'],['inactive','萬大','inactive']])test('optional prefix does not admit '+label+' roster employee',()=>{
 const {r,next}=setup('12349',store,status),writes=r.writes.length;
 assert.throws(()=>r.a.tradeinPerformancePreview(args(next)),/新增員編或店點異動待核/);assert.equal(r.writes.length,writes);
});
test('optional prefix does not admit a person absent from the verified monthly roster',()=>{
 const {r,next}=setup();next.records.at(-1).source_employee_id='5512350';
 assert.throws(()=>r.a.tradeinPerformancePreview(args(next)),/新增員編或店點異動待核/);
});
