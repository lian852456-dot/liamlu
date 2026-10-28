import test from 'node:test';
import assert from 'node:assert/strict';
import {validateFile,detectKind,validatePeriods,draftMetadata,cleanText,SECTIONS} from '../operations-brief-core.mjs';
test('35MB accepted; empty, invalid and oversized files stop',()=>{
  assert.equal(validateFile({size:35*1024*1024}),true);
  for(const size of [0,-1,NaN,51*1024*1024])assert.throws(()=>validateFile({size}));
});
test('actual byte signatures distinguish ZIP, legacy/encrypted Office and PDF',()=>{
  assert.equal(detectKind(new Uint8Array([80,75,3,4]).buffer),'zip');
  assert.equal(detectKind(new Uint8Array([208,207,17,224]).buffer),'ole');
  assert.equal(detectKind(new TextEncoder().encode('%PDF-1.7').buffer),'pdf');
  assert.equal(detectKind(new Uint8Array([0,1]).buffer),'binary');
});
test('separate periods are preserved and impossible dates rejected',()=>{
  const p=validatePeriods({meeting:'2026-10',sourceDate:'2026-08-25',storeMonth:'2026-07',goldEnd:'2026-09',policy:'2026年9月'});
  assert.equal(p.storeMonth,'2026-07');assert.equal(p.goldEnd,'2026-09');
  assert.throws(()=>validatePeriods({...p,sourceDate:'2026-02-30'}));
  assert.throws(()=>validatePeriods({...p,sourceDate:''}));
});
test('draft remains unmapped without inventing values, thresholds or failure counts',()=>{
  const m=draftMetadata({meeting:'2026-10',sourceDate:'2026-10-25',highlights:'合成測試資料'},[{name:'SYNTHETIC.xlsx',bytes:20,kind:'xlsx',sha256:'a'.repeat(64)}],{sha256:'b'.repeat(64)});
  assert.equal(m.status,'DRAFT_UNMAPPED');assert.equal(m.outputSlides,16);assert.equal(m.unresolved.length,7);
  assert.equal('points' in m,false);assert.equal('longTermMonths' in m,false);assert.equal('failureCount' in m,false);
  assert.equal(SECTIONS[4][2].includes('企客4G納入'),true);
});
test('bounded manual text keeps XML-safe source text and rejects control bytes',()=>{
  assert.equal(cleanText('<測試 & 原文>'),'<測試 & 原文>');assert.throws(()=>cleanText('x'.repeat(601)));assert.throws(()=>cleanText('\x00'));
});
