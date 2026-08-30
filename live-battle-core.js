(function exposeLiveBattleCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LiamLiveBattleCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildLiveBattleCore() {
  'use strict';

  const STORE_NAMES = Object.freeze(['通化', '酒泉', '台北三創', '萬大', '六張犁', '復興南', '永吉', '大稻埕', '杭州南']);
  const AQ_KEY = 'TTL AQ上線點數';
  const RT_KEY = 'RT上線點數';
  const STORE_HEADERS = ['營業點代碼', '服務中心代碼', '門市代碼', '店點代碼', '店代碼', '營業點', '服務中心', '銷售門市', '門市', '店點', '店號'];
  const POINT_HEADERS = ['上線點數', '計件點數', '銷售點數', '實際點數', '貢獻點數', '點數', '件數', '數量'];
  const ID_HEADERS = ['受理編號', '申請書編號', '交易序號', '訂單編號', '案件編號', '用戶編號', '門號'];

  function text(value) { return String(value == null ? '' : value).trim(); }
  function normalizeToken(value) {
    return text(value)
      .replace(/^\uFEFF/, '')
      .replace(/[\s　_／/()（）【】\[\]：:・·.-]+/g, '')
      .toUpperCase();
  }

  function normalizeStore(value) {
    const cleaned = normalizeToken(value)
      .replace(/台灣大哥大數位生活/g, '')
      .replace(/台灣大哥大/g, '')
      .replace(/服務中心|門市/g, '')
      .replace(/^台北/, '');
    return cleaned === '三創' ? '台北三創' : STORE_NAMES.find(name => normalizeToken(name).replace(/^台北/, '') === cleaned) || '';
  }

  function buildStoreLookup(stores) {
    const lookup = new Map();
    (Array.isArray(stores) && stores.length ? stores : STORE_NAMES.map(name => ({ name }))).forEach(store => {
      const name = normalizeStore(store && store.name) || text(store && store.name);
      if (!STORE_NAMES.includes(name)) return;
      const aliases = [name, normalizeToken(name), normalizeToken(name).replace(/^台北/, ''), store && store.code];
      aliases.filter(Boolean).forEach(alias => lookup.set(normalizeToken(alias), name));
    });
    STORE_NAMES.forEach(name => {
      lookup.set(normalizeToken(name), name);
      lookup.set(normalizeToken(name).replace(/^台北/, ''), name);
    });
    return lookup;
  }

  function storeFromCell(value, lookup) {
    const token = normalizeToken(value);
    if (!token) return '';
    if (lookup.has(token)) return lookup.get(token);
    for (const [alias, name] of lookup.entries()) {
      if (alias.length >= 2 && token.includes(alias)) return name;
    }
    return normalizeStore(value);
  }

  function headerMatch(value, aliases) {
    const token = normalizeToken(value);
    if (!token) return false;
    return aliases.some(alias => token === normalizeToken(alias) || token.includes(normalizeToken(alias)));
  }

  function findColumn(row, aliases) {
    return (Array.isArray(row) ? row : []).findIndex(value => headerMatch(value, aliases));
  }

  function detectHeader(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    let best = { rowIndex: -1, storeCol: -1, pointsCol: -1, idCol: -1, score: -1 };
    rows.slice(0, 40).forEach((row, rowIndex) => {
      const storeCol = findColumn(row, STORE_HEADERS);
      const pointsCol = findColumn(row, POINT_HEADERS);
      const idCol = findColumn(row, ID_HEADERS);
      const score = (storeCol >= 0 ? 100 : 0) + (pointsCol >= 0 ? 10 : 0) + (idCol >= 0 ? 2 : 0);
      if (score > best.score) best = { rowIndex, storeCol, pointsCol, idCol, score };
    });
    return best.storeCol >= 0 ? best : { rowIndex: -1, storeCol: -1, pointsCol: -1, idCol: -1, score: 0 };
  }

  function inspectMatrix(matrix) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const genericHeaders = ['門市', '店點', '營業點', '區域', '督導區', '服務中心', '案件', '受理', '門號', '員工', '承辦', '資費', '合約', '商品', '機款', '方案'];
    const safeEnumHeaders = [
      { label: '合約／促案代碼', aliases: ['合約代碼', '促案代碼', '優惠代碼', '服務代碼', '產品代碼'] },
      { label: '資費／方案', aliases: ['資費', '資費別', '月租', '月租費', '方案', '方案名稱', '資費方案'] },
      { label: '商品／機款', aliases: ['商品名稱', '商品機型', '機款', '手機型號', '產品名稱', '上線商品'] },
      { label: '企客標示', aliases: ['企客', '企客案', '企客標示', '客戶類型', '客群'] }
    ];
    let candidate = { rowIndex: -1, headers: [], score: -1 };
    rows.slice(0, 40).forEach((row, rowIndex) => {
      if (!Array.isArray(row)) return;
      const headers = row.map(text).filter(Boolean).slice(0, 40);
      const matches = headers.reduce((sum, value) => sum + (genericHeaders.some(alias => normalizeToken(value).includes(normalizeToken(alias))) ? 1 : 0), 0);
      const score = matches * 100 + headers.length;
      if (matches > 0 && score > candidate.score) candidate = { rowIndex, headers, score };
    });
    const safeValues = [];
    if (candidate.rowIndex >= 0) {
      const headerRow = rows[candidate.rowIndex] || [];
      safeEnumHeaders.forEach(group => {
        const column = headerRow.findIndex(value => group.aliases.some(alias => normalizeToken(value) === normalizeToken(alias)));
        if (column < 0) return;
        const values = [];
        const seen = new Set();
        rows.slice(candidate.rowIndex + 1).forEach(row => {
          const value = text(Array.isArray(row) ? row[column] : '');
          if (!value || value.length > 80 || seen.has(value) || values.length >= 80) return;
          seen.add(value); values.push(value);
        });
        safeValues.push({ label: group.label, header: text(headerRow[column]), values });
      });
    }
    return {
      rowCount: rows.filter(row => Array.isArray(row) && row.some(value => text(value))).length,
      columnCount: rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0),
      headerRow: candidate.rowIndex,
      headers: candidate.headers,
      safeValues
    };
  }

  function numberOrNull(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    let raw = text(value).replace(/,/g, '').replace(/[點件台]/g, '');
    if (!raw) return null;
    let negative = false;
    if (/^\(.*\)$/.test(raw)) { negative = true; raw = raw.slice(1, -1); }
    const match = raw.match(/^-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? (negative ? -Math.abs(parsed) : parsed) : null;
  }

  function separatorFor(source, fileName) {
    if (/\.tsv$/i.test(String(fileName || ''))) return '\t';
    const lines = String(source || '').split(/\r?\n/).filter(line => line.trim()).slice(0, 8);
    const candidates = ['\t', ',', ';'];
    return candidates.map(separator => ({ separator, score: lines.reduce((sum, line) => sum + line.split(separator).length - 1, 0) }))
      .sort((a, b) => b.score - a.score)[0].separator;
  }

  function parseDelimited(source, separator) {
    const rows = [];
    let row = [], cell = '', quoted = false;
    const value = String(source || '');
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      if (quoted) {
        if (char === '"' && value[index + 1] === '"') { cell += '"'; index += 1; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === separator) { row.push(cell); cell = ''; }
      else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (char !== '\r') cell += char;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function decodeCsv(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (_) { return new TextDecoder('big5').decode(bytes); }
  }

  function kindEvidence(matrix) {
    const sample = (Array.isArray(matrix) ? matrix : []).slice(0, 15).flat().map(normalizeToken).join('|');
    return {
      aq: (sample.match(/AQ|新申裝|新申請|新辦/g) || []).length,
      rt: (sample.match(/RT|續約|換約/g) || []).length
    };
  }

  function validateKind(kind, matrix, fileName) {
    const expected = String(kind || '').toLowerCase();
    if (!['aq', 'rt'].includes(expected)) throw new Error('檔案類型必須是 AQ 或 RT。');
    const name = normalizeToken(fileName);
    if (expected === 'aq' && /RT/.test(name) && !/AQ/.test(name)) throw new Error('AQ 欄位選到疑似 RT 檔案，請重新選擇。');
    if (expected === 'rt' && /AQ/.test(name) && !/RT/.test(name)) throw new Error('RT 欄位選到疑似 AQ 檔案，請重新選擇。');
    const evidence = kindEvidence(matrix);
    if (expected === 'aq' && evidence.rt >= 2 && evidence.aq === 0) throw new Error('AQ 欄位內容疑似為 RT／續約資料，已停止解析。');
    if (expected === 'rt' && evidence.aq >= 2 && evidence.rt === 0) throw new Error('RT 欄位內容疑似為 AQ／新申裝資料，已停止解析。');
  }

  function parseMatrix(matrix, options) {
    const settings = options || {};
    const rows = Array.isArray(matrix) ? matrix : [];
    if (!rows.length) throw new Error('檔案沒有可讀取的資料。');
    validateKind(settings.kind, rows, settings.fileName);
    const lookup = buildStoreLookup(settings.stores);
    const header = detectHeader(rows);
    const totals = Object.fromEntries(STORE_NAMES.map(name => [name, 0]));
    const seen = new Set();
    let processedRows = 0;
    let duplicateRows = 0;
    let ignoredRows = 0;
    const start = header.rowIndex >= 0 ? header.rowIndex + 1 : 0;

    rows.slice(start).forEach((row, offset) => {
      if (!Array.isArray(row) || !row.some(value => text(value))) return;
      let store = header.storeCol >= 0 ? storeFromCell(row[header.storeCol], lookup) : '';
      if (!store) {
        for (const cell of row) {
          store = storeFromCell(cell, lookup);
          if (store) break;
        }
      }
      if (!store) { ignoredRows += 1; return; }
      const id = header.idCol >= 0 ? normalizeToken(row[header.idCol]) : '';
      const uniqueKey = id ? `${store}|${id}` : '';
      if (uniqueKey && seen.has(uniqueKey)) { duplicateRows += 1; return; }
      if (uniqueKey) seen.add(uniqueKey);
      const parsedPoints = header.pointsCol >= 0 ? numberOrNull(row[header.pointsCol]) : null;
      const points = parsedPoints == null ? 1 : parsedPoints;
      totals[store] += points;
      processedRows += 1;
    });

    const recognizedStores = STORE_NAMES.filter(name => totals[name] !== 0);
    if (!processedRows) throw new Error('找不到北一二B九店資料；請確認這是正確的 AQ／RT 原始檔。');
    return {
      kind: String(settings.kind).toLowerCase(),
      totals,
      meta: {
        fileName: text(settings.fileName), headerRow: header.rowIndex,
        mode: header.pointsCol >= 0 ? 'points' : 'rows', processedRows, duplicateRows, ignoredRows,
        recognizedStores, missingStores: STORE_NAMES.filter(name => !recognizedStores.includes(name))
      }
    };
  }

  function metricNumber(metric, keys) {
    if (!metric || typeof metric !== 'object') return null;
    for (const key of keys) {
      const value = numberOrNull(metric[key]);
      if (value != null) return value;
    }
    return null;
  }

  function extractTargets(kpiData) {
    const sourceStores = kpiData && Array.isArray(kpiData.stores) ? kpiData.stores : [];
    const stores = sourceStores.map(store => {
      const name = normalizeStore(store && store.name);
      const items = store && store.items || {};
      const aq = items[AQ_KEY];
      const rt = items[RT_KEY];
      return {
        name, code: text(store && store.code),
        aqTarget: metricNumber(aq, ['t', 'target', 'targetValue']),
        rtTarget: metricNumber(rt, ['t', 'target', 'targetValue']),
        aqOfficialActual: metricNumber(aq, ['a', 'actual', 'actualValue']),
        rtOfficialActual: metricNumber(rt, ['a', 'actual', 'actualValue'])
      };
    }).filter(store => STORE_NAMES.includes(store.name));
    if (stores.length !== STORE_NAMES.length) throw new Error(`正式 KPI 目標只讀到 ${stores.length}/9 店，已停止計算達成率。`);
    if (stores.some(store => !(store.aqTarget > 0) || !(store.rtTarget > 0))) throw new Error('正式 KPI 缺少部分 AQ／RT 目標，已停止計算達成率。');
    return {
      stores,
      meta: {
        sourceFile: text(kpiData && kpiData.meta && kpiData.meta.sourceFile),
        month: text(kpiData && kpiData.meta && kpiData.meta.month),
        snapshotDay: numberOrNull(kpiData && kpiData.meta && kpiData.meta.snapshotDay),
        updatedAt: text(kpiData && kpiData.meta && (kpiData.meta.updatedAt || kpiData.meta.publishedAt))
      }
    };
  }

  function dynamicContext(meta, todayIso) {
    const month = text(meta && meta.month);
    const snapshotDay = numberOrNull(meta && meta.snapshotDay);
    const todayMatch = text(todayIso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const monthMatch = month.match(/^(\d{4})-(\d{2})$/);
    if (!todayMatch || !monthMatch || !(snapshotDay >= 1)) return { available: false, reason: '正式目標缺少可比對的截止日期。' };
    const todayUtc = new Date(Date.UTC(Number(todayMatch[1]), Number(todayMatch[2]) - 1, Number(todayMatch[3])));
    todayUtc.setUTCDate(todayUtc.getUTCDate() - 1);
    const expectedCutoff = `${todayUtc.getUTCFullYear()}-${String(todayUtc.getUTCMonth() + 1).padStart(2, '0')}-${String(todayUtc.getUTCDate()).padStart(2, '0')}`;
    const cutoff = `${month}-${String(snapshotDay).padStart(2, '0')}`;
    if (cutoff !== expectedCutoff) return { available: false, reason: `正式 KPI 截止 ${cutoff}，不是昨日 ${expectedCutoff}，已停止計算今日目標。`, cutoff, expectedCutoff };
    const daysInMonth = new Date(Date.UTC(Number(monthMatch[1]), Number(monthMatch[2]), 0)).getUTCDate();
    const remainingDays = daysInMonth - Number(snapshotDay);
    if (!(remainingDays > 0)) return { available: false, reason: '正式 KPI 已無可分配的剩餘天數。', cutoff, expectedCutoff };
    return { available: true, cutoff, expectedCutoff, remainingDays };
  }

  function dynamicDailyGoal(monthTarget, officialActual, remainingDays) {
    if (!(monthTarget > 0) || officialActual == null || !(remainingDays > 0)) return null;
    return Math.ceil(Math.max(0, Number(monthTarget) - Number(officialActual)) / Number(remainingDays));
  }

  function rate(actual, target) { return target == null ? null : (target === 0 ? 1 : actual / target); }
  function gap(actual, target) { return target == null ? null : Math.max(0, target - actual); }
  function round(value, digits) {
    const power = 10 ** Number(digits || 0);
    return Math.round((Number(value) + Number.EPSILON) * power) / power;
  }

  function analyze(aqResult, rtResult, targets, options) {
    if (!aqResult || !rtResult) throw new Error('請先完成 AQ 與 RT 兩個檔案解析。');
    const settings = options || {};
    const targetMap = new Map(targets && Array.isArray(targets.stores) ? targets.stores.map(store => [store.name, store]) : []);
    const dynamic = targets ? dynamicContext(targets.meta, settings.todayIso) : { available: false, reason: '尚未載入正式目標。' };
    const stores = STORE_NAMES.map(name => {
      const target = targetMap.get(name) || {};
      const aqActual = Number(aqResult.totals[name] || 0);
      const rtActual = Number(rtResult.totals[name] || 0);
      const aqTodayGoal = dynamic.available ? dynamicDailyGoal(target.aqTarget, target.aqOfficialActual, dynamic.remainingDays) : null;
      const rtTodayGoal = dynamic.available ? dynamicDailyGoal(target.rtTarget, target.rtOfficialActual, dynamic.remainingDays) : null;
      const aqRate = rate(aqActual, aqTodayGoal);
      const rtRate = rate(rtActual, rtTodayGoal);
      return {
        name, aqActual, aqTarget: target.aqTarget == null ? null : target.aqTarget,
        aqOfficialActual: target.aqOfficialActual == null ? null : target.aqOfficialActual,
        aqTodayGoal, aqRate, aqGap: gap(aqActual, aqTodayGoal),
        rtActual, rtTarget: target.rtTarget == null ? null : target.rtTarget,
        rtOfficialActual: target.rtOfficialActual == null ? null : target.rtOfficialActual,
        rtTodayGoal, rtRate, rtGap: gap(rtActual, rtTodayGoal),
        combinedRate: aqRate == null || rtRate == null ? null : (aqRate + rtRate) / 2
      };
    });
    const sum = (key) => stores.reduce((total, store) => total + Number(store[key] || 0), 0);
    const region = {
      aqActual: sum('aqActual'), aqTarget: dynamic.available ? sum('aqTodayGoal') : null,
      rtActual: sum('rtActual'), rtTarget: dynamic.available ? sum('rtTodayGoal') : null
    };
    region.aqRate = rate(region.aqActual, region.aqTarget);
    region.rtRate = rate(region.rtActual, region.rtTarget);
    region.aqGap = gap(region.aqActual, region.aqTarget);
    region.rtGap = gap(region.rtActual, region.rtTarget);
    const priority = dynamic.available
      ? stores.filter(store => store.aqRate < 1 || store.rtRate < 1)
        .slice().sort((a, b) => a.combinedRate - b.combinedRate || (b.aqGap + b.rtGap) - (a.aqGap + a.rtGap))
      : [];
    const leaders = stores.slice().sort((a, b) => dynamic.available
      ? b.combinedRate - a.combinedRate
      : (b.aqActual + b.rtActual) - (a.aqActual + a.rtActual)).slice(0, 2);
    return { stores, region, priority, leaders, dynamic };
  }

  function percent(value) { return value == null ? '—' : `${round(value * 100, 1)}%`; }
  function count(value) { return Number.isInteger(value) ? String(value) : String(round(value, 1)); }
  function metricLine(label, actual, target, valueRate, valueGap) {
    if (target == null) return `${label}目前${count(actual)}（尚未載入今日目標）`;
    return `${label} ${count(actual)}/${count(target)}（${percent(valueRate)}${valueGap > 0 ? `，缺${count(valueGap)}` : '，已達標'}）`;
  }

  function composeMessage(analysis, options) {
    const settings = options || {};
    const stamp = text(settings.timeLabel) || new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    const lines = [
      `📣 北一二B 行進間戰報｜${stamp}`,
      `全區 ${metricLine('AQ', analysis.region.aqActual, analysis.region.aqTarget, analysis.region.aqRate, analysis.region.aqGap)}；${metricLine('RT', analysis.region.rtActual, analysis.region.rtTarget, analysis.region.rtRate, analysis.region.rtGap)}`
    ];
    const priorities = analysis.priority.slice(0, 4);
    if (priorities.length) {
      lines.push('', '🔴 優先追進');
      priorities.forEach(store => lines.push(`・${store.name}｜${metricLine('AQ', store.aqActual, store.aqTodayGoal, store.aqRate, store.aqGap)}；${metricLine('RT', store.rtActual, store.rtTodayGoal, store.rtRate, store.rtGap)}`));
    }
    const leaders = analysis.leaders.filter(store => store.aqActual > 0 || store.rtActual > 0);
    if (leaders.length) lines.push('', `🟢 目前領先：${leaders.map(store => analysis.dynamic.available
      ? `${store.name}（AQ ${percent(store.aqRate)}／RT ${percent(store.rtRate)}）`
      : `${store.name}（AQ ${count(store.aqActual)}／RT ${count(store.rtActual)}）`).join('、')}`);
    if (!analysis.dynamic.available) lines.push('', `ℹ️ ${analysis.dynamic.reason}`);
    lines.push('', '請各店先補最大缺口，成交即回報；本訊息為本機 AQ／RT 即時檔解析，正式成績以公司報表為準。');
    return lines.join('\n');
  }

  return { STORE_NAMES, AQ_KEY, RT_KEY, normalizeStore, buildStoreLookup, detectHeader, inspectMatrix, separatorFor, parseDelimited, decodeCsv, parseMatrix, extractTargets, dynamicContext, dynamicDailyGoal, analyze, composeMessage, percent };
});
