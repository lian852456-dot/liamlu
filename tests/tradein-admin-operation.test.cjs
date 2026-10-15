'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const load=()=>import('../tradein-admin-operation.mjs');
test('pending work times out, aborts transport, and runs only once',async()=>{
 const {boundedOperation}=await load();let calls=0,attempt;
 await assert.rejects(boundedOperation(signal=>{calls++;attempt=signal;return new Promise(()=>{});},{timeoutMs:15,timeoutMessage:'SYNTHETIC timeout'}),error=>error.name==='TimeoutError'&&error.message==='SYNTHETIC timeout');
 assert.equal(calls,1);assert.equal(attempt.aborted,true);
});
test('external cancellation settles even when the transport ignores its signal',async()=>{
 const {boundedOperation}=await load(),controller=new AbortController();let calls=0;
 const pending=boundedOperation(()=>{calls++;return new Promise(()=>{});},{signal:controller.signal,timeoutMs:1000});
 await Promise.resolve();controller.abort();await assert.rejects(pending,{name:'AbortError'});assert.equal(calls,1);
});
test('already cancelled operation never starts work',async()=>{
 const {boundedOperation}=await load(),controller=new AbortController();controller.abort();let calls=0;
 await assert.rejects(boundedOperation(()=>{calls++;},{signal:controller.signal}),{name:'AbortError'});assert.equal(calls,0);
});
test('completed work clears the slow hint and timeout',async()=>{
 const {boundedOperation}=await load();let hints=0;
 assert.equal(await boundedOperation(()=>7,{timeoutMs:20,slowMs:5,onSlow:()=>hints++}),7);
 await new Promise(resolve=>setTimeout(resolve,25));assert.equal(hints,0);
});
test('the response body is included in the same deadline and a late reply cannot settle twice',async()=>{
 const {boundedOperation}=await load();let release,hints=0;
 const result=boundedOperation(async()=>{await new Promise(resolve=>release=resolve);return 'SYNTHETIC late';},{timeoutMs:20,slowMs:5,onSlow:()=>hints++});
 await assert.rejects(result,{name:'TimeoutError'});release();await Promise.resolve();assert.equal(hints,1);
});
test('an authoritative error is preserved without retrying',async()=>{
 const {boundedOperation}=await load(),error=new Error('SYNTHETIC rejected');let calls=0;
 await assert.rejects(boundedOperation(()=>{calls++;throw error;}),value=>value===error);assert.equal(calls,1);
});
