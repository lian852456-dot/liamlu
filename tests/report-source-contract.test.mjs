import test from 'node:test';
import assert from 'node:assert/strict';
import {personalPresentationRow,personalPreviousRow,qisSourceScore,companyRank} from '../scripts/north12b/report_source_contract.mjs';

test('September onward manager uses own overall, metric targets and employee DOD, not store substitution',()=>{
  const person={employee_id:'fixture',store:'fixture-store',official:2.1846,items:{AQ:{a:10,t:8,reportRate:1.25}}};
  const store={official:1.057,items:{AQ:{a:40,t:50,reportRate:0.8}}};
  const row=personalPresentationRow(person,{category:'manager',reportDate:'2026-10-13',store});
  assert.equal(row.official,2.1846);assert.deepEqual(row.items,person.items);
  const priorPerson={official:2},priorStore={official:0.9};
  assert.equal(personalPreviousRow(person,{category:'manager',reportDate:'2026-10-13',byEmployee:new Map([['fixture',priorPerson]]),byStore:new Map([['fixture-store',priorStore]])}),priorPerson);
  assert.equal(row.official-priorPerson.official,0.1846000000000001);
});
test('missing manager personal KPI blocks; zero personal KPI is valid; pre-September behavior preserved',()=>{
  const person={employee_id:'fixture',store:'s',official:0,items:{}};
  assert.equal(personalPresentationRow(person,{category:'manager',reportDate:'2026-09-01',store:{official:4,items:{}}}).official,0);
  assert.throws(()=>personalPresentationRow({...person,official:null},{category:'manager',reportDate:'2026-09-01',store:{official:4,items:{}}}),/PERSONAL_KPI_SOURCE_MISSING/);
  assert.equal(personalPresentationRow(person,{category:'manager',reportDate:'2026-08-31',store:{official:4,items:{}}}).official,4);
});
test('QIS raw aggregate uses source F, not case-weighted mean',()=>{
  const stores=Array.from({length:9},(_,i)=>{const r=Array(11).fill(null);r[7]=i+1;r[8]=r[9]=r[10]=i===0?80:99.365;return r;});
  const agg=Array(6).fill(null);agg[5]=97.21333;
  const weighted=stores.reduce((n,r)=>n+r[7]*r[10],0)/stores.reduce((n,r)=>n+r[7],0);
  assert.notEqual(weighted,agg[5]);assert.equal(qisSourceScore(stores,agg),97.21333);
  assert.throws(()=>qisSourceScore(stores,null),/QIS_SOURCE_SCORE_MISSING/);
});
test('add-on ranking uses source company ranks in any source order',()=>{
  assert.deepEqual([{rank:306},{rank:4},{rank:269}].map(companyRank),[306,4,269]);
  assert.equal(companyRank({rank:null}),'尚未有資料');assert.throws(()=>companyRank({rank:0}),/COMPANY_RANK_INVALID/);
});
