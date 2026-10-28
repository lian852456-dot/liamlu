const test=require('node:test'),assert=require('node:assert/strict'),C=require('../readonly-dashboard-core.js');
const {fixture}=require('./helpers/readonly-dashboard-fixture.cjs');
const A=require('../readonly-dashboard-adapter.js'),S=require('../readonly-store-snapshot.js');
test('Monday weeks clip to observed dates and totals reconcile for all stores and one store',()=>{
 const d=fixture().privateResult.snapshot.conversionBattle;
 for(const rows of [d.records,d.records.filter(r=>r.store==='DNB10062')]){
  const before=JSON.stringify(rows),weeks=C.weeklySeries(rows);
  assert.deepEqual(weeks.map(w=>[w.start,w.end,w.partial]),[['2026-10-01','2026-10-04',true],['2026-10-05','2026-10-11',false]]);
  for(const k of ['aq_d','rt_d'])assert.equal(weeks.reduce((sum,w)=>sum+w[k],0),C.aggregate(rows)[k]);
  assert.equal(JSON.stringify(rows),before);
 }
 assert.deepEqual(C.weeklySeries(d.records.filter(r=>r.store==='DNB10062')).map(w=>[w.aq_d,w.rt_d]),[[40,16],[60,28]]);
});
test('partial selection, zero observations, year boundary and timezone do not move week boundaries',()=>{
 const row=date=>({date,aq_n:0,aq_d:0,rt_n:0,rt_d:0});
 const rows=['2026-12-31','2027-01-01','2027-01-03','2027-01-04'].map(row);
 assert.deepEqual(C.weeklySeries(rows).map(w=>[w.start,w.end,w.aq_d]),[['2026-12-31','2027-01-03',0],['2027-01-04','2027-01-04',0]]);
 const d=fixture().privateResult.snapshot.conversionBattle;
 assert.deepEqual(C.weeklySeries(d.records.filter(r=>r.date>='2026-10-03'&&r.date<='2026-10-06')).map(w=>[w.start,w.end,w.partial]),[['2026-10-03','2026-10-04',true],['2026-10-05','2026-10-06',true]]);
 assert.deepEqual(C.weeklySeries([]),[]);
 assert.throws(()=>C.weeklySeries([{...row('2026-10-01'),aq_d:null}]),/非負整數/);
});
test('downloaded HTML embeds the updated weekly engine and labels numeric partial-week totals',()=>{
 const html=S.buildHtml(S.fromModel(A.fromBundle(fixture())));
 assert(html.includes('每週來客數'));assert(html.includes('週一至週日'));
 assert(html.includes('10/01–10/04'));assert(html.includes('部分週 · 累計至 10/04'));
 assert(html.includes('每週來客數</h4>'));assert(html.includes('weeklySeries(records)'));
});
