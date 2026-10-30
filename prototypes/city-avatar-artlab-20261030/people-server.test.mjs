import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPeopleServer,DEADLINE,COOKIE} from './people-server.mjs';
const people=['a','b','c'].map((key,i)=>({key,employeeId:'999000'+(i+1),nickname:'Synthetic '+key,active:true,preset:'portrait-trial-'+key+'-v1'}));
test('three-person trial: isolated stable roles, strict game-only access, no reward replay, expiry',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'city-portrait-people-'));let clock=Date.parse('2026-10-30T00:00:00Z'),app;
 async function start(){app=createPeopleServer({dataDir:dir,port:0,people,now:()=>clock});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));return 'http://127.0.0.1:'+app.server.address().port;}
 let base=await start();
 const req=async(path,body,cookie,origin=base,csrf)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json',origin}:{}),...(cookie?{cookie}:{}),...(csrf?{'x-city-csrf':csrf}:{})},body:body?JSON.stringify(body):undefined});return{status:r.status,cookie:r.headers.get('set-cookie')?.split(';')[0],data:await r.json().catch(()=>null)};};
 try{
  const before=app.store.db.prepare("SELECT count(*) n FROM users WHERE account_kind='guest'").get().n;assert.equal(before,3);
  const sessions=[];
  for(const row of people){const r=await req('/api/play-login',{employeeId:row.employeeId});assert.equal(r.status,200);assert.ok(r.cookie.startsWith(COOKIE+'='));assert.equal(r.data.profile.avatarPreset,row.preset);assert.equal(r.data.playLogin.formalIdentityVerified,false);assert.equal(r.data.wallet.coins,100);sessions.push(r);}
  assert.equal(new Set(sessions.map(r=>r.data.profile.id)).size,3);
  const a=sessions[0],again=await req('/api/play-login',{employeeId:people[0].employeeId});assert.equal(again.data.profile.id,a.data.profile.id);assert.deepEqual(again.data.wallet,a.data.wallet);
  assert.equal((await req('/api/play-login',{employeeId:people[1].employeeId},a.cookie)).status,409);
  assert.equal((await req('/api/play-login',{employeeId:'9999999'})).status,404);
  assert.notEqual((await req('/api/guest',{nickname:'Unlisted',registrationKey:'a'.repeat(48)})).status,200);assert.equal(app.store.db.prepare("SELECT count(*) n FROM users WHERE account_kind='guest'").get().n,3);
  assert.equal((await req('/api/play-login',{employeeId:people[0].employeeId},null,'https://other.invalid')).status,403);
  assert.equal((await req('/api/play-login',{employeeId:people[0].employeeId,extra:true})).status,400);
  for(const p of ['/api/recovery-card','/api/device/register','/api/employee/bind'])assert.equal((await req(p,{},a.cookie,base,a.data.csrf)).status,403);
  assert.equal((await req('/api/profile',{nickname:'Changed'},a.cookie)).status,403);
  for(const p of ['/.private-people-config/people.json','/people-login.mjs','/base/.private-v42-three-people/city.sqlite','/assets/portrait-hair/a.blend'])assert.equal((await req(p)).status,404);
  const bootstrap=await req('/api/session',null,a.cookie);assert.equal(bootstrap.data.profile.id,a.data.profile.id);assert.equal(bootstrap.data.access.businessBuildings,false);
  await app.close();base=await start();assert.equal(app.store.db.prepare("SELECT count(*) n FROM users WHERE account_kind='guest'").get().n,3);
  const re=await req('/api/play-login',{employeeId:people[0].employeeId});assert.equal(re.data.profile.id,a.data.profile.id);assert.deepEqual(re.data.wallet,a.data.wallet);
  clock=DEADLINE;assert.equal((await req('/api/session',null,re.cookie)).status,410);
 }finally{await app.close();await rm(dir,{recursive:true,force:true});}
});
