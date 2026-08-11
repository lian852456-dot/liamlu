(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LiamSupervisorHalfMonthWritePrep = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SCHEMA_VERSION = 'liam-half-month-write-prep-v1';
  const TOTAL_ITEMS = 18;
  const STORES = Object.freeze(['通化', '酒泉', '台北三創', '萬大', '六張犁', '復興南', '永吉', '大稻埕', '杭州南']);
  const PERIODS = Object.freeze(['H1', 'H2']);
  const RESULTS = Object.freeze(['ok', 'abnormal', 'na']);
  const MODES = Object.freeze(['draft', 'complete']);
  const TOP_LEVEL_FIELDS = new Set(['schemaVersion', 'operationId', 'mode', 'date', 'month', 'period', 'store', 'inspector', 'items']);
  const ITEM_FIELDS = new Set(['item', 'result', 'note', 'improvement']);

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function assertKnownFields(value, allowlist, label) {
    Object.keys(value || {}).forEach(key => assert(allowlist.has(key), `${label} 不接受欄位：${key}`));
  }

  function cleanText(value, limit, label) {
    const text = String(value == null ? '' : value).trim();
    assert(text.length <= limit, `${label} 超過 ${limit} 字`);
    return text;
  }

  function isIsoDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
    const [year, month, day] = String(value).split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  }

  function canonicalPeriod(date) {
    assert(isIsoDate(date), 'date 必須是有效 YYYY-MM-DD');
    return Number(String(date).slice(-2)) <= 15 ? 'H1' : 'H2';
  }

  function validateItem(raw, mode) {
    assert(raw && typeof raw === 'object' && !Array.isArray(raw), 'item 必須是 object');
    assertKnownFields(raw, ITEM_FIELDS, 'item');
    const item = Number(raw.item);
    assert(Number.isInteger(item) && item >= 1 && item <= TOTAL_ITEMS, 'item 必須是 1–18 的整數');
    const result = String(raw.result || '');
    assert(!result || RESULTS.includes(result), `item ${item} result 非允許值`);
    if (mode === 'complete') assert(result, `item ${item} 尚未填寫`);
    const note = cleanText(raw.note, 1000, `item ${item} 異常說明`);
    const improvement = cleanText(raw.improvement, 1000, `item ${item} 改善方式`);
    if (result === 'abnormal' && mode === 'complete') {
      assert(note, `item ${item} 異常時必須有異常說明`);
      assert(improvement, `item ${item} 異常時必須有改善方式`);
    }
    if (result && result !== 'abnormal') {
      assert(!note && !improvement, `item ${item} 非異常狀態不得帶異常欄位`);
    }
    return { item, result, note, improvement };
  }

  function validateEnvelope(raw) {
    assert(raw && typeof raw === 'object' && !Array.isArray(raw), 'payload 必須是 object');
    assertKnownFields(raw, TOP_LEVEL_FIELDS, 'payload');
    assert(raw.schemaVersion === SCHEMA_VERSION, 'schemaVersion 不符');
    const operationId = cleanText(raw.operationId, 80, 'operationId');
    assert(/^[A-Za-z0-9_-]{16,80}$/.test(operationId), 'operationId 格式不符');
    const mode = String(raw.mode || '');
    assert(MODES.includes(mode), 'mode 只允許 draft / complete');
    const date = String(raw.date || '');
    assert(isIsoDate(date), 'date 必須是有效 YYYY-MM-DD');
    const month = String(raw.month || '');
    assert(month === date.slice(0, 7), 'month 必須與 date 一致');
    const period = String(raw.period || '');
    assert(PERIODS.includes(period) && period === canonicalPeriod(date), 'period 必須與 canonical H1/H2 一致');
    const store = cleanText(raw.store, 40, 'store');
    assert(STORES.includes(store), 'store 不在九店 allowlist');
    const inspector = cleanText(raw.inspector, 80, 'inspector');
    assert(inspector, 'inspector 不可空白');
    assert(Array.isArray(raw.items) && raw.items.length > 0 && raw.items.length <= TOTAL_ITEMS, 'items 必須包含 1–18 題');
    const items = raw.items.map(item => validateItem(item, mode));
    const itemNumbers = items.map(item => item.item);
    assert(new Set(itemNumbers).size === itemNumbers.length, 'items 不可重複');
    if (mode === 'complete') {
      assert(items.length === TOTAL_ITEMS, 'complete 必須包含完整 18 題');
      assert(itemNumbers.slice().sort((a, b) => a - b).every((item, index) => item === index + 1), 'complete 必須包含題 1–18');
    }
    return { schemaVersion: SCHEMA_VERSION, operationId, mode, date, month, period, store, inspector, items };
  }

  function toExistingHwriteRows(raw) {
    const payload = validateEnvelope(raw);
    const checkId = `${payload.date}|${payload.store}|${payload.period}`;
    return payload.items.map(item => ({
      checkId,
      date: payload.date,
      period: payload.period,
      month: payload.month,
      store: payload.store,
      inspector: payload.inspector,
      item: item.item,
      result: item.result,
      note: item.result === 'abnormal' ? item.note : '',
      improvement: item.result === 'abnormal' ? item.improvement : ''
    }));
  }

  function canonicalIdempotencyMaterial(raw) {
    const payload = validateEnvelope(raw);
    return JSON.stringify({
      schemaVersion: payload.schemaVersion,
      operationId: payload.operationId,
      mode: payload.mode,
      date: payload.date,
      month: payload.month,
      period: payload.period,
      store: payload.store,
      inspector: payload.inspector,
      items: payload.items.slice().sort((a, b) => a.item - b.item)
    });
  }

  return Object.freeze({
    SCHEMA_VERSION,
    TOTAL_ITEMS,
    STORES,
    PERIODS,
    RESULTS,
    MODES,
    canonicalPeriod,
    validateEnvelope,
    toExistingHwriteRows,
    canonicalIdempotencyMaterial
  });
});
