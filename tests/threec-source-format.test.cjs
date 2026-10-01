'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../tradein-import-core.js'),XLSX=require('../assets/vendor/xlsx.full.min.js');
async function parse(name,sheets,kind){const book=XLSX.utils.book_new();for(const [name,rows] of sheets)XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),name);const bytes=XLSX.write(book,{type:'buffer',bookType:name.endsWith('.xls')?'biff8':'xlsx'});return Core.parseFile({name,size:bytes.length,arrayBuffer:async()=>bytes},XLSX,kind);}
const catalog=[['OP專案別','品牌','料號組合料號','品名','上架下架','是否搭專案'],['OP','QA','C1','目錄商品','上架','是']];
for(const date of ['20261001','20261116'])test(`原 XLS 換日 ${date}：目錄保留稽核、數字方案全部入價、真正缺價才排除`,async()=>{
 const r=await parse(date+'-source.xls', [['OP料號清單',catalog],['商品價格明細表_'+date,[['品牌','代碼','機型','699專案_新申裝','599(6)','999H'],['QA','P1','測試機 256GB',0,4400,5500],['QA','P2','無價機','','','']]]],'shopping');
 const a=Core.buildAcceptanceReport('shopping',r),s=Core.buildPublishSnapshot('shopping',r);
 assert.equal(a.acceptance.status,'PARTIAL_READY');assert.equal(r.catalogRowCount,1);assert.equal(r.recordCount,3);assert.equal(r.rawRows.length,3);assert.equal(r.standardized.rows.length,2);assert.equal(a.presentation.excludedNoPriceRows,1);assert.equal(s.rows.length,1);
 assert.deepEqual(s.rows[0].project_prices,{'599(6)':'4400','699專案_新申裝':'0','999H':'5500'});assert.equal(s.source_version_date,date==='20261001'?'2026-10-01':'2026-11-16');
});
test('目錄判斷需完整表頭；目錄中出現價欄仍保留並阻擋缺識別',async()=>{
 const r=await parse('20261116-mixed.xlsx',[['OP',[...catalog[0],'999H'],[...catalog[1],1000]]].map(x=>[x[0],x.slice(1)]),'shopping');
 assert.equal(r.catalogRowCount,0);assert.equal(r.standardized.rows.length,1);assert.equal(Core.buildAcceptanceReport('shopping',r).acceptance.publishEligible,false);
});
test('未辨識數值不能被當缺價排除，也不能被另一張有效表帶過',async()=>{
 const r=await parse('20261116-unknown.xlsx',[['正常',[['品牌','代碼','機型','999H'],['QA','P1','測試機',100]]],['未知',[['品牌','代碼','機型','未知費用'],['QA','P2','另一機',200]]]],'shopping');
 const a=Core.buildAcceptanceReport('shopping',r);assert.equal(a.acceptance.status,'BLOCKED');assert.equal(a.presentation.excludedNoPriceRows,0);assert.match(a.acceptance.blockers.join(' '),/價格覆蓋/);assert.equal(r.rawRows[1].values['未知費用'],'200');assert.throws(()=>Core.buildPublishSnapshot('shopping',r),/gate/);
});
for(const [range,fourth] of [['10/1-10/14',''],['11/16-11/30','A'],['12/1-12/15',777]])test(`原舊換新 ${range} 四欄保留，未知供應商／等級不建立假報價`,async()=>{
 const r=await parse('20261116-tradein.xlsx',[['價格設定',[['料號','品名 Item',range+'報價',''],['T1','原商品名稱',1300,fourth]]]],'tradein');
 const row=r.standardized.rows[0],a=Core.buildAcceptanceReport('tradein',r);assert.equal(row.date,range);assert.equal(row.product,'原商品名稱');assert.equal(row.rawValues['未命名欄位 4'],String(fourth));assert.equal(a.acceptance.publishEligible,false);assert.match(a.acceptance.blockers.join(' '),/回收商.*等級/);assert.equal(Core.buildTradeInCandidate(r).rows.length,0);assert.throws(()=>Core.buildPublishSnapshot('tradein',r),/gate/);
});
test('只將品名改成原始機型，仍不能 PASS 並發布八格空價',async()=>{
 const r=await parse('20261116-renamed.xlsx',[['價格設定',[['料號','原始機型','11/16-11/30報價','備註'],['T1','原商品名稱',1300,'']]]],'tradein');
 assert.equal(Core.buildAcceptanceReport('tradein',r).acceptance.status,'BLOCKED');assert.throws(()=>Core.buildPublishSnapshot('tradein',r),/gate/);
});
test('已有價格而缺真實代碼／非法價／重複列保持阻擋',async()=>{
 for(const rows of [[['QA','','機型',100]],[['QA','P1','機型','未知']],[['QA','P1','機型',100],['QA','P1','機型',100]]]){
 const r=await parse('20261116-control.xlsx',[['價格',[['品牌','代碼','機型','999H'],...rows]]],'shopping');assert.equal(Core.buildAcceptanceReport('shopping',r).acceptance.publishEligible,false);
 }
});
test('整張有價但無識別表不可被另一張有效表掩蓋',async()=>{
 const r=await parse('20261116-orphan.xlsx',[['正常',[['品牌','代碼','機型','999H'],['QA','P1','機型',100]]],['孤立價格',[['品牌','代碼','機型','999H'],['QA','','',200]]]],'shopping');
 assert.equal(r.standardized.rows.length,2);assert.equal(r.rawRows.length,2);assert.equal(Core.buildAcceptanceReport('shopping',r).acceptance.publishEligible,false);
});
test('目錄額外未知欄與目錄識別缺漏不能被分類規則吞掉',async()=>{
 for(const rows of [[['OP專案別','品牌','料號組合料號','品名','上架下架','是否搭專案','優惠價'],['OP','QA','C1','商品','上架','是','錯誤價格']], [catalog[0],['OP','QA','','商品','上架','是']]]){
 const r=await parse('20261116-catalog-control.xlsx',[['OP',rows],['正常',[['品牌','代碼','機型','999H'],['QA','P1','機型',100]]]],'shopping');assert.equal(Core.buildAcceptanceReport('shopping',r).acceptance.publishEligible,false);assert.equal(r.rawRows.length,2);
 }
});
