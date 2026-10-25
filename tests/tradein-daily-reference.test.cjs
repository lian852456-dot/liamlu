'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createRuntime,parsed,OPERATOR,DEVICE,employee}=require('./helpers/tradein-synthetic-runtime.cjs');
function args(source,extra={}){return {source,employeeId:OPERATOR,deviceId:DEVICE,adminSecret:'SYNTHETIC_ADMIN_ONLY',...extra};}
function publish(r,source){const p=r.a.tradeinPerformancePreview(args(source));return r.a.tradeinPerformancePublish(args(source,{rosterHash:p.rosterHash,previewHash:p.previewHash,expectedActiveHash:p.expectedActiveHash}));}
function setup(){const r=createRuntime(),source=parsed();r.configure(source);const first=publish(r,source);return {r,source,first};}
function next(source,hash='b'){return {...structuredClone(source),source_end:'2026-10-09',status_as_of_date:'2026-10-10',source_sha256:hash.repeat(64),records:[...structuredClone(source.records),{...source.records[0],trade_date:'2026-10-09',recycle_code:'SYNTHETIC-NEW-RECOVERY',order_number:'SYNTHETIC-NEW-ORDER'}]};}
function noWriteFailure(r,source,error){const writes=r.writes.length,registry=JSON.stringify(r.a.tradeinPerformanceRegistry_());assert.throws(()=>r.a.tradeinPerformancePreview(args(source)),error);assert.equal(r.writes.length,writes);assert.equal(JSON.stringify(r.a.tradeinPerformanceRegistry_()),registry);assert.equal(r.held(),false);}
test('new file reuses published identities; preview is read-only and publish replaces monthly actuals',()=>{
 const {r,source}=setup(),batch=next(source),writes=r.writes.length,before=JSON.stringify([...r.configs].map(([n,f])=>[n,f.getBlob().getDataAsString()]));
 const p=r.a.tradeinPerformancePreview(args(batch));assert.equal(p.snapshot.summary.total_units,5);assert.equal(p.snapshot.summary.assigned_units,5);assert.equal(p.snapshot.summary.staff_target_units,6);
 assert.equal(r.writes.length,writes);assert.equal(JSON.stringify([...r.configs].map(([n,f])=>[n,f.getBlob().getDataAsString()])),before);
 const result=publish(r,batch);assert.equal(result.status,'published');assert.equal(result.snapshot.summary.total_units,5);
 const saved=r.a.tradeinPerformanceFile_('north12b-tradein-reference-'+batch.source_sha256+'.json');assert.ok(saved);
 const ref=JSON.parse(saved.getBlob().getDataAsString());assert.equal(ref.source_end,batch.source_end);assert.equal(ref.employees[0].observations.some(o=>o.trade_date==='2026-10-09'),true);
 const active=r.a.tradeinPerformanceRegistry_().months[batch.month].active;assert.equal(active.reference_hash,r.a.tradeinPerformanceHash_(ref));
 const count=r.writes.length;assert.equal(publish(r,batch).status,'unchanged');assert.equal(r.writes.length,count);
 assert.equal(r.a.tradeinPerformanceRead({employeeId:OPERATOR,deviceId:DEVICE,month:batch.month}).snapshot.summary.total_units,5);
});
test('next day and changed print metadata need no per-file manual configuration',()=>{
 const {r,source}=setup();const day2=next(source);publish(r,day2);
 const day3=next(day2,'c');day3.source_end='2026-10-10';day3.status_as_of_date='2026-10-11';day3.records.at(-1).recycle_code='SYNTHETIC-THIRD-RECOVERY';
 assert.equal(publish(r,day3).snapshot.summary.total_units,6);
 const reexport={...day3,source_sha256:'d'.repeat(64),printed_at:'synthetic new print time'};
 assert.equal(publish(r,reexport).snapshot.summary.total_units,6);
});
test('known identities remain reusable after a file contains no transactions',()=>{
 const {r,source}=setup(),empty={...next(source),records:[]};assert.equal(publish(r,empty).snapshot.summary.total_units,0);
 const later=next(source,'c');assert.equal(publish(r,later).snapshot.summary.total_units,5);
});
for(const [label,edit,error] of [
 ['new employee',b=>b.records.at(-1).source_employee_id='54321',/1 組新增員編/],
 ['changed source case',b=>b.records.at(-1).source_employee_id='12a45',/新增員編/],
 ['store transfer',b=>b.records.at(-1).store_code='DNB10062',/店點異動待核/],
 ['unknown store',b=>b.records.at(-1).store_code='DNB99999',/未知店碼/],
 ['cross-month cancellation',b=>{b.records.at(-1).cancel_date='2026-11-02';b.status_as_of_date='2026-11-03';},/整批停止同步/],
 ['older report',b=>{b.source_end='2026-10-06';b.status_as_of_date='2026-10-06';},/完整本月新檔/],
 ['new month',b=>{b.month='2026-11';b.source_start='2026-11-01';b.source_end='2026-11-09';},/本月首次來源/]
])test(label+' is rejected with no private mutation',()=>{const {r,source}=setup(),batch=next(source);edit(batch);noWriteFailure(r,batch,error);});
test('changed monthly roster cannot silently change the reusable crosswalk or targets',()=>{
 const {r,source}=setup();r.setMonthlyRoster(source.month,[employee('12345')],{source_sha256:'e'.repeat(64)});noWriteFailure(r,next(source),/核定月名冊已變更/);
});
test('duplicate, missing, unreviewed or corrupted published reference is refused',()=>{
 for(const mode of ['missing','duplicate','policy','mapping','snapshot']){
  const {r,source}=setup(),name='north12b-tradein-reference-'+source.source_sha256+'.json',file=r.configs.get(name);
  if(mode==='missing')r.configs.delete(name);
  else if(mode==='duplicate')r.configs.set('SYNTHETIC_DUPLICATE',file);
  else if(mode==='snapshot'){const active=r.a.tradeinPerformanceRegistry_().months[source.month].active;r.files.get(active.file_id).tamperForTest('{}');}
  else {const value=JSON.parse(file.getBlob().getDataAsString());if(mode==='policy')value.counting_review_status='pending';else value.employees[0].employee_key='ZX00003';file.tamperForTest(JSON.stringify(value));}
  noWriteFailure(r,next(source),/缺漏|重複|已變更|核對失敗/);
 }
});
test('legacy published entry without reference hash can bootstrap only its same-month owner mapping',()=>{
 const {r,source}=setup(),registry=r.a.tradeinPerformanceRegistry_();delete registry.months[source.month].active.reference_hash;
 r.a.tradeinPerformanceFile_('north12b-tradein-performance-registry.json').tamperForTest(JSON.stringify(registry));
 assert.equal(publish(r,next(source)).snapshot.summary.total_units,5);
});
test('stale preview stops before saving a generated reference',()=>{
 const {r,source}=setup(),batch=next(source),p=r.a.tradeinPerformancePreview(args(batch));
 publish(r,{...source,source_sha256:'c'.repeat(64),printed_at:'synthetic newer export'});
 const writes=r.writes.length;assert.throws(()=>r.a.tradeinPerformancePublish(args(batch,{rosterHash:p.rosterHash,previewHash:p.previewHash,expectedActiveHash:p.expectedActiveHash})),/同期版本已變更/);
 assert.equal(r.writes.length,writes);assert.equal(r.a.tradeinPerformanceFile_('north12b-tradein-reference-'+batch.source_sha256+'.json'),null);
});
test('C1 captures before generated configuration; restore keeps new files and restores prior monthly version',()=>{
 const {r,source,first}=setup(),batch=next(source),p=r.a.tradeinPerformancePreview(args(batch));
 const base={...args(batch),month:batch.month,sourceHash:batch.source_sha256},s=r.a.tradeinPerformanceCheckpointStatus(base);
 const expected=x=>({expectedRegistryExists:x.registryExists,expectedRegistryHash:x.registryHash,expectedPublicRegistryExists:x.publicRegistryExists,expectedPublicRegistryHash:x.publicRegistryHash,expectedActiveHash:x.activeHash,expectedMonthlyHash:x.monthlyHash,expectedReferenceHash:x.referenceHash});
 assert.equal(s.referenceHash,null);const checkpoint=r.a.tradeinPerformanceCheckpointCapture({...base,...expected(s),stage:'C1',previewHash:p.previewHash,rosterHash:p.rosterHash});publish(r,batch);
 const restored=r.a.tradeinPerformanceCheckpointRestore({...base,...expected(r.a.tradeinPerformanceCheckpointStatus(base)),restoreMonth:true,checkpointId:checkpoint.checkpointId,checkpointHash:checkpoint.checkpointHash});
 assert.equal(restored.state.activeHash,first.snapshotHash);assert.ok(r.a.tradeinPerformanceFile_('north12b-tradein-reference-'+batch.source_sha256+'.json'));
});
test('failed reference readback leaves active version intact and lock released',()=>{
 const {r,source,first}=setup(),batch=next(source),create=r.folder.createFile;
 r.folder.createFile=(name,text)=>{const file=create(name,text);if(name.includes('tradein-reference-'))file.tamperForTest('{}');return file;};
 assert.throws(()=>publish(r,batch),/私有對照保存後核對失敗/);assert.equal(r.a.tradeinPerformanceRegistry_().months[source.month].active.snapshot_hash,first.snapshotHash);assert.equal(r.held(),false);
});
test('reused reference never grants device access or leaks source identity through public progress',()=>{
 const {r,source}=setup(),batch=next(source);const saved=publish(r,batch);
 assert.throws(()=>r.a.tradeinPerformanceRead({employeeId:'ZX00001',deviceId:'SYNTHETIC_WRONG_DEVICE',month:batch.month}),/尚未核准/);
 r.a.tradeinPerformancePublicPublish({...args(batch),month:batch.month,sourceHash:batch.source_sha256,expectedActiveHash:saved.snapshotHash});
 const text=JSON.stringify(r.a.tradeinPerformancePublicRead({month:batch.month,includeDays:true}));
 for(const value of ['12345','ZX00001','source_employee_id','observations','reference_hash','SYNTHETIC-NEW-ORDER'])assert.equal(text.includes(value),false,value);
});
