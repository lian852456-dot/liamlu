const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'private-dashboard-rank-patch.test.cjs'),'utf8');
const make=new Function('require','__dirname',src.slice(0,src.indexOf('for(const count of [40,41])'))+'\nreturn fixture;')(require,__dirname);
const library=import('../scripts/north12b/personal_rank_publish.mjs');
function setup(count=41,awardDate='2026-10-22'){
 const f=make(count,awardDate),candidate=structuredClone(f.snapshot);
 candidate.kpiBattle.personal=candidate.kpiBattle.personal.map((row,i)=>({...row,name:f.patch.personal[i].name,rank:f.patch.personal[i].rank,rank_dod:f.patch.personal[i].rank_dod}));
 candidate.kpiBattle.personal_rank_semantics=f.patch.personal_rank_semantics;candidate.kpiBattle.personal_rank_source=f.patch.personal_rank_source;
 const input={snapshot:f.snapshot,protectedKpi:f.state.protected,candidate,reportRunDate:'2026-10-23',cutoff:'2026-10-22'};
 const readback=async()=>({snapshot:JSON.parse(f.state.text),protectedKpi:structuredClone(f.state.protected)});
 return {...f,candidate,input,readback};
}
for(const count of [40,41])for(const awardDate of ['2026-10-22','2026-10-21'])test(`client and actual server agree on ${count} people and ${awardDate} awards`,async()=>{
 const R=await library,f=setup(count,awardDate),plan=R.prepareRankRepair(f.input);
 assert.equal(plan.payload.expectedKpiPayloadHash,f.ctx.privateDashboardRankHash_(f.snapshot.kpiBattle));
 const result=await R.publishRankOnce({plan,write:async p=>f.ctx.privateDashboardPublishKpiComponent({...p,adminSecret:'SYNTH_ADMIN'}),readback:f.readback});
 assert.equal(result.status,'ok');assert.equal(result.people,count);assert.equal(f.state.writes,1);
});
test('client refuses missing duplicate wrong identity source date and changed grades',async()=>{
 const R=await library;
 for(const change of [f=>f.candidate.kpiBattle.personal.pop(),f=>f.candidate.kpiBattle.personal.push({...f.candidate.kpiBattle.personal[0]}),f=>f.candidate.kpiBattle.personal[0].role='督導',f=>f.candidate.kpiBattle.personal[0].name='另一人',f=>f.candidate.kpiBattle.source_file='1022.xlsx',f=>f.candidate.kpiBattle.data_as_of_date='2026-10-21',f=>f.candidate.kpiBattle.stores[0].overall_kpi=9]){
  const f=setup();change(f);assert.throws(()=>R.prepareRankRepair(f.input));assert.equal(f.state.writes,0);
 }
});
test('client uses existing container run only and rejects conflicting protected run',async()=>{
 const R=await library,f=setup();assert.equal(R.prepareRankRepair(f.input).people,41);
 f.state.protected.meta.processingRunId='DIFFERENT';assert.throws(()=>R.prepareRankRepair(f.input),/RANK_RUN_MISMATCH/);
});
test('lost successful response is reconciled once and never re-sent',async()=>{
 const R=await library,f=setup(),plan=R.prepareRankRepair(f.input);let calls=0;
 const result=await R.publishRankOnce({plan,write:async p=>{calls++;f.ctx.privateDashboardPublishKpiComponent({...p,adminSecret:'SYNTH_ADMIN'});throw Error('RESPONSE_LOST');},readback:f.readback});
 assert.equal(calls,1);assert.equal(f.state.writes,1);assert.equal(result.reconciledAfterUncertainResponse,true);
});
test('unconfirmed failure or failed readback does not retry mutation',async()=>{
 const R=await library;
 for(const missingReadback of [false,true]){const f=setup(),plan=R.prepareRankRepair(f.input);let calls=0;
 await assert.rejects(R.publishRankOnce({plan,write:async()=>{calls++;throw Error('NETWORK');},readback:missingReadback?async()=>{throw Error('READBACK_FAILED');}:f.readback}),/RANK_RESULT_NOT_CONFIRMED|RANK_OUTCOME_UNCERTAIN/);
 assert.equal(calls,1);assert.equal(f.state.writes,0);}
});
test('readback catches changes to protected grades awards metadata and other components',async()=>{
 const R=await library;
 for(const change of [o=>o.protectedKpi.persons[0].official=9,o=>o.snapshot.awardsBattle.payload.money=9,o=>o.snapshot.components.awards.run_id='NEW',o=>o.snapshot.components.kpi.completeness.insurance='wrong',o=>o.snapshot.components.closure.payload='wrong']) {
  const f=setup(),plan=R.prepareRankRepair(f.input);f.ctx.privateDashboardPublishKpiComponent({...plan.payload,adminSecret:'SYNTH_ADMIN'});const observed=await f.readback();change(observed);assert.throws(()=>R.verifyRankReadback(plan,observed));
 }
});
