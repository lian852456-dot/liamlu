'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../kpi-battle-controller.js');
const key='AQ V+D 999 (含)以上',names=['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','三創','六張犁'];
const calendar=month=>C.kpiBattleTargetMonth({month});
const daily=(value,month='2026-11',metric=key)=>C.kpiBattleDailyTarget(value,metric,calendar(month));
function raw(values=names.map(()=>101),month='2026-11'){
 return {meta:{month,snapshotDay:8,monthDays:calendar(month).days},items:[{key}],stores:names.map((name,i)=>({name:'台北'+name,items:{[key]:{t:values[i],a:14,reportRate:1.3}}})),persons:[]};
}
test('daily targets use the source calendar, including leap years and century rules',()=>{
 for(const [month,days] of [['2026-01',31],['2026-04',30],['2027-02',28],['2028-02',29],['1900-02',28],['2000-02',29],['2100-02',28]]){
  assert.deepEqual(calendar(month),{month,days});
  assert.equal(daily(days+1,month).value,2);
  assert.equal(daily(days,month).value,1);
 }
 assert.equal(daily(29,'2027-02').value,2);assert.equal(daily(29,'2028-02').value,1);
});
test('missing, malformed and inconsistent months never fall back to today or cutoff day',()=>{
 for(const meta of [{},{month:'2026-13'},{month:'2026-2'},{month:202611},{month:'2026-11',monthDays:31},{month:'2026-11',monthDays:true},{month:'2026-11',monthDays:[]},{month:'2026-11',monthDays:' 30 '}]){
  const context=C.kpiBattleTargetMonth(meta);assert.equal(context.days,null);
  assert.equal(C.kpiBattleDailyTarget(101,key,context).status,'invalid-month');
 }
 assert.equal(C.kpiBattleTargetMonth({month:'2026-11',monthDays:'30',snapshotDay:1}).days,30);
 assert.equal(C.kpiBattleTargetMonth({month:'2026-11',monthDays:null}).days,30);
});
test('positive fractional values round up to an integer without discount or uplift',()=>{
 for(const [input,expected] of [[101,4],[30,1],[30.01,2],[0.01,1],[Number.MIN_VALUE,1],[' 101 ',4],['.01',1],['+30.01',2]])assert.equal(daily(input).value,expected);
 assert.equal(daily(300).value,10); // no 120% multiplier
});
test('missing, explicit zero, invalid numeric types and negative targets remain distinct',()=>{
 for(const value of [undefined,null,'','   '])assert.equal(daily(value).status,'missing');
 for(const value of [0,'0','0.0',-0])assert.equal(daily(value).status,'no-target');
 for(const value of [true,false,{},[],[30],NaN,Infinity,-Infinity,-1,'-1','NaN','Infinity','30%','0x10','1e3','1,000',Number.MAX_VALUE]){
  const result=daily(value);assert.equal(result.status,'invalid-target',String(value));assert.equal(result.value,null);
 }
});
test('count, point and money use their source unit; rates, ranks and unknown fields are inapplicable',()=>{
 assert.equal(daily(101).unit,'件／日');
 assert.equal(daily(101,'2026-11','RT上線點數').unit,'點／日');
 for(const name of ['預付卡開卡面額','換約淨新增金額','配件及其他營收']){
  const result=daily(35523,'2026-11',name);assert.equal(result.value,1185);assert.equal(result.unit,'金額原單位／日');
 }
 for(const name of ['保險搭售率','公司排名','附掛得分','來源新增待分類']){
  assert.deepEqual(daily(.5,'2026-11',name),{status:'not-applicable',value:null,unit:''});
 }
});
test('district adds separately rounded store goals, preserves source values and ignores cutoff progress',()=>{
 const data=raw(),before=JSON.stringify(data),view=C.kpicalcToKpiBattleView(data);
 assert.equal(view.aggregate.daily_targets[key].value,36);
 assert.notEqual(view.aggregate.daily_targets[key].value,Math.ceil(909/30));
 assert.deepEqual(view.aggregate.daily_targets[key],{status:'ok',value:36,unit:'件／日',known:9,total:9,noTarget:0});
 assert.equal(view.stores[0].daily_targets[key].value,4);
 assert.deepEqual(view.stores[0].metrics[key],{target:101,actual:14,rate:1.3,daily_gap:14-101*8/30});
 data.meta.snapshotDay=30;assert.equal(C.kpicalcToKpiBattleView(data).aggregate.daily_targets[key].value,36);
 data.meta.snapshotDay=8;assert.equal(JSON.stringify(data),before);
});
test('district missing targets are explicitly partial and never substituted with zero',()=>{
 const data=raw([null,'',0,.01,true,101,101,61,89]);
 const view=C.kpicalcToKpiBattleView(data),goal=view.aggregate.daily_targets[key];
 assert.deepEqual(goal,{status:'partial',value:15,unit:'件／日',known:6,total:9,noTarget:1});
 assert.equal(view.stores[0].daily_targets[key].status,'missing');
 assert.equal(view.stores[2].daily_targets[key].status,'no-target');
 assert.equal(view.stores[4].daily_targets[key].status,'invalid-target');
 for(const store of data.stores)delete store.items[key];
 assert.deepEqual(C.kpicalcToKpiBattleView(data).aggregate.daily_targets[key],{status:'partial',value:null,unit:'件／日',known:0,total:9,noTarget:0});
});
test('district zero targets, absent stores and duplicate aliases have explicit coverage',()=>{
 const data=raw(names.map(()=>0));
 assert.deepEqual(C.kpicalcToKpiBattleView(data).aggregate.daily_targets[key],{status:'no-target',value:null,unit:'件／日',known:9,total:9,noTarget:9});
 data.stores.pop();
 let target=C.kpicalcToKpiBattleView(data).aggregate.daily_targets[key];
 assert.equal(target.status,'partial');assert.equal(target.known,8);assert.equal(target.value,null);
 data.stores.push({...data.stores[0],name:'酒泉'});
 target=C.kpicalcToKpiBattleView(data).aggregate.daily_targets[key];
 assert.equal(target.status,'partial');assert.equal(target.known,7);assert.equal(target.value,null);
});
test('missing metric rows retain daily status; an invalid calendar locks district goals only',()=>{
 const data=raw();delete data.stores[0].items[key];data.meta.monthDays=31;
 const view=C.kpicalcToKpiBattleView(data);
 assert.equal(view.stores[0].daily_targets[key].status,'missing');
 assert.equal(view.aggregate.daily_targets[key].status,'invalid-month');assert.equal(view.aggregate.daily_targets[key].value,null);
 assert.equal(view.stores[1].metrics[key].target,101);assert.equal(view.stores[1].metrics[key].rate,1.3);
});
