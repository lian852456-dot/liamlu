import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {randomBytes} from 'node:crypto';
import {CandidatePetStore} from '../candidate-store.mjs';import {products,validateSelection} from '../pricing.mjs';import {STORES} from '../runtime/store-base/game-config.mjs';
test('isolated same-price variants: ownership, atomic persistence, replay, peer projection',()=>{
 const dir=fs.mkdtempSync(new URL('../.private-qa/run-',import.meta.url));const file=dir+'/qa.sqlite';let s=new CandidatePetStore(file);try{
  for(const store of STORES)s.run('INSERT OR IGNORE INTO spaces(id,kind,owner) VALUES(?,?,?)','store:'+store.id,'store',store.id);
  const create=name=>s.registerGuest({nickname:name,registrationKey:randomBytes(24).toString('hex')}).userId;
  const a=create('QA貓'),b=create('QA狗'),c=create('QA餘額');
  for(const uid of[a,b])s.run('UPDATE wallets SET coins=200 WHERE user_id=?',uid);
  const legacy=s.purchase(a,{itemId:'pet-cat',requestId:'qa-legacy-cat-0001'});assert.equal(legacy.purchased.cost.coins,40);
  const before=s.wallet(a),req={itemId:'pet-cat-a-v1',variant:'gray-white',requestId:'qa-new-cat-000001'};
  const cat=s.purchaseA(a,req);assert.equal(cat.purchased.cost.coins,60);assert.equal(s.wallet(a).coins,before.coins-60);
  assert.deepEqual(s.purchaseA(a,req),JSON.parse(JSON.stringify(cat)));assert.equal(s.wallet(a).coins,100);
  assert.throws(()=>s.purchaseA(a,{...req,variant:'tabby'}),/IDEMPOTENCY_CONFLICT/);
  assert.throws(()=>s.purchaseA(a,{...req,variant:'black-white',requestId:'qa-rebuy-cat-0001'}),/ALREADY_OWNED/);
  assert.throws(()=>s.purchaseA(a,{...req,variant:'evil',requestId:'qa-invalid-cat-01'}),/INVALID_PET_VARIANT/);
  assert.throws(()=>s.purchaseA(a,{...req,coins:0}),/INVALID_FIELDS/);
  const dog=s.purchaseA(b,{itemId:'pet-dog-a-v1',variant:'dark-brown',requestId:'qa-new-dog-000001'});assert.equal(dog.purchased.cost.coins,75);assert.equal(s.wallet(b).coins,125);
  s.run('UPDATE wallets SET coins=59 WHERE user_id=?',c);assert.throws(()=>s.purchaseA(c,{...req,requestId:'qa-poor-cat-00001'}),/INSUFFICIENT_FUNDS/);assert.equal(s.inventory(c).length,0);
  const selection=s.selectA(a,{inventoryId:cat.purchased.inventoryId,expectedRevision:0,requestId:'qa-select-cat-001'}).petCompanion;
  assert.equal(selection.variant,'gray-white');assert.throws(()=>s.selectA(b,{inventoryId:cat.purchased.inventoryId,expectedRevision:0,requestId:'qa-cross-own-001'}),/PET_NOT_OWNED/);
  const peer=new CandidatePetStore(file);assert.deepEqual(peer.petCompanion(a),selection);peer.close();
  s.close();s=new CandidatePetStore(file);assert.deepEqual(s.petCompanion(a),selection);assert.equal(s.inventory(a).length,2);assert.equal(s.wallet(a).coins,100);assert.equal(s.get("SELECT COUNT(*) n FROM ledger WHERE user_id=? AND kind='PURCHASE'",a).n,2);
  for(const p of products)for(const v of p.variants)assert.equal(validateSelection(p.id,v.id).coins,p.kind==='cat'?60:75);
 }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
