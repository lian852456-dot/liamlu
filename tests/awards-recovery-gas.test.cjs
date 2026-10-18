const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');

const code = fs.readFileSync(path.join(__dirname, '..', 'gas/Code.gs'), 'utf8');
const hash = value => createHash('md5').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64');
const approved = '36e4f4245bf3f3b67a1dba6137aa6c29ea5390f7f214d91a91dc40fa2604ef51';
const names = ['ZFold8Ultra/ZFold8/ZFlip8','Pixel10a','Pixel11Pro/11ProXL/11ProFold','S26Ultra','Pixel11','S26/S26+','Reno16F','A57','V80Lite','A6x6G/128G/A7Pro'];

function functionSource(name) {
  const start = code.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, name);
  let depth = 0;
  for (let i = code.indexOf('{', start); i < code.length; i += 1) {
    if (code[i] === '{') depth += 1;
    if (code[i] === '}' && --depth === 0) return code.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}
const functions = [
  'privateDashboardSnapshotWriteLocked_', 'privateDashboardValidateAwardsRecovery_',
  'privateDashboardAwardsProtectedProjection_', 'privateDashboardAwardsCompareAndSwap_',
  'privateDashboardRollbackAwardsWrite_', 'privateDashboardValidateAwardsComponent_',
  'privateDashboardPublishAwardsComponent', 'privateDashboardPublishKpiComponent',
  'privateDashboardPublish', 'privateDashboardSnapshot', 'privateDashboardAdminSnapshotStatus',
];

function fixture() {
  const kpiBattle = {
    report_date: '2026-10-17', data_as_of_date: '2026-10-17', report_run_date: '2026-10-18',
    processing_run_id: 'north12b-20261018-1b9ffc3acfe9', kpi_run_id: 'north12b-20261018-1b9ffc3acfe9',
    source_metadata: { sha256: '1b9ffc3acfe9c1aab40b1954b43b8f078a7b99dd31d299dede7b6324c3d62d07' },
    aggregate: { overall_kpi: 1.098 }, stores: [{ unchanged: true }],
  };
  const run = 'north12b-awards-recovery-20261018-actual';
  const source = (kind, name) => ({
    provider: 'google-drive-cloud', basename: name, canonical_basename: name,
    driveItemId: `actual-${kind}-id`, googleDriveFileId: `actual-${kind}-id`,
    lastModifiedDateTime: '2026-10-18T01:45:00.000Z', size: 1234,
    sha256: (kind === 'store' ? 'b' : 'c').repeat(64), source_data_date: '2026-10-17', run_id: run,
  });
  const awardsBattle = {
    report_date: '2026-10-17', data_as_of_date: '2026-10-17', report_run_date: '2026-10-18',
    processing_run_id: run, config_hash: approved, config_version: '2026-10-v1', phone_items: 10, store_rows: 10,
    overall: { items: names.map(name => ({ name })) },
    stores: Array.from({ length: 9 }, (_, i) => ({ store: `店${i+1}`, items: names.map(name => ({ name })) })),
    source_files: {
      store: source('store', '01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx'),
      person: source('person', '01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx'),
    },
    recovery_context: {
      schema: 'north12b-awards-recovery/v1', recovery_run_id: run,
      parent_kpi_run_id: kpiBattle.processing_run_id,
      parent_kpi_source_sha256: kpiBattle.source_metadata.sha256,
      parent_kpi_payload_hash: hash(kpiBattle), report_run_date: '2026-10-18',
      data_as_of_date: '2026-10-17', award_config_hash: approved,
    },
  };
  const snapshot = {
    schema_version: 3, publishedAt: 'unchanged-old-write-time', kpiBattle,
    awardsBattle: { report_date: '2026-10-16', marker: 'old-awards' },
    components: { kpi: { run_id: kpiBattle.processing_run_id, status: 'fresh' }, awards: { status: 'blocked' }, closure: { unchanged: [1,2,3] } },
    closure: { amount: 91 }, future_component: { preserve: [true, { deep: 'value' }] },
  };
  return { snapshot, kpiBattle, awardsBattle };
}

function harness(snapshot) {
  const state = { text: JSON.stringify(snapshot), writes: 0, lockHeld: false, acquisitions: 0, releases: 0, adminChecks: 0, writeHook: null, lockHook: null };
  const file = {
    getBlob: () => ({ getDataAsString: () => state.text }),
    setContent(text) {
      assert.equal(state.lockHeld, true, 'Drive write must be inside the shared lock');
      state.writes += 1; state.text = text;
      if (state.writeHook) state.writeHook(text, state.writes);
    },
    getId: () => 'same-private-file', getName: () => 'north12b-dashboard-private-latest.json',
    getLastUpdated: () => new Date('2026-10-18T03:00:00Z'),
    getOwner: () => ({ getEmail: () => 'lian852456@gmail.com' }),
    getSharingAccess: () => 'PRIVATE', getSharingPermission: () => 'NONE',
  };
  const context = {
    PRIVATE_DASHBOARD_FILE: 'north12b-dashboard-private-latest.json',
    reportVersionHash_: hash,
    privateDashboardAdminAuthorized: () => { state.adminChecks += 1; },
    privateDashboardLatestSnapshotFile_: () => file,
    privateDashboardFolder: () => ({}),
    privateDashboardNow: () => '2026-10-18T11:10:00+08:00',
    privateDashboardBMeasure_: (_, fn) => fn(),
    reportVersionRecord_: () => {},
    kpiCalcLatestDataFile: () => ({ getBlob: () => ({ getDataAsString: () => '{}' }) }),
    privateDashboardValidateKpiComponent_: incoming => ({ dataDate: incoming.data_as_of_date, sourceFile: '1018.xlsx', runId: incoming.processing_run_id }),
    LockService: { getScriptLock: () => ({
      waitLock(timeout) { assert.equal(timeout, 10000); if (state.lockHook) state.lockHook(); assert.equal(state.lockHeld, false); state.lockHeld = true; state.acquisitions += 1; },
      releaseLock() { assert.equal(state.lockHeld, true); state.lockHeld = false; state.releases += 1; },
    }) },
    Utilities: {
      base64Decode: value => Buffer.from(value, 'base64'),
      newBlob: value => ({ getDataAsString: () => Buffer.isBuffer(value) ? value.toString('utf8') : String(value) }),
      formatDate: () => '2026-10-18T11:10:00+08:00',
    },
  };
  vm.createContext(context);
  functions.forEach(name => vm.runInContext(functionSource(name), context));
  return { context, state, file };
}
function request(snapshot, awardsBattle) {
  return { awardsBattleBase64: encode(awardsBattle), expectedKpiPayloadHash: hash(snapshot.kpiBattle), expectedSnapshotHash: hash(snapshot) };
}

test('recovery validates its real run, current parent hash, dates, approved month and full source pair', () => {
  const f = fixture(); const { context } = harness(f.snapshot);
  assert.equal(context.privateDashboardValidateAwardsComponent_(f.awardsBattle, f.kpiBattle).runId, f.awardsBattle.processing_run_id);
  assert.notEqual(f.awardsBattle.processing_run_id, f.kpiBattle.processing_run_id);
});

for (const [label, mutate] of [
  ['context absent on different run', f => { delete f.awardsBattle.recovery_context; }],
  ['unknown schema', f => { f.awardsBattle.recovery_context.schema = 'made-up'; }],
  ['wrong parent run', f => { f.awardsBattle.recovery_context.parent_kpi_run_id = 'stale'; }],
  ['wrong parent source', f => { f.awardsBattle.recovery_context.parent_kpi_source_sha256 = 'd'.repeat(64); }],
  ['missing actual parent SHA', f => { delete f.kpiBattle.source_metadata.sha256; }],
  ['wrong parent payload', f => { f.awardsBattle.recovery_context.parent_kpi_payload_hash = 'd'.repeat(32); }],
  ['changed parent value', f => { f.kpiBattle.aggregate.overall_kpi = 0; }],
  ['recovery relabelled as the parent run', f => { const parent = f.kpiBattle.processing_run_id; f.awardsBattle.processing_run_id = f.awardsBattle.recovery_context.recovery_run_id = parent; Object.values(f.awardsBattle.source_files).forEach(source => { source.run_id = parent; }); }],
  ['wrong real recovery run', f => { f.awardsBattle.processing_run_id = 'fake-parent-copy'; }],
  ['wrong context recovery run', f => { f.awardsBattle.recovery_context.recovery_run_id = 'fake'; }],
  ['source pair run disagreement', f => { f.awardsBattle.source_files.person.run_id = 'other'; }],
  ['source absent', f => { delete f.awardsBattle.source_files.person; }],
  ['source missing raw SHA', f => { delete f.awardsBattle.source_files.store.sha256; }],
  ['source cutoff stale', f => { f.awardsBattle.source_files.person.source_data_date = '2026-10-16'; }],
  ['context cutoff stale', f => { f.awardsBattle.recovery_context.data_as_of_date = '2026-10-16'; }],
  ['publication day mismatch', f => { f.awardsBattle.report_run_date = '2026-10-17'; }],
  ['context publication day mismatch', f => { f.awardsBattle.recovery_context.report_run_date = '2026-10-17'; }],
  ['invalid calendar publication day', f => { f.kpiBattle.report_run_date = f.awardsBattle.report_run_date = f.awardsBattle.recovery_context.report_run_date = '2026-10-99'; f.awardsBattle.recovery_context.parent_kpi_payload_hash = hash(f.kpiBattle); }],
  ['wrong approved config', f => { f.awardsBattle.recovery_context.award_config_hash = 'd'.repeat(64); }],
  ['wrong payload config hash', f => { f.awardsBattle.config_hash = 'd'.repeat(64); }],
  ['wrong payload config version', f => { f.awardsBattle.config_version = '2026-09-v1'; }],
  ['October stale model', f => { f.awardsBattle.overall.items[0].name = 'last-month'; }],
  ['October stale count', f => { f.awardsBattle.phone_items = 13; }],
  ['wrong month', f => { f.kpiBattle.data_as_of_date = '2026-11-17'; }],
]) {
  test(`recovery rejects ${label} before any write`, () => {
    const f = fixture(); mutate(f); const { context, state } = harness(f.snapshot);
    assert.throws(() => context.privateDashboardPublishAwardsComponent(request(f.snapshot, f.awardsBattle)));
    assert.equal(state.writes, 0); assert.equal(state.lockHeld, false); assert.equal(state.releases, 1);
  });
}

test('same-run legacy component remains accepted without a recovery context', () => {
  const f = fixture(); delete f.awardsBattle.recovery_context;
  f.awardsBattle.processing_run_id = f.kpiBattle.processing_run_id;
  Object.values(f.awardsBattle.source_files).forEach(s => { s.run_id = f.kpiBattle.processing_run_id; });
  const { context } = harness(f.snapshot);
  assert.equal(context.privateDashboardValidateAwardsComponent_(f.awardsBattle, f.kpiBattle).runId, f.kpiBattle.processing_run_id);
});

test('awards publish preserves all unknown and known non-awards values and private file identity', () => {
  const f = fixture(); const original = clone(f.snapshot); const { context, state } = harness(f.snapshot);
  const result = context.privateDashboardPublishAwardsComponent(request(f.snapshot, f.awardsBattle));
  const stored = JSON.parse(state.text);
  assert.deepEqual(stored.kpiBattle, original.kpiBattle);
  assert.deepEqual(stored.components.kpi, original.components.kpi);
  assert.deepEqual(stored.components.closure, original.components.closure);
  assert.deepEqual(stored.closure, original.closure);
  assert.deepEqual(stored.future_component, original.future_component);
  assert.deepEqual(stored.awardsBattle, f.awardsBattle);
  assert.equal(stored.components.awards.run_id, f.awardsBattle.processing_run_id);
  assert.deepEqual(stored.components.awards.recovery_context, f.awardsBattle.recovery_context);
  assert.equal(stored.components.awards.config_version, f.awardsBattle.config_version);
  assert.equal(stored.components.awards.status, 'fresh');
  assert.equal(result.fileId, 'same-private-file');
  assert.equal(result.kpiPayloadHash, hash(original.kpiBattle));
  assert.equal(result.snapshotPayloadHash, hash(stored));
  assert.equal(state.adminChecks, 1); assert.equal(state.acquisitions, 1); assert.equal(state.releases, 1);
  assert.equal(stored._read_integrity, undefined);
});

for (const [label, mutate] of [
  ['missing KPI precondition', r => { delete r.expectedKpiPayloadHash; }],
  ['missing snapshot precondition', r => { delete r.expectedSnapshotHash; }],
  ['stale KPI precondition', r => { r.expectedKpiPayloadHash = 'a'.repeat(32); }],
  ['stale snapshot precondition', r => { r.expectedSnapshotHash = 'b'.repeat(32); }],
]) test(`CAS rejects ${label}`, () => {
  const f = fixture(); const { context, state } = harness(f.snapshot); const r = request(f.snapshot, f.awardsBattle); mutate(r);
  assert.throws(() => context.privateDashboardPublishAwardsComponent(r), /AWARDS_PRECONDITION_FAILED/);
  assert.equal(state.writes, 0); assert.equal(state.releases, 1);
});

test('CAS rereads inside the shared lock after a competing snapshot change', () => {
  const f = fixture(); const { context, state } = harness(f.snapshot); const r = request(f.snapshot, f.awardsBattle);
  state.lockHook = () => { const newer = JSON.parse(state.text); newer.closure.amount = 93; state.text = JSON.stringify(newer); };
  assert.throws(() => context.privateDashboardPublishAwardsComponent(r), /AWARDS_PRECONDITION_FAILED/);
  assert.equal(JSON.parse(state.text).closure.amount, 93); assert.equal(state.writes, 0); assert.equal(state.releases, 1);
});

test('rollback restores only this write while its exact version is still current', () => {
  const f = fixture(); const { context, state } = harness(f.snapshot); const original = clone(f.snapshot);
  state.writeHook = (_, count) => { if (count === 1) throw new Error('injected post-write failure'); };
  assert.throws(() => context.privateDashboardPublishAwardsComponent(request(f.snapshot, f.awardsBattle)), /injected/);
  assert.deepEqual(JSON.parse(state.text), original); assert.equal(state.writes, 2); assert.equal(state.releases, 1);
});

test('rollback never overwrites a concurrent/unknown snapshot version', () => {
  const f = fixture(); const { context, state } = harness(f.snapshot);
  state.writeHook = (text, count) => { if (count === 1) { const newer = JSON.parse(text); newer.future_component.parallel = 'retain'; state.text = JSON.stringify(newer); throw new Error('injected conflicting writer'); } };
  assert.throws(() => context.privateDashboardPublishAwardsComponent(request(f.snapshot, f.awardsBattle)), /injected/);
  assert.equal(JSON.parse(state.text).future_component.parallel, 'retain');
  assert.equal(state.writes, 1); assert.equal(state.releases, 1);
});

test('read integrity is freshly computed, valid recovery is accepted, and nothing is written', () => {
  const f = fixture(); f.snapshot.awardsBattle = f.awardsBattle; f.snapshot._read_integrity = { kpi_payload_hash: 'forged' };
  const { context, state } = harness(f.snapshot); const originalText = state.text;
  const snapshot = context.privateDashboardSnapshot();
  assert.equal(snapshot._read_integrity.kpi_payload_hash, hash(f.kpiBattle));
  assert.equal(snapshot._read_integrity.snapshot_payload_hash, hash(originalText));
  assert.equal(snapshot._read_integrity.awards_recovery_valid, true);
  assert.equal(state.text, originalText); assert.equal(state.writes, 0);
});

test('changed current KPI invalidates recovery only in the response, never faking fresh or rewriting disk', () => {
  const f = fixture(); f.snapshot.awardsBattle = f.awardsBattle; f.snapshot.components.awards.status = 'fresh';
  f.kpiBattle.aggregate.overall_kpi = 99;
  const { context, state } = harness(f.snapshot); const originalText = state.text;
  const snapshot = context.privateDashboardSnapshot();
  assert.equal(snapshot._read_integrity.snapshot_payload_hash, hash(originalText));
  assert.equal(snapshot._read_integrity.awards_recovery_valid, false);
  assert.equal(snapshot.components.awards.status, 'blocked');
  assert.equal(snapshot.components.awards.reason, 'awards-recovery-parent-mismatch');
  assert.equal(state.text, originalText); assert.equal(state.writes, 0);
});

test('admin status supplies snapshot hash from private raw content, not response-only integrity', () => {
  const f = fixture(); const { context } = harness(f.snapshot); const status = context.privateDashboardAdminSnapshotStatus({});
  assert.equal(status.kpiPayloadHash, hash(f.kpiBattle)); assert.equal(status.snapshotPayloadHash, hash(f.snapshot));
});

test('full snapshot and KPI component publishers both use and release the same lock', () => {
  const f = fixture(); const { context, state } = harness(f.snapshot);
  context.privateDashboardPublishKpiComponent({ kpiBattleBase64: encode(f.kpiBattle) });
  assert.equal(state.acquisitions, 1); assert.equal(state.releases, 1);
  const incoming = clone(f.snapshot); incoming._read_integrity = { kpi_payload_hash: 'forged' };
  context.privateDashboardPublish({ snapshotBase64: encode(incoming) });
  assert.equal(state.acquisitions, 2); assert.equal(state.releases, 2);
  assert.equal(JSON.parse(state.text)._read_integrity, undefined);
});

test('lock acquisition failure produces no write and does not release an unacquired lock', () => {
  const f = fixture(); const { context, state } = harness(f.snapshot);
  state.lockHook = () => { throw new Error('lock timeout'); };
  assert.throws(() => context.privateDashboardPublishAwardsComponent(request(f.snapshot, f.awardsBattle)), /lock timeout/);
  assert.equal(state.writes, 0); assert.equal(state.releases, 0);
});

test('non-private existing file is rejected without permission mutation or data write', () => {
  const f = fixture(); const { context, state, file } = harness(f.snapshot);
  file.getSharingAccess = () => 'ANYONE_WITH_LINK';
  assert.throws(() => context.privateDashboardPublishAwardsComponent(request(f.snapshot, f.awardsBattle)), /AWARDS_PRIVATE_ACCESS_REQUIRED/);
  assert.equal(state.writes, 0); assert.equal(state.releases, 1);
});

test('hash calculation failure cannot satisfy recovery identity', () => {
  const f = fixture(); const { context } = harness(f.snapshot);
  context.reportVersionHash_ = () => '';
  assert.throws(() => context.privateDashboardValidateAwardsComponent_(f.awardsBattle, f.kpiBattle), /AWARDS_RECOVERY_PARENT_MISMATCH/);
});

test('full-publish invalid recovery releases the lock before writing', () => {
  const f = fixture(); f.snapshot.awardsBattle = f.awardsBattle;
  f.awardsBattle.recovery_context.parent_kpi_payload_hash = 'e'.repeat(32);
  const { context, state } = harness(f.snapshot);
  assert.throws(() => context.privateDashboardPublish({ snapshotBase64: encode(f.snapshot) }), /AWARDS_RECOVERY_PARENT_MISMATCH/);
  assert.equal(state.writes, 0); assert.equal(state.releases, 1);
});

test('a non-KPI update between access and status is detected by the response snapshot hash', () => {
  const f = fixture(); const { context, state } = harness(f.snapshot);
  const before = context.privateDashboardSnapshot();
  const newer = JSON.parse(state.text); newer.closure.amount += 1; state.text = JSON.stringify(newer);
  const after = context.privateDashboardAdminSnapshotStatus({});
  assert.equal(before._read_integrity.kpi_payload_hash, after.kpiPayloadHash);
  assert.notEqual(before._read_integrity.snapshot_payload_hash, after.snapshotPayloadHash);
  assert.equal(context.privateDashboardSnapshot()._read_integrity.snapshot_payload_hash, after.snapshotPayloadHash);
  assert.equal(state.writes, 0);
});

test('the original same-run awards call without CAS or recovery fields remains compatible', () => {
  const f = fixture(); delete f.awardsBattle.recovery_context; delete f.awardsBattle.config_hash; delete f.awardsBattle.config_version;
  f.awardsBattle.processing_run_id = f.kpiBattle.processing_run_id;
  Object.values(f.awardsBattle.source_files).forEach(source => { source.run_id = f.kpiBattle.processing_run_id; });
  const { context, state } = harness(f.snapshot);
  context.privateDashboardPublishAwardsComponent({ awardsBattleBase64: encode(f.awardsBattle) });
  const after = JSON.parse(state.text);
  assert.deepEqual(after.awardsBattle, f.awardsBattle);
  assert.equal(after.components.awards.run_id, f.kpiBattle.processing_run_id);
  assert.equal(after.components.awards.recovery_context, undefined);
  assert.equal(after.components.awards.config_version, undefined);
  assert.equal(state.acquisitions, 1); assert.equal(state.releases, 1); assert.equal(state.writes, 1);
});

test('a different-run request without CAS or recovery is still rejected', () => {
  const f = fixture(); delete f.awardsBattle.recovery_context;
  const { context, state } = harness(f.snapshot);
  assert.throws(() => context.privateDashboardPublishAwardsComponent({ awardsBattleBase64: encode(f.awardsBattle) }), /AWARDS_RECOVERY_CONTEXT_REQUIRED/);
  assert.equal(state.writes, 0); assert.equal(state.releases, 1);
});

test('same-run legacy callers providing one CAS field must provide the complete pair', () => {
  const f = fixture(); delete f.awardsBattle.recovery_context;
  f.awardsBattle.processing_run_id = f.kpiBattle.processing_run_id;
  Object.values(f.awardsBattle.source_files).forEach(source => { source.run_id = f.kpiBattle.processing_run_id; });
  const { context, state } = harness(f.snapshot);
  assert.throws(() => context.privateDashboardPublishAwardsComponent({ awardsBattleBase64: encode(f.awardsBattle), expectedKpiPayloadHash: hash(f.kpiBattle) }), /AWARDS_PRECONDITION_FAILED/);
  assert.equal(state.writes, 0); assert.equal(state.releases, 1);
});
