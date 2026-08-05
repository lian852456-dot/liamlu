const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

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

test('KPI 主資料取 kpicalc，快照只作條件式補充', () => {
  const login = functionBody(html, 'privateDashboardLogin');
  assert.match(login, /action: 'kpicalc_access'/);
  assert.match(login, /mergeKpiBattleSupplement\(kpiData, snapshotKpi\)/);
  assert.doesNotMatch(login, /_kpiBattleData = result\.snapshot\.kpiBattle/);
});

test('台獎僅以 KPI 戰報日期比對，不得使用資料截止日', () => {
  const login = functionBody(html, 'privateDashboardLogin');
  assert.match(login, /awardsDate === _kpiBattleData\.report_date/);
  assert.doesNotMatch(login, /awardsDate === _kpiBattleData\.data_as_of_date/);
  assert.match(login, /renderAwardsBattleUnavailable\(\)/);
});

test('來源說明分開顯示戰報日期、資料截止日與來源檔', () => {
  const render = functionBody(html, 'renderKpiBattle');
  for (const label of ['戰報日期', '資料統計至', '來源檔', 'kpicalc', '讀取於']) {
    assert.ok(render.includes(label), `來源說明列缺少：${label}`);
  }
});

test('加掛得分保留兩位小數，不得把 12.35 截成 12.3', () => {
  const body = functionBody(html, 'kpiBattleNumber');
  assert.match(body, /Math\.round\(number \* 100\) \/ 100/);
});

test('快照合併硬性要求截止日與來源檔一致', () => {
  const guard = functionBody(html, 'kpiBattleSupplementIsCurrent');
  for (const field of ['snapshot.report_date', 'data_as_of_date', 'snapshot.source_file']) {
    assert.ok(guard.includes(field), `缺少快照合併門檻：${field}`);
  }
  assert.doesNotMatch(functionBody(html, 'loadKpiBattle'), /__KPI_BATTLE_DATA__/);
});

test('禁止修改 Apps Script 與巡店保護區', () => {
  assert.doesNotThrow(() => execFileSync('git', ['diff', '--exit-code', 'origin/main', '--', 'gas/Code.gs', 'patrol.html'], { cwd: root, stdio: 'pipe' }));
  const gas = fs.readFileSync(path.join(root, 'gas', 'Code.gs'), 'utf8');
  assert.match(gas, /action === 'private_publish'/);
  assert.match(gas, /action === 'ptread'/);
});

function loadAdapter() {
  const constants = [
    html.match(/const KPI_BATTLE_CORE_KEYS = \{[^\n]+\n/)[0],
    html.match(/const KPI_BATTLE_PERSONAL_KEYS = \{[^\n]+\n/)[0],
  ];
  const names = ['kpicalcMetric', 'kpiBattleDataAsOfDate', 'kpiBattleSourceFile', 'kpiBattleStoreKey', 'kpiBattlePersonKey', 'kpiBattleSupplementIsCurrent', 'mergeKpiBattleSupplement', 'kpicalcToKpiBattleView'];
  const src = [
    ...constants,
    ...names.map(name => `function ${name}(${name === 'kpicalcMetric' ? 'entry, meta' : name === 'kpiBattleDataAsOfDate' ? 'meta' : name === 'kpiBattleSourceFile' || name === 'kpiBattleStoreKey' ? 'value' : name === 'kpiBattlePersonKey' ? 'row' : name === 'kpiBattleSupplementIsCurrent' || name === 'mergeKpiBattleSupplement' ? 'kpiData, snapshot' : 'data, fetchedAt'}) {${functionBody(html, name)}}`),
    'module.exports = { kpicalcToKpiBattleView, mergeKpiBattleSupplement, kpiBattleSupplementIsCurrent };',
  ].join('\n');
  const sandbox = { module: { exports: {} }, console, Map, JSON, String, Number, Boolean, Object, Array };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.module.exports;
}

const SAMPLE = {
  meta: { period: '2026/08/01 ~ 08/04', snapshotDay: 4, monthDays: 31, month: '2026-08', sourceFile: '0805.xlsx' },
  items: [{ key: 'AQ V+D 999 (含)以上', short: 'A999', step: 1 }, { key: '好速案銷售點數', short: '好速', step: 0.25 }],
  stores: [
    { code: 'DNB1', name: '台北甲', official: 1.1, items: { 'AQ V+D 999 (含)以上': { a: 10, t: 16 }, '好速案銷售點數': { a: 5, t: 10 } } },
    { code: 'DNB2', name: '台北乙', official: 0.9, items: { 'AQ V+D 999 (含)以上': { a: 6, t: 8 }, '好速案銷售點數': { a: 3, t: 5 } } },
  ],
  persons: [{ store: 'DNB1', role: '店長', pname: '甲＊一', official: 1.05, items: { 'AQ V+D 999 (含)以上': { a: 4, t: 3 } } }],
};

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
    aggregate: { overall_kpi: 1.097, company_rank: 34, addon_score: 12.35 },
    stores: [{ store: '甲', company_rank: 20, addon_score: 14.2 }],
    personal: [{ store: '甲', name: '甲＊一', rank: 49, insurance_attach_rate: 0.83333, phone_award_actual: 1495, phone_award_projected: 14720 }],
  };
  const view = A.mergeKpiBattleSupplement(base, snapshot);
  assert.equal(view.supplement_synced, true);
  assert.equal(view.report_date, '2026-08-05');
  assert.equal(view.data_as_of_date, '2026-08-04');
  assert.equal(view.aggregate.company_rank, 34);
  assert.equal(view.aggregate.overall_kpi, 1.097);
  assert.equal(view.aggregate.addon_score, 12.35);
  assert.equal(view.stores[0].company_rank, 20);
  assert.equal(view.personal[0].rank, 49);
  assert.equal(view.personal[0].phone_award_actual, 1495);
  assert.equal(view.personal[0].insurance_attach_rate, 0.83333);
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
