'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/tradein-sharing-runtime.cjs');
const oldRow=(extra={})=>({id:'SYNTHETIC_LEGACY_CASE',version:1,owner:'SYNTHETIC_EMPLOYEE',store:'永吉',author:'舊＊名',type:'未成交',scenario:'PRIVATE_LEGACY_TEXT',approach:'PRIVATE_APPROACH',outcome:'PRIVATE_OUTCOME',image:'data:image/png;base64,iVBORw0KGgoAAA==',createdAt:'2026-10-18T16:00:00Z',updatedAt:'2026-10-19T00:00:00Z',featured:false,hidden:false,...extra});
test('anonymous creates consented new case, reads text and raster image without identity or attachment URL',()=>{
  const f=fixture(),p=f.draft({image:'data:image/png;base64,iVBORw0KGgoAAA=='}),r=f.invoke(p);assert.equal(r.status,'ok');assert.notEqual(r.item.id,p.requestId);assert.equal(r.item.authorUnverified,true);assert.equal(r.item.editable,false);
  assert.equal(f.state().cases[0].owner,null);assert.equal(f.state().cases[0].audience,'public-link/v1');assert.equal(f.list().cases.length,1);assert.equal('image' in f.list().cases[0],false);assert.equal(f.detail(r.item).item.image,p.image);
  assert.doesNotMatch(JSON.stringify(r),/submissionHash|submissionDigest|owner|token|employeeId|https:/);assert.equal(f.held(),false);
});
test('v1 missing audience, explicit private, missing hidden, and hidden public rows deny guessed detail/image and list',()=>{
  for(const extra of [{},{audience:'private'},{audience:'public-link/v1',hidden:true},{audience:'public-link/v1',hidden:undefined}]){
    const f=fixture(),row=oldRow(extra);f.seed([row]);assert.deepEqual(f.list().cases,[]);assert.equal(f.detail({month:'2026-10',id:row.id}).status,'error');assert.doesNotMatch(JSON.stringify(f.detail({month:'2026-10',id:row.id})),/PRIVATE_|base64/);
  }
});
test('no anonymous shared actor can edit, hide, feature, or submit owner/identity/ID overrides',()=>{
  const f=fixture(),r=f.invoke(f.draft());
  for(const key of ['owner','supervisor','featured','hidden','id','audience','employeeId','token','deviceId','createdAt','version'])assert.equal(f.invoke(f.draft({[key]:key==='hidden'?false:'FORGED'})).status,'error',key);
  for(const action of ['save','moderate','delete','image','admin'])assert.equal(f.invoke({action:'tradein_sharing_public_'+action,month:'2026-10',id:r.item.id,hidden:true}).status,'error');
  assert.equal(f.invoke({action:'employee_tradein_sharing_save',month:'2026-10',id:r.item.id,version:1}).status,'error');assert.equal(f.state().cases[0].version,1);assert.equal(f.state().cases.length,1);
});
test('unknown actions and operational APIs gain no public dispatch',()=>{
  const f=fixture();for(const action of ['employee_dashboard_read','employee_kpi_read','employee_admin_list','employee_tradein_sharing_list'])assert.equal(f.invoke({action}).status,'error');
  for(const action of ['private_access','kpicalc_access','department_ops_read','private_publish','not_an_action'])assert.equal(f.invoke({action}),null);
  assert.equal(f.writes(),0);
});
test('peer, upload deployment, disabled gates and incorrect content type fail closed',()=>{
  for(const options of [{owner:false},{upload:true},{enabled:false}]){const f=fixture(options);assert.equal(f.invoke(f.draft()).status,'error');assert.equal(f.writes(),0);}
  const f=fixture(),raw=JSON.stringify(f.draft());assert.equal(JSON.parse(f.ctx.tradeinSharingPublicMaybePost_({postData:{type:'application/json',contents:raw}}).text).status,'error');assert.equal(f.writes(),0);
});
test('Taiwan midnight, month-end attribution and bounded ranges use immutable first-created date',()=>{
  const f=fixture({at:'2026-10-31T15:59:59Z'}),before=f.invoke(f.draft());f.setTime('2026-10-31T16:00:00Z');const after=f.invoke(f.draft());
  assert.equal(before.item.createdDate,'2026-10-31');assert.equal(after.item.createdDate,'2026-11-01');assert.equal(after.item.month,'2026-11');
  assert.deepEqual(f.list('2026-10-31','2026-10-31').cases.map(r=>r.id),[before.item.id]);assert.equal(f.list('2026-10-31','2026-11-01').cases.length,2);assert.equal(f.list('2026-12-01','2026-12-31').cases.length,0);
  for(const [start,end] of [['2026-02-30','2026-03-01'],['2026-11-01','2026-10-31'],['2026-01-01','2026-12-31'],['','2026-10-01']])assert.equal(f.list(start,end).status,'error');
  const edit={action:'employee_tradein_sharing_save',month:'2026-10',id:before.item.id,version:1,type:'改善心得',scenario:'合成編輯',approach:'合成話術',outcome:'合成心得',image:null};
  f.ctx.privateDashboardRosterTransaction_(()=>f.ctx.tradeinSharingOperation_(edit,{id:'SYNTHETIC_BOSS',supervisor:true}));assert.equal(f.detail(before.item).item.createdDate,'2026-10-31');assert.equal(f.state().cases[0].createdAt,'2026-10-31T15:59:59.000Z');
});
test('idempotent duplicate and ambiguous receipt work across Taiwan month boundary; changed replay denied',()=>{
  const f=fixture({at:'2026-10-31T15:59:59Z'}),p=f.draft(),a=f.invoke(p);f.setTime('2026-10-31T16:00:01Z');const b=f.invoke(p);assert.equal(b.duplicate,true);assert.equal(a.item.id,b.item.id);assert.equal(f.state().cases.length,1);assert.equal(f.state('2026-11').cases.length,0);
  assert.equal(f.invoke({action:'tradein_sharing_public_receipt',requestId:p.requestId}).item.id,a.item.id);assert.equal(f.invoke({...p,outcome:'CHANGED'}).code,'SHARE_VERSION_CONFLICT');
  assert.equal(f.invoke({action:'tradein_sharing_public_receipt',requestId:'SYNTHETIC_UNKNOWN_REQUEST'}).found,false);
});
test('consent, text, stores, stale submissions, raster signatures and image byte capacity are server enforced',()=>{
  const f=fixture();for(const change of [{consent:false},{author:''},{author:'x'.repeat(61)},{store:'FORGED_STORE'},{scenario:'x'.repeat(1001)},{submittedAt:f.time()-600001},{image:'https://drive.google.com/attachment'},{image:'data:image/svg+xml;base64,PHN2Zz4='},{image:'data:image/png;base64,iVBORw0KGgo'+'A'.repeat(1100000)}])assert.equal(f.invoke(f.draft(change)).status,'error');
  assert.equal(f.state().cases.length,0);for(const type of ['成功成交','未成交','改善心得'])assert.equal(f.invoke(f.draft({type})).status,'ok');
});
test('durable quota, per-month capacity and bounded response stop growth under the same lock',()=>{
  const f=fixture();for(let i=0;i<20;i++)assert.equal(f.invoke(f.draft()).status,'ok');assert.equal(f.invoke(f.draft()).code,'SHARE_RATE_LIMIT');assert.equal(f.state().cases.length,20);
  const g=fixture();g.seed(Array.from({length:500},(_,i)=>oldRow({id:'SYNTHETIC_FULL_'+i})));assert.equal(g.invoke(g.draft()).code,'SHARE_CAPACITY');assert.equal(g.state().cases.length,500);
  const h=fixture();for(let i=0;i<120;i++)assert.equal(h.list().status,'ok');assert.equal(h.list().code,'SHARE_RATE_LIMIT');h.setTime('2026-10-19T08:01:00Z');assert.equal(h.list().status,'ok');
});
test('supervisor hide/restore/feature remains authenticated; public text and image vanish together',()=>{
  const f=fixture(),row=f.invoke(f.draft({image:'data:image/png;base64,iVBORw0KGgoAAA=='})).item;
  const moderate=(version,hidden)=>f.ctx.privateDashboardRosterTransaction_(()=>f.ctx.tradeinSharingOperation_({action:'employee_tradein_sharing_moderate',month:row.month,id:row.id,version,featured:true,hidden},{id:'SYNTHETIC_BOSS',supervisor:true}));
  moderate(1,true);assert.equal(f.list().cases.length,0);assert.equal(f.detail(row).status,'error');moderate(2,false);assert.equal(f.list().cases[0].featured,true);assert.ok(f.detail(row).item.image);
  f.seed([oldRow()]);assert.throws(()=>f.ctx.privateDashboardRosterTransaction_(()=>f.ctx.tradeinSharingOperation_({action:'employee_tradein_sharing_save',month:'2026-10',id:'SYNTHETIC_LEGACY_CASE',version:1,type:'改善心得',scenario:'x',approach:'x',outcome:'x',image:null,publicConsent:true},{id:'SYNTHETIC_EMPLOYEE'})),/SHARE_DENIED/);
});

test('800 KB image limit and serialized monthly capacity are enforced without partial case writes',()=>{
 const f=fixture(),bytes=Buffer.alloc(800*1024);Buffer.from('89504e470d0a1a0a','hex').copy(bytes);const image='data:image/png;base64,'+bytes.toString('base64');
 let accepted=0;for(let i=0;i<10;i++){const before=f.state().cases.length,r=f.invoke(f.draft({image}));if(r.status==='ok')accepted++;else{assert.equal(r.code,'SHARE_CAPACITY');assert.equal(f.state().cases.length,before);break;}}assert.ok(accepted>=1&&accepted<10);
 const larger=Buffer.alloc(800*1024+1);Buffer.from('89504e470d0a1a0a','hex').copy(larger);assert.equal(f.invoke(f.draft({image:'data:image/png;base64,'+larger.toString('base64')})).code,'SHARE_IMAGE_INVALID');
});
test('legacy bucket month remains usable for authenticated editing while created date is immutable',()=>{
 const f=fixture(),old=oldRow({createdAt:'2026-09-30T16:00:00Z'});f.seed([old],'2026-09');
 const actor={id:'SYNTHETIC_EMPLOYEE',supervisor:false},list=f.ctx.privateDashboardRosterTransaction_(()=>f.ctx.tradeinSharingOperation_({action:'employee_tradein_sharing_list',month:'2026-09'},actor));assert.equal(list.cases[0].month,'2026-09');assert.equal(list.cases[0].createdDate,'2026-10-01');
 const saved=f.ctx.privateDashboardRosterTransaction_(()=>f.ctx.tradeinSharingOperation_({action:'employee_tradein_sharing_save',month:list.cases[0].month,id:old.id,version:1,type:'改善心得',scenario:'合成編輯',approach:'合成話術',outcome:'合成心得',image:null},actor));assert.equal(saved.item.createdDate,'2026-10-01');assert.equal(f.state('2026-09').cases[0].audience,undefined);
});
