(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DepartmentOpsCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const REGIONS = ['北一二A', '北一二B', '北一二C', '北一二D'];
  const QUARTER_THRESHOLDS = [80, 100, 120, 180];
  const STORE_ALIASES = {
    '台北三創': '三創'
  };

  function text(value) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  }

  function number(value) {
    if (value === '' || value == null) return null;
    const parsed = Number(String(value).replace(/,/g, '').replace(/%$/, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }

  function storeName(value) {
    const normalized = text(value);
    return STORE_ALIASES[normalized] || normalized.replace(/^台北/, '');
  }

  function parseDateRange(value) {
    const matches = text(value).match(/(20\d{2})[\/-](\d{1,2})[\/-](\d{1,2}).*?(?:(20\d{2})[\/-])?(\d{1,2})[\/-](\d{1,2})/);
    if (!matches) return { start: '', end: '', cutoff: '' };
    const year = matches[1];
    const endYear = matches[4] || year;
    const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const start = iso(year, matches[2], matches[3]);
    const end = iso(endYear, matches[5], matches[6]);
    return { start, end, cutoff: end };
  }

  function monthKeyFromSheet(sheetName, dateRange) {
    const match = text(sheetName).match(/(\d{1,2})\s*月/);
    if (dateRange.start) return dateRange.start.slice(0, 7);
    return match ? `unknown-${String(match[1]).padStart(2, '0')}` : text(sheetName);
  }

  function parseGoldRows(rows, sheetName) {
    if (!Array.isArray(rows) || rows.length < 4) return null;
    const dateRange = parseDateRange(rows[0]?.[0]);
    const records = rows.slice(3).map((row) => {
      const region = text(row?.[3]);
      const medal = number(row?.[15]);
      if (!REGIONS.includes(region) || medal == null) return null;
      return {
        region,
        storeCode: text(row?.[4]),
        store: storeName(row?.[5]),
        role: text(row?.[6]),
        employeeId: text(row?.[7]),
        employeeName: text(row?.[8]),
        level: text(row?.[9]),
        employment: text(row?.[10]),
        eligible9m: text(row?.[11]),
        storeType: text(row?.[13]),
        spe: number(row?.[14]) || 0,
        medal
      };
    }).filter(Boolean);
    if (!records.length) return null;
    return {
      sheetName: text(sheetName),
      monthKey: monthKeyFromSheet(sheetName, dateRange),
      dateRange,
      records
    };
  }

  function parseGoldWorkbook(workbook) {
    if (!workbook || !Array.isArray(workbook.SheetNames) || !workbook.Sheets) {
      throw new Error('無法辨識金牌 Excel。');
    }
    if (typeof XLSX === 'undefined' || !XLSX.utils) {
      throw new Error('Excel 解析元件尚未載入。');
    }
    const months = workbook.SheetNames.map((sheetName) => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: null });
      return parseGoldRows(rows, sheetName);
    }).filter(Boolean).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
    if (!months.length) throw new Error('找不到北一二 A／B／C／D 金牌資料。');
    return { type: 'north12-final-v1', months };
  }

  function filterRecords(records, filters) {
    const values = filters || {};
    return (records || []).filter((row) => {
      if (values.region && row.region !== values.region) return false;
      if (values.store && row.store !== values.store) return false;
      if (values.employee && row.employeeId !== values.employee && row.personKey !== values.employee && row.employeeName !== values.employee) return false;
      return true;
    });
  }

  function summarizeRecords(records) {
    const rows = records || [];
    const medalTotal = rows.reduce((sum, row) => sum + row.medal, 0);
    const speTotal = rows.reduce((sum, row) => sum + row.spe, 0);
    return {
      people: rows.length,
      stores: new Set(rows.map((row) => row.store)).size,
      medalTotal,
      positive: rows.filter((row) => row.medal > 0).length,
      negative: rows.filter((row) => row.medal < 0).length,
      speTotal: Math.round(speTotal * 10) / 10
    };
  }

  function aggregatePeople(months, filters) {
    const grouped = new Map();
    (months || []).forEach((month) => {
      filterRecords(month.records, filters).forEach((row) => {
        const key = row.employeeId || row.personKey || `${row.region}|${row.store}|${row.employeeName}`;
        const target = grouped.get(key) || {
          employeeId: row.employeeId,
          personKey: row.personKey,
          employeeName: row.employeeName,
          region: row.region,
          store: row.store,
          role: row.role,
          total: 0,
          speTotal: 0,
          months: {}
        };
        target.region = row.region;
        target.store = row.store;
        target.role = row.role;
        target.total += row.medal;
        target.speTotal += row.spe;
        target.months[month.monthKey] = row.medal;
        grouped.set(key, target);
      });
    });
    return Array.from(grouped.values()).map((row) => ({
      ...row,
      speTotal: Math.round(row.speTotal * 10) / 10,
      reached: QUARTER_THRESHOLDS.filter((threshold) => row.total >= threshold),
      nextThreshold: QUARTER_THRESHOLDS.find((threshold) => row.total < threshold) || null
    })).sort((a, b) => b.total - a.total || a.employeeName.localeCompare(b.employeeName, 'zh-Hant'));
  }

  function compareSnapshots(previousRows, currentRows) {
    const before = new Map((previousRows || []).map((row) => [row.employeeId || row.personKey || `${row.store}|${row.employeeName}`, row]));
    return (currentRows || []).map((row) => {
      const key = row.employeeId || row.personKey || `${row.store}|${row.employeeName}`;
      const previous = before.get(key);
      const prior = previous ? previous.medal : 0;
      return { ...row, previousMedal: prior, delta: row.medal - prior };
    }).filter((row) => row.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }

  function upsertSnapshot(history, snapshot) {
    const next = Array.isArray(history) ? history.slice() : [];
    const normalized = {
      cutoff: text(snapshot?.cutoff),
      importedAt: snapshot?.importedAt || new Date().toISOString(),
      sourceName: text(snapshot?.sourceName),
      rows: (snapshot?.rows || []).map((row) => ({ ...row }))
    };
    if (!normalized.cutoff) throw new Error('金牌 Final 缺少資料截止日。');
    const existingIndex = next.findIndex((item) => item.cutoff === normalized.cutoff);
    if (existingIndex >= 0) {
      const existing = next[existingIndex];
      normalized.revisions = [...(existing.revisions || []), {
        importedAt: existing.importedAt,
        sourceName: existing.sourceName,
        rows: existing.rows
      }];
      next[existingIndex] = normalized;
    } else next.push(normalized);
    return next.sort((a, b) => a.cutoff.localeCompare(b.cutoff));
  }

  function dailyChanges(history, dateFrom, dateTo) {
    const snapshots = (history || []).filter((item) => (!dateFrom || item.cutoff >= dateFrom) && (!dateTo || item.cutoff <= dateTo));
    return snapshots.flatMap((snapshot, index) => {
      const globalIndex = (history || []).findIndex((item) => item === snapshot || item.cutoff === snapshot.cutoff);
      const previous = globalIndex > 0 ? history[globalIndex - 1] : null;
      if (!previous) return [];
      return compareSnapshots(previous?.rows || [], snapshot.rows).map((row) => ({ ...row, cutoff: snapshot.cutoff }));
    });
  }

  function findHeaderRow(rows) {
    const keys = ['店點', '服務中心', '月份', '日期', '完成', '成績', '分數', '狀態'];
    for (let index = 0; index < Math.min(rows.length, 30); index += 1) {
      const hits = (rows[index] || []).filter((cell) => keys.some((key) => text(cell).includes(key))).length;
      if (hits >= 2) return index;
    }
    return -1;
  }

  function parseStoreWorkbook(workbook) {
    if (!workbook || !Array.isArray(workbook.SheetNames) || !workbook.Sheets || typeof XLSX === 'undefined') {
      throw new Error('無法辨識店務 Excel。');
    }
    const records = [];
    workbook.SheetNames.forEach((sheetName) => {
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: '' });
      const headerIndex = findHeaderRow(rows);
      if (headerIndex < 0) return;
      const headers = rows[headerIndex].map(text);
      rows.slice(headerIndex + 1).forEach((row) => {
        const values = {};
        headers.forEach((header, index) => { if (header) values[header] = row[index]; });
        const storeHeader = headers.find((header) => /店點|服務中心/.test(header));
        const monthHeader = headers.find((header) => /月份|日期/.test(header));
        const statusHeader = headers.find((header) => /完成|狀態/.test(header));
        const scoreHeader = headers.find((header) => /成績|分數|達成率/.test(header));
        const store = storeName(values[storeHeader]);
        if (!store) return;
        records.push({
          sheetName,
          store,
          month: text(values[monthHeader] || sheetName),
          status: text(values[statusHeader]),
          score: number(values[scoreHeader]),
          values
        });
      });
    });
    if (!records.length) throw new Error('尚未辨識到店務月份與店點欄位；取得原始檔後可再補正式欄位映射。');
    return { type: 'north12-store-ops-v1', records };
  }

  return {
    REGIONS,
    QUARTER_THRESHOLDS,
    parseDateRange,
    parseGoldRows,
    parseGoldWorkbook,
    parseStoreWorkbook,
    filterRecords,
    summarizeRecords,
    aggregatePeople,
    compareSnapshots,
    upsertSnapshot,
    dailyChanges,
    storeName
  };
});
