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
  for (let index = open; index < gas.length; index++) {
    if (gas[index] === '{') depth++;
    if (gas[index] === '}' && --depth === 0) return gas.slice(start, index + 1);
  }
  throw new Error(`unterminated ${name}`);
}

function runtime(rows) {
  const values = new Map();
  let scans = 0;
  const cache = {
    get:key => values.get(key) || null,
    put:(key, value) => values.set(key, value),
  };
  const PT_STORES = [
    {name:'台北三創',code:'DNB10307'},
    {name:'台北六張犁',code:'DNB10440'},
  ];
  const source = [
    functionSource('patrolMileageStore_'),
    functionSource('patrolMileageCacheKey_'),
    functionSource('readPatrolMileageMonth_'),
  ].join('\n');
  const read = Function(
    'PT_STORES','PATROL_MILEAGE_MAX_LIMIT','PATROL_MILEAGE_FIELDS','PATROL_MILEAGE_CACHE_SECONDS',
    'patrolSummaryMonth_','getPatrolSheet','patrolSummarySourceMeta_','CacheService','Utilities',
    'readPatrolContractColumns_','patrolSummaryRowMonth_','patrolSummaryIsoDate_',
    `${source}; return readPatrolMileageMonth_;`
  )(
    PT_STORES,500,['fillTime','arriveTime','code','store','month'],120,
    value => {
      const month=String(value||'');
      if(!/^\d{4}-\d{2}$/.test(month)) throw new Error('invalid patrol month');
      return month;
    },
    () => ({}),
    () => ({sourceVersion:'1002:fixture',lastRow:1002}),
    {getScriptCache:() => cache},
    {
      base64EncodeWebSafe:value => Buffer.from(value).toString('base64url'),
      formatDate:() => '2026-08-21T15:00:00+08:00',
    },
    () => { scans++; return rows; },
    row => String(row.month||'').slice(0,7),
    row => String(row.arriveTime||row.fillTime||'').slice(0,10).replaceAll('/','-')
  );
  return {read, scans:() => scans};
}

test('月份級多頁共用同一份 Sheet snapshot，只掃一次', () => {
  const rows = Array.from({length:1001}, (_, index) => ({
    fillTime:`2026/8/${String(index % 28 + 1).padStart(2,'0')} 09:00`,
    arriveTime:`2026/8/${String(index % 28 + 1).padStart(2,'0')} 10:00`,
    code:index % 2 ? 'DNB10307' : 'DNB10440', store:index % 2 ? '三創' : '台北六張犁',
    month:'2026-08', item:String(index % 33 + 1), result:'v', reason:'', inspector:'不應回傳'
  }));
  const env = runtime(rows);
  const page1 = env.read({month:'2026-08',page:1,limit:500});
  const page2 = env.read({month:'2026-08',page:2,limit:500});
  const page3 = env.read({month:'2026-08',page:3,limit:500});

  assert.equal(env.scans(), 1);
  assert.equal(page1.totalPages, 3);
  assert.equal(page1.rows.length, 500);
  assert.equal(page2.rows.length, 500);
  assert.equal(page3.rows.length, 1);
  assert.equal(page1.diagnostics.sheetScans, 1);
  assert.equal(page2.diagnostics.sheetScans, 0);
  assert.equal(page2.diagnostics.cacheHit, true);
  assert.equal(page3.diagnostics.cacheHit, true);
  assert.ok(Buffer.byteLength(JSON.stringify(page1), 'utf8') < 95000);
  assert.deepEqual(Object.keys(page1.rows[0]).sort(), ['arriveTime','code','fillTime','month','store']);
  assert.ok(page1.rows.every(row => row.store === '台北三創' || row.store === '台北六張犁'));
});

test('月份 filter 不污染跨月，未知店點保留給前端 reason 檢查', () => {
  const env = runtime([
    {fillTime:'2026/7/31 09:00',arriveTime:'2026/7/31 10:00',code:'DNB10307',store:'三創',month:'2026-07'},
    {fillTime:'2026/8/1 09:00',arriveTime:'2026/8/1 10:00',code:'UNKNOWN',store:'台北臨時點',month:'2026-08'},
  ]);
  const result = env.read({month:'2026-08',page:1,limit:500});
  assert.equal(env.scans(), 1);
  assert.equal(result.totalRows, 1);
  assert.equal(result.rows[0].month, '2026-08');
  assert.equal(result.rows[0].store, '台北臨時點');
});
