'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const model = require('../patrol-read-model.js');
const fixture = require('./fixtures/patrol-ptread-parity.cjs');

const root = path.resolve(__dirname, '..');

test('patrol.html and App delegate patrol calculations to the same read-only model', () => {
  const patrolHtml = fs.readFileSync(path.join(root, 'patrol.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.match(patrolHtml, /PatrolReadModel\.rebuildFromRaw\(rawDetails\)/);
  assert.match(patrolHtml, /PatrolReadModel\.itemStatus\(records, currentMonth, storeName, itemNo\)/);
  assert.match(patrolHtml, /PatrolReadModel\.storeSummary\(records, currentMonth, storeName\)/);
  assert.match(patrolHtml, /PatrolReadModel\.bimWindow\(mk\)/);
  assert.match(patrolHtml, /PatrolReadModel\.overview\(rawDetails, STORES, currentMonth/);
  assert.match(appJs, /function adaptPatrolSummary\(raw, currentMonth\)/);
  assert.match(appJs, /patrolRead\('ptsummary',\{month\}\)/);
  assert.doesNotMatch(appJs, /patrolRead\('ptread'/);
});

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} must exist`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function gasSummary(rows, stores, month, now) {
  const gas = fs.readFileSync(path.join(root, 'gas/Code.gs'), 'utf8');
  const names = [
    'ptWinMonths','ptDayOf','ptItemDone','ptStoreRows','patrolSummaryIsoDate_','patrolSummaryRowMonth_',
    'patrolSummaryFillIsoDate_','patrolSummaryPreviousWindow_','patrolSummaryDaysSince_',
    'patrolSummaryAwareness_','patrolSummaryItem18State_','patrolSummaryDashboardProgress_',
    'patrolSummaryHalfDashboard_','patrolSummaryContract_'
  ];
  const context = {
    PT_STORES:stores,
    rows,
    month,
    now,
    Utilities:{
      formatDate(value, _timezone, pattern) {
        const date = new Date(value);
        const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }).formatToParts(date);
        const get = type => parts.find(part => part.type === type).value;
        if (pattern === 'yyyy-MM') return `${get('year')}-${get('month')}`;
        if (pattern === 'd') return String(Number(get('day')));
        return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}+08:00`;
      }
    },
    result:null
  };
  vm.createContext(context);
  vm.runInContext(`${names.map(name => functionSource(gas, name)).join('\n')}\nresult=patrolSummaryContract_(rows,month,now,{sourceVersion:'',sourceUpdatedAt:''});`, context);
  return JSON.parse(JSON.stringify(context.result));
}

test('GAS ptsummary contract matches the canonical patrol model field-for-field', () => {
  const expected = model.summaryContract(fixture.rows, fixture.stores, fixture.currentMonth, fixture.now, {});
  const actual = gasSummary(fixture.rows, fixture.stores, fixture.currentMonth, fixture.now);
  expected.generatedAt = actual.generatedAt;
  assert.deepEqual(actual, expected);
});

test('same ptread fixture yields canonical monthly patrol overview and item parity', () => {
  const result = model.overview(fixture.rows, fixture.stores, fixture.currentMonth, fixture.now);
  assert.equal(result.visited, 3);
  assert.equal(result.fullyDone, 2);
  assert.equal(result.totalMissingItems, 21);
  assert.equal(result.remaining, 6);
  assert.deepEqual(result.item18Window, { months:['2026-07', '2026-08'], label:'7–8月' });
  assert.deepEqual(result.unvisited, fixture.stores.slice(3).map(store => store.name));

  const tonghua = result.stores.find(store => store.name === '台北通化');
  const jiuquan = result.stores.find(store => store.name === '台北酒泉');
  const sanchuang = result.stores.find(store => store.name === '台北三創');
  assert.equal(tonghua.missingItems, 0);
  assert.equal(tonghua.item18.status, 'done', 'July completion counts in the formal July-August item 18 window');
  assert.deepEqual(tonghua.awareness, { count:15, total:15, all:true, completedDay:18, status:'complete', daysLeft:9 });
  assert.equal(jiuquan.missingItems, 21);
  assert.deepEqual(jiuquan.missingItemNumbers, [2,3,4,5,6,7,8,9,10,11,12,13,18,26,27,28,29,30,31,32,33]);
  assert.equal(sanchuang.missingItems, 0);
  assert.equal(sanchuang.awareness.status, 'late');
  assert.equal(sanchuang.awareness.completedDay, 22);

  assert.equal(result.item18Progress.completedStores, 2);
  assert.equal(result.item18Progress.stores.find(store => store.name === '台北通化').current.date, '2026-07-31');
  assert.equal(result.item18Progress.stores.find(store => store.name === '台北酒泉').current.done, false);
  assert.equal(result.inventory.completedStores, 3);
  assert.deepEqual(result.inventory.stores.find(store => store.name === '台北酒泉').items, { 14:true, 15:true, 16:true, 17:true });

  assert.equal(result.visitCounts.find(store => store.name === '台北通化').count, 2);
  assert.equal(result.visitCounts.find(store => store.name === '台北酒泉').count, 1);
  assert.equal(result.visitCounts.find(store => store.name === '台北三創').count, 2);
  assert.equal(result.sameDayMultipleVisitsDistinguishable, false);
  assert.equal(result.recent.length, 5, '33 item rows aggregate to one store/date visit row');
  assert.deepEqual(result.recent[0], { date:'2026-08-22', store:'台北三創', complete:true, missingItems:0, missingItemNumbers:[] });
});

test('visit count follows patrol.html unique arrival-date rule and never counts ptread rows', () => {
  const rows = [
    { store:'台北通化', code:'DNB10059', arriveTime:'2026/8/10 09:00', fillTime:'2026/8/10 12:00', month:'2026-08', item:14, result:'v' },
    { store:'台北通化', code:'DNB10059', arriveTime:'2026/8/10 10:30', fillTime:'2026/8/10 12:01', month:'2026-08', item:15, result:'' },
    { store:'台北通化', code:'DNB10059', arriveTime:'2026/8/11 09:00', fillTime:'2026/8/11 12:00', month:'2026-08', item:14, result:'v' }
  ];
  const result = model.visitSummary(rows, [fixture.stores[0]], '2026-08');
  assert.equal(result.storeCounts[0].count, 2);
  assert.equal(result.sameDayMultipleVisitsDistinguishable, false);
  assert.equal(result.recent.length, 2);
  assert.equal(result.recent.find(row => row.date === '2026-08-10').missingItems, 1);
});

test('ptsummary recent visits count v, result na and reason na as checked without hiding real gaps', () => {
  const rows = [];
  const add = (store, item, result, reason = '') => rows.push({
    store,
    code:fixture.stores.find(candidate => candidate.name === store).code,
    item,
    fillTime:'2026/8/20 12:00',
    month:'2026-08',
    result,
    reason
  });

  for (let item = 1; item <= 33; item += 1) {
    add('台北三創', item, item <= 13 ? 'v' : 'na');
    if (item <= 10) add('台北六張犁', item, 'v');
    else if (item <= 20) add('台北六張犁', item, 'na');
    else add('台北六張犁', item, '', 'na');
    add('台北酒泉', item, item <= 31 ? 'v' : '', item === 33 ? '貨架未整理' : '');
  }

  const canonical = model.summaryContract(rows, fixture.stores, '2026-08', fixture.now, {});
  const formalGas = gasSummary(rows, fixture.stores, '2026-08', fixture.now);
  [canonical, formalGas].forEach(summary => {
    const sanchuang = summary.recentVisits.find(visit => visit.store === '台北三創');
    const liuzhangli = summary.recentVisits.find(visit => visit.store === '台北六張犁');
    const jiuquan = summary.recentVisits.find(visit => visit.store === '台北酒泉');
    assert.deepEqual(sanchuang, { date:'2026-08-20', store:'台北三創', complete:true, missingItems:0, missingItemNumbers:[] });
    assert.deepEqual(liuzhangli, { date:'2026-08-20', store:'台北六張犁', complete:true, missingItems:0, missingItemNumbers:[] });
    assert.equal(jiuquan.complete, false);
    assert.equal(jiuquan.missingItems, 2);
    assert.deepEqual(jiuquan.missingItemNumbers, [32, 33]);
  });
});
