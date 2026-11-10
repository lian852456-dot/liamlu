import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,key} from './fixture.mjs';
import {createMonthlyDashboardSource,projectMonthlyRow} from '../connection-20261111/monthly-dashboard-source.mjs';
async function monthly(){
 const f=await fixture();let rev='qa-registry-uuid-1',total=20,otherSpent=3,missing=false,duplicate=false,reverseAfterRead=false;
 const row=()=>({employeeId:f.employeeId,employeeName:'隔離QA',region:'北一二B',store:'合成店點',medal:total});
 const raw=()=>({readContract:'department-version-read/v1',readVersion:rev+'-read',monthly:{revision:rev},gold:{type:'north12-monthly-v2',months:[
  {schema:'north12-department-gold-month/v2',monthKey:'2026-10',versionId:'old-month',records:[{employeeId:f.employeeId,medal:999}]},
  {schema:'north12-department-gold-month/v2',monthKey:'2026-11',versionId:rev+'-month',sourceHash:'a'.repeat(64),dateRange:{cutoff:'2026-11-10'},records:duplicate?[row(),row()]:[row()]}
 ]}});
 const adapter=createMonthlyDashboardSource({db:f.db,now:()=>Date.parse('2026-11-11T00:00:00Z'),verifyOwner:async()=>({...f.actor(),expiresAt:Date.parse('2026-11-11T00:01:00Z')}),
  readProtectedMonthly:async(actor,input)=>{assert.deepEqual(input,{});if(reverseAfterRead)f.set({enabled:false});return structuredClone(raw());},
  readExternalSpending:async()=>missing?null:{schema:'city-external-spending/v1',employeeId:f.employeeId,month:'2026-11',excludesLedger:'city-gold-exchange/v1',amount:otherSpent,version:'qa-prior-spend-'+otherSpent,receipt:'qa-spend-receipt'}});
 f.authority.verifySnapshot=adapter.verify;f.authority.readSnapshot=adapter.read;
 return {...f,adapter,row,raw,change(p){if('rev'in p)rev=p.rev;if('total'in p)total=p.total;if('otherSpent'in p)otherSpent=p.otherSpent;if('missing'in p)missing=p.missing;if('duplicate'in p)duplicate=p.duplicate;if('revoke'in p)reverseAfterRead=p.revoke;}};
}
test('exact current month net medals flow through HTTP debit and common city/dashboard balance without overwriting history',async()=>{
 const f=await monthly();try{
  const original=f.store.wallet(f.uid).coins,before=await f.source.balance(f.lease);
  assert.equal(before.sourceNet,20);assert.equal(before.earned,null);assert.equal(before.available,17);
  const requestId=key(),result=await f.engine.begin({}, {gold:5,requestId});
  assert.equal(result.consistent,true);assert.equal(result.gameCoins,original+250);assert.equal(result.goldBalance.available,12);
  const dash=projectMonthlyRow(f.row(),result.goldBalance);
  assert.equal(dash.medal,20);assert.equal(dash.sourceMedal,20);assert.equal(dash.availableMedal,12);
  assert.notEqual(dash.goldReadVersion,before.readVersion);
  assert.equal((await f.engine.begin({}, {gold:5,requestId})).gameCoins,original+250);
  f.change({rev:'qa-registry-uuid-2'});const refreshed=await f.source.balance(f.lease);
  assert.equal(refreshed.available,12);assert.equal(refreshed.sourceNet,20);assert.equal(projectMonthlyRow(f.row(),refreshed).availableMedal,12);
 }finally{await f.close();}
});
test('negative correction is preserved as net source and blocks spending, never imported as gross earned',async()=>{
 const f=await monthly();try{
  await f.engine.begin({}, {gold:5,requestId:key()});f.change({rev:'qa-registry-uuid-2',total:-2});
  const b=await f.source.balance(f.lease);assert.equal(b.sourceNet,-2);assert.equal(b.earned,null);assert.equal(b.available,0);assert.equal(b.deficit,10);
  await assert.rejects(f.engine.begin({}, {gold:1,requestId:key()}),/INSUFFICIENT_FORMAL_GOLD/);
 }finally{await f.close();}
});
test('unknown existing spend and duplicate employee cannot silently create an opening balance',async()=>{
 const f=await monthly();try{
  const coins=f.store.wallet(f.uid).coins;f.change({missing:true});
  await assert.rejects(f.engine.begin({}, {gold:1,requestId:key()}),/EXTERNAL_SPENDING_REQUIRED/);
  f.change({missing:false,duplicate:true});await assert.rejects(f.source.balance(f.lease),/MONTHLY_EMPLOYEE_NOT_UNIQUE/);
  assert.equal(f.store.wallet(f.uid).coins,coins);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM city_gold_debits').get().n,0);
 }finally{await f.close();}
});
test('opaque source versions are tracked durably and replayed older snapshots rejected',async()=>{
 const f=await monthly();try{
  const raw=await f.adapter.read(f.actor());await assert.rejects(f.adapter.verify(structuredClone(raw)),/UNATTESTED_MONTHLY_SNAPSHOT/);
  await f.source.balance(f.lease);f.change({rev:'qa-registry-uuid-2',total:21});await f.source.balance(f.lease);
  f.change({rev:'qa-registry-uuid-1',total:20});await assert.rejects(f.source.balance(f.lease),/MONTHLY_SOURCE_REPLAY/);
 }finally{await f.close();}
});
test('owner revoked during monthly source IO cannot debit or credit',async()=>{
 const f=await monthly();try{
  const coins=f.store.wallet(f.uid).coins;f.change({revoke:true});
  await assert.rejects(f.engine.begin({}, {gold:1,requestId:key()}),/MONTHLY_OWNER_REQUIRED/);
  assert.equal(f.store.wallet(f.uid).coins,coins);assert.equal(f.db.prepare('SELECT COUNT(*) n FROM city_gold_debits').get().n,0);
 }finally{await f.close();}
});

test('a newer monthly snapshot cannot reset previously verified external spending',async()=>{
 const f=await monthly();try{
  await f.source.balance(f.lease);f.change({rev:'qa-registry-uuid-2',otherSpent:7});
  assert.equal((await f.source.balance(f.lease)).available,13);
  f.change({rev:'qa-registry-uuid-3',otherSpent:0});
  await assert.rejects(f.source.balance(f.lease),/EXTERNAL_SPEND_REGRESSION_REQUIRES_REFUND_RECEIPT/);
  assert.equal(f.authority.projection(f.actor(),'2026-11').available,13);
  f.change({rev:'qa-registry-uuid-4',otherSpent:7});assert.equal((await f.source.balance(f.lease)).available,13);
 }finally{await f.close();}
});
