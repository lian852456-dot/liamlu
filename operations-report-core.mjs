import { HEADER_LABEL, SECTIONS } from './operations-brief-core.mjs?v=20261124-operations-review';
import { parseTradeinRows } from './operations-tradein-core.mjs?v=20261124-operations-review';
import { parseGoodSpeedSheets } from './operations-goodspeed-core.mjs?v=20261124-operations-review';

const REGIONS = ['北一二A', '北一二B', '北一二C', '北一二D'];
const DEPARTMENT = '北一二全四區';
const text = value => String(value ?? '').trim();
const label = value => text(value).normalize('NFKC').replace(/\s+/g, '');
const format = value => value == null ? '缺資料' : String(value);
const percent = value => value == null ? '不適用' : (value * 100).toFixed(1) + '%';
const ratio = (numerator, denominator) => denominator > 0 && numerator != null ? numerator / denominator : null;
const share = (numerator, denominator) => numerator == null || denominator == null ? '缺資料' : percent(ratio(numerator, denominator));
const reference = (sheet, locator) => ({ sheet, locator });
const table = (headers, rows, evidence, title) => ({ headers, rows, evidence, title });
const report = (key, details) => ({
  key, status: 'read', sourcePeriod: '', coverage: '', evidence: [], headers: [], rows: [], issues: [], ...details
});
const sheetLimit = 100000;
const categoryKeys = SECTIONS.map(([key]) => key);
const monthKey = /^20\d{2}-(?:0[1-9]|1[0-2])$/;

function rowsOf(book, xlsx, name) {
  const sheet = book.Sheets[name];
  if (!sheet?.['!ref']) throw Error('缺少可讀工作表「' + name + '」，請選同一版正式原檔。');
  const bounds = xlsx.utils.decode_range(sheet['!ref']);
  if (bounds.e.r >= sheetLimit || bounds.e.c >= 200 || (bounds.e.r + 1) * (bounds.e.c + 1) > 8000000) {
    throw Error('工作表「' + name + '」範圍過大，請在本機另存當期必要範圍。');
  }
  return xlsx.utils.sheet_to_json(sheet, { header: 1, range: 0, defval: null, raw: true, blankrows: true });
}

function getDay(value, xlsx) {
  let components;
  if (typeof value === 'number' && Number.isInteger(value) && value >= 36526 && value <= 73050) {
    const parts = xlsx?.SSF?.parse_date_code(value);
    if (parts) components = [parts.y, parts.m, parts.d];
  } else {
    const match = label(value).match(/^(20\d{2})[-./年](\d{1,2})[-./月](\d{1,2})日?$/);
    if (match) components = match.slice(1).map(Number);
  }
  if (!components) return '';
  const [year, month, day] = components;
  const result = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const normalized = new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
  return result === normalized ? result : '';
}

function priorMonths(last, count) {
  const [year, month] = last.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => new Date(Date.UTC(year, month - count + index, 1)).toISOString().slice(0, 7));
}

function previewSheets(book, xlsx) {
  return book.SheetNames.slice(0, 50).map(name => {
    const sheet = book.Sheets[name];
    const range = sheet?.['!fullref'] || sheet?.['!ref'] || '';
    const fields = new Set(), periods = new Set(), scopes = new Set();
    if (range) {
      const { s, e } = xlsx.utils.decode_range(range);
      for (let r = s.r; r <= Math.min(e.r, s.r + 29); r++) {
        for (let c = s.c; c <= Math.min(e.c, s.c + 79); c++) {
          const cell = sheet[xlsx.utils.encode_cell({ r, c })];
          if (typeof cell?.v !== 'string') continue;
          const value = text(cell.v);
          if (HEADER_LABEL.test(value) || fieldsForPreview.has(label(value))) fields.add(value);
          if (/^(?:資料日期|截止日期|來源期間|資料期間|區域|督導區)\s*[:：]/.test(value)) {
            for (const match of value.matchAll(/20\d{2}[-./年]\d{1,2}(?:[-./月]\d{1,2}日?)?/g)) periods.add(match[0]);
            for (const region of REGIONS) if (value.includes(region)) scopes.add(region);
          }
          if (REGIONS.includes(label(value)) || label(value) === DEPARTMENT) scopes.add(label(value));
        }
      }
    }
    return { name, range, fields: [...fields], periods: [...periods], scopes: [...scopes] };
  });
}

function tradein(book, xlsx) {
  const sheet = '統計表';
  const source = parseTradeinRows(rowsOf(book, xlsx, sheet));
  const { periodText, year, periodStart, cutoff, regions, hasTarget } = source;
  const issues = [];
  if (!year) issues.push('原表日期未列年份；請提供同版報表封面或可核對年份的出處。');
  if (!hasTarget) issues.push('工作表未含完整舊換新目標；請提供同期間目標，保留區及各店欄位。');
  return report('舊換新', {
    status: issues.length ? 'partial' : 'read', sourcePeriod: cutoff ? periodStart + ' 至 ' + cutoff : periodText,
    periodStart, cutoff, months: cutoff ? [cutoff.slice(0, 7)] : [], coverage: DEPARTMENT,
    evidence: [reference(sheet, '區小計及店級明細（H、L、M、N、Q）')],
    headers: ['督導區', '門市數', '回收合計', '回收目標', '僅折抵', 'Device 含 Mac', '比率', '上月同期'],
    rows: regions.map(r => [r.region, format(r.storeCount), format(r.total), format(r.target), format(r.creditOnly),
      format(r.device), percent(r.rate), format(r.previous)]),
    additionalTables: [{
      title: '各店回收與 Device',
      evidence: reference(sheet, '店級明細'),
      headers: ['督導區', '店點', '回收', '回收目標', 'Device', '比率', '來源列'],
      rows: regions.flatMap(r => r.stores.map(s => [r.region, s.store, format(s.total), format(s.target), format(s.device),
        percent(s.rate), format(s.sourceRow)]))
    }],
    issues,
    notes: ['當期舊換新政策請另附行銷來源與頁碼；回收合計包含僅折抵。']
  });
}

function goodspeed(book, xlsx) {
  const source = parseGoodSpeedSheets(Object.fromEntries(['BB店點', 'BB量能', 'BB明細'].map(name => [name, rowsOf(book, xlsx, name)])));
  const period = {
    sourcePeriod: source.period, periodStart: source.cutoff.slice(0, 7) + '-01',
    cutoff: source.cutoff, months: [source.cutoff.slice(0, 7)], coverage: DEPARTMENT
  };
  const failures = source.regions.flatMap(r => {
    const entries = Object.entries(r.failures.reasonCounts);
    return entries.length ? entries.map(([reason, count]) => {
      const rows = r.failures.reasonRows[reason];
      const rowRange = rows.length > 1 ? rows[0] + '–' + rows.at(-1) : format(rows[0]);
      return [r.group, reason, format(count), 'AY ' + rowRange];
    }) : [[r.group, '當期未找到失敗紀錄', '缺資料', 'BB明細']];
  });
  const unresolved = source.regions.some(r => !r.failures.rows ||
    Object.keys(r.failures.reasonCounts).some(k => k.startsWith('未對映')));
  return [
    report('好速', {
      ...period, status: 'partial',
      evidence: [reference('BB店點', 'AG、AR、BC'), reference('BB量能', 'K:M 及 AM2:BM2'), reference('BB明細', 'BN1')],
      headers: ['督導區', '店數', '來源點數', '目標點數', '點數／目標', '來源總進度'],
      rows: source.regions.map(r => [r.group, format(r.storeCount), format(r.points), format(r.target),
        percent(r.pointsTargetRatio), percent(r.sourceProgress)]),
      issues: ['BB 三表的來源點數與公司 KPI 分開；請補同期間含企客 4G 且按正式欄排除降轉的 KPI 實績、目標與出處。']
    }),
    report('好速長約', {
      ...period,
      evidence: [reference('BB店點', 'I:K、R'), reference('BB量能', 'AM2:BM2'), reference('BB明細', 'BN1')],
      headers: ['督導區', '12M', '24M', '36M', '合計筆數', '36M占比'],
      rows: source.regions.map(r => [r.group, format(r.count12), format(r.count24), format(r.count36),
        format(r.count), percent(r.longTermShare)]),
      notes: ['36M 占比使用此來源 12／24／36M 筆數為分母；36M 來源點數已含 0.5 點。']
    }),
    report('好速失敗原因', {
      ...period, status: unresolved ? 'partial' : 'read',
      evidence: [reference('BB明細', 'B、C、E、G、J、AY、BG、BN1'), reference('BB量能', 'AM2:BM2')],
      headers: ['督導區', '失敗列數', '唯一訂單', 'V 旗標列'],
      rows: source.regions.map(r => [r.group, r.failures.rows ? format(r.failures.rows) : '缺資料',
        r.failures.rows ? format(r.failures.uniqueOrders) : '缺資料',
        r.failures.rows ? format(r.failures.duplicateCancelFlagged) : '缺資料']),
      additionalTables: [table(['督導區', '標準分類', '唯一訂單', '來源列範圍'], failures, reference('BB明細', 'AY'), '失敗標準分類')],
      issues: unresolved ? ['部分區域未找到紀錄或分類尚未對映；請核對 BB 明細正式原因代碼與完整範圍。'] : [],
      notes: ['範圍限 BB 明細所含業者；訂單於本機去重，重複取消旗標按原始列另計。']
    })
  ];
}

function scores(book, core) {
  if (!core) throw Error('目前無法載入店務解析器，請重新整理後讀取。');
  const { months, errors } = core.parseWorkbook(book);
  if (!months.length) throw Error(errors[0]?.message || '找不到可核對的店務結算月份。');
  const latest = months.at(-1).monthKey;
  const expected = priorMonths(latest, 6);
  const byMonth = new Map(months.map(m => [m.monthKey, m]));
  const needed = expected.filter(m => !byMonth.has(m));
  const selected = expected.flatMap(m => byMonth.has(m) ? [byMonth.get(m)] : []);
  const issues = needed.length ? ['缺少結算月：' + needed.join('、') + '。請提供各月店務正式報表。'] : [];
  issues.push(...errors.filter(e => expected.includes(e.monthKey)).map(e => e.sheetName + '：' + e.message));
  const monthly = selected.map(m => ({
    month: m.monthKey,
    metricsComplete: m.records.every(r => r.deduction != null && r.defects != null),
    deficienciesComplete: m.records.filter(r => r.score < 100 || r.deduction > 0)
      .every(r => r.metrics.some(metric => metric.kind === 'defect' && metric.value > 0))
  }));
  if (monthly.some(m => !m.metricsComplete)) {
    issues.push('部分門市扣分或總缺失未有有效原值，請核對原表 E／F 欄。');
  }
  const current = byMonth.get(latest);
  const scoreRows = current.records.filter(r => r.score < 100 || r.deduction > 0).map(r => {
    const found = r.metrics.filter(m => m.kind === 'defect' && m.value > 0);
    const metrics = found.slice(0, 3).map(m => m.label + ' ' + m.value + '（' + m.cell + '）');
    if (found.length > 3) metrics.push('其餘見原表');
    return [r.region, r.store, format(r.score), format(r.deduction), metrics.join('、') || '缺可核對分項',
      r.source.score.cell];
  });
  if (scoreRows.some(r => r[4] === '缺可核對分項')) issues.push('當月部分未滿分門市缺可核對分項，請補扣分明細及原因。');
  if (!scoreRows.length) {
    scoreRows.push([DEPARTMENT, current.records.length + ' 家門市', '均為 100', '',
      '原G未見未滿分門市', '原G欄']);
  }
  const headers = ['月份', '督導區', '有效店數', '原G平均', '扣分合計', '總缺失'];
  const monthlyTables = expected.map(m => {
    const currentMonth = byMonth.get(m);
    const rows = REGIONS.map(region => {
      if (!currentMonth) return [m, region, '缺資料', '缺資料', '缺資料', '缺資料'];
      const summary = core.summarize(currentMonth.records.filter(r => r.region === region));
      return [m, region, format(summary.storeMonths), summary.mean?.toFixed(2) ?? '缺資料',
        format(summary.deduction), format(summary.defects)];
    });
    return table(headers, rows, currentMonth && reference(currentMonth.sheetName, '門市原G、扣分、缺失與分項欄'), m);
  });
  return report('店務', {
    status: issues.length ? 'partial' : 'read', sourcePeriod: selected.map(m => m.monthKey).join('、'),
    months: selected.map(m => m.monthKey), monthly, coverage: DEPARTMENT,
    evidence: selected.map(m => reference(m.sheetName, '門市原G、扣分、缺失與分項欄')),
    headers, rows: monthlyTables.flatMap(t => t.rows), primaryTables: monthlyTables.filter(t => t.evidence),
    additionalTables: [table(['督導區', '店點', '原G', '扣分', '主要分項及儲存格', '原G儲存格'], scoreRows,
      reference(current.sheetName, '門市原G、扣分及分項儲存格'), latest + ' 當月未滿分與分項')],
    issues
  });
}

const goldErrors = {
  SOURCE_TOTAL_MISMATCH: '全員正式小計與主表淨金牌加總不一致，請核對來源。',
  SOURCE_TOTAL_AMBIGUOUS: '找不到唯一全員正式小計，請選含總計的原檔。',
  SOURCE_DATE_MISSING: '全員主表缺少可核對的資料日期與年份。',
  SOURCE_DATE_AMBIGUOUS: '全員主表找不到唯一資料日期。',
  SOURCE_MONTH_CONFLICT: '全員主表月份與資料日期不一致。',
  MONTH_DUPLICATE: '多個頁籤對應同一月份，請保留唯一原始版本。',
  STAFF_SHEET_MISSING: '找不到可核對的全員主表，請換上含督導區與主表淨金牌的正式檔案。',
  EMPLOYEE_DUPLICATE: '全員主表的識別欄重複，請先於原檔核對並更正。',
  PRIMARY_GOLD_AMBIGUOUS: '全員主表金牌欄位不明確，請核對 SPE 加分總計旁的主欄。',
  PRIMARY_GOLD_FORMULA: '主表淨金牌含公式，請由原系統匯出正式結算值。',
  GOLD_VALUE_MISSING: '主表淨金牌有缺值，請補齊正式結算來源。'
};

function gold(book, xlsx, core, options) {
  if (!core) throw Error('目前無法載入月結金牌解析器，請重新整理後讀取。');
  for (const name of book.SheetNames.filter(name => /全員/.test(name))) rowsOf(book, xlsx, name);
  let months;
  try {
    months = core.parseWorkbook(book, xlsx, { sourceName: options.name, sourceHash: options.sha256 });
  } catch (error) {
    throw Error(goldErrors[error.message] || '全員主表識別欄、月份或金牌數值不符合既定來源格式，請核對正式原檔。');
  }
  const expected = priorMonths(months.at(-1).monthKey, 3);
  const byMonth = new Map(months.map(m => [m.monthKey, m]));
  const selected = expected.flatMap(m => byMonth.has(m) ? [byMonth.get(m)] : []);
  const missing = expected.filter(m => !byMonth.has(m));
  const issues = missing.length ? ['缺少正式月份：' + missing.join('、') + '。請選近三月完整全員主表。'] : [];
  const monthly = selected.map(m => ({ month: m.monthKey, metricsComplete: REGIONS.every(r => m.validation.regions[r].people > 0) }));
  if (monthly.some(m => !m.metricsComplete)) {
    issues.push('部分月份缺督導區人員明細，請核對來源範圍；未提供區域保留缺資料。');
  }
  const headers = ['月份', '督導區', '店數', '人數', '淨金牌'];
  const monthlyTables = expected.map(month => {
    const currentMonth = byMonth.get(month);
    const rows = REGIONS.map(region => {
      const values = currentMonth?.validation.regions[region];
      return [month, region, format(values?.people ? values.stores : null), format(values?.people || null),
        format(values?.people ? values.total : null)];
    });
    return table(headers, rows, currentMonth && reference(currentMonth.sheetName, '主表 ' + currentMonth.mapping.medal + ' 欄及全員小計'), month);
  });
  return report('金牌', {
    status: issues.length ? 'partial' : 'read',
    sourcePeriod: selected.map(m => m.dateRange.start + ' 至 ' + m.dateRange.end).join('、'),
    periodStart: selected[0].dateRange.start, cutoff: selected.at(-1).dateRange.end,
    months: selected.map(m => m.monthKey), monthly,
    coverage: monthly.every(m => m.metricsComplete) ? DEPARTMENT : '僅實際提供的區域',
    evidence: selected.map(m => reference(m.sheetName, '主表 ' + m.mapping.medal + ' 欄及全員小計')),
    headers, rows: monthlyTables.flatMap(t => t.rows), primaryTables: monthlyTables.filter(t => t.evidence),
    issues,
    notes: ['已核對主表淨金牌與正式小計。核對採用前請另確認這一版為公司月結版本。']
  });
}

const layouts = {
  '新復原者／保險': {
    markers: ['手機保險件數', '穿戴保險件數'],
    measures: ['手機保險件數', '手機銷售數', '穿戴保險件數', '穿戴銷售數'],
    extra: ['期別']
  },
  '好速': {
    markers: ['認列口徑'],
    measures: ['實績點數', '目標點數'],
    extra: ['認列口徑']
  }
};
const dateFields = ['資料起日', '資料截止日', '督導區'];
const fieldsForPreview = new Set([
  ...dateFields,
  ...Object.values(layouts).flatMap(m => [...m.measures, ...m.extra]),
  '手機保險銷售數', '手機保險搭售率', '進度達成率', '業務分區', '統計日期', '業績件數', '業績認列'
]);

function readNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  const raw = text(value);
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(raw)) return null;
  const result = Number(raw.replace(/,/g, ''));
  return Number.isFinite(result) ? result : null;
}

function normalizedTable(book, xlsx, key) {
  const layout = layouts[key];
  const fields = [...dateFields, ...layout.extra, ...layout.measures];
  const matches = [];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    if (!sheet?.['!ref']) continue;
    const { s, e } = xlsx.utils.decode_range(sheet['!ref']);
    for (let r = s.r; r <= Math.min(e.r, s.r + 29); r++) {
      const headings = Array.from({ length: Math.min(e.c + 1, 200) }, (_, c) => label(sheet[xlsx.utils.encode_cell({ r, c })]?.v));
      if (layout.markers.every(value => headings.includes(value)) && headings.includes('督導區')) matches.push({ name, row: r, headings });
    }
  }
  if (!matches.length) return null;
  if (matches.length > 1) throw Error('找到多個可對映工作表或重複表頭；請保留單一正確來源。');
  const { name, row, headings } = matches[0];
  const positions = Object.fromEntries(fields.map(field => {
    const at = headings.indexOf(field);
    if (at < 0 || at !== headings.lastIndexOf(field)) throw Error('欄位「' + field + '」缺少或重複，請核對「' + name + '」。');
    return [field, at];
  }));
  const isInsurance = key === '新復原者／保險';
  const rows = rowsOf(book, xlsx, name);
  const seen = new Set();
  const sourceRows = [];
  const issues = [];
  for (let i = row + 1; i < rows.length; i++) {
    const values = rows[i];
    const scope = label(values[positions['督導區']]);
    if (!scope && fields.every(k => !text(values[positions[k]]))) continue;
    if (!REGIONS.includes(scope) && ![DEPARTMENT, '北一二'].includes(scope)) {
      throw Error('第 ' + (i + 1) + ' 列督導區不符合已知範圍，請核對區域欄。');
    }
    const start = getDay(values[positions['資料起日']], xlsx);
    const end = getDay(values[positions['資料截止日']], xlsx);
    if (!start || !end || start > end) throw Error('第 ' + (i + 1) + ' 列缺少有效資料期間，請核對起訖欄。');
    const phase = isInsurance ? label(values[positions['期別']]) : '本期';
    if (isInsurance && !['本期', '比較期'].includes(phase)) throw Error('第 ' + (i + 1) + ' 列期別應標示「本期」或「比較期」。');
    const rowKey = phase + (REGIONS.includes(scope) ? scope : DEPARTMENT);
    if (seen.has(rowKey)) throw Error('同一期別的同一督導區重複；請保留區級唯一正式小計。');
    seen.add(rowKey);
    const numbers = layout.measures.map(field => readNumber(values[positions[field]]));
    if (isInsurance && numbers.some(n => n !== null && !Number.isInteger(n))) throw Error('第 ' + (i + 1) + ' 列的保險與銷售數應為整數。');
    if (isInsurance && (numbers[0] > numbers[1] && numbers[1] != null || numbers[2] > numbers[3] && numbers[3] != null)) {
      throw Error('第 ' + (i + 1) + ' 列保險件數大於銷售數，請核對分母口徑。');
    }
    if (!isInsurance) {
      const rule = label(values[positions['認列口徑']]).replace(/[，,、；;。]/g, '');
      if (!['含企客4G已排除正式降轉', '企客4G納入依正式欄排除降轉'].includes(rule)) {
        issues.push('第 ' + (i + 1) + ' 列未證明企客 4G 已納入及按正式降轉欄排除。');
        continue;
      }
    }
    sourceRows.push({ scope: REGIONS.includes(scope) ? scope : DEPARTMENT, start, end, phase, numbers, row: i + 1 });
  }
  const current = sourceRows.filter(s => s.phase === '本期');
  if (!current.length) throw Error(issues[0] || '資料表缺本期數據，請保留完整原始區級值。');
  const comparison = sourceRows.filter(s => s.phase === '比較期');
  const scopeOf = selected => new Set(selected.map(s => s.scope));
  if ([current, comparison].some(selected => selected.length && new Set(selected.map(s => s.start + s.end)).size !== 1)) {
    throw Error('同一期別的區域列資料日期不一致；請分開匯入各期間。');
  }
  const scope = scopeOf(current);
  if (scope.has(DEPARTMENT) && scope.size > 1) throw Error('同時含部總計與區級小計；請保留單一彙總層級，避免混用分母。');
  if (isInsurance) {
    const otherScope = scopeOf(comparison);
    if (!comparison.length || scope.size !== otherScope.size || [...scope].some(s => !otherScope.has(s))) {
      issues.push('缺少同涵蓋範圍的比較期，請提供手機、穿戴各自件數與分母。');
    } else if (comparison[0].end >= current[0].start) {
      throw Error('比較期與本期相同、重疊或晚於本期，請核對報表起訖。');
    }
  }
  if (sourceRows.some(s => s.numbers.includes(null))) issues.push('部分必要數值缺少或格式不符；請回原表核對，空白保留缺資料。');
  const { start, end } = current[0];
  const fullScope = scope.has(DEPARTMENT) || REGIONS.every(r => scope.has(r));
  const common = {
    status: issues.length ? 'partial' : 'read', sourcePeriod: start + ' 至 ' + end +
      (comparison.length ? '；比較 ' + comparison[0].start + ' 至 ' + comparison[0].end : ''),
    periodStart: start, cutoff: end, months: [end.slice(0, 7)],
    coverage: fullScope ? DEPARTMENT : [...scope].join('／'),
    evidence: [reference(name, '表頭第 ' + (row + 1) + ' 列；資料第 ' + sourceRows[0].row + '–' + sourceRows.at(-1).row + ' 列')],
    issues
  };
  if (isInsurance) {
    return report(key, {
      ...common, headers: ['期別', '督導區', '手機件／銷售', '手機搭售率', '穿戴件／銷售', '穿戴搭售率', '來源列'],
      rows: sourceRows.map(s => {
        const [a, b, c, d] = s.numbers;
        return [s.phase, s.scope, format(a) + '／' + format(b), share(a, b),
          format(c) + '／' + format(d), share(c, d), format(s.row)];
      }),
      notes: ['保險績效與當期新復原者政策分開核對；政策須附行銷原檔及頁碼。']
    });
  }
  return report(key, {
    ...common, headers: ['督導區', '正式實績點數', '正式目標點數', '實績／目標', '來源列'],
    rows: sourceRows.map(s => [s.scope, ...s.numbers.map(format), share(...s.numbers), format(s.row)]),
    notes: ['按來源欄位核對企客 4G 與正式降轉口徑。此表與 BB 長約、失敗來源各自保留期間及範圍。']
  });
}

function supplementarySource(book, key) {
  const sheet = book.SheetNames.find(name => label(name) === ({
    '新復原者／保險': '搭售達成率(手機保險)', '好速': '好速案銷售點數'
  })[key]);
  if (!sheet) return null;
  return report(key, {
    status: 'partial',
    evidence: [reference(sheet, book.Sheets[sheet]?.['!ref'] || '')],
    issues: [key === '好速'
      ? '已辨識好速銷售點數補充表；尚缺可獨立對帳的正式目標、企客 4G／降轉口徑與涵蓋範圍。請勿以此表代替完整公司 KPI 或 BB 三表。'
      : '已辨識手機保險搭售摘要；這張表未提供可獨立對帳的手機銷售分母、穿戴件數及比較期。請補同範圍正式明細。']
  });
}

const unknown = {
  '店務': '請選有各月門市原G、正式扣分與缺失分項欄的店務月報。',
  '舊換新': '請選含「統計表」和四區小計及店級明細的回收報表。',
  '新復原者／保險': '請選本期與比較期報表。可對映欄位為資料起日、資料截止日、督導區、期別、手機保險件數、手機銷售數、穿戴保險件數、穿戴銷售數；其他格式請查原表後補註頁碼或儲存格。',
  '金牌': '請選近三月正式「全員」頁籤，包含資料日期、督導區及主表淨金牌。',
  '好速': '請選同期間公司 KPI 點數。可對映欄位為資料起日、資料截止日、督導區、認列口徑、實績點數、目標點數；其他格式請查原表後補註頁碼或儲存格。',
  '好速長約': '請選同一來源的 BB店點、BB量能、BB明細 三表，保留 12／24／36M 欄及期限。',
  '好速失敗原因': '請選同一來源的 BB店點、BB量能、BB明細 三表，包含截止、標準原因與去重欄。'
};

export function combineMonthlyReportSections(key, parts, meeting) {
  if ((key !== '店務' && key !== '金牌') || !monthKey.test(meeting)) {
    return { complete: false, expectedMonths: [], foundMonths: [], issues: ['請先核對會議月份及月結來源。'] };
  }
  const store = key === '店務';
  const candidates = new Map();
  for (const part of parts || []) {
    if (part?.key !== key || !/^[a-f0-9]{64}$/.test(part.sourceSha256 || '')) continue;
    for (const record of part.monthly || []) {
      if (!monthKey.test(record.month)) continue;
      if (!candidates.has(record.month)) candidates.set(record.month, new Map());
      candidates.get(record.month).set(part.sourceSha256, record);
    }
  }
  const [previousMonth] = priorMonths(meeting, 2);
  const end = store && !candidates.has(meeting) ? previousMonth : meeting;
  const expectedMonths = priorMonths(end, store ? 6 : 3);
  const foundMonths = expectedMonths.filter(month => candidates.has(month));
  const issues = [];
  for (const month of expectedMonths) {
    const versions = candidates.get(month);
    if (!versions?.size) issues.push(month + ' 缺月結來源。');
    else if (versions.size !== 1) issues.push(month + ' 有不同版本，請選定唯一正式來源。');
    else {
      const [record] = versions.values();
      if (!record.metricsComplete) issues.push(month + ' 的四區數據缺資料。');
      if (store && month === end && !record.deficienciesComplete) issues.push(month + ' 的未滿分分項尚缺來源。');
    }
  }
  if ([...candidates.keys()].some(month => month > meeting)) issues.push('選檔含晚於會議月份的月結資料，請核對使用期間。');
  return { complete: !issues.length, expectedMonths, foundMonths, issues };
}

export function readReportWorkbook(book, xlsx, options) {
  if (!book?.SheetNames?.length || !book.Sheets) throw Error('未找到可讀工作表；請在本機另存無巨集 XLSX 或 UTF-8 CSV。');
  if (book.SheetNames.length > 100) throw Error('工作簿超過 100 張工作表，請在本機另存章節需要的完整分檔。');
  const { category, scoresCore, goldCore } = options;
  const all = !categoryKeys.includes(category);
  const sections = [];
  const run = (key, parse) => {
    try {
      const value = parse();
      if (value) sections.push(...(Array.isArray(value) ? value : [value]));
    } catch (error) {
      sections.push(report(key, { status: 'error', issues: [error.message] }));
    }
  };
  const names = book.SheetNames;
  if (category === '店務' || all && names.some(n => /店務管理月報|近半年/.test(n))) {
    run('店務', () => scores(book, scoresCore));
  }
  if (category === '舊換新' || all && names.includes('統計表')) run('舊換新', () => tradein(book, xlsx));
  if (category === '金牌' || all && names.some(n => /全員/.test(n))) run('金牌', () => gold(book, xlsx, goldCore, options));
  if (category === '新復原者／保險' || all) {
    run('新復原者／保險', () => normalizedTable(book, xlsx, '新復原者／保險') || supplementarySource(book, '新復原者／保險'));
  }
  if (category?.startsWith('好速') || all) {
    if (names.some(n => /^BB(?:店點|量能|明細)$/.test(n))) {
      run(category?.startsWith('好速') ? category : '好速', () => goodspeed(book, xlsx));
    }
    if (category === '好速' || all) {
      const previous = sections.find(s => s.key === '好速');
      const existingCount = sections.length;
      run('好速', () => normalizedTable(book, xlsx, '好速') || (!previous && supplementarySource(book, '好速')));
      if (previous && sections.length > existingCount) {
        const official = sections.pop();
        if (official.status === 'error' && previous.rows.length) previous.issues.push(...official.issues);
        else sections[sections.indexOf(previous)] = official;
      }
    }
  }
  if (!all && !sections.some(section => section.key === category)) {
    sections.push(report(category, { status: 'partial', issues: [unknown[category]] }));
  }
  return { sheets: previewSheets(book, xlsx), sections };
}
