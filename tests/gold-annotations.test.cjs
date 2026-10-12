'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Notes=require('../gold-annotations-core.js'),Daily=require('../gold-daily-core.js');
const fixture=()=>({schema:Notes.SCHEMA,mode:'annotation-only',batches:[{id:'synthetic-week-01',period:'2026-10-W1',title:'合成已扣說明',alreadyApplied:true,applyToBalance:false,descriptionTotal:-30,rows:[{store:'三創',displayName:'測試同仁甲',insuranceSales:1,attachRate:'25.00%',descriptionAmount:-20,criterion:'低於40%'},{store:'通化',displayName:'測試同仁乙',insuranceSales:2,attachRate:'45.00%',descriptionAmount:-10,criterion:'40%至未滿50%'}]}]});
test('already-applied explanations validate without changing any daily balance or delta',()=>{
 const ledger=Daily.validate({schema:Daily.SCHEMA,region:'北一二B',updatedAt:'2026-10-02',settlements:['2026-10-01','2026-10-02'].map((date,i)=>({date,status:'confirmed',source:'synthetic',recordedAt:date,rows:[{personKey:'synthetic-person-01',store:'三創',alias:'測試同仁甲',balance:40+i,reason:'合成每日來源',exemption:''}]}))});
 const before=JSON.stringify(ledger),changes=Daily.changes(ledger),input=fixture(),raw=JSON.stringify(input);
 const notes=Notes.validate(input);
 assert.equal(notes.batches[0].descriptionTotal,-30);assert.equal(notes.batches[0].applyToBalance,false);
 assert.equal(JSON.stringify(input),raw);assert.equal(JSON.stringify(ledger),before);assert.deepEqual(Daily.changes(ledger),changes);assert.equal(Daily.latest(ledger).rows[0].balance,41);
});
test('rejects unpaid notes, balance-applying instructions and private identity fields',()=>{
 for(const mutate of [n=>n.batches[0].alreadyApplied=false,n=>n.batches[0].applyToBalance=true,n=>n.batches[0].rows[0].employeeId='SYNTH001',n=>n.batches[0].rows[0].personKey='synthetic-person-01',n=>n.batches[0].balance=999,n=>n.batches[0].delta=-30]){
  const n=fixture();mutate(n);assert.throws(()=>Notes.validate(n));
 }
});
test('rejects duplicate batches, ambiguous people and mismatched total',()=>{
 for(const mutate of [n=>n.batches.push(structuredClone(n.batches[0])),n=>n.batches[0].rows.push(structuredClone(n.batches[0].rows[0])),n=>n.batches[0].descriptionTotal=-40]){const n=fixture();mutate(n);assert.throws(()=>Notes.validate(n));}
});
test('rejects malformed amounts, invalid rates and nonpublic schemas',()=>{
 for(const mutate of [n=>n.schema='north12b-private-gold-annotations/v1',n=>n.mode='deduction',n=>n.batches[0].rows[0].descriptionAmount=20,n=>n.batches[0].rows[0].descriptionAmount=-1.5,n=>n.batches[0].rows[0].attachRate='101.00%',n=>n.batches[0].rows[0].insuranceSales=-1,n=>n.batches[0].rows[0].displayName='SYNTH1234567']){const n=fixture();mutate(n);assert.throws(()=>Notes.validate(n));}
});
