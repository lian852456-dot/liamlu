import test from 'node:test';
import assert from 'node:assert/strict';
import XLSX from '../assets/vendor/xlsx.full.min.js';
import scoreCore from '../department-scores-core.js';
import goldCore from '../department-gold-monthly-core.js';
import scoreFixture from './helpers/department-scores-synthetic.cjs';
import fixture from './operations-fixtures.cjs';
import { combineMonthlyReportSections, readReportWorkbook } from '../operations-report-core.mjs';

const book = tables => ({
  SheetNames: Object.keys(tables),
  Sheets: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, XLSX.utils.aoa_to_sheet(rows)]))
});
const options = { name: 'synthetic.xlsx', sha256: 'a'.repeat(64), scoresCore: scoreCore, goldCore };
const read = (tables, category) => readReportWorkbook(book(tables), XLSX, { ...options, category });
const areas = ['北一二A', '北一二B', '北一二C', '北一二D'];
const insurance = ['督導區', '資料起日', '資料截止日', '期別', '手機保險件數', '手機銷售數', '穿戴保險件數', '穿戴銷售數'];
const kpi = ['督導區', '資料起日', '資料截止日', '認列口徑', '實績點數', '目標點數'];

test('insurance reads two explicit periods, keeps zero versus blank, and ignores private columns', () => {
  const { sheets, sections: [source] } = read({ '保險彙整': [
    [...insurance, '自由備註'],
    ['北一二B', '2026-11-01', '2026-11-23', '本期', 0, 4, null, 0, 'PRIVATE-customer'],
    ['北一二B', '2026-10-01', '2026-10-23', '比較期', 2, 4, 0, 0]
  ] }, '新復原者／保險');
  assert.deepEqual(sheets[0].fields, insurance);
  assert.equal(source.coverage, '北一二B');
  assert.equal(source.cutoff, '2026-11-23');
  assert.equal(source.status, 'partial');
  assert.deepEqual(source.rows[0], ['本期', '北一二B', '0／4', '0.0%', '缺資料／0', '缺資料', '2']);
  assert.equal(source.evidence[0].sheet, '保險彙整');
  assert.doesNotMatch(JSON.stringify({ source, sheets }), /PRIVATE/);
});

test('insurance exact comparison periods and matching scope can be reviewed', () => {
  const current = ['北一二B', '2026-11-01', '2026-11-23', '本期', 0, 4, 0, 0];
  const previous = ['北一二B', '2026-10-01', '2026-10-23', '比較期', 2, 4, 0, 0];
  const result = rows => read({ '保險彙整': [insurance, ...rows] }, '新復原者／保險').sections[0];
  assert.equal(result([current, previous]).status, 'read');
  assert.equal(result([current, previous.map((v, i) => i ? v : '北一二C')]).status, 'partial');
  assert.equal(result([current, previous.map((v, i) => i === 2 ? '2026-11-05' : v)]).status, 'error');
  assert.equal(result([current, current]).status, 'error');
  assert.match(result([current.map((v, i) => i === 2 ? '2026-02-30' : v)]).issues[0], /有效資料期間/);
});

test('BB sources use their actual scope and distinguish company KPI and missing classification', () => {
  const tables = fixture.goodSpeedTables();
  const byKey = report => Object.fromEntries(report.sections.map(s => [s.key, s]));
  const fresh = byKey(read(tables, '好速'));
  assert.equal(fresh['好速'].status, 'partial');
  assert.equal(fresh['好速長約'].status, 'read');
  assert.equal(fresh['好速失敗原因'].status, 'read');
  assert.equal(fresh['好速長約'].periodStart, '2026-10-01');
  assert.equal(fresh['好速失敗原因'].cutoff, '2026-10-27');
  assert.doesNotMatch(JSON.stringify(fresh), /PRIVATE|SYNTHETIC-order/);
  assert.match(fresh['好速失敗原因'].additionalTables[0].rows[0][3], /AY 3/);
  tables['BB明細'][2][50] = 'PRIVATE-free-reason';
  const unresolved = byKey(read(tables, '好速失敗原因'))['好速失敗原因'];
  assert.equal(unresolved.status, 'partial');
  assert.doesNotMatch(JSON.stringify(unresolved), /PRIVATE/);

  const matching = areas.map(area => [area, '2026-11-01', '2026-11-23', '含企客4G；已排除正式降轉', 0, 3]);
  const official = read({ '好速公司KPI': [kpi, ...matching] }, '好速').sections[0];
  assert.equal(official.status, 'read');
  assert.equal(official.cutoff, '2026-11-23');
  assert.deepEqual(official.rows[0], ['北一二A', '0', '3', '0.0%', '2']);
  const kpiWrongArea = matching.map((r, i) => i ? r : [r[0], r[1], r[2], 'VK', 55, 60]);
  const wrong = read({ '好速公司KPI': [kpi, ...kpiWrongArea] }, '好速').sections[0];
  assert.equal(wrong.status, 'partial');
  assert.equal(wrong.rows.length, 3);
  assert.doesNotMatch(JSON.stringify(wrong), /"55"|"60"/);
  assert.equal(read({ '好速公司KPI': [kpi, [matching[0][0], matching[0][1], '2026-11-24', ...matching[0].slice(3)], ...matching.slice(1)] }, '好速').sections[0].status, 'error');
});

test('month-by-month original score values are used and gap stays empty', () => {
  const scores = { SheetNames: [], Sheets: {} };
  for (let month = 6; month <= 11; month++) {
    const tab = '2026-' + String(month).padStart(2, '0');
    const sheet = scoreFixture.sheet({ month });
    sheet.I61.v = sheet.I63.v = sheet.I65.v = sheet.I67.v = 1;
    scores.SheetNames.push(tab);
    scores.Sheets[tab] = sheet;
  }
  const extract = () => readReportWorkbook(scores, XLSX, { ...options, category: '店務' }).sections[0];
  const complete = extract();
  assert.equal(complete.status, 'read');
  assert.equal(complete.months.length, 6);
  assert.equal(complete.rows.length, 24);
  assert.match(complete.additionalTables[0].rows[0][4], /I61/);
  assert.equal(complete.additionalTables[0].evidence.sheet, '2026-11');
  assert.deepEqual(complete.primaryTables.map(t => t.evidence.sheet), scores.SheetNames);
  delete scores.Sheets['2026-07'];
  scores.SheetNames.splice(1, 1);
  const missing = extract();
  assert.equal(missing.status, 'partial');
  assert.deepEqual(missing.rows[4], ['2026-07', '北一二A', '缺資料', '缺資料', '缺資料', '缺資料']);
  assert.match(missing.issues[0], /2026-07/);
});

test('gold monthly official subtotal is verified without exposing individual source rows', () => {
  const goldTable = (month, total = 0) => [
    ['資料日期：2026/' + month + '/01~' + month + '/23', null, null, null, null, null, null, 'SPE加分總計', '金牌'],
    ['督導區', '營業店點代碼', '服務中心', '店內職稱', '員編', '員工姓名', null, null, null, '活動金牌'],
    ...areas.map((area, i) => [area, 'SYNTHETIC店碼' + i, 'SYNTHETIC店名' + i, 'PRIVATE角色', 'SYNTHID' + i, 'PRIVATE姓名', null, 500, [-3, 4, 0, -1][i], 1000]),
    ['北一二', null, '小計', null, null, null, null, 500, total]
  ];
  const tables = { '09全員': goldTable('09'), '10全員': goldTable('10'), '11全員': goldTable('11') };
  const result = read(tables, '金牌').sections[0];
  assert.equal(result.status, 'read');
  assert.equal(result.months.length, 3);
  assert.deepEqual(result.primaryTables.map(t => t.evidence.sheet), ['09全員', '10全員', '11全員']);
  assert.deepEqual(result.rows[0], ['2026-09', '北一二A', '1', '1', '-3']);
  assert.deepEqual(result.rows[2], ['2026-09', '北一二C', '1', '1', '0']);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|SYNTHID|SYNTHETIC店名|1000/);
  delete tables['10全員'];
  assert.equal(read(tables, '金牌').sections[0].status, 'partial');
  tables['10全員'] = goldTable('10', 100);
  assert.match(read(tables, '金牌').sections[0].issues[0], /小計.*不一致/);
});

test('independent monthly workbooks require contiguous months, matching source versions and current deficiency details', () => {
  const sourcePart = (key, month, value, details = {}) => ({
    key, sourceSha256: value.repeat(64),
    monthly: [{ month, metricsComplete: true, deficienciesComplete: true, ...details }]
  });
  const storeParts = ['05', '06', '07', '08', '09', '10'].map((month, i) =>
    sourcePart('店務', '2026-' + month, String(i), { deficienciesComplete: month === '10' })
  );
  const combineStore = parts => combineMonthlyReportSections('店務', parts, '2026-11');
  assert.deepEqual(combineStore(storeParts).expectedMonths, ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
  assert.equal(combineStore([...storeParts, storeParts[0]]).complete, true);
  assert.match(combineStore([...storeParts, sourcePart('店務', '2026-08', 'c')]).issues[0], /不同版本/);
  assert.equal(combineStore(storeParts.slice(1)).complete, false);
  const withNovember = [...storeParts, sourcePart('店務', '2026-11', 'e', { deficienciesComplete: false })];
  assert.match(combineStore(withNovember).issues[0], /2026-11.*分項/);
  assert.equal(combineStore([...storeParts, sourcePart('店務', '2026-12', 'f')]).complete, false);

  const goldParts = ['09', '10', '11'].map((month, i) => sourcePart('金牌', '2026-' + month, String(i)));
  const combineGold = parts => combineMonthlyReportSections('金牌', parts, '2026-11');
  assert.equal(combineGold(goldParts).complete, true);
  assert.match(combineGold(goldParts.slice(0, 2)).issues[0], /2026-11.*缺月結/);
  assert.match(combineGold([...goldParts.slice(0, 2), sourcePart('金牌', '2026-11', 'd', { metricsComplete: false })]).issues[0], /四區數據缺資料/);
});

test('unknown report layout gives exact sheet references without echoing original values', () => {
  const results = read({ '對帳資料': [['公司私人名稱', '未對映標題'], ['PRIVATE備註', 'PRIVATE報表']] }, '新復原者／保險');
  assert.equal(results.sections[0].status, 'partial');
  assert.equal(results.sections[0].rows.length, 0);
  assert.equal(results.sheets[0].range, 'A1:B2');
  assert.equal(results.sheets[0].name, '對帳資料');
  assert.doesNotMatch(JSON.stringify(results), /PRIVATE|私人名稱|未對映標題/);
  assert.match(results.sections[0].issues[0], /其他格式/);
});
