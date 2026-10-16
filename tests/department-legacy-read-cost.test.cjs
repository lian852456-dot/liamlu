'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {runtime}=require('./helpers/department-ops-integration-runtime.cjs');
function instrument(r){
  const metrics={};
  function wrap(target,method,label){const original=target[method];target[method]=function(...args){metrics[label]=(metrics[label]||0)+1;return original.apply(this,args);};}
  const sheet=vm.runInContext('SPREADSHEET_ID',r.context),getFile=r.context.DriveApp.getFileById;
  r.context.DriveApp.getFileById=id=>{if(id===sheet)metrics.sheetLookup=(metrics.sheetLookup||0)+1;return getFile(id);};
  for(const [prefix,item] of [['folder',r.folder],['legacy',r.legacyFile]])for(const method of ['getSharingAccess','getOwner','getEditors','getViewers','getParents','getBlob'])if(item[method])wrap(item,method,prefix+'.'+method);
  return {metrics,reset:()=>{for(const key of Object.keys(metrics))delete metrics[key];}};
}
function setup(){
  const r=runtime(),token=r.post({action:'ptauth',key:'synthetic-passcode'}).token,cost=instrument(r);
  return {r,token,...cost,post:body=>r.post({action:'department_ops_read',token,...body})};
}
test('legacy cold and matching-version reads resolve the source folder once and preserve fresh bytes',()=>{
  const s=setup(),writes=s.r.writes,source=s.r.legacyFile.content,full=s.post({});
  assert.equal(full.status,'ok');assert.deepEqual(full.gold.months[0].records,s.r.q2.records);
  assert.equal(s.metrics.sheetLookup,1);assert.equal(s.metrics['folder.getSharingAccess'],1);assert.equal(s.metrics['legacy.getSharingAccess'],1);assert.equal(s.metrics['legacy.getBlob'],1);
  s.reset();const hit=s.post({knownVersion:full.readVersion});assert.equal(hit.notModified,true);assert.equal(hit.readVersion,full.readVersion);assert.equal(hit.monthly.revision,full.monthly.revision);
  assert.equal(s.metrics.sheetLookup,1);assert.equal(s.metrics['folder.getSharingAccess'],1);assert.equal(s.metrics['legacy.getSharingAccess'],1);assert.equal(s.metrics['legacy.getBlob'],1);
  assert.equal(s.r.writes,writes);assert.equal(s.r.legacyFile.content,source);
});
test('same timestamp and same-length source corrections cannot produce a false unchanged response',()=>{
  const s=setup(),full=s.post({}),source=JSON.parse(s.r.legacyFile.content),beforeBytes=s.r.legacyFile.content.length;
  source.months[0].records[0].medal=88;s.r.legacyFile.content=JSON.stringify(source);assert.equal(s.r.legacyFile.content.length,beforeBytes);
  s.reset();const result=s.post({knownVersion:full.readVersion});assert.equal(result.status,'ok');assert.equal(result.notModified,undefined);assert.equal(result.gold.months[0].records[0].medal,88);assert.notEqual(result.readVersion,full.readVersion);assert.equal(s.metrics['legacy.getBlob'],1);
});
for(const [name,change] of [
  ['folder sharing',s=>{s.r.folder.getSharingAccess=()=> 'ANYONE';}],
  ['file sharing',s=>{s.r.legacyFile.getSharingAccess=()=> 'ANYONE';}],
  ['file viewers',s=>{s.r.legacyFile.getViewers=()=>[{getEmail:()=> 'unexpected@synthetic.test'}];}],
  ['file owner missing',s=>{s.r.legacyFile.getOwner=()=>null;}],
  ['file parent changed',s=>{s.r.legacyFile.getParents=()=>{let used=false;return {hasNext:()=>!used,next:()=>{used=true;return {getId:()=> 'outside'};}};};}]
])test('matching legacy version still rejects '+name+' before source content',()=>{
  const s=setup(),full=s.post({}),writes=s.r.writes;s.reset();change(s);const result=s.post({knownVersion:full.readVersion});assert.notEqual(result.status,'ok');assert.equal(result.notModified,undefined);assert.equal(result.gold,undefined);assert.equal(s.metrics['legacy.getBlob']||0,0);assert.equal(s.r.writes,writes);
});
for(const content of ['null','{}','{"version":2,"months":[]}','{"version":1,"months":{}}','invalid-json'])test('malformed legacy source fails closed: '+content,()=>{
  const s=setup(),full=s.post({}),writes=s.r.writes;s.r.legacyFile.content=content;const result=s.post({knownVersion:full.readVersion});assert.notEqual(result.status,'ok');assert.equal(result.notModified,undefined);assert.equal(result.gold,undefined);assert.equal(s.r.writes,writes);
});
test('latest legacy source selection preserves the existing timestamp order',()=>{
  const s=setup(),source=JSON.parse(s.r.legacyFile.content);source.months[0].records[0].medal=91;
  const newer=s.r.folder.createFile(s.r.legacyFile.name,JSON.stringify(source));newer.getLastUpdated=()=>new Date('2026-10-14T00:00:00Z');
  const result=s.post({});assert.equal(result.status,'ok');assert.equal(result.gold.months[0].records[0].medal,91);
});
test('source removal cannot revive cached months or synthesize zero balances',()=>{
  const s=setup(),full=s.post({});s.r.files.delete(s.r.legacyFile.getId());const result=s.post({knownVersion:full.readVersion});assert.equal(result.status,'ok');assert.equal(result.notModified,undefined);assert.equal(result.available,false);assert.deepEqual(result.gold.months,[]);assert.notEqual(result.readVersion,full.readVersion);
});
test('legacy operation receipt readback always includes the complete source',()=>{
  const s=setup(),full=s.post({}),result=s.post({knownVersion:full.readVersion,operationId:'synthetic-receipt'});assert.equal(result.status,'ok');assert.equal(result.notModified,undefined);assert.deepEqual(result.gold,full.gold);assert.equal(result.monthly.operation,null);
});
test('forged and expired sessions cannot reach legacy metadata or content',()=>{
  const s=setup(),full=s.post({});s.reset();
  for(const token of [undefined,'forged']){assert.notEqual(s.r.post({action:'department_ops_read',token,knownVersion:full.readVersion}).status,'ok');assert.deepEqual(s.metrics,{});}
  s.r.advance(43201);assert.notEqual(s.post({knownVersion:full.readVersion}).status,'ok');assert.deepEqual(s.metrics,{});
});
