const {test}=require('node:test'),assert=require('node:assert/strict');
const ready=import('../tradein-admin-operation.mjs');
const endpoint='https://script.google.com/macros/s/SYNTHETIC/exec';
const preview={action:'tradein_performance_preview',employeeId:'SYNTHETIC',adminSecret:'SYNTHETIC_SECRET',source:{}};
const ok={status:'ok',snapshot:{summary:{total_units:103}}};
const response=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>{if(body===undefined)throw Error('HTML error page');return body;}});

for(const status of [404,429,500,502,503,504])test('preview recovers once from HTTP '+status+' with unchanged payload and a fresh URL',async()=>{
 const {requestAdmin}=await ready,calls=[],notices=[];
 const result=await requestAdmin(endpoint,preview,{retryDelayMs:0,onRetry:s=>notices.push(s),fetcher:async(url,options)=>{
  calls.push({url,options});return calls.length===1?response(status):response(200,ok);
 }});
 assert.deepEqual(result,ok);assert.equal(calls.length,2);assert.notEqual(calls[0].url,calls[1].url);
 for(const call of calls){assert.equal(new URL(call.url).searchParams.size,1);assert.equal(call.url.includes(preview.adminSecret),false);assert.equal(call.options.credentials,'omit');assert.equal(call.options.cache,'no-store');assert.deepEqual(JSON.parse(call.options.body),preview);}
 assert.deepEqual(notices,[status]);
});
test('persistent 404 stops after two attempts',async()=>{
 const {requestAdmin}=await ready;let calls=0;
 await assert.rejects(requestAdmin(endpoint,preview,{retryDelayMs:0,fetcher:async()=>{calls++;return response(404);}}),/HTTP 404/);
 assert.equal(calls,2);
});
for(const status of [200,404])test('authoritative rejection never retries, including HTTP '+status,async()=>{
 const {requestAdmin}=await ready;let calls=0;
 await assert.rejects(requestAdmin(endpoint,preview,{retryDelayMs:0,fetcher:async()=>{calls++;return response(status,{status:'error',message:'SYNTHETIC_AUTH_DENIED'});}}),/SYNTHETIC_AUTH_DENIED/);
 assert.equal(calls,1);
});
for(const action of ['tradein_performance_publish','tradein_performance_public_publish','tradein_performance_checkpoint_capture','tradein_performance_checkpoint_restore','unknown_write'])test(action+' is never replayed after HTTP 404',async()=>{
 const {requestAdmin}=await ready;let calls=0;
 await assert.rejects(requestAdmin(endpoint,{...preview,action},{retryDelayMs:0,fetcher:async()=>{calls++;return response(404);}}),/HTTP 404/);
 assert.equal(calls,1);
});
test('abort during recovery cancels without a second request',async()=>{
 const {requestAdmin}=await ready,controller=new AbortController();let calls=0;
 await assert.rejects(requestAdmin(endpoint,preview,{signal:controller.signal,onRetry:()=>controller.abort(),fetcher:async()=>{calls++;return response(404);}}),{name:'AbortError'});
 assert.equal(calls,1);
});
test('the original deadline includes recovery and never starts a late request',async()=>{
 const {requestAdmin}=await ready;let calls=0;
 await assert.rejects(requestAdmin(endpoint,preview,{timeoutMs:10,retryDelayMs:1000,fetcher:async()=>{calls++;return response(404);}}),{name:'TimeoutError'});
 assert.equal(calls,1);
});
test('network exceptions and malformed successes stop without replay',async()=>{
 const {requestAdmin}=await ready;
 for(const fetcher of [async()=>{throw Error('SYNTHETIC_NETWORK');},async()=>response(200)]){
  let calls=0;await assert.rejects(requestAdmin(endpoint,preview,{fetcher:async(...args)=>{calls++;return fetcher(...args);}}));assert.equal(calls,1);
 }
});
