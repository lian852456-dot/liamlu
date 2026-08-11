'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'gas/Code.gs'), 'utf8');

function loadVisitHarness() {
  const start = code.indexOf("const PATROL_VISIT_SHEET = '巡店到離店紀錄'");
  const end = code.indexOf('// ════════════════════════════════════\n// 督導半月檢查', start);
  assert.ok(start >= 0 && end > start, 'patrol visit block not found');
  const rows = [];
  let sheetCreated = false;
  let currentTime = new Date('2026-08-11T09:12:00+08:00');
  const sheet = {
    getLastRow: () => rows.length,
    appendRow: row => { rows.push(row.map(String)); },
    setFrozenRows: () => {},
    getRange: () => ({ setNumberFormat: () => {} }),
    getDataRange: () => ({ getDisplayValues: () => rows.slice() })
  };
  const spreadsheet = {
    getSheetByName: name => name === '巡店到離店紀錄' && sheetCreated ? sheet : null,
    insertSheet: () => { sheetCreated = true; return sheet; }
  };
  const context = vm.createContext({
    Map, Array, String, Number, Date, Object,
    SPREADSHEET_ID:'test-sheet',
    PT_STORES:[{code:'DNB10059',name:'台北通化'},{code:'DNB10307',name:'台北三創'}],
    ptSessionAuthorized_: token => token === 'valid-short-token',
    SpreadsheetApp:{ openById:() => spreadsheet },
    LockService:{ getScriptLock:() => ({ waitLock:() => {}, releaseLock:() => {} }) },
    Utilities:{
      formatDate:(_date,_zone,format) => format === 'yyyy-MM-dd' ? currentTime.toISOString().slice(0,10) : currentTime.toISOString(),
      getUuid:() => 'visit-session-1'
    }
  });
  vm.runInContext(code.slice(start, end), context);
  return { context, rows, advance(seconds) { currentTime = new Date(currentTime.getTime() + seconds * 1000); } };
}

test('patrol visit actions are isolated, token protected and do not alter existing endpoints', () => {
  assert.match(code, /action === 'ptvisit_read'[\s\S]*?ptAuthorized\(e\)[\s\S]*?readPatrolVisitEvents_/);
  assert.match(code, /action === 'ptvisit_write'\) result = writePatrolVisitEvent_\(payload\)/);
  assert.match(code, /PATROL_VISIT_SHEET = '巡店到離店紀錄'/);
  assert.match(code, /PATROL_VISIT_HEADERS = \['serverTime','date','action','store','note','visitSessionId'\]/);
  assert.match(code, /ptSessionAuthorized_\(body\.token\)/);
  assert.doesNotMatch(code, /Logger\.(?:log|info|warn)\([^\n]*(?:token|PT_KEY|passcode)/i);
});

test('arrival and departure use server time, one visit session and independent storage', () => {
  const harness = loadVisitHarness();
  const arrival = harness.context.writePatrolVisitEvent_({ action:'ptvisit_write', token:'valid-short-token', visitAction:'arrival', store:'通化', note:'例行巡店' });
  assert.equal(arrival.event.action, 'arrival');
  assert.equal(arrival.event.store, '台北通化');
  assert.equal(arrival.event.serverTime, '2026-08-11T01:12:00.000Z');
  assert.equal(arrival.event.visitSessionId, 'visit-session-1');

  harness.advance(60);
  const departure = harness.context.writePatrolVisitEvent_({ action:'ptvisit_write', token:'valid-short-token', visitAction:'departure', store:'台北通化', note:'' });
  assert.equal(departure.event.action, 'departure');
  assert.equal(departure.event.visitSessionId, arrival.event.visitSessionId);
  assert.equal(departure.events.length, 2);
  assert.equal(harness.rows.length, 3, 'header plus two independent visit event rows');
});

test('patrol visit write rejects unauthorized, invalid store, arbitrary fields and rapid taps', () => {
  const unauthorized = loadVisitHarness();
  assert.throws(() => unauthorized.context.writePatrolVisitEvent_({ action:'ptvisit_write', token:'bad-token', visitAction:'arrival', store:'通化', note:'' }), /unauthorized/);
  assert.throws(() => unauthorized.context.writePatrolVisitEvent_({ action:'ptvisit_write', token:'valid-short-token', visitAction:'arrival', store:'不存在', note:'' }), /invalid patrol store/);
  assert.throws(() => unauthorized.context.writePatrolVisitEvent_({ action:'ptvisit_write', token:'valid-short-token', visitAction:'arrival', store:'通化', note:'', extra:'no' }), /unexpected patrol visit field/);

  const rapid = loadVisitHarness();
  rapid.context.writePatrolVisitEvent_({ action:'ptvisit_write', token:'valid-short-token', visitAction:'arrival', store:'通化', note:'' });
  assert.throws(() => rapid.context.writePatrolVisitEvent_({ action:'ptvisit_write', token:'valid-short-token', visitAction:'arrival', store:'通化', note:'' }), /duplicate patrol visit action/);
});
