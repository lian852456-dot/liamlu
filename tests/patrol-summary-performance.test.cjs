'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const model = require('../patrol-read-model.js');
const fixture = require('./fixtures/patrol-ptread-parity.cjs');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('ptsummary is authenticated, month-scoped, cached briefly and never returns raw rows', () => {
  const gas = read('gas/Code.gs');
  const branch = gas.match(/if \(action === 'ptsummary'\) \{([\s\S]*?)\n  \}/);
  assert.ok(branch);
  assert.match(branch[1], /ptAuthorized\(e\)/);
  assert.match(branch[1], /patrolSummaryMonth_\(e\.parameter\.month\)/);
  assert.match(branch[1], /readPatrolSummary_\(month\)/);
  assert.doesNotMatch(branch[1], /rows\s*:/);
  assert.match(gas, /PATROL_SUMMARY_CACHE_SECONDS\s*=\s*120/);
  assert.match(gas, /CacheService\.getScriptCache\(\)/);
  assert.match(gas, /if \(cached\) return JSON\.parse\(cached\)/);
  assert.match(gas, /if \(serialized\.length < 95000\) cache\.put/);
  assert.match(gas, /sheet\.getRange\(lastRow, 12\)\.getValue\(\)/);
  assert.doesNotMatch(gas, /sheet\.getRange\(2, 12, lastRow - 1, 1\)/);
  assert.match(gas, /function ptSummaryPostPayload_\(payload\)[\s\S]*ptSessionAuthorized_\(body\.token\)/);
  assert.match(gas, /action === 'ptsummary'\) result = ptSummaryPostPayload_\(payload\)/);
});

test('ptdetail is an authenticated bounded lazy read', () => {
  const gas = read('gas/Code.gs');
  const branch = gas.match(/if \(action === 'ptdetail'\) \{([\s\S]*?)\n  \}/);
  assert.ok(branch);
  assert.match(branch[1], /ptAuthorized\(e\)/);
  assert.match(gas, /PATROL_DETAIL_MAX_LIMIT\s*=\s*100/);
  assert.match(gas, /Math\.min\(PATROL_DETAIL_MAX_LIMIT/);
  assert.match(gas, /patrolVisitStore_\(options\.store\)/);
  assert.match(gas, /function patrolSummaryRowMonth_\(row\)/);
  assert.match(gas, /filter\(function\(row\) \{ return patrolSummaryRowMonth_\(row\) === options\.month; \}\)/);
  assert.match(gas, /normalized\.month = patrolSummaryRowMonth_\(row\)/);
});

test('mileage exposes explicit health reason codes and zero-detail consistency gate', () => {
  const patrol = read('patrol.html');
  ['MILEAGE_NO_PATROL','MILEAGE_SOURCE_MISSING','MILEAGE_DATE_PARSE_ERROR',
   'MILEAGE_STORE_MAPPING_ERROR','MILEAGE_CLOUD_READ_ERROR','MILEAGE_API_ERROR',
   'MILEAGE_AUTH_ERROR','MILEAGE_DATA_FORMAT_ERROR','MILEAGE_CALC_ERROR'].forEach(code=>assert.match(patrol,new RegExp(code)));
  assert.match(patrol, /source\.length===0[\s\S]*ERROR\.NO_PATROL/);
  assert.match(patrol, /else if\(visitCount===0\)[\s\S]*ERROR\.SOURCE_MISSING/);
  assert.match(patrol, /console\[report\.abnormal\?'warn':'info'\]\('MILEAGE_HEALTH',report\)/);
});

test('App and patrol.html load ptsummary for dashboards and fail closed on transport errors', () => {
  const app = read('app.js');
  const patrol = read('patrol.html');
  assert.match(app, /patrolRead\('ptsummary',\{month\}\)/);
  assert.match(app, /action === 'ptsummary' \|\| action === 'ptdetail'[\s\S]*method:'POST'/);
  assert.match(app, /body:JSON\.stringify\(\{ action, token:patrolToken, \.\.\.params \}\)/);
  assert.doesNotMatch(app, /patrolRead\('ptread'/);
  assert.match(app, /巡店資料讀取逾時/);
  assert.match(app, /data-retry-patrol/);
  assert.match(patrol, /cloudCall\('ptsummary',\{month:currentMonth\}\)/);
  assert.match(patrol, /action==='ptsummary'\|\|action==='ptdetail'[\s\S]*method:'POST'/);
  assert.match(patrol, /JSON\.stringify\(\{action,token:PT_TOKEN,\.\.\.params\}\)/);
  assert.doesNotMatch(patrol, /cloudCall\('ptread'\)/);
  assert.match(patrol, /patrolSummaryUnavailableHTML/);
  assert.match(patrol, /上次成功資料/);
  assert.match(patrol, /重新整理/);
});

test('summary payload stays below the formal 100 KB gate', () => {
  const summary = model.summaryContract(fixture.rows, fixture.stores, fixture.currentMonth, fixture.now, {
    sourceVersion:'fixture', sourceUpdatedAt:'2026/8/11 12:00', generatedAt:'2026-08-11T12:00:00+08:00'
  });
  assert.ok(Buffer.byteLength(JSON.stringify({ status:'ok', summary }), 'utf8') < 100_000);
});
