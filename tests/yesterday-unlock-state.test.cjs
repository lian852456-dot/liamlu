'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
const render=source.slice(source.indexOf('  function renderYesterdayFollowUp()'),source.indexOf('  function renderKpiHero()'));
const labels=source.slice(source.indexOf('  function moduleReadLabel('),source.indexOf('  function formatOperationMetric('));
function view(module){
 const nodes={'#yesterdayFollowUpHome':{hidden:false},'#yesterdayFollowUp':{innerHTML:''}};
 const context={yesterdayFollowUpModule:module,dom:id=>nodes[id],escapeHtml:s=>String(s).replace(/</g,'&lt;'),reportStatusBanner:()=>'',fmtPct:()=>'',renderYesterdayFeedback:()=>''};
 vm.runInNewContext(labels+render+';renderYesterdayFollowUp();',context);
 return {text:nodes['#yesterdayFollowUp'].innerHTML,hidden:nodes['#yesterdayFollowUpHome'].hidden};
}
test('unverified and missing modules ask for unlock instead of implying a request is running',()=>{
 for(const module of [{status:'unauthorized',data:null,note:''},undefined]){
  const result=view(module);assert.match(result.text,/請先解鎖正式資料/);assert.doesNotMatch(result.text,/讀取中/);assert.equal(result.hidden,true);
 }
});
test('a real pending read retains its loading note',()=>assert.match(view({status:'stale',data:null,note:'昨日 21:00 正式資料讀取中'}).text,/正式資料讀取中/));
test('failure keeps the error message, never a no-data or zero-result claim',()=>{
 const result=view({status:'error',data:null,note:'網路讀取失敗，請稍後重試。'});assert.match(result.text,/網路讀取失敗/);assert.doesNotMatch(result.text,/尚無正式資料|0 店|讀取中/);
});
test('a successful empty result remains no-data',()=>{
 for(const module of [{status:'no_data',data:null,note:''},{status:'ok',data:{formalDataAvailable:false},note:''}])assert.match(view(module).text,/昨日 21:00 尚無正式資料/);
});
test('verified data and stale verified data still render the same summary',()=>{
 const data={formalDataAvailable:true,date:'合成測試日期',trackingStoreCount:1,failedStoreCount:1,failedPeopleCount:2,consultStoreCount:0,stores:[]};
 for(const status of ['ok','stale']){const result=view({status,data,note:'合成舊資料提示'});assert.equal(result.hidden,false);assert.match(result.text,/未過關店數/);assert.match(result.text,/需要追蹤店數/);}
});
