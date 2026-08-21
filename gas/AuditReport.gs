// ════════════════════════════════════
// 北一二B 稽核回報專區
//
// 暫行自助填報模式（2026-08-21）：
// - 門市端不要求裝置或名冊驗證，同仁自行選擇九店並輸入本人姓名、員編。
// - submission_id + edit token 仍作為該草稿／回報的 possession key，避免他人直接修改。
// - 督導九店總覽、照片明細、覆核與取消仍只接受既有 PT_TOKEN。
// - 照片仍只存私有 Drive，不暴露 file ID／Drive URL。
//
// 注意：這是臨時降低摩擦的模式，不提供身分真實性驗證；未來可再恢復或改版授權。
// ════════════════════════════════════

const AUDIT_BATCH_SHEET = '稽核批次';
const AUDIT_SUBMISSION_SHEET = '稽核回報提交';
const AUDIT_PHOTO_SHEET = '稽核回報';
const AUDIT_EVENT_SHEET = '稽核回報紀錄';
const AUDIT_INITIAL_BATCH = {
  batch_id: 'audit-cleaning-202608',
  batch_name: '稽核前環境清潔確認',
  starts_on: '2026-08-20',
  due_on: '2026-08-31',
  active: false
};
const AUDIT_CONTRACT = 'audit-cleaning-v2-self-report';
const AUDIT_MAX_PHOTOS_PER_ITEM = 10;
const AUDIT_MAX_PHOTO_BYTES = 10 * 1024 * 1024;

const AUDIT_ITEMS = [
  { item_id: 'island_display', item_name: '中島、展示機環境清潔' },
  { item_id: 'op_zone', item_name: 'OP 商品、專區清潔' },
  { item_id: 'counter_seating', item_name: '櫃台電腦後方／客戶座位區清潔' }
];

const AUDIT_CANONICAL_STORE_IDS = {
  '台北酒泉': 'DNB10062',
  '台北永吉': 'DNB10082',
  '台北復興南': 'DNB10094',
  '台北杭州南': 'DNB10146',
  '台北萬大': 'DNB10168',
  '台北通化': 'DNB10174',
  '台北大稻埕': 'DNB10284',
  '台北三創': 'DNB10307',
  '台北六張犁': 'DNB10440'
};

const AUDIT_BATCH_FIELDS = ['batch_id','batch_name','starts_on','due_on','active','created_at','updated_at'];
const AUDIT_SUBMISSION_FIELDS = [
  'batch_id','batch_name','submission_id','store_id','store_name','inspector_name','employee_id',
  'auth_employee_hash','edit_token_hash','status','submitted_at','reviewed_at','updated_at','revision','created_at'
];
const AUDIT_PHOTO_FIELDS = [
  'batch_id','batch_name','submission_id','store_id','store_name','inspector_name',
  'item_id','item_name','photo_file_id','private_url','photo_name','client_photo_id',
  'note','status','reviewer_comment','submitted_at','reviewed_at','updated_at','revision','created_at','employee_id'
];
const AUDIT_EVENT_FIELDS = [
  'event_id','event_key','batch_id','submission_id','store_id','store_name','inspector_name','item_id','item_name',
  'event_type','status','comment','actor','revision','created_at','employee_id'
];

function auditNow_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function auditHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || '')).map(function(byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function auditSpreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function auditEnsureSheet_(name, fields) {
  const ss = auditSpreadsheet_();
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  const width = Math.max(sheet.getLastColumn(), fields.length);
  const headers = width ? sheet.getRange(1, 1, 1, width).getDisplayValues()[0] : [];
  if (!headers.some(Boolean)) {
    sheet.getRange(1, 1, 1, fields.length).setValues([fields]);
    sheet.setFrozenRows(1);
    return sheet;
  }
  const missing = fields.filter(function(field) { return headers.indexOf(field) === -1; });
  if (missing.length) sheet.getRange(1, sheet.getLastColumn() + 1, 1, missing.length).setValues([missing]);
  return sheet;
}

function auditRows_(sheet, fields) {
  if (sheet.getLastRow() < 2) return [];
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getDisplayValues().map(function(values, index) {
    const row = { _row: index + 2 };
    fields.forEach(function(field) {
      const col = headers.indexOf(field);
      row[field] = col >= 0 ? values[col] : '';
    });
    return row;
  });
}

function auditAppend_(sheet, fields, value) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  sheet.appendRow(headers.map(function(field) {
    return fields.indexOf(field) >= 0 ? (value[field] == null ? '' : value[field]) : '';
  }));
}

function auditUpdateRow_(sheet, rowNumber, patch) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  Object.keys(patch).forEach(function(field) {
    const col = headers.indexOf(field);
    if (col >= 0) sheet.getRange(rowNumber, col + 1).setValue(patch[field] == null ? '' : patch[field]);
  });
}

function setupAuditReportStorage() {
  const now = auditNow_();
  const batchSheet = auditEnsureSheet_(AUDIT_BATCH_SHEET, AUDIT_BATCH_FIELDS);
  auditEnsureSheet_(AUDIT_SUBMISSION_SHEET, AUDIT_SUBMISSION_FIELDS);
  auditEnsureSheet_(AUDIT_PHOTO_SHEET, AUDIT_PHOTO_FIELDS);
  auditEnsureSheet_(AUDIT_EVENT_SHEET, AUDIT_EVENT_FIELDS);
  const batches = auditRows_(batchSheet, AUDIT_BATCH_FIELDS);
  if (!batches.some(function(row) { return row.batch_id === AUDIT_INITIAL_BATCH.batch_id; })) {
    auditAppend_(batchSheet, AUDIT_BATCH_FIELDS, {
      batch_id: AUDIT_INITIAL_BATCH.batch_id,
      batch_name: AUDIT_INITIAL_BATCH.batch_name,
      starts_on: AUDIT_INITIAL_BATCH.starts_on,
      due_on: AUDIT_INITIAL_BATCH.due_on,
      active: AUDIT_INITIAL_BATCH.active ? 'TRUE' : 'FALSE',
      created_at: now,
      updated_at: now
    });
  }
  const folder = auditRootFolder_();
  return { status: 'ok', batchId: AUDIT_INITIAL_BATCH.batch_id, folderId: folder.getId(), contract: AUDIT_CONTRACT };
}

function auditStores_() {
  const order = ['台北酒泉','台北永吉','台北復興南','台北杭州南','台北萬大','台北通化','台北大稻埕','台北三創','台北六張犁'];
  return order.map(function(name) {
    const store = PT_STORES.filter(function(row) { return row.name === name; })[0];
    if (!store) throw new Error('稽核店點尚未對應既有 PT_STORES：' + name);
    const canonicalId = AUDIT_CANONICAL_STORE_IDS[name];
    if (!canonicalId) throw new Error('稽核店點尚未設定 canonical ID：' + name);
    return { store_id: canonicalId, store_name: store.name };
  });
}

function auditStore_(storeId) {
  const clean = String(storeId || '').trim();
  const store = auditStores_().filter(function(row) {
    return row.store_id === clean || row.store_name === clean;
  })[0];
  if (!store) throw new Error('請選擇正確的門市店點');
  return store;
}

function auditItem_(itemId) {
  const clean = String(itemId || '').trim();
  const item = AUDIT_ITEMS.filter(function(row) { return row.item_id === clean; })[0];
  if (!item) throw new Error('稽核項目不正確');
  return item;
}

function auditActiveBatch_() {
  const sheet = auditEnsureSheet_(AUDIT_BATCH_SHEET, AUDIT_BATCH_FIELDS);
  const active = auditRows_(sheet, AUDIT_BATCH_FIELDS).filter(function(row) {
    return /^(true|1|yes|啟用)$/i.test(String(row.active || '').trim());
  });
  if (active.length !== 1) throw new Error(active.length ? '同時只能啟用一個稽核批次' : '目前沒有啟用中的稽核批次');
  return active[0];
}

function auditPublicConfig() {
  const batch = auditActiveBatch_();
  return {
    contract: AUDIT_CONTRACT,
    mode: 'self-report',
    identityVerification: false,
    batch: {
      batch_id: batch.batch_id,
      batch_name: batch.batch_name,
      starts_on: batch.starts_on,
      due_on: batch.due_on,
      active: true
    },
    stores: auditStores_(),
    items: AUDIT_ITEMS,
    maxPhotosPerItem: AUDIT_MAX_PHOTOS_PER_ITEM
  };
}

function auditCleanInspector_(value) {
  const clean = String(value || '').replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (!clean) throw new Error('請填寫檢查人員姓名');
  if (/[*＊]/.test(clean)) throw new Error('請輸入實際檢查人員姓名，不可使用遮罩姓名');
  if (clean.length > 40) throw new Error('檢查人員姓名最多 40 字');
  return clean;
}

function auditCleanEmployeeId_(value) {
  const clean = String(value || '').replace(/\s+/g, '').trim().toUpperCase();
  if (!clean) throw new Error('請填寫員工編號');
  if (!/^[A-Z0-9_-]{4,20}$/.test(clean)) throw new Error('員工編號格式不正確');
  return clean;
}

function auditCleanNote_(value) {
  const clean = String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (clean.length > 300) throw new Error('單項備註最多 300 字');
  return clean;
}

function auditTokenHash_(value) {
  const token = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{32,160}$/.test(token)) throw new Error('submission token 格式不正確');
  return auditHash_(token);
}

function auditSubmissionId_(value) {
  const clean = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{24,160}$/.test(clean)) throw new Error('submission_id 格式不正確');
  return clean;
}

function auditClientPhotoId_(value) {
  const clean = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{16,160}$/.test(clean)) throw new Error('照片識別碼格式不正確');
  return clean;
}

function auditSubmissionSheets_() {
  return {
    submissions: auditEnsureSheet_(AUDIT_SUBMISSION_SHEET, AUDIT_SUBMISSION_FIELDS),
    photos: auditEnsureSheet_(AUDIT_PHOTO_SHEET, AUDIT_PHOTO_FIELDS),
    events: auditEnsureSheet_(AUDIT_EVENT_SHEET, AUDIT_EVENT_FIELDS)
  };
}

function auditFindSubmission_(sheet, submissionId) {
  return auditRows_(sheet, AUDIT_SUBMISSION_FIELDS).filter(function(row) { return row.submission_id === submissionId; })[0] || null;
}

function auditOwnSubmission_(sheet, payload) {
  const submissionId = auditSubmissionId_((payload || {}).submission_id);
  const expectedHash = auditTokenHash_((payload || {}).edit_token);
  const submission = auditFindSubmission_(sheet, submissionId);
  if (!submission || submission.edit_token_hash !== expectedHash) throw new Error('找不到本次回報或草稿識別已失效');
  const batch = auditActiveBatch_();
  if (submission.batch_id !== batch.batch_id) throw new Error('本次回報不屬於目前啟用批次');
  const canonicalStore = auditStore_(submission.store_id);
  if (submission.store_id !== canonicalStore.store_id || submission.store_name !== canonicalStore.store_name) {
    throw new Error('本次回報的門市資料不正確');
  }
  return submission;
}

function auditAppendEventOnce_(sheet, value) {
  const eventKey = String(value.event_key || '');
  const exists = auditRows_(sheet, AUDIT_EVENT_FIELDS).some(function(row) { return row.event_key === eventKey; });
  if (exists) return false;
  auditAppend_(sheet, AUDIT_EVENT_FIELDS, value);
  return true;
}

function auditStart(payload) {
  const body = payload || {};
  const batch = auditActiveBatch_();
  if (String(body.batch_id || '') !== batch.batch_id) throw new Error('稽核批次已更新，請重新整理');
  const submissionId = auditSubmissionId_(body.submission_id);
  const store = auditStore_(body.store_id);
  const inspector = auditCleanInspector_(body.inspector_name);
  const employeeId = auditCleanEmployeeId_(body.employee_id);
  const tokenHash = auditTokenHash_(body.edit_token);
  const sheets = auditSubmissionSheets_();
  const now = auditNow_();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const submissions = auditRows_(sheets.submissions, AUDIT_SUBMISSION_FIELDS);
    const sameId = submissions.filter(function(row) { return row.submission_id === submissionId; })[0];
    if (sameId) {
      if (sameId.edit_token_hash !== tokenHash) throw new Error('submission_id 已存在');
      if (sameId.batch_id !== batch.batch_id || sameId.store_id !== store.store_id) throw new Error('回報識別與門市不一致');
      if (sameId.status === 'cancelled') throw new Error('本次回報已取消，請建立新的回報');
      if (sameId.inspector_name && sameId.inspector_name !== inspector) throw new Error('本次回報的檢查人員姓名與原紀錄不一致');
      if (sameId.employee_id && sameId.employee_id !== employeeId) throw new Error('本次回報的員工編號與原紀錄不一致');
      const patch = { updated_at: now };
      if (!sameId.employee_id) patch.employee_id = employeeId;
      if (!sameId.inspector_name) patch.inspector_name = inspector;
      auditUpdateRow_(sheets.submissions, sameId._row, patch);
      return auditOwnStatus_({ submission_id: submissionId, edit_token: body.edit_token });
    }
    const occupied = submissions.filter(function(row) {
      return row.batch_id === batch.batch_id && row.store_id === store.store_id && row.status !== 'cancelled';
    })[0];
    if (occupied) throw new Error('此門市本批次已有回報，請使用原草稿繼續或洽督導取消重設');
    auditAppend_(sheets.submissions, AUDIT_SUBMISSION_FIELDS, {
      batch_id: batch.batch_id,
      batch_name: batch.batch_name,
      submission_id: submissionId,
      store_id: store.store_id,
      store_name: store.store_name,
      inspector_name: inspector,
      employee_id: employeeId,
      auth_employee_hash: '',
      edit_token_hash: tokenHash,
      status: 'draft',
      submitted_at: '',
      reviewed_at: '',
      updated_at: now,
      revision: 1,
      created_at: now
    });
    auditAppendEventOnce_(sheets.events, {
      event_id: Utilities.getUuid(),
      event_key: 'created:' + submissionId,
      batch_id: batch.batch_id,
      submission_id: submissionId,
      store_id: store.store_id,
      store_name: store.store_name,
      inspector_name: inspector,
      employee_id: employeeId,
      item_id: '',
      item_name: '',
      event_type: 'created',
      status: 'draft',
      comment: '自行填報',
      actor: 'store',
      revision: 1,
      created_at: now
    });
    return auditOwnStatus_({ submission_id: submissionId, edit_token: body.edit_token });
  } finally {
    lock.releaseLock();
  }
}
