import test from 'node:test';
import assert from 'node:assert/strict';
import {parseGoodSpeedSheets,GOOD_SPEED_RULE} from '../operations-goodspeed-core.mjs';
import fixture from './operations-fixtures.cjs';
test('BB source points, source progress and 36M ratios remain distinct; no PII or stale TBC',()=>{
  const m=parseGoodSpeedSheets(fixture.goodSpeedTables()),r=m.regions[1];
  assert.equal(m.storeCount,4);assert.equal(m.cutoff,'2026-10-27');assert.equal(r.points,3);assert.equal(r.target,5);assert.equal(r.pointsTargetRatio,.6);assert.equal(r.sourceProgress,.9);assert.equal(r.longTermShare,1/3);assert.equal(r.failures.uniqueOrders,1);assert.equal(r.failures.duplicateCancelFlagged,1);assert.equal(GOOD_SPEED_RULE.longTermMonths,36);
  assert.doesNotMatch(JSON.stringify(m),/PRIVATE-|SYNTHETIC-order/);assert.equal(r.failures.reasonCounts['C032 資料錯誤'],1);
});
test('local order dedup keeps V flags separate; unknown free reason is never exported',()=>{
  const t=fixture.goodSpeedTables();t['BB明細'].push([...t['BB明細'][2]]);t['BB明細'][3][50]='PRIVATE-UNRECOGNIZED-NOTE';const m=parseGoodSpeedSheets(t);
  assert.equal(m.regions[0].failures.rows,2);assert.equal(m.regions[0].failures.uniqueOrders,1);assert.equal(m.regions[0].failures.duplicateCancelFlagged,2);assert.doesNotMatch(JSON.stringify(m),/PRIVATE-/);
});
test('header drift, blank points, duplicate store and date conflict stop instead of producing zero',()=>{
  for(const mutate of [t=>t['BB店點'][0][54]='其他欄',t=>t['BB店點'][1][54]=null,t=>t['BB店點'].push(t['BB店點'][1]),t=>t['BB量能'][1][38]-=1,t=>t['BB明細'][2][2]='2026/11/01',t=>t['BB店點'][1][17]=4]){const t=fixture.goodSpeedTables();mutate(t);assert.throws(()=>parseGoodSpeedSheets(t));}
});
test('zero denominator is N/A and missing failure records are not called zero failures',()=>{
  const t=fixture.goodSpeedTables();t['BB明細']=t['BB明細'].slice(0,2);t['BB量能'][2][10]=0;const m=parseGoodSpeedSheets(t);assert.equal(m.regions[0].pointsTargetRatio,null);assert.match(m.regions[0].failures.status,/不等於0/);
});
