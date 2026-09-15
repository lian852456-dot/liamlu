const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Questions=require('../patrol-question-versions.js'),fixture=require('./fixtures/patrol-ptdashboard-parity.cjs');
const html=fs.readFileSync(require('node:path').join(__dirname,'../patrol.html'),'utf8');
function harness(reply){const calls=[],c=vm.createContext({PatrolQuestionVersions:Questions,STORES:fixture.stores,clearPatrolSummaryCache:()=>calls.push('clear'),cloudCall:async(action,params)=>{calls.push(action);return reply(action,params);}});vm.runInContext(html.slice(html.indexOf('function validatePatrolDashboard('),html.indexOf('function cloudLoad(options={}')),c);return {c,calls};}
function response(){return {status:'ok',contract:'patrol-dashboard-sep25-v1',version:1,month:'2026-09',months:['2026-09'],stores:fixture.stores,storeCount:9,rowCount:fixture.septemberRows.length,sourceRowCount:fixture.septemberRows.length,maxRows:5000,summary:Questions.overview(fixture.septemberRows,fixture.stores,'2026-09')};}
test('complete dashboard uses one request; unknown action alone falls back',async()=>{
 let {c,calls}=harness(()=>response());assert.equal((await c.patrolDashboardOrSummary('2026-09')).dashboard,true);assert.deepEqual(calls,['ptdashboard']);
 ({c,calls}=harness(action=>action==='ptdashboard'?{status:'error',message:'unknown patrol action'}:{status:'ok',summary:{month:'2026-09'}}));await c.patrolDashboardOrSummary('2026-09');assert.deepEqual(calls,['ptdashboard','ptsummary']);
 ({c,calls}=harness(()=>({status:'error',message:'AUTH_TOKEN_INVALID',reason:'AUTH_TOKEN_INVALID'})));await c.patrolDashboardOrSummary('2026-09');assert.deepEqual(calls,['ptdashboard']);
});
test('wrong month, version, stores, row limit, and item contract fail closed and clear cache',()=>{
 for(const mutate of [r=>r.month='2026-10',r=>r.version=2,r=>r.stores=r.stores.slice(1),r=>r.rowCount=5001,r=>r.months.push('2026-10'),r=>r.summary.totalItems=33,r=>r.summary.stores[0].missingItemNumbers.push(26)]){
  const {c,calls}=harness(()=>{}),r=response();r.stores=r.stores.map(s=>({...s}));mutate(r);assert.throws(()=>c.validatePatrolDashboard(r,'2026-09'),/contract/);assert.deepEqual(calls,['clear']);
 }
});
