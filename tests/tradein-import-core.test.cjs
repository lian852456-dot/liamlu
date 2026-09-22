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
