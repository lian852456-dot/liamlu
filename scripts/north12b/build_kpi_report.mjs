import {comparison} from './dod.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { FileBlob, SpreadsheetFile, Workbook } from '@oai/artifact-tool';
import {repairSemanticFormats,renderOptions} from './semantic-format.mjs';
try {





const required = key => { if(!process.env[key]) throw new Error(`Missing runtime setting: ${key}`); return process.env[key]; };
const root = required('RUN_ROOT');
const outDir = required('OUT_DIR');
const previewDir = path.join(outDir, 'previews');
await fs.mkdir(previewDir, { recursive: true });

const reportDate = required('REPORT_DATE');
const generatedDate = required('GENERATED_DATE');
const cutoffDate = required('CUTOFF_DATE');
const sourceRange = required('SOURCE_RANGE');
const sourceFile = required('SOURCE_FILE');
const sourceStem = process.env.SOURCE_STEM ?? path.parse(sourceFile).name;
const sourceLocal = process.env.SOURCE_LOCAL ?? sourceFile;
const previousSourcePath = process.env.PREVIOUS_SOURCE_PATH ?? path.join(root, 'missing-previous.xlsx');
const templatePath = process.env.TEMPLATE_PATH ?? path.join(root, 'template-v4.xlsx');
const previousKpiPath = process.env.PREVIOUS_KPI_PATH ?? path.join(root, 'previous-kpicalc-unavailable.json');
const currentKpiPath = process.env.CURRENT_KPI_PATH ?? path.join(root, `kpicalc-${sourceStem}-corrected.json`);
const dailyPath = process.env.DAILY_PATH ?? path.join(root, 'daily-kpi-data.json');
const sourceValuesPath = process.env.SOURCE_VALUES_PATH ?? path.join(root, `${sourceStem}-source-values.json`);
const closureAuditPath = process.env.CLOSURE_AUDIT_PATH ?? path.join(root, `closure-audit-${sourceStem}.json`);
const previousInsuranceCutoff = process.env.PREVIOUS_INSURANCE_CUTOFF ?? '待確認';
const insuranceCutoff = process.env.INSURANCE_CUTOFF ?? '待確認';
const qisCutoff = process.env.QIS_CUTOFF ?? '待確認';
const awardsCutoff = process.env.AWARDS_CUTOFF ?? cutoffDate;
// The renderer must use a font that is actually installed in the runtime.
// "Noto Sans CJK TC" previously fell back to DejaVu Sans, which has no CJK
// glyphs, so every Traditional Chinese label disappeared from the PNGs.
const CJK_FONT = 'Noto Sans TC';
const fmtNum = (value) => Number.isInteger(value) ? String(value) : Number(value).toFixed(2).replace(/0+$/, '').replace(/[.]$/, '');

const daily = JSON.parse(await fs.readFile(dailyPath, 'utf8'));
const currentKpi = JSON.parse(await fs.readFile(currentKpiPath, 'utf8'));
let previousKpi;
try { previousKpi=JSON.parse(await fs.readFile(previousKpiPath,'utf8')); } catch(e) { if(e.code!=='ENOENT') throw e; previousKpi={meta:{},stores:[],persons:[]}; }
const sourceBook = JSON.parse(await fs.readFile(sourceValuesPath, 'utf8'));
const closureAudit = JSON.parse(await fs.readFile(closureAuditPath, 'utf8'));

// 締結率使用來源檔中明確命名的分子／分母表，不以分母表內的
// 「是否已續約」欄位替代分子，避免來源口徑混用。
const closureDenominatorHeader = sourceBook['續約率(分母)']?.values?.[0];
const closureNumeratorHeader = sourceBook['續約率(分子)']?.values?.[0];
if (!closureDenominatorHeader || !closureNumeratorHeader) {
  throw new Error('closure-rate source gate failed: numerator or denominator sheet missing');
}
const closureDenominatorRows = sourceBook['續約率(分母)'].values.slice(1)
  .filter((row) => row?.[1] === '北一二B');
const closureNumeratorRows = sourceBook['續約率(分子)'].values.slice(1)
  .filter((row) => row?.[1] === '北一二B');
const normalizeStoreName = (name) => String(name ?? '').includes('三創') ? '台北三創' : String(name ?? '');
const closureStoreCodes = [...new Set(closureDenominatorRows.map((row) => String(row[2] ?? '')))].filter(Boolean);
if (closureStoreCodes.length !== 9) throw new Error(`closure-rate store gate failed: ${closureStoreCodes.length}`);
const denominatorKeySet = new Set(closureDenominatorRows.map((row) => `${row[6]}|${row[2]}|${row[7]}`));
const numeratorKeys = closureNumeratorRows.map((row) => `${row[6]}|${row[2]}|${row[11]}`);
if (denominatorKeySet.size !== closureDenominatorRows.length || new Set(numeratorKeys).size !== closureNumeratorRows.length) {
  throw new Error('closure-rate unique-key gate failed');
}
const missingNumeratorKeys = numeratorKeys.filter((key) => !denominatorKeySet.has(key));
if (missingNumeratorKeys.length) throw new Error(`closure-rate reconciliation failed: ${missingNumeratorKeys.length} numerator keys absent from denominator`);
const closureDateSerials = [...new Set(closureDenominatorRows.map((row) => Number(row[6])))]
  .filter(Number.isFinite).sort((a, b) => a - b);
const latestClosureSerial = closureDateSerials.at(-1);
const closureOverall = {
  denominator: Number(closureAudit.latest.denominator),
  numerator: Number(closureAudit.latest.numerator),
};
closureOverall.rate = closureOverall.numerator / closureOverall.denominator;
if (closureAudit.daily.length !== 10 || closureAudit.dates.length !== 3 || closureOverall.denominator <= 0) {
  throw new Error('closure-rate near-three-day gate failed');
}
const closureUnclosedTotal = Number(closureAudit.latest.formal_cases)
  + Number(closureAudit.latest.unassigned_cases) + Number(closureAudit.latest.anomaly_cases);
if (closureUnclosedTotal !== closureAudit.latest.gap) {
  throw new Error(`closure-rate unclosed reconciliation failed: ${closureUnclosedTotal}/${closureAudit.latest.gap}`);
}

// An available prior-day source is authoritative for DOD columns. The
// previous report workbook is presentation output and is not a source file.
let previousInsuranceSourceRows = [];
try {
 const prior = await SpreadsheetFile.importXlsx(await FileBlob.load(previousSourcePath));
 const sheet=prior.worksheets.items.find(s=>s.name==='搭售達成率 (手機保險)');
 previousInsuranceSourceRows=sheet?.getUsedRange().values ?? [];
} catch(e) { if(e.code!=='ENOENT' && !String(e.message).includes('ENOENT')) throw e; }

const report = await SpreadsheetFile.importXlsx(
  await FileBlob.load(templatePath),
);

const summaryRows = daily.summary;
const storeData = new Map(daily.stores.map((row) => [row.store, row]));
const aggregateData = new Map(daily.items.map((row) => [row.key, row.rate]));
const normalizeKey = (key) => String(key ?? '')
  .replaceAll('（', '(').replaceAll('）', ')')
  .replaceAll('、物聯網及門市購', '及門市')
  .replaceAll('營收', '營收');

function itemRate(store, key) {
  const target = normalizeKey(key);
  if (store === '北一二B整體') {
    for (const [k, rate] of aggregateData.entries()) {
      if (normalizeKey(k) === target) return rate;
    }
    return null;
  }
  const row = storeData.get(store);
  const item = row?.items?.find((entry) => normalizeKey(entry.key) === target);
  return item?.reportRate ?? null;
}

const mainColumns = [
  '5G銷售數',
  'TTL AQ上線點數',
  '自退數',
  '解約後NP OUT',
  '解約後NP OUT(督導績)',
  'AQ V+D 999 (含)以上',
  'AQ V+D 1399 (含)以上',
  '預付卡開卡面額',
  'RT上線點數',
  '特殊維繫用戶續約數',
  '高高特維用戶續約數',
  'RT V+D 999 (含)以上',
  'RT V+D 1399 (含)以上',
  '好速案銷售點數',
];
const addonColumns = [
  'Device專案銷售數',
  '重點Device銷售量',
  '換約淨新增金額',
  '空機、3C、物聯網及門市購營收',
  '配件及其他營收',
  '包膜與保貼營收',
  '手機保險服務點數',
  'MyVideo&KKBOX',
  'Apple&Google服務及雜誌週刊開通數',
  'HBO Max&Disney+&Prime Video銷售數',
  'Netflix多享組銷售數',
];

function setRateRules(range, baseFill = '#F8FAFC') {
  range.format.fill = baseFill;
  range.format.font = { color: '#059669', bold: true };
  range.conditionalFormats.deleteAll();
  range.conditionalFormats.add('cellIs', {
    operator: 'lessThan', formula: 1,
    format: { fill: '#FDE2E2', font: { color: '#DC2626', bold: true } },
  });
}

function setAttachRateRules(range, baseFill = '#F8FAFC') {
  range.format.fill = baseFill;
  range.format.font = { color: '#334155', bold: true };
  range.conditionalFormats.deleteAll();
  range.conditionalFormats.add('cellIs', {
    operator: 'lessThan', formula: 0.5,
    format: { fill: '#FDE2E2', font: { color: '#DC2626', bold: true } },
  });
}

function setDeltaRules(range) {
  range.format.fill = '#F8FAFC';
  range.format.font = { color: '#334155', bold: true };
  range.conditionalFormats.deleteAll();
  range.conditionalFormats.add('cellIs', {
    operator: 'greaterThan', formula: 0,
    format: { fill: '#DCFCE7', font: { color: '#059669', bold: true } },
  });
  range.conditionalFormats.add('cellIs', {
    operator: 'lessThan', formula: 0,
    format: { fill: '#FDE2E2', font: { color: '#DC2626', bold: true } },
  });
}

function serialToDate(serial) {
  return new Date(Date.UTC(1899, 11, 30) + Number(serial) * 86400000);
}

function buildClosureSummary(workbook, sheetName = '締結率') {
  const sheet = workbook.worksheets.add(sheetName);
  sheet.showGridLines = false;
  sheet.getRange('A1:E1').merge();
  sheet.getRange('A1').values = [[`北一二B 締結率｜${reportDate}`]];
  sheet.getRange('A1:E1').format = {
    fill: '#173463', font: { size: 22, bold: true, color: '#FFFFFF' },
    horizontalAlignment: 'center', verticalAlignment: 'center', rowHeight: 42,
  };
  sheet.getRange('A2:E2').merge();
  sheet.getRange('A2').values = [[
    `來源：${sourceFile}「續約率(分子)／續約率(分母)」｜最近三個實際資料日｜締結率＝分子用戶人數 ÷ 分母用戶人數`,
  ]];
  sheet.getRange('A2:E2').format = {
    fill: '#EFF6FF', font: { size: 10, color: '#475569', bold: true },
    horizontalAlignment: 'center', verticalAlignment: 'center', rowHeight: 28,
  };
  const dateHeaders = closureAudit.dates;
  sheet.getRange('A4:E4').values = [['店點', ...dateHeaders, 'DOD']];
  sheet.getRange('A4:E4').format = {
    fill: '#FACC15', font: { size: 11, bold: true, color: '#111827' },
    horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true, rowHeight: 34,
    borders: { preset: 'all', style: 'thin', color: '#94A3B8' },
  };
  const cellText = (cell) => cell.denominator == null
    ? '尚未有資料'
    : cell.denominator === 0 ? '—'
    : `${fmtNum(cell.numerator)}/${fmtNum(cell.denominator)}＝${(cell.rate * 100).toFixed(1)}%`;
  const rows = closureAudit.daily.map((row) => [
    normalizeStoreName(row.store), ...row.cells.map(cellText), row.dod_pp,
  ]);
  sheet.getRange('A5:E14').values = rows;
  sheet.getRange('A5:E14').format = {
    font: { size: 11, color: '#0F172A' },
    verticalAlignment: 'center', rowHeight: 30,
    borders: { preset: 'all', style: 'thin', color: '#CBD5E1' },
  };
  sheet.getRange('A5:E5').format = {
    fill: '#FEF3C7', font: { size: 11, bold: true, color: '#0F172A' },
    borders: { preset: 'all', style: 'thin', color: '#94A3B8' },
  };
  sheet.getRange('E5:E14').format.numberFormat = '+0.0"pp";-0.0"pp";0.0"pp"';
  sheet.getRange('E5:E14').conditionalFormats.add('cellIs', {
    operator: 'lessThan', formula: 0,
    format: { fill: '#FEE2E2', font: { color: '#DC2626', bold: true } },
  });
  sheet.getRange('E5:E14').conditionalFormats.add('cellIs', {
    operator: 'greaterThanOrEqual', formula: 0,
    format: { fill: '#DCFCE7', font: { color: '#059669', bold: true } },
  });
  sheet.getRange('A17:D17').values = [['統計日期', '店點', '同仁／分類', '未締結件數']];
  sheet.getRange('A17:D17').format = {
    fill: '#2563EB', font: { size: 10, bold: true, color: '#FFFFFF' },
    horizontalAlignment: 'center', verticalAlignment: 'center', rowHeight: 28,
    borders: { preset: 'all', style: 'thin', color: '#94A3B8' },
  };
  const unclosedRows = closureAudit.latest.formal_unclosed.map((row) => [
    closureAudit.latest.date, normalizeStoreName(row.store), row.name, row.count,
  ]);
  unclosedRows.push([
    closureAudit.latest.date, '北一二B整體', '未歸屬／系統案件', closureAudit.latest.unassigned_cases,
  ]);
  unclosedRows.push([
    closureAudit.latest.date, '北一二B整體', '分子／分母對帳異常', closureAudit.latest.anomaly_cases,
  ]);
  const unclosedStart = 18;
  const unclosedEnd = unclosedStart + unclosedRows.length - 1;
  sheet.getRange(`A${unclosedStart}:D${unclosedEnd}`).values = unclosedRows;
  sheet.getRange(`A${unclosedStart}:D${unclosedEnd}`).format = {
    font: { size: 10, color: '#0F172A' }, rowHeight: 26,
    borders: { preset: 'all', style: 'thin', color: '#CBD5E1' },
  };
  sheet.getRange(`D${unclosedStart}:D${unclosedEnd}`).format.numberFormat = '0';
  sheet.getRange(`A${unclosedEnd + 2}:E${unclosedEnd + 2}`).merge();
  sheet.getRange(`A${unclosedEnd + 2}`).values = [[
    `對帳：正式同仁 ${closureAudit.latest.formal_staff_count} 人／${closureAudit.latest.formal_cases} 件＋未歸屬／系統 ${closureAudit.latest.unassigned_cases} 件＋異常 ${closureAudit.latest.anomaly_cases} 件＝分母 ${closureAudit.latest.denominator}－分子 ${closureAudit.latest.numerator}＝${closureAudit.latest.gap} 件。`,
  ]];
  sheet.getRange(`A${unclosedEnd + 2}:E${unclosedEnd + 2}`).format = {
    fill: '#EFF6FF', font: { size: 10, color: '#1E3A8A', bold: true },
    verticalAlignment: 'center', rowHeight: 28,
  };
  sheet.getRange(`A1:A${unclosedEnd + 2}`).format.columnWidthPx = 210;
  sheet.getRange(`B1:D${unclosedEnd + 2}`).format.columnWidthPx = 180;
  sheet.getRange(`E1:E${unclosedEnd + 2}`).format.columnWidthPx = 95;
  sheet.freezePanes.freezeRows(4);
  return { sheet, lastRow: unclosedEnd + 2, unclosedRows };
}

function buildClosureUnclosedSheet(workbook, sheetName = '當日未締結同仁') {
  const sheet = workbook.worksheets.add(sheetName);
  sheet.showGridLines = false;
  const rows = closureAudit.latest.formal_unclosed.map((row) => [
    closureAudit.latest.date, normalizeStoreName(row.store), row.name, row.count,
  ]);
  rows.push([closureAudit.latest.date, '北一二B整體', '未歸屬／系統案件', closureAudit.latest.unassigned_cases]);
  rows.push([closureAudit.latest.date, '北一二B整體', '分子／分母對帳異常', closureAudit.latest.anomaly_cases]);
  sheet.getRange(`A1:D${rows.length + 1}`).values = [
    ['統計日期', '店點', '同仁／分類', '未締結件數'], ...rows,
  ];
  sheet.getRange('A1:D1').format = {
    fill: '#173463', font: { size: 11, bold: true, color: '#FFFFFF' },
    horizontalAlignment: 'center', verticalAlignment: 'center', rowHeight: 30,
  };
  sheet.getRange(`A2:D${rows.length + 1}`).format = {
    font: { size: 10, color: '#0F172A' }, rowHeight: 24,
    borders: { preset: 'inside', style: 'thin', color: '#CBD5E1' },
  };
  sheet.getRange(`A1:A${rows.length + 1}`).format.columnWidthPx = 115;
  sheet.getRange(`B1:B${rows.length + 1}`).format.columnWidthPx = 190;
  sheet.getRange(`C1:C${rows.length + 1}`).format.columnWidthPx = 170;
  sheet.getRange(`D1:D${rows.length + 1}`).format.columnWidthPx = 100;
  sheet.freezePanes.freezeRows(1);
  return sheet;
}

function buildClosureRawSheet(workbook, sheetName, header, rows, dateColumns) {
  const sheet = workbook.worksheets.add(sheetName);
  sheet.showGridLines = false;
  const normalizedRows = rows.map((row) => row.map((value, index) => {
    if (dateColumns.includes(index) && Number.isFinite(Number(value))) return serialToDate(value);
    return value ?? null;
  }));
  const lastColumn = colName(header.length);
  const lastRow = normalizedRows.length + 1;
  sheet.getRange(`A1:${lastColumn}${lastRow}`).values = [header, ...normalizedRows];
  sheet.getRange(`A1:${lastColumn}1`).format = {
    fill: '#173463', font: { size: 10, bold: true, color: '#FFFFFF' },
    horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true, rowHeight: 34,
  };
  sheet.getRange(`A2:${lastColumn}${lastRow}`).format = {
    font: { size: 9, color: '#0F172A' }, rowHeight: 22,
  };
  for (const index of dateColumns) {
    const column = colName(index + 1);
    sheet.getRange(`${column}2:${column}${lastRow}`).format.numberFormat = 'yyyy-mm-dd';
  }
  sheet.getRange(`A1:${lastColumn}${lastRow}`).format.borders = { preset: 'inside', style: 'thin', color: '#E2E8F0' };
  sheet.getRange(`A1:${lastColumn}${lastRow}`).format.columnWidthPx = 105;
  sheet.getRange(`D1:D${lastRow}`).format.columnWidthPx = 150;
  sheet.getRange(`I1:I${lastRow}`).format.columnWidthPx = 120;
  sheet.getRange(`N1:N${lastRow}`).format.columnWidthPx = 280;
  if (header.length >= 17) sheet.getRange(`Q1:Q${lastRow}`).format.columnWidthPx = 280;
  sheet.tables.add(`A1:${lastColumn}${lastRow}`, true, `${sheetName === '分母明細' ? 'ClosureDenominator' : 'ClosureNumerator'}Table`);
  sheet.freezePanes.freezeRows(1);
  sheet.freezePanes.freezeColumns(4);
  return sheet;
}

// 1. 主力 KPI：沿用昨日 22 欄正式矩陣。
{
  const sheet = report.worksheets.getItem('主力KPI');
  sheet.getRange('A1').values = [['北一二B 主力KPI達成狀況']];
  const sameMonthDod = daily.meta.sameMonthDod === true;
  const rows = summaryRows.map((s) => [
    '北一二B', normalizeStoreName(s.store), s.rank, s.overall,
    sameMonthDod ? s.rank + s.rank_dod : '暫不比較',
    sameMonthDod ? s.rank_dod : '暫不比較',
    sameMonthDod ? s.overall - s.overall_dod : '暫不比較',
    sameMonthDod ? null : '暫不比較',
    ...mainColumns.map((key) => itemRate(s.store, key)),
  ]);
  sheet.getRange('A4:V13').values = rows;
  if (sameMonthDod) {
    sheet.getRange('H4').formulas = [['=D4-G4']];
    sheet.getRange('H4:H13').fillDown();
  }
  sheet.getRange('A2').values = [[`產出日期：${generatedDate}`]];
  setRateRules(sheet.getRange('D4:D13'));
  setRateRules(sheet.getRange('G4:G13'));
  setRateRules(sheet.getRange('I4:V13'));
  setDeltaRules(sheet.getRange('F4:F13'));
  setDeltaRules(sheet.getRange('H4:H13'));
  sheet.getRange('A4:V4').format.fill = '#DCEEFF';
  sheet.getRange('C4:V13').format.numberFormat = '0.0%';
  sheet.getRange('C4:C13').format.numberFormat = '0';
  sheet.getRange('E4:F13').format.numberFormat = '0';
}

// 2. 加掛得分：沿用昨日 18 欄正式矩陣與店內排名。
{
  const sheet = report.worksheets.getItem('加掛得分');
  sheet.getRange('A1').values = [['北一二B 加掛類得分大盤解析']];
  sheet.getRange('A2').values = [[`產出日期：${generatedDate}`]];
  const stores = summaryRows.slice(1);
  const localRank = new Map(stores.map((s, i) => [s.store, i + 1]));
  const sameMonthDod = daily.meta.sameMonthDod === true;
  const rows = summaryRows.map((s) => [
    '北一二B', normalizeStoreName(s.store), s.store === '北一二B整體' ? '-' : localRank.get(s.store),
    s.overall, s.addon,
    sameMonthDod ? s.addon - s.addon_dod : '暫不比較',
    sameMonthDod ? null : '暫不比較',
    ...addonColumns.map((key) => itemRate(s.store, key)),
  ]);
  sheet.getRange('A4:R13').values = rows;
  if (sameMonthDod) {
    sheet.getRange('G4').formulas = [['=E4-F4']];
    sheet.getRange('G4:G13').fillDown();
  }
  setRateRules(sheet.getRange('D4:D13'));
  setRateRules(sheet.getRange('H4:R13'));
  setDeltaRules(sheet.getRange('G4:G13'));
  sheet.getRange('E4:F13').format.fill = '#FFF3C4';
  sheet.getRange('E4:F13').format.font = { color: '#B45309', bold: true };
  sheet.getRange('E4:F13').conditionalFormats.deleteAll();
  sheet.getRange('E4:F13').conditionalFormats.add('cellIs', {
    operator: 'greaterThanOrEqual', formula: 15,
    format: { fill: '#D9F99D', font: { color: '#166534', bold: true } },
  });
  sheet.getRange('E4:F13').conditionalFormats.add('cellIs', {
    operator: 'lessThan', formula: 15,
    format: { fill: '#FECACA', font: { color: '#B91C1C', bold: true } },
  });
  sheet.getRange('D4:D13').format.numberFormat = '0.0%';
  sheet.getRange('E4:G13').format.numberFormat = '0.00';
  sheet.getRange('H4:R13').format.numberFormat = '0.0%';
  const under = stores.filter((s) => s.addon < 15).map((s) => normalizeStoreName(s.store));
  sheet.getRange('A15').values = [[
    `經營績效追蹤，北一二B加掛類未達15分共 ${under.length} 家：${under.join('、')}，請督導加強輔導相關指標！`,
  ]];
}

let goodspeedLastRow = 10;

// 3. 好速上線明細：公司正式口徑；企客、4G及BB加掛均可認列，
// 僅來源標記降轉／剔除者排除。戰報加碼另列，不回灌公司KPI。
{
  const sheet = report.worksheets.getItem('好速上線明細');
  const values = sourceBook['好速案銷售點數'].values;
  const rows = values.slice(1).filter((row) => row?.[1] === '北一二B' && Number(row?.[5]) === latestClosureSerial);
  const detail = rows.map((row) => {
    const text = [4,15,18,20].map(i=>String(row[i] ?? '')).join(' ');
    const accepted = !String(row[4] ?? '').includes('剔除');
    const term = text.match(/\((24|36|48)\)/)?.[1] ?? '24';
    const bandwidth = String(row[19] ?? '');
    const sourcePoints = Number(row[30] ?? 0);
    const bonus36 = accepted && term === '36' ? 0.5 : 0;
    const is500 = /500M/i.test(bandwidth);
    const is1g = /(^|[^0-9])1(?:\.\d+)?G/i.test(bandwidth);
    const battleBonus = accepted && (is500 || is1g) ? 0.5 : 0;
    const disposition = accepted ? '認列（公司）' : '來源剔除';
    return [
      String(row[2] ?? '').includes('三創') ? '台北三創' : row[2], row[5], row[11], disposition, row[15], bandwidth, `${term}M`,
      bonus36, is500 ? '500M' : '—', is1g ? '1G' : '—', battleBonus,
      sourcePoints, accepted ? sourcePoints + battleBonus : 0, null, null,
    ];
  });
  const acceptedRows = detail.filter((row) => String(row[3]).startsWith('認列'));
  const excludedRows = detail.filter((row) => !String(row[3]).startsWith('認列'));
  const sourcePoints = acceptedRows.reduce((sum, row) => sum + row[11], 0);
  const bonus36 = acceptedRows.reduce((sum, row) => sum + row[7], 0);
  const battleBonus = acceptedRows.reduce((sum, row) => sum + row[10], 0);
  const total = acceptedRows.reduce((sum, row) => sum + row[12], 0);
  const audit = daily.meta.goodspeed;
  sheet.getRange('A1').values = [[`北一二B 好速上線明細｜${reportDate}`]];
  sheet.getRange('A2:O3').unmerge();
  sheet.getRange('A2:O2').values = [['店點','統計日期','同仁','認列狀態','產品／方案','頻寬','約期','36M加碼','500M','1G','速率加碼','當日公司認列點數','當日戰報含另加點數','來源註記','對帳註記']];
  sheet.getRange(`A3:O${Math.max(60,detail.length+20)}`).unmerge();
  sheet.getRange(`A3:O${Math.max(60,detail.length+20)}`).clear({ applyTo: 'all' });
  const detailEnd = Math.max(8, 2 + detail.length);
  goodspeedLastRow = detailEnd + 3;

  if (detail.length) sheet.getRange(`A3:O${2 + detail.length}`).values = detail;
  sheet.getRange(`B3:B${detailEnd}`).format.numberFormat = 'yyyy-mm-dd';
  sheet.getRange(`A2:O${detailEnd}`).format.borders = { preset: 'all', style: 'thin', color: '#94A3B8' };
  sheet.getRange(`A3:A${detailEnd}`).format.columnWidthPx = 175;
  sheet.getRange(`C3:C${detailEnd}`).format.columnWidthPx = 86;
  sheet.getRange(`D3:D${detailEnd}`).format.columnWidthPx = 112;
  sheet.getRange(`A3:O${detailEnd}`).format.rowHeight = 34;
  for (let row = 3; row <= 2 + detail.length; row += 1) {
    const recognized = String(detail[row - 3][3]).startsWith('認列');
    sheet.getRange(`D${row}`).format = recognized
      ? { fill: '#DCFCE7', font: { color: '#166534', bold: true } }
      : { fill: '#FEE2E2', font: { color: '#DC2626', bold: true } };
  }
  const sourceNoteRow = goodspeedLastRow - 1;
  for (const r of [sourceNoteRow, goodspeedLastRow]) sheet.getRange(`A${r}:O${r}`).merge();
  sheet.getRange(`A${sourceNoteRow}`).values = [[
    `資料日：${cutoffDate}｜來源：${sourceFile}｜當日認列 ${acceptedRows.length} 筆／來源剔除 ${excludedRows.length} 筆｜公司累計實績 ${fmtNum(audit.companyActual)} 點／月目標 ${fmtNum(audit.companyTarget)} 點／達成率 ${(Number(audit.companyRate)*100).toFixed(1)}%。`,
  ]];
  sheet.getRange(`A${goodspeedLastRow}`).values = [[audit.rule]];
  sheet.getRange(`A${sourceNoteRow}:O${goodspeedLastRow}`).format = {
    fill: '#EFF6FF', font: { size: 10, color: '#1E3A8A', bold: true },
    horizontalAlignment: 'left', verticalAlignment: 'center', rowHeight: 28,
  };
}

// 4. 手機保險：前次與本次來源逐店對齊，完整呈現前日、今日與 DOD。
{
  const sheet = report.worksheets.getItem('手機保險');
  sheet.getRange('A1').values = [[`北一二B 手機保險追蹤｜${reportDate}`]];
  sheet.getRange('A2:I3').unmerge();
  sheet.getRange('A2:I2').values = [['店點','前次來源進度達成率','本次來源進度達成率','DOD（百分點）','前次來源搭售率','本次來源搭售率','DOD（百分點）','銷售數','月目標']];
  sheet.getRange('A3:I20').clear({ applyTo: 'contents' });
  const sourceRows = sourceBook['搭售達成率 (手機保險)']?.values ?? [];
  const insuranceAvailable = sourceRows.some((row) => row?.[0] === '北一二B');
  const aggregate = sourceRows.find((row, i) => i < 10 && row?.[0] === '北一二B');
  const stores = sourceRows.filter((row, i) => i >= 10 && String(row?.[0] ?? '').startsWith('DNB'));
  const previousAggregate = previousInsuranceSourceRows.find((row, i) => i < 10 && row?.[0] === '北一二B');
  const previousStores = new Map(
    previousInsuranceSourceRows
      .filter((row, i) => i >= 10 && String(row?.[0] ?? '').startsWith('DNB'))
      .map((row) => [row[0], row]),
  );
  const byCode = new Map(stores.map(row=>[row[0],row]));
  const insuranceRows = [
    ['北一二B整體', previousAggregate, aggregate],
    ...currentKpi.stores.map(s=>[normalizeStoreName(s.name),previousStores.get(s.code),byCode.get(s.code)]),
  ].map(([label,prev,cur])=>[label,prev?.[6] ?? '尚未有資料',cur?.[6] ?? '尚未有資料','暫不比較',prev?.[7] ?? '尚未有資料',cur?.[7] ?? '尚未有資料','暫不比較',cur?.[2] ?? '尚未有資料',cur?.[5] ?? '尚未有資料']);
  sheet.getRange('A3:I12').values=insuranceRows;
  sheet.getRange('B3:G12').format.numberFormat='0.0%';
  sheet.getRange('H3:I12').format.numberFormat='0.00';
  setRateRules(sheet.getRange('B3:C12'));
  setAttachRateRules(sheet.getRange('E3:F12'));
  sheet.getRange('A14:I14').merge();
  sheet.getRange('A14').values = [[insuranceAvailable
    ? `來源：前日來源（截至 ${previousInsuranceCutoff}）與 ${sourceFile}（截至 ${insuranceCutoff}）；DOD＝今日－前日。`
    : `來源：${sourceFile}｜手機保險尚未有資料；未補0、未沿用前月，DOD暫不比較。`]];
}

// 5. QIS 店績：重建今日來源。
{
  const sheet = report.worksheets.getItem('QIS店績');
  sheet.getRange('A1').values = [[`北一二B QIS店績｜${reportDate}`]];
  sheet.getRange('A2:F3').unmerge();
  sheet.getRange('A2:F2').values = [['店點','達成率','計件數','服務態度','專業能力','原始分數']];
  sheet.getRange('A3:F20').clear({ applyTo: 'contents' });
  const sourceRows = sourceBook['QIS店績']?.values ?? [];
  const stores = sourceRows.filter((row) => row?.[2] === '北一二B' && String(row?.[3] ?? '').startsWith('DNB'));
  const qisAvailable = stores.length === 9;
  const aggregate = sourceRows.find((row) => row?.[0] === '北一二區' && row?.[2] === '北一二B' && row?.[3] === 9);
  const totalCases = stores.reduce((sum, row) => sum + Number(row[7] ?? 0), 0);
  // QIS店績的整體原始分數是9店算術平均（來源原始總分÷下轄店數），
  // 不是按件數加權；服務態度與專業能力亦採相同口徑。
  const storeAverage = (valueIndex) => stores.length === 0 ? null : stores.reduce(
    (sum, row) => sum + Number(row[valueIndex] ?? 0), 0,
  ) / stores.length;
  const aggregateService = storeAverage(8);
  const aggregateProfessional = storeAverage(9);
  let qisRows = [
    [
      '北一二B整體', stores.reduce((sum, row) => sum + Number(row[5] ?? 0), 0) / 9,
      totalCases, aggregateService, aggregateProfessional, aggregate?.[5] ?? null,
    ],
    ...stores.map((row) => [
      String(row[4] ?? '').includes('三創') ? '台北三創' : row[4],
      row[5] ?? null, row[7] ?? null, row[8] ?? null, row[9] ?? null, row[10] ?? null,
    ]),
  ];
  if (!qisAvailable) {
    qisRows = [
      ['北一二B整體', ...Array(5).fill('尚未有資料')],
      ...currentKpi.stores.map((s) => [normalizeStoreName(s.name), ...Array(5).fill('尚未有資料')]),
    ];
  }
  if (qisRows.length !== 10) throw new Error(`QIS row gate failed: ${qisRows.length}`);
  if (qisAvailable && Math.abs(((aggregateService + aggregateProfessional) / 2) - Number(aggregate?.[5])) > 0.05) {
    throw new Error('QIS nine-store aggregate reconciliation failed');
  }
  sheet.getRange('A3:F12').values = qisRows;
  sheet.getRange('A14:F14').merge();
  sheet.getRange('A14').values = [[qisAvailable
    ? `來源為 ${sourceFile}；截至 ${qisCutoff}；整體服務態度與專業能力按9店平均，計件數共${totalCases}件。`
    : `來源：${sourceFile}｜QIS尚未有資料；未補0、未沿用前月。`]];
  if (qisAvailable) {
    sheet.getRange('B3:B12').format.numberFormat = '0.0%';
    sheet.getRange('C3:C12').format.numberFormat = '0';
    sheet.getRange('D3:F12').format.numberFormat = '0.00';
    setRateRules(sheet.getRange('B3:B12'));
    sheet.getRange('F3:F12').conditionalFormats.deleteAll();
    sheet.getRange('F3:F12').conditionalFormats.add('cellIs', {
      operator: 'lessThan', formula: 98,
      format: { fill: '#FDE2E2', font: { color: '#DC2626', bold: true } },
    });
  }
}

// 6. 締結率：正式分子／分母口徑，店點與單日趨勢均以公式計算。
const closureLayout = buildClosureSummary(report, '締結率');

// 7. 主管摘要：重建 Top/Bottom 與缺口。
{
  const sheet = report.worksheets.getItem('主管摘要');
  sheet.getRange('A1').values = [['主管摘要']];
  const stores = summaryRows.slice(1);
  const under = stores.filter((s) => s.addon < 15);
  const addonTop = [...stores].sort((a, b) => b.addon - a.addon).slice(0, 3);
  const addonBottom = [...stores].sort((a, b) => a.addon - b.addon).slice(0, 3);
  const rankTop = [...stores].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const rankBottom = [...stores].sort((a, b) => b.rank - a.rank).slice(0, 3);
  const addonLow = addonColumns.map((key) => [
    ({
      'Device專案銷售數': 'Device專案銷售', '空機、3C、物聯網及門市購營收': '空機、3C及門市營收',
      '包膜與保貼營收': '包膜與保貼', '手機保險服務點數': '手機保險',
      'Apple&Google服務及雜誌週刊開通數': 'Apple/Google服務開通',
      'HBO Max&Disney+&Prime Video銷售數': 'HBO Max&Disney+&Prime Video',
      'Netflix多享組銷售數': 'Netflix多享組',
    })[key] ?? key,
    itemRate('北一二B整體', key),
  ]).filter(([, rate]) => rate != null).sort((a, b) => a[1] - b[1]).slice(0, 5);
  const mainLow = mainColumns.map((key) => [key.replaceAll(' (含)', '（含）'), itemRate('北一二B整體', key)])
    .filter(([, rate]) => rate != null && rate < 1).sort((a, b) => a[1] - b[1]).slice(0, 9);
  const values = Array.from({ length: 50 }, () => Array(6).fill(null));
  values[0][0] = '主管摘要';
  const left = [
    ['項目', '內容'], ['來源檔案', sourceFile], ['資料期間', sourceRange],
    ['正式版說明', '公司排名取自「上線數KPI_店點達成率_明細」，主力KPI與加掛得分取自「上線數KPI_達成率」。'],
    ['北一二B整體KPI', `${(summaryRows[0].overall * 100).toFixed(1)}%`],
    ['北一二B公司排名', summaryRows[0].rank], ['北一二B整體加掛得分', summaryRows[0].addon],
    ['未達15分店數', `${under.length} 家`], ['未達店點', under.map((s) => s.store).join('、')],
  ];
  left.forEach((row, i) => { values[2 + i][0] = row[0]; values[2 + i][1] = row[1]; });
  values[2][3] = '店點'; values[2][4] = '公司排名'; values[2][5] = '總進度達成率';
  summaryRows.forEach((s, i) => { values[3 + i][3] = s.store; values[3 + i][4] = s.rank; values[3 + i][5] = s.overall; });
  function writeSection(start, title, valueTitle, rows, formatter) {
    values[start][0] = title; values[start][1] = valueTitle;
    rows.forEach((row, i) => { values[start + 1 + i][0] = row.store ?? row[0]; values[start + 1 + i][1] = formatter(row); });
  }
  writeSection(12, '加掛得分 Top 3', '得分', addonTop, (r) => r.addon);
  writeSection(17, '優先輔導 Bottom 3', '得分', addonBottom, (r) => r.addon);
  writeSection(22, 'KPI公司排名 Top 3', '排名 / 達成率', rankTop, (r) => `${r.rank} / ${(r.overall * 100).toFixed(1)}%`);
  writeSection(27, 'KPI公司排名 Bottom 3', '排名 / 達成率', rankBottom, (r) => `${r.rank} / ${(r.overall * 100).toFixed(1)}%`);
  writeSection(32, '北一二B加掛達成率最低指標', '整體達成率', addonLow, (r) => `${(r[1] * 100).toFixed(1)}%`);
  writeSection(39, '北一二B主力KPI低於100%', '整體達成率', mainLow, (r) => `${(r[1] * 100).toFixed(1)}%`);
  sheet.getRange('A1:F50').values = values;
  sheet.getRange('F4:F13').format.numberFormat = '0.0%';
}

// 8. 資料來源：更新日期、來源與正式格式說明。
{
  const sheet = report.worksheets.getItem('資料來源');
  sheet.getRange('A1:B8').values = [
    ['來源檔案', sourceFile],
    ['來源資料夾', '當次已核對之正式私有來源資料夾'],
    ['資料期間', sourceRange],
    ['公司排名來源', '取自來源檔「上線數KPI_店點達成率_明細」的北一二B整體與店點公司排名欄。'],
    ['計算方式', '以來源檔「上線數KPI_達成率」中的北一二B整體與店點進度達成率，套用既定 KPI 權重換算加掛類得分。'],
    ['正式呈現', '主力KPI、加掛得分、好速上線明細、手機保險、QIS、三類個績與締結率均納入附件清冊。加掛得分低於15分以紅色警示、15分以上以綠色標示；低於100%的達成率以紅字與淡紅底提醒。'],
    ['締結率來源', `${sourceFile}「續約率(分子)／續約率(分母)」；最新資料日${closureAudit.latest.date}；分子 ${closureOverall.numerator}、分母 ${closureOverall.denominator}、區締結率 ${(closureOverall.rate * 100).toFixed(1)}%。`],
    ['版本', `正式模板 v4 完整矩陣版；手機保險以前日截至${previousInsuranceCutoff}與${sourceFile}截至${insuranceCutoff}計算DOD；QIS取自${sourceFile}截至${qisCutoff}，整體分項按9店平均；台獎截至${awardsCutoff}。`],
  ];
}

// Imported template cells retain their original Microsoft YaHei typeface.
// Normalize every populated report range to the verified local CJK font while
// preserving the template's size, weight, colour, fills and borders.
const reportFontRanges = {
  '主力KPI': 'A1:V15',
  '加掛得分': 'A1:R15',
  '好速上線明細': `A1:O${goodspeedLastRow}`,
  '手機保險': 'A1:I14',
  'QIS店績': 'A1:F14',
  '締結率': `A1:E${closureLayout.lastRow}`,
  '主管摘要': 'A1:F50',
  '資料來源': 'A1:B8',
};
for (const [sheetName, address] of Object.entries(reportFontRanges)) {
  // Final PNGs are rendered by the verified bundled CJK renderer.
}

repairSemanticFormats(report);
// 產出主工作簿及締結率可編輯獨立檔。
const outputXlsx = path.join(outDir, `TWM_North12B_Daily_Report_${reportDate}.xlsx`);
const xlsx = await SpreadsheetFile.exportXlsx(report);
await xlsx.save(outputXlsx);

const closureWorkbook = Workbook.create();
buildClosureSummary(closureWorkbook, '締結率近三日');
buildClosureUnclosedSheet(closureWorkbook, '當日未締結同仁');
buildClosureRawSheet(closureWorkbook, '分母明細', closureDenominatorHeader, closureDenominatorRows, [6, 14]);
buildClosureRawSheet(closureWorkbook, '分子明細', closureNumeratorHeader, closureNumeratorRows, [6]);
const closureXlsx = path.join(outDir, `TWM_North12B_Closure_Rate_${reportDate}.xlsx`);
const closureExport = await SpreadsheetFile.exportXlsx(closureWorkbook);
await closureExport.save(closureXlsx);

const imageMap = {
  '主力KPI': `TWM_North12B_Main_KPI_${reportDate}.png`,
  '加掛得分': `TWM_North12B_Addon_Score_${reportDate}.png`,
  '好速上線明細': `TWM_North12B_Goodspeed_Detail_${reportDate}.png`,
  '手機保險': `TWM_North12B_Insurance_${reportDate}.png`,
  'QIS店績': `TWM_North12B_QIS_${reportDate}.png`,
  '締結率': `TWM_North12B_Closure_Rate_${reportDate}.png`,
};
// 個績三張圖：恢復昨日「實際／達成率／差異」完整矩陣版。
const personal = report; // Preserve editable personal matrices in the main workbook.
const metrics = [
  ['AQ', 'TTL AQ上線點數'], ['A999', 'AQ V+D 999 (含)以上'], ['A1399', 'AQ V+D 1399 (含)以上'],
  ['RT', 'RT上線點數'], ['R999', 'RT V+D 999 (含)以上'], ['R1399', 'RT V+D 1399 (含)以上'],
  ['好速', '好速案銷售點數'], ['特維', '特殊維繫用戶續約數'],
  ['配件', '配件及其他營收'], ['包膜', '包膜與保貼營收'],
];
const summaryByName = new Map(daily.persons.map((p) => [p.name, p]));
const previousByName = new Map(previousKpi.persons.map(p=>[p.employee_id ?? `${p.store}|${p.pname}`,p]));
const previousStoreByCode = new Map(previousKpi.stores.map((p) => [p.code, p]));
const hasValidPreviousPersonBaseline = Boolean(currentKpi.meta?.month && currentKpi.meta.month === previousKpi.meta?.month && previousKpi.persons.some(p=>Object.values(p.items ?? {}).some(item=>typeof item.t==='number' && item.t>0)));
const insuranceByName = new Map(
  (sourceBook['搭售達成率 (手機保險) _個人']?.values ?? [])
    .filter((row) => row?.[6])
    .map((row) => [String(row[5]), row[12] ?? null]),
);
const currentStoreByCode = new Map(currentKpi.stores.map((row) => [row.code, row]));

function fullStoreName(short) {
  if (String(short).includes('三創')) return '台北三創';
  return short.startsWith('台北') ? short : `台北${short}`;
}

const categories = [
  { key: 'manager', title: '店長（含代理）', file: `TWM_North12B_Personal_Manager_${reportDate}.png`, pick: (r) => r.role === '店長' || r.role === '代理店長', dod: true },
  { key: 'deputy', title: '副店長', file: `TWM_North12B_Personal_Deputy_${reportDate}.png`, pick: (r) => String(r.role).includes('副店'), dod: true },
  { key: 'sales', title: '業代（含銷售人員）', file: `TWM_North12B_Personal_Sales_${reportDate}.png`, pick: (r) => !(r.role === '店長' || r.role === '代理店長' || String(r.role).includes('副店')), dod: true },
];

for (const category of categories) {
  const sheet = personal.worksheets.add(category.title);
  sheet.reset();
  sheet.showGridLines = false;
  let people = currentKpi.persons.filter(category.pick).map((p, index) => {
    const summary = summaryByName.get(p.pname);
    if (category.key !== 'manager') return { ...p, index, summary };
    const store = currentStoreByCode.get(p.store);
    return { ...p, official: store?.official ?? p.official, items: store?.items ?? p.items, index, summary };
  });
  if (category.dod) people = people.sort((a, b) => (b.official ?? 0) - (a.official ?? 0));
  const baseCols = category.dod ? 5 : 4;
  const totalCols = baseCols + metrics.length * 3 + 2;
  const lastCol = colName(totalCols);
  sheet.getRange(`A1:${lastCol}1`).merge();
  sheet.getRange('A1').values = [[`北一二B個績戰報 - ${category.title} ${reportDate}`]];
  sheet.getRange('A1').format = { font: { size: 20, bold: true, color: '#0F172A' }, rowHeight: 34, verticalAlignment: 'center' };
  const dodNote = category.dod && !hasValidPreviousPersonBaseline
    ? '　DOD：前日個績總達成率基準不可信，暫不比較'
    : '';
  const sourceNote = `來源日期：${sourceRange}　差異數 = 實際數 - 目標數（100%）${dodNote}`;

  const baseHeaders = category.dod ? ['店點', '職稱', '姓名', '總達成率', 'DOD'] : ['店點', '職稱', '姓名', '總達成率'];
  baseHeaders.forEach((label, i) => {
    const c = colName(i + 1);
    sheet.getRange(`${c}2:${c}3`).merge();
    sheet.getRange(`${c}2`).values = [[label]];
    sheet.getRange(`${c}2:${c}3`).format = { fill: '#0F766E', font: { color: '#FFFFFF', bold: true }, horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true };
  });
  metrics.forEach(([label], i) => {
    const start = baseCols + i * 3 + 1;
    const c1 = colName(start), c3 = colName(start + 2);
    sheet.getRange(`${c1}2:${c3}2`).merge();
    sheet.getRange(`${c1}2`).values = [[label]];
    sheet.getRange(`${c1}2:${c3}2`).format = { fill: '#2563EB', font: { color: '#FFFFFF', bold: true }, horizontalAlignment: 'center', verticalAlignment: 'center' };
    sheet.getRange(`${c1}3:${c3}3`).values = [['實際', '達成率', '差異']];
    sheet.getRange(`${c1}3:${c3}3`).format = { fill: '#DBEAFE', font: { color: '#0F172A', bold: true }, horizontalAlignment: 'center', verticalAlignment: 'center' };
  });
  const insuranceCol = colName(baseCols + metrics.length * 3 + 1);
  const reminderCol = colName(baseCols + metrics.length * 3 + 2);
  sheet.getRange(`${insuranceCol}2:${insuranceCol}3`).merge();
  sheet.getRange(`${insuranceCol}2`).values = [[`保險搭售率\n截至 ${insuranceCutoff}`]];
  sheet.getRange(`${insuranceCol}2:${insuranceCol}3`).format = { fill: '#7C3AED', font: { color: '#FFFFFF', bold: true }, horizontalAlignment: 'center', verticalAlignment: 'center', wrapText: true };
  sheet.getRange(`${reminderCol}2:${reminderCol}3`).merge();
  sheet.getRange(`${reminderCol}2`).values = [['提醒']];
  sheet.getRange(`${reminderCol}2:${reminderCol}3`).format = { fill: '#B45309', font: { color: '#FFFFFF', bold: true }, horizontalAlignment: 'center', verticalAlignment: 'center' };
  sheet.getRange(`A4:${lastCol}4`).merge();
  sheet.getRange('A4').values = [[`${category.title}提醒`]];
  sheet.getRange(`A4:${lastCol}4`).format = { fill: '#FEF3C7', font: { color: '#92400E', bold: true }, rowHeight: 24, verticalAlignment: 'center' };

  people.forEach((p, idx) => {
    const rowNum = 5 + idx;
    const candidate = hasValidPreviousPersonBaseline
      ? (category.key === 'manager' ? previousStoreByCode.get(p.store) : previousByName.get(p.employee_id ?? `${p.store}|${p.pname}`))
      : null;
    const prev = typeof candidate?.official==='number' ? candidate : null;
    const s = p.summary ?? {};
    const maskedName = String(p.pname)
      .replace(/\s*[〔（(]?\d{5,}[〕）)]?/g,'')
      .replace(/[〔（(]\s*[〕）)]/g,'')
      .replace(/[?\uE000-\uF8FF]/g,'［來源缺字］')
      .trim();
    const base = [fullStoreName(s.store ?? ''), p.role, maskedName, p.official];
    if (category.dod) base.push(comparison(p.official,prev?.official,hasValidPreviousPersonBaseline).value ?? '暫不比較');
    sheet.getRange(`A${rowNum}:${colName(baseCols)}${rowNum}`).values = [base];
    sheet.getRange(`A${rowNum}`).format.fill = '#CCFBF1';
    sheet.getRange(`${colName(4)}${rowNum}`).format.numberFormat = '0.0%';
    if (category.dod) sheet.getRange(`${colName(5)}${rowNum}`).format.numberFormat = '+0.0%;-0.0%;0.0%';
    metrics.forEach(([, key], metricIndex) => {
      const item = p.items[key] ?? { a: null, t: null, reportRate: null };
      const start = baseCols + metricIndex * 3 + 1;
      const diffValue = item.a == null || item.t == null ? null : item.a - item.t;
      const diffDisplay = diffValue == null ? null : diffValue > 0 ? `​+${fmtNum(diffValue)}` : fmtNum(diffValue);
      const values = [item.a ?? '尚未有資料', item.reportRate ?? '尚未有資料', diffDisplay ?? '尚未有資料'];
      const startCol = colName(start), rateCol = colName(start + 1), diffCol = colName(start + 2);
      sheet.getRange(`${startCol}${rowNum}:${diffCol}${rowNum}`).values = [values];
      sheet.getRange(`${rateCol}${rowNum}`).format.numberFormat = '0.0%';
      const diff = diffValue;
      if (diff > 0) sheet.getRange(`${diffCol}${rowNum}`).format = { fill: '#DCFCE7', font: { color: '#15803D' } };
      else if (diff < 0) sheet.getRange(`${diffCol}${rowNum}`).format = { fill: '#FEE2E2', font: { color: '#DC2626' } };
      if (category.dod) {
        if ((item.reportRate ?? 0) >= 1) sheet.getRange(`${rateCol}${rowNum}`).format.fill = '#DCFCE7';
        else sheet.getRange(`${rateCol}${rowNum}`).format.fill = '#FEE2E2';
      }
      if (!category.dod && metricIndex === 0 && Number(item.a ?? 0) < 10) {
        sheet.getRange(`${startCol}${rowNum}`).format = { fill: '#FEE2E2', font: { color: '#DC2626', bold: true } };
      }
    });
    const insurance = insuranceByName.get(String(p.employee_id));
    sheet.getRange(`${insuranceCol}${rowNum}`).values = [[insurance ?? '尚未有資料']];
    sheet.getRange(`${insuranceCol}${rowNum}`).format.numberFormat = '0.0%';
    let reminder = '達標';
    if (!category.dod) {
      const aq = p.items['TTL AQ上線點數']?.a ?? 0;
      reminder = aq < 10 ? `AQ低於10點：${aq}` : '達標';
    } else {
      const gaps = metrics.map(([label, key]) => ({ label, rate: p.items[key]?.reportRate }))
        .filter((x) => x.rate != null && x.rate < 1).sort((a, b) => a.rate - b.rate).slice(0, 3);
      reminder = gaps.length ? gaps.map((x) => `${x.label} ${(x.rate * 100).toFixed(1)}%`).join('、') : '達標';
    }
    if(metrics.some(([,key])=>p.items[key]?.reportRate==null)) reminder = (reminder==='達標' ? '' : reminder+'；') + '部分項目尚未有資料';
    if(!prev) reminder += '；DOD前日無有效資料，暫不比較';
    sheet.getRange(`${reminderCol}${rowNum}`).values = [[reminder]];
    sheet.getRange(`${reminderCol}${rowNum}`).format = reminder === '達標'
      ? { fill: '#DCFCE7', font: { color: '#166534' } }
      : { fill: '#FFF7ED', font: { color: '#C2410C' } };
    if (category.dod) {
      sheet.getRange(`D${rowNum}`).format.fill = p.official >= 1 ? '#DCFCE7' : '#FEE2E2';
      const dodCell = sheet.getRange(`E${rowNum}`);
      const dodValue = prev ? p.official - prev.official : null;
      dodCell.format.fill = dodValue > 0 ? '#DCFCE7' : dodValue < 0 ? '#FEE2E2' : '#F8FAFC';
    }
  });
  const dataEnd = 4 + people.length;
  sheet.getRange(`A2:${lastCol}${dataEnd}`).format.borders = { preset: 'all', style: 'thin', color: '#94A3B8' };
  sheet.getRange(`A5:${lastCol}${dataEnd}`).format.font = { size: 9, color: '#0F172A' };
  sheet.getRange(`A5:${lastCol}${dataEnd}`).format.verticalAlignment = 'center';
  sheet.getRange(`A5:${lastCol}${dataEnd}`).format.rowHeight = 26;
  sheet.getRange(`A1:A${dataEnd}`).format.columnWidthPx = 120;
  sheet.getRange(`B1:B${dataEnd}`).format.columnWidthPx = 74;
  sheet.getRange(`C1:C${dataEnd}`).format.columnWidthPx = 150;
  sheet.getRange(`D1:${colName(baseCols)}${dataEnd}`).format.columnWidthPx = 70;
  for (let c = baseCols + 1; c <= baseCols + metrics.length * 3; c += 1) sheet.getRange(`${colName(c)}1:${colName(c)}${dataEnd}`).format.columnWidthPx = 64;
  sheet.getRange(`${insuranceCol}1:${insuranceCol}${dataEnd}`).format.columnWidthPx = 120;
  sheet.getRange(`${reminderCol}1:${reminderCol}${dataEnd}`).format.columnWidthPx = 230;
  const noteRow = dataEnd + 2;
  sheet.getRange(`A${noteRow}:${lastCol}${noteRow}`).merge();
  sheet.getRange(`A${noteRow}`).values = [[sourceNote]];
  sheet.getRange(`A${noteRow}:${lastCol}${noteRow}`).format = { font: { size: 10, color: '#475569' }, rowHeight: 22, horizontalAlignment: 'left' };
  // Preserve the workbook's approved font family; the PNG renderer uses the
  // bundled Noto Sans TC files directly.
  sheet.getRange('A2:AK3').format.rowHeight=32;
  sheet.getRange(`AK5:AK${dataEnd}`).format.wrapText=true;
  sheet.getRange(`A5:AK${dataEnd}`).format.rowHeight=36;

}

function colName(index1) {
  let n = index1, s = '';
  while (n > 0) { n -= 1; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s;
}

report.recalculate();
await (await SpreadsheetFile.exportXlsx(report)).save(outputXlsx);
// Compact verification output.
const mainCheck = await report.inspect({ kind: 'table', sheetId: '主力KPI', range: 'A1:V13', include: 'values,formulas', tableMaxRows: 13, tableMaxCols: 22, maxChars: 10000 });
const addonCheck = await report.inspect({ kind: 'table', sheetId: '加掛得分', range: 'A1:R15', include: 'values,formulas', tableMaxRows: 15, tableMaxCols: 18, maxChars: 10000 });
const goodspeedCheck = await report.inspect({ kind: 'table', sheetId: '好速上線明細', range: `A1:O${goodspeedLastRow}`, include: 'values,formulas', tableMaxRows: goodspeedLastRow, tableMaxCols: 15, maxChars: 12000 });
const insuranceCheck = await report.inspect({ kind: 'table', sheetId: '手機保險', range: 'A1:I14', include: 'values,formulas', tableMaxRows: 14, tableMaxCols: 9, maxChars: 10000 });
const qisCheck = await report.inspect({ kind: 'table', sheetId: 'QIS店績', range: 'A1:F14', include: 'values,formulas', tableMaxRows: 14, tableMaxCols: 6, maxChars: 10000 });
const closureCheck = await report.inspect({ kind: 'table', sheetId: '締結率', range: `A1:E${closureLayout.lastRow}`, include: 'values,formulas', tableMaxRows: closureLayout.lastRow, tableMaxCols: 5, maxChars: 16000 });
const formulaErrors = await report.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A', options: { useRegex: true, maxResults: 300 }, summary: 'final formula error scan', maxChars: 4000 });
const closureFormulaErrors = await closureWorkbook.inspect({ kind: 'match', searchTerm: '#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A', options: { useRegex: true, maxResults: 300 }, summary: 'closure workbook formula error scan', maxChars: 4000 });
await fs.writeFile(path.join(outDir, 'verification.ndjson'), `${mainCheck.ndjson}\n${addonCheck.ndjson}\n${goodspeedCheck.ndjson}\n${insuranceCheck.ndjson}\n${qisCheck.ndjson}\n${closureCheck.ndjson}\n${formulaErrors.ndjson}\n${closureFormulaErrors.ndjson}\n`);

console.log(JSON.stringify({outputXlsx,closureXlsx,roster:currentKpi.persons.length,status:'WORKBOOK_BUILT'}));

} catch(e) { console.error(e.message, e.stack?.split("\n").slice(-6).join("\n"));process.exit(1); }
