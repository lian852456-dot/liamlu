'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function worker({offline=false}={}){
 const handlers={},puts=[],matches=[],fetches=[],cached=new Response('OLD_PARSER');
 const scope='https://example.test/liamlu/',url=scope+'tradein-performance-core.js?v=old';
 const context=vm.createContext({URL,Response,Headers,self:{location:{origin:'https://example.test'},registration:{scope},addEventListener:(name,fn)=>handlers[name]=fn},
  fetch:async(request,options)=>{fetches.push({url:request.url,options});if(offline)throw Error('offline');return new Response('NEW_PARSER');},
  caches:{open:async()=>({put:async(request)=>puts.push(request.url)}),match:async(request,options)=>{matches.push({url:request.url,options});return request.url===url?cached:undefined;}}
 });
 vm.runInContext(fs.readFileSync(require.resolve('../service-worker.js'),'utf8'),context);
 return {handlers,puts,matches,fetches,url};
}
async function get(runtime,url=runtime.url){let response;runtime.handlers.fetch({request:{url,method:'GET',mode:'cors'},respondWith:value=>response=value});return await response;}
test('online trade-in assets use deployed code even when the exact URL has an old cache entry',async()=>{
 const r=worker();assert.equal(await (await get(r)).text(),'NEW_PARSER');assert.equal(r.fetches[0].options.cache,'no-store');assert.equal(r.matches.length,0);assert.equal(r.puts.length,1);
});
test('offline fallback only accepts the exact parser version',async()=>{
 const r=worker({offline:true});assert.equal(await (await get(r)).text(),'OLD_PARSER');assert.equal(await get(r,r.url.replace('v=old','v=new')),undefined);assert.equal(r.matches.every(m=>m.options===undefined),true);
});
test('upload parser refresh requests neither use nor populate the persistent cache',async()=>{
 const r=worker();assert.equal(await (await get(r,r.url+'&refresh=1')).text(),'NEW_PARSER');assert.equal(r.puts.length,0);assert.equal(r.matches.length,0);
 const o=worker({offline:true});await assert.rejects(get(o,o.url+'&refresh=1'),/offline/);assert.equal(o.matches.length,0);
});
test('private backend requests are outside the cache worker',()=>{
 const r=worker();let handled=false;r.handlers.fetch({request:{url:'https://script.google.com/macros/s/SYNTHETIC/exec',method:'GET',mode:'cors'},respondWith:()=>handled=true});assert.equal(handled,false);assert.equal(r.fetches.length,0);
});
