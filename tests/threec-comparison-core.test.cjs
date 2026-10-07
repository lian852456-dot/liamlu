'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Compare=require('../threec-comparison-core.js');
const plan='5G_iPhone_XH(24)-新申裝/續約／999H';
const row=(changes={})=>({source_sheet:'iPhone',brand:'APPLE',model:'iPhone 測試機 256G(黑)',colorless_model:'iPhone 測試機 256G',retail_price:'29,900',project_prices:{[plan]:'1,299','5G_iPhone_XH(48)-新申裝/續約／1399H_加碼版':'0'},...changes});
test('機型搜尋容許省略或重複空白，保留大小寫、價格與既有篩選',()=>{
 const enterprise='(企客_5G)榮耀之星999H(24)_iPhone';
 const index=Compare.buildIndex({rows:[row({model:'iPhone 17 Pro 256GB(黑)',colorless_model:'iPhone 17 Pro 256GB',project_prices:{[plan]:0,[enterprise]:2999}}),row({model:'iPhone 17 512GB(白)',colorless_model:'iPhone 17 512GB',project_prices:{[plan]:1299}}),row({model:'iPhone 16 256GB',colorless_model:'iPhone 16 256GB'}),row({brand:'Samsung',model:'Galaxy S 25 256GB',colorless_model:'Galaxy S 25 256GB'})]});
 const before=JSON.stringify(index),filters={segment:'consumer',rent:'common'};
 const expected=Compare.buildView(index,{...filters,query:'iPhone 17'},{includeOptions:false});
 assert.equal(expected.totalRows,2);
 for(const query of ['iphone17','IPHONE17',' iPhone  17 ','iPhone\t17','iPhone\u300017'])assert.deepEqual(Compare.buildView(index,{...filters,query},{includeOptions:false}),expected);
 const pro=Compare.buildView(index,{...filters,query:'iphone17pro',brand:'APPLE',capacity:'256GB'},{includeOptions:false});assert.equal(pro.totalRows,1);assert.equal(Compare.cell(pro.rows[0],pro.columns[0]).value,0);
 for(const extra of [{brand:'Samsung'},{capacity:'128GB'},{model:'iPhone 16'},{rent:'599'},{term:'36'},{version:'VIP'},{project:'不存在'}])assert.equal(Compare.buildView(index,{...filters,query:'iphone17',...extra},{includeOptions:false}).totalRows,0);
 const ent=Compare.buildView(index,{segment:'enterprise',query:'iphone17'},{includeOptions:false});assert.equal(ent.totalRows,1);assert.equal(Compare.cell(ent.rows[0],ent.columns[0]).value,2999);
 assert.equal(Compare.buildView(index,{...filters,query:'iphone 18'},{includeOptions:false}).totalRows,0);assert.equal(JSON.stringify(index),before);
});
test('空白容錯只用於單一機型，不拼接品牌、來源、代碼或原始方案條件',()=>{
 const index=Compare.buildIndex({rows:[row({brand:'APPLE',source_sheet:'17',model:'iPhone 256GB',colorless_model:'iPhone 256GB',code:'SYN 17',project_prices:{'一般 續約 999H(24)':0}})]});
 for(const query of ['appleiphone','iphone17','syn17','續約999'])assert.equal(Compare.buildView(index,{query},{includeOptions:false}).totalRows,0);
 for(const query of ['APPLE','SYN 17','續約 999','一般','256GB'])assert.equal(Compare.buildView(index,{query},{includeOptions:false}).totalRows,1);
});
test('完整條件解析月租、跨期數、版本且保留原始限定條件',()=>{
 assert.deepEqual({...Compare.condition(plan)}, {key:plan,raw:plan,project:'5G iPhone-新申裝/續約',rent:'999',term:'24',version:'一般',detail:''});
 const addon=Compare.condition('(企客_5G)榮耀之星599H(30)_iPhone');
 assert.equal(addon.rent,'599');assert.equal(addon.term,'30');
 assert.equal(Compare.condition('5G_XH(48)-續約／1399H_加碼版').version,'加碼');
 assert.equal(Compare.condition('5G_XH(36)-VIP續約／999H').version,'VIP');
 assert.equal(Compare.condition('原表特殊條件').rent,'');
});
test('機款、容量與 RAM 拆分，5G 晶片型號與搭售差異保留',()=>{
 assert.deepEqual(Compare.specification({colorless_model:'Apple Mac mini(M4)_16G/512GB'}),{model:'Apple Mac mini(M4)',capacity:'512GB',ram:'16GB',specKey:'Apple Mac mini(M4)_16G/512GB'});
 assert.equal(Compare.specification({model:'測試機(5G)'}).capacity,'');
 assert.equal(Compare.specification({model:'5G 測試機 256G'}).model,'5G 測試機');
 assert.equal(Compare.specification({colorless_model:'iPhone Pro_1TB-(宇宙橙)(5G)'}).capacity,'1TB');
 assert.notEqual(Compare.specification({model:'機款 256G-(WiFi)'}).model,Compare.specification({model:'機款 256G-(5G)'}).model);
 assert.notEqual(Compare.specification({model:'機款 256G +滑鼠甲'}).model,Compare.specification({model:'機款 256G +滑鼠乙'}).model);
});
test('同規格同完整矩陣合併所有顏色，不同容量、RAM、來源或隱藏價格不合併',()=>{
 const rows=[row(),row({model:'iPhone 測試機 256G(白)',retail_price:'29900',project_prices:{[plan]:1299,'5G_iPhone_XH(48)-新申裝/續約／1399H_加碼版':0}}),row({model:'iPhone 測試機 256G(藍)',project_prices:{[plan]:1299,'5G_iPhone_XH(48)-新申裝/續約／1399H_加碼版':1}}),row({colorless_model:'iPhone 測試機 512G'}),row({source_sheet:'企客'})];
 const index=Compare.buildIndex({rows});assert.equal(index.rows.length,4);assert.equal(index.rows[0].models.length,2);
 const view=Compare.buildView(index,{rent:'999'});assert.equal(view.rows.length,4);
 const ram=Compare.buildIndex({rows:[row({colorless_model:'電腦 8G/512GB'}),row({colorless_model:'電腦 16G/512GB'})]});assert.equal(ram.rows.length,2);
});
test('缺價、零元、未列条件互相區別，未列與空白矩陣不合併',()=>{
 const index=Compare.buildIndex({rows:[row({project_prices:{[plan]:0}}),row({project_prices:{[plan]:''}}),row({project_prices:{}})]});
 const col=Compare.condition(plan);assert.equal(index.rows.length,3);
 assert.deepEqual(index.rows.map(r=>Compare.cell(r,col).kind),['zero','missing','absent']);
 assert.equal(Compare.cell(index.rows[2],col).text,'未列此條件');
 assert.equal(Compare.buildIndex({rows:[row({project_prices:{[plan]:'0x10'}}),row({project_prices:{[plan]:16}})]}).rows.length,2);
});
test('同月租同期間但申裝、續約、特定機型條件維持獨立欄',()=>{
 const base='企客5G_XH(24)-新申裝/續約／999H';
 const names=[base+'_iPhone_新申裝',base+'_iPhone_續約',base+'_特定機款'];
 const index=Compare.buildIndex({rows:[row({project_prices:Object.fromEntries(names.map(n=>[n,0]))})]});
 assert.equal(Compare.buildView(index,{rent:'999',term:'24'}).columns.length,3);
});
test('品牌選單只列相關機款、容量，常用月租跨期且分页不遺漏',()=>{
 const rows=Array.from({length:25},(_,i)=>row({brand:i%2?'APPLE':'Samsung',colorless_model:'型號 '+i+' 256G',project_prices:Object.fromEntries(Array.from({length:15},(_,j)=>['5G_XH('+(24+j)+')-續約／'+(j%2?'999':'1399')+'H',j]))}));
 const index=Compare.buildIndex({rows});const view=Compare.buildView(index,{rent:'common'});assert.equal(view.rows.length,20);assert.equal(view.columns.length,12);assert.equal(view.rowPages,2);assert.equal(view.columnPages,2);
 assert.equal(Compare.buildView(index,{rent:'common',rowPage:1,columnPage:1}).rows.length,5);
 assert.equal(Compare.buildView(index,{rent:'599'}).columns.length,0);
 const opts=Compare.options(index,{brand:'APPLE'});assert.equal(opts.models.length,12);assert.deepEqual(opts.capacities,['256GB']);
});
test('月租／期數篩選只列有價格的機款，缺價與未列均不計入',()=>{
 const index=Compare.buildIndex({rows:[row(),row({model:'僅599',colorless_model:'僅599',project_prices:{'599H':100}}),row({model:'真正缺價',colorless_model:'真正缺價',project_prices:{[plan]:''}})]});
 const view=Compare.buildView(index,{rent:'999'});assert.equal(view.totalRows,1);assert.equal(view.rows.some(r=>r.model==='僅599'),false);assert.equal(view.rows.some(r=>r.model==='真正缺價'),false);
 const unknown=Compare.condition('599(6)');assert.equal(unknown.rent,'599');assert.equal(unknown.term,'');assert.equal(unknown.raw,'599(6)');
});

test('企業專區依機款保留有價iPhone限定條件，空白Android欄與一般方案不混入',()=>{
 const android='(企客_5G)榮耀之星999H(24)',iphone=android+'_iPhone';
 const index=Compare.buildIndex({rows:[row({source_sheet:'一般',project_prices:{[plan]:1299}}),row({source_sheet:'企客',project_prices:{[android]:'',[iphone]:2999,'(企客_5G)榮耀之星999H(30)_iPhone':0,'(企客_5G)榮耀之星999H(48)_iPhone':''}})]});
 const enterprise=Compare.buildView(index,{segment:'enterprise',model:'iPhone 測試機',rent:'999'});
 assert.equal(enterprise.totalRows,1);assert.equal(enterprise.totalColumns,2);assert.ok(enterprise.columns.every(c=>c.raw.endsWith('_iPhone')));
 assert.deepEqual(enterprise.columns.map(c=>Compare.cell(enterprise.rows[0],c).value),[2999,0]);
 assert.deepEqual(Compare.options(index,{segment:'enterprise',model:'iPhone 測試機'}).projects,['(企客 5G)榮耀之星 iPhone']);
 const consumer=Compare.buildView(index,{segment:'consumer'});assert.equal(consumer.totalRows,1);assert.ok(consumer.columns.every(c=>!/企客/.test(c.raw)));
});

test('十月群組前綴仍保留iPhone適用資格及完整原條件，非iPhone方案不冒用',()=>{
 const raw='企客特殊專案(2)／(企客_5G)榮耀之星999H(30)_iPhone';
 const column=Compare.condition(raw);assert.equal(column.raw,raw);assert.equal(column.key,raw);assert.equal(column.project,'(企客 5G)榮耀之星 iPhone');assert.equal(column.rent,'999');assert.equal(column.term,'30');
 const index=Compare.buildIndex({rows:[row({project_prices:{[raw]:0}})]});assert.equal(Compare.buildView(index,{segment:'enterprise',project:'(企客 5G)榮耀之星',rent:'999'}).totalRows,0);assert.equal(Compare.buildView(index,{segment:'enterprise',project:column.project,rent:'999'}).totalRows,1);
});

test('opt-out keeps prices, order and pagination identical while the default option-list API remains intact',()=>{
 const names=Array.from({length:18},(_,j)=>`5G_XH(${24+j})-續約／${j%2?'999':'1399'}H${j%3?'':'_VIP'}`);
 const snapshots=[{rows:Array.from({length:31},(_,i)=>row({brand:i%2?'APPLE':'Samsung',model:`測試機 ${i} ${i%2?'256':'512'}G(黑)`,colorless_model:`測試機 ${i} ${i%2?'256':'512'}G`,project_prices:{...Object.fromEntries(names.map((n,j)=>[n,j===0?'':j===1?'0':String(i+j)])),['(企客_5G)榮耀之星999H(24)_iPhone']:i%2?'0':''}}))},{rows:[row({model:'新版本機款',colorless_model:'新版本機款',project_prices:{[plan]:'9876'}})]}];
 for(const snapshot of snapshots){
  const index=Compare.buildIndex(snapshot),before=JSON.stringify(index);
  for(const filters of [{segment:'consumer',rent:'common'},{segment:'enterprise',rent:'999'},{segment:'consumer',query:'測試機',rowPage:1,columnPage:1},{brand:'APPLE',capacity:'256GB',version:'VIP',term:'24'},{model:'新版本機款',query:'9876'},{query:'沒有機款'},{}]){
   const {options,...expected}=Compare.buildView(index,filters);
   assert.deepEqual(options,Compare.options(index,filters));
   const {options:skipped,...actual}=Compare.buildView(index,filters,{includeOptions:false});
   assert.equal(skipped,null);assert.deepEqual(actual,expected);
   assert.deepEqual(Compare.buildView(index,filters,{includeOptions:true}),Compare.buildView(index,filters));
  }
  assert.equal(JSON.stringify(index),before);
 }
});

test('有效價格只接受有限數值與數字字串；0元保留，缺價與文字不當成價格',()=>{
 for(const value of [0,'0',' 0 ','0.00',1299,'1,299','12.5'])assert.equal(Compare.hasPrice(value),true,String(value));
 for(const value of [null,undefined,'','  ','\t',NaN,Infinity,false,true,'NA','未列此條件','無報價（缺價）','0x10'])assert.equal(Compare.hasPrice(value),false,String(value));
});
test('一般與企業使用相同有價口徑，搜尋／選單去除全缺價條件且不修改來源',()=>{
 const missing='5G_XH(60)-續約／1599H_加碼版',enterprise='(企客_5G)榮耀之星999H(24)_iPhone';
 const snapshot={rows:[row({model:'保留機 256GB',colorless_model:'保留機 256GB',project_prices:{[plan]:null,[missing]:'  ',[enterprise]:0,'5G_XH(36)-續約／1399H':'8,900'}}),row({model:'全缺價機',colorless_model:'全缺價機',project_prices:{[plan]:'',[missing]:null,[enterprise]:undefined}})]};
 const before=JSON.stringify(snapshot),index=Compare.buildIndex(snapshot);
 for(const segment of ['consumer','enterprise']){
  const view=Compare.buildView(index,{segment});assert.equal(view.totalRows,1);assert.equal(view.totalColumns,1);assert.equal(view.rows[0].model,'保留機');
  assert.equal(Compare.buildView(index,{segment,query:'全缺價機'}).totalRows,0);
  assert.deepEqual(Compare.options(index,{segment}).models,['保留機']);
 }
 assert.equal(Compare.buildView(index,{segment:'consumer',rent:'999'}).totalRows,0);
 assert.equal(JSON.stringify(snapshot),before);
});
test('稀疏矩陣各頁只列有價列／欄，完整遍歷不遺漏或誤配任何價格',()=>{
 const names=Array.from({length:15},(_,j)=>`5G_XH(${24+j})-續約／999H`);
 const snapshot={rows:Array.from({length:41},(_,i)=>row({model:`矩陣機 ${i} 256GB`,colorless_model:`矩陣機 ${i} 256GB`,project_prices:{[names[i%15]]:i,[names[(i+7)%15]]:1000+i}}))};
 const index=Compare.buildIndex(snapshot),expected=new Set(index.rows.flatMap(r=>Object.keys(r.prices).map(k=>JSON.stringify([r.model,k,r.prices[k]])))),seen=new Set();
 for(let columnPage=0;columnPage<2;columnPage++){
  const first=Compare.buildView(index,{columnPage});
  for(let rowPage=0;rowPage<first.rowPages;rowPage++){
   const view=Compare.buildView(index,{columnPage,rowPage});assert.equal(view.totalRows,first.totalRows);assert.equal(view.totalColumns,15);
   assert.ok(view.rows.every(r=>view.columns.some(c=>Compare.hasQuote(r,c))));assert.ok(view.columns.every(c=>view.rows.some(r=>Compare.hasQuote(r,c))));
   for(const r of view.rows)for(const c of view.columns)if(Compare.hasQuote(r,c))seen.add(JSON.stringify([r.model,c.key,Compare.cell(r,c).value]));
  }
 }
 assert.deepEqual(seen,expected);
});
test('卡片在分頁前排除所選條件缺價機款，0元不丟失且換條件計數準確',()=>{
 const second='5G_XH(36)-續約／1399H';
 const index=Compare.buildIndex({rows:Array.from({length:45},(_,i)=>row({model:`卡片機 ${i} 256GB`,colorless_model:`卡片機 ${i} 256GB`,project_prices:{[plan]:i%2?null:0,[second]:i}}))});
 const first=Compare.buildView(index,{}, {cardConditionKey:plan,includeOptions:false}),next=Compare.buildView(index,{rowPage:1},{cardConditionKey:plan});
 assert.equal(first.totalRows,23);assert.equal(first.rowPages,2);assert.equal(first.rows.length,20);assert.equal(next.rows.length,3);assert.ok(first.rows.concat(next.rows).every(r=>Compare.cell(r,Compare.condition(plan)).kind==='zero'));
 assert.equal(Compare.buildView(index,{}, {cardConditionKey:second}).totalRows,45);
 assert.equal(Compare.buildView(index,{}, {cardConditionKey:''}).cardConditionKey,second);
});
test('搜尋缺價條件或另一專區條件不回傳無關有價方案',()=>{
 const absent='5G_XH(60)-續約／1599H',enterprise='(企客_5G)榮耀之星1899H(48)_iPhone';
 const index=Compare.buildIndex({rows:[row({project_prices:{[plan]:0,[absent]:null,[enterprise]:2999}})]});
 for(const query of ['1599','60','1899','榮耀之星'])assert.equal(Compare.buildView(index,{segment:'consumer',query}).totalRows,0);
 assert.equal(Compare.buildView(index,{segment:'consumer',query:'999'}).totalRows,1);
 assert.equal(Compare.buildView(index,{segment:'enterprise',query:'1899'}).totalRows,1);
 assert.equal(Compare.buildView(index,{segment:'enterprise',query:'24'}).totalRows,0);
 assert.equal(Compare.hasPrice('9'.repeat(400)),false);
});
