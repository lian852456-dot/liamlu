'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), crypto = require('node:crypto');
const source = fs.readFileSync(require('node:path').join(__dirname, '../report-save-recovery.js'), 'utf8');
const payload = {action:'write',date:'2099-10-02',store:'隔離門市',seg:16,data:{aq999:2,haosu:0}};
function setup({storage = new Map(), timeoutMs = 20} = {}) {
  const c = {crypto,setTimeout,clearTimeout}; vm.runInNewContext(source,c);
  let revision = '', saved = null, writes = 0, fail = '', context = 0, endpoint = 'synthetic-only';
  const states = [], calls = [];
  const api = c.ReportSaveRecovery.create({timeoutMs,
    storage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    getEndpoint:()=> endpoint,getContext:()=>context,onChange:(p,state)=>states.push(state),
    async post(p) {
      calls.push(p.action);
      if (p.action === 'report_save_status') return {status:'ok',schema:'report-save-v1',revision,commitId:saved?.commitId,committedAt:saved?.committedAt,receipt:saved};
      writes++;
      if (fail === 'pending') return new Promise(()=>{});
      if (fail === 'before') {fail='';throw new Error('offline');}
      assert.equal(p.mutation.baseRevision,revision);
      revision = p.mutation.id;
      saved = {status:'ok',schema:'report-save-v1',rowWritten:true,readbackMatches:true,commitId:p.mutation.id,committedAt:'2099-10-02T07:00:00Z',date:p.date,store:p.store,seg:p.seg,name:p.name||'',readback:p.action==='write'?{...p.data,date:p.date,store:p.store,seg:p.seg}:{...p.record,_report_commit:{id:p.mutation.id}}};
      if (fail === 'lost') {fail='';throw new Error('response lost');}
      if (fail === 'context') context++;
      if (fail === 'endpoint') endpoint = 'different-source';
      return saved;
    },
  });
  return {api,storage,states,calls,get writes(){return writes;},get saved(){return saved;},set fail(v){fail=v;},set revision(v){revision=v;}};
}
test('duplicate clicks share exactly one submission and persisted server proof',async()=>{
  const s=setup();const a=s.api.save(payload,''),b=s.api.save(payload,'');assert.equal(a,b);
  const receipt=await a;assert.equal(s.writes,1);assert.equal(receipt.readback.aq999,2);assert.ok(receipt.commitId);assert.equal(s.storage.size,0);
});
test('lost response is reconciled after reload without another write',async()=>{
  const s=setup();s.fail='lost';await assert.rejects(s.api.save(payload,''),/response lost/);assert.equal(s.storage.size,1);
  const result=await s.api.save(payload,undefined,true);assert.equal(result.commitId,s.saved.commitId);assert.equal(s.writes,1);assert.equal(s.storage.size,0);
});
test('failure before persistence retries the same id and only on explicit request',async()=>{
  const s=setup();s.fail='before';await assert.rejects(s.api.save(payload,''));const id=s.api.pending(payload).id;
  assert.equal(s.writes,1);const result=await s.api.save(payload,undefined,true);assert.equal(result.commitId,id);assert.equal(s.writes,2);
});
test('a hung write has bounded unknown status and cannot replace a newer version',async()=>{
  const s=setup();s.fail='pending';await assert.rejects(s.api.save(payload,''),/尚未確認/);assert.equal(s.writes,1);assert.equal(s.storage.size,1);
  s.revision='newer-remote';await assert.rejects(s.api.save(payload,undefined,true),/雲端已有不同版本/);assert.equal(s.writes,1);
});
test('edited content cannot silently replace an unresolved submission',async()=>{
  const s=setup();s.fail='before';await assert.rejects(s.api.save(payload,''));await assert.rejects(s.api.save({...payload,data:{aq999:9}},''),/上一筆結果尚未確認/);assert.equal(s.writes,1);
});
test('stale loaded draft and changed session both fail closed',async()=>{
  const s=setup();s.revision='newer';await assert.rejects(s.api.save(payload,''),/未覆蓋/);assert.equal(s.writes,0);
  const t=setup();t.fail='context';await assert.rejects(t.api.save(payload,''),/登入或服務已變更/);assert.equal(t.storage.size,1);
});
test('endpoint changes after an attempted write retain the original journal and unknown outcome',async()=>{
 const s=setup();s.fail='endpoint';await assert.rejects(s.api.save(payload,''),/登入或服務已變更/);
 assert.equal(s.storage.size,1);assert.equal(s.states.at(-1),'unconfirmed');assert.equal(s.writes,1);
 assert.ok([...s.storage.keys()][0].includes('synthetic-only'));
});
test('pending journals are isolated by store/date/segment/person and survive module recreation',async()=>{
  const s=setup();s.fail='before';await assert.rejects(s.api.save(payload,''));
  const t=setup({storage:s.storage});assert.equal(t.api.pending(payload).payload.seg,16);
  for(const patch of [{store:'另一店'},{date:'2099-10-03'},{seg:21},{action:'pwrite',name:'合成同仁'}])assert.equal(t.api.pending({...payload,...patch}),null);
});
test('local storage failure prevents a mutation, and legacy backend cannot trigger blind writes',async()=>{
  const c={crypto,setTimeout,clearTimeout};vm.runInNewContext(source,c);let writes=0;
  const storage={getItem:()=>null,setItem(){throw new Error('quota');}};
  const post=async p=>p.action==='report_save_status'?{status:'ok',schema:'report-save-v1',revision:''}:(writes++,{});
  let api=c.ReportSaveRecovery.create({storage,post,getEndpoint:()=>'',getContext:()=>0});
  await assert.rejects(api.save(payload,''),/quota/);assert.equal(writes,0);
  api=c.ReportSaveRecovery.create({storage,post:async()=>({status:'ok'}),getEndpoint:()=>'',getContext:()=>0});
  await assert.rejects(api.save(payload,''),/尚未支援/);assert.equal(writes,0);
});
test('personal receipts must prove the original identity and contents',async()=>{
  const s=setup();const p={action:'pwrite',date:payload.date,store:payload.store,seg:21,name:'合成同仁',record:{date:payload.date,store:payload.store,seg:21,name:'合成同仁',data:{a999:0},ts:123}};
  const r=await s.api.save(p);assert.equal(r.name,p.name);assert.equal(r.readback.ts,123);assert.equal(s.writes,1);
});
