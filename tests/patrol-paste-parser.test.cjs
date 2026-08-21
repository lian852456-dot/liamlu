const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'patrol.html'), 'utf8');
const start = html.indexOf('const PATROL_FILL_TIME_PARSE_ERROR');
const end = html.indexOf('/* ---------- 解析貼上資料 ---------- */', start);
assert.ok(start >= 0 && end > start, 'patrol paste parser source must remain extractable');

const context = { api: null, Date };
vm.runInNewContext(`${html.slice(start, end)}\napi={PATROL_FILL_TIME_PARSE_ERROR,parsePatrolPasteText};`, context);
const { PATROL_FILL_TIME_PARSE_ERROR, parsePatrolPasteText } = context.api;

function row(store, code, item, result = 'v', reason = '') {
  return `2026/8/20 16:43\t2026/8/20 16:00\t2026/8/20 18:00\t北一二B\t${code}\t${store}\t測試督導\t${item}\t檢查內容\t${result}\t${reason}`;
}

test('填表時間為 ######## 時整批拒絕，不回傳任何部分資料', () => {
  const text = [
    row('台北三創', 'DNB10307', 1),
    `########\t2026/8/20 16:00\t2026/8/20 18:00\t北一二B\tDNB10440\t台北六張犁\t測試督導\t1\t檢查內容\tv\t`,
  ].join('\n');
  const parsed = parsePatrolPasteText(text);
  assert.match(parsed.error, /第 2 列/);
  assert.match(parsed.error, /店點「台北六張犁」/);
  assert.match(parsed.error, /欄位「填表時間」/);
  assert.match(parsed.error, /值為「########」/);
  assert.match(parsed.error, new RegExp(PATROL_FILL_TIME_PARSE_ERROR));
  assert.deepEqual(Array.from(parsed.rows), []);
});

test('8/20 的 66 筆資料完整解析，兩店各 33 筆並相容新舊 NA', () => {
  const header = '填表時間\t到店時間\t離店時間\t區處別\t營業點代碼\t檢查店點\t檢查人員\t題號\t檢查內容\t是否合格\t未查／不合格原因';
  const lines = [header];
  for (let item = 1; item <= 33; item++) {
    const sanchuangResult = item <= 2 ? 'na' : 'v';
    const sanchuangReason = item === 2 ? '原始非 NA 原因' : '';
    lines.push(row('台北三創', 'DNB10307', item, sanchuangResult, sanchuangReason));
    lines.push(row('台北六張犁', 'DNB10440', item, item === 1 ? '' : 'v', item === 1 ? 'na' : ''));
  }

  const parsed = parsePatrolPasteText(lines.join('\n'));
  assert.equal(parsed.error, '');
  assert.equal(parsed.rows.length, 66);
  assert.equal(parsed.rows.filter(row => row.store === '台北三創').length, 33);
  assert.equal(parsed.rows.filter(row => row.store === '台北六張犁').length, 33);

  const newNa = parsed.rows.find(row => row.store === '台北三創' && row.item === 1);
  const oldNa = parsed.rows.find(row => row.store === '台北六張犁' && row.item === 1);
  const preserved = parsed.rows.find(row => row.store === '台北三創' && row.item === 2);
  assert.deepEqual({ result: newNa.result, reason: newNa.reason }, { result: 'na', reason: 'na' });
  assert.deepEqual({ result: oldNa.result, reason: oldNa.reason }, { result: 'na', reason: 'na' });
  assert.deepEqual({ result: preserved.result, reason: preserved.reason }, { result: 'na', reason: '原始非 NA 原因' });
});

test('無效題號不再靜默略過，整批回傳明確錯誤', () => {
  const parsed = parsePatrolPasteText([row('台北三創', 'DNB10307', 1), row('台北六張犁', 'DNB10440', 34)].join('\n'));
  assert.match(parsed.error, /第 2 列.*店點「台北六張犁」.*欄位「題號」.*值為「34」.*無法辨識/);
  assert.deepEqual(Array.from(parsed.rows), []);
});
