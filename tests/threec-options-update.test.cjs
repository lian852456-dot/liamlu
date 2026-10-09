'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Compare=require('../threec-comparison-core.js'),fixture=require('./threec-search-fixture.cjs');
const html=fs.readFileSync(path.join(__dirname,'../threec-query-ui.js'),'utf8');
function section(name,next){return html.slice(html.indexOf('  function '+name+'('),html.indexOf('  function '+next+'('));}
const current=section('updateShoppingOptions','columnLabel');
// The pre-change behavior is an independent oracle for ordered selection resets.
const legacy=`function updateShoppingOptions(){if(!shoppingIndex)return;const fields=[['shoppingBrand','brands','全部品牌'],['shoppingModel','models','全部機款'],['shoppingCapacity','capacities','全部容量'],['shoppingProject','projects','全部專案'],['shoppingVersion','versions','一般／VIP／加碼'],['shoppingRent','rents','全部月租'],['shoppingTerm','terms','全部期數']];fields.forEach(([id,key,label])=>fillSelect(id,Compare.options(shoppingIndex,shoppingFilters())[key],label));}`;
function setup(index,state,source){
  const fields=['Search','Brand','Model','Capacity','Project','Version','Rent','Term'];
  const selects=Object.fromEntries(fields.map(name=>['shopping'+name,{value:state[name.toLowerCase()]||'',innerHTML:''}]));
  let calls=0;
  const context={shoppingIndex:index,shoppingSegment:state.segment,rowPage:0,columnPage:0,$:id=>selects[id],esc:value=>String(value).replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])),Compare:{options(...args){calls++;return Compare.options(...args);}}};
  vm.runInNewContext(section('shoppingFilters','setShoppingSegment')+section('fillSelect','updateShoppingOptions')+source,context);
  return {context,selects,calls:()=>calls,update(){context.updateShoppingOptions();return this;}};
}
test('108 consumer/enterprise dependent-selection states match ordered legacy resets, options and price/page views',()=>{
  const snapshot=fixture.shopping().snapshot,index=Compare.buildIndex(snapshot),before=JSON.stringify(index);let comparisons=0;
  for(const segment of ['consumer','enterprise'])for(const brand of ['','APPLE','invalid'])for(const model of ['',index.rows[0].model,'invalid'])for(const capacity of ['','512GB','invalid'])for(const project of ['','invalid']){
    const state={segment,brand,model,capacity,project,version:'一般',rent:segment==='consumer'?'common':'',term:'24',search:'iphone合成機'};
    const old=setup(index,state,legacy).update(),next=setup(index,state,current).update();
    assert.deepEqual(next.selects,old.selects);
    assert.equal(old.calls(),7);assert.ok(next.calls()<=7);
    assert.deepEqual(Compare.buildView(index,next.context.shoppingFilters(),{includeOptions:false}),Compare.buildView(index,old.context.shoppingFilters(),{includeOptions:false}));comparisons++;
  }
  assert.equal(comparisons,108);assert.equal(JSON.stringify(index),before);
});
test('normal cold initialization computes options once and later updates use fresh index/filter state',()=>{
  const oldIndex=Compare.buildIndex(fixture.shopping().snapshot),newIndex=Compare.buildIndex(fixture.shopping({version:2}).snapshot);
  const env=setup(oldIndex,{segment:'consumer',rent:'common'},current).update();
  assert.equal(env.calls(),1);assert.match(env.selects.shoppingModel.innerHTML,/iPhone 合成機/);
  env.context.shoppingIndex=newIndex;env.update();
  assert.equal(env.calls(),2);assert.match(env.selects.shoppingModel.innerHTML,/新版目錄機/);assert.doesNotMatch(env.selects.shoppingModel.innerHTML,/iPhone 合成機/);
  env.context.shoppingSegment='enterprise';env.update();assert.equal(env.calls(),3);
  const control=setup(newIndex,{segment:'enterprise',rent:'common'},legacy).update();assert.deepEqual(env.selects,control.selects);
});
