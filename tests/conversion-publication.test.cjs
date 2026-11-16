'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../conversion-publication-core.js');
const O = require('../north12-officer-core.js');
const Base = require('../readonly-dashboard-core.js');
const {runtime, fixture} = require('./helpers/readonly-conversion-runtime.cjs');
function department(days = 3, hash = 'a') {
  const data = Base.validateConversion(fixture({days, hash}));
  const extra = {id:'DNB20001', name:'合成A門市', short:'合成A', region:'北一二A'};
  return O.validate({...data, schema:O.SCHEMA, stores:data.stores.concat(extra),
    records:data.records.concat(data.records.filter(row => row.store === data.stores[0].id).map(row => ({...row,store:extra.id})))});
}
const publish = (backend, snapshot) => {
  const preview = backend.call('Preview', {snapshot});
  return backend.call('Publish', {previewToken:preview.token, confirm:true});
};
test('a single canonical publication gives B the same counts and source hash', () => {
  const d = department(), p = P.fromOfficer(d), b = P.projectB(p);
  assert.equal(b.sha256, d.sha256);
  assert.deepEqual(b.records, d.records.filter(row => row.store !== 'DNB20001'));
  assert.equal(p.regions['北一二A'].records.length,3);
});
test('partial newer B preserves A with its own date, source, and observations', () => {
  const old = P.fromOfficer(department());
  const {snapshot} = P.combine(old, P.migrate(fixture({days:4,hash:'b'})));
  assert.deepEqual(snapshot.regions['北一二A'],old.regions['北一二A']);
  assert.equal(snapshot.regions['北一二B'].cutoff,'2026-10-04');
  assert.equal(P.coverage(snapshot).find(row => row.region === '北一二A').updated,false);
  assert.equal(P.projectB(snapshot).sha256,'b'.repeat(64));
});
test('legacy B source migrates without changing the existing projection', () => {
  assert.deepEqual(P.projectB(P.migrate(fixture())),Base.validateConversion(fixture()));
});
test('older, missing, cross-region, or same-hash conflicting data cannot publish', () => {
  const p = P.fromOfficer(department());
  assert.throws(() => P.combine(p,P.migrate(fixture({days:2,hash:'b'}))),/倒退/);
  const bad = structuredClone(p); bad.regions['北一二A'].stores[0].region = '北一二C';
  assert.throws(() => P.normalize(bad),/跨區/);
  const changed = fixture(); changed.records[0].aq_n++;
  assert.throws(() => P.combine(p,P.migrate(changed)),/相同原始檔/);
});
test('department read authorizes before accessing private data', () => {
  const b = runtime();
  assert.throws(() => b.context.readonlyConversionDepartmentRead({}),/denied/);
  assert.deepEqual(b.events,['auth']);
});
test('legacy to unified publication, readback, partial update, and rollback share one pointer', () => {
  const b = runtime(); publish(b,fixture());
  const a = publish(b,P.fromOfficer(department(3,'b')));
  assert.equal(b.call('DepartmentRead').publication.regions['北一二A'].stores.length,1);
  const newer = publish(b,P.migrate(fixture({days:4,hash:'c'})));
  const read = b.call('DepartmentRead');
  assert.equal(read.publication.regions['北一二A'].cutoff,'2026-10-03');
  assert.equal(read.publication.regions['北一二B'].cutoff,'2026-10-04');
  assert.equal(b.context.readonlyConversionAttach_({}).conversionBattle.cutoff,'2026-10-04');
  b.call('Rollback',{confirm:true,expectedRevision:newer.live.revision,expectedActiveHash:newer.live.activeHash});
  assert.equal(b.call('DepartmentRead').live.activeHash,a.live.activeHash);
  assert.equal(b.context.readonlyConversionAttach_({}).conversionBattle.cutoff,'2026-10-03');
});
test('large previews use chunks and reject an evicted chunk before writing', () => {
  const b = runtime(),p = P.fromOfficer(department(31));
  const preview = b.call('Preview',{snapshot:p});
  const key = [...b.cache.keys()].find(key => key.endsWith('_0'));
  assert.ok(key); b.cache.delete(key);
  assert.throws(() => b.call('Publish',{previewToken:preview.token,confirm:true}),/預覽已失效/);
  assert.equal(b.files.size,0);
});
test('failed unified readback restores the complete prior pointer and all regions', () => {
  const b = runtime(); publish(b,P.fromOfficer(department()));
  const original = JSON.stringify(b.state),p = b.call('Preview',{snapshot:P.migrate(fixture({days:4,hash:'c'}))});
  b.failStateReadback();
  assert.throws(() => b.call('Publish',{previewToken:p.token,confirm:true}),/指標/);
  assert.equal(JSON.stringify(b.state),original);
  assert.equal(b.call('DepartmentRead').publication.regions['北一二A'].cutoff,'2026-10-03');
});
function withDetail(data) {
  const tiers=data.stores.flatMap(store=>['A','B','C','D','E','F'].map(tier=>({store:store.id,tier,visitors:4,renewals:2,npOut:0,terminated:0,visitOnly:2})));
  const observation=[...new Set(data.stores.map(s=>s.region))].flatMap(region=>['TWM','TST'].flatMap(origin=>['A','B','C','D','E'].map(tier=>({region,origin,tier,visitors:4,renewals:2}))));
  return O.validate({...data,prior:data.stores.map(s=>({store:s.id,aq_n:1,aq_d:2,rt_n:1,rt_d:2})),prior_period:{start:'2026-09-01',end:'2026-09-03'},
    renewalDetail:{schema:'north12-renewal-detail/v1',period_start:data.period_start,cutoff:data.cutoff,tiers,observation,plans:data.stores.map(s=>({store:s.id,plan:'合成方案',unrenewed:2})),coverage:{tiers:true,observation:true,plans:true}}});
}
function partial(data, ids) {
  return O.validate({...data,stores:data.stores.filter(s=>ids.includes(s.id)),records:data.records.filter(r=>ids.includes(r.store)),prior:null,prior_period:null,renewalDetail:undefined});
}
test('same-cutoff subset replaces its store and preserves absent stores, priors and optional tables with provenance',()=>{
  const old=P.fromOfficer(withDetail(department())),before=old.regions['北一二B'];
  const part=partial(before,[before.stores[0].id]);part.sha256='c'.repeat(64);part.source_name='synthetic-partial.xlsx';part.records[0].aq_n=4;
  const next=P.combine(old,P.fromOfficer(part));const b=next.snapshot.regions['北一二B'];
  assert.equal(b.stores.length,9);assert.equal(b.records.length,before.records.length);assert.equal(b.records[0].aq_n,4);
  assert.deepEqual(b.records.filter(r=>r.store!==part.stores[0].id),before.records.filter(r=>r.store!==part.stores[0].id));
  assert.deepEqual(b.prior,before.prior);assert.deepEqual(b.renewalDetail,before.renewalDetail);
  assert.deepEqual(next.snapshot.regions['北一二A'],old.regions['北一二A']);
  assert.ok(next.snapshot.retained_sources.some(r=>r.kind==='daily'&&r.sha256===before.sha256));
  assert.ok(next.snapshot.retained_sources.some(r=>r.kind==='tiers'&&r.source_name===before.source_name));
  assert.equal(next.changed,1);assert.equal(next.removed,0);
  assert.deepEqual(P.combine(next.snapshot,P.fromOfficer(part)).snapshot,next.snapshot);
});
test('same-cutoff full source without optional columns retains prior analysis, but advancing dates cannot relabel it',()=>{
  const old=P.fromOfficer(withDetail(department()));
  const next=P.combine(old,P.migrate(fixture({hash:'b'}))).snapshot;
  assert.deepEqual(next.regions['北一二B'].renewalDetail,old.regions['北一二B'].renewalDetail);
  assert.ok(next.retained_sources.some(r=>r.kind==='prior'));
  const advanced=P.combine(next,P.migrate(fixture({days:4,hash:'c'}))).snapshot;
  assert.equal(advanced.regions['北一二B'].renewalDetail,undefined);assert.equal(advanced.regions['北一二B'].prior,null);
  assert.deepEqual(advanced.regions['北一二A'],old.regions['北一二A']);
  assert.throws(()=>P.combine(old,P.fromOfficer({...partial(old.regions['北一二B'],[old.regions['北一二B'].stores[0].id]),cutoff:'2026-10-04'})),/缺少店日/);
});
test('canonical publication replay is idempotent and both readers expose the identical version',()=>{
  const b=runtime(),snapshot=P.fromOfficer(withDetail(department()));
  const first=publish(b,snapshot),writes=b.events.filter(e=>e==='state-write').length;
  const again=publish(b,snapshot);assert.equal(again.status,'already_current');assert.equal(b.files.size,1);
  assert.equal(b.events.filter(e=>e==='state-write').length,writes);
  const read=b.call('DepartmentRead'),attached=b.context.readonlyConversionAttach_({});
  assert.equal(read.live.revision,attached.conversionStatus.revision);
  assert.equal(read.live.activeHash,attached.conversionStatus.activeHash);
  assert.deepEqual(JSON.parse(JSON.stringify(attached.conversionBattle)),P.projectB(read.publication));
});
test('department POST retains original ACL and every endpoint refuses a public immutable file',()=>{
  const b=runtime({post:true});
  assert.equal(b.post({action:'readonly_conversion_department_read',employeeId:b.auth.employeeId,token:'SYNTHETIC_SESSION'}).status,'error');
  assert.equal(b.events.includes('folder'),false);
  assert.equal(b.post({action:'readonly_conversion_department_read',...b.auth,employeeId:'SYN002'}).status,'error');
  publish(b,P.fromOfficer(department()));[...b.files.values()][0].sharing='ANYONE';
  assert.throws(()=>b.call('DepartmentRead'),/私有資料域/);
  assert.equal(b.context.readonlyConversionAttach_({kpiBattle:{keep:1}}).conversionBattle,undefined);
});
test('a new B-only upload preserves A, C and D byte-for-byte including dates, sources and detail',()=>{
 const X=require('../assets/vendor/xlsx.full.min.js'),{source}=require('./helpers/renewal-detail-workbook.cjs');
 const old=P.fromOfficer(O.parseWorkbook(source({days:11}),X,{sha256:'a'.repeat(64),source_name:'synthetic-four-regions.xlsx',source_bytes:1234}));
 const b=runtime();publish(b,old);publish(b,P.migrate(fixture({days:12,hash:'b'})));
 const read=b.call('DepartmentRead');for(const region of ['北一二A','北一二C','北一二D'])assert.deepEqual(read.publication.regions[region],old.regions[region]);
 assert.equal(read.publication.regions['北一二B'].cutoff,'2026-10-12');
 assert.equal(b.context.readonlyConversionAttach_({}).conversionStatus.activeHash,read.live.activeHash);
});
test('the embedded report CSP permits the exact generated scripts without allowing arbitrary inline code',()=>{
 const fs=require('fs'),vm=require('vm'),crypto=require('crypto'),scope={window:{}};
 vm.runInNewContext(fs.readFileSync('north12-officer-export-assets.js','utf8'),scope);
 const html=O.buildHtml(department(),scope.window.North12OfficerExportAssets),parent=fs.readFileSync('department-conversion.html','utf8');
 const scripts=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);assert.equal(scripts.length,2);
 for(const script of scripts)assert.ok(parent.includes("'sha256-"+crypto.createHash('sha256').update(script).digest('base64')+"'"));
 assert.doesNotMatch(parent,/script-src[^;]*'unsafe-inline'/);assert.match(parent,/sandbox="allow-scripts"/);assert.doesNotMatch(parent,/sandbox="[^"]*allow-same-origin/);
});
