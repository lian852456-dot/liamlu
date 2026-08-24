import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const GOOGLE_DRIVE_PROVIDER = 'google-drive-cloud';
export const GOOGLE_DRIVE_SOURCE_SCHEMA = 'north12b-google-drive-cloud-source/v1';
export const GOOGLE_DRIVE_HANDOFF_SCHEMA = 'north12b-google-drive-cloud-handoff/v1';
export const DEFAULT_GOOGLE_DRIVE_FOLDER_ID = '1zs4flckF4uysz55tXkAxojM5-yB6a9sH';
export const CANONICAL_AWARDS_BASENAMES = Object.freeze({
  store: '01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx',
  person: '01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx',
});

function blocked(message) {
  throw new Error(`Google Drive cloud source blocked: ${message}`);
}

function requiredString(value, label) {
  const text = String(value || '').trim();
  if (!text) blocked(`${label} is missing`);
  return text;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function safeSegment(value, fallback) {
  const normalized = String(value || '')
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return normalized || fallback;
}

export function kpiBasenameForRunDate(reportRunDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reportRunDate || ''))) {
    blocked('report run date is invalid');
  }
  return `${reportRunDate.slice(5).replace('-', '')}.xlsx`;
}

function canonicalMetadata(entry, expectedName, label, folderId) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) blocked(`${label} metadata is missing`);
  const canonical = String(entry.canonical_basename || entry.name || entry.title || '');
  if (canonical !== expectedName) {
    blocked(`${label} canonical name mismatch: expected ${expectedName}, got ${canonical}`);
  }
  const driveItemId = requiredString(entry.driveItemId || entry.googleDriveFileId || entry.id, `${label} driveItemId`);
  const lastModifiedDateTime = requiredString(
    entry.lastModifiedDateTime || entry.modifiedTime || entry.modified_time,
    `${label} lastModifiedDateTime`,
  );
  if (Number.isNaN(Date.parse(lastModifiedDateTime))) blocked(`${label} lastModifiedDateTime is invalid`);
  const size = Number(entry.size);
  if (!Number.isSafeInteger(size) || size <= 0) blocked(`${label} size is invalid`);
  const mimeType = String(entry.mimeType || entry.mime_type || '');
  if (mimeType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    blocked(`${label} MIME type is not xlsx`);
  }
  const parentIds = Array.isArray(entry.parentIds || entry.parent_ids)
    ? (entry.parentIds || entry.parent_ids).map(String)
    : [];
  if (!parentIds.includes(folderId)) blocked(`${label} is outside the configured Google Drive folder`);
  return {
    provider: GOOGLE_DRIVE_PROVIDER,
    driveItemId,
    googleDriveFileId: driveItemId,
    name: expectedName,
    canonical_basename: expectedName,
    lastModifiedDateTime,
    size,
    mimeType,
    parentIds,
  };
}

export function selectCanonicalGoogleDriveItems(items, reportRunDate, folderId = DEFAULT_GOOGLE_DRIVE_FOLDER_ID) {
  if (!Array.isArray(items)) blocked('folder listing is missing');
  const expected = { kpi: kpiBasenameForRunDate(reportRunDate), ...CANONICAL_AWARDS_BASENAMES };
  const selected = {};
  for (const [kind, basename] of Object.entries(expected)) {
    const matches = items.filter((item) => String(item?.canonical_basename || item?.name || item?.title || '') === basename);
    if (matches.length !== 1) {
      blocked(`${kind} canonical item count must be 1 for ${basename}; got ${matches.length}`);
    }
    selected[kind] = canonicalMetadata(matches[0], basename, kind, folderId);
  }
  return selected;
}

export function validateGoogleDriveAwardsFreshness(current, previous) {
  if (!current?.store || !current?.person) blocked('awards source pair is incomplete');
  for (const kind of ['store', 'person']) {
    if (current[kind].provider !== GOOGLE_DRIVE_PROVIDER) blocked(`${kind} provider is not ${GOOGLE_DRIVE_PROVIDER}`);
    if (!/^[a-f0-9]{64}$/.test(String(current[kind].sha256 || ''))) blocked(`${kind} SHA-256 is missing`);
  }
  if (!previous?.store || !previous?.person) {
    return { status: 'fresh-cloud-baseline', changed: { store: true, person: true } };
  }
  const changed = Object.fromEntries(['store', 'person'].map((kind) => [
    kind,
    String(current[kind].sha256 || '') !== String(previous[kind]?.sha256 || ''),
  ]));
  if (!changed.store && !changed.person) blocked('store/person raw SHA-256 are unchanged');
  if (!changed.store || !changed.person) {
    blocked(`awards cloud pair is partially updated: store=${changed.store}, person=${changed.person}`);
  }
  return { status: 'fresh', changed };
}

async function stageOne({ kind, identity, downloadedPath, stagingDir, runId }) {
  const transportPath = path.resolve(requiredString(downloadedPath, `${kind} downloaded path`));
  const bytes = await fs.readFile(transportPath).catch((error) => {
    blocked(`${kind} Google Drive download is unreadable: ${error instanceof Error ? error.message : String(error)}`);
  });
  if (bytes.length !== identity.size) {
    blocked(`${kind} cloud download size mismatch: expected ${identity.size}, got ${bytes.length}`);
  }
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) blocked(`${kind} cloud download is not an xlsx zip`);
  const digest = sha256(bytes);
  const filename = `${kind}--${safeSegment(runId, 'run')}--${safeSegment(identity.driveItemId, 'item')}--${digest.slice(0, 16)}--${identity.canonical_basename}`;
  const stagedPath = path.join(stagingDir, filename);
  await fs.writeFile(stagedPath, bytes, { flag: 'wx', mode: 0o600 });
  const stagedSha256 = sha256(await fs.readFile(stagedPath));
  if (stagedSha256 !== digest) blocked(`${kind} staged SHA-256 mismatch`);
  return {
    ...identity,
    sha256: digest,
    run_id: runId,
    origin: GOOGLE_DRIVE_PROVIDER,
    absolute_path: stagedPath,
    staged_path: stagedPath,
    staged_sha256: stagedSha256,
  };
}

export async function resolveGoogleDriveCloudHandoff({
  handoff,
  stagingRoot,
  previousAwardsIdentity = null,
} = {}) {
  if (!handoff || typeof handoff !== 'object' || Array.isArray(handoff)) blocked('handoff is missing');
  if (handoff.schema_version !== GOOGLE_DRIVE_HANDOFF_SCHEMA || handoff.provider !== GOOGLE_DRIVE_PROVIDER) {
    blocked('handoff schema/provider is invalid');
  }
  const reportRunDate = requiredString(handoff.report_run_date, 'report_run_date');
  const runId = requiredString(handoff.run_id, 'run_id');
  const folderId = requiredString(handoff.folder_id, 'folder_id');
  if (folderId !== DEFAULT_GOOGLE_DRIVE_FOLDER_ID) blocked('Google Drive folder identity mismatch');
  if (handoff.allow_local_fallback || handoff.allow_onedrive_fallback) blocked('fallback flags are forbidden');
  const root = path.resolve(requiredString(stagingRoot, 'staging root'));
  await fs.mkdir(root, { recursive: true });
  const stagingDir = path.join(root, safeSegment(runId, 'run'));
  await fs.mkdir(stagingDir, { recursive: false });
  const rawSources = handoff.sources;
  if (!rawSources || typeof rawSources !== 'object' || Array.isArray(rawSources)) blocked('handoff sources are missing');
  const selected = selectCanonicalGoogleDriveItems(Object.values(rawSources), reportRunDate, folderId);
  const sources = {};
  for (const kind of ['kpi', 'store', 'person']) {
    const raw = rawSources[kind];
    if (!raw || String(raw.driveItemId || raw.id || '') !== selected[kind].driveItemId) {
      blocked(`${kind} handoff key does not match canonical Drive item`);
    }
    sources[kind] = await stageOne({
      kind,
      identity: selected[kind],
      downloadedPath: raw.downloaded_path,
      stagingDir,
      runId,
    });
  }
  const awardsFreshness = validateGoogleDriveAwardsFreshness(
    { store: sources.store, person: sources.person },
    previousAwardsIdentity,
  );
  return {
    schema_version: GOOGLE_DRIVE_SOURCE_SCHEMA,
    provider: GOOGLE_DRIVE_PROVIDER,
    report_run_date: reportRunDate,
    run_id: runId,
    folder_id: folderId,
    staging_dir: stagingDir,
    sources,
    awards_freshness: awardsFreshness,
  };
}

export function defaultGoogleDriveRunId(reportRunDate) {
  return `gdrive-${String(reportRunDate || '').replaceAll('-', '')}-${Date.now()}-${randomBytes(4).toString('hex')}`;
}
