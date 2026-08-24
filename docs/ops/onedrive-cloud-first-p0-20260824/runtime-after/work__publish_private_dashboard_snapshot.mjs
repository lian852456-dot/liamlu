#!/usr/bin/env node
// Publish the latest masked KPI / awards snapshot after the daily report mail
// has been verified. The destination is Apps Script + private Google Drive,
// never the GitHub Pages repository.

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { postPrivateDashboardJson } from './private_dashboard_transport.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const privateDataDir = process.env.PRIVATE_DASHBOARD_DATA_DIR || path.join(projectRoot, 'github-pages-liamlu', 'private-data');
const configDir = path.join(projectRoot, 'report-automation', 'config');
const gasUrl = process.env.PRIVATE_DASHBOARD_GAS_URL || '';
const adminSecret = process.env.PRIVATE_DASHBOARD_ADMIN_SECRET || '';
const rosterPath = process.env.PRIVATE_DASHBOARD_ROSTER_PATH || path.join(privateDataDir, 'dashboard-user-roster.json');
const reportWorkDir = path.join(projectRoot, 'report-automation', 'work');
const bundledPython = process.env.PRIVATE_DASHBOARD_PYTHON_BIN || '/Users/liamlu/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3.12';
const rosterOnly = process.argv.includes('--roster-only');
const kpiOnly = process.argv.includes('--kpi-only');
const awardsOnly = process.argv.includes('--awards-only');
const skipRosterSync = process.env.PRIVATE_DASHBOARD_SKIP_ROSTER_SYNC === '1';
const expectedOwnerEmail = process.env.PRIVATE_DASHBOARD_EXPECTED_OWNER_EMAIL || 'lian852456@gmail.com';
const reportRunDate = process.env.REPORT_RUN_DATE_ISO || process.env.REPORT_DATE_ISO || '';
const dataCutoffDate = process.env.REPORT_DATA_CUTOFF_DATE || '';
const kpiRunId = process.env.PRIVATE_DASHBOARD_KPI_RUN_ID || '';
const awardsSummaryPath = process.env.PHONE_AWARDS_SUMMARY_PATH || '';

function fail(message) {
  console.error(`private dashboard publish blocked: ${message}`);
  process.exitCode = 1;
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function loadActiveAwardConfig() {
  const active = await readJson(path.join(configDir, 'award-config-active.json'));
  if (!active.activeConfig) throw new Error('award-config-active.json missing activeConfig');
  const configPath = path.join(configDir, active.activeConfig);
  const config = await readJson(configPath);
  return { ...config, configPath };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: reportWorkDir, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(command)} exited with code ${code}`)));
  });
}

async function post(payload) {
  const body = await postPrivateDashboardJson({
    endpoint: gasUrl,
    payload,
    curlBin: process.env.PRIVATE_DASHBOARD_CURL_BIN || 'curl',
  });
  if (!body || body.status !== 'ok') throw new Error((body && body.message) || 'unknown Apps Script error');
  return body;
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label} mismatch: expected ${expected}, got ${actual}`);
  }
}

async function verifyRemoteSnapshot(expectedReportDate, awardConfig) {
  const status = await post({ action: 'private_admin_snapshot_status', adminSecret });
  assertEqual(status.fileName, 'north12b-dashboard-private-latest.json', 'private dashboard file name');
  assertEqual(status.ownerEmail, expectedOwnerEmail, 'private dashboard owner');
  assertEqual(status.sharingAccess, 'PRIVATE', 'private dashboard sharing access');
  assertEqual(String(status.kpiReportDate || ''), expectedReportDate, 'private dashboard KPI report_date');
  assertEqual(String(status.awardsReportDate || ''), expectedReportDate, 'private dashboard awards report_date');
  assertEqual(Number(status.phoneItems), Number(awardConfig.expectedPhoneItems), 'private dashboard phone_items');
  assertEqual(Number(status.storeRows), Number(awardConfig.expectedStoreRows), 'private dashboard store_rows');
  return status;
}

async function main() {
  if (!gasUrl || !adminSecret) {
    fail('PRIVATE_DASHBOARD_GAS_URL and PRIVATE_DASHBOARD_ADMIN_SECRET must be set in the local automation environment.');
    return;
  }

  try {
    if (kpiOnly && awardsOnly) throw new Error('KPI-only and awards-only modes are mutually exclusive');
    if (kpiOnly) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(reportRunDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dataCutoffDate) || !kpiRunId) {
        throw new Error('KPI component publish requires report run date, data cutoff date and protected KPI run_id');
      }
      await run(bundledPython, [
        path.join(reportWorkDir, 'build_github_pages_data.py'),
        '--kpi-only',
        '--report-run-date', reportRunDate,
        '--data-cutoff-date', dataCutoffDate,
        '--kpi-run-id', kpiRunId,
      ]);
      const kpiBattle = await readJson(path.join(privateDataDir, 'kpi-battle-latest.json'));
      assertEqual(String(kpiBattle.report_date || ''), dataCutoffDate, 'local KPI component report_date');
      assertEqual(String(kpiBattle.data_as_of_date || ''), dataCutoffDate, 'local KPI component data_as_of_date');
      assertEqual(String(kpiBattle.source_as_of_date || ''), dataCutoffDate, 'local KPI component source_as_of_date');
      assertEqual(String(kpiBattle.kpi_run_id || ''), kpiRunId, 'local KPI component run_id');
      assertEqual(Number((kpiBattle.stores || []).length), 9, 'local KPI component store count');
      assertEqual(Number((kpiBattle.personal || []).length), 40, 'local KPI component personal count');

      const preflightStatus = await post({ action: 'private_admin_snapshot_status', adminSecret });
      assertEqual(preflightStatus.fileName, 'north12b-dashboard-private-latest.json', 'private dashboard preflight file name');
      assertEqual(preflightStatus.ownerEmail, expectedOwnerEmail, 'private dashboard preflight owner');
      assertEqual(preflightStatus.sharingAccess, 'PRIVATE', 'private dashboard preflight sharing access');
      const awardsHashBefore = String(preflightStatus.awardsPayloadHash || '');
      if (!awardsHashBefore) throw new Error('private dashboard preflight awards payload hash is missing');

      const result = await post({
        action: 'private_publish_kpi_component',
        adminSecret,
        kpiBattleBase64: Buffer.from(JSON.stringify(kpiBattle), 'utf8').toString('base64'),
      });
      const remoteStatus = await post({ action: 'private_admin_snapshot_status', adminSecret });
      assertEqual(remoteStatus.ownerEmail, expectedOwnerEmail, 'private dashboard owner');
      assertEqual(remoteStatus.sharingAccess, 'PRIVATE', 'private dashboard sharing access');
      assertEqual(String(remoteStatus.kpiReportDate || ''), dataCutoffDate, 'private dashboard KPI report_date');
      assertEqual(String(remoteStatus.kpiComponentStatus || ''), 'fresh', 'private dashboard KPI component status');
      assertEqual(String(remoteStatus.kpiComponentRunId || ''), kpiRunId, 'private dashboard KPI component run_id');
      assertEqual(String(remoteStatus.kpiComponentDataAsOfDate || ''), dataCutoffDate, 'private dashboard KPI component cutoff');
      assertEqual(String(remoteStatus.awardsComponentStatus || ''), 'blocked', 'private dashboard awards component status');
      assertEqual(String(remoteStatus.awardsComponentReason || ''), 'upstream-source-not-updated', 'private dashboard awards component reason');
      assertEqual(String(remoteStatus.awardsPayloadHash || ''), awardsHashBefore, 'private dashboard awards payload hash');
      console.log(JSON.stringify({
        status: 'ok',
        mode: 'kpi-component-only',
        reportDate: result.reportDate || dataCutoffDate,
        sourceFile: result.sourceFile || kpiBattle.source_file || '',
        runId: result.runId || kpiRunId,
        publishedAt: result.publishedAt || '',
        awards: {
          status: remoteStatus.awardsComponentStatus || '',
          reportDate: remoteStatus.awardsReportDate || '',
          reason: remoteStatus.awardsComponentReason || '',
          payloadHashPreserved: true,
        },
        remote: remoteStatus,
      }, null, 2));
      return;
    }

    if (awardsOnly) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(reportRunDate) || !/^\d{4}-\d{2}-\d{2}$/.test(dataCutoffDate)) {
        throw new Error('awards component publish requires report run date and data cutoff date');
      }
      if (!awardsSummaryPath) throw new Error('awards component publish requires fresh run-scoped PHONE_AWARDS_SUMMARY_PATH');
      await run(bundledPython, [
        path.join(reportWorkDir, 'build_github_pages_data.py'),
        '--awards-only',
        '--report-run-date', reportRunDate,
        '--data-cutoff-date', dataCutoffDate,
        '--awards-summary-path', awardsSummaryPath,
      ]);
      const awardsBattle = await readJson(path.join(privateDataDir, 'phone-awards-battle-latest.json'));
      const awardConfig = await loadActiveAwardConfig();
      assertEqual(String(awardsBattle.report_date || ''), dataCutoffDate, 'local awards component report_date');
      assertEqual(String(awardsBattle.data_as_of_date || ''), dataCutoffDate, 'local awards component data_as_of_date');
      assertEqual(Number(awardsBattle.phone_items), Number(awardConfig.expectedPhoneItems), 'local awards phone_items');
      assertEqual(Number(awardsBattle.store_rows), Number(awardConfig.expectedStoreRows), 'local awards store_rows');
      assertEqual(Number((awardsBattle.stores || []).length), 9, 'local awards store count');
      assertEqual(Number((awardsBattle.overall?.items || []).length), Number(awardConfig.expectedPhoneItems), 'local awards model count');
      for (const kind of ['store', 'person']) {
        const source = awardsBattle.source_files?.[kind];
        if (!source || source.provider !== 'onedrive-cloud' || !source.driveItemId || !source.eTag
            || !source.lastModifiedDateTime || source.source_data_date !== dataCutoffDate
            || source.run_id !== awardsBattle.source_files.store.run_id) {
          throw new Error(`local awards ${kind} OneDrive cloud identity is incomplete`);
        }
      }
      const preflightStatus = await post({ action: 'private_admin_snapshot_status', adminSecret });
      assertEqual(preflightStatus.ownerEmail, expectedOwnerEmail, 'private dashboard preflight owner');
      assertEqual(preflightStatus.sharingAccess, 'PRIVATE', 'private dashboard preflight sharing access');
      const kpiHashBefore = String(preflightStatus.kpiPayloadHash || '');
      if (!kpiHashBefore) throw new Error('private dashboard preflight KPI payload hash is missing');
      const result = await post({
        action: 'private_publish_awards_component',
        adminSecret,
        awardsBattleBase64: Buffer.from(JSON.stringify(awardsBattle), 'utf8').toString('base64'),
      });
      const remoteStatus = await post({ action: 'private_admin_snapshot_status', adminSecret });
      assertEqual(String(remoteStatus.kpiPayloadHash || ''), kpiHashBefore, 'private dashboard KPI payload hash');
      assertEqual(String(remoteStatus.awardsReportDate || ''), dataCutoffDate, 'private dashboard awards report_date');
      assertEqual(String(remoteStatus.awardsComponentStatus || ''), 'fresh', 'private dashboard awards component status');
      assertEqual(String(remoteStatus.awardsComponentDataAsOfDate || ''), dataCutoffDate, 'private dashboard awards cutoff');
      assertEqual(Number(remoteStatus.phoneItems), Number(awardConfig.expectedPhoneItems), 'private dashboard phone_items');
      assertEqual(Number(remoteStatus.storeRows), Number(awardConfig.expectedStoreRows), 'private dashboard store_rows');
      console.log(JSON.stringify({
        status: 'ok', mode: 'awards-component-only', reportDate: dataCutoffDate,
        runId: awardsBattle.source_files.store.run_id,
        publishedAt: result.publishedAt || '', kpiPayloadHashPreserved: true,
        remote: remoteStatus,
      }, null, 2));
      return;
    }

    // Generate fresh private JSON only after the daily mail is confirmed sent.
    await run(bundledPython, [path.join(reportWorkDir, 'build_github_pages_data.py')]);
    const reportData = await readJson(path.join(reportWorkDir, 'today_report_data.json'));
    if (!reportData.source_path) throw new Error('today_report_data.json missing source_path');
    if (!skipRosterSync) {
      await run(bundledPython, [
        path.join(reportWorkDir, 'build_private_dashboard_roster.py'),
        '--source', String(reportData.source_path),
        '--output', rosterPath,
      ]);
    }
    const [kpiBattle, awardsBattle] = await Promise.all([
      readJson(path.join(privateDataDir, 'kpi-battle-latest.json')),
      readJson(path.join(privateDataDir, 'phone-awards-battle-latest.json')),
    ]);
    const awardConfig = await loadActiveAwardConfig();
    assertEqual(Number(awardsBattle.phone_items), Number(awardConfig.expectedPhoneItems), 'local private dashboard phone_items');
    assertEqual(Number(awardsBattle.store_rows), Number(awardConfig.expectedStoreRows), 'local private dashboard store_rows');
    const snapshot = {
      version: 1,
      publishedAt: new Date().toISOString(),
      kpiBattle,
      awardsBattle,
    };

    const preflightStatus = await post({ action: 'private_admin_snapshot_status', adminSecret });
    assertEqual(preflightStatus.fileName, 'north12b-dashboard-private-latest.json', 'private dashboard preflight file name');
    assertEqual(preflightStatus.ownerEmail, expectedOwnerEmail, 'private dashboard preflight owner');
    assertEqual(preflightStatus.sharingAccess, 'PRIVATE', 'private dashboard preflight sharing access');

    let rosterSynced = 0;
    if (!skipRosterSync) {
      try {
        const roster = await readJson(rosterPath);
        const rosterResult = await post({ action: 'private_sync_roster', adminSecret, members: roster.members || [] });
        rosterSynced = Number(rosterResult.synced || 0);
      } catch (error) {
        throw new Error(`roster sync failed: ${error.message}`);
      }
    }

    if (rosterOnly) {
      console.log(JSON.stringify({ status: 'ok', rosterOnly: true, rosterSynced }));
    } else {
      const result = await post({
        action: 'private_publish',
        adminSecret,
        snapshotBase64: Buffer.from(JSON.stringify(snapshot), 'utf8').toString('base64'),
      });
      const remoteStatus = await verifyRemoteSnapshot(kpiBattle.report_date || '', awardConfig);
      console.log(JSON.stringify({
        status: 'ok',
        rosterSynced,
        rosterSync: skipRosterSync ? 'skipped-out-of-scope' : 'synced',
        reportDate: result.reportDate || kpiBattle.report_date || '',
        publishedAt: result.publishedAt || '',
        remote: {
          fileId: remoteStatus.fileId || '',
          ownerEmail: remoteStatus.ownerEmail || '',
          sharingAccess: remoteStatus.sharingAccess || '',
          lastUpdated: remoteStatus.lastUpdated || '',
          kpiReportDate: remoteStatus.kpiReportDate || '',
          awardsReportDate: remoteStatus.awardsReportDate || '',
          phoneItems: remoteStatus.phoneItems || 0,
          storeRows: remoteStatus.storeRows || 0,
        },
      }));
    }
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

await main();
