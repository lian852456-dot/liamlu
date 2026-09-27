const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'gas/Code.gs'), 'utf8');

test('POST router exposes authenticated KPI component publish action without changing private_access', () => {
  assert.match(code, /action === 'private_publish_kpi_component'.*privateDashboardPublishKpiComponent/s);
  assert.match(code, /action === 'private_publish_awards_component'.*privateDashboardPublishAwardsComponent/s);
  assert.match(functionSource('privateDashboardPublishKpiComponent'), /privateDashboardAdminAuthorized\(payload\)/);
  assert.match(functionSource('privateDashboardPublishAwardsComponent'), /privateDashboardAdminAuthorized\(payload\)/);
  assert.match(functionSource('privateDashboardAccess'), /privateDashboardSnapshot\(\)/);
});

function functionSource(name) {
  const start = code.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = code.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === '{') depth += 1;
    if (code[index] === '}') {
      depth -= 1;
      if (depth === 0) return code.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
}

function createHarness(initialText, kpicalc) {
  const state = { text: initialText || '', created: false, adminChecks: 0, kpicalc: kpicalc || null };
  const file = {
    setContent(text) { state.text = text; },
    getBlob() { return { getDataAsString: () => state.text }; },
    getId() { return 'private-file-id'; },
    getLastUpdated() { return new Date('2026-08-05T08:15:16.000Z'); },
    getName() { return 'north12b-dashboard-private-latest.json'; },
    getOwner() { return { getEmail: () => 'lian852456@gmail.com' }; },
    getSharingAccess() { return 'PRIVATE'; },
    getSharingPermission() { return 'NONE'; },
  };
  const folder = {
    getFilesByName() {
      let consumed = false;
      return {
        hasNext: () => !!state.text && !consumed,
        next: () => { consumed = true; return file; },
      };
    },
    createFile(blob) {
      state.created = true;
      state.text = blob.getDataAsString('UTF-8');
      return file;
    },
  };
  const context = {
    PRIVATE_DASHBOARD_FILE: 'north12b-dashboard-private-latest.json',
    privateDashboardAdminAuthorized() { state.adminChecks += 1; },
    privateDashboardNow() { return '2026-08-05T16:30:00+08:00'; },
    privateDashboardFolder() { return folder; },
    kpiCalcLatestDataFile() {
      if (!state.kpicalc) return null;
      return { getBlob: () => ({ getDataAsString: () => JSON.stringify(state.kpicalc) }) };
    },
    reportVersionHash_() { return 'hash'; },
    reportVersionRecord_() {},
    Utilities: {
      base64Decode(value) { return Buffer.from(value, 'base64'); },
      newBlob(value) {
        const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value);
        return { getDataAsString: () => text };
      },
      formatDate() { return '2026-08-05T16:15:16+08:00'; },
    },
  };
  return { state, context };
}

function loadFunctions(context, names) {
  for (const name of names) vm.runInNewContext(functionSource(name), context);
}

function encodedSnapshot(snapshot) {
  return Buffer.from(JSON.stringify(snapshot), 'utf8').toString('base64');
}

test('private_publish persists publishedAt and returns the same value', () => {
  const { state, context } = createHarness(JSON.stringify({ version: 1, kpiBattle: {}, awardsBattle: {} }));
  vm.runInNewContext(functionSource('privateDashboardPublish'), context);
  const result = context.privateDashboardPublish({ snapshotBase64: encodedSnapshot({
    version: 1,
    publishedAt: 'stale',
    kpiBattle: { report_date: '2026-08-05' },
    awardsBattle: { report_date: '2026-08-05', phone_items: 13, store_rows: 10 },
  }) });
  const stored = JSON.parse(state.text);

  assert.equal(result.publishedAt, '2026-08-05T16:30:00+08:00');
  assert.equal(stored.publishedAt, result.publishedAt);
  assert.equal(result.fileId, 'private-file-id');
  assert.equal(result.lastUpdated, '2026-08-05T16:15:16+08:00');
  assert.equal(state.adminChecks, 1);
});

test('snapshot status reads the same persisted publishedAt', () => {
  const { state, context } = createHarness(JSON.stringify({
    version: 1,
    publishedAt: '2026-08-05T16:30:00+08:00',
    kpiBattle: { report_date: '2026-08-05' },
    awardsBattle: { report_date: '2026-08-05', phone_items: 13, store_rows: 10 },
  }));
  vm.runInNewContext(functionSource('privateDashboardAdminSnapshotStatus'), context);
  const status = context.privateDashboardAdminSnapshotStatus({});

  assert.equal(status.publishedAt, '2026-08-05T16:30:00+08:00');
  assert.equal(status.kpiReportDate, '2026-08-05');
  assert.equal(status.awardsReportDate, '2026-08-05');
  assert.equal(status.phoneItems, 13);
  assert.equal(status.storeRows, 10);
});

test('oversized snapshotBase64 is rejected before Drive access', () => {
  const { context } = createHarness('');
  vm.runInNewContext(functionSource('privateDashboardPublish'), context);
  assert.throws(
    () => context.privateDashboardPublish({ snapshotBase64: 'x'.repeat(8 * 1024 * 1024 + 1) }),
    /私有戰情快照缺少或過大/
  );
});

function freshKpiComponent(overrides = {}) {
  const supplement = index => ({
    overall_kpi: 1.0351 + index / 1000,
    company_rank: 33 + index,
    overall_kpi_dod: 0.01,
    company_rank_dod: 1,
    addon_score: 11.98 + index / 10,
  });
  return {
    report_date: '2026-08-23',
    report_run_date: '2026-08-24',
    data_as_of_date: '2026-08-23',
    source_as_of_date: '2026-08-23',
    source_file: '0824.xlsx',
    kpi_run_id: 'quick-20260824-125725-777574ab',
    generated_at: '2026-08-24T18:00:00+08:00',
    aggregate: supplement(0),
    stores: Array.from({ length: 9 }, (_, index) => ({ store: `店${index + 1}`, ...supplement(index + 1) })),
    personal: Array.from({ length: 40 }, (_, index) => ({ name: `同仁${index + 1}` })),
    ...overrides,
  };
}

function protectedKpi() {
  return {
    meta: {
      month: '2026-08', snapshotDay: 23, period: '2026/08/01 ~ 08/23',
      sourceFile: '0824.xlsx', processingRunId: 'quick-20260824-125725-777574ab',
    },
    stores: Array.from({ length: 9 }, () => ({})),
    persons: Array.from({ length: 40 }, () => ({})),
    items: Array.from({ length: 25 }, () => ({})),
  };
}

test('mixed freshness：只發布 fresh KPI component，awards payload 保持 8/22 原樣並標記 blocked', () => {
  const awards = {
    report_date: '2026-08-22', data_as_of_date: '2026-08-22', generated_at: '2026-08-23T09:50:00+08:00',
    source_files: { store: { sha256: 'old-store' }, person: { sha256: 'old-person' } },
    phone_items: 13, store_rows: 10,
  };
  const initial = { version: 1, publishedAt: '2026-08-23T20:33:34+08:00', kpiBattle: { report_date: '2026-08-22' }, awardsBattle: awards };
  const { state, context } = createHarness(JSON.stringify(initial), protectedKpi());
  loadFunctions(context, [
    'reportUploadKpiDate_',
    'privateDashboardCanonicalKpiSource_',
    'privateDashboardValidateKpiComponent_',
    'privateDashboardPublishKpiComponent',
  ]);
  const result = context.privateDashboardPublishKpiComponent({
    kpiBattleBase64: encodedSnapshot(freshKpiComponent()),
  });
  const stored = JSON.parse(state.text);

  assert.equal(stored.kpiBattle.source_file, '0824.xlsx');
  assert.equal(stored.kpiBattle.report_date, '2026-08-23');
  assert.equal(stored.kpiBattle.aggregate.overall_kpi, 1.0351);
  assert.equal(stored.kpiBattle.aggregate.company_rank, 33);
  assert.deepEqual(stored.awardsBattle, awards);
  assert.equal(stored.components.kpi.status, 'fresh');
  assert.equal(stored.components.kpi.run_id, 'quick-20260824-125725-777574ab');
  assert.equal(stored.components.awards.status, 'blocked');
  assert.equal(stored.components.awards.data_as_of_date, '2026-08-22');
  assert.equal(stored.components.awards.reason, 'upstream-source-not-updated');
  assert.equal(result.awardsStatus, 'blocked');
  assert.equal(result.awardsReportDate, '2026-08-22');
});

test('KPI component source/date mismatch 仍 fail-closed，partial publish 不得覆寫正式 snapshot', () => {
  const initial = JSON.stringify({
    version: 1,
    kpiBattle: { report_date: '2026-08-22' },
    awardsBattle: { report_date: '2026-08-22' },
  });
  const { state, context } = createHarness(initial, protectedKpi());
  loadFunctions(context, [
    'reportUploadKpiDate_',
    'privateDashboardCanonicalKpiSource_',
    'privateDashboardValidateKpiComponent_',
    'privateDashboardPublishKpiComponent',
  ]);
  assert.throws(
    () => context.privateDashboardPublishKpiComponent({
      kpiBattleBase64: encodedSnapshot(freshKpiComponent({ source_file: '0823.xlsx' })),
    }),
    /source_file 與 protected KPI 不一致/,
  );
  assert.equal(state.text, initial);
});

function freshAwardsComponent(overrides = {}, provider = 'onedrive-cloud') {
  const source = (kind, basename) => ({
    provider, driveItemId: `${kind}-item-id`, basename,
    canonical_basename: basename, lastModifiedDateTime: '2026-08-24T01:00:00Z',
    ...(provider === 'onedrive-cloud' ? { eTag: `${kind}-etag-v2` } : { googleDriveFileId: `${kind}-item-id` }),
    size: 2048, sha256: kind === 'store' ? 'a'.repeat(64) : 'b'.repeat(64),
    source_data_date: '2026-08-23', run_id: 'awards-cloud-20260824-test',
  });
  const items = Array.from({ length: 13 }, (_, index) => ({ name: `機款${index + 1}` }));
  return {
    report_date: '2026-08-23', report_run_date: '2026-08-24', data_as_of_date: '2026-08-23',
    generated_at: '2026-08-24T20:00:00+08:00', phone_items: 13, store_rows: 10,
    source_files: {
      store: source('store', '01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx'),
      person: source('person', '01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx'),
    },
    overall: { store: '北一二B整體', items },
    stores: Array.from({ length: 9 }, (_, index) => ({ store: `店${index + 1}`, items })),
    ...overrides,
  };
}

test('awards component-only publish 更新 fresh awards 並完整保留 KPI payload/component', () => {
  const kpi = freshKpiComponent();
  const kpiMeta = { status: 'fresh', data_as_of_date: '2026-08-23', source_file: '0824.xlsx', run_id: kpi.kpi_run_id };
  const initial = {
    version: 1, publishedAt: '2026-08-24T19:24:27+08:00', kpiBattle: kpi,
    awardsBattle: { report_date: '2026-08-22' }, components: { kpi: kpiMeta, awards: { status: 'blocked' } },
  };
  const { state, context } = createHarness(JSON.stringify(initial), protectedKpi());
  loadFunctions(context, ['privateDashboardValidateAwardsComponent_', 'privateDashboardPublishAwardsComponent']);
  const result = context.privateDashboardPublishAwardsComponent({ awardsBattleBase64: encodedSnapshot(freshAwardsComponent()) });
  const stored = JSON.parse(state.text);
  assert.deepEqual(stored.kpiBattle, kpi);
  assert.deepEqual(stored.components.kpi, kpiMeta);
  assert.equal(stored.awardsBattle.report_date, '2026-08-23');
  assert.equal(stored.awardsBattle.source_files.store.provider, 'onedrive-cloud');
  assert.equal(stored.components.awards.status, 'fresh');
  assert.equal(stored.components.awards.run_id, 'awards-cloud-20260824-test');
  assert.equal(result.reportDate, '2026-08-23');
});

test('awards component-only publish 接受 Google Drive immutable identity 且不偽造 eTag', () => {
  const kpi = freshKpiComponent();
  const initial = {
    version: 1, kpiBattle: kpi, awardsBattle: { report_date: '2026-08-22' },
    components: { kpi: { status: 'fresh' }, awards: { status: 'blocked' } },
  };
  const { state, context } = createHarness(JSON.stringify(initial), protectedKpi());
  loadFunctions(context, ['privateDashboardValidateAwardsComponent_', 'privateDashboardPublishAwardsComponent']);
  const result = context.privateDashboardPublishAwardsComponent({
    awardsBattleBase64: encodedSnapshot(freshAwardsComponent({}, 'google-drive-cloud')),
  });
  const stored = JSON.parse(state.text);
  assert.equal(stored.awardsBattle.source_files.store.provider, 'google-drive-cloud');
  assert.equal(stored.awardsBattle.source_files.store.eTag, undefined);
  assert.equal(stored.components.awards.provider, 'google-drive-cloud');
  assert.deepEqual(stored.kpiBattle, kpi);
  assert.equal(result.runId, 'awards-cloud-20260824-test');
});

test('awards cutoff/source identity mismatch 必須 fail-closed 且不得改 KPI/awards', () => {
  const initial = JSON.stringify({
    version: 1, kpiBattle: freshKpiComponent(), awardsBattle: { report_date: '2026-08-22' },
    components: { kpi: { status: 'fresh' }, awards: { status: 'blocked' } },
  });
  const { state, context } = createHarness(initial, protectedKpi());
  loadFunctions(context, ['privateDashboardValidateAwardsComponent_', 'privateDashboardPublishAwardsComponent']);
  assert.throws(
    () => context.privateDashboardPublishAwardsComponent({
      awardsBattleBase64: encodedSnapshot(freshAwardsComponent({ report_date: '2026-08-22' })),
    }),
    /與 KPI cutoff 不一致/,
  );
  assert.equal(state.text, initial);
});
