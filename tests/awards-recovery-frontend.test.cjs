const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const Awards = require('../awards-battle-controller.js');
const Catalog = require('../award-model-catalog.js');

const root = path.join(__dirname, '..');
const websiteCode = fs.readFileSync(path.join(root, 'awards-battle-controller.js'), 'utf8');
const appCode = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

function functionSource(code, name) {
  const start = code.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const brace = code.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < code.length; i++) {
    if (code[i] === '{') depth++;
    if (code[i] === '}') depth--;
    if (depth === 0) return code.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

const appContext = vm.createContext({
  scope: { AwardModelCatalog: Catalog },
  C: { moduleState: value => value },
  STORE_ALIASES: new Map(),
  moduleSource: (label, href) => ({ label, href }),
  stale: () => false,
});
vm.runInContext(['numberOrNull', 'normalizeStore', 'adaptAwards'].map(name => functionSource(appCode, name)).join('\n'), appContext);

function fixture() {
  const items = Catalog.definitions('2026-10-17').map((model, i) => ({
    name: model.sourceName, display_name: model.shortName,
    actual: i + 1, target: 20 + i, rate: (i + 1) / (20 + i),
    store_reward_50: 100 + i, store_reward_100: 200 + i,
    district_reward_80: 300 + i, district_reward_100: 400 + i,
  }));
  const recoveryRun = 'synthetic-awards-recovery-18';
  const kpi = {
    report_date: '2026-10-17', report_run_date: '2026-10-18', data_as_of_date: '2026-10-17',
    processing_run_id: 'synthetic-kpi-18', source_metadata: { sha256: 'a'.repeat(64) },
  };
  return {
    kpiBattle: kpi,
    _read_integrity: { kpi_payload_hash: 'b'.repeat(32), awards_recovery_valid: true },
    awardsBattle: {
      report_date: '2026-10-17', report_run_date: '2026-10-18', data_as_of_date: '2026-10-17',
      processing_run_id: recoveryRun, phone_items: 10, store_rows: 10,
      config_hash: '36e4f4245bf3f3b67a1dba6137aa6c29ea5390f7f214d91a91dc40fa2604ef51', config_version: '2026-10-v1',
      supervisor: { actual_total: 1234, projected: 2345, rank: 8, award: 'Y' },
      overall: { store: '北一二B整體', items, priorities: [] },
      stores: Array.from({ length: 9 }, (_, i) => ({
        store: `合成店${i + 1}`, items: structuredClone(items), priorities: [],
        award: { actual_total: 9000 - i, award: 'Y' },
      })),
      source_files: Object.fromEntries(['store', 'person'].map(kind => [kind, {
        provider: 'google-drive-cloud', driveItemId: `synthetic-${kind}-id`, googleDriveFileId: `synthetic-${kind}-id`,
        basename: kind === 'store' ? '01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx' : '01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx',
        lastModifiedDateTime: '2026-10-18T01:45:00Z', size: 1000,
        run_id: recoveryRun, source_data_date: '2026-10-17', sha256: (kind === 'store' ? 'c' : 'd').repeat(64),
      }])),
      recovery_context: {
        schema: 'north12b-awards-recovery/v1', recovery_run_id: recoveryRun,
        parent_kpi_run_id: kpi.processing_run_id, parent_kpi_source_sha256: kpi.source_metadata.sha256,
        parent_kpi_payload_hash: 'b'.repeat(32), report_run_date: '2026-10-18', data_as_of_date: '2026-10-17',
        award_config_hash: '36e4f4245bf3f3b67a1dba6137aa6c29ea5390f7f214d91a91dc40fa2604ef51',
      },
    },
  };
}

function read(snapshot) {
  const kpiView = { ...snapshot.kpiBattle, supplement_synced: true };
  return {
    website: Awards.validateAwardsBattle(snapshot.awardsBattle, kpiView, snapshot.kpiBattle, snapshot._read_integrity),
    app: appContext.adaptAwards(snapshot, snapshot.kpiBattle.report_run_date, '2026-10-18T03:00:00Z'),
  };
}

function assertBlocked(snapshot) {
  const result = read(snapshot);
  assert.equal(result.website.ok, false);
  assert.equal(result.app.summary.status, 'no_data');
  assert.equal(result.app.summary.data, null);
  assert.equal(result.app.stores.data.length, 0);
  assert.equal(result.app.top2.data.length, 0);
}

test('website and App use identical recovery binding conditions', () => {
  assert.equal(functionSource(websiteCode, 'recoveryCompatible'), functionSource(appCode, 'recoveryCompatible'));
});

test('valid recovery keeps the real run, all ten model rows, nine stores and source amounts', () => {
  const snapshot = fixture();
  const before = structuredClone(snapshot);
  const result = read(snapshot);
  assert.equal(result.website.ok, true);
  assert.equal(result.app.summary.status, 'ok');
  assert.equal(result.app.summary.data.areaActualAward, 1234);
  assert.equal(result.app.summary.data.items.length, 10);
  assert.equal(result.app.stores.data.length, 9);
  assert.equal(result.app.stores.data[0].amount, 9000);
  assert.equal(result.app.stores.data[0].items[0].reward50, 100);
  assert.equal(result.app.stores.data[0].items[0].reward100, 200);
  assert.equal(result.app.stores.data[0].items.length, 10);
  assert.notEqual(snapshot.awardsBattle.processing_run_id, snapshot.kpiBattle.processing_run_id);
  assert.deepEqual(snapshot, before);
});

test('original same-run guard still accepts complete October data without recovery or integrity', () => {
  const snapshot = fixture();
  delete snapshot.awardsBattle.recovery_context;
  delete snapshot._read_integrity;
  snapshot.awardsBattle.processing_run_id = snapshot.kpiBattle.processing_run_id;
  const result = read(snapshot);
  assert.equal(result.website.ok, true);
  assert.equal(result.app.summary.status, 'ok');
});

const invalid = [
  ['missing recovery context', s => { delete s.awardsBattle.recovery_context; }],
  ['missing live read integrity', s => { delete s._read_integrity; }],
  ['missing server recovery verdict', s => { delete s._read_integrity.awards_recovery_valid; }],
  ['server rejected recovery', s => { s._read_integrity.awards_recovery_valid = false; }],
  ['unverified string recovery verdict', s => { s._read_integrity.awards_recovery_valid = 'true'; }],
  ['missing live payload hash', s => { delete s._read_integrity.kpi_payload_hash; }],
  ['changed live payload version', s => { s._read_integrity.kpi_payload_hash = 'e'.repeat(32); }],
  ['malformed live payload hash', s => { s._read_integrity.kpi_payload_hash = s.awardsBattle.recovery_context.parent_kpi_payload_hash = 'fake'; }],
  ['wrong SHA256 length for the existing MD5 version hash', s => { s._read_integrity.kpi_payload_hash = s.awardsBattle.recovery_context.parent_kpi_payload_hash = 'b'.repeat(64); }],
  ['missing KPI source metadata', s => { delete s.kpiBattle.source_metadata; }],
  ['changed current KPI source', s => { s.kpiBattle.source_metadata.sha256 = 'e'.repeat(64); }],
  ['malformed parent source SHA', s => { s.kpiBattle.source_metadata.sha256 = s.awardsBattle.recovery_context.parent_kpi_source_sha256 = 'fake'; }],
  ['changed current KPI run', s => { s.kpiBattle.processing_run_id = 'other-kpi'; }],
  ['missing current KPI run', s => { delete s.kpiBattle.processing_run_id; }],
  ['changed actual awards run', s => { s.awardsBattle.processing_run_id = 'other-awards'; }],
  ['missing actual awards run', s => { delete s.awardsBattle.processing_run_id; }],
  ['awards relabeled to parent run', s => { s.awardsBattle.processing_run_id = s.kpiBattle.processing_run_id; }],
  ['different publication day', s => { s.awardsBattle.report_run_date = '2026-10-19'; }],
  ['different cutoff day', s => { s.awardsBattle.data_as_of_date = '2026-10-16'; }],
  ['legacy awards date cannot replace explicit recovery date', s => { s.awardsBattle.report_date = s.awardsBattle.report_run_date; delete s.awardsBattle.report_run_date; }],
  ['legacy KPI date cannot replace explicit recovery date', s => { s.kpiBattle.report_date = s.kpiBattle.report_run_date; delete s.kpiBattle.report_run_date; }],
  ['September recovery cannot borrow October config', s => { s.awardsBattle.data_as_of_date = s.kpiBattle.data_as_of_date = s.awardsBattle.recovery_context.data_as_of_date = '2026-09-30'; }],
  ['old same-day store source', s => { s.awardsBattle.source_files.store.run_id = 'old-awards-run'; }],
  ['old same-day person source', s => { s.awardsBattle.source_files.person.run_id = 'old-awards-run'; }],
  ['store source cutoff differs', s => { s.awardsBattle.source_files.store.source_data_date = '2026-10-16'; }],
  ['person source cutoff differs', s => { s.awardsBattle.source_files.person.source_data_date = '2026-10-16'; }],
  ['missing store source', s => { delete s.awardsBattle.source_files.store; }],
  ['missing person source', s => { delete s.awardsBattle.source_files.person; }],
  ['old thirteen-model count', s => { s.awardsBattle.phone_items = 13; }],
  ['wrong store row count', s => { s.awardsBattle.store_rows = 9; }],
  ['missing store', s => { s.awardsBattle.stores.pop(); }],
  ['duplicate store', s => { s.awardsBattle.stores[1].store = s.awardsBattle.stores[0].store; }],
  ['missing supervisor', s => { delete s.awardsBattle.supervisor; }],
  ['missing overall model', s => { s.awardsBattle.overall.items.pop(); }],
  ['missing store model', s => { s.awardsBattle.stores[0].items.pop(); }],
  ['wrong October model group', s => { s.awardsBattle.overall.items[0].name = 'S26Ultra/ZFold8/ZFold8Ultra'; }],
];
for (const [name, mutate] of invalid) test(`both views hide recovery: ${name}`, () => {
  const snapshot = fixture();
  mutate(snapshot);
  assertBlocked(snapshot);
});

for (const field of Object.keys(fixture().awardsBattle.recovery_context)) {
  test(`both views hide a missing context field: ${field}`, () => {
    const snapshot = fixture();
    delete snapshot.awardsBattle.recovery_context[field];
    assertBlocked(snapshot);
  });
  test(`both views hide a changed context field: ${field}`, () => {
    const snapshot = fixture();
    snapshot.awardsBattle.recovery_context[field] = 'tampered';
    assertBlocked(snapshot);
  });
}

// Exercise the actual GAS reader, not a frontend-generated success flag. It
// checks the canonical cloud source identities before issuing its live verdict.
const gasTestSource = fs.readFileSync(path.join(__dirname, 'awards-recovery-gas.test.cjs'), 'utf8');
const gasContext = { require, __dirname, Buffer, module: { exports: {} } };
vm.runInNewContext(gasTestSource.slice(0, gasTestSource.indexOf('\ntest(')) + '\nmodule.exports={harness};', gasContext);
function serverRead(snapshot) {
  snapshot.awardsBattle.recovery_context.parent_kpi_payload_hash = createHash('md5').update(JSON.stringify(snapshot.kpiBattle)).digest('hex');
  return JSON.parse(JSON.stringify(gasContext.module.exports.harness(snapshot).context.privateDashboardSnapshot()));
}

test('actual GAS validated source verdict allows recovery on both frontends', () => {
  const snapshot = serverRead(fixture());
  assert.equal(snapshot._read_integrity.awards_recovery_valid, true);
  assert.equal(read(snapshot).website.ok, true);
  assert.equal(read(snapshot).app.summary.status, 'ok');
});

for (const kind of ['store', 'person']) {
  for (const field of ['provider', 'basename', 'driveItemId', 'lastModifiedDateTime', 'size', 'sha256', 'source_data_date', 'run_id']) {
    test(`both views hide GAS-rejected ${kind} source missing ${field}`, () => {
      const snapshot = fixture();
      delete snapshot.awardsBattle.source_files[kind][field];
      const response = serverRead(snapshot);
      assert.equal(response._read_integrity.awards_recovery_valid, false);
      assert.equal(response.components.awards.status, 'blocked');
      assertBlocked(response);
    });
  }
}

test('website controller passes authenticated read integrity from the real snapshot path', () => {
  const snapshot = fixture();
  const nodes = new Map(['awardsBattleSourceNote', 'awardsBattleContent'].map(id => [id, { textContent: '', innerHTML: '' }]));
  const document = { getElementById: id => nodes.get(id), addEventListener() {} };
  const controller = Awards.create({ window: { document }, document });
  const payload = { result: { snapshot }, data: { ...snapshot.kpiBattle, supplement_synced: true } };
  assert.equal(controller.acceptKpiResult(payload), true);
  assert.equal(controller.getData(), snapshot.awardsBattle);
  assert.match(nodes.get('awardsBattleSourceNote').textContent, /10 款.*2026-10-18.*2026-10-17/);
  delete snapshot._read_integrity;
  assert.equal(controller.acceptKpiResult(payload), false);
  assert.equal(controller.getData(), null);
  assert.match(nodes.get('awardsBattleContent').innerHTML, /尚未有資料/);
  assert.doesNotMatch(nodes.get('awardsBattleContent').innerHTML, /1,234/);
});

test('HTML retains recovery controller and the current App rank contract asset', () => {
  assert.match(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), /awards-battle-controller\.js\?v=20261018-awards-recovery-1/);
  assert.match(fs.readFileSync(path.join(root, 'app.html'), 'utf8'), /app\.js\?v=20261023-personal-rank-1/);
});
