'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
const start = code.indexOf("const PATROL_SHEET = '巡店明細';");
const end = code.indexOf('\nfunction readPatrol()', start);
assert.ok(start >= 0 && end > start, 'patrol write source is present');
const source = code.slice(start, end);

function createSheet(initialRows) {
  const rows = initialRows.map(row => row.slice());
  const sheet = {
    getDataRange: () => ({getValues: () => rows.map(row => row.slice())}),
    getLastRow: () => rows.length,
    appendRow: row => rows.push(row.slice()),
    setFrozenRows: () => {},
    getRange(row, column, rowCount, columnCount) {
      return {
        setNumberFormat: () => {},
        setValue(value) { rows[row - 1][column - 1] = value; },
        setValues(values) {
          for (let r = 0; r < rowCount; r += 1) {
            if (!rows[row - 1 + r]) rows[row - 1 + r] = [];
            for (let c = 0; c < columnCount; c += 1) rows[row - 1 + r][column - 1 + c] = values[r][c];
          }
        }
      };
    }
  };
  return {sheet, rows};
}

function harness(initialRows) {
  const state = createSheet(initialRows);
  const lock = {waitLock: () => {}, releaseLock: () => {}};
  const context = vm.createContext({
    JSON,
    Date,
    SPREADSHEET_ID: 'synthetic',
    SpreadsheetApp: {openById: () => ({getSheetByName: () => state.sheet, insertSheet: () => state.sheet})},
    LockService: {getScriptLock: () => lock},
    Utilities: {formatDate: value => value.toISOString().replace('T', ' ').slice(0, 16)}
  });
  vm.runInContext(source, context);
  return {...state, context};
}

test('同鍵巡店資料以最新上傳完整覆寫，內容相同時不重寫', () => {
  const headers = ['fillTime','arriveTime','leaveTime','district','code','store','inspector','item','result','reason','month','savedAt'];
  const existing = ['2026/9/29 16:43','2026/9/29 16:00','2026/9/29 18:00','北一二B','DNB10174','台北通化','舊督導','1','v','','2026-09','old'];
  const env = harness([headers, existing]);
  const latest = {
    fillTime:'2026/9/29 16:43', arriveTime:'2026/9/29 15:55', leaveTime:'2026/9/29 18:10',
    district:'北一二B', code:'DNB10174', store:'台北通化', inspector:'新督導', item:1,
    result:'na', reason:'最新補充原因', month:'2026-09'
  };

  const first = env.context.writePatrol([latest]);
  assert.deepEqual({...first}, {written:0, updated:1});
  assert.deepEqual(env.rows[1].slice(0, 11), [
    latest.fillTime, latest.arriveTime, latest.leaveTime, latest.district, latest.code, latest.store,
    latest.inspector, '1', latest.result, latest.reason, latest.month
  ]);
  assert.notEqual(env.rows[1][11], 'old');

  const second = env.context.writePatrol([latest]);
  assert.deepEqual({...second}, {written:0, updated:0});
});
