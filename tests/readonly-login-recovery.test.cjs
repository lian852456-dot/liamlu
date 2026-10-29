const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),OWNER='https://script.google.com/macros/s/ABCDEFGHIJKLMNOPQRST/exec';
function runtime({approved=false,password=false,persistent=false,deny=false,network=false,invalidSource=false}={}){
 const local=new Map(),session=new Map(),events={},nodes=new Map(),calls=[];let adapted=0,denied=deny;
 const storage=map=>({getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value),removeItem:key=>map.delete(key)});
 if(approved||password||persistent)local.set('north12b_private_dashboard_device_id','SYNTHETIC_DEVICE_123456');
 if(approved)session.set('north12b_private_dashboard_employee_id','SYNTHETIC');
 if(persistent)local.set('north12b_private_dashboard_employee_id','SYNTHETIC');
 if(password)session.set('north12b_password_session_v1',JSON.stringify({v:1,owner:OWNER,deviceId:'SYNTHETIC_DEVICE_123456',token:'B1_a_'+'a'.repeat(64),expiresAt:Date.now()+1700000,logoutEpoch:''}));
 const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{hidden:false,disabled:false,textContent:'',innerHTML:'',setAttribute(){},replaceChildren(){this.innerHTML='';}});return nodes.get(selector);};
 const context={console,Date,AbortController,crypto:require('node:crypto').webcrypto,performance,
  location:{protocol:'https:'},localStorage:storage(local),sessionStorage:storage(session),
  setTimeout:()=>1,clearTimeout(){},ResizeObserver:class{observe(){}},
  document:{hidden:false,querySelector:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>events[name]=fn},
  addEventListener:(name,fn)=>events[name]=fn,PortalLogout:{isLocked:()=>false},
  KpiBattleController:{DEFAULT_GAS_URL:OWNER},ReadonlyDashboardCore:{},
  ReadonlyDashboardAdapter:{fromBundle(){adapted++;if(invalidSource)throw Error('SECRET_SOURCE_DETAIL');return {stores:[],conversion:null,kpi:{stores:[],data:{aggregate:null}}};}},
  fetch:async(_,options)=>{const body=JSON.parse(options.body);calls.push(body);if(network)throw Error('SECRET_NETWORK_DETAIL');
   return {ok:true,json:async()=>denied?{status:'error',message:'SECRET_SERVER_DETAIL'}:{status:'ok',trustSource:'password-bound',phoneEligible:false,expiresAt:JSON.parse(session.get('north12b_password_session_v1')||'null')?.expiresAt,privateResult:{status:'ok'},kpiResult:{status:'ok'}}};}
 };
 context.window=context;vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'GasBClient.js'),'utf8'),context);vm.runInContext(fs.readFileSync(path.join(root,'readonly-dashboard.js'),'utf8'),context);
 return {context,local,session,events,node,calls,adapted:()=>adapted,setDenied:value=>denied=value};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('failed page automatically retries after same-tab login and back navigation',async()=>{
 const r=runtime();await settle();assert.match(r.node('#auth-message').textContent,/LOGIN/);assert.equal(r.calls.length,0);
 r.events.pagehide();r.local.set('north12b_private_dashboard_device_id','SYNTHETIC_DEVICE_123456');r.session.set('north12b_private_dashboard_employee_id','SYNTHETIC');
 r.events.pageshow();await settle();assert.deepEqual(r.calls.map(x=>x.action),['private_access','kpicalc_access']);assert.equal(r.adapted(),1);assert.equal(r.node('#controls').hidden,false);
});
test('a new explicit attempt uses a completed replacement login, without fallback on denial',async()=>{
 const r=runtime({password:true,approved:true,deny:true});await settle();assert.deepEqual(r.calls.map(x=>x.action),['employee_dashboard_read']);assert.match(r.node('#auth-message').textContent,/AUTH/);assert(r.session.has('north12b_password_session_v1'));
 r.session.delete('north12b_password_session_v1');r.setDenied(false);r.node('#refresh').onclick();await settle();assert.deepEqual(r.calls.map(x=>x.action),['employee_dashboard_read','private_access','kpicalc_access']);assert.equal(r.adapted(),1);
});
test('persistent approved identity still requires both original server checks',async()=>{
 const r=runtime({persistent:true});await settle();assert.deepEqual(r.calls.map(x=>x.action),['private_access','kpicalc_access']);assert.equal(r.adapted(),1);
 const denied=runtime({persistent:true,deny:true});await settle();assert.deepEqual(denied.calls.map(x=>x.action),['private_access']);assert.equal(denied.adapted(),0);assert.equal(denied.node('#controls').hidden,true);
});
test('connection failures are distinguished from credentials and raw errors stay private',async()=>{
 const r=runtime({approved:true,network:true});await settle();assert.match(r.node('#auth-message').textContent,/NETWORK/);assert.doesNotMatch(r.node('#auth-message').textContent,/SECRET/);assert.equal(r.adapted(),0);
});
test('source rejection explains data failure rather than asking for another login',async()=>{
 const r=runtime({approved:true,invalidSource:true});await settle();assert.match(r.node('#auth-message').textContent,/DATA/);assert.doesNotMatch(r.node('#auth-message').textContent,/SECRET/);assert.equal(r.node('#controls').hidden,true);assert.equal(r.node('#store-export').disabled,true);
});
test('same-tab login notification recovers the initially locked page',async()=>{
 const r=runtime();await settle();r.local.set('north12b_private_dashboard_device_id','SYNTHETIC_DEVICE_123456');r.session.set('north12b_private_dashboard_employee_id','SYNTHETIC');r.events['portal-login-changed']();await settle();assert.equal(r.adapted(),1);
});
test('logout continues to block late lifecycle reads and private presentation',async()=>{
 const r=runtime({approved:true});await settle();r.events['portal-before-logout']();r.events.pageshow();await settle();assert.equal(r.calls.length,2);assert.equal(r.node('#controls').hidden,true);assert.equal(r.node('#store-export').disabled,true);
});

for(const channel of ['approved','password'])test(channel+' retains data on visibility, focus and bfcache return with no new read',async()=>{
 const r=runtime({[channel]:true});await settle();const count=r.calls.length;assert.equal(r.node('#controls').hidden,false);
 for(let i=0;i<3;i++){r.context.document.hidden=true;r.events.visibilitychange();assert.equal(r.node('#controls').hidden,false);r.context.document.hidden=false;r.events.visibilitychange();r.events.pagehide();r.events.pageshow();r.events.focus();await settle();assert.equal(r.calls.length,count);assert.equal(r.node('#controls').hidden,false);}
 r.node('#refresh').onclick();await settle();assert.equal(r.calls.length,count*2);
});
test('expired retained data is cleared on return without extending its deadline',async()=>{
 const r=runtime({password:true});await settle();const proof=JSON.parse(r.session.get('north12b_password_session_v1'));r.context.Date={now:()=>proof.expiresAt+1};r.events.pageshow();await settle();assert.equal(r.node('#controls').hidden,true);assert.equal(r.node('#store-export').disabled,true);
});
test('changed device cannot display a retained snapshot',async()=>{
 const r=runtime({approved:true});await settle();r.local.set('north12b_private_dashboard_device_id','DIFFERENT_SYNTHETIC_DEVICE');r.setDenied(true);r.events.focus();await settle();assert.equal(r.node('#controls').hidden,true);
});
