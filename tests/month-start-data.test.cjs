const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const K = require('../kpi-battle-controller.js');
const A = require('../awards-battle-controller.js');
const Catalog = require('../award-model-catalog.js');

const source = fs.readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
function extract(name) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf('\n  function ', start + 1);
  return source.slice(start, end);
}
const context = { scope:{AwardModelCatalog:Catalog}, Map, C:{moduleState:v=>v},
  STORE_ALIASES:new Map(), STORES:[], moduleSource:(label,href)=>({label,href}), stale:()=>false };
vm.createContext(context);
vm.runInContext(['numberOrNull','normalizeStore','rateFromMetric','adaptAwards','fmtPct','fmtNumber'].map(extract).join('\n'), context);

test('month-start unknown numbers remain distinct from confirmed zero across website and app', () => {
  for (const missing of [null, undefined, '']) {
    assert.equal(K.formatPercent(missing), '尚未有資料');
    assert.equal(K.formatNumber(missing), '尚未有資料');
    assert.equal(K.formatMoney(missing), '尚未有資料');
    assert.equal(context.fmtPct(missing), '尚未有資料');
    assert.equal(context.fmtNumber(missing), '尚未有資料');
    assert.equal(context.rateFromMetric({reportRate:missing}), null);
  }
  assert.equal(K.formatPercent(0), '0.0%');
  assert.equal(K.formatMoney(0), '$0');
  assert.equal(context.rateFromMetric({reportRate:0}), 0);
});

test('partial KPI keeps available rates and never sums a missing store actual as zero', () => {
  const key='AQ V+D 999 (含)以上';
  const data={meta:{month:'2026-10',snapshotDay:1,monthDays:31,sourceFile:'1002.xlsx'},
    items:[{key}], aggregateRates:{[key]:null}, persons:[],
    stores:[{name:'台北甲',items:{[key]:{a:null,t:10,reportRate:null}}},
      {name:'台北乙',items:{[key]:{a:0,t:10,reportRate:0}}}]};
  const view=K.kpicalcToKpiBattleView(data);
  assert.equal(view.stores[0].metrics[key].actual, null);
  assert.equal(view.stores[0].metrics[key].daily_gap, null);
  assert.equal(view.stores[1].metrics[key].actual, 0);
  assert.equal(view.stores[1].metrics[key].rate, 0);
  assert.equal(view.aggregate.metrics[key].actual, null);
  assert.equal(view.aggregate.metrics[key].rate, null);
});

function awardsFixture() {
  const items=Catalog.definitions('2026-10-01').map(row=>({name:row.sourceName,display_name:row.shortName,
    actual:null,target:null,rate:null,difference:null}));
  return {report_date:'2026-10-01',report_run_date:'2026-10-02',data_as_of_date:'2026-10-01',
    processing_run_id:'october-run',phone_items:10,store_rows:10,supervisor:{},
    overall:{items},stores:Array.from({length:9},(_,i)=>({store:`店點${i}`,award:{},items}))};
}

test('partial October awards show canonical models and unknown eligibility without dropping the whole page', () => {
  const awards=awardsFixture();
  assert.equal(A.validateAwardsBattle(awards,{report_date:'2026-10-02',data_as_of_date:'2026-10-01'},
    {processing_run_id:'october-run'}).ok,true);
  const html=A.renderAwardModel(awards.overall.items[0],true);
  assert.match(html,/尚未有資料/);
  assert.doesNotMatch(html,/0\.0%|\$0/);
  const result=context.adaptAwards({kpiBattle:{data_as_of_date:'2026-10-01',processing_run_id:'october-run'},awardsBattle:awards},'2026-10-02','now');
  assert.equal(result.stores.data.length,9);
  assert.equal(result.stores.data[0].amount,null);
  assert.equal(result.stores.data[0].eligible,null);
  assert.equal(result.summary.data.winningStores,null);
});

test('later same-day numbers replace unknowns; mismatched source still fails closed', () => {
  const awards=awardsFixture();
  const snapshot={kpiBattle:{data_as_of_date:'2026-10-01',processing_run_id:'october-run'},awardsBattle:awards};
  awards.stores.forEach(row=>{row.award={actual_total:0,award:'N'};row.items[0]={...row.items[0],actual:0,target:10,rate:0};});
  const result=context.adaptAwards(snapshot,'2026-10-02','now');
  assert.equal(result.stores.data[0].amount,0);
  assert.equal(result.stores.data[0].eligible,false);
  assert.equal(result.summary.data.winningStores,0);
  assert.equal(context.adaptAwards(snapshot,'2026-10-03','now').summary.status,'no_data');
  assert.equal(A.validateAwardsBattle({...awards,data_as_of_date:'2026-09-30'},
    {report_date:'2026-10-02',data_as_of_date:'2026-10-01'},snapshot.kpiBattle).ok,false);
});
