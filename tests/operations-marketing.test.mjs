import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectMarketing} from '../operations-marketing-core.mjs';
import fixture from './operations-fixtures.cjs';
test('marketing follows slide order and suppresses text covered by full-page picture',async()=>{
  const {createRequire}=await import('node:module'),JSZip=createRequire(import.meta.url)('../assets/vendor/store-presentation/jszip-3.10.1.min.js');const m=await inspectMarketing(await fixture.marketingZip(JSZip));
  assert.equal(m.pageCount,2);assert.match(m.pages[0].text,/SYNTHETIC行銷政策 2026年8月 & 測試用/);assert.equal(m.pages[1].text,'');assert.equal(m.pages[1].covered,true);assert.doesNotMatch(JSON.stringify(m),/STALE-HIDDEN/);assert.match(m.pages[1].status,/未OCR/);
});
