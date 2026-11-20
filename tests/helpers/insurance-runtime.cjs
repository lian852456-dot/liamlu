const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto'),F=require('../fixtures/insurance-progress.cjs');
// Reuse the existing real B/native eligibility harness, without registering its tests.
const testRoot=path.resolve(__dirname,'..');
const harness=fs.readFileSync(path.join(testRoot,'dashboard-password-roster-renewal.test.cjs'),'utf8').split('\nfunction members(')[0];
const make=new Function('require','__dirname',harness+'\nreturn fixture;')(require,testRoot);
function setup(source=F.data()){
 const f=make(),files=new Map();let fileWrites=0;
 for(const name of ['InsuranceConsultation.gs','InsuranceConsultationStore.gs'])new vm.Script(fs.readFileSync(path.join(testRoot,'../gas',name),'utf8')).runInContext(f.ctx);
 f.ctx.Utilities.formatDate=()=>F.date;
 f.ctx.Utilities.computeHmacSha256Signature=(text,secret)=>[...crypto.createHmac('sha256',secret).update(text).digest()];
 f.ctx.Utilities.newBlob=(text,type,name)=>({text,name});
 f.ctx.kpiCalcLatestDataFile=()=>({getBlob:()=>({getDataAsString:()=>JSON.stringify(source)})});
 function file(name){return {getBlob:()=>({getDataAsString:()=>files.get(name)}),setContent:text=>{if(!f.held())throw Error('write outside session transaction');files.set(name,text);fileWrites++;}};}
 f.ctx.privateDashboardFolder=()=>({getFilesByName:name=>{let read=false;return {hasNext:()=>files.has(name)&&!read,next:()=>{read=true;return file(name);}};},createFile:b=>{if(!f.held())throw Error('create outside session transaction');files.set(b.name,b.text);fileWrites++;return file(b.name);}});
 f.ctx.privateDashboardBVerifyPassword_=()=>true;
 f.ctx.privateDashboardSnapshot=()=>({schema:'SYNTHETIC'});
 f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID','SYNTHBOSS');f.rows.DashboardUsers.push(['SYNTHBOSS','合*督','北一二B','督導','active','','','']);
 const api=f.ctx.privateDashboardCreateGasB_({}),handle=p=>JSON.parse(JSON.stringify(api.handle(JSON.stringify(p))));let seq=0;
 function login(id='SYNTH002',device='SYNTHETIC_INSURANCE_DEVICE'){
  const r=handle({action:'employee_login',employeeId:id,deviceId:device,track:'password-bound',password:'SYNTHETIC',sessionNonce:(++seq).toString(16).padStart(64,'0'),idempotencyKey:'SYNTHETIC_INSURANCE_LOGIN_'+seq});if(r.status!=='ok')throw Error('login failed '+JSON.stringify(r));return {deviceId:device,token:r.token};
 }
 return {...f,handle,login,files,get fileWrites(){return fileWrites;},set source(v){source=v;},get source(){return source;}};
}
module.exports={setup};
