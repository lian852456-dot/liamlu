const {test}=require('node:test'),assert=require('node:assert/strict');
const moduleReady=import('../tradein-public-read.mjs');
const endpoint='https://script.google.com/macros/s/SYNTHETIC/exec';
const payload={action:'tradein_performance_public_read',month:'2026-10'};
const response={status:'ok',snapshot:null,availableMonths:[]};
test('a successful frame read makes no additional request',async()=>{
 const {createPublicReader}=await moduleReady;let posts=0;
 const read=createPublicReader({endpoint,frame:async value=>{assert.deepEqual(value,payload);return response;},post:async()=>{posts++;}});
 assert.deepEqual(await read(payload),response);assert.equal(posts,0);
});
test('a transport failure retries exactly once with a fresh URL and anonymous payload',async()=>{
 const {createPublicReader}=await moduleReady;const urls=[];let notices=0;
 const read=createPublicReader({endpoint,frame:async()=>{throw Error('network failure');},post:async(url,value)=>{urls.push(url);assert.deepEqual(value,payload);return response;}});
 for(let i=0;i<2;i++)assert.deepEqual(await read(payload,{onFallback:()=>notices++}),response);
 assert.equal(urls.length,2);assert.equal(notices,2);assert.notEqual(urls[0],urls[1]);
 assert.equal(new URL(urls[0]).searchParams.size,1);
});
test('an authoritative source rejection is never retried',async()=>{
 const {createPublicReader}=await moduleReady;let posts=0;
 const read=createPublicReader({endpoint,frame:async()=>({status:'error',message:'基線待核對'}),post:async()=>posts++});
 await assert.rejects(read(payload),/基線待核對/);assert.equal(posts,0);
});
test('a malformed frame reply uses the fallback but a second invalid reply stops',async()=>{
 const {createPublicReader}=await moduleReady;let posts=0;
 const read=createPublicReader({endpoint,frame:async()=>({status:'ok'}),post:async()=>{posts++;return {};}});
 await assert.rejects(read(payload),/回應格式不符/);assert.equal(posts,1);
});
test('both timeout attempts abort their transport and stop',async()=>{
 const {createPublicReader}=await moduleReady;let attempts=0,aborts=0;
 const hanging=async(_,signal)=>{attempts++;signal.addEventListener('abort',()=>aborts++);return new Promise(()=>{});};
 const read=createPublicReader({endpoint,timeoutMs:10,frame:hanging,post:(_,body,signal)=>hanging(body,signal)});
 await assert.rejects(read(payload),{name:'TimeoutError'});assert.equal(attempts,2);assert.equal(aborts,2);
});
test('a month change cancels the old read without starting a fallback',async()=>{
 const {createPublicReader}=await moduleReady;const controller=new AbortController();let posts=0;
 const read=createPublicReader({endpoint,frame:async()=>{controller.abort();return new Promise(()=>{});},post:async()=>posts++});
 await assert.rejects(read(payload,{signal:controller.signal}),{name:'AbortError'});assert.equal(posts,0);
});
test('cancelling during fallback also stops without another retry',async()=>{
 const {createPublicReader}=await moduleReady;const controller=new AbortController();let posts=0;
 const read=createPublicReader({endpoint,frame:async()=>{throw Error('network');},post:async()=>{posts++;controller.abort();return response;}});
 await assert.rejects(read(payload,{signal:controller.signal}),{name:'AbortError'});assert.equal(posts,1);
});
test('writes and identity-bearing payloads cannot use the anonymous retry transport',async()=>{
 const {createPublicReader}=await moduleReady;
 const read=createPublicReader({endpoint,frame:async()=>assert.fail(),post:async()=>assert.fail()});
 await assert.rejects(read({...payload,action:'tradein_performance_publish'}),/只允許公開/);
 await assert.rejects(read({...payload,employeeId:'SYNTHETIC'}),/只允許公開/);
});
