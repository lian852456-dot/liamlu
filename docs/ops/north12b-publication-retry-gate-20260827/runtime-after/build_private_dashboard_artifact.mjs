#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function fail(message) {
  throw new Error(`private dashboard artifact blocked: ${message}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label} mismatch: expected ${expected}, got ${actual}`);
}

export function buildPrivateDashboardArtifact({
  kpiBattle,
  awardsBattle,
  reportRunDate,
  dataCutoffDate,
  processingRunId,
  publishedAt,
}) {
  if (!kpiBattle || !awardsBattle) fail('KPI and awards components are required');
  for (const [label, value] of [
    ['report run date', reportRunDate],
    ['data cutoff date', dataCutoffDate],
    ['processing run ID', processingRunId],
    ['published timestamp', publishedAt],
  ]) {
    if (!String(value || '').trim()) fail(`${label} is required`);
  }

  assertEqual(String(kpiBattle.report_run_date || ''), reportRunDate, 'KPI report run date');
  assertEqual(String(kpiBattle.report_date || ''), dataCutoffDate, 'KPI report date');
  assertEqual(String(kpiBattle.data_as_of_date || ''), dataCutoffDate, 'KPI data cutoff');
  assertEqual(String(kpiBattle.processing_run_id || kpiBattle.kpi_run_id || ''), processingRunId, 'KPI run ID');
  assertEqual(Number((kpiBattle.stores || []).length), 9, 'KPI store count');
  assertEqual(Number((kpiBattle.personal || []).length), 40, 'KPI personal count');

  assertEqual(String(awardsBattle.report_run_date || ''), reportRunDate, 'awards report run date');
  assertEqual(String(awardsBattle.report_date || ''), dataCutoffDate, 'awards report date');
  assertEqual(String(awardsBattle.data_as_of_date || ''), dataCutoffDate, 'awards data cutoff');
  assertEqual(String(awardsBattle.processing_run_id || ''), processingRunId, 'awards run ID');
  assertEqual(String(awardsBattle.source_files?.store?.run_id || ''), processingRunId, 'awards store run ID');
  assertEqual(String(awardsBattle.source_files?.person?.run_id || ''), processingRunId, 'awards person run ID');
  assertEqual(Number(awardsBattle.phone_items), 13, 'awards phone item count');
  assertEqual(Number(awardsBattle.store_rows), 10, 'awards row count');
  assertEqual(Number((awardsBattle.stores || []).length), 9, 'awards store count');
  assertEqual(Number((awardsBattle.overall?.items || []).length), 13, 'awards model count');

  return {
    version: 1,
    publishedAt,
    components: {
      kpi: {
        status: 'fresh',
        run_id: processingRunId,
        source_file: String(kpiBattle.source_file || ''),
        data_as_of_date: dataCutoffDate,
      },
      awards: {
        status: 'fresh',
        run_id: processingRunId,
        data_as_of_date: dataCutoffDate,
      },
    },
    kpiBattle,
    awardsBattle,
  };
}

async function main() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 2) {
    args.set(process.argv[index], process.argv[index + 1]);
  }
  const kpiPath = args.get('--kpi');
  const awardsPath = args.get('--awards');
  const outputPath = args.get('--output');
  if (!kpiPath || !awardsPath || !outputPath) fail('--kpi, --awards and --output are required');
  const [kpiBattle, awardsBattle] = await Promise.all([
    fs.readFile(kpiPath, 'utf8').then(JSON.parse),
    fs.readFile(awardsPath, 'utf8').then(JSON.parse),
  ]);
  const artifact = buildPrivateDashboardArtifact({
    kpiBattle,
    awardsBattle,
    reportRunDate: args.get('--report-run-date'),
    dataCutoffDate: args.get('--data-cutoff-date'),
    processingRunId: args.get('--run-id'),
    publishedAt: args.get('--published-at') || new Date().toISOString(),
  });
  const output = path.resolve(outputPath);
  await fs.mkdir(path.dirname(output), { recursive: true, mode: 0o700 });
  await fs.writeFile(output, `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  await fs.chmod(output, 0o600);
  console.log(JSON.stringify({
    status: 'ok',
    output,
    reportRunDate: artifact.kpiBattle.report_run_date,
    dataCutoffDate: artifact.kpiBattle.report_date,
    runId: artifact.components.kpi.run_id,
    kpiStores: artifact.kpiBattle.stores.length,
    kpiPersonal: artifact.kpiBattle.personal.length,
    phoneItems: artifact.awardsBattle.phone_items,
    awardsRows: artifact.awardsBattle.store_rows,
  }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
