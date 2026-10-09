'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createRuntime,parsed,OPERATOR,DEVICE,hash}=require('./helpers/tradein-synthetic-runtime.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
function setup(options={}){const r=createRuntime(options),source=parsed();r.configure(source);return {r,source};}
function base(source){return {employeeId:OPERATOR,deviceId:DEVICE,adminSecret:'SYNTHETIC_ADMIN_ONLY',month:source.month,sourceHash:source.source_sha256};}
function status(r,source){return r.a.tradeinPerformanceCheckpointStatus(base(source));}
function expected(s){return {expectedRegistryExists:s.registryExists,expectedRegistryHash:s.registryHash,expectedPublicRegistryExists:s.publicRegistryExists,expectedPublicRegistryHash:s.publicRegistryHash,expectedActiveHash:s.activeHash,expectedMonthlyHash:s.monthlyHash,expectedReferenceHash:s.referenceHash};}
function capture(r,source,stage='C1'){
 const p=stage==='C1'?r.a.tradeinPerformancePreview({...base(source),source}):{};
 return r.a.tradeinPerformanceCheckpointCapture({...base(source),...expected(status(r,source)),stage,source,previewHash:p.previewHash,rosterHash:p.rosterHash});
}
function publish(r,source){const p=r.a.tradeinPerformancePreview({...base(source),source});return r.a.tradeinPerformancePublish({...base(source),source,rosterHash:p.rosterHash,previewHash:p.previewHash,expectedActiveHash:p.expectedActiveHash});}
function restorePayload(r,source,c){return {...base(source),...expected(status(r,source)),restoreMonth:true,checkpointId:c.checkpointId,checkpointHash:c.checkpointHash};}
function registry(r){return plain(r.a.tradeinPerformanceRegistry_());}
function checkpoint(r,c){return JSON.parse(r.files.get(c.checkpointId).getBlob().getDataAsString());}
function alteredCheckpoint(r,c,edit){const body=checkpoint(r,c);edit(body);const text=JSON.stringify(body);r.files.get(c.checkpointId).tamperForTest(text);return {...c,checkpointHash:hash(text)};}
test('C0 before configuration and C1 after preview restore the first month to logically empty; all new files retained',()=>{
 const {r,source}=setup();r.configs.clear();const c0=capture(r,source,'C0');
 assert.equal(c0.state.monthlyHash,null);assert.equal(c0.state.referenceHash,null);assert.equal(c0.state.registryExists,false);
 r.setMonthlyRoster(source.month,[require('./helpers/tradein-synthetic-runtime.cjs').employee('12345')]);r.configure(source);
 const c1=capture(r,source),saved=publish(r,source),ids=[...r.files.keys()];
 assert.throws(()=>r.a.tradeinPerformanceRollback({...base(source),expectedActiveHash:saved.snapshotHash}),/沒有可回復/);
 let restored=r.a.tradeinPerformanceCheckpointRestore(restorePayload(r,source,c1));
 assert.equal(restored.status,'checkpoint_restored');assert.equal(restored.state.activeHash,null);assert.equal(restored.state.slotPresent,false);
 assert.deepEqual([...r.files.keys()],ids);assert.equal(registry(r).months['2026-10'],undefined);
 const read=r.a.tradeinPerformanceRead({employeeId:OPERATOR,deviceId:DEVICE,month:source.month});assert.equal(read.snapshot,null);assert.equal(read.availableMonths.length,0);
 restored=r.a.tradeinPerformanceCheckpointRestore(restorePayload(r,source,c0));
 assert.deepEqual(Array.from(restored.retainedNewConfigurationFiles).sort(),['monthly','reference']);
 assert.deepEqual([...r.files.keys()],ids);assert.equal(r.configs.size,2);assert.equal(r.held(),false);
});
test('restore only the chosen month; preserve newly published other months and every historical snapshot',()=>{
 const {r,source}=setup(),first=publish(r,source),c=capture(r,source);
 const next={...source,source_sha256:'b'.repeat(64),records:source.records.slice(0,1)};r.configure(next);publish(r,next);
 const november={...source,month:'2026-11',source_start:'2026-11-01',source_end:'2026-11-07',status_as_of_date:'2026-11-08',source_sha256:'c'.repeat(64),records:[{...source.records[0],trade_date:'2026-11-02'}]};r.configure(november);publish(r,november);
 const priorOther=registry(r).months['2026-11'],allIds=[...r.files.keys()];
 r.a.tradeinPerformanceCheckpointRestore(restorePayload(r,source,c));
 assert.equal(registry(r).months['2026-10'].active.snapshot_hash,first.snapshotHash);
 assert.deepEqual(registry(r).months['2026-11'],priorOther);assert.deepEqual([...r.files.keys()],allIds);
 assert.equal(r.a.tradeinPerformanceRead({employeeId:OPERATOR,deviceId:DEVICE,month:'2026-10'}).snapshot.summary.total_units,4);
});
test('C0 restores captured monthly basis bytes while leaving auth and newly created files intact',()=>{
 const {r,source}=setup(),original=publish(r,source),c=capture(r,source,'C0'),basisName='north12b-tradein-monthly-roster-'+source.month+'.json';
 const beforeBasis=r.configs.get(basisName).getBlob().getDataAsString(),authBefore=JSON.stringify([...r.accessRows]);
 const employees=require('./helpers/tradein-synthetic-runtime.cjs');r.setMonthlyRoster(source.month,[employees.employee('12345')],{source_sha256:'e'.repeat(64)});
 const next={...source,source_sha256:'b'.repeat(64)};r.configure(next);publish(r,next);const count=r.files.size;
 r.a.tradeinPerformanceCheckpointRestore(restorePayload(r,source,c));
 assert.equal(r.configs.get(basisName).getBlob().getDataAsString(),beforeBasis);
 assert.equal(registry(r).months[source.month].active.snapshot_hash,original.snapshotHash);
 assert.equal(JSON.stringify([...r.accessRows]),authBefore);assert.equal(r.files.size,count);assert.equal(r.held(),false);
});
test('repeat restore using fresh CAS is stable and preserves all artifacts',()=>{
 const {r,source}=setup(),c=capture(r,source);publish(r,source);r.a.tradeinPerformanceCheckpointRestore(restorePayload(r,source,c));
 const before=registry(r),count=r.files.size;r.a.tradeinPerformanceCheckpointRestore(restorePayload(r,source,c));assert.deepEqual(registry(r),before);assert.equal(r.files.size,count);
});
for(const field of ['expectedRegistryHash','expectedPublicRegistryHash','expectedActiveHash','expectedMonthlyHash','expectedReferenceHash','expectedRegistryExists','expectedPublicRegistryExists'])test('stale '+field+' rejects before writes and releases lock',()=>{
 const {r,source}=setup(),c=capture(r,source);publish(r,source);const p=restorePayload(r,source,c);
 p[field]=field.endsWith('Exists')?!p[field]:'f'.repeat(64);const writes=r.writes.length,before=registry(r);
 assert.throws(()=>r.a.tradeinPerformanceCheckpointRestore(p),/已變更/);assert.equal(r.writes.length,writes);assert.deepEqual(registry(r),before);assert.equal(r.held(),false);
});
test('a change only in another month invalidates the whole-registry CAS',()=>{
 const {r,source}=setup(),c=capture(r,source);publish(r,source);const p=restorePayload(r,source,c),file=[...r.files.values()].find(f=>f.getName()==='north12b-tradein-performance-registry.json');
 const changed=registry(r);changed.months['2026-12']={active:null,previous:null};file.tamperForTest(JSON.stringify(changed));const writes=r.writes.length;
 assert.throws(()=>r.a.tradeinPerformanceCheckpointRestore(p),/已變更/);assert.equal(r.writes.length,writes);assert.equal(r.held(),false);
});
for(const change of ['missing field','missing confirmation','bad secret','staff operator','foreign owner','missing owner'])test(change+' is refused with zero data mutation',()=>{
 const {r,source}=setup(change==='foreign owner'?{configuredOwner:'LOCAL_FOREIGN_OWNER_A'}:change==='missing owner'?{configuredOwner:''}:{});
 if(change.includes('owner')){assert.throws(()=>status(r,source),/同一 owner/);assert.equal(r.writes.length,0);return;}
 const c=capture(r,source);publish(r,source);const p=restorePayload(r,source,c),writes=r.writes.length;
 if(change==='missing field')delete p.expectedActiveHash;
 if(change==='missing confirmation')p.restoreMonth=false;
 if(change==='bad secret')p.adminSecret='SYNTHETIC_BAD';
 if(change==='staff operator')p.employeeId='ZX00001';
 assert.throws(()=>r.a.tradeinPerformanceCheckpointRestore(p));assert.equal(r.writes.length,writes);assert.equal(r.held(),false);
});
test('checkpoint blob tamper and wrong parent are rejected before private mutations',()=>{
 for(const mode of ['tamper','foreign folder']){
  const {r,source}=setup(),c=capture(r,source);publish(r,source);const p=restorePayload(r,source,c),f=r.files.get(c.checkpointId);
  if(mode==='tamper')f.tamperForTest(f.getBlob().getDataAsString()+' ');
  else f.getParents=()=>{let once=true;return {hasNext:()=>once,next:()=>{once=false;return {getId:()=> 'LOCAL_FOREIGN_FOLDER'};}};};
  const writes=r.writes.length;assert.throws(()=>r.a.tradeinPerformanceCheckpointRestore(p),/完整性|資料夾/);assert.equal(r.writes.length,writes);assert.equal(r.held(),false);
 }
});
for(const field of ['owner_script_id','month','source_sha256','registry_sha256','slot','configuration name','configuration hash','previous missing'])test('malformed checkpoint '+field+' rejected before write even with recomputed outer checksum',()=>{
 const {r,source}=setup(),c=capture(r,source);publish(r,source);
 const bad=alteredCheckpoint(r,c,x=>{
  if(field==='configuration name')x.monthly.name='north12b-dashboard-private-latest.json';
  else if(field==='configuration hash')x.monthly.sha256='f'.repeat(64);
  else if(field==='previous missing'){x.slot_present=true;x.slot={active:null};x.registry_body=JSON.stringify({schema_version:'tradein-performance-registry/v1',months:{[source.month]:x.slot}});x.registry_sha256=hash(x.registry_body);}
  else x[field]=field==='slot'?{}:'SYNTHETIC_BAD';
 });
 const writes=r.writes.length;assert.throws(()=>r.a.tradeinPerformanceCheckpointRestore(restorePayload(r,source,bad)));assert.equal(r.writes.length,writes);assert.equal(r.held(),false);
});
test('C1 rejects unreviewed or cancelled batch and mismatch with preview before checkpoint creation',()=>{
 for(const mode of ['preview','cancel','reference']){
  const {r,source}=setup(),p=r.a.tradeinPerformancePreview({...base(source),source});
  if(mode==='cancel')source.records[0].cancel_date='2026-10-03';
  if(mode==='reference')r.configure(source,{counting_review_status:'pending'});
  const args={...base(source),...expected(status(r,source)),stage:'C1',source,previewHash:mode==='preview'?'f'.repeat(64):p.previewHash,rosterHash:p.rosterHash};
  assert.throws(()=>r.a.tradeinPerformanceCheckpointCapture(args));assert.equal(r.writes.length,0);assert.equal(r.held(),false);
 }
});
test('lock is held across capture file save and restore readback; readback failure is visible and history retained',()=>{
 const {r,source}=setup(),c=capture(r,source);publish(r,source);
 const f=[...r.files.values()].find(f=>f.getName()==='north12b-tradein-performance-registry.json'),original=f.setContent;
 f.setContent=v=>{assert.ok(r.held());original(v);f.tamperForTest(v+' ');};const count=r.files.size;
 assert.throws(()=>r.a.tradeinPerformanceCheckpointRestore(restorePayload(r,source,c)),/完整 registry/);
 assert.equal(r.files.size,count);assert.equal(r.held(),false);
});
test('checkpoint contains no raw transaction, customer or secret fields; status exposes hashes only',()=>{
 const {r,source}=setup(),c=capture(r,source),text=JSON.stringify(checkpoint(r,c)),s=JSON.stringify(status(r,source));
 for(const value of ['SYNTHETIC_ADMIN_ONLY','SYNTHETIC-REC','SYNTHETIC-ORDER','device_id','adminSecret','records'])assert.equal(text.includes(value),false,value);
 for(const value of ['ZX00001','合＊','body','employee_id','folder_id'])assert.equal(s.includes(value),false,value);
});
