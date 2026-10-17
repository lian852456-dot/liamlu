import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  awardNames,
  dailyBaseNames,
  dispatchSealedMail,
  hash,
  sealFinalMailBatch,
  verifySealedBatch,
} from '../scripts/north12b/final_mail_batch.mjs';

const DATE = '2026-10-13';
const CUTOFF = '2026-10-12';
const RUN_ID = 'b2-20261013-final-test';
const ARTIFACT_RUN = 'artifact-run-test';
const CONFIG_HASH = 'a'.repeat(64);
const SOURCE_SHA = 'b'.repeat(64);
const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const XLSX_HEADER = Buffer.from([80, 75, 3, 4, 0]);

async function tempRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'final-mail-batch-test-'));
  t.after(async () => {
    const makeWritable = async dir => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const child = path.join(dir, entry.name);
        if (entry.isDirectory()) { await fs.chmod(child, 0o700).catch(() => {}); await makeWritable(child); }
        else await fs.chmod(child, 0o600).catch(() => {});
      }
      await fs.chmod(dir, 0o700).catch(() => {});
    };
    await makeWritable(root);
    await fs.rm(root, { recursive: true, force: true });
  });
  return root;
}

function sourceBatch() {
  const source = (id, sha256) => ({ provider: 'google-drive-cloud', driveItemId: id, sha256 });
  return {
    schema_version: 'north12b-source-batch/v1',
    report_run_date: DATE,
    data_cutoff_date: CUTOFF,
    kpi: source('synthetic-kpi-id', SOURCE_SHA),
    awards: {
      store: source('synthetic-store-id', 'c'.repeat(64)),
      person: source('synthetic-person-id', 'd'.repeat(64)),
    },
  };
}

function expectedBuildStages() {
  return ['source_parse', 'workbook_build', 'v4_layout', 'png_render', 'goodspeed_render', 'goodspeed_verify', 'value_verify']
    .map(name => ({ name, status: 'pass' }));
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

async function makeFixture(t, {
  goodspeedPages = ['TWM_North12B_Goodspeed_Detail_2026-10-13.png'],
  legacyNine = false,
  duplicateName = false,
  omitName = null,
  badSha = false,
  dailyDate = DATE,
  awardsDate = DATE,
  buildStatus = 'artifacts_ready_pending_visual_review',
  failedBuildStage = null,
  visualStatus = 'pass',
  visualHashChange = false,
} = {}) {
  const root = await tempRoot(t);
  const dailyDir = path.join(root, 'daily');
  const awardsDir = path.join(root, 'awards');
  const receiptsDir = path.join(root, 'receipts');
  const bodyDir = path.join(root, 'bodies');
  await Promise.all([dailyDir, awardsDir, receiptsDir, bodyDir].map(dir => fs.mkdir(dir, { recursive: true })));

  const dailyNames = [...dailyBaseNames(DATE), ...goodspeedPages];
  let dailyEntries = [];
  for (const name of dailyNames) {
    const data = name.endsWith('.png') ? Buffer.concat([PNG_HEADER, Buffer.from(`synthetic:${name}`)])
      : Buffer.concat([XLSX_HEADER, Buffer.from(`synthetic:${name}`)]);
    await fs.writeFile(path.join(dailyDir, name), data);
    dailyEntries.push({ fileName: name, bytes: data.length, sha256: hash(data) });
  }
  if (legacyNine) dailyEntries = dailyEntries.slice(0, 9);
  if (omitName) dailyEntries = dailyEntries.filter(entry => entry.fileName !== omitName);
  if (duplicateName && dailyEntries.length) dailyEntries.push({ ...dailyEntries[0] });
  if (badSha && dailyEntries.length) dailyEntries[0] = { ...dailyEntries[0], sha256: 'e'.repeat(64) };

  const awardEntries = [];
  for (const filename of awardNames) {
    const data = filename.endsWith('.png') ? Buffer.concat([PNG_HEADER, Buffer.from(`synthetic:${filename}`)])
      : filename.endsWith('.xlsx') ? Buffer.concat([XLSX_HEADER, Buffer.from(`synthetic:${filename}`)])
        : Buffer.from(`# synthetic ${filename}\n`);
    await fs.writeFile(path.join(awardsDir, filename), data);
    awardEntries.push({ filename, bytes: data.length, sha256: hash(data) });
  }

  const dailyManifestPath = path.join(receiptsDir, 'daily.json');
  const awardsManifestPath = path.join(receiptsDir, 'awards.json');
  const buildReceiptPath = path.join(receiptsDir, 'build.json');
  const visualReceiptPath = path.join(receiptsDir, 'visual.json');
  const sourceContractReceiptPath = path.join(receiptsDir, 'source-contract.json');
  const sourceContract = { status:'pass',version:'north12b-source-contract/v2',reportDate:DATE,sourceSha256:SOURCE_SHA,
    dataCutoffDate:CUTOFF,managerBasis:'personal-employee-kpi',addonRankBasis:'source-company-rank',
    artifactHashes:Object.fromEntries(dailyEntries.map(e=>[e.fileName,e.sha256])) };
  const contractBytes=JSON.stringify(sourceContract);
  await fs.writeFile(sourceContractReceiptPath,contractBytes);
  const dailyBodyPath = path.join(bodyDir, 'daily.txt');
  const awardsBodyPath = path.join(bodyDir, 'awards.txt');
  await Promise.all([
    writeJson(dailyManifestPath, {
      sourceContractVersion: 'north12b-source-contract/v2',
      sourceContractReceiptSha256: hash(contractBytes),
      reportDate: dailyDate,
      requiredCount: dailyEntries.length,
      requiredAttachments: dailyEntries,
      sourceSha256: SOURCE_SHA,
    }),
    writeJson(awardsManifestPath, {
      reportDate: awardsDate,
      data_as_of_date: CUTOFF,
      configVersion: '2026-10-v4',
      configHash: CONFIG_HASH,
      sourceHashes: {store:'c'.repeat(64),person:'d'.repeat(64)},
      requiredCount: 6,
      artifacts: awardEntries,
    }),
    writeJson(buildReceiptPath, {
      report_date: DATE,
      source_sha256: SOURCE_SHA,
      batch_id: ARTIFACT_RUN,
      status: buildStatus,
      stages: expectedBuildStages().map(stage => failedBuildStage === stage.name ? { ...stage, status: 'fail' } : stage),
    }),
    fs.writeFile(dailyBodyPath, 'Synthetic daily mail body\n'),
    fs.writeFile(awardsBodyPath, 'Synthetic award mail body\n'),
  ]);
  const visualArtifacts = [...dailyEntries.map(e => ({ name: e.fileName, sha256: e.sha256 })),
    ...awardEntries.map(e => ({ name: e.filename, sha256: e.sha256 }))];
  if (visualHashChange && visualArtifacts.length) visualArtifacts[0] = { ...visualArtifacts[0], sha256: 'f'.repeat(64) };
  await writeJson(visualReceiptPath, {
    status: visualStatus,
    runId: RUN_ID,
    artifactRunId: ARTIFACT_RUN,
    sourceSha256: SOURCE_SHA,
    configHash: CONFIG_HASH,
    artifacts: visualArtifacts,
  });
  const payload = {
    run_id: RUN_ID,
    award_config: { configVersion: '2026-10-v4' },
    daily: { status: 'ready', subject: `Daily ${DATE}`, body_path: dailyBodyPath },
    phone_awards: { status: 'ready', subject: `Awards ${DATE}`, body_path: awardsBodyPath },
  };
  const input = {
    reportDate: DATE,
    runId: RUN_ID,
    artifactRunId: ARTIFACT_RUN,
    configHash: CONFIG_HASH,
    dailyManifestPath,
    awardsManifestPath,
    buildReceiptPath,
    visualReceiptPath,
    sourceContractReceiptPath,
    dailyDir,
    awardsDir,
  };
  return { root, input, payload, sourceBatch: sourceBatch(), configHash: CONFIG_HASH,
    sealRoot: path.join(root, 'sealed'), dailyEntries, awardEntries };
}

async function seal(fixture) {
  return sealFinalMailBatch(fixture);
}

test('refuses legacy 9-item daily batch and accepts the complete 13+6 batch', async t => {
  const legacy = await makeFixture(t, { legacyNine: true });
  await assert.rejects(seal(legacy), /DAILY_MANIFEST_INCOMPLETE|FINAL_DAILY_ATTACHMENT_SET_MISMATCH|GOODSpeed_PAGE_SET_MISMATCH/i);

  const current = await makeFixture(t);
  const result = await seal(current);
  assert.equal(result.mails.daily.attachments.length, 13);
  assert.equal(result.mails.phone_awards.attachments.length, 6);
  assert.equal((await verifySealedBatch(result.manifestPath)).digest, result.digest);
});

test('accepts dynamically named multi-page Goodspeed Detail _p1 and _p2 attachments', async t => {
  const fixture = await makeFixture(t, { goodspeedPages: [
    'TWM_North12B_Goodspeed_Detail_2026-10-13_p1.png',
    'TWM_North12B_Goodspeed_Detail_2026-10-13_p2.png',
  ] });
  const sealed = await seal(fixture);
  assert.equal(sealed.mails.daily.attachments.length, 14);
  assert.deepEqual(sealed.mails.daily.attachments.slice(-2).map(e => e.name), [
    'TWM_North12B_Goodspeed_Detail_2026-10-13_p1.png',
    'TWM_North12B_Goodspeed_Detail_2026-10-13_p2.png',
  ]);
});

test('same-date awards cannot inherit a config version while using different source or config bytes',async t=>{
  for(const change of [{configHash:'f'.repeat(64)},{sourceHashes:{store:'f'.repeat(64),person:'d'.repeat(64)}}]){
    const fixture=await makeFixture(t),file=fixture.input.awardsManifestPath;
    const manifest=JSON.parse(await fs.readFile(file,'utf8'));
    await writeJson(file,{...manifest,...change});
    await assert.rejects(seal(fixture),/FINAL_MANIFEST_SOURCE_MISMATCH/);
  }
});

test('rejects missing, duplicate, mismatched-date, and incorrect-SHA artifacts', async t => {
  const cases = [
    [{ omitName: dailyBaseNames(DATE)[0] }, /DAILY_MANIFEST_INCOMPLETE|FINAL_DAILY_ATTACHMENT_SET_MISMATCH/],
    [{ duplicateName: true }, /DUPLICATE_ATTACHMENT_NAME/],
    [{ dailyDate: '2026-10-12' }, /ARTIFACT_DATE_MISMATCH/],
    [{ awardsDate: '2026-10-12' }, /ARTIFACT_DATE_MISMATCH/],
    [{ badSha: true }, /ARTIFACT_BYTES_CHANGED/],
  ];
  for (const [options, expected] of cases) {
    const fixture = await makeFixture(t, options);
    await assert.rejects(seal(fixture), expected);
  }
});

test('rejects incomplete build and non-final or visually mismatched receipts', async t => {
  const incomplete = await makeFixture(t, { buildStatus: 'building' });
  await assert.rejects(seal(incomplete), /FINAL_BUILD_NOT_COMPLETE/);
  const failedStage = await makeFixture(t, { failedBuildStage: 'goodspeed_verify' });
  await assert.rejects(seal(failedStage), /FINAL_BUILD_NOT_COMPLETE/);
  const reviewPending = await makeFixture(t, { visualStatus: 'pending' });
  await assert.rejects(seal(reviewPending), /VISUAL_REVIEW_NOT_FINAL/);
  const visualDifferent = await makeFixture(t, { visualHashChange: true });
  await assert.rejects(seal(visualDifferent), /VISUAL_ARTIFACT_HASH_MISMATCH/);
});

test('complete attachment list cannot replace semantic source validation', async t => {
  const fixture = await makeFixture(t);
  const file = fixture.input.dailyManifestPath;
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'));
  delete manifest.sourceContractVersion;
  await fs.writeFile(file, JSON.stringify(manifest));
  await assert.rejects(seal(fixture), /SOURCE_CONTRACT_NOT_VERIFIED/);
});

test('sealed batch is a fixed copy of body and attachments despite source mutation', async t => {
  const fixture = await makeFixture(t);
  const original = await seal(fixture);
  const firstAttachment = original.mails.daily.attachments[0];
  const sealedBytes = await fs.readFile(firstAttachment.path);
  await fs.writeFile(path.join(fixture.input.dailyDir, firstAttachment.name), Buffer.from('changed mutable source'));
  await fs.writeFile(fixture.payload.daily.body_path, 'changed mutable body');
  assert.deepEqual(await fs.readFile(firstAttachment.path), sealedBytes);
  assert.equal((await verifySealedBatch(original.manifestPath)).mails.daily.bodyHash, original.mails.daily.bodyHash);
});

test('rejects sealed manifest/body/attachment tampering', async t => {
  const fixture = await makeFixture(t);
  const sealed = await seal(fixture);
  await fs.chmod(path.dirname(sealed.manifestPath), 0o700);
  const manifest = JSON.parse(await fs.readFile(sealed.manifestPath, 'utf8'));
  manifest.mails.daily.subject = 'tampered';
  await fs.chmod(sealed.manifestPath, 0o600);
  await fs.writeFile(sealed.manifestPath, JSON.stringify(manifest));
  await assert.rejects(verifySealedBatch(sealed.manifestPath), /SEALED_MANIFEST_CHANGED/);

  const fixture2 = await makeFixture(t);
  const sealed2 = await seal(fixture2);
  const bodyPath = sealed2.mails.daily.body_path;
  await fs.chmod(path.dirname(bodyPath), 0o700);
  await fs.chmod(bodyPath, 0o600);
  await fs.writeFile(bodyPath, 'tampered sealed body');
  await assert.rejects(verifySealedBatch(sealed2.manifestPath), /SEALED_BODY_CHANGED/);

  const fixture3 = await makeFixture(t);
  const sealed3 = await seal(fixture3);
  const attachment = sealed3.mails.daily.attachments[0];
  await fs.chmod(path.dirname(attachment.path), 0o700);
  await fs.chmod(attachment.path, 0o600);
  await fs.writeFile(attachment.path, 'tampered sealed attachment');
  await assert.rejects(verifySealedBatch(sealed3.manifestPath), /SEALED_ATTACHMENT_CHANGED/);
});

function exactMatch(batch, messageId = 'synthetic-message') {
  return { status: 'EXACT', uniqueCount: 1, batchDigest: batch.digest, messageId,
    attachmentsVerified: true, bodyVerified: true };
}

test('same-scope concurrent dispatch allows at most one sender invocation', async t => {
  const fixture = await makeFixture(t);
  const sealed = await seal(fixture);
  const ledgerRoot = path.join(fixture.root, 'ledger');
  let sendCount = 0;
  let enteredResolve;
  const entered = new Promise(resolve => { enteredResolve = resolve; });
  let releaseResolve;
  const release = new Promise(resolve => { releaseResolve = resolve; });
  const first = dispatchSealedMail({ manifestPath: sealed.manifestPath, type: 'daily', ledgerRoot,
    reconcile: async () => ({ status: 'NOT_FOUND', uniqueCount: 0 }),
    send: async () => { sendCount += 1; enteredResolve(); await release; return { messageId: 'sent-once' }; },
    readback: async ({ batch }) => exactMatch(batch, 'sent-once'),
  });
  await entered;
  const second = dispatchSealedMail({ manifestPath: sealed.manifestPath, type: 'daily', ledgerRoot,
    reconcile: async () => ({ status: 'NOT_FOUND', uniqueCount: 0 }),
    send: async () => { sendCount += 1; return { messageId: 'duplicate' }; },
    readback: async ({ batch }) => exactMatch(batch, 'duplicate'),
  });
  await assert.rejects(second);
  releaseResolve();
  const receipt = await first;
  assert.equal(receipt.status, 'VERIFIED');
  assert.equal(sendCount, 1);
});

test('crash after send or uncertain readback remains non-retryable', async t => {
  for (const failAt of ['send', 'readback']) {
    const fixture = await makeFixture(t);
    const sealed = await seal(fixture);
    const ledgerRoot = path.join(fixture.root, 'ledger');
    let sendCount = 0;
    const common = {
      manifestPath: sealed.manifestPath,
      type: 'daily',
      ledgerRoot,
      reconcile: async () => ({ status: 'NOT_FOUND', uniqueCount: 0 }),
      send: async () => { sendCount += 1; if (failAt === 'send') throw new Error('synthetic send crash'); return {}; },
      readback: async () => { if (failAt === 'readback') throw new Error('synthetic uncertain readback'); return {}; },
    };
    await assert.rejects(dispatchSealedMail(common));
    await assert.rejects(dispatchSealedMail(common), /MAIL_IN_FLIGHT_OR_ALREADY_ATTEMPTED/);
    assert.equal(sendCount, 1);
  }
});

test('exact existing mail skips send; same-day conflicting existing mail blocks', async t => {
  const fixture = await makeFixture(t);
  const sealed = await seal(fixture);
  let sendCount = 0;
  const verified = await dispatchSealedMail({ manifestPath: sealed.manifestPath, type: 'phone_awards',
    ledgerRoot: path.join(fixture.root, 'ledger'),
    reconcile: async ({ batch }) => exactMatch(batch, 'existing-exact'),
    send: async () => { sendCount += 1; return {}; },
    readback: async () => ({}),
  });
  assert.equal(verified.status, 'VERIFIED');
  assert.equal(verified.messageId, 'existing-exact');
  assert.equal(verified.sendCount, 0);
  assert.equal(sendCount, 0);

  const fixture2 = await makeFixture(t);
  const sealed2 = await seal(fixture2);
  await assert.rejects(dispatchSealedMail({ manifestPath: sealed2.manifestPath, type: 'phone_awards',
    ledgerRoot: path.join(fixture2.root, 'ledger'),
    reconcile: async ({ batch }) => ({ ...exactMatch(batch), batchDigest: '0'.repeat(64) }),
    send: async () => { sendCount += 1; return {}; },
    readback: async () => ({}),
  }), /SAME_DAY_MAIL_BLOCKED_OR_UNCERTAIN/);
  assert.equal(sendCount, 0);
});
