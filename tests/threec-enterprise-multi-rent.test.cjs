'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Compare=require('../threec-comparison-core.js'),Import=require('../tradein-import-core.js'),XLSX=require('../assets/vendor/xlsx.full.min.js');
const group='企客特殊專案(2)',multi=group+'／4G_ihouse智能499H(24)_799H(24)',ipcam=group+'／4G行動寬頻IP_Cam案799H';
const row=(code,prices)=>({source_sheet:'合成企業表',brand:'QA',code,model:'合成路由器 '+code,project_prices:prices});
test('雙月租仍是一個完整條件，499與799均保留24期零元報價且不產生重複欄',()=>{
 const index=Compare.buildIndex({rows:[row('A',{[multi]:'0'}),row('B',{[multi]:''}),row('C',{[multi]:'12,345.67'})]}),before=JSON.stringify(index);
 const column=Compare.condition(multi);assert.deepEqual(column.rents,['499','799']);assert.equal(column.term,'24');assert.equal(column.key,multi);assert.equal(column.raw,multi);assert.equal(column.project,'4G iHouse 智能');
 assert.deepEqual(Compare.options(index,{segment:'enterprise',project:column.project}).rents,['499','799']);
 for(const rent of ['499','799',''])for(const card of [false,true]){
  const view=Compare.buildView(index,{segment:'enterprise',project:column.project,rent,term:'24'},card?{cardConditionKey:multi}:{});
  assert.equal(view.totalColumns,1);assert.equal(view.totalRows,2);assert.equal(Compare.cell(view.rows[0],view.columns[0]).value,'0');assert.equal(Compare.cell(view.rows[1],view.columns[0]).value,'12,345.67');
 }
 assert.equal(Compare.buildView(index,{segment:'enterprise',rent:'999'}).totalRows,0);
 assert.equal(Compare.buildView(index,{segment:'consumer',rent:'799'}).totalRows,0);assert.equal(JSON.stringify(index),before);
});
test('4G依原類別可直接找尋，速度限制與未標示IP Cam約期不改寫',()=>{
 const slow=group+'／4G_ihouse智能_499H(30)限高速21Mbps',five=group+'／(企客_5G)榮耀之星799H(24)_iPhone';
 const index=Compare.buildIndex({rows:[row('A',{[multi]:0,[ipcam]:0,[slow]:0,[five]:0})]});
 assert.deepEqual(new Set(Compare.options(index,{segment:'enterprise'}).projects),new Set(['(企客 5G)榮耀之星 iPhone','4G iHouse 智能','4G 行動寬頻 IP Cam']));
 assert.equal(Compare.condition(ipcam).term,'');assert.equal(Compare.condition(slow).raw,slow);
 assert.equal(Compare.buildView(index,{segment:'enterprise',project:'4G 行動寬頻 IP Cam',rent:'799',term:'24'}).totalRows,0);
 assert.equal(Compare.buildView(index,{segment:'enterprise',project:'4G iHouse 智能',rent:'799',term:'30'}).totalRows,0);
 assert.equal(Compare.buildView(index,{segment:'enterprise',project:'4G iHouse 智能',rent:'499',term:'30'}).totalColumns,1);
});
test('常用月租以所有月租交集選一次；無月租與既有數字方案仍保留',()=>{
 const combined='企客合成／799H(24)_999H(24)_1399H(24)';
 const index=Compare.buildIndex({rows:[row('A',{[combined]:0,'企客原表特殊條件':1})]});
 assert.equal(Compare.buildView(index,{segment:'enterprise',rent:'common'}).totalColumns,2);
 assert.deepEqual(Compare.condition('599(6)').rents,['599']);assert.deepEqual(Compare.condition('原表條件').rents,[]);
});
test('多層原表XLS匯入後完整保留雙月租鍵、0與空值，無需拆欄或補價格',async()=>{
 const w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([
  ['','','',group,'',''],['品牌','代碼','機型','4G_ihouse智能499H(24)_799H(24)','4G行動寬頻IP_Cam案799H','(企客_5G)榮耀之星799H(24)_iPhone'],
  ['QA','A','合成路由器',0,'',''],['QA','B','合成IP Cam','',0,''],['QA','C','合成手機','','','12,345.67']
 ]),'合成企業表');
 const bytes=XLSX.write(w,{type:'buffer',bookType:'biff8'}),result=await Import.parseFile({name:'20261021-synthetic.xls',size:bytes.length,arrayBuffer:async()=>bytes},XLSX,'shopping');
 const snapshot=Import.buildPublishSnapshot('shopping',result);assert.equal(snapshot.rows.length,3);
 assert.equal(snapshot.rows[0].project_prices[multi],'0');assert.equal(snapshot.rows[0].project_prices[ipcam],'');
 const index=Compare.buildIndex(snapshot);for(const rent of ['499','799'])assert.equal(Compare.buildView(index,{segment:'enterprise',rent,term:'24'},{cardConditionKey:multi}).cardConditionKey,multi);
 assert.equal(index.columns.length,3);assert.equal(Import.buildAcceptanceReport('shopping',result).acceptance.publishEligible,true);
});
