'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixturePath=path.join(__dirname,'dashboard-password-roster-renewal.test.cjs'),m={exports:{}};
vm.runInNewContext(fs.readFileSync(fixturePath,'utf8').split('\ntest(')[0]+'\nmodule.exports={fixture,passwordLogin};',
 {require,module:m,exports:m.exports,__dirname,__filename:fixturePath,console,process,Buffer,Set,Map});
const {fixture,passwordLogin}=m.exports;
const call=(f,p)=>JSON.parse(f.ctx.privateDashboardGasBMaybePost_({postData:{type:'text/plain',contents:JSON.stringify(p)}}).text);
function setup({primary=false}={}){
 const f=fixture();if(primary)f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID','SYNTH002');
 f.ctx.privateDashboardBVerifyPassword_=()=>true;
 const device='SYNTHETIC_BUNDLE_DEVICE',login=call(f,passwordLogin('SYNTH002',device,'SYNTHETIC_PASSWORD','SYNTHETIC_BUNDLE_REQUEST','a'));
 assert.equal(login.status,'ok');let reads=0;
 f.ctx.privateDashboardSnapshot=()=>{assert.equal(f.held(),true);reads++;return f.ctx.privateDashboardBMeasure_('privateDrive',()=>({marker:'SYNTHETIC_PRIVATE'}));};
 f.ctx.kpiCalcLatestDataFile=()=>{assert.equal(f.held(),true);reads++;return f.ctx.privateDashboardBMeasure_('kpiLocate',()=>({getBlob:()=>({getDataAsString:()=>JSON.stringify({meta:{marker:'SYNTHETIC_KPI'},stores:[],persons:[]})})}));};
 return {f,login,device,reads:()=>reads,read:extra=>call(f,{action:'employee_dashboard_read',deviceId:device,token:login.token,...extra})};
}
test('bundle retains both strict read projections under one unchanged owner lock and fixed lease',()=>{
 for(const primary of [false,true]){
  const h=setup({primary}),r=h.read();assert.equal(r.status,'ok');assert.equal(r.expiresAt,h.login.expiresAt);assert.equal(r.phoneEligible,primary);
  assert.equal(r.privateResult.snapshot.marker,'SYNTHETIC_PRIVATE');assert.equal(r.kpiResult.data.meta.marker,'SYNTHETIC_KPI');
  for(const child of [r.privateResult,r.kpiResult]){assert.equal(child.status,'ok');assert.equal(child.trustSource,'password-bound');assert.equal(child.profile.role,'employee');assert.equal(child.profile.isTrusted,false);}
  for(const stage of ['lockWait','strictNative','privateDrive','kpiLocate','kpiBlob','flush'])assert.equal(r.serverTiming.filter(x=>x.name===stage).length,1,stage);
  assert.equal(r.serverTiming.filter(x=>x.name==='resultValidation').length,2);assert.equal(h.reads(),2);assert.equal(h.f.held(),false);
  const text=JSON.stringify(r);for(const secret of [h.device,h.login.token,'SYNTHETIC_PASSWORD'])assert.equal(text.includes(secret),false);
 }
});
test('bundle rejects invalid device, inactive/revoked roster, native revoke, epoch and binding drift before any data read',()=>{
 for(const scenario of ['device','inactive','revoked','native','epoch','binding','admin-reset','extra-reader']){
  const h=setup(),{f}=h;let extra={};
  if(scenario==='device')extra.deviceId='SYNTHETIC_WRONG_DEVICE';
  if(scenario==='inactive'||scenario==='revoked')f.rows.DashboardUsers[2][4]=scenario;
  if(scenario==='native')f.ctx.privateDashboardAdminRevoke({adminSecret:'SYNTHETIC_ADMIN_ONLY',employeeId:'SYNTH002'});
  if(scenario==='epoch'){const k='DASHBOARD_AUTH_B_CONFIG_V1',v=JSON.parse(f.props.get(k));v.epoch++;f.props.set(k,JSON.stringify(v));}
  if(scenario==='binding'){const k='DASHBOARD_AUTH_B_BIND_V1',v=JSON.parse(f.props.get(k));v.bindings.SYNTH002[1]++;f.props.set(k,JSON.stringify(v));}
  if(scenario==='admin-reset')assert.equal(call(f,{action:'employee_admin_reset_device',adminSecret:'SYNTHETIC_ADMIN_ONLY',employeeId:'SYNTH002'}).status,'ok');
  if(scenario==='extra-reader')extra.kind='WORK';
  assert.deepEqual(h.read(extra),{status:'error',code:'B_AUTH_DENIED'},scenario);assert.equal(h.reads(),0,scenario);assert.equal(f.held(),false);
 }
});
test('bundle never returns a partial projection or data that expires during the two reads',()=>{
 for(const scenario of ['invalid-kpi','secret-private','expiry']){
  const h=setup(),{f}=h;
  if(scenario==='invalid-kpi')f.ctx.kpiCalcLatestDataFile=()=>({getBlob:()=>({getDataAsString:()=>JSON.stringify({meta:{}})})});
  if(scenario==='secret-private')f.ctx.privateDashboardSnapshot=()=>({password:'FORBIDDEN'});
  if(scenario==='expiry'){
   let time=Date.now();f.ctx.Date=class extends Date{static now(){return time;}};
   const original=f.ctx.kpiCalcLatestDataFile;f.ctx.kpiCalcLatestDataFile=()=>{const file=original();time=h.login.expiresAt;return file;};
  }
  assert.deepEqual(h.read(),{status:'error',code:'B_AUTH_DENIED'},scenario);assert.equal(f.held(),false);
 }
});
test('client coalesces bundle reads, rejects deadline drift and blocks late data after logout',async()=>{
 const clientSource=fs.readFileSync(path.join(__dirname,'../GasBClient.js'),'utf8'),pending=[],actions=[];
 let deadline=Date.now()+1700000;
 const ctx={crypto:require('node:crypto').webcrypto,AbortController,setTimeout,clearTimeout,Date,fetch:async(_,opts)=>{
  const p=JSON.parse(opts.body);actions.push(p.action);
  if(p.action==='employee_login')return {ok:true,json:async()=>({status:'ok',token:'B1_a_'+'a'.repeat(64),expiresAt:deadline,trustSource:'password-bound'})};
  if(p.action==='employee_logout')return {ok:true,json:async()=>({status:'ok'})};
  return new Promise(resolve=>pending.push({signal:opts.signal,resolve:(change={})=>resolve({ok:true,json:async()=>({status:'ok',expiresAt:deadline,trustSource:'password-bound',phoneEligible:false,privateResult:{status:'ok'},kpiResult:{status:'ok'},...change})})}));
 }};vm.createContext(ctx);vm.runInContext(clientSource,ctx);
 const client=ctx.createDashboardBClient('https://script.google.com/macros/s/ABCDEFGHIJKLMNOPQRST/exec');
 await client.login('SYNTHETIC','synthetic-device','synthetic-password');
 const a=client.readBundle(),b=client.readBundle();assert.equal(actions.filter(x=>x==='employee_dashboard_read').length,1);
 pending[0].resolve();await Promise.all([a,b]);
 const drift=client.readBundle(),denied=assert.rejects(drift,/B_AUTH_DENIED/);pending[1].resolve({expiresAt:deadline+1});await denied;
 const late=client.readBundle(),stale=assert.rejects(late,/B_CONTEXT_CHANGED/);await client.logout();assert.equal(pending[2].signal.aborted,true);pending[2].resolve();await stale;
});
