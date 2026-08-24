import { createHash } from 'node:crypto';
import { dataCutoffDateFromSourceRange } from './source_date_range.mjs';

export const SOURCE_BATCH_SCHEMA = 'north12b-source-batch/v1';

export const REQUIRED_AWARD_SOURCE_BASENAMES = Object.freeze({
  store: '01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx',
  person: '01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx',
});

const REQUIRED_DATE_ANCHORS = Object.freeze({
  kpi: Object.freeze({
    sheet: '上線數KPI_達成率',
    cells: Object.freeze(['D6', 'C10', 'C57']),
  }),
  store: Object.freeze({
    sheet: '上線數KPI_店點達成率_明細',
    cells: Object.freeze(['H6']),
  }),
  person: Object.freeze({
    sheet: '手機競賽_個人達成率',
    cells: Object.freeze(['D6']),
  }),
});

function blocked(message) {
  throw new Error(`same source batch blocked: ${message}`);
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ''));
}

function requiredString(value, label) {
  const text = String(value || '').trim();
  if (!text) blocked(`${label} is missing`);
  return text;
}

function canonicalKpiSourceFile(value, reportRunDate) {
  const file = requiredString(value, 'KPI source file').replaceAll('\\', '/').split('/').at(-1);
  const expected = `${reportRunDate.slice(5).replace('-', '')}.xlsx`;
  if (file !== expected) blocked(`KPI source file mismatch: expected ${expected}, got ${file}`);
  return file;
}

function validateDateProvenance(entry, { label, sourceDateRange, anchorKey }) {
  const expected = REQUIRED_DATE_ANCHORS[anchorKey];
  const provenance = entry.date_provenance ?? entry.dateProvenance;
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) {
    blocked(`${label} date provenance is missing`);
  }
  if (provenance.sheet !== expected.sheet || provenance.value_kind !== 'literal-string') {
    blocked(`${label} date provenance anchor is invalid`);
  }
  const cells = provenance.cells;
  if (!Array.isArray(cells) || cells.length !== expected.cells.length) {
    blocked(`${label} date provenance cells are invalid`);
  }
  const observedCells = cells.map((cell) => String(cell?.cell ?? ''));
  if (observedCells.join('|') !== expected.cells.join('|')) {
    blocked(`${label} date provenance cell order is invalid`);
  }
  for (const cell of cells) {
    if (cell?.formula !== null
      || cell?.formula_layer_value !== sourceDateRange
      || cell?.cached_value !== sourceDateRange
      || cell?.display_value !== sourceDateRange) {
      blocked(`${label} Excel display/formula/cache date evidence is inconsistent`);
    }
  }
  return {
    sheet: provenance.sheet,
    value_kind: provenance.value_kind,
    cells: cells.map((cell) => ({
      cell: cell.cell,
      formula: null,
      formula_layer_value: cell.formula_layer_value,
      cached_value: cell.cached_value,
      display_value: cell.display_value,
      number_format: String(cell.number_format ?? ''),
    })),
  };
}

function sourceIdentity(entry, { label, reportRunDate, anchorKey, expectedBasename = '', requireStagedHash = false }) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    blocked(`${label} identity is missing`);
  }
  const sourceDateRange = requiredString(entry.source_date_range ?? entry.sourceDateRange, `${label} source_date_range`);
  const sourceDataDate = dataCutoffDateFromSourceRange(sourceDateRange, reportRunDate);
  const dateProvenance = validateDateProvenance(entry, { label, sourceDateRange, anchorKey });
  const statedDataDate = String(entry.source_data_date ?? entry.sourceDataDate ?? '').trim();
  if (!statedDataDate) blocked(`${label} source_data_date is missing`);
  if (statedDataDate !== sourceDataDate) {
    blocked(`${label} source_data_date mismatch: expected ${sourceDataDate}, got ${statedDataDate}`);
  }
  const sha256 = String(entry.sha256 || '').toLowerCase();
  if (!isSha256(sha256)) blocked(`${label} SHA-256 is missing`);
  const provider = requiredString(entry.provider, `${label} provider`);
  if (!['onedrive-cloud', 'google-drive-cloud'].includes(provider)) {
    blocked(`${label} provider must be an approved cloud provider`);
  }
  const driveItemId = requiredString(entry.driveItemId, `${label} driveItemId`);
  const lastModifiedDateTime = requiredString(entry.lastModifiedDateTime, `${label} lastModifiedDateTime`);
  if (Number.isNaN(Date.parse(lastModifiedDateTime))) blocked(`${label} lastModifiedDateTime is invalid`);
  const eTag = String(entry.eTag || '').trim();
  if (provider === 'onedrive-cloud' && !eTag) blocked(`${label} OneDrive eTag is missing`);
  const size = Number(entry.size);
  if (!Number.isSafeInteger(size) || size <= 0) blocked(`${label} size is invalid`);
  const runId = requiredString(entry.run_id ?? entry.runId, `${label} run_id`);
  const absolutePath = requiredString(entry.absolute_path ?? entry.absolutePath, `${label} absolute path`);
  const stagedSha256 = String(entry.staged_sha256 ?? entry.stagedSha256 ?? '').toLowerCase();
  if (requireStagedHash && !isSha256(stagedSha256)) {
    blocked(`${label} staged SHA-256 is missing`);
  }
  if (stagedSha256 && stagedSha256 !== sha256) {
    blocked(`${label} original/staged SHA-256 mismatch`);
  }
  const basename = String(entry.canonical_basename ?? entry.basename ?? '').trim();
  if (expectedBasename && basename !== expectedBasename) {
    blocked(`${label} source basename mismatch: expected ${expectedBasename}, got ${basename}`);
  }
  return {
    ...(basename ? { basename } : {}),
    provider,
    driveItemId,
    canonical_basename: basename,
    lastModifiedDateTime,
    ...(eTag ? { eTag } : {}),
    ...(provider === 'google-drive-cloud' ? { googleDriveFileId: driveItemId } : {}),
    size,
    sha256,
    run_id: runId,
    absolute_path: absolutePath,
    source_date_range: sourceDateRange,
    source_data_date: sourceDataDate,
    date_provenance: dateProvenance,
    ...(stagedSha256 ? { staged_sha256: stagedSha256 } : {}),
    ...(entry.mtime ? { mtime: String(entry.mtime) } : {}),
  };
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * Validate the immutable business-date and hash chain shared by the KPI and
 * both phone-award reports.  Filesystem mtimes are recorded for audit only:
 * they must never stand in for a workbook's business data date.
 */
export function validateSameSourceBatch({ reportRunDate, kpi, awards }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(reportRunDate || ''))) {
    blocked('report run date is invalid');
  }
  const kpiIdentity = sourceIdentity(kpi, {
    label: 'KPI', reportRunDate, anchorKey: 'kpi',
    expectedBasename: canonicalKpiSourceFile(kpi.source_file ?? kpi.sourceFile, reportRunDate),
    requireStagedHash: true,
  });
  kpiIdentity.source_file = canonicalKpiSourceFile(kpi.source_file ?? kpi.sourceFile, reportRunDate);

  if (!awards || typeof awards !== 'object' || Array.isArray(awards)) {
    blocked('awards identities are missing');
  }
  const awardIdentities = Object.fromEntries(Object.entries(REQUIRED_AWARD_SOURCE_BASENAMES).map(([kind, basename]) => [
    kind,
    sourceIdentity(awards[kind], {
      label: `awards ${kind}`,
      reportRunDate,
      anchorKey: kind,
      expectedBasename: basename,
      requireStagedHash: true,
    }),
  ]));

  const cutoff = kpiIdentity.source_data_date;
  for (const [kind, entry] of Object.entries(awardIdentities)) {
    if (entry.source_data_date !== cutoff) {
      blocked(`KPI/awards ${kind} data cutoff mismatch: KPI ${cutoff}, awards ${entry.source_data_date}`);
    }
  }

  const record = {
    schema_version: SOURCE_BATCH_SCHEMA,
    report_run_date: reportRunDate,
    data_cutoff_date: cutoff,
    kpi: kpiIdentity,
    awards: awardIdentities,
  };
  return { ...record, batch_id: fingerprint(record) };
}
