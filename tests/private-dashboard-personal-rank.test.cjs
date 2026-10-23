const test = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const K = require('../kpi-battle-controller.js');
const stamp = {sheet:'上線數KPI_個人達成率_明細',column:'I',source_file:'1023.xlsx',data_as_of_date:'2026-10-22',sha256:'a'.repeat(64)};
function fixture(role='店長') {
  const base=K.kpicalcToKpiBattleView({meta:{sourceFile:'1023.xlsx',month:'2026-10',snapshotDay:22},items:[],stores:[{code:'S1',name:'甲'}],persons:[{store:'S1',pname:'甲*?',role,official:1.25,items:{}}]},'');
  const snapshot={source_file:'1023.xlsx',report_date:'2026-10-22',data_as_of_date:'2026-10-22',personal_rank_semantics:'individual-rank-v1',personal_rank_source:{...stamp},personal:[{store:'甲',name:'甲*［來源缺字］',rank:17,rank_dod:3,overall_rate:9,overall_rate_dod:9}],aggregate:{},stores:[]};
  return {base,snapshot};
}
test('individual rank provenance enables manager rank only, preserving official rate and metric guard',()=>{
  const {base,snapshot}=fixture();const r=K.mergeKpiBattleSupplement(base,snapshot).personal[0];
  assert.equal(r.rank,17);assert.equal(r.rank_dod,3);assert.equal(r.overall_rate,1.25);assert.equal(r.overall_rate_dod,null);
});
test('missing or wrong individual rank provenance never opens manager rank',()=>{
  for(const change of [s=>delete s.personal_rank_semantics,s=>s.personal_rank_semantics='store-rank',s=>s.personal_rank_source.sheet='店績',s=>s.personal_rank_source.sha256='',s=>s.personal_rank_source.source_file='1022.xlsx',s=>s.personal_rank_source.data_as_of_date='2026-10-21']) {
    const {base,snapshot}=fixture();change(snapshot);assert.equal(K.mergeKpiBattleSupplement(base,snapshot).personal[0].rank,null);
  }
});
test('wrong source/date/person and a missing rank stay unavailable',()=>{
  for(const change of [s=>s.source_file='1022.xlsx',s=>s.data_as_of_date='2026-10-21',s=>s.personal[0].name='另一人',s=>s.personal[0].rank=null]) {
    const {base,snapshot}=fixture();change(snapshot);assert.equal(K.mergeKpiBattleSupplement(base,snapshot).personal[0].rank,null);
  }
});
test('existing whole-individual semantics and staff rank remain compatible',()=>{
  for(const role of ['店長','副店長','業代']) {const {base,snapshot}=fixture(role);snapshot.personal_semantics='individual-v1';delete snapshot.personal_rank_semantics;assert.equal(K.mergeKpiBattleSupplement(base,snapshot).personal[0].rank,17);}
});
test('source producer contract tests run without production connections',()=>{
  const out=execFileSync('python3',['-m','unittest','discover','-s','tests','-p','test_personal_rank_contract.py'],{cwd:path.join(__dirname,'..'),encoding:'utf8',stdio:'pipe'});assert.equal(typeof out,'string');
});
