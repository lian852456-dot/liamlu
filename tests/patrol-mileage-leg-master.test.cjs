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

function runtime() {
  let sheet = null;
  let clock = 0;
  const rows = [];
  const makeSheet = () => ({
    appendRow(values) { rows.push([...values]); },
    getLastRow() { return rows.length; },
    setFrozenRows() {},
    getRange(row, column, height, width) {
      if (typeof row === 'string') return {setNumberFormat() {}};
      return {
        getDisplayValues() {
          return rows.slice(row - 1, row - 1 + height).map(values => values.slice(column - 1, column - 1 + width).map(String));
        },
        setValues(values) {
          values.forEach((value, index) => { rows[row - 1 + index] = [...value]; });
        },
      };
    },
  });
  const spreadsheet = {
    getSheetByName() { return sheet; },
    insertSheet() { sheet = makeSheet(); return sheet; },
  };
  const source = [
    'patrolMileageLegNode_', 'patrolMileageLegKey_', 'patrolMileageLegSheet_',
    'patrolMileageLegRecord_', 'readPatrolMileageLegs_', 'writePatrolMileageLeg_',
  ].map(functionSource).join('\n');
  const api = Function(
    'PATROL_MILEAGE_LEG_NODES', 'PATROL_MILEAGE_LEG_SHEET', 'PATROL_MILEAGE_LEG_HEADERS',
    'SPREADSHEET_ID', 'SpreadsheetApp', 'LockService', 'Utilities',
    `${source}; return {key:patrolMileageLegKey_,read:readPatrolMileageLegs_,write:writePatrolMileageLeg_};`,
  )(
    ['台北酒泉','台北大稻埕','台北三創','台北六張犁','台北復興南','台北萬大','台北通化','台北永吉','台北杭州南','台北電信'],
    '巡店里程路段主檔', ['routeKey','from','to','km','source','confirmedAt','createdAt','updatedAt'],
    'fixture', {openById:() => spreadsheet},
    {getScriptLock:() => ({waitLock() {}, releaseLock() {}})},
    {formatDate:() => `2026-09-29T10:00:${String(++clock).padStart(2, '0')}+08:00`},
  );
  return {api, rows, hasSheet:() => Boolean(sheet)};
}

test('人工路段主檔雙向共用、保留確認日且不建立時唯讀無副作用', () => {
  const env = runtime();
  assert.deepEqual(env.api.read(), []);
  assert.equal(env.hasSheet(), false, 'empty read must not create the sheet');

  const saved = env.api.write({from:'台北通化', to:'台北復興南', km:3.2, expectedUpdatedAt:''});
  assert.equal(saved.routeKey, '台北復興南|台北通化');
  assert.equal(env.api.key('台北復興南', '台北通化'), saved.routeKey);
  assert.equal(saved.km, 3.2);
  assert.equal(saved.source, '人工確認');
  assert.match(saved.confirmedAt, /^2026-09-29T/);
  assert.deepEqual(env.api.read(), [saved]);
  assert.deepEqual(env.rows[0], ['routeKey','from','to','km','source','confirmedAt','createdAt','updatedAt']);
});

test('修改既有路段採 optimistic concurrency 並維持 0.1 至 999 KM 驗證', () => {
  const env = runtime();
  const first = env.api.write({from:'台北通化', to:'台北復興南', km:3.2, expectedUpdatedAt:''});
  assert.throws(() => env.api.write({from:'台北復興南', to:'台北通化', km:3.3, expectedUpdatedAt:''}), /changed; reload/);
  const updated = env.api.write({from:'台北復興南', to:'台北通化', km:3.3, expectedUpdatedAt:first.updatedAt});
  assert.equal(updated.km, 3.3);
  assert.equal(updated.createdAt, first.createdAt);
  assert.notEqual(updated.confirmedAt, first.confirmedAt);
  assert.throws(() => env.api.write({from:'台北通化', to:'台北復興南', km:0, expectedUpdatedAt:updated.updatedAt}), /0.1 and 999/);
  assert.throws(() => env.api.write({from:'台北通化', to:'台北復興南', km:1000, expectedUpdatedAt:updated.updatedAt}), /0.1 and 999/);
});
