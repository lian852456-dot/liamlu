const test=require('node:test'),assert=require('node:assert/strict');
const X=require('../assets/vendor/xlsx.full.min.js'),E=require('../store-renewal-evidence.js'),C=require('../readonly-dashboard-core.js');
const [first,second]=C.STORES,headers=['營業店點代碼','統計日期','用戶最後續約之專案','是否已續約','用戶人數','門號'];
function book(rows){return {Sheets:{'續約率(分母)':X.utils.aoa_to_sheet([headers,...rows])}};}
test('daily evidence counts the three original statuses per store, drops identifiers and keeps its observed dates',()=>{
 const source=book([[first.id,46344,'合約甲','Y',1,'PRIVATE'],[first.id,46345,'合約甲','N',2,'PRIVATE'],[first.id,46345,'合約甲','無續約',1,'PRIVATE'],[second.id,46345,'合約乙','N',6,'PRIVATE']]);
 const data=E.parse(source,X,'日報.xlsx');
 assert.equal(data.daily.start,'2026-11-18');assert.equal(data.daily.end,'2026-11-19');assert.deepEqual(data.daily.rows[0],{store:first.id,label:'合約甲',yes:1,no:2,none:1});
 assert(!JSON.stringify(data).includes('PRIVATE'));const output=E.render(data,[first],null);assert(output.includes('3 筆'));assert(!output.includes('合約乙'));
 assert.throws(()=>E.parse(book([[first.id,46344,'合約','未知',1]]),X,'日報.xlsx'),/續約標記/);
});
