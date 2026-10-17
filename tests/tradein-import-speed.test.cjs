'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createRuntime,parsed,OPERATOR}=require('./helpers/tradein-synthetic-runtime.cjs');
const plain=value=>JSON.parse(JSON.stringify(value));
function setup(options={}){const r=createRuntime(options),source=parsed();r.configure(source);return {r,source,base:{employeeId:OPERATOR,adminSecret:r.secret,month:source.month,sourceHash:source.source_sha256}};}
const expected=s=>({expectedRegistryExists:s.registryExists,expectedRegistryHash:s.registryHash,expectedPublicRegistryExists:s.publicRegistryExists,expectedPublicRegistryHash:s.publicRegistryHash,expectedActiveHash:s.activeHash,expectedMonthlyHash:s.monthlyHash,expectedReferenceHash:s.referenceHash});
function preview(f){return f.r.a.tradeinPerformancePreview({...f.base,source:f.source,includeCheckpointState:true});}
function capture(f,p){return f.r.a.tradeinPerformanceCheckpointCapture({...f.base,...expected(p.checkpointState),source:f.source,stage:'C1',previewHash:p.previewHash,rosterHash:p.rosterHash});}
function publish(f,p){return f.r.a.tradeinPerformancePublish({...f.base,source:f.source,rosterHash:p.rosterHash,previewHash:p.previewHash,expectedActiveHash:p.expectedActiveHash});}

test('bundled preview returns the same CAS as a separate status, with no writes',()=>{
 const f=setup(),p=preview(f),s=f.r.a.tradeinPerformanceCheckpointStatus(f.base);
 assert.deepEqual(plain(p.checkpointState),{...plain(s),month:f.source.month,sourceHash:f.source.source_sha256});
 assert.equal(f.r.writes.length,0);assert.equal(f.r.held(),false);
});
test('bundled preview reuses the monthly blob and reads the public registry once',()=>{
 const f=setup(),reads=new Map(),original=f.r.a.tradeinPerformanceFile_;
 f.r.a.tradeinPerformanceFile_=name=>{reads.set(name,(reads.get(name)||0)+1);return original(name);};preview(f);
 assert.equal(reads.get('north12b-tradein-public-registry.json'),1);
 assert.equal(reads.get('north12b-tradein-monthly-roster-'+f.source.month+'.json'),1);
});
for(const scenario of ['bad administrator','foreign owner','missing owner'])test(scenario+' cannot obtain bundled checkpoint state',()=>{
 const f=setup(scenario==='foreign owner'?{configuredOwner:'SYNTHETIC_OTHER_OWNER'}:scenario==='missing owner'?{configuredOwner:''}:{});
 if(scenario==='bad administrator')f.base.adminSecret='SYNTHETIC_WRONG';
 assert.throws(()=>preview(f));assert.equal(f.r.writes.length,0);assert.equal(f.r.held(),false);
});
for(const mutation of ['monthly','reference','registry','public registry'])test('preview CAS rejects changed '+mutation+' before backup or data writes',()=>{
 const f=setup(),p=preview(f);
 if(mutation==='monthly')f.r.setMonthlyRoster(f.source.month,[require('./helpers/tradein-synthetic-runtime.cjs').employee('12345')]);
 if(mutation==='reference')f.r.configure(f.source,{counting_review_status:'pending'});
 if(mutation==='registry')f.r.setConfig('north12b-tradein-performance-registry.json',{schema_version:'tradein-performance-registry/v1',months:{'2026-11':{active:null,previous:null}}});
 if(mutation==='public registry')f.r.setConfig('north12b-tradein-public-registry.json',{schema_version:'tradein-public-registry/v1',months:{'2026-11':null}});
 assert.throws(()=>capture(f,p));assert.equal(f.r.writes.length,0);assert.equal(f.r.held(),false);
});
test('four requests retain C1 backup, private readback, public readback and exact source linkage',()=>{
 const f=setup(),p=preview(f),c=capture(f,p),privateResult=publish(f,p);
 const result=f.r.a.tradeinPerformancePublicPublish({...f.base,expectedActiveHash:privateResult.snapshotHash,includeReadback:true});
 assert.equal(c.status,'checkpoint_saved');assert.ok(f.r.files.has(c.checkpointId));
 assert.equal(result.privateSnapshotHash,privateResult.snapshotHash);assert.equal(result.sourceHash,f.source.source_sha256);
 assert.deepEqual(plain(result.readback),plain(f.r.a.tradeinPerformancePublicRead({month:f.source.month,includeDays:true})));
 assert.equal(result.readback.snapshot.summary.actual_units,4);assert.equal(f.r.held(),false);
 for(const value of ['SYNTHETIC_ADMIN_ONLY','employee_key','source_employee_id','order_number','recycle_code'])assert.equal(JSON.stringify(result.readback).includes(value),false);
 const again=f.r.a.tradeinPerformancePublicPublish({...f.base,expectedActiveHash:privateResult.snapshotHash,includeReadback:true});
 assert.equal(again.status,'unchanged');assert.deepEqual(plain(again.readback),plain(result.readback));
});
test('public publisher preserves the original response contract without opt-in',()=>{
 const f=setup(),p=preview(f);capture(f,p);const value=publish(f,p);
 assert.deepEqual(plain(f.r.a.tradeinPerformancePublicPublish({...f.base,expectedActiveHash:value.snapshotHash})),{status:'published'});
 assert.deepEqual(plain(f.r.a.tradeinPerformancePublicPublish({...f.base,expectedActiveHash:value.snapshotHash})),{status:'unchanged'});
});
test('public readback refuses changed monthly basis even on same-source no-op',()=>{
 const f=setup(),p=preview(f);capture(f,p);const value=publish(f,p);
 f.r.a.tradeinPerformancePublicPublish({...f.base,expectedActiveHash:value.snapshotHash});
 f.r.setMonthlyRoster(f.source.month,[require('./helpers/tradein-synthetic-runtime.cjs').employee('12345')]);
 assert.throws(()=>f.r.a.tradeinPerformancePublicPublish({...f.base,expectedActiveHash:value.snapshotHash,includeReadback:true}),/基線/);
 assert.equal(f.r.held(),false);
});
