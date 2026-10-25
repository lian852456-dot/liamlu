'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createRuntime,parsed,OPERATOR,DEVICE}=require('./helpers/tradein-synthetic-runtime.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
const args=(source,extra={})=>({source,employeeId:OPERATOR,deviceId:DEVICE,adminSecret:'SYNTHETIC_ADMIN_ONLY',...extra});
const preview=(r,s)=>r.a.tradeinPerformancePreview(args(s));
function publish(r,s){const p=preview(r,s);return r.a.tradeinPerformancePublish(args(s,{rosterHash:p.rosterHash,previewHash:p.previewHash,expectedActiveHash:p.expectedActiveHash}));}
function saved(r,month='2026-10'){return plain(r.a.tradeinPerformanceSnapshot_(r.a.tradeinPerformanceRegistry_().months[month].active));}
function setup(){const r=createRuntime(),source=parsed();r.configure(source);const first=publish(r,source);return {r,source,first};}
function canceled(source,hash='b'){const next=structuredClone(source);next.source_sha256=hash.repeat(64);next.records[0].cancel_date='2026-10-03';return next;}
function unchangedFailure(r,s,pattern){const before=JSON.stringify(r.a.tradeinPerformanceRegistry_()),writes=r.writes.length;assert.throws(()=>preview(r,s),pattern);assert.equal(JSON.stringify(r.a.tradeinPerformanceRegistry_()),before);assert.equal(r.writes.length,writes);assert.equal(r.held(),false);}
const expected=s=>({expectedRegistryExists:s.registryExists,expectedRegistryHash:s.registryHash,expectedPublicRegistryExists:s.publicRegistryExists,expectedPublicRegistryHash:s.publicRegistryHash,expectedActiveHash:s.activeHash,expectedMonthlyHash:s.monthlyHash,expectedReferenceHash:s.referenceHash});

test('new same-month source previews with zero writes, derives the narrow policy, and replaces the month by net counts',()=>{
 const {r,source}=setup(),batch=canceled(source),writes=r.writes.length,p=preview(r,batch);
 assert.equal(p.snapshot.summary.total_units,3);assert.equal(p.snapshot.summary.cancelled_units,1);assert.equal(r.writes.length,writes);
 assert.equal(r.a.tradeinPerformanceFile_('north12b-tradein-reference-'+batch.source_sha256+'.json'),null);
 assert.equal(publish(r,batch).status,'published');const snapshot=saved(r),pair=snapshot.cancellation_evidence.pairs[0];
 assert.equal(snapshot.cancellation_evidence.pairs.length,1);assert.equal(pair.sale.quantity,1);assert.equal(pair.cancellation.quantity,-1);
 assert.equal(pair.sale.date,'2026-10-02');assert.equal(pair.cancellation.date,'2026-10-03');
 assert.notEqual(pair.sale.event_id,pair.cancellation.event_id);assert.equal(snapshot.people.find(p=>p.employee_key==='ZX00001').actual_units,0);
 assert.equal(snapshot.stores.find(s=>s.store==='萬大').total_units,2);
 const reference=JSON.parse(r.a.tradeinPerformanceFile_('north12b-tradein-reference-'+batch.source_sha256+'.json').getBlob().getDataAsString());
 assert.equal(reference.counting_policy,'monthly-reset-same-month-net/v2');
});
test('same-source retry is a no-op and a reexport retains exactly one stable plus/minus pair',()=>{
 const {r,source}=setup(),batch=canceled(source);publish(r,batch);const first=saved(r),writes=r.writes.length;
 assert.equal(publish(r,batch).status,'unchanged');assert.equal(r.writes.length,writes);
 const reexport={...batch,source_sha256:'c'.repeat(64),printed_at:'synthetic later export'};publish(r,reexport);
 assert.deepEqual(saved(r).cancellation_evidence,first.cancellation_evidence);assert.equal(saved(r).summary.total_units,3);
});
test('duplicate original and canceled rows do not add a sale or a second cancellation',()=>{
 const {r,source}=setup(),batch=canceled(source);batch.records.push({...source.records[0]}, {...batch.records[0]});
 publish(r,batch);const snapshot=saved(r);assert.equal(snapshot.summary.total_units,3);assert.equal(snapshot.summary.cancelled_units,1);
 assert.equal(snapshot.summary.duplicate_rows,2);assert.equal(snapshot.cancellation_evidence.pairs.length,1);
});
for(const mode of ['cancel field removed','transaction row removed','cancel date rewritten','order rewritten','employee rewritten'])test('known cancellation cannot silently change: '+mode,()=>{
 const {r,source}=setup(),batch=canceled(source);publish(r,batch);const next=structuredClone(batch);next.source_sha256='c'.repeat(64);
 if(mode==='cancel field removed')next.records[0].cancel_date=null;
 if(mode==='transaction row removed')next.records.shift();
 if(mode==='cancel date rewritten')next.records[0].cancel_date='2026-10-04';
 if(mode==='order rewritten')next.records[0].order_number='SYNTHETIC-OTHER-ORDER';
 if(mode==='employee rewritten')next.records[0].source_employee_id='12346';
 unchangedFailure(r,next,/已核取消交易.*缺漏或被改寫/);
});
test('conflicting duplicate cancellation dates and original-order mapping are refused before writes',()=>{
 const {r,source}=setup(),batch=canceled(source);batch.records.push({...batch.records[0],cancel_date:'2026-10-04'});
 unchangedFailure(r,batch,/同筆取消交易.*衝突/);
 batch.records.at(-1).cancel_date='2026-10-03';batch.records.at(-1).order_number='SYNTHETIC-OTHER-ORDER';
 unchangedFailure(r,batch,/衝突/);
});
test('any cross-month cancellation blocks the whole batch even with the new private policy',()=>{
 const {r,source}=setup(),batch=canceled(source);batch.records[0].cancel_date='2026-11-02';batch.status_as_of_date='2026-11-03';
 r.configure(batch,{counting_policy:'monthly-reset-same-month-net/v2'});unchangedFailure(r,batch,/跨月取消.*整批停止同步/);
});
test('legacy exact-source policy is preserved and cannot be silently rewritten by an upload',()=>{
 const {r,source}=setup(),batch=canceled(source);r.configure(batch);unchangedFailure(r,batch,/尚未核定同月/);
});
test('cancel evidence is private: no raw transaction identifiers, public or personal response leakage',()=>{
 const {r,source}=setup(),batch=canceled(source),result=publish(r,batch),snapshot=saved(r),evidence=JSON.stringify(snapshot.cancellation_evidence);
 for(const record of batch.records)for(const raw of [record.recycle_code,record.order_number])assert.equal(evidence.includes(raw),false);
 assert.equal(JSON.stringify(result).includes('transaction_key'),false);
 const publicValue=r.a.tradeinPerformancePublicPublish(args(batch,{month:batch.month,sourceHash:batch.source_sha256,expectedActiveHash:result.snapshotHash,includeReadback:true}));
 assert.equal(JSON.stringify(publicValue).includes('cancellation_evidence'),false);assert.equal(JSON.stringify(publicValue).includes('transaction_key'),false);
 const person=r.a.tradeinPerformanceRead({employeeId:'ZX00001',deviceId:DEVICE,month:batch.month});
 assert.equal(person.snapshot.people.length,1);assert.equal(JSON.stringify(person).includes('transaction_key'),false);
});
test('C1 restores the preceding month, retains cancel evidence/history and leaves another month unchanged',()=>{
 const {r,source,first}=setup(),batch=canceled(source),p=preview(r,batch),base={...args(batch),month:batch.month,sourceHash:batch.source_sha256};
 const status=r.a.tradeinPerformanceCheckpointStatus(base),checkpoint=r.a.tradeinPerformanceCheckpointCapture({...base,...expected(status),stage:'C1',previewHash:p.previewHash,rosterHash:p.rosterHash});
 const cancelledVersion=publish(r,batch),cancelledFile=r.a.tradeinPerformanceRegistry_().months[batch.month].active.file_id;
 const november={...source,month:'2026-11',source_start:'2026-11-01',source_end:'2026-11-07',status_as_of_date:'2026-11-08',source_sha256:'d'.repeat(64),records:[{...source.records[0],trade_date:'2026-11-02'}]};r.configure(november);publish(r,november);
 const other=JSON.stringify(r.a.tradeinPerformanceRegistry_().months['2026-11']);
 r.a.tradeinPerformanceCheckpointRestore({...base,...expected(r.a.tradeinPerformanceCheckpointStatus(base)),checkpointId:checkpoint.checkpointId,checkpointHash:checkpoint.checkpointHash,restoreMonth:true});
 assert.equal(r.a.tradeinPerformanceRegistry_().months[batch.month].active.snapshot_hash,first.snapshotHash);
 assert.equal(saved(r).summary.total_units,4);assert.equal(JSON.stringify(r.a.tradeinPerformanceRegistry_().months['2026-11']),other);
 assert.equal(JSON.parse(r.files.get(cancelledFile).getBlob().getDataAsString()).cancellation_evidence.pairs.length,1);
 assert.notEqual(cancelledVersion.snapshotHash,first.snapshotHash);
 publish(r,batch);assert.equal(saved(r).summary.total_units,3);assert.equal(saved(r).cancellation_evidence.pairs.length,1);
});
