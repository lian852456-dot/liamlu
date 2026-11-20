const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),F=require('../fixtures/insurance-progress.cjs');
// Reuse the existing real B/native eligibility harness, without registering its tests.
const testRoot=path.resolve(__dirname,'..');
const harness=fs.readFileSync(path.join(testRoot,'dashboard-password-roster-renewal.test.cjs'),'utf8').split('\nfunction members(')[0];
const make=new Function('require','__dirname',harness+'\nreturn fixture;')(require,testRoot);
function setup(source=F.data(),fixedSourceText){
 const f=make(),files=new Map();let fileWrites=0;
 const demoNames=['示＊晴','示＊安','示＊澄','示＊華','示＊辰','示＊雨','示＊和','示＊琪','示＊楓'];
 f.rows.DashboardUsers.slice(1).forEach((row,i)=>{row[1]=demoNames[i];row[3]='同仁';});
 for(const name of ['InsuranceConsultation.gs','InsuranceSourceCore.gs','InsuranceConsultationStore.gs','InsuranceFixedSource.gs']){
  const text=name==='InsuranceFixedSource.gs' && fixedSourceText!==undefined ? fixedSourceText : fs.readFileSync(path.join(testRoot,'../gas',name),'utf8');
  new vm.Script(text,{filename:name}).runInContext(f.ctx);
 }
 f.ctx.Utilities.formatDate=()=>F.date;
 f.ctx.Utilities.computeHmacSha256Signature=(text,secret)=>[...crypto.createHmac('sha256',secret).update(text).digest()];
 f.ctx.Utilities.newBlob=(text,type,name)=>({text,name});
 f.ctx.kpiCalcLatestDataFile=()=>({getBlob:()=>({getDataAsString:()=>JSON.stringify(source)})});
 function file(name){return {getBlob:()=>({getDataAsString:()=>files.get(name)}),setContent:text=>{if(!f.held())throw Error('write outside session transaction');files.set(name,text);fileWrites++;}};}
 f.ctx.privateDashboardFolder=()=>({getFilesByName:name=>{let read=false;return {hasNext:()=>files.has(name)&&!read,next:()=>{read=true;return file(name);}};},createFile:b=>{if(!f.held())throw Error('create outside session transaction');files.set(b.name,b.text);fileWrites++;return file(b.name);}});
 const dedicatedRead=f.ctx.insuranceConsultSource_;
 // Existing view tests inject a complete private source state, never production sessions.
 f.ctx.insuranceConsultSource_=()=>{
  if(!source)return f.ctx.InsuranceSourceCore.empty();
  const meta=source.meta||{},a={reportDate:meta.reportDate,sourceFile:meta.sourceFile,sourceSha256:meta.sourceSha256};
  // Fixture names are synthetic; direct state setup keeps malformed-source tests on the read path.
  const rows=f.ctx.InsuranceConsultation.source(source,F.date);
  return {schema:'insurance-source-state/v1',revision:1,version:'fixture',lastAttempt:{id:'fixture',reportDate:a.reportDate,status:'complete'},entries:rows.map(r=>({...r,observedAttemptId:'fixture'}))};
 };
 f.ctx.privateDashboardBVerifyPassword_=()=>true;
 f.ctx.privateDashboardSnapshot=()=>({schema:'SYNTHETIC'});
 f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID','SYNTHBOSS');f.rows.DashboardUsers.push(['SYNTHBOSS','合*督','北一二B','督導','active','','','']);
 const api=f.ctx.privateDashboardCreateGasB_({}),handle=p=>JSON.parse(JSON.stringify(api.handle(JSON.stringify(p))));let seq=0;
 function login(id='SYNTH002',device='SYNTHETIC_INSURANCE_DEVICE'){
  const r=handle({action:'employee_login',employeeId:id,deviceId:device,track:'password-bound',password:'SYNTHETIC',sessionNonce:(++seq).toString(16).padStart(64,'0'),idempotencyKey:'SYNTHETIC_INSURANCE_LOGIN_'+seq});if(r.status!=='ok')throw Error('login failed '+JSON.stringify(r));return {deviceId:device,token:r.token};
 }
 return {...f,handle,login,files,useFixedSource(){f.ctx.insuranceConsultSource_=dedicatedRead;},get fileWrites(){return fileWrites;},set source(v){source=v;},get source(){return source;}};
}
module.exports={setup};
