'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {runtime,fixture}=require('./helpers/readonly-conversion-runtime.cjs');
const publish=(b,snapshot=fixture())=>{const p=b.call('Preview',{snapshot});return b.call('Publish',{previewToken:p.token,confirm:true});};
test('every public action denies before private state, cache or Drive access',()=>{
  for(const op of ['Status','Preview','Publish','Rollback']){const b=runtime();assert.throws(()=>b.context['readonlyConversion'+op]({}),/denied/);assert.deepEqual(b.events,['auth']);assert.equal(b.files.size,0);assert.equal(b.properties.size,0);}
});
test('preview validates aggregate grain and creates no persistent file or active pointer',()=>{
  const b=runtime(),p=b.call('Preview',{snapshot:fixture()});assert.equal(p.preview.storeDateKeys,27);assert.equal(p.preview.added,27);assert.equal(p.live.revision,0);assert.equal(b.files.size,0);assert.equal(b.properties.size,0);assert.equal(b.cache.size,1);
  const invalid=fixture();invalid.records.pop();assert.throws(()=>b.call('Preview',{snapshot:invalid}),/缺少店日/);
});
test('publish verifies immutable content before pointer and leaves unrelated source data intact',()=>{
  const b=runtime(),original={kpiBattle:{untouched:'KPI'},awardsBattle:{untouched:'awards'},other:{untouched:'personal'}};
  const before=JSON.stringify(original),result=publish(b);assert.equal(result.status,'published');assert.equal(result.live.revision,1);
  assert.ok(b.events.indexOf('blob')<b.events.indexOf('state-write'));assert.equal(b.files.size,1);
  const attached=b.context.readonlyConversionAttach_(original);assert.equal(attached.conversionBattle.records.length,27);
  delete attached.conversionBattle;delete attached.conversionStatus;assert.equal(JSON.stringify(attached),before);
});
test('reimport of exactly the same source is idempotent with no new file or pointer',()=>{
  const b=runtime();publish(b);const prior=JSON.stringify(b.state),writes=b.events.filter(e=>e==='state-write').length;
  assert.equal(publish(b).status,'already_current');assert.equal(b.files.size,1);assert.equal(JSON.stringify(b.state),prior);assert.equal(b.events.filter(e=>e==='state-write').length,writes);
});
test('two previews race safely: only the first can publish its compared revision',()=>{
  const b=runtime(),a=b.call('Preview',{snapshot:fixture()}),c=b.call('Preview',{snapshot:fixture({hash:'b'})});
  b.call('Publish',{previewToken:a.token,confirm:true});assert.throws(()=>b.call('Publish',{previewToken:c.token,confirm:true}),/正式版本已變更/);assert.equal(b.files.size,1);assert.equal(b.state.revision,1);
});
test('malformed immutable readback leaves active pointer absent',()=>{
  const b=runtime(),p=b.call('Preview',{snapshot:fixture()});b.corruptNew(true);
  assert.throws(()=>b.call('Publish',{previewToken:p.token,confirm:true}),/雜湊不符/);assert.equal(b.state,null);assert.equal(b.files.size,1);
});
test('pointer readback failure restores the prior exact pointer and prior optional component',()=>{
  const b=runtime();publish(b);const prior=JSON.stringify(b.state),p=b.call('Preview',{snapshot:fixture({hash:'b',days:4})});b.failStateReadback();
  assert.throws(()=>b.call('Publish',{previewToken:p.token,confirm:true}),/指標不完整/);assert.equal(JSON.stringify(b.state),prior);assert.equal(b.call('Status').live.cutoff,'2026-10-03');
});
test('rollback can restore the first empty checkpoint and requires the exact active revision',()=>{
  const b=runtime(),result=publish(b),live=result.live;
  assert.throws(()=>b.call('Rollback',{confirm:true,expectedRevision:0,expectedActiveHash:null}),/版本已變更/);
  const restored=b.call('Rollback',{confirm:true,expectedRevision:live.revision,expectedActiveHash:live.activeHash});assert.equal(restored.status,'rolled_back');assert.equal(restored.live.activeHash,null);assert.equal(restored.live.revision,2);assert.equal(b.files.size,1);
  const snapshot=b.context.readonlyConversionAttach_({kpiBattle:{},awardsBattle:{}});assert.equal(snapshot.conversionBattle,undefined);assert.equal(snapshot.conversionStatus.status,'unavailable');
});
test('rollback between immutable versions preserves both files and validates canonical content',()=>{
  const b=runtime(),a=publish(b),c=publish(b,fixture({hash:'b',days:4}));const restored=b.call('Rollback',{confirm:true,expectedRevision:c.live.revision,expectedActiveHash:c.live.activeHash});
  assert.equal(restored.live.activeHash,a.live.activeHash);assert.equal(b.call('Status').live.cutoff,'2026-10-03');assert.equal(b.files.size,2);
});
test('expired or another operator preview cannot publish',()=>{
  const b=runtime(),p=b.call('Preview',{snapshot:fixture()});b.advance(1800001);assert.throws(()=>b.call('Publish',{previewToken:p.token,confirm:true}),/期限不符/);assert.equal(b.state,null);
  const c=runtime(),q=c.call('Preview',{snapshot:fixture()}),key=[...c.cache.keys()][0],stage=JSON.parse(c.cache.get(key));stage.employeeId='SYN002';c.cache.set(key,JSON.stringify(stage));assert.throws(()=>c.call('Publish',{previewToken:q.token,confirm:true}),/操作者/);
});
test('same raw hash cannot masquerade as changed aggregate, cutoff cannot regress, new month replaces',()=>{
  const b=runtime();publish(b);const altered=fixture();altered.records[0].aq_n++;
  assert.throws(()=>b.call('Preview',{snapshot:altered}),/相同原始檔/);assert.throws(()=>b.call('Preview',{snapshot:fixture({days:2,hash:'b'})}),/截止不得倒退/);
  assert.equal(publish(b,fixture({month:'11',hash:'c'})).live.cutoff,'2026-11-03');assert.throws(()=>b.call('Preview',{snapshot:fixture({hash:'d'})}),/較舊月份/);
});
test('arbitrary workbook and prior metadata are stripped before persistence',()=>{
  const b=runtime(),f=fixture(),C=require('../readonly-dashboard-core.js');f.customerRecords=['MUST_NOT_PERSIST'];f.records[0].customer='MUST_NOT_PERSIST';
  f.prior=C.STORES.map(s=>({store:s.id,aq_n:1,aq_d:2,rt_n:1,rt_d:2,customer:'MUST_NOT_PERSIST'}));f.prior_period={start:'2026-09-01',end:'2026-09-03',customer:'MUST_NOT_PERSIST'};
  publish(b,f);assert.ok(![...b.files.values()][0].text.includes('MUST_NOT_PERSIST'));
});
test('shared or out-of-folder revisions fail closed; other dashboard components remain visible',()=>{
  const b=runtime();publish(b);const file=[...b.files.values()][0];file.sharing='ANYONE';
  assert.throws(()=>b.call('Status'),/私有資料域/);const original={kpiBattle:{keep:1},awardsBattle:{keep:2}};const value=b.context.readonlyConversionAttach_(original);assert.equal(value.kpiBattle.keep,1);assert.equal(value.conversionBattle,undefined);assert.equal(value.conversionStatus.status,'unavailable');
  file.sharing='PRIVATE';file.parent={getId:()=> 'other-folder'};assert.throws(()=>b.call('Status'),/私有資料域/);
});
test('reader is optional, generated core assets match, and scoped routes preserve original authorization',()=>{
  const root=path.resolve(__dirname,'..'),core=fs.readFileSync(path.join(root,'readonly-dashboard-core.js'),'utf8');
  assert.equal(fs.readFileSync(path.join(root,'gas/ReadonlyDashboardCore.gs'),'utf8'),core);
  const code=fs.readFileSync(path.join(root,'gas/Code.gs'),'utf8');assert.match(code,/typeof readonlyConversionAttach_ === 'function'/);
  for(const op of ['status','preview','publish','rollback'])assert.ok(code.includes("action === 'readonly_conversion_"+op+"'"));
  assert.match(code,/function reportUploadAuthorize_\(payload\)\s*\{\s*privateDashboardAdminAuthorized\(payload\)/);
  const b=runtime(),snapshot={kpiBattle:{keep:1},awardsBattle:{keep:2}};assert.equal(b.context.readonlyConversionAttach_(snapshot),snapshot);
});
test('actual doPost uses original admin/password/employee guard for all four new actions',()=>{
  for(const action of ['readonly_conversion_status','readonly_conversion_preview','readonly_conversion_publish','readonly_conversion_rollback']){
    const b=runtime({post:true});const result=b.post({action,employeeId:b.auth.employeeId,token:'SYNTHETIC_B_SESSION'});assert.equal(result.status,'error');assert.match(result.message,/管理者驗證失敗/);assert.equal(b.files.size,0);assert.equal(b.events.includes('folder'),false);
  }
  const b=runtime({post:true});assert.equal(b.post({action:'readonly_conversion_status',...b.auth}).status,'ok');assert.match(b.post({action:'readonly_conversion_status',...b.auth,employeeId:'SYN002'}).message,/未被授權/);
});
test('actual POST parser/writer envelope preserves publish and rollback statuses and deployment isolation',()=>{
  const b=runtime({post:true}),p=b.post({action:'readonly_conversion_preview',...b.auth,snapshot:fixture()});assert.equal(p.status,'ok');
  const committed=b.post({action:'readonly_conversion_publish',...b.auth,previewToken:p.token,confirm:true});assert.equal(committed.status,'published');
  const restored=b.post({action:'readonly_conversion_rollback',...b.auth,confirm:true,expectedRevision:committed.live.revision,expectedActiveHash:committed.live.activeHash});assert.equal(restored.status,'rolled_back');assert.equal(restored.live.activeHash,null);
  b.properties.set('REPORT_UPLOAD_DEPLOYMENT_URL','https://synthetic-owner.invalid/exec');const denied=b.post({action:'readonly_conversion_status',...b.auth});assert.equal(denied.status,'error');assert.equal(denied.message,'route-not-available-on-upload-deployment');
});
