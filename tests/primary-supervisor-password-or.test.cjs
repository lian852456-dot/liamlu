'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
// Reuse the complete B/native/device fixture without registering its own tests.
const prefix=fs.readFileSync(path.join(__dirname,'dashboard-password-roster-renewal.test.cjs'),'utf8').split('\ntest(')[0];
const mod={exports:{}};
vm.runInNewContext(prefix+'\nmodule.exports={fixture,passwordLogin,pbkdf2Verifier};',
  {require,module:mod,exports:mod.exports,__dirname,console,Buffer,process});
const ID='5510755',STAFF='SYNTH002',DEVICE='SYNTHETIC_PRIMARY_DEVICE';
const COMMON='SYNTHETIC original designated password',PT='SYNTHETIC independent supervisor password';
const URL='https://script.google.com/macros/s/AKfycbxqBtW2yQw_u4qqJ9Knz6CK34hAiunaa6lIQu4pMa8Ff2voJZCWKEh8MXTJ6qAoGTax/exec';
function runtime({nativeKdf=false}={}) {
  const f=mod.exports.fixture();let calls=0,available=true,responseTransform=x=>x,beforeRemote=()=>{},status=200;
  const clock=Date.now();
  f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID',ID);
  f.rows.DashboardUsers.push([ID,'SYNTHETIC_PRIMARY','北一二B','督導','active','','','']);
  if(nativeKdf){const c=JSON.parse(f.props.get('DASHBOARD_AUTH_B_CONFIG_V1'));c.verifier=mod.exports.pbkdf2Verifier(COMMON);f.props.set('DASHBOARD_AUTH_B_CONFIG_V1',JSON.stringify(c));}
  function proof(){return {status:'ok',deployment:'patrol-isolated-v1',sessionContract:'patrol-session-v2',expiresIn:43200,
    expiresAt:Math.floor(clock/1000)+43200,token:Buffer.from('SYNTHETIC EXISTING PATROL SESSION PROOF ONLY').toString('base64url')+'.'+'q'.repeat(43)};}
  f.ctx.UrlFetchApp.fetch=(url,options)=>{
    assert.equal(f.held(),false,'PT verification must be outside native/roster lock');
    calls++;assert.equal(url,URL);assert.equal(options.method,'post');assert.equal(options.contentType,'application/json');
    assert.equal(options.validateHttpsCertificates,true);assert.equal(options.muteHttpExceptions,true);
    const payload=JSON.parse(options.payload);assert.deepEqual(Object.keys(payload).sort(),['action','key']);assert.equal(payload.action,'ptauth');
    beforeRemote();if(!available)throw Error('SYNTHETIC timeout with private detail that must not be returned');
    let body=payload.key===PT?proof():{status:'error',code:'AUTH_CREDENTIAL_INVALID'};
    body=responseTransform(body);
    return {getResponseCode:()=>status,getContentText:()=>typeof body==='string'?body:JSON.stringify(body)};
  };
  const api=f.ctx.privateDashboardCreateGasB_(nativeKdf?{now:()=>clock}:{mode:'LOCAL_SYNTHETIC_ONLY',now:()=>clock,verify:p=>p===COMMON,sleep:()=>{}});
  const invoke=p=>JSON.parse(JSON.stringify(api.handle(JSON.stringify(p))));
  const request=(id,password,suffix='a',device=DEVICE)=>mod.exports.passwordLogin(id,device,password,'SYNTHETIC_OR_REQUEST_'+suffix,suffix);
  return {f,clock,proof,invoke,request,login:(id,password,suffix='a',device=DEVICE)=>invoke(request(id,password,suffix,device)),
    calls:()=>calls,available:v=>available=v,transform:fn=>responseTransform=fn,beforeRemote:fn=>beforeRemote=fn,status:v=>status=v};
}
test('5510755 accepts either existing password while original password avoids PT altogether',()=>{
  const r=runtime();assert.equal(r.login(ID,COMMON,'a').status,'ok');assert.equal(r.calls(),0);
  assert.equal(r.login(ID,PT,'b').status,'ok');assert.equal(r.calls(),1);
  assert.equal(r.login(ID,'SYNTHETIC wrong password','c').status,'error');assert.equal(r.calls(),2);
});
test('real existing PBKDF2 verifier is still applied before the separate synthetic PT authority',()=>{
  const r=runtime({nativeKdf:true});assert.equal(r.login(ID,COMMON,'a').status,'ok');assert.equal(r.calls(),0);
  assert.equal(r.login(ID,PT,'b').status,'ok');assert.equal(r.calls(),1);
  assert.equal(r.login(ID,'SYNTHETIC incorrect password','c').status,'error');
});
test('ordinary staff keep their designated password and can never forward input to PT',()=>{
  const r=runtime(),device='SYNTHETIC_STAFF_DEVICE';
  assert.equal(r.login(STAFF,COMMON,'a',device).status,'ok');
  assert.equal(r.login(STAFF,PT,'b',device).status,'error');assert.equal(r.calls(),0);
  assert.equal(r.login('SYNTHETIC_UNKNOWN',PT,'c',device).status,'error');assert.equal(r.calls(),0);
});
test('additional supervisors do not gain the primary supervisor password channel',()=>{
  const r=runtime();r.f.props.set('DASHBOARD_AUTH_B_SUPERVISORS_V1',JSON.stringify([STAFF]));
  assert.equal(r.login(STAFF,PT,'a','SYNTHETIC_OTHER_SUPERVISOR_DEVICE').status,'error');assert.equal(r.calls(),0);
  assert.equal(r.login(STAFF,COMMON,'b','SYNTHETIC_OTHER_SUPERVISOR_DEVICE').status,'ok');
});
test('5510755 must also remain the existing trusted employee; another configured primary gains no PT route',()=>{
  const r=runtime();r.f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID',STAFF);
  assert.equal(r.login(ID,PT,'a').status,'error');
  assert.equal(r.login(STAFF,PT,'b','SYNTHETIC_OTHER_SUPERVISOR_DEVICE').status,'error');assert.equal(r.calls(),0);
});
test('inactive or revoked primary identities fail before transmitting a password',()=>{
  for(const status of ['inactive','revoked']){const r=runtime();r.f.rows.DashboardUsers.at(-1)[4]=status;
    assert.equal(r.login(ID,PT,'a').status,'error');assert.equal(r.calls(),0);}
});
test('network interruption denies only the additional channel; valid original password remains available',()=>{
  const r=runtime();r.available(false);const failed=r.login(ID,PT,'a');assert.equal(failed.status,'error');
  assert.doesNotMatch(JSON.stringify(failed),/timeout|private detail|SYNTHETIC independent/);
  assert.equal(r.login(ID,COMMON,'b').status,'ok');assert.equal(r.calls(),1);
});
for(const [name,transform] of [
  ['HTML',()=>'<html>Sign in</html>'],['oversized response',()=> 'x'.repeat(16001)],
  ['wrong authority',x=>({...x,deployment:'other-authority'})],['wrong session contract',x=>({...x,sessionContract:'other-contract'})],
  ['missing token',x=>({...x,token:undefined})],['invalid token',x=>({...x,token:'not-a-session'})],
  ['expired proof',x=>({...x,expiresAt:1})],['extended expiry',x=>({...x,expiresAt:x.expiresAt+7200})],
  ['extra response fields',x=>({...x,role:'owner'})],['error proof',()=>({status:'error',code:'AUTH_CREDENTIAL_INVALID'})]
])test('rejects '+name+' from PT without creating a B session',()=>{
  const r=runtime(),before=[...r.f.props].filter(([k])=>k.startsWith('DASHBOARD_AUTH_B_SESS_V1_'));
  r.transform(transform);assert.equal(r.login(ID,PT,'a').status,'error');
  assert.deepEqual([...r.f.props].filter(([k])=>k.startsWith('DASHBOARD_AUTH_B_SESS_V1_')),before);
});
test('non-200 PT response cannot authenticate even with a valid-looking body',()=>{
  const r=runtime();r.status(503);assert.equal(r.login(ID,PT,'a').status,'error');
});
test('existing six-per-employee rate limit runs before any additional PT attempt',()=>{
  const r=runtime();for(let i=0;i<7;i++)assert.equal(r.login(ID,'SYNTHETIC wrong password',String.fromCharCode(97+i)).status,'error');
  assert.equal(r.calls(),6);
});
test('repeated login is idempotent and neither changes password state nor exposes the PT session',()=>{
  const r=runtime(),beforeConfig=r.f.props.get('DASHBOARD_AUTH_B_CONFIG_V1'),beforeKeys=[...r.f.props.keys()].sort();
  const first=r.login(ID,PT,'a'),again=r.login(ID,PT,'a');assert.equal(first.status,'ok');assert.equal(first.token,again.token);
  assert.equal(r.f.props.get('DASHBOARD_AUTH_B_CONFIG_V1'),beforeConfig);assert.deepEqual([...r.f.props.keys()].sort(),beforeKeys);
  const state=JSON.stringify([...r.f.props.values()])+JSON.stringify(first);
  assert.equal(state.includes(PT),false);assert.equal(state.includes(COMMON),false);assert.equal(state.includes(r.proof().token),false);
});
test('primary trust removal or revocation during PT verification prevents session issue',()=>{
  for(const kind of ['trust','revocation']){const r=runtime();r.beforeRemote(()=>{
    if(kind==='trust')r.f.props.delete('DASHBOARD_TRUSTED_EMPLOYEE_ID');else r.f.rows.DashboardUsers.at(-1)[4]='revoked';
  });assert.equal(r.login(ID,PT,'a').status,'error');}
});
test('existing config and binding CAS guards still reject in-flight changes',()=>{
  for(const key of ['DASHBOARD_AUTH_B_CONFIG_V1','DASHBOARD_AUTH_B_BIND_V1']){const r=runtime();r.beforeRemote(()=>{
    const value=JSON.parse(r.f.props.get(key));if(key.endsWith('CONFIG_V1'))value.epoch++;else value.revision++;
    r.f.props.set(key,JSON.stringify(value));
  });assert.equal(r.login(ID,PT,'a').status,'error');}
});
test('device scoping, phone continuation and logout retain the ordinary B rules',()=>{
  const r=runtime(),login=r.login(ID,PT,'a');assert.equal(login.status,'ok');const calls=r.calls();
  assert.equal(r.invoke({action:'employee_session',token:login.token,deviceId:'SYNTHETIC_OTHER_DEVICE'}).status,'error');
  assert.equal(r.invoke({action:'employee_session',token:login.token,deviceId:DEVICE}).status,'ok');
  const phone=r.invoke({action:'employee_phone_enroll',token:login.token,deviceId:DEVICE,phoneNonce:'b'.repeat(64)});assert.equal(phone.status,'ok');
  assert.equal(r.invoke({action:'employee_phone_resume',phoneToken:phone.phoneToken,deviceId:DEVICE,sessionNonce:'c'.repeat(64),idempotencyKey:'SYNTHETIC_OR_PHONE_RESUME_REQUEST_1'}).status,'ok');
  assert.equal(r.calls(),calls);
  assert.equal(r.invoke({action:'employee_logout',token:login.token,deviceId:DEVICE}).status,'ok');
  assert.equal(r.invoke({action:'employee_session',token:login.token,deviceId:DEVICE}).status,'error');
});
