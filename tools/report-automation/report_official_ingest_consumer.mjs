#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { postPrivateDashboardJson } from './private_dashboard_transport.mjs';

const toolDir = path.dirname(fileURLToPath(import.meta.url));

function invariant(ok, message) { if (!ok) throw new Error(message); }
function sha256(value) { return createHash('sha256').update(value).digest('hex'); }
async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }

function runtimePaths(env = process.env) {
  const automationDir = env.REPORT_AUTOMATION_DIR;
  invariant(automationDir && path.isAbsolute(automationDir), 'REPORT_AUTOMATION_DIR must be an absolute path');
  const websiteRepoDir = env.REPORT_WEBSITE_REPO_DIR || path.resolve(toolDir, '../..');
  invariant(path.isAbsolute(websiteRepoDir), 'REPORT_WEBSITE_REPO_DIR must be an absolute path');
  return {
    automationDir,
    websiteRepoDir,
    workDir: path.join(automationDir, 'work'),
    stateRoot: env.REPORT_OFFICIAL_INGEST_STATE_DIR || path.join(automationDir, 'input/report-official-ingest-jobs'),
    historicalSourceDir: env.REPORT_OFFICIAL_INGEST_HISTORY_DIR || path.join(automationDir, 'input/google-drive'),
  };
}

function formalMessageId(value, label) {
  const id = String(value || '').trim();
  invariant(/^(?:(?:AAMk|AQMk)[A-Za-z0-9_+=/-]{8,}|<[^<>@]+@[^<>]+>)$/.test(id), `${label} Outlook receipt is not a Microsoft Outlook identifier`);
  return id;
}

export function validateMailReceipt(receipt, idempotencyKey) {
  invariant(receipt && receipt.idempotencyKey === idempotencyKey, 'mail receipt idempotency key mismatch');
  const dailyMessageId = formalMessageId(receipt.dailyReportMessageId ?? receipt.daily?.messageId, 'daily');
  const awardsMessageId = formalMessageId(receipt.awardsMessageId ?? receipt.awards?.messageId, 'awards');
  const dailyAttachments = receipt.dailyAttachments ?? receipt.daily?.attachments;
  const awardsAttachments = receipt.awardsAttachments ?? receipt.awards?.attachments;
  invariant(receipt.sentItemsAttachmentsVerified === true, 'Sent Items attachment readback missing');
  invariant(Array.isArray(dailyAttachments) && dailyAttachments.length > 0, 'daily attachment readback empty');
  invariant(Array.isArray(awardsAttachments) && awardsAttachments.length > 0, 'awards attachment readback empty');
  invariant(Number.isFinite(Date.parse(receipt.sentAt || receipt.verifiedAt || '')), 'formal sentAt missing');
  return {
    ...receipt,
    status: 'completed',
    dailyReportMessageId: dailyMessageId,
    awardsMessageId,
    dailyAttachments,
    awardsAttachments,
    daily: { sent: true, messageId: dailyMessageId, attachments: dailyAttachments },
    awards: { sent: true, messageId: awardsMessageId, attachments: awardsAttachments },
    sentAt: receipt.sentAt || receipt.verifiedAt,
    verifiedAt: receipt.verifiedAt || receipt.sentAt,
  };
}

function hasAnyMailEvidence(evidence) {
  if (!evidence || typeof evidence !== 'object') return false;
  return Boolean(evidence.daily || evidence.awards || evidence.dailyReportMessageId || evidence.awardsMessageId ||
    evidence.sentItemsAttachmentsVerified || evidence.sentAt || evidence.verifiedAt);
}

export function shouldSendMail(job, receipt) {
  const evidence = job.evidence?.mail || null;
  if (evidence) {
    try { validateMailReceipt({ idempotencyKey: job.idempotencyKey, ...evidence }, job.idempotencyKey); return false; }
    catch (error) {
      if (hasAnyMailEvidence(evidence)) throw new Error(`partial job mail evidence; fail closed: ${error.message}`);
    }
  }
  if (receipt) {
    validateMailReceipt(receipt, job.idempotencyKey);
    return false;
  }
  return true;
}

function run(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || toolDir,
      env: { ...process.env, ...(options.env || {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => code === 0
      ? resolve({ stdout, stderr })
      : reject(new Error(`${path.basename(command)} exited ${code}: ${stderr.trim()}`)));
  });
}

function parseLastJson(text) {
  const lines = String(text || '').trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean).reverse();
  for (const line of lines) { try { return JSON.parse(line); } catch {} }
  try { return JSON.parse(String(text || '').trim()); } catch { throw new Error('command did not return JSON'); }
}

export function createApi({ endpoint, employeeId, adminSecret, transport = postPrivateDashboardJson }) {
  invariant(endpoint && employeeId && adminSecret, 'upload GAS endpoint, employee ID and administrator secret are required');
  return async function api(action, fields = {}) {
    const body = await transport({ endpoint, payload: { action, employeeId, adminSecret, ...fields } });
    invariant(body && body.status === 'ok', body?.message || `GAS ${action} failed`);
    return body;
  };
}

async function updateStage(api, job, stage, stageStatus, detail, extra = {}) {
  return api('report_upload_job_update', { runId: job.runId, claimId: job.claimId, stage, stageStatus, detail, ...extra });
}

async function downloadExactSource(api, job, key, outputPath) {
  let offset = 0, expectedHash = '', total = 0;
  const chunks = [];
  while (true) {
    const response = await api('report_upload_job_source', {
      runId: job.runId, claimId: job.claimId, input: key, offset, limit: 512 * 1024,
    });
    invariant(response.offset === offset && response.nextOffset > offset, `${key} source chunk sequence invalid`);
    chunks.push(Buffer.from(response.base64, 'base64'));
    offset = response.nextOffset; total = response.totalBytes; expectedHash = response.sourceHash;
    if (response.done) break;
  }
  const content = Buffer.concat(chunks);
  invariant(content.length === total, `${key} source byte length mismatch`);
  invariant(sha256(content) === expectedHash, `${key} source hash readback mismatch`);
  await fs.writeFile(outputPath, content, { mode: 0o600 });
  return { path: outputPath, hash: expectedHash, bytes: total };
}

async function makeHistoryView(paths, jobDir, exactKpiPath) {
  const historyDir = path.join(jobDir, 'kpi-history');
  await fs.mkdir(historyDir, { recursive: true });
  const entries = await fs.readdir(paths.historicalSourceDir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile() || !/^\d{4}\.xlsx$/.test(entry.name)) continue;
    const source = path.join(paths.historicalSourceDir, entry.name);
    const destination = path.join(historyDir, entry.name);
    await fs.link(source, destination).catch(async () => fs.copyFile(source, destination));
  }
  await fs.copyFile(exactKpiPath, path.join(historyDir, path.basename(exactKpiPath)));
  return historyDir;
}

async function persistMailReceiptToManifest(paths, job, receipt) {
  const manifestPath = path.join(paths.automationDir, `logs/run-manifest-${job.reportDate.replaceAll('-', '')}.json`);
  const manifest = await readJson(manifestPath);
  manifest.mailIds = [receipt.daily.messageId, receipt.awards.messageId];
  manifest.mailVerification = {
    idempotencyKey: job.idempotencyKey,
    sentItemsAttachmentsVerified: true,
    dailyAttachments: receipt.daily.attachments,
    awardsAttachments: receipt.awards.attachments,
    verifiedAt: receipt.verifiedAt,
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

async function obtainMailReceipt({ paths, job, payload, jobDir, commandRunner = run }) {
  const receiptPath = path.join(jobDir, 'mail-receipt.json');
  const existing = await readJson(receiptPath).catch(() => null);
  if (!shouldSendMail(job, existing)) {
    const source = existing || { idempotencyKey: job.idempotencyKey, ...job.evidence.mail };
    return validateMailReceipt(source, job.idempotencyKey);
  }
  const bridge = String(process.env.REPORT_OUTLOOK_BRIDGE_COMMAND || '').trim();
  invariant(bridge && path.isAbsolute(bridge), 'formal Outlook bridge command must be an absolute path');
  const requestPath = path.join(jobDir, 'mail-request.json');
  let request = await readJson(requestPath).catch(() => null);
  if (!request) {
    request = {
      schemaVersion: 1,
      runId: job.runId,
      idempotencyKey: job.idempotencyKey,
      reportDate: job.reportDate,
      requestedAt: new Date().toISOString(),
      payload,
    };
    await fs.writeFile(requestPath, `${JSON.stringify(request, null, 2)}\n`, { mode: 0o600 });
  } else {
    invariant(request.idempotencyKey === job.idempotencyKey, 'existing mail request idempotency mismatch');
  }
  const result = await commandRunner(bridge, [requestPath], {
    cwd: paths.automationDir,
    env: { REPORT_OFFICIAL_INGEST_IDEMPOTENCY_KEY: job.idempotencyKey },
  });
  const receipt = validateMailReceipt(parseLastJson(result.stdout), job.idempotencyKey);
  await fs.writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  return receipt;
}

export async function processClaimedJob(job, deps = {}) {
  const paths = deps.paths || runtimePaths();
  const api = deps.api;
  const commandRunner = deps.commandRunner || run;
  invariant(job.status === 'processing' && job.state === 'processing', 'consumer requires a claimed processing job');
  invariant(job.idempotencyKey === `${job.runId}:${job.inputs.kpi.sourceHash}`, 'job idempotency key invalid');
  const jobDir = path.join(paths.stateRoot, sha256(Buffer.from(job.idempotencyKey)).slice(0, 24));
  const sourceDir = path.join(jobDir, 'sources');
  await fs.mkdir(sourceDir, { recursive: true, mode: 0o700 });
  let currentStage = 'source_files';
  try {
    const exact = {};
    for (const key of ['kpi', 'awardStore', 'awardPerson']) {
      exact[key] = await downloadExactSource(api, job, key, path.join(sourceDir, job.inputs[key].canonicalName));
    }
    await updateStage(api, job, 'source_files', 'ok', '三份 exact File ID 已下載並通過 SHA-256 readback');
    const historyDir = await makeHistoryView(paths, jobDir, exact.kpi.path);

    currentStage = 'kpi_battle';
    await updateStage(api, job, currentStage, 'running', '執行既有 run_daily_north12b_report');
    await commandRunner(process.execPath, [path.join(paths.workDir, 'run_daily_north12b_report.mjs')], {
      cwd: paths.automationDir,
      env: { REPORT_SOURCE_DIR: historyDir, REPORT_DATE_ISO: job.reportDate, REPORT_RUN_ID: job.idempotencyKey },
    });
    await updateStage(api, job, currentStage, 'running', '既有 daily runner 完成；等待正式 battle build/readback');

    currentStage = 'awards_formal';
    await updateStage(api, job, currentStage, 'running', '執行既有 update_phone_awards.py');
    const python = process.env.PYTHON_BIN || path.join(paths.automationDir, '.venv-report/bin/python');
    await commandRunner(python, [path.join(paths.workDir, 'update_phone_awards.py')], {
      cwd: paths.automationDir,
      env: {
        PHONE_AWARDS_STORE_SOURCE: exact.awardStore.path,
        PHONE_AWARDS_PERSON_SOURCE: exact.awardPerson.path,
        REPORT_RUN_ID: job.idempotencyKey,
        REPORT_DATE_ISO: job.reportDate,
      },
    });
    const awardSummary = await readJson(path.join(paths.automationDir, 'outputs/phone_awards_update_summary.json'));
    invariant(Number(awardSummary.phone_items) === 13, 'awards readback must contain 13 phone items');
    invariant(Number(awardSummary.store_rows) === 10, 'awards readback must contain aggregate + 9 stores');
    await updateStage(api, job, currentStage, 'ok', '13 款／9 店正式台獎產物 PASS', {
      evidence: { awards: { passed: true, phoneItems: 13, storeCount: 9 } },
    });

    currentStage = 'daily_mail';
    const preflight = await commandRunner(process.execPath, [path.join(paths.workDir, 'prepare_send_payloads.mjs')], {
      cwd: paths.automationDir,
      env: { REPORT_DATE_ISO: job.reportDate, REPORT_RUN_ID: job.idempotencyKey },
    });
    const mailPayload = parseLastJson(preflight.stdout);
    const receipt = await obtainMailReceipt({ paths, job, payload: mailPayload, jobDir, commandRunner });
    await persistMailReceiptToManifest(paths, job, receipt);
    const mailEvidence = {
      mail: {
        idempotencyKey: job.idempotencyKey,
        daily: receipt.daily,
        awards: receipt.awards,
        sentItemsAttachmentsVerified: true,
        sentAt: receipt.sentAt,
        verifiedAt: receipt.verifiedAt,
      },
    };
    await updateStage(api, job, 'daily_mail', 'ok', 'Outlook 每日戰報已寄出', { evidence: mailEvidence });
    await updateStage(api, job, 'awards_mail', 'ok', 'Outlook 台獎 Mail 已寄出', { evidence: mailEvidence });
    await updateStage(api, job, 'sent_items', 'ok', '寄件備份兩封附件名稱／數量 readback PASS', { evidence: mailEvidence });

    currentStage = 'awards_battle';
    const build = await commandRunner(python, [path.join(paths.workDir, 'build_github_pages_data.py'), '--source-dir', historyDir], { cwd: paths.automationDir });
    parseLastJson(build.stdout);
    const kpiSnapshot = await readJson(path.join(paths.websiteRepoDir, 'private-data/kpi-battle-latest.json'));
    const awardSnapshot = await readJson(path.join(paths.websiteRepoDir, 'private-data/phone-awards-battle-latest.json'));
    invariant(String(kpiSnapshot.report_date) === job.reportDate, 'KPI battle local readback date mismatch');
    invariant(String(awardSnapshot.report_date) === job.reportDate && Number(awardSnapshot.phone_items) === 13 && Number(awardSnapshot.store_rows) === 10, 'awards battle local readback mismatch');
    await updateStage(api, job, 'kpi_battle', 'ok', '既有 build_github_pages_data KPI snapshot PASS');
    await updateStage(api, job, 'awards_battle', 'ok', '既有 build_github_pages_data 台獎 snapshot PASS');

    currentStage = 'private_publish';
    await updateStage(api, job, currentStage, 'running', '執行既有 private/formal publisher');
    await commandRunner('/bin/zsh', [path.join(paths.workDir, 'publish_formal_website_with_keychain.sh')], {
      cwd: paths.automationDir,
      env: { REPORT_DATE_ISO: job.reportDate, REPORT_RUN_ID: job.idempotencyKey },
    });
    await updateStage(api, job, currentStage, 'ok', '既有 private publisher 完成');
    const manifest = await readJson(path.join(paths.automationDir, `logs/run-manifest-${job.reportDate.replaceAll('-', '')}.json`));
    invariant(manifest.websiteResult === 'published-verified' && manifest.datesAligned === true && manifest.sourcesAligned === true, 'formal website readback gate failed');
    const publication = manifest.websitePublication || {};
    invariant(publication.reportDate === job.reportDate && Number(publication.dashboard?.phoneItems) === 13 && Number(publication.dashboard?.storeRows) === 10, 'private KPI/awards readback mismatch');
    const readbackEvidence = {
      privateReadback: { kpiPassed: true, awardsPassed: true, reportDate: job.reportDate },
      supervisor: { aligned: true, reportDate: job.reportDate },
      website: { passed: true, reportDate: job.reportDate },
    };
    await updateStage(api, job, 'private_readback', 'ok', 'private KPI／台獎正式 readback PASS', { evidence: readbackEvidence });
    await updateStage(api, job, 'supervisor_app', 'ok', 'Supervisor App 正式來源日期同日', { evidence: readbackEvidence });
    return updateStage(api, job, 'website_readback', 'ok', 'kpicalc_access／private_access／snapshot status PASS', { evidence: readbackEvidence });
  } catch (error) {
    await updateStage(api, job, currentStage, 'fail', '正式 pipeline 中止；可由相同 job 續跑', {
      error: error?.message || String(error), retryable: true,
    }).catch(() => {});
    throw error;
  }
}

export async function consumeWaitingJobs({ api, onlyRunId = '', processJob = processClaimedJob }) {
  const listing = await api('report_upload_log', { limit: 50 });
  const waiting = (listing.jobs || []).filter(job => job.status === 'waiting-external-pipeline' && (!onlyRunId || job.runId === onlyRunId));
  const results = [];
  for (const queued of waiting) {
    const claimed = await api('report_upload_job_claim', { runId: queued.runId });
    results.push(await processJob(claimed, { api }));
  }
  return { processed: results.length, runIds: waiting.map(job => job.runId) };
}

async function main() {
  runtimePaths();
  const api = createApi({
    endpoint: process.env.REPORT_UPLOAD_GAS_URL,
    employeeId: process.env.REPORT_UPLOAD_EMPLOYEE_ID,
    adminSecret: process.env.PRIVATE_DASHBOARD_ADMIN_SECRET,
  });
  const retryIndex = process.argv.indexOf('--retry-run-id');
  const retryRunId = retryIndex >= 0 ? process.argv[retryIndex + 1] : '';
  if (retryRunId) await api('report_upload_job_update', { runId: retryRunId, retry: true });
  const runIndex = process.argv.indexOf('--run-id');
  const onlyRunId = retryRunId || (runIndex >= 0 ? process.argv[runIndex + 1] : '');
  console.log(JSON.stringify(await consumeWaitingJobs({ api, onlyRunId })));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error?.stack || String(error));
    process.exitCode = 1;
  });
}
