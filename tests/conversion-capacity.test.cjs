'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const X=require('../assets/vendor/xlsx.full.min.js');
const {STORES}=require('../readonly-dashboard-core.js');
const {read,reminder}=require('../conversion-capacity-core.js');
function source(){
  const rows=[[],[],[]],serial=Date.UTC(2027,1,28)/86400000+25569;
  rows[1]=[null,null,null,'本月',null,null,'上月同期 (~28日)','WoW'];
  rows[2]=['2/1 ~ 2/28',null,null,'實際數','點數TTL','目標','實際數'];
  for(let i=0;i<14;i++){rows[1].push(serial-i);rows[2][8+i]=serial-i;}
  const make=(id,name,n)=>['北一二B',id,name,28*n,70*n,100*n,32*n,null,...Array(14).fill(n)];
  rows.push(make('北一二B','北一二B',9),...STORES.map(s=>make(s.id,s.name,1)).reverse());
  return {Sheets:{AQ量能:X.utils.aoa_to_sheet(rows)}};
}
test('九店以店碼歸戶，二月結月仍保留缺口',()=>{
 const r=read(source(),X,'AQ',STORES),v=reminder(r,r.entries[0],null);
 assert.equal(r.entries[1].id,STORES[0].id);assert.equal(r.cutoff,'2027-02-28');assert.equal(v.gap,270);assert.equal(v.daily,null);
});
test('缺值、錯置店碼、區合計異常與錯誤檔別均拒讀',()=>{
 for(const [cell,val] of [['E5',null],['B5','unknown'],['E4',12],['I3',1]]){
  const b=source();if(val===null)delete b.Sheets.AQ量能[cell];else b.Sheets.AQ量能[cell].v=val;
  assert.throws(()=>read(b,X,'AQ',STORES));
 }
 assert.throws(()=>read(source(),X,'RT',STORES));
});
test('同期才整合，締結率使用分子分母，分母零保留缺值',()=>{
 const r=read(source(),X,'AQ',STORES),row=r.entries[1],snapshot={cutoff:r.cutoff,records:[{store:row.id,date:r.cutoff,aq_n:2,aq_d:5}]};
 assert.equal(reminder(r,row,snapshot).rate,.4);
 assert.equal(reminder(r,row,{...snapshot,cutoff:'2027-02-27'}).rate,null);
 snapshot.records[0].aq_d=0;assert.equal(reminder(r,row,snapshot).rate,null);
});

const mix=require('../conversion-capacity-mix.js');
function details(){
  const date=Date.UTC(2027,1,28)/86400000+25569;
  const summary=[[],[],[null,null,null,'實際數(含通轉手)'],['北一二A','北一二A',null,1],
    ['北一二B','北一二B',null,6],['北一二B',STORES[0].id,null,6]];
  const columns=['統計日期','業務分區','營業店點代碼','用戶人數','表定V_D_V','用戶群組','搭配之Phone_Mode','專案分類'];
  const entries=[columns,[date,'北一二A','test',1,1599,'甲','平板','手機案'],
    [date,'北一二B',STORES[0].id,2,999,'乙','vivo V80 Lite','手機案'],
    [date-1,'北一二B',STORES[0].id,3,1399,'丙',null,'好速'],
    [date,'北一二B',STORES[0].id,1,null,'丁',null,'手機案'],
    [date-30,'北一二B',STORES[0].id,7,1399,'上月',null,'好速']];
  return {Sheets:{AQ量能:X.utils.aoa_to_sheet(summary,{dense:true}),RS_VoiceAQ:X.utils.aoa_to_sheet(entries,{dense:true})}};
}
const analyze=(b,all=true)=>mix.read(b,X,{kind:'AQ',cutoff:'2027-02-28',day:28},STORES,all);
test('各區按明細人數、期間和表定資費排名，門市範圍只回傳北一二B',()=>{
 const all=analyze(details()),u=all.regions[1];
 assert.deepEqual(all.regions.map(r=>r.count),[1,6]);
 assert.equal(u.low.fee,999);assert.equal(u.high.fee,1399);assert.equal(u.high.product,undefined);
 assert.equal(u.missingFee,1);assert.equal(u.high.plan.n,3);assert.equal(u.broadband.n,3);assert.equal(u.focus.n,2);
 assert.deepEqual(analyze(details(),false).regions.map(r=>r.name),['北一二B']);
 assert.equal(all.stores[STORES[0].id].count,6);
});
test('對帳失敗只隱藏受影響區，缺分頁顯示原因',()=>{
 const b=details();b.Sheets.AQ量能['!data'][3][3].v=2;
 const result=analyze(b);assert.match(result.regions[0].issue,/核對/);assert.equal(result.regions[1].count,6);
 delete b.Sheets.RS_VoiceAQ;assert.match(analyze(b).issue,/缺少/);
});

test('門市提醒按合併後同筆資費和機型排行，只引用實際搭配的專案',()=>{
 const b=details(),rows=b.Sheets.RS_VoiceAQ['!data'];
 rows[1][4].v=1399;rows[1][6].v='測試 Pro_128G-(藍)(5G)';
 rows[2][6].v='測試 Pro_256G-(紅)(5G)';rows[3][6]={t:'s',v:'測試 Pro Max_128G-(紅)(5G)'};
 const u=analyze(b).overall;
 assert.equal(u.high.fee,1399);assert.equal(u.high.products[0].name,'測試 Pro Max');
 assert.deepEqual(u.common,{name:'測試 Pro',lo:2,hi:1});
 assert.deepEqual(u.high.products[0].project,{name:'好速',n:3});
 assert.doesNotMatch(JSON.stringify(mix.groups(u,'AQ')),/北一|日目標|缺口/);
 assert.equal(analyze(b,false).overall.count,6);
 b.Sheets.AQ量能['!data'][3][3].v=2;assert.ok(analyze(b).overall.issue);
});
