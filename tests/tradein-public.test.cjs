'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Core=require('../tradein-public-core.js');
const {createRuntime,parsed,employee,OPERATOR,DEVICE,hash}=require('./helpers/tradein-synthetic-runtime.cjs');
const plain=x=>JSON.parse(JSON.stringify(x));
function setup(){const r=createRuntime(),source=parsed();r.configure(source);return {r,source};}
function auth(source){return {employeeId:OPERATOR,deviceId:DEVICE,adminSecret:'SYNTHETIC_ADMIN_ONLY',month:source.month,sourceHash:source.source_sha256};}
function publishPrivate(r,source){const p=r.a.tradeinPerformancePreview({...auth(source),source});return r.a.tradeinPerformancePublish({...auth(source),source,...p});}
function publish(r,source){const p=publishPrivate(r,source);return r.a.tradeinPerformancePublicPublish({...auth(source),expectedActiveHash:p.snapshotHash});}
function read(r,source){return plain(r.a.tradeinPerformancePublicRead({month:source.month}));}
function expectation(r,source){const s=r.a.tradeinPerformanceCheckpointStatus(auth(source));return {expectedRegistryExists:s.registryExists,expectedRegistryHash:s.registryHash,expectedPublicRegistryExists:s.publicRegistryExists,expectedPublicRegistryHash:s.publicRegistryHash,expectedActiveHash:s.activeHash,expectedMonthlyHash:s.monthlyHash,expectedReferenceHash:s.referenceHash};}
function capture(r,source){const p=r.a.tradeinPerformancePreview({...auth(source),source});return r.a.tradeinPerformanceCheckpointCapture({...auth(source),...expectation(r,source),stage:'C1',source,previewHash:p.previewHash,rosterHash:p.rosterHash});}
function restore(r,source,c){return r.a.tradeinPerformanceCheckpointRestore({...auth(source),...expectation(r,source),checkpointId:c.checkpointId,checkpointHash:c.checkpointHash,restoreMonth:true});}
test('anonymous read publishes an independent complete allowlist, while private sources remain separate',()=>{
 const {r,source}=setup();assert.equal(publish(r,source).status,'published');const out=read(r,source);assert.equal(out.snapshot.people.length,4);assert.equal(out.snapshot.stores.length,9);
 assert.deepEqual(out.snapshot.summary,{actual_units:4,target_units:6,remaining_units:5,target_people:2,met_people:0,store_count:9});
 assert.equal(Core.validate(out.snapshot),out.snapshot);assert.equal(r.files.size,4);assert.equal(r.folder.getSharingAccess(),'PRIVATE');
 const text=JSON.stringify(out);for(const value of ['employee_key','employee_id','ZX00001','source_sha256','source_employee_id','original_role','SYNTHETIC-REC','SYNTHETIC-ORDER','SYNTHETIC_ADMIN_ONLY','file_id','folder_id','registry','IMEI','SUBID'])assert.equal(text.includes(value),false,value);
 assert.ok(out.snapshot.people.every(p=>Array.from(p.masked_name)[1]==='＊'));
});
test('public read never calls private reader or eligibility, even when private access is denied/pending',()=>{
 const {r,source}=setup();publish(r,source);let calls=0;
 for(const fn of ['tradeinPerformanceRead','tradeinPerformanceAuthorize_','privateDashboardTradeinReadBoundary_','reportUploadAuthorize_','privateDashboardProperties'])r.a[fn]=()=>{calls++;throw Error('PRIVATE_READER_MUST_STAY_CLOSED');};
 for(const row of r.accessRows.values())row.status='revoked';
 assert.equal(read(r,source).snapshot.summary.actual_units,4);assert.equal(calls,0);assert.equal(r.held(),false);
});
test('names are masked on the server before serialization; full names in a mislabeled source never escape',()=>{
 const {r,source}=setup();r.setMonthlyRoster(source.month,[{...employee('12345'),masked_name:'測試全名'},{...employee('12346','店長'),masked_name:'另一全名'},employee('12347','代理店長','杭州南'),employee('12348','資深業務代表','三創')]);
 publish(r,source);const out=read(r,source),text=JSON.stringify(out);assert.equal(text.includes('測試全名'),false);assert.equal(out.snapshot.people[0].masked_name,'測＊名');
});
test('same masked name in the same store retains independent rows and random opaque IDs',()=>{
 const {r,source}=setup();r.setMonthlyRoster(source.month,[{...employee('12345'),masked_name:'同＊名'},{...employee('12346','店長'),masked_name:'同＊名'},employee('12347','代理店長','杭州南'),employee('12348','資深業務代表','三創')]);
 publish(r,source);const people=read(r,source).snapshot.people.filter(p=>p.masked_name==='同＊名');assert.equal(people.length,2);assert.notEqual(people[0].public_id,people[1].public_id);assert.deepEqual(people.map(p=>p.actual_units),[1,2]);
 const ids=people.map(p=>p.public_id);assert.ok(ids.every(id=>/^tp_[a-f0-9]{32}$/.test(id)&&!id.includes('ZX000')));
});
test('same-source public publish no-ops without generating new IDs or writing files',()=>{
 const {r,source}=setup();publish(r,source);const before=read(r,source),writes=r.writes.length;assert.equal(publish(r,source).status,'unchanged');assert.equal(r.writes.length,writes);assert.deepEqual(read(r,source),before);
});
test('unknown month returns no snapshot or previous-month counts',()=>{
 const {r,source}=setup();publish(r,source);const out=plain(r.a.tradeinPerformancePublicRead({month:'2026-11'}));assert.equal(out.snapshot,null);assert.deepEqual(out.availableMonths,['2026-10']);
});
test('private change without an aligned public projection fails closed rather than serving stale actuals',()=>{
 const {r,source}=setup();publish(r,source);const next={...source,source_sha256:'b'.repeat(64),records:source.records.slice(0,1)};r.configure(next);publishPrivate(r,next);assert.throws(()=>read(r,next),/尚未完成核對/);
 r.a.tradeinPerformancePublicPublish({...auth(next),expectedActiveHash:r.a.tradeinPerformanceRegistry_().months[next.month].active.snapshot_hash});assert.equal(read(r,next).snapshot.summary.actual_units,1);
});
for(const kind of ['bad secret','staff operator','foreign owner','wrong source','stale active'])test('public write rejects '+kind+' with zero mutation',()=>{
 const {r,source}=setup(),privateResult=publishPrivate(r,source),p={...auth(source),expectedActiveHash:privateResult.snapshotHash};
 if(kind==='bad secret')p.adminSecret='SYNTHETIC_BAD';if(kind==='staff operator')p.employeeId='ZX00001';
 if(kind==='foreign owner')r.a.ScriptApp.getScriptId=()=> 'LOCAL_FOREIGN_OWNER_A';if(kind==='wrong source')p.sourceHash='b'.repeat(64);if(kind==='stale active')p.expectedActiveHash='f'.repeat(64);
 const writes=r.writes.length;assert.throws(()=>r.a.tradeinPerformancePublicPublish(p));assert.equal(r.writes.length,writes);assert.equal(r.held(),false);
});
for(const kind of ['private key','full name','fake numeric value','duplicate opaque ID','extra role','wrong schema'])test('matching-hash malformed public file '+kind+' is rejected server-side',()=>{
 const {r,source}=setup();publish(r,source);const registry=r.a.tradeinPerformancePublicRegistry_(),entry=registry.months[source.month],file=r.files.get(entry.file_id),value=JSON.parse(file.getBlob().getDataAsString());
 if(kind==='private key')value.employee_key='SYNTHETIC_PRIVATE_ID';if(kind==='full name')value.people[0].masked_name='測試全名';
 if(kind==='fake numeric value')value.people[0].actual_units=-1;if(kind==='duplicate opaque ID')value.people[1].public_id=value.people[0].public_id;
 if(kind==='extra role')value.people[0].role='SYNTHETIC_PRIVATE_ROLE';if(kind==='wrong schema')value.schema_version='tradein-performance/v1';
 const body=JSON.stringify(value);file.tamperForTest(body);entry.snapshot_hash=hash(body);[...r.files.values()].find(f=>f.getName()==='north12b-tradein-public-registry.json').tamperForTest(JSON.stringify(registry));
    assert.throws(()=>read(r,source),/尚未完成核對/);assert.equal(r.held(),false);
});
test('first-import checkpoint restore clears both monthly pointers without deleting public or private snapshots',()=>{
 const {r,source}=setup(),c=capture(r,source);publish(r,source);const count=r.files.size;
 restore(r,source,c);assert.equal(read(r,source).snapshot,null);assert.deepEqual(read(r,source).availableMonths,[]);assert.equal(r.files.size,count);assert.equal(r.held(),false);
});
test('checkpoint restores older public pointer with the corresponding private version while preserving another month',()=>{
 const {r,source}=setup();publish(r,source);const first=read(r,source),c=capture(r,source);
 const next={...source,source_sha256:'b'.repeat(64),records:source.records.slice(0,1)};r.configure(next);publish(r,next);
 const november={...source,month:'2026-11',source_start:'2026-11-01',source_end:'2026-11-07',status_as_of_date:'2026-11-08',source_sha256:'c'.repeat(64),records:[{...source.records[0],trade_date:'2026-11-02'}]};r.configure(november);publish(r,november);const other=read(r,november).snapshot,count=r.files.size;
 restore(r,source,c);assert.deepEqual(read(r,source).snapshot,first.snapshot);assert.deepEqual(read(r,november).snapshot,other);assert.equal(r.files.size,count);
});
test('core rejects malformed ID generator and unknown store without emitting any public object',()=>{
 const {r,source}=setup(),p=publishPrivate(r,source),s=r.a.tradeinPerformanceSnapshot_(r.a.tradeinPerformanceRegistry_().months[source.month].active);
 assert.throws(()=>Core.project(s,()=> 'EMPLOYEE_DERIVED_ID'));assert.throws(()=>Core.project(s,()=> '0'.repeat(32)));s.people[0].store='SYNTHETIC_UNKNOWN';assert.throws(()=>Core.project(s,()=>require('node:crypto').randomUUID()));
});
test('generated public routes remain separate from private read and keep admin write handlers',()=>{
 const code=fs.readFileSync(require.resolve('../gas/Code.gs'),'utf8');assert.match(code,/action === 'tradein_performance_public_read'\) result = tradeinPerformancePublicRead\(payload\)/);assert.match(code,/PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ = false/);
 assert.equal((code.match(/function tradeinPerformancePublicRead\(/g)||[]).length,1);assert.match(fs.readFileSync(require.resolve('../gas/TradeinPublic.gs'),'utf8'),/tradeinPerformanceCheckpointAuthorize_\(payload\)/);
});
