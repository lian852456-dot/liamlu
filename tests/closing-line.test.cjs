'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildClosingMessage,
  loadRowsWithRecovery,
  runClosing,
} = require('../notifications/closing-line.cjs');

const date = '2026-09-27';
const rows = [
  ['杭州南', 1, 1, 2, 0, 60],
  ['通化', 1, 2, 2, 0, 100],
  ['永吉', null, 2, 1, null, null],
  ['復興南', 0, 3, 3, 0, 66.7],
  ['六張犁', 1, 0, 0, 0, 0],
  ['酒泉', null, 1, null, null, 66.7],
  ['大稻埕', null, 6, 3, null, 55.6],
  ['萬大', null, 3, null, null, 66.7],
].map(([store, aq999, rt999, rt1399, haosu, insurance_pct]) => ({
  date, seg: 21, store, aq999, rt999, rt1399, haosu, insurance_pct,
}));

test('9/27 回放保留八店，只列三創尚未回報', () => {
  const message = buildClosingMessage({ date, rows });
  assert.match(message, /21:00 下班回報：8\/9 店完成/);
  assert.match(message, /尚未完成：三創/);
  assert.match(message, /杭州南｜1/);
  assert.match(message, /復興南｜0 ⚠️/);
  assert.doesNotMatch(message, /資料未取得：酒泉、永吉/);
});

test('主要來源失敗後使用備援', async () => {
  const result = await loadRowsWithRecovery({
    date,
    attempts: 2,
    initialDelayMs: 0,
    sleep: async () => {},
    readPrimary: async () => { throw new Error('expired auth'); },
    readFallback: async () => rows,
  });
  assert.equal(result.source, 'fallback');
  assert.equal(result.rows.length, 8);
});

test('兩來源失敗只發系統異常，不把九店列成缺值', async () => {
  let sent;
  const result = await runClosing({
    date,
    attempts: 1,
    sleep: async () => {},
    readPrimary: async () => { throw new Error('primary down'); },
    readFallback: async () => { throw new Error('fallback down'); },
    send: async (message) => { sent = message; },
    logger: { error() {} },
  });
  assert.equal(result.ok, false);
  assert.match(sent, /收官資料來源讀取失敗/);
  assert.match(sent, /已停止本次掛蛋與低標判斷/);
  assert.doesNotMatch(sent, /酒泉｜資料未取得/);
});

test('空白不算掛蛋，0 才算掛蛋', () => {
  const message = buildClosingMessage({ date, rows });
  assert.match(message, /A999 掛蛋：復興南/);
  assert.doesNotMatch(message, /A999 掛蛋：[^\n]*永吉/);
  assert.match(message, /好速掛蛋：復興南、杭州南、通化、六張犁/);
});

test('台北三創映射為三創且同店最後一列覆蓋', () => {
  const message = buildClosingMessage({ date, rows: [
    ...rows,
    { date, seg: 21, store: '台北三創', aq999: 1, rt999: 2, rt1399: 1, haosu: 1, insurance_pct: 50 },
  ] });
  assert.match(message, /✅ 21:00 下班回報 9\/9 店已完成/);
  assert.match(message, /三創｜1/);
});

test('正式 GAS status/data 店點物件直接取得資料，不誤觸備援', async () => {
  let fallbackCalls = 0;
  const result = await loadRowsWithRecovery({
    date, attempts: 1,
    readPrimary: async () => ({ status: 'ok', data: Object.fromEntries(rows.map(row => [row.store, row])) }),
    readFallback: async () => { fallbackCalls++; throw new Error('不應呼叫'); },
  });
  assert.equal(result.source, 'primary');
  assert.equal(result.rows.length, 8);
  assert.equal(fallbackCalls, 0);
});

test('Sheets values 表頭與原始日期序號可用，空白保留 null', async () => {
  const result = await loadRowsWithRecovery({
    date: '2026-10-01', attempts: 1,
    readPrimary: async () => { throw new Error('network timeout'); },
    readFallback: async () => ({ values: [
      ['date', 'store', 'seg', 'aq999', 'haosu', 'rt1399', 'rt999', 'insurance_pct'],
      [46296, '台北酒泉', 21, 0, 2, 3, 4],
      [46295, '永吉', 21, 9, 9, 9, 9, 100],
      [46296, '永吉', 16, 9, 9, 9, 9, 100],
    ] }),
  });
  assert.equal(result.source, 'fallback');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].store, '酒泉');
  assert.equal(result.rows[0].insurance_pct, null);
  const message = buildClosingMessage({ date: '2026-10-01', rows: result.rows });
  assert.match(message, /已提交：1\/9 店/);
  assert.match(message, /五項資料完整：0\/9 店/);
  assert.match(message, /已提交但欄位未完整：1 店/);
  assert.match(message, /A999 掛蛋：酒泉/);
  assert.match(message, /保險 <50%：無/);
});

test('GAS 錯誤狀態不能使用隨附資料，改讀備援', async () => {
  const result = await loadRowsWithRecovery({
    date, attempts: 1,
    readPrimary: async () => ({ status: 'error', message: 'auth failed', data: rows }),
    readFallback: async () => rows,
  });
  assert.equal(result.source, 'fallback');
  assert.equal(result.diagnostics[0].code, 'SOURCE_ERROR');
});

test('只有未知店點不是成功讀取，需轉備援', async () => {
  const result = await loadRowsWithRecovery({
    date, attempts: 1,
    readPrimary: async () => [{ date, seg: 21, store: '測試店' }],
    readFallback: async () => rows,
  });
  assert.equal(result.source, 'fallback');
});

test('重複列依提交時間取最新，較舊列不覆寫', () => {
  const message = buildClosingMessage({ date, rows: [
    { date, seg: 21, store: '六張犁', savedAt: '下午 9:20:00', aq999: 3 },
    { date, seg: 21, store: '台北六張犁', savedAt: '下午 9:10:00', aq999: 1 },
  ] });
  assert.match(message, /六張犁｜3/);
});

test('sender 失敗只呼叫一次，不誤送第二則來源異常', async () => {
  let calls = 0;
  await assert.rejects(runClosing({
    date, attempts: 1, readPrimary: async () => rows,
    send: async () => { calls++; throw new Error('LINE timeout'); },
    logger: { error() {} },
  }), /LINE timeout/);
  assert.equal(calls, 1);
});

test('來源完全失敗重試三次後只發一則來源異常', async () => {
  let primaryCalls = 0;
  let fallbackCalls = 0;
  let sends = 0;
  const result = await runClosing({
    date, attempts: 3, sleep: async () => {},
    readPrimary: async () => { primaryCalls++; return { status: 'ok', data: {} }; },
    readFallback: async () => { fallbackCalls++; throw new Error('Sheets down'); },
    send: async message => { sends++; assert.doesNotMatch(message, /酒泉｜/); },
    logger: { error() {} },
  });
  assert.equal(result.ok, false);
  assert.equal(primaryCalls, 3);
  assert.equal(fallbackCalls, 3);
  assert.equal(sends, 1);
});
