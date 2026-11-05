const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const E=require('../threec-readonly-export.js'),A=require('../threec-readonly-assets.js'),H=require('../offline-html.js'),F=require('./threec-search-fixture.cjs'),Q=require('../quote-reference-core.js'),R=require('./tradein-reference-full-fixture.cjs');
test('exports every source row and original condition with scoped data and the existing offline profile',()=>{
 for(const kind of ['shopping','tradein']){
  const response=F[kind]();response.token='DO_NOT_EXPORT';response.registry={secret:'DO_NOT_EXPORT'};response.snapshot.secret='DO_NOT_EXPORT';response.snapshot.rows[0].employeeId='DO_NOT_EXPORT';const before=JSON.stringify(response);
  const projected=E.project(kind,response),html=E.build(kind,response,A);
  assert.equal(projected.response.snapshot.rows.length,response.snapshot.rows.length);assert.equal(JSON.stringify(response),before);
  if(kind==='shopping')assert.deepEqual(projected.response.snapshot.rows.map(r=>r.project_prices),response.snapshot.rows.map(r=>r.project_prices));
  else assert.deepEqual(projected.response.snapshot.rows.map(r=>r.quotes),response.snapshot.rows.map(r=>r.quotes));
  assert.ok(html.startsWith('<!doctype html>\n'));assert.ok(html.includes(H.CSP));assert.ok(html.includes(H.PROFILE));
  assert.doesNotMatch(html,/DO_NOT_EXPORT|script\.google|<script[^>]*src=|<link[^>]*href=|<iframe|<form|type="module"|type="file"|localStorage|sessionStorage|fetch\(/);
  new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1]);
 }
});
test('untrusted price text cannot escape the JSON script and incomplete sources fail closed',()=>{
 const r=F.shopping();r.snapshot.rows[0].model='</script><img src=x onerror=alert(1)>';const html=E.build('shopping',r,A);assert.ok(!html.includes('</script><img'));assert.ok(html.includes('\\u003c/script>'));
 assert.throws(()=>E.build('shopping',{status:'ok',snapshot:null},A));
 assert.throws(()=>E.build('shopping',{...r,snapshot:{...r.snapshot,row_count:1}},A),/筆數/);
 assert.throws(()=>E.build('tradein',r,A),/來源/);
 assert.throws(()=>E.build('shopping',{...r,snapshot:{...r.snapshot,source_version_date:''}},A),/日期/);
});
test('local reference retains zero-as-pending, source validity, part numbers and Mac grade definitions',()=>{
 const raw={standard:{'機款主檔':[{'機款ID':'D1','系列':'合成新機','容量':'256G','品牌':'Test'}]},prices:{fields:['id','project','tariff','term','rent','price','retail'],dicts:[['D1'],['5G_XH(24)-新申裝/續約'],['999H'],[24],[999],[0],[29900]],rows:[[0,0,0,0,0,0,0]]},priceSource:{file:'synthetic.xls',date:'2026-11-02'},recycle:R.fixture()};
 const reference=Q.convert(raw,'a'.repeat(64));const exported=E.project('tradein',reference.tradein).response;
 assert.deepEqual(exported.referenceCatalog,reference.tradein.referenceCatalog);assert.equal(exported.localReference,true);assert.equal(exported.referenceCatalog.devices.find(d=>d.id==='zero').variants[0].items[0].price,0);
 const html=E.build('tradein',reference.tradein,A);assert.ok(html.includes('合成A等條件'));assert.ok(html.includes('2026-11-30'));assert.ok(html.includes('MAC-A'));
});
test('generated display assets stay in sync with the approved page and runtime sources',()=>{
 const before=fs.readFileSync(require.resolve('../threec-readonly-assets.js'),'utf8');require('node:child_process').execFileSync(process.execPath,['scripts/build-threec-readonly-assets.mjs'],{cwd:require('node:path').resolve(__dirname,'..')});assert.equal(fs.readFileSync(require.resolve('../threec-readonly-assets.js'),'utf8'),before);
});
