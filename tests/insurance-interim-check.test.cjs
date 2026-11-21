const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {plan,checked}=require('../insurance-interim-check.js');
const day='2099-11-21',cutoff='2099-11-19',sourceSha='a'.repeat(64),version='b'.repeat(64);
const input=scope=>({day,cutoff,sourceSha,version,scope});
const row={kind:'personal',store:'合成店',dataDate:day,isSelf:true,canSubmit:true,acceptsReply:true,requirement:'required',
 progress:{status:'verified',identityStatus:'verified',referenceOnly:false,freshness:'current',cutoff,publicationDate:day,sourceSha256:sourceSha,sourceVersion:version}};
const store={kind:'store',store:row.store,dataDate:day,isSelf:false,canSubmit:true,acceptsReply:false,requirement:'pending',progress:null};
const result=(scope,items)=>({status:'ok',schema:'insurance-consultation/v1',dataDate:day,scope,items});
test('private inputs check exact date, scope and digests',()=>{
 assert.deepEqual(plan(input('self'),day),{day,cutoff,sourceSha,version,scope:'self'});
 for(const bad of [null,input('write'),{...input('self'),sourceSha:'not-a-hash'},{...input('self'),cutoff:'2099-10-31'},{...input('self'),cutoff:'2099-11-31'}]) assert.equal(plan(bad,day),null);
 assert.equal(plan(input('self'),'2099-11-22'),null);
});
test('accepted role can see only self or own pending store, never extra rows',()=>{
 assert.equal(checked(result('self',[row]),plan(input('self'),day)),true);
 assert.equal(checked(result('store-manager',[row,store]),plan(input('store-manager'),day)),true);
 assert.equal(checked(result('store-manager',[row,store]),plan(input('self'),day)),false);
 assert.equal(checked(result('self',[row,row]),plan(input('self'),day)),false);
 assert.equal(checked(result('store-manager',[row,{...store,store:'外店'}]),plan(input('store-manager'),day)),false);
 assert.equal(checked(result('store-manager',[row,{...store,requirement:'required'}]),plan(input('store-manager'),day)),false);
});
test('old or mismatched source never passes',()=>{
 for(const p of [{cutoff:'2099-11-18'},{sourceVersion:'c'.repeat(64)},{sourceSha256:'c'.repeat(64)},{referenceOnly:true},{freshness:'retained'}]){
  assert.equal(checked(result('self',[{...row,progress:{...row.progress,...p}}]),plan(input('self'),day)),false);
 }
 assert.equal(checked(result('self',[{...row,requirement:'pending'}]),plan(input('self'),day)),false);
});
test('UI requires opt-in, active lease, human click, and revocation clears response',async()=>{
 const lifecycle={},window={location:{hash:''},addEventListener:(event,f)=>{lifecycle[event]=f;}};
 let count=0, children=[],authorized=false,resolve;
 const mk=()=>({value:'',children:[],append(...nodes){this.children.push(...nodes);},setAttribute(){}});
 const panel={append:box=>children.push(box)};
 const doc={createElement:mk},mockDate=class extends Date {static now(){return Date.parse(day+'T02:00:00Z');}};
 vm.runInNewContext(fs.readFileSync('insurance-interim-check.js','utf8'),{window,document:doc,Date:mockDate});
 const read=()=>{count++;return new Promise(r=>{resolve=r;});};
 assert.equal(window.createInterimInsuranceCheck(panel,read,()=>authorized),null);
 window.location.hash='#insurance-check';const t=window.createInterimInsuranceCheck(panel,read,()=>authorized),box=children[0];
 const [button,text]=box.children.slice(-2);
 const fill=()=>Object.values(input('self')).forEach((v,i)=>{box.children[i].children[0].value=v;});
 assert.equal(box.hidden,true);assert.equal(button.disabled,true);assert.equal(count,0);
 await button.onclick();assert.equal(count,0);
 authorized=true;t.session(true);assert.equal(box.hidden,false);assert.equal(count,0);
 await button.onclick();assert.equal(count,0);fill();
 let run=button.onclick();assert.equal(count,1);assert.equal(button.disabled,true);
 authorized=false;t.session(false);resolve(result('self',[row]));await run;assert.equal(text.textContent,'');
 authorized=true;t.session(true);fill();run=button.onclick();resolve(result('self',[row]));await run;
 assert.match(text.textContent,/唯讀核對通過/);assert.doesNotMatch(text.textContent,/合成店|subjectKey|token|率/);
 window.location.hash='';lifecycle.hashchange();assert.equal(button.disabled,true);assert.equal(box.children[0].children[0].value,'');
});
