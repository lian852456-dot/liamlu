const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const S=require('../readonly-store-snapshot.js'),A=require('../readonly-dashboard-adapter.js'),Assets=require('../readonly-store-export-assets.js');
const {fixture}=require('./helpers/readonly-dashboard-fixture.cjs');
const make=()=>A.fromBundle(fixture()),options={generatedAt:'2026-10-18T04:00:00Z'};

test('snapshot projects only approved district/store fields and leaves the authenticated model unchanged',()=>{
 const model=make(),secret='DO_NOT_EXPORT_PRIVATE_SENTINEL';
 model.profile={employeeId:secret,token:secret};model.personal.records[0].name=secret;model.awards.data.supervisor.privateNote=secret;
 model.goldBalance=secret;model.kpi.data.token=secret;model.kpi.stores[0].employeeName=secret;
 model.kpi.items.push({key:'解約後NP OUT(督導績)',label:secret},{key:'個人獎金',label:secret});
 model.kpi.stores[0].fullMetrics.push({key:'個人獎金',actual:999,label:secret});
 model.conversion.customerRecords=[secret];model.conversion.records[0].employeeId=secret;
 const before=JSON.stringify(model),snapshot=S.fromModel(model,options),html=S.buildHtml(snapshot);
 assert.equal(JSON.stringify(model),before);assert.equal(snapshot.kpi.stores.length,9);
 assert.equal(snapshot.kpi.items.length,4);assert(!JSON.stringify(snapshot).includes(secret));assert(!html.includes(secret));
 assert(!JSON.stringify(snapshot).includes('督導績'));assert(!Object.hasOwn(snapshot,'personal'));assert(!Object.hasOwn(snapshot,'awards'));assert(!Object.hasOwn(snapshot,'profile'));
 assert.deepEqual(Object.keys(snapshot.conversion.records[0]).sort(),['aq_d','aq_n','date','rt_d','rt_n','store']);
 assert.deepEqual(Object.keys(snapshot.kpi.data.aggregate.fullMetrics[0]).sort(),['actual','key','label','rate','target']);
});
test('buildHtml reprojects a supplied snapshot rather than serializing arbitrary extra fields',()=>{
 const value=S.fromModel(make(),options);value.auth={token:'EXTRA_SECRET_NOT_ALLOWED'};value.personal=['EXTRA_SECRET_NOT_ALLOWED'];
 assert(!S.buildHtml(value).includes('EXTRA_SECRET_NOT_ALLOWED'));
});
test('KPI and conversion retain separate observed periods and export time',()=>{
 const value=S.fromModel(make(),options),html=S.buildHtml(value);
 assert.equal(value.kpi.period,'2026-10-01～2026-10-13');assert.equal(value.conversion.cutoff,'2026-10-11');
 assert(html.includes('2026-10-01～2026-10-13'));assert(html.includes('2026-10-01～2026-10-11'));assert(html.includes('12:00:00'));
 assert(html.includes('不會自動更新'));assert.equal(value.generatedAt,'2026-10-18T04:00:00.000Z');
});
test('missing values remain null and zero denominators remain unavailable',()=>{
 const model=make();model.kpi.data.aggregate.overall_kpi=null;model.kpi.data.aggregate.company_rank=null;
 model.kpi.data.aggregate.fullMetrics[0].actual=null;model.kpi.data.aggregate.fullMetrics[0].rate=null;
 const value=S.fromModel(model,options);assert.equal(value.kpi.data.aggregate.overall_kpi,null);assert.equal(value.kpi.data.aggregate.fullMetrics[0].actual,null);
 const zero=value.conversion.records.find(r=>r.store==='DNB10062'&&r.date==='2026-10-05');assert.equal(zero.aq_d,0);assert.equal(zero.aq_n,0);
 assert(S.buildHtml(value).includes('零分母或缺少可比資料顯示 —'));
});
test('missing conversion is explicit and does not fabricate observed dates or zero-valued charts',()=>{
 const model=make();model.conversion=null;const html=S.buildHtml(S.fromModel(model,options));
 assert(html.includes('未取得已核實來源'));assert(html.includes('本快照未包含此表，缺值不補零'));assert(!html.includes('id="aq-chart"'));
});
test('invalid source range, incomplete district and conflicting conversion fail closed',()=>{
 const badPeriod=make();badPeriod.kpi.period='來源未提供';assert.throws(()=>S.fromModel(badPeriod,options),/統計起訖/);
 const mismatch=make();mismatch.kpi.period='2026/10/01～10/12';assert.throws(()=>S.fromModel(mismatch,options),/截止不一致/);
 const missing=make();missing.kpi.stores.pop();assert.throws(()=>S.fromModel(missing,options),/九店/);
 const foreign=make();foreign.kpi.stores[0].id='FOREIGN_STORE';assert.throws(()=>S.fromModel(foreign,options),/九店/);
 const conflict=make();conflict.conversion.records.push({...conflict.conversion.records[0],aq_d:99});assert.throws(()=>S.fromModel(conflict,options),/衝突/);
 assert.throws(()=>S.buildHtml({schema:'other'}),/格式/);
});
test('standalone HTML has no remote dependencies, write forms, credentials or live dashboard code',()=>{
 const html=S.buildHtml(S.fromModel(make(),options));
 assert(!/<script[^>]+src=|<link\b|<iframe\b|<form\b|type="file"/i.test(html));
 assert(!html.includes('script.google.com'));assert(!html.includes('north12b_password_session'));assert(!html.includes('private_access'));
 assert(html.includes("connect-src 'none'"));assert(html.includes("form-action 'none'"));
 assert(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/.test(html));
 assert.equal((html.match(/<script\b/g)||[]).length,3);
});
test('HTML and inert JSON escape adversarial source metadata and do not emit attacker tags',()=>{
 const model=make();model.kpi.sourceName='</script><img src=x onerror="window.__snapshotPwned=1"> & \u2028';
 model.kpi.version='</script><script>window.__snapshotPwned=2</script>';
 const html=S.buildHtml(S.fromModel(model,{...options,exampleLabel:'<svg onload="window.__snapshotPwned=3">'}));
 assert(!html.includes('<img src=x'));assert(!html.includes('<svg onload='));assert(!html.includes('<script>window.__snapshotPwned'));
 assert(html.includes('&lt;img'));assert(html.includes('\\u003c/script\\u003e'));
});
test('offline presentation assets are generated from the existing reviewed CSS and core',()=>{
 assert.equal(Assets.css,fs.readFileSync(require.resolve('../readonly-dashboard.css'),'utf8'));
 assert.equal(Assets.core,fs.readFileSync(require.resolve('../readonly-dashboard-core.js'),'utf8'));
});
