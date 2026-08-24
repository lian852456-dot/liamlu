import assert from 'node:assert/strict';
import test from 'node:test';
import { validateKpiComponentReadback } from './publish_kpi_component_data.mjs';

const CORE = [
  ['AQ V+D 999 (含)以上', 'AQ V+D 999（含）以上'],
  ['AQ V+D 1399 (含)以上', 'AQ V+D 1399（含）以上'],
  ['好速案銷售點數', '好速案銷售點數'],
  ['RT V+D 999 (含)以上', 'RT V+D 999（含）以上'],
  ['RT V+D 1399 (含)以上', 'RT V+D 1399（含）以上'],
  ['RT上線點數', 'RT上線點數'],
];
const ITEM_KEYS = CORE.map(([key]) => key).concat(Array.from({ length: 19 }, (_, index) => `KPI-${index + 1}`));

function itemValues(seed) {
  return Object.fromEntries(ITEM_KEYS.map((key, index) => [key, {
    a: seed + index + 1,
    t: seed + index + 10,
    reportRate: (seed + index + 1) / (seed + index + 10),
  }]));
}

function supplement(index) {
  return {
    overall_kpi: 1.0351 + index / 1000,
    company_rank: 33 + index,
    overall_kpi_dod: 0.01,
    company_rank_dod: 1,
    addon_score: 11.98 + index / 10,
  };
}

function fixture() {
  const stores = Array.from({ length: 9 }, (_, index) => ({
    name: index === 0 ? '台北酒泉' : `台北店${index + 1}`,
    items: itemValues(index),
  }));
  const aggregateRates = Object.fromEntries(ITEM_KEYS.map(key => [
    key,
    stores.reduce((sum, row) => sum + row.items[key].a, 0) /
      stores.reduce((sum, row) => sum + row.items[key].t, 0),
  ]));
  const aggregateMetrics = Object.fromEntries(CORE.map(([key, snapshotKey]) => [snapshotKey, {
    actual: stores.reduce((sum, row) => sum + row.items[key].a, 0),
    target: stores.reduce((sum, row) => sum + row.items[key].t, 0),
    rate: aggregateRates[key],
  }]));
  const kpiBattle = {
    report_date: '2026-08-23', data_as_of_date: '2026-08-23', source_as_of_date: '2026-08-23',
    source_file: '0824.xlsx', kpi_run_id: 'quick-20260824-125725-777574ab',
    aggregate: { ...supplement(0), metrics: aggregateMetrics },
    stores: stores.map((row, index) => ({
      store: row.name,
      ...supplement(index + 1),
      metrics: Object.fromEntries(CORE.map(([key, snapshotKey]) => [snapshotKey, {
        actual: row.items[key].a, target: row.items[key].t, rate: row.items[key].reportRate,
      }])),
    })),
    personal: Array.from({ length: 40 }, (_, index) => ({ name: `同仁${index + 1}` })),
  };
  const awardsBattle = {
    report_date: '2026-08-22', data_as_of_date: '2026-08-22', generated_at: '2026-08-23T09:50:00+08:00',
    source_files: { store: { sha256: 'old-store' }, person: { sha256: 'old-person' } },
  };
  return {
    kpicalcData: {
      meta: { month: '2026-08', snapshotDay: 23, sourceFile: '0824.xlsx' },
      stores,
      persons: Array.from({ length: 40 }, (_, index) => ({ items: itemValues(index) })),
      items: ITEM_KEYS.map(key => ({ key })),
      aggregateRates,
    },
    beforeSnapshot: { kpiBattle: { report_date: '2026-08-22' }, awardsBattle: structuredClone(awardsBattle) },
    afterSnapshot: {
      publishedAt: '2026-08-24T18:30:00+08:00',
      kpiBattle,
      awardsBattle: structuredClone(awardsBattle),
      components: {
        kpi: { status: 'fresh', run_id: 'quick-20260824-125725-777574ab' },
        awards: { status: 'blocked', reason: 'upstream-source-not-updated' },
      },
    },
    snapshotStatus: {
      ownerEmail: 'lian852456@gmail.com', sharingAccess: 'PRIVATE',
      kpiComponentStatus: 'fresh', kpiComponentRunId: 'quick-20260824-125725-777574ab',
      awardsComponentStatus: 'blocked', awardsComponentReason: 'upstream-source-not-updated',
    },
    expected: {
      reportDate: '2026-08-23', dataAsOfDate: '2026-08-23', sourceFile: '0824.xlsx',
      runId: 'quick-20260824-125725-777574ab',
    },
  };
}

test('Case A/C：KPI fresh + awards stale 可通過 component readback，top-level publishedAt 不會讓 awards 變 fresh', () => {
  const result = validateKpiComponentReadback(fixture());
  assert.equal(result.result, 'kpi-component-published-verified');
  assert.equal(result.kpi.sourceFile, '0824.xlsx');
  assert.equal(result.kpi.dataAsOfDate, '2026-08-23');
  assert.equal(result.awards.status, 'blocked');
  assert.equal(result.awards.reportDate, '2026-08-22');
  assert.equal(result.awards.payloadPreserved, true);
});

test('Case B：awards hash/payload 未變不會阻擋 KPI component readback', () => {
  const value = fixture();
  value.beforeSnapshot.awardsBattle.source_files.store.sha256 = 'unchanged';
  value.afterSnapshot.awardsBattle.source_files.store.sha256 = 'unchanged';
  assert.equal(validateKpiComponentReadback(value).kpi.stores, 9);
});

test('Case D：KPI source/date mismatch 在 partial publish 仍 fail-closed', () => {
  for (const mutate of [
    value => { value.afterSnapshot.kpiBattle.source_file = '0823.xlsx'; },
    value => { value.afterSnapshot.kpiBattle.report_date = '2026-08-24'; },
  ]) {
    const value = fixture();
    mutate(value);
    assert.throws(() => validateKpiComponentReadback(value), /KPI component publish blocked|dashboard KPI/);
  }
});
