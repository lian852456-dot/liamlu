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
  assert.match(branch[1], /ptRequireSession_\(e\.parameter\.token, action\)/);
  assert.match(branch[1], /patrolSummaryMonth_\(e\.parameter\.month\)/);
  assert.match(branch[1], /readPatrolSummary_\(month\)/);
  assert.doesNotMatch(branch[1], /rows\s*:/);
  assert.match(gas, /PATROL_SUMMARY_CACHE_SECONDS\s*=\s*120/);
  assert.match(gas, /CacheService\.getScriptCache\(\)/);
  assert.match(gas, /if \(cached\) return JSON\.parse\(cached\)/);
  assert.match(gas, /if \(serialized\.length < 95000\) cache\.put/);
  assert.match(gas, /sheet\.getRange\(lastRow, 12\)\.getValue\(\)/);
  assert.doesNotMatch(gas, /sheet\.getRange\(2, 12, lastRow - 1, 1\)/);
  assert.match(gas, /function ptSummaryPostPayload_\(payload\)[\s\S]*ptRequireSession_\(body\.token, 'ptsummary'\)/);
  assert.match(gas, /action === 'ptsummary'\) result = ptSummaryPostPayload_\(payload\)/);
});

test('ptdetail is an authenticated bounded lazy read', () => {
  const gas = read('gas/Code.gs');
  const branch = gas.match(/if \(action === 'ptdetail'\) \{([\s\S]*?)\n  \}/);
  assert.ok(branch);
  assert.match(branch[1], /ptRequireSession_\(e\.parameter\.token, action\)/);
  assert.match(gas, /PATROL_DETAIL_MAX_LIMIT\s*=\s*100/);
  assert.match(gas, /Math\.min\(PATROL_DETAIL_MAX_LIMIT/);
  assert.match(gas, /patrolVisitStore_\(options\.store\)/);
  assert.match(gas, /function patrolSummaryRowMonth_\(row\)/);
  assert.match(gas, /filter\(function\(row\) \{ return patrolSummaryRowMonth_\(row\) === options\.month; \}\)/);
  assert.match(gas, /normalized\.month = patrolSummaryRowMonth_\(row\)/);
});

test('ptmileage is a month-scoped single-page visits contract with one Sheet scan per request', () => {
  const gas = read('gas/Code.gs');
  const patrol = read('patrol.html');
  assert.match(gas, /function ptMileageMonthPostPayload_\(payload\)[\s\S]*ptRequireSession_\(body\.token, 'ptmileage'\)/);
  assert.match(gas, /action === 'ptmileage'\) result = ptMileageMonthPostPayload_\(payload\)/);
  assert.match(gas, /PATROL_MILEAGE_FIELDS = \['fillTime','arriveTime','code','store','month'\]/);
  assert.match(gas, /PATROL_MILEAGE_MAX_VISITS = 279/);
  const monthRead = gas.match(/function readPatrolMileageMonth_\(options\) \{([\s\S]*?)\n\}/);
  assert.ok(monthRead);
  assert.equal((monthRead[1].match(/readPatrolContractColumns_\(sheet\)/g) || []).length, 1);
  assert.match(monthRead[1], /patrolSummaryRowMonth_\(row\) === month/);
  assert.match(monthRead[1], /patrolMileageVisits_\(matchedRows, month\)/);
  assert.match(monthRead[1], /contract:'patrol-mileage-visits-v2'/);
  assert.match(monthRead[1], /totalVisits:visits\.length/);
  assert.match(monthRead[1], /totalPages:1/);
  assert.match(monthRead[1], /visits:visits/);
  assert.doesNotMatch(monthRead[1], /ptStoreRows\(/);
  assert.match(patrol, /cloudCall\('ptmileage',\{month\}\)/);
  assert.doesNotMatch(patrol, /for\(const storeName of stores\)/);
  assert.match(patrol, /正在載入 \$\{month\}：讀取月份巡店事件/);
  assert.match(patrol, /MILEAGE_LOAD_SLOW/);
  assert.match(patrol, /MILEAGE_LOAD_TIMEOUT/);
});

test('mileage exposes explicit health reason codes and zero-detail consistency gate', () => {
  const patrol = read('patrol.html');
  ['MILEAGE_NO_PATROL','MILEAGE_SOURCE_MISSING','MILEAGE_DATE_PARSE_ERROR',
   'MILEAGE_STORE_MAPPING_ERROR','MILEAGE_CLOUD_READ_ERROR','MILEAGE_API_ERROR',
   'MILEAGE_AUTH_ERROR','MILEAGE_DATA_FORMAT_ERROR','MILEAGE_CALC_ERROR',
   'MILEAGE_LOAD_SLOW','MILEAGE_LOAD_TIMEOUT'].forEach(code=>assert.match(patrol,new RegExp(code)));
  assert.match(patrol, /sourceInfo\.type==='none'[\s\S]*ERROR\.NO_PATROL/);
  assert.match(patrol, /sourceInfo\.type==='patrol'&&visitCount===0[\s\S]*ERROR\.SOURCE_MISSING/);
  assert.match(patrol, /sourceType:sourceInfo\.type/);
  assert.match(patrol, /type:'official-archive'/);
  assert.match(patrol, /patrol-mileage-read-diagnostic-v1/);
  assert.match(patrol, /cloudCall\('ptsummary',\{month\}\)/);
  assert.match(patrol, /cloudCall\('ptdetail',\{month,store,page,limit:100\}\)/);
  assert.match(patrol, /cloudCall\('ptmileage',\{month\}\)/);
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
  assert.match(patrol, /action==='ptsummary'\|\|action==='ptdetail'\|\|action==='ptmileage'[\s\S]*method:'POST'/);
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
