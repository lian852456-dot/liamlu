import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { validateSameSourceBatch } from './source_batch_gate.mjs';

const RUN_DATE = '2026-08-24';
const dateProvenance = (sheet, cells, sourceDateRange) => ({
  sheet,
  value_kind: 'literal-string',
  cells: cells.map((cell) => ({
    cell,
    formula: null,
    formula_layer_value: sourceDateRange,
    cached_value: sourceDateRange,
    display_value: sourceDateRange,
    number_format: 'General',
  })),
});
const cloudIdentity = (kind, sha, basename) => ({
  provider: 'onedrive-cloud',
  driveItemId: `${kind}-item-id`,
  canonical_basename: basename,
  lastModifiedDateTime: '2026-08-24T01:00:00Z',
  eTag: `${kind}-etag-v2`,
  size: 1024,
  sha256: sha,
  staged_sha256: sha,
  run_id: 'awards-cloud-20260824-test',
});

const AWARDS = {
  store: {
    ...cloudIdentity('store', 'a'.repeat(64), '01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx'),
    canonical_basename: '01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx',
    sha256: 'a'.repeat(64),
    absolute_path: '/private/onedrive/store.xlsx',
    staged_sha256: 'a'.repeat(64),
    source_date_range: '2026/08/01 ~ 08/23',
    source_data_date: '2026-08-23',
    date_provenance: dateProvenance('上線數KPI_店點達成率_明細', ['H6'], '2026/08/01 ~ 08/23'),
    // An older local sync time must not invalidate current workbook data.
    mtime: '2026-08-20T09:40:00+08:00',
  },
  person: {
    ...cloudIdentity('person', 'b'.repeat(64), '01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx'),
    canonical_basename: '01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx',
    sha256: 'b'.repeat(64),
    absolute_path: '/private/onedrive/person.xlsx',
    staged_sha256: 'b'.repeat(64),
    source_date_range: '2026/08/01 ~ 08/23',
    source_data_date: '2026-08-23',
    date_provenance: dateProvenance('手機競賽_個人達成率', ['D6'], '2026/08/01 ~ 08/23'),
    mtime: '2026-08-20T09:40:01+08:00',
  },
};

function fixture() {
  return {
    reportRunDate: RUN_DATE,
    kpi: {
      ...cloudIdentity('kpi', 'c'.repeat(64), '0824.xlsx'),
      source_file: '0824.xlsx',
      sha256: 'c'.repeat(64),
      absolute_path: '/private/onedrive/0824.xlsx',
      source_date_range: '2026/08/01 ~ 08/23',
      source_data_date: '2026-08-23',
      date_provenance: dateProvenance('上線數KPI_達成率', ['D6', 'C10', 'C57'], '2026/08/01 ~ 08/23'),
      mtime: '2026-08-20T09:39:00+08:00',
    },
    awards: structuredClone(AWARDS),
  };
}

test('同批 KPI 與台獎以商業資料日期和 hash 通過，並留下 deterministic batch id', () => {
  const result = validateSameSourceBatch(fixture());
  assert.equal(result.report_run_date, RUN_DATE);
  assert.equal(result.data_cutoff_date, '2026-08-23');
  assert.match(result.batch_id, /^[a-f0-9]{64}$/);
  assert.equal(result.awards.store.staged_sha256, 'a'.repeat(64));
});

test('Google Drive cloud identity 可通過同一 batch gate，且不偽造 OneDrive eTag', () => {
  const value = fixture();
  for (const entry of [value.kpi, value.awards.store, value.awards.person]) {
    entry.provider = 'google-drive-cloud';
    entry.googleDriveFileId = entry.driveItemId;
    delete entry.eTag;
  }
  const result = validateSameSourceBatch(value);
  assert.equal(result.kpi.provider, 'google-drive-cloud');
  assert.equal(result.awards.store.googleDriveFileId, result.awards.store.driveItemId);
  assert.equal('eTag' in result.awards.store, false);
});

test('今天 KPI 搭配昨天台獎必須在任何寄送或發布前 fail-closed', () => {
  const value = fixture();
  value.awards.person.source_date_range = '2026/08/01 ~ 08/22';
  value.awards.person.source_data_date = '2026-08-22';
  value.awards.person.date_provenance = dateProvenance('手機競賽_個人達成率', ['D6'], '2026/08/01 ~ 08/22');
  assert.throws(
    () => validateSameSourceBatch(value),
    /KPI\/awards person data cutoff mismatch: KPI 2026-08-23, awards 2026-08-22/,
  );
});

test('Excel 顯示日期、公式層與快取層任一不一致都必須阻擋', () => {
  const value = fixture();
  value.awards.store.date_provenance.cells[0].cached_value = '2026/08/01 ~ 08/22';
  assert.throws(
    () => validateSameSourceBatch(value),
    /awards store Excel display\/formula\/cache date evidence is inconsistent/,
  );
});

test('缺少任一台獎或原始與 staged hash 不一致都必須阻擋', () => {
  const missing = fixture();
  delete missing.awards.person;
  assert.throws(() => validateSameSourceBatch(missing), /awards person identity is missing/);

  const divergent = fixture();
  divergent.awards.store.staged_sha256 = 'd'.repeat(64);
  assert.throws(() => validateSameSourceBatch(divergent), /original\/staged SHA-256 mismatch/);
});

test('Cloud-first resolver、寄送 gate 與正式發布都保留來源 identity；KPI 不被 stale awards 阻擋', async () => {
  const [runner, preflight, publisher, websiteBuilder] = await Promise.all([
    fs.readFile(new URL('./run_daily_north12b_report.mjs', import.meta.url), 'utf8'),
    fs.readFile(new URL('./prepare_send_payloads.mjs', import.meta.url), 'utf8'),
    fs.readFile(new URL('./publish_formal_website_data.mjs', import.meta.url), 'utf8'),
    fs.readFile(new URL('./build_github_pages_data.py', import.meta.url), 'utf8'),
  ]);
  assert.match(runner, /REPORT_SOURCE_MODE \?\? "google-drive-cloud"/);
  assert.match(runner, /GOOGLE_DRIVE_SOURCE_MANIFEST/);
  assert.match(runner, /resolveOneDriveCloudSourceSet/);
  assert.match(runner, /REPORT_LOCAL_EMERGENCY_ENABLED/);
  assert.match(runner, /requiredKinds: \["kpi"\]/);
  assert.match(preflight, /validateDispatchSourceBatch/);
  assert.match(preflight, /kpiSourceIdentity: phoneSummary\?\.source_batch\?\.kpi/);
  assert.match(preflight, /date_provenance: entry\.date_provenance/);
  assert.match(preflight, /'google-drive-cloud'/);
  assert.match(preflight, /'onedrive-cloud'/);
  assert.match(preflight, /driveItemId: String\(entry\.driveItemId/);
  assert.match(preflight, /lastModifiedDateTime: String\(entry\.lastModifiedDateTime/);
  assert.match(preflight, /provider === 'onedrive-cloud'/);
  assert.match(preflight, /provider === 'google-drive-cloud'/);
  assert.match(preflight, /absolute_path: absolutePath/);
  assert.match(publisher, /validateManifestSourceBatch/);
  assert.ok(websiteBuilder.indexOf('validated_award_source_files(batch_summary') < websiteBuilder.indexOf('args.site_data_dir.mkdir'));
});
