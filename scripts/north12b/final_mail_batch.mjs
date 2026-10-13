import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const FINAL_MAIL_EFFECTIVE_DATE = '2026-10-13';
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sha = value => /^[a-f0-9]{64}$/.test(String(value));
const requireValue = (ok, code) => { if (!ok) throw new Error(code); };
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));

export function dailyBaseNames(date) {
  return [`TWM_North12B_Daily_Report_${date}.xlsx`, `TWM_North12B_Closure_Rate_${date}.xlsx`,
    ...['Main_KPI', 'Addon_Score', 'Insurance', 'QIS', 'Closure_Rate', 'Daily_Targets',
      'Personal_Manager', 'Personal_Deputy', 'Personal_Sales', 'Sales_Overview'].map(name => `TWM_North12B_${name}_${date}.png`)];
}
export const awardNames = Object.freeze(['Y26重點台獎手機_台獎更新.xlsx',
  '01-08-03_手機競賽日報_店點達成率_台獎機款更新.xlsx', '01-08-04_手機競賽日報_個人達成率_個人台獎更新.xlsx',
  '台獎機款.png', '個人台獎.png', '台獎機款_店點進度點名.md']);

// Identity excludes paths/run IDs: moving the same cloud bytes cannot grant a second send.
export function sourceIdentity(batch) {
  requireValue(batch?.report_run_date && batch?.data_cutoff_date, 'SOURCE_BATCH_MISSING');
  return { reportDate: batch.report_run_date, cutoffDate: batch.data_cutoff_date,
    sources: [batch.kpi, batch.awards?.store, batch.awards?.person].map(entry => {
      requireValue(entry?.provider === 'google-drive-cloud' && entry.driveItemId && sha(entry.sha256), 'SOURCE_IDENTITY_INCOMPLETE');
      return { provider: entry.provider, id: entry.driveItemId, sha256: entry.sha256 };
    }) };
}

export function validateArtifactLists(daily, awards, date) {
  const entries = daily?.requiredAttachments;
  const a = awards?.artifacts;
  requireValue(daily?.reportDate === date && awards?.reportDate === date, 'ARTIFACT_DATE_MISMATCH');
  requireValue(Array.isArray(entries) && entries.length === daily.requiredCount, 'DAILY_MANIFEST_INCOMPLETE');
  requireValue(Array.isArray(a) && a.length === 6 && awards.requiredCount === 6, 'AWARDS_MANIFEST_INCOMPLETE');
  const names = entries.map(e => e.fileName);
  requireValue(new Set(names).size === names.length, 'DUPLICATE_ATTACHMENT_NAME');
  const goodspeed = names.filter(n => new RegExp(`^TWM_North12B_Goodspeed_Detail_${date}(?:_p[1-9]\\d*)?\\.png$`).test(n));
  const baseGood = `TWM_North12B_Goodspeed_Detail_${date}.png`;
  requireValue(goodspeed.length === 1 && goodspeed[0] === baseGood
    || goodspeed.length > 1 && goodspeed.every((_, i) => goodspeed.includes(baseGood.replace('.png', `_p${i + 1}.png`))), 'GOODSPEED_PAGE_SET_MISMATCH');
  const expected = [...dailyBaseNames(date), ...goodspeed];
  requireValue(goodspeed.length > 0 && names.length === expected.length && expected.every(n => names.includes(n)), 'FINAL_DAILY_ATTACHMENT_SET_MISMATCH');
  requireValue(new Set(a.map(e => e.filename)).size === 6 && awardNames.every(n => a.some(e => e.filename === n)), 'FINAL_AWARDS_ATTACHMENT_SET_MISMATCH');
  for (const e of [...entries, ...a]) {
    const name = e.fileName || e.filename;
    requireValue(typeof name === 'string' && path.basename(name) === name && Number.isInteger(e.bytes) && e.bytes > 0 && e.bytes < 3 * 1024 * 1024 && sha(e.sha256), 'ARTIFACT_METADATA_INVALID');
  }
  return { daily: entries.map(e => ({ name: e.fileName, bytes: e.bytes, sha256: e.sha256 })),
    phone_awards: a.map(e => ({ name: e.filename, bytes: e.bytes, sha256: e.sha256 })) };
}

function validHeader(name, data) {
  if (name.endsWith('.png')) return data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (name.endsWith('.xlsx')) return data.length > 4 && data[0] === 80 && data[1] === 75;
  return name.endsWith('.md') && data.length > 0;
}

export async function sealFinalMailBatch({ input, payload, sourceBatch, configHash, sealRoot }) {
  const date = sourceBatch.report_run_date, identity = sourceIdentity(sourceBatch);
  requireValue(input?.reportDate === date && input.runId === payload.run_id && input.configHash === configHash, 'FINAL_INPUT_IDENTITY_MISMATCH');
  const [daily, awards, build, visual] = await Promise.all([
    json(input.dailyManifestPath), json(input.awardsManifestPath), json(input.buildReceiptPath), json(input.visualReceiptPath)]);
  const lists = validateArtifactLists(daily, awards, date);
  requireValue(daily.sourceContractVersion === 'north12b-source-contract/v2', 'SOURCE_CONTRACT_NOT_VERIFIED');
  const contractBytes = await fs.readFile(input.sourceContractReceiptPath), contract = JSON.parse(contractBytes);
  requireValue(hash(contractBytes) === daily.sourceContractReceiptSha256 && contract.version === daily.sourceContractVersion
    && contract.status === 'pass' && contract.reportDate === date && contract.sourceSha256 === identity.sources[0].sha256
    && contract.dataCutoffDate === identity.cutoffDate && contract.managerBasis === 'personal-employee-kpi'
    && contract.addonRankBasis === 'source-company-rank' && lists.daily.every(e => contract.artifactHashes?.[e.name] === e.sha256), 'SOURCE_CONTRACT_RECEIPT_MISMATCH');
  requireValue(daily.sourceSha256 === identity.sources[0].sha256 && awards.data_as_of_date === identity.cutoffDate
    && awards.configVersion === payload.award_config.configVersion, 'FINAL_MANIFEST_SOURCE_MISMATCH');
  requireValue(build.report_date === date && build.source_sha256 === identity.sources[0].sha256
    && build.batch_id === input.artifactRunId && build.status === 'artifacts_ready_pending_visual_review'
    && ['source_parse','workbook_build','v4_layout','png_render','goodspeed_render','goodspeed_verify','value_verify']
      .every(name => build.stages?.some(s => s.name === name && s.status === 'pass')), 'FINAL_BUILD_NOT_COMPLETE');
  requireValue(visual.status === 'pass' && visual.runId === input.runId && visual.artifactRunId === input.artifactRunId
    && visual.sourceSha256 === identity.sources[0].sha256 && visual.configHash === configHash, 'VISUAL_REVIEW_NOT_FINAL');
  const all = [...lists.daily, ...lists.phone_awards];
  requireValue(Array.isArray(visual.artifacts) && visual.artifacts.length === all.length
    && new Set(visual.artifacts.map(e => e.name)).size === all.length
    && all.every(e => visual.artifacts.some(v => v.name === e.name && v.sha256 === e.sha256)), 'VISUAL_ARTIFACT_HASH_MISMATCH');
  const root = path.resolve(sealRoot);
  requireValue(/^[A-Za-z0-9._-]+$/.test(input.runId), 'RUN_ID_INVALID');
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const finalDir = path.join(root, input.runId), temp = await fs.mkdtemp(path.join(root, '.sealing-'));
  let promoted = false;
  try {
    const mails = {};
    for (const type of ['daily', 'phone_awards']) {
      requireValue(payload[type]?.status === 'ready' && payload[type].subject, 'MAIL_PAYLOAD_NOT_READY');
      const dir = path.join(temp, type); await fs.mkdir(dir, { mode: 0o700 });
      const origin = type === 'daily' ? input.dailyDir : input.awardsDir;
      const files = [];
      for (const entry of lists[type]) {
        const data = await fs.readFile(path.join(origin, entry.name));
        requireValue(data.length === entry.bytes && hash(data) === entry.sha256 && validHeader(entry.name, data), 'ARTIFACT_BYTES_CHANGED');
        await fs.writeFile(path.join(dir, entry.name), data, { mode: 0o400, flag: 'wx' });
        files.push({ ...entry, path: path.join(finalDir, type, entry.name) });
      }
      const body = await fs.readFile(payload[type].body_path);
      await fs.writeFile(path.join(dir, 'body.txt'), body, { mode: 0o400, flag: 'wx' });
      mails[type] = { subject: payload[type].subject, body_path: path.join(finalDir, type, 'body.txt'), bodyHash: hash(body), attachments: files };
    }
    const sealed = { schema: 'north12b-final-mail-batch/v1', reportDate: date, runId: input.runId,
      artifactRunId: input.artifactRunId, sourceIdentity: identity, configHash, mails };
    sealed.digest = hash(JSON.stringify(sealed));
    await fs.writeFile(path.join(temp, 'sealed.json'), JSON.stringify(sealed, null, 2), { mode: 0o400, flag: 'wx' });
    // Do not replace an existing batch or its receipts, even on a rerun.
    await fs.mkdir(finalDir, { mode: 0o700 });
    promoted = true;
    for (const entry of await fs.readdir(temp)) await fs.rename(path.join(temp, entry), path.join(finalDir, entry));
    return { ...sealed, manifestPath: path.join(finalDir, 'sealed.json') };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
    // A failed promotion stays blocked; no automatic reopening of its identity.
    if (promoted) await fs.chmod(finalDir, 0o500);
  }
}

export async function verifySealedBatch(file) {
  const batch = await json(file), { digest, ...content } = batch;
  requireValue(batch.schema === 'north12b-final-mail-batch/v1' && hash(JSON.stringify(content)) === digest, 'SEALED_MANIFEST_CHANGED');
  requireValue(sha(batch.configHash) && batch.sourceIdentity?.reportDate === batch.reportDate
    && batch.sourceIdentity.sources?.length === 3 && batch.sourceIdentity.sources.every(s => s.id && sha(s.sha256)), 'SEALED_SOURCE_IDENTITY_INVALID');
  validateArtifactLists({ reportDate: batch.reportDate, requiredCount: batch.mails.daily.attachments.length,
    requiredAttachments: batch.mails.daily.attachments.map(a => ({...a, fileName:a.name})) },
    { reportDate: batch.reportDate, requiredCount: batch.mails.phone_awards.attachments.length,
      artifacts: batch.mails.phone_awards.attachments.map(a => ({...a, filename:a.name})) }, batch.reportDate);
  const root = path.dirname(path.resolve(file));
  for (const mail of Object.values(batch.mails)) {
    requireValue(path.resolve(mail.body_path).startsWith(root + path.sep), 'SEALED_PATH_OUTSIDE_BATCH');
    requireValue(hash(await fs.readFile(mail.body_path)) === mail.bodyHash, 'SEALED_BODY_CHANGED');
    for (const e of mail.attachments) {
      requireValue(path.resolve(e.path).startsWith(root + path.sep), 'SEALED_PATH_OUTSIDE_BATCH');
      const bytes = await fs.readFile(e.path);
      requireValue(bytes.length === e.bytes && hash(bytes) === e.sha256 && validHeader(e.name, bytes), 'SEALED_ATTACHMENT_CHANGED');
    }
  }
  return batch;
}

// The direct Outlook connector host must use this transaction before invoking send.
// A persisted in-flight receipt never expires into automatic resend, including a crash.
export async function dispatchSealedMail({ manifestPath, type, ledgerRoot, reconcile, send, readback }) {
  requireValue(['daily','phone_awards'].includes(type), 'MAIL_TYPE_INVALID');
  let batch = await verifySealedBatch(manifestPath);
  const scope = hash(`${batch.reportDate}|${type}`), mail = batch.mails[type];
  await fs.mkdir(ledgerRoot, { recursive: true, mode: 0o700 });
  const lock = path.join(ledgerRoot, scope + '.lock'), receiptFile = path.join(ledgerRoot, scope + '.json');
  await fs.mkdir(lock, { mode: 0o700 }); // atomic: all runs, versions and sources on this date share a lock
  try {
    const prior = await json(receiptFile).catch(e => { if (e.code === 'ENOENT') return null; throw e; });
    const existing = await reconcile({ batch, type, mail });
    if (existing?.status === 'EXACT' && existing.uniqueCount === 1 && existing.batchDigest === batch.digest
        && existing.messageId && existing.attachmentsVerified === true && existing.bodyVerified === true) {
      const receipt = { status: 'VERIFIED', batchDigest: batch.digest, messageId: existing.messageId, sendCount: prior?.sendCount || 0 };
      await atomicReceipt(receiptFile, receipt); return receipt;
    }
    requireValue(existing?.status === 'NOT_FOUND' && existing.uniqueCount === 0, 'SAME_DAY_MAIL_BLOCKED_OR_UNCERTAIN');
    requireValue(!prior, 'MAIL_IN_FLIGHT_OR_ALREADY_ATTEMPTED');
    // Persist before invoking external send. An uncertain send stays non-retryable.
    await atomicReceipt(receiptFile, { status: 'IN_FLIGHT', batchDigest: batch.digest, sendCount: 1 });
    batch = await verifySealedBatch(manifestPath); // reread immediately before sender receives immutable paths
    const result = await send({ batch, type, mail: batch.mails[type] });
    const verified = await readback({ batch, type, result });
    requireValue(verified?.status === 'EXACT' && verified.uniqueCount === 1 && verified.batchDigest === batch.digest
      && verified.messageId && verified.attachmentsVerified === true && verified.bodyVerified === true, 'POST_SEND_NOT_VERIFIED');
    const receipt = { status: 'VERIFIED', batchDigest: batch.digest, messageId: verified.messageId, sendCount: 1 };
    await atomicReceipt(receiptFile, receipt); return receipt;
  } finally { await fs.rmdir(lock); }
}

async function atomicReceipt(file, value) {
  const temp = file + '.' + randomUUID();
  const handle = await fs.open(temp, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(temp, file);
}
