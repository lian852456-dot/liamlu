const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const Core=require('../department-scores-core.js'),F=require('./helpers/department-scores-synthetic.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
test('三版多層表頭從語義辨識，動態行與位移欄、主管合計均不混入',()=>{
 for(const layout of ['warning-no-recycle','warning-recycle','final-recycle'])for(const offset of [0,2]){
  const parsed=Core.parseWorkbook(F.workbook({layout,offset,rowStart:80}));assert.deepEqual(parsed.errors,[]);const m=parsed.months[0];assert.equal(m.records.length,9);assert.equal(m.records[0].sourceRow,81);assert.equal(m.layout,layout);assert.equal(m.records[0].deduction,.5);assert.equal(m.records[0].defects,0);assert.equal(m.records[0].score,99.5);assert.equal(m.records[0].recycleDefects,layout==='warning-no-recycle'?null:0);
 }
});
test('核心成績錯誤及缺列阻擋該月，子排名錯誤只標缺資料',()=>{
 for(const options of [{errorScore:true},{missingRow:true}]){const r=Core.parseWorkbook(F.workbook(options));assert.equal(r.months.length,0);assert.equal(r.errors.length,1);}
 const r=Core.parseWorkbook(F.workbook({errorRank:true}));assert.equal(r.months.length,1);assert.equal(r.errors.length,0);assert.equal(r.months[0].warnings.length,1);assert.equal(r.months[0].records[0].score,99.5);assert.equal(r.months[0].records[0].metrics.find(v=>v.status==='error').value,null);
});
test('空白、NA、錯誤、零值區分；月份不取子標題或人員參照分數',()=>{
 const w=F.workbook({month:5}),s=w.Sheets['5月'];s.I81={t:'s',v:'N/A'};s.I61={t:'s',v:'N/A'};delete s.J61;s.K61={t:'n',v:0};s.M5={t:'s',v:'截至3/31'};
 const m=Core.parseWorkbook(w).months[0],row=m.records[0];assert.equal(m.monthKey,'2026-05');assert.equal(row.score,99.5);assert.equal(row.metrics.find(v=>v.key==='I').status,'na');assert.equal(row.metrics.find(v=>v.key==='J').status,'blank');assert.equal(row.metrics.find(v=>v.key==='K').value,0);assert.throws(()=>Core.parseWorkbook(w,{year:'2025'}),/年度/);
});
test('有扣分判斷依F；門市等權平均與季度完整性、同分同名次',()=>{
 const m=F.month();const summary=Core.summarize(m.records);assert.equal(summary.defects,0);assert.equal(summary.deductedStores,4);assert.equal(summary.mean,(5*100+4*99.5)/9);
 const ranked=Core.rank(m.records);assert.equal(ranked[0].departmentRank,1);assert.equal(ranked[4].departmentRank,1);assert.equal(ranked[5].departmentRank,6);
 const q=Core.quarterInfo([F.month({month:2}),F.month({month:3}),F.month({month:4}),F.month({month:5}),F.month({month:6}),m]);assert.deepEqual(q.map(v=>[v.key,v.complete,v.present.length]),[['2026-Q1',false,2],['2026-Q2',true,3],['2026-Q3',false,1]]);
});
test('差異包含E/F/G、子項NA與零、來源；重複店或竄改來源阻擋',()=>{
 const a=F.month(),b=clone(a);b.records[0].score=99;b.records[0].source.score.value=b.records[0].source.score.raw=99;b.records[0].deduction=1;b.records[0].source.deduction.value=b.records[0].source.deduction.raw=1;
 assert.ok(Core.diff(a,b).some(d=>d.field==='score'));const bad=clone(a);bad.records[1].store=bad.records[0].store;assert.throws(()=>Core.validateMonth(bad),/重複|定位/);const loc=clone(a);loc.records[0].source.score.cell='G999';assert.throws(()=>Core.validateMonth(loc),/定位/);
 const brief=Core.brief([a],{});assert.equal(brief.contract,'north12-scores-brief-v1');assert.ok(brief.limitations.some(s=>s.includes('模板')));
});
const backend=require('./helpers/department-scores-backend.cjs');
const payload=(months,generation=0)=>({action:'department_scores_publish',token:'authorized',contract:Core.CONTRACT,confirm:true,requestId:crypto.randomUUID(),expectedGeneration:generation,selectedMonthKeys:months.map(m=>m.monthKey),months,sourceName:'synthetic.xlsx',sourceHash:'a'.repeat(64)});
const read=b=>b.invoke({action:'department_scores_read',token:'authorized'});
test('持久讀回、同hash去重、同月更正、保留舊月與版本回復',()=>{
 const b=backend(),first=payload([F.month({month:6}),F.month({month:7})]);const result=b.invoke(first);assert.equal(result.generation,1);assert.equal(read(b).months.length,2);assert.deepEqual(b.invoke(first),result);assert.equal(b.invoke(payload([F.month({month:7})],1)).deduplicated,true);
 const replacement=F.month({month:7});replacement.records[0].score=99;replacement.records[0].source.score.value=replacement.records[0].source.score.raw=99;replacement.records[0].deduction=1;replacement.records[0].source.deduction.value=replacement.records[0].source.deduction.raw=1;
 b.invoke(payload([replacement,F.month({month:8})],1));const current=read(b);assert.equal(current.months.length,3);assert.equal(current.generation,2);const july=current.months.find(s=>s.month.monthKey==='2026-07');assert.equal(july.history.length,1);
 const restore={action:'department_scores_restore',token:'authorized',confirm:true,requestId:crypto.randomUUID(),expectedGeneration:2,monthKey:'2026-07',revision:july.history[0].revision};const receipt=b.invoke(restore);assert.equal(receipt.generation,3);assert.equal(read(b).months.find(s=>s.month.monthKey==='2026-07').month.records[0].score,99.5);assert.equal(read(b).months.find(s=>s.month.monthKey==='2026-07').history.length,2);assert.deepEqual(b.invoke(restore),receipt);
 assert.equal(current.months.some(s=>s.active.fileId),false);
});
test('未驗證／共享／異owner均無私有內容或寫入，明確確認與stale preview防呆',()=>{
 const b=backend();assert.throws(()=>b.invoke({action:'department_scores_read'}),/AUTH/);assert.equal(b.files.size,0);b.setAccess('ANYONE');assert.throws(()=>read(b),/PRIVATE/);b.setAccess('PRIVATE');b.setShared(1);assert.throws(()=>b.invoke(payload([F.month()])),/PRIVATE/);b.setShared(0);b.setOwner('other@example.test');assert.throws(()=>read(b),/OWNER/);b.setOwner('owner@example.test');b.folder.getName=()=> 'Liam勿動';assert.throws(()=>read(b),/PROTECTED/);b.folder.getName=()=> 'Existing private domain';
 const unconfirmed=payload([F.month()]);unconfirmed.confirm=false;assert.throws(()=>b.invoke(unconfirmed),/CONFIRM/);b.invoke(payload([F.month()]));assert.throws(()=>b.invoke(payload([F.month({month:8})],0)),/STALE/);
});
test('多月發布中途失败不改active manifest；錯檔缺列與request重用拒絕',()=>{
 const b=backend();b.invoke(payload([F.month({month:6})]));b.failAfter(2);assert.throws(()=>b.invoke(payload([F.month({month:7}),F.month({month:8})],1)),/injected/);assert.equal(read(b).generation,1);assert.deepEqual(read(b).months.map(s=>s.month.monthKey),['2026-06']);
 const bad=F.month({month:7});bad.records.pop();assert.throws(()=>b.invoke(payload([bad],1)),/列數/);
 const bb=backend(),p=payload([F.month()]);bb.invoke(p);p.sourceHash='b'.repeat(64);assert.throws(()=>bb.invoke(p),/REQUEST_ID/);
});
test('共用GAS與金牌控制器維持原基準，無成績匿名API或私有測試fixture',()=>{
 assert.equal(fs.readFileSync('gas/DepartmentScoresCore.gs','utf8'),fs.readFileSync('department-scores-core.js','utf8'));
 const gas=fs.readFileSync('gas/DepartmentScores.gs','utf8'),ui=fs.readFileSync('department-scores.js','utf8');assert.doesNotMatch(gas,/setSharing|setTrashed/);assert.doesNotMatch(ui,/localStorage|IndexedDB|toDataURL/);assert.match(ui,/confirm:true/);assert.match(ui,/const count=readonly\?3:1/);
});

test('近半年為最新月往前六個日曆月，缺月明確null、季度不足不補零',()=>{
 const months=[F.month({month:1}),F.month({month:3}),F.month({month:5}),F.month({month:7})];
 const half=Core.periodMonths(months,'half');assert.deepEqual(half.map(m=>m.monthKey),['2026-02','2026-03','2026-04','2026-05','2026-06','2026-07']);assert.equal(half[0].available,false);assert.equal(Core.summarize(half[0].records).defects,null);assert.equal(Core.summarize(half[0].records).deduction,null);assert.deepEqual(Core.brief(half,{}).missingMonths,['2026-02','2026-04','2026-06']);
 const q=Core.periodMonths(months,'quarter:2026-Q2');assert.equal(Core.quarterInfo(q)[0].complete,false);assert.deepEqual(Core.quarterInfo(q)[0].present,['2026-05']);
});
