'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('../patrol-read-model.js');
const { stores } = require('./fixtures/patrol-summary-response.cjs');

function inspectionRows(store, date) {
  return Array.from({ length:12 }, (_, index) => ({
    fillTime:`${date.replaceAll('-', '/')} 12:00`,
    arriveTime:`${date.replaceAll('-', '/')} 09:00`,
    leaveTime:`${date.replaceAll('-', '/')} 11:00`,
    code:store.code,
    store:store.name,
    item:index + 2,
    result:'v',
    reason:'',
    month:date.slice(0, 7)
  }));
}

function summary(rows) {
  return model.summaryContract(rows, stores, '2026-08', new Date('2026-08-17T12:00:00+08:00'), {});
}

const firstRound = stores.flatMap((store, index) => inspectionRows(store, `2026-08-${String(index + 1).padStart(2, '0')}`));

test('8/15 uses the first-half round and keeps the second half at zero', () => {
  const progress = model.halfMonthProgress(summary(firstRound), '2026-08-15');
  assert.equal(progress.verified, true);
  assert.equal(progress.period.label, '上半月');
  assert.equal(progress.period.subtitle, '2026 年 08 月｜上半月 8/1–8/15');
  assert.equal(progress.currentCompleted, 9);
  assert.equal(progress.currentRemaining, 0);
  assert.equal(progress.currentRate, 1);
  assert.equal(progress.currentFullyDone, 0);
  assert.equal(progress.h1Completed, 9);
  assert.equal(progress.h2Completed, 0);
  assert.equal(progress.wholeCompleted, 9);
  assert.equal(progress.wholeTotal, 18);
});

test('8/16 starts a new round even when all nine stores completed the first half', () => {
  const progress = model.halfMonthProgress(summary(firstRound), '2026-08-16');
  assert.equal(progress.verified, true);
  assert.equal(progress.period.label, '下半月');
  assert.equal(progress.currentCompleted, 0);
  assert.equal(progress.currentRemaining, 9);
  assert.equal(progress.currentRate, 0);
  assert.equal(progress.currentFullyDone, 0);
  assert.equal(progress.currentMissingItems, 297);
  assert.equal(progress.wholeCompleted, 9);
});

test('8/17 counts one completed second-half store and deduplicates repeat inspections', () => {
  const secondRound = [
    ...inspectionRows(stores[8], '2026-08-17'),
    ...inspectionRows(stores[8], '2026-08-20')
  ];
  const progress = model.halfMonthProgress(summary(firstRound.concat(secondRound)), '2026-08-17');
  assert.equal(progress.verified, true);
  assert.equal(progress.currentCompleted, 1);
  assert.equal(progress.currentRemaining, 8);
  assert.equal(progress.currentRate, 1 / 9);
  assert.equal(progress.currentFullyDone, 0);
  assert.equal(progress.h1Completed, 9);
  assert.equal(progress.h2Completed, 1);
  assert.equal(progress.wholeCompleted, 10);
});

test('arrival and departure sessions never increase patrol completion', () => {
  const source = summary(firstRound);
  source.ptvisitEvents = [
    { date:'2026-08-17', action:'arrival', store:stores[8].name, visitSessionId:'arrival-only' },
    { date:'2026-08-17', action:'departure', store:stores[8].name, visitSessionId:'arrival-only' }
  ];
  const progress = model.halfMonthProgress(source, '2026-08-17');
  assert.equal(progress.currentCompleted, 0);
  assert.equal(progress.h2Completed, 0);
  assert.equal(progress.wholeCompleted, 9);
});
