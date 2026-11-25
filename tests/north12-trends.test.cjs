const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../north12-officer-core'),T=require('../north12-trends'),R=require('../north12-trend-report');
const A='北一二A',B='北一二B',id='DNB90001';
function batch(month,days,stores,make,detail){
  const records=stores.flatMap((s,i)=>Array.from({length:days},(_,j)=>{
    const [n,d]=make(i,j+1);
    return {store:s.id,date:T.shift(month,j),rt_n:n,rt_d:d,aq_n:n,aq_d:d};
  }));
  return {schema:C.SCHEMA,period_start:month,cutoff:T.shift(month,days-1),stores,records,
    sha256:'a'.repeat(64),source_bytes:1,source_name:'合成.xlsx',renewalDetail:detail};
}
const store=(id,region)=>({id,name:id,short:id,region});
const engine=(...batches)=>T.engine(T.apply(new Map(),batches));
test('100→120, 40%→45%, zero and missing denominators',()=>{
  const pair=T.changes(C.aggregate([{aq_n:54,aq_d:120,rt_n:54,rt_d:120}]),C.aggregate([{aq_n:40,aq_d:100,rt_n:40,rt_d:100}]),'rt');
  assert.equal(pair.delta,20);assert.equal(pair.growth,.2);assert.equal(+pair.points.toFixed(2),5);
  const d=batch('2026-11-01',2,[store(id,A)],(_,day)=>day===1?[1,1]:[0,9]);
  assert.equal(C.aggregate(d.records).rt_rate,.1);assert.equal(C.aggregate([d.records[1]]).rt_rate,0);
  const z=C.aggregate([{aq_n:0,aq_d:0,rt_n:0,rt_d:0}]);assert.equal(z.rt_rate,null);
  assert.equal(T.changes(C.aggregate(d.records),z,'rt').growth,null);assert.equal(T.changes(null,z,'rt').delta,null);
});
test('Monday to Wednesday only, cross-month weeks require both months',()=>{
  const d=batch('2026-04-01',8,[store(id,A)],()=>[1,10]),e=engine(d),now=T.week(d.cutoff),prior=T.earlierWeek(now);
  assert.deepEqual(now,T.span('2026-04-06','2026-04-08'));assert.deepEqual(prior,T.span('2026-03-30','2026-04-01'));
  assert.equal(e.compare(now,prior,A).a,null);
  const march=batch('2026-03-01',31,d.stores,()=>[1,10]);
  assert.equal(engine(d,march).compare(now,prior,A).b.rt_d,30);
});
test('shorter month, complete months, weighted common stores and unchanged full reference',()=>{
  const roster=[store(id,A),store('DNB90002',B),store('DNB90003','北一二C'),store('DNB90004','北一二D')];
  const a=batch('2026-02-01',28,roster,()=>[1,10]);
  const b=batch('2026-03-01',31,[...roster,store('DNB90005',A)],(i)=>[1,i===4?100:12]);
  const h=T.apply(new Map(),[a,b]),m=R.build(h,b.cutoff,A),full=R.build(h,b.cutoff,A,true);
  assert.equal(m.monthly.end,'2026-03-28');assert.equal(m.oldMonth.days,28);assert.equal(full.monthly.days,31);
  const c=m.comparisons[0].mom;assert.equal(c.actual.rt_d,112*28);assert.equal(c.a.rt_d,12*28);assert.equal(T.changes(c.a,c.b,'rt').growth,.2);assert.equal(c.exclusions.length,1);
  const only=R.build(h,b.cutoff,id);assert.deepEqual(only.series.map(p=>p.department),m.series.map(p=>p.department));
  assert.equal(m.office,null);assert.equal(m.series.at(-1).office,null);assert.equal(T.gap(50,40,'level'),25);
  assert.equal(+T.gap(-.03,-.08,'growth').toFixed(2),5);
});
test('transfers excluded, failure atomic, correction idempotent, historical month retained',()=>{
  const a=batch('2026-10-01',31,[store(id,A)],()=>[0,1]),b=batch('2026-11-01',11,[store(id,B)],()=>[0,2]);
  let h=T.apply(new Map(),[a,b]);const clean=R.build(h,b.cutoff,B);
  assert.equal(clean.comparisons[0].mom.a,null);assert.match(clean.comparisons[0].mom.exclusions.join(),/歸屬變動/);
  assert.throws(()=>T.apply(h,[{...b,records:b.records.slice(1)}]),/缺少店日/);assert.deepEqual(R.build(h,b.cutoff,B),clean);
  h=T.apply(h,[b]);assert.deepEqual(R.build(h,b.cutoff,B),clean);
  const corrected=batch('2026-11-01',11,b.stores,()=>[1,4]);h=T.apply(h,[corrected]);assert.equal(R.build(h,b.cutoff,B).comparisons[0].summary.total.rt_d,44);
  assert.equal(h.get(a.period_start+A).records.length,31);
});
test('checked pivot is used only for its exact range, never a week',()=>{
  const d=batch('2026-11-01',5,[store(id,A)],()=>[1,2]);
  d.prior=[{store:id,aq_n:0,aq_d:0,rt_n:0,rt_d:0}];d.prior_period={start:'2026-10-01',end:'2026-10-05'};
  const m=R.build(T.apply(new Map(),[d]),d.cutoff,A),r=m.comparisons[0];
  assert.equal(r.mom.b.rt_d,0);assert.equal(T.changes(r.mom.a,r.mom.b,'rt').growth,null);assert.equal(r.wow.b,null);
});
test('Tier source period, fixed peer group, narrow offline projection',()=>{
  const X=require('../assets/vendor/xlsx.full.min.js'),{source}=require('./helpers/renewal-detail-workbook.cjs');
  const d=C.parseWorkbook(source(),X,{sha256:'d'.repeat(64)}),h=T.apply(new Map(),[d]),s=d.stores[0],m=R.build(h,d.cutoff,s.id);
  assert.equal(m.heat[0].rows[0].rate,.5);assert.equal(m.heat[0].rows[0].office,null);
  assert.equal(m.heat[0].rows[0].previous,null);assert.equal(m.observation.length,0);
  assert.equal(R.build(h,T.shift(d.cutoff,-1),s.id).heat[0].rows,null);
  assert(!JSON.stringify(m).includes(d.stores[1].id));assert(!JSON.stringify(m).includes('SYNTHETIC_DNB'));
});
test('explicit store-month totals provide exact monthly scope, never weekly points or store-day averages',()=>{
  const X=require('../assets/vendor/xlsx.full.min.js');
  const parse=(month,n,d)=>{
    const book=X.utils.book_new();
    X.utils.book_append_sheet(book,X.utils.aoa_to_sheet([
      ['資料起日','截止日','區別','店碼','店名','AQ上線數','AQ來客數','RT續約數','RT合格來客數'],
      [month+'-01',month+'-03',A,id,'合成店',n,d,n,d]]),'部區月累計');
    return C.parseWorkbook(book,X,{sha256:'a'.repeat(64)});
  };
  const m=R.build(T.apply(new Map(),[parse('2026-10',40,100),parse('2026-11',54,120)]),'2026-11-03',A);
  assert.equal(m.comparisons[0].summary.total.rt_d,120);
  assert.equal(T.changes(m.comparisons[0].mom.a,m.comparisons[0].mom.b,'rt').growth,.2);
  assert.equal(m.comparisons[0].wow.a,null);assert.equal(m.series.length,0);
  assert(m.daily.every(d=>!d.total));
});
