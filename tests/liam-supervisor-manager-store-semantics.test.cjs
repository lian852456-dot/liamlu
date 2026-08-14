const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const app = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');

test('store mode renders manager management information from store KPI and AQ only', () => {
  assert.match(app, /<h2>店長管理資訊<\/h2>/);
  assert.match(app, /店績來自正式 kpiStores · AQ 來自個人 AQ actual/);
  assert.match(app, /managerStorePerformanceRows\(storePeople,stores\)/);
  assert.match(app, /storeView\.managers\.map\(managerStorePerformanceRow\)/);
  assert.match(app, /storeView\.staff\.map\(person=>personalPerformanceRow\(person\)\)/);
});

test('manager card never renders manager personal total, rank, DOD, or rank change', () => {
  const start=app.indexOf('function managerStorePerformanceRow(row)');
  const end=app.indexOf('function renderPersonalRegionControls',start);
  const renderer=app.slice(start,end);
  assert.match(renderer,/店 KPI/);
  assert.match(renderer,/公司排名/);
  assert.match(renderer,/店 KPI DOD/);
  assert.match(renderer,/店排名變化/);
  assert.match(renderer,/AQ/);
  assert.doesNotMatch(renderer,/person\.totalRate|person\.rank|person\.dod|person\.rankChange|總績效/);
});
