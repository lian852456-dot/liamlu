'use strict';

const STORES = ['酒泉', '永吉', '復興南', '杭州南', '萬大', '通化', '大稻埕', '三創', '六張犁'];
const STORE_ALIASES = new Map([['台北三創', '三創']]);

class ClosingSourceUnavailableError extends Error {
  constructor(message, attempts) {
    super(message);
    this.name = 'ClosingSourceUnavailableError';
    this.attempts = attempts;
  }
}

function normalizeStore(value) {
  const name = String(value || '').trim();
  const alias = STORE_ALIASES.get(name) || name.replace(/^台北/, '');
  return STORES.includes(alias) ? alias : name;
}

function normalizeDate(value) {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  }
  return String(value || '').trim();
}

function normalizeRows(payload, date, seg) {
  if (payload?.status && payload.status !== 'ok') {
    const error = new Error(String(payload.message || '來源回傳錯誤狀態'));
    error.code = String(payload.code || 'SOURCE_ERROR');
    throw error;
  }
  let rows;
  if (Array.isArray(payload)) rows = payload;
  else if (Array.isArray(payload?.rows)) rows = payload.rows;
  else if (Array.isArray(payload?.data)) rows = payload.data;
  else if (Array.isArray(payload?.values)) {
    const [headers, ...values] = payload.values;
    if (!Array.isArray(headers) || !['date', 'store', 'seg'].every(key => headers.includes(key))) {
      throw new TypeError('Sheets values 必須包含 date、store、seg 表頭');
    }
    rows = values.map(values => Object.fromEntries(headers.map((key, i) => [key, values[i] ?? null])));
  } else {
    const data = payload?.data || payload;
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const entries = Object.entries(data);
      if (entries.every(([store, row]) => STORES.includes(normalizeStore(store)) && row && typeof row === 'object' && !Array.isArray(row))) {
        rows = entries.map(([store, row]) => ({ ...row, store: row.store || store }));
      }
    }
  }
  if (!rows) throw new TypeError('來源回傳格式不符合正式回報契約');
  return rows
    .filter(row => normalizeDate(row?.date) === date && String(row?.seg ?? '').trim() === String(seg))
    .map(row => ({ ...row, date: normalizeDate(row.date), store: normalizeStore(row.store) }))
    .filter(row => STORES.includes(row.store));
}

async function retryRead(name, reader, options) {
  const { date, seg, attempts, initialDelayMs, sleep, diagnostics } = options;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const rows = normalizeRows(await reader(date, seg), date, seg);
      diagnostics.push({ source:name, attempt, ok:true, rowCount:rows.length });
      if (rows.length > 0) return rows;
      lastError = new Error('來源可讀但查無當日時段資料');
      diagnostics.push({ source:name, attempt, ok:false, code:'EMPTY_RESULT' });
    } catch (error) {
      lastError = error;
      diagnostics.push({ source:name, attempt, ok:false, code:error.code || error.name, message:error.message });
    }
    if (attempt < attempts) await sleep(initialDelayMs * (2 ** (attempt - 1)));
  }
  throw lastError || new Error(`${name} 讀取失敗`);
}

async function loadRowsWithRecovery({
  date, seg = 21, readPrimary, readFallback,
  attempts = 3, initialDelayMs = 300,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
}) {
  if (typeof readPrimary !== 'function') throw new TypeError('readPrimary 必須是函式');
  const diagnostics = [];
  try {
    const rows = await retryRead('primary', readPrimary, { date, seg, attempts, initialDelayMs, sleep, diagnostics });
    return { rows, source:'primary', diagnostics };
  } catch (primaryError) {
    if (typeof readFallback === 'function') {
      try {
        const rows = await retryRead('fallback', readFallback, { date, seg, attempts, initialDelayMs, sleep, diagnostics });
        return { rows, source:'fallback', diagnostics };
      } catch (_) {
        throw new ClosingSourceUnavailableError('主要與備援來源皆讀取失敗', diagnostics);
      }
    }
    throw new ClosingSourceUnavailableError(primaryError.message, diagnostics);
  }
}

function savedAtSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round((value % 1) * 86400);
  const text = String(value || '').trim();
  const zh = text.match(/^(上午|下午|晚上)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (zh) return (Number(zh[2]) % 12 + (zh[1] !== '上午' ? 12 : 0)) * 3600 + Number(zh[3]) * 60 + Number(zh[4] || 0);
  const clock = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  return clock ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] || 0) : null;
}

function lastRowsByStore(rows) {
  const byStore = new Map();
  for (const row of rows) {
    const store = normalizeStore(row.store);
    const current = byStore.get(store);
    const nextTime = savedAtSeconds(row.savedAt);
    const currentTime = savedAtSeconds(current?.savedAt);
    if (STORES.includes(store) && (!current || nextTime === null || currentTime === null || nextTime >= currentTime)) {
      byStore.set(store, { ...row, store });
    }
  }
  return byStore;
}

function metric(row, key) {
  if (!row || typeof row[key] === 'boolean' || row[key] === null || row[key] === undefined || String(row[key]).trim() === '') return null;
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : null;
}

function management(row) {
  if (!row) return {};
  const source = row.management_focus_json ?? row.managementFocus ?? {};
  if (source && typeof source === 'object' && !Array.isArray(source)) return source;
  try {
    const parsed = JSON.parse(String(source || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function managementMetric(row, key) {
  const value = management(row)[key];
  if (value === null || value === undefined || typeof value === 'boolean' || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fmt(value) {
  if (value === null) return '資料未取得';
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function storeMetric(byStore, store, key) {
  const row = byStore.get(store);
  if (!row) return '未回報';
  return fmt(metric(row, key));
}

function insuranceValue(byStore, store) {
  const row = byStore.get(store);
  if (!row) return '未回報';
  return `${fmt(metric(row, 'insurance_num'))}/${fmt(metric(row, 'insurance_den'))}`;
}

function opValue(byStore, store) {
  const row = byStore.get(store);
  if (!row) return '未回報';
  return [managementMetric(row,'op_online'), managementMetric(row,'op_accum'), managementMetric(row,'op_target')].map(fmt).join('/');
}

function myChargeValue(byStore, store) {
  const row = byStore.get(store);
  if (!row) return '未回報';
  const clicked = managementMetric(row,'mycharge_clicked');
  const tagged = managementMetric(row,'mycharge_tagged');
  let rate = managementMetric(row,'mycharge_pct');
  if (rate === null && clicked !== null && tagged !== null && tagged > 0) rate = Number((clicked / tagged * 100).toFixed(1));
  return `${fmt(clicked)}/${fmt(tagged)}=${rate === null ? '—' : fmt(rate) + '%'}`;
}

function section(title, values) {
  return [title, ...STORES.map(store => `${store}｜${values(store)}`)];
}

function buildClosingMessage({ date, time = '21:45', rows }) {
  const byStore = lastRowsByStore(rows);
  return [
    `北一二B｜${date} ${time} 最終收官`,
    '',
    ...section('⭐ A999', store => storeMetric(byStore, store, 'aq999')),
    '',
    ...section('👑 A1399', store => storeMetric(byStore, store, 'aq1399')),
    '',
    ...section('⚡ 好速', store => storeMetric(byStore, store, 'haosu')),
    '',
    ...section('📶 R999', store => storeMetric(byStore, store, 'rt999')),
    '',
    ...section('🌐 R1399', store => storeMetric(byStore, store, 'rt1399')),
    '',
    ...section('☂️ 保險搭售 分子 / 分母', store => insuranceValue(byStore, store)),
    '',
    '🎯 管理重點',
    'OP 上線 / 累積 / 目標',
    ...STORES.map(store => `${store}｜${opValue(byStore, store)}`),
    '',
    '⚡ MyCharge EBM系統貼標點選',
    '已點選 / 今日貼標數 = 點選率',
    ...STORES.map(store => `${store}｜${myChargeValue(byStore, store)}`),
  ].join('\n');
}

function buildSourceFailureMessage({ date, time = '21:45', error }) {
  const codes = (error?.attempts || []).map(item => `${item.source}#${item.attempt}:${item.code}`).join('、');
  return [
    `北一二B｜${date} ${time} 最終收官`,
    '⚠️ 收官資料來源讀取失敗，本次未產生戰報。',
    codes ? `錯誤紀錄：${codes}` : '錯誤紀錄：SOURCE_UNAVAILABLE',
  ].join('\n');
}

async function runClosing(options) {
  const { date, time = '21:45', send, logger = console } = options;
  if (typeof send !== 'function') throw new TypeError('send 必須是函式');
  let result;
  try {
    result = await loadRowsWithRecovery(options);
  } catch (error) {
    logger.error?.('closing_source_unavailable', { error:error.message, attempts:error.attempts || [] });
    const message = buildSourceFailureMessage({ date, time, error });
    await send(message, { source:'unavailable', diagnostics:error.attempts || [] });
    return { ok:false, message, error };
  }
  const message = buildClosingMessage({ date, time, rows:result.rows });
  await send(message, { source:result.source, diagnostics:result.diagnostics });
  return { ok:true, message, ...result };
}

module.exports = {
  STORES,
  ClosingSourceUnavailableError,
  buildClosingMessage,
  buildSourceFailureMessage,
  loadRowsWithRecovery,
  runClosing,
};
