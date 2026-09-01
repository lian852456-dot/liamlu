(function exposeLiveBattleCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LiamLiveBattleCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildLiveBattleCore() {
  'use strict';

  const STORE_NAMES = Object.freeze(['通化', '酒泉', '台北三創', '萬大', '六張犁', '復興南', '永吉', '大稻埕', '杭州南']);
  const AQ_KEY = 'TTL AQ上線點數';
  const RT_KEY = 'RT上線點數';
  const REGION_KEYS = Object.freeze(['A', 'B', 'C', 'D']);
  const METRIC_KEYS = Object.freeze(['A999', 'A1399', 'R999', 'R1399', '好速']);
  const AQ_PLAN_BANDS = Object.freeze(['999', '1199', '1399', '1599', '1899', '2699']);
  const RT_PLAN_BANDS = Object.freeze(['999', '1199', '1399', '1599', '1899', '2699']);
  const KPI_KEYS = Object.freeze({
    A999: 'AQ V+D 999 (含)以上',
    A1399: 'AQ V+D 1399 (含)以上',
    R999: 'RT V+D 999 (含)以上',
    R1399: 'RT V+D 1399 (含)以上',
    '好速': '好速案銷售點數'
  });
  const STORE_HEADERS = ['營業點代碼', '服務中心代碼', '門市代碼', '店點代碼', '店代碼', '營業點', '服務中心', '銷售門市', '門市', '店點', '店號'];
  const REGION_HEADERS = ['督導區', '督導區域', '區域', '營運區', '部'];
  const POINT_HEADERS = ['上線點數', '計件點數', '銷售點數', '實際點數', '貢獻點數', '點數', '件數', '數量'];
  const ID_HEADERS = ['受理編號', '申請書編號', '交易序號', '訂單編號', '案件編號', '用戶編號', '門號'];
  const PLAN_HEADERS = ['變更資費', '異動後資費', '申辦資費', '新資費', '合約資費', '月租費', '資費方案', '方案名稱', '資費'];
  const PRODUCT_HEADERS = ['商品型號', '商品名稱', '商品機型', '手機型號', '機款', '產品名稱', '上線商品'];
  const STAFF_HEADERS = ['前台服務人員', '承辦人', '申辦人員', '服務人員', '員工姓名', '業代', '申辦業務'];
  const ENTERPRISE_HEADERS = ['客戶分類', '企客標示', '客戶類型', '客群', '用戶標籤別', '專案資格'];
  const BUSINESS_HEADERS = ['合約編號', '合約代碼', '專案代號', '促案代碼', '優惠代碼', '服務代碼', '產品代碼', '申辦業務', '方案名稱', '速率'];

  function text(value) { return String(value == null ? '' : value).trim(); }
  function normalizeToken(value) {
    return text(value).normalize('NFKC')
      .replace(/^\uFEFF/, '')
      .replace(/[\s　_／/()（）【】\[\]：:・·.\-－]+/g, '')
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

  function normalizeRegion(value) {
    const token = normalizeToken(value);
    const match = token.match(/北一二(?:區)?([ABCD])|北一二([ABCD])區/);
    return match ? (match[1] || match[2]) : '';
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

  function findPreferredColumn(row, aliases) {
    const values = Array.isArray(row) ? row : [];
    for (const alias of aliases) {
      const index = values.findIndex(value => normalizeToken(value) === normalizeToken(alias));
      if (index >= 0) return index;
    }
    return findColumn(values, aliases);
  }

  function findExactColumn(row, aliases) {
    const wanted = aliases.map(normalizeToken);
    return (Array.isArray(row) ? row : []).findIndex(value => wanted.includes(normalizeToken(value)));
  }

  function matchingColumns(row, aliases) {
    const result = [];
    (Array.isArray(row) ? row : []).forEach((value, index) => {
      if (headerMatch(value, aliases)) result.push(index);
    });
    return result;
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
      { label: '合約／促案代碼', aliases: ['合約代碼', '促案代碼', '專案代號', '優惠代碼', '服務代碼', '產品代碼'] },
      { label: '資費／方案', aliases: ['變更資費', '異動後資費', '申辦資費', '資費', '資費別', '月租', '月租費', '方案', '方案名稱', '資費方案'] },
      { label: '商品／機款', aliases: ['商品型號', '商品名稱', '商品機型', '機款', '手機型號', '產品名稱', '上線商品'] },
      { label: '企客標示', aliases: ['客戶分類', '專案資格', '用戶標籤別', '企客', '企客案', '企客標示', '客戶類型', '客群'] }
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

  function planAmount(value) {
    const raw = text(value).replace(/[０-９]/g, char => String(char.charCodeAt(0) - 0xFEE0)).replace(/,/g, '');
    const values = (raw.match(/\d{3,4}/g) || []).map(Number).filter(value => value >= 199 && value <= 5000);
    return values.length ? Math.max(...values) : null;
  }

  function maskIdentifier(value) {
    const raw = text(value).replace(/\s+/g, '');
    if (!raw) return '—';
    if (/^\d{9,12}$/.test(raw)) return `${raw.slice(0, 3)}***${raw.slice(-3)}`;
    if (raw.length <= 6) return `${raw.slice(0, 1)}***`;
    return `${raw.slice(0, 3)}***${raw.slice(-3)}`;
  }

  function blankStoreMetrics() {
    return Object.fromEntries(STORE_NAMES.map(name => [name, Object.fromEntries(METRIC_KEYS.map(key => [key, 0]))]));
  }

  function blankProducts() {
    return Object.fromEntries(STORE_NAMES.map(name => [name, {}]));
  }

  function blankRegionBreakdown(kind) {
    const bands = kind === 'rt' ? RT_PLAN_BANDS : AQ_PLAN_BANDS;
    return {
      up999: 0,
      small: 0,
      bands: Object.fromEntries(bands.map(key => [key, 0])),
      earlyRenewal: 0
    };
  }

  function blankRegions(kind) {
    return Object.fromEntries(REGION_KEYS.map(key => [key, {
      total: 0,
      metrics: Object.fromEntries(METRIC_KEYS.map(metric => [metric, 0])),
      breakdown: blankRegionBreakdown(kind)
    }]));
  }

  function rowText(row, columns) {
    return columns.map(column => text(row[column])).filter(Boolean).join('｜');
  }

  function isHaosuRow(row, headerRow) {
    const source = normalizeToken(rowText(row, matchingColumns(headerRow, BUSINESS_HEADERS)));
    return /好速/.test(source);
  }

  function productName(value) {
    const raw = text(value)
      .replace(/\((?:台灣三星|三星|SAMSUNG|GOOGLE|APPLE|蘋果|OPPO|VIVO|小米|XIAOMI|REDMI|MOTOROLA|MOTO|REALME|ASUS|華為|HUAWEI)\)/gi, ' ')
      .replace(/(?:台灣三星|三星|SAMSUNG|GOOGLE|APPLE|蘋果|OPPO|VIVO|小米|XIAOMI|REDMI|MOTOROLA|REALME|ASUS|華為|HUAWEI)(?=[\s_\-／/]|$)/gi, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[_\-／/\s]+|[_\-／/\s]+$/g, '')
      .trim();
    if (!raw || /^(?:-|—|無|NA|N\/A|NULL|空白)$/i.test(raw)) return '';
    return raw.slice(0, 100);
  }

  function staffName(value) {
    const raw = text(value).normalize('NFKC');
    if (!raw) return '—';
    const chineseName = raw.match(/([\u3400-\u9fff·]{2,10})\s*$/u);
    if (chineseName) return chineseName[1];
    const stripped = raw.replace(/^(?:DNB[A-Z0-9]+[_\s\-/]+)?[A-Z0-9]{5,}[_\s\-/]+/i, '').trim();
    return stripped || raw;
  }

  function parseRegionSummary(matrix, kind) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const normalizedKind = String(kind || '').toLowerCase();
    if (!['aq', 'rt'].includes(normalizedKind)) return null;
    const totalAliases = normalizedKind === 'aq'
      ? ['AQ上線數', 'AQ上線點數', AQ_KEY, '合計']
      : ['RT上線數', 'RT上線點數', RT_KEY, '合計'];
    const metricAliases = normalizedKind === 'aq'
      ? { A999: ['A999', 'AQ V+D 999'], A1399: ['A1399', 'AQ V+D 1399'], '好速': ['好速'] }
      : { R999: ['R999', 'RT V+D 999'], R1399: ['R1399', 'RT V+D 1399'], '好速': ['好速'] };
    const bandKeys = normalizedKind === 'aq' ? AQ_PLAN_BANDS : RT_PLAN_BANDS;
    const prefix = normalizedKind === 'aq' ? 'A' : 'R';
    let best = null;
    rows.slice(0, 40).forEach((row, rowIndex) => {
      const regionCol = findPreferredColumn(row, REGION_HEADERS);
      const totalCol = findPreferredColumn(row, totalAliases);
      const storeCol = findPreferredColumn(row, STORE_HEADERS);
      // 店點明細也會同時出現「督導區」與「合計」，但同一區有多家店，
      // 不能把最後一家店誤當成該區彙總。真正的 A／B／C／D 彙總表不含店點欄。
      if (regionCol < 0 || totalCol < 0 || storeCol >= 0) return;
      const metricCols = Object.fromEntries(Object.entries(metricAliases).map(([key, aliases]) => [key, findPreferredColumn(row, aliases)]));
      const upCol = findPreferredColumn(row, [`${prefix}999↑`, `${prefix}999以上`, `${prefix}999含以上`]);
      const smallCol = findPreferredColumn(row, [normalizedKind === 'aq' ? '小A' : '小R']);
      const bandCols = Object.fromEntries(bandKeys.map(key => [key, findPreferredColumn(row, key === '2699' ? [`${prefix}2699`, '2699'] : [`${prefix}${key}`])]));
      const earlyRenewalCol = normalizedKind === 'rt' ? findPreferredColumn(row, ['提前續約(不分資費)', '提前續約']) : -1;
      const score = 10 + Object.values(metricCols).filter(index => index >= 0).length + Object.values(bandCols).filter(index => index >= 0).length + (upCol >= 0 ? 2 : 0);
      if (!best || score > best.score) best = { rowIndex, regionCol, totalCol, metricCols, upCol, smallCol, bandCols, earlyRenewalCol, score };
    });
    if (!best) return null;
    const regions = blankRegions(normalizedKind);
    const recognized = new Set();
    rows.slice(best.rowIndex + 1).forEach(row => {
      const region = normalizeRegion(row[best.regionCol]);
      if (!region) return;
      const total = numberOrNull(row[best.totalCol]);
      if (total == null) return;
      regions[region].total = total;
      Object.entries(best.metricCols).forEach(([key, column]) => {
        if (column < 0) return;
        const value = numberOrNull(row[column]);
        if (value != null) regions[region].metrics[key] = value;
      });
      const upValue = best.upCol >= 0 ? numberOrNull(row[best.upCol]) : null;
      regions[region].breakdown.up999 = upValue == null
        ? Number(regions[region].metrics[`${prefix}999`] || 0)
        : upValue;
      if (upValue != null) regions[region].metrics[`${prefix}999`] = upValue;
      Object.entries(best.bandCols).forEach(([key, column]) => {
        if (column < 0) return;
        const value = numberOrNull(row[column]);
        if (value != null) regions[region].breakdown.bands[key] = value;
      });
      const smallValue = best.smallCol >= 0 ? numberOrNull(row[best.smallCol]) : null;
      regions[region].breakdown.small = smallValue == null
        ? Math.max(0, total - regions[region].breakdown.up999)
        : smallValue;
      if (best.earlyRenewalCol >= 0) {
        const earlyValue = numberOrNull(row[best.earlyRenewalCol]);
        if (earlyValue != null) regions[region].breakdown.earlyRenewal = earlyValue;
      }
      recognized.add(region);
    });
    return recognized.size ? { regions, recognizedRegions: REGION_KEYS.filter(key => recognized.has(key)), processedRows: recognized.size, detailScore: best.score } : null;
  }

  function parseNationalSummary(matrix, kind) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const normalizedKind = String(kind || '').toLowerCase();
    if (!['aq', 'rt'].includes(normalizedKind)) return null;
    const isRt = normalizedKind === 'rt';
    const prefix = isRt ? 'R' : 'A';
    const bands = isRt ? RT_PLAN_BANDS : AQ_PLAN_BANDS;
    const totalAliases = isRt ? ['RT上線數', 'RT上線點數', RT_KEY, '合計'] : ['AQ上線數', 'AQ上線點數', AQ_KEY, '合計'];
    let best = null;
    rows.slice(0, 40).forEach((row, rowIndex) => {
      const departmentCol = findPreferredColumn(row, ['部', '營運部', '區部']);
      const totalCol = findPreferredColumn(row, totalAliases);
      if (departmentCol < 0 || totalCol < 0) return;
      const up999Col = findPreferredColumn(row, [`${prefix}999↑`, `${prefix}999以上`, `${prefix}999含以上`]);
      const up999RateCol = findPreferredColumn(row, [`${prefix}999↑占比`, `${prefix}999↑佔比`, `${prefix}999占比`, `${prefix}999佔比`]);
      const smallCol = findPreferredColumn(row, [isRt ? '小R' : '小A']);
      const bandCols = Object.fromEntries(bands.map(band => [band, findExactColumn(row, band === '2699' && !isRt ? ['2699', 'A2699'] : [`${prefix}${band}`])]));
      const speedCol = findExactColumn(row, ['好速', '好速案']);
      const earlyRenewalCol = isRt ? findPreferredColumn(row, ['提前續約(不分資費)', '提前續約']) : -1;
      const previous = rows[rowIndex - 1] || [];
      const rankGroupStart = previous.findIndex(value => /RANK|排名/.test(normalizeToken(value)));
      let rankTotalCol = findExactColumn(row, [`RANK${isRt ? 'RT' : 'AQ'}`, `${isRt ? 'RT' : 'AQ'}RANK`, `${isRt ? 'RT' : 'AQ'}排名`]);
      let rankUp999Col = findExactColumn(row, [`RANK${prefix}999`, `${prefix}999RANK`, `${prefix}999排名`]);
      if (rankGroupStart >= 0) {
        if (rankTotalCol < 0) rankTotalCol = row.findIndex((value, index) => index >= rankGroupStart && normalizeToken(value) === (isRt ? 'RT' : 'AQ'));
        if (rankUp999Col < 0) rankUp999Col = row.findIndex((value, index) => index >= rankGroupStart && normalizeToken(value) === `${prefix}999`);
      }
      const detailColumns = [up999Col, up999RateCol, smallCol, speedCol, earlyRenewalCol, rankTotalCol, rankUp999Col, ...Object.values(bandCols)].filter(index => index >= 0).length;
      const score = 20 + detailColumns;
      if (!best || score > best.score) best = { rowIndex, departmentCol, totalCol, up999Col, up999RateCol, smallCol, bandCols, speedCol, earlyRenewalCol, rankTotalCol, rankUp999Col, score };
    });
    if (!best) return null;

    const parsedRows = [];
    let totalRow = null;
    rows.slice(best.rowIndex + 1).forEach(row => {
      const department = text(row[best.departmentCol]);
      const total = numberOrNull(row[best.totalCol]);
      if (total == null) return;
      const up999 = best.up999Col >= 0 ? numberOrNull(row[best.up999Col]) : null;
      const rateCell = best.up999RateCol >= 0 ? numberOrNull(row[best.up999RateCol]) : null;
      const parsedRate = typeof row[best.up999RateCol] === 'number' && Number(row[best.up999RateCol]) <= 1
        ? Number(row[best.up999RateCol])
        : (rateCell == null ? null : rateCell / 100);
      const bandValues = Object.fromEntries(bands.map(band => [band, best.bandCols[band] >= 0 ? numberOrNull(row[best.bandCols[band]]) : null]));
      const normalizedUp999 = up999 == null ? bandValues['999'] : up999;
      const parsed = {
        department: department || '全國合計',
        total,
        up999: normalizedUp999,
        up999Rate: normalizedUp999 != null && total > 0 ? normalizedUp999 / total : parsedRate,
        small: best.smallCol >= 0 ? numberOrNull(row[best.smallCol]) : (normalizedUp999 == null ? null : Math.max(0, total - normalizedUp999)),
        bands: bandValues,
        speed: best.speedCol >= 0 ? numberOrNull(row[best.speedCol]) : null,
        earlyRenewal: best.earlyRenewalCol >= 0 ? numberOrNull(row[best.earlyRenewalCol]) : null,
        ranks: {
          total: best.rankTotalCol >= 0 ? numberOrNull(row[best.rankTotalCol]) : null,
          up999: best.rankUp999Col >= 0 ? numberOrNull(row[best.rankUp999Col]) : null
        }
      };
      if (!department || /^(?:DS|全國|全國合計|總計|合計)$/i.test(normalizeToken(department))) {
        if (!totalRow) totalRow = parsed;
        return;
      }
      parsedRows.push(parsed);
    });
    const nationwide = parsedRows.length >= 5 || parsedRows.some(row => !normalizeRegion(row.department));
    return nationwide && parsedRows.length
      ? { rows: parsedRows, totalRow, processedRows: parsedRows.length, detailScore: best.score, hasSpeed: best.speedCol >= 0, hasRanks: best.rankTotalCol >= 0 || best.rankUp999Col >= 0 }
      : null;
  }

  function enterpriseRow(row, headerRow) {
    const source = normalizeToken(rowText(row, matchingColumns(headerRow, ENTERPRISE_HEADERS)));
    return /企客|企業客戶|企業方案|公司戶|大客戶/.test(source);
  }

  function fiveGPlan(value) {
    const generations = normalizeToken(value).match(/[45]G/g) || [];
    return generations.length > 0 && generations[generations.length - 1] === '5G';
  }

  function giftFlags(rows) {
    const source = normalizeToken(rows.flat().join('｜'));
    return { kkbox: /KKBOX/.test(source), myVideo: /MYVIDEO/.test(source) };
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
    const headerRow = header.rowIndex >= 0 ? rows[header.rowIndex] : [];
    const planCol = findPreferredColumn(headerRow, PLAN_HEADERS);
    const productCol = findPreferredColumn(headerRow, PRODUCT_HEADERS);
    const staffCol = findPreferredColumn(headerRow, STAFF_HEADERS);
    const regionCol = findPreferredColumn(headerRow, REGION_HEADERS);
    const kind = String(settings.kind).toLowerCase();
    const totals = Object.fromEntries(STORE_NAMES.map(name => [name, 0]));
    const metrics = blankStoreMetrics();
    const products = blankProducts();
    const regions = blankRegions(kind);
    const seen = new Set();
    const regionSeen = new Set();
    const caseRows = new Map();
    let processedRows = 0;
    let regionProcessedRows = 0;
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
      const id = header.idCol >= 0 ? normalizeToken(row[header.idCol]) : '';
      let region = regionCol >= 0 ? normalizeRegion(row[regionCol]) : '';
      if (!region) region = row.map(normalizeRegion).find(Boolean) || (store ? 'B' : '');
      const parsedPoints = header.pointsCol >= 0 ? numberOrNull(row[header.pointsCol]) : null;
      const points = parsedPoints == null ? 1 : parsedPoints;
      const amount = planCol >= 0 ? planAmount(row[planCol]) : null;
      const haosu = isHaosuRow(row, headerRow);
      const regionUniqueKey = id && region ? `${region}|${id}` : '';
      if (region && (!regionUniqueKey || !regionSeen.has(regionUniqueKey))) {
        if (regionUniqueKey) regionSeen.add(regionUniqueKey);
        regions[region].total += points;
        if (kind === 'aq') {
          if (amount >= 999) regions[region].metrics.A999 += 1;
          if (amount >= 1399) regions[region].metrics.A1399 += 1;
        } else {
          if (amount >= 999) regions[region].metrics.R999 += 1;
          if (amount >= 1399) regions[region].metrics.R1399 += 1;
        }
        if (amount >= 999) regions[region].breakdown.up999 += 1;
        if (amount != null && regions[region].breakdown.bands[String(amount)] != null) regions[region].breakdown.bands[String(amount)] += 1;
        if (kind === 'rt' && /提前續約/.test(normalizeToken(row.join('｜')))) regions[region].breakdown.earlyRenewal += 1;
        if (haosu) regions[region].metrics['好速'] += parsedPoints == null ? 1 : parsedPoints;
        regionProcessedRows += 1;
      }
      if (!store) { ignoredRows += 1; return; }
      const uniqueKey = id ? `${store}|${id}` : '';
      const caseKey = uniqueKey || `${store}|ROW${offset}`;
      if (!caseRows.has(caseKey)) caseRows.set(caseKey, { store, id: header.idCol >= 0 ? text(row[header.idCol]) : '', rows: [] });
      caseRows.get(caseKey).rows.push(row);
      if (uniqueKey && seen.has(uniqueKey)) { duplicateRows += 1; return; }
      if (uniqueKey) seen.add(uniqueKey);
      totals[store] += points;
      if (kind === 'aq') {
        if (amount >= 999) metrics[store].A999 += 1;
        if (amount >= 1399) metrics[store].A1399 += 1;
      } else {
        if (amount >= 999) metrics[store].R999 += 1;
        if (amount >= 1399) metrics[store].R1399 += 1;
      }
      if (haosu) metrics[store]['好速'] += parsedPoints == null ? 1 : parsedPoints;
      const product = productCol >= 0 ? productName(row[productCol]) : '';
      if (product) products[store][product] = Number(products[store][product] || 0) + 1;
      processedRows += 1;
    });

    const giftAudit = [];
    if (kind === 'rt') {
      caseRows.forEach(group => {
        const representative = group.rows[0] || [];
        const amounts = group.rows.map(row => planCol >= 0 ? planAmount(row[planCol]) : null).filter(value => value != null);
        const amount = amounts.length ? Math.max(...amounts) : null;
        if (!(amount >= 599) || !group.rows.some(row => planCol >= 0 && fiveGPlan(row[planCol])) || group.rows.some(row => enterpriseRow(row, headerRow))) return;
        const gifts = giftFlags(group.rows);
        const missing = [];
        if (!gifts.kkbox) missing.push('KKBOX');
        if (!gifts.myVideo) missing.push('MyVideo');
        if (!missing.length) return;
        giftAudit.push({
          store: group.store,
          staff: staffName(staffCol >= 0 ? representative[staffCol] : ''),
          caseId: maskIdentifier(group.id),
          plan: amount,
          earlyRenewal: /提前續約/.test(normalizeToken(group.rows.flat().join('｜'))),
          missing
        });
      });
    }

    const recognizedStores = STORE_NAMES.filter(name => totals[name] !== 0);
    REGION_KEYS.forEach(key => {
      regions[key].breakdown.small = Math.max(0, Number(regions[key].total || 0) - Number(regions[key].breakdown.up999 || 0));
    });
    if (!processedRows) throw new Error('找不到北一二B九店資料；請確認這是正確的 AQ／RT 原始檔。');
    return {
      kind,
      totals, metrics, products, regions, giftAudit,
      meta: {
        fileName: text(settings.fileName), headerRow: header.rowIndex,
        mode: header.pointsCol >= 0 ? 'points' : 'rows', processedRows, regionProcessedRows, duplicateRows, ignoredRows,
        recognizedStores, missingStores: STORE_NAMES.filter(name => !recognizedStores.includes(name)),
        recognizedRegions: REGION_KEYS.filter(key => regions[key].total !== 0),
        fields: { region: regionCol >= 0 ? text(headerRow[regionCol]) : '', plan: planCol >= 0 ? text(headerRow[planCol]) : '', product: productCol >= 0 ? text(headerRow[productCol]) : '', staff: staffCol >= 0 ? text(headerRow[staffCol]) : '' }
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
      const metrics = Object.fromEntries(METRIC_KEYS.map(key => {
        const item = items[KPI_KEYS[key]];
        return [key, {
          target: metricNumber(item, ['t', 'target', 'targetValue']),
          officialActual: metricNumber(item, ['a', 'actual', 'actualValue'])
        }];
      }));
      return {
        name, code: text(store && store.code),
        metrics,
        aqTarget: metricNumber(aq, ['t', 'target', 'targetValue']),
        rtTarget: metricNumber(rt, ['t', 'target', 'targetValue']),
        aqOfficialActual: metricNumber(aq, ['a', 'actual', 'actualValue']),
        rtOfficialActual: metricNumber(rt, ['a', 'actual', 'actualValue'])
      };
    }).filter(store => STORE_NAMES.includes(store.name));
    if (stores.length !== STORE_NAMES.length) throw new Error(`正式 KPI 目標只讀到 ${stores.length}/9 店，已停止計算達成率。`);
    if (stores.some(store => !(store.aqTarget > 0) || !(store.rtTarget > 0))) throw new Error('正式 KPI 缺少部分 AQ／RT 目標，已停止計算達成率。');
    if (stores.some(store => METRIC_KEYS.some(key => !(store.metrics[key].target > 0) || store.metrics[key].officialActual == null))) throw new Error('正式 KPI 缺少部分 A999／A1399／R999／R1399／好速目標或實績，已停止計算達成率。');
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
    const todayMonth = `${todayMatch[1]}-${todayMatch[2]}`;
    if (month !== todayMonth) return { available: false, reason: `正式 KPI 月份 ${month} 與今日 ${todayMonth} 不同，已停止計算今日目標。`, cutoff, expectedCutoff };
    const cutoffUtc = new Date(`${cutoff}T00:00:00Z`);
    const expectedCutoffUtc = new Date(`${expectedCutoff}T00:00:00Z`);
    if (!Number.isFinite(cutoffUtc.getTime()) || cutoffUtc > expectedCutoffUtc) return { available: false, reason: `正式 KPI 截止 ${cutoff} 晚於可用截止 ${expectedCutoff}，已停止計算今日目標。`, cutoff, expectedCutoff };
    const staleDays = Math.round((expectedCutoffUtc - cutoffUtc) / 86_400_000);
    const daysInMonth = new Date(Date.UTC(Number(monthMatch[1]), Number(monthMatch[2]), 0)).getUTCDate();
    const remainingDays = daysInMonth - Number(snapshotDay);
    if (!(remainingDays > 0)) return { available: false, reason: '正式 KPI 已無可分配的剩餘天數。', cutoff, expectedCutoff };
    return {
      available: true, cutoff, expectedCutoff, remainingDays, staleDays,
      notice: staleDays > 0
        ? `正式 KPI 截止 ${cutoff}，較昨日落後 ${staleDays} 天；仍依該截止後剩餘 ${remainingDays} 天分配今日目標。`
        : `今日目標依截至 ${cutoff} 的正式累積實績，分配至剩餘 ${remainingDays} 天。`
    };
  }

  function dynamicDailyGoal(monthTarget, officialActual, remainingDays, metricStep) {
    const step = Number(metricStep) > 0 ? Number(metricStep) : 1;
    if (!(monthTarget > 0) || officialActual == null || !(remainingDays > 0)) return null;
    return Math.ceil((Math.max(0, Number(monthTarget) - Number(officialActual)) / Number(remainingDays)) / step) * step;
  }

  function rate(actual, target) { return target == null ? null : (target === 0 ? 1 : actual / target); }
  function gap(actual, target) { return target == null ? null : Math.max(0, target - actual); }
  function round(value, digits) {
    const power = 10 ** Number(digits || 0);
    return Math.round((Number(value) + Number.EPSILON) * power) / power;
  }

  function regionDetail(source, kind) {
    const regionSource = source || { total: 0, metrics: {}, breakdown: {} };
    const breakdown = regionSource.breakdown || {};
    const prefix = kind === 'rt' ? 'R' : 'A';
    const bandKeys = kind === 'rt' ? RT_PLAN_BANDS : AQ_PLAN_BANDS;
    const total = Number(regionSource.total || 0);
    const up999 = Number(breakdown.up999 != null ? breakdown.up999 : regionSource.metrics && regionSource.metrics[`${prefix}999`] || 0);
    return {
      total,
      up999,
      up999Rate: total > 0 ? up999 / total : null,
      small: Number(breakdown.small != null ? breakdown.small : Math.max(0, total - up999)),
      bands: Object.fromEntries(bandKeys.map(key => [key, Number(breakdown.bands && breakdown.bands[key] || 0)])),
      speed: Number(regionSource.metrics && regionSource.metrics['好速'] || 0),
      earlyRenewal: Number(breakdown.earlyRenewal || 0)
    };
  }

  function analyze(aqResult, rtResult, targets, options) {
    if (!aqResult || !rtResult) throw new Error('請先完成 AQ 與 RT 兩個檔案解析。');
    const settings = options || {};
    const targetMap = new Map(targets && Array.isArray(targets.stores) ? targets.stores.map(store => [store.name, store]) : []);
    const dynamic = targets ? dynamicContext(targets.meta, settings.todayIso) : { available: false, reason: '尚未載入正式目標。' };
    const stores = STORE_NAMES.map(name => {
      const target = targetMap.get(name) || {};
      const actualByMetric = Object.fromEntries(METRIC_KEYS.map(key => [key,
        key.startsWith('A') ? Number(aqResult.metrics && aqResult.metrics[name] && aqResult.metrics[name][key] || 0)
          : key.startsWith('R') ? Number(rtResult.metrics && rtResult.metrics[name] && rtResult.metrics[name][key] || 0)
            : Number(aqResult.metrics && aqResult.metrics[name] && aqResult.metrics[name][key] || 0) + Number(rtResult.metrics && rtResult.metrics[name] && rtResult.metrics[name][key] || 0)
      ]));
      const metrics = Object.fromEntries(METRIC_KEYS.map(key => {
        const metricTarget = target.metrics && target.metrics[key] || {};
        const todayGoal = dynamic.available ? dynamicDailyGoal(metricTarget.target, metricTarget.officialActual, dynamic.remainingDays, key === '好速' ? .25 : 1) : null;
        return [key, {
          actual: actualByMetric[key], target: metricTarget.target == null ? null : metricTarget.target,
          officialActual: metricTarget.officialActual == null ? null : metricTarget.officialActual,
          todayGoal, rate: rate(actualByMetric[key], todayGoal), gap: gap(actualByMetric[key], todayGoal)
        }];
      }));
      const aqActual = Number(aqResult.totals[name] || 0);
      const rtActual = Number(rtResult.totals[name] || 0);
      const aqTodayGoal = dynamic.available ? dynamicDailyGoal(target.aqTarget, target.aqOfficialActual, dynamic.remainingDays) : null;
      const rtTodayGoal = dynamic.available ? dynamicDailyGoal(target.rtTarget, target.rtOfficialActual, dynamic.remainingDays) : null;
      const aqRate = rate(aqActual, aqTodayGoal);
      const rtRate = rate(rtActual, rtTodayGoal);
      return {
        name, metrics, aqActual, aqTarget: target.aqTarget == null ? null : target.aqTarget,
        aqOfficialActual: target.aqOfficialActual == null ? null : target.aqOfficialActual,
        aqTodayGoal, aqRate, aqGap: gap(aqActual, aqTodayGoal),
        rtActual, rtTarget: target.rtTarget == null ? null : target.rtTarget,
        rtOfficialActual: target.rtOfficialActual == null ? null : target.rtOfficialActual,
        rtTodayGoal, rtRate, rtGap: gap(rtActual, rtTodayGoal),
        combinedRate: (() => {
          const values = [aqRate, rtRate, ...METRIC_KEYS.map(key => metrics[key].rate)].filter(value => value != null);
          return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
        })()
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
    region.metrics = Object.fromEntries(METRIC_KEYS.map(key => {
      const actual = stores.reduce((total, store) => total + Number(store.metrics[key].actual || 0), 0);
      const todayGoals = stores.map(store => store.metrics[key].todayGoal);
      const todayGoal = dynamic.available && todayGoals.every(value => value != null) ? todayGoals.reduce((total, value) => total + Number(value), 0) : null;
      return [key, { actual, todayGoal, rate: rate(actual, todayGoal), gap: gap(actual, todayGoal) }];
    }));
    const priority = dynamic.available
      ? stores.filter(store => (store.aqRate != null && store.aqRate < 1) || (store.rtRate != null && store.rtRate < 1) || METRIC_KEYS.some(key => store.metrics[key].rate != null && store.metrics[key].rate < 1))
        .slice().sort((a, b) => (a.combinedRate ?? 99) - (b.combinedRate ?? 99))
      : [];
    const leaders = stores.slice().sort((a, b) => dynamic.available
      ? (b.combinedRate ?? -1) - (a.combinedRate ?? -1)
      : METRIC_KEYS.reduce((total, key) => total + b.metrics[key].actual - a.metrics[key].actual, 0)).slice(0, 2);
    const products = Object.fromEntries(STORE_NAMES.map(name => {
      const merged = {};
      [aqResult.products && aqResult.products[name], rtResult.products && rtResult.products[name]].forEach(source => Object.entries(source || {}).forEach(([model, value]) => { merged[model] = Number(merged[model] || 0) + Number(value || 0); }));
      return [name, merged];
    }));
    const productModels = Array.from(new Set(STORE_NAMES.flatMap(name => Object.keys(products[name])))).sort((a, b) => {
      const total = model => STORE_NAMES.reduce((sum, name) => sum + Number(products[name][model] || 0), 0);
      return total(b) - total(a) || a.localeCompare(b, 'zh-Hant');
    });
    const regions = Object.fromEntries(REGION_KEYS.map(key => {
      const aqRegion = aqResult.regions && aqResult.regions[key] || { total: key === 'B' ? region.aqActual : 0, metrics: {} };
      const rtRegion = rtResult.regions && rtResult.regions[key] || { total: key === 'B' ? region.rtActual : 0, metrics: {} };
      return [key, {
        aqActual: Number(aqRegion.total || 0),
        rtActual: Number(rtRegion.total || 0),
        aq: regionDetail(aqRegion, 'aq'),
        rt: regionDetail(rtRegion, 'rt'),
        metrics: {
          A999: Number(aqRegion.metrics && aqRegion.metrics.A999 || 0),
          A1399: Number(aqRegion.metrics && aqRegion.metrics.A1399 || 0),
          R999: Number(rtRegion.metrics && rtRegion.metrics.R999 || 0),
          R1399: Number(rtRegion.metrics && rtRegion.metrics.R1399 || 0),
          '好速': Number(aqRegion.metrics && aqRegion.metrics['好速'] || 0) + Number(rtRegion.metrics && rtRegion.metrics['好速'] || 0)
        }
      }];
    }));
    const national = {
      aq: aqResult.nationalSummary && Array.isArray(aqResult.nationalSummary.rows) ? aqResult.nationalSummary.rows : [],
      rt: rtResult.nationalSummary && Array.isArray(rtResult.nationalSummary.rows) ? rtResult.nationalSummary.rows : []
    };
    const nationalTotals = {
      aq: aqResult.nationalSummary && aqResult.nationalSummary.totalRow || null,
      rt: rtResult.nationalSummary && rtResult.nationalSummary.totalRow || null
    };
    return { stores, region, regions, national, nationalTotals, priority, leaders, dynamic, products, productModels, giftAudit: Array.isArray(rtResult.giftAudit) ? rtResult.giftAudit : [] };
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
      `全區｜${[
        metricLine('AQ上線', analysis.region.aqActual, analysis.region.aqTarget, analysis.region.aqRate, analysis.region.aqGap),
        ...['A999', 'A1399'].map(key => {
          const metric = analysis.region.metrics[key];
          return metricLine(key, metric.actual, metric.todayGoal, metric.rate, metric.gap);
        }),
        metricLine('RT上線', analysis.region.rtActual, analysis.region.rtTarget, analysis.region.rtRate, analysis.region.rtGap),
        ...['R999', 'R1399', '好速'].map(key => {
        const metric = analysis.region.metrics[key];
        return metricLine(key, metric.actual, metric.todayGoal, metric.rate, metric.gap);
        })
      ].join('；')}`
    ];
    const priorities = analysis.priority.slice(0, 4);
    if (priorities.length) {
      lines.push('', '🔴 優先追進');
      priorities.forEach(store => {
        const gaps = [
          ...(store.aqGap > 0 ? [`AQ上線缺${count(store.aqGap)}`] : []),
          ...['A999', 'A1399'].filter(key => store.metrics[key].gap > 0).map(key => `${key}缺${count(store.metrics[key].gap)}`),
          ...(store.rtGap > 0 ? [`RT上線缺${count(store.rtGap)}`] : []),
          ...['R999', 'R1399', '好速'].filter(key => store.metrics[key].gap > 0).map(key => `${key}缺${count(store.metrics[key].gap)}`)
        ];
        lines.push(`・${store.name}｜${gaps.join('、') || '今日已達標'}`);
      });
    }
    const leaders = analysis.leaders.filter(store => METRIC_KEYS.some(key => store.metrics[key].actual > 0));
    if (leaders.length) lines.push('', `🟢 目前領先：${leaders.map(store => analysis.dynamic.available
      ? `${store.name}（七項均值 ${percent(store.combinedRate)}）`
      : `${store.name}（${METRIC_KEYS.map(key => `${key} ${count(store.metrics[key].actual)}`).join('／')}）`).join('、')}`);
    if (analysis.giftAudit.length) lines.push('', `🎁 KKBOX／MyVideo 漏搭 ${analysis.giftAudit.length} 件：${analysis.giftAudit.map(item => `${item.store} ${item.caseId}缺${item.missing.join('+')}`).join('；')}`);
    if (analysis.productModels.length) lines.push('', `📱 今日上線商品：${analysis.productModels.slice(0, 8).map(model => `${model}×${STORE_NAMES.reduce((sum, name) => sum + Number(analysis.products[name][model] || 0), 0)}`).join('、')}`);
    if (!analysis.dynamic.available) lines.push('', `ℹ️ ${analysis.dynamic.reason}`);
    else if (analysis.dynamic.staleDays > 0) lines.push('', `ℹ️ ${analysis.dynamic.notice}`);
    lines.push('', '請各店先補最大缺口並確認影音搭贈；本訊息為本機原始檔即時解析，正式成績以公司報表為準。');
    return lines.join('\n');
  }

  return { STORE_NAMES, REGION_KEYS, AQ_KEY, RT_KEY, METRIC_KEYS, AQ_PLAN_BANDS, RT_PLAN_BANDS, KPI_KEYS, normalizeStore, normalizeRegion, buildStoreLookup, detectHeader, inspectMatrix, separatorFor, parseDelimited, decodeCsv, parseRegionSummary, parseNationalSummary, parseMatrix, extractTargets, dynamicContext, dynamicDailyGoal, analyze, composeMessage, percent, planAmount, maskIdentifier };
});
