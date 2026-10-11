const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../GasBClient.js'),'utf8');
const url='https://script.google.com/macros/s/ABCDEFGHIJKLMNOPQRST/exec';

test('same protected action coalesces only in flight and cannot survive logout or a new lease',async()=>{
 const pending=[],actions=[],metrics=[];
 const ctx={crypto:require('node:crypto').webcrypto,AbortController,setTimeout,clearTimeout,Date,
  fetch:async(_,opts)=>{const payload=JSON.parse(opts.body);actions.push(payload.action);
   if(payload.action==='employee_login')return {ok:true,json:async()=>({status:'ok',token:'B1_a_'+'a'.repeat(64),expiresAt:Date.now()+1700000,trustSource:'password-bound'})};
   if(payload.action==='employee_logout')return {ok:true,json:async()=>({status:'ok'})};
   return new Promise(resolve=>pending.push({resolve:()=>resolve({ok:true,json:async()=>({status:'ok',expiresAt:Date.now()+1700000})}),signal:opts.signal}));
  }};
 vm.createContext(ctx);vm.runInContext(source,ctx);
 const client=ctx.createDashboardBClient(url,{onRequest:row=>metrics.push(row)});
 await client.login('SYNTHETIC','synthetic-device','synthetic-password');
 const first=client.read('private'),same=client.read('private'),other=client.read('kpi');
 assert.deepEqual(actions.slice(1),['employee_private_read','employee_kpi_read']);
 pending[0].resolve();pending[1].resolve();await Promise.all([first,same,other]);
 const next=client.read('private');assert.equal(actions.filter(a=>a==='employee_private_read').length,2);
 const denied=assert.rejects(next,/B_CONTEXT_CHANGED/);
 await client.logout();assert.equal(pending[2].signal.aborted,true);pending[2].resolve();await denied;
 await client.login('SYNTHETIC','synthetic-device','synthetic-password');
 const fresh=client.read('private');assert.equal(actions.filter(a=>a==='employee_private_read').length,3);
 pending[3].resolve();await fresh;
 assert.equal(metrics.length,actions.length);
 for(const row of metrics){assert.deepEqual(Object.keys(row).sort(),['action','ms','outcome']);assert.equal(typeof row.ms,'number');}
 assert(!JSON.stringify(metrics).includes('synthetic'));
});
