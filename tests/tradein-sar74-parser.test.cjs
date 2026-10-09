'use strict';
// All rows and identities below are independently invented synthetic data.
// Unused labels are placeholders, not a claimed full real-export header.
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../tradein-performance-core.js');
const Ref=require('./tradein-reference-fixture.cjs');
const header=()=>{
 const h=Array.from({length:30},(_,i)=>'合成欄'+i);
 Object.assign(h,{0:'序號',1:'店點代碼',3:'區域別',4:'日期',6:'專案類別',11:'回收代碼/IMEI',17:'銷貨單號',23:'員工編號',26:'取消交易日期'});
 return h;
};
const row=(serial=1,extra={})=>{
 const r=Array(30).fill('');
 Object.assign(r,{0:String(serial),1:'DNB10168',3:'北一二B',4:'1151002',6:'RT',11:'SYN-REC-'+serial,17:'000SYN-ORDER-'+serial,23:'0A1B2'},extra);return r;
};
const cell=v=>/[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
const csv=(rows,h=header(),preamble='日期 :,115/10/01 - 115/10/09,列印日期 :,26年10月10日 11:23',footer=true)=>{
 const tail=Array(30).fill('');tail[13]='主管:';tail[18]='製表:';
 return '\uFEFF'+preamble+'\r\n'+[h,...rows,...(footer?[tail]:[])].map(r=>r.map(cell).join(',')).join('\r\n')+'\r\n';
};
const build=parsed=>{const input={...parsed,source_sha256:'e'.repeat(64),complete_nine_stores:true};return C.build(input,[],Ref.reference(input));};
test('30-column schema resolves order 17 / employee 23 / cancellation 26 and sparse footer 18',()=>{
 const parsed=C.parseSar74(csv([row()]));
 assert.deepEqual(parsed.records,[{store_code:'DNB10168',trade_date:'2026-10-02',project:'RT',source_employee_id:'0A1B2',recycle_code:'SYN-REC-1',order_number:'000SYN-ORDER-1',cancel_date:null}]);
 assert.equal(parsed.source_start,'2026-10-01');assert.equal(parsed.source_end,'2026-10-09');
 assert.equal(parsed.status_as_of_date,'2026-10-10');assert.equal(parsed.complete_nine_stores,false);
 assert.throws(()=>C.build({...parsed,source_sha256:'e'.repeat(64)},[]),/涵蓋/);
});
test('field mapping follows labels after all columns are reordered',()=>{
 const h=header(),r=row(),order=Array.from({length:30},(_,i)=>29-i);
 assert.deepEqual(C.parseSar74(csv([order.map(i=>r[i])],order.map(i=>h[i]))).records,C.parseSar74(csv([r])).records);
});
test('employee/recycle/order codes preserve zeros, letters and case without numeric or prefix conversion',()=>{
 const p=C.parseSar74(csv([row(1,{23:'a0B2c',11:'000SYNREC',17:'000SYNORDER'})]));
 assert.equal(p.records[0].source_employee_id,'a0B2c');assert.equal(p.records[0].recycle_code,'000SYNREC');assert.equal(p.records[0].order_number,'000SYNORDER');
 assert.notEqual(p.records[0].source_employee_id,'55a0B2c');
});
test('CSV quotes, escaped quotes, CRLF, BOM and Excel text wrappers do not change identifiers',()=>{
 const p=C.parseSar74(csv([row(1,{11:'SYN,"REC',17:'="000SYNORDER"',23:'="0A1B2"',4:'="1151002"'})]));
 assert.equal(p.records[0].recycle_code,'SYN,"REC');assert.equal(p.records[0].order_number,'000SYNORDER');assert.equal(p.records[0].source_employee_id,'0A1B2');
 assert.throws(()=>C.parseSar74('"unfinished'),/引號/);
});
test('missing, duplicate, empty, altered labels and non-30-column headers fail closed',()=>{
 for(const mutate of [h=>h.pop(),h=>h.push('extra'),h=>h[23]='未知員工',h=>h[24]='員工編號',h=>h[2]='']){
  const h=header();mutate(h);assert.throws(()=>C.parseSar74(csv([row()],h)),/欄位/);
 }
 assert.throws(()=>C.parseSar74(csv([header(),row()])),/欄位/);
 assert.throws(()=>C.parseSar74('| 序號 | 店點代碼 | 日期 |\n|---|---|---|\n|1|DNB10168|1151002|'),/欄位/);
});
test('invalid row counts, unknown footer contents and serial conflicts are rejected',()=>{
 assert.throws(()=>C.parseSar74(csv([row().slice(0,29)])),/欄位/);
 const tail=Array(30).fill('');tail[13]='主管:';tail[18]='製表:';tail[20]='unknown content';
 assert.throws(()=>C.parseSar74(csv([row(),tail],header(),undefined,false)),/序號/);
 for(const serial of ['0','-1','1.5','NaN','9007199254740992'])assert.throws(()=>C.parseSar74(csv([row(1,{0:serial})])),/序號/);
 assert.throws(()=>C.parseSar74(csv([row(1),row(1,{11:'SYN-SECOND'})])),/序號/);
});
test('only structurally valid store/region/employee identifiers are accepted',()=>{
 for(const extra of [{1:'10168'},{1:'DNB1016'},{3:'其他區'},{23:'1234'},{23:'123456'},{23:'0A B2'},{23:'0A-B2'},{23:''}])assert.throws(()=>C.parseSar74(csv([row(1,extra)])));
 const p=C.parseSar74(csv([row(1,{1:'DNB10174'})]));assert.equal(p.records[0].store_code,'DNB10174');
 assert.equal(build(p).stores.find(s=>s.store==='通化').total_units,1);
 const legacy=C.parseSar74(csv([row(1,{1:'DNB10059'})]));assert.throws(()=>build(legacy),/店碼/);
 assert.equal(C.STORES.find(s=>s[1]==='通化')[0],'DNB10174');
});
test('different recycler keys on the same sales order remain separate; duplicate recycler rows count once',()=>{
 const p=C.parseSar74(csv([row(1,{17:'SYN-SAME-ORDER'}),row(2,{17:'SYN-SAME-ORDER'}),row(3,{11:'SYN-REC-1',17:'SYN-SAME-ORDER'})]));
 assert.equal(p.records.length,3);assert.equal(new Set(p.records.map(r=>r.order_number)).size,1);
 const s=build(p);assert.equal(s.summary.total_units,2);assert.equal(s.summary.duplicate_rows,1);assert.equal(s.summary.pending_identity_units,2);
});
test('same recycler key with different order/project/employee remains a whole-batch conflict',()=>{
 for(const extra of [{17:'SYN-OTHER-ORDER'},{6:'AQNP'},{23:'0A1B3'}]){
  const p=C.parseSar74(csv([row(1),row(2,{11:'SYN-REC-1',17:'000SYN-ORDER-1',...extra})]));assert.throws(()=>build(p),/衝突/);
 }
});
test('all allowed projects are preserved; unknown project blocks before counting',()=>{
 const p=C.parseSar74(csv([row(1,{6:'單銷'}),row(2,{6:'RT'}),row(3,{6:'AQNP'})]));
 assert.deepEqual(p.records.map(r=>r.project),['單銷','RT','AQNP']);assert.equal(build(p).summary.total_units,3);
 for(const project of ['','unknown','rt'])assert.throws(()=>C.parseSar74(csv([row(1,{6:project})])),/專案/);
});
test('synthetic cancellation merges against the same recycler key without subtracting twice',()=>{
 const p=C.parseSar74(csv([row(1),row(2,{11:'SYN-REC-1',17:'000SYN-ORDER-1',26:'1151008'})]));
 const s=build(p);assert.equal(s.summary.total_units,0);assert.equal(s.summary.cancelled_units,1);assert.equal(s.summary.duplicate_rows,1);
});
test('synthetic next-month cancellation reverses original month; query range cannot span months',()=>{
 const p=C.parseSar74(csv([row(1,{26:'1151102'})],header(),'日期 :,115/10/01 - 115/10/31,列印日期 :,26年11月03日 11:23'));
 const s=build(p);assert.equal(s.period_key,'2026-10');assert.equal(s.summary.cancelled_units,1);assert.equal(s.summary.total_units,0);
 assert.throws(()=>C.parseSar74(csv([row()],header(),'日期 :,115/10/01 - 115/11/01')),/单月|單月/);
 assert.throws(()=>C.parseSar74(csv([row()],header(),'日期 :,115/10/02 - 115/10/09')),/月首/);
});
test('invalid dates, reversed ranges and cancellation before sale/after as-of are rejected',()=>{
 for(const extra of [{4:'1150230'},{4:'1151000'},{4:'1150930'},{4:'1151010'},{4:'115/10/02'},{26:'1151001'},{26:'1151011'}])assert.throws(()=>C.parseSar74(csv([row(1,extra)])),/日期|七碼|期間/);
 for(const preamble of ['日期 :,115/10/01 - 115/09/30','日期 :,115/10/01 - 115/10/09,列印日期 :,26年10月08日 11:23','日期 :,115/10/01 - 115/10/09,列印日期 :,26年10月10日 24:00','日期 :,115/10/01 - 115/10/09,再次 :,115/10/01 - 115/10/09'])assert.throws(()=>C.parseSar74(csv([row()],header(),preamble)));
});
test('row region/store presence is not evidence of full-area query scope or zero absent stores',()=>{
 for(const rows of [[],[row()],C.STORES.map((s,i)=>row(i+1,{1:s[0]}))]){
  const p=C.parseSar74(csv(rows));assert.equal(p.complete_nine_stores,false);assert.throws(()=>C.build({...p,source_sha256:'e'.repeat(64)},[]),/涵蓋/);
 }
});
test('empty recycle/order codes and oversized identifiers are blocked',()=>{
 for(const extra of [{11:''},{17:''},{11:'X'.repeat(101)},{17:'X'.repeat(101)}])assert.throws(()=>C.parseSar74(csv([row(1,extra)])),/回收碼／銷貨單號/);
});
