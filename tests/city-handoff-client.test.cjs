const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),crypto=require('node:crypto');
const OWNER='https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
function fixture(){const calls=[],data=new Map(),storage={getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)},ctx=vm.createContext({crypto:crypto.webcrypto,Date,AbortController,setTimeout,clearTimeout,fetch:async(url,options)=>{
  const body=JSON.parse(options.body);calls.push({url,body});return {ok:true,json:async()=>({status:'ok',schema:'city-employee-handoff/v1',challengeId:body.challengeId,code:'CH1_'+'a'.repeat(64),expiresAt:Date.now()+60000,token:'MUST_NOT_EXPORT',deviceId:'MUST_NOT_EXPORT'})};}});
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'../GasBClient.js'),'utf8'),ctx);const api=ctx.createDashboardBClient(OWNER,{storage});
  const token='B1_a_'+'b'.repeat(64),device='SYNTHETIC_CITY_DEVICE';storage.setItem('north12b_password_session_v1',JSON.stringify({v:1,owner:OWNER,logoutEpoch:'',deviceId:device,token,expiresAt:Date.now()+120000}));
  const challenge={challengeId:'c'.repeat(32),nonceHash:'d'.repeat(64),audience:'north12b-city-formal-login',expiresAt:Date.now()+90000,worldId:'current-guests'};
  return {api,calls,data,device,token,challenge};
}
test('city handoff uses the existing verified session only on the pinned original owner endpoint',async()=>{
  const f=fixture();f.api.restore(f.device);const value=await f.api.issueCityHandoff(f.challenge);assert.equal(f.calls.length,1);assert.equal(f.calls[0].url,OWNER);assert.equal(f.calls[0].body.action,'employee_city_handoff');assert.equal(f.calls[0].body.token,f.token);
  assert.deepEqual(Object.keys(value).sort(),['challengeId','code','expiresAt','schema']);assert.equal(JSON.stringify(value).includes(f.token),false);assert.equal(JSON.stringify(value).includes('MUST_NOT_EXPORT'),false);
  assert.equal('employeeId'in f.calls[0].body,false);assert.equal('expiresAt'in f.calls[0].body,false);
});
test('missing session, raw nonce, employee injection, wrong world and expired challenges cannot issue a handoff',async()=>{
  const f=fixture();await assert.rejects(f.api.issueCityHandoff(f.challenge),/B_AUTH_DENIED/);f.api.restore(f.device);
  for(const patch of [{nonce:'raw-secret'},{employeeId:'forged'},{worldId:'other-world'},{expiresAt:0}])await assert.rejects(f.api.issueCityHandoff({...f.challenge,...patch}),/CITY_CHALLENGE_INVALID/);
  assert.equal(f.calls.length,0);
});
