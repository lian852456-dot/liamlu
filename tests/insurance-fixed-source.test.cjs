const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const F=require('./fixtures/insurance-progress.cjs'),{setup}=require('./helpers/insurance-runtime.cjs');
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const pinKey='INSURANCE_DRIVE_PIN_V1';
function fixed(){
 const source=F.data(.375,.5),f=setup(source);
 const part=source.meta.insuranceConsultationSource,reportFile=F.date.slice(5).replace('-','')+'.xlsx';
 Object.assign(source.meta,{reportDate:F.date,sourceFile:reportFile});
 Object.assign(part,{sourceFile:reportFile,version:hash('synthetic-version')});
 const payload={schema:'insurance-source-payload/v1',data:{meta:source.meta,stores:source.stores}};
 const bytes=Buffer.from(JSON.stringify(payload)),pin={fileId:'synthetic_drive_file',ownerEmail:'owner@example.invalid',payloadSha256:hash(bytes),sourceSha256:part.sourceSha256,reportDate:F.date,cutoff:F.date,people:9};
 const meta={id:pin.fileId,name:'north12b-insurance-consult-source-v1.json',mimeType:'application/json',version:'1',size:bytes.length,parents:['root'],shared:false,trashed:false,owners:[{me:true,emailAddress:pin.ownerEmail,permissionId:'owner'}],permissions:[{id:'owner',type:'user',role:'owner'}],permissionIds:['owner']};
 let currentBytes=bytes,reads=0;
 f.props.set(pinKey,JSON.stringify(pin));
 f.ctx.Drive={Files:{get(id){assert.equal(id,pin.fileId);reads++;return {...meta};}}};
 f.ctx.DriveApp={getRootFolder:()=>({getId:()=>'root'}),getFileById(id){assert.equal(id,pin.fileId);return {getBlob:()=>({getBytes:()=>Array.from(currentBytes),getDataAsString:()=>currentBytes.toString('utf8')})};}};
 const gasDigest=f.ctx.Utilities.computeDigest;f.ctx.Utilities.computeDigest=(algo,value)=>Array.isArray(value)?Array.from(crypto.createHash('sha256').update(Buffer.from(value)).digest()):gasDigest(algo,value);
 f.ctx.console={log(){}};
 f.useFixedSource();const proof=f.login();
 const read=(session=proof)=>f.handle({action:'employee_insurance_read',...session,dataDate:F.date});
 return {f,pin,meta,proof,read,verify:()=>f.ctx.insuranceVerifyFixedSource_(),setBytes:b=>{currentBytes=b;},get reads(){return reads;}};
}
test('fixed file opens after owner readback; employee reads four directory columns and submits once',()=>{
 const h=fixed();assert.equal(h.read().status,'error');assert.equal(h.reads,0);
 assert.equal(h.verify().people,9);assert.equal(h.verify().people,9);assert.equal(h.f.fileWrites,0);
 const result=h.read(),row=result.items[0];assert.equal(result.status,'ok');assert.equal(result.items.length,1);assert.equal(result.directory.current.length,9);
 for(const r of result.directory.current)assert.deepEqual(Object.keys(r).sort(),['cutoff','name','rate','store']);
 assert.ok(!JSON.stringify(result).includes('SYNTH002'));
 const commit={action:'employee_insurance_submit',...h.proof,dataDate:F.date,subjectKey:row.subjectKey,sourceVersion:row.progress.sourceVersion,values:F.values,submissionId:'SYNTHETIC_FIXED_FIRST'};
 assert.equal(h.f.handle({...commit,values:{...F.values,tools:' '}}).status,'error');
 assert.equal(h.f.handle(commit).status,'ok');assert.deepEqual(h.read().items[0].submission.values,F.values);
 assert.equal(h.f.handle(commit).alreadySubmitted,true);assert.equal(h.f.fileWrites,1);
 assert.equal(h.read({}).status,'error');assert.equal(h.read({...h.proof,deviceId:'SYNTHETIC_WRONG_DEVICE'}).status,'error');
 h.f.rows.DashboardUsers[2][2]='外區';assert.equal(h.read().status,'error');
});
test('bad ACL, group/link shares, replacement, changed roster, stale or corrupt data disclose no rows or replies',()=>{
 const changes=[
  h=>{h.meta.shared=true;},h=>{h.meta.permissions.push({type:'group',role:'reader',id:'group'});},
  h=>{delete h.meta.permissions;},h=>{h.meta.permissionIds.push('other');},h=>{h.meta.owners[0].me=false;},
  h=>{h.meta.owners[0].emailAddress='other@example.invalid';},h=>{h.meta.trashed=true;},h=>{h.meta.parents=['wrong'];},
  h=>{h.meta.mimeType='application/vnd.google-apps.shortcut';},h=>{h.meta.name='north12b-kpicalc-private-latest.json';},
  h=>h.setBytes(Buffer.from('broken')),h=>{h.f.props.delete(pinKey);},h=>{h.f.rows.DashboardUsers[1][4]='inactive';},
  h=>{h.f.ctx.Utilities.formatDate=()=>new Date(Date.parse(F.date)+86400000).toISOString().slice(0,10);}
 ];
 for(const change of changes){const h=fixed();h.verify();change(h);const r=h.read();assert.equal(r.status,'error');assert.ok(!r.items&&!r.directory);assert.equal(h.f.fileWrites,0);}
});
test('changed config needs fresh readback; metadata race and incomplete source cannot activate',()=>{
 const h=fixed();h.verify();
 h.f.props.set(pinKey,JSON.stringify({...h.pin,cutoff:'2000-01-01'}));assert.equal(h.read().status,'error');assert.throws(h.verify,/COVERAGE/);
 h.f.props.set(pinKey,JSON.stringify(h.pin));
 const prior=h.f.ctx.Drive.Files.get;let rev=0;h.f.ctx.Drive.Files.get=id=>({...prior(id),version:String(++rev)});
 assert.throws(h.verify,/DURING_READ/);assert.equal(h.read().status,'error');
 assert.equal(h.f.fileWrites,0);
});
