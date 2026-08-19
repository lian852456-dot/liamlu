import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function invariant(ok, message) {
  if (!ok) throw new Error(message);
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function validIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function validIsoInstant(value) {
  return Number.isFinite(Date.parse(String(value || '')));
}

function attachmentNames(value) {
  invariant(Array.isArray(value) && value.length > 0, 'attachment readback is empty');
  return value.map(item => path.basename(String(typeof item === 'string' ? item : item?.name || item?.path || '')));
}

function sameNames(actual, expected) {
  return actual.length === expected.length && [...actual].sort().every((name, index) => name === [...expected].sort()[index]);
}

async function validatePayloadPart(part, label) {
  invariant(part?.status === 'ready', `${label} payload is not ready`);
  invariant(typeof part.subject === 'string' && part.subject.trim(), `${label} subject missing`);
  invariant(path.isAbsolute(String(part.body_path || '')), `${label} body path must be absolute`);
  const body = await fs.readFile(part.body_path, 'utf8');
  invariant(body.trim(), `${label} body is empty`);
  invariant(Array.isArray(part.attachments) && part.attachments.length > 0, `${label} attachments missing`);
  for (const attachment of part.attachments) {
    invariant(path.isAbsolute(String(attachment?.path || '')), `${label} attachment path must be absolute`);
    const content = await fs.readFile(attachment.path);
    const stat = await fs.stat(attachment.path);
    invariant(stat.isFile() && stat.size > 0, `${label} attachment is empty`);
    invariant(Number(attachment.size) === stat.size, `${label} attachment size mismatch: ${path.basename(attachment.path)}`);
    invariant(sha256(content) === attachment.hash, `${label} attachment hash mismatch: ${path.basename(attachment.path)}`);
  }
  return {
    subject: part.subject,
    body,
    bodySha256: sha256(Buffer.from(body)),
    attachments: part.attachments.map(item => ({ ...item, name: path.basename(item.path) })),
  };
}

export async function validateBridgeRequest(request, expectedIdempotencyKey = '') {
  invariant(request?.schemaVersion === 1, 'unsupported bridge request schema');
  invariant(typeof request.runId === 'string' && request.runId.trim(), 'bridge runId missing');
  invariant(typeof request.idempotencyKey === 'string' && request.idempotencyKey.includes(':'), 'bridge idempotency key missing');
  if (expectedIdempotencyKey) invariant(request.idempotencyKey === expectedIdempotencyKey, 'bridge idempotency key does not match environment');
  invariant(validIsoDate(request.reportDate), 'bridge report date invalid');
  invariant(validIsoInstant(request.requestedAt), 'bridge requestedAt invalid');
  invariant(request.payload?.report_date_iso === request.reportDate, 'payload report date mismatch');
  invariant(!request.payload?.run_id || request.payload.run_id === request.idempotencyKey, 'payload run ID mismatch');
  const daily = await validatePayloadPart(request.payload.daily, 'daily');
  const awards = await validatePayloadPart(request.payload.phone_awards, 'awards');
  invariant(daily.subject === `北一二B每日戰報 ${request.reportDate}`, 'daily subject contract mismatch');
  invariant(awards.subject === `北一二B台獎機款進度 ${request.reportDate}`, 'awards subject contract mismatch');
  return { ...request, expected: { daily, awards } };
}

function realMessageId(value, label) {
  const id = String(value || '').trim();
  invariant(/^(?:(?:AAMk|AQMk)[A-Za-z0-9_+=/-]{8,}|<[^<>@]+@[^<>]+>)$/.test(id), `${label} message ID is not a Microsoft Outlook identifier`);
  return id;
}

export function normalizeFormalReceipt(receipt, request) {
  invariant(receipt && receipt.idempotencyKey === request.idempotencyKey, 'mail receipt idempotency key mismatch');
  invariant(receipt.status === 'completed', 'Outlook bridge did not complete both messages');
  const dailyReportMessageId = realMessageId(receipt.dailyReportMessageId ?? receipt.daily?.messageId, 'daily');
  const awardsMessageId = realMessageId(receipt.awardsMessageId ?? receipt.awards?.messageId, 'awards');
  const dailyAttachments = attachmentNames(receipt.dailyAttachments ?? receipt.daily?.attachments);
  const awardsAttachments = attachmentNames(receipt.awardsAttachments ?? receipt.awards?.attachments);
  const expectedDaily = request.expected.daily.attachments.map(item => item.name);
  const expectedAwards = request.expected.awards.attachments.map(item => item.name);
  invariant(sameNames(dailyAttachments, expectedDaily), 'daily Sent Items attachment mismatch');
  invariant(sameNames(awardsAttachments, expectedAwards), 'awards Sent Items attachment mismatch');
  invariant(receipt.sentItemsAttachmentsVerified === true, 'Sent Items attachment verification missing');
  invariant(validIsoInstant(receipt.sentAt), 'formal sentAt missing');
  invariant(Date.parse(receipt.sentAt) >= Date.parse(request.requestedAt), 'formal sentAt predates this idempotency request');
  return {
    status: 'completed',
    idempotencyKey: request.idempotencyKey,
    dailyReportMessageId,
    awardsMessageId,
    dailyAttachments,
    awardsAttachments,
    sentItemsAttachmentsVerified: true,
    sentAt: receipt.sentAt,
    daily: { sent: true, messageId: dailyReportMessageId, attachments: dailyAttachments },
    awards: { sent: true, messageId: awardsMessageId, attachments: awardsAttachments },
    verifiedAt: receipt.verifiedAt || receipt.sentAt,
  };
}

export function buildDryRunResult(request) {
  return {
    status: 'dry-run',
    idempotencyKey: request.idempotencyKey,
    reportDate: request.reportDate,
    wouldSend: [
      { kind: 'daily', subject: request.expected.daily.subject, attachments: request.expected.daily.attachments.map(item => item.name) },
      { kind: 'awards', subject: request.expected.awards.subject, attachments: request.expected.awards.attachments.map(item => item.name) },
    ],
    sentItemsAttachmentsVerified: false,
    formalSideEffects: false,
  };
}
