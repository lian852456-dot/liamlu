const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const F=require('./fixtures/insurance-progress.cjs'),C=require('../insurance-consultation.js'),K=require('../insurance-source-core.js'),{setup}=require('./helpers/insurance-runtime.cjs');
const DAY='2026-11-20',hash=v=>crypto.createHash('sha256').update(v).digest('hex'),FILE='north12b-insurance-source-private.json';
function payload(date=DAY,rate=.42857,tag='a'){
 const d=F.data(rate,.4),s=d.meta.insuranceConsultationSource,sourceBytes=Buffer.from('SYNTHETIC_SOURCE_'+tag),sourceFile=date.slice(5).replace('-','')+'.xlsx',sha=hash(sourceBytes);
 Object.assign(s,{sourceFile,sourceSha256:sha,publicationDate:date});for(const part of [s.personal,s.stores])Object.assign(part,{periodStart:date.slice(0,7)+'-01',cutoff:date});s.version=hash(JSON.stringify(s));
 return {sourceBytes,sourceFile,reportDate:date,payload:{schema:'insurance-source-payload/v1',data:{meta:{sourceFile,sourceSha256:sha,reportDate:date,insuranceConsultationSource:s},stores:d.stores}}};
}
function runtime(){const f=setup();f.useDedicatedStore();f.ctx.Utilities.formatDate=()=>DAY;return f;}
function begin(f,input){return f.publish({action:'insurance_source_begin',expectedVersion:f.publish({action:'insurance_source_status'}).version,attempt:{reportDate:input.reportDate,sourceFile:input.sourceFile,sourceSha256:hash(input.sourceBytes)}});}
function complete(f,start,p,outcome='complete'){return f.publish({action:'insurance_source_complete',expectedVersion:start.version,attemptId:start.lastAttempt.id,outcome,payload:outcome==='complete'?p.payload:null});}
function read(f,proof){return f.handle({action:'employee_insurance_read',...proof,dataDate:DAY});}
function publish(f,p){return complete(f,begin(f,p),p);}
test('source publication shares no KPI writes, requires existing admin/owner, and regular B cannot invoke it',()=>{
 const f=runtime(),before=JSON.stringify(f.source),proof=f.login();
 assert.throws(()=>f.ctx.insuranceSourcePublication_({action:'insurance_source_status',adminSecret:'WRONG'}),/驗證/);assert.equal(f.fileWrites,0);
 assert.equal(f.handle({action:'insurance_source_begin',...proof}).status,'error');
 publish(f,payload());assert.equal(JSON.stringify(f.source),before);assert.deepEqual([...f.files.keys()],[FILE]);assert.equal(read(f,proof).items[0].progress.rate,.42857);
 f.source={meta:{sourceFile:'1120.xlsx'},stores:[],persons:[]};assert.equal(read(f,proof).items[0].progress.rate,.42857);assert.equal(read(f,proof).items[0].status,'required');
 const status=JSON.stringify(f.publish({action:'insurance_source_status'}));assert.ok(!status.includes('SYNTH002'));assert.ok(!status.includes('subjectId'));
});
test('partial next batch updates valid people and retains missing/invalid people and unverified store independently',()=>{
 const f=runtime();f.rows.DashboardUsers[2][3]='店長';const proof=f.login();publish(f,payload('2026-11-19',0,'old'));
 const next=payload(DAY,.6,'new'),s=next.payload.data.meta.insuranceConsultationSource;s.personal.rows[1].rate=null;s.stores.status='pending';s.stores.cutoff=null;
 publish(f,next);let rows=read(f,proof).items;const self=rows.find(r=>r.kind==='personal'),store=rows.find(r=>r.kind==='store');
 assert.equal(self.status,'pending');assert.equal(self.progress.rate,0);assert.equal(self.progress.cutoff,'2026-11-19');assert.equal(self.progress.referenceOnly,true);assert.equal(store.progress.rate,.4);assert.equal(store.status,'pending');
 const other=f.login('SYNTH003','SYNTHETIC_OTHER_DEVICE');assert.equal(read(f,other).items[0].status,'exempt');assert.equal(read(f,other).items[0].progress.rate,.6);assert.equal(read(f,other).weekly.cumulativeReward,null);
 const submit=f.handle({action:'employee_insurance_submit',...proof,dataDate:DAY,subjectKey:self.subjectKey,sourceVersion:self.progress.sourceVersion,values:F.values,submissionId:'SYNTHETIC_NO_STALE_SUBMIT'});assert.equal(submit.status,'error');
});
test('missing or failed next batch retains original values and dates but cannot impose daily consultation',()=>{
 for(const outcome of ['missing','failed']){const f=runtime(),proof=f.login();publish(f,payload('2026-11-19'));
 const next=payload(DAY,.7,'new'),started=begin(f,next);assert.equal(read(f,proof).items[0].status,'pending');complete(f,started,next,outcome);
 const row=read(f,proof).items[0];assert.equal(row.progress.rate,.42857);assert.equal(row.progress.publicationDate,'2026-11-19');assert.equal(row.progress.lastAttemptStatus,outcome);assert.equal(row.status,'pending');
 // A repaired extraction of the same input may retry a failed/missing attempt.
 publish(f,next);assert.equal(read(f,proof).items[0].status,'exempt');}
});
test('completion readback failure rolls back to durable pending state with prior valid data',()=>{
 const f=runtime(),proof=f.login();publish(f,payload('2026-11-19'));const next=payload(DAY,.8,'new'),started=begin(f,next),pending=f.files.get(FILE),get=f.files.get.bind(f.files);let armed=true;
 f.files.get=key=>{const text=get(key);if(armed&&key===FILE&&text?.includes('"status":"complete"')){armed=false;return 'SYNTHETIC_CORRUPT_READ';}return text;};
 assert.throws(()=>complete(f,started,next),/READBACK/);assert.equal(get(FILE),pending);const row=read(f,proof).items[0];assert.equal(row.progress.rate,.42857);assert.equal(row.status,'pending');assert.equal(row.progress.lastAttemptStatus,'pending');
});
test('CAS, old batches, malformed complete source and same-hash retry are bounded',()=>{
 const f=runtime(),p=payload(),start=begin(f,p);assert.throws(()=>complete(f,{...start,version:''},p),/CAS/);
 const invalid=JSON.parse(JSON.stringify(p));invalid.payload.data.meta.reportDate='2026-11-21';assert.throws(()=>complete(f,start,invalid),/BATCH/);assert.equal(f.publish({action:'insurance_source_status'}).lastAttempt.status,'pending');
 complete(f,start,p);const writes=f.fileWrites;publish(f,p);assert.equal(f.fileWrites,writes);assert.throws(()=>begin(f,payload('2026-11-19')),/OLDER/);
 const newer=payload(DAY,.5,'correction');publish(f,newer);assert.equal(read(f,f.login()).items[0].status,'exempt');
});
test('cross-month prior source remains visible only as dated reference',()=>{
 const f=runtime(),proof=f.login();publish(f,payload('2026-10-31'));complete(f,begin(f,payload()),payload(),'missing');const row=read(f,proof).items[0];assert.equal(row.status,'pending');assert.equal(row.progress.cutoff,'2026-10-31');assert.equal(row.progress.referenceOnly,true);
});
test('publisher reconciles a lost completion response without repeating writes and records failures explicitly',async()=>{
 const {prepareInsurancePublication,publishInsuranceOnce}=await import('../scripts/north12b/insurance_publish.mjs');const f=runtime(),input=payload(),plan=prepareInsurancePublication(input);let lost=true;const actions=[];
 const request=async(_endpoint,p)=>{actions.push(p.action);const r=f.publish(p);if(p.action==='insurance_source_complete'&&lost){lost=false;throw Error('SYNTHETIC_LOST_RESPONSE');}return JSON.parse(JSON.stringify(r));};
 const r=await publishInsuranceOnce({plan,request,endpoint:'SYNTHETIC_PRIVATE_ENDPOINT'});assert.equal(r.reconciledAfterUncertainResponse,true);assert.equal(actions.filter(a=>a==='insurance_source_complete').length,1);
 const count=f.fileWrites;assert.equal((await publishInsuranceOnce({plan,request,endpoint:'SYNTHETIC_PRIVATE_ENDPOINT'})).alreadyPublished,true);assert.equal(f.fileWrites,count);
 const bad=payload(DAY,.5,'failed');const failed=prepareInsurancePublication({...bad,payload:null,outcome:'failed'});await publishInsuranceOnce({plan:failed,request,endpoint:'SYNTHETIC_PRIVATE_ENDPOINT'});assert.equal(read(f,f.login()).items[0].status,'pending');
});
test('shared core mirrors GAS; extraction writes a separate private artifact and normal KPI route remains redacted',()=>{
 assert.equal(fs.readFileSync('insurance-source-core.js','utf8'),fs.readFileSync('gas/InsuranceSourceCore.gs','utf8'));
 const extract=fs.readFileSync('scripts/north12b/extract.py','utf8');assert.doesNotMatch(extract,/meta\['insuranceConsultationSource'\]\s*=/);assert.doesNotMatch(extract,/write_private_publication_artifacts/);assert.match(fs.readFileSync('scripts/north12b/insurance_report_preview.py','utf8'),/write_private_publication_artifacts/);
 const store=fs.readFileSync('gas/InsuranceConsultationStore.gs','utf8');assert.doesNotMatch(store,/kpiCalcLatestDataFile/);assert.match(fs.readFileSync('gas/Code.gs','utf8'),/insurance_source_status.*insurance_source_begin.*insurance_source_complete/);
});
test('daily private intent uses exact bytes, explicit authorized adapter and a private receipt; failed extraction preserves source',async()=>{
 const os=require('node:os'),path=require('node:path'),{publishInsuranceIntent}=await import('../scripts/north12b/insurance_publish.mjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'SYNTHETIC-insurance-')),f=runtime(),input=payload(),actions=[];
 try{
  const sourcePath=path.join(dir,input.sourceFile),payloadFile='insurance-source-1120.json',intentPath=path.join(dir,'insurance-publish-1120.json'),receiptPath=path.join(dir,'receipt.json');
  fs.writeFileSync(sourcePath,input.sourceBytes);const bytes=JSON.stringify(input.payload);fs.writeFileSync(path.join(dir,payloadFile),bytes);
  const intent={schema:'insurance-source-intent/v1',sourceFile:input.sourceFile,sourceSha256:hash(input.sourceBytes),reportDate:DAY,outcome:'complete',payloadFile,payloadSha256:hash(bytes)};
  fs.writeFileSync(intentPath,JSON.stringify(intent));const request=async(_,p)=>{actions.push(p.action);return f.publish(p);};
  await publishInsuranceIntent({intentPath,sourcePath,receiptPath,request,endpoint:'SYNTHETIC_ENDPOINT'});
  assert.equal(fs.statSync(receiptPath).mode&0o777,0o600);assert.equal(read(f,f.login()).items[0].status,'required');
  const before=actions.length;fs.writeFileSync(path.join(dir,payloadFile),bytes+' ');
  await assert.rejects(publishInsuranceIntent({intentPath,sourcePath,request}),/HASH_CHANGED/);assert.equal(actions.length,before);
  fs.writeFileSync(sourcePath,'SYNTHETIC_FAILED_NEW_INPUT');Object.assign(intent,{sourceSha256:hash('SYNTHETIC_FAILED_NEW_INPUT'),outcome:'failed',payloadFile:null,payloadSha256:null});fs.writeFileSync(intentPath,JSON.stringify(intent));
  await publishInsuranceIntent({intentPath,sourcePath,request});const row=read(f,f.login()).items[0];assert.equal(row.status,'pending');assert.equal(row.progress.rate,.42857);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
