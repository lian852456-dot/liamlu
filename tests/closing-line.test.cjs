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
