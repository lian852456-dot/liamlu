import assert from 'node:assert/strict';
import test from 'node:test';
import { buildPrivateDashboardArtifact } from './build_private_dashboard_artifact.mjs';

function fixture() {
  const runId = 'gdrive-20260827-main';
  return {
    reportRunDate: '2026-08-27',
    dataCutoffDate: '2026-08-26',
    processingRunId: runId,
    publishedAt: '2026-08-27T03:30:00.000Z',
    kpiBattle: {
      report_run_date: '2026-08-27', report_date: '2026-08-26', data_as_of_date: '2026-08-26',
      processing_run_id: runId, source_file: '0827.xlsx', stores: Array(9).fill({}), personal: Array(40).fill({}),
    },
    awardsBattle: {
      report_run_date: '2026-08-27', report_date: '2026-08-26', data_as_of_date: '2026-08-26', processing_run_id: runId,
      source_files: { store: { run_id: runId }, person: { run_id: runId } },
      phone_items: 13, store_rows: 10, stores: Array(9).fill({}), overall: { items: Array(13).fill({}) },
    },
  };
}

test('builds one fresh two-component snapshot from the same verified run', () => {
  const result = buildPrivateDashboardArtifact(fixture());
  assert.equal(result.components.kpi.status, 'fresh');
  assert.equal(result.components.awards.status, 'fresh');
  assert.equal(result.components.kpi.run_id, 'gdrive-20260827-main');
  assert.equal(result.kpiBattle.stores.length, 9);
  assert.equal(result.awardsBattle.phone_items, 13);
});

test('fails closed on single-sided awards run mismatch', () => {
  const data = fixture();
  data.awardsBattle.source_files.person.run_id = 'stale-run';
  assert.throws(() => buildPrivateDashboardArtifact(data), /awards person run ID mismatch/);
});

test('fails closed on source date mismatch', () => {
  const data = fixture();
  data.kpiBattle.report_date = '2026-08-25';
  assert.throws(() => buildPrivateDashboardArtifact(data), /KPI report date mismatch/);
});
