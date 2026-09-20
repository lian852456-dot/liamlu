(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PhoneStockCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const STORE_NAMES = Object.freeze([
    '台北酒泉', '台北永吉', '台北復興南', '台北萬大', '台北通化',
    '台北杭州南', '台北大稻埕', '台北三創', '台北六張犁'
  ]);

  const HEADER_ALIASES = Object.freeze({
    store:['店點','店點名稱','門市','門市名稱','營業點','營業點名稱','營業據點','據點名稱'],
    model:['商品','商品名稱','品名','機型','型號','商品型號','手機型號','產品名稱'],
    salesQuantity:['銷售數','銷售量','銷售台數','銷量','成交台數','實銷','申裝數'],
    stockQuantity:['庫存數','庫存','可售庫存','可用庫存','現有庫存','庫存台數','盤點數','數量','台數'],
    salesDate:['銷售日期','交易日期','成交日期','申裝日期','日期','銷售日'],
    stockDate:['庫存日期','盤點日期','資料日期','日期','盤點日']
  });

  function text(value) { return String(value == null ? '' : value).trim(); }
  function key(value) {
    return text(value).normalize('NFKC').replace(/[\s　_\-－／/()（）【】\[\]：:．.]/g, '').toUpperCase();
  }
  function formatDateUtc(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  }
  function normalizeDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return formatDateUtc(value);
    if (typeof value === 'number' && Number.isFinite(value) && value > 1 && value < 100000) {
      return formatDateUtc(new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000));
    }
    const source = text(value);
    const match = source.match(/(20\d{2})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})/);
    if (!match) return '';
    const year = Number(match[1]); const month = Number(match[2]); const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? formatDateUtc(date) : '';
  }
  function dateFromHeader(value, asOfDate) {
    const full = normalizeDate(value);
    if (full) return full;
    const source = text(value);
    const match = source.match(/^(\d{1,2})\s*[\/-]\s*(\d{1,2})(?:\D|$)/);
    const asOf = normalizeDate(asOfDate);
    if (!match || !asOf) return '';
    const year = Number(asOf.slice(0, 4)); const month = Number(match[1]); const day = Number(match[2]);
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return '';
    const result = formatDateUtc(candidate);
    return result > asOf ? formatDateUtc(new Date(Date.UTC(year - 1, month - 1, day))) : result;
  }
  function addDays(iso, amount) {
    const date = new Date(`${iso}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + amount);
    return formatDateUtc(date);
  }
  function canonicalStore(value) {
    const candidate = key(value);
    if (!candidate) return '';
    for (const store of STORE_NAMES) {
      const full = key(store);
      const short = key(store.replace(/^台北/, ''));
      if (candidate.includes(full) || (short.length > 1 && candidate.includes(short))) return store;
    }
    return '';
  }
  function normalizeModel(value) {
    return text(value).replace(/\s+/g, ' ').replace(/[\u3000]/g, ' ').trim();
  }
  function numberValue(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const source = text(value).replace(/,/g, '').replace(/[^0-9.\-]/g, '');
    if (!source || source === '-' || source === '.') return null;
    const parsed = Number(source);
    return Number.isFinite(parsed) ? parsed : null;
  }
  function headerIndex(headers, aliases) {
    const normalized = headers.map(key);
    const exact = normalized.findIndex(value => aliases.some(alias => value === key(alias)));
    return exact >= 0 ? exact : normalized.findIndex(value => aliases.some(alias => value.includes(key(alias))));
  }
  function detectHeader(matrix, type, asOfDate) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const quantityAliases = type === 'sales' ? HEADER_ALIASES.salesQuantity : HEADER_ALIASES.stockQuantity;
    let best = null;
    for (let rowIndex = 0; rowIndex < Math.min(rows.length, 50); rowIndex += 1) {
      const headers = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
      const store = headerIndex(headers, HEADER_ALIASES.store);
      const model = headerIndex(headers, HEADER_ALIASES.model);
      const quantity = headerIndex(headers, quantityAliases);
      const date = headerIndex(headers, type === 'sales' ? HEADER_ALIASES.salesDate : HEADER_ALIASES.stockDate);
      const dateColumns = type === 'sales' ? headers.map((header, index) => ({ index, date:dateFromHeader(header, asOfDate) })).filter(item => item.date) : [];
      const hasRows = store >= 0 && model >= 0 && (quantity >= 0 || dateColumns.length > 0);
      if (!hasRows) continue;
      const score = 20 + (quantity >= 0 ? 6 : 0) + (date >= 0 ? 5 : 0) + Math.min(dateColumns.length, 5) + Math.max(0, 10 - rowIndex) / 100;
      if (!best || score > best.score) best = { rowIndex, map:{ store, model, quantity, date, dateColumns }, score };
    }
    return best;
  }
  function parseMatrix(matrix, type, asOfDate) {
    const detected = detectHeader(matrix, type, asOfDate);
    if (!detected) return { rows:[], errors:[type === 'sales' ? '找不到銷售檔表頭；至少需要店點、機型，以及「銷售日期＋銷售數」或近三日日期欄。' : '找不到庫存檔表頭；至少需要店點、機型及庫存數。'], warnings:[], meta:null };
    const rows = []; let unknownStores = 0; let invalidNumbers = 0; let missingDates = 0;
    for (let rowIndex = detected.rowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const source = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
      const rawStore = source[detected.map.store];
      const rawModel = source[detected.map.model];
      if (!text(rawStore) && !text(rawModel)) continue;
      const store = canonicalStore(rawStore);
      const model = normalizeModel(rawModel);
      if (!store) { unknownStores += 1; continue; }
      if (!model) continue;
      if (type === 'sales' && detected.map.dateColumns.length && detected.map.date < 0) {
        for (const dateColumn of detected.map.dateColumns) {
          const quantity = numberValue(source[dateColumn.index]);
          if (quantity == null) continue;
          if (quantity < 0) { invalidNumbers += 1; continue; }
          rows.push({ store, model, quantity, date:dateColumn.date });
        }
        continue;
      }
      const quantity = numberValue(source[detected.map.quantity]);
      if (quantity == null || quantity < 0) { invalidNumbers += 1; continue; }
      const date = detected.map.date >= 0 ? normalizeDate(source[detected.map.date]) : '';
      if (type === 'sales' && !date) { missingDates += 1; continue; }
      rows.push({ store, model, quantity, date });
    }
    const warnings = [];
    if (unknownStores) warnings.push(`略過 ${unknownStores} 列非北一二B店點資料。`);
    if (invalidNumbers) warnings.push(`略過 ${invalidNumbers} 列空白、負數或無法辨識的數量。`);
    if (missingDates) warnings.push(`略過 ${missingDates} 列沒有可辨識銷售日期的資料。`);
    if (!rows.length) return { rows:[], errors:['沒有可辨識的北一二B資料列，請確認店點、機型、日期及數量欄位。'], warnings, meta:{ headerRow:detected.rowIndex, map:detected.map } };
    return { rows, errors:[], warnings, meta:{ headerRow:detected.rowIndex, map:detected.map } };
  }
  function chooseBestSheet(sheets, type, asOfDate) {
    let best = null;
    for (const sheet of sheets || []) {
      const parsed = parseMatrix(sheet.rows || [], type, asOfDate);
      if (parsed.errors.length || !parsed.rows.length) continue;
      const score = parsed.rows.length * 100 + (parsed.meta ? 50 - parsed.meta.headerRow : 0);
      if (!best || score > best.score) best = { name:sheet.name, parsed, score };
    }
    return best;
  }
  function rate(sales, stock) {
    const denominator = Number(sales) + Number(stock);
    return denominator > 0 ? Number(sales) / denominator : null;
  }
  function buildReport(salesRows, stockRows, asOfDate) {
    const endDate = normalizeDate(asOfDate);
    if (!endDate) throw new Error('請選擇有效的資料截止日。');
    const startDate = addDays(endDate, -2);
    const sales = (salesRows || []).filter(row => row.date >= startDate && row.date <= endDate);
    const datedStocks = (stockRows || []).filter(row => row.date && row.date <= endDate);
    const stockDate = datedStocks.length ? datedStocks.reduce((latest, row) => row.date > latest ? row.date : latest, datedStocks[0].date) : '';
    const stocks = stockDate ? datedStocks.filter(row => row.date === stockDate) : (stockRows || []).filter(row => !row.date);
    const byStore = new Map(STORE_NAMES.map(store => [store, { store, sales:0, stock:0, models:new Map() }]));
    function add(rows, field) {
      rows.forEach(row => {
        const store = byStore.get(row.store);
        if (!store) return;
        store[field] += row.quantity;
        const model = store.models.get(row.model) || { model:row.model, sales:0, stock:0 };
        model[field] += row.quantity;
        store.models.set(row.model, model);
      });
    }
    add(sales, 'sales'); add(stocks, 'stock');
    const modelMap = new Map();
    byStore.forEach(store => store.models.forEach(model => {
      const total = modelMap.get(model.model) || { model:model.model, sales:0, stock:0 };
      total.sales += model.sales; total.stock += model.stock; modelMap.set(model.model, total);
    }));
    const storeSummary = STORE_NAMES.map(store => {
      const entry = byStore.get(store);
      return { store, sales:entry.sales, stock:entry.stock, rate:rate(entry.sales, entry.stock) };
    });
    const modelSummary = Array.from(modelMap.values()).map(entry => ({ ...entry, rate:rate(entry.sales, entry.stock) })).sort((a, b) => b.sales - a.sales || b.stock - a.stock || a.model.localeCompare(b.model, 'zh-Hant'));
    const totalSales = storeSummary.reduce((sum, row) => sum + row.sales, 0);
    const totalStock = storeSummary.reduce((sum, row) => sum + row.stock, 0);
    return {
      startDate, endDate, stockDate, salesRows:sales.length, stockRows:stocks.length,
      totalSales, totalStock, totalRate:rate(totalSales, totalStock), storeSummary, modelSummary,
      storeModels:Object.fromEntries(STORE_NAMES.map(store => [store, Array.from(byStore.get(store).models.values()).map(row => ({ ...row, rate:rate(row.sales, row.stock) })).sort((a, b) => b.sales - a.sales || b.stock - a.stock || a.model.localeCompare(b.model, 'zh-Hant'))]))
    };
  }

  return Object.freeze({ STORE_NAMES, normalizeDate, dateFromHeader, addDays, canonicalStore, numberValue, detectHeader, parseMatrix, chooseBestSheet, buildReport });
});
