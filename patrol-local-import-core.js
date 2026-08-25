(function exposePatrolLocalImport(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PatrolLocalImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildPatrolLocalImport() {
  'use strict';

  const FIELD_ALIASES = Object.freeze({
    fillTime: ['填表時間', '填寫時間', '時間戳記', '填表日期時間'],
    arriveTime: ['到店時間', '抵達時間', '進店時間'],
    leaveTime: ['離店時間', '離開時間', '出店時間'],
    district: ['區處別', '區處', '區域'],
    code: ['營業點代碼', '店點代碼', '門市代碼', '店號'],
    store: ['檢查店點', '店點', '門市', '檢查門市', '營業點'],
    inspector: ['檢查人員', '檢查者', '督導', '填表人員'],
    item: ['題號', '題次', '項次', '題目編號'],
    content: ['檢查內容', '內容', '題目內容'],
    result: ['是否合格', '合格', '結果', '檢查結果'],
    reason: ['未查／不合格原因', '未查/不合格原因', '未查或不合格原因', '原因', '備註']
  });
  const REQUIRED_FIELDS = Object.freeze(['fillTime', 'store', 'item']);
  const DEFAULT_COLUMN_MAP = Object.freeze({
    fillTime:0, arriveTime:1, leaveTime:2, district:3, code:4,
    store:5, inspector:6, item:7, content:8, result:9, reason:10
  });

  function pad(value) { return String(value).padStart(2, '0'); }
  function text(value) { return String(value == null ? '' : value).trim(); }
  function normalizeHeader(value) {
    return text(value)
      .replace(/^\uFEFF/, '')
      .replace(/[\s　]+/g, '')
      .replace(/[：:]/g, '')
      .toLowerCase();
  }

  function aliasIndex(row, aliases) {
    const normalized = (Array.isArray(row) ? row : []).map(normalizeHeader);
    return normalized.findIndex(value => aliases.some(alias => value === normalizeHeader(alias)));
  }

  function detectHeader(matrix, maxRows) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const limit = Math.min(rows.length, Number(maxRows || 30));
    let best = null;
    for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
      const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
      const map = {};
      let hits = 0;
      Object.keys(FIELD_ALIASES).forEach(field => {
        const index = aliasIndex(row, FIELD_ALIASES[field]);
        if (index >= 0) {
          map[field] = index;
          hits += 1;
        }
      });
      const requiredHits = REQUIRED_FIELDS.filter(field => Number.isInteger(map[field])).length;
      const score = requiredHits * 100 + hits;
      if (requiredHits === REQUIRED_FIELDS.length && (!best || score > best.score)) {
        best = { rowIndex, map, hits, requiredHits, score };
      }
    }
    return best;
  }

  function countSeparatorOutsideQuotes(line, separator) {
    let quoted = false;
    let count = 0;
    const value = String(line || '');
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      if (char === '"') {
        if (quoted && value[index + 1] === '"') index += 1;
        else quoted = !quoted;
      } else if (!quoted && char === separator) count += 1;
    }
    return count;
  }

  function mode(values) {
    const counts = new Map();
    (values || []).forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
    let result = null;
    let best = -1;
    counts.forEach((count, value) => {
      if (count > best) {
        result = value;
        best = count;
      }
    });
    return result;
  }

  function detectDelimitedSeparator(source) {
    const lines = String(source || '').split(/\r?\n/).filter(line => line.trim()).slice(0, 8);
    const candidates = ['\t', ',', ';'];
    let best = '\t';
    let bestScore = -1;
    candidates.forEach(separator => {
      const counts = lines.map(line => countSeparatorOutsideQuotes(line, separator));
      const positive = counts.filter(count => count > 0);
      if (!positive.length) return;
      const common = mode(positive);
      const consistency = positive.filter(count => count === common).length;
      const score = consistency * 100 + common;
      if (score > bestScore) {
        best = separator;
        bestScore = score;
      }
    });
    return best;
  }

  function parseDelimitedText(source, separator) {
    const delimiter = separator || detectDelimitedSeparator(source);
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const value = String(source || '');
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      if (quoted) {
        if (char === '"' && value[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else if (char === '"') quoted = false;
        else cell += char;
        continue;
      }
      if (char === '"') {
        quoted = true;
        continue;
      }
      if (char === delimiter) {
        row.push(cell);
        cell = '';
        continue;
      }
      if (char === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
        continue;
      }
      if (char !== '\r') cell += char;
    }
    if (cell !== '' || row.length) {
      row.push(cell);
      rows.push(row);
    }
    return { rows, separator:delimiter };
  }

  function excelSerialParts(serial, date1904) {
    const numeric = Number(serial);
    if (!Number.isFinite(numeric)) return null;
    const epoch = Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30);
    const milliseconds = epoch + Math.round(numeric * 86400000);
    const date = new Date(milliseconds);
    if (Number.isNaN(date.getTime())) return null;
    return {
      year:date.getUTCFullYear(), month:date.getUTCMonth() + 1, day:date.getUTCDate(),
      hour:date.getUTCHours(), minute:date.getUTCMinutes(), second:date.getUTCSeconds()
    };
  }

  function partsToPatrolTime(parts, includeTime) {
    if (!parts) return '';
    const date = `${parts.year}/${Number(parts.month)}/${Number(parts.day)}`;
    if (!includeTime) return date;
    const base = `${date} ${Number(parts.hour)}:${pad(Number(parts.minute))}`;
    return Number(parts.second) ? `${base}:${pad(Number(parts.second))}` : base;
  }

  function normalizeDateTime(value, options) {
    const settings = options || {};
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return partsToPatrolTime({
        year:value.getFullYear(), month:value.getMonth() + 1, day:value.getDate(),
        hour:value.getHours(), minute:value.getMinutes(), second:value.getSeconds()
      }, true);
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const parts = excelSerialParts(value, Boolean(settings.date1904));
      return partsToPatrolTime(parts, Math.abs(value % 1) > 1e-9);
    }
    let raw = text(value);
    if (!raw) return '';
    if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
      const parts = excelSerialParts(Number(raw), Boolean(settings.date1904));
      return partsToPatrolTime(parts, raw.includes('.'));
    }
    raw = raw
      .replace(/[年\.\-]/g, '/')
      .replace(/月/g, '/')
      .replace(/日/g, ' ')
      .replace(/[ＴT]/g, ' ')
      .replace(/[：]/g, ':')
      .replace(/[\s　]+/g, ' ')
      .trim();
    const match = raw.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (!match) return '';
    const parts = {
      year:Number(match[1]), month:Number(match[2]), day:Number(match[3]),
      hour:Number(match[4] || 0), minute:Number(match[5] || 0), second:Number(match[6] || 0)
    };
    const check = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
    if (check.getUTCFullYear() !== parts.year || check.getUTCMonth() + 1 !== parts.month || check.getUTCDate() !== parts.day || parts.hour > 23 || parts.minute > 59 || parts.second > 59) return '';
    return partsToPatrolTime(parts, match[4] != null);
  }

  function canonicalTimestamp(value) {
    const normalized = normalizeDateTime(value);
    if (!normalized) return '';
    const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
    if (!match) return '';
    return `${match[1]}-${pad(Number(match[2]))}-${pad(Number(match[3]))}T${pad(Number(match[4] || 0))}:${pad(Number(match[5] || 0))}:${pad(Number(match[6] || 0))}`;
  }

  function normalizeResult(resultValue, reasonValue) {
    const rawResult = text(resultValue).toLowerCase().replace(/\s+/g, '');
    const rawReason = text(reasonValue);
    const reasonKey = rawReason.toLowerCase().replace(/\s+/g, '');
    const passValues = new Set(['v', '合格', '符合', '是', 'yes', 'y', 'true', '✅', '✓', '✔']);
    const naValues = new Set(['na', 'n/a', '不適用', '免查', '無此項']);
    let result = '';
    if (passValues.has(rawResult)) result = 'v';
    else if (naValues.has(rawResult) || naValues.has(reasonKey)) result = 'na';
    const reason = result === 'na' && (!rawReason || naValues.has(reasonKey)) ? 'na' : rawReason;
    return { result, reason };
  }

  function rowHasContent(row) {
    return (Array.isArray(row) ? row : []).some(value => text(value));
  }

  function isRepeatedHeader(row, map) {
    if (!Array.isArray(row)) return false;
    const fill = normalizeHeader(row[map.fillTime]);
    return FIELD_ALIASES.fillTime.some(alias => fill === normalizeHeader(alias));
  }

  function normalizeMatrix(matrix, options) {
    const settings = options || {};
    const rows = Array.isArray(matrix) ? matrix : [];
    const detected = detectHeader(rows, settings.maxHeaderRows || 30);
    let headerRow = detected ? detected.rowIndex : -1;
    let map = detected ? detected.map : DEFAULT_COLUMN_MAP;
    if (!detected) {
      const firstData = rows.findIndex(row => rowHasContent(row) && normalizeDateTime(row[0], settings));
      if (firstData < 0 || !Array.isArray(rows[firstData]) || rows[firstData].length < 8) {
        return { rows:[], errors:['找不到巡店明細表頭，也無法辨識固定欄位格式。'], warnings:[], meta:{ headerRow:-1, map:null } };
      }
      headerRow = firstData - 1;
    }

    const output = [];
    const errors = [];
    const warnings = [];
    const start = Math.max(0, headerRow + 1);
    for (let index = start; index < rows.length; index += 1) {
      const source = Array.isArray(rows[index]) ? rows[index] : [];
      if (!rowHasContent(source) || isRepeatedHeader(source, map)) continue;
      const fillTime = normalizeDateTime(source[map.fillTime], settings);
      const store = text(source[map.store]);
      const item = Number.parseInt(text(source[map.item]), 10);
      const rowNumber = index + 1;
      if (!fillTime) errors.push(`第 ${rowNumber} 列：填表時間無法辨識`);
      if (!store) errors.push(`第 ${rowNumber} 列：缺少檢查店點`);
      if (!Number.isInteger(item) || item < 1 || item > 33) errors.push(`第 ${rowNumber} 列：題號需為 1 至 33`);
      if (!fillTime || !store || !Number.isInteger(item) || item < 1 || item > 33) {
        if (errors.length >= 30) break;
        continue;
      }
      const dateMatch = fillTime.match(/^(\d{4})\/(\d{1,2})\//);
      const outcome = normalizeResult(source[map.result], source[map.reason]);
      output.push({
        fillTime,
        arriveTime:normalizeDateTime(source[map.arriveTime], settings) || text(source[map.arriveTime]),
        leaveTime:normalizeDateTime(source[map.leaveTime], settings) || text(source[map.leaveTime]),
        district:text(source[map.district]),
        code:text(source[map.code]),
        store,
        inspector:text(source[map.inspector]),
        item,
        content:text(source[map.content]),
        result:outcome.result,
        reason:outcome.reason,
        month:`${dateMatch[1]}-${pad(Number(dateMatch[2]))}`,
        sourceRow:rowNumber
      });
    }
    if (errors.length) return { rows:[], errors, warnings, meta:{ headerRow, map, detected:Boolean(detected) } };
    if (!output.length) return { rows:[], errors:['檔案內沒有可匯入的巡店明細。'], warnings, meta:{ headerRow, map, detected:Boolean(detected) } };
    return { rows:output, errors:[], warnings, meta:{ headerRow, map, detected:Boolean(detected) } };
  }

  function scoreMatrix(matrix) {
    const detected = detectHeader(matrix, 30);
    if (!detected) return { score:0, detected:null, nonEmpty:0 };
    const nonEmpty = (Array.isArray(matrix) ? matrix : []).filter(rowHasContent).length;
    return { score:detected.score * 100000 + nonEmpty, detected, nonEmpty };
  }

  function chooseBestSheet(sheets) {
    const source = Array.isArray(sheets) ? sheets : [];
    let best = null;
    source.forEach(sheet => {
      const matrix = sheet && Array.isArray(sheet.rows) ? sheet.rows : [];
      const scored = scoreMatrix(matrix);
      if (!best || scored.score > best.score) best = { name:text(sheet && sheet.name) || '工作表', rows:matrix, ...scored, date1904:Boolean(sheet && sheet.date1904) };
    });
    return best && best.score > 0 ? best : (source[0] ? { name:text(source[0].name) || '工作表', rows:source[0].rows || [], score:0, detected:null, nonEmpty:0, date1904:Boolean(source[0].date1904) } : null);
  }

  function storeToken(value) {
    return text(value)
      .toLowerCase()
      .replace(/台灣大哥大/g, '')
      .replace(/myfone/g, '')
      .replace(/直營服務中心|直營門市|服務中心|門市/g, '')
      .replace(/[\s　\-－_（）()]/g, '');
  }

  function storeVariants(value) {
    const base = storeToken(value);
    const variants = new Set([base]);
    if (base.startsWith('台北')) variants.add(base.slice(2));
    return [...variants].filter(Boolean);
  }

  function nameMatches(left, right) {
    const a = storeVariants(left);
    const b = storeVariants(right);
    return a.some(x => b.some(y => x === y || (Math.min(x.length, y.length) >= 2 && (x.endsWith(y) || y.endsWith(x)))));
  }

  function mapConfiguredStores(rows, configuredStores) {
    const stores = (Array.isArray(configuredStores) ? configuredStores : []).map(store => ({
      name:text(store && (store.name || store.store)), code:text(store && store.code)
    })).filter(store => store.name);
    if (!stores.length) return { rows:[], errors:['巡店服務未回傳店點清單，已封鎖匯入。'], remapped:0 };
    const errors = [];
    let remapped = 0;
    const mapped = (Array.isArray(rows) ? rows : []).map(row => {
      const codeMatches = row.code ? stores.filter(store => store.code && store.code === text(row.code)) : [];
      const nameMatchesList = stores.filter(store => nameMatches(row.store, store.name));
      if (codeMatches.length > 1 || nameMatchesList.length > 1) {
        errors.push(`第 ${row.sourceRow || '?'} 列：店點「${row.store}」對應不唯一`);
        return null;
      }
      if (codeMatches.length === 1 && nameMatchesList.length === 1 && codeMatches[0].name !== nameMatchesList[0].name) {
        errors.push(`第 ${row.sourceRow || '?'} 列：店點代碼 ${row.code} 與店名「${row.store}」互相衝突`);
        return null;
      }
      const matched = codeMatches[0] || nameMatchesList[0];
      if (!matched) {
        errors.push(`第 ${row.sourceRow || '?'} 列：無法對應店點「${row.store}」${row.code ? `（${row.code}）` : ''}`);
        return null;
      }
      if (row.store !== matched.name || (matched.code && row.code !== matched.code)) remapped += 1;
      return { ...row, store:matched.name, code:matched.code || row.code };
    }).filter(Boolean);
    return errors.length ? { rows:[], errors:errors.slice(0, 30), remapped } : { rows:mapped, errors:[], remapped };
  }

  function rowKey(row) {
    return [canonicalTimestamp(row && row.fillTime), storeToken(row && row.store), Number(row && row.item)].join('|');
  }

  function comparableText(value) { return text(value).replace(/[\s　]+/g, ' '); }
  function outcome(row) {
    const normalized = normalizeResult(row && row.result, row && row.reason);
    return { result:normalized.result, reason:comparableText(normalized.reason) };
  }
  function sameOutcome(left, right) {
    const a = outcome(left);
    const b = outcome(right);
    return a.result === b.result && a.reason === b.reason;
  }

  function sameMaterialRow(left, right) {
    if (!sameOutcome(left, right)) return false;
    const fields = ['arriveTime', 'leaveTime', 'district', 'code', 'store', 'inspector'];
    return fields.every(field => comparableText(left && left[field]) === comparableText(right && right[field]));
  }

  function dedupeRows(rows) {
    const unique = new Map();
    const conflicts = [];
    let duplicateCount = 0;
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const key = rowKey(row);
      if (!key.split('|')[0]) {
        conflicts.push({ key, row, reason:'時間鍵值無法建立' });
        return;
      }
      if (!unique.has(key)) {
        unique.set(key, row);
        return;
      }
      const existing = unique.get(key);
      if (!sameMaterialRow(existing, row)) conflicts.push({ key, row, existing, reason:'檔案內相同巡店鍵值的內容不同' });
      else duplicateCount += 1;
    });
    return { rows:[...unique.values()], duplicateCount, conflicts };
  }

  function groupRows(rows) {
    const groups = new Map();
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const key = `${text(row.month)}|${text(row.store)}`;
      if (!groups.has(key)) groups.set(key, { key, month:text(row.month), store:text(row.store), rows:[] });
      groups.get(key).rows.push(row);
    });
    return [...groups.values()];
  }

  function classifyAgainstServer(importRows, serverRows) {
    const serverIndex = new Map();
    (Array.isArray(serverRows) ? serverRows : []).forEach(row => {
      const key = rowKey(row);
      if (!serverIndex.has(key)) serverIndex.set(key, []);
      serverIndex.get(key).push(row);
    });
    const additions = [];
    const updates = [];
    const existing = [];
    const conflicts = [];
    (Array.isArray(importRows) ? importRows : []).forEach(row => {
      const key = rowKey(row);
      const matches = serverIndex.get(key) || [];
      if (!matches.length) {
        additions.push(row);
        return;
      }
      if (matches.length > 1) {
        conflicts.push({ key, row, serverRows:matches, reason:'雲端已有多筆相同巡店鍵值，無法安全判定更新目標' });
        return;
      }
      const server = matches[0];
      if (sameOutcome(row, server)) {
        existing.push({ row, server });
        return;
      }
      updates.push({
        row:{ ...row, fillTime:text(server.fillTime) || row.fillTime, store:text(server.store) || row.store, code:text(server.code) || row.code },
        before:server,
        after:row
      });
    });
    return { additions, updates, existing, conflicts, writeRows:[...additions, ...updates.map(item => item.row)] };
  }

  function verifyReadback(expectedRows, serverRows) {
    const index = new Map();
    (Array.isArray(serverRows) ? serverRows : []).forEach(row => {
      const key = rowKey(row);
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(row);
    });
    const missing = [];
    const mismatched = [];
    (Array.isArray(expectedRows) ? expectedRows : []).forEach(row => {
      const key = rowKey(row);
      const matches = index.get(key) || [];
      if (!matches.length) missing.push(row);
      else if (!matches.some(server => sameOutcome(row, server))) mismatched.push({ expected:row, actual:matches });
    });
    return { ok:missing.length === 0 && mismatched.length === 0, missing, mismatched };
  }

  return Object.freeze({
    FIELD_ALIASES, DEFAULT_COLUMN_MAP,
    normalizeHeader, detectHeader, detectDelimitedSeparator, parseDelimitedText,
    excelSerialParts, normalizeDateTime, canonicalTimestamp, normalizeResult,
    normalizeMatrix, chooseBestSheet, storeToken, storeVariants, nameMatches,
    mapConfiguredStores, rowKey, sameOutcome, dedupeRows, groupRows,
    classifyAgainstServer, verifyReadback
  });
});
