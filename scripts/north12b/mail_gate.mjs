#!/usr/bin/env node
// Connector-neutral gate. Only the already-authorized direct connector may send.
// This CLI performs local file/receipt operations; it never connects or sends.
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { hash, verifySealedBatch } from './final_mail_batch.mjs';

function need(ok, code) { if (!ok) throw new Error(code); }
function exactMail(batch, type, evidence) {
  const mail = batch.mails[type];
  need(evidence?.query?.complete === true && evidence.query.reportDate === batch.reportDate
    && evidence.query.subject === mail.subject && evidence.query.folder === 'Sent Items'
    && Array.isArray(evidence.messages), 'SENT_QUERY_INCOMPLETE');
  const age = Date.now() - Date.parse(evidence.query.checkedAt);
  need(Number.isFinite(age) && age >= -15000 && age <= 60000, 'SENT_QUERY_STALE');
  if (evidence.messages.length === 0) return 'NOT_FOUND';
  need(evidence.messages.length === 1, 'SAME_DAY_MULTIPLE_MAILS');
  const m = evidence.messages[0];
  need(m.id && m.subject === mail.subject && m.recipient === 'lian852456@gmail.com'
    && m.bodySha256 === mail.bodyHash && m.sourceIdentitySha256 === hash(JSON.stringify(batch.sourceIdentity))
    && m.configHash === batch.configHash && Array.isArray(m.attachments)
    && m.attachments.length === mail.attachments.length
    && new Set(m.attachments.map(a => a.name)).size === m.attachments.length
    && mail.attachments.every(a => m.attachments.some(b => b.name === a.name && b.sha256 === a.sha256
      && b.bytes === a.bytes && b.inline === false)), 'SAME_DAY_CONTENT_OR_IDENTITY_MISMATCH');
  return m.id;
}

export async function mailGate(action, request) {
  need(['daily','phone_awards'].includes(request.type), 'MAIL_TYPE_INVALID');
  const batch = await verifySealedBatch(request.manifestPath);
  const scope = hash(`${batch.reportDate}|${request.type}`), root = path.resolve(request.ledgerRoot);
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const lock = path.join(root, scope + '.lock'), receiptFile = path.join(root, scope + '.json');
  const save = async value => {
    const temp = receiptFile + '.' + randomUUID();
    const handle = await fs.open(temp, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); } finally { await handle.close(); }
    await fs.rename(temp, receiptFile);
  };
  const readPrior = async () => {
    try { return JSON.parse(await fs.readFile(receiptFile, 'utf8')); }
    catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  };
  if (action === 'reserve') {
    await fs.mkdir(lock, { mode: 0o700 }); // no timeout: a crashed reservation must be reconciled
    let reserved = false;
    try {
      const prior = await readPrior();
      const existing = exactMail(batch, request.type, request.sentEvidence);
      if (existing !== 'NOT_FOUND') {
        await save({ status: 'VERIFIED', batchDigest: batch.digest, messageId: existing, sendCount: prior?.sendCount || 0 });
        return { status: 'ALREADY_PRESENT', messageId: existing, sendAllowed: false };
      }
      need(!prior, 'MAIL_ALREADY_ATTEMPTED');
      // Reverify just before releasing the sealed connector payload.
      await verifySealedBatch(request.manifestPath);
      const token = randomUUID();
      await save({ status: 'IN_FLIGHT', batchDigest: batch.digest, token, sendCount: 1 });
      reserved = true;
      const mail = batch.mails[request.type];
      return { status: 'RESERVED', token, sendAllowed: true, batchDigest: batch.digest,
        recipient: 'lian852456@gmail.com', subject: mail.subject, body_path: mail.body_path,
        attachment_files: mail.attachments.map(a => a.path) };
    } finally { if (!reserved) await fs.rmdir(lock); }
  }
  need(['authorize','complete'].includes(action), 'MAIL_GATE_ACTION_INVALID');
  const prior = await readPrior();
  need(prior?.status === 'IN_FLIGHT' && prior.token === request.token && prior.batchDigest === batch.digest, 'RESERVATION_TOKEN_MISMATCH');
  if (action === 'authorize') {
    need(!prior.sendPermitIssued, 'SEND_PERMIT_ALREADY_ISSUED');
    // Lock + durable one-shot permit prevent a second connector invocation after timeout/crash.
    await verifySealedBatch(request.manifestPath);
    const mail = batch.mails[request.type];
    const text_content = await fs.readFile(mail.body_path, 'utf8');
    await fs.writeFile(path.join(lock,'permit'),new Date().toISOString(),{flag:'wx',mode:0o600});
    await save({...prior, sendPermitIssued:true, permitIssuedAt:new Date().toISOString()});
    return {status:'AUTHORIZED_ONCE',sendAllowed:true,token:prior.token,
      to:[{email:'lian852456@gmail.com'}],subject:mail.subject,text_content,
      attachment_files:mail.attachments.map(a=>a.path),save_to_sent_items:true};
  }
  const messageId = exactMail(batch, request.type, request.sentEvidence);
  need(messageId !== 'NOT_FOUND', 'POST_SEND_NOT_FOUND_OR_UNCERTAIN');
  await save({ status: 'VERIFIED', batchDigest: batch.digest, messageId, sendCount: 1 });
  await fs.unlink(path.join(lock,'permit')).catch(e=>{if(e.code!=='ENOENT')throw e;});
  await fs.rmdir(lock);
  return { status: 'VERIFIED', messageId, sendAllowed: false };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const request = JSON.parse(await fs.readFile(process.argv[3], 'utf8'));
    console.log(JSON.stringify(await mailGate(process.argv[2], request), null, 2));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
