const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8'),code=read('gas/Code.gs'),page=read('gas/ReportUpload.html');
// Reuse the existing in-memory GAS publication fixture without registering its tests.
const prior=read('tests/threec-private-runtime.test.cjs'),end=prior.indexOf('\ntest(');
const helper=vm.createContext({require,__dirname,console,Buffer,process});
vm.runInContext(prior.slice(0,end)+'\nthis.fixtures={runtime,shoppingSnapshot,tradeinSnapshot};',helper);
function between(source,start,end){const a=source.indexOf(start),b=source.indexOf(end,a);assert.ok(a>=0&&b>a);return source.slice(a,b);}
function runtime(){
 const r=helper.fixtures.runtime();
 const priorFormat=r.context.Utilities.formatDate;
 r.context.Utilities.formatDate=(date,zone,pattern)=>pattern==='yyyyMMdd-HHmmss'?new Date(new Date(date).getTime()+8*3600000).toISOString().replace(/[-:]/g,'').replace('T','-').slice(0,15):priorFormat(date,zone,pattern);
 vm.runInContext(between(code,'function privateDashboardAdminAuthorized(', 'function privateDashboardFolder('),r.context);
 vm.runInContext(between(code,'function reportUploadAuthorize_(', 'function reportUploadStamp_('),r.context);
 for(const file of ['ThreecPriceOfflineCore.gs','ThreecPriceOfflineAssets.gs','ThreecPriceOfflineExport.gs'])vm.runInContext(read('gas/'+file),r.context);
 return r;
}
function publish(r,kind,options){const snapshot=kind==='shopping'?helper.fixtures.shoppingSnapshot({rows:3,...options}):helper.fixtures.tradeinSnapshot({rows:2,...options});return r.context.threecPublish({...r.auth,snapshotJson:JSON.stringify(snapshot),confirmPublish:true});}
function ready(){const r=runtime();publish(r,'shopping');publish(r,'tradein');return r;}
function hashes(r){const registry=r.context.threecRegistry_();return Object.fromEntries(['shopping','tradein'].map(k=>[k,registry.kinds[k].active.snapshot_hash]));}
test('every direct RPC rechecks the real existing manager-code and server employee allowlist before reading',()=>{
 const r=ready(),expectedActiveHashes=hashes(r),before=r.snapshotReads;
 for(const input of [{},{employeeId:r.auth.employeeId},{...r.auth,adminSecret:'wrong-code'},{...r.auth,employeeId:'OTHER1'},{adminSecret:r.auth.adminSecret}]){
  assert.throws(()=>r.context.threec_export_readonly({...input,expectedActiveHashes}));
  assert.equal(r.snapshotReads,before);
 }
 const result=r.context.threec_export_readonly({...r.auth,expectedActiveHashes});assert.equal(result.status,'ok');
 assert.throws(()=>r.context.threec_export_readonly({employeeId:r.auth.employeeId,expectedActiveHashes}));
});
test('only complete verified active versions export; caller previews, missing versions and stale hashes fail closed',()=>{
 const empty=runtime(),fake={shopping:'a'.repeat(32),tradein:'b'.repeat(32)};
 assert.throws(()=>empty.context.threec_export_readonly({...empty.auth,expectedActiveHashes:fake}),/均發布/);
 const one=runtime();publish(one,'shopping');assert.throws(()=>one.context.threec_export_readonly({...one.auth,expectedActiveHashes:{...fake,shopping:one.context.threecRegistry_().kinds.shopping.active.snapshot_hash}}),/均發布/);
 const r=ready(),expectedActiveHashes=hashes(r);
 assert.throws(()=>r.context.threec_export_readonly({...r.auth}),/正式版本核對/);
 assert.throws(()=>r.context.threec_export_readonly({...r.auth,expectedActiveHashes,snapshotJson:'UNPUBLISHED_PREVIEW'}),/不允許/);
 assert.throws(()=>r.context.threec_export_readonly({...r.auth,expectedActiveHashes:{...expectedActiveHashes,shopping:'c'.repeat(32)}}),/版本已變更/);
 const active=r.context.threecRegistry_().kinds.tradein.active;r.files.get(active.snapshot_file_id).corrupt=true;
 assert.throws(()=>r.context.threec_export_readonly({...r.auth,expectedActiveHashes}),/雜湊|版本驗證/);
});
test('successful export preserves every official price and adds no data writes, identity, secret or external dependency',()=>{
 const r=ready(),expectedActiveHashes=hashes(r),files=r.createdFileCount,writes=r.registryWrites;
 const result=r.context.threec_export_readonly({...r.auth,expectedActiveHashes});
 assert.equal(r.createdFileCount,files);assert.equal(r.registryWrites,writes);assert.match(result.fileName,/^門市查價_手機\d{8}_舊換新\d{8}_\d{8}-\d{6}\.html$/);
 const raw=JSON.parse(result.html.match(/id="price-data">([\s\S]*?)<\/script>/)[1]);
 const Transport=require('../threec-price-transport.js');
 for(const kind of ['shopping','tradein']){
  const original=r.context.threecPublicResult_({snapshot:r.context.threecReadActive_(kind,{includeChanges:false}).snapshot}).snapshot;
  assert.deepEqual(Transport.decode(raw[kind]).snapshot,JSON.parse(JSON.stringify(original)));
 }
 assert.doesNotMatch(result.html,new RegExp(r.auth.adminSecret+'|'+r.auth.employeeId+'|operator_hash|snapshot_file_id|adminSecret|https?:\\/\\/|fetch\\s*\\(|localStorage|sessionStorage|<form|<iframe'));
 assert.match(result.html,/版本日期不等於生效日期/);assert.match(result.html,/connect-src 'none'/);
});
test('generated GAS core and assets match the shared exporter sources',()=>{
 assert.equal(read('gas/ThreecPriceOfflineCore.gs').split('\n').slice(1).join('\n'),read('threec-price-offline-core.js'));
 const r=runtime();assert.equal(vm.runInContext('THREEC_PRICE_OFFLINE_ASSETS.version',r.context),'price-offline/v2');
 assert.equal(vm.runInContext('THREEC_PRICE_OFFLINE_ASSETS.template.includes("@@PRICE_OFFLINE_DATA@@")',r.context),true);
});
test('GAS initialization can load the export core before the existing transport',()=>{
 const r=ready(),late=vm.createContext({console});
 vm.runInContext(read('gas/ThreecPriceOfflineCore.gs'),late);
 vm.runInContext(read('threec-price-transport.js'),late);
 const response={status:'ok',snapshot:JSON.parse(JSON.stringify(r.context.threecPublicResult_({snapshot:r.context.threecReadActive_('shopping',{includeChanges:false}).snapshot}).snapshot))};
 assert.equal(late.ThreecPriceOfflineCore.publicPriceResponse(response,'shopping').snapshot.row_count,3);
});
function uiRuntime(){
 const nodes=new Map();function node(id){if(!nodes.has(id)){const classes=new Set(['hidden']);nodes.set(id,{disabled:true,value:'',textContent:'',classList:{toggle(c,yes){yes?classes.add(c):classes.delete(c);},add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},classes});}return nodes.get(id);}
 const state={calls:[],downloads:[],failure:null,delay:null};
 const context=vm.createContext({console,Blob,setTimeout:fn=>fn(),URL:{createObjectURL:blob=>{state.downloads.push(blob);return 'blob:SYNTHETIC';},revokeObjectURL:()=>{}},document:{body:{append:()=>{}},createElement:()=>({click:()=>{},remove:()=>{}})}});
 context.$=node;context.message=(id,text)=>node(id).textContent=text;context.call=async(name,payload)=>{state.calls.push({name,payload});if(state.failure)throw Error(state.failure);if(state.delay)await state.delay;return {status:'ok',fileName:'SYNTHETIC.html',html:'<!doctype html><p>Synthetic export only</p>',manifest:{sources:{shopping:{snapshot_hash:'a'.repeat(32),source_version_date:'2026-11-02'},tradein:{snapshot_hash:'b'.repeat(32),source_version_date:'2026-11-01'}}}};};
 vm.runInContext("let threecPublicationState=null,threecPublishing=false,threecReadonlyExportBusy=false,threecReadonlyExportGeneration=0;const auth={employeeId:'TEST01',adminSecret:'SYNTHETIC_ONLY'};let threecRegistryState={shopping:{active:{snapshot_hash:'"+'a'.repeat(32)+"'}},tradein:{active:{snapshot_hash:'"+'b'.repeat(32)+"'}}};function payload(extra){return Object.assign({},auth,extra);}",context);
 vm.runInContext(between(page,'    function threecReadonlyHashes(', '    async function refreshThreec('),context);
 return {context,state,node,set:script=>vm.runInContext(script,context)};
}
test('result-area button stays unavailable for preview, failed or unconfirmed publish; verified receipt enables it',async()=>{
 const r=uiRuntime();
 for(const script of ["threecPublicationState=null", "threecPublicationState={status:'published',verified:false}","threecPublicationState={status:'unconfirmed',verified:true}"]){r.set(script+';updateThreecReadonlyExport()');assert.equal(r.node('threecReadonlyExport').classes.has('hidden'),true);await r.context.downloadThreecReadonly();assert.equal(r.state.calls.length,0);}
 r.set("threecPublicationState={status:'published',verified:true};updateThreecReadonlyExport()");assert.equal(r.node('threecReadonlyExportBtn').disabled,false);
 await r.context.downloadThreecReadonly();assert.equal(r.state.calls.length,1);assert.equal(r.state.calls[0].name,'threec_export_readonly');assert.equal(r.state.downloads.length,1);assert.ok(!r.state.calls[0].payload.snapshotJson);
 assert.doesNotMatch(await r.state.downloads[0].text(),/SYNTHETIC_ONLY|TEST01/);
});
test('server denial and a changed preview during export never download or show false success',async()=>{
 const r=uiRuntime();r.set("threecPublicationState={status:'already_current',verified:true}");r.state.failure='管理者驗證失敗';await r.context.downloadThreecReadonly();assert.equal(r.state.downloads.length,0);assert.match(r.node('threecReadonlyExportMessage').textContent,/下載失敗/);
 r.state.failure=null;let finish;r.state.delay=new Promise(resolve=>finish=resolve);const pending=r.context.downloadThreecReadonly();r.set('threecReadonlyExportGeneration++;threecPublicationState=null');finish();await pending;assert.equal(r.state.downloads.length,0);
});
