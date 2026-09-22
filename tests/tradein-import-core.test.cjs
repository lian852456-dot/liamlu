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
  assert.deepEqual(result.recognizedFields.map(field => field.key), ['brand', 'product', 'model', 'retailPrice']);
  assert.deepEqual(result.unknownFields, ['備註']);
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

test('無法對應標準欄位時會保留原始列並正確計入無法辨識', () => {
  const result = Core.analyseMatrix([
    ['內部代碼', '說明文字'],
    ['X-001', '僅供備註']
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

test('營運中心入口與測試頁都維持本機解析邊界', () => {
  const root = path.resolve(__dirname, '..');
  const home = fs.readFileSync(path.join(root, 'home.html'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'tradein-import-lab.html'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'tradein-import-lab.js'), 'utf8');
  assert.match(home, /href="tradein-import-lab\.html"[\s\S]*3C／舊換新資料匯入測試區/);
  assert.match(page, /assets\/vendor\/xlsx\.full\.min\.js/);
  assert.match(page, /id="shoppingFile"[^>]*type="file"/);
  assert.match(page, /id="tradeinFile"[^>]*type="file"/);
  assert.doesNotMatch(page + '\n' + client, /localStorage|indexedDB|fetch\(|XMLHttpRequest|sendBeacon/);
});
