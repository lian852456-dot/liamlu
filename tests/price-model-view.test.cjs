'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const Models=require('../price-model-view.js'),Core=require('../threec-query-core.js'),Compare=require('../threec-comparison-core.js');
const plan='5G_XH(24)-續約／999H',other='5G_XH(48)-續約／1399H';
const trade=(color,extra={})=>({source_sheet:'合成回收表',brand:'APPLE',model:'APPLE 合成手機_128G-('+color+')(5G)',quotes:{'點子行動':{S:null,A:1000,B:800,C:0},'FutureDial（FDI）':{S:1100,A:900,B:400,C:null},'愛鋒派':{S:null,A:null,B:null,C:null,'未分級':null}},...extra});
const phone=(color,extra={})=>({source_sheet:'合成手機方案',brand:'APPLE',model:'APPLE 合成手機_128G-('+color+')(5G)',colorless_model:'APPLE 合成手機_128G-('+color+')(5G)',retail_price:29900,project_prices:{[plan]:0,[other]:1000},...extra});
test('same-price trade-in colors collapse once, preserve complete quotes and original color search',()=>{
 const snapshot={rows:[trade('午夜'),trade('星光'),trade('紅')]},before=JSON.stringify(snapshot),rows=Core.filterTradein(snapshot,{});
 assert.equal(rows.length,1);assert.equal(rows[0].model,'APPLE 合成手機_128G(5G)');assert.deepEqual(rows[0].sourceModels,snapshot.rows.map(r=>r.model));
 assert.deepEqual(rows[0].quotes,snapshot.rows[0].quotes);assert.equal(rows[0].raw.source_row_count,3);
 for(const color of ['午夜','星光','紅'])assert.equal(Core.filterTradein(snapshot,{query:color}).length,1);
 assert.equal(Core.modelOptions(snapshot,'tradein').length,1);assert.equal(JSON.stringify(snapshot),before);
});
test('one different provider/grade amount keeps a separate explicitly labeled variant',()=>{
 const a=trade('午夜'),b=trade('紅');b.quotes['FutureDial（FDI）'].A=901;
 const rows=Core.filterTradein({rows:[a,b]},{});assert.equal(rows.length,2);assert.ok(rows.every(r=>r.priceVariant));
 assert.equal(Core.filterTradein({rows:[a,b]},{query:'紅'})[0].quotes['FutureDial（FDI）'].A,901);
 assert.deepEqual(rows.map(r=>r.quotes['點子行動'].C),[0,0]);
});
test('capacity, network, RAM, source, unknown suffix, bundle and grade differences cannot merge',()=>{
 const base=trade('午夜');
 for(const patch of [
  {model:base.model.replace('128G','256G')},{model:base.model.replace('(5G)','(4G)')},
  {model:base.model.replace('128G','8G/128G')},{model:base.model+' +鍵盤甲'},
  {model:base.model.replace('午夜','WiFi')},{model:base.model.replace('午夜','木紋')},
  {model:base.model+'_(點子)_A等'},{source_sheet:'另一適用表'}
 ])assert.equal(Models.groupTradein([base,{...trade('紅'),...patch}]).length,2,JSON.stringify(patch));
});
test('a bad colorless label cannot hide raw network, RAM, capacity or bundle differences',()=>{
 const base=trade('午夜',{colorless_model:'合成固定標籤'});
 for(const change of ['(4G)','8G/128G','256G',' +滑鼠']){
  const second=trade('紅',{colorless_model:'合成固定標籤'});
  second.model=change==='(4G)'?second.model.replace('(5G)',change):change.includes('128G')||change==='256G'?second.model.replace('128G',change):second.model+change;
  assert.equal(Models.groupTradein([base,second]).length,2,change);
 }
});
test('unknown missing capacity is not inferred and unrelated formatting is not newly deduplicated',()=>{
 const a=trade('午夜'),b=trade('紅');b.model=b.model.replace('_128G','_128GB');
 assert.equal(Models.groupTradein([a,b]).length,2);
 assert.equal(Models.groupTradein([a,{...b,model:b.model.replace('_128GB','')}]).length,2);
});
test('known delimited and legacy color suffixes strip; network and unknown tokens stay exact',()=>{
 for(const color of ['紅','灰','曜石黑','冰川藍','石墨','松嶺青','沙漠鈦金','鈦','靛藍色','珊瑚粉']){
  assert.equal(Models.stripColors('合成機_128G-('+color+')(5G)'),'合成機_128G(5G)');
  assert.equal(Models.stripColors('合成機 128GB('+color+')'),'合成機 128GB');
 }
 for(const suffix of ['WiFi','5G','16G/512G','木紋','未知套裝'])assert.equal(Models.stripColors('合成機_128G-('+suffix+')'),'合成機_128G-('+suffix+')');
});
test('Samsung alias stays unified while both original provider quote vectors remain present',()=>{
 const a=trade('午夜',{brand:'Samsung',model:'Samsung 合成機_128G-(午夜)(5G)'}),b=trade('紅',{brand:'SAMSUNG',model:'SAMSUNG 合成機_128G-(紅)(5G)'});
 const grouped=Models.groupTradein([a,b]);assert.equal(grouped.length,1);assert.deepEqual(Object.keys(grouped[0].quotes),Object.keys(a.quotes));
 assert.equal(grouped[0].quotes['點子行動'].A,1000);assert.equal(grouped[0].quotes['FutureDial（FDI）'].A,900);
});
test('zero, missing, omitted grade and different provider sets are never conflated',()=>{
 const a=trade('午夜');
 const missing=trade('紅');missing.quotes['點子行動'].C=null;
 const absent=trade('紅');delete absent.quotes['點子行動'].C;
 const provider=trade('紅');delete provider.quotes['FutureDial（FDI）'];
 for(const row of [missing,absent,provider])assert.equal(Models.groupTradein([a,row]).length,2);
 const formatted=trade('紅');formatted.quotes['點子行動'].A='1,000';assert.equal(Models.groupTradein([a,formatted]).length,1);
});
test('same quotes on different source conditions stay separate without claiming a price difference',()=>{const a=trade('午夜'),b=trade('紅',{source_sheet:'另一條件表'}),rows=Models.groupTradein([a,b]);assert.equal(rows.length,2);assert.ok(rows.every(r=>r.price_variant===false));});
test('phone colors collapse only with the same source and complete plan and retail matrices',()=>{
 const rows=[phone('午夜'),phone('星光'),phone('紅')],snapshot={rows},before=JSON.stringify(snapshot),index=Compare.buildIndex(snapshot);
 assert.equal(index.rows.length,1);assert.equal(index.rows[0].sourceCount,3);
 for(const color of ['午夜','星光','紅'])assert.equal(Compare.buildView(index,{query:color}).totalRows,1);
 for(const patch of [{source_sheet:'另一方案'},{retail_price:29901},{project_prices:{[plan]:0,[other]:1001}},{project_prices:{[plan]:0}},{colorless_model:'合成手機_256G'}])assert.equal(Compare.buildIndex({rows:[rows[0],phone('紅',patch)]}).rows.length,2);
 assert.equal(JSON.stringify(snapshot),before);
});
test('grouped model selection keeps different-price variants and does not change source metadata',()=>{
 const a=trade('午夜'),b=trade('紅');b.quotes['點子行動'].A=1200;
 const snapshot={rows:[a,b],row_count:2,snapshot_hash:'SYNTHETIC',source_version_date:'2026-10-01'},view=Core.buildView('tradein',{snapshot},{});
 assert.equal(view.modelOptions.length,1);assert.equal(view.rows.length,2);assert.equal(view.meta.rowCount,2);
 assert.equal(Core.buildView('tradein',{snapshot},{modelKey:view.modelOptions[0].value}).rows.length,2);
});
test('the presentation module has no transport, storage, auth or DOM writes',()=>{
 const source=fs.readFileSync(require.resolve('../price-model-view.js'),'utf8');assert.doesNotMatch(source,/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|adminSecret|employeeId|innerHTML|document\./);
});
