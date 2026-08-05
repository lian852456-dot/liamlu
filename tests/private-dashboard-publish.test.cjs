const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'gas/Code.gs'), 'utf8');

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

function createHarness(initialText) {
  const state = { text: initialText || '', created: false, adminChecks: 0 };
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
