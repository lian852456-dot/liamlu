'use strict';
// Offline only. Load the caller's patched public-base Code.gs, not a local commit.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
// Owner handoff 7373d7d, 01 then 02. Default to this checkout for CI.
const codePath=process.env.OWNER_FENCE_CODE_PATH || require('node:path').join(__dirname,'../gas/Code.gs');
const source=fs.readFileSync(codePath,'utf8');
function block(name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,'missing '+name);let depth=0;for(let i=source.indexOf('{',start);i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}'&&--depth===0)return source.slice(start,i+1);}throw Error('Unterminated '+name);}
const headers=['employee_id','masked_name','store','role','status','device_id','device_bound_at','last_login_at'];
const requestHeaders=['request_id','employee_id','device_id','requested_at','status','approved_at','approved_by','replaced_device_id'];
const owner='LOCAL_TEST_OWNER_NOT_A_RESOURCE',payload={employeeId:'SYNTH001',deviceId:'SYNTHETIC_DEVICE_001',month:'2026-10'};
const functions=['privateDashboardProperties','privateDashboardRequiredProperty','privateDashboardHash','privateDashboardCleanEmployeeId','privateDashboardCleanDeviceId','privateDashboardAdminAuthorized','privateDashboardNow','privateDashboardIsTrustedEmployee','privateDashboardRoster','privateDashboardSheet','privateDashboardRows','privateDashboardWriteObject','privateDashboardUserByEmployeeId','privateDashboardRosterTransaction_','privateDashboardAuthBoundaryEnabled_','privateDashboardAuthOwnerConfig_','privateDashboardRequireAuthOwner_','privateDashboardAuthProvider_','privateDashboardAuthRun_','privateDashboardAuthNativeBegin_','privateDashboardAuthResumeNative_','privateDashboardAuthSheetKind_','privateDashboardAuthGuardSheet_','privateDashboardAuthGuardSheetName_','privateDashboardAuthGuardRoster_','privateDashboardGasAuthGate_','privateDashboardGasAuthDigest_','privateDashboardGasAuthJson_','privateDashboardCreateGasAuthStore_','privateDashboardCreateGasAuthProvider_','privateDashboardAuthNativeProvider_','privateDashboardTradeinReadBoundary_','tradeinPerformanceAuthorize_','tradeinPerformanceRead','tradeinPerformanceProjection_','privateDashboardAdminRevoke','privateDashboardAdminRestoreEligibility','privateDashboardSyncRoster','kpiCalcSetupSelf'];
function fixture({enabled=true,project=owner,initialize=true}={}){
 let held=false,acquires=0,releases=0,reads=0,failWrites=false,failFlush=false;
 const rows={DashboardUsers:[headers.slice(),['SYNTH001','SYNTHETIC_MASK_1','SYNTHETIC_STORE','SYNTHETIC_ROLE','active',payload.deviceId,'SYNTHETIC_TIME','SYNTHETIC_TIME']],DashboardRequests:[requestHeaders.slice()]};
 const props=new Map([['DASHBOARD_AUTH_OWNER_SCRIPT_ID',owner],['DASHBOARD_ROSTER_SHEET_ID','SYNTHETIC_ROSTER_ONLY'],['DASHBOARD_ADMIN_SECRET','SYNTHETIC_ADMIN_ONLY']]);
 if(initialize)props.set('DASHBOARD_AUTH_NATIVE_V1',JSON.stringify({v:1,owner,revision:0,subjects:{}}));
 const sheets=Object.fromEntries(Object.entries(rows).map(([name,values])=>[name,{getName:()=>name,getLastRow:()=>values.length,getLastColumn:()=>values[0].length,getRange:(r,c,h,w)=>({getValues:()=>Array.from({length:h},(_,i)=>Array.from({length:w},(_,j)=>values[r+i-1]?.[c+j-1]??'')),setValues:v=>{assert.ok(held);if(failWrites)throw Error('SYNTHETIC_WRITE_FAILED');for(let i=0;i<h;i++){values[r+i-1]??=Array(headers.length).fill('');for(let j=0;j<w;j++)values[r+i-1][c+j-1]=v[i][j];}}})}]));
 const propertyApi={getProperty:k=>props.get(k)||null,setProperty:(k,v)=>{assert.ok(held,'state/setting writes need owner lock');props.set(k,v);}};
 const assertHeld=()=>{assert.ok(held,'full WORK read must keep owner lock');};
 const ctx=vm.createContext({ScriptApp:{getScriptId:()=>project},PropertiesService:{getScriptProperties:()=>propertyApi},SpreadsheetApp:{openById:id=>{assert.equal(id,'SYNTHETIC_ROSTER_ONLY');return{getSheetByName:name=>sheets[name],insertSheet:()=>{throw Error('RESOURCE_CREATION_FORBIDDEN');}};},flush:()=>{assertHeld();if(failFlush)throw Error('SYNTHETIC_FLUSH_FAILED');}},LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(held,false);held=true;acquires++;},releaseLock:()=>{held=false;releases++;}})},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,s)=>[...crypto.createHash('sha256').update(String(s)).digest()],formatDate:()=> '2026-10'},TradeinPerformanceCore:{storeName:s=>s==='SYNTHETIC_STORE'?s:null,monthPeriod:m=>{assertHeld();assert.equal(m,'2026-10');},STORES:[['SYNTHETIC_STORE_CODE','SYNTHETIC_STORE']]},tradeinPerformanceRegistry_:()=>{assertHeld();reads++;return{months:{'2026-10':{active:{snapshot_hash:'SYNTHETIC_SNAPSHOT_HASH',roster_hash:'SYNTHETIC_ROSTER_HASH'}}}};},tradeinPerformanceRoster_:()=>{assertHeld();return[];},tradeinPerformanceHash_:()=>{assertHeld();return'SYNTHETIC_ROSTER_HASH';},tradeinPerformanceSnapshot_:()=>{assertHeld();reads++;return{people:[{employee_key:'SYNTH001',masked_name:'SYNTHETIC_MASK_1'},{employee_key:'SYNTH002',masked_name:'SYNTHETIC_MASK_2'}],stores:['SYNTHETIC_STORE'],summary:{marker:'SYNTHETIC_ONLY'}};},console:{log:()=>{throw Error('LOG_FORBIDDEN');}}});
 const declarations=`const PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_=${enabled};const PRIVATE_DASHBOARD_GAS_AUTH_STATE_KEY_='DASHBOARD_AUTH_NATIVE_V1';const PRIVATE_DASHBOARD_GAS_AUTH_NONCE_PREFIX_='DASHBOARD_AUTH_RPC_V1_';const PRIVATE_DASHBOARD_USERS_SHEET='DashboardUsers';const PRIVATE_DASHBOARD_REQUESTS_SHEET='DashboardRequests';const PRIVATE_DASHBOARD_USERS_HEADERS=${JSON.stringify(headers)};const PRIVATE_DASHBOARD_REQUEST_HEADERS=${JSON.stringify(requestHeaders)};const PRIVATE_DASHBOARD_AUTH_OPERATIONS_=[];let privateDashboardAuthFrames_=[];let privateDashboardRosterLockDepth_=0;let privateDashboardOwnerLocalProviderInstance_=null;`;
 vm.runInContext(declarations+functions.map(block).join('\n'),ctx);
 const projection=ctx.tradeinPerformanceProjection_;
 ctx.tradeinPerformanceProjection_=(s,a)=>{assertHeld();return projection(s,a);};
 return{ctx,props,rows,state:()=>JSON.parse(props.get('DASHBOARD_AUTH_NATIVE_V1')),setState:s=>props.set('DASHBOARD_AUTH_NATIVE_V1',JSON.stringify(s)),held:()=>held,counts:()=>({acquires,releases,reads}),failWrites:()=>{failWrites=true;},failFlush:()=>{failFlush=true;}};
}
test('patched source includes all owner helpers/provider/store and no new B or WORK RPC',()=>{for(const n of functions)assert.ok(block(n));assert.match(source,/PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ = false/);assert.doesNotMatch(source,/function privateDashboardGasBMaybePost_|function privateDashboardAuthOwnerTransport_|function privateDashboardGasAuthMaybeRpcPost_/);});
test('complete read retains lock through registry/snapshot/roster hash and final self projection',()=>{const f=fixture(),r=f.ctx.tradeinPerformanceRead(payload);assert.equal(r.access.mode,'self');assert.equal(r.snapshot.people.length,1);assert.equal(r.snapshot.people[0].masked_name,'SYNTHETIC_MASK_1');assert.equal(r.snapshot.summary,null);assert.equal(r.snapshot.stores.length,0);assert.equal(f.held(),false);assert.equal(f.counts().acquires,f.counts().releases);assert.equal(f.counts().reads,2);});
test('unchanged trusted A supervisor rule retains all-person projection',()=>{const f=fixture();f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID','SYNTH001');f.rows.DashboardUsers[1][3]='督導';const r=f.ctx.tradeinPerformanceRead({...payload,deviceId:'SYNTHETIC_OTHER_DEVICE_001'});assert.equal(r.access.mode,'supervisor');assert.equal(r.snapshot.people.length,2);});
for(const mode of ['denied','pending'])test(mode+' fence blocks WORK before private data, including trusted identity',()=>{const f=fixture(),s=f.state();s.subjects.SYNTH001={generation:2,denied:mode==='denied',pending:mode==='pending'?{operation:2,version:2,intent:'ab'.repeat(16)}:null};f.setState(s);f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID','SYNTH001');assert.throws(()=>f.ctx.tradeinPerformanceRead(payload),/ELIGIBILITY_DENIED/);assert.equal(f.counts().reads,0);assert.equal(f.held(),false);});
for(const status of ['inactive','revoked'])test(status+' roster rejects before data',()=>{const f=fixture();f.rows.DashboardUsers[1][4]=status;assert.throws(()=>f.ctx.tradeinPerformanceRead(payload));assert.equal(f.counts().reads,0);});
test('wrong device, unknown identity and duplicate native row do not yield WORK data',()=>{for(const scenario of ['device','unknown','duplicate']){const f=fixture();if(scenario==='duplicate')f.rows.DashboardUsers.push([...f.rows.DashboardUsers[1]]);const p={...payload,...(scenario==='device'?{deviceId:'SYNTHETIC_WRONG_DEVICE'}:scenario==='unknown'?{employeeId:'SYNTH999'}:{})};assert.throws(()=>f.ctx.tradeinPerformanceRead(p));assert.equal(f.counts().reads,0);}});
test('peer execution and raw roster cannot borrow owner capability',()=>{const f=fixture({project:'LOCAL_TEST_PEER_NOT_A_RESOURCE'});assert.throws(()=>f.ctx.tradeinPerformanceRead(payload),/OWNER_ONLY/);assert.throws(()=>f.ctx.privateDashboardUserByEmployeeId('SYNTH001'),/OWNER_ONLY/);assert.equal(f.counts().reads,0);});
test('missing configuration/state fail closed without initialization',()=>{const f=fixture({initialize:false});assert.throws(()=>f.ctx.tradeinPerformanceRead(payload),/STATE_REQUIRED/);assert.equal(f.props.has('DASHBOARD_AUTH_NATIVE_V1'),false);const g=fixture();g.props.delete('DASHBOARD_AUTH_OWNER_SCRIPT_ID');assert.throws(()=>g.ctx.tradeinPerformanceRead(payload),/CONFIGURATION_REQUIRED/);});
test('generation ABA between capture and commit rejects callback',()=>{const f=fixture(),p=f.ctx.privateDashboardAuthProvider_(),capture=p.capture('SYNTH001'),s=f.state();s.subjects.SYNTH001={generation:2,denied:false,pending:null};f.setState(s);let called=false;assert.throws(()=>p.commit(capture,()=>{called=true;}),/GENERATION_CHANGED/);assert.equal(called,false);});
test('host-only read callback rejects async results and forged capture',()=>{const f=fixture(),p=f.ctx.privateDashboardAuthProvider_();assert.throws(()=>p.commit({employee:'SYNTH001',generation:0},()=>true),/SNAPSHOT_REQUIRED/);assert.throws(()=>f.ctx.privateDashboardTradeinReadBoundary_(payload,()=>Promise.resolve(true)),/ASYNC_TRANSACTION_FORBIDDEN/);assert.equal(f.held(),false);});
test('native revoke advances persistent generation and fences later WORK read',()=>{const f=fixture();f.ctx.privateDashboardAdminRevoke({employeeId:'SYNTH001',adminSecret:'SYNTHETIC_ADMIN_ONLY'});assert.equal(f.rows.DashboardUsers[1][4],'revoked');assert.equal(f.state().subjects.SYNTH001.denied,true);assert.equal(f.state().subjects.SYNTH001.pending,null);assert.throws(()=>f.ctx.tradeinPerformanceRead(payload));});
test('failed native revoke retains pending/deny; no stale active read recovery',()=>{const f=fixture();f.failWrites();assert.throws(()=>f.ctx.privateDashboardAdminRevoke({employeeId:'SYNTH001',adminSecret:'SYNTHETIC_ADMIN_ONLY'}),/WRITE_FAILED/);assert.equal(f.state().subjects.SYNTH001.denied,true);assert.ok(f.state().subjects.SYNTH001.pending);assert.throws(()=>f.ctx.tradeinPerformanceRead(payload),/ELIGIBILITY_DENIED/);assert.equal(f.counts().reads,0);});
test('flush failure still releases lock and retains mutation fence',()=>{const f=fixture();f.failFlush();assert.throws(()=>f.ctx.privateDashboardAdminRevoke({employeeId:'SYNTH001',adminSecret:'SYNTHETIC_ADMIN_ONLY'}),/FLUSH_FAILED/);assert.equal(f.held(),false);assert.equal(f.state().subjects.SYNTH001.denied,true);assert.ok(f.state().subjects.SYNTH001.pending);});
test('gate off executes original business callback without provider/config/state use',()=>{const f=fixture({enabled:false,initialize:false});f.props.delete('DASHBOARD_AUTH_OWNER_SCRIPT_ID');let called=0;assert.equal(f.ctx.privateDashboardTradeinReadBoundary_(payload,()=>++called),1);assert.equal(f.counts().acquires,0);assert.equal(f.props.has('DASHBOARD_AUTH_NATIVE_V1'),false);});

test('generated tradein module retains the owner wrappers on the next build', () => {
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const start = '// BEGIN TRADEIN PERFORMANCE MODULE (generated by scripts/build-tradein-gas.mjs)';
  const end = '// END TRADEIN PERFORMANCE MODULE';
  const expected = start + '\n' + fs.readFileSync(path.join(root, 'tradein-performance-core.js'), 'utf8') + '\n' +
    fs.readFileSync(path.join(root, 'gas/TradeinPerformance.gs'), 'utf8') + '\n' + end;
  assert.equal(source.slice(source.indexOf(start), source.indexOf(end) + end.length), expected);
  for (const name of functions) assert.equal(source.split('function ' + name + '(').length - 1, 1, 'duplicate ' + name);
});

test('explicit restore clears native deny but requires fresh device approval', () => {
  const f = fixture();
  const request = { employeeId:'SYNTH001', adminSecret:'SYNTHETIC_ADMIN_ONLY' };
  f.rows.DashboardRequests.push(['SYNTHETIC_REQUEST','SYNTH001',payload.deviceId,'SYNTHETIC_TIME','pending','','','']);
  f.ctx.privateDashboardAdminRevoke(request);
  const revokedGeneration = f.state().subjects.SYNTH001.generation;
  assert.throws(() => f.ctx.privateDashboardAdminRestoreEligibility(request), /明確確認/);
  assert.equal(f.state().subjects.SYNTH001.generation, revokedGeneration);
  const result = f.ctx.privateDashboardAdminRestoreEligibility({ ...request, restoreEligibility:true, currentRosterConfirmed:true });
  assert.equal(result.deviceApprovalRequired, true);
  assert.equal(f.rows.DashboardUsers[1][4], 'active');
  assert.equal(f.rows.DashboardUsers[1][5], '');
  assert.equal(f.rows.DashboardRequests[1][4], 'revoked');
  assert.equal(f.state().subjects.SYNTH001.denied, false);
  assert.equal(f.state().subjects.SYNTH001.pending, null);
  assert.ok(f.state().subjects.SYNTH001.generation > revokedGeneration);
  assert.throws(() => f.ctx.tradeinPerformanceRead(payload), /尚未核准/);
  assert.equal(f.counts().reads, 0);
});

test('roster sync and setup cannot silently restore a revoked trusted identity', () => {
  const f = fixture();
  f.props.set('DASHBOARD_TRUSTED_EMPLOYEE_ID','SYNTH001');
  f.ctx.privateDashboardAdminRevoke({ employeeId:'SYNTH001', adminSecret:'SYNTHETIC_ADMIN_ONLY' });
  const members = [{ employeeId:'SYNTH001', maskedName:'SYNTHETIC_MASK_1', store:'SYNTHETIC_STORE', role:'SYNTHETIC_ROLE', status:'active' }];
  f.ctx.privateDashboardSyncRoster({ adminSecret:'SYNTHETIC_ADMIN_ONLY', members });
  assert.equal(f.rows.DashboardUsers[1][4], 'revoked');
  assert.equal(f.state().subjects.SYNTH001.denied, true);
  assert.throws(() => f.ctx.kpiCalcSetupSelf(), /ELIGIBILITY_DENIED|已撤權/);
  assert.throws(() => f.ctx.tradeinPerformanceRead(payload), /ELIGIBILITY_DENIED/);
});

test('duplicate sync batch is rejected before any roster or state mutation', () => {
  const f = fixture();
  const beforeRows = JSON.stringify(f.rows), beforeState = JSON.stringify(f.state());
  const member = { employeeId:'SYNTH001', maskedName:'SYNTHETIC_MASK_1', store:'SYNTHETIC_STORE', role:'SYNTHETIC_ROLE' };
  assert.throws(() => f.ctx.privateDashboardSyncRoster({ adminSecret:'SYNTHETIC_ADMIN_ONLY', members:[member,member] }), /員編重複/);
  assert.equal(JSON.stringify(f.rows), beforeRows);
  assert.equal(JSON.stringify(f.state()), beforeState);
  assert.equal(f.held(), false);
});

for (const mode of ['denied', 'pending']) test(mode + ' introduced after capture prevents commit callback', () => {
  const f = fixture(), provider = f.ctx.privateDashboardAuthProvider_();
  const capture = provider.capture('SYNTH001'), state = f.state();
  state.subjects.SYNTH001 = { generation:0, denied:mode === 'denied', pending:mode === 'pending' ? { operation:2, version:0, intent:'ab'.repeat(16) } : null };
  f.setState(state);
  let called = false;
  assert.throws(() => provider.commit(capture, () => { called = true; }), /ELIGIBILITY_DENIED/);
  assert.equal(called, false);
  assert.equal(f.held(), false);
});

test('malformed or foreign-owner state is rejected without replacing it', () => {
  for (const value of ['{', JSON.stringify({ v:1, owner:'LOCAL_TEST_PEER_NOT_A_RESOURCE', revision:0, subjects:{} })]) {
    const f = fixture();
    f.props.set('DASHBOARD_AUTH_NATIVE_V1', value);
    assert.throws(() => f.ctx.tradeinPerformanceRead(payload), /STATE_INVALID/);
    assert.equal(f.props.get('DASHBOARD_AUTH_NATIVE_V1'), value);
    assert.equal(f.counts().reads, 0);
  }
});
