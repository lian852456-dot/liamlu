'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../GasBClient.js'),'utf8');
function fixture(){
 const saved=new Map(),timers=new Map(),calls=[];let mode='ok',serial=0;
 const expiry=Date.now()+1200000,storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
 const context={crypto:require('node:crypto').webcrypto,AbortController,Date,
  setTimeout:fn=>{timers.set(++serial,fn);return serial;},clearTimeout:id=>timers.delete(id),
  fetch:async(_,options)=>{
   const action=JSON.parse(options.body).action;calls.push(action);
   if(mode==='network')throw Error('SYNTHETIC_RAW_NETWORK_DETAIL');
   if(mode==='timeout')return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(Error('SYNTHETIC_ABORT_DETAIL'))));
   if(mode==='http')return {ok:false};
   return {ok:true,json:async()=>{
    if(mode==='json')throw Error('SYNTHETIC_RAW_RESPONSE_DETAIL');
    if(mode==='shape')return {message:'SYNTHETIC_RAW_BACKEND_DETAIL'};
    if(mode==='auth')return {status:'error',message:'SYNTHETIC_RAW_BACKEND_DETAIL'};
    return action==='employee_login'?{status:'ok',token:'B1_a_'+'a'.repeat(64),expiresAt:expiry,trustSource:'password-bound'}:
     {status:'ok',expiresAt:expiry,trustSource:'password-bound',phoneEligible:false};
   }};
  }};
 vm.createContext(context);vm.runInContext(source,context);
 return {client:context.createDashboardBClient('https://script.google.com/macros/s/ABCDEFGHIJKLMNOPQRST/exec',{storage}),saved,calls,expiry,
  mode:value=>{mode=value;},timeout:()=>{for(const fn of [...timers.values()])fn();}};
}
for(const [mode,code]of [['network','B_NETWORK_UNAVAILABLE'],['http','B_SERVICE_UNAVAILABLE'],['json','B_RESPONSE_INVALID'],['shape','B_RESPONSE_INVALID'],['auth','B_AUTH_DENIED'],['timeout','B_TIMEOUT']]){
 test(`${mode} is classified without raw details, retry/logout or proof/deadline changes`,async()=>{
  const f=fixture();await f.client.login('SYNTH001','synthetic-device','SYNTHETIC_PASSWORD');const before=[...f.saved];
  f.mode(mode);const rejected=f.client.validate();if(mode==='timeout')f.timeout();
  await assert.rejects(rejected,error=>error.message===code);
  assert.deepEqual([...f.saved],before);assert.deepEqual(f.calls,['employee_login','employee_session']);
  f.mode('ok');const result=await f.client.validate();assert.equal(result.expiresAt,f.expiry);
  assert.deepEqual([...f.saved],before);assert(!JSON.stringify([...f.saved]).includes('SYNTHETIC_PASSWORD'));
 });
}
