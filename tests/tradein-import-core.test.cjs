'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('../assets/vendor/xlsx.full.min.js');
const Core = require('../tradein-import-core.js');

function localFile(name, contents) {
  const buffer = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  return { name, size:buffer.length, arrayBuffer:async () => buffer };
}

test('3C 購物通 CSV 支援 UTF-8 BOM、中文、逗號與空白欄位', async () => {
  const csv = '\ufeff品牌,商品名稱,商品型號,售價,備註\r\nApple,"iPhone, 18 Pro",A18P,39900,\r\nSamsung,Galaxy S26,S26,,待確認\r\n';
  const result = await Core.parseFile(localFile('3c-shopping.csv', csv), XLSX, 'shopping');
  assert.equal(result.fileType, 'CSV（UTF-8）');
  assert.equal(result.recordCount, 2);
  assert.deepEqual(result.fieldNames, ['品牌', '商品名稱', '商品型號', '售價', '備註']);
  assert.deepEqual(result.recognizedFields.map(field => field.key), ['brand', 'product', 'model', 'retailPrice', 'note']);
  assert.deepEqual(result.unknownFields, []);
  assert.equal(result.previewRows[0].values['商品名稱'], 'iPhone, 18 Pro');
  assert.equal(result.previewRows[0].values['備註'], '');
  assert.match(result.warnings.join('\n'), /空白欄位/);
});

test('CSV 可辨識 LF、CRLF 與 CR 三種換行格式', async () => {
  for (const newline of ['\n', '\r\n', '\r']) {
    const csv = ['品牌,機型,回收價,機況', 'Apple,iPhone 18 Pro,22000,A級', 'Google,Pixel 11,,'].join(newline);
    const result = await Core.parseFile(localFile('tradein.csv', csv), XLSX, 'tradein');
    assert.equal(result.recordCount, 2);
    assert.deepEqual(result.recognizedFields.map(field => field.key), ['brand', 'model', 'tradeInPrice', 'condition']);
    assert.equal(result.previewRows[1].values['回收價'], '');
  }
});

test('XLSX 多工作表會選擇具有可辨識欄位與資料的工作表', async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['3C 購物通資料']]), '說明');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['品牌', '商品名稱', '商品型號', '分類', '售價'],
    ['Apple', 'iPad Pro', 'M5', '平板', 32900]
  ]), '商品資料');
  const buffer = XLSX.write(workbook, { type:'buffer', bookType:'xlsx' });
  const result = await Core.parseFile(localFile('shopping.xlsx', buffer), XLSX, 'shopping');
  assert.equal(result.fileType, 'XLSX');
  assert.equal(result.sheetName, '商品資料');
  assert.equal(result.recordCount, 1);
  assert.equal(result.previewRows[0].values['商品名稱'], 'iPad Pro');
});

test('3C 購物通公司欄位可映射成標準化資料並標記空值', () => {
  const result = Core.analyseMatrix([
    ['廠牌', '機型', 'SIM卡類別', '售價', '其他欄位'],
    ['Apple', 'iPhone 18 Pro', '5G', 39900, ''],
    ['Samsung', 'Galaxy S26', '5G', '', '待確認']
  ], 'shopping');
  assert.deepEqual(result.fieldMapping.map(field => [field.sourceName, field.key]), [
    ['廠牌', 'brand'], ['機型', 'model'], ['SIM卡類別', 'category'], ['售價', 'retailPrice'], ['其他欄位', '']
  ]);
  assert.equal(result.standardized.summary.sourceRows, 2);
  assert.equal(result.standardized.summary.normalizedRows, 2);
  assert.equal(result.standardized.summary.success, 2);
  assert.equal(result.standardized.rows[0].brand, 'Apple');
  assert.equal(result.standardized.rows[0].retailPrice, '39900');
  assert.equal(result.standardized.rows[1].status, 'success');
});

test('含「特定機款」的資費欄位仍保留為專案價，不誤判成原始機型', async () => {
  const csv = '廠牌,代碼,機型,單機價,(企客_5G)5力全開1599H(48)_特定機款\nApple,A-001,iPhone 18 Pro,39900,12000\n';
  const result = await Core.parseFile(localFile('company-project-price.csv', csv), XLSX, 'shopping');
  const mapping = result.fieldMapping.find(field => field.sourceName.includes('特定機款'));
  assert.equal(Core.recognizeHeader('(企客_5G)5力全開1599H(48)_特定機款'), null);
  assert.equal(mapping.key, 'projectPrice');
  assert.equal(result.standardized.rows[0].projectPrices['(企客_5G)5力全開1599H(48)_特定機款'], '12000');
});

test('舊換新 A／B／C／S 等級寬表會正規化成 Long Format', () => {
  const result = Core.analyseMatrix([
    ['機型(A等級)', '品名 Item(A等級)', '回收價(A等級)', '機型(B等級)', '品名 Item(B等級)', '回收價(B等級)', '機型(S等級)', '品名 Item(S等級)', '回收價(S等級)'],
    ['iPhone 17 Pro', 'APPLE IPHONE 17 PRO 256G', 24500, 'iPhone 17 Pro', 'APPLE IPHONE 17 PRO 256G', 21800, 'iPhone 17 Pro', 'APPLE IPHONE 17 PRO 256G', 26500],
    ['Pixel 11', 'GOOGLE PIXEL 11', '', 'Pixel 11', 'GOOGLE PIXEL 11', 12000, '', '', '']
  ], 'tradein');
  assert.deepEqual(result.standardized.rows.map(row => [row.sourceRowNumber, row.grade, row.tradeInPrice, row.status]), [
    [2, 'S', '26500', 'success'], [2, 'A', '24500', 'success'], [2, 'B', '21800', 'success'],
    [3, 'A', '', 'failed'], [3, 'B', '12000', 'success']
  ]);
  assert.equal(result.standardized.summary.sourceRows, 2);
  assert.equal(result.standardized.summary.normalizedRows, 5);
  assert.equal(result.standardized.summary.success, 4);
  assert.equal(result.standardized.summary.failed, 1);
  assert.equal(result.standardized.rows[0].product, 'APPLE IPHONE 17 PRO 256G');
  assert.match(result.warnings.join('\n'), /缺少必要值/);
});

test('公司手機專案價多工作表會保留色別、建立無色機款並保留專案價格', async () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['', '', '', '', '', '5G 專案'],
    ['廠牌', '代碼', '機型', '異動', '單機價', '999H'],
    ['APPLE', 'P-001', 'APPLE iPhone 16_128G-(黑)(5G)', '', '29,900', '11,300'],
    ['', 'P-002', 'APPLE iPhone 16_128G-(白)(5G)', '', '29,900', '11,300']
  ]), '手機專案');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['', '', '', '', '', '企客專案'],
    ['廠牌', '代碼', '機型', '備註', '單機價', '599H'],
    ['SAMSUNG', 'S-001', 'Samsung Galaxy S26-(藍)(5G)', '變價', '', '0']
  ]), '企客專案');
  const buffer = XLSX.write(workbook, { type:'buffer', bookType:'xlsx' });
  const result = await Core.parseFile(localFile('company-price.xlsx', buffer), XLSX, 'shopping');
  assert.equal(result.sheetName, '2 個可解析工作表');
  assert.equal(result.recordCount, 3);
  assert.equal(result.standardized.summary.success, 3);
  assert.equal(result.acceptance.uniqueColorlessModels, 2);
  assert.equal(result.standardized.rows[1].brand, 'APPLE');
  assert.equal(result.standardized.rows[0].colorlessModel, 'APPLE iPhone 16_128G(5G)');
  assert.ok(Object.entries(result.standardized.rows[0].projectPrices).some(([key, value]) => key.endsWith('999H') && value === '11,300'));
  assert.equal(result.standardized.rows[0].rawValues['機型'], 'APPLE iPhone 16_128G-(黑)(5G)');
});

test('公司雙回收商版型依回收商與等級展開，略過完全空白的等級組', async () => {
  const rows = [
    ['', '※實際回收價以系統判定為準', '點子行動舊機回收報價', '', '', '', '', '', '', '', '', '', '', 'FutureDial(FDI)舊機回收報價'],
    ['品牌', '機款', '', '', '9/16/26', '', '', '9/16/26', '', '', '9/16/26', '', '', '9/16/26'],
    ['', '', '料號(A等級)', '品名 Item(A等級)', '報價(A等級)', '料號(B等級)', '品名 Item(B等級)', '報價(B等級)', '料號(C等級)', '品名 Item(C等級)', '報價(C等級)', '料號(S等級)', '品名 Item(S等級)', '報價(S等級)', '料號(A等級)', '品名 Item(A等級)', '報價(A等級)', '料號(B等級)', '品名 Item(B等級)', '報價(B等級)', '料號(C等級)', '品名 Item(C等級)', '報價(C等級)'],
    ['', '', '', '', '點子 A 級說明'],
    ['APPLE', '(舊機)APPLE iPhone 16_128G', 'P-A', 'iPhone 16_(點子)_A等', '3300', 'P-B', 'iPhone 16_(點子)_B等', '2640', 'P-C', 'iPhone 16_(點子)_C等', '660', 'F-S', 'iPhone 16_(FDI)_S等', '3000', 'F-A', 'iPhone 16_(FDI)_A等', '2600', 'F-B', 'iPhone 16_(FDI)_B等', '900', 'F-C', 'iPhone 16_(FDI)_C等', '500'],
    ['APPLE', '(舊機)APPLE iPhone 15_128G', '', '', '', '', '', '', '', '', '', 'F2-S', 'iPhone 15_(FDI)_S等', '2000', 'F2-A', 'iPhone 15_(FDI)_A等', '1600', 'F2-B', 'iPhone 15_(FDI)_B等', '800', 'F2-C', 'iPhone 15_(FDI)_C等', '400']
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '0916');
  const buffer = XLSX.write(workbook, { type:'buffer', bookType:'xlsx' });
  const result = await Core.parseFile(localFile('tradein-company.xlsx', buffer), XLSX, 'tradein');
  assert.equal(result.sheetName, '0916');
  assert.equal(result.recordCount, 2);
  assert.equal(result.standardized.summary.normalizedRows, 11);
  assert.equal(result.standardized.summary.success, 11);
  assert.deepEqual(result.acceptance.gradeCounts, { S:2, A:3, B:3, C:3 });
  assert.equal(result.acceptance.skippedEmptyGradeCount, 3);
  assert.equal(result.acceptance.gradeMismatchCount, 0);
  assert.equal(result.acceptance.providerMismatchCount, 0);
  const fdiS = result.standardized.rows.find(row => row.sourceRowNumber === 5 && row.grade === 'S');
  assert.equal(fdiS.vendor, 'FutureDial（FDI）');
  assert.equal(fdiS.sku, 'F-S');
  assert.equal(fdiS.tradeInPrice, '3000');
});

test('兩家回收商純價格矩陣沒有料號或品名欄時，仍可完成回收價驗收', async () => {
  const rows = [
    ['', '', '點子行動舊機回收報價', '', '', 'FutureDial(FDI)舊機回收報價'],
    ['品牌', '機款'],
    ['', '', '報價(A等級)', '報價(B等級)', '報價(C等級)', '報價(S等級)', '報價(A等級)', '報價(B等級)', '報價(C等級)'],
    ['APPLE', 'iPhone 18 Pro', '24000', '21000', '18000', '26000', '23000', '20000', '17000']
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '比較表');
  const buffer = XLSX.write(workbook, { type:'buffer', bookType:'xlsx' });
  const result = await Core.parseFile(localFile('tradein-price-matrix.xlsx', buffer), XLSX, 'tradein');
  const report = Core.buildAcceptanceReport('tradein', result);
  assert.equal(result.standardized.summary.success, 7);
  assert.equal(result.acceptance.missingSkuCount, 0);
  assert.equal(result.acceptance.missingProductCount, 0);
  assert.equal(result.acceptance.absentSkuColumnGroupCount, 7);
  assert.equal(result.acceptance.absentProductColumnGroupCount, 7);
  assert.equal(report.acceptance.passed, true);
  assert.equal(report.tradeIn.missingSku, 0);
  assert.equal(report.tradeIn.absentSkuColumnGroups, 7);
});

test('無法對應標準欄位時會保留原始列並正確計入無法辨識', () => {
  const result = Core.analyseMatrix([
    ['內部代碼', '來源描述'],
    ['X-001', '僅供參考']
  ], 'shopping');
  assert.equal(result.recordCount, 1);
  assert.equal(result.standardized.summary.normalizedRows, 1);
  assert.equal(result.standardized.summary.unrecognized, 1);
  assert.equal(result.standardized.rows[0].status, 'unrecognized');
  assert.match(result.standardized.rows[0].issues.join('、'), /無可對應/);
});

test('沒有可用欄位列的檔案會安全提示而不是建立資料', () => {
  const result = Core.analyseMatrix([['只有標題'], [], ['']], 'shopping');
  assert.equal(result.recordCount, 0);
  assert.match(result.errors[0], /找不到可辨識/);
});

test('3C 去識別化驗收報告保留結構統計與雜湊，不輸出檔名、商品、代碼或精確價格', async () => {
  const csv = '\ufeff廠牌,商品代碼,商品型號,商品名稱,商品別,價格帶,單機價,異動\r\nApple,SECRET-CODE-928,PRIVATE-MODEL-ALPHA,PRIVATE-PRODUCT-NAME,手機,高價,39888,調價\r\n';
  const result = await Core.parseFile(localFile('private-source-name-2026.csv', csv), XLSX, 'shopping');
  const report = Core.buildAcceptanceReport('shopping', result);
  const serialised = JSON.stringify(report);
  assert.equal(report.acceptance.passed, true);
  assert.equal(report.source.file.format, 'CSV（UTF-8）');
  assert.equal(report.source.file.byteSize, Buffer.byteLength(csv));
  assert.match(report.source.file.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(report.fieldRecognition.missingRequiredMappings, []);
  assert.equal(report.fieldRecognition.requiredValueBlankCounts['商品代碼'], 0);
  assert.equal(report.fieldRecognition.optionalValueBlankCounts['價格帶'], 0);
  assert.equal(report.shopping.standardizationSuccess, 1);
  assert.ok(report.fieldRecognition.mapping.some(field => field.key === 'priceBand'));
  assert.doesNotMatch(serialised, /private-source-name-2026|SECRET-CODE-928|PRIVATE-MODEL-ALPHA|PRIVATE-PRODUCT-NAME|39888/);
});

test('舊換新去識別化驗收報告列出合併儲存格與回收商彙總，不輸出逐機型價格', async () => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['', '', '點子行動舊機回收報價'],
    ['品牌', '原始機型'],
    ['', '', '料號(S等級)', '品名 Item(S等級)', '報價(S等級)', '料號(A等級)', '品名 Item(A等級)', '報價(A等級)', '料號(B等級)', '品名 Item(B等級)', '報價(B等級)', '料號(C等級)', '品名 Item(C等級)', '報價(C等級)'],
    ['Apple', 'PRIVATE-TRADEIN-MODEL', 'S-SECRET', 'PRIVATE-PRODUCT-S', '23456', 'A-SECRET', 'PRIVATE-PRODUCT-A', '20000', 'B-SECRET', 'PRIVATE-PRODUCT-B', '16000', 'C-SECRET', 'PRIVATE-PRODUCT-C', '9000']
  ]);
  sheet['!merges'] = [XLSX.utils.decode_range('C1:N1')];
  XLSX.utils.book_append_sheet(workbook, sheet, '回收報價');
  const buffer = XLSX.write(workbook, { type:'buffer', bookType:'xlsx' });
  const result = await Core.parseFile(localFile('private-tradein.xlsx', buffer), XLSX, 'tradein');
  const report = Core.buildAcceptanceReport('tradein', result);
  const serialised = JSON.stringify(report);
  assert.equal(report.acceptance.passed, true);
  assert.equal(report.source.selectedMergedCells.count, 1);
  assert.deepEqual(report.source.selectedMergedCells.ranges, ['C1:N1']);
  assert.deepEqual(report.tradeIn.providers, ['點子行動']);
  assert.deepEqual(report.tradeIn.gradeCounts, { S:1, A:1, B:1, C:1 });
  assert.equal(report.tradeIn.columnStructureFlags.hasDuplicateGradeColumns, false);
  assert.doesNotMatch(serialised, /private-tradein|PRIVATE-TRADEIN-MODEL|S-SECRET|PRIVATE-PRODUCT-S|23456/);
});

test('3C 候選查詢只合併同來源同容量的色別，並且要求選擇完整方案', async () => {
  const csv = [
    '廠牌,代碼,機型,單機價,999H,1599H',
    'Apple,A-128-B,iPhone 18 Pro 128G(黑),39900,12000,9000',
    'Apple,A-128-W,iPhone 18 Pro 128G(白),39900,12000,9000',
    'Apple,A-256-B,iPhone 18 Pro 256G(黑),42900,15000,11000'
  ].join('\n');
  const result = await Core.parseFile(localFile('20260922-candidate-colors.csv', csv), XLSX, 'shopping');
  const candidate = Core.buildShoppingCandidate(result);
  assert.equal(candidate.metadata.acceptanceStatus, 'PASS');
  assert.match(candidate.metadata.version, /^local-candidate-[a-f0-9]{12}$/);
  assert.equal(candidate.rows.length, 2);
  assert.equal(candidate.rows.find(row => row.model.includes('128G')).colorVariantCount, 2);
  assert.equal(Core.filterShoppingCandidate(candidate, { query:'128G' }).length, 1);
  const exactPlan = Core.filterShoppingCandidate(candidate, { query:'128G', plan:'999H' });
  assert.equal(exactPlan.length, 1);
  assert.equal(exactPlan[0].selectedPlanPrice, '12000');
  assert.equal(Core.filterShoppingCandidate(candidate, { query:'128G', plan:'1599H' })[0].selectedPlanPrice, '9000');
  assert.equal(Core.filterShoppingCandidate(candidate, { query:'256G', plan:'999H' })[0].selectedPlanPrice, '15000');
});

test('色別去除後若價格矩陣不同，候選查詢會 fail-closed 排除該組', async () => {
  const csv = [
    '廠牌,代碼,機型,單機價,999H',
    'Apple,A-B,iPhone 18 128G(黑),29900,9000',
    'Apple,A-W,iPhone 18 128G(白),29900,9500'
  ].join('\n');
  const candidate = Core.buildShoppingCandidate(await Core.parseFile(localFile('20260922-candidate-conflict.csv', csv), XLSX, 'shopping'));
  assert.equal(candidate.priceMatrixConflictCount, 1);
  assert.equal(Core.filterShoppingCandidate(candidate, { plan:'999H' }).length, 0);
});

test('全空價格商品會 PARTIAL_READY 排除，剩餘有價資料可候選發布並保留稽核統計', async () => {
  const csv = [
    '廠牌,代碼,機型,單機價,999H',
    'Apple,A-OK,iPhone 18 128G(黑),29900,9000',
    'Apple,A-MISSING,iPhone 18 256G(黑),,'
  ].join('\n');
  const candidate = Core.buildShoppingCandidate(await Core.parseFile(localFile('20260922-candidate-blocked.csv', csv), XLSX, 'shopping'));
  const report = Core.buildAcceptanceReport('shopping', await Core.parseFile(localFile('candidate-blocked-report.csv', csv), XLSX, 'shopping'));
  assert.equal(candidate.metadata.acceptanceStatus, 'PARTIAL_READY');
  assert.equal(candidate.metadata.publication.disabled, false);
  assert.equal(candidate.metadata.publication.status, 'PARTIAL_READY');
  assert.match(candidate.metadata.publication.reason, /無任何價格/);
  assert.equal(candidate.eligibleRowCount, 1);
  assert.equal(Core.filterShoppingCandidate(candidate, { plan:'999H' }).length, 1);
  assert.equal(report.acceptance.status, 'PARTIAL_READY');
  assert.equal(report.acceptance.passed, false);
  assert.equal(report.acceptance.publishEligible, true);
  assert.equal(report.presentation.sourceRows, 2);
  assert.equal(report.presentation.presentedRows, 1);
  assert.equal(report.presentation.excludedNoPriceRows, 1);
  assert.equal(report.presentation.excludedNoPriceBySheet[0].count, 1);
});

test('零元是有效價格，部分價格空白不會被排除', async () => {
  const csv = [
    '廠牌,代碼,機型,單機價,999H,1599H',
    'Apple,A-ZERO,iPhone 18 128G(黑),0,,',
    'Apple,A-PLAN,iPhone 18 256G(黑),,0,'
  ].join('\n');
  const result = await Core.parseFile(localFile('candidate-zero.csv', csv), XLSX, 'shopping');
  const report = Core.buildAcceptanceReport('shopping', result);
  const candidate = Core.buildShoppingCandidate(result);
  assert.equal(result.standardized.summary.success, 2);
  assert.equal(report.acceptance.status, 'PASS');
  assert.equal(report.presentation.excludedNoPriceRows, 0);
  assert.equal(candidate.eligibleRowCount, 2);
  assert.equal(Core.filterShoppingCandidate(candidate, { query:'256G', plan:'999H' })[0].selectedPlanPrice, '0');
});

test('全空價格以外的錯誤仍會 BLOCKED，不能套用部分可發布規則', async () => {
  const csv = [
    '廠牌,代碼,機型,單機價,999H',
    'Apple,A-OK,iPhone 18 128G(黑),29900,9000',
    'Apple,A-MISSING,iPhone 18 256G(黑),,',
    'Apple,A-BAD,iPhone 18 512G(黑),NOT-A-PRICE,10000'
  ].join('\n');
  const result = await Core.parseFile(localFile('20260922-candidate-other-error.csv', csv), XLSX, 'shopping');
  const report = Core.buildAcceptanceReport('shopping', result);
  const candidate = Core.buildShoppingCandidate(result);
  assert.equal(report.acceptance.status, 'BLOCKED');
  assert.equal(report.acceptance.publishEligible, false);
  assert.equal(candidate.metadata.publication.disabled, true);
  assert.match(candidate.metadata.publication.reason, /驗收未通過/);
});

test('舊換新候選比較兩家回收商與 S/A/B/C，缺少等級不補零', async () => {
  const rows = [
    ['', '', '點子行動舊機回收報價', '', '', 'FutureDial(FDI)舊機回收報價'],
    ['品牌', '機款'],
    ['', '', '報價(A等級)', '報價(B等級)', '報價(C等級)', '報價(S等級)', '報價(A等級)', '報價(B等級)', '報價(C等級)'],
    ['APPLE', 'iPhone 18 Pro 256G', '24000', '21000', '18000', '26000', '23000', '20000', '17000']
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), '比較表');
  const candidate = Core.buildTradeInCandidate(await Core.parseFile(localFile('20260916-candidate-tradein.xlsx', XLSX.write(workbook, { type:'buffer', bookType:'xlsx' })), XLSX, 'tradein'));
  assert.equal(candidate.metadata.acceptanceStatus, 'PASS');
  const matched = Core.filterTradeInCandidate(candidate, { query:'256G' });
  assert.equal(matched.length, 1);
  assert.equal(matched[0].quotes['點子行動'].S, null);
  assert.equal(matched[0].quotes['點子行動'].A, '24000');
  assert.equal(matched[0].quotes['FutureDial（FDI）'].S, '26000');
  assert.equal(matched[0].quotes['FutureDial（FDI）'].C, '17000');
});

test('營運中心入口與測試頁都維持本機解析邊界', () => {
  const root = path.resolve(__dirname, '..');
  const home = fs.readFileSync(path.join(root, 'home.html'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'tradein-import-lab.html'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'tradein-import-lab.js'), 'utf8');
  assert.match(home, /href="tradein-import-lab\.html"[\s\S]*3C／舊換新資料匯入測試區/);
  assert.match(page, /assets\/vendor\/xlsx\.full\.min\.js/);
  assert.match(page, /id="shoppingFile"[^>]*type="file"/);
  assert.match(page, /id="tradeinFile"[^>]*type="file"/);
  assert.match(page + '\n' + client, /一鍵複製驗收報告/);
  assert.match(page + '\n' + client, /下載驗收報告 JSON/);
  assert.match(page + '\n' + client, /門市查詢候選預覽/);
  assert.match(page + '\n' + client, /正式發布（驗收未通過）/);
  assert.match(page + '\n' + client, /來源未提供/);
  assert.doesNotMatch(page + '\n' + client, /localStorage|indexedDB|fetch\(|XMLHttpRequest|sendBeacon/);
});

test('3C 與舊換新版本日只採來源檔名，缺失、無效或多日期均不可發布', () => {
  assert.equal(Core.sourceVersionDateFromFileName('20260922手機價格異動清單.xls'), '2026-09-22');
  assert.equal(Core.sourceVersionDateFromFileName('【銷通網】兩家舊機回收價格比較_20260916.xlsx'), '2026-09-16');
  assert.equal(Core.sourceVersionDateFromFileName('價格異動清單.xls'), '');
  assert.equal(Core.sourceVersionDateFromFileName('20261340手機價格.xls'), '');
  assert.equal(Core.sourceVersionDateFromFileName('20260916-to-20260922.xlsx'), '');
});

test('準備私有發布的 3C 快照只包含正規化資料、檔名版本日與檔案雜湊', async () => {
  const csv = ['廠牌,代碼,機型,單機價,999H', 'Apple,A-001,iPhone 18 Pro 128G(黑),39900,12000'].join('\n');
  const result = await Core.parseFile(localFile('20260922手機價格異動清單.csv', csv), XLSX, 'shopping');
  const snapshot = Core.buildPublishSnapshot('shopping', result);
  assert.equal(snapshot.schema_version, 'threec-normalized-snapshot/v1');
  assert.equal(snapshot.source_version_date, '2026-09-22');
  assert.match(snapshot.source_file_sha256, /^[a-f0-9]{64}$/);
  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.row_count, 1);
  assert.equal(snapshot.source_row_count, 1);
  assert.equal(snapshot.excluded_no_price_count, 0);
  assert.equal(snapshot.rows[0].code, 'A-001');
  assert.equal(snapshot.rows[0].model, 'iPhone 18 Pro 128G(黑)');
  assert.equal(snapshot.rows[0].colorless_model, 'iPhone 18 Pro 128G');
  assert.equal(Object.hasOwn(snapshot.rows[0], 'rawValues'), false);
  assert.equal(Object.hasOwn(snapshot.rows[0], 'sourceRowNumber'), false);
});

test('私有發布快照以有價格的標準化列為正式筆數，排除數另列稽核', async () => {
  const csv = [
    '廠牌,代碼,機型,單機價,999H',
    'Apple,A-001,iPhone 18 Pro 128G(黑),39900,12000',
    'Apple,A-002,iPhone 18 Pro 256G(白),0,0',
    'Apple,A-003,iPhone 18 Pro 512G(黑),,'
  ].join('\n');
  const result = await Core.parseFile(localFile('20260922手機價格異動清單.csv', csv), XLSX, 'shopping');
  const snapshot = Core.buildPublishSnapshot('shopping', result);
  assert.equal(snapshot.source_row_count, 3);
  assert.equal(snapshot.row_count, 2);
  assert.equal(snapshot.rows.length, 2);
  assert.equal(snapshot.excluded_no_price_count, 1);
  assert.equal(snapshot.query_model_count, 2);
  assert.equal(snapshot.rows[1].retail_price, '0');
  assert.equal(snapshot.rows[1].project_prices['999H'], '0');
});
