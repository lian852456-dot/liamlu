'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../department-ops.js'),'utf8');
const section=source.slice(source.indexOf('const AUTH_RETRY_STATUSES'),source.indexOf('async function unlockWithPasscode'));
function transport(responses){
  const calls=[];
  const fetch=async(url,options)=>{calls.push({url,options});const next=responses[Math.min(calls.length-1,responses.length-1)];return {ok:!next.httpStatus,status:next.httpStatus||200,json:async()=>next};};
  const timers=(callback,ms)=>{if(ms!==20000)queueMicrotask(callback);return 1;};
  const runtime=new Function('fetch','AbortController','setTimeout','clearTimeout','PATROL_URL',section+'\nreturn {authRequest};')(fetch,AbortController,timers,()=>{},'https://example.test/exec');
  return {calls,...runtime};
}
const plan=mode=>({action:'department_ops_publish',mode,token:'SYNTHETIC_SESSION',operationId:'synthetic-operation-123456',contract:'north12-monthly-write/v2',months:[{monthKey:'2026-08',value:'SYNTHETIC'}]});
test('read-only monthly plans recover transient HTTP and route responses with the same payload and fresh transport IDs',async()=>{
  const expected={status:'ok',result:'preview',planReceipt:'SYNTHETIC_RECEIPT'},t=transport([{httpStatus:404},{status:'error',message:'unknown patrol action'},expected]),payload=plan('plan');
  assert.deepEqual(await t.authRequest(payload),expected);assert.equal(t.calls.length,3);
  const ids=new Set();
  for(const {url,options}of t.calls){const u=new URL(url);assert.equal(u.origin+u.pathname,'https://example.test/exec');assert.deepEqual([...u.searchParams.keys()],['_request']);ids.add(u.searchParams.get('_request'));assert.equal(options.method,'POST');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'follow');assert.equal(options.cache,'no-store');assert.deepEqual(JSON.parse(options.body),payload);assert.ok(!url.includes(payload.token));}
  assert.equal(ids.size,3);
});
test('restore preview may retry because it does not activate a historical version',async()=>{
  const t=transport([{status:'error',message:'unknown patrol action'},{status:'ok',result:'preview'}]);
  assert.equal((await t.authRequest(plan('restore-plan'))).result,'preview');assert.equal(t.calls.length,2);
});
test('commit and restore are each sent once even when a route response or HTTP failure occurs',async()=>{
  for(const mode of ['commit','restore']){
    const error={status:'error',message:'unknown patrol action'},t=transport([error]);
    assert.deepEqual(await t.authRequest(plan(mode)),error);assert.equal(t.calls.length,1);
    const unavailable=transport([{httpStatus:503}]);await assert.rejects(()=>unavailable.authRequest(plan(mode)),/HTTP 503/);assert.equal(unavailable.calls.length,1);
  }
});
test('authorization and revision errors are not treated as transient transport failures',async()=>{
  for(const message of ['unauthorized','GOLD_VERSION_CONFLICT','GOLD_PREVIEW_EXPIRED']){
    const error={status:'error',message},t=transport([error]);assert.deepEqual(await t.authRequest(plan('plan')),error);assert.equal(t.calls.length,1);
  }
});
test('persistent route failure stops after three previews and never sends a commit',async()=>{
  const t=transport([{status:'error',message:'unknown patrol action'}]);
  await assert.rejects(()=>t.authRequest(plan('plan')),/月報差異確認.*3 次/);assert.equal(t.calls.length,3);assert.ok(t.calls.every(c=>JSON.parse(c.options.body).mode==='plan'));
});
