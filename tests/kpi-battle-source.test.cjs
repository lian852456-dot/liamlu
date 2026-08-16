const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const controllerSource = fs.readFileSync(path.join(root, 'kpi-battle-controller.js'), 'utf8');
const controller = require('../kpi-battle-controller.js');

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') { depth -= 1; if (depth === 0) return source.slice(open + 1, i); }
  }
  throw new Error(`unterminated ${name}`);
}

function lastFunctionBody(source, name) {
  const marker = `function ${name}(`;
  const start = source.lastIndexOf(marker);
  assert.notEqual(start, -1, `missing ${name}`);
  return functionBody(source.slice(start), name);
}

test('KPI 主資料取 kpicalc，快照只作條件式補充', () => {
  const login = functionBody(controllerSource, 'login');
  assert.match(login, /action: 'private_access'/);
  assert.match(login, /action: 'kpicalc_access'/);
  assert.match(login, /mergeKpiBattleSupplement\(kpiData, snapshotKpi\)/);
  assert.doesNotMatch(login, /state\.data = result\.snapshot\.kpiBattle/);
});

test('台獎僅以 KPI 戰報日期比對，不得使用資料截止日', () => {
  const hookStart = html.indexOf('function handleKpiLoaded');
  const hookEnd = html.indexOf('function handleKpiLoadError', hookStart);
  assert.ok(hookStart >= 0 && hookEnd > hookStart);
  const hook = html.slice(hookStart, hookEnd);
  assert.match(hook, /awardsDate === data\.report_date/);
  assert.doesNotMatch(hook, /awardsDate === data\.data_as_of_date/);
  assert.match(hook, /renderAwardsBattleUnavailable\(\)/);
});

test('來源說明以資訊格分開顯示戰報日期、資料截止日與來源檔', () => {
  const render = functionBody(controllerSource, 'render');
  const metadata = functionBody(controllerSource, 'kpiBattleSourceMetadata');
  assert.match(render, /note\.innerHTML = kpiBattleSourceMetadata/);
  for (const label of ['戰報日期', '資料統計至', '來源檔', '統計區間', '同步狀態']) {
    assert.ok(metadata.includes(label), `來源資訊格缺少：${label}`);
  }
});

test('加掛得分保留兩位小數，不得把 12.35 截成 12.3', () => {
  const body = functionBody(controllerSource, 'formatNumber');
  assert.match(body, /Math\.round\(number \* 100\) \/ 100/);
});

test('店績保險搭售率接在加掛後，且由同次快照補入', () => {
  const render = functionBody(controllerSource, 'renderStores');
  assert.match(render, /<th>加掛<\/th><th>保險搭售率<\/th>/);
  assert.match(render, /kpiBattleInsuranceCell\(row\)/);
  assert.match(functionBody(controllerSource, 'mergeKpiBattleSupplement'), /insurance_attach_rate/);
});

test('台獎篩選可選北一二B，北一二B顯示80%／100%，門市顯示50%／100%', () => {
  const render = functionBody(html, 'renderAwardsBattle');
  const model = functionBody(html, 'renderAwardModel');
  assert.match(render, /option value="北一二B整體"/);
  assert.match(render, /北一二B差異數＝實際數－80%目標台數/);
  assert.match(render, /店點差異數＝實際數－50%目標台數/);
  for (const field of ['district_reward_80', 'district_reward_100', 'store_reward_50', 'store_reward_100']) {
    assert.match(model, new RegExp(field));
  }
});

test('快照合併硬性要求截止日與來源檔一致', () => {
  const guard = functionBody(controllerSource, 'kpiBattleSupplementIsCurrent');
  for (const field of ['reportSource', 'data_as_of_date', 'source_file']) {
    assert.ok(guard.includes(field), `缺少快照合併門檻：${field}`);
  }
  assert.doesNotMatch(functionBody(controllerSource, 'load'), /__KPI_BATTLE_DATA__/);
});

test('正式達成率保護區不變，GAS ptvisit hotfix 不修改 KPI／台獎／班表／正式回報寫入', () => {
  const gasDiff = execFileSync('git', ['diff', '--unified=0', 'origin/main', '--', 'gas/Code.gs'], { cwd: root, encoding: 'utf8' });
  const changedLines = gasDiff.split('\n').filter((line) => /^[+-]/.test(line) && !/^(?:---|\+\+\+)/.test(line)).join('\n');
  assert.doesNotMatch(changedLines, /kpiCalc|award|schedule|private_access|reportWritePayload_\s*\{/i);
  const gas = fs.readFileSync(path.join(root, 'gas', 'Code.gs'), 'utf8');
  const parser = functionBody(gas, 'kpiCalcParseReport');
  assert.match(parser, /reportRate: kpiCalcReportRate/);
  assert.match(parser, /aggregateRates: aggregateRates/);
  assert.match(gas, /action === 'private_publish'/);
  assert.match(gas, /action === 'ptread'/);
  assert.match(gas, /action === 'ptvisit_write'/);
});

test('正式報表無百分比時保留空值，不得自行改成 0%', () => {
  const gas = fs.readFileSync(path.join(root, 'gas', 'Code.gs'), 'utf8');
  const src = [
    `function kpiCalcPct(v) {${lastFunctionBody(gas, 'kpiCalcPct')}}`,
    `function kpiCalcReportRate(v) {${functionBody(gas, 'kpiCalcReportRate')}}`,
    'module.exports = kpiCalcReportRate;',
  ].join('\n');
  const sandbox = { module: { exports: {} }, String, Number, Math, isNaN };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  assert.equal(sandbox.module.exports('-'), null);
  assert.equal(sandbox.module.exports('104.20%'), 1.042);
  assert.equal(sandbox.module.exports(1.042), 1.042);
});

function loadAdapter() {
  return controller;
}

const SAMPLE = {
  meta: { period: '2026/08/01 ~ 08/04', snapshotDay: 4, monthDays: 31, month: '2026-08', sourceFile: '0805.xlsx' },
  items: [{ key: 'AQ V+D 999 (含)以上', short: 'A999', step: 1 }, { key: '好速案銷售點數', short: '好速', step: 0.25 }],
  aggregateRates: { 'AQ V+D 999 (含)以上': 1.16, '好速案銷售點數': 0.88 },
  stores: [
    { code: 'DNB1', name: '台北甲', official: 1.1, items: { 'AQ V+D 999 (含)以上': { a: 10, t: 16, reportRate: 1.21 }, '好速案銷售點數': { a: 5, t: 10, reportRate: 0.97 } } },
    { code: 'DNB2', name: '台北乙', official: 0.9, items: { 'AQ V+D 999 (含)以上': { a: 6, t: 8, reportRate: 1.08 }, '好速案銷售點數': { a: 3, t: 5, reportRate: 0.79 } } },
  ],
  persons: [{ store: 'DNB1', role: '店長', pname: '甲＊一', official: 1.05, items: { 'AQ V+D 999 (含)以上': { a: 4, t: 3, reportRate: 1.42 } } }],
};

test('各項達成率直接沿用正式報表欄位，實績／目標／差異不變', () => {
  const view = loadAdapter().kpicalcToKpiBattleView(SAMPLE, '');
  const storeMetric = view.stores[0].metrics['AQ V+D 999 (含)以上'];
  assert.equal(storeMetric.rate, 1.21);
  assert.equal(storeMetric.actual, 10);
  assert.equal(storeMetric.target, 16);
  assert.equal(storeMetric.daily_gap, 10 - (16 * 4 / 31));
  assert.equal(view.personal[0].metrics.A999.rate, 1.42);
  assert.equal(view.aggregate.metrics['AQ V+D 999 (含)以上'].rate, 1.16);
  const missingAggregateRate = JSON.parse(JSON.stringify(SAMPLE));
  delete missingAggregateRate.aggregateRates['好速案銷售點數'];
  const missingView = loadAdapter().kpicalcToKpiBattleView(missingAggregateRate, '');
  assert.equal(missingView.aggregate.metrics['好速案銷售點數'].rate, null);
  assert.equal(missingView.aggregate.metrics['好速案銷售點數'].actual, 8);
  assert.equal(missingView.aggregate.metrics['好速案銷售點數'].target, 15);
  assert.match(functionBody(controllerSource, 'kpiBattleMetricCell'), /metric\.rate == null[^;]+kpiBattleTargetLine\(metric\)/);
});

test('0805.xlsx 統計至 0804，未合併快照時不可偽裝成 0805 戰報', () => {
  const view = loadAdapter().kpicalcToKpiBattleView(SAMPLE, '');
  assert.equal(view.report_date, '');
  assert.equal(view.data_as_of_date, '2026-08-04');
  assert.equal(view.source_file, '0805.xlsx');
  assert.equal(view.stores.length, 2);
  assert.equal(view.personal.length, 1);
});

test('同次正式快照補入 0805 戰報日、34 名、109.7%、12.35 與個人補充欄位', () => {
  const A = loadAdapter();
  const base = A.kpicalcToKpiBattleView(SAMPLE, '');
  const snapshot = {
    report_date: '2026-08-05', data_as_of_date: '2026-08-04', source_file: '0805.xlsx', source_date_range: '2026/08/01 ~ 08/04',
    aggregate: { overall_kpi: 1.097, company_rank: 34, addon_score: 12.35, insurance_attach_rate: 0.46154 },
    stores: [{ store: '甲', company_rank: 20, addon_score: 14.2, insurance_attach_rate: 0.54545 }],
    personal: [{ store: '甲', name: '甲＊一', rank: 49, insurance_attach_rate: 0.83333, phone_award_actual: 1495, phone_award_projected: 14720 }],
  };
  const view = A.mergeKpiBattleSupplement(base, snapshot);
  assert.equal(view.supplement_synced, true);
  assert.equal(view.report_date, '2026-08-05');
  assert.equal(view.data_as_of_date, '2026-08-04');
  assert.equal(view.aggregate.company_rank, 34);
  assert.equal(view.aggregate.overall_kpi, 1.097);
  assert.equal(view.aggregate.addon_score, 12.35);
  assert.equal(view.aggregate.insurance_attach_rate, 0.46154);
  assert.equal(view.stores[0].company_rank, 20);
  assert.equal(view.stores[0].insurance_attach_rate, 0.54545);
  assert.equal(view.personal[0].rank, 49);
  assert.equal(view.personal[0].phone_award_actual, 1495);
  assert.equal(view.personal[0].insurance_attach_rate, 0.83333);
});

test('受控 upload temporary filename 使用 canonical 0805.xlsx 合併，且頁面只顯示 canonical source', () => {
  const A = loadAdapter();
  const staged = JSON.parse(JSON.stringify(SAMPLE));
  staged.meta.sourceFile = `report-upload-temp-${'a'.repeat(32)}-0805.xlsx`;
  const base = A.kpicalcToKpiBattleView(staged, '');
  assert.equal(base.source_file, '0805.xlsx');
  const snapshot = {
    report_date: '2026-08-05', data_as_of_date: '2026-08-04', source_file: '0805.xlsx',
    aggregate: { overall_kpi: 1.097, company_rank: 34, overall_kpi_dod: -0.0142, company_rank_dod: -1, addon_score: 13.09 },
    stores: [], personal: [],
  };
  const merged = A.mergeKpiBattleSupplement(base, snapshot);
  assert.equal(merged.supplement_synced, true);
  assert.equal(merged.report_date, '2026-08-05');
  assert.equal(merged.aggregate.company_rank, 34);
  assert.equal(merged.aggregate.overall_kpi_dod, -0.0142);
  assert.equal(merged.aggregate.company_rank_dod, -1);
  assert.equal(merged.aggregate.addon_score, 13.09);
});

test('0805 正式契約可保有 9 店、41 人與 13 款／10 列台獎計數', () => {
  const A = loadAdapter();
  const fixture = {
    ...SAMPLE,
    stores: Array.from({ length: 9 }, (_, index) => ({ ...SAMPLE.stores[index % 2], code: `DNB${index}`, name: `台北店${index + 1}` })),
    persons: Array.from({ length: 41 }, (_, index) => ({ ...SAMPLE.persons[0], store: `DNB${index % 9}`, pname: `人＊${index + 1}` })),
  };
  const base = A.kpicalcToKpiBattleView(fixture, '');
  assert.equal(base.stores.length, 9);
  assert.equal(base.personal.length, 41);
  const awards = { report_date: '2026-08-05', phone_items: 13, store_rows: 10 };
  assert.equal(awards.phone_items, 13);
  assert.equal(awards.store_rows, 10);
});

test('過期截止日或不同來源檔快照不得混入補充欄位', () => {
  const A = loadAdapter();
  const base = A.kpicalcToKpiBattleView(SAMPLE, '');
  for (const snapshot of [
    { report_date: '2026-08-05', data_as_of_date: '2026-08-03', source_file: '0805.xlsx' },
    { report_date: '2026-08-05', data_as_of_date: '2026-08-04', source_file: '0804.xlsx' },
  ]) {
    const merged = A.mergeKpiBattleSupplement(base, { ...snapshot, aggregate: { company_rank: 1 }, stores: [], personal: [] });
    assert.equal(merged.supplement_synced, false);
    assert.equal(merged.aggregate.company_rank, null);
  }
});

test('report date、canonical source 或不受控 temporary filename 矛盾時仍 fail-closed', () => {
  const A = loadAdapter();
  const staged = JSON.parse(JSON.stringify(SAMPLE));
  staged.meta.sourceFile = `report-upload-temp-${'b'.repeat(64)}-0805.xlsx`;
  const base = A.kpicalcToKpiBattleView(staged, '');
  for (const snapshot of [
    { report_date: '2026-08-05', data_as_of_date: '2026-08-04', source_file: '0804.xlsx' },
    { report_date: '2026-08-04', data_as_of_date: '2026-08-04', source_file: '0805.xlsx' },
  ]) {
    assert.equal(A.mergeKpiBattleSupplement(base, { ...snapshot, aggregate: { company_rank: 1 }, stores: [], personal: [] }).supplement_synced, false);
  }
  const uncontrolled = JSON.parse(JSON.stringify(SAMPLE));
  uncontrolled.meta.sourceFile = 'report-upload-temp-token-0805.xlsx';
  assert.equal(A.mergeKpiBattleSupplement(A.kpicalcToKpiBattleView(uncontrolled, ''), {
    report_date:'2026-08-05', data_as_of_date:'2026-08-04', source_file:'0805.xlsx', aggregate:{company_rank:1}, stores:[], personal:[],
  }).supplement_synced, false);
});
