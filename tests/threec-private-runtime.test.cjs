'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(process.env.THREEC_RUNTIME_CODE_PATH || path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');
const start = source.indexOf('const THREEC_PRIVATE_FOLDER_PROPERTY');
const nextModule = source.indexOf('function privateDashboardAdminRequests', start);
const end = nextModule < 0 ? source.length : nextModule;
assert.ok(start >= 0 && end > start, '3C GAS block not found');
const threecBlock = source.slice(start, end);

function digest(algorithm, value) {
  const name = algorithm === 'sha256' ? 'sha256' : 'md5';
  return [...crypto.createHash(name).update(Buffer.isBuffer(value) ? value : String(value)).digest()];
}

function runtime(options = {}) {
  const properties = new Map([
    ['DASHBOARD_ADMIN_SECRET', 'admin-secret'],
    ['DASHBOARD_TRUSTED_EMPLOYEE_ID', 'A12345'],
    ['REPORT_UPLOAD_ALLOWED_EMPLOYEES', 'A12345'],
    ['THREEC_PRIVATE_FOLDER_ID', 'folder-private'],
  ]);
  const files = new Map();
  const folders = new Map();
  let nextFileId = 0;
  let nextUuid = 0;
  let registryWrites = 0;
  let lockHeld = false;
  const folder = {
    id: 'folder-private',
    name: options.folderName || '3C／舊換新資料庫（私有）',
    sharing: options.folderSharing || 'PRIVATE',
    corruptNextSnapshotRead: false,
    getId() { return this.id; },
    getName() { return this.name; },
    getSharingAccess() { return this.sharing; },
    createFile(name, content) {
      const id = 'file-' + (++nextFileId);
      const file = {
        id,
        name: String(name),
        content: String(content),
        parentId: this.id,
        corrupt: this.corruptNextSnapshotRead && String(name).startsWith('threec-'),
        getId() { return this.id; },
        getName() { return this.name; },
        getBlob() {
          let value = this.content;
          if (this.corrupt) {
            const changed = JSON.parse(this.content);
            changed.snapshot_hash = '0'.repeat(32);
            value = JSON.stringify(changed);
          }
          return { getDataAsString: () => value };
        },
        getParents() {
          let done = false;
          return { hasNext: () => !done, next: () => { done = true; return folder; } };
        },
      };
      this.corruptNextSnapshotRead = false;
      files.set(id, file);
      return file;
    },
  };
  folders.set(folder.id, folder);

  const propertiesApi = {
    getProperty: key => properties.get(String(key)) || null,
    setProperty: (key, value) => { properties.set(String(key), String(value)); },
    deleteProperty: key => { properties.delete(String(key)); },
  };
  const context = vm.createContext({
    console,
    Date,
    JSON,
    Math,
    String,
    Number,
    Object,
    Array,
    Error,
    PropertiesService: { getScriptProperties: () => propertiesApi },
    DriveApp: {
      Access: { PRIVATE: 'PRIVATE' },
      getFolderById: id => {
        const found = folders.get(String(id));
        if (!found) throw new Error('folder not found: ' + id);
        return found;
      },
      getFileById: id => {
        const found = files.get(String(id));
        if (!found) throw new Error('file not found: ' + id);
        return found;
      },
    },
    LockService: {
      getScriptLock: () => ({
        waitLock: () => { assert.equal(lockHeld, false, 'script lock must be exclusive'); lockHeld = true; },
        releaseLock: () => { assert.equal(lockHeld, true, 'script lock must be released'); lockHeld = false; },
      }),
    },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256', MD5: 'md5' },
      computeDigest: digest,
      newBlob: value => ({ getBytes: () => Buffer.from(String(value)) }),
      formatDate: () => '2026-09-28T12:00:00+08:00',
      getUuid: () => '00000000-0000-4000-8000-' + String(++nextUuid).padStart(12, '0'),
    },
    privateDashboardProperties: () => propertiesApi,
    privateDashboardRequiredProperty: name => {
      const value = propertiesApi.getProperty(name);
      if (!value || /^CHANGE_ME/i.test(value)) throw new Error('private dashboard is not configured: ' + name);
      return value;
    },
    privateDashboardNow: () => '2026-09-28T12:00:00+08:00',
    privateDashboardCleanEmployeeId: value => {
      const employeeId = String(value || '').trim().toUpperCase();
      if (!/^[A-Z0-9]{5,12}$/.test(employeeId)) throw new Error('員編格式不正確');
      return employeeId;
    },
    privateDashboardCleanDeviceId: value => {
      const deviceId = String(value || '').trim();
      if (!/^[A-Za-z0-9_-]{16,128}$/.test(deviceId)) throw new Error('裝置識別不正確');
      return deviceId;
    },
    privateDashboardIsTrustedEmployee: employeeId => employeeId === 'A12345',
    privateDashboardUserByEmployeeId: () => ({
      sheet: {},
      user: { _row: 2, status: 'active', device_id: 'device-123456789012' },
    }),
    PRIVATE_DASHBOARD_USERS_HEADERS: [],
    privateDashboardWriteObject: () => {},
    privateDashboardHash: value => digest('sha256', String(value || '')).map(byte => ('0' + byte.toString(16)).slice(-2)).join(''),
    privateDashboardAdminAuthorized: payload => {
      if (String((payload || {}).adminSecret || '') !== 'admin-secret') throw new Error('管理者驗證失敗');
    },
    reportUploadAuthorize_: payload => {
      context.privateDashboardAdminAuthorized(payload);
      const employeeId = context.privateDashboardCleanEmployeeId((payload || {}).employeeId);
      if (employeeId !== 'A12345') throw new Error('此員編未被授權使用戰報快速更新');
      return employeeId;
    },
    reportVersionHash_: input => digest('md5', typeof input === 'string' ? input : Buffer.from(input)).map(byte => ('0' + byte.toString(16)).slice(-2)).join(''),
    MimeType: { PLAIN_TEXT: 'text/plain' },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'threec-price-diff-core.js'), 'utf8'), context);
  vm.runInContext(threecBlock, context);
  return {
    context,
    properties,
    files,
    folder,
    get registryWrites() { return registryWrites; },
    get createdFileCount() { return files.size; },
    markRegistryWrite() { registryWrites += 1; },
    auth: { employeeId: 'A12345', adminSecret: 'admin-secret' },
  };
}

function shoppingSnapshot({ date = '2026-09-22', hash = 'a'.repeat(64), rows = 2031, excluded = 50 } = {}) {
  const list = Array.from({ length: rows }, (_, index) => ({
    source_sheet: '價格表',
    source_row_number: index + 1,
    brand: 'Apple',
    code: 'A-' + String(index + 1).padStart(4, '0'),
    model: 'iPhone ' + String(index + 1),
    colorless_model: 'iPhone ' + String(index + 1),
    retail_price: '0',
    project_prices: { '999H': '0' },
  }));
  return {
    schema_version: 'threec-normalized-snapshot/v1',
    kind: 'shopping',
    source_version_date: date,
    source_file_name: date.replace(/-/g, '') + '-shopping.xlsx',
    source_file_sha256: hash,
    parser_version: 'test-parser',
    internal_source_dates: [],
    source_row_count: rows + excluded,
    row_count: rows,
    excluded_no_price_count: excluded,
    query_model_count: rows,
    quote_conflict_count: 0,
    rows: list,
  };
}

function tradeinSnapshot({ date = '2026-09-16', hash = 'f'.repeat(64), rows = 496, conflicts = 0 } = {}) {
  const providers = ['點子行動', 'FutureDial（FDI）'];
  const grades = ['S', 'A', 'B', 'C'];
  const quote = {};
  providers.forEach(provider => {
    quote[provider] = {};
    grades.forEach(grade => { quote[provider][grade] = '100'; });
  });
  return {
    schema_version: 'threec-normalized-snapshot/v1',
    kind: 'tradein',
    source_version_date: date,
    source_file_name: date.replace(/-/g, '') + '-tradein.xlsx',
    source_file_sha256: hash,
    parser_version: 'test-parser',
    internal_source_dates: [],
    source_row_count: rows,
    row_count: rows,
    excluded_no_price_count: 0,
    query_model_count: rows,
    quote_conflict_count: conflicts,
    rows: Array.from({ length: rows }, (_, index) => ({
      source_sheet: '舊換新',
      brand: 'Apple',
      model: 'iPhone ' + String(index + 1),
      quotes: JSON.parse(JSON.stringify(quote)),
    })),
  };
}

function publish(env, snapshot, extra = {}) {
  return env.context.threecPublish({
    ...env.auth,
    confirmPublish: true,
    snapshotJson: JSON.stringify(snapshot),
    ...extra,
  });
}

test('首次發布會寫入快照、讀回並切換 active，未確認不得寫入', () => {
  const env = runtime();
  const snapshot = shoppingSnapshot();
  assert.throws(() => env.context.threecPublish({ ...env.auth, snapshotJson: JSON.stringify(snapshot) }), /明確確認/);
  assert.equal(env.createdFileCount, 0);
  const result = publish(env, snapshot);
  assert.equal(result.status, 'published');
  assert.equal(result.registry.shopping.active.source_version_date, '2026-09-22');
  assert.equal(result.registry.shopping.active.row_count, 2031);
  assert.equal(env.properties.get('THREEC_REGISTRY_FILE_ID'), 'file-2');
  assert.equal(env.createdFileCount, 2, 'snapshot plus registry must both be persisted');
  const readback = env.context.threecSnapshotRead({ ...env.auth, kind: 'shopping', deviceId: 'device-123456789012' });
  assert.equal(readback.snapshot.source_version_date, '2026-09-22');
  assert.equal(readback.snapshot.row_count, 2031);
  assert.match(readback.snapshot.snapshot_hash, /^[a-f0-9]{32}$/);
});

test('舊換新首次基線可發布並讀回，報價衝突一律拒絕且不寫入', () => {
  const env = runtime();
  const snapshot = tradeinSnapshot();
  assert.throws(() => env.context.threecPublish({ ...env.auth, snapshotJson: JSON.stringify(snapshot) }), /明確確認/);
  assert.equal(env.createdFileCount, 0);
  const published = publish(env, snapshot);
  assert.equal(published.status, 'published');
  const registry = env.context.threecRegistry_();
  assert.equal(registry.kinds.tradein.active.source_version_date, '2026-09-16');
  assert.equal(registry.kinds.tradein.active.row_count, 496);
  const readback = env.context.threecSnapshotRead({ ...env.auth, kind: 'tradein', deviceId: 'device-123456789012' });
  assert.equal(readback.snapshot.kind, 'tradein');
  assert.equal(readback.snapshot.rows.length, 496);

  const filesAfterInitial = env.createdFileCount;
  assert.throws(() => publish(env, tradeinSnapshot({ date: '2026-09-17', hash: 'e'.repeat(64), rows: 1, conflicts: 1 })), /報價衝突/);
  assert.equal(env.createdFileCount, filesAfterInitial);
  assert.equal(env.context.threecRegistry_().kinds.tradein.active.source_version_date, '2026-09-16');
});

test('舊日期、同雜湊 noop 與同日異雜湊二次確認都不會繞過 active gate', () => {
  const env = runtime();
  const first = shoppingSnapshot();
  publish(env, first);
  const pointer = env.properties.get('THREEC_REGISTRY_FILE_ID');
  const filesAfterInitial = env.createdFileCount;

  assert.throws(() => publish(env, shoppingSnapshot({ date: '2026-09-21', hash: 'b'.repeat(64), rows: 1, excluded: 0 })), /較舊檔名日期/);
  assert.equal(env.properties.get('THREEC_REGISTRY_FILE_ID'), pointer);
  assert.equal(env.createdFileCount, filesAfterInitial);

  const noop = publish(env, first);
  assert.equal(noop.status, 'already_current');
  assert.equal(env.createdFileCount, filesAfterInitial + 1, '首次無異動核對只新增 registry，保留價格快照');
  const pointerAfterCheck = env.properties.get('THREEC_REGISTRY_FILE_ID');
  const activeAfterCheck = env.context.threecRegistry_().kinds.shopping.active;
  assert.equal(activeAfterCheck.snapshot_file_id, 'file-1');
  assert.equal(noop.changeSet.counts.changed, 0);
  assert.equal(noop.changeSet.counts.added, 0);
  assert.ok(noop.changeSet.counts.unchanged > 0);
  publish(env, first);
  assert.equal(env.properties.get('THREEC_REGISTRY_FILE_ID'), pointerAfterCheck, '重複核對不再新增 registry');

  const replacement = shoppingSnapshot({ hash: 'c'.repeat(64) });
  replacement.rows[0].project_prices['999H'] = '15000';
  const confirmation = publish(env, replacement);
  assert.equal(confirmation.status, 'confirmation_required');
  assert.equal(env.createdFileCount, filesAfterInitial + 1);
  const replaced = publish(env, replacement, { confirmSameDateHashChange: true });
  assert.equal(replaced.status, 'published');
  const replacedRegistry = env.context.threecRegistry_();
  assert.equal(replacedRegistry.kinds.shopping.previous.snapshot_file_id, 'file-1');
  assert.notEqual(replacedRegistry.kinds.shopping.active.snapshot_file_id, replacedRegistry.kinds.shopping.previous.snapshot_file_id);
});

test('快照讀回失敗時 active 維持原版，rollback 只交換 active／previous 指標', () => {
  const env = runtime();
  publish(env, shoppingSnapshot());
  const firstActive = env.context.threecRegistry_().kinds.shopping.active.snapshot_file_id;
  env.folder.corruptNextSnapshotRead = true;
  assert.throws(() => publish(env, shoppingSnapshot({ date: '2026-09-23', hash: 'd'.repeat(64), rows: 1, excluded: 0 })), /(格式不正確|讀回失敗)/);
  const afterFailure = env.context.threecRegistry_();
  assert.equal(afterFailure.kinds.shopping.active.snapshot_file_id, firstActive);

  publish(env, shoppingSnapshot({ date: '2026-09-23', hash: 'e'.repeat(64), rows: 1, excluded: 0 }));
  const secondActive = env.context.threecRegistry_().kinds.shopping.active.snapshot_file_id;
  const rolled = env.context.threecRollback({ ...env.auth, kind: 'shopping' });
  const rolledRegistry = env.context.threecRegistry_();
  assert.equal(rolled.status, 'rolled_back');
  assert.equal(rolledRegistry.kinds.shopping.active.snapshot_file_id, firstActive);
  assert.equal(rolledRegistry.kinds.shopping.previous.snapshot_file_id, secondActive);
});

test('資料夾名稱或分享狀態不符時拒絕存取，不建立 registry', () => {
  for (const options of [{ folderName: '錯誤名稱' }, { folderSharing: 'ANYONE_WITH_LINK' }]) {
    const env = runtime(options);
    assert.throws(() => env.context.threecStatus(env.auth), /資料夾.*(名稱不符|不是私有)/);
    assert.throws(() => publish(env, shoppingSnapshot()), /資料夾.*(名稱不符|不是私有)/);
    assert.equal(env.properties.has('THREEC_REGISTRY_FILE_ID'), false);
    assert.equal(env.createdFileCount, 0);
  }
});

test('正確千分位價格轉成純數字，零元與空白保留，異常格式仍拒絕', () => {
  const env = runtime();
  for (const [input, expected] of [['1,234','1234'], ['12,345.00','12345.00'], ['1,234,567.5','1234567.5'], [' 1,000 ','1000'], ['0','0'], ['0.00','0.00'], ['','']]) {
    assert.equal(env.context.threecPriceField_(input,'測試價',true),expected);
  }
  for (const input of ['1,23','1234,567','1,,000','1,000,','1 000','-1,000','-0','(1,000)','NT$1,000','Infinity','NaN','1e3','0xFF','1.234,56']) {
    assert.throws(()=>env.context.threecPriceField_(input,'測試價',true),/有效的非負價格/,input);
  }
  assert.throws(()=>env.context.threecPriceField_('','測試價',false),/不得為空/);
  assert.equal(env.createdFileCount,0);
});

test('千分位 3C 快照可發布讀回，來源雜湊及既有舊換新 active 不變', () => {
  const env = runtime();
  publish(env,tradeinSnapshot());
  const tradeinActive = env.context.threecRegistry_().kinds.tradein.active.snapshot_file_id;
  const snapshot=shoppingSnapshot();
  snapshot.rows[0].retail_price='12,345';
  snapshot.rows[0].project_prices['999H']='1,234.00';
  snapshot.rows[1].project_prices['999H']='0';
  const result=publish(env,snapshot);
  assert.equal(result.status,'published');
  const readback=env.context.threecSnapshotRead({...env.auth,kind:'shopping',deviceId:'device-123456789012'}).snapshot;
  assert.equal(readback.rows[0].retail_price,'12345');
  assert.equal(readback.rows[0].project_prices['999H'],'1234.00');
  assert.equal(readback.rows[1].project_prices['999H'],'0');
  assert.equal(readback.source_file_sha256,snapshot.source_file_sha256);
  assert.equal(env.context.threecRegistry_().kinds.tradein.active.snapshot_file_id,tradeinActive);
});

test('錯誤價格仍在 Drive 寫入之前 fail closed，不移除資料或補零', () => {
  const env=runtime();
  publish(env,tradeinSnapshot());
  const pointer=env.properties.get('THREEC_REGISTRY_FILE_ID');
  const count=env.createdFileCount;
  for(const input of ['1,23','-1,000','尚未提供']) {
    const snapshot=shoppingSnapshot();snapshot.rows[0].project_prices['999H']=input;
    assert.throws(()=>publish(env,snapshot),/有效的非負價格/);
    assert.equal(env.createdFileCount,count);
    assert.equal(env.properties.get('THREEC_REGISTRY_FILE_ID'),pointer);
    assert.equal(env.context.threecRegistry_().kinds.shopping.active,null);
  }
});

test('真實 SheetJS 格式化 XLSX 經 Work 解析及後端正規化不改價值', async () => {
  const XLSX=require('../assets/vendor/xlsx.full.min.js');
  const Core=require('../tradein-import-core.js');
  const sheet=XLSX.utils.aoa_to_sheet([
    ['廠牌','代碼','機型','單機價','999H'],
    ['品牌甲','A-001','測試機型甲',12345,1234],
    ['品牌甲','A-002','測試機型乙',0,0],
    ['品牌甲','A-003','測試機型丙','','']
  ]);
  sheet.D2.z='#,##0';sheet.E2.z='#,##0.00';
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,sheet,'格式測試');
  const bytes=XLSX.write(book,{type:'buffer',bookType:'xlsx'});
  const parsed=await Core.parseFile({name:'20260929-format-test.xlsx',size:bytes.length,arrayBuffer:async()=>bytes},XLSX,'shopping');
  const incoming=Core.buildPublishSnapshot('shopping',parsed);
  assert.equal(incoming.rows[0].retail_price,'12,345');
  assert.equal(incoming.rows[0].project_prices['999H'],'1,234.00');
  const normalized=runtime().context.threecNormalizeIncomingSnapshot_(incoming);
  assert.equal(normalized.rows[0].retail_price,'12345');
  assert.equal(normalized.rows[0].project_prices['999H'],'1234.00');
  assert.equal(normalized.rows[1].retail_price,'0');
  assert.equal(normalized.row_count,2);assert.equal(normalized.excluded_no_price_count,1);
});


test('歷史日期也依當次來源筆數驗證，不沿用固定2031/496', () => {
  const env = runtime();
  publish(env, shoppingSnapshot({rows:2, excluded:0}));
  publish(env, tradeinSnapshot({rows:3}));
  assert.equal(env.context.threec_readback({...env.auth, kind:'shopping'}).snapshot.row_count, 2);
  assert.equal(env.context.threec_readback({...env.auth, kind:'tradein'}).snapshot.row_count, 3);
  assert.throws(() => env.context.threec_readback({employeeId:'A12345', kind:'shopping'}), /管理者驗證失敗/);
});

test('正式讀取必須核對registry与快照來源版本一致，門市不能發布', () => {
  const env = runtime();
  publish(env, shoppingSnapshot({rows:2, excluded:0}));
  assert.throws(() => env.context.threec_publish({employeeId:'B12345', deviceId:'device-123456789012', confirmPublish:true}), /管理者驗證失敗/);
  const registryFile = env.files.get(env.properties.get('THREEC_REGISTRY_FILE_ID'));
  const registry = JSON.parse(registryFile.content);
  registry.kinds.shopping.active.source_version_date = '2026-09-23';
  registryFile.content = JSON.stringify(registry);
  assert.throws(() => env.context.threecSnapshotRead({employeeId:'A12345', deviceId:'device-123456789012',kind:'shopping'}), /版本驗證失敗/);
});


test('來源XLSX→解析預覽→後端發布及讀回→查詢模型逐價相同，兩商各等級不錯位', async () => {
  const XLSX = require('../assets/vendor/xlsx.full.min.js');
  const Parser = require('../tradein-import-core.js');
  const Query = require('../threec-query-core.js');
  const data = [
    ['', '', '點子行動舊機回收報價', '', '', '', 'FutureDial(FDI)舊機回收報價'],
    ['品牌', '機款'],
    ['', '', '報價(S等級)', '報價(A等級)', '報價(B等級)', '報價(C等級)', '報價(S等級)', '報價(A等級)', '報價(B等級)', '報價(C等級)'],
    ['APPLE', 'iPhone test 256G',12345,0,'',1100,12001,2200,3300,'']
  ];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(data), '回收價');
  const bytes = XLSX.write(book, {type:'buffer', bookType:'xlsx'});
  const parsed = await Parser.parseFile({name:'兩家回收20261001.xlsx',size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)}, XLSX, 'tradein');
  const preview = Parser.buildPublishSnapshot('tradein', parsed);
  const env = runtime(); publish(env, preview);
  const formal = env.context.threec_readback({...env.auth,kind:'tradein'});
  const view = Query.buildView('tradein', JSON.parse(JSON.stringify(formal)), {});
  assert.equal(view.rows.length, 1);
  for (const provider of Object.keys(preview.rows[0].quotes)) for (const grade of Query.providerGrades(provider)) {
    assert.equal(Query.formatPrice(view.rows[0].quotes[provider][grade]), Query.formatPrice(preview.rows[0].quotes[provider][grade]));
  }
  assert.equal(Query.priceState(view.rows[0].quotes['點子行動'].A).zero, true);
  assert.equal(Query.priceState(view.rows[0].quotes['點子行動'].B).missing, true);
  assert.notEqual(view.rows[0].quotes['點子行動'].S, view.rows[0].quotes['FutureDial（FDI）'].S);
});


test('全語意相同的新日期來源只保存核對紀錄；更舊來源不得回退核對版本', () => {
  const env = runtime();
  const first = shoppingSnapshot({ rows:2, excluded:0 });
  publish(env, first);
  const original = env.context.threecRegistry_().kinds.shopping.active.snapshot_file_id;
  const fresh = shoppingSnapshot({ date:'2026-09-24', hash:'b'.repeat(64), rows:2, excluded:0 });
  fresh.rows.reverse();
  const result = publish(env, fresh);
  assert.equal(result.status, 'already_current');
  assert.equal(result.changeSet.counts.changed, 0);
  assert.equal(result.changeSet.counts.added, 0);
  assert.equal(result.updateCheck.source_version_date, '2026-09-24');
  assert.equal(env.createdFileCount, 3, 'one price snapshot and two registry files');
  assert.equal(env.context.threecRegistry_().kinds.shopping.active.snapshot_file_id, original);
  assert.throws(() => publish(env, shoppingSnapshot({ date:'2026-09-23', hash:'c'.repeat(64), rows:2, excluded:0 })), /較舊檔名日期/);
  assert.equal(env.createdFileCount, 3);
});

test('伺服器預覽與發布綁定 active 雜湊，完整条件異動與分頁搜尋讀回一致', () => {
  const env = runtime();
  const first = shoppingSnapshot({ rows:2, excluded:0 });
  first.rows.forEach(row => { row.project_prices['999H'] = '100'; });
  publish(env, first);
  const next = shoppingSnapshot({ date:'2026-09-23', hash:'b'.repeat(64), rows:2, excluded:0 });
  next.rows[0].project_prices['999H'] = '0';
  next.rows[1].project_prices['999H'] = '';
  const preview = env.context.threec_diff_preview({ ...env.auth, snapshotJson:JSON.stringify(next) });
  assert.equal(preview.changeSet.counts.changed, 2);
  assert.equal(preview.changeSet.counts.unchanged, 2);
  assert.throws(() => publish(env, next, { requiresDiffCheck:true, expectedActiveHash:'stale' }), /active 已變動/);
  assert.equal(env.createdFileCount, 2);
  const result = publish(env, next, { requiresDiffCheck:true, expectedActiveHash:preview.basis.snapshot_hash });
  assert.equal(result.changeSet.counts.changed, 2);
  const readback = env.context.threec_readback({ ...env.auth, kind:'shopping' });
  const a = env.context.threec_changes_read({ ...env.auth, kind:'shopping', limit:1, snapshotHash:readback.snapshot.snapshot_hash });
  const b = env.context.threecChangesRead({ ...env.auth, kind:'shopping', deviceId:'device-123456789012', limit:1, offset:1, snapshotHash:readback.snapshot.snapshot_hash });
  assert.equal(a.changeSet.changeCount, 2);
  assert.equal(a.changeSet.hasMore, true);
  assert.notEqual(a.changeSet.changes[0].model, b.changeSet.changes[0].model);
  assert.equal(b.changeSet.hasMore, false);
  const searched = env.context.threec_changes_read({ ...env.auth, kind:'shopping', search:next.rows[1].model });
  assert.equal(searched.changeSet.changeCount, 1);
  assert.equal(searched.changeSet.counts.changed, 2);
  assert.throws(() => env.context.threec_changes_read({ ...env.auth, kind:'shopping', snapshotHash:preview.basis.snapshot_hash }), /正式版本已變動/);
});

test('歷史 v74 人工欄序只在已知解析器版本正規化，價格與完整方案不變', () => {
  const env = runtime();
  const snapshot = shoppingSnapshot({ rows:1, excluded:0 });
  snapshot.parser_version = '2026.09.28-private-registry-1';
  snapshot.rows[0].project_prices = { '5G(24)新申裝／999H (2)':'1,234', '5G(36)續約／999H (3)':'0' };
  const legacy = env.context.threecNormalizeIncomingSnapshot_(snapshot);
  assert.equal(legacy.rows[0].project_prices['5G(24)新申裝／999H'], '1234');
  assert.equal(legacy.rows[0].project_prices['5G(36)續約／999H'], '0');
  snapshot.parser_version = 'new-parser';
  const modern = env.context.threecNormalizeIncomingSnapshot_(snapshot);
  assert.equal(modern.rows[0].project_prices['5G(24)新申裝／999H (2)'], '1234');
});

test('首版回復空檢查點，再回復可找回首版；不偽造前版價格', () => {
  const env = runtime();
  publish(env, shoppingSnapshot({ rows:1, excluded:0 }));
  const original = env.context.threecRegistry_().kinds.shopping.active.snapshot_file_id;
  assert.equal(env.context.threecStatus(env.auth).registry.shopping.can_rollback, true);
  env.context.threecRollback({ ...env.auth, kind:'shopping' });
  assert.equal(env.context.threecRegistry_().kinds.shopping.active, null);
  assert.equal(env.context.threecRegistry_().kinds.shopping.previous.snapshot_file_id, original);
  env.context.threecRollback({ ...env.auth, kind:'shopping' });
  assert.equal(env.context.threecRegistry_().kinds.shopping.active.snapshot_file_id, original);
  assert.equal(env.context.threec_readback({ ...env.auth, kind:'shopping' }).changeSet.firstRelease, true);
});


test('anonymous visitors can read prices and changes but cannot publish or roll back', () => {
  const env = runtime();
  const snapshot = shoppingSnapshot();
  publish(env, snapshot);
  const readback = env.context.threecSnapshotRead({ kind:'shopping' });
  assert.equal(readback.snapshot.row_count, snapshot.rows.length);
  assert.equal(env.context.threecChangesRead({ kind:'shopping', snapshotHash:readback.snapshot.snapshot_hash }).snapshotHash, readback.snapshot.snapshot_hash);
  assert.throws(() => env.context.threecPublish({ confirmPublish:true, snapshotJson:JSON.stringify(snapshot) }));
  assert.throws(() => env.context.threecRollback({ kind:'shopping' }));
  assert.throws(() => env.context.threecChangesRead({ kind:'shopping', snapshotHash:'stale-version' }), /正式版本已變動/);
});

test('public price projections allow only query fields and never registry, identities or management metadata',()=>{
 const env=runtime();publish(env,shoppingSnapshot({rows:2,excluded:0}));publish(env,tradeinSnapshot({rows:2}));
 const count=env.createdFileCount;
 for(const kind of ['shopping','tradein']){
  const result=JSON.parse(JSON.stringify(env.context.threecSnapshotRead({kind})));
  assert.deepEqual(Object.keys(result).sort(),['changeSet','snapshot','updateCheck']);
  assert.doesNotMatch(JSON.stringify(result),/operator_hash|employeeId|deviceId|snapshot_file_id|can_rollback|rowRefs|sourceVariants|registry/);
  assert.deepEqual(Object.keys(result.snapshot).sort(),['schema_version','kind','source_version_date','source_file_sha256','source_row_count','row_count','excluded_no_price_count','query_model_count','quote_conflict_count','published_at','snapshot_hash','rows'].sort());
  for(const row of result.snapshot.rows) assert.deepEqual(Object.keys(row).sort(),(kind==='shopping'?['source_sheet','brand','code','model','colorless_model','retail_price','project_prices']:['source_sheet','brand','model','quotes']).sort());
  const diff=env.context.threecChangesRead({kind,snapshotHash:result.snapshot.snapshot_hash});
  assert.deepEqual(Object.keys(diff).sort(),['changeSet','snapshotHash','updateCheck']);
  for(const row of diff.changeSet.changePage)assert.ok(Object.keys(row).every(k=>['status','kind','model','modelCapacity','dimension','plan','condition','provider','grade','before','after','sourceModel','sourceCode'].includes(k)));
  assert.throws(()=>env.context.threec_publish({kind,confirmPublish:true}),/管理者驗證失敗/);
  assert.throws(()=>env.context.threec_rollback({kind}),/管理者驗證失敗/);
  assert.throws(()=>env.context.threec_readback({kind}),/管理者驗證失敗/);
 }
 assert.equal(env.createdFileCount,count);
});

test('三商來源未分級完整模擬發布/公開讀回；未知商或把未分級塞舊雙商均拒絕且不寫',()=>{
 const env=runtime(),input=tradeinSnapshot();input.rows[0].quotes['愛鋒派']={S:null,A:'600',B:null,C:null,'未分級':'0'};
 publish(env,input);const response=env.context.threecSnapshotRead({kind:'tradein'});
 assert.equal(response.snapshot.rows[0].quotes['愛鋒派']['未分級'],'0');assert.equal(response.snapshot.rows[0].quotes['愛鋒派'].A,'600');assert.equal(response.snapshot.rows[0].quotes['點子行動'].A,'100');
 for(const mutate of [s=>s.rows[0].quotes['未知商']={S:1,A:2,B:3,C:4},s=>s.rows[0].quotes['點子行動']['未分級']=100,s=>delete s.rows[0].quotes['愛鋒派']['未分級']]){
  const bad=JSON.parse(JSON.stringify(input));mutate(bad);assert.throws(()=>env.context.threecNormalizeIncomingSnapshot_(bad));
 }
});

test('手機來源目錄另列稽核，價格/缺价/目錄加總守恆，容量仍有上限',()=>{
 const env=runtime(),input=shoppingSnapshot();input.catalog_row_count=3;input.source_row_count+=3;
 const normalized=env.context.threecNormalizeIncomingSnapshot_(input);assert.equal(normalized.catalog_row_count,3);
 assert.throws(()=>env.context.threecNormalizeIncomingSnapshot_({...input,catalog_row_count:4}),/來源筆數/);
 assert.throws(()=>env.context.threecNormalizeIncomingSnapshot_({...input,catalog_row_count:-1}),/目錄/);
 assert.throws(()=>env.context.threecNormalizeIncomingSnapshot_({...input,rows:Array(20001).fill(input.rows[0])}),/筆數/);
 const legacy=env.context.threecNormalizeIncomingSnapshot_(shoppingSnapshot());assert.equal(Object.hasOwn(legacy,'catalog_row_count'),false);
});
