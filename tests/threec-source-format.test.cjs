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

// Actual source structure, synthetic identities and prices only.
for(const date of ['20261116','20270302'])test(`七欄OP與非數字方案 ${date}：NA缺價與0元、料號與raw守恆`,async()=>{
 const headers=['品牌','代碼','機型','單機價','新復原者年繳型','新復原者月繳型','預付卡平板加掛案','Entry SD','中低階SD','中高階SD','高階SD','加碼機款'];
 const values=['QA','NEW1','任意新機 512GB','NA',0,3100,'N/A',4100,5100,6100,7100,8100];
 const r=await parse(date+'-original.xls',[['OP',[['OP專案別','品牌','料號/組合料號','品名','上架日','下架日','是否搭專案'],['OP','','BUNDLE1','目錄套裝','11/1','12/31','是']]],['價格',[headers,values,['QA','EMPTY1','全空機',...Array(9).fill('')]]]],'shopping');
 assert.equal(r.recordCount,3);assert.equal(r.catalogRowCount,1);assert.equal(r.catalogIssueCount,0);assert.equal(r.standardized.rows.length,2);assert.equal(r.rawRows.length,3);
 const a=Core.buildAcceptanceReport('shopping',r),s=Core.buildPublishSnapshot('shopping',r);
 assert.equal(a.acceptance.status,'PARTIAL_READY');assert.equal(a.presentation.excludedNoPriceRows,1);assert.equal(s.rows.length,1);
 assert.equal(s.rows[0].retail_price,'');assert.equal(s.rows[0].project_prices['新復原者年繳型'],'0');assert.equal(s.rows[0].project_prices['Entry SD'],'4100');assert.equal(s.rows[0].project_prices['預付卡平板加掛案'],'');
 assert.equal(r.standardized.rows[0].rawValues['單機價'],'NA');assert.equal(r.standardized.rows[0].rawValues['預付卡平板加掛案'],'N/A');assert.equal(s.source_version_date,date==='20261116'?'2026-11-16':'2027-03-02');
});
const flatHeader=range=>['料號','品名 Item',range+'報價',''];
for(const [date,range,notes] of [['20261116','11/16-11/30','11/16新增'],['20270302','3/2-3/15','3/2新增']])test(`四欄原格式 ${date} 尾綴是來源契約，換日／新機／新價不用改欄名`,async()=>{
 const r=await parse(date+'-original.xlsx',[['價格設定',[flatHeader(range),['SKU-A','(舊機)QA 任意新機_512G-(黑)_(點子)_A等',0,notes],['SKU-S','(舊機)QA 任意新機_512G-(黑)(FDI)_S等',9876,'']]]],'tradein');
 const a=Core.buildAcceptanceReport('tradein',r),s=Core.buildPublishSnapshot('tradein',r);
 assert.equal(a.acceptance.status,'PASS');assert.equal(r.recordCount,2);assert.equal(r.standardized.rows.length,2);assert.equal(r.sourceNoteColumn,'未命名欄位 4');assert.deepEqual(a.tradeIn.sourceProviders,['點子行動','FutureDial（FDI）']);
 assert.equal(r.standardized.rows[0].note,notes);assert.equal(r.standardized.rows[0].date,range);assert.equal(r.standardized.rows[0].product,'(舊機)QA 任意新機_512G-(黑)_(點子)_A等');assert.equal(s.rows[0].quotes['點子行動'].A,'0');assert.equal(s.rows[0].quotes['FutureDial（FDI）'].S,'9876');assert.equal(s.rows[0].quotes['FutureDial（FDI）'].C,null);
});
test('明確FDI與四等級尾綴容許來源舊機前綴漏括號，raw與警示保留',async()=>{
 const records=['S','A','B','C'].map((g,i)=>['SKU'+g,'(舊機QA 新機_12G/512G(5G)(FDI)_'+g+'等',400-i*100,'']);
 const r=await parse('20270302-typo.xlsx',[['價格設定',[flatHeader('3/2-3/15'),...records]]],'tradein');
 assert.equal(Core.buildAcceptanceReport('tradein',r).acceptance.status,'PASS');assert.equal(r.standardized.rows.length,4);
 for(const row of r.standardized.rows){assert.equal(row.vendor,'FutureDial（FDI）');assert.equal(row.sourceModel,'QA 新機_12G/512G(5G)');assert.equal(row.sourceSyntaxWarnings.length,1);assert.match(row.rawValues['品名 Item'],/^\(舊機QA/);}
});
test('愛鋒派及無等級留原價且阻擋整份，不默默排除或補SABC',async()=>{
 const rows=[['K1','(舊機)QA 新機(點子)_A等',100,''],['K2','(舊機)QA 新機(愛鋒派)_B等',200,''],['K3','(舊機)QA 新機(愛鋒派)',300,'']];
 const r=await parse('20270302-provider.xlsx',[['價格設定',[flatHeader('3/2-3/15'),...rows]]],'tradein');
 assert.equal(r.recordCount,3);assert.equal(r.standardized.rows.length,3);assert.equal(r.standardized.summary.partial,2);assert.equal(r.standardized.rows[2].grade,'');assert.equal(r.standardized.rows[2].tradeInPrice,'300');assert.equal(r.standardized.rows[1].vendor,'愛鋒派');assert.equal(Core.buildAcceptanceReport('tradein',r).acceptance.publishEligible,false);assert.throws(()=>Core.buildPublishSnapshot('tradein',r),/gate/);
});
test('有名或無名第四欄不因明確品名而吞掉未知數值／等級／任意備註',async()=>{
 for(const [header,value] of [['',777],['','A'],['備註','自訂條件'],['額外價格',888]]){
 const r=await parse('20270302-extra.xlsx',[['價格設定',[[...flatHeader('3/2-3/15').slice(0,3),header],['K1','(舊機)QA 新機(點子)_A等',100,value]]]],'tradein');
 assert.equal(r.rawRows.length,1);assert.equal(r.standardized.rows[0].rawValues[r.fields[3].name],String(value));assert.equal(Core.buildAcceptanceReport('tradein',r).acceptance.publishEligible,false);assert.throws(()=>Core.buildPublishSnapshot('tradein',r),/gate/);
 }
});
test('四欄缺價、非法價及重複列保持阻擋；NA不補0',async()=>{
 for(const value of ['','NA','N/A','待確認']){
 const r=await parse('20270302-price.xlsx',[['價格設定',[flatHeader('3/2-3/15'),['K1','(舊機)QA 新機(點子)_A等',value,'']]]],'tradein');assert.equal(r.standardized.rows[0].rawValues['3/2-3/15報價'],value);assert.equal(Core.buildAcceptanceReport('tradein',r).acceptance.publishEligible,false);
 }
 const row=['K1','(舊機)QA 新機(點子)_A等',100,''];const r=await parse('20270302-duplicate.xlsx',[['價格設定',[flatHeader('3/2-3/15'),row,row]]],'tradein');assert.equal(r.standardized.rows.length,2);assert.equal(r.duplicateRowCount,1);assert.throws(()=>Core.buildPublishSnapshot('tradein',r),/gate/);
});
test('不同SKU的同機型／商／等級異價不能以第一個價格發布',async()=>{
 const r=await parse('20270302-conflict.xlsx',[['價格設定',[flatHeader('3/2-3/15'),['K1','(舊機)QA 新機(點子)_A等',100,''],['K2','(舊機)QA 新機(點子)_A等',200,'']]]],'tradein');
 const candidate=Core.buildTradeInCandidate(r);assert.equal(candidate.quoteConflictCount,1);assert.equal(candidate.metadata.publication.disabled,true);assert.throws(()=>Core.buildPublishSnapshot('tradein',r),/gate/);
});
test('固定格式保留整個599(6)條件；其為唯一價時不能當全空列',async()=>{
 const r=await parse('20270302-only.xls',[['價格',[['品牌','代碼','機型','單機價','599(6)'],['QA','P1','機型','','7654'],['QA','P2','另一機','','']]]],'shopping');
 const s=Core.buildPublishSnapshot('shopping',r);assert.equal(s.rows.length,1);assert.deepEqual(s.rows[0].project_prices,{'599(6)':'7654'});assert.equal(s.excluded_no_price_count,1);
});
test('前後端parser資產逐byte一致，parser版本供稽核',()=>{
 const fs=require('node:fs'),path=require('node:path');assert.equal(fs.readFileSync(path.join(__dirname,'../tradein-import-core.js'),'utf8'),fs.readFileSync(path.join(__dirname,'../gas/ReportUploadTradeInCore.html'),'utf8'));assert.equal(Core.PARSER_VERSION,'2026.10.01-source-format-3');
});
