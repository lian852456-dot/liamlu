'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createRuntime,employee,parsed,OPERATOR,DEVICE}=require('./helpers/tradein-synthetic-runtime.cjs');
const Core=require('../tradein-performance-core.js'),Ref=require('./tradein-reference-fixture.cjs');
function setup(){const r=createRuntime(),source=parsed();r.configure(source);return {r,source};}
function payload(source,extra={}){return {source,employeeId:OPERATOR,deviceId:DEVICE,adminSecret:'SYNTHETIC_ADMIN_ONLY',...extra};}
function publish(r,source){const p=r.a.tradeinPerformancePreview(payload(source));return r.a.tradeinPerformancePublish(payload(source,{rosterHash:p.rosterHash,previewHash:p.previewHash,expectedActiveHash:p.expectedActiveHash}));}
function readonlyFailure(r,source,re){assert.throws(()=>r.a.tradeinPerformancePreview(payload(source)),re);assert.equal(r.files.size,0);assert.deepEqual(r.writes,[]);assert.equal(r.held(),false);}
test('successful synthetic preview, publish, read and same-source no-op use the real core/API',()=>{
 const {r,source}=setup(),p=r.a.tradeinPerformancePreview(payload(source));assert.equal(r.files.size,0);
 assert.equal(p.snapshot.summary.total_units,4);assert.equal(p.snapshot.summary.target_staff_count,2);assert.equal(p.snapshot.summary.staff_target_units,6);
 const result=publish(r,source);assert.equal(result.status,'published');assert.equal(r.files.size,2);const writes=r.writes.length;
 assert.equal(publish(r,source).status,'unchanged');assert.equal(r.writes.length,writes);
 const out=r.a.tradeinPerformanceRead({employeeId:OPERATOR,deviceId:DEVICE,month:'2026-10'});
 assert.equal(out.snapshot.summary.total_units,4);assert.equal(out.snapshot.stores.length,9);
 assert.equal(out.snapshot.people.find(p=>p.role==='店長').target_units,null);
 assert.equal(out.snapshot.people.find(p=>p.role==='代理店長').actual_units,1);
 assert.equal(JSON.stringify(out).includes('ZX00001'),false);assert.equal(JSON.stringify(out).includes('SYNTHETIC-REC'),false);
});
test('missing monthly evidence cannot fall back to the login roster',()=>{
 const {r,source}=setup();r.configs.delete('north12b-tradein-monthly-roster-2026-10.json');
 r.a.tradeinPerformanceRoster_=()=>[employee('12345')];readonlyFailure(r,source,/登入名冊/);
});
test('missing exact source reference blocks before any private writes',()=>{
 const {r,source}=setup();r.configs.clear();r.setMonthlyRoster('2026-10',[employee('12345')]);readonlyFailure(r,source,/私有員編/);
});
test('blank cancellations do not authorize candidate counting rules',()=>{
 const {r,source}=setup();r.configure(source,{counting_review_status:'unverified'});readonlyFailure(r,source,/重新計數口徑/);
});
test('any cancellation blocks the whole batch while attribution is unapproved',()=>{
 const {r,source}=setup();source.records[0].cancel_date='2026-10-03';readonlyFailure(r,source,/整批停止同步/);
});
test('client-supplied private reference cannot override the owner-loaded file',()=>{
 const {r,source}=setup();r.configs.delete('north12b-tradein-reference-'+source.source_sha256+'.json');
 assert.throws(()=>r.a.tradeinPerformancePreview(payload(source,{private_reference:Ref.reference(source)})),/私有員編/);assert.equal(r.files.size,0);
});
for(const [name,people,patch,error] of [
 ['unreviewed',[employee('12345')],{review_status:'pending'},/核定狀態/],
 ['empty',[],{},/核定狀態/],
 ['wrong month',[employee('12345')],{month:'2026-11'},/核定狀態/],
 ['missing source hash',[employee('12345')],{source_sha256:''},/核定狀態/],
 ['unknown role',[{...employee('12345'),role:'未知職務'}],{},/職務/],
 ['duplicate identities',[employee('12345'),employee('12345')],{},/身份/],
 ['invalid effective day',[{...employee('12345'),effective_from:'2026-02-30'}],{},/生效/],
 ['partial month joining',[{...employee('12345'),effective_from:'2026-10-02'}],{},/月中/],
 ['partial month leaving',[{...employee('12345'),effective_to:'2026-10-20'}],{},/月中/],
 ['missing masked name',[{...employee('12345'),masked_name:''}],{},/身份/]
])test('monthly evidence rejects '+name,()=>{
 const {r,source}=setup();r.setMonthlyRoster('2026-10',people,patch);readonlyFailure(r,source,error);
});
test('monthly role evidence is independent from login access role',()=>{
 const {r,source}=setup();r.accessRows.get(Ref.IDS['12346']).role='業務代表(I)';publish(r,source);
 const out=r.a.tradeinPerformanceRead({employeeId:Ref.IDS['12346'],deviceId:DEVICE,month:'2026-10'});
 assert.equal(out.access.mode,'self');assert.equal(out.snapshot.people.length,1);assert.equal(out.snapshot.people[0].role,'店長');
 assert.equal(out.snapshot.people[0].actual_units,2);assert.equal(out.snapshot.people[0].target_units,null);
 assert.deepEqual(Array.from(out.snapshot.stores),[]);assert.equal(out.snapshot.summary,null);
});
test('changed monthly source evidence blocks published readback',()=>{
 const {r,source}=setup();publish(r,source);r.setMonthlyRoster('2026-10',[employee('12345')],{source_sha256:'e'.repeat(64)});
 assert.throws(()=>r.a.tradeinPerformanceRead({employeeId:OPERATOR,deviceId:DEVICE,month:'2026-10'}),/核定月名冊已變更/);
});
test('wrong device and unknown identity cannot read private actuals',()=>{
 const {r,source}=setup();publish(r,source);
 for(const [employeeId,deviceId] of [[Ref.IDS['12345'],'SYNTHETIC_WRONG_DEVICE'],['ZZ00000',DEVICE]])
 assert.throws(()=>r.a.tradeinPerformanceRead({employeeId,deviceId,month:'2026-10'}),/尚未核准/);
});
test('reference source drift and official store alias mismatch are rejected',()=>{
 const {r,source}=setup();r.configure(source,{source_end:'2026-10-06'});readonlyFailure(r,source,/本批來源/);
 const ref=Ref.reference(source);ref.stores[5].store_code='DNB10059';r.configure(source,ref);readonlyFailure(r,source,/店碼對照/);
});
test('shared private folder cannot be used for monthly configurations',()=>{
 const {r,source}=setup();r.folder.getSharingAccess=()=> 'ANYONE';readonlyFailure(r,source,/維持私有/);
});
test('duplicate owner configuration files reject instead of selecting one',()=>{
 const {r,source}=setup();const original=r.configs.get('north12b-tradein-reference-'+source.source_sha256+'.json');
 r.configs.set('SYNTHETIC_DUPLICATE',original);readonlyFailure(r,source,/私有資料檔重複/);
});
test('replacement snapshot and rollback retain bytes and read through original version',()=>{
 const {r,source}=setup(),first=publish(r,source),next={...source,source_sha256:'b'.repeat(64),records:source.records.slice(0,2)};
 r.configure(next);const second=publish(r,next);assert.notEqual(first.snapshotHash,second.snapshotHash);assert.equal(r.files.size,3);
 const result=r.a.tradeinPerformanceRollback(payload(null,{month:'2026-10',expectedActiveHash:second.snapshotHash}));
 assert.equal(result.snapshotHash,first.snapshotHash);
 assert.equal(r.a.tradeinPerformanceRead({employeeId:OPERATOR,deviceId:DEVICE,month:'2026-10'}).snapshot.summary.total_units,4);
 assert.equal(r.held(),false);
});
test('41 synthetic monthly rows with seven managers and two acting managers yield 32 targets and 96 units',()=>{
 const {r,source}=setup();const keys=Object.values(Ref.IDS);
 const people=Array.from({length:41},(_,i)=>({employee_id:keys[i]||'QZ'+String(i).padStart(5,'0'),masked_name:'合＊員'+i,
  store:i===2?'杭州南':i===3?'三創':'萬大',role:i<7?'店長':i<9?'代理店長':'業務代表(I)',status:'active',effective_from:'2026-10-01',effective_to:null}));
 r.setMonthlyRoster('2026-10',people);const p=r.a.tradeinPerformancePreview(payload(source));
 assert.equal(p.snapshot.people.length,41);assert.equal(p.snapshot.summary.target_staff_count,32);assert.equal(p.snapshot.summary.staff_target_units,96);
});
test('new calendar month resets actuals while the previous monthly snapshot is retained',()=>{
 const {r,source}=setup();publish(r,source);
 const next={...source,month:'2026-11',source_start:'2026-11-01',source_end:'2026-11-07',status_as_of_date:'2026-11-08',source_sha256:'c'.repeat(64),records:[{...source.records[0],trade_date:'2026-11-02'}]};
 r.configure(next);publish(r,next);
 const read=month=>r.a.tradeinPerformanceRead({employeeId:OPERATOR,deviceId:DEVICE,month});
 assert.equal(read('2026-10').snapshot.summary.total_units,4);assert.equal(read('2026-11').snapshot.summary.total_units,1);
 assert.equal(read('2026-11').snapshot.summary.staff_target_units,6);assert.equal(r.files.size,3);
});
