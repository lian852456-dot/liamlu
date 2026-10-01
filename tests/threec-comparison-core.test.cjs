'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Compare=require('../threec-comparison-core.js');
const plan='5G_iPhone_XH(24)-新申裝/續約／999H';
const row=(changes={})=>({source_sheet:'iPhone',brand:'APPLE',model:'iPhone 測試機 256G(黑)',colorless_model:'iPhone 測試機 256G',retail_price:'29,900',project_prices:{[plan]:'1,299','5G_iPhone_XH(48)-新申裝/續約／1399H_加碼版':'0'},...changes});
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
