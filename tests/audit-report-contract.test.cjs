const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'audit-report.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'audit-report.js'), 'utf8');
const submitJs = fs.readFileSync(path.join(root, 'audit-report-submit.js'), 'utf8');
const supervisorJs = fs.readFileSync(path.join(root, 'audit-report-supervisor.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'audit-report.css'), 'utf8');
const code = fs.readFileSync(path.join(root, 'gas/Code.gs'), 'utf8');
const auditSources = ['gas/AuditReport.gs', 'gas/AuditReportStore.gs', 'gas/AuditReportReview.gs']
  .map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z4JcAAAAASUVORK5CYII=', 'base64');

const STORES = [
  ['DNB10062', '台北酒泉'], ['DNB10082', '台北永吉'], ['DNB10094', '台北復興南'],
  ['DNB10146', '台北杭州南'], ['DNB10168', '台北萬大'], ['DNB10174', '台北通化'],
  ['DNB10284', '台北大稻埕'], ['DNB10307', '台北三創'], ['DNB10440', '台北六張犁']
].map(([code, name]) => ({ code, name }));

class Range {
  constructor(sheet, row, col, rows, cols) { Object.assign(this, { sheet, row, col, rows, cols }); }
  getDisplayValues() {
    return Array.from({ length: this.rows }, (_, r) => Array.from({ length: this.cols }, (_, c) => String(this.sheet.data[this.row - 1 + r]?.[this.col - 1 + c] ?? '')));
  }
  setValues(values) {
    values.forEach((line, r) => line.forEach((value, c) => {
      const row = this.row - 1 + r;
      this.sheet.data[row] ||= [];
      this.sheet.data[row][this.col - 1 + c] = value;
    }));
    return this;
  }
  setValue(value) { return this.setValues([[value]]); }
}

class Sheet {
  constructor(name) { this.name = name; this.data = []; }
  getLastColumn() { return this.data.reduce((max, row) => Math.max(max, row.length), 0); }
  getLastRow() {
    let last = 0;
    this.data.forEach((row, index) => { if (row.some(value => String(value ?? '') !== '')) last = index + 1; });
    return last;
  }
  getRange(row, col, rows = 1, cols = 1) { return new Range(this, row, col, rows, cols); }
  appendRow(row) { this.data.push(row.slice()); }
  setFrozenRows() {}
}

class Spreadsheet {
  constructor() { this.sheets = new Map(); }
  getSheetByName(name) { return this.sheets.get(name) || null; }
  insertSheet(name) { const sheet = new Sheet(name); this.sheets.set(name, sheet); return sheet; }
}

function harness() {
  const spreadsheet = new Spreadsheet();
  const properties = new Map([['AUDIT_REPORT_FOLDER_ID', 'audit-root']]);
  const files = new Map();
  function makeFolder(id) {
    return {
      id, children: new Map(), getId() { return this.id; },
      getFoldersByName(name) { const folder = this.children.get(name); return { hasNext: () => Boolean(folder), next: () => folder }; },
      createFolder(name) { const folder = makeFolder(`${this.id}/${name}`); this.children.set(name, folder); return folder; },
      createFile(blob) {
        const file = { id: `drive-file-${files.size + 1}`, blob, trashed: false, getId() { return this.id; }, getName() { return this.blob.getName(); }, getBlob() { return this.blob; }, setTrashed(value) { this.trashed = value; } };
        files.set(file.id, file);
        return file;
      }
    };
  }
  const rootFolder = makeFolder('audit-root');
  let uuid = 0;
  const context = {
    console,
    SPREADSHEET_ID: 'audit-test-sheet',
    PT_STORES: STORES,
    SpreadsheetApp: { openById: () => spreadsheet, flush() {} },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => properties.get(key) || '', setProperty: (key, value) => properties.set(key, value) }) },
    Utilities: {
      formatDate: () => '2026-08-21T14:30:00+08:00',
      getUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}`,
      computeDigest: (_algorithm, value) => Array.from(crypto.createHash('sha256').update(String(value)).digest()).map(value => value > 127 ? value - 256 : value),
      DigestAlgorithm: { SHA_256: 'sha256' },
      base64Decode: value => Array.from(Buffer.from(String(value), 'base64')),
      base64Encode: value => Buffer.from(value).toString('base64'),
      newBlob: (bytes, mimeType, name) => ({ getBytes: () => Array.from(bytes), getContentType: () => mimeType, getName: () => name })
    },
    DriveApp: {
      getFolderById: id => { if (id !== 'audit-root') throw new Error('unknown folder'); return rootFolder; },
      getFileById: id => { const file = files.get(id); if (!file) throw new Error('unknown file'); return file; }
    },
    ptSessionAuthorized_: token => token === 'pt-valid-token-1234567890'
  };
  vm.createContext(context);
  for (const file of ['gas/AuditReport.gs', 'gas/AuditReportStore.gs', 'gas/AuditReportReview.gs']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  vm.runInContext(`
    auditEnsureSheet_(AUDIT_BATCH_SHEET, AUDIT_BATCH_FIELDS);
    auditEnsureSheet_(AUDIT_SUBMISSION_SHEET, AUDIT_SUBMISSION_FIELDS);
    auditEnsureSheet_(AUDIT_PHOTO_SHEET, AUDIT_PHOTO_FIELDS);
    auditEnsureSheet_(AUDIT_EVENT_SHEET, AUDIT_EVENT_FIELDS);
    auditAppend_(auditSpreadsheet_().getSheetByName(AUDIT_BATCH_SHEET), AUDIT_BATCH_FIELDS, {
      batch_id: 'audit-cleaning-202608', batch_name: '稽核前環境清潔確認', starts_on: '2026-08-20',
      due_on: '2026-08-31', active: 'TRUE', created_at: auditNow_(), updated_at: auditNow_()
    });
  `, context);
  return { context, spreadsheet, files };
}

function base(overrides = {}) {
  return {
    batch_id: 'audit-cleaning-202608', submission_id: 'submission_self_report_123456789012345',
    edit_token: 'edit_token_self_report_123456789012345678901234', store_id: 'DNB10307',
    inspector_name: '王小明', employee_id: 'EMP1234', ...overrides
  };
}
function start(context, payload = base()) { return context.auditStart(payload); }
function upload(context, payload, itemId, clientPhotoId) {
  return context.auditUploadPhoto({ ...payload, item_id: itemId, client_photo_id: clientPhotoId, note: '', file: { name: `${clientPhotoId}.png`, type: 'image/png', base64: PNG.toString('base64') } });
}
function rows(sheet) {
  const [headers, ...values] = sheet.data;
  return values.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
}

test('self-report public contract exposes exactly nine editable canonical stores and three required fields', () => {
  assert.match(html, /id="storeSelect"[^>]*required/);
  assert.doesNotMatch(html, /id="storeSelect"[^>]*disabled/);
  assert.match(html, /id="inspectorName"[^>]*required/);
  assert.match(html, /id="storeEmployeeId"[^>]*required/);
  assert.match(js, /const EMPLOYEE_ID_KEY/);
  assert.match(js, /const MAX_PHOTOS=10/);
  assert.match(js, /indexedDB\.open\(DB_NAME,1\)/);
  assert.match(css, /@media\(max-width:400px\)/);
  assert.doesNotMatch(html + js + submitJs + supervisorJs, /核准裝置|Approved Device|audit-only|roster probe|名冊測試|storeAuthButton|storeAuthMessage/i);
  assert.doesNotMatch(auditSources, /auditStoreSession_|auditAssertStoreSession_|STORE_SESSION_KEY|AUDIT_STORE_SESSION_TTL_SECONDS|CacheService/);
  assert.doesNotMatch(auditSources, /function\s+auditSubmitAuth\b|function\s+auditRosterProbe\b/);
  assert.match(html, /type="file" accept="image\/\*" multiple/);
  assert.doesNotMatch(html + js + submitJs, /drive\.google\.com\/file\/d\/|photo_file_id\s*:/);
});

test('audit config returns the nine canonical store values and no private fields', () => {
  const { context } = harness();
  const config = context.auditPublicConfig();
  assert.equal(config.mode, 'self-report');
  assert.equal(config.identityVerification, false);
  assert.deepEqual(Array.from(config.stores, store => [store.store_id, store.store_name]), STORES.map(store => [store.code, store.name]));
  assert.equal(config.items.length, 3);
  assert.doesNotMatch(JSON.stringify(config), /edit_token|photo_file_id|private_url|folder_id|drive_id|employee_hash/i);
});

test('audit start requires store, actual name and normalized employee id without identity lookup', () => {
  const { context, spreadsheet } = harness();
  assert.throws(() => start(context, base({ store_id: '' })), /請選擇正確的門市/);
  assert.throws(() => start(context, base({ inspector_name: '   ' })), /請填寫檢查人員姓名/);
  assert.throws(() => start(context, base({ employee_id: '   ' })), /請填寫員工編號/);
  assert.throws(() => start(context, base({ employee_id: 'x' })), /員工編號格式不正確/);
  const created = start(context, base({ store_id: '台北三創', inspector_name: '  王小明  ', employee_id: ' emp-1234 ' }));
  assert.equal(created.store_id, 'DNB10307');
  assert.equal(created.store_name, '台北三創');
  assert.equal(created.inspector_name, '王小明');
  assert.equal(created.employee_id, 'EMP-1234');
  const submission = rows(spreadsheet.getSheetByName('稽核回報提交'))[0];
  assert.equal(submission.inspector_name, '王小明');
  assert.equal(submission.employee_id, 'EMP-1234');
  assert.ok(submission.edit_token_hash);
});

test('same batch and canonical store has one active submission; a cancelled row is the reset path', () => {
  const { context } = harness();
  start(context, base({ submission_id: 'submission_first_store_123456789012345' }));
  assert.throws(() => start(context, base({ submission_id: 'submission_second_store_123456789012345' })), /已有回報/);
  assert.throws(() => start(context, base({ submission_id: 'submission_bad_batch_123456789012345', batch_id: 'audit-old' })), /批次已更新/);
});

test('edit token owns only its submission and cannot cross submission or store', () => {
  const { context } = harness();
  const first = base({ submission_id: 'submission_owner_a_123456789012345', edit_token: 'edit_token_owner_a_123456789012345678901234', store_id: 'DNB10307' });
  const second = base({ submission_id: 'submission_owner_b_123456789012345', edit_token: 'edit_token_owner_b_123456789012345678901234', store_id: 'DNB10082' });
  start(context, first); start(context, second);
  assert.throws(() => context.auditOwnStatus({ submission_id: first.submission_id, edit_token: second.edit_token }), /找不到本次回報/);
  assert.throws(() => context.auditOwnStatus({ submission_id: second.submission_id, edit_token: first.edit_token }), /找不到本次回報/);
  assert.throws(() => context.auditUploadPhoto({ ...first, edit_token: second.edit_token, item_id: 'island_display', client_photo_id: 'cross_submission_photo_123456', file: { name: 'x.png', type: 'image/png', base64: PNG.toString('base64') } }), /找不到本次回報/);
});

test('submission, upload and submit are idempotent and persist employee/name across photo and timeline rows', () => {
  const { context, spreadsheet } = harness();
  const payload = base({ submission_id: 'submission_idempotent_123456789012345', inspector_name: '  王小明  ', employee_id: ' emp-1234 ' });
  const first = start(context, payload);
  const second = start(context, payload);
  assert.equal(first.submission_id, second.submission_id);
  for (const [index, item] of ['island_display', 'op_zone', 'counter_seating'].entries()) upload(context, payload, item, `client_photo_${index}_1234567890`);
  assert.equal(upload(context, payload, 'island_display', 'client_photo_0_1234567890').duplicate, true);
  const submitted = context.auditSubmit({ ...payload, notes: { island_display: '已整理', op_zone: '', counter_seating: '' } });
  assert.equal(submitted.submission_status, 'submitted');
  assert.equal(submitted.readback_verified, true);
  const submissionRows = rows(spreadsheet.getSheetByName('稽核回報提交'));
  const photoRows = rows(spreadsheet.getSheetByName('稽核回報'));
  const eventRows = rows(spreadsheet.getSheetByName('稽核回報紀錄'));
  assert.equal(submissionRows.length, 1); assert.equal(photoRows.length, 3);
  assert.ok(eventRows.some(row => row.event_type === 'submitted'));
  for (const row of [submissionRows[0], ...photoRows, ...eventRows]) assert.equal(row.inspector_name, '王小明');
  for (const row of [submissionRows[0], ...photoRows, ...eventRows]) assert.equal(row.employee_id, 'EMP-1234');
  assert.equal(context.auditSubmit({ ...payload, notes: {} }).readback_verified, true);
  assert.equal(rows(spreadsheet.getSheetByName('稽核回報')).length, 3);
});

test('private photo read requires protected supervisor PT or exact own edit token and never returns Drive identifiers', () => {
  const { context } = harness();
  const payload = base({ submission_id: 'submission_private_photo_123456789012345' });
  start(context, payload); upload(context, payload, 'island_display', 'client_private_photo_123456');
  assert.throws(() => context.auditPhotoRead({ submission_id: payload.submission_id, client_photo_id: 'client_private_photo_123456' }), /找不到本次回報|unauthorized|格式/);
  const own = context.auditPhotoRead({ submission_id: payload.submission_id, edit_token: payload.edit_token, client_photo_id: 'client_private_photo_123456' });
  const supervisor = context.auditPhotoRead({ token: 'pt-valid-token-1234567890', submission_id: payload.submission_id, client_photo_id: 'client_private_photo_123456' });
  assert.equal(own.mime_type, 'image/png'); assert.equal(own.base64, PNG.toString('base64')); assert.equal(supervisor.mime_type, 'image/png');
  assert.doesNotMatch(JSON.stringify({ own, supervisor }), /drive\.google\.com|photo_file_id|private_url|file_id/i);
  const clientPhotoFn = auditSources.match(/function\s+auditPhotoForClient_\(row\)\s*\{[\s\S]*?\n\}/)?.[0] || '';
  assert.doesNotMatch(clientPhotoFn, /photo_file_id|private_url/);
});

test('supervisor routes remain PT protected while audit token is not a supervisor session', () => {
  const { context } = harness();
  assert.throws(() => context.auditOverview({}), /unauthorized/);
  assert.throws(() => context.auditDetail({ submission_id: 'submission_missing_123456789012345' }), /unauthorized/);
  assert.match(auditSources, /function\s+auditSupervisorAuthorized_[\s\S]*ptSessionAuthorized_/);
  const overview = context.auditOverview({ token: 'pt-valid-token-1234567890' });
  assert.equal(overview.stores.length, 9);
  assert.doesNotMatch(JSON.stringify(overview), /photo_file_id|private_url|drive\.google/);
});

test('returned item alone can be reworked and original photo evidence remains', () => {
  const { context, spreadsheet } = harness();
  const payload = base({ submission_id: 'submission_rework_123456789012345' });
  start(context, payload);
  for (const [index, item] of ['island_display', 'op_zone', 'counter_seating'].entries()) upload(context, payload, item, `client_rework_${index}_1234567890`);
  context.auditSubmit({ ...payload, notes: {} });
  const returned = context.auditReview({ token: 'pt-valid-token-1234567890', submission_id: payload.submission_id, item_id: 'op_zone', decision: 'return', comment: '請補拍死角' });
  assert.equal(returned.submission_status, 'rework');
  assert.equal(returned.items.find(item => item.item_id === 'op_zone').status, 'rework');
  assert.throws(() => context.auditUploadPhoto({ ...payload, item_id: 'island_display', client_photo_id: 'blocked_rework_123456', file: { name: 'blocked.png', type: 'image/png', base64: PNG.toString('base64') } }), /未被退回/);
  upload(context, payload, 'op_zone', 'client_rework_new_1234567890');
  const resubmitted = context.auditSubmit({ ...payload, notes: { op_zone: '已補拍' } });
  assert.equal(resubmitted.submission_status, 'submitted');
  assert.ok(rows(spreadsheet.getSheetByName('稽核回報紀錄')).some(row => row.event_type === 'returned'));
  assert.ok(rows(spreadsheet.getSheetByName('稽核回報紀錄')).some(row => row.event_type === 'resubmitted'));
  assert.equal(rows(spreadsheet.getSheetByName('稽核回報')).filter(row => row.status !== 'deleted').length, 4);
});

test('cancel keeps submission, photos and timeline while allowing a new submission for the same store', () => {
  const { context, spreadsheet } = harness();
  const old = base({ submission_id: 'submission_cancel_old_123456789012345' });
  start(context, old); upload(context, old, 'island_display', 'client_cancel_photo_123456');
  const cancelled = context.auditCancel({ token: 'pt-valid-token-1234567890', submission_id: old.submission_id, comment: '重設測試' });
  assert.equal(cancelled.submission_status, 'cancelled'); assert.equal(cancelled.timeline.at(-1).event_type, 'cancelled');
  assert.equal(rows(spreadsheet.getSheetByName('稽核回報')).length, 1);
  const fresh = base({ submission_id: 'submission_cancel_new_123456789012345' });
  assert.equal(start(context, fresh).submission_status, 'draft');
  assert.equal(rows(spreadsheet.getSheetByName('稽核回報提交')).length, 2);
});

test('Code.gs dispatches self-report routes and does not expose a second store authorization path', () => {
  for (const action of ['audit_config', 'audit_start', 'audit_upload', 'audit_photo_delete', 'audit_submit', 'audit_status', 'audit_photo_read', 'audit_overview', 'audit_detail', 'audit_review', 'audit_cancel']) assert.match(code, new RegExp(action));
  assert.doesNotMatch(code, /STORE_SESSION_KEY|auditStoreSession_|auditAssertStoreSession_|audit_roster_probe/);
});

test('frontend photo lifecycle uses private Blob/Object URLs and preserves IndexedDB draft contract', () => {
  assert.match(js, /URL\.createObjectURL\(new Blob/); assert.match(js, /URL\.revokeObjectURL/);
  assert.match(js, /async function ensurePrivatePhoto\(/); assert.match(js + submitJs + supervisorJs, /Promise\.all/); assert.match(js + submitJs + supervisorJs, /pagehide|beforeunload/);
  assert.doesNotMatch(html + js + submitJs + supervisorJs, /drive\.google\.com\/file\/d\/|photo_file_id|private_url/);
  assert.match(html, /accept="image\/\*" multiple/); assert.match(js, /MAX_PHOTOS=10/);
});
