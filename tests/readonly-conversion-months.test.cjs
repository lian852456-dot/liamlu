'use strict';
const {createHash}=require('node:crypto');
const {test}=require('node:test'),assert=require('node:assert/strict');
const X=require('../assets/vendor/xlsx.full.min.js'),Core=require('../readonly-dashboard-core.js'),Source=require('../readonly-conversion-source.js'),Officer=require('../north12-officer-core.js');
const {workbook}=require('./helpers/readonly-conversion-workbook.cjs'),{runtime}=require('./helpers/readonly-conversion-runtime.cjs');
const opts={sha256:'b'.repeat(64),source_name:'synthetic-month.xlsx',source_bytes:1234};
const make=options=>X.read(workbook(options),{type:'buffer'}),rows=(w,n)=>X.utils.sheet_to_json(w.Sheets[n],{header:1,raw:true,defval:null,blankrows:true});
const layout=w=>Core.workbookLayout(rows(w,'AQ締結率'),rows(w,'RT每日'),rows(w,'RT締結率'));
for(const month of ['2026-10','2026-11','2026-02','2028-02','2027-01'])test(month+' parses actual calendar days and keeps current/prior totals separate',()=>{
 const w=make({month,days:3,rateGap:13,priorGap:61}),before=JSON.stringify(w),a=Source.parseWorkbook(w,X,opts),b=Officer.parseWorkbook(w,X,opts);
 assert.equal(a.cutoff,month+'-03');assert.equal(a.records.length,27);assert.deepEqual(a.records,b.records);assert.deepEqual(a.prior,b.prior);
 assert.deepEqual(Core.aggregate(a.records),{aq_n:54,aq_d:378,rt_n:54,rt_d:702,aq_rate:54/378,rt_rate:54/702});
 assert.equal(a.prior[0].aq_n,2);assert.equal(a.prior[0].aq_d,10);assert.equal(JSON.stringify(w),before);
});
test('November full month retains all 270 store-days without inventing November 31',()=>{
 const d=Source.parseWorkbook(make({month:'2026-11',days:30}),X,opts);assert.equal(d.records.length,270);assert.equal(d.cutoff,'2026-11-30');assert.equal(d.prior_period.end,'2026-10-30');
});
for(const month of ['2026-11','2026-02','2028-02'])test(month+' accepts empty trailing slots in a fixed 31-day template',()=>{
 const padded=make({month,fixed31:true}),expected=Source.parseWorkbook(make({month}),X,opts),before=JSON.stringify(padded);
 for(const parser of [Source,Officer]){
  const actual=parser.parseWorkbook(padded,X,opts);
  assert.deepEqual(actual.records,expected.records);assert.deepEqual(actual.prior,expected.prior);
 }
 assert.equal(JSON.stringify(padded),before);
});
test('month-end placeholders accept only expected headings and empty or zero store cells',()=>{
 const w=make({month:'2026-11',fixed31:true}),{aq,rt,days}=layout(w),a=w.Sheets['AQ締結率'],r=w.Sheets['RT每日'],cell=(row,c)=>X.utils.encode_cell({r:row,c});
 a[cell(1,aq.n+days)]={t:'n',v:31};delete r[cell(1,rt.twN+days)];
 assert.equal(Source.parseWorkbook(w,X,opts).records.length,27);
 a[cell(1,aq.n+days)].v=a[cell(1,aq.n+days-1)].v;
 assert.throws(()=>Source.parseWorkbook(w,X,opts),/日期欄位超出來源月份/);
 a[cell(1,aq.n+days)].v=31;
 for(const [sheet,column,value] of [[a,aq.n,1],[r,rt.tsD,2],[r,rt.rate,.01]]){
  const key=cell(2,column+days),original=sheet[key];sheet[key]={t:'n',v:value};
  for(const parser of [Source,Officer])assert.throws(()=>parser.parseWorkbook(w,X,opts),/月底後的占位欄含有資料/);
  if(original)sheet[key]=original;else delete sheet[key];
 }
 a[cell(2,aq.total.n)].v++;
 assert.throws(()=>Source.parseWorkbook(w,X,opts),/AQ分子TTL/);
});
test('November AQ exact text-zero compatibility uses November columns without mutating source',()=>{
 const w=make({month:'2026-11'}),a=layout(w).aq,s=w.Sheets['AQ締結率'],cell=c=>X.utils.encode_cell({r:2,c});
 s[cell(a.n)].v=0;s[cell(a.d)].v=0;s[cell(a.rate)]={t:'s',v:'0'};s[cell(a.n+a.days)].v--;s[cell(a.d+a.days)].v-=10;
 const before=JSON.stringify(w),d=Source.parseWorkbook(w,X,opts);assert.equal(Core.aggregate([d.records[0]]).aq_rate,null);assert.equal(JSON.stringify(w),before);
 assert.deepEqual(d.records,Officer.parseWorkbook(w,X,opts).records);
});
for(const kind of ['duplicate heading','wrong day','missing TTL','bad daily rate','bad prior heading','post-cutoff count'])test('November rejects '+kind+' before private publication',()=>{
 const w=make({month:'2026-11'}),l=layout(w),cell=(r,c)=>X.utils.encode_cell({r,c}),a=w.Sheets['AQ締結率'],r=w.Sheets['RT每日'];
 if(kind==='duplicate heading')a[cell(0,100)]={t:'s',v:'AQ來客數'};
 if(kind==='wrong day')r[cell(1,l.rt.twD+1)].v++;
 if(kind==='missing TTL')delete a[cell(1,l.aq.n+l.days)];
 if(kind==='bad daily rate')r[cell(2,l.rt.rate)].v=.9;
 if(kind==='bad prior heading')a[cell(1,l.aq.priorD)].v='上線數';
 if(kind==='post-cutoff count')a[cell(2,l.aq.n+3)].v=1;
 for(const C of [Source,Officer])assert.throws(()=>C.parseWorkbook(w,X,opts),/欄位|日期|RT每日率|截止/);
});
test('November accepts a blank RT total rate only when both verified RT counts are zero',()=>{
 const optsNovember={month:'2026-11',fixed31:true},w=make({...optsNovember,blankRtTotal:true}),rt=w.Sheets['RT締結率'];
 for(const parser of [Source,Officer]){
  const snapshot=parser.parseWorkbook(w,X,opts),total=Core.aggregate(snapshot.records.filter(r=>r.store===Core.STORES[0].id));
  assert.equal(total.rt_n,0);assert.equal(total.rt_d,0);assert.equal(total.rt_rate,null);
 }
 rt.R3={t:'s',v:''};assert.equal(Source.parseWorkbook(w,X,opts).records.length,27);
 rt.R3={t:'n',v:.5};assert.throws(()=>Source.parseWorkbook(w,X,opts),/RT總率.*酒泉 RT締結率!R3.*逐日 0\/0/);
 const nonzero=make(optsNovember),summary=nonzero.Sheets['RT締結率'];delete summary.R3;
 for(const parser of [Source,Officer])assert.throws(()=>parser.parseWorkbook(nonzero,X,opts),/RT總率.*酒泉 RT締結率!R3.*總表 空白.*逐日 6\/66/);
 summary.R3={t:'n',v:.75};assert.throws(()=>Source.parseWorkbook(nonzero,X,opts),/總表 75\.000000%.*逐日 6\/66/);
 delete rt.R3;delete rt.Q3;assert.throws(()=>Source.parseWorkbook(w,X,opts),/RT分母/);
});
test('November XLSM previews, publishes, reads back, reimports and rolls back after an XLSX version',()=>{
 const b=runtime(),old=Source.parseWorkbook(make(),X,{...opts,sha256:'a'.repeat(64)});
 const bytes=workbook({month:'2026-11',fixed31:true,bookType:'xlsm'}),name='synthetic-month.XLSM';
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const next=Source.parseWorkbook(X.read(bytes,{type:'buffer',bookVBA:false}),X,{source_name:name,source_bytes:bytes.length,sha256});
 const publish=s=>{const p=b.call('Preview',{snapshot:s});return b.call('Publish',{previewToken:p.token,confirm:true});};
 const previous=publish(old),current=publish(next);assert.equal(current.live.cutoff,'2026-11-03');assert.equal(b.call('Status').live.activeHash,current.live.activeHash);assert.equal(publish(next).status,'already_current');assert.equal(b.files.size,2);
 assert.equal(current.live.sourceName,name);assert.equal(current.live.sourceHash,sha256);
 assert.throws(()=>b.call('Preview',{snapshot:{...next,source_name:'invalid.xls'}}),/締結率原始檔身分不完整/);
 const result=b.call('Rollback',{confirm:true,expectedRevision:current.live.revision,expectedActiveHash:current.live.activeHash});assert.equal(result.live.activeHash,previous.live.activeHash);
});

test('RT每日 resolves the unique dated rate block when the report has an extra label or full-width heading',()=>{
 const w=make({month:'2026-11',fixed31:true}),r=w.Sheets['RT每日'],l=layout(w);
 const at=(row,col)=>X.utils.encode_cell({r:row,c:col});
 const expected=Officer.parseWorkbook(w,X,opts).records;
 r[at(0,l.rt.rate)].v='ＲＴ\u200b 締結率';
 r[at(0,134)]={t:'s',v:'RT 締結率'};
 for(const parser of [Source,Officer])assert.deepEqual(parser.parseWorkbook(w,X,opts).records,expected);
 const head=rows(w,'RT每日')[1],duplicate=l.rt.rate;
 const other=duplicate+l.days+2;
 for(let col=0;col<l.days;col++)r[at(1,other+col)]={t:'n',v:head[duplicate+col]};
 r[at(0,other)]={t:'s',v:'RT締結率'};
 r['!ref']=X.utils.encode_range({s:{r:0,c:0},e:{r:10,c:other+l.days}});
 assert.throws(()=>Officer.parseWorkbook(w,X,opts),/RT每日.*重複的逐日欄位/);
});

test('department RT rates match when the daily percentage heading or block is absent',()=>{
 const w=make({month:'2026-11',fixed31:true}),r=w.Sheets['RT每日'],{rt}=layout(w);
 const cell=(row,c)=>X.utils.encode_cell({r:row,c});
 const expected=Officer.parseWorkbook(w,X,opts);
 delete r[cell(0,rt.rate)];
 assert.deepEqual(Officer.parseWorkbook(w,X,opts),expected);
 assert.throws(()=>Source.parseWorkbook(w,X,opts),/RT每日第 1 列缺少/);
 for(let row=1;row<=10;row++)for(let c=rt.rate;c<=rt.total.rate;c++)delete r[cell(row,c)];
 assert.deepEqual(Officer.parseWorkbook(w,X,opts),expected);
});

test('missing daily percentage heading still requires valid dated counts and TWM/TST reconciliation',()=>{
 const w=make({month:'2026-11',fixed31:true}),r=w.Sheets['RT每日'],{rt}=layout(w);
 const cell=(row,c)=>X.utils.encode_cell({r:row,c});
 delete r[cell(0,rt.rate)];
 const missing=cell(2,rt.twD),saved=r[missing];
 delete r[missing];
 assert.throws(()=>Officer.parseWorkbook(w,X,opts),/原TWM來客.*非負整數/);
 r[missing]=saved;

 r[cell(2,rt.twN)].v++;
 r[cell(2,rt.tsN)].v--;
 assert.throws(()=>Officer.parseWorkbook(w,X,opts),/RT每日分項與總表/);
 r[cell(2,rt.twN)].v--;
 r[cell(2,rt.tsN)].v++;

 r[cell(1,rt.twN+1)].v++;
 assert.throws(()=>Officer.parseWorkbook(w,X,opts),/日期欄位/);
});

test('department imports current counts with no pivot, prior headers, daily rates or optional detail sheets',()=>{
 const w=make({month:'2026-11',fixed31:true}),l=layout(w),expected=Officer.parseWorkbook(w,X,opts);
 delete w.Sheets['樞紐'];
 const at=(r,c)=>X.utils.encode_cell({r,c});
 for(const name of ['AQ締結率','RT締結率']){
  const sheet=w.Sheets[name];
  for(const key of Object.keys(sheet)){
   if(key.startsWith('!'))continue;
   const cell=X.utils.decode_cell(key);
   if(cell.r===0&&String(sheet[key].v).replace(/\s/g,'')==='上月同期')delete sheet[key];
  }
 }
 const rt=w.Sheets['RT每日'];
 for(let r=0;r<=10;r++)for(let c=l.rt.rate;c<=l.rt.total.rate;c++)delete rt[at(r,c)];
 const before=JSON.stringify(w),actual=Officer.parseWorkbook(w,X,opts);
 assert.deepEqual(actual.records,expected.records);
 assert.equal(actual.prior,null);assert.equal(actual.prior_period,null);
 assert.deepEqual(actual.renewalDetail.coverage,{tiers:false,observation:false,plans:false});
 assert.equal(JSON.stringify(w),before);
 rt[at(2,l.rt.twN)].v++;
 assert.throws(()=>Officer.parseWorkbook(w,X,opts),/RT分子|總表/);
});
test('department still rejects a supplied pivot with a conflicting prior period',()=>{
 const w=make({month:'2026-11'});
 w.Sheets['樞紐'].A1.v='9/1 ~ 9/3';
 assert.throws(()=>Officer.parseWorkbook(w,X,opts),/同期區間文字尚未核實/);
});
