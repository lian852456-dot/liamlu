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
  const names = ['numberOrNull','normalizeStore','kpiDataAsOfDate','sourceFileName','kpiReportSourceFile','kpiSupplementIsCurrent','officialKpiRate','kpicalcMetricItems','adaptKpi','adaptAwards','personalRecord','personalRoleGroup','personalMetricByKey','personalRankedByRole','managerStorePerformanceRows','personalStoreViewRows','personalUnderTargetByMetric','personalAqReview','adaptPersonalPerformance','reportStoreFeedback','adaptReport'];
  const script = `
    const STORE_ALIASES = new Map([['三創','台北三創']]);
    const STORES = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
    const KPI_CORE_KEYS = { A999:'AQ V+D 999 (含)以上', A1399:'AQ V+D 1399 (含)以上', '好速':'好速案銷售點數', R999:'RT V+D 999 (含)以上', R1399:'RT V+D 1399 (含)以上', RT:'RT上線點數' };
    const FAILURE_LABELS = { a999:'A999', a1399:'A1399', haosu:'好速', achieve:'R999', r1399:'R1399', insurance:'保險搭售率' };
    const C = { moduleState: value => ({ ...value, sourceLink:value.source.href }) };
    const moduleSource = (label,href) => ({label,href});
    const stale = () => false;
    ${names.map(name=>`function ${name}(${({numberOrNull:'value',normalizeStore:'value',kpiDataAsOfDate:'data',sourceFileName:'value',kpiReportSourceFile:'reportDate',kpiSupplementIsCurrent:'data, supplement',officialKpiRate:'entry',kpicalcMetricItems:'data, rates',adaptKpi:'data, snapshot, readAt',adaptAwards:'snapshot, expectedReportDate, readAt',personalRecord:'raw',personalRoleGroup:'source',personalMetricByKey:'person,key',personalRankedByRole:'people,roleGroup',managerStorePerformanceRows:'people,stores',personalStoreViewRows:'people,stores,selectedStore',personalUnderTargetByMetric:'people,key',personalAqReview:'people',adaptPersonalPerformance:'snapshot, readAt',reportStoreFeedback:'report, summaryStore',adaptReport:'segment, storeData, personalData, formalSummary'})[name]}) {${body(name)}}`).join('\n')}
    module.exports = { adaptKpi, adaptAwards, personalRecord, personalRoleGroup, personalMetricByKey, personalRankedByRole, managerStorePerformanceRows, personalStoreViewRows, personalUnderTargetByMetric, personalAqReview, adaptPersonalPerformance, reportStoreFeedback, adaptReport };
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
  return { meta:{month:'2026-08',snapshotDay:9,sourceFile:'0810.xlsx'}, items, aggregateRates, stores };
}

function snapshotFixture() {
  const names = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
  return { kpiBattle:{ report_date:'2026-08-10',data_as_of_date:'2026-08-09',source_file:'0810.xlsx',generated_at:'2026-08-10T01:00:00+08:00',company_rank_total:578,
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

test('受控 temporary filename 只解包 canonical source identity，變更暫存 token 不影響 KPI/Award', () => {
  const A = loadAdapters();
  for (const token of ['a'.repeat(32), 'b'.repeat(64)]) {
    const data = kpiFixture();
    data.meta.sourceFile = `report-upload-temp-${token}-0810.xlsx`;
    const snapshot = snapshotFixture();
    snapshot.awardsBattle = {
      report_date:'2026-08-10', overall:{award:{},items:[]},
      stores:Array.from({length:9},(_,index)=>({store:`店 ${index+1}`,award:{actual_total:index,award:index<3?'Y':'N'},items:[]})),
    };
    const result = A.adaptKpi(data, snapshot, '2026-08-10T01:02:00+08:00');
    assert.equal(result.summary.status, 'ok');
    assert.equal(result.summary.data.reportDate, '2026-08-10');
    assert.equal(result.summary.data.companyRank, 29);
    assert.equal(A.adaptAwards(snapshot, result.summary.data.reportDate, '2026-08-10T01:02:00+08:00').summary.status, 'ok');
    assert.equal(A.adaptAwards(snapshot, '2026-08-09', '2026-08-10T01:02:00+08:00').summary.status, 'no_data');
  }
});

test('真正 canonical source/report date 不一致時仍 fail-closed', () => {
  const A = loadAdapters();
  const data = kpiFixture();
  data.meta.sourceFile = `report-upload-temp-${'a'.repeat(32)}-0810.xlsx`;
  const wrongCanonical = snapshotFixture();
  wrongCanonical.kpiBattle.source_file = '0809.xlsx';
  assert.equal(A.adaptKpi(data, wrongCanonical, '2026-08-10T01:02:00+08:00').summary.status, 'partial');
  const wrongReportDate = snapshotFixture();
  wrongReportDate.kpiBattle.report_date = '2026-08-09';
  assert.equal(A.adaptKpi(data, wrongReportDate, '2026-08-10T01:02:00+08:00').summary.status, 'partial');
  const unknownTemporary = snapshotFixture();
  data.meta.sourceFile = 'report-upload-temp-token-0810.xlsx';
  assert.equal(A.adaptKpi(data, unknownTemporary, '2026-08-10T01:02:00+08:00').summary.status, 'partial');
});

test('Awards preserve each store own complete row.items and reject aggregate actual_total as a district currency total', () => {
  const A = loadAdapters();
  const storeItems = Array.from({length:13},(_,index)=>({
    display_name:`店 1 指定機款 ${index+1}`, actual:index, target:index+2, rate:index/12,
    difference:index-6, threshold_target:index+1, store_reward_50:1000+index, store_reward_100:2000+index,
    award:index===0?'Y':''
  }));
  const snapshot = { awardsBattle:{ report_date:'2026-08-10',generated_at:'2026-08-10T01:00:00+08:00',supervisor:{actual_total:9234,rank:21,award:'Y'},overall:{award:{actual_total:9000},items:[
    {display_name:'機款 A',district_reward_100:3000,rate:.8},{display_name:'機款 B',district_reward_100:7000,rate:.9},{display_name:'機款 C',district_reward_100:5000,rate:1}
  ]},stores:Array.from({length:9},(_,index)=>({store:`店 ${index+1}`,award:{actual_total:index,award:index<3?'Y':'N'},items:index===0?storeItems:[{display_name:`店 ${index+1} 唯一機款`}]})) } };
  const pass = A.adaptAwards(snapshot, '2026-08-10', '2026-08-10T01:02:00+08:00');
  assert.equal(pass.summary.status, 'ok');
  assert.equal(pass.summary.data.totalAmount, null);
  assert.equal(pass.summary.data.regionTotalAvailable, false);
  assert.equal(pass.summary.data.areaActualAward, 9234);
  assert.equal(pass.summary.data.areaCompanyRank, 21);
  assert.equal(pass.summary.data.areaEligible, true);
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
  snapshot.awardsBattle.supervisor.award='N';
  assert.equal(A.adaptAwards(snapshot, '2026-08-10', '2026-08-10T01:02:00+08:00').summary.data.areaEligible, false);
  snapshot.awardsBattle.supervisor={};
  const missingSupervisor=A.adaptAwards(snapshot, '2026-08-10', '2026-08-10T01:02:00+08:00').summary.data;
  assert.equal(missingSupervisor.areaActualAward, null);
  assert.equal(missingSupervisor.areaCompanyRank, null);
  assert.equal(missingSupervisor.areaEligible, null);
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

test('Daily report adapter preserves each segment formal store feedback verbatim and prefers a canonical summary field when present', () => {
  const A = loadAdapters();
  const formalSummary = {
    semantics:'formal-index-summary-v1',completedStores:1,totalStores:9,missingStores:[],updatedAt:'21:33',metrics:{},
    stores:[{name:'通化',reported:true,reportedAt:'21:33',metrics:{}}]
  };
  const raw = {
    通化:{
      zero_reason:'原文 <零報>\n第二行',zero_consult:'酒泉／李XX',zero_method:'改善做法原文',zero_plan:'明日計劃原文'
    }
  };
  const report21 = A.adaptReport(21,raw,{},formalSummary);
  assert.deepEqual(JSON.parse(JSON.stringify(report21.stores.find(store=>store.name==='通化').storeFeedback)),{
    reason:'原文 <零報>\n第二行',consult:'酒泉／李XX',method:'改善做法原文',plan:'明日計劃原文'
  });
  const report16 = A.adaptReport(16,{}, {}, formalSummary);
  assert.deepEqual(JSON.parse(JSON.stringify(report16.stores.find(store=>store.name==='通化').storeFeedback)),{
    reason:'',consult:'',method:'',plan:''
  });
  assert.deepEqual(JSON.parse(JSON.stringify(A.reportStoreFeedback(raw.通化,{storeFeedback:{reason:'canonical reason',consult:'canonical consult',method:'canonical method',plan:'canonical plan'}}))),{
    reason:'canonical reason',consult:'canonical consult',method:'canonical method',plan:'canonical plan'
  });
});

test('Personal performance adapter maps formal fields and derives AQ attention only from manager AQ actual', () => {
  const A = loadAdapters();
  const metrics = Object.fromEntries(['AQ','A999','A1399','RT','R999','R1399','好速','特維','配件','包膜'].map((key,index)=>[key,{rate:1.1-index*.01,actual:index+1,target:index+2,daily_target:1,daily_gap:0,dod:.01}]));
  const snapshot = { publishedAt:'2026-08-11T09:54:24+08:00', kpiBattle:{ report_date:'2026-08-11',source_as_of_date:'2026-08-10',generated_at:'2026-08-11T09:54:24+08:00',personal:[
    {name:'測試同仁',store:'酒泉',role:'店長',category:'店長',overall_rate:.912,rank:7,overall_rate_dod:-.015,rank_dod:-2,metrics}
  ] } };
  const result = A.adaptPersonalPerformance(snapshot, '2026-08-11T10:00:00+08:00');
  assert.equal(result.status, 'ok');
  assert.equal(result.data.summary.total, 1);
  assert.equal(result.data.summary.achieved, 0);
  assert.equal(result.data.summary.underTarget, 0);
  assert.equal(result.data.summary.aqAttentionCount, 1);
  assert.equal(result.data.summary.aqMissingCount, 0);
  assert.equal(result.data.people[0].roleGroup, '店長');
  assert.equal(result.data.people[0].metrics.length, 10);
  assert.equal(result.data.people[0].totalRate, .912);
  assert.equal(result.data.people[0].metrics.find(metric=>metric.key==='A1399').rate, 1.08);
  assert.match(result.note, /不修改正式總績效/);
  assert.match(result.note, /未提供個人 25 項/);
});

test('Personal performance area groups by formal category or role without guessing from name or store', () => {
  const A=loadAdapters();
  assert.equal(A.personalRoleGroup({category:'店長',role:'業務代表(I)'}),'店長');
  assert.equal(A.personalRoleGroup({category:'副店',role:'店長'}),'副店');
  assert.equal(A.personalRoleGroup({category:'業代',role:'副店長'}),'其他業代');
  assert.equal(A.personalRoleGroup({role:'代理店長'}),'店長');
  assert.equal(A.personalRoleGroup({role:'副店長'}),'副店');
  assert.equal(A.personalRoleGroup({name:'店長字樣',store:'店長門市',role:'銷售人員'}),'其他業代');
});

test('Personal performance role ranking uses formal rank ascending with null last', () => {
  const A=loadAdapters();
  const people=[
    {name:'甲',roleGroup:'副店',rank:45},{name:'乙',roleGroup:'副店',rank:null},{name:'丙',roleGroup:'副店',rank:12},{name:'丁',roleGroup:'副店',rank:31},{name:'戊',roleGroup:'店長',rank:1}
  ];
  assert.deepEqual(Array.from(A.personalRankedByRole(people,'副店'),person=>person.name),['丙','丁','甲','乙']);
});

test('Manager performance joins formal store KPI and sorts by store company rank, never personal rank', () => {
  const A=loadAdapters();
  const manager=(name,store,personalRank,aqActual)=>({name,store,roleGroup:'店長',rank:personalRank,totalRate:0,dod:0,rankChange:0,metrics:[{key:'AQ',actual:aqActual}]});
  const people=[manager('甲店長','酒泉',1,7),manager('乙店長','通化',1326,10),manager('丙店長','無對應店',2,null)];
  const stores=[
    {name:'酒泉',kpi:1.082,rank:41,kpiDod:-.012,rankChange:-3},
    {name:'通化',kpi:1.207,rank:8,kpiDod:.025,rankChange:4}
  ];
  const rows=A.managerStorePerformanceRows(people,stores);
  assert.deepEqual(Array.from(rows,row=>row.person.name),['乙店長','甲店長','丙店長']);
  assert.deepEqual(JSON.parse(JSON.stringify(rows[0].store)),stores[1]);
  assert.equal(rows[0].aqActual,10);
  assert.equal(rows[0].aqGap,0);
  assert.equal(rows[1].aqActual,7);
  assert.equal(rows[1].aqGap,3);
  assert.equal(rows[2].store,null);
  assert.equal(rows[2].aqActual,null);
  assert.equal(rows[2].aqGap,null);
});

test('Store personal view separates manager store semantics from staff personal metrics', () => {
  const A=loadAdapters();
  const people=[
    {name:'店長甲',store:'通化',roleGroup:'店長',totalRate:0,rank:1326,dod:0,rankChange:0,metrics:[{key:'AQ',actual:7}]},
    {name:'副店乙',store:'通化',roleGroup:'副店',totalRate:.91,rank:42,dod:.02,rankChange:3,metrics:[{key:'A999',rate:.8}]},
    {name:'業代丙',store:'通化',roleGroup:'其他業代',totalRate:1.03,rank:18,dod:.01,rankChange:1,metrics:[{key:'A999',rate:1.1}]},
    {name:'別店店長',store:'酒泉',roleGroup:'店長',metrics:[{key:'AQ',actual:9}]}
  ];
  const stores=[{name:'通化',kpi:.997,rank:296,kpiDod:.037,rankChange:6},{name:'酒泉',kpi:1.05,rank:120,kpiDod:.01,rankChange:2}];
  const view=A.personalStoreViewRows(people,stores,'台北通化');
  assert.equal(view.managers.length,1);
  assert.equal(view.managers[0].person.name,'店長甲');
  assert.equal(view.managers[0].store.kpi,.997);
  assert.equal(view.managers[0].store.rank,296);
  assert.equal(view.managers[0].aqActual,7);
  assert.equal(view.managers[0].aqGap,3);
  assert.deepEqual(Array.from(view.staff,person=>person.name),['副店乙','業代丙']);
  assert.equal(view.staff.some(person=>person.roleGroup==='店長'),false);
});

test('Personal performance metric gap excludes managers, keeps only rate below one and sorts high to low', () => {
  const A=loadAdapters();
  const person=(name,roleGroup,rate)=>({name,roleGroup,metrics:[{key:'A999',rate,actual:1}]});
  const result=A.personalUnderTargetByMetric([
    person('店長','店長',.5),person('達標','副店',1),person('高','副店',.962),person('中','其他業代',.845),person('低','其他業代',.613),person('缺值','副店',null)
  ],'A999');
  assert.deepEqual(Array.from(result.rows,row=>row.name),['高','中','低']);
  assert.deepEqual(Array.from(result.missing,row=>row.name),['缺值']);
});

test('Personal performance AQ attention uses actual below ten and keeps null separate', () => {
  const A=loadAdapters();
  const manager=(name,actual,rate=.5)=>({name,roleGroup:'店長',metrics:[{key:'AQ',actual,rate}]});
  const result=A.personalAqReview([manager('八點',8,1.5),manager('十點',10,.2),manager('缺值',null,0),{name:'業代',roleGroup:'其他業代',metrics:[{key:'AQ',actual:1,rate:.1}]}]);
  assert.deepEqual(Array.from(result.attention,row=>({name:row.person.name,actual:row.actual,gap:row.gap})),[{name:'八點',actual:8,gap:2}]);
  assert.deepEqual(Array.from(result.missing,row=>row.name),['缺值']);
});
