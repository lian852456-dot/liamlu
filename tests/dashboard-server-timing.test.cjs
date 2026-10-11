'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const fixturePath=path.join(__dirname,'dashboard-password-roster-renewal.test.cjs');
const moduleFixture={exports:{}};
vm.runInNewContext(fs.readFileSync(fixturePath,'utf8').split('\ntest(')[0]+'\nmodule.exports={fixture,passwordLogin};',
  {require,module:moduleFixture,exports:moduleFixture.exports,__dirname,__filename:fixturePath,console,process,Buffer,Set,Map});
const {fixture,passwordLogin}=moduleFixture.exports;
const call=(f,p)=>JSON.parse(f.ctx.privateDashboardGasBMaybePost_({postData:{type:'text/plain',contents:JSON.stringify(p)}}).text);
test('server profiling returns bounded fixed names and durations only, with unchanged response and lock semantics',()=>{
  const f=fixture(),result=call(f,{action:'employee_status'});
  assert.equal(result.status,'ok');assert.equal(result.enabled,true);
  assert.ok(result.serverTiming.some(r=>r.name==='lockWait'));
  assert.ok(result.serverTiming.some(r=>r.name==='flush'));
  assert.equal(result.serverTiming.at(-1).name,'request');
  assert.ok(result.serverTiming.length<=40);
  for(const row of result.serverTiming){assert.deepEqual(Object.keys(row).sort(),['ms','name']);assert.ok(Number.isFinite(row.ms)&&row.ms>=0);}
  assert.equal(f.held(),false);
});
test('invalid requests expose no server stages and cannot leave profiling state in a later request',()=>{
  const f=fixture();
  assert.deepEqual(call(f,{action:'employee_session',deviceId:'SYNTHETIC_DEVICE',token:'invalid'}),{status:'error',code:'B_AUTH_DENIED'});
  const result=call(f,{action:'employee_status'});assert.equal(result.status,'ok');
  assert.equal(result.serverTiming.filter(r=>r.name==='request').length,1);assert.equal(f.held(),false);
});
test('timing a login keeps credentials and tokens out of diagnostics and preserves the original lease limit',()=>{
  const f=fixture();f.ctx.privateDashboardBVerifyPassword_=()=>true;
  const p=passwordLogin('SYNTH002','SYNTHETIC_TIMING_DEVICE','SYNTHETIC_TIMING_PASSWORD','SYNTHETIC_TIMING_REQUEST','a');
  const result=call(f,p);assert.equal(result.status,'ok');
  const serialized=JSON.stringify(result.serverTiming);
  for(const secret of [p.employeeId,p.deviceId,p.password,p.sessionNonce,p.idempotencyKey,result.token])assert.equal(serialized.includes(secret),false);
  assert.ok(result.expiresAt>Date.now()&&result.expiresAt<=Date.now()+1800000);
  const checked=call(f,{action:'employee_session',deviceId:p.deviceId,token:result.token});
  assert.equal(checked.status,'ok');assert.equal(checked.expiresAt,result.expiresAt);
});
