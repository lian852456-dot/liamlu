#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { postPublicationJson } from './publication_transport_client.mjs';
import {
  canonicalSourceFile,
  validateKpiRateReadback,
  validateKpiSupplementReadback,
} from './publish_formal_website_data.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const workDir = path.join(projectRoot, 'report-automation', 'work');
const logsDir = path.join(projectRoot, 'report-automation', 'logs');
const accessEndpoint = process.env.REPORT_ACCESS_GAS_URL || '';
const dashboardEndpoint = process.env.PRIVATE_DASHBOARD_GAS_URL || '';
const employeeId = String(process.env.REPORT_UPLOAD_EMPLOYEE_ID || '').trim().toUpperCase();
const adminSecret = process.env.PRIVATE_DASHBOARD_ADMIN_SECRET || '';
const reportRunDate = process.env.REPORT_RUN_DATE_ISO || '';
const dataCutoffDate = process.env.REPORT_DATA_CUTOFF_DATE || '';
let activePublicationRunId = '';

function fail(message) {
  throw new Error(`KPI component publish blocked: ${message}`);
}

function basename(value) {
  return path.basename(String(value || '').replaceAll('\\', '/'));
}

function kpiDataDate(data) {
  const month = String((data && data.meta && data.meta.month) || '');
  const day = Number(data && data.meta && data.meta.snapshotDay);
  return /^\d{4}-\d{2}$/.test(month) && day ? `${month}-${String(day).padStart(2, '0')}` : '';
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
    component: 'KPI',
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

function runSnapshotPublisher(kpiRunId) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(workDir, 'publish_private_dashboard_snapshot.mjs'), '--kpi-only'], {
      cwd: workDir,
      env: {
        ...process.env,
        PRIVATE_DASHBOARD_GAS_URL: dashboardEndpoint,
        PRIVATE_DASHBOARD_ADMIN_SECRET: adminSecret,
        PRIVATE_DASHBOARD_KPI_RUN_ID: kpiRunId,
        REPORT_RUN_DATE_ISO: reportRunDate,
        REPORT_DATA_CUTOFF_DATE: dataCutoffDate,
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

export function validateKpiComponentReadback({ kpicalcData, beforeSnapshot, afterSnapshot, snapshotStatus, expected }) {
  if (!kpicalcData || !kpicalcData.meta || !afterSnapshot || !afterSnapshot.kpiBattle || !afterSnapshot.awardsBattle) {
    fail('protected readback is incomplete');
  }
  assertEqual(kpiDataDate(kpicalcData), expected.dataAsOfDate, 'kpicalc data date');
  assertEqual(canonicalSourceFile(kpicalcData.meta.sourceFile), expected.sourceFile, 'kpicalc source file');
  assertEqual(Number((kpicalcData.stores || []).length), 9, 'kpicalc store count');
  assertEqual(Number((kpicalcData.persons || []).length), 40, 'kpicalc person count');
  assertEqual(Number((kpicalcData.items || []).length), 25, 'kpicalc item count');
  assertEqual(String(afterSnapshot.kpiBattle.kpi_run_id || ''), expected.runId, 'KPI supplement run_id');
  const rateVerification = validateKpiRateReadback(kpicalcData, afterSnapshot.kpiBattle);
  const supplementVerification = validateKpiSupplementReadback(afterSnapshot.kpiBattle, expected);
  assertEqual(Number((afterSnapshot.kpiBattle.personal || []).length), 40, 'KPI supplement personal count');
  assertEqual(JSON.stringify(afterSnapshot.awardsBattle), JSON.stringify(beforeSnapshot.awardsBattle), 'awards payload preservation');
  assertEqual(String(snapshotStatus.ownerEmail || ''), 'lian852456@gmail.com', 'dashboard owner');
  assertEqual(String(snapshotStatus.sharingAccess || ''), 'PRIVATE', 'dashboard sharing');
  assertEqual(String(snapshotStatus.kpiComponentStatus || ''), 'fresh', 'KPI component status');
  assertEqual(String(snapshotStatus.kpiComponentRunId || ''), expected.runId, 'KPI component run_id');
  assertEqual(String(snapshotStatus.awardsComponentStatus || ''), 'blocked', 'awards component status');
  assertEqual(String(snapshotStatus.awardsComponentReason || ''), 'upstream-source-not-updated', 'awards component reason');
  assertEqual(String(afterSnapshot.awardsBattle.report_date || ''), String(beforeSnapshot.awardsBattle.report_date || ''), 'awards report date preservation');
  if (String(afterSnapshot.awardsBattle.report_date || '') === expected.dataAsOfDate) {
    fail('awards stale case unexpectedly aligned with KPI date');
  }
  return {
    result: 'kpi-component-published-verified',
    kpi: {
      sourceFile: expected.sourceFile,
      dataAsOfDate: expected.dataAsOfDate,
      runId: expected.runId,
      stores: 9,
      persons: 40,
      items: 25,
      rateVerification,
      supplementVerification,
    },
    awards: {
      status: 'blocked',
      reportDate: String(afterSnapshot.awardsBattle.report_date || ''),
      reason: 'upstream-source-not-updated',
      payloadPreserved: true,
    },
    ownerEmail: snapshotStatus.ownerEmail,
    sharingAccess: snapshotStatus.sharingAccess,
  };
}

async function writeManifest(publication, publishedAt) {
  const file = path.join(logsDir, `run-manifest-${reportRunDate.replaceAll('-', '')}.json`);
  const manifest = await readJson(file);
  manifest.websiteResult = 'kpi-published-awards-blocked';
  manifest.snapshotPublishedAt = publishedAt || null;
  manifest.datesAligned = true;
  manifest.sourcesAligned = true;
  manifest.websitePublication = {
    ...publication,
    mode: 'kpi-component-only',
    checkedAt: new Date().toISOString(),
  };
  await fs.writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function main() {
  if (!accessEndpoint || !dashboardEndpoint || !employeeId || !adminSecret) {
    fail('formal access/dashboard endpoints, employee ID and Keychain administrator secret are required');
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportRunDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dataCutoffDate)) {
    fail('report run date and data cutoff date are required');
  }
  const today = await readJson(path.join(workDir, 'today_report_data.json'));
  const runManifest = await readJson(path.join(logsDir, `run-manifest-${reportRunDate.replaceAll('-', '')}.json`));
  activePublicationRunId = String(runManifest.sourceBatch?.kpi?.run_id || runManifest.runId || '');
  if (!activePublicationRunId) fail('run-scoped KPI run_id is missing');
  assertEqual(String(today.report_date_iso || ''), reportRunDate, 'local report run date');
  const expectedSource = basename(today.source_path || today.source_file);
  const beforeDeviceId = `north12b-kpi-component-before-${Date.now()}`;
  const [beforeKpi, beforePrivate, beforeStatus] = await Promise.all([
    post(accessEndpoint, { action: 'kpicalc_access', employeeId, deviceId: beforeDeviceId }),
    post(accessEndpoint, { action: 'private_access', employeeId, deviceId: beforeDeviceId }),
    post(dashboardEndpoint, { action: 'private_admin_snapshot_status', adminSecret }),
  ]);
  assertEqual(kpiDataDate(beforeKpi.data), dataCutoffDate, 'protected KPI data date');
  assertEqual(canonicalSourceFile(beforeKpi.data.meta.sourceFile), expectedSource, 'protected KPI source file');
  assertEqual(Number((beforeKpi.data.stores || []).length), 9, 'protected KPI store count');
  assertEqual(Number((beforeKpi.data.persons || []).length), 40, 'protected KPI person count');
  assertEqual(Number((beforeKpi.data.items || []).length), 25, 'protected KPI item count');
  const kpiRunId = String(beforeKpi.data.meta.processingRunId || '').trim();
  if (!kpiRunId) fail('protected KPI processingRunId is missing');
  assertEqual(kpiRunId, activePublicationRunId, 'protected KPI run_id');
  if (!beforePrivate.snapshot || !beforePrivate.snapshot.awardsBattle) fail('existing awards component is missing');
  if (!beforeStatus.awardsPayloadHash) fail('pre-publish awards payload hash is missing');

  const snapshotResult = await runSnapshotPublisher(kpiRunId);
  const afterDeviceId = `north12b-kpi-component-after-${Date.now()}`;
  const [afterKpi, afterPrivate, afterStatus] = await Promise.all([
    post(accessEndpoint, { action: 'kpicalc_access', employeeId, deviceId: afterDeviceId }),
    post(accessEndpoint, { action: 'private_access', employeeId, deviceId: afterDeviceId }),
    post(dashboardEndpoint, { action: 'private_admin_snapshot_status', adminSecret }),
  ]);
  assertEqual(String(afterStatus.awardsPayloadHash || ''), String(beforeStatus.awardsPayloadHash), 'awards payload hash');
  const publication = validateKpiComponentReadback({
    kpicalcData: afterKpi.data,
    beforeSnapshot: beforePrivate.snapshot,
    afterSnapshot: afterPrivate.snapshot,
    snapshotStatus: afterStatus,
    expected: { reportDate: dataCutoffDate, dataAsOfDate: dataCutoffDate, sourceFile: expectedSource, runId: kpiRunId },
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
