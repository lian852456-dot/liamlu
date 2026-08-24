#!/usr/bin/env node

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { postPrivateDashboardJson } from './private_dashboard_transport.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');
const workDir = path.join(projectRoot, 'report-automation', 'work');
const privateDataDir = path.join(projectRoot, 'github-pages-liamlu', 'private-data');
const logsDir = path.join(projectRoot, 'report-automation', 'logs');
const accessEndpoint = process.env.REPORT_ACCESS_GAS_URL || '';
const dashboardEndpoint = process.env.PRIVATE_DASHBOARD_GAS_URL || '';
const uploadEndpoint = process.env.REPORT_UPLOAD_GAS_URL || '';
const employeeId = String(process.env.REPORT_UPLOAD_EMPLOYEE_ID || '').trim().toUpperCase();
const adminSecret = process.env.PRIVATE_DASHBOARD_ADMIN_SECRET || '';
const reportRunDate = process.env.REPORT_RUN_DATE_ISO || process.env.REPORT_DATE_ISO || new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
const verifyOnly = process.argv.includes('--verify-only');

function fail(message) {
  throw new Error(`formal website publish blocked: ${message}`);
}

export async function withBoundedReadbackRetry(readback, {
  attempts = 3,
  delayMs = 5000,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onRetry = () => {},
} = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await readback();
    } catch (error) {
      lastError = error;
      if (attempt === attempts) throw error;
      onRetry(error, attempt, attempts);
      await sleep(delayMs);
    }
  }
  throw lastError;
}

function basename(value) {
  return path.basename(String(value || '').replaceAll('\\', '/'));
}

export function canonicalSourceFile(value) {
  const raw = basename(value);
  const staged = raw.match(/^report-upload-temp-[a-f0-9]{32,64}-(\d{4}\.xlsx)$/i);
  return staged ? staged[1] : raw;
}

const REQUIRED_AWARDS_SOURCE_BASENAMES = Object.freeze({
  store: '01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx',
  person: '01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx',
});

export function canonicalAwardsSourceFiles(value, label = 'awards') {
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    fail(`${label} source_files is missing`);
  }
  const canonical = {};
  for (const [key, expectedBasename] of Object.entries(REQUIRED_AWARDS_SOURCE_BASENAMES)) {
    const source = basename(value[key]);
    if (!source) fail(`${label} ${key} source file is missing`);
    if (source !== expectedBasename) {
      fail(`${label} ${key} source file mismatch: expected ${expectedBasename}, got ${source}`);
    }
    canonical[key] = source;
  }
  return canonical;
}

function assertAwardsSourceFilesEqual(actual, expected, label) {
  const actualCanonical = canonicalAwardsSourceFiles(actual, `${label} actual`);
  const expectedCanonical = canonicalAwardsSourceFiles(expected, `${label} expected`);
  for (const key of Object.keys(REQUIRED_AWARDS_SOURCE_BASENAMES)) {
    assertEqual(actualCanonical[key], expectedCanonical[key], `${label} ${key} source file`);
  }
  return actualCanonical;
}

function kpiDataDate(data) {
  const month = String((data && data.meta && data.meta.month) || '');
  const day = Number(data && data.meta && data.meta.snapshotDay);
  return /^\d{4}-\d{2}$/.test(month) && day ? `${month}-${String(day).padStart(2, '0')}` : '';
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label} mismatch: expected ${expected}, got ${actual}`);
}

const KPI_RATE_SPOT_KEYS = [
  { label: 'A999', kpicalc: 'AQ V+D 999 (含)以上', snapshot: 'AQ V+D 999（含）以上' },
  { label: 'A1399', kpicalc: 'AQ V+D 1399 (含)以上', snapshot: 'AQ V+D 1399（含）以上' },
  { label: '好速', kpicalc: '好速案銷售點數', snapshot: '好速案銷售點數' },
  { label: 'R999', kpicalc: 'RT V+D 999 (含)以上', snapshot: 'RT V+D 999（含）以上' },
  { label: 'R1399', kpicalc: 'RT V+D 1399 (含)以上', snapshot: 'RT V+D 1399（含）以上' },
  { label: 'RT', kpicalc: 'RT上線點數', snapshot: 'RT上線點數' },
];

function hasOwn(value, key) {
  return Boolean(value) && Object.prototype.hasOwnProperty.call(value, key);
}

function normalizedStore(value) {
  return String(value || '')
    .replace(/^台灣大哥大數位生活台北/, '')
    .replace(/^台北/, '')
    .replace(/\s+/g, '')
    .trim();
}

function assertFiniteRate(value, label) {
  if (value === '' || value === null || value === undefined || !Number.isFinite(Number(value))) {
    fail(`${label} is missing`);
  }
  return Number(value);
}

function assertClose(actual, expected, label) {
  const left = Number(actual);
  const right = Number(expected);
  if (!Number.isFinite(left) || !Number.isFinite(right) || Math.abs(left - right) > 1e-6) {
    fail(`${label} mismatch: expected ${right}, got ${left}`);
  }
}

export function validateKpiRateReadback(kpicalcData, kpiSnapshot) {
  const items = Array.isArray(kpicalcData && kpicalcData.items) ? kpicalcData.items : [];
  const stores = Array.isArray(kpicalcData && kpicalcData.stores) ? kpicalcData.stores : [];
  const persons = Array.isArray(kpicalcData && kpicalcData.persons) ? kpicalcData.persons : [];
  const itemKeys = items.map(item => String((item || {}).key || '')).filter(Boolean);
  const aggregateRates = kpicalcData && kpicalcData.aggregateRates;
  if (!aggregateRates || typeof aggregateRates !== 'object') fail('aggregateRates is missing');
  for (const key of itemKeys) {
    if (!hasOwn(aggregateRates, key)) fail(`aggregateRates field is missing: ${key}`);
  }
  for (const [rowType, rows] of [['store', stores], ['person', persons]]) {
    for (const row of rows) {
      for (const key of itemKeys) {
        if (!hasOwn(row && row.items && row.items[key], 'reportRate')) {
          fail(`${rowType} reportRate field is missing: ${key}`);
        }
      }
    }
  }

  const snapshotAggregate = kpiSnapshot && kpiSnapshot.aggregate && kpiSnapshot.aggregate.metrics;
  if (!snapshotAggregate) fail('dashboard aggregate metrics are missing');
  const aggregateSpotChecks = [];
  for (const metric of KPI_RATE_SPOT_KEYS) {
    const rate = assertFiniteRate(aggregateRates[metric.kpicalc], `aggregate ${metric.label} rate`);
    const snapshotMetric = snapshotAggregate[metric.snapshot];
    if (!snapshotMetric) fail(`dashboard aggregate metric is missing: ${metric.label}`);
    assertClose(rate, snapshotMetric.rate, `aggregate ${metric.label} rate`);
    const actual = stores.reduce((sum, row) => sum + Number(row.items[metric.kpicalc].a || 0), 0);
    const target = stores.reduce((sum, row) => sum + Number(row.items[metric.kpicalc].t || 0), 0);
    assertClose(actual, snapshotMetric.actual, `aggregate ${metric.label} actual`);
    assertClose(target, snapshotMetric.target, `aggregate ${metric.label} target`);
    aggregateSpotChecks.push({
      store: '北一二B整體', metric: metric.label,
      actual: Number(actual), target: Number(target), rate,
    });
  }

  const snapshotStores = new Map((kpiSnapshot.stores || []).map(row => [normalizedStore(row.store), row]));
  const orderedStores = stores.slice().sort((a, b) => {
    const left = normalizedStore(a && a.name) === '酒泉' ? 0 : 1;
    const right = normalizedStore(b && b.name) === '酒泉' ? 0 : 1;
    return left - right;
  });
  const sampledStores = orderedStores.slice(0, 3);
  if (sampledStores.length < 3) fail('fewer than three KPI stores are available for spot checks');
  const spotChecks = [];
  for (const store of sampledStores) {
    const name = normalizedStore(store.name);
    const snapshotStore = snapshotStores.get(name);
    if (!snapshotStore) fail(`dashboard store is missing: ${name}`);
    for (const metric of KPI_RATE_SPOT_KEYS) {
      const entry = store.items && store.items[metric.kpicalc];
      const snapshotMetric = snapshotStore.metrics && snapshotStore.metrics[metric.snapshot];
      if (!entry || !snapshotMetric) fail(`${name} ${metric.label} metric is missing`);
      const rate = assertFiniteRate(entry.reportRate, `${name} ${metric.label} rate`);
      assertClose(rate, snapshotMetric.rate, `${name} ${metric.label} rate`);
      assertClose(entry.a, snapshotMetric.actual, `${name} ${metric.label} actual`);
      assertClose(entry.t, snapshotMetric.target, `${name} ${metric.label} target`);
      spotChecks.push({ store: name, metric: metric.label, actual: Number(entry.a), target: Number(entry.t), rate });
    }
  }
  return {
    aggregateRates: true,
    reportRate: true,
    aggregateSpotChecks,
    sampledStores: sampledStores.map(row => normalizedStore(row.name)),
    spotChecks,
  };
}

export function validateKpiSupplementReadback(kpiSnapshot, expected) {
  if (!kpiSnapshot || typeof kpiSnapshot !== 'object') fail('dashboard KPI supplement is missing');
  assertEqual(String(kpiSnapshot.report_date || ''), String(expected.reportDate || ''), 'dashboard KPI report date');
  assertEqual(
    String(kpiSnapshot.source_as_of_date || kpiSnapshot.data_as_of_date || ''),
    String(expected.dataAsOfDate || ''),
    'dashboard KPI supplement source date',
  );
  assertEqual(basename(kpiSnapshot.source_file), String(expected.sourceFile || ''), 'dashboard KPI supplement source file');
  const required = ['overall_kpi', 'company_rank', 'overall_kpi_dod', 'company_rank_dod', 'addon_score'];
  const rows = [kpiSnapshot.aggregate, ...(Array.isArray(kpiSnapshot.stores) ? kpiSnapshot.stores : [])];
  assertEqual(rows.length, 10, 'dashboard KPI supplement row count');
  for (const [index, row] of rows.entries()) {
    const label = index === 0 ? '北一二B整體' : String(row && row.store || `store-${index}`);
    for (const key of required) {
      if (!row || row[key] === null || row[key] === undefined || row[key] === '' || !Number.isFinite(Number(row[key]))) {
        fail(`${label} KPI supplement field is missing: ${key}`);
      }
    }
  }
  return {
    reportDate: String(kpiSnapshot.report_date),
    sourceAsOfDate: String(kpiSnapshot.source_as_of_date || kpiSnapshot.data_as_of_date),
    sourceFile: basename(kpiSnapshot.source_file),
    stores: 9,
    fields: required,
  };
}

export function assessCurrentKpicalc({ kpicalcData, kpiSnapshot, expected }) {
  try {
    if (!kpicalcData || !kpicalcData.meta) fail('kpicalc readback is incomplete');
    assertEqual(kpiDataDate(kpicalcData), expected.dataAsOfDate, 'kpicalc data date');
    const rawSourceFile = basename(kpicalcData.meta.sourceFile);
    const sourceFile = canonicalSourceFile(rawSourceFile);
    assertEqual(sourceFile, expected.sourceFile, 'kpicalc source file');
    assertEqual(Number(kpicalcData.stores && kpicalcData.stores.length), 9, 'kpicalc store count');
    assertEqual(Number(kpicalcData.persons && kpicalcData.persons.length), 40, 'kpicalc person count');
    assertEqual(Number(kpicalcData.items && kpicalcData.items.length), 25, 'kpicalc item count');
    const rateVerification = validateKpiRateReadback(kpicalcData, kpiSnapshot);
    return {
      ready: true,
      formal: {
        sourceFile,
        rawSourceFile,
        sourceCanonicalized: sourceFile !== rawSourceFile,
        dataDate: kpiDataDate(kpicalcData),
        stores: 9,
        persons: 40,
        kpiItems: 25,
        rateVerification,
      },
    };
  } catch (error) {
    return { ready:false, reason:error instanceof Error ? error.message : String(error) };
  }
}

export function validateAwardReadback(remoteAwards, expectedAwards) {
  if (!remoteAwards || !expectedAwards) fail('awards readback is incomplete');
  assertEqual(String(remoteAwards.report_date || ''), String(expectedAwards.report_date || ''), 'awards report date');
  const sourceFiles = assertAwardsSourceFilesEqual(
    remoteAwards.source_files,
    expectedAwards.source_files,
    'dashboard awards',
  );
  assertEqual(Number(remoteAwards.phone_items), Number(expectedAwards.phone_items), 'awards phone item count');
  assertEqual(Number(remoteAwards.store_rows), Number(expectedAwards.store_rows), 'awards store row count');
  assertEqual(Number((remoteAwards.stores || []).length), 9, 'awards store count');
  assertEqual(Number((remoteAwards.overall && remoteAwards.overall.items || []).length), 13, 'awards model count');
  if (JSON.stringify(remoteAwards) !== JSON.stringify(expectedAwards)) {
    fail('formal awards snapshot does not exactly match the validated local awards source');
  }
  const stores = Array.isArray(remoteAwards.stores) ? remoteAwards.stores : [];
  const ordered = stores.slice().sort((a, b) => {
    const left = normalizedStore(a && a.store) === '酒泉' ? 0 : 1;
    const right = normalizedStore(b && b.store) === '酒泉' ? 0 : 1;
    return left - right;
  });
  const sampledStores = ordered.slice(0, 3);
  if (sampledStores.length < 3) fail('fewer than three awards stores are available for spot checks');
  const rows = [remoteAwards.overall, ...sampledStores].filter(Boolean);
  const spotChecks = rows.map(row => ({
    store: normalizedStore(row.store),
    rank: String((row.award || {}).rank || ''),
    projected: Number((row.award || {}).projected || 0),
    managerAward: Number((row.award || {}).manager_award || 0),
    supervisorAward: Number((row.award || {}).supervisor_award || 0),
    items: (row.items || []).slice(0, 3).map(item => ({
      name: item.name,
      actual: Number(item.actual),
      target: Number(item.target),
      rate: Number(item.rate),
      gap: Number(item.gap),
    })),
  }));
  return {
    exactMatch: true,
    sourceFiles,
    phoneItems: Number(remoteAwards.phone_items),
    storeRows: Number(remoteAwards.store_rows),
    sampledStores: sampledStores.map(row => normalizedStore(row.store)),
    spotChecks,
  };
}

export function validateDualFormalReadback({ kpicalcData, snapshot, snapshotStatus, expected }) {
  if (!kpicalcData || !kpicalcData.meta) fail('kpicalc readback is incomplete');
  if (!snapshot || !snapshot.kpiBattle || !snapshot.awardsBattle) fail('dashboard snapshot readback is incomplete');
  const kpiRawSource = basename(kpicalcData.meta.sourceFile);
  const kpiSource = canonicalSourceFile(kpiRawSource);
  const snapshotSource = basename(snapshot.kpiBattle.source_file);
  const kpicalcAsOf = kpiDataDate(kpicalcData);
  const snapshotAsOf = String(snapshot.kpiBattle.data_as_of_date || snapshot.kpiBattle.source_as_of_date || '');
  const kpiReportDate = String(snapshot.kpiBattle.report_date || '');
  const awardsReportDate = String(snapshot.awardsBattle.report_date || '');

  assertEqual(kpiReportDate, expected.reportDate, 'dashboard KPI report date');
  assertEqual(awardsReportDate, expected.reportDate, 'dashboard awards report date');
  assertEqual(kpicalcAsOf, expected.dataAsOfDate, 'kpicalc data date');
  assertEqual(snapshotAsOf, expected.dataAsOfDate, 'dashboard data-as-of date');
  assertEqual(kpiSource, expected.sourceFile, 'kpicalc source file');
  assertEqual(snapshotSource, expected.sourceFile, 'dashboard source file');
  assertEqual(kpiSource, snapshotSource, 'formal source alignment');
  assertEqual(kpicalcAsOf, snapshotAsOf, 'formal data-date alignment');
  assertEqual(Number(kpicalcData.stores && kpicalcData.stores.length), 9, 'kpicalc store count');
  assertEqual(Number(kpicalcData.persons && kpicalcData.persons.length), 40, 'kpicalc person count');
  assertEqual(Number(kpicalcData.items && kpicalcData.items.length), 25, 'kpicalc item count');
  const rateVerification = validateKpiRateReadback(kpicalcData, snapshot.kpiBattle);
  const supplementVerification = validateKpiSupplementReadback(snapshot.kpiBattle, expected);
  const awardVerification = validateAwardReadback(snapshot.awardsBattle, expected.awardsBattle);
  assertEqual(Number(snapshot.awardsBattle.phone_items), Number(expected.phoneItems), 'dashboard phone item count');
  assertEqual(Number(snapshot.awardsBattle.store_rows), Number(expected.storeRows), 'dashboard store row count');
  assertEqual(String(snapshotStatus.ownerEmail || ''), 'lian852456@gmail.com', 'dashboard owner');
  assertEqual(String(snapshotStatus.sharingAccess || ''), 'PRIVATE', 'dashboard sharing');
  assertEqual(String(snapshotStatus.kpiReportDate || ''), expected.reportDate, 'snapshot status KPI date');
  assertEqual(String(snapshotStatus.awardsReportDate || ''), expected.reportDate, 'snapshot status awards date');

  return {
    result: 'published-verified',
    reportDate: expected.reportDate,
    dataAsOfDate: expected.dataAsOfDate,
    sourceFile: expected.sourceFile,
    kpicalc: {
      stores: 9,
      persons: 40,
      items: 25,
      sourceFile: kpiSource,
      rawSourceFile: kpiRawSource,
      sourceCanonicalized: kpiSource !== kpiRawSource,
      rateVerification,
      supplementVerification,
    },
    dashboard: {
      phoneItems: Number(expected.phoneItems),
      storeRows: Number(expected.storeRows),
      awardVerification,
    },
    ownerEmail: snapshotStatus.ownerEmail,
    sharingAccess: snapshotStatus.sharingAccess,
    datesAligned: true,
    sourcesAligned: true,
  };
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function post(endpoint, payload) {
  const body = await postPrivateDashboardJson({
    endpoint,
    payload,
    curlBin: process.env.PRIVATE_DASHBOARD_CURL_BIN || 'curl',
  });
  if (!body || body.status !== 'ok') fail((body && body.message) || 'Apps Script returned an unknown error');
  return body;
}

function parseChildJson(stdout) {
  const trimmed = stdout.trim();
  try { return JSON.parse(trimmed); } catch {}
  const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    try { return JSON.parse(line); } catch {}
  }
  fail('publisher did not return a JSON result');
}

function runJson(script, args, extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: workDir,
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { stderr += chunk; process.stderr.write(chunk); });
    child.once('error', reject);
    child.once('close', code => {
      if (code !== 0) reject(new Error(`${path.basename(script)} exited with code ${code}: ${stderr.trim()}`));
      else {
        try { resolve(parseChildJson(stdout)); } catch (error) { reject(error); }
      }
    });
  });
}

async function formalReadback(expected) {
  const deviceId = `north12b-dual-readback-${Date.now()}`;
  const [kpiResult, privateResult, snapshotStatus] = await Promise.all([
    post(accessEndpoint, { action: 'kpicalc_access', employeeId, deviceId }),
    post(accessEndpoint, { action: 'private_access', employeeId, deviceId }),
    post(dashboardEndpoint, { action: 'private_admin_snapshot_status', adminSecret }),
  ]);
  return validateDualFormalReadback({
    kpicalcData: kpiResult.data,
    snapshot: privateResult.snapshot,
    snapshotStatus,
    expected,
  });
}

async function writeManifest(publication, details = {}) {
  const manifestPath = path.join(logsDir, `run-manifest-${reportRunDate.replaceAll('-', '')}.json`);
  const manifest = await readJson(manifestPath);
  manifest.reportRunDate = reportRunDate;
  manifest.mailDate = manifest.mailDate || reportRunDate;
  manifest.dataCutoffDate = details.dataCutoffDate || manifest.dataCutoffDate || null;
  manifest.websitePublication = { ...publication, ...details, checkedAt: new Date().toISOString() };
  if (publication.result === 'published-verified') {
    manifest.websiteResult = 'published-verified';
    manifest.drivePublishedAt = details.snapshotPublishedAt || manifest.drivePublishedAt || null;
    manifest.kpicalcPublishedAt = details.kpicalcPublishedAt || manifest.kpicalcPublishedAt || null;
    manifest.datesAligned = publication.datesAligned === true;
    manifest.sourcesAligned = publication.sourcesAligned === true;
    manifest.ownerEmail = publication.ownerEmail || manifest.ownerEmail || null;
    manifest.sharingAccess = publication.sharingAccess || manifest.sharingAccess || null;
  } else {
    manifest.websiteResult = 'blocked';
  }
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

async function main() {
  if (!accessEndpoint || !dashboardEndpoint || !employeeId || !adminSecret) {
    fail('formal access/dashboard endpoints, employee ID and Keychain administrator secret are required');
  }
  const manifestPath = path.join(logsDir, `run-manifest-${reportRunDate.replaceAll('-', '')}.json`);
  const [today, kpiBattle, awardsBattle, manifest] = await Promise.all([
    readJson(path.join(workDir, 'today_report_data.json')),
    readJson(path.join(privateDataDir, 'kpi-battle-latest.json')),
    readJson(path.join(privateDataDir, 'phone-awards-battle-latest.json')),
    readJson(manifestPath),
  ]);
  const dataCutoffDate = String(process.env.REPORT_DATA_CUTOFF_DATE || manifest.dataCutoffDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataCutoffDate)) {
    fail('REPORT_DATA_CUTOFF_DATE or manifest.dataCutoffDate is required');
  }
  const expected = {
    reportDate: dataCutoffDate,
    dataAsOfDate: dataCutoffDate,
    sourceFile: basename(today.source_path || today.source_file),
    phoneItems: Number(awardsBattle.phone_items),
    storeRows: Number(awardsBattle.store_rows),
    awardsSourceFiles: canonicalAwardsSourceFiles(awardsBattle.source_files, 'local awards'),
    awardsBattle,
    kpiBattle,
  };
  assertEqual(String(today.report_date_iso || ''), reportRunDate, 'local report run date');
  assertEqual(String(kpiBattle.report_run_date || ''), reportRunDate, 'local KPI report run date');
  assertEqual(String(awardsBattle.report_run_date || ''), reportRunDate, 'local awards report run date');
  assertEqual(String(kpiBattle.report_date || ''), dataCutoffDate, 'local KPI data cutoff date');
  assertEqual(String(awardsBattle.report_date || ''), dataCutoffDate, 'local awards data cutoff date');
  assertEqual(String(kpiBattle.data_as_of_date || kpiBattle.source_as_of_date || ''), dataCutoffDate, 'local KPI data-as-of date');
  assertEqual(basename(kpiBattle.source_file), expected.sourceFile, 'local KPI source file');
  assertAwardsSourceFilesEqual(
    awardsBattle.source_files,
    expected.awardsSourceFiles,
    'local awards',
  );

  let kpicalcResult = null;
  let snapshotResult = null;
  try {
    if (!verifyOnly) {
      const current = await post(accessEndpoint, {
        action: 'kpicalc_access',
        employeeId,
        deviceId: `north12b-kpi-current-${Date.now()}`,
      });
      const assessment = assessCurrentKpicalc({
        kpicalcData: current.data,
        kpiSnapshot: kpiBattle,
        expected,
      });
      if (assessment.ready) {
        kpicalcResult = { status:'ok', mode:'already-current', formal:assessment.formal };
      } else {
        if (!uploadEndpoint) fail(`report upload endpoint is required: ${assessment.reason}`);
        kpicalcResult = await runJson(path.join(workDir, 'publish_kpicalc_report.mjs'), [String(today.source_path)], {
          REPORT_UPLOAD_GAS_URL: uploadEndpoint,
          REPORT_ACCESS_GAS_URL: accessEndpoint,
          REPORT_UPLOAD_EMPLOYEE_ID: employeeId,
          PRIVATE_DASHBOARD_ADMIN_SECRET: adminSecret,
          REPORT_UPLOAD_EXPECTED_DATA_DATE: expected.dataAsOfDate,
          REPORT_UPLOAD_EXPECTED_STORES: '9',
          REPORT_UPLOAD_EXPECTED_PERSONS: '40',
        });
      }
      snapshotResult = await runJson(path.join(workDir, 'publish_private_dashboard_snapshot.mjs'), [], {
        PRIVATE_DASHBOARD_GAS_URL: dashboardEndpoint,
        PRIVATE_DASHBOARD_ADMIN_SECRET: adminSecret,
        PRIVATE_DASHBOARD_SKIP_ROSTER_SYNC: '1',
      });
    }
    const publication = await withBoundedReadbackRetry(
      () => formalReadback(expected),
      {
        onRetry: (error, attempt, attempts) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`formal readback not ready (${attempt}/${attempts}); retrying: ${message}`);
        },
      },
    );
    await writeManifest(publication, {
      mode: verifyOnly ? 'verify-only' : 'publish-and-verify',
      dataCutoffDate,
      kpicalcPublishedAt: kpicalcResult && kpicalcResult.formal && kpicalcResult.formal.publishedAt || '',
      snapshotPublishedAt: snapshotResult && snapshotResult.publishedAt || '',
    });
    console.log(JSON.stringify({ status: 'ok', publication, kpicalcResult, snapshotResult }, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeManifest({ result: 'blocked', message }, {
      mode: verifyOnly ? 'verify-only' : 'publish-and-verify',
      dataCutoffDate,
    }).catch(() => {});
    throw error;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
