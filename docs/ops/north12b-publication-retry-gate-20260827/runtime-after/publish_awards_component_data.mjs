#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { postPublicationJson } from './publication_transport_client.mjs';
import { canonicalAwardsSourceFiles, validateAwardReadback } from './publish_formal_website_data.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const workDir = path.join(projectRoot, 'report-automation', 'work');
const logsDir = path.join(projectRoot, 'report-automation', 'logs');
const accessEndpoint = process.env.REPORT_ACCESS_GAS_URL || '';
const dashboardEndpoint = process.env.PRIVATE_DASHBOARD_GAS_URL || '';
const employeeId = String(process.env.REPORT_UPLOAD_EMPLOYEE_ID || '').trim().toUpperCase();
const adminSecret = process.env.PRIVATE_DASHBOARD_ADMIN_SECRET || '';
const reportRunDate = process.env.REPORT_RUN_DATE_ISO || process.env.REPORT_DATE_ISO || '';
const dataCutoffDate = process.env.REPORT_DATA_CUTOFF_DATE || '';
const awardsSummaryPath = process.env.PHONE_AWARDS_SUMMARY_PATH || '';
const publicationManifestPath = process.env.REPORT_MANIFEST_PATH || '';
let activePublicationRunId = '';

function fail(message) {
  throw new Error(`awards component publish blocked: ${message}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label} mismatch: expected ${expected}, got ${actual}`);
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function post(endpoint, payload) {
  const body = await postPublicationJson({
    endpoint,
    payload,
    reportDate: reportRunDate,
    cutoff: dataCutoffDate,
    runId: activePublicationRunId,
    component: 'awards',
    action: String(payload?.action || '').includes('access') ? 'app-readback' : 'website-readback',
  });
  if (!body || body.status !== 'ok') fail((body && body.message) || 'Apps Script returned an unknown error');
  return body;
}

function parseChildJson(stdout) {
  const lines = stdout.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try { return JSON.parse(line); } catch {}
  }
  try { return JSON.parse(stdout.trim()); } catch {}
  fail('component publisher did not return JSON');
}

function runSnapshotPublisher() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(workDir, 'publish_private_dashboard_snapshot.mjs'), '--awards-only'], {
      cwd: workDir,
      env: {
        ...process.env,
        PRIVATE_DASHBOARD_GAS_URL: dashboardEndpoint,
        PRIVATE_DASHBOARD_ADMIN_SECRET: adminSecret,
        REPORT_RUN_DATE_ISO: reportRunDate,
        REPORT_DATA_CUTOFF_DATE: dataCutoffDate,
        PHONE_AWARDS_SUMMARY_PATH: awardsSummaryPath,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(chunk); });
    child.once('error', reject);
    child.once('close', code => code === 0
      ? resolve(parseChildJson(stdout))
      : reject(new Error(`publish_private_dashboard_snapshot.mjs exited with code ${code}: ${stderr.trim()}`)));
  });
}

export function validateAwardsComponentReadback({ beforeSnapshot, afterSnapshot, snapshotStatus, expectedAwards, expected }) {
  if (!beforeSnapshot?.kpiBattle || !afterSnapshot?.kpiBattle || !afterSnapshot?.awardsBattle) {
    fail('protected dashboard readback is incomplete');
  }
  assertEqual(JSON.stringify(afterSnapshot.kpiBattle), JSON.stringify(beforeSnapshot.kpiBattle), 'KPI payload preservation');
  assertEqual(
    JSON.stringify(afterSnapshot.components?.kpi || null),
    JSON.stringify(beforeSnapshot.components?.kpi || null),
    'KPI component metadata preservation',
  );
  const verification = validateAwardReadback(afterSnapshot.awardsBattle, expectedAwards);
  const sourceFiles = canonicalAwardsSourceFiles(afterSnapshot.awardsBattle.source_files, 'protected awards');
  assertEqual(String(afterSnapshot.awardsBattle.report_date || ''), expected.dataCutoffDate, 'awards report date');
  assertEqual(String(afterSnapshot.awardsBattle.data_as_of_date || ''), expected.dataCutoffDate, 'awards data cutoff');
  assertEqual(String(sourceFiles.store.run_id || ''), expected.runId, 'awards store run_id');
  assertEqual(String(sourceFiles.person.run_id || ''), expected.runId, 'awards person run_id');
  assertEqual(String(snapshotStatus.ownerEmail || ''), 'lian852456@gmail.com', 'dashboard owner');
  assertEqual(String(snapshotStatus.sharingAccess || ''), 'PRIVATE', 'dashboard sharing');
  assertEqual(String(snapshotStatus.kpiPayloadHash || ''), String(expected.kpiPayloadHashBefore || ''), 'KPI payload hash');
  assertEqual(String(snapshotStatus.awardsComponentStatus || ''), 'fresh', 'awards component status');
  assertEqual(String(snapshotStatus.awardsComponentDataAsOfDate || ''), expected.dataCutoffDate, 'awards component cutoff');
  assertEqual(Number(snapshotStatus.phoneItems), 13, 'awards phone_items');
  assertEqual(Number(snapshotStatus.storeRows), 10, 'awards store_rows');
  return {
    result: 'awards-component-published-verified',
    reportDate: expected.dataCutoffDate,
    runId: expected.runId,
    phoneItems: 13,
    storeRows: 10,
    stores: 9,
    sourceFiles,
    verification,
    kpiPayloadPreserved: true,
  };
}

async function writeManifest(publication, publishedAt) {
  const file = path.resolve(
    publicationManifestPath || path.join(logsDir, `run-manifest-${reportRunDate.replaceAll('-', '')}.json`),
  );
  const manifest = await readJson(file).catch(() => ({ runId: publication.runId, reportRunDate, dataCutoffDate }));
  manifest.websiteResult = 'awards-component-published-verified';
  manifest.snapshotPublishedAt = publishedAt || null;
  manifest.datesAligned = true;
  manifest.sourcesAligned = true;
  manifest.websitePublication = { ...publication, mode: 'awards-component-only', checkedAt: new Date().toISOString() };
  await fs.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function main() {
  if (!accessEndpoint || !dashboardEndpoint || !employeeId || !adminSecret) {
    fail('formal access/dashboard endpoints, employee ID and Keychain administrator secret are required');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportRunDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dataCutoffDate)) {
    fail('report run date and data cutoff date are required');
  }
  if (!awardsSummaryPath) fail('fresh run-scoped PHONE_AWARDS_SUMMARY_PATH is required');
  const summary = await readJson(awardsSummaryPath);
  const runId = String(summary.run_id || '').trim();
  if (!runId) fail('fresh awards run_id is missing');
  activePublicationRunId = runId;
  const localAwardsPath = path.join(projectRoot, 'github-pages-liamlu', 'private-data', 'phone-awards-battle-latest.json');
  const beforeDeviceId = `north12b-awards-component-before-${Date.now()}`;
  const [beforePrivate, beforeStatus] = await Promise.all([
    post(accessEndpoint, { action: 'private_access', employeeId, deviceId: beforeDeviceId }),
    post(dashboardEndpoint, { action: 'private_admin_snapshot_status', adminSecret }),
  ]);
  if (!beforeStatus.kpiPayloadHash) fail('pre-publish KPI payload hash is missing');
  const snapshotResult = await runSnapshotPublisher();
  const expectedAwards = await readJson(localAwardsPath);
  const afterDeviceId = `north12b-awards-component-after-${Date.now()}`;
  const [afterPrivate, afterStatus] = await Promise.all([
    post(accessEndpoint, { action: 'private_access', employeeId, deviceId: afterDeviceId }),
    post(dashboardEndpoint, { action: 'private_admin_snapshot_status', adminSecret }),
  ]);
  const publication = validateAwardsComponentReadback({
    beforeSnapshot: beforePrivate.snapshot,
    afterSnapshot: afterPrivate.snapshot,
    snapshotStatus: afterStatus,
    expectedAwards,
    expected: { dataCutoffDate, runId, kpiPayloadHashBefore: beforeStatus.kpiPayloadHash },
  });
  await writeManifest(publication, snapshotResult.publishedAt || '');
  console.log(JSON.stringify({ status: 'ok', publication, snapshotResult }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
