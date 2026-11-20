const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const F=require('./fixtures/insurance-progress.cjs'),C=require('../insurance-consultation.js'),K=require('../insurance-source-core.js'),{setup}=require('./helpers/insurance-runtime.cjs');
const DAY='2026-11-20',hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function payload(date=DAY,rate=.42857,tag='a'){
 const d=F.data(rate,.4),s=d.meta.insuranceConsultationSource,sourceBytes=Buffer.from('SYNTHETIC_SOURCE_'+tag),sourceFile=date.slice(5).replace('-','')+'.xlsx',sha=hash(sourceBytes);
 Object.assign(s,{sourceFile,sourceSha256:sha,publicationDate:date});for(const part of [s.personal,s.stores])Object.assign(part,{periodStart:date.slice(0,7)+'-01',cutoff:date});s.version=hash(JSON.stringify(s));
 return {sourceBytes,sourceFile,reportDate:date,payload:{schema:'insurance-source-payload/v1',data:{meta:{sourceFile,sourceSha256:sha,reportDate:date,insuranceConsultationSource:s},stores:d.stores}}};
}
// Exercise the shared validator in memory. No Drive publisher or admin route is involved.
function runtime(){
 const f=setup();let state=K.empty();
 f.ctx.Utilities.formatDate=()=>DAY;
 f.ctx.insuranceConsultSource_=()=>state;
 f.begin=input=>{
  state=K.begin(state,{reportDate:input.reportDate,sourceFile:input.sourceFile,sourceSha256:hash(input.sourceBytes)},C,hash,DAY);
  return state.lastAttempt.id;
 };
 f.complete=(attemptId,input,outcome='complete')=>{
  state=K.finish(state,{attemptId,outcome,payload:outcome==='complete'?input.payload:null},C,hash);
  return state.version;
 };
 return f;
}
function publish(f,input){return f.complete(f.begin(input),input);}
function read(f,proof){return f.handle({action:'employee_insurance_read',...proof,dataDate:DAY});}

test('doPost rejects all three unused source actions before accessing data, including an admin request',()=>{
 const vm=require('node:vm'),path=require('node:path'),f=setup();
 new vm.Script(fs.readFileSync(path.join(__dirname,'../gas/PersonalRankAutomation.gs'),'utf8')).runInContext(f.ctx);
 const before=f.raw();
 for(const action of ['insurance_source_status','insurance_source_begin','insurance_source_complete']){
  for(const auth of [{},{adminSecret:'SYNTHETIC_ADMIN_ONLY'}]){
   const response=f.ctx.doPost({postData:{type:'text/plain',contents:JSON.stringify({action,...auth})}});
   assert.deepEqual(JSON.parse(response.text),{status:'error',message:'unknown private dashboard action'});
  }
 }
 assert.equal(typeof f.ctx.insuranceSourcePublication_,'undefined');
 assert.deepEqual(f.raw(),before);assert.equal(f.fileWrites,0);
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
 const next=payload(DAY,.7,'new'),started=f.begin(next);assert.equal(read(f,proof).items[0].status,'pending');f.complete(started,next,outcome);
 const row=read(f,proof).items[0];assert.equal(row.progress.rate,.42857);assert.equal(row.progress.publicationDate,'2026-11-19');assert.equal(row.progress.lastAttemptStatus,outcome);assert.equal(row.status,'pending');
 // A repaired extraction of the same input may retry a failed/missing attempt.
 publish(f,next);assert.equal(read(f,proof).items[0].status,'exempt');}
});
test('validator checks batch identity and rejects older data while identical inputs are idempotent',()=>{
 const f=runtime(),p=payload(),id=f.begin(p);
 const invalid=JSON.parse(JSON.stringify(p));invalid.payload.data.meta.reportDate='2099-01-01';
 assert.throws(()=>f.complete(id,invalid),/BATCH/);
 const version=f.complete(id,p);
 assert.equal(publish(f,p),version);
 assert.throws(()=>f.begin(payload('2026-11-19')),/OLDER/);
});
test('cross-month prior source remains visible only as dated reference',()=>{
 const f=runtime(),proof=f.login();publish(f,payload('2026-10-31'));f.complete(f.begin(payload()),payload(),'missing');const row=read(f,proof).items[0];assert.equal(row.status,'pending');assert.equal(row.progress.cutoff,'2026-10-31');assert.equal(row.progress.referenceOnly,true);
});
test('shared core mirrors GAS; extraction writes a separate private artifact and normal KPI route remains redacted',()=>{
 assert.equal(fs.readFileSync('insurance-source-core.js','utf8'),fs.readFileSync('gas/InsuranceSourceCore.gs','utf8'));
 const extract=fs.readFileSync('scripts/north12b/extract.py','utf8');assert.doesNotMatch(extract,/meta\['insuranceConsultationSource'\]\s*=/);assert.doesNotMatch(extract,/write_private_publication_artifacts/);assert.match(fs.readFileSync('scripts/north12b/insurance_report_preview.py','utf8'),/write_private_publication_artifacts/);
 const store=fs.readFileSync('gas/InsuranceConsultationStore.gs','utf8');assert.doesNotMatch(store,/kpiCalcLatestDataFile/);assert.doesNotMatch(fs.readFileSync('gas/Code.gs','utf8'),/insurance_source_(?:status|begin|complete)/);
});
