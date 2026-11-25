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
