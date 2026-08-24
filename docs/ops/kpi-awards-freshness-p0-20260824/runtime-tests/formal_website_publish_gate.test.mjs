import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessCurrentKpicalc,
  canonicalAwardsSourceFiles,
  canonicalSourceFile,
  validateDualFormalReadback,
  validateKpiRateReadback,
  validateKpiSupplementReadback,
  withBoundedReadbackRetry,
} from './publish_formal_website_data.mjs';
import { allowSameDateRateRepair, hasKpiRateCoverage } from './publish_kpicalc_report.mjs';

const CORE = [
  ['A999', 'AQ V+D 999 (含)以上', 'AQ V+D 999（含）以上'],
  ['A1399', 'AQ V+D 1399 (含)以上', 'AQ V+D 1399（含）以上'],
  ['好速', '好速案銷售點數', '好速案銷售點數'],
  ['R999', 'RT V+D 999 (含)以上', 'RT V+D 999（含）以上'],
  ['R1399', 'RT V+D 1399 (含)以上', 'RT V+D 1399（含）以上'],
  ['RT', 'RT上線點數', 'RT上線點數'],
];
const ITEM_KEYS = CORE.map(([, key]) => key).concat(Array.from({ length: 19 }, (_, i) => `KPI-${i + 1}`));
const AWARDS_SOURCES = Object.freeze({
  store: {
    basename: '01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx',
    sha256: 'a'.repeat(64), mtime: '2026-08-07T09:40:28+08:00', run_id: 'fixture-20260808-store',
  },
  person: {
    basename: '01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx',
    sha256: 'b'.repeat(64), mtime: '2026-08-07T09:40:56+08:00', run_id: 'fixture-20260808-person',
  },
});

function itemValues(seed = 0) {
  return Object.fromEntries(ITEM_KEYS.map((key, index) => [key, {
    a: seed + index + 1,
    t: seed + index + 10,
    reportRate: 1 + seed / 100 + index / 100,
  }]));
}

function snapshotMetrics(items) {
  return Object.fromEntries(CORE.map(([, key, snapshotKey]) => [snapshotKey, {
    actual: items[key].a,
    target: items[key].t,
    rate: items[key].reportRate,
  }]));
}

function fixture() {
  const stores = Array.from({ length: 9 }, (_, index) => ({
    code: `DNB${index + 1}`,
    name: index === 0 ? '台北酒泉' : `台北店${index + 1}`,
    items: itemValues(index),
  }));
  const aggregateRates = Object.fromEntries(ITEM_KEYS.map(key => [
    key,
    stores.reduce((sum, row) => sum + row.items[key].a, 0) /
      (stores.reduce((sum, row) => sum + row.items[key].t, 0) || 1),
  ]));
  const aggregateMetrics = {};
  for (const [, key, snapshotKey] of CORE) {
    aggregateMetrics[snapshotKey] = {
      actual: stores.reduce((sum, row) => sum + row.items[key].a, 0),
      target: stores.reduce((sum, row) => sum + row.items[key].t, 0),
      rate: aggregateRates[key],
    };
  }
  const awardItems = Array.from({ length:13 }, (_, index) => ({
    name: index < CORE.length ? CORE[index][0] : `Model-${index + 1}`,
    actual: index + 1, target: index + 5,
    rate: (index + 1) / (index + 5), gap: index + 2,
  }));
  const supplement = index => ({
    overall_kpi: 1 + index / 100,
    company_rank: 20 + index,
    overall_kpi_dod: 0.01,
    company_rank_dod: 1,
    addon_score: 12 + index / 10,
  });
  const awardsBattle = {
    report_date: '2026-08-07', data_as_of_date: '2026-08-07', report_run_date: '2026-08-08',
    source_files: structuredClone(AWARDS_SOURCES), phone_items: 13, store_rows: 10,
    overall: { store: '北一二B整體', award: { rank: '30', projected: 1000 }, items: awardItems },
    stores: Array.from({ length: 9 }, (_, index) => ({
      store: index === 0 ? '酒泉' : `店${index + 1}`,
      award: { rank: String(index + 1), projected: 100 + index },
      items: awardItems,
    })),
  };
  return {
    kpicalcData: {
      meta: { month: '2026-08', snapshotDay: 7, sourceFile: '0808.xlsx' },
      stores,
      persons: Array.from({ length: 40 }, (_, index) => ({ items: itemValues(index) })),
      items: ITEM_KEYS.map(key => ({ key })),
      aggregateRates,
    },
    snapshot: {
      kpiBattle: {
        report_date: '2026-08-07', report_run_date: '2026-08-08', data_as_of_date: '2026-08-07', source_as_of_date: '2026-08-07', source_file: '0808.xlsx',
        aggregate: { ...supplement(0), metrics: aggregateMetrics },
        stores: stores.map((row, index) => ({
          store: row.name,
          ...supplement(index + 1),
          metrics: snapshotMetrics(row.items),
        })),
      },
      awardsBattle,
    },
    snapshotStatus: {
      ownerEmail: 'lian852456@gmail.com', sharingAccess: 'PRIVATE',
      kpiReportDate: '2026-08-07', awardsReportDate: '2026-08-07',
    },
    expected: {
      reportDate: '2026-08-07', dataAsOfDate: '2026-08-07', sourceFile: '0808.xlsx',
      phoneItems: 13, storeRows: 10, awardsBattle: JSON.parse(JSON.stringify(awardsBattle)),
    },
  };
}

test('雙正式路徑來源與日期一致才通過', () => {
  const result = validateDualFormalReadback(fixture());
  assert.equal(result.result, 'published-verified');
  assert.equal(result.datesAligned, true);
  assert.equal(result.sourcesAligned, true);
  assert.equal(result.kpicalc.rateVerification.aggregateRates, true);
  assert.equal(result.kpicalc.rateVerification.reportRate, true);
  assert.equal(result.kpicalc.rateVerification.aggregateSpotChecks.length, 6);
  assert.equal(result.kpicalc.rateVerification.sampledStores.length, 3);
  assert.equal(result.kpicalc.supplementVerification.stores, 9);
  assert.equal(result.dashboard.awardVerification.sourceFiles.store.basename,
    '01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx');
  assert.equal(result.dashboard.awardVerification.sourceFiles.person.basename,
    '01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx');
});

test('KPI 0822.xlsx 與獨立台獎來源不會覆蓋 0821 正式資料截止日', () => {
  const value = fixture();
  value.kpicalcData.meta.snapshotDay = 21;
  value.kpicalcData.meta.sourceFile = '0822.xlsx';
  value.snapshot.kpiBattle.report_date = '2026-08-21';
  value.snapshot.kpiBattle.report_run_date = '2026-08-22';
  value.snapshot.kpiBattle.data_as_of_date = '2026-08-21';
  value.snapshot.kpiBattle.source_as_of_date = '2026-08-21';
  value.snapshot.kpiBattle.source_file = '0822.xlsx';
  value.snapshot.awardsBattle.report_date = '2026-08-21';
  value.snapshot.awardsBattle.data_as_of_date = '2026-08-21';
  value.snapshot.awardsBattle.report_run_date = '2026-08-22';
  value.snapshotStatus.kpiReportDate = '2026-08-21';
  value.snapshotStatus.awardsReportDate = '2026-08-21';
  value.expected.reportDate = '2026-08-21';
  value.expected.dataAsOfDate = '2026-08-21';
  value.expected.sourceFile = '0822.xlsx';
  value.expected.awardsBattle = JSON.parse(JSON.stringify(value.snapshot.awardsBattle));
  const result = validateDualFormalReadback(value);
  assert.equal(result.reportDate, '2026-08-21');
  assert.equal(result.dataAsOfDate, '2026-08-21');
  assert.equal(result.sourceFile, '0822.xlsx');
  assert.equal(result.datesAligned, true);
});

test('台獎 source_files 兩支正式來源都存在時可通過，並保留 KPI 25 項與台獎 13／10 gate', () => {
  const value = fixture();
  const result = validateDualFormalReadback(value);
  assert.equal(value.kpicalcData.stores.length, 9);
  assert.equal(value.kpicalcData.persons.length, 40);
  assert.equal(value.kpicalcData.items.length, 25);
  assert.equal(result.dashboard.phoneItems, 13);
  assert.equal(result.dashboard.storeRows, 10);
  assert.equal(canonicalAwardsSourceFiles(value.snapshot.awardsBattle.source_files).store.basename,
    '01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx');
  assert.equal(canonicalAwardsSourceFiles(value.snapshot.awardsBattle.source_files).person.basename,
    '01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx');
});

test('台獎 source_files 任一缺漏、空白或無法 canonical 比對時必須 blocked', () => {
  for (const mutate of [
    value => { delete value.store; },
    value => { value.person = ''; },
    value => { value.store = { ...value.store, basename: 'not-an-awards-source.xlsx' }; },
  ]) {
    const value = fixture();
    mutate(value.snapshot.awardsBattle.source_files);
    assert.throws(() => validateDualFormalReadback(value), /awards .*source (identity|basename)/);
  }
});

test('台獎來源被誤填為 KPI 0823.xlsx 時必須 blocked', () => {
  const value = fixture();
  value.snapshot.awardsBattle.source_files.store = { ...value.snapshot.awardsBattle.source_files.store, basename: '0823.xlsx' };
  assert.throws(() => validateDualFormalReadback(value), /dashboard awards .*source basename mismatch/);
});

test('KPI 與台獎資料截止日不一致時必須 blocked', () => {
  const value = fixture();
  value.snapshot.awardsBattle.report_date = '2026-08-06';
  assert.throws(() => validateDualFormalReadback(value), /dashboard awards report date mismatch/);
});

test('正式 KPI 已為同日完整來源時，pipeline 可跳過失效的快速上傳 deployment', () => {
  const value = fixture();
  const assessment = assessCurrentKpicalc({
    kpicalcData:value.kpicalcData,
    kpiSnapshot:value.snapshot.kpiBattle,
    expected:value.expected,
  });
  assert.equal(assessment.ready, true);
  assert.equal(assessment.formal.sourceFile, '0808.xlsx');
  assert.equal(assessment.formal.stores, 9);
  assert.equal(assessment.formal.kpiItems, 25);

  value.kpicalcData.meta.sourceFile = '0807.xlsx';
  const mismatch = assessCurrentKpicalc({
    kpicalcData:value.kpicalcData,
    kpiSnapshot:value.snapshot.kpiBattle,
    expected:value.expected,
  });
  assert.equal(mismatch.ready, false);
  assert.match(mismatch.reason, /source file mismatch/);
});

test('受控 report-upload 暫存檔名還原原始日期檔，並保留 raw source 證據', () => {
  const value = fixture();
  const raw = 'report-upload-temp-a71b372c443449d5b05e6d8a226130b6-0808.xlsx';
  value.kpicalcData.meta.sourceFile = raw;
  assert.equal(canonicalSourceFile(raw), '0808.xlsx');
  const assessment = assessCurrentKpicalc({
    kpicalcData:value.kpicalcData,
    kpiSnapshot:value.snapshot.kpiBattle,
    expected:value.expected,
  });
  assert.equal(assessment.ready, true);
  assert.equal(assessment.formal.sourceFile, '0808.xlsx');
  assert.equal(assessment.formal.rawSourceFile, raw);
  assert.equal(assessment.formal.sourceCanonicalized, true);
  const publication = validateDualFormalReadback(value);
  assert.equal(publication.kpicalc.sourceFile, '0808.xlsx');
  assert.equal(publication.kpicalc.rawSourceFile, raw);
  assert.equal(publication.kpicalc.sourceCanonicalized, true);
});

test('區與九店 supplement 排名、DOD、排名變化、加減分缺欄即 blocked', () => {
  const value = fixture();
  assert.equal(validateKpiSupplementReadback(value.snapshot.kpiBattle, value.expected).stores, 9);
  value.snapshot.kpiBattle.stores[3].company_rank_dod = null;
  assert.throws(
    () => validateKpiSupplementReadback(value.snapshot.kpiBattle, value.expected),
    /KPI supplement field is missing: company_rank_dod/,
  );
});

test('正式台獎快照必須與本機正式來源逐值一致並抽驗三店', () => {
  const value = fixture();
  const result = validateDualFormalReadback(value);
  assert.equal(result.dashboard.awardVerification.exactMatch, true);
  assert.equal(result.dashboard.awardVerification.sampledStores.length, 3);
  const mismatch = fixture();
  mismatch.snapshot.awardsBattle.stores[0].items[0].actual += 1;
  assert.throws(() => validateDualFormalReadback(mismatch), /does not exactly match/);
});

test('缺 aggregateRates 時發布狀態不得標記 published-verified', () => {
  const value = fixture();
  delete value.kpicalcData.aggregateRates;
  assert.throws(() => validateDualFormalReadback(value), /aggregateRates is missing/);
});

test('缺任一 reportRate 欄位時發布必須 blocked', () => {
  const value = fixture();
  delete value.kpicalcData.stores[0].items['KPI-1'].reportRate;
  assert.throws(() => validateKpiRateReadback(value.kpicalcData, value.snapshot.kpiBattle), /reportRate field is missing/);
});

test('關鍵 KPI rate 為空或三店比對不一致時發布必須 blocked', () => {
  const empty = fixture();
  empty.kpicalcData.aggregateRates['AQ V+D 999 (含)以上'] = null;
  assert.throws(() => validateKpiRateReadback(empty.kpicalcData, empty.snapshot.kpiBattle), /aggregate A999 rate is missing/);

  const mismatch = fixture();
  mismatch.kpicalcData.stores[1].items['好速案銷售點數'].reportRate += 0.01;
  assert.throws(() => validateKpiRateReadback(mismatch.kpicalcData, mismatch.snapshot.kpiBattle), /rate mismatch/);
});

test('非受控暫存來源檔名不得冒充完成', () => {
  const value = fixture();
  value.kpicalcData.meta.sourceFile = 'report-upload-temp-token-0808.xlsx';
  assert.throws(() => validateDualFormalReadback(value), /kpicalc source file mismatch/);
});

test('KPI 台獎來源同步必須使用現行 Private API 並跳過名冊同步', async () => {
  const wrapper = await import('node:fs/promises').then(fs => fs.readFile(
    new URL('./publish_formal_website_with_keychain.sh', import.meta.url), 'utf8',
  ));
  const publisher = await import('node:fs/promises').then(fs => fs.readFile(
    new URL('./publish_formal_website_data.mjs', import.meta.url), 'utf8',
  ));
  const snapshot = await import('node:fs/promises').then(fs => fs.readFile(
    new URL('./publish_private_dashboard_snapshot.mjs', import.meta.url), 'utf8',
  ));
  assert.match(wrapper, /readonly DASHBOARD_GAS_URL="\$REPORT_ACCESS_GAS_URL_VALUE"/);
  assert.match(wrapper, /REPORT_RUN_DATE_ISO is required/);
  assert.match(wrapper, /REPORT_DATA_CUTOFF_DATE is required/);
  assert.match(publisher, /PRIVATE_DASHBOARD_SKIP_ROSTER_SYNC: '1'/);
  assert.match(snapshot, /private_admin_snapshot_status/);
  assert.match(snapshot, /skipRosterSync \? 'skipped-out-of-scope' : 'synced'/);
});

test('dashboard 與 kpicalc 日期不一致時必須 blocked', () => {
  const value = fixture();
  value.snapshot.kpiBattle.data_as_of_date = '2026-08-06';
  assert.throws(() => validateDualFormalReadback(value), /dashboard data-as-of date mismatch/);
});

test('同日同來源缺 rate 才允許一次性 force repair', () => {
  const value = fixture();
  assert.equal(hasKpiRateCoverage(value.kpicalcData), true);
  delete value.kpicalcData.aggregateRates;
  assert.equal(hasKpiRateCoverage(value.kpicalcData), false);
  assert.equal(allowSameDateRateRepair({
    preview: { needsForce: true },
    currentData: value.kpicalcData,
    fileName: '0808.xlsx',
    expectedDate: '2026-08-07',
  }), true);
});

test('不同來源、不同日期或 rate 完整時不得 force repair', () => {
  const value = fixture();
  assert.equal(allowSameDateRateRepair({
    preview: { needsForce: true },
    currentData: value.kpicalcData,
    fileName: '0808.xlsx',
    expectedDate: '2026-08-07',
  }), false);
  delete value.kpicalcData.aggregateRates;
  assert.equal(allowSameDateRateRepair({
    preview: { needsForce: true },
    currentData: value.kpicalcData,
    fileName: '0809.xlsx',
    expectedDate: '2026-08-07',
  }), false);
  assert.equal(allowSameDateRateRepair({
    preview: { needsForce: true },
    currentData: value.kpicalcData,
    fileName: '0808.xlsx',
    expectedDate: '2026-08-08',
  }), false);
});

test('正式 readback 短暫不同步時有限重試，最終仍以精確驗證結果為準', async () => {
  let calls = 0;
  const retries = [];
  const result = await withBoundedReadbackRetry(async () => {
    calls += 1;
    if (calls < 3) throw new Error('snapshot propagation pending');
    return { result: 'published-verified' };
  }, {
    attempts: 3,
    delayMs: 0,
    sleep: async () => {},
    onRetry: (_error, attempt) => retries.push(attempt),
  });
  assert.deepEqual(result, { result: 'published-verified' });
  assert.equal(calls, 3);
  assert.deepEqual(retries, [1, 2]);
});

test('正式 readback 重試用盡後仍 fail-closed', async () => {
  let calls = 0;
  await assert.rejects(
    withBoundedReadbackRetry(async () => {
      calls += 1;
      throw new Error('formal snapshot mismatch');
    }, {
      attempts: 3,
      delayMs: 0,
      sleep: async () => {},
    }),
    /formal snapshot mismatch/,
  );
  assert.equal(calls, 3);
});
