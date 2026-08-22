'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const gas = fs.readFileSync(path.resolve(__dirname, '../gas/Code.gs'), 'utf8');

function functionSource(name) {
  const start = gas.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = gas.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < gas.length; index += 1) {
    if (gas[index] === '{') depth += 1;
    if (gas[index] === '}' && --depth === 0) return gas.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function taipeiDate(value) {
  const text = String(value || '');
  if (/Z$|[+-]\d{2}:?\d{2}$/i.test(text)) {
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(new Date(text));
    const find = type => parts.find(part => part.type === type).value;
    return `${find('year')}-${find('month')}-${find('day')}`;
  }
  const match = text.match(/(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  return match ? `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}` : '';
}

function runtime(rows) {
  const values = new Map();
  let scans = 0;
  const PT_STORES = [
    ['台北酒泉','DNB10062'], ['台北大稻埕','DNB10284'], ['台北三創','DNB10307'], ['台北六張犁','DNB10440'],
    ['台北復興南','DNB10094'], ['台北萬大','DNB10168'], ['台北通化','DNB10174'], ['台北永吉','DNB10082'], ['台北杭州南','DNB10146'],
  ].map(([name, code]) => ({name, code}));
  const source = [
    'patrolMileageStore_', 'patrolMileageCacheKey_', 'patrolMileageV2CacheKey_',
    'patrolMileageArriveSort_', 'patrolMileageVisits_', 'readPatrolMileageMonth_', 'readPatrolMileageMonthV2_'
  ].map(functionSource).join('\n');
  const read = Function(
    'PT_STORES','PATROL_MILEAGE_MAX_LIMIT','PATROL_MILEAGE_MAX_VISITS','PATROL_MILEAGE_FIELDS','PATROL_MILEAGE_CACHE_SECONDS',
    'patrolSummaryMonth_','getPatrolSheet','patrolSummarySourceMeta_','CacheService','Utilities',
    'readPatrolContractColumns_','patrolSummaryRowMonth_','patrolSummaryIsoDate_',
    `${source}; return {legacy:readPatrolMileageMonth_, visits:readPatrolMileageMonthV2_};`
  )(
    PT_STORES, 500, 279, ['fillTime','arriveTime','code','store','month'], 120,
    value => { const month = String(value || ''); if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('invalid patrol month'); return month; },
    () => ({}),
    () => ({sourceVersion:'fixture:594',lastRow:rows.length + 1}),
    {getScriptCache:() => ({get:key => values.get(key) || null, put:(key, value) => values.set(key, value)})},
    {base64EncodeWebSafe:value => Buffer.from(value).toString('base64url'), formatDate:() => '2026-08-22T00:00:00+08:00'},
    () => { scans += 1; return rows; },
    row => String(row.month || '').slice(0, 7),
    row => taipeiDate(row.arriveTime || row.fillTime)
  );
  return {read:read.visits, readLegacy:read.legacy, scans:() => scans, clearCache:() => values.clear()};
}

const storeCode = {
  '台北酒泉':'DNB10062', '台北大稻埕':'DNB10284', '台北三創':'DNB10307', '台北六張犁':'DNB10440',
  '台北復興南':'DNB10094', '台北萬大':'DNB10168', '台北杭州南':'DNB10146',
};

function augustRawRows() {
  const routes = [
    ['2026/8/3',['台北酒泉','台北大稻埕','台北萬大']],
    ['2026/8/4',['台北三創','台北酒泉','台北大稻埕']],
    ['2026/8/5',['台北三創','台北酒泉','台北大稻埕']],
    ['2026/8/6',['台北三創','台北酒泉','台北大稻埕']],
    ['2026/8/7',['台北三創','台北六張犁']],
    ['2026/8/8',['台北三創','台北復興南']],
    ['2026/8/9',['台北杭州南','台北六張犁']],
  ];
  return routes.flatMap(([date, stores]) => stores.flatMap((store, storeIndex) =>
    Array.from({length:33}, (_, item) => ({
      fillTime:`${date} 08:${String(item).padStart(2, '0')}`,
      arriveTime:`${date} ${String(9 + storeIndex).padStart(2, '0')}:00`,
      code:storeCode[store], store, month:'2026-08', item:item + 1, result:'v', reason:'',
    }))
  ));
}

test('594 raw rows produce one single-scan response of 18 unique August visits', () => {
  const rows = augustRawRows();
  assert.equal(rows.length, 594);
  const env = runtime(rows);
  const first = env.read({month:'2026-08'});

  assert.equal(env.scans(), 1);
  assert.equal(first.contract, 'patrol-mileage-visits-v2');
  assert.equal(first.totalPages, 1);
  assert.equal(first.totalVisits, 18);
  assert.equal(first.visits.length, 18);
  assert.equal(new Set(first.visits.map(row => `${taipeiDate(row.arriveTime)}|${row.store}`)).size, 18);
  assert.equal(new Set(first.visits.map(row => taipeiDate(row.arriveTime))).size, 7);
  assert.equal(first.diagnostics.sheetScans, 1);
  assert.equal(first.diagnostics.matchedRows, 594);
  assert.equal(first.diagnostics.uniqueVisits, 18);
  assert.ok(first.visits.every(row => Object.keys(row).sort().join(',') === 'arriveTime,code,fillTime,month,store'));
  assert.throws(() => env.read({month:'2026-08',page:2}), /single page/);

  const cached = env.read({month:'2026-08'});
  assert.equal(env.scans(), 1);
  assert.equal(cached.diagnostics.cacheHit, true);
  assert.equal(cached.diagnostics.sheetScans, 0);
  assert.deepEqual(cached.visits, first.visits);

  env.clearCache();
  const cacheMiss = env.read({month:'2026-08'});
  assert.equal(env.scans(), 2);
  assert.deepEqual(cacheMiss.visits, first.visits, 'cache miss changes speed only, never visit correctness');
});

test('legacy ptmlieage retains the v1 paged rows contract alongside v2', () => {
  const rows = augustRawRows();
  const env = runtime(rows);
  const first = env.readLegacy({month:'2026-08', page:1});
  const second = env.readLegacy({month:'2026-08', page:2});

  assert.equal(first.contract, 'patrol-mileage-month-v1');
  assert.equal(first.totalRows, 594);
  assert.equal(first.totalPages, 2);
  assert.equal(first.rows.length, 500);
  assert.equal(second.rows.length, 94);
  assert.equal(env.scans(), 1, 'v1 page 2 uses the same generated snapshot cache');
  assert.equal(second.diagnostics.sheetScans, 0);
  assert.throws(() => env.readLegacy({month:'2026-08', page:3}), /invalid patrol mileage page/);
});

test('same day same store retains the earliest arriveTime and months do not contaminate each other', () => {
  const env = runtime([
    {fillTime:'2026/7/31 10:00',arriveTime:'2026/7/31 10:00',code:'DNB10307',store:'台北三創',month:'2026-07'},
    {fillTime:'2026/8/1 11:00',arriveTime:'2026/8/1 11:00',code:'DNB10307',store:'三創',month:'2026-08'},
    {fillTime:'2026/8/1 09:00',arriveTime:'2026/8/1 09:00',code:'DNB10307',store:'台北三創',month:'2026-08'},
    {fillTime:'2026/8/1 15:00',arriveTime:'2026/8/1 15:00',code:'UNKNOWN',store:'台北臨時點',month:'2026-08'},
  ]);
  const august = env.read({month:'2026-08'});
  const july = env.read({month:'2026-07'});
  assert.equal(august.totalVisits, 2);
  assert.equal(august.visits.find(row => row.store === '台北三創').arriveTime, '2026/8/1 09:00');
  assert.equal(august.visits.find(row => row.store === '台北臨時點').code, 'UNKNOWN');
  assert.equal(july.totalVisits, 1);
  assert.equal(july.visits[0].month, '2026-07');
});
