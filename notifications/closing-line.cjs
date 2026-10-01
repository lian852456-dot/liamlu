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
    // 正式 GAS readData 回傳 {status:'ok', data:{店點:資料列}}。
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
    .filter((row) => normalizeDate(row?.date) === date && String(row?.seg ?? '').trim() === String(seg))
    .map((row) => ({ ...row, date: normalizeDate(row.date), store: normalizeStore(row.store) }))
    .filter(row => STORES.includes(row.store));
}

async function retryRead(name, reader, options) {
  const { date, seg, attempts, initialDelayMs, sleep, diagnostics } = options;
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const rows = normalizeRows(await reader(date, seg), date, seg);
      diagnostics.push({ source: name, attempt, ok: true, rowCount: rows.length });
      if (rows.length > 0) return rows;
      lastError = new Error('來源可讀但查無當日時段資料');
      diagnostics.push({ source: name, attempt, ok: false, code: 'EMPTY_RESULT' });
    } catch (error) {
      lastError = error;
      diagnostics.push({ source: name, attempt, ok: false, code: error.code || error.name, message: error.message });
    }
    if (attempt < attempts) await sleep(initialDelayMs * (2 ** (attempt - 1)));
  }
  throw lastError || new Error(`${name} 讀取失敗`);
}

async function loadRowsWithRecovery({
  date,
  seg = 21,
  readPrimary,
  readFallback,
  attempts = 3,
  initialDelayMs = 300,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  if (typeof readPrimary !== 'function') throw new TypeError('readPrimary 必須是函式');
  const diagnostics = [];
  try {
    const rows = await retryRead('primary', readPrimary, { date, seg, attempts, initialDelayMs, sleep, diagnostics });
    return { rows, source: 'primary', diagnostics };
  } catch (primaryError) {
    if (typeof readFallback === 'function') {
      try {
        const rows = await retryRead('fallback', readFallback, { date, seg, attempts, initialDelayMs, sleep, diagnostics });
        return { rows, source: 'fallback', diagnostics };
      } catch (fallbackError) {
        throw new ClosingSourceUnavailableError('主要與備援來源皆讀取失敗', diagnostics);
      }
    }
    throw new ClosingSourceUnavailableError(primaryError.message, diagnostics);
  }
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

function savedAtSeconds(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round((value % 1) * 86400);
  const text = String(value || '').trim();
  const zh = text.match(/^(上午|下午)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (zh) return (Number(zh[2]) % 12 + (zh[1] === '下午' ? 12 : 0)) * 3600 + Number(zh[3]) * 60 + Number(zh[4] || 0);
  const clock = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  return clock ? Number(clock[1]) * 3600 + Number(clock[2]) * 60 + Number(clock[3] || 0) : null;
}

function metric(row, key) {
  if (!row || typeof row[key] === 'boolean' || row[key] === null || row[key] === undefined || String(row[key]).trim() === '') return null;
  const value = Number(row[key]);
  return Number.isFinite(value) ? value : null;
}

function displayMetric(value, suffix = '') {
  return value === null ? '資料未取得' : `${value}${suffix}`;
}

function zeroLabel(value) {
  return value === 0 ? ' ⚠️' : '';
}

function joinOrNone(items) {
  return items.length ? items.join('、') : '無';
}

function buildClosingMessage({ date, time = '21:45', rows }) {
  const byStore = lastRowsByStore(rows);
  const missingStores = STORES.filter((store) => !byStore.has(store));
  const completed = STORES.length - missingStores.length;
  const required = ['aq999', 'haosu', 'rt1399', 'rt999', 'insurance_pct'];
  const complete = [...byStore.values()].filter(row => required.every(key => metric(row, key) !== null)).length;
  const line = (store, key, suffix = '') => {
    const value = metric(byStore.get(store), key);
    return `${store}｜${displayMetric(value, suffix)}${zeroLabel(value)}`;
  };
  const a999Zero = STORES.filter((store) => metric(byStore.get(store), 'aq999') === 0);
  const haosuZero = STORES.filter((store) => metric(byStore.get(store), 'haosu') === 0);
  const insuranceLow = STORES.filter((store) => {
    const value = metric(byStore.get(store), 'insurance_pct');
    return value !== null && value < 50;
  });
  const insuranceMissing = STORES.filter((store) => byStore.has(store) && metric(byStore.get(store), 'insurance_pct') === null);

  const out = [
    `北一二B｜${date} ${time} 最終收官`,
    completed === STORES.length ? '✅ 21:00 下班回報 9/9 店已完成' : `21:00 下班回報：${completed}/9 店完成`,
    `已提交：${completed}/9 店`,
    `五項資料完整：${complete}/9 店`,
    `已提交但欄位未完整：${completed - complete} 店`,
    `尚未提交：${joinOrNone(missingStores)}`,
    `尚未完成：${joinOrNone(missingStores)}`,
    '',
    'A999 上線數',
    ...STORES.map((store) => line(store, 'aq999')),
    '',
    '好速（沿用回報點數）',
    ...STORES.map((store) => line(store, 'haosu')),
    '',
    'R1399／R999（筆）',
    ...STORES.map((store) => {
      const row = byStore.get(store);
      const r1399 = metric(row, 'rt1399');
      const r999 = metric(row, 'rt999');
      return `${store}｜${displayMetric(r1399)}${zeroLabel(r1399)}／${displayMetric(r999)}${zeroLabel(r999)}`;
    }),
    '',
    '保險搭售率 <50%',
    ...insuranceLow.map((store) => `${store}｜${metric(byStore.get(store), 'insurance_pct')}% ⚠️`),
    ...insuranceMissing.map((store) => `${store}｜資料未取得`),
    ...(insuranceLow.length || insuranceMissing.length ? [] : ['無']),
    '',
    '今晚注意',
    `A999 掛蛋：${joinOrNone(a999Zero)}`,
    `好速掛蛋：${joinOrNone(haosuZero)}`,
    `保險 <50%：${joinOrNone(insuranceLow)}`,
    `尚未完成回報：${joinOrNone(missingStores)}`,
    '⚠️ 缺值已標示「資料未取得」，未列入掛蛋或低標判斷。',
  ];
  return out.join('\n');
}

function buildSourceFailureMessage({ date, time = '21:45', error }) {
  const codes = (error?.attempts || []).map((item) => `${item.source}#${item.attempt}:${item.code}`).join('、');
  return [
    `北一二B｜${date} ${time} 最終收官`,
    '⚠️ 收官資料來源讀取失敗，已停止本次掛蛋與低標判斷。',
    '本次不會把九店誤列為「資料未取得」，請依重試或人工補發結果為準。',
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
    logger.error?.('closing_source_unavailable', { error: error.message, attempts: error.attempts || [] });
    const message = buildSourceFailureMessage({ date, time, error });
    await send(message, { source: 'unavailable', diagnostics: error.attempts || [] });
    return { ok: false, message, error };
  }
  // 發送失敗交由既有 sender／ledger 處理，不能再發另一則來源故障訊息。
  const message = buildClosingMessage({ date, time, rows: result.rows });
  await send(message, { source: result.source, diagnostics: result.diagnostics });
  return { ok: true, message, ...result };
}

module.exports = {
  STORES,
  ClosingSourceUnavailableError,
  buildClosingMessage,
  buildSourceFailureMessage,
  loadRowsWithRecovery,
  runClosing,
};
