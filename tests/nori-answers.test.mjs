import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {answerReport} from '../nori-answers.mjs';
import {goldAnswer,logAnswer} from '../nori-site-reports.mjs';
import '../nori-catalog.js';

const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const publicScope={};runInNewContext(file('gold-public-core.js'),publicScope);
globalThis.North12BGoldPublic=publicScope.North12BGoldPublic;
const today='2026-11-25', item='AQ V+D 999 (含)以上';
function source(){
  return {privateResult:{snapshot:{}},kpiResult:{data:{
    meta:{month:'2026-11',snapshotDay:24,sourceFile:'1125.xlsx'},items:[{key:item}],
    persons:[{pname:'測＊甲',store:'test',official:1.1234,items:{[item]:{a:0,t:4,reportRate:0}}}],
    stores:[{code:'test',name:'台北通化',official:.95}],aggregateRates:{}
  }}};
}
const run=(q,b=source(),topic='kpi',local)=>answerReport(topic,q,b,local,today).message;
test('個人全名與遮罩、期間、原始精度、門市和分項零值',()=>{
  assert.match(run('測試甲今天 KPI 達成？'),/通化.*測＊甲.*112\.34%.*2026-11-01 至 2026-11-24/);
  assert.match(run('測＊甲 A999 還差幾件'),/實績 0，月目標 4，進度達成率 0%，距月目標 4/);
  assert.match(run('通化本月KPI達成率'),/通化.*95%/);
  assert.match(run('今天單日KPI'),/指定單日/);
  assert.match(run('上個月通化KPI'),/其他期間/);
  assert.match(run('通化跟永吉KPI'),/一家門市/);
});
test('遮罩重複、缺欄位及未驗證期間不冒報',()=>{
  const b=source();b.kpiResult.data.persons.push({pname:'測*甲',store:'台北三創',official:0});
  assert.match(run('測試甲KPI',b),/同名遮罩/);
  assert.match(run('三創測試甲KPI',b),/0%/);
  assert.match(run('無名乙KPI',b),/查無/);
  assert.match(run('全區KPI',b),/未列/);
  assert.match(run('測試甲台獎',source(),'awards'),/尚未取得.*台獎/);
  assert.match(run('通化AQ締結率',b,'conversion'),/尚無正式資料/);
  b.kpiResult.data.meta.snapshotDay=28;
  assert.match(run('通化KPI',b),/截止日未確認/);
});
test('本機任務與 OP 提供報表日期與差額，無資料說明匯入方式',()=>{
  const op={date:'2026-11-24',stores:[{name:'通化',code:'T',total:3,target:5,qty:[1,2,0,0]}],people:[],sales:[]};
  assert.match(run('通化OP還差幾件',source(),'op',op),/累計 3 件，月目標 5 件，尚差 2 件/);
  assert.match(run('通化OP影音累計',source(),'op',op),/OP影音累計 1 件/);
  assert.match(run('通化動店任務',source(),'focus'),/先在重點任務匯入/);
  const focus={dates:['2026-11-01','2026-11-24'],stores:[{name:'通化',actual:[1,2,3,4,5],targets:[2,3,4,5,6]}],people:[]};
  assert.match(run('通化Mac動店進度',source(),'focus',focus),/Mac 2 件／目標 3 件/);
});
test('金牌依日結日期及代稱精確比對，日誌無檔時提供具體操作',()=>{
  const ledger=globalThis.North12BGoldPublic.validate({schema:'north12b-public-gold/v1',settlements:[{date:'2026-11-24',rows:[{store:'通化',alias:'甲',balance:0,delta:-1,reason:'測試原因'}]}]});
  assert.match(goldAnswer(ledger,'通化甲目前有幾枚金牌',today),/0 枚金牌.*-1 枚/);
  assert.match(goldAnswer(ledger,'通化今天金牌',today),/今天尚無/);
  assert.match(goldAnswer(ledger,'通化乙金牌',today),/查無/);
  assert.match(logAnswer('通化日誌完成率',null,today),/套用至本機預覽/);
});
test('首頁所有卡片可依實際標題提問，子項指向正確系統',()=>{
  const html=file('home.html'),cards=[...html.matchAll(/<a\b([^>]*data-search="[^"]*"[^>]*)>([\s\S]*?)<\/a>/g)].map(m=>{
    const title=m[2].match(/<h[23][^>]*>(.*?)<\/h[23]>/s)?.[1].replace(/<[^>]+>/g,'').replace(/&amp;/g,'&');
    return {href:m[1].match(/href="([^"]+)/)[1],dataset:{search:m[1].match(/data-search="([^"]+)/)[1]},querySelector:()=>({textContent:title})};
  });
  assert.ok(cards.length>=18);
  for(const c of cards)assert.ok(globalThis.NoriCatalog.find(c.querySelector().textContent+'怎麼使用',cards).some(h=>h.href===c.href),c.href);
  assert.equal(globalThis.NoriCatalog.find('督導面談紀錄在哪裡',cards)[0].href,'patrol.html');
  assert.equal(globalThis.NoriCatalog.find('舊換新簡報怎麼做',cards)[0].href,'tradein-brief.html');
});
test('正式價表精確規格與資費條件，缺價與零元分開',async()=>{
  const {priceAnswer}=await import('../nori-price.mjs');
  const response={status:'ok',snapshot:{kind:'shopping',source_version_date:'2026-11-20',snapshot_hash:'a'.repeat(64),rows:[
    {brand:'Test',model:'TestPhone 256GB',colorless_model:'TestPhone 256GB',retail_price:'7654',project_prices:{'測試專案／999型(24)':'0','測試專案／1399型(24)':'123'}}
  ]}};
  assert.match(priceAnswer(response,'TestPhone 256GB 月租999 24期 專案價'),/999.*0 元.*2026-11-20/);
  assert.doesNotMatch(priceAnswer(response,'TestPhone 256GB 月租999 24期 專案價'),/1399/);
  assert.match(priceAnswer(response,'TestPhone 256GB 月租999 48期 專案價'),/沒有報價/);
  assert.match(priceAnswer(response,'TestPhonePlus 256GB 空機價'),/查無/);
});
