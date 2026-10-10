'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

const path = require('node:path');
const modulePath = path.join(__dirname, '../gas/DashboardRosterSync.gs');
const codePath = path.join(__dirname, '../gas/Code.gs');
const rosterSource = fs.readFileSync(modulePath, 'utf8');
const codeSource = fs.readFileSync(codePath, 'utf8');
const STORES = ['酒泉', '永吉', '復興南', '杭州南', '萬大', '通化', '大稻埕', '三創', '六張犁'];
const FOLDER = '1zs4flckF4uysz55tXkAxojM5-yB6a9sH';
const TODAY = '2026-10-10';
const YESTERDAY = '2026-10-09';
const CLOCK = Date.parse(TODAY + 'T04:00:00Z');
const CONFIG = 'DASHBOARD_AUTH_B_CONFIG_V1';
const SYNC_STATE = 'DASHBOARD_ROSTER_SYNC_V1';

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing ' + name);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error('unterminated ' + name);
}

const kpiCalcParseMeta = extractFunction(codeSource, 'kpiCalcParseMeta');

function makeMetaRows(period = '2026/10/01 ~ 10/09') {
  const rows = Array.from({ length: 10 }, () => Array(12).fill(''));
  rows[0][0] = period;
  return rows;
}

function makeDetailRows({ period = '2026/10/01 ~ 10/09', duplicate = false, foreignStore = false } = {}) {
  const rows = makeMetaRows(period);
  STORES.forEach((store, index) => {
    const row = Array(8).fill('');
    row[1] = '北一二B';
    row[3] = foreignStore && index === STORES.length - 1 ? '外區' : store;
    row[4] = '店長';
    row[5] = duplicate && index === STORES.length - 1 ? 'SYNTH001' : 'SYNTH' + String(index + 1).padStart(3, '0');
    row[6] = '測試員' + (index + 1);
    rows.push(row);
  });
  return rows;
}

function makeByStoreRows({ period = '2026/10/01 ~ 10/09' } = {}) {
  const rows = makeMetaRows(period);
  STORES.forEach((store, index) => {
    rows.push(['來源 / 北一二B / ' + store, '', '']);
    rows.push(['SYNTH' + String(index + 1).padStart(3, '0'), '測試員' + (index + 1), 1]);
  });
  return rows;
}

function sheetFromRows(rows) {
  return {
    getLastRow: () => rows.length,
    getDataRange: () => ({ getValues: () => rows.map((row) => row.slice()) }),
    getRange: (r, c, h, w) => ({
      getValues: () => Array.from({ length: h }, (_, i) =>
        Array.from({ length: w }, (_, j) => rows[r + i - 1]?.[c + j - 1] ?? ''))
    })
  };
}

function parserFixture({ detail = true, period = '2026/10/01 ~ 10/09', duplicate = false, foreignStore = false } = {}) {
  const storeRows = makeMetaRows(period);
  const dataRows = detail ? makeDetailRows({ period, duplicate, foreignStore }) : makeByStoreRows({ period });
  const sheets = {
    '上線數KPI_店點達成率_明細': sheetFromRows(storeRows),
    ...(detail ? { '上線數KPI_個人達成率_明細': sheetFromRows(dataRows) } : { '上線數KPI_個人達成率_店點': sheetFromRows(dataRows) })
  };
  const context = vm.createContext({
    Date,
    Utilities: {
      formatDate: () => YESTERDAY
    },
    console
  });
  const declarations = `
    const PRIVATE_DASHBOARD_B_STORES_ = ${JSON.stringify(STORES)};
    const KPICALC_SOURCE_FOLDER_ID_DEFAULT = ${JSON.stringify(FOLDER)};
    function privateDashboardCleanEmployeeId(value) {
      const id = String(value || '').trim();
      if (!/^[A-Z0-9_]+$/.test(id)) throw new Error('SYNTHETIC_BAD_EMPLOYEE_ID');
      return id;
    }
  `;
  vm.runInContext(declarations + kpiCalcParseMeta + '\n' + rosterSource, context, { filename: modulePath });
  context.__spreadsheet = { getSheetByName: (name) => sheets[name] || null };
  return { context, sheets };
}

function parseMembers(options) {
  const f = parserFixture(options);
  return f.context.privateDashboardRosterSourceMembers_(f.context.__spreadsheet, '1010.xlsx', TODAY);
}

function makeConfig(validUntil = CLOCK + 6 * 60 * 60 * 1000) {
  return {
    v: 1,
    owner: 'SYNTHETIC_OWNER',
    epoch: 4,
    verifier: { algorithm: 'PBKDF2-HMAC-SHA256', iterations: 600000, salt: 'ab'.repeat(16), digest: 'cd'.repeat(32) },
    authority: {
      version: 7,
      sourceHash: 'ef'.repeat(32),
      effectiveAt: CLOCK - 1000,
      validUntil,
      members: Object.fromEntries(STORES.map((store, i) => ['OLD' + i, store]))
    }
  };
}

function refreshFixture({ source = 'detail', period = '2026/10/01 ~ 10/09', filePresent = true, oldModified = false, parent = FOLDER, config = makeConfig(), recheckParents = [FOLDER], recheckName = '1010.xlsx', recheckModified = null, nativeMembers = [] } = {}) {
  const props = new Map([
    [CONFIG, JSON.stringify(config)],
    ['DASHBOARD_AUTH_OWNER_SCRIPT_ID', 'SYNTHETIC_OWNER'],
    ['DASHBOARD_ADMIN_SECRET', 'SYNTHETIC_ADMIN'],
    ['KPICALC_SOURCE_FOLDER_ID', parent]
  ]);
  let driveLookups = 0;
  let triggerCreates = 0;
  let convertedTrashes = 0;
  const triggers = [];
  const bytes = Buffer.alloc(1024, 7);
  bytes[0] = 80;
  bytes[1] = 75;
  const modified = oldModified ? Date.parse('2026-10-09T04:00:00Z') : CLOCK;
  const finalModified = recheckModified === null ? modified : recheckModified;
  const sourceRows = source === 'detail' ? makeDetailRows({ period }) : makeByStoreRows({ period });
  const sourceSheets = {
    '上線數KPI_店點達成率_明細': sheetFromRows(makeMetaRows(period)),
    ...(source === 'detail'
      ? { '上線數KPI_個人達成率_明細': sheetFromRows(sourceRows) }
      : { '上線數KPI_個人達成率_店點': sheetFromRows(sourceRows) })
  };
  const sourceSpreadsheet = { getSheetByName: (name) => sourceSheets[name] || null };
  const file = {
    id: 'SYNTHETIC_SOURCE_FILE',
    getId: function () { return this.id; },
    isTrashed: () => false,
    getMimeType: () => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    getSize: () => bytes.length,
    getLastUpdated: () => new Date(modified),
    getBlob: () => ({ getBytes: () => Array.from(bytes) })
  };
  const iterator = () => {
    let index = 0;
    return { hasNext: () => filePresent && index === 0, next: () => { index += 1; return file; } };
  };
  const context = vm.createContext({
    Date: class FakeDate extends Date {
      constructor(...args) { super(...(args.length ? args : [CLOCK])); }
      static now() { return CLOCK; }
    },
    console,
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (_algorithm, value) => [...crypto.createHash('sha256').update(Buffer.from(value)).digest()],
      formatDate: (value) => {
        const date = new Date(value).toISOString().slice(0, 10);
        return date;
      }
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key) => props.get(key) ?? null,
        setProperty: (key, value) => props.set(key, String(value))
      })
    },
    DriveApp: {
      getFolderById: (id) => {
        driveLookups += 1;
        assert.equal(id, FOLDER);
        return { getFilesByName: () => iterator() };
      },
      getFileById: (id) => {
        if (id === file.id) {
          let index = 0;
          return {
            id,
            getParents: () => ({ hasNext: () => index < recheckParents.length, next: () => ({ getId: () => recheckParents[index++] }) }),
            getName: () => recheckName,
            getLastUpdated: () => new Date(finalModified),
            isTrashed: () => false
          };
        }
        return { id, setTrashed: (value) => { if (value) convertedTrashes += 1; } };
      }
    },
    Drive: {
      Files: { create: () => ({ id: 'SYNTHETIC_CONVERTED_FILE' }) }
    },
    SpreadsheetApp: { openById: (id) => { assert.equal(id, 'SYNTHETIC_CONVERTED_FILE'); return sourceSpreadsheet; } },
    ScriptApp: {
      getProjectTriggers: () => triggers.slice(),
      newTrigger: (handler) => ({ timeBased: () => ({ everyHours: () => ({ create: () => { triggers.push({ getHandlerFunction: () => handler }); triggerCreates += 1; } }) }) })
    }
  });
  const declarations = `
    const PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ = true;
    const PRIVATE_DASHBOARD_GAS_PASSWORD_ENABLED_ = true;
    const PRIVATE_DASHBOARD_B_STORES_ = ${JSON.stringify(STORES)};
    const KPICALC_SOURCE_FOLDER_ID_DEFAULT = ${JSON.stringify(FOLDER)};
    const PRIVATE_DASHBOARD_B_CONFIG_KEY_ = ${JSON.stringify(CONFIG)};
    const PRIVATE_DASHBOARD_USERS_SHEET = 'DashboardUsers';
    const PRIVATE_DASHBOARD_USERS_HEADERS = ['employee_id','masked_name','store','role','status','device_id','device_bound_at','last_login_at'];
    function privateDashboardProperties() { return PropertiesService.getScriptProperties(); }
    function privateDashboardRequireAuthOwner_() {}
    function privateDashboardAdminAuthorized() {}
    function privateDashboardCleanEmployeeId(value) { return String(value || '').trim(); }
    function privateDashboardBTrusted_() { return false; }
    globalThis.__nativeMembers = ${JSON.stringify(nativeMembers)};
    function privateDashboardRows() { return globalThis.__nativeMembers; }
    function privateDashboardSheet() { return { getLastRow: () => 1 }; }
    globalThis.__syncCalls = 0;
    globalThis.__rosterWrites = 0;
    function privateDashboardWriteObject() { globalThis.__rosterWrites += 1; }
    function privateDashboardRosterTransaction_(run) { return run(); }
    function privateDashboardCreateGasBStore_() { return { config: () => JSON.parse(PropertiesService.getScriptProperties().getProperty(${JSON.stringify(CONFIG)})) }; }
    function privateDashboardGasAuthJson_(value) { return JSON.stringify(value); }
    function privateDashboardSyncRoster() { globalThis.__syncCalls += 1; return { synced: 9 }; }
  `;
  vm.runInContext(declarations + kpiCalcParseMeta + '\n' + rosterSource, context, { filename: modulePath });
  return {
    context,
    props,
    stats: () => ({ syncCalls: context.__syncCalls, rosterWrites: context.__rosterWrites, driveLookups, triggerCreates, convertedTrashes, triggers: triggers.length }),
    fileHash: crypto.createHash('sha256').update(bytes).digest('hex')
  };
}

test('detail source parser returns the complete nine-store roster with masked names', () => {
  const members = parseMembers({ detail: true });
  assert.equal(members.length, 9);
  assert.deepEqual(Array.from(members.map((member) => member.store)).sort(), STORES.slice().sort());
  assert.ok(members.every((member) => member.status === 'active' && /＊/.test(member.maskedName)));
});

test('byStore source parser returns the same nine stores', () => {
  const members = parseMembers({ detail: false });
  assert.equal(members.length, 9);
  assert.deepEqual(Array.from(members.map((member) => member.store)).sort(), STORES.slice().sort());
});

test('source parser rejects duplicate employee IDs, foreign stores, and incomplete rosters', () => {
  assert.throws(() => parseMembers({ duplicate: true }), /ROSTER_SOURCE_MEMBER/);
  assert.throws(() => parseMembers({ foreignStore: true }), /ROSTER_SOURCE_MEMBER/);
  assert.throws(() => parseMembers({ detail: true, period: '2026/10/01 ~ 10/08' }), /ROSTER_SOURCE_DATE/);
});

test('refresh rejects missing or stale Drive sources before roster sync and renewal', () => {
  for (const options of [{ filePresent: false }, { oldModified: true }]) {
    const fixture = refreshFixture(options);
    const before = fixture.props.get(CONFIG);
    assert.throws(() => fixture.context.privateDashboardRefreshRoster_({ adminSecret: 'SYNTHETIC_ADMIN' }), /ROSTER_REFRESH_FAILED/);
    const stats = fixture.stats();
    assert.equal(stats.syncCalls, 0);
    assert.equal(stats.rosterWrites, 0);
    assert.equal(fixture.props.get(CONFIG), before);
    assert.equal(JSON.parse(fixture.props.get(SYNC_STATE)).result, 'failed');
  }
});

test('refresh rejects a non-approved source parent before Drive access', () => {
  const fixture = refreshFixture({ parent: 'SYNTHETIC_WRONG_PARENT' });
  assert.throws(() => fixture.context.privateDashboardRefreshRoster_({ adminSecret: 'SYNTHETIC_ADMIN' }), /ROSTER_REFRESH_FAILED/);
  assert.equal(fixture.stats().driveLookups, 0);
  assert.equal(fixture.stats().syncCalls, 0);
  assert.equal(JSON.parse(fixture.props.get(SYNC_STATE)).result, 'failed');
});

test('refresh rejects a moved or changed source during the locked recheck without renewal', () => {
  const cases = [
    { recheckParents: ['SYNTHETIC_OTHER_PARENT'] },
    { recheckName: '1009.xlsx' },
    { recheckModified: CLOCK - 60 * 1000 }
  ];
  for (const options of cases) {
    const fixture = refreshFixture(options);
    const before = fixture.props.get(CONFIG);
    assert.throws(() => fixture.context.privateDashboardRefreshRoster_({ adminSecret: 'SYNTHETIC_ADMIN' }), /ROSTER_REFRESH_FAILED/);
    assert.equal(fixture.stats().syncCalls, 0);
    assert.equal(fixture.props.get(CONFIG), before);
  }
});

test('refresh rejects a source roster that drops below the active native baseline', () => {
  const nativeMembers = Array.from({ length: 20 }, (_, index) => ({
    employee_id: 'NATIVE' + String(index).padStart(3, '0'),
    status: 'active',
    store: STORES[index % STORES.length]
  }));
  const fixture = refreshFixture({ nativeMembers });
  const before = fixture.props.get(CONFIG);
  assert.throws(() => fixture.context.privateDashboardRefreshRoster_({ adminSecret: 'SYNTHETIC_ADMIN' }), /ROSTER_REFRESH_FAILED/);
  assert.equal(fixture.stats().syncCalls, 0);
  assert.equal(fixture.props.get(CONFIG), before);
});

test('successful refresh creates one timer, and a valid no-op keeps authority expiry unchanged', () => {
  const fixture = refreshFixture();
  fixture.context.privateDashboardRefreshRoster_({ adminSecret: 'SYNTHETIC_ADMIN' });
  const afterFirst = fixture.stats();
  assert.equal(afterFirst.syncCalls, 1);
  assert.equal(afterFirst.triggerCreates, 1);
  assert.equal(afterFirst.convertedTrashes, 1);

  const longExpiry = CLOCK + 36 * 60 * 60 * 1000;
  const config = JSON.parse(fixture.props.get(CONFIG));
  config.authority.validUntil = longExpiry;
  fixture.props.set(CONFIG, JSON.stringify(config));
  fixture.context.privateDashboardRefreshRoster_({ adminSecret: 'SYNTHETIC_ADMIN' });
  const afterSecond = fixture.stats();
  assert.equal(afterSecond.syncCalls, 1, 'same source and >24h authority must be a no-op');
  assert.equal(afterSecond.triggerCreates, 1, 'existing timer must not be duplicated');
  assert.equal(JSON.parse(fixture.props.get(CONFIG)).authority.validUntil, longExpiry);
});
