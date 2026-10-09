'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../tradein-performance-core.js'),F=require('./tradein-reference-fixture.cjs');
// All identifiers and transactions here are invented, independent of private evidence.
function batch(){return {month:'2026-10',source_start:'2026-10-01',source_end:'2026-10-08',status_as_of_date:'2026-10-08',
 rule_id:C.RULE_ID,source_sha256:'a'.repeat(64),complete_nine_stores:true,
 records:[{store_code:'DNB10168',source_employee_id:'0A1B2',trade_date:'2026-10-02',cancel_date:null,project:'RT',recycle_code:'SYNTH-RECYCLE',order_number:'SYNTH-ORDER'}]};}
function person(extra={}){return {employee_id:'ZX00006',masked_name:'合＊員',store:'萬大',role:'業務代表(I)',status:'active',...extra};}
function scenario(){const source=batch();return {source,config:F.reference(source),roster:[person()]};}
test('no default prefix or untrusted payload config can replace owner reference',()=>{
 const {source,config,roster}=scenario();
 assert.throws(()=>C.build(source,roster),/私有對照/);
 assert.throws(()=>C.build({...source,privateConfig:config,crosswalk:config,config},roster),/私有對照/);
 assert.throws(()=>C.build({...source,privateConfig:config},roster,null),/私有對照/);
});
test('exact string crosswalk assigns alphanumeric source without prefix arithmetic',()=>{
 const {source,config,roster}=scenario(),snapshot=C.build(source,roster,config);
 assert.equal(snapshot.people[0].employee_key,'ZX00006');assert.equal(snapshot.people[0].actual_units,1);
 assert.equal(snapshot.summary.pending_identity_units,0);
 config.employees[0].employee_key='0Z00001';roster[0].employee_id='0Z00001';
 assert.equal(C.build(source,roster,config).people[0].employee_key,'0Z00001');
});
test('reference is bound to exact batch hash and start/end',()=>{
 for(const [key,value] of [['schema_version','other'],['source_sha256','b'.repeat(64)],['source_start','2026-10-02'],['source_end','2026-10-07']]){
  const {source,config,roster}=scenario();config[key]=value;assert.throws(()=>C.build(source,roster,config),/私有對照/);
 }
});
test('missing mapping and source case changes stop the batch',()=>{
 const {source,config,roster}=scenario();config.employees=[];assert.throws(()=>C.build(source,roster,config),/精確私有對照/);
 const next=scenario();next.source.records[0].source_employee_id='0a1b2';assert.throws(()=>C.build(next.source,next.roster,next.config),/精確私有對照/);
});
test('observations must match transaction date and store, not just identity',()=>{
 for(const change of [{trade_date:'2026-10-03'},{store_code:'DNB10062'}]){
  const {source,config,roster}=scenario();Object.assign(source.records[0],change);assert.throws(()=>C.build(source,roster,config),/精確私有對照/);
 }
});
test('observations cannot extend beyond verified batch or unknown stores',()=>{
 for(const change of [{trade_date:'2026-09-30'},{trade_date:'2026-10-09'},{trade_date:'2026-02-30'},{store_code:'DNB99999'}]){
  const {source,config,roster}=scenario();Object.assign(config.employees[0].observations[0],change);assert.throws(()=>C.build(source,roster,config));
 }
});
test('duplicate or conflicting source and canonical identifiers are rejected',()=>{
 const mutations=[c=>c.employees.push(structuredClone(c.employees[0])),
  c=>c.employees.push({...structuredClone(c.employees[0]),employee_key:'ZX00007'}),
  c=>c.employees.push({...structuredClone(c.employees[0]),source_employee_id:'0A1B3'})];
 for(const mutate of mutations){const {source,config,roster}=scenario();mutate(config);assert.throws(()=>C.build(source,roster,config),/員編對照/);}
});
test('source and canonical identifiers require exact string formats',()=>{
 for(const [key,value] of [['source_employee_id',12345],['source_employee_id','0A1B2 '],['employee_key',1234567],['employee_key','zx00006'],['employee_key','ZX0000']]){
  const {source,config,roster}=scenario();config.employees[0][key]=value;assert.throws(()=>C.build(source,roster,config),/員編對照/);
 }
 for(const value of [12345,'0A1B2 ']){const {source,config,roster}=scenario();source.records[0].source_employee_id=value;assert.throws(()=>C.build(source,roster,config),/五碼字串/);}
 const {source,config,roster}=scenario();roster[0].employee_id=1234567;assert.throws(()=>C.build(source,roster,config),/名冊員編必須為字串/);
});
test('only nine official store mappings are accepted; legacy code has no alias',()=>{
 for(const mutate of [c=>c.stores.pop(),c=>c.stores[0]=c.stores[1],c=>c.stores[0].store='萬大',c=>c.stores.find(s=>s.store==='通化').store_code='DNB10059']){
  const {source,config,roster}=scenario();mutate(config);assert.throws(()=>C.build(source,roster,config),/店碼/);
 }
 const {source,config,roster}=scenario();source.records[0].store_code='DNB10059';assert.throws(()=>C.build(source,roster,config),/未知店碼/);
});
test('crosswalk observations never activate staff or override roster role/store',()=>{
 const {source,config}=scenario();Object.assign(config.employees[0],{status:'active',role:'督導',store:'萬大',effective_from:'2026-01-01',effective_to:'2027-01-01'});
 const inactive=C.build(source,[person({status:'inactive'})],config);assert.equal(inactive.people.length,0);assert.equal(inactive.summary.pending_identity_units,1);
 const unknownRole=C.build(source,[person({role:'未核職務'})],config);assert.equal(unknownRole.people[0].role,'待核');assert.equal(unknownRole.people[0].target_units,null);
 const manager=C.build(source,[person({role:'店長'})],config);assert.equal(manager.people[0].role,'店長');assert.equal(manager.people[0].target_units,null);
 const otherStore=C.build(source,[person({store:'酒泉'})],config);assert.equal(otherStore.people[0].actual_units,null);assert.equal(otherStore.summary.pending_identity_units,1);
});
test('transaction observations do not authorize future date or new batch reuse',()=>{
 const {source,config,roster}=scenario();source.records[0].trade_date='2026-10-08';assert.throws(()=>C.build(source,roster,config),/精確私有對照/);
 source.source_end='2026-10-09';source.status_as_of_date='2026-10-09';assert.throws(()=>C.build(source,roster,config),/私有對照/);
});
test('missing roster identity remains unassigned instead of creating a person',()=>{
 const {source,config}=scenario(),snapshot=C.build(source,[],config);assert.equal(snapshot.people.length,0);
 assert.equal(snapshot.summary.total_units,1);assert.equal(snapshot.summary.pending_identity_units,1);
});
test('crosswalk and source transaction identifiers do not enter stored snapshot',()=>{
 const {source,config,roster}=scenario();config.employees[0].provenance='SYNTH-PRIVATE-PROVENANCE';
 const text=JSON.stringify(C.build(source,roster,config));
 for(const value of ['0A1B2','SYNTH-RECYCLE','SYNTH-ORDER','SYNTH-PRIVATE-PROVENANCE','observations','tradein-private-reference'])assert.equal(text.includes(value),false,value);
});
test('owner configuration and source remain immutable after successful or denied build',()=>{
 const {source,config,roster}=scenario(),before=JSON.stringify({source,config,roster});C.build(source,roster,config);
 assert.equal(JSON.stringify({source,config,roster}),before);
 source.records[0].order_number=123;const denied=JSON.stringify({source,config,roster});assert.throws(()=>C.build(source,roster,config),/銷貨單號必須為字串/);
 assert.equal(JSON.stringify({source,config,roster}),denied);
});
