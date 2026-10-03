import test from 'node:test';
import assert from 'node:assert/strict';
import {comparison} from '../scripts/north12b/dod.mjs';
test('missing prior leaves current publishable and marks comparison unavailable',()=>{
 for(const missing of [null,undefined,'尚未有資料']) {
  const r=comparison(.75,missing,true);assert.equal(r.value,null);assert.match(r.note,/前日無有效資料/);
 }
});
test('explicit zero with valid baseline compares normally',()=>{
 assert.equal(comparison(.75,0,true).value,.75);
 assert.equal(comparison(0,.5,true).value,-.5);
 assert.equal(comparison(0,0,true).value,0);
});
test('cross-month and untrusted all-zero placeholder do not invent DOD',()=>{
 assert.equal(comparison(.75,.5,false).value,null);
 assert.equal(comparison(.75,0,true,false).value,null);
});
test('current missing is preserved, invalid numbers cannot become a result',()=>{
 for(const v of [null,undefined,NaN,Infinity,'0']) assert.equal(comparison(v,.5,true).value,null);
});
