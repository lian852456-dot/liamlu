#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { postPublicationJson } from './publication_transport_client.mjs';

const endpoint = process.env.REPORT_UPLOAD_GAS_URL || '';
const accessEndpoint = process.env.REPORT_ACCESS_GAS_URL || '';
const employeeId = String(process.env.REPORT_UPLOAD_EMPLOYEE_ID || '').trim().toUpperCase();
const adminSecret = process.env.PRIVATE_DASHBOARD_ADMIN_SECRET || '';
const expectedDataDate = process.env.REPORT_UPLOAD_EXPECTED_DATA_DATE || '';
const expectedStores = Number(process.env.REPORT_UPLOAD_EXPECTED_STORES || 9);
const expectedPersons = Number(process.env.REPORT_UPLOAD_EXPECTED_PERSONS || 40);
const reportRunDate = process.env.REPORT_RUN_DATE_ISO || process.env.REPORT_DATE_ISO || '';
const publicationRunId = process.env.PRIVATE_DASHBOARD_KPI_RUN_ID || '';
const normalizeCurrent = process.argv.includes('--normalize-current');
const inputArg = process.argv.slice(2).find(arg => arg !== '--normalize-current') || '';
const inputPath = inputArg ? path.resolve(inputArg) : '';

export const REQUIRED_RATE_KEYS = [
  'AQ V+D 999 (含)以上', 'AQ V+D 1399 (含)以上', '好速案銷售點數',
  'RT V+D 999 (含)以上', 'RT V+D 1399 (含)以上', 'RT上線點數',
];

function fail(message) {
  throw new Error(`official KPI publish blocked: ${message}`);
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) fail(`${label} mismatch: expected ${expected}, got ${actual}`);
}

function hasOwn(obj, key) {
  return Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}

export function hasKpiRateCoverage(data) {
  const items = Array.isArray(data && data.items) ? data.items : [];
  const stores = Array.isArray(data && data.stores) ? data.stores : [];
  const persons = Array.isArray(data && data.persons) ? data.persons : [];
  const itemKeys = items.map(item => String((item || {}).key || '')).filter(Boolean);
  const aggregateRates = data && data.aggregateRates;
  if (itemKeys.length !== 25 || stores.length < 3) return false;
  if (itemKeys.some(key => !hasOwn(aggregateRates, key))) return false;
  if (stores.some(row => itemKeys.some(key => !hasOwn(row?.items?.[key], 'reportRate')))) return false;
  if (persons.some(row => itemKeys.some(key => !hasOwn(row?.items?.[key], 'reportRate')))) return false;
  if (REQUIRED_RATE_KEYS.some(key => !hasOwn(aggregateRates, key) || !Number.isFinite(Number(aggregateRates[key])))) return false;
  return stores.slice(0, 3).every(row => REQUIRED_RATE_KEYS.every(key => {
    const value = row?.items?.[key]?.reportRate;
    return value !== null && value !== '' && value !== undefined && Number.isFinite(Number(value));
  }));
}

export function allowSameDateRateRepair({ preview, currentData, fileName, expectedDate }) {
  return Boolean(preview && preview.needsForce) &&
    String(currentData?.meta?.sourceFile || '') === fileName &&
    (!expectedDate || kpiDataDate(currentData) === expectedDate) &&
    !hasKpiRateCoverage(currentData);
}

async function postTo(target, payload) {
  const actionName = String(payload?.action || '');
  const body = await postPublicationJson({
    endpoint: target,
    payload: { employeeId, adminSecret, ...payload },
    reportDate: reportRunDate,
    cutoff: expectedDataDate,
    runId: publicationRunId,
    component: 'KPI',
    action: actionName.includes('access') || actionName.includes('preview') ? 'website-readback' : 'publish',
  });
  if (!body || body.status !== 'ok') fail((body && body.message) || 'Apps Script returned an unknown error');
  return body;
}

async function post(payload) {
  return postTo(endpoint, payload);
}

function kpiDataDate(data) {
  const month = String((data && data.meta && data.meta.month) || '');
  const day = Number(data && data.meta && data.meta.snapshotDay);
  return /^\d{4}-\d{2}$/.test(month) && day ? `${month}-${String(day).padStart(2, '0')}` : '';
}

// The report-upload service is being migrated to carry both the report-run
// date and the actual source cutoff date.  Its legacy `dataDate` field is the
// source cutoff date, while the newer service uses that field for report run
// date and returns `sourceDataDate` explicitly.  Formal publication must
// always gate on the source cutoff date; it must never silently accept a
// report-run date as a substitute.
export function sourceCutoffDateFromUploadResponse(response) {
  const explicit = String(
    (response && response.sourceDataDate) ||
    (response && response.preview && response.preview.sourceDataDate) ||
    '',
  ).trim();
  return explicit || String((response && response.dataDate) || '').trim();
}

async function normalizeFormalSourceFile(fileName) {
  if (!accessEndpoint) fail('REPORT_ACCESS_GAS_URL is required for formal website readback');
  const deviceId = `north12b-kpi-publish-${Date.now()}`;
  const before = await postTo(accessEndpoint, { action: 'kpicalc_access', deviceId });
  const data = before.data;
  if (!data || !data.meta || !Array.isArray(data.stores) || !Array.isArray(data.persons)) {
    fail('formal kpicalc readback returned an incomplete structure');
  }
  if (expectedDataDate) assertEqual(kpiDataDate(data), expectedDataDate, 'pre-normalization data date');
  assertEqual(data.stores.length, expectedStores, 'pre-normalization store count');
  assertEqual(data.persons.length, expectedPersons, 'pre-normalization person count');

  data.meta.sourceFile = fileName;
  const published = await postTo(accessEndpoint, {
    action: 'kpicalc_publish',
    dataBase64: Buffer.from(JSON.stringify(data), 'utf8').toString('base64'),
  });
  if (!published.publishedAt) fail('kpicalc_publish did not return publishedAt');

  const after = await postTo(accessEndpoint, { action: 'kpicalc_access', deviceId });
  const verified = after.data;
  if (expectedDataDate) assertEqual(kpiDataDate(verified), expectedDataDate, 'normalized formal data date');
  assertEqual(String(verified.meta.sourceFile || ''), fileName, 'formal source file');
  assertEqual(verified.stores.length, expectedStores, 'formal store count');
  assertEqual(verified.persons.length, expectedPersons, 'formal person count');
  return {
    publishedAt: published.publishedAt,
    sourceFile: verified.meta.sourceFile,
    dataDate: kpiDataDate(verified),
    period: verified.meta.period,
    stores: verified.stores.length,
    persons: verified.persons.length,
    kpiItems: Array.isArray(verified.items) ? verified.items.length : 0,
  };
}

async function currentFormalKpi() {
  if (!accessEndpoint) return null;
  const result = await postTo(accessEndpoint, {
    action: 'kpicalc_access',
    deviceId: `north12b-kpi-precheck-${Date.now()}`,
  });
  return result && result.data;
}

function formalSummary(data) {
  return {
    sourceFile: String((data && data.meta && data.meta.sourceFile) || ''),
    dataDate: kpiDataDate(data),
    period: String((data && data.meta && data.meta.period) || ''),
    stores: Array.isArray(data && data.stores) ? data.stores.length : 0,
    persons: Array.isArray(data && data.persons) ? data.persons.length : 0,
    kpiItems: Array.isArray(data && data.items) ? data.items.length : 0,
  };
}

async function main() {
  if (!employeeId || !adminSecret) {
    fail('REPORT_UPLOAD_EMPLOYEE_ID and PRIVATE_DASHBOARD_ADMIN_SECRET are required');
  }
  if (normalizeCurrent) {
    const sourceFile = String(process.env.REPORT_UPLOAD_SOURCE_FILE || '').trim();
    if (!sourceFile || !/^\d{4}\.xlsx$/i.test(sourceFile)) fail('REPORT_UPLOAD_SOURCE_FILE is required for --normalize-current');
    const normalized = await normalizeFormalSourceFile(sourceFile);
    console.log(JSON.stringify({ status: 'ok', mode: 'normalize-current', formal: normalized }, null, 2));
    return;
  }
  if (!endpoint) fail('REPORT_UPLOAD_GAS_URL is required');
  if (!inputPath || path.extname(inputPath).toLowerCase() !== '.xlsx') fail('an .xlsx input path is required');

  const fileName = path.basename(inputPath);
  const currentData = await currentFormalKpi();
  const current = formalSummary(currentData);
  if (current.sourceFile === fileName &&
      (!expectedDataDate || current.dataDate === expectedDataDate) &&
      current.stores === expectedStores && current.persons === expectedPersons && current.kpiItems === 25 &&
      hasKpiRateCoverage(currentData)) {
    console.log(JSON.stringify({ status: 'ok', mode: 'already-current', formal: current }, null, 2));
    return;
  }

  const bytes = await fs.readFile(inputPath);
  const preview = await post({
    action: 'report_upload_preview',
    kind: 'kpi',
    fileName,
    fileBase64: bytes.toString('base64'),
  });

  if (!preview.ok || !preview.token) {
    const blocked = (preview.checks || []).filter(check => check.level === 'block');
    fail(`preview did not pass: ${blocked.map(check => `${check.label}: ${check.detail}`).join('; ') || 'unknown validation error'}`);
  }
  const forceRateRepair = allowSameDateRateRepair({
    preview,
    currentData,
    fileName,
    expectedDate: expectedDataDate,
  });
  if (preview.needsForce && !forceRateRepair) fail('preview requires a forced overwrite; no formal data was changed');
  const previewSourceDataDate = sourceCutoffDateFromUploadResponse(preview);
  if (expectedDataDate) assertEqual(previewSourceDataDate, expectedDataDate, 'source data date');
  assertEqual(Number(preview.preview && preview.preview.storeCount), expectedStores, 'store count');
  assertEqual(Number(preview.preview && preview.preview.personCount), expectedPersons, 'person count');

  const itemCheck = (preview.checks || []).find(check => check.key === 'fields');
  if (!itemCheck || itemCheck.level !== 'ok' || !/25/.test(String(itemCheck.detail || ''))) {
    fail(`KPI field validation missing or incomplete: ${(itemCheck && itemCheck.detail) || 'not returned'}`);
  }

  const commit = await post({ action: 'report_upload_commit', token: preview.token, force: forceRateRepair });
  if (commit.result !== 'ok') fail(commit.message || `commit result was ${commit.result || 'unknown'}`);
  const committedSourceDataDate = sourceCutoffDateFromUploadResponse(commit.live || {});
  if (expectedDataDate) assertEqual(committedSourceDataDate, expectedDataDate, 'formal readback source data date');

  const failedStages = (commit.stages || []).filter(stage => stage.status === 'fail');
  if (failedStages.length) fail(`formal readback stages failed: ${failedStages.map(stage => stage.label).join(', ')}`);

  const formal = await normalizeFormalSourceFile(fileName);

  console.log(JSON.stringify({
    status: 'ok',
    fileName,
    dataDate: previewSourceDataDate,
    reportRunDate: String(preview.dataDate || ''),
    period: preview.preview.period,
    stores: preview.preview.storeCount,
    persons: preview.preview.personCount,
    kpiItems: 25,
    publishedResult: commit.result,
    logId: commit.logId,
    backupFile: commit.backupFile,
    live: commit.live,
    formal,
    stages: commit.stages,
    forceRateRepair,
  }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    if (error && error.details) {
      console.error(JSON.stringify({
        status: error.details.status,
        contentType: error.details.contentType,
        responsePreview: error.details.responsePreview,
      }));
    }
    process.exitCode = 1;
  });
}
