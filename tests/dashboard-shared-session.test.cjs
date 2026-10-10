const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('path').join(__dirname,'..','GasBClient.js'),'utf8');
const saved=new Map(),storage={getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)};
const url='https://script.google.com/macros/s/ABCDEFGHIJKLMNOPQRST/exec';
let revoked=false,epoch='',posts=[]; const expiry=Date.now()+1700000;
const context={crypto:require('crypto').webcrypto,AbortController,setTimeout,clearTimeout,Date,fetch:async(_,opts)=>{
 const p=JSON.parse(opts.body);posts.push(p);
 return {ok:true,json:async()=>p.action==='employee_login'?{status:'ok',token:'B1_a_'+'a'.repeat(64),expiresAt:expiry,trustSource:'password-bound'}:p.action==='employee_logout'?(revoked=true,{status:'ok'}):revoked?{status:'error'}:{status:'ok',expiresAt:expiry}};
}};vm.createContext(context);vm.runInContext(source,context);
const make=()=>context.createDashboardBClient(url,{storage,logoutEpoch:()=>epoch});
require('node:test')('same-tab proof preserves expiry and obeys logout, revocation and device boundaries',async()=>{
 let a=make();await a.login('SYNTHETIC','device','synthetic-password');
 assert(![...saved.values()].join('').includes('synthetic-password'));
 a.suspend();let b=make();assert.equal(b.restore('device').expiresAt,expiry);await b.validate();assert.equal(posts.filter(p=>p.action==='employee_login').length,1);
 b.suspend();await b.logout();assert.equal(saved.size,0);assert.equal(make().restore('device'),null);
 revoked=false;a=make();await a.login('SYNTHETIC','device','synthetic-password');a.suspend();epoch='logout-event';assert.equal(make().restore('device'),null);assert.equal(saved.size,0);
 a=make();await a.login('SYNTHETIC','device','synthetic-password');a.suspend();b=make();b.restore('device');revoked=true;await assert.rejects(()=>b.validate());assert.equal(saved.size,0);
 revoked=false;a=make();await a.login('SYNTHETIC','device','synthetic-password');a.suspend();assert.equal(make().restore('another-device'),null);
 revoked=false;a=make();await a.login('SYNTHETIC','device','synthetic-password');a.suspend();const expired=JSON.parse([...saved.values()][0]);expired.expiresAt=Date.now()-1;storage.setItem('north12b_password_session_v1',JSON.stringify(expired));assert.equal(make().restore('device'),null);
 console.log('PASS: same-tab restore without new login/expiry renewal; no password storage; logout removal; missed logout denial; server revocation clears proof; device mismatch denial');
});
