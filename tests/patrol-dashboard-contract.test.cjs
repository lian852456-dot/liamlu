'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const Questions = require('../patrol-question-versions.js');
const fixture = require('./fixtures/patrol-ptdashboard-parity.cjs');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(process.env.PATROL_GAS_TEST_SOURCE || path.join(root, 'gas', 'Code.gs'), 'utf8');

function functionSource(name) {
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

function gasOverview(rows, month) {
  const context = vm.createContext({
    PT_STORES:fixture.stores,
    PATROL_DASHBOARD_TOTAL_ITEMS:25,
    PATROL_DASHBOARD_MONTHLY_ITEMS:[1,2,3,4,5,6,7,8,9],
    PATROL_DASHBOARD_BIMONTHLY_ITEMS:[10],
    PATROL_DASHBOARD_NCC_ITEMS:[11,12,13,14,15,16,17,18,19,20,21,22,23,24,25],
    PATROL_DASHBOARD_MIN_GAP_DAYS:7,
    Utilities:{formatDate(value) { return new Date(value).toISOString(); }},
    result:null
  });
  vm.runInContext([
    functionSource('ptWinMonths'), functionSource('patrolSummaryMonth_'),
    functionSource('patrolDashboardStoreKey_'), functionSource('patrolDashboardRowsForStore_'),
    functionSource('patrolDashboardDate_'), functionSource('patrolDashboardFillDate_'),
    functionSource('patrolDashboardVisitDate_'), functionSource('patrolDashboardRowMonth_'),
    functionSource('patrolDashboardIsoDayGap_'), functionSource('patrolDashboardAddDays_'),
    functionSource('patrolDashboardVisitCadence_'), functionSource('patrolDashboardItemStatus_'),
    functionSource('patrolDashboardGroupProgress_'), functionSource('patrolDashboardStoreSummary_'),
    functionSource('patrolDashboardOverview_'),
    `result=patrolDashboardOverview_(${JSON.stringify(rows)},${JSON.stringify(month)});`
  ].join('\n'), context);
  return JSON.parse(JSON.stringify(context.result));
}

test('ptdashboard summary matches the canonical 25-item model per store and item', () => {
  for (const [month, rows] of [['2026-09', fixture.septemberRows], ['2026-10', fixture.rows]]) {
    const expected = Questions.overview(rows, fixture.stores, month);
    const actual = gasOverview(rows, month);
    assert.deepEqual(actual, expected, `${month} summary parity`);
  }
});

test('ptdashboard reads one A:L snapshot, caps rows, and strips inspector/content', () => {
  const readBlock = functionSource('readPatrolDashboard_');
  assert.equal((readBlock.match(/readPatrolContractColumns_\(sheet\)/g) || []).length, 1);
  assert.match(source, /const PATROL_DASHBOARD_MAX_ROWS\s*=\s*5000/);
  assert.match(source, /if \(PT_STORES\.length !== 9\) throw new Error\('ptdashboard_store_contract_mismatch'\)/);

  let scans = 0;
  const context = vm.createContext({
    PT_STORES:fixture.stores,
    PATROL_DASHBOARD_CONTRACT:'patrol-dashboard-sep25-v1', PATROL_DASHBOARD_VERSION:1,
    PATROL_SUMMARY_CACHE_SECONDS:120,
    PATROL_DASHBOARD_MAX_ROWS:5000, PATROL_DASHBOARD_TOTAL_ITEMS:25,
    PATROL_DASHBOARD_MONTHLY_ITEMS:[1,2,3,4,5,6,7,8,9], PATROL_DASHBOARD_BIMONTHLY_ITEMS:[10],
    PATROL_DASHBOARD_NCC_ITEMS:[11,12,13,14,15,16,17,18,19,20,21,22,23,24,25], PATROL_DASHBOARD_MIN_GAP_DAYS:7,
    SPREADSHEET_ID:'synthetic-sheet', PATROL_SHEET:'synthetic-patrol',
    SpreadsheetApp:{openById:() => ({getSheetByName:() => ({})})}, patrolSummarySourceMeta_:() => ({sourceVersion:'synthetic',sourceUpdatedAt:'',lastRow:100}),
    readPatrolContractColumns_:() => { scans += 1; return fixture.rows; },
    CacheService:{getScriptCache:() => ({get:() => null, put:() => {}})},
    Utilities:{base64EncodeWebSafe:value => String(value), formatDate:() => '2026-09-15T00:00:00+08:00'},
    result:null
  });
  vm.runInContext([
    functionSource('patrolSummaryMonth_'), functionSource('ptWinMonths'),
    functionSource('patrolDashboardMonths_'),
    functionSource('patrolDashboardStoreKey_'), functionSource('patrolDashboardRowsForStore_'),
    functionSource('patrolDashboardDate_'), functionSource('patrolDashboardFillDate_'),
    functionSource('patrolDashboardVisitDate_'), functionSource('patrolDashboardRowMonth_'),
    functionSource('patrolDashboardIsoDayGap_'), functionSource('patrolDashboardAddDays_'),
    functionSource('patrolDashboardVisitCadence_'), functionSource('patrolDashboardItemStatus_'),
    functionSource('patrolDashboardGroupProgress_'), functionSource('patrolDashboardStoreSummary_'),
    functionSource('patrolDashboardOverview_'),
    functionSource('readPatrolDashboard_'),
    `result=readPatrolDashboard_({month:'2026-10'});`
  ].join('\n'), context);
  const response = JSON.parse(JSON.stringify(context.result));
  assert.equal(scans, 1);
  assert.equal(response.contract, 'patrol-dashboard-sep25-v1');
  assert.equal(response.version, 1);
  assert.equal(response.month, '2026-10');
  assert.equal(response.storeCount, 9);
  assert.equal(response.maxRows, 5000);
  assert.ok(response.rowCount <= response.maxRows);
  assert.equal(Object.hasOwn(response, 'rows'), false, 'summary-only response does not expose raw dashboard rows');
  assert.equal(response.summary.stores[1].missingItemNumbers.includes(1), false, '督導打卡未填為非必要，不得列為缺項');
  assert.equal(JSON.stringify(response).includes('SYNTHETIC_INSPECTOR'), false);
  assert.equal(JSON.stringify(response).includes('SYNTHETIC_CONTENT_CANARY'), false);

  context.readPatrolContractColumns_ = () => Array.from({length:5001}, () => ({
    fillTime:'2026/10/01 10:00', month:'2026-10', code:fixture.stores[0].code,
    store:fixture.stores[0].name, item:1, result:'v'
  }));
  assert.throws(() => vm.runInContext("readPatrolDashboard_({month:'2026-10'})", context), /ptdashboard_row_cap_exceeded/);
  context.SpreadsheetApp={openById:()=>({getSheetByName:()=>null})};
  assert.throws(() => vm.runInContext("readPatrolDashboard_({month:'2026-10'})", context), /ptdashboard_source_missing/);
  assert.doesNotMatch(readBlock,/getPatrolSheet\(|insertSheet|appendRow|setValues/);
});
