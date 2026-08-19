import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeWaitingJobs, shouldSendMail, validateMailReceipt } from './report_official_ingest_consumer.mjs';

const receipt = {
  status: 'completed',
  idempotencyKey: 'run-20260819:abcdef',
  dailyReportMessageId: 'AAMk-daily-formal-001',
  awardsMessageId: 'AAMk-awards-formal-002',
  dailyAttachments: ['daily.xlsx'],
  awardsAttachments: ['awards.xlsx'],
  sentItemsAttachmentsVerified: true,
  sentAt: '2026-08-19T02:00:00.000Z',
};

test('formal Outlook receipt requires two real IDs and Sent Items readback', () => {
  const normalized = validateMailReceipt(receipt, receipt.idempotencyKey);
  assert.equal(normalized.daily.messageId, receipt.dailyReportMessageId);
  assert.equal(normalized.awards.messageId, receipt.awardsMessageId);
  assert.throws(() => validateMailReceipt({ ...receipt, awardsMessageId: null }, receipt.idempotencyKey), /awards Outlook/);
  assert.throws(() => validateMailReceipt({ ...receipt, dailyReportMessageId: 'fake-id' }, receipt.idempotencyKey), /not a Microsoft Outlook identifier/);
  assert.throws(() => validateMailReceipt({ ...receipt, sentItemsAttachmentsVerified: false }, receipt.idempotencyKey), /Sent Items/);
});

test('D: mail success followed by private publish retry never resends', () => {
  const job = { idempotencyKey: receipt.idempotencyKey, evidence: { mail: receipt } };
  assert.equal(shouldSendMail(job, null), false);
});

test('E: missing local receipt with complete job evidence never resends', () => {
  const evidence = {
    daily: { sent: true, messageId: receipt.dailyReportMessageId, attachments: receipt.dailyAttachments },
    awards: { sent: true, messageId: receipt.awardsMessageId, attachments: receipt.awardsAttachments },
    sentItemsAttachmentsVerified: true,
    sentAt: receipt.sentAt,
  };
  assert.equal(shouldSendMail({ idempotencyKey: receipt.idempotencyKey, evidence: { mail: evidence } }, null), false);
});

test('F: incomplete job mail evidence fails closed instead of resending', () => {
  const job = {
    idempotencyKey: receipt.idempotencyKey,
    evidence: { mail: { daily: { sent: true, messageId: receipt.dailyReportMessageId, attachments: receipt.dailyAttachments } } },
  };
  assert.throws(() => shouldSendMail(job, null), /partial job mail evidence; fail closed/);
});

test('G: duplicate runId and sourceHash already completed is not claimed or resent', async () => {
  const calls = [];
  const api = async action => {
    calls.push(action);
    if (action === 'report_upload_log') return { jobs: [
      { runId: 'duplicate', status: 'completed', idempotencyKey: receipt.idempotencyKey, evidence: { mail: receipt } },
    ] };
    throw new Error(`unexpected ${action}`);
  };
  const result = await consumeWaitingJobs({ api, processJob: async () => assert.fail('duplicate job must not process') });
  assert.deepEqual(result, { processed: 0, runIds: [] });
  assert.deepEqual(calls, ['report_upload_log']);
});

test('consumer only claims waiting-external-pipeline jobs', async () => {
  const claimed = [];
  const api = async (action, payload) => {
    if (action === 'report_upload_log') return { jobs: [
      { runId: 'input', status: 'waiting-input' },
      { runId: 'ready', status: 'waiting-external-pipeline' },
      { runId: 'done', status: 'completed' },
    ] };
    if (action === 'report_upload_job_claim') return { runId: payload.runId, status: 'processing', state: 'processing' };
    throw new Error(`unexpected ${action}`);
  };
  const result = await consumeWaitingJobs({ api, processJob: async job => { claimed.push(job.runId); return { ok: true }; } });
  assert.deepEqual(claimed, ['ready']);
  assert.equal(result.processed, 1);
});
