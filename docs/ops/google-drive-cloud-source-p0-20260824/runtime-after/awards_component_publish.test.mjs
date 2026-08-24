import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAwardsComponentReadback } from './publish_awards_component_data.mjs';

const basename = {
  store: '01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx',
  person: '01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx',
};
const source = (kind, provider = 'onedrive-cloud') => ({
  provider, driveItemId: `${kind}-id`, basename: basename[kind], canonical_basename: basename[kind],
  lastModifiedDateTime: '2026-08-24T01:00:00Z', ...(provider === 'onedrive-cloud' ? { eTag: `${kind}-etag-v2` } : { googleDriveFileId: `${kind}-id` }), size: 2048,
  sha256: kind === 'store' ? 'a'.repeat(64) : 'b'.repeat(64), source_data_date: '2026-08-23',
  run_id: 'awards-cloud-20260824-test',
});
const item = index => ({ name: `機款${index}`, actual: index, target: index + 1, rate: index / (index + 1), gap: 1 });
const row = name => ({ store: name, award: { rank: 1, projected: 100, manager_award: 10, supervisor_award: 20 }, items: Array.from({ length: 13 }, (_, i) => item(i + 1)) });

function fixture() {
  const kpi = { report_date: '2026-08-23', source_file: '0824.xlsx' };
  const awards = {
    report_date: '2026-08-23', report_run_date: '2026-08-24', data_as_of_date: '2026-08-23',
    phone_items: 13, store_rows: 10, source_files: { store: source('store'), person: source('person') },
    overall: row('北一二B整體'), stores: Array.from({ length: 9 }, (_, i) => row(`店${i + 1}`)),
  };
  const kpiMeta = { status: 'fresh', data_as_of_date: '2026-08-23', source_file: '0824.xlsx' };
  return {
    beforeSnapshot: { kpiBattle: kpi, awardsBattle: { report_date: '2026-08-22' }, components: { kpi: kpiMeta } },
    afterSnapshot: { kpiBattle: structuredClone(kpi), awardsBattle: structuredClone(awards), components: { kpi: structuredClone(kpiMeta), awards: { status: 'fresh' } } },
    snapshotStatus: {
      ownerEmail: 'lian852456@gmail.com', sharingAccess: 'PRIVATE', kpiPayloadHash: 'kpi-hash-before',
      awardsComponentStatus: 'fresh', awardsComponentDataAsOfDate: '2026-08-23', phoneItems: 13, storeRows: 10,
    },
    expectedAwards: structuredClone(awards),
    expected: { dataCutoffDate: '2026-08-23', runId: 'awards-cloud-20260824-test', kpiPayloadHashBefore: 'kpi-hash-before' },
  };
}

test('awards-only protected readback validates 13 models, nine stores, cloud pair and KPI preservation', () => {
  const result = validateAwardsComponentReadback(fixture());
  assert.equal(result.result, 'awards-component-published-verified');
  assert.equal(result.phoneItems, 13);
  assert.equal(result.stores, 9);
  assert.equal(result.kpiPayloadPreserved, true);
  assert.equal(result.sourceFiles.store.provider, 'onedrive-cloud');
});

test('awards-only readback rejects any KPI payload mutation', () => {
  const value = fixture();
  value.afterSnapshot.kpiBattle.source_file = 'modified.xlsx';
  assert.throws(() => validateAwardsComponentReadback(value), /KPI payload preservation/);
});

test('awards-only readback accepts complete Google Drive immutable identity', () => {
  const value = fixture();
  value.afterSnapshot.awardsBattle.source_files = {
    store: source('store', 'google-drive-cloud'),
    person: source('person', 'google-drive-cloud'),
  };
  value.expectedAwards = structuredClone(value.afterSnapshot.awardsBattle);
  const result = validateAwardsComponentReadback(value);
  assert.equal(result.sourceFiles.store.provider, 'google-drive-cloud');
});
