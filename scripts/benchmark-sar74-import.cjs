'use strict';
// No network. Both revisions run the same invented source in independent stores.
const vm=require('node:vm'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {createRuntime,parsed,OPERATOR}=require('../tests/helpers/tradein-synthetic-runtime.cjs');
const baseline=process.argv[2]||'1403f14';if(!/^[a-f0-9]{7,40}$/.test(baseline))throw Error('Expected an immutable baseline commit');
const expected=s=>({expectedRegistryExists:s.registryExists,expectedRegistryHash:s.registryHash,expectedPublicRegistryExists:s.publicRegistryExists,expectedPublicRegistryHash:s.publicRegistryHash,expectedActiveHash:s.activeHash,expectedMonthlyHash:s.monthlyHash,expectedReferenceHash:s.referenceHash});
function run(optimized){
 const r=createRuntime(),source=parsed(),base={employeeId:OPERATOR,adminSecret:r.secret,month:source.month,sourceHash:source.source_sha256};r.configure(source);
 if(!optimized)for(const file of ['gas/TradeinPerformance.gs','gas/TradeinPublic.gs'])vm.runInContext(execFileSync('git',['show',baseline+':'+file],{encoding:'utf8'}),r.a);
 const count={folderLookups:0,blobReads:0,snapshotIdReads:0},seen=new WeakSet();
 function observe(file){if(file&&!seen.has(file)){seen.add(file);const original=file.getBlob;file.getBlob=()=>{count.blobReads++;return original();};}return file;}
 const lookup=r.a.tradeinPerformanceFile_;r.a.tradeinPerformanceFile_=name=>{count.folderLookups++;return observe(lookup(name));};
 const byId=r.a.DriveApp.getFileById;r.a.DriveApp.getFileById=id=>{count.snapshotIdReads++;return observe(byId(id));};
 const create=r.folder.createFile;r.folder.createFile=(...args)=>observe(create(...args));
 const calls=[];function call(action,payload){calls.push(action);const result=r.dispatch({action,...payload});assert.notEqual(result.status,'error',result.message);return result;}
 const p=call('tradein_performance_preview',{...base,source,includeCheckpointState:optimized});
 const state=optimized?p.checkpointState:call('tradein_performance_checkpoint_status',base);
 const checkpoint=call('tradein_performance_checkpoint_capture',{...base,...expected(state),source,stage:'C1',previewHash:p.previewHash,rosterHash:p.rosterHash});
 const saved=call('tradein_performance_publish',{...base,source,rosterHash:p.rosterHash,previewHash:p.previewHash,expectedActiveHash:p.expectedActiveHash});
 const pub=call('tradein_performance_public_publish',{...base,expectedActiveHash:saved.snapshotHash,includeReadback:optimized});
 const read=optimized?pub.readback:call('tradein_performance_public_read',{month:source.month,includeDays:true});
 assert.equal(read.snapshot.summary.actual_units,saved.snapshot.summary.total_units);assert.equal(checkpoint.status,'checkpoint_saved');assert.equal(r.held(),false);
 return {rpcCount:calls.length,calls,...count,privateSnapshotHash:saved.snapshotHash,sourceHash:source.source_sha256,totalUnits:read.snapshot.summary.actual_units,checkpointRetained:r.files.has(checkpoint.checkpointId)};
}
const before=run(false),after=run(true);assert.equal(before.privateSnapshotHash,after.privateSnapshotHash);assert.equal(before.sourceHash,after.sourceHash);
process.stdout.write(JSON.stringify({scope:'synthetic offline service and IO counts, not production latency',baseline,before,after,roundTripReduction:before.rpcCount-after.rpcCount,productionReads:0,productionWrites:0},null,2)+'\n');
