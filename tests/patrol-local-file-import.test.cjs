'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('../assets/vendor/xlsx.full.min.js');
const Parser = require('../patrol-local-import.js');

const header = ['填表時間','到店時間','離店時間','區處別','營業點代碼','檢查店點','檢查人員','題號','檢查內容','是否合格','未查／不合格原因'];
const formalStores = [
  { code:'DNB10059', name:'台北通化' },
  { code:'DNB10062', name:'台北酒泉' },
  { code:'DNB10082', name:'台北永吉' },
];

function row(overrides = {}) {
  const values = {
    fillTime:'2026/8/25 09:05:00', arriveTime:'2026/8/25 09:00', leaveTime:'2026/8/25 10:00',
    district:'北一二B', code:'DNB10082', store:'台北永吉', inspector:'測試督導', item:2,
    content:'檢查內容', result:'V', reason:'', ...overrides
  };
  return [values.fillTime,values.arriveTime,values.leaveTime,values.district,values.code,values.store,
    values.inspector,values.item,values.content,values.result,values.reason];
}

function textFile(name, contents) {
  return { name, size:Buffer.byteLength(contents), text:async()=>contents, arrayBuffer:async()=>Buffer.from(contents) };
}

function binaryFile(name, contents) {
  return { name, size:contents.length, arrayBuffer:async()=>contents };
}

function workbookFile(matrix, name = '巡店紀錄_20260825.xlsx', bookType = 'xlsx') {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['封面']]), '說明');
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), '巡店明細');
  const buffer = XLSX.write(workbook, { type:'buffer', bookType, cellDates:true });
  return { name, size:buffer.length, arrayBuffer:async()=>buffer, text:async()=>buffer.toString('binary') };
}

test('正常 XLSX 會選出含完整表頭的工作表並輸出正式欄位', async () => {
  const parsed = await Parser.parseFile(workbookFile([['巡店報表'],[],header,row()]), XLSX);
  assert.equal(parsed.blocked, false);
  assert.equal(parsed.sheetName, '巡店明細');
  assert.equal(parsed.rawRowCount, 1);
  assert.deepEqual(Object.keys(parsed.rows[0]), Parser.OUTPUT_FIELDS);
  assert.equal(parsed.rows[0].month, '2026-08');
});

test('正常 XLS 會以本機 SheetJS 解析', async () => {
  const parsed = await Parser.parseFile(workbookFile([header,row()], '巡店紀錄_20260825.xls', 'xls'), XLSX);
  assert.equal(parsed.blocked, false);
  assert.equal(parsed.sheetName, '巡店明細');
  assert.equal(parsed.rows[0].store, '台北永吉');
});

test('正常 CSV 解析', async () => {
  const csv = [header,row()].map(values => values.map(value => `"${String(value).replaceAll('"','""')}"`).join(',')).join('\n');
  const parsed = await Parser.parseFile(textFile('巡店.csv', csv), XLSX);
  assert.equal(parsed.blocked, false);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].result, 'v');
});

test('正式 Big5 CSV 會先本機解碼再辨識巡店表頭', async () => {
  const contents = Buffer.from('t/6+yai1qbGwT7/9qu0oqfqy06rtKQqz+KrtpOm0waFHMjAyNi8wOC8yNQoKvvexS7Wlr8WhRwq28artrsm2oSyo7Kmxrsm2oSzC96mxrsm2oSywz7NCp08swOe3fsJJpU69WCzAy6xkqbHCSSzAy6xkpEit+yzDRLi5LMDLrGSkuq5lLKxPp1+mWK7mLKW8rGSiQaSjpliu5q3spl0sCjIwMjYtMDgtMjUgMDk6MDUsMjAyNi0wOC0yNSAwOTowMCwyMDI2LTA4LTI1IDEwOjAwLKVfpECkR0IsRE5CMTAwODIspXilX6XDpk4stPq41bf+vsksMizAy6xkpLquZSxWLCw=', 'base64');
  const parsed = await Parser.parseFile(binaryFile('正式巡店.csv', contents), XLSX);
  assert.equal(parsed.blocked, false);
  assert.equal(parsed.encoding, 'Big5');
  assert.equal(parsed.rawRowCount, 1);
  assert.equal(parsed.rows[0].store, '台北永吉');
  assert.equal(parsed.rows[0].result, 'v');
});

test('正常 TSV 解析', async () => {
  const parsed = await Parser.parseFile(textFile('巡店.tsv', [header,row()].map(values => values.join('\t')).join('\n')), XLSX);
  assert.equal(parsed.blocked, false);
  assert.equal(parsed.rows[0].store, '台北永吉');
});

test('表頭前有標題列與空白列', () => {
  const parsed = Parser.parseMatrix([['北一二B 巡店報表'],[],[],header,row()]);
  assert.equal(parsed.blocked, false);
  assert.equal(parsed.headerRow, 3);
});

test('Excel Date cell 可解析', () => {
  const parsed = Parser.parseMatrix([header,row({fillTime:new Date(2026,7,25,9,5,6)})]);
  assert.equal(parsed.blocked, false);
  assert.equal(parsed.rows[0].fillTime, '2026/8/25 09:05:06');
});

test('Excel 日期序號可解析', () => {
  assert.equal(Parser.normalizeDateTime(46259.5), '2026/8/25 12:00');
  const parsed = Parser.parseMatrix([header,row({fillTime:46259.5})]);
  assert.equal(parsed.blocked, false);
  assert.equal(parsed.rows[0].month, '2026-08');
});

test('日期格式含秒與不含秒均可解析', () => {
  assert.equal(Parser.normalizeDateTime('2026/8/25 9:05:06'), '2026/8/25 09:05:06');
  assert.equal(Parser.normalizeDateTime('2026-08-25 09:05'), '2026/8/25 09:05');
});

test('V 與 v 都輸出 result v', () => {
  const parsed = Parser.parseMatrix([header,row({item:1,result:'V'}),row({item:2,result:'v'})]);
  assert.deepEqual(parsed.rows.map(value => value.result), ['v','v']);
});

test('結果欄 NA 輸出 result na', () => {
  const parsed = Parser.parseMatrix([header,row({result:'NA'})]);
  assert.equal(parsed.rows[0].result, 'na');
  assert.equal(parsed.rows[0].reason, 'na');
});

test('原因欄 NA 輸出 result na', () => {
  const parsed = Parser.parseMatrix([header,row({result:'',reason:'NA'})]);
  assert.equal(parsed.rows[0].result, 'na');
  assert.equal(parsed.rows[0].reason, 'na');
});

test('題號小於 1 整批封鎖', () => {
  const parsed = Parser.parseMatrix([header,row({item:0})]);
  assert.equal(parsed.blocked, true);
  assert.match(parsed.errors.join(' '), /題號需為 1 至 33/);
});

test('題號大於 33 整批封鎖', () => {
  const parsed = Parser.parseMatrix([header,row({item:34})]);
  assert.equal(parsed.blocked, true);
});

test('缺少填表時間整批封鎖', () => {
  const parsed = Parser.parseMatrix([header,row({fillTime:''})]);
  assert.equal(parsed.blocked, true);
  assert.equal(parsed.invalidRows.length, 1);
});

test('缺少店點整批封鎖', () => {
  const parsed = Parser.parseMatrix([header,row({store:''})]);
  assert.equal(parsed.blocked, true);
  assert.match(parsed.errors.join(' '), /缺少檢查店點/);
});

test('缺少必要表頭整批封鎖', () => {
  const incomplete = header.filter(value => value !== '填表時間');
  const parsed = Parser.parseMatrix([incomplete,row()]);
  assert.equal(parsed.blocked, true);
  assert.match(parsed.errors[0], /缺少必要表頭.*填表時間/);
});

test('同鍵相同內容只保留一筆', () => {
  const parsed = Parser.parseMatrix([header,row(),row()]);
  const validated = Parser.normalizeRowsToConfiguredStores(parsed.rows, formalStores);
  const deduped = Parser.dedupeRows(validated.rows);
  assert.equal(validated.blocked, false);
  assert.equal(deduped.rows.length, 1);
  assert.equal(deduped.duplicateCount, 1);
});

test('同鍵不同內容封鎖整批', () => {
  const parsed = Parser.parseMatrix([header,row(),row({reason:'不同內容'})]);
  const validated = Parser.normalizeRowsToConfiguredStores(parsed.rows, formalStores);
  const deduped = Parser.dedupeRows(validated.rows);
  assert.equal(validated.blocked, false);
  assert.equal(deduped.conflicts.length, 1);
});

test('營業點代碼與店名矛盾時整批封鎖', () => {
  const parsed = Parser.parseMatrix([header,row({code:'DNB10059',store:'台北酒泉'})]);
  const validated = Parser.normalizeRowsToConfiguredStores(parsed.rows, formalStores);
  assert.equal(validated.blocked, true);
  assert.equal(validated.rows.length, 0);
  assert.match(validated.errors.join(' '), /營業點代碼與店名矛盾/);
});

test('未知營業點代碼或未知店名均整批封鎖', () => {
  const unknownCode = Parser.normalizeRowsToConfiguredStores(
    Parser.parseMatrix([header,row({code:'UNKNOWN',store:'台北永吉'})]).rows,
    formalStores
  );
  const unknownStore = Parser.normalizeRowsToConfiguredStores(
    Parser.parseMatrix([header,row({code:'DNB10082',store:'台北不存在'})]).rows,
    formalStores
  );
  assert.equal(unknownCode.blocked, true);
  assert.match(unknownCode.errors.join(' '), /營業點代碼未知/);
  assert.equal(unknownStore.blocked, true);
  assert.match(unknownStore.errors.join(' '), /檢查店點未知/);
});

test('正式 STORES 驗證後 code 與 store 均正規化', () => {
  const parsed = Parser.parseMatrix([header,row({code:'dnb10059',store:'通化'})]);
  const validated = Parser.normalizeRowsToConfiguredStores(parsed.rows, formalStores);
  assert.equal(validated.blocked, false);
  assert.equal(validated.rows[0].code, 'DNB10059');
  assert.equal(validated.rows[0].store, '台北通化');
});

test('完全空白檔案封鎖', async () => {
  const parsed = await Parser.parseFile(textFile('空白.csv', ''), XLSX);
  assert.equal(parsed.blocked, true);
  assert.match(parsed.errors[0], /缺少必要表頭|沒有巡店/);
});

test('非巡店報表封鎖', () => {
  const parsed = Parser.parseMatrix([['姓名','金額'],['測試',100]]);
  assert.equal(parsed.blocked, true);
  assert.match(parsed.errors[0], /缺少必要表頭/);
});

test('選擇不支援副檔名不會沿用前次資料', async () => {
  await assert.rejects(Parser.parseFile(textFile('錯誤.pdf', 'x'), XLSX), /只支援/);
});
