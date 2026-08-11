'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
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
  assert.match(appJs, /PatrolReadModel\.overview\(rows, configured, currentMonth/);
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
});
