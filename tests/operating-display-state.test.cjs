const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const app = fs.readFileSync(path.join(__dirname,'../app.js'),'utf8');
function fn(source,name,indent='') {
  let start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,name);
  if(source.slice(start-6,start)==='async ')start-=6;
  const end=source.indexOf('\n'+indent+'}',start)+indent.length+2;
  return source.slice(start,end);
}
const date='2099-10-12';
const row=(store,aq999,seg=16)=>({date,store,seg,aq999});
function setup() {
  const nodes={connBadge:{style:{}},marqueeText:{},marqueeText2:{},marqueeTrack:{style:{}}};
  const pending=[];
  const c=vm.createContext({Date,Number,Object,String,STORES:['通化','酒泉'],NEW_STORES:[],
    document:{getElementById:id=>nodes[id]},today:()=>date,currentSeg:16,
    privateDashboardRequest:(payload,signal,endpoint)=>new Promise((resolve,reject)=>pending.push({payload,signal,endpoint,resolve,reject})),
    dailyReportReads:{invalidate(){}},_cache:{},_cacheReadGeneration:{}});
  vm.runInContext('const reportReadDisplay={};let reportConnectionDisplay={status:"idle"};let dailyReportReadContext=0;let GAS_URL="synthetic";function cacheKey(date,seg){return `${date}_${seg}`;}',c);
  for(const name of ['closingReportNumber','reportMarqueeStatus','updateConnectionBadge','updateMarquee','readReportForDisplay','invalidateDailyReportReads','clearReportReadDisplay'])vm.runInContext(fn(html,name),c);
  return {c,nodes,pending,read:(seg=16)=>c.readReportForDisplay({action:'read',date,seg},undefined,'synthetic'),state:()=>vm.runInContext('reportReadDisplay',c)};
}

test('a configured URL without a completed read never means connected or zero',()=>{
  const h=setup();h.c.updateConnectionBadge();h.c.updateMarquee();
  assert.match(h.nodes.connBadge.textContent,/尚未取得/);
  assert.doesNotMatch(h.nodes.marqueeText.textContent,/A999 為 0|均已開出|尚未開出/);
});
test('loading, failure and successful empty response remain distinct',async()=>{
  const h=setup();let p=h.read();assert.match(h.nodes.connBadge.textContent,/讀取中/);
  assert.match(h.nodes.marqueeText.textContent,/讀取中/);
  h.pending[0].reject(new Error('synthetic failure'));await assert.rejects(p);
  assert.match(h.nodes.connBadge.textContent,/讀取失敗/);
  assert.doesNotMatch(h.nodes.marqueeText.textContent,/A999 為 0/);
  p=h.read();h.pending[1].resolve({status:'ok',data:{}});await p;
  assert.match(h.nodes.connBadge.textContent,/讀取成功/);
  assert.match(h.nodes.marqueeText.textContent,/本時段尚無回報/);
  assert.doesNotMatch(h.nodes.marqueeText.textContent,/A999 為 0|均已開出/);
});
test('only explicit valid zero rows are named; missing fields are not zero',async()=>{
  const h=setup(),p=h.read();h.pending[0].resolve({status:'ok',data:{通化:row('通化',0),酒泉:row('酒泉','')}});await p;
  assert.match(h.nodes.marqueeText.textContent,/A999 為 0：【通化】/);
  assert.match(h.nodes.marqueeText.textContent,/尚未取得 A999 數值：【酒泉】/);
});
test('nonzero requires complete proof for the all-stores conclusion',()=>{
  const h=setup();
  assert.match(h.c.reportMarqueeStatus({status:'ready',data:{通化:row('通化',1),酒泉:row('酒泉',2)}},date,16),/均已開出/);
  for(const missing of [null,undefined,'',' ',false,'garbage',-1]){
    const msg=h.c.reportMarqueeStatus({status:'ready',data:{通化:row('通化',1),酒泉:row('酒泉',missing)}},date,16);
    assert.match(msg,/尚未取得 A999 數值：【酒泉】/);assert.doesNotMatch(msg,/A999 為 0|均已開出/);
  }
});
test('date/store/segment mismatch and malformed data cannot produce green success',async()=>{
  for(const data of [null,[],{通化:{...row('通化',0),date:'2099-10-11'}},{通化:row('酒泉',0)},{通化:row('通化',0,21)}]){
    const h=setup(),p=h.read();h.pending[0].resolve({status:'ok',data});await p;
    assert.match(h.nodes.connBadge.textContent,/讀取失敗/);assert.doesNotMatch(h.nodes.marqueeText.textContent,/A999 為 0/);
  }
});
test('reload/invalidation clears proof; late reads cannot restore it',async()=>{
  const h=setup(),p=h.read();h.c.invalidateDailyReportReads();
  assert.match(h.nodes.connBadge.textContent,/尚未取得/);
  h.pending[0].resolve({status:'ok',data:{通化:row('通化',0)}});await p;
  assert.equal(Object.keys(h.state()).length,0);assert.doesNotMatch(h.nodes.marqueeText.textContent,/A999 為 0/);
});
test('leaving or backgrounding clears display proof and cannot resurrect a late zero',async()=>{
  const h=setup(),p=h.read();h.c.clearReportReadDisplay();
  h.pending[0].resolve({status:'ok',data:{通化:row('通化',0)}});await p;
  assert.equal(Object.keys(h.state()).length,0);
  assert.match(h.nodes.connBadge.textContent,/尚未取得/);assert.doesNotMatch(h.nodes.marqueeText.textContent,/A999 為 0/);
});
test('a cancelled read is unknown; older reads cannot overwrite a newer loading badge',async()=>{
  const h=setup(),a=h.read(16),b=h.read(21);
  h.pending[0].resolve({status:'ok',data:{通化:row('通化',0)}});await a;
  assert.match(h.nodes.connBadge.textContent,/讀取中/);
  h.pending[1].reject(Object.assign(new Error('cancelled'),{name:'AbortError'}));await assert.rejects(b);
  assert.match(h.nodes.connBadge.textContent,/尚未取得/);
});
test('a transport that completes after cancellation cannot leave a loading or success claim',async()=>{
  const h=setup(),signal={aborted:false};
  const p=h.c.readReportForDisplay({action:'read',date,seg:16},signal,'synthetic');signal.aborted=true;
  h.pending[0].resolve({status:'ok',data:{通化:row('通化',0)}});await p;
  assert.match(h.nodes.connBadge.textContent,/尚未取得/);assert.doesNotMatch(h.nodes.marqueeText.textContent,/A999 為 0|讀取中/);
});
test('endpoint and auth context changes invalidate the visible success claim',async()=>{
  for(const change of ['GAS_URL="other"','dailyReportReadContext++']){
    const h=setup(),p=h.read();vm.runInContext(change,h.c);h.c.invalidateDailyReportReads();
    h.pending[0].resolve({status:'ok',data:{通化:row('通化',0)}});await p;
    assert.match(h.nodes.connBadge.textContent,/尚未取得/);assert.doesNotMatch(h.nodes.marqueeText.textContent,/A999 為 0/);
  }
});
test('personal reads retain their existing path and do not create store proof',async()=>{
  const h=setup(),p=h.c.readReportForDisplay({action:'pread',date,seg:16},undefined,'synthetic');
  h.pending[0].resolve({status:'ok',data:{}});await p;
  assert.equal(Object.keys(h.state()).length,0);
});
test('App empty patrol states distinguish locked, loading, failed and valid empty',()=>{
  const c=vm.createContext({});vm.runInContext(fn(app,'moduleReadLabel','  '),c);
  assert.match(c.moduleReadLabel({status:'unauthorized'},'empty').message,/尚未取得資料/);
  assert.equal(c.moduleReadLabel({status:'stale',data:null,note:'巡店資料讀取中'},'empty').label,'讀取中');
  assert.equal(c.moduleReadLabel({status:'error'},'empty').label,'讀取失敗');
  assert.equal(c.moduleReadLabel({status:'no_data'},'今日尚無巡店紀錄').message,'今日尚無巡店紀錄');
  assert.equal(c.moduleReadLabel({status:'partial'},'empty').label,'尚未取得');
});
