const test=require('node:test'),assert=require('node:assert/strict');
const Manager=require('../session-read-manager.js');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
function setup(extra={}){let session={identity:'synthetic-A',expiresAt:0};const metrics=[];
 const manager=Manager.create({namespace:'synthetic-domain',getSession:()=>session,onMetric:m=>metrics.push(m),...extra});
 return {manager,metrics,setSession:value=>{session=value;}};
}
const options=fetch=>({fetch,version:r=>r.version});
test('concurrent identical reads share one request; loaded filters reuse memory',async()=>{
 const {manager,metrics}=setup(),gate=deferred();let calls=0;
 const o=options(async()=>{calls++;return gate.promise;});const a=manager.read('monthly',o),b=manager.read('monthly',o);assert.equal(a,b);
 gate.resolve({version:'v1',rows:[1]});const result=await a;assert.equal(calls,1);assert.equal(await manager.read('monthly',o),result);assert.equal(calls,1);
 assert.deepEqual(Object.keys(metrics[0]).sort(),['elapsedMs','namespace','resource','source']);manager.clear();
});
test('each module owns its cache and version even with the same session/resource name',async()=>{
 const a=setup(),b=setup();const x=await a.manager.read('monthly',options(async()=>({version:'v1',rows:['gold']})));
 const y=await b.manager.read('monthly',options(async()=>({version:'v1',rows:['scores']})));assert.notDeepEqual(x,y);a.manager.clear();
 assert.equal(await b.manager.read('monthly',options(()=>assert.fail('unexpected read'))),y);b.manager.clear();
});
test('unchanged requires a fresh, matching server version proof; changed versions replace data',async()=>{
 const {manager}=setup();const original=await manager.read('scores',options(async()=>({version:'v1',rows:[1]})));
 const unchanged=await manager.read('scores',{...options(async({knownVersion})=>{assert.equal(knownVersion,'v1');return {notModified:true,readContract:Manager.CONTRACT,version:'v1'};}),refresh:true});assert.equal(unchanged,original);
 const changed=await manager.read('scores',{...options(async()=>({version:'v2',rows:[2]})),refresh:true});assert.deepEqual(changed.rows,[2]);manager.clear();
});
test('malformed or mismatching no-change responses never expose cached data',async()=>{
 for(const result of [{notModified:true,version:'v1'},{notModified:true,readContract:Manager.CONTRACT,version:'v2'}]){
  const {manager}=setup();await manager.read('scores',options(async()=>({version:'v1'})));
  await assert.rejects(manager.read('scores',{...options(async()=>result),refresh:true}),/版本核對/);
  let known='unset';await manager.read('scores',options(async({knownVersion})=>{known=knownVersion;return {version:'v3'};}));assert.equal(known,undefined);manager.clear();
 }
});
test('identity changes abort the old read and its late success cannot replace new-session data',async()=>{
 const s=setup(),gate=deferred();let oldSignal;
 const old=s.manager.read('scores',options(async({signal})=>{oldSignal=signal;return gate.promise;}));const rejected=assert.rejects(old,{code:'SESSION_READ_CANCELLED'});
 await Promise.resolve();s.setSession({identity:'synthetic-B',expiresAt:0});const next=await s.manager.read('scores',options(async()=>({version:'v1',rows:['B']})));assert.equal(oldSignal.aborted,true);
 gate.resolve({version:'v1',rows:['A']});await rejected;assert.equal(await s.manager.read('scores',options(()=>assert.fail('unexpected'))),next);s.manager.clear();
});
test('logout, revocation and explicit invalidation discard in-flight responses',async()=>{
 for(const invalidate of [s=>s.manager.clear(),s=>s.manager.invalidate('scores'),s=>s.setSession({identity:'',expiresAt:0})]){
  const s=setup(),gate=deferred(),old=s.manager.read('scores',options(()=>gate.promise)),rejected=assert.rejects(old,{code:'SESSION_READ_CANCELLED'});await Promise.resolve();invalidate(s);gate.resolve({version:'v1'});await rejected;s.manager.clear();
 }
});
test('leaving the page cancels a pre-return read while retaining the last verified version for a fresh request',async()=>{
 const {manager}=setup();const saved=await manager.read('scores',options(async()=>({version:'v1',rows:[1]}))),gate=deferred();
 const old=manager.read('scores',{...options(()=>gate.promise),refresh:true}),rejected=assert.rejects(old,{code:'SESSION_READ_CANCELLED'});await Promise.resolve();manager.cancel('scores');
 const fresh=await manager.read('scores',{...options(async({knownVersion})=>{assert.equal(knownVersion,'v1');return {notModified:true,readContract:Manager.CONTRACT,version:'v1'};}),refresh:true});assert.equal(fresh,saved);
 gate.resolve({version:'v1',rows:['stale']});await rejected;assert.equal(await manager.read('scores',options(()=>assert.fail('unexpected'))),saved);manager.clear();
});
test('expired or unauthorized sessions cannot read memory and expiry clears without another UI event',async()=>{
 let expired=0;const s=setup({onExpired:()=>expired++});s.setSession({identity:'synthetic-A',expiresAt:Date.now()+35});
 await s.manager.read('scores',options(async()=>({version:'v1'})));await new Promise(r=>setTimeout(r,60));assert.equal(expired,1);
 assert.throws(()=>s.manager.read('scores',options(()=>assert.fail('unexpected'))),{code:'SESSION_READ_CANCELLED'});s.manager.clear();
 const denied=setup({isAuthorized:()=>false});assert.throws(()=>denied.manager.read('scores',options(()=>assert.fail('unexpected'))),{code:'SESSION_READ_CANCELLED'});denied.manager.clear();
});
test('post-write full read never accepts no-change and read failures never silently reuse stale data',async()=>{
 const {manager}=setup();await manager.read('scores',options(async()=>({version:'v1'})));
 await assert.rejects(manager.read('scores',{...options(async()=>({notModified:true,readContract:Manager.CONTRACT,version:'v1'})),refresh:true,full:true}),/版本核對/);
 await assert.rejects(manager.read('scores',options(async()=>{throw new Error('transport');})),/transport/);
 await assert.rejects(manager.read('scores',options(async()=>({rows:[]}))),/版本識別/);manager.clear();
});
