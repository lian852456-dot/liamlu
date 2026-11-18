'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./fixtures/report-save-gas.cjs');
const M=require('../daily-report-summary-model.js');
const date='2099-10-02',store='酒泉',name='合成同仁';
const storeWrite=(api,seg,data)=>api.reportWritePayload_({action:'write',date,store,seg,data});
const personWrite=(api,seg,data)=>api.personalWritePayload_({action:'pwrite',date,store,name,seg,record:{date,store,name,seg,data,failed:[],extra:{}}});
test('store and personal preserve separate cumulative 16/21 counts, zero and explicit blank',()=>{
 const {api}=setup();
 for(const seg of [16,21]){
  const n=seg===16?1:3;
  assert.equal(storeWrite(api,seg,{cobranded_card:n}).readback.cobranded_card,n);
  assert.equal(personWrite(api,seg,{cobranded_card:n+10}).readback.data.cobranded_card,n+10);
 }
 assert.equal(api.readData(date,21)[store].cobranded_card,3);
 assert.equal(api.readPersonal(date,21)[store][name].data.cobranded_card,13);
 for(const value of [0,'',null]){
  const expected=value===null?'':value;
  assert.equal(storeWrite(api,16,{cobranded_card:value}).readback.cobranded_card,expected);
  assert.equal(personWrite(api,16,{cobranded_card:value}).readback.data.cobranded_card,expected);
 }
 assert.equal(api.readData(date,21)[store].cobranded_card,3);
});
test('legacy absence stays unavailable; unrelated partial update preserves an existing count',()=>{
 const {api}=setup();storeWrite(api,16,{aq999:2});personWrite(api,16,{a999:2});
 assert.equal(api.readData(date,16)[store].cobranded_card,'');
 assert.equal(Object.hasOwn(api.readPersonal(date,16)[store][name].data,'cobranded_card'),false);
 storeWrite(api,16,{cobranded_card:4});storeWrite(api,16,{aq999:3});
 assert.equal(api.readData(date,16)[store].cobranded_card,4);
 const rows=M.project({status:'ok',data:{[store]:{date,seg:16,store,aq999:2}}},date,16,[store]);
 assert.equal(rows[0].values.cobranded_card,null);
 assert.equal(rows[0].missingFields.includes('cobranded_card'),false);
});
test('invalid counts are rejected before schema or data writes on both endpoints',()=>{
 for(const value of [-1,1.5,'1.5','garbage',true,{},[],Infinity,Number.MAX_SAFE_INTEGER+1]){
  const {api,sheets}=setup();
  assert.throws(()=>storeWrite(api,16,{cobranded_card:value}),/非負整數/);
  assert.throws(()=>personWrite(api,21,{cobranded_card:value}),/非負整數/);
  assert.equal(sheets.size,0);
 }
});
test('summary uses only current store source, excludes unavailable counts and keeps zero coverage',()=>{
 const row=(store,value)=>({date,seg:21,store,cobranded_card:value});
 const rows=M.project({status:'ok',data:{[store]:row(store,3),'通化':row('通化',0),'三創':row('三創','')}},date,21,[store,'通化','三創','六張犁']);
 assert.deepEqual(M.sum(rows,'cobranded_card'),{value:3,coverage:2,total:4});
 assert.equal(M.core.some(([key])=>key==='cobranded_card'),false,'not a required/core qualification rule');
 const invalid=M.values(row(store,1.5));assert.equal(invalid.cobranded_card,null);
});
test('三創 OP 5/9/14 stays independent of card count 2 and its fixed display target',()=>{
 const {api}=setup(),management={op_online:5,op_accum:9,op_target:14,mycharge_clicked:0,mycharge_tagged:0};
 const receipt=api.reportWritePayload_({action:'write',date,store:'台北三創',seg:21,data:{cobranded_card:2,management_focus_json:JSON.stringify(management)}});
 assert.equal(receipt.readback.cobranded_card,2);assert.deepEqual(JSON.parse(receipt.readback.management_focus_json),management);
 assert.equal(M.values(receipt.readback).op_target,14);assert.equal(M.values(receipt.readback).cobranded_card,2);
});
test('existing sheet appends only the new header; historical row cells stay untouched',()=>{
 const {api}=setup(),sh=api.getSheet();
 const oldHeaders=sh.rows[0].filter(h=>h!=='cobranded_card');
 const oldRow=oldHeaders.map(h=>({date:'2099-10-01',store,seg:16,aq999:2}[h]??''));
 sh.rows=[oldHeaders.slice(),oldRow.slice()];
 storeWrite(api,16,{cobranded_card:0});
 assert.deepEqual(sh.rows[0],[...oldHeaders,'cobranded_card']);assert.deepEqual(sh.rows[1],oldRow);
 assert.equal(api.readData('2099-10-01',16)[store].cobranded_card,'');
});
