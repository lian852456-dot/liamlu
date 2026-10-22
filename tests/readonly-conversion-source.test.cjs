'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const XLSX=require('../assets/vendor/xlsx.full.min.js'),baseline=require('../readonly-dashboard-core.js'),repair=require('../readonly-conversion-source.js');
const {workbook}=require('./helpers/readonly-conversion-workbook.cjs');
const opts={sha256:'a'.repeat(64),source_name:'SYNTHETIC.xlsx',source_bytes:1};
const make=()=>XLSX.read(workbook(),{type:'buffer',sheets:['AQ締結率','RT每日','RT締結率','樞紐']});
const parse=(C,w,o=opts)=>C.parseWorkbook(w,XLSX,o);
function zeroDay(w){for(const p of ['F3','AL3','BR3'])w.Sheets['AQ締結率'][p]={t:'n',v:0};w.Sheets['AQ締結率'].AK3.v--;w.Sheets['AQ締結率'].BQ3.v-=10;return w;}
test('ordinary numeric sources produce the identical snapshot',()=>{const w=make();assert.deepEqual(parse(repair,w),parse(baseline,w));});
test('exact text zero is accepted only for observed numeric 0/0; displayed rate stays null',()=>{
 const numeric=zeroDay(make()),expected=parse(baseline,numeric),w=zeroDay(make());w.Sheets['AQ締結率'].BR3={t:'s',v:'0'};const before=JSON.stringify(w);
 assert.throws(()=>parse(baseline,w),/AQ每日率/);const got=parse(repair,w);assert.deepEqual(got,expected);assert.equal(JSON.stringify(w),before);
 const row=got.records.find(r=>r.store==='DNB10062'&&r.date==='2026-10-01');assert.equal(baseline.aggregate([row]).aq_rate,null);
});
for(const [name,value]of [['empty string',''],['space',' '],['padded zero',' 0'],['decimal zero','0.0'],['percent zero','0%'],['nonzero string','0.1']])test(name+' remains rejected even for numeric 0/0',()=>{
 const w=zeroDay(make());w.Sheets['AQ締結率'].BR3={t:'s',v:value};assert.throws(()=>parse(repair,w),/AQ每日率/);
});
test('blank rate remains rejected',()=>{const w=zeroDay(make());delete w.Sheets['AQ締結率'].BR3;assert.throws(()=>parse(repair,w),/AQ每日率/);});
test('zero text never excuses a nonzero denominator',()=>{const w=make();w.Sheets['AQ締結率'].F3.v=0;w.Sheets['AQ締結率'].BR3={t:'s',v:'0'};assert.throws(()=>parse(repair,w),/AQ每日率/);});
test('zero text never excuses a nonzero numerator or absent count',()=>{
 let w=make();w.Sheets['AQ締結率'].AL3.v=0;w.Sheets['AQ締結率'].BR3={t:'s',v:'0'};assert.throws(()=>parse(repair,w),/AQ每日率/);
 w=zeroDay(make());delete w.Sheets['AQ締結率'].AL3;w.Sheets['AQ締結率'].BR3={t:'s',v:'0'};assert.throws(()=>parse(repair,w),/缺值不能當零/);
});
test('RT text zero remains outside the reviewed AQ-only compatibility rule',()=>{
 const w=make();w.Sheets['RT每日'].EO3={t:'s',v:'0'};assert.throws(()=>parse(repair,w),/RT每日率/);
});
test('text-zero formula caches and text count cells remain rejected',()=>{
 let w=zeroDay(make());w.Sheets['AQ締結率'].BR3={t:'s',v:'0',f:'IFERROR(F3/AL3,"0")'};assert.throws(()=>parse(repair,w),/AQ每日率/);
 w=zeroDay(make());w.Sheets['AQ締結率'].BR3={t:'s',v:'0'};w.Sheets['AQ締結率'].F3={t:'s',v:'0'};assert.throws(()=>parse(repair,w),/缺值不能當零/);
});
test('AQ TTL and period gates remain enforced after the text-zero case',()=>{
 let w=zeroDay(make());w.Sheets['AQ締結率'].BR3={t:'s',v:'0'};w.Sheets['AQ締結率'].AK3.v++;assert.throws(()=>parse(repair,w),/AQ分子TTL/);
 w=zeroDay(make());w.Sheets['AQ締結率'].BR3={t:'s',v:'0'};w.Sheets['RT每日'].A1.v='10/1 ~ 10/2';assert.throws(()=>parse(repair,w),/三張來源期間不同/);
});
