const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'private-dashboard-rank-patch.test.cjs'),'utf8');
const fixture=new Function('require','__dirname',source.slice(0,source.indexOf('for(const count of [40,41])'))+'\nreturn fixture;')(require,__dirname);
const adapter=fs.readFileSync(path.join(__dirname,'../gas/PersonalRankAutomation.gs'),'utf8');
const AUDIENCE='https://script.google.com/macros/s/SYNTHETIC_RANK_DEPLOYMENT/exec';
const ID='SYNTHETIC_AUTOMATION_IDENTITY';
const SECRET='SYNTHETIC_TEST_ONLY_0123456789abcdef0123456789';
const VERSION='north12b-automation-hmac-v1';
function setup(){
 const f=fixture(),values={NORTH12B_AUTOMATION_ID:ID,NORTH12B_AUTOMATION_SECRET:SECRET,NORTH12B_AUTOMATION_AUDIENCE:AUDIENCE,NORTH12B_AUTOMATION_SCOPES:'kpi.read kpi.write awards.read haosu.read metadata.read'};
 const writes=[];f.ctx.privateDashboardProperties=()=>({getProperty:k=>values[k]||null,setProperty:(k,v)=>{writes.push(k);values[k]=v;}});
 f.ctx.ScriptApp={getService:()=>({getUrl:()=>AUDIENCE})};
 f.ctx.Utilities.computeHmacSha256Signature=(text,key)=>[...crypto.createHmac('sha256',key).update(text).digest()];
 f.ctx.privateDashboardSnapshot=()=>JSON.parse(f.state.text);
 f.ctx.privateDashboardPostResponse=r=>JSON.parse(JSON.stringify(r));
 vm.runInContext(adapter,f.ctx);
 function signed(action='private_admin_snapshot_status',data={},change={}){
  const data64=Buffer.from(JSON.stringify(data)).toString('base64');
  const p={action,automationAuthVersion:VERSION,automationId:ID,automationAudience:AUDIENCE,automationTimestamp:Math.floor(f.ctx.Date.now()/1000),automationNonce:crypto.randomBytes(24).toString('base64url'),automationDataBase64:data64,...change};
  p.automationSignature=crypto.createHmac('sha256',SECRET).update([p.automationAuthVersion,p.automationId,p.automationAudience,String(p.automationTimestamp),p.automationNonce,p.action,crypto.createHash('sha256').update(p.automationDataBase64).digest('hex')].join('\n')).digest('hex');
  return p;
 }
 return {...f,values,writes,signed,post:p=>f.ctx.personalRankAutomationMaybePost_(p,{})};
}
test('existing HMAC contract authenticates metadata and both rank readbacks without credentials in data',()=>{
 const f=setup();for(const action of ['private_admin_snapshot_status','private_access','kpicalc_access']){const r=f.post(f.signed(action));assert.equal(r.status,'ok');if(action==='private_admin_snapshot_status')assert.equal(r.kpiReportDate,'2026-10-22');}
 assert.deepEqual([...new Set(f.writes)],['NORTH12B_AUTOMATION_NONCE_LEDGER']);assert.equal(f.state.writes,0);
});
test('unsigned normal requests preserve the original route; mixed envelopes cannot downgrade',()=>{
 const f=setup();assert.equal(f.post({action:'private_access'}),null);
 for(const p of [{action:'private_access',automationSignature:'x'},{...f.signed(),adminSecret:'SYNTHETIC'}])assert.throws(()=>f.post(p));assert.equal(f.writes.length,0);
});
test('signature binds identity version timestamp nonce audience action and exact encoded payload',()=>{
 for(const mutate of [p=>p.automationSignature='0'.repeat(64),p=>p.automationId+='X',p=>p.automationAuthVersion+='X',p=>p.automationTimestamp++,p=>p.automationNonce+='X',p=>p.automationAudience+='X',p=>p.action='private_access',p=>p.automationDataBase64=Buffer.from('{"extra":1}').toString('base64')]){
  const f=setup(),p=f.signed();mutate(p);assert.throws(()=>f.post(p));assert.equal(f.writes.length,0);assert.equal(f.state.writes,0);
 }
});
test('stale future revoked missing credential wrong audience and wrong scope fail closed',()=>{
 for(const change of [f=>delete f.values.NORTH12B_AUTOMATION_ID,f=>delete f.values.NORTH12B_AUTOMATION_SECRET,f=>f.values.NORTH12B_AUTOMATION_REVOKED_AT='REVOKED',f=>f.values.NORTH12B_AUTOMATION_AUDIENCE+='X',f=>f.ctx.ScriptApp.getService=()=>({getUrl:()=>AUDIENCE+'OTHER'}),f=>f.values.NORTH12B_AUTOMATION_SCOPES='kpi.read',f=>f.values.NORTH12B_AUTOMATION_SCOPES+=' admin.all']){
  const f=setup();change(f);assert.throws(()=>f.post(f.signed()));assert.equal(f.writes.length,0);
 }
 for(const delta of [-301,301]){const f=setup();assert.throws(()=>f.post(f.signed('private_access',{}, {automationTimestamp:Math.floor(f.ctx.Date.now()/1000)+delta})),/EXPIRED/);assert.equal(f.writes.length,0);}
});
test('nonce replay is persisted under the existing lock and malformed ledger never resets',()=>{
 const f=setup(),p=f.signed();f.post(p);assert.throws(()=>f.post(p),/REPLAY/);assert.equal(f.writes.length,1);assert.equal(f.state.locked,false);
 for(const raw of ['bad','[]','{"old":"bad"}']){const g=setup();g.values.NORTH12B_AUTOMATION_NONCE_LEDGER=raw;assert.throws(()=>g.post(g.signed()),/LEDGER_INVALID/);assert.equal(g.writes.length,0);}
 const g=setup();g.values.NORTH12B_AUTOMATION_NONCE_LEDGER=JSON.stringify(Object.fromEntries(Array.from({length:80},(_,i)=>['k'+i,Math.floor(g.ctx.Date.now()/1000)])));assert.throws(()=>g.post(g.signed()),/CAPACITY/);
});
test('provisioning revocation full KPI awards and general login are outside the adapter',()=>{
 for(const action of ['private_automation_bootstrap_provision','private_automation_revoke_self','kpicalc_publish','private_publish','private_publish_awards_component','employee_status','employee_login']){const f=setup();assert.throws(()=>f.post(f.signed(action)),/ACTION/);assert.equal(f.writes.length,0);}
});
test('only rank patch keys pass; scope remains required and payload action cannot replace route',()=>{
 for(const data of [{action:'private_publish'},{adminSecret:'SYNTHETIC'},{kpiBattleBase64:'e30='},{snapshotBase64:'e30='}]){const f=setup();assert.throws(()=>f.post(f.signed('private_publish_kpi_component',data)));assert.equal(f.writes.length,0);assert.equal(f.state.writes,0);}
 const f=setup(),p=f.payload();delete p.adminSecret;delete p.action;f.values.NORTH12B_AUTOMATION_SCOPES='kpi.read awards.read haosu.read metadata.read';assert.throws(()=>f.post(f.signed('private_publish_kpi_component',p)),/SCOPE/);assert.equal(f.writes.length,0);
});
test('verified signed rank write retains parent CAS identity and non-rank preservation',()=>{
 const f=setup(),data=f.payload();delete data.adminSecret;delete data.action;
 const r=f.post(f.signed('private_publish_kpi_component',data));assert.equal(r.status,'ok');assert.equal(r.people,41);assert.equal(f.state.writes,1);
 const after=JSON.parse(f.state.text);assert.equal(after.kpiBattle.personal[0].rank,17);assert.deepEqual(after.awardsBattle,f.snapshot.awardsBattle);assert.deepEqual(after.components.awards,f.snapshot.components.awards);
 assert.throws(()=>f.post(f.signed('private_publish_kpi_component',data)),/PARENT_CHANGED/);assert.equal(f.state.writes,1);
});
test('invalid parent or concurrent data rejects even after successful signature verification',()=>{
 const f=setup(),data=f.payload();delete data.adminSecret;delete data.action;data.expectedSnapshotPayloadHash='0'.repeat(64);assert.throws(()=>f.post(f.signed('private_publish_kpi_component',data)),/PARENT_CHANGED/);assert.equal(f.state.writes,0);
});
test('compatibility hook runs after deployment fence and before general auth; original auth functions unchanged',()=>{
 const main=fs.readFileSync(path.join(__dirname,'../gas/Code.gs'),'utf8'),start=main.indexOf('function doPost(e)'),end=main.indexOf('\nfunction ',start+10),post=main.slice(start,end);
 assert.ok(post.indexOf('reportUploadIsUploadDeployment_')<post.indexOf('personalRankAutomationMaybePost_'));assert.ok(post.indexOf('personalRankAutomationMaybePost_')<post.indexOf('privateDashboardGasBMaybePost_'));
 assert.match(adapter,/privateDashboardPublishRankPatch_\(request.data\)/);assert.doesNotMatch(adapter,/setProperties|deleteProperty|bootstrap_provision|privateDashboardAdminAuthorized\(/);
});
