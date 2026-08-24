import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CANONICAL_AWARDS_BASENAMES,
  DEFAULT_GOOGLE_DRIVE_FOLDER_ID,
  GOOGLE_DRIVE_HANDOFF_SCHEMA,
  GOOGLE_DRIVE_PROVIDER,
  resolveGoogleDriveCloudHandoff,
  selectCanonicalGoogleDriveItems,
  validateGoogleDriveAwardsFreshness,
} from './google_drive_cloud_source.mjs';

const RUN_DATE = '2026-08-24';
const xlsxBytes = (label) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(label)]);

async function withTemp(callback) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'google-drive-cloud-source-'));
  try { return await callback(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

async function handoffFixture(root, overrides = {}) {
  const bytes = {
    kpi: xlsxBytes('kpi-2026-08-23'),
    store: xlsxBytes('store-2026-08-23'),
    person: xlsxBytes('person-2026-08-23'),
  };
  const names = { kpi: '0824.xlsx', ...CANONICAL_AWARDS_BASENAMES };
  const sources = {};
  for (const kind of ['kpi', 'store', 'person']) {
    const downloaded = path.join(root, `downloaded-${kind}.xlsx`);
    await fs.writeFile(downloaded, bytes[kind]);
    sources[kind] = {
      id: `${kind}-google-id`,
      title: names[kind],
      modified_time: `2026-08-24T14:1${kind === 'store' ? '5' : '6'}:00.000Z`,
      size: String(bytes[kind].length),
      mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      parent_ids: [DEFAULT_GOOGLE_DRIVE_FOLDER_ID],
      downloaded_path: downloaded,
      ...(overrides[kind] || {}),
    };
  }
  return {
    bytes,
    handoff: {
      schema_version: GOOGLE_DRIVE_HANDOFF_SCHEMA,
      provider: GOOGLE_DRIVE_PROVIDER,
      report_run_date: RUN_DATE,
      run_id: 'gdrive-test-run',
      folder_id: DEFAULT_GOOGLE_DRIVE_FOLDER_ID,
      sources,
    },
  };
}

test('雲端新、本機舊：只使用 handoff 三檔並建立 run-scoped immutable staging', async () => {
  await withTemp(async (root) => {
    const { handoff } = await handoffFixture(root);
    const result = await resolveGoogleDriveCloudHandoff({ handoff, stagingRoot: path.join(root, 'staging') });
    assert.equal(result.provider, GOOGLE_DRIVE_PROVIDER);
    assert.equal(result.sources.kpi.canonical_basename, '0824.xlsx');
    for (const kind of ['kpi', 'store', 'person']) {
      assert.match(path.basename(result.sources[kind].staged_path), new RegExp(`${kind}--gdrive-test-run--${kind}-google-id--[a-f0-9]{16}`));
      assert.equal(result.sources[kind].sha256, result.sources[kind].staged_sha256);
    }
  });
});

test('cloud handoff 失敗時即使存在本機舊檔也必須 BLOCKED', async () => {
  await withTemp(async (root) => {
    const { handoff } = await handoffFixture(root);
    handoff.sources.store.downloaded_path = path.join(root, 'missing.xlsx');
    await assert.rejects(
      resolveGoogleDriveCloudHandoff({ handoff, stagingRoot: path.join(root, 'staging') }),
      /download is unreadable/,
    );
  });
});

test('Google Drive file ID 或 modifiedTime 改變但 raw SHA 未變仍不得冒充新版', () => {
  const sha = 'a'.repeat(64);
  const previous = {
    store: { provider: GOOGLE_DRIVE_PROVIDER, sha256: sha },
    person: { provider: GOOGLE_DRIVE_PROVIDER, sha256: 'b'.repeat(64) },
  };
  const current = {
    store: { provider: GOOGLE_DRIVE_PROVIDER, driveItemId: 'new-id', lastModifiedDateTime: '2026-08-24T00:00:00Z', sha256: sha },
    person: { provider: GOOGLE_DRIVE_PROVIDER, driveItemId: 'new-id-2', lastModifiedDateTime: '2026-08-24T00:00:00Z', sha256: 'b'.repeat(64) },
  };
  assert.throws(() => validateGoogleDriveAwardsFreshness(current, previous), /raw SHA-256 are unchanged/);
});

test('一份 awards 更新、一份 hash 未更新必須 BLOCKED', () => {
  const previous = {
    store: { provider: GOOGLE_DRIVE_PROVIDER, sha256: 'a'.repeat(64) },
    person: { provider: GOOGLE_DRIVE_PROVIDER, sha256: 'b'.repeat(64) },
  };
  const current = {
    store: { provider: GOOGLE_DRIVE_PROVIDER, sha256: 'c'.repeat(64) },
    person: { provider: GOOGLE_DRIVE_PROVIDER, sha256: 'b'.repeat(64) },
  };
  assert.throws(() => validateGoogleDriveAwardsFreshness(current, previous), /partially updated/);
});

test('duplicate suffix、錯誤 parent、缺一份任一情況均不得選取', async () => {
  await withTemp(async (root) => {
    const { handoff } = await handoffFixture(root);
    const items = Object.values(handoff.sources);
    assert.equal(selectCanonicalGoogleDriveItems(items, RUN_DATE).store.driveItemId, 'store-google-id');

    const duplicateOnly = structuredClone(items);
    duplicateOnly.find((entry) => entry.id === 'store-google-id').title = CANONICAL_AWARDS_BASENAMES.store.replace('.xlsx', ' 6.xlsx');
    assert.throws(() => selectCanonicalGoogleDriveItems(duplicateOnly, RUN_DATE), /canonical item count must be 1/);

    const wrongParent = structuredClone(items);
    wrongParent.find((entry) => entry.id === 'person-google-id').parent_ids = ['other-folder'];
    assert.throws(() => selectCanonicalGoogleDriveItems(wrongParent, RUN_DATE), /outside the configured Google Drive folder/);
  });
});
