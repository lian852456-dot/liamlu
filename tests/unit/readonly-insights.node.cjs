'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../readonly-dashboard-core.js'),Insights=require('../readonly-insights-core.js');
const stores=Core.STORES,rows=stores.map((s,i)=>({store:s.id,date:'2026-10-21',aq_n:5,aq_d:50,rt_n:i===0?10:30,rt_d:50}));
const prior=stores.map(s=>({store:s.id,aq_n:5,aq_d:50,rt_n:25,rt_d:50}));
const data={period_start:'2026-10-01',cutoff:'2026-10-21',sha256:'a'.repeat(64),source_name:'sample',records:rows,prior};
test('區加權締結率、MOM 百分點、來客增減分別正確',()=>{
 const x=Insights.evaluate(data,stores);
 assert.equal(x.total.rt_n,250);assert.equal(x.total.rt_d,450);
 assert.equal(x.total.rt_rate,250/450);
 assert.equal(x.mom.ratePP,250/450-0.5);
 assert.equal(x.mom.traffic,0);
});
test('可追件估算對低於區平均門市、避免誇大其餘店',()=>{
 const x=Insights.evaluate(data,stores),weak=x.stores.find(s=>s.id===stores[0].id);
 assert.equal(weak.achievable,Math.ceil(50*(250/450))-10);
 assert.equal(x.opportunity,weak.achievable);
 assert.equal(x.prioritized[0].id,weak.id);
});
test('缺少同期不冒充 MOM，樣本不足不冒充可追件',()=>{
 const small={...data,prior:null,records:rows.map(r=>({...r,rt_d:2,rt_n:1}))};
 const x=Insights.evaluate(small,stores);
 assert.equal(x.hasPrior,false);assert.equal(x.mom,null);
 assert.equal(x.stores[0].achievable,null);
 assert.equal(x.opportunity,0);
});
test('只以授權店的記錄計算',()=>{
 const x=Insights.evaluate(data,[stores[0]]);
 assert.equal(x.total.rt_d,50);assert.equal(x.stores.length,1);
});