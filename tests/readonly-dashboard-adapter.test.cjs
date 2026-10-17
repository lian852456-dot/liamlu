const test=require('node:test'),assert=require('node:assert/strict'),A=require('../readonly-dashboard-adapter.js'),{fixture}=require('./helpers/readonly-dashboard-fixture.cjs');
test('reuses the original KPI/awards source guards and keeps separate conversion cutoff',()=>{const m=A.fromBundle(fixture());assert.equal(m.kpi.cutoff,'2026-10-13');assert.equal(m.kpi.reportDate,'2026-10-14');assert.equal(m.conversion.cutoff,'2026-10-11');assert.equal(m.awards.available,true);assert.equal(m.personal.records.length,9);assert.equal(m.kpi.data.aggregate.overall_kpi,1.25);});
test('incomplete authorization is rejected before any view data is returned',()=>{for(const key of ['privateResult','kpiResult']){const f=fixture();f[key].status='error';assert.throws(()=>A.fromBundle(f),/已驗證/);}});
test('missing conversion stays unavailable rather than deriving visitor counts from KPI',()=>{const f=fixture();delete f.privateResult.snapshot.conversionBattle;const m=A.fromBundle(f);assert.equal(m.conversion,null);assert.match(m.conversionReason,/尚未匯入/);});
test('wrong awards publication/cutoff remains unavailable under the existing guard',()=>{const f=fixture();f.privateResult.snapshot.awardsBattle.report_run_date='2026-10-12';const m=A.fromBundle(f);assert.equal(m.awards.available,false);assert.equal(m.awards.data,null);});
test('unknown store is not mapped by name proximity',()=>{const f=fixture();f.kpiResult.data.stores[0].name='未知店';assert.throws(()=>A.fromBundle(f),/未核定/);});

test('personal display keeps upstream masks and never adds an unmasked name to the view',()=>{const f=fixture();f.kpiResult.data.persons[0].pname='測試全名';f.kpiResult.data.persons[1].pname='合＊名';const before=JSON.stringify(f);const m=A.fromBundle(f);assert.equal(m.personal.records[0].name,'測＊＊＊');assert.equal(m.personal.records[1].name,'合＊名');assert.equal(JSON.stringify(f),before);});

test('full KPI details follow every source item, preserve source fields and do not invent scores',()=>{
 const f=fixture(),before=JSON.stringify(f),m=A.fromBundle(f);
 assert.equal(m.kpi.items.length,25);assert.deepEqual(m.kpi.items.map(x=>x.key),f.kpiResult.data.items.map(x=>x.key));
 for(const store of m.kpi.stores){assert.equal(store.fullMetrics.length,25);for(const item of store.fullMetrics){const raw=f.kpiResult.data.stores.find(s=>s.name===store.store).items[item.key];assert.equal(item.actual,raw.a);assert.equal(item.target,raw.t);assert.equal(item.rate,raw.reportRate);assert.equal(item.weight,raw.w);assert.equal(item.score,null);}}
 assert.ok(m.kpi.data.aggregate.fullMetrics.every(item=>item.weight===null&&item.score===null));assert.equal(JSON.stringify(f),before);
 const extra='後續來源新增項目';f.kpiResult.data.items.push({key:extra});for(const store of f.kpiResult.data.stores)store.items[extra]={a:0,t:null,reportRate:null,w:0,score:0};
 const next=A.fromBundle(f);assert.equal(next.kpi.items.length,26);assert.deepEqual(next.kpi.stores[0].fullMetrics.at(-1),{key:extra,label:extra,actual:0,target:null,rate:null,weight:0,score:0,note:''});
});
test('store-only district reference is unavailable for aggregate instead of being counted nine times',()=>{
 const f=fixture(),key='解約後NP OUT(督導績)';f.kpiResult.data.items.push({key});for(const store of f.kpiResult.data.stores)store.items[key]={a:30,t:69,w:.025,reportRate:1.1};
 const m=A.fromBundle(f),aggregate=m.kpi.data.aggregate.fullMetrics.find(item=>item.key===key);
 assert.equal(aggregate.actual,null);assert.equal(aggregate.target,null);assert.equal(aggregate.rate,null);assert.match(aggregate.note,/未提供區整體/);assert.equal(m.kpi.stores[0].fullMetrics.at(-1).actual,30);
});
test('duplicate or empty source item catalogs cannot silently hide or overwrite metrics',()=>{for(const items of [[],[{key:''}],[{key:'x'},{key:'x'}]]){const f=fixture();f.kpiResult.data.items=items;assert.throws(()=>A.fromBundle(f),/項目清單/);}});
test('MoM uses matching store and full source period with ratios of sums',()=>{
 const d=fixture().privateResult.snapshot.conversionBattle,before=JSON.stringify(d),all=A.periodComparison(d);
 assert.equal(all.available,true);assert.equal(all.current.aq_d,1260);assert.equal(all.prior.aq_d,900);assert.equal(all.channels.aq.visitors.delta,360);assert.equal(all.channels.aq.visitors.growth,.4);
 assert.equal(all.channels.aq.conversion.current,90/1260);assert.equal(all.channels.aq.conversion.prior,45/900);
 const one=A.periodComparison(d,{store:d.stores[0].id});assert.equal(one.current.aq_d,100);assert.equal(one.prior.aq_d,100);assert.equal(one.channels.aq.visitors.growth,0);assert.equal(JSON.stringify(d),before);
});
test('partial date filters and missing prior totals never produce unmatched MoM',()=>{const d=fixture().privateResult.snapshot.conversionBattle;for(const opts of [{start:'2026-10-02'},{end:'2026-10-10'}]){const c=A.periodComparison(d,opts);assert.equal(c.available,false);assert.equal(c.prior,null);assert.equal(c.channels.aq.visitors.growth,null);}const c=A.periodComparison({...d,prior:null,prior_period:null});assert.equal(c.available,false);assert.match(c.reason,/未提供/);});
test('zero baseline and zero denominators remain undefined instead of infinite or false zero changes',()=>{
 const d=fixture().privateResult.snapshot.conversionBattle;for(const row of d.prior){row.aq_n=0;row.aq_d=0;row.rt_n=0;row.rt_d=1;}
 const c=A.periodComparison(d);assert.equal(c.channels.aq.visitors.growth,null);assert.ok(c.channels.aq.visitors.delta>0);assert.equal(c.channels.aq.conversion.delta,null);assert.equal(c.channels.rt.conversion.growth,null);assert.ok(c.channels.rt.conversion.delta>0);
});
