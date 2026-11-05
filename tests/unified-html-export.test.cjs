const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const H=require('../offline-html.js'),B=require('../battle-html-export.js'),K=require('../kpi-battle-controller.js'),S=require('../readonly-store-snapshot.js'),A=require('../readonly-dashboard-adapter.js'),D=require('../department-readonly-core.js'),DA=require('../department-readonly-assets.js'),DF=require('./helpers/department-readonly-synthetic.cjs'),P=require('../patrol-inspection-export.js'),O=require('../north12-officer-core.js'),X=require('../assets/vendor/xlsx.full.min.js');
const {fixture}=require('./helpers/readonly-dashboard-fixture.cjs'),{workbook}=require('./helpers/readonly-conversion-workbook.cjs');
const {samples}=require('./helpers/unified-html-samples.cjs');
const body=html=>html.slice(html.indexOf('<body>'));
const inspect=html=>{
 assert.ok(html.startsWith('<!doctype html>\n'));assert.ok(!html.startsWith('\uFEFF'));assert.equal((html.match(/<meta charset=/g)||[]).length,1);
 assert.ok(html.includes('content="'+H.PROFILE+'"'));assert.ok(html.includes('content="'+H.CSP+'"'));
 assert.ok(!/<script\b[^>]*\bsrc=|<link\b[^>]*\bhref=|<iframe\b|<form\b|type=["']module["']/i.test(html));
};
test('all seven HTML exports use one plain UTF-8 offline profile and omit credentials',async()=>{
 const {html}=await samples();for(const value of Object.values(html)){inspect(value);assert.ok(!/DO_NOT_EXPORT_SECRET|DO_NOT_EXPORT_ID|SESSION_SECRET|HISTORY_SECRET/.test(value));}
});
test('format normalization changes only the head and leaves the report body intact',()=>{
 const html='\uFEFF<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8"><title>測試</title></head><body><p>原值 0／—</p><script>const value="<head>內文</head>";</script></body></html>';
 assert.equal(body(H.finalize(html)),body(html));assert.equal(H.finalize(H.finalize(html)),H.finalize(html));
});
test('KPI and awards include all authorized stores, people and model rows, with safe source text',async()=>{
 const s=await samples();s.data.source_file='</script><img src=x onerror=alert(1)>';const html=B.buildKpi(s.data);
 assert.ok(!html.includes('</script><img'));assert.ok(html.includes('&lt;img'));
 for(const row of s.data.personal)assert.ok(html.includes(H.escape(row.name)));
 for(const row of s.data.stores)for(const metric of Object.keys(row.metrics))assert.ok(html.includes(H.escape(metric)));
 assert.equal((s.html.awards.match(/<h2>[^<]+｜(?:督導|店長)/g)||[]).length,10);
 assert.ok(s.html.awards.includes('尚未有資料'));assert.throws(()=>B.buildKpi(null));assert.throws(()=>B.buildAwards({}));
});
test('TOP3/BOT3 keep zero, exclude unknowns, report ties and never mutate data',async()=>{
 const {rankings,reminderBrief}=await import('../tradein-reminder.mjs'),s=await samples(),before=JSON.stringify(s.tradein),r=rankings(s.tradein.rows);
 assert.equal(r.top.length,3);assert.equal(r.bottom.length,3);assert.equal(r.unknown,1);assert.equal(r.bottom[0].actual,0);
 assert.ok(!r.bottom.some(row=>r.top.some(top=>top.name===row.name)));assert.equal(JSON.stringify(s.tradein),before);
 const tied=rankings([{store:'甲',name:'測＊甲',actual:1},{store:'乙',name:'測＊乙',actual:1},{store:'丙',name:'測＊丙',actual:null}]);assert.equal(tied.equal,true);assert.equal(tied.unknown,1);
 const brief=reminderBrief(s.tradein);assert.ok(brief.includes('店點 TOP3'));assert.ok(brief.includes('個人 BOT3'));assert.ok(brief.includes('回收參考價 TOP3：請'));assert.ok(!brief.includes('FDI 多'));
});
test('store totals use verified store summaries, keep support independent, and filtered scopes fail closed',async()=>{
 const E=await import('../tradein-export-core.mjs'),rules={...E.rulesForMonth('2026-10'),isDemo:false},c={active:true,mode:'public',allowedStores:['萬大'],people:[['萬大','測＊員','同仁',1]],storeSummaries:[{store:'萬大',actual:7,target:15}],selectedStore:'萬大'};
 const model=E.buildExportModel(c,'all',rules);assert.equal(model.stores[0].actual,7);assert.equal(model.rows[0].actual,1);
 assert.equal(E.buildExportModel({...c,currentPeople:c.people,countFilterLabel:'回收1筆'},'current',rules).stores.length,0);
 assert.equal(E.buildExportModel(c,'all',{...rules,month:'2026-12',start:'2026-12-01',end:'2026-12-31',staffTarget:3,actingManager:'exempt'}).stores.length,0);
 assert.throws(()=>E.buildExportModel({...c,storeSummaries:[{store:'萬大',actual:-1,target:15}]},'all',rules));
});
