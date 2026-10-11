'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixturePath=path.join(__dirname,'dashboard-password-roster-renewal.test.cjs'),m={exports:{}};
vm.runInNewContext(fs.readFileSync(fixturePath,'utf8').split('\ntest(')[0]+'\nmodule.exports={fixture,passwordLogin};',
 {require,module:m,exports:m.exports,__dirname,__filename:fixturePath,console,process,Buffer,Set,Map});
const {fixture,passwordLogin}=m.exports;
const call=(f,p)=>JSON.parse(f.ctx.privateDashboardGasBMaybePost_({postData:{type:'text/plain',contents:JSON.stringify(p)}}).text);
function setup(){
 const f=fixture();f.ctx.privateDashboardBVerifyPassword_=()=>true;
 const device='SYNTHETIC_REPORT_DEVICE',login=call(f,passwordLogin('SYNTH002',device,'SYNTHETIC_PASSWORD','SYNTHETIC_REPORT_REQUEST','a'));
 assert.equal(login.status,'ok');const reads=[];
 f.ctx.privateDashboardSnapshot=()=>({marker:'SYNTHETIC_PRIVATE'});
 f.ctx.kpiCalcLatestDataFile=()=>({getBlob:()=>({getDataAsString:()=>JSON.stringify({meta:{},stores:[],persons:[]})})});
 f.ctx.Utilities.formatDate=d=>new Date(d.getTime()+8*3600000).toISOString().slice(0,10);
 const originalOpen=f.ctx.SpreadsheetApp.openById,reportSheet={kind:'report'},peopleSheet={kind:'people'};
 const reportId=vm.runInContext('SPREADSHEET_ID',f.ctx);
 f.ctx.SpreadsheetApp.openById=id=>id===reportId?{getSheetByName:name=>name==='個人回報'?peopleSheet:reportSheet}:originalOpen(id);
 f.ctx.readData=(date,segment,paired,sheet)=>{assert.ok(f.held());assert.equal(sheet,reportSheet);assert.equal(paired,false);reads.push(['report',date,segment]);return {'酒泉':{aq999:segment===16?0:2,savedAt:'16:01:02'}};};
 f.ctx.readPersonal=(date,segment,sheet)=>{assert.ok(f.held());assert.equal(sheet,peopleSheet);reads.push(['people',date,segment]);return {'酒泉':{'同仁＊':{aq999:0,status:'fail'}}};};
 return {f,device,login,reads,read:extra=>call(f,{action:'employee_dashboard_read',deviceId:device,token:login.token,includeReports:true,...extra})};
}
test('App reads exactly owner-selected today 16/21 and yesterday 21 under the existing legal session',()=>{
 const h=setup(),before=h.f.counts().writes,r=h.read();assert.equal(r.status,'ok');assert.equal(r.expiresAt,h.login.expiresAt);
 const b=r.reportsResult;assert.equal(b.schema,'daily-report-bundle-v1');assert.equal(b.date,h.f.ctx.Utilities.formatDate(new Date()));
 assert.equal(Date.parse(b.date)-Date.parse(b.yesterday),86400000);
 assert.deepEqual(b.segments.map(x=>[x.date,x.segment]),[[b.date,16],[b.date,21],[b.yesterday,21]]);
 assert.equal(h.reads.length,6);for(const row of b.segments){assert.equal(row.reportResult.status,'ok');assert.equal(row.peopleResult.status,'ok');assert.equal(row.reportResult.summary.date,row.date);assert.equal(row.reportResult.summary.segment,row.segment);}
 assert.equal(b.segments[0].reportResult.summary.metrics.A999.value,0);
 assert.equal(h.f.counts().writes,before);assert.equal(h.f.held(),false);
 for(const secret of [h.device,h.login.token,'SYNTHETIC_PASSWORD'])assert.equal(JSON.stringify(r).includes(secret),false);
});
test('reports retain device, roster, native generation, epoch, binding, logout and request-shape gates',()=>{
 for(const mode of ['device','inactive','revoked','native','epoch','binding','logout','employeeId','date','seg','false','string']){
  const h=setup(),f=h.f;let extra={};
  if(mode==='device')extra.deviceId='SYNTHETIC_OTHER_DEVICE';
  if(mode==='inactive'||mode==='revoked')f.rows.DashboardUsers[2][4]=mode;
  if(mode==='native')f.ctx.privateDashboardAdminRevoke({adminSecret:'SYNTHETIC_ADMIN_ONLY',employeeId:'SYNTH002'});
  if(mode==='epoch'){const k='DASHBOARD_AUTH_B_CONFIG_V1',v=JSON.parse(f.props.get(k));v.epoch++;f.props.set(k,JSON.stringify(v));}
  if(mode==='binding'){const k='DASHBOARD_AUTH_B_BIND_V1',v=JSON.parse(f.props.get(k));v.bindings.SYNTH002[1]++;f.props.set(k,JSON.stringify(v));}
  if(mode==='logout')call(f,{action:'employee_logout',deviceId:h.device,token:h.login.token});
  if(mode==='employeeId')extra.employeeId='SYNTH002';if(mode==='date')extra.date='2000-01-01';if(mode==='seg')extra.seg=16;
  if(mode==='false')extra.includeReports=false;if(mode==='string')extra.includeReports='true';
  assert.deepEqual(h.read(extra),{status:'error',code:'B_AUTH_DENIED'},mode);assert.equal(h.reads.length,0,mode);
 }
});
test('source failures stay explicit per segment; missing sheets never create data or fabricate zero',()=>{
 const h=setup(),original=h.f.ctx.readData;
 h.f.ctx.readData=(date,seg,...rest)=>{if(seg===16)throw Error('SYNTHETIC_SOURCE_FAILURE');return original(date,seg,...rest);};
 h.f.ctx.readPersonal=()=>{throw Error('SYNTHETIC_PEOPLE_FAILURE');};
 let r=h.read();assert.equal(r.status,'ok');assert.deepEqual(r.reportsResult.segments[0].reportResult,{status:'error'});
 assert.equal(r.reportsResult.segments[1].reportResult.status,'ok');assert.deepEqual(r.reportsResult.segments[1].peopleResult,{status:'error'});
 const id=vm.runInContext('SPREADSHEET_ID',h.f.ctx),open=h.f.ctx.SpreadsheetApp.openById;
 h.f.ctx.SpreadsheetApp.openById=value=>value===id?{getSheetByName:()=>null,insertSheet:()=>assert.fail('read created sheet')}:open(value);
 r=h.read();assert.equal(r.status,'ok');for(const row of r.reportsResult.segments){assert.deepEqual(row.reportResult,{status:'error'});assert.deepEqual(row.peopleResult,{status:'error'});}
});
test('report data passes secret/shape bounds and deadline is checked after the final read',()=>{
 const h=setup();h.f.ctx.readPersonal=()=>({token:'FORBIDDEN'});
 assert.deepEqual(h.read().reportsResult.segments[0].peopleResult,{status:'error'});
 let time=Date.now();h.f.ctx.Date=class extends Date{static now(){return time;}};
 h.f.ctx.readPersonal=()=>{time=h.login.expiresAt;return {};};
 assert.deepEqual(h.read(),{status:'error',code:'B_AUTH_DENIED'});
});
test('existing dashboard callers do not read report sheets; explicit source readers avoid initialization',()=>{
 const h=setup();assert.equal(call(h.f,{action:'employee_dashboard_read',deviceId:h.device,token:h.login.token}).status,'ok');assert.equal(h.reads.length,0);
 const code=fs.readFileSync(path.join(__dirname,'../gas/Code.gs'),'utf8');
 const declaration=name=>code.slice(code.indexOf('function '+name+'(')).split(/\n\}\s*\n/)[0]+'\n}';
 const ctx=vm.createContext({getSheet:()=>assert.fail('initialized report sheet'),getPersonalSheet:()=>assert.fail('initialized people sheet')});
 vm.runInContext(declaration('readData')+'\n'+declaration('readPersonal'),ctx);
 const emptyReport={getLastRow:()=>1,getLastColumn:()=>3,getRange:()=>({getValues:()=>[['date','store','seg']]})};
 const emptyPeople={getDataRange:()=>({getValues:()=>[['date','seg','store','name','record']]})};
 assert.equal(JSON.stringify(ctx.readData('2026-10-11',16,false,emptyReport)),'{}');
 assert.equal(JSON.stringify(ctx.readPersonal('2026-10-11',16,emptyPeople)),'{}');
});
test('client report opt-in carries only session proof, is coalesced separately, and rejects missing reports',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../GasBClient.js'),'utf8'),calls=[],pending=[];
 const deadline=Date.now()+1700000;
 const ctx=vm.createContext({crypto:require('node:crypto').webcrypto,AbortController,setTimeout,clearTimeout,Date,fetch:async(_,opts)=>{
  const p=JSON.parse(opts.body);calls.push(p);
  if(p.action==='employee_login')return {ok:true,json:async()=>({status:'ok',token:'B1_a_'+'a'.repeat(64),expiresAt:deadline,trustSource:'password-bound'})};
  if(p.action==='employee_logout')return {ok:true,json:async()=>({status:'ok'})};
  return new Promise(resolve=>pending.push({signal:opts.signal,resolve:reports=>resolve({ok:true,json:async()=>({status:'ok',expiresAt:deadline,trustSource:'password-bound',phoneEligible:false,privateResult:{status:'ok'},kpiResult:{status:'ok'},...reports})})}));
 }});vm.runInContext(source,ctx);const client=ctx.createDashboardBClient('https://script.google.com/macros/s/ABCDEFGHIJKLMNOPQRST/exec');
 await client.login('SYNTHETIC','SYNTHETIC_DEVICE','SYNTHETIC_PASSWORD');
 const old=client.readBundle(),app=client.readBundle(true),coalesced=client.readBundle(true);
 assert.equal(pending.length,2);assert.deepEqual(Object.keys(calls.at(-1)).sort(),['action','deviceId','includeReports','token']);
 pending[0].resolve();pending[1].resolve({reportsResult:{schema:'daily-report-bundle-v1',segments:[{},{},{}]}});await Promise.all([old,app,coalesced]);
 const missing=client.readBundle(true),denied=assert.rejects(missing,/B_AUTH_DENIED/);pending[2].resolve();await denied;
 const late=client.readBundle(true),stale=assert.rejects(late,/B_CONTEXT_CHANGED/);await client.logout();assert.equal(pending[3].signal.aborted,true);
 pending[3].resolve({reportsResult:{schema:'daily-report-bundle-v1',segments:[{},{},{}]}});await stale;
});
