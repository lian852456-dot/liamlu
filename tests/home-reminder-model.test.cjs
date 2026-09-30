'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Model = require('../home-reminder-model.js');
const Questions = require('../patrol-question-versions.js');
const context = Model.dateContext('2026-09-30T07:00:00Z');

function salesFixture() {
  return { status:'ok', summary:{
    semantics:'formal-index-summary-v1', date:context.yesterday, segment:21,
    totalStores:9, completedStores:9, missingStores:[], updatedAt:'21:40:00',
    stores:Model.STORES.map(store => ({ name:store.name, reported:true, reportedAt:'21:40:00', metrics:{
      A999:{value:1, unit:'count', sourceField:'aq999'}, '好速':{value:0.5, unit:'points', sourceField:'haosu'}
    } }))
  } };
}

function patrolFixture(month = context.month) {
  const stores = Model.STORES.map(store => ({name:store.name === '台北三創' ? store.name : `台北${store.name}`,code:store.code}));
  const rows = [];
  stores.forEach(store => {
    for (let item = 2; item <= 25; item += 1) rows.push({store:store.name, code:store.code, month, fillTime:`${month}-01 10:00`, arriveTime:`${month}-01 09:00`, item, result:'v'});
    rows.push({store:store.name, code:store.code, month, fillTime:`${month}-08 10:00`, arriveTime:`${month}-08 09:00`, item:2,result:'v'});
  });
  function response(input = rows) {
    return { status:'ok', contract:'patrol-dashboard-sep25-v1', version:1, month,
      months:Questions.bimWindow(month).months.filter(value => value <= month), stores, storeCount:9,
      rowCount:input.length, sourceRowCount:input.length, maxRows:5000,
      summary:Questions.overview(input, stores, month), sourceVersion:'synthetic-only-v1',
      sourceUpdatedAt:`${month}-08T10:00:00+08:00`, generatedAt:'2026-09-30T15:00:00+08:00'
    };
  }
  return {stores,rows,response};
}

test('Taipei date context handles local midnight, leap day and calendar-year rollover', () => {
  assert.deepEqual(context, {today:'2026-09-30',yesterday:'2026-09-29',month:'2026-09',bimonthly:{months:['2026-09','2026-10'],label:'9–10月'},bimonthlyMonths:['2026-09','2026-10'],bimonthlyLabel:'9–10月'});
  assert.equal(Model.dateContext('2026-09-30T16:00:00Z').today, '2026-10-01');
  assert.equal(Model.dateContext('2027-01-01T00:00:00Z').yesterday, '2026-12-31');
  assert.equal(Model.dateContext('2024-03-01T00:00:00Z').yesterday, '2024-02-29');
  assert.deepEqual(Model.dateContext('2026-10-31T00:00:00Z').bimonthly.months, ['2026-09','2026-10']);
  assert.throws(() => Model.dateContext('not a date'), /invalid_reminder_date/);
});

test('sales uses exact previous-day 21:00 explicit numeric zero, separately per metric', () => {
  const response = salesFixture();
  response.summary.stores[0].metrics.A999.value = 0;
  response.summary.stores[1].metrics['好速'].value = 0;
  const items = Model.fromSales(response, context);
  assert.equal(items.length, 2);
  assert.equal(items[0].status, 'warning');
  assert.match(items[0].text, /通化/);
  assert.doesNotMatch(items[0].text, /酒泉/);
  assert.match(items[1].text, /酒泉/);
  assert.equal(items[0].period, '2026-09-29 21:00');
});

test('missing reports and missing metric values are pending, never confirmed zeros', () => {
  const response = salesFixture();
  response.summary.stores[0].reported = false;
  response.summary.stores[0].metrics.A999.value = 0;
  response.summary.completedStores = 8;
  response.summary.missingStores = ['通化'];
  delete response.summary.stores[1].metrics['好速'];
  response.summary.stores[2].metrics.A999.value = 0;
  const items = Model.fromSales(response, context);
  assert.equal(items[0].status, 'warning');
  assert.match(items[0].text, /台北三創/);
  assert.doesNotMatch(items[0].text, /通化/);
  assert.equal(items[1].status, 'pending');
  assert.equal(items[2].status, 'pending');
  assert.match(items[2].text, /未回報：通化/);
  assert.match(items[2].text, /欄位待補：酒泉/);
});

test('noncanonical sales numbers do not become zeros', () => {
  for (const value of [null,undefined,'',false,'0',NaN,Infinity,-1,0.5]) {
    const response = salesFixture();
    response.summary.stores[0].metrics.A999.value = value;
    const items = Model.fromSales(response, context);
    assert.equal(items[0].status, 'pending', String(value));
    assert.equal(items.at(-1).id, 'sales-incomplete');
  }
});

test('stale dates, 16:00, legacy summaries, duplicated stores and incomplete store contracts fail closed', () => {
  const mutations = [
    r => {r.status = 'error';}, r => {delete r.summary;},
    r => {r.summary.date = '2026-09-28';}, r => {r.summary.segment = 16;},
    r => {r.summary.semantics = 'legacy';}, r => {r.summary.totalStores = 8;},
    r => {r.summary.completedStores = 8;}, r => {r.summary.stores.pop();},
    r => {r.summary.stores[0] = r.summary.stores[1];}, r => {r.summary.stores[0].reported = 'yes';}
  ];
  for (const mutate of mutations) {
    const response = salesFixture(); mutate(response);
    const items = Model.fromSales(response, context);
    assert.equal(items.length, 2);
    assert.ok(items.every(item => item.status === 'pending'));
  }
});

test('zero reported rows and empty backend responses remain waiting rather than all nine zero', () => {
  const response = salesFixture();
  response.summary.stores.forEach(row => {row.reported = false;row.metrics = {};});
  response.summary.completedStores = 0;
  response.summary.missingStores = Model.STORES.map(store => store.name);
  assert.deepEqual(Model.fromSales(response, context).map(item => item.status), ['pending','pending']);
  assert.ok(Model.fromSales({}, context).every(item => item.status === 'pending'));
  assert.ok(Model.fromPatrol({}, context).every(item => item.status === 'pending'));
  assert.ok(Model.fromPatrol({}, {bimonthly:{label:'bad'}}).every(item => item.status === 'pending'));
});

test('complete patrol source uses current 25-item and bimonthly item 10 contract', () => {
  const {response} = patrolFixture();
  const items = Model.fromPatrol(response(), context);
  assert.deepEqual(items.map(item => item.status), ['ok','ok']);
  assert.match(items[1].period, /9–10月/);
  assert.match(items[1].period, /每兩月一次/);
});

test('monthly under-two reminder counts distinct recorded visits and includes zero and one', () => {
  const {rows,response,stores} = patrolFixture();
  const selected = rows.filter(row => row.code !== stores[0].code && !(row.code === stores[1].code && row.arriveTime.includes('-08')));
  const items = Model.fromPatrol(response(selected), context);
  assert.equal(items[0].status, 'warning');
  assert.match(items[0].text, /通化 0\/2/);
  assert.match(items[0].text, /酒泉 1\/2/);
  assert.match(items[1].text, /通化/);
});

test('two actual visits less than seven days apart are not mislabeled as one visit', () => {
  const {rows,response,stores} = patrolFixture();
  const selected = rows.map(row => row.code === stores[0].code && row.arriveTime.includes('-08')
    ? {...row,arriveTime:'2026-09-06 09:00',fillTime:'2026-09-06 10:00'} : row);
  assert.equal(response(selected).summary.stores[0].visits.qualifyingVisits, 1);
  assert.equal(Model.fromPatrol(response(selected), context)[0].status, 'ok');
});

test('ANY V completes inventory; later blank/NA never erases an earlier V', () => {
  const {rows,response,stores} = patrolFixture();
  rows.push({store:stores[0].name,code:stores[0].code,month:'2026-09',fillTime:'2026-09-15 10:00',item:10,result:''});
  assert.equal(Model.fromPatrol(response(rows), context)[1].status, 'ok');
  const naOnly = rows.map(row => row.code === stores[1].code && row.item === 10 ? {...row,result:'NA'} : row);
  assert.match(Model.fromPatrol(response(naOnly), context)[1].text, /酒泉/);
});

test('October still accepts September item10, but does not reuse September monthly/NCC completion', () => {
  const october = Model.dateContext('2026-10-20T00:00:00Z');
  const {rows,response,stores} = patrolFixture('2026-10');
  const selected = rows.filter(row => !(row.code === stores[0].code && row.item === 10));
  selected.push({store:stores[0].name,code:stores[0].code,month:'2026-09',fillTime:'2026-09-12 10:00',item:10,result:'v'});
  const result = response(selected); result.generatedAt = '2026-10-20T10:00:00+08:00';
  assert.equal(Model.fromPatrol(result, october)[1].status, 'ok');
});

test('malformed/stale/empty patrol summary never reports nine stores with zero visits', () => {
  const mutations = [
    r => {r.contract = 'patrol-summary-v1';}, r => {r.version = 2;}, r => {r.month = '2026-08';},
    r => {r.summary.totalItems = 33;}, r => {r.rowCount = 0;r.sourceRowCount = 0;},
    r => {r.sourceRowCount = 5001;}, r => {r.months.push('2026-10');},
    r => {r.stores[0].code = 'wrong';}, r => {r.summary.stores.pop();},
    r => {r.summary.stores[0].visits.recordedVisits = 0;},
    r => {r.summary.stores[0].visits.dates[0] = '2026-09-99';},
    r => {r.summary.stores[0].bimonthly.completed = 0;},
    r => {r.summary.stores[0].missingItemNumbers.push(26);},
    r => {r.summary.window = {months:['2026-08','2026-09'],label:'8–9月'};},
    r => {r.summary.visitedStores = 0;}, r => {r.generatedAt = '2026-09-29T12:00:00+08:00';},
    r => {delete r.sourceVersion;}
  ];
  for (const mutate of mutations) {
    const fixture = patrolFixture(); const response = fixture.response(); mutate(response);
    const items = Model.fromPatrol(response, context);
    assert.deepEqual(items.map(item => item.status), ['pending','pending']);
    assert.ok(items.every(item => !item.text.includes('0/2')));
  }
});

test('future visit dates cannot count toward today’s monthly progress', () => {
  const earlier = Model.dateContext('2026-09-05T00:00:00Z');
  const {response} = patrolFixture(); const result = response();
  result.generatedAt = '2026-09-05T10:00:00+08:00';
  assert.ok(Model.fromPatrol(result, earlier).every(item => item.status === 'pending'));
});

test('pending items have four stable IDs and sales/patrol kinds for the controller', () => {
  const items = Model.pendingItems(context);
  assert.deepEqual(items.map(item => item.id), ['sales-a999','sales-haosu','patrol-visits','patrol-inventory']);
  assert.deepEqual(items.map(item => item.kind), ['sales','sales','patrol','patrol']);
});

test('only the established Wanda legacy alias is accepted without modifying the input', () => {
  const {response} = patrolFixture(); const result = response();
  result.stores[3].code = 'DNB10xxx_wanda'; result.summary.stores[3].code = 'DNB10xxx_wanda';
  assert.equal(Model.fromPatrol(result, context)[0].status, 'ok');
  assert.equal(result.stores[3].code, 'DNB10xxx_wanda');
});

test('all reminder outputs are brief, stamped, linkable, and contain no person fields', () => {
  const sales = salesFixture(); sales.summary.stores.forEach(row => {row.metrics.A999.value = 0;row.metrics['好速'].value = 0;row.people = [{name:'PERSON_CANARY'}];});
  const {response,rows} = patrolFixture();
  const patrol = response(rows.filter(row => row.store === '台北通化'));
  const items = [...Model.fromSales(sales,context),...Model.fromPatrol(patrol,context),...Model.pendingItems(context)];
  for (const item of items) {
    assert.ok(item.text.length <= 120, item.text);
    assert.ok(item.period); assert.ok(item.href); assert.ok(item.id); assert.ok(item.kind);
    assert.ok(['pending','warning','ok'].includes(item.status));
  }
  assert.doesNotMatch(JSON.stringify(items), /PERSON_CANARY/);
});
