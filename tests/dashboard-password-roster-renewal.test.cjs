'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const sourcePath=process.env.PASSWORD_ROSTER_CODE_PATH||require('node:path').join(__dirname,'../gas/Code.gs');
const sourceText=fs.readFileSync(sourcePath,'utf8');
const STORES=['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','三創','六張犁'];
const HEADERS=['employee_id','masked_name','store','role','status','device_id','device_bound_at','last_login_at'];
const REQ_HEADERS=['request_id','employee_id','device_id','requested_at','status','approved_at','approved_by','replaced_device_id'];
const OWNER='SYNTHETIC_OWNER',CONFIG='DASHBOARD_AUTH_B_CONFIG_V1',NATIVE='DASHBOARD_AUTH_NATIVE_V1',BIND='DASHBOARD_AUTH_B_BIND_V1',LIMIT='DASHBOARD_AUTH_B_LIMIT_V1',SESS='DASHBOARD_AUTH_B_SESS_V1_';
const ADMIN='SYNTHETIC_ADMIN_ONLY';
const deep=x=>JSON.parse(JSON.stringify(x));
const makeConfig=(now,version=7)=>{const members=Object.fromEntries(STORES.map((s,i)=>['SYNTH'+String(i+1).padStart(3,'0'),s]));return {v:1,owner:OWNER,epoch:3,verifier:{algorithm:'PBKDF2-HMAC-SHA256',iterations:600000,salt:'ab'.repeat(16),digest:'cd'.repeat(32)},authority:{version,sourceHash:'ef'.repeat(32),effectiveAt:now-1000,validUntil:now+3600000,members}};};
function fixture({enabled=true,clock=Date.now(),config=true,hookGet=()=>{},scriptId=OWNER,flipReadback=false}={}){
 let configReads=0;
 const props=new Map([['DASHBOARD_AUTH_OWNER_SCRIPT_ID',OWNER],['DASHBOARD_ROSTER_SHEET_ID','SYNTHETIC_ROSTER'],['DASHBOARD_ADMIN_SECRET',ADMIN]]);
 props.set(NATIVE,JSON.stringify({v:1,owner:OWNER,revision:0,subjects:{}}));
 if(config)props.set(CONFIG,JSON.stringify(makeConfig(clock)));
 props.set(BIND,JSON.stringify({v:1,owner:OWNER,revision:9,bindings:{SYNTH001:['aa'.repeat(32),4]}}));
 props.set(LIMIT,JSON.stringify({v:1,owner:OWNER,revision:4,start:clock,total:2,employees:{['aa'.repeat(32)]:1},devices:{['bb'.repeat(32)]:1}}));
 for(const b of '0123456789abcdef')props.set(SESS+b,JSON.stringify({v:1,owner:OWNER,revision:1,sessions:[],tombstones:[]}));
 const rows={DashboardUsers:[HEADERS.slice(),...STORES.map((store,i)=>['SYNTH'+String(i+1).padStart(3,'0'),'SYNTHETIC_MASK_'+i,store,'SYNTHETIC_ROLE',i===0?'active':'active',i===0?'SYNTHETIC_DEVICE_001':'','',''])],DashboardRequests:[REQ_HEADERS.slice()]};
 let held=false,reads=0,writes=[],forceReadbackMismatch=false;
 const sheet=name=>({getName:()=>name,getLastRow:()=>rows[name].length,getLastColumn:()=>rows[name][0].length,getRange:(r,c,h,w)=>({getValues:()=>{return Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>rows[name][r+i-1]?.[c+j-1]??''));},setValues:vals=>{assert.ok(held,'sheet write without lock');writes.push({name,r,c,h,w});for(let i=0;i<h;i++){rows[name][r+i-1]??=Array(rows[name][0].length).fill('');for(let j=0;j<w;j++)rows[name][r+i-1][c+j-1]=vals[i][j];}}})});
 const propsApi={getProperty:k=>{if(k===CONFIG){reads++;configReads++;}hookGet(k,props,configReads);if(k===CONFIG&&forceReadbackMismatch)return 'SYNTHETIC_READBACK_MISMATCH';return props.get(k)||null;},setProperty:(k,v)=>{assert.ok(held,'property write without lock');props.set(k,v);if(k===CONFIG&&flipReadback)forceReadbackMismatch=true;}};
 const context=vm.createContext({ScriptApp:{getScriptId:()=>scriptId},PropertiesService:{getScriptProperties:()=>propsApi},SpreadsheetApp:{openById:id=>{assert.equal(id,'SYNTHETIC_ROSTER');return {getSheetByName:sheet,insertSheet:()=>{throw Error('UNEXPECTED_SHEET_CREATE');}};},flush:()=>assert.ok(held,'flush without lock')},LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(held,false,'reentrant lock');held=true;},releaseLock:()=>{assert.equal(held,true);held=false;}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,value)=>[...crypto.createHash('sha256').update(String(value)).digest()],formatDate:()=> 'SYNTHETIC_TIME',getUuid:()=> 'SYNTHETIC_UUID',sleep:()=>{}},DriveApp:{},ContentService:{MimeType:{JSON:'application/json'},createTextOutput:t=>({text:t,setMimeType(){return this;}})},HtmlService:{},UrlFetchApp:{},Session:{},MimeType:{PLAIN_TEXT:'text/plain'},console});
 let src=sourceText.replace(/const PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ = (?:false|true);/, 'const PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ = '+enabled+';').replace(/const PRIVATE_DASHBOARD_GAS_PASSWORD_ENABLED_ = (?:false|true);/, 'const PRIVATE_DASHBOARD_GAS_PASSWORD_ENABLED_ = '+enabled+';');
 new vm.Script(src,{filename:sourcePath}).runInContext(context);
 return {ctx:context,props,rows,writes,counts:()=>({reads,writes:writes.length}),raw:()=>({props:new Map(props),rows:deep(rows)}),held:()=>held};
}
function members(statuses={}){return STORES.map((store,i)=>({employeeId:'SYNTH'+String(i+1).padStart(3,'0'),maskedName:'SYNTHETIC_MASK_'+i,store,role:'SYNTHETIC_ROLE',status:statuses[i]||'active'}));}
function sync(f,list=members()){return f.ctx.privateDashboardSyncRoster({adminSecret:ADMIN,members:list});}
function pbkdf2Verifier(password,salt='11'.repeat(16)){return {algorithm:'PBKDF2-HMAC-SHA256',iterations:600000,salt,digest:crypto.pbkdf2Sync(Buffer.from(password),Buffer.from(salt,'hex'),600000,32,'sha256').toString('hex')};}
function pbkdf2Verify(password,verifier){return crypto.pbkdf2Sync(Buffer.from(password),Buffer.from(verifier.salt,'hex'),verifier.iterations,32,'sha256').toString('hex')===verifier.digest;}
function rotationRequest(epoch,verifier=pbkdf2Verifier('SYNTHETIC_NEW_PASSWORD')){return {action:'employee_admin_rotate_password',adminSecret:ADMIN,expectedEpoch:epoch,verifier};}
function passwordLogin(employeeId,deviceId,password,idempotencyKey,nonceChar='a'){return {action:'employee_login',employeeId,deviceId,track:'password-bound',password,sessionNonce:nonceChar.repeat(64),idempotencyKey};}

test('nine-store sync renews password authority for exactly 48h without touching verifier/epoch/device/binding/session',()=>{const f=fixture(),before=new Map(f.props);const started=Date.now(),result=sync(f),after=JSON.parse(f.props.get(CONFIG));assert.equal(result.synced,9);assert.equal(after.authority.validUntil-after.authority.effectiveAt,48*60*60*1000);assert.ok(after.authority.effectiveAt>=started);assert.equal(after.authority.version,8);assert.match(after.authority.sourceHash,/^[a-f0-9]{64}$/);assert.deepEqual(Object.keys(after.authority.members).sort(),members().map(x=>x.employeeId).sort());for(const key of [BIND,LIMIT,...'0123456789abcdef'.split('').map(b=>SESS+b)])assert.equal(f.props.get(key),before.get(key),key);assert.equal(after.verifier.digest,JSON.parse(before.get(CONFIG)).verifier.digest);assert.equal(after.epoch,JSON.parse(before.get(CONFIG)).epoch);assert.equal(f.held(),false);});

test('missing config or incomplete nine-store source fail closed before sheet/native writes',()=>{for(const mode of ['missing','incomplete']){const f=fixture();if(mode==='missing')f.props.delete(CONFIG);const before=f.raw();const list=mode==='missing'?members():members({8:'active'}).slice(0,8);assert.throws(()=>sync(f,list),mode==='missing'?/B_STATE_REQUIRED|AUTH_STATE_REQUIRED/:/B_COMPLETE_ROSTER_REQUIRED/);assert.deepEqual(f.rows,before.rows);assert.deepEqual([...f.props],[...before.props]);assert.equal(f.writes.length,0);}});

test('sync never revives existing inactive or revoked rows',()=>{const f=fixture();f.rows.DashboardUsers[1][4]='inactive';f.rows.DashboardUsers[2][4]='revoked';sync(f,members());assert.equal(f.rows.DashboardUsers[1][4],'inactive');assert.equal(f.rows.DashboardUsers[2][4],'revoked');});

test('complete renewal demotes absent active staff while preserving device, revoked status, and primary supervisor',()=>{
 const f=fixture();
 const primary='SYNTH003';
 f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID',primary);
 const oldActive=f.rows.DashboardUsers[1],oldRevoked=f.rows.DashboardUsers[2],supervisor=f.rows.DashboardUsers[3];
 oldActive[5]='SYNTHETIC_OLD_ACTIVE_DEVICE';
 oldRevoked[4]='revoked';oldRevoked[5]='SYNTHETIC_REVOKED_DEVICE';
 supervisor[5]='SYNTHETIC_PRIMARY_DEVICE';
 const replacement=STORES.map((store,i)=>({employeeId:'NEWSYNTH'+String(i+1).padStart(3,'0'),maskedName:'SYNTHETIC_NEW_MASK_'+i,store,role:'SYNTHETIC_ROLE',status:'active'}));
 sync(f,replacement);
 assert.equal(oldActive[4],'inactive');
 assert.equal(oldActive[5],'SYNTHETIC_OLD_ACTIVE_DEVICE');
 assert.equal(oldRevoked[4],'revoked');
 assert.equal(oldRevoked[5],'SYNTHETIC_REVOKED_DEVICE');
 assert.equal(supervisor[0],primary);
 assert.equal(supervisor[4],'active');
 assert.equal(supervisor[5],'SYNTHETIC_PRIMARY_DEVICE');
});

test('authority CAS/readback failures reject renewal',()=>{let cas=false;const f=fixture({hookGet:(key,props,count)=>{if(key===CONFIG&&count>=2&&cas){const c=JSON.parse(props.get(CONFIG));c.authority.version++;props.set(CONFIG,JSON.stringify(c));}}});cas=true;assert.throws(()=>sync(f),/B_CONFIG_CHANGED/);cas=false;const g=fixture({flipReadback:true});assert.throws(()=>sync(g),/B_PERSISTENCE_FAILED/);});

test('gate off preserves original sync path and never reads B config',()=>{const f=fixture({enabled:false,scriptId:'REAL_OWNER_SCRIPT_123',hookGet:key=>{if(key===CONFIG)throw Error('B_CONFIG_MUST_NOT_BE_READ');}});f.props.delete(CONFIG);const result=sync(f);assert.equal(result.synced,9);assert.equal(f.held(),false);});

// Google Sheets returns numeric employee cells as numbers, unlike the existing
// privateDashboardRows adapter, which already converts every cell to text.
test('password native eligibility accepts numeric cells but retains canonical, status, duplicate and store guards',()=>{
 const f=fixture(),c=JSON.parse(f.props.get(CONFIG));delete c.authority.members.SYNTH001;c.authority.members['7000001']=STORES[0];
 const row=f.rows.DashboardUsers[1];row[0]=7000001;
 assert.equal(f.ctx.privateDashboardBStrictNative_('7000001',c,Date.now()).role,'employee');
 for(const status of ['inactive','revoked']){row[4]=status;assert.throws(()=>f.ctx.privateDashboardBStrictNative_('7000001',c,Date.now()),/B_ELIGIBILITY_DENIED/);}row[4]='active';
 row[0]=' 7000001';assert.throws(()=>f.ctx.privateDashboardBStrictNative_('7000001',c,Date.now()),/B_ELIGIBILITY_DENIED/);row[0]=7000001;
 f.rows.DashboardUsers.push([...row]);assert.throws(()=>f.ctx.privateDashboardBStrictNative_('7000001',c,Date.now()),/B_ELIGIBILITY_DENIED/);f.rows.DashboardUsers.pop();
 row[2]=STORES[1];assert.throws(()=>f.ctx.privateDashboardBStrictNative_('7000001',c,Date.now()),/B_ELIGIBILITY_DENIED/);
 assert.equal(f.writes.length,0);
});

test('trusted supervisor can use two devices without moving employee bindings; tokens remain device scoped and revocable',()=>{
 const f=fixture();const id='SYNTHBOSS';f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID',id);
 f.rows.DashboardUsers.push([id,'SYNTHETIC_BOSS','北一二B','督導','active','','','']);
 f.ctx.privateDashboardBVerifyPassword_=(password)=>password==='SYNTHETIC_PASSWORD';
 const before=f.props.get(BIND),api=f.ctx.privateDashboardCreateGasB_({});
 const login=(device,suffix,password='SYNTHETIC_PASSWORD')=>JSON.parse(JSON.stringify(api.handle(JSON.stringify({action:'employee_login',employeeId:id,deviceId:device,track:'password-bound',password,sessionNonce:suffix.repeat(64),idempotencyKey:'SYNTHETIC_IDEMPOTENCY_'+suffix}))));
 const d1='SYNTHETIC_SUPERVISOR_DEVICE_1',d2='SYNTHETIC_SUPERVISOR_DEVICE_2';
 assert.equal(login(d1,'c','WRONG').status,'error');
 const a=login(d1,'a'),b=login(d2,'b');assert.equal(a.status,'ok');assert.equal(b.status,'ok');assert.equal(f.props.get(BIND),before);
 const access=(token,device,action='employee_session')=>api.handle(JSON.stringify({action,token,deviceId:device}));
 assert.equal(access(a.token,d1).status,'ok');assert.equal(access(a.token,d2).status,'error');
 assert.equal(access(a.token,d1,'employee_logout').status,'ok');assert.equal(access(a.token,d1).status,'error');assert.equal(access(b.token,d2).status,'ok');
 f.props.delete('DASHBOARD_TRUSTED_EMPLOYEE_ID');assert.equal(access(b.token,d2).status,'error');
 f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID',id);f.rows.DashboardUsers.at(-1)[4]='revoked';assert.equal(access(b.token,d2).status,'error');
 assert.equal(f.props.get(BIND),before);
});

test('a full same-device login replaces its oldest lease without releasing the staff binding',()=>{
 const f=fixture();f.ctx.privateDashboardBVerifyPassword_=()=>true;
 // Distinct issuedAt values make "oldest" independent of host clock resolution.
 let time=Date.now();const api=f.ctx.privateDashboardCreateGasB_({now:()=>++time}),invoke=p=>api.handle(JSON.stringify(p));
 const id='SYNTH002',device='SYNTHETIC_REUSE_DEVICE';
 const requests='abcd'.split('').map(ch=>passwordLogin(id,device,'SYNTHETIC_PASSWORD','SYNTHETIC_REUSE_REQUEST_'+ch,ch));
 const leases=requests.map(invoke);
 assert.deepEqual(leases.map(x=>x.status),['ok','ok','ok','ok']);
 const first=leases[0],next=leases[3];
 assert.equal(invoke({action:'employee_session',deviceId:device,token:first.token}).status,'error');
 assert.equal(invoke(requests[0]).status,'error');
 for(let i=1;i<4;i++)assert.equal(invoke({action:'employee_session',deviceId:device,token:leases[i].token}).status,'ok');
 assert.equal(invoke({action:'employee_session',deviceId:device,token:next.token}).status,'ok');
 assert.equal(Object.keys(JSON.parse(f.props.get(BIND)).bindings).filter(x=>x===id).length,1);
});

test('a fourth supervisor login replaces only their oldest lease; admin reset still revokes all',()=>{
 const f=fixture();f.ctx.privateDashboardBVerifyPassword_=()=>true;f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID','SYNTH003');
 let time=Date.now();const api=f.ctx.privateDashboardCreateGasB_({now:()=>++time}),invoke=p=>api.handle(JSON.stringify(p));
 const devices=['SYNTHETIC_SUP_DEVICE_A','SYNTHETIC_SUP_DEVICE_B','SYNTHETIC_SUP_DEVICE_C','SYNTHETIC_SUP_DEVICE_D'];
 const leases=devices.map((device,i)=>invoke(passwordLogin('SYNTH003',device,'SYNTHETIC_PASSWORD','SYNTHETIC_SUP_REQUEST_'+i,'abcd'[i])));
 assert.deepEqual(leases.map(x=>x.status),['ok','ok','ok','ok']);
 assert.equal(invoke({action:'employee_session',deviceId:devices[0],token:leases[0].token}).status,'error');
 for(let i=1;i<4;i++)assert.equal(invoke({action:'employee_session',deviceId:devices[i],token:leases[i].token}).status,'ok');
 assert.equal(invoke({action:'employee_admin_reset_device',adminSecret:ADMIN,employeeId:'SYNTH003'}).status,'ok');
 for(let i=1;i<4;i++)assert.equal(invoke({action:'employee_session',deviceId:devices[i],token:leases[i].token}).status,'error');
});

test('admin-only B reset preserves employee status and other bindings, removes sessions and prevents replay',()=>{
 const f=fixture();f.ctx.privateDashboardBVerifyPassword_=()=>true;
 const api=f.ctx.privateDashboardCreateGasB_({}),invoke=p=>api.handle(JSON.stringify(p));
 const p={action:'employee_login',employeeId:'SYNTH002',deviceId:'SYNTHETIC_DEVICE_FOR_RESET',track:'password-bound',password:'SYNTHETIC_PASSWORD',sessionNonce:'a'.repeat(64),idempotencyKey:'SYNTHETIC_RESET_IDEMPOTENCY'};
 const a=invoke(p);assert.equal(a.status,'ok');const before=f.raw();
 assert.equal(invoke({action:'employee_admin_reset_device',adminSecret:'wrong',employeeId:p.employeeId}).status,'error');assert.deepEqual(f.raw(),before);
 assert.equal(invoke({action:'employee_admin_reset_device',adminSecret:ADMIN,employeeId:p.employeeId}).status,'ok');
 assert.deepEqual(f.rows,before.rows);assert.deepEqual(JSON.parse(f.props.get(BIND)).bindings.SYNTH001,JSON.parse(before.props.get(BIND)).bindings.SYNTH001);
 assert.equal(invoke({action:'employee_session',token:a.token,deviceId:p.deviceId}).status,'error');assert.equal(invoke(p).status,'error');
 assert.equal(invoke({...p,deviceId:'SYNTHETIC_REPLACEMENT_DEVICE',idempotencyKey:'SYNTHETIC_NEW_IDEMPOTENCY',sessionNonce:'b'.repeat(64)}).status,'ok');
});

test('additional supervisor exemption is admin-only, preserves primary supervisor and revokes on removal',()=>{
 const f=fixture();f.ctx.privateDashboardBVerifyPassword_=()=>true;f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID','SYNTH001');
 const api=f.ctx.privateDashboardCreateGasB_({}),invoke=p=>api.handle(JSON.stringify(p));
 const change={action:'employee_admin_supervisor',adminSecret:ADMIN,employeeId:'SYNTH002',enabled:true};
 assert.equal(invoke({...change,adminSecret:'wrong'}).status,'error');assert.equal(invoke(change).status,'ok');
 assert.equal(f.ctx.privateDashboardIsTrustedEmployee('SYNTH002'),false);assert.equal(f.ctx.privateDashboardBTrusted_('SYNTH002'),true);
 assert.equal(invoke({...change,employeeId:'SYNTH001',enabled:false}).status,'error');
 const p={action:'employee_login',employeeId:'SYNTH002',deviceId:'SYNTHETIC_NEW_SUPERVISOR_DEVICE',track:'password-bound',password:'SYNTHETIC_PASSWORD',sessionNonce:'c'.repeat(64),idempotencyKey:'SYNTHETIC_SUPERVISOR_IDEMPOTENCY'};
 const a=invoke(p);assert.equal(a.status,'ok');assert.equal(invoke({...change,enabled:false}).status,'ok');
 assert.equal(invoke({action:'employee_session',token:a.token,deviceId:p.deviceId}).status,'error');assert.equal(f.ctx.privateDashboardBTrusted_('SYNTH002'),false);
});

test('device reset during password verification prevents the old in-flight login from rebinding',()=>{
 const f=fixture(),api=f.ctx.privateDashboardCreateGasB_({});
 f.ctx.privateDashboardBVerifyPassword_=()=>true;
 // Factory captures its verifier, so recreate after installing the hook.
 f.ctx.privateDashboardBVerifyPassword_=()=>{assert.equal(api.handle(JSON.stringify({action:'employee_admin_reset_device',adminSecret:ADMIN,employeeId:'SYNTH002'})).status,'ok');return true;};
 const pending=f.ctx.privateDashboardCreateGasB_({});
 const result=pending.handle(JSON.stringify({action:'employee_login',employeeId:'SYNTH002',deviceId:'SYNTHETIC_OLD_IN_FLIGHT_DEVICE',track:'password-bound',password:'SYNTHETIC_PASSWORD',sessionNonce:'d'.repeat(64),idempotencyKey:'SYNTHETIC_IN_FLIGHT_REQUEST'}));
 assert.equal(result.status,'error');assert.equal(JSON.parse(f.props.get(BIND)).bindings.SYNTH002,undefined);
});

test('password rotation rejects invalid admin, shape and stale epoch requests without writes and exposes the current epoch',()=>{
 const f=fixture(),api=f.ctx.privateDashboardCreateGasB_({mode:'LOCAL_SYNTHETIC_ONLY',verify:pbkdf2Verify}),invoke=p=>api.handle(JSON.stringify(p));
 const epoch=JSON.parse(f.props.get(CONFIG)).epoch,request=rotationRequest(epoch),before=f.raw();
 for(const invalid of [
   {...request,adminSecret:'SYNTHETIC_WRONG_ADMIN'},
   {...request,verifier:{...request.verifier,digest:'not-a-digest'}},
   {...request,expectedEpoch:epoch-1},
   {...request,unexpected:'SYNTHETIC_EXTRA_FIELD'}
 ]) {
   assert.equal(invoke(invalid).status,'error');
   assert.deepEqual(f.raw(),before);
 }
 const listed=invoke({action:'employee_admin_list',adminSecret:ADMIN});
 assert.equal(listed.status,'ok');assert.equal(listed.passwordEpoch,epoch);
 assert.equal(f.held(),false);
});

test('password rotation writes only CONFIG, invalidates old password/session, accepts new password on the bound device, and preserves revoked eligibility',()=>{
 const f=fixture(),oldPassword='SYNTHETIC_OLD_PASSWORD',device='SYNTHETIC_ROTATION_DEVICE';
 const oldVerifier=pbkdf2Verifier(oldPassword,'22'.repeat(16)),config=JSON.parse(f.props.get(CONFIG));
 config.verifier=oldVerifier;f.props.set(CONFIG,JSON.stringify(config));
 const api=f.ctx.privateDashboardCreateGasB_({mode:'LOCAL_SYNTHETIC_ONLY',verify:pbkdf2Verify}),invoke=p=>api.handle(JSON.stringify(p));
 const first=invoke(passwordLogin('SYNTH002',device,oldPassword,'SYNTHETIC_OLD_LOGIN_1','a'));
 assert.equal(first.status,'ok');
 const before=f.raw(),nextVerifier=pbkdf2Verifier('SYNTHETIC_NEW_PASSWORD','33'.repeat(16));
 const rotated=invoke(rotationRequest(config.epoch,nextVerifier));
 assert.equal(rotated.status,'ok');assert.equal(rotated.passwordEpoch,config.epoch+1);
 const after=f.raw(),afterConfig=JSON.parse(after.props.get(CONFIG)),beforeConfig=JSON.parse(before.props.get(CONFIG));
 assert.equal(afterConfig.epoch,beforeConfig.epoch+1);
 assert.deepEqual(afterConfig.authority,beforeConfig.authority);
 assert.deepEqual(afterConfig.verifier,nextVerifier);
 for(const [key,value] of before.props)if(key!==CONFIG)assert.equal(after.props.get(key),value,key);
 assert.deepEqual(after.rows,before.rows);
 assert.equal(invoke({action:'employee_session',token:first.token,deviceId:device}).status,'error');
 assert.equal(invoke(passwordLogin('SYNTH002',device,oldPassword,'SYNTHETIC_OLD_AFTER_ROTATE','b')).status,'error');
 assert.equal(invoke(passwordLogin('SYNTH002',device,'SYNTHETIC_NEW_PASSWORD','SYNTHETIC_NEW_LOGIN_1','c')).status,'ok');
 f.rows.DashboardUsers[2][4]='revoked';
 assert.equal(invoke(passwordLogin('SYNTH002','SYNTHETIC_REVOKED_DEVICE','SYNTHETIC_NEW_PASSWORD','SYNTHETIC_REVOKED_LOGIN','d')).status,'error');
 assert.equal(f.rows.DashboardUsers[2][4],'revoked');
});

test('password rotation readback failure is rejected without changing native, binding, session or authority state',()=>{
 const f=fixture({flipReadback:true}),config=JSON.parse(f.props.get(CONFIG)),before=f.raw();
 const api=f.ctx.privateDashboardCreateGasB_({mode:'LOCAL_SYNTHETIC_ONLY',verify:pbkdf2Verify});
 const result=api.handle(JSON.stringify(rotationRequest(config.epoch,pbkdf2Verifier('SYNTHETIC_READBACK_PASSWORD','44'.repeat(16)))));
 assert.equal(result.status,'error');
 const after=f.raw(),afterConfig=JSON.parse(after.props.get(CONFIG));
 assert.deepEqual(after.rows,before.rows);
 for(const key of [NATIVE,BIND,LIMIT,...'0123456789abcdef'.split('').map(b=>SESS+b)])assert.equal(after.props.get(key),before.props.get(key),key);
 assert.deepEqual(afterConfig.authority,JSON.parse(before.props.get(CONFIG)).authority);
});

test('captured password login is rejected when an admin rotates the password concurrently',()=>{
 const f=fixture(),oldPassword='SYNTHETIC_IN_FLIGHT_PASSWORD',config=JSON.parse(f.props.get(CONFIG));
 config.verifier=pbkdf2Verifier(oldPassword,'55'.repeat(16));f.props.set(CONFIG,JSON.stringify(config));
 const nextVerifier=pbkdf2Verifier('SYNTHETIC_CONCURRENT_NEW_PASSWORD','66'.repeat(16));
 const admin=f.ctx.privateDashboardCreateGasB_({mode:'LOCAL_SYNTHETIC_ONLY',verify:pbkdf2Verify});
 let rotation;
 const pending=f.ctx.privateDashboardCreateGasB_({mode:'LOCAL_SYNTHETIC_ONLY',verify:(password,verifier)=>{
   rotation=admin.handle(JSON.stringify(rotationRequest(config.epoch,nextVerifier)));
   return pbkdf2Verify(password,verifier);
 }});
 const result=pending.handle(JSON.stringify(passwordLogin('SYNTH002','SYNTHETIC_CONCURRENT_DEVICE',oldPassword,'SYNTHETIC_CONCURRENT_LOGIN','e')));
 assert.equal(rotation.status,'ok');assert.equal(result.status,'error');
 assert.equal(JSON.parse(f.props.get(BIND)).bindings.SYNTH002,undefined);
});

// Sharing uses the same owner-local session transaction, device and eligibility gates.
function sharingFixture(){
 const f=fixture();f.ctx.privateDashboardBVerifyPassword_=()=>true;
 const api=f.ctx.privateDashboardCreateGasB_({});
 const files=new Map();let contentWrites=0;
 f.ctx.tradeinPerformanceFile_=name=>files.has(name)?{getBlob:()=>({getDataAsString:()=>files.get(name)}),setContent:body=>{assert.ok(f.held());contentWrites++;files.set(name,body);}}:null;
 f.ctx.tradeinPerformanceFolder_=()=>({createFile:(name,body)=>{assert.ok(f.held());contentWrites++;files.set(name,body);}});
 const invoke=p=>deep(api.handle(JSON.stringify(p)));
 const login=(id,n)=>invoke(passwordLogin(id,'SYNTHETIC_SHARE_DEVICE_'+n,'SYNTHETIC_PASSWORD','SYNTHETIC_SHARE_LOGIN_'+n,n));
 const one=login('SYNTH002','a'),two=login('SYNTH003','b');assert.equal(one.status,'ok');assert.equal(two.status,'ok');
 const call=(action,extra={},token=one.token,device='SYNTHETIC_SHARE_DEVICE_a')=>invoke({action:'employee_tradein_sharing_'+action,token,deviceId:device,month:'2026-10',...extra});
 const draft={id:'SYNTHETIC_CASE_0001',version:0,type:'成功成交',scenario:'SYNTHETIC_SCENARIO',approach:'SYNTHETIC_APPROACH',outcome:'SYNTHETIC_OUTCOME',image:''};
 return {f,files,call,draft,two,invoke,login,writes:()=>contentWrites};
}
test('sharing is private, crosses devices only after session verification, and derives authorship on the server',()=>{
 const x=sharingFixture();
 assert.equal(x.call('save',x.draft,'B1_0_'+'0'.repeat(64)).status,'error');assert.equal(x.writes(),0);
 assert.equal(x.call('save',x.draft,undefined,'SYNTHETIC_WRONG_DEVICE').status,'error');assert.equal(x.writes(),0);
 assert.equal(x.call('save',{...x.draft,owner:'SYNTH003'}).status,'error');assert.equal(x.writes(),0);
 const saved=x.call('save',x.draft);assert.equal(saved.status,'ok');assert.equal(saved.item.author,'SYNTHETIC_MASK_1');assert.equal(saved.item.store,'永吉');
 const peer=x.call('list',{},x.two.token,'SYNTHETIC_SHARE_DEVICE_b');assert.equal(peer.cases.length,1);assert.equal(peer.cases[0].editable,false);
 assert.ok(!JSON.stringify(peer).includes('SYNTH002'));assert.ok(!('image' in peer.cases[0]));
 assert.equal(x.call('save',{...x.draft,version:1},x.two.token,'SYNTHETIC_SHARE_DEVICE_b').status,'error');
 assert.equal(x.call('moderate',{id:x.draft.id,version:1,featured:true,hidden:true}).status,'error');assert.equal(x.writes(),1);
 x.f.rows.DashboardUsers[2][4]='revoked';assert.equal(x.call('list').status,'error');assert.equal(x.writes(),1);
});
test('sharing detects stale edits and ambiguous repeat submissions, bounds images, and isolates months',()=>{
 const x=sharingFixture();assert.equal(x.call('save',x.draft).status,'ok');
 assert.equal(x.call('save',x.draft).code,'SHARE_VERSION_CONFLICT');assert.equal(x.writes(),1);
 assert.equal(x.call('save',{...x.draft,version:1,image:'data:image/svg+xml;base64,PHN2Zz4='}).code,'SHARE_IMAGE_INVALID');
 assert.equal(x.call('save',{...x.draft,version:1,scenario:'x'.repeat(1001)}).code,'SHARE_INPUT_INVALID');
 assert.equal(x.call('save',{...x.draft,version:1,image:'data:image/png;base64,iVBORw0KGgoAAA=='}).status,'ok');
 assert.ok(x.call('detail',{id:x.draft.id}).item.image);assert.ok(!('image' in x.call('list').cases[0]));
 assert.equal(x.call('save',{...x.draft,version:2,image:null}).status,'ok');assert.ok(x.call('detail',{id:x.draft.id}).item.image);
 assert.equal(x.call('list',{month:'2026-11'}).cases.length,0);assert.equal(x.call('list',{month:'2026-99'}).status,'error');
 assert.equal(x.call('save',{...x.draft,version:3,image:''}).status,'ok');assert.equal(x.call('detail',{id:x.draft.id}).item.image,'');
});
test('only primary supervisor role manages sharing; hidden cases stay hidden from other staff',()=>{
 const x=sharingFixture();assert.equal(x.call('save',x.draft).status,'ok');
 x.f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID','SYNTHBOSS');x.f.rows.DashboardUsers.push(['SYNTHBOSS','SYNTHETIC_BOSS','北一二B','督導','active','','','']);
 const boss=x.login('SYNTHBOSS','c');assert.equal(boss.status,'ok');
 const moderate=(extra={})=>x.call('moderate',{id:x.draft.id,version:1,featured:true,hidden:true,...extra},boss.token,'SYNTHETIC_SHARE_DEVICE_c');
 assert.equal(moderate().status,'ok');assert.equal(x.call('list').cases.length,1);
 assert.equal(x.call('list',{},x.two.token,'SYNTHETIC_SHARE_DEVICE_b').cases.length,0);
 assert.equal(x.call('detail',{id:x.draft.id},x.two.token,'SYNTHETIC_SHARE_DEVICE_b').status,'error');
 assert.equal(moderate({version:2,hidden:false}).status,'ok');assert.equal(x.call('list',{},x.two.token,'SYNTHETIC_SHARE_DEVICE_b').cases[0].featured,true);
 x.f.rows.DashboardUsers.at(-1)[3]='業代';assert.equal(moderate({version:3}).status,'error');
});

test('authenticated new public case keeps verified ownership separate from self-filled name and cannot upgrade legacy',()=>{
 const x=sharingFixture(),month=new Date(Date.now()+8*3600000).toISOString().slice(0,7);
 const saved=x.call('save',{...x.draft,month,publicConsent:true,publicStore:'酒泉',publicAuthor:'自填非員編姓名'});assert.equal(saved.status,'ok');assert.equal(saved.item.authorUnverified,true);assert.equal(saved.item.author,'自填非員編姓名');assert.equal(saved.item.store,'酒泉');assert.equal(saved.item.editable,true);
 const stored=JSON.parse(x.files.get('north12b-tradein-sharing-'+month+'.json')).cases[0];assert.equal(stored.owner,'SYNTH002');assert.equal(stored.audience,'public-link/v1');
 assert.equal(x.call('save',{...x.draft,month,version:1,publicConsent:true,publicStore:'酒泉',publicAuthor:'改名'}).status,'error');
 assert.equal(x.call('save',{...x.draft,month,version:1}).status,'ok');assert.equal(x.call('save',{...x.draft,month,version:2},x.two.token,'SYNTHETIC_SHARE_DEVICE_b').status,'error');
});
