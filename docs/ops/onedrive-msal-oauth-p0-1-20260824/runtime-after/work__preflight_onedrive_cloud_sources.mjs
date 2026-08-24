#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveOneDriveCloudSourceSet, OneDriveGraphClient } from './onedrive_cloud_source.mjs';
import { acquireOneDriveGraphAccessToken } from './onedrive_graph_auth.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const logsDir = path.join(projectRoot, 'report-automation', 'logs');
const defaultStagingRoot = path.join(projectRoot, 'report-automation', 'input', 'onedrive-cloud');
const bundledPython = process.env.PYTHON_BIN
  || '/Users/liamlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3.12';

function blocked(message) {
  throw new Error(`OneDrive cloud preflight blocked: ${message}`);
}

function taipeiToday() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

export const loadOneDriveGraphAccessToken = acquireOneDriveGraphAccessToken;

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function priorIdentityFromManifest(payload) {
  return payload?.awardSourceIdentity
    || payload?.sourceIdentity
    || payload?.sourceBatch?.awards
    || null;
}

async function latestPriorCloudIdentity(reportRunDate) {
  let entries = [];
  try { entries = await fs.readdir(logsDir, { withFileTypes: true }); } catch { return null; }
  const candidates = [];
  for (const entry of entries) {
    const match = entry.isFile() && entry.name.match(/^run-manifest-(\d{8})\.json$/);
    if (!match) continue;
    const day = `${match[1].slice(0, 4)}-${match[1].slice(4, 6)}-${match[1].slice(6, 8)}`;
    if (day >= reportRunDate) continue;
    try {
      const identity = priorIdentityFromManifest(await readJson(path.join(logsDir, entry.name)));
      if (identity?.store?.provider === 'onedrive-cloud' && identity?.person?.provider === 'onedrive-cloud') {
        candidates.push({ day, identity });
      }
    } catch {}
  }
  candidates.sort((a, b) => b.day.localeCompare(a.day));
  return candidates[0]?.identity || null;
}

function runPythonSourceVerification({ reportRunDate, runId, manifestPath, sources }) {
  return new Promise((resolve, reject) => {
    const child = spawn(bundledPython, [path.join(import.meta.dirname, 'update_phone_awards.py')], {
      cwd: import.meta.dirname,
      env: {
        ...process.env,
        REPORT_DATE_ISO: reportRunDate,
        REPORT_RUN_ID: runId,
        REPORT_KPI_SOURCE: sources.kpi.staged_path,
        PHONE_AWARDS_STORE_SOURCE: sources.store.staged_path,
        PHONE_AWARDS_PERSON_SOURCE: sources.person.staged_path,
        PHONE_AWARDS_SOURCE_MODE: 'onedrive-cloud',
        PHONE_AWARDS_CLOUD_MANIFEST: manifestPath,
        PHONE_AWARDS_VERIFY_SOURCE_ONLY: '1',
        PYTHONDONTWRITEBYTECODE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `update_phone_awards.py exited with ${code}`));
        return;
      }
      try { resolve(JSON.parse(stdout.trim())); } catch { reject(new Error('Excel source verifier returned invalid JSON')); }
    });
  });
}

export async function runOneDriveCloudPreflight({
  reportRunDate = process.env.REPORT_DATE_ISO || taipeiToday(),
  expectedCutoff = process.env.REPORT_DATA_CUTOFF_DATE || '',
  runId = process.env.REPORT_RUN_ID || `awards-cloud-${String(reportRunDate).replaceAll('-', '')}-${Date.now()}`,
  stagingRoot = process.env.ONEDRIVE_CLOUD_STAGING_ROOT || defaultStagingRoot,
  folderPath = process.env.ONEDRIVE_GRAPH_FOLDER_PATH || 'TWM每日戰報',
  graphClient = null,
  previousAwardsIdentity,
  verifyExcel = runPythonSourceVerification,
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportRunDate)) blocked('report run date is invalid');
  if (expectedCutoff && !/^\d{4}-\d{2}-\d{2}$/.test(expectedCutoff)) blocked('expected cutoff is invalid');
  const client = graphClient || new OneDriveGraphClient({ accessToken: await acquireOneDriveGraphAccessToken() });
  await fs.mkdir(stagingRoot, { recursive: true });
  const previous = previousAwardsIdentity === undefined
    ? await latestPriorCloudIdentity(reportRunDate)
    : previousAwardsIdentity;
  const manifest = await resolveOneDriveCloudSourceSet({
    graphClient: client,
    reportRunDate,
    runId,
    stagingRoot,
    folderPath,
    previousAwardsIdentity: previous,
  });
  const manifestPath = path.join(manifest.staging_dir, 'cloud-source-manifest.json');
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  const verified = await verifyExcel({ reportRunDate, runId, manifestPath, sources: manifest.sources });
  const cutoff = String(verified?.data_cutoff_date || '');
  if (!cutoff) blocked('Excel verifier did not return a cutoff');
  if (expectedCutoff && cutoff !== expectedCutoff) {
    blocked(`KPI cutoff mismatch: expected ${expectedCutoff}, got ${cutoff}`);
  }
  for (const kind of ['store', 'person']) {
    const entry = verified?.source_identity?.[kind];
    if (!entry || entry.source_data_date !== cutoff) {
      blocked(`${kind} Excel source_data_date does not match KPI cutoff ${cutoff}`);
    }
    manifest.sources[kind] = { ...manifest.sources[kind], ...entry };
  }
  manifest.sources.kpi = { ...manifest.sources.kpi, ...(verified.kpi_source_identity || {}) };
  if (manifest.sources.kpi.source_data_date !== cutoff) blocked('KPI Excel source_data_date mismatch');
  manifest.data_cutoff_date = cutoff;
  manifest.status = 'preflight-pass';
  manifest.preflight_completed_at = new Date().toISOString();
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { ...manifest, manifest_path: manifestPath };
}

async function main() {
  const result = await runOneDriveCloudPreflight();
  console.log(JSON.stringify({
    status: result.status,
    provider: result.provider,
    report_run_date: result.report_run_date,
    data_cutoff_date: result.data_cutoff_date,
    run_id: result.run_id,
    manifest_path: result.manifest_path,
    sources: result.sources,
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
