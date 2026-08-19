#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDryRunResult, normalizeFormalReceipt, validateBridgeRequest } from './outlook_bridge_contract.mjs';

const toolDir = path.dirname(fileURLToPath(import.meta.url));
const receiptSchema = path.join(toolDir, 'outlook-bridge-receipt.schema.json');

function invariant(ok, message) {
  if (!ok) throw new Error(message);
}

export function createOutlookHostPrompt({ requestPath, request, recipient }) {
  return `You are the formal North12B Outlook host adapter. This is an authorized production-mail operation only for the exact request below.

Read the request JSON at: ${requestPath}
Idempotency key: ${request.idempotencyKey}
Requested at: ${request.requestedAt}
Recipient: ${recipient}

Mandatory rules:
1. Use payload.daily and payload.phone_awards exactly as produced by prepare_send_payloads.mjs. Read body text from each body_path. Do not rewrite either template.
2. Use only the installed Microsoft Outlook connector. Never use SMTP, Graph tokens from files, browser automation, drafts, or fake IDs.
3. Before sending each message, inspect Outlook Sent Items (寄件備份) for this same retry: exact subject, recipient, full body, sent time on/after requestedAt, and exact attachment filenames. Reuse an exact verified match; do not resend it.
4. If no exact verified match exists, send daily first and awards second with save_to_sent_items=true and the exact absolute attachment paths from the payload.
5. After each send, resolve the real Sent Items message and list its attachment metadata. The returned message ID must come from Outlook list/fetch results, not generated text.
6. Success requires both real message IDs and exact attachment-name sets. If any send or readback fails, return status=failed with any real partial evidence and a concise error. Never invent missing fields.
7. Do not modify local files or perform any action outside these two messages and their readback.

Return only the output-schema JSON. For status=completed, sentAt must be the later real Outlook sent time and sentItemsAttachmentsVerified must be true.`;
}

function runCodex(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', code => resolve({ code, stdout, stderr }));
  });
}

async function writePrivateJson(file, value) {
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

export async function runAdapter({ requestPath, mode, env = process.env, codexRunner = runCodex }) {
  invariant(path.isAbsolute(requestPath), 'bridge request path must be absolute');
  const rawRequest = JSON.parse(await fs.readFile(requestPath, 'utf8'));
  const request = await validateBridgeRequest(rawRequest, env.REPORT_OFFICIAL_INGEST_IDEMPOTENCY_KEY || '');
  if (mode === 'dry-run') return buildDryRunResult(request);

  invariant(mode === 'formal', 'bridge mode must be dry-run or formal');
  invariant(env.REPORT_OUTLOOK_BRIDGE_ALLOW_SEND === 'YES', 'formal Outlook bridge requires REPORT_OUTLOOK_BRIDGE_ALLOW_SEND=YES');
  invariant(typeof env.REPORT_OUTLOOK_RECIPIENT === 'string' && env.REPORT_OUTLOOK_RECIPIENT.includes('@'), 'REPORT_OUTLOOK_RECIPIENT is required');
  const automationDir = env.REPORT_AUTOMATION_DIR;
  invariant(automationDir && path.isAbsolute(automationDir), 'REPORT_AUTOMATION_DIR must be an absolute path');

  const resultDir = await fs.mkdtemp(path.join(os.tmpdir(), 'north12b-outlook-host-'));
  const resultPath = path.join(resultDir, 'host-result.json');
  const auditPath = `${requestPath}.outlook-host-attempt.json`;
  try {
    const prompt = createOutlookHostPrompt({ requestPath, request, recipient: env.REPORT_OUTLOOK_RECIPIENT });
    const codexBin = env.REPORT_OUTLOOK_BRIDGE_CODEX_BIN || 'codex';
    const args = [
      'exec', '--ephemeral', '--sandbox', 'read-only', '--skip-git-repo-check',
      '--cd', automationDir, '--output-schema', receiptSchema, '--output-last-message', resultPath, prompt,
    ];
    const result = await codexRunner(codexBin, args, automationDir);
    const hostReceipt = await fs.readFile(resultPath, 'utf8').then(JSON.parse).catch(() => null);
    await writePrivateJson(auditPath, {
      idempotencyKey: request.idempotencyKey,
      attemptedAt: new Date().toISOString(),
      status: hostReceipt?.status || 'host-failed',
      dailyReportMessageId: hostReceipt?.dailyReportMessageId || null,
      awardsMessageId: hostReceipt?.awardsMessageId || null,
      dailyAttachments: hostReceipt?.dailyAttachments || [],
      awardsAttachments: hostReceipt?.awardsAttachments || [],
      sentItemsAttachmentsVerified: hostReceipt?.sentItemsAttachmentsVerified === true,
      sentAt: hostReceipt?.sentAt || null,
      error: hostReceipt?.error || (result.stderr || `codex host exited ${result.code}`).trim(),
    });
    invariant(result.code === 0, `Codex Outlook host exited ${result.code}`);
    return normalizeFormalReceipt(hostReceipt, request);
  } finally {
    await fs.rm(resultDir, { recursive: true, force: true });
  }
}

async function main() {
  const mode = process.argv.includes('--formal') ? 'formal' : process.argv.includes('--dry-run') ? 'dry-run' : '';
  const requestPath = process.argv.filter(arg => !arg.startsWith('--'))[2];
  invariant(mode, 'pass --dry-run or --formal');
  invariant(requestPath, 'bridge request JSON path is required');
  const result = await runAdapter({ requestPath: path.resolve(requestPath), mode });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  });
}
