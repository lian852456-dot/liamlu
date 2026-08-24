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
const skipRosterSync = process.env.PRIVATE_DASHBOARD_SKIP_ROSTER_SYNC === '1';
const expectedOwnerEmail = process.env.PRIVATE_DASHBOARD_EXPECTED_OWNER_EMAIL || 'lian852456@gmail.com';

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
