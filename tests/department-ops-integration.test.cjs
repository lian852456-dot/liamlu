'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {runtime}=require('./helpers/department-ops-integration-runtime.cjs');
const Scores=require('../department-scores-core.js'),F=require('./helpers/department-scores-synthetic.cjs'),Gold=require('../department-gold-monthly-core.js');
const actions=['department_ops_read','department_ops_publish','department_store_rules_read','department_scores_read','department_scores_history_read','department_scores_publish','department_scores_restore'];
function goldMonth(){return Gold.validateMonth({schema:Gold.SCHEMA,monthKey:'2026-09',sheetName:'合成工作表',sourceName:'synthetic.xlsx',sourceHash:'a'.repeat(64),dateRange:{start:'2026-09-01',end:'2026-09-28',cutoff:'2026-09-28'},settlementStatus:'provisional',finalConfirmed:false,records:[{employeeId:'SYN001',employeeName:'合成同仁',region:'北一二B',storeCode:'SYN-B',store:'合成金牌店',role:'合成職稱',medal:12,sourceRow:4,sourceFields:[]}],validation:{sourceTotal:12}});}
function scorePayload(token,generation=0){return {action:'department_scores_publish',token,contract:Scores.CONTRACT,confirm:true,requestId:crypto.randomUUID(),expectedGeneration:generation,selectedMonthKeys:['2026-07'],months:[F.month({month:7})],sourceName:'synthetic.xlsx',sourceHash:'b'.repeat(64)};}
test('all merged private routes reject anonymous and forged tokens before any Drive access',()=>{
  for(const token of [undefined,'SYNTHETIC_FORGED'])for(const action of actions){const r=runtime(),before=r.reads,result=r.post({action,token});assert.notEqual(result.status,'ok',action);assert.equal(r.reads,before,action);assert.equal(r.writes,0,action);assert.doesNotMatch(JSON.stringify(result),/SYNTHETIC_COMBINED_RULE|合成保留|合成同仁|fileId/);}
});
test('one signed session reads all three modules; version writes preserve other domains and Q2',()=>{
  const r=runtime(),token=r.post({action:'ptauth',key:'synthetic-passcode'}).token;
  assert.equal(r.post({action:'department_store_rules_read',token}).document.rules[0].instruction,'SYNTHETIC_COMBINED_RULE');
  assert.equal(r.post(scorePayload(token)).generation,1);
  const scoreBytes=[...r.files.values()].filter(f=>f.name.startsWith('north12-scores-')||f.name==='north12-department-store-scores-v2.json').map(f=>[f.getId(),f.content]);
  const read=r.post({action:'department_ops_read',token});assert.equal(read.status,'ok');assert.deepEqual(read.gold.months[0].records,r.q2.records);
  const payload={action:'department_ops_publish',token,contract:'north12-monthly-write/v2',mode:'plan',operationId:crypto.randomUUID(),expectedRevision:read.monthly.revision,months:[goldMonth()]};
  const before=r.writes,plan=r.post(payload);assert.equal(plan.result,'preview');assert.equal(r.writes,before);
  const committed=r.post({...payload,mode:'commit',confirm:true,planReceipt:plan.planReceipt});assert.equal(committed.result,'committed');
  assert.deepEqual(committed.gold.months.find(m=>m.monthKey==='2026-06').records,r.q2.records);
  for(const [id,content]of scoreBytes)assert.equal(r.files.get(id).content,content);
  const goldBytes=[...r.files.values()].filter(f=>f.name.startsWith('north12-department-gold-')).map(f=>[f.getId(),f.content]);
  const next=scorePayload(token,1);next.sourceHash='c'.repeat(64);
  const corrected=next.months[0].records[0];corrected.score=98;corrected.deduction=2;
  for(const key of ['score','deduction']){corrected.source[key].value=corrected[key];corrected.source[key].raw=corrected[key];}
  const scoreResult=r.post(next);assert.equal(scoreResult.status,'ok',scoreResult.message);
  for(const [id,content]of goldBytes)assert.equal(r.files.get(id).content,content);
  assert.equal(r.post({action:'department_store_rules_read',token}).document.rules[0].instruction,'SYNTHETIC_COMBINED_RULE');
});
test('logout and expiration revoke all merged read and write routes without touching private data',()=>{
  for(const expired of [false,true]){const r=runtime(),token=r.post({action:'ptauth',key:'synthetic-passcode'}).token;if(expired)r.advance(43201);else r.post({action:'ptlogout',token});const reads=r.reads,writes=r.writes;for(const action of actions){assert.notEqual(r.post({action,token}).status,'ok',action);assert.equal(r.reads,reads,action);assert.equal(r.writes,writes,action);}}
});
test('none of the new module routes become anonymous GET entrypoints',()=>{
  const r=runtime(),token=r.post({action:'ptauth',key:'synthetic-passcode'}).token;
  for(const action of actions)assert.throws(()=>r.context.patrolGetRoute_(action,{token}),/unknown patrol action/);
  assert.equal(r.writes,0);
});
