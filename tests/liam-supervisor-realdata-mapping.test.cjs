const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function body(name) {
  const start = code.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const brace = code.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < code.length; index += 1) {
    if (code[index] === '{') depth += 1;
    if (code[index] === '}') depth -= 1;
    if (depth === 0) return code.slice(brace + 1, index);
  }
  throw new Error(`unterminated ${name}`);
}

function loadAdapters() {
  const names = ['numberOrNull','normalizeStore','kpiDataAsOfDate','sourceFileName','kpiSupplementIsCurrent','officialKpiRate','kpicalcMetricItems','adaptKpi','adaptAwards','personalRecord','adaptPersonalPerformance','adaptReport'];
  const script = `
    const STORE_ALIASES = new Map([['三創','台北三創']]);
    const STORES = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
    const KPI_CORE_KEYS = { A999:'AQ V+D 999 (含)以上', A1399:'AQ V+D 1399 (含)以上', '好速':'好速案銷售點數', R999:'RT V+D 999 (含)以上', R1399:'RT V+D 1399 (含)以上', RT:'RT上線點數' };
    const FAILURE_LABELS = { a999:'A999', a1399:'A1399', haosu:'好速', achieve:'R999', r1399:'R1399', insurance:'保險搭售率' };
    const C = { moduleState: value => ({ ...value, sourceLink:value.source.href }) };
    const moduleSource = (label,href) => ({label,href});
    const stale = () => false;
    ${names.map(name=>`function ${name}(${({numberOrNull:'value',normalizeStore:'value',kpiDataAsOfDate:'data',sourceFileName:'value',kpiSupplementIsCurrent:'data, supplement',officialKpiRate:'entry',kpicalcMetricItems:'data, rates',adaptKpi:'data, snapshot, readAt',adaptAwards:'snapshot, expectedReportDate, readAt',personalRecord:'raw',adaptPersonalPerformance:'snapshot, readAt',adaptReport:'segment, storeData, personalData, formalSummary'})[name]}) {${body(name)}}`).join('\n')}
    module.exports = { adaptKpi, adaptAwards, personalRecord, adaptPersonalPerformance, adaptReport };
  `;
  const context = vm.createContext({ module:{exports:{}}, exports:{}, Map, Set, Object, Array, String, Number, Boolean, Math, Date, JSON });
  vm.runInContext(script, context);
  return context.module.exports;
}

function kpiFixture() {
  const core = ['AQ V+D 999 (含)以上','AQ V+D 1399 (含)以上','好速案銷售點數','RT V+D 999 (含)以上','RT V+D 1399 (含)以上','RT上線點數'];
  const items = Array.from({length:25}, (_,index)=>({ key:core[index] || `KPI-${index+1}`, displayName:core[index] || `正式 KPI ${index+1}`, category:index<6?'主力 KPI':'其他 KPI', order:index }));
  const aggregateRates = Object.fromEntries(items.map((item,index)=>[item.key, Number((0.71 + index * .01).toFixed(2))]));
  const stores = Array.from({length:9}, (_,storeIndex)=>({
    name:['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'][storeIndex],
    official:Number((.9 + storeIndex * .01).toFixed(2)),
    items:Object.fromEntries(items.map((item,index)=>[item.key,{ reportRate:Number((.61 + storeIndex*.01 + index*.001).toFixed(3)), a:999999, t:1 }]))
  }));
  return { meta:{month:'2026-08',snapshotDay:9,sourceFile:'0809.xlsx'}, items, aggregateRates, stores };
}

function snapshotFixture() {
  const names = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
  return { kpiBattle:{ report_date:'2026-08-10',data_as_of_date:'2026-08-09',source_file:'0809.xlsx',generated_at:'2026-08-10T01:00:00+08:00',company_rank_total:578,
    aggregate:{overall_kpi:1.131,company_rank:29,overall_kpi_dod:.028,company_rank_dod:1,addon_score:12.98},
    stores:names.map((store,index)=>({store,company_rank:30+index,overall_kpi_dod:.01,company_rank_dod:1,addon_score:10-index}))
  }};
}

test('KPI adapter uses all 25 official reportRate fields without calculating from actual/target', () => {
  const A = loadAdapters();
  const data = kpiFixture();
  const result = A.adaptKpi(data, snapshotFixture(), '2026-08-10T01:02:00+08:00');
  assert.equal(result.summary.status, 'ok');
  assert.equal(result.full.data.region.length, 25);
  assert.equal(result.stores.data.length, 9);
  assert.equal(result.stores.data.every(store=>store.fullKpis.length===25), true);
  assert.equal(result.full.data.region[0].rate, data.aggregateRates[data.items[0].key]);
  assert.equal(result.stores.data[0].fullKpis[0].rate, data.stores[0].items[data.items[0].key].reportRate);
  assert.notEqual(result.stores.data[0].fullKpis[0].rate, 999999);
});

test('KPI supplement mismatch fails closed instead of mixing rank and DOD', () => {
  const A = loadAdapters();
  const snapshot = snapshotFixture();
  snapshot.kpiBattle.source_file = 'wrong.xlsx';
  const result = A.adaptKpi(kpiFixture(), snapshot, '2026-08-10T01:02:00+08:00');
  assert.equal(result.summary.status, 'partial');
  assert.equal(result.summary.data.companyRank, null);
  assert.equal(result.summary.data.reportDate, '');
  assert.match(result.summary.note, /fail-closed/);
});

test('Awards preserve each store own complete row.items and reject aggregate actual_total as a district currency total', () => {
  const A = loadAdapters();
  const storeItems = Array.from({length:13},(_,index)=>({
    display_name:`店 1 指定機款 ${index+1}`, actual:index, target:index+2, rate:index/12,
    difference:index-6, threshold_target:index+1, store_reward_50:1000+index, store_reward_100:2000+index,
    award:index===0?'Y':''
  }));
  const snapshot = { awardsBattle:{ report_date:'2026-08-10',generated_at:'2026-08-10T01:00:00+08:00',overall:{award:{actual_total:9000},items:[
    {display_name:'機款 A',district_reward_100:3000,rate:.8},{display_name:'機款 B',district_reward_100:7000,rate:.9},{display_name:'機款 C',district_reward_100:5000,rate:1}
  ]},stores:Array.from({length:9},(_,index)=>({store:`店 ${index+1}`,award:{actual_total:index,award:index<3?'Y':'N'},items:index===0?storeItems:[{display_name:`店 ${index+1} 唯一機款`}]})) } };
  const pass = A.adaptAwards(snapshot, '2026-08-10', '2026-08-10T01:02:00+08:00');
  assert.equal(pass.summary.status, 'ok');
  assert.equal(pass.summary.data.totalAmount, null);
  assert.equal(pass.summary.data.regionTotalAvailable, false);
  assert.match(pass.summary.note, /不顯示 aggregate actual_total/);
  assert.equal(pass.stores.data.length, 9);
  assert.equal(pass.stores.data[0].items.length, 13);
  assert.deepEqual(JSON.parse(JSON.stringify(pass.stores.data[0].items[0])), {
    name:'店 1 指定機款 1', actual:0, target:2, rate:0, difference:-6, thresholdTarget:1,
    reward50:1000, reward100:2000, status:'Y'
  });
  assert.equal(pass.stores.data[1].items[0].name, '店 2 唯一機款');
  assert.ok(!pass.stores.data[1].items.some(item=>item.name.startsWith('店 1 ')));
  assert.deepEqual(Array.from(pass.top2.data, row=>row.name), ['機款 B','機款 C']);
  const blocked = A.adaptAwards(snapshot, '2026-08-09', '2026-08-10T01:02:00+08:00');
  assert.equal(blocked.summary.status, 'no_data');
  assert.match(blocked.summary.note, /不一致/);
});

test('Daily report failure codes are labels from the formal result, not re-evaluated thresholds', () => {
  const A = loadAdapters();
  const person = A.personalRecord({failed:['a999','haosu','insurance'],data:{a999:0,haosu:0},extra:{fail_reason:'正式原因'}});
  assert.deepEqual(Array.from(person.failed), ['A999','好速','保險搭售率']);
  assert.equal(person.reason, '正式原因');
  assert.equal(person.status, 'fail');
});

test('Daily report adapter passes through the formal summary and never recalculates from store rows', () => {
  const A = loadAdapters();
  const formalSummary = {
    semantics:'formal-index-summary-v1', completedStores:8, totalStores:9, missingStores:['萬大'], updatedAt:'17:17:33',
    metrics:{
      A999:{value:2,unit:'count',sourceField:'aq999',aggregation:'sum'},
      '好速':{value:2,unit:'points',sourceField:'haosu',aggregation:'sum'},
      R1399:{value:5,unit:'count',sourceField:'rt1399',aggregation:'sum'},
      R999:{value:11,unit:'count',sourceField:'rt999',aggregation:'sum'},
      '保險搭售率':{value:64.6,unit:'percent',sourceField:'insurance_pct',aggregation:'average'},
      '設備案佔比':{value:59,unit:'percent',sourceField:'device_ratio',aggregation:'average'}
    },
    stores:[{name:'通化',reported:true,reportedAt:'17:17:33',metrics:{A999:{value:1},'保險搭售率':{value:62.5}}}]
  };
  const result = A.adaptReport(16, { 通化:{ aq999:999, insurance_pct:999, savedAt:'01:00' } }, {}, formalSummary);
  assert.equal(result.summaryAvailable, true);
  assert.equal(result.completedStores, 8);
  assert.deepEqual(Array.from(result.missingStores), ['萬大']);
  assert.equal(result.updatedAt, '17:17:33');
  assert.equal(result.summaryMetrics.A999.value, 2);
  assert.equal(result.summaryMetrics['保險搭售率'].value, 64.6);
  assert.equal(result.stores.find(store=>store.name==='通化').metrics.A999, 1);
  assert.notEqual(result.summaryMetrics.A999.value, 999);
  const blocked = A.adaptReport(16, { 通化:{ aq999:999 } }, {}, null);
  assert.equal(blocked.summaryAvailable, false);
  assert.deepEqual(Object.keys(blocked.summaryMetrics), []);
});

test('Personal performance adapter maps only formal person fields and fails closed for attention and 25 KPI', () => {
  const A = loadAdapters();
  const metrics = Object.fromEntries(['AQ','A999','A1399','RT','R999','R1399','好速','特維','配件','包膜'].map((key,index)=>[key,{rate:1.1-index*.01,actual:index+1,target:index+2,daily_target:1,daily_gap:0,dod:.01}]));
  const snapshot = { publishedAt:'2026-08-11T09:54:24+08:00', kpiBattle:{ report_date:'2026-08-11',source_as_of_date:'2026-08-10',generated_at:'2026-08-11T09:54:24+08:00',personal:[
    {name:'測試同仁',store:'酒泉',role:'店長',category:'店長',overall_rate:.912,rank:7,overall_rate_dod:-.015,rank_dod:-2,metrics}
  ] } };
  const result = A.adaptPersonalPerformance(snapshot, '2026-08-11T10:00:00+08:00');
  assert.equal(result.status, 'ok');
  assert.equal(result.data.summary.total, 1);
  assert.equal(result.data.summary.achieved, 0);
  assert.equal(result.data.summary.underTarget, 1);
  assert.equal(result.data.summary.attention, null);
  assert.equal(result.data.summary.attentionAvailable, false);
  assert.equal(result.data.people[0].metrics.length, 10);
  assert.equal(result.data.people[0].totalRate, .912);
  assert.equal(result.data.people[0].metrics.find(metric=>metric.key==='A1399').rate, 1.08);
  assert.match(result.note, /未提供個人 25 項/);
});
