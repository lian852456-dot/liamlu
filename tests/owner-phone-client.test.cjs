'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync(require('path').join(__dirname,'../GasBClient.js'),'utf8');
function fixture(){
 const PHONE='north12b_owner_phone_v1',url='https://script.google.com/macros/s/ABCDEFGHIJKLMNOPQRST/exec',device='SYNTHETIC_DEVICE_FOR_PHONE';
 const data=new Map(),calls=[];let grant='',serial=0,failPhoneWrite=false;
 const phoneStorage={getItem:k=>data.get(k)||null,setItem:(k,v)=>{if(failPhoneWrite==='afterResponse'&&JSON.parse(v).request)throw Error('SYNTHETIC_STORAGE_FAILURE');data.set(k,v);},removeItem:k=>data.delete(k)};
 function storage(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
 const ctx={crypto:require('crypto').webcrypto,AbortController,setTimeout,clearTimeout,Date,fetch:async(_,o)=>{
  const p=JSON.parse(o.body);calls.push(p);let r={status:'ok'};
  if(p.action==='employee_login'||p.action==='employee_phone_resume')r={status:'ok',token:'B1_a_'+'a'.repeat(64),expiresAt:Date.now()+1700000,trustSource:'password-bound',phoneExpiresAt:Date.now()+89*86400000};
  if(p.action==='employee_phone_enroll'){grant='BP1_'+(++serial).toString(16).padStart(64,'a');r={status:'ok',phoneToken:grant,expiresAt:Date.now()+89*86400000};}
  if(p.action==='employee_phone_resume'){if(p.phoneToken!==grant)r={status:'error'};if(failPhoneWrite)failPhoneWrite='afterResponse';}
  if(p.action==='employee_phone_forget'){if(!grant||grant===p.phoneToken)grant='';else r={status:'error'};}
  return {ok:true,json:async()=>r};
 }};vm.createContext(ctx);vm.runInContext(source,ctx);
 return {PHONE,device,data,calls,make:(s=storage())=>ctx.createDashboardBClient(url,{storage:s,phoneStorage}),failAfterResume:()=>{const set=phoneStorage.setItem;phoneStorage.setItem=(k,v)=>{if(failPhoneWrite==='afterResponse')throw Error('SYNTHETIC_STORAGE_FAILURE');set(k,v);};failPhoneWrite='pending';},grant:()=>grant};
}
test('closing the app keeps only a phone grant, no password, and reopening exchanges it for a short session',async()=>{
 const f=fixture(),a=f.make();await a.login('SYNTH001',f.device,'SYNTHETIC_PASSWORD');await a.enrollPhone();a.suspend();
 const b=f.make();await b.resumePhone(f.device);assert.equal(f.calls.filter(p=>p.action==='employee_login').length,1);assert.equal(f.calls.filter(p=>p.action==='employee_phone_resume').length,1);assert(![...f.data.values()].join('').includes('SYNTHETIC_PASSWORD'));await b.logout();assert.equal(f.data.get(f.PHONE),undefined);assert.equal(f.grant(),'');
});
test('storage failure after a successful phone resume revokes the durable grant and removes local proof',async()=>{
 const f=fixture(),a=f.make();await a.login('SYNTH001',f.device,'SYNTHETIC_PASSWORD');await a.enrollPhone();a.suspend();
 const b=f.make();f.failAfterResume();await assert.rejects(()=>b.resumePhone(f.device));assert.equal(f.grant(),'');assert.equal(f.data.get(f.PHONE),undefined);assert.equal(f.calls.at(-1).action,'employee_phone_forget');
});
test('a late old-tab logout cannot delete or revoke a newer phone enrollment',async()=>{
 const f=fixture(),old=f.make();await old.login('SYNTH001',f.device,'SYNTHETIC_PASSWORD');await old.enrollPhone();
 const current=f.make();await current.login('SYNTH001',f.device,'SYNTHETIC_PASSWORD');await current.enrollPhone();const next=f.data.get(f.PHONE),grant=f.grant();
 await assert.rejects(()=>old.logout());assert.equal(f.data.get(f.PHONE),next);assert.equal(f.grant(),grant);
});
