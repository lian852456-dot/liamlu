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
  return STORE_ALIASES.get(name) || name;
}

function normalizeRows(payload, date, seg) {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.rows)
      ? payload.rows
      : Array.isArray(payload?.data)
        ? payload.data
        : null;
  if (!rows) throw new TypeError('來源回傳格式不是資料列陣列');
  return rows
    .filter((row) => String(row?.date || '') === date && String(row?.seg || '') === String(seg))
    .map((row) => ({ ...row, store: normalizeStore(row.store) }));
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
    if (STORES.includes(store)) byStore.set(store, { ...row, store });
  }
  return byStore;
}

function metric(row, key) {
  if (!row || row[key] === null || row[key] === undefined || String(row[key]).trim() === '') return null;
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
  try {
    const result = await loadRowsWithRecovery(options);
    const message = buildClosingMessage({ date, time, rows: result.rows });
    await send(message, { source: result.source, diagnostics: result.diagnostics });
    return { ok: true, message, ...result };
  } catch (error) {
    logger.error?.('closing_source_unavailable', { error: error.message, attempts: error.attempts || [] });
    const message = buildSourceFailureMessage({ date, time, error });
    await send(message, { source: 'unavailable', diagnostics: error.attempts || [] });
    return { ok: false, message, error };
  }
}

module.exports = {
  STORES,
  ClosingSourceUnavailableError,
  buildClosingMessage,
  buildSourceFailureMessage,
  loadRowsWithRecovery,
  runClosing,
};
