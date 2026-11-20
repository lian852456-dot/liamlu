const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const F=require('./fixtures/insurance-progress.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const pinKey='INSURANCE_DRIVE_PIN_V1';
const {fixed,template}=require('./helpers/insurance-fixed-fixture.cjs');
const {render}=require('../scripts/north12b/render_insurance_source.cjs');
function submission(h,row){
 return {action:'employee_insurance_submit',...h.proof,dataDate:F.date,subjectKey:row.subjectKey,sourceVersion:row.progress.sourceVersion,values:F.values,submissionId:'SYNTHETIC_FIXED_FIRST'};
}
function denied(result){
 assert.equal(result.status,'error');
 assert.ok(!result.items && !result.item && !result.directory && !result.submission);
 assert.ok(!JSON.stringify(result).includes(F.values.advisor));
}
test('release template is closed even with old properties; changing properties cannot select a source',()=>{
 const h=fixed({unconfigured:true});
 h.f.props.set(pinKey,JSON.stringify(h.pin));
 h.f.props.set('INSURANCE_DRIVE_VERIFIED_V1',hash('synthetic-receipt'));
 denied(h.read());assert.equal(h.reads,0);
 const deployed=fixed();
 deployed.f.props.set(pinKey,'wrong');
 assert.equal(deployed.read().status,'ok');
 assert.equal(typeof deployed.f.ctx.insuranceVerifyFixedSource_,'undefined');
});
test('authenticated reads check both ACLs; nine-store directory emits four fields, one own reply persists',()=>{
 const h=fixed(),result=h.read();
 assert.equal(result.status,'ok');assert.equal(h.reads,2);
 assert.equal(result.items.length,1);assert.equal(result.directory.current.length,9);
 assert.deepEqual(new Set(result.directory.current.map(row=>row.store)),new Set(F.stores));
 for(const r of result.directory.current)assert.deepEqual(Object.keys(r).sort(),['cutoff','name','rate','store']);
 assert.ok(!JSON.stringify(result).includes('SYNTH002'));
 const request=submission(h,result.items[0]);
 denied(h.f.handle({...request,values:{...F.values,tools:' '}}));
 const other=h.read(h.f.login('SYNTH003','SYNTHETIC_SECOND_DEVICE')).items[0];
 assert.notEqual(other.store,result.items[0].store);
 denied(h.f.handle({...request,subjectKey:other.subjectKey}));assert.equal(h.f.fileWrites,0);
 assert.equal(h.f.handle(request).status,'ok');assert.deepEqual(h.read().items[0].submission.values,F.values);
 assert.equal(h.f.handle(request).alreadySubmitted,true);assert.equal(h.f.fileWrites,1);
});
test('missing session, wrong device and non-B membership stop before source access',()=>{
 const h=fixed();
 denied(h.read({}));denied(h.read({...h.proof,deviceId:'SYNTHETIC_WRONG_DEVICE'}));
 h.f.rows.DashboardUsers[2][2]='外區';denied(h.read());
 assert.equal(h.reads,0);assert.equal(h.f.fileWrites,0);
});
test('ACL or byte changes, incomplete roster and stale source block reads and writes even with a saved reply',()=>{
 const changes=[
  h=>{h.meta.shared=true;},h=>{h.meta.permissions.push({type:'group',role:'reader',id:'group'});},
  h=>{delete h.meta.permissions;},h=>{h.meta.permissionIds.push('other');},h=>{h.meta.owners[0].me=false;},
  h=>{h.meta.owners[0].emailAddress='other@example.invalid';},h=>{h.meta.trashed=true;},h=>{h.meta.parents=['wrong'];},
  h=>{h.meta.mimeType='application/vnd.google-apps.shortcut';},h=>{h.meta.name='north12b-kpicalc-private-latest.json';},
  h=>h.setBytes(Buffer.from('broken')),h=>{h.f.rows.DashboardUsers[1][4]='inactive';},
  h=>{h.f.ctx.Utilities.formatDate=()=>new Date(Date.parse(F.date)+86400000).toISOString().slice(0,10);},
  h=>{const get=h.f.ctx.Drive.Files.get;let v=0;h.f.ctx.Drive.Files.get=id=>({...get(id),version:String(++v)});},
  h=>{const get=h.f.ctx.Drive.Files.get;h.f.ctx.Drive.Files.get=id=>{
    const meta=get(id);h.f.ctx.Utilities.formatDate=()=>'2100-01-01';return meta;
  };}
 ];
 for(const change of changes){
  const h=fixed(),request=submission(h,h.read().items[0]);
  assert.equal(h.f.handle(request).status,'ok');
  const folder=h.f.ctx.privateDashboardFolder;
  let replyFolderReads=0;
  h.f.ctx.privateDashboardFolder=()=>{replyFolderReads++;return folder();};
  change(h);denied(h.read());denied(h.f.handle(request));
  assert.equal(replyFolderReads,0);assert.equal(h.f.fileWrites,1);
 }
});
test('workbook fingerprint, report period, valid coverage and count must match the released descriptor',()=>{
 for(const opts of [
  {changePin:p=>{p.sourceSha256=hash('different workbook');}},
  {changePin:p=>{p.people++;}},
  {changeSource:s=>{s.meta.insuranceConsultationSource.personal.periodEvidence=null;}},
  {changeSource:s=>{s.meta.insuranceConsultationSource.personal.rows.pop();}},
  {changeSource:s=>{s.meta.insuranceConsultationSource.personal.cutoff='2000-01-01';}},
  {changeSource:s=>{s.meta.insuranceConsultationSource.personal.rows[0].subjectId='SYNTH999';}}
 ]){
  const h=fixed(opts);denied(h.read());assert.equal(h.f.fileWrites,0);
 }
});
test('renderer changes exactly one literal and validates the allowlisted scalar fields',()=>{
 const h=fixed(),output=render(template,h.pin);
 assert.equal(output.split('\n').filter((s,i)=>s!==template.split('\n')[i]).length,1);
 assert.equal(render(template,Object.fromEntries(Object.entries(h.pin).reverse())),output);
 for(const pin of [{...h.pin,extra:true},{...h.pin,people:'9'},{...h.pin,reportDate:'2030-02-30'},{...h.pin,cutoff:'2000-01-01'}])
  assert.throws(()=>render(template,pin));
 assert.throws(()=>render(output,h.pin));
});
