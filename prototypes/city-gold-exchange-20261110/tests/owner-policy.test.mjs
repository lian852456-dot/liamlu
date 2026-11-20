import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import os from 'node:os';
import path from 'node:path';
import {GameStore} from '../../city-interactions-release-20261110/runtime/core/game-store.mjs';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {createStaffOwnerBinding} from '../connection-20261111/owner/staff-owner-binding.mjs';
const code=fs.readFileSync(new URL('../connection-20261111/owner/CityEmployeeBridge.gs',import.meta.url),'utf8');
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture({database=null,uid='qa-original-city-user'}={}) {
 const ctx=vm.createContext({});vm.runInContext(code,ctx);
 const db=database||new DatabaseSync(':memory:'),props=new Map();let boundCount=0;let time=Date.parse('2026-11-11T02:00:00Z'),active=true,epoch='qa-original-b-epoch';
 let policy={schema:'city-owner-policy/v1',id:'qa-policy-20261111',generation:1,enabled:true,notBefore:time-1000,validUntil:time+86400000};
 const who=()=>({source:'B_LOCKED_SESSION',active,employeeId:'5514420',store:'三創',sessionEpoch:epoch,expiresAt:time+3600000,binding:{qa:'not-a-real-session'}});
 const bridge=ctx.CityEmployeeBridge.create({properties:{getProperty:k=>props.get(k)||null,setProperty:(k,v)=>props.set(k,v),deleteProperty:k=>props.delete(k)},
  readPolicy:()=>policy,now:()=>time,sha,assertDeployment(){},withLock:f=>f(),verifyBinding:()=>who()});
 const city=createStaffOwnerBinding({db,worldId:'current-guests',readPolicy:()=>policy,now:()=>time,
  authenticateCity:()=>({worldId:'current-guests',active:true,accountKind:'guest',userId:uid,sessionId:'qa-city-session-long-enough',userEpoch:1}),
  onBound:()=>boundCount++,redeemHandoff:input=>bridge.redeem(input),validateLease:input=>bridge.validate(input)});
 async function bind(){const challenge=city.issue({}, {employeeId:'5514420'}),issued=bridge.issueVerified(who(),{challengeId:challenge.challengeId,nonceHash:challenge.nonceHash,audience:challenge.audience,worldId:challenge.worldId});return city.complete({}, {challengeId:challenge.challengeId,code:issued.code});}
 return {db,props,bridge,city,bind,who,policy:()=>policy,removePolicy:()=>policy=null,change:p=>policy={...policy,...p},advance:ms=>time+=ms,revoke:()=>active=false,epoch:()=>epoch+='-changed',boundCount:()=>boundCount,close:()=>{if(!database)db.close();}};
}
test('new policy works beyond old deadline; renewal preserves same UID and does not replay first-bind effects',async()=>{
 const f=fixture();try{
  const b=await f.bind();assert.equal(b.cityUID,'qa-original-city-user');assert.equal((await f.city.principal({})).employeeId,'5514420');
  const before=f.db.prepare('SELECT employee_id,city_uid,created_at FROM city_employee_owners').get();
  f.advance(30*60*1000+1);
  await assert.rejects(f.city.principal({}),/EMPLOYEE_REVERIFY_REQUIRED/);
  await f.bind();assert.deepEqual(f.db.prepare('SELECT employee_id,city_uid,created_at FROM city_employee_owners').get(),before);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM city_employee_owners').get().n,1);assert.equal(f.boundCount(),1);
  assert.equal(f.db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name IN ('wallets','ledger','inventory')").get().n,0);
 }finally{f.close();}
});
test('policy rotation never revives old leases; renewed normal handoff can keep original role',async()=>{
 const f=fixture();try{
  await f.bind();const oldLease=f.city.serverLease({});f.change({id:'qa-policy-next-version',generation:2});
  assert.throws(()=>f.bridge.validate(oldLease),/CITY_LINK_DENIED/);
  await assert.rejects(f.city.principal({}),/EMPLOYEE_REVERIFY_REQUIRED/);
  assert.equal(f.city.status({}).requiresReverify,true);
  await f.bind();assert.equal((await f.city.principal({})).cityUID,'qa-original-city-user');
  f.change({enabled:false,generation:3});await assert.rejects(f.city.principal({}),/OWNER_POLICY_INACTIVE/);
 }finally{f.close();}
});
test('original revocation, epoch, expiry, audience and allowlist still enforced',async()=>{
 for(const reason of ['revoke','epoch','expire']){
  const f=fixture();try{await f.bind();if(reason==='revoke')f.revoke();if(reason==='epoch')f.epoch();if(reason==='expire')f.advance(86400001);
   await assert.rejects(f.city.principal({}),/CITY_LINK_SESSION_CHANGED|OWNER_POLICY_INACTIVE/);
  }finally{f.close();}
 }
 const f=fixture();try{
  const c=f.city.issue({}, {employeeId:'5514420'});
  assert.throws(()=>f.bridge.issueVerified({...f.who(),employeeId:'9999999'},{challengeId:c.challengeId,nonceHash:c.nonceHash,audience:c.audience,worldId:c.worldId}),/CITY_LINK_EMPLOYEE_REQUIRED/);
  assert.throws(()=>f.city.issue({}, {employeeId:'5514420',policyId:'qa-policy-next-version'}),/OWNER_FIELDS_INVALID/);
  f.change({validUntil:f.policy().notBefore,generation:2});assert.throws(()=>f.city.issue({}, {employeeId:'5514420'}),/OWNER_POLICY_INACTIVE/);
 }finally{f.close();}
});
test('legacy binding rows keep ownership but require a fresh normal proof under new policy',async()=>{
 const f=fixture();try{
  await f.bind();f.db.prepare("UPDATE city_employee_owners SET policy_id='', expires_at=0").run();
  const uid=f.db.prepare('SELECT city_uid FROM city_employee_owners').get().city_uid;
  await assert.rejects(f.city.principal({}),/EMPLOYEE_REVERIFY_REQUIRED/);
  await f.bind();assert.equal((await f.city.principal({})).cityUID,uid);
 }finally{f.close();}
});

test('normal renewal leaves existing synthetic wallet, inventory, progress and receipt rows unchanged',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'city-owner-renewal-'));
 const store=new GameStore(path.join(dir,'city.sqlite'),{seed:false});
 try{
  const guest=store.registerGuest({nickname:'隔離續綁QA',registrationKey:'a'.repeat(48)});
  store.run('UPDATE wallets SET coins=123,gold=7 WHERE user_id=?',guest.userId);
  store.run('INSERT INTO v4_metadata VALUES(?,?)','position:'+guest.userId,JSON.stringify({scene:'forest',x:2,z:3}));
  store.run('INSERT INTO inventory VALUES(?,?,?,?)','qa-item-id',guest.userId,'qa-existing-item',1);
  const tables=store.all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map(x=>x.name);
  const snapshot=()=>Object.fromEntries(tables.map(name=>[name,store.all('SELECT * FROM "'+name+'" ORDER BY rowid')]));
  const before=snapshot(),f=fixture({database:store.db,uid:guest.userId});
  await f.bind();f.advance(1800001);await f.bind();
  assert.deepEqual(snapshot(),before);assert.equal(f.boundCount(),1);
  assert.equal((await f.city.principal({})).cityUID,guest.userId);
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});

test('policy generation rollback and same-generation edits cannot resurrect an old lease',async()=>{
 const f=fixture();try{
  await f.bind();const original={...f.policy()},lease=f.city.serverLease({});
  f.change({id:'qa-next-policy-22',generation:2});
  assert.throws(()=>f.bridge.validate(lease),/CITY_LINK_DENIED/);
  await assert.rejects(f.city.principal({}),/EMPLOYEE_REVERIFY_REQUIRED/);
  f.change(original);
  assert.throws(()=>f.bridge.validate(lease),/CITY_LINK_POLICY_ROLLBACK/);
  await assert.rejects(f.city.principal({}),/OWNER_POLICY_ROLLBACK/);
  f.change({generation:3});await f.bind();const p3={...f.policy()},lease3=f.city.serverLease({});
  f.change({validUntil:f.policy().validUntil+1});
  assert.throws(()=>f.bridge.validate(lease3),/CITY_LINK_POLICY_ROLLBACK/);
  await assert.rejects(f.city.principal({}),/OWNER_POLICY_ROLLBACK/);
  f.change(p3);assert.throws(()=>f.bridge.validate(lease3),/CITY_LINK_POLICY_ROLLBACK/);
  await assert.rejects(f.city.principal({}),/OWNER_POLICY_ROLLBACK/);
 }finally{f.close();}
});

test('removing a policy retires its generation; restoring the same policy cannot revive proof',async()=>{
 const f=fixture();try{
  await f.bind();const original={...f.policy()},lease=f.city.serverLease({});f.removePolicy();
  assert.throws(()=>f.bridge.validate(lease),/CITY_LINK_POLICY_INACTIVE/);
  await assert.rejects(f.city.principal({}),/OWNER_POLICY_INACTIVE/);
  f.change(original);
  assert.throws(()=>f.bridge.validate(lease),/CITY_LINK_POLICY_ROLLBACK/);
  await assert.rejects(f.city.principal({}),/OWNER_POLICY_ROLLBACK/);
 }finally{f.close();}
});
