const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function loadPreviewContract() {
  const context = vm.createContext({ globalThis: {}, window: {} });
  context.window = context.globalThis;
  vm.runInContext(read('app-data-contract.js'), context);
  vm.runInContext(read('app-preview-data.js'), context);
  return { api:context.globalThis.LiamSupervisorContract, data:context.globalThis.LiamSupervisorPreviewData };
}

test('App 1.2 contract adds personal performance without removing frozen modules', () => {
  const { api, data } = loadPreviewContract();
  assert.equal(api.validateContract(data), data);
  assert.deepEqual([...api.MODULE_KEYS], [
    'todayOperations','kpiSummary','kpiStores','kpiFullMetrics','awardSummary','awardStores','awardTop2Models','personalPerformance',
    'report1600','report2100','reportFailures','scheduleToday','scheduleByDate','patrolToday','patrolOverview','patrolStores'
  ]);
  for (const key of api.MODULE_KEYS) {
    const module = data[key];
    assert.equal(typeof module.status, 'string');
    assert.equal(typeof module.updatedAt, 'string');
    assert.equal(typeof module.sourceUpdatedAt, 'string');
    assert.equal(typeof module.stale, 'boolean');
    assert.ok(module.source.label);
    assert.ok(module.source.href);
    assert.equal(module.sourceLink, module.source.href);
  }
});

test('Preview contract is visibly synthetic and contains the complete mobile summaries', () => {
  const { data } = loadPreviewContract();
  assert.equal(data.mode, 'preview');
  assert.equal(data.kpiStores.data.length, 9);
  assert.equal(data.awardTop2Models.data.length, 2);
  assert.equal(data.awardStores.data.length, 9);
  assert.equal(data.awardStores.data.every(store => store.items.length === 3), true);
  assert.equal(data.report1600.data.totalStores, 9);
  assert.equal(data.report2100.data.totalStores, 9);
  assert.equal(data.personalPerformance.data.people.length, 9);
  assert.equal(data.personalPerformance.data.people.every(person => person.metrics.length === 10), true);
  assert.equal(data.scheduleToday.data.stores.length, 9);
  assert.equal(data.scheduleToday.data.date, '2026-08-10');
  assert.equal(data.patrolOverview.data.total, 9);
  assert.equal(data.kpiSummary.data.fullKpis.length, 25);
  assert.equal(data.kpiStores.data.every(store => store.fullKpis.length === 25), true);
  assert.equal(data.kpiFullMetrics.data.region.length, 25);
  assert.equal(Object.keys(data.kpiFullMetrics.data.stores).length, 9);
  assert.equal(data.scheduleByDate.data.selectedDate, '2026-08-10');
  assert.equal(data.patrolStores.data.length, 9);
  assert.equal(data.patrolOverview.data.statisticsPeriod, '2026-08-01～2026-08-31（Preview）');
  assert.equal(data.patrolOverview.data.periodVerified, true);
});

test('App recovery runtime keeps existing reads and disables half-month writes', () => {
  const code = read('app.js');
  assert.match(code, /new Set\(\['private_access','read','pread','kpicalc_access'\]\)/);
  assert.match(code, /new Set\(\['private_request','private_request_status'\]\)/);
  assert.match(code, /new Set\(\['sread','ptsummary','ptdetail','ptvisit_read','hread'\]\)/);
  assert.match(code, /new Set\(\['ptvisit_write'\]\)/);
  assert.doesNotMatch(code, /new Set\(\['ptvisit_write','hwrite'\]\)/);
  assert.doesNotMatch(code, /half_media_upload/);
  for (const blocked of ["action:'write'", "action:'pwrite'", "action:'ptwrite'", '.appendRow(', '.setValue(', '.setValues(', '.createFile(']) {
    assert.ok(!code.includes(blocked), `blocked write path found: ${blocked}`);
  }
  assert.match(code, /PREVIEW_MODE/);
  assert.match(code, /Preview 僅顯示展示資料，不呼叫正式端點/);
  assert.match(code, /Preview／示意資料/);
  assert.match(code, /function fullKpiItems/);
  assert.match(code, /function renderFullKpis/);
  assert.match(code, /function adaptPatrolSummary\(raw, currentMonth\)/);
  assert.match(code, /patrolRead\('ptsummary',\{month\}\)/);
  assert.doesNotMatch(code, /summary\.periodStart|summary\.expectedCount/);
});

test('Information architecture matches the App 1.2 acceptance surfaces', () => {
  const html = read('app.html');
  for (const label of ['今日營運戰況','九店一覽','台獎總覽','戰情','每日回報','昨日待追蹤','全區營運摘要','門市請益彙整','全區未過關彙整','九店完整班表','巡店檢查','系統狀態']) {
    assert.match(html, new RegExp(label));
  }
  assert.match(html, /data-battle-kind="kpi"/);
  assert.match(html, /data-battle-kind="award"/);
  assert.match(html, /data-battle-kind="personal"/);
  assert.match(html, /data-report-segment="16"/);
  assert.match(html, /data-report-segment="21"/);
  assert.match(html, /data-nav="home"/);
  assert.match(html, /data-nav="battle"/);
  assert.match(html, /data-nav="report"/);
  assert.match(html, /data-view="schedule"/);
  assert.match(html, /data-nav="schedule"/);
  assert.match(html, /data-nav="patrol"/);
  assert.match(html, /data-profile-entry/);
  assert.doesNotMatch(html, /<nav class="bottom-nav"[\s\S]*data-nav="me"/);
});

test('device UI scope keeps nine awards, removes Top cards and renders complete mobile KPI values', () => {
  const code = read('app.js');
  const css = read('app.css');
  assert.doesNotMatch(code, /stores\.slice\(0,5\)/);
  assert.doesNotMatch(code, /Top \$\{index\+1\}|區領獎總額|主要得獎機款|100% 獎勵機型/);
  assert.match(code, /stores\.map\(row=>`<div class="award-row"/);
  assert.match(code, /row\.eligible\?'領獎':'未領獎'/);
  assert.match(code, /Array\.isArray\(row\.items\)/);
  assert.match(code, /renderAwardStoreItems\(row\)/);
  assert.doesNotMatch(code, /row\.items[^\n]*filter\([^\n]*award/);
  assert.match(css, /@media \(max-width:480px\)[\s\S]*\.store-row-primary/);
  assert.match(css, /font-variant-numeric:tabular-nums/);
  assert.doesNotMatch(css, /\.store-row[^{}]*\{[^}]*text-overflow:ellipsis/);
  assert.match(css, /\.store-row \{ position:relative; display:block; min-height:96px/);
});

test('PWA cache is versioned for App 1.2 and includes local icon library', () => {
  const html = read('app.html');
  const worker = read('service-worker.js');
  assert.match(worker, /liam-supervisor-app-1-2-patrol-paste-summary-20260815-v1/);
  assert.match(html, /app\.css\?v=daily-report-separation-phase2-1-20260814-1/);
  assert.match(html, /app-data-contract\.js\?v=emergency-rollback-20260813-1/);
  assert.match(html, /app-preview-data\.js\?v=emergency-rollback-20260813-1/);
  assert.match(html, /half-month-check-read-model\.js\?v=2/);
  assert.match(html, /yesterday-follow-up-model\.js\?v=yesterday-follow-up-phase2-20260814-1/);
  assert.match(html, /app\.js\?v=daily-report-separation-phase2-1-20260814-1/);
  assert.match(html, /patrol-read-model\.js\?v=13/);
  assert.match(worker, /patrol-read-model\.js/);
  assert.match(worker, /half-month-check-read-model\.js/);
  assert.match(worker, /yesterday-follow-up-model\.js/);
  assert.match(worker, /half-month-check-write-prep\.js/);
  assert.match(worker, /app-data-contract\.js/);
  assert.match(worker, /app-preview-data\.js/);
  assert.match(worker, /app-assets\/lucide\.min\.js/);
  assert.match(worker, /cache:'no-store'/);
});
