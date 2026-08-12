const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const prep = require('../half-month-check-write-prep.js');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const gas = fs.readFileSync(path.join(root, 'gas/Code.gs'), 'utf8');

function complete(overrides = {}) {
  return {
    schemaVersion: prep.SCHEMA_VERSION,
    operationId: 'op_20260812_abcdefghijkl',
    mode: 'complete',
    date: '2026-08-12',
    month: '2026-08',
    period: 'H1',
    store: '酒泉',
    inspector: '督導',
    items: Array.from({ length: 18 }, (_, index) => ({ item: index + 1, result: 'ok', note: '', improvement: '' })),
    ...overrides
  };
}

test('contract is strict, canonical and excludes credentials from payload', () => {
  const payload = prep.validateEnvelope(complete());
  assert.equal(payload.items.length, 18);
  assert.equal(prep.canonicalPeriod('2026-08-15'), 'H1');
  assert.equal(prep.canonicalPeriod('2026-08-16'), 'H2');
  assert.throws(() => prep.validateEnvelope({ ...complete(), token: 'must-not-be-in-payload' }), /不接受欄位：token/);
  assert.throws(() => prep.validateEnvelope({ ...complete(), passcode: 'must-not-be-in-payload' }), /不接受欄位：passcode/);
});

test('store, period, item count and duplicate items fail closed', () => {
  assert.throws(() => prep.validateEnvelope(complete({ store: '其他店' })), /allowlist/);
  assert.throws(() => prep.validateEnvelope(complete({ period: 'H2' })), /canonical/);
  assert.throws(() => prep.validateEnvelope(complete({ items: complete().items.slice(0, 17) })), /完整 18 題/);
  const duplicate = complete().items.map(item => ({ ...item }));
  duplicate[17].item = 17;
  assert.throws(() => prep.validateEnvelope(complete({ items: duplicate })), /不可重複/);
});

test('abnormal completion requires original explanation and improvement', () => {
  const missing = complete();
  missing.items[2] = { item: 3, result: 'abnormal', note: '', improvement: '' };
  assert.throws(() => prep.validateEnvelope(missing), /異常說明/);
  const valid = complete();
  valid.items[2] = { item: 3, result: 'abnormal', note: '正式原文', improvement: '正式改善方式' };
  assert.equal(prep.validateEnvelope(valid).items[2].result, 'abnormal');
  const nonAbnormal = complete();
  nonAbnormal.items[2] = { item: 3, result: 'ok', note: '不應保留', improvement: '' };
  assert.throws(() => prep.validateEnvelope(nonAbnormal), /非異常狀態/);
});

test('draft can contain a partial set but remains bounded to formal fields', () => {
  const draft = complete({
    mode: 'draft',
    items: [{ item: 3, result: 'abnormal', note: '', improvement: '' }]
  });
  assert.equal(prep.validateEnvelope(draft).items.length, 1);
  assert.throws(() => prep.validateEnvelope({ ...draft, items: [{ item: 3, result: '', note: '', improvement: '', arbitrary: 'x' }] }), /不接受欄位/);
});

test('existing hwrite row adapter is deterministic and does not accept client timestamps or media writes', () => {
  const payload = complete();
  payload.items[0] = { item: 1, result: 'abnormal', note: '原文', improvement: '改善' };
  const rows = prep.toExistingHwriteRows(payload);
  assert.equal(rows.length, 18);
  assert.deepEqual(rows[0], {
    checkId: '2026-08-12|酒泉|H1', date: '2026-08-12', period: 'H1', month: '2026-08',
    store: '酒泉', inspector: '督導', item: 1, result: 'abnormal', note: '原文', improvement: '改善'
  });
  assert.equal(Object.hasOwn(rows[0], 'savedAt'), false);
  assert.equal(Object.hasOwn(rows[0], 'evidenceNames'), false);
  assert.equal(prep.canonicalIdempotencyMaterial(payload), prep.canonicalIdempotencyMaterial({ ...payload, items: payload.items.slice().reverse() }));
});

test('write readback parity checks period, store, item, status, note and improvement', () => {
  const payload = complete();
  payload.items[2] = { item:3, result:'abnormal', note:'正式原文', improvement:'正式改善' };
  const rows = prep.toExistingHwriteRows(payload);
  assert.equal(prep.verifyReadback(payload, rows).ok, true);
  const mismatch = rows.map(row => ({ ...row }));
  mismatch[2].improvement = '不一致';
  const result = prep.verifyReadback(payload, mismatch);
  assert.equal(result.ok, false);
  assert.deepEqual(result.mismatches[0], { item:3, field:'improvement', expected:'正式改善', actual:'不一致' });
});

test('formal App wires only existing hwrite and keeps media upload disabled', () => {
  assert.match(app, /PREVIEW \/ 尚未寫入正式資料/);
  assert.match(app, /已填 \$\{progress\.completed\} \/ \$\{progress\.total\}/);
  assert.match(app, /const PATROL_WRITE_ACTIONS = new Set\(\['ptvisit_write','hwrite'\]\)/);
  assert.match(app, /async function halfMonthWriteRows\(rows\)/);
  assert.match(app, /const readback=await patrolRead\('hread'\)/);
  assert.doesNotMatch(app, /half_media_upload/);
  assert.match(gas, /function writeHalfCheck\(rows\)/);
});
