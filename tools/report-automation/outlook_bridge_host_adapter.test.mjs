import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { normalizeFormalReceipt, validateBridgeRequest } from './outlook_bridge_contract.mjs';
import { runAdapter } from './outlook_bridge_host_adapter.mjs';

function hash(content) { return createHash('sha256').update(content).digest('hex'); }

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'outlook-bridge-test-'));
  const bodyDaily = path.join(dir, 'daily.txt');
  const bodyAwards = path.join(dir, 'awards.txt');
  const dailyFile = path.join(dir, 'daily.xlsx');
  const awardsFile = path.join(dir, 'awards.xlsx');
  await fs.writeFile(bodyDaily, 'existing daily template\n');
  await fs.writeFile(bodyAwards, 'existing awards template\n');
  await fs.writeFile(dailyFile, 'daily-file');
  await fs.writeFile(awardsFile, 'awards-file');
  const requestedAt = '2026-08-19T01:00:00.000Z';
  const request = {
    schemaVersion: 1,
    runId: 'quick-20260819-test',
    idempotencyKey: 'quick-20260819-test:sourcehash',
    reportDate: '2026-08-19',
    requestedAt,
    payload: {
      report_date_iso: '2026-08-19',
      run_id: 'quick-20260819-test:sourcehash',
      daily: {
        status: 'ready', subject: '北一二B每日戰報 2026-08-19', body_path: bodyDaily,
        attachments: [{ path: dailyFile, size: 10, hash: hash(Buffer.from('daily-file')) }],
      },
      phone_awards: {
        status: 'ready', subject: '北一二B台獎機款進度 2026-08-19', body_path: bodyAwards,
        attachments: [{ path: awardsFile, size: 11, hash: hash(Buffer.from('awards-file')) }],
      },
    },
  };
  const requestPath = path.join(dir, 'mail-request.json');
  await fs.writeFile(requestPath, JSON.stringify(request), { mode: 0o600 });
  return { dir, request, requestPath };
}

function successReceipt(request) {
  return {
    status: 'completed', idempotencyKey: request.idempotencyKey,
    dailyReportMessageId: 'AAMk-daily-formal-12345', awardsMessageId: 'AAMk-awards-formal-67890',
    dailyAttachments: ['daily.xlsx'], awardsAttachments: ['awards.xlsx'],
    sentItemsAttachmentsVerified: true, sentAt: '2026-08-19T01:05:00.000Z', error: null,
  };
}

function fakeCodex(receipt, code = 0) {
  return async (_command, args) => {
    const outputIndex = args.indexOf('--output-last-message');
    await fs.writeFile(args[outputIndex + 1], JSON.stringify(receipt), { mode: 0o600 });
    assert.ok(args.includes('read-only'));
    assert.ok(args.includes('--skip-git-repo-check'));
    assert.ok(!args.includes('--dangerously-bypass-approvals-and-sandbox'));
    return { code, stdout: '', stderr: code ? 'host failed' : '' };
  };
}

const formalEnv = request => ({
  REPORT_OFFICIAL_INGEST_IDEMPOTENCY_KEY: request.idempotencyKey,
  REPORT_OUTLOOK_BRIDGE_ALLOW_SEND: 'YES',
  REPORT_OUTLOOK_RECIPIENT: 'recipient@example.com',
  REPORT_AUTOMATION_DIR: path.dirname(request.payload.daily.body_path),
});

test('A: formal adapter accepts two real messages and exact Sent Items attachment sets', async t => {
  const item = await fixture(); t.after(() => fs.rm(item.dir, { recursive: true, force: true }));
  const result = await runAdapter({ requestPath: item.requestPath, mode: 'formal', env: formalEnv(item.request), codexRunner: fakeCodex(successReceipt(item.request)) });
  assert.equal(result.dailyReportMessageId, 'AAMk-daily-formal-12345');
  assert.equal(result.awardsMessageId, 'AAMk-awards-formal-67890');
  assert.equal(result.sentItemsAttachmentsVerified, true);
});

test('B: daily success and awards failure never becomes a formal receipt', async t => {
  const item = await fixture(); t.after(() => fs.rm(item.dir, { recursive: true, force: true }));
  const partial = { ...successReceipt(item.request), status: 'failed', awardsMessageId: null, awardsAttachments: [], sentItemsAttachmentsVerified: false, sentAt: null, error: 'awards send failed' };
  await assert.rejects(runAdapter({ requestPath: item.requestPath, mode: 'formal', env: formalEnv(item.request), codexRunner: fakeCodex(partial) }), /did not complete both messages/);
});

test('C: Sent Items attachment mismatch fails closed', async t => {
  const item = await fixture(); t.after(() => fs.rm(item.dir, { recursive: true, force: true }));
  const mismatch = { ...successReceipt(item.request), awardsAttachments: ['wrong.xlsx'] };
  await assert.rejects(runAdapter({ requestPath: item.requestPath, mode: 'formal', env: formalEnv(item.request), codexRunner: fakeCodex(mismatch) }), /attachment mismatch/);
});

test('dry-run validates the real prepare payload contract and performs no formal side effect', async t => {
  const item = await fixture(); t.after(() => fs.rm(item.dir, { recursive: true, force: true }));
  let invoked = false;
  const result = await runAdapter({ requestPath: item.requestPath, mode: 'dry-run', env: formalEnv(item.request), codexRunner: async () => { invoked = true; } });
  assert.equal(invoked, false);
  assert.equal(result.status, 'dry-run');
  assert.equal(result.formalSideEffects, false);
  assert.equal(result.sentItemsAttachmentsVerified, false);
  assert.equal('dailyReportMessageId' in result, false);
});

test('formal receipt rejects fake IDs and a sent time before this request', async t => {
  const item = await fixture(); t.after(() => fs.rm(item.dir, { recursive: true, force: true }));
  const validated = await validateBridgeRequest(item.request, item.request.idempotencyKey);
  assert.throws(() => normalizeFormalReceipt({ ...successReceipt(item.request), dailyReportMessageId: 'fake-id' }, validated), /not a Microsoft Outlook identifier/);
  assert.throws(() => normalizeFormalReceipt({ ...successReceipt(item.request), sentAt: '2026-08-19T00:59:59.000Z' }, validated), /predates/);
});
