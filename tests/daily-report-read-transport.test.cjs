'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../daily-report-read-transport.js'),'utf8');
function setup(timeoutMs=1000){
 const ctx={AbortController,DOMException,setTimeout,clearTimeout};vm.runInNewContext(source,ctx);
 let context=0,endpoint='formal';const calls=[];
 const api=ctx.DailyReportReadTransport.create({timeoutMs,getContext:()=>context,getEndpoint:()=>endpoint,post:(payload,signal,url)=>new Promise((resolve,reject)=>calls.push({payload,signal,url,resolve,reject}))});
 return {api,calls,context:()=>context++,endpoint:value=>endpoint=value};
}
const read=(date='2099-10-02',seg=16)=>({action:'read',date,seg});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('same formal context coalesces only in flight; independent response copies and no completed cache',async()=>{
 const h=setup(),a=h.api.read(read()),b=h.api.read({seg:16,date:'2099-10-02',action:'read'});await tick();assert.equal(h.calls.length,1);
 h.calls[0].resolve({status:'ok',data:{store:{value:1}}});const [x,y]=await Promise.all([a,b]);x.data.store.value=9;assert.equal(y.data.store.value,1);
 const c=h.api.read(read());await tick();assert.equal(h.calls.length,2);h.calls[1].resolve({status:'ok',data:{}});await c;
});
test('date, segment, action, endpoint and auth context are negative controls for sharing',async()=>{
 const h=setup(),pending=[h.api.read(read()),h.api.read(read('2099-10-03')),h.api.read(read('2099-10-02',21)),h.api.read({...read(),action:'pread'})];
 h.endpoint('other');pending.push(h.api.read(read()));h.context();pending.push(h.api.read(read()));
 const settled=Promise.allSettled(pending);await tick();assert.equal(h.calls.length,6);h.api.invalidate();assert.equal((await settled).every(x=>x.status==='rejected'),true);
});
test('one cancelled consumer cannot cancel another; last cancellation stops and removes entry',async()=>{
 const h=setup(),x=new AbortController(),y=new AbortController(),a=h.api.read(read(),{signal:x.signal}),b=h.api.read(read(),{signal:y.signal});
 const failed=assert.rejects(a,{name:'AbortError'});await tick();x.abort();await failed;assert.equal(h.calls[0].signal.aborted,false);
 h.calls[0].resolve({status:'ok',data:{}});await b;
 const z=new AbortController(),old=h.api.read(read(),{signal:z.signal}),rejected=assert.rejects(old,{name:'AbortError'});await tick();z.abort();await rejected;assert.equal(h.calls[1].signal.aborted,true);
 const fresh=h.api.read(read());await tick();assert.equal(h.calls.length,3);h.calls[1].resolve({status:'ok',data:{stale:true}});h.calls[2].resolve({status:'ok',data:{fresh:true}});assert.equal((await fresh).data.fresh,true);
});
test('timeout includes an unresponsive transport/decoder; no auto retry and late completion cannot resurrect entry',async()=>{
 const h=setup(20),old=h.api.read(read()),rejected=assert.rejects(old,{name:'TimeoutError'});await tick();await rejected;assert.equal(h.calls.length,1);assert.equal(h.calls[0].signal.aborted,true);
 const fresh=h.api.read(read());await tick();h.calls[0].resolve({status:'ok',data:{stale:true}});h.calls[1].resolve({status:'ok',data:{fresh:true}});assert.equal((await fresh).data.fresh,true);
});
test('explicit retry supersedes same-context pending request and its late result',async()=>{
 const h=setup(),old=h.api.read(read()),rejected=assert.rejects(old,{name:'AbortError'});await tick();const fresh=h.api.read(read(),{force:true});await rejected;await tick();assert.equal(h.calls[0].signal.aborted,true);
 h.calls[1].resolve({status:'ok',data:{fresh:true}});assert.equal((await fresh).data.fresh,true);h.calls[0].resolve({status:'ok',data:{stale:true}});
});
test('changed auth or endpoint rejects even if transport ignores cancellation; writes never enter this broker',async()=>{
 for(const change of ['context','endpoint']){const h=setup(),p=h.api.read(read()),rejected=assert.rejects(p,{name:'AbortError'});await tick();h[change]('other');h.calls[0].resolve({status:'ok',data:{}});await rejected;}
 const h=setup();await assert.rejects(h.api.read({action:'write'}));await tick();assert.equal(h.calls.length,0);
});
test('abort before scheduled dispatch never sends a stale request; invalidation is immediate',async()=>{
 const h=setup(),controller=new AbortController(),p=h.api.read(read(),{signal:controller.signal}),rejected=assert.rejects(p,{name:'AbortError'});controller.abort();await rejected;await tick();assert.equal(h.calls.length,0);
 const p2=h.api.read(read()),rejected2=assert.rejects(p2,{name:'AbortError'});await tick();h.api.invalidate();await rejected2;assert.equal(h.calls[0].signal.aborted,true);
});
test('write invalidation is scoped to date/segment; unrelated pending reads survive',async()=>{
 const h=setup(),a=h.api.read(read()),b=h.api.read(read('2099-10-03')),rejected=assert.rejects(a,{name:'AbortError'});await tick();
 h.api.invalidate({date:'2099-10-02',seg:16});await rejected;assert.equal(h.calls[0].signal.aborted,true);assert.equal(h.calls[1].signal.aborted,false);h.calls[1].resolve({status:'ok',data:{}});await b;
});
test('caller payload changes cannot change a dispatched read into a write',async()=>{
 const h=setup(),payload=read(),p=h.api.read(payload);payload.action='write';await tick();assert.equal(h.calls[0].payload.action,'read');h.calls[0].resolve({status:'ok',data:{}});await p;
});
