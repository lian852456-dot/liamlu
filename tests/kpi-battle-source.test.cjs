// 方案 A（2026-07-31 Liam 拍板）：index.html KPI 戰情頁籤唯一正式來源 = kpicalc JSON。
// 這個檔守住三件事：來源切換完成、snapshot 不再餵 KPI 頁籤、轉接層不發明數字。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

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

test('登入後 KPI 頁籤改打 kpicalc_access，不再吃 snapshot.kpiBattle', () => {
  const login = functionBody(html, 'privateDashboardLogin');
  assert.match(login, /action: 'kpicalc_access'/);
  assert.match(login, /kpicalcToKpiBattleView\(/);
  assert.doesNotMatch(login, /_kpiBattleData = result\.snapshot\.kpiBattle/,
    'KPI 頁籤不得再讀 dashboard snapshot');
  // 台獎 snapshot 僅可在與 KPI 同日期時使用。
  assert.match(login, /const awards = result\.snapshot && result\.snapshot\.awardsBattle/);
});

test('KPI 頁籤的 snapshot 形狀本機回退已移除，台獎回退保留', () => {
  assert.doesNotMatch(functionBody(html, 'loadKpiBattle'), /__KPI_BATTLE_DATA__/);
  assert.match(functionBody(html, 'loadAwardsBattle'), /__AWARDS_BATTLE_DATA__/);
});

test('台獎只在與 KPI 同日期時才渲染，避免舊 snapshot 混入', () => {
  const login = functionBody(html, 'privateDashboardLogin');
  const kpiFetchAt = login.indexOf("action: 'kpicalc_access'");
  const awardsAt = login.indexOf('renderAwardsBattle()');
  assert.ok(awardsAt !== -1 && kpiFetchAt !== -1 && awardsAt > kpiFetchAt,
    '須先取得 KPI 資料日期，才可判斷台獎 snapshot 是否同日');
  assert.match(login, /awardsDate === _kpiBattleData\.report_date/);
  assert.match(login, /renderAwardsBattleUnavailable\(\)/);
});

test('來源說明列同時標明 資料日期／來源檔／更新時間尚未同步／發布狀態／與 kpi.html 同一份', () => {
  const render = functionBody(html, 'renderKpiBattle');
  for (const label of ['kpi.html 同一份', '資料日期', '來源檔', '更新時間 尚未同步', '發布狀態：正式 JSON 已發布', '讀取於']) {
    assert.ok(render.includes(label), `來源說明列缺少：${label}`);
  }
});

test('缺少欄位以尚未同步呈現：排名／加掛／整體KPI／個人台獎／保險搭售率', () => {
  assert.match(html, /function kpiPendingCell/);
  const stores = functionBody(html, 'renderKpiBattleStores');
  assert.match(stores, /aggregate\.company_rank \?\? kpiPendingCell\(\)/);
  assert.match(stores, /aggregate\.addon_score == null \? kpiPendingCell\(\)/);
  assert.match(stores, /aggregate\.overall_kpi == null \? kpiPendingCell\(\)/);
  assert.match(stores, /row\.company_rank == null \? kpiPendingCell\(\)/);
  const personal = functionBody(html, 'renderKpiBattlePersonal');
  assert.match(personal, /row\.rank \?\? kpiPendingCell\(\)/);
  assert.match(personal, /row\.phone_award_actual == null && row\.phone_award_projected == null \? kpiPendingCell\(\)/);
  assert.match(personal, /row\.insurance_attach_rate == null \? kpiPendingCell\(\)/);
});

test('上鎖 KPI 區只放靜態上傳入口，不會對上傳 Deployment 發送請求', () => {
  const lock = functionBody(html, 'privateDashboardLockMarkup');
  assert.match(lock, /戰報快速更新/);
  assert.match(lock, /target="_blank"/);
  assert.match(lock, /rel="noopener"/);
  assert.doesNotMatch(lock, /fetch\(/);
  assert.doesNotMatch(html, /UPLOAD_GAS_URL/);
});

test('台獎不同日期時明示尚未同步，不顯示舊 snapshot 數字', () => {
  const unavailable = functionBody(html, 'renderAwardsBattleUnavailable');
  assert.match(unavailable, /台獎尚未同步/);
  assert.match(unavailable, /不使用舊 dashboard snapshot 的數字/);
});

// ── 轉接層行為：實際執行，驗證「不發明數字」──────────────────
function loadAdapter() {
  const src = [
    html.match(/const KPI_BATTLE_CORE_KEYS = \{[^\n]+\n/)[0],
    html.match(/const KPI_BATTLE_PERSONAL_KEYS = \{[^\n]+\n/)[0],
    `function kpicalcMetric(entry, meta) {${functionBody(html, 'kpicalcMetric')}}`,
    `function kpicalcToKpiBattleView(data, fetchedAt) {${functionBody(html, 'kpicalcToKpiBattleView')}}`,
    'module.exports = { kpicalcToKpiBattleView, kpicalcMetric };',
  ].join('\n');
  const sandbox = { module: { exports: {} }, console };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.module.exports;
}

const SAMPLE = {
  meta: { period: '2026/07/01 ~ 07/29', snapshotDay: 29, monthDays: 31, month: '2026-07', sourceFile: '0730.xlsx' },
  items: [
    { key: 'AQ V+D 999 (含)以上', short: 'A999', step: 1 },
    { key: '好速案銷售點數', short: '好速', step: 0.25 },
  ],
  stores: [
    { code: 'DNB1', name: '台北甲', official: 1.1, items: { 'AQ V+D 999 (含)以上': { a: 10, t: 16, w: 0.03 }, '好速案銷售點數': { a: 5, t: 10, w: 0.04 } } },
    { code: 'DNB2', name: '台北乙', official: 0.9, items: { 'AQ V+D 999 (含)以上': { a: 6, t: 8, w: 0.03 }, '好速案銷售點數': { a: 3, t: 5, w: 0.04 } } },
  ],
  persons: [
    { store: 'DNB1', role: '店長', pname: '甲＊一', official: 1.05, items: { 'AQ V+D 999 (含)以上': { a: 4, t: 3, w: 0.03 } } },
  ],
};

test('轉接層：店點總達成率直接取 official，不重算', () => {
  const view = loadAdapter().kpicalcToKpiBattleView(SAMPLE, '2026-07-31 21:00');
  assert.equal(view.stores[0].overall_kpi, 1.1);
  assert.equal(view.stores[1].overall_kpi, 0.9);
  assert.equal(view.report_date, '2026-07-29');
  assert.equal(view.source_file, '0730.xlsx');
  assert.equal(view.source, 'kpicalc');
});

test('轉接層：kpicalc 沒有的欄位一律 null（畫面顯示尚未同步），不留舊值', () => {
  const view = loadAdapter().kpicalcToKpiBattleView(SAMPLE, '');
  assert.equal(view.aggregate.overall_kpi, null, '整體總達成率無法由 kpicalc 推得，必須 null');
  assert.equal(view.aggregate.company_rank, null);
  assert.equal(view.aggregate.addon_score, null);
  assert.equal(view.stores[0].company_rank, null);
  assert.equal(view.previous_report_date, null, '沒有前日資料，DOD 不得出現');
  const person = view.personal[0];
  assert.equal(person.rank, null);
  assert.equal(person.insurance_attach_rate, null);
  assert.equal(person.phone_award_actual, null);
});

test('轉接層：整體核心項目＝各店純加總，比率＝加總後相除', () => {
  const view = loadAdapter().kpicalcToKpiBattleView(SAMPLE, '');
  const a999 = view.aggregate.core.a999;
  assert.equal(a999.actual, 16);   // 10 + 6
  assert.equal(a999.target, 24);   // 16 + 8
  assert.ok(Math.abs(a999.rate - 16 / 24) < 1e-9);
  const haosu = view.aggregate.metrics['好速案銷售點數'];
  assert.equal(haosu.actual, 8);
  assert.equal(haosu.target, 15);
});

test('轉接層：進度差由同一組 meta 換算，目標為零時不給比率', () => {
  const A = loadAdapter();
  const m = A.kpicalcMetric({ a: 10, t: 16 }, SAMPLE.meta);
  assert.ok(Math.abs(m.daily_gap - (10 - 16 * 29 / 31)) < 1e-9);
  const zero = A.kpicalcMetric({ a: 3, t: 0 }, SAMPLE.meta);
  assert.equal(zero.rate, null);
  assert.equal(zero.daily_gap, null);
});

test('轉接層：個人的店點以代碼對回店名，職稱與姓名原樣傳遞', () => {
  const view = loadAdapter().kpicalcToKpiBattleView(SAMPLE, '');
  assert.equal(view.personal[0].store, '台北甲');
  assert.equal(view.personal[0].category, '店長');
  assert.equal(view.personal[0].name, '甲＊一');
  assert.equal(view.personal[0].overall_rate, 1.05);
});
