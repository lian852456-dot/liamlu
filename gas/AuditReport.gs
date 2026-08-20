// ════════════════════════════════════
// 北一二B 稽核回報專區
//
// 與巡店 33 項、半月督導檢查完全隔離：
// - 稽核批次：可由 Sheet 開啟下一批，不需改程式
// - 稽核回報提交：一筆 submission 一列
// - 稽核回報：一張照片一列
// - 稽核回報紀錄：append-only 時間軸
//
// GitHub Pages 不持有 PT_KEY 或回報碼。門市先以 Script Property 中的
// AUDIT_REPORT_SUBMIT_CODE 換取綁定批次／門市／submission 的短效 token，
// 後續仍須同時通過 submission_id + edit token ownership；九店總覽、
// 照片明細、覆核與取消只接受既有 PT_TOKEN。
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
  active: true
};
const AUDIT_MAX_PHOTOS_PER_ITEM = 10;
const AUDIT_MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const AUDIT_STORE_SESSION_TTL_SECONDS = 1800;

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
  'batch_id','batch_name','submission_id','store_id','store_name','inspector_name',
  'edit_token_hash','status','submitted_at','reviewed_at','updated_at','revision','created_at'
];
const AUDIT_PHOTO_FIELDS = [
  'batch_id','batch_name','submission_id','store_id','store_name','inspector_name',
  'item_id','item_name','photo_file_id','private_url','photo_name','client_photo_id',
  'note','status','reviewer_comment','submitted_at','reviewed_at','updated_at','revision','created_at'
];
const AUDIT_EVENT_FIELDS = [
  'event_id','event_key','batch_id','submission_id','store_id','store_name','item_id','item_name',
  'event_type','status','comment','actor','revision','created_at'
];

function auditNow_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX");
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
  const missing = fields.filter(field => headers.indexOf(field) === -1);
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
      active: 'TRUE',
      created_at: now,
      updated_at: now
    });
  }
  const folder = auditRootFolder_();
  return { status: 'ok', batchId: AUDIT_INITIAL_BATCH.batch_id, folderId: folder.getId() };
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
  if (!store) throw new Error('門市店點不正確');
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
    contract: 'audit-cleaning-v1',
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
  if (clean.length > 40) throw new Error('檢查人員姓名最多 40 字');
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
  return privateDashboardHash(token);
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

function auditStoreSessionCacheKey_(token) {
  const clean = String(token || '').trim();
  if (!/^[A-Za-z0-9_-]{32,160}$/.test(clean)) throw new Error('unauthorized');
  return 'audit_store_session:' + privateDashboardHash(clean).slice(0, 48);
}

function auditStoreSession_(payload) {
  const body = payload || {};
  const token = String(body.store_token || '').trim();
  if (!token) throw new Error('unauthorized');
  const raw = CacheService.getScriptCache().get(auditStoreSessionCacheKey_(token));
  if (!raw) throw new Error('unauthorized');
  let session;
  try { session = JSON.parse(raw); } catch (err) { throw new Error('unauthorized'); }
  if (!session || session.scope !== 'audit-submit') throw new Error('unauthorized');
  if (session.submission_id !== auditSubmissionId_(body.submission_id)) throw new Error('unauthorized');
  return session;
}

function auditAssertStoreSession_(session, submission) {
  if (!session || !submission || session.submission_id !== submission.submission_id ||
      session.store_id !== submission.store_id || session.batch_id !== submission.batch_id) {
    throw new Error('unauthorized');
  }
}

function auditSubmitAuth(payload) {
  const body = payload || {};
  const expected = String(PropertiesService.getScriptProperties().getProperty('AUDIT_REPORT_SUBMIT_CODE') || '');
  if (!expected) throw new Error('稽核回報碼尚未設定');
  const supplied = String(body.code || '');
  if (!supplied || privateDashboardHash(supplied) !== privateDashboardHash(expected)) throw new Error('unauthorized');
  const batch = auditActiveBatch_();
  if (String(body.batch_id || '') !== batch.batch_id) throw new Error('稽核批次已更新，請重新整理');
  const store = auditStore_(body.store_id);
  const submissionId = auditSubmissionId_(body.submission_id);
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  CacheService.getScriptCache().put(auditStoreSessionCacheKey_(token), JSON.stringify({
    scope: 'audit-submit',
    batch_id: batch.batch_id,
    store_id: store.store_id,
    submission_id: submissionId,
    issued_at: auditNow_()
  }), AUDIT_STORE_SESSION_TTL_SECONDS);
  return { token:token, expiresIn:AUDIT_STORE_SESSION_TTL_SECONDS };
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
  if (!submission || submission.edit_token_hash !== expectedHash) throw new Error('找不到本次回報或驗證已失效');
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
  const storeSession = auditStoreSession_(body);
  const batch = auditActiveBatch_();
  if (String(body.batch_id || '') !== batch.batch_id) throw new Error('稽核批次已更新，請重新整理');
  const submissionId = auditSubmissionId_(body.submission_id);
  const store = auditStore_(body.store_id);
  const inspector = auditCleanInspector_(body.inspector_name);
  const tokenHash = auditTokenHash_(body.edit_token);
  if (storeSession.batch_id !== batch.batch_id || storeSession.store_id !== store.store_id || storeSession.submission_id !== submissionId) throw new Error('unauthorized');
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
      auditUpdateRow_(sheets.submissions, sameId._row, { inspector_name: inspector, updated_at: now });
      return auditOwnStatus_({ submission_id: submissionId, edit_token: body.edit_token });
    }
    const occupied = submissions.filter(function(row) {
      return row.batch_id === batch.batch_id && row.store_id === store.store_id && row.status !== 'cancelled';
    })[0];
    if (occupied) throw new Error('此門市本批次已有回報，請使用原裝置繼續或洽督導協助');
    auditAppend_(sheets.submissions, AUDIT_SUBMISSION_FIELDS, {
      batch_id: batch.batch_id,
      batch_name: batch.batch_name,
      submission_id: submissionId,
      store_id: store.store_id,
      store_name: store.store_name,
      inspector_name: inspector,
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
      item_id: '',
      item_name: '',
      event_type: 'created',
      status: 'draft',
      comment: '',
      actor: 'store',
      revision: 1,
      created_at: now
    });
    return auditOwnStatus_({ submission_id: submissionId, edit_token: body.edit_token });
  } finally {
    lock.releaseLock();
  }
}

function auditRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const configuredId = String(props.getProperty('AUDIT_REPORT_FOLDER_ID') || '').trim();
  if (configuredId) return DriveApp.getFolderById(configuredId);
  const dashboardRootId = String(props.getProperty('DASHBOARD_PRIVATE_FOLDER_ID') || '').trim();
  if (dashboardRootId && !/^CHANGE_ME/i.test(dashboardRootId)) {
    const root = DriveApp.getFolderById(dashboardRootId);
    const folder = auditSubfolder_(root, '04_稽核回報_照片');
    props.setProperty('AUDIT_REPORT_FOLDER_ID', folder.getId());
    return folder;
  }
  throw new Error('尚未初始化稽核照片私有資料夾，請先執行 setupAuditReportStorage');
}

function auditSafeName_(value, fallback) {
  const clean = String(value || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
  return (clean || fallback || '未命名').slice(0, 120);
}

function auditSubfolder_(parent, name) {
  const safeName = auditSafeName_(name, '未分類');
  const folders = parent.getFoldersByName(safeName);
  return folders.hasNext() ? folders.next() : parent.createFolder(safeName);
}

function auditPhotoFolder_(submission, item) {
  const root = auditRootFolder_();
  const batch = auditSubfolder_(root, auditSafeName_(submission.batch_id, '未分類批次'));
  const store = auditSubfolder_(batch, auditSafeName_(submission.store_name, '未分類門市'));
  return auditSubfolder_(store, auditSafeName_(item.item_id + '_' + item.item_name, '未分類項目'));
}

function auditUploadPhoto(payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return auditUploadPhotoUnlocked_(payload);
  } finally {
    lock.releaseLock();
  }
}

function auditUploadPhotoUnlocked_(payload) {
  const body = payload || {};
  const storeSession = auditStoreSession_(body);
  const sheets = auditSubmissionSheets_();
  const submission = auditOwnSubmission_(sheets.submissions, body);
  auditAssertStoreSession_(storeSession, submission);
  if (['approved','cancelled'].indexOf(submission.status) >= 0) throw new Error('本次回報已關閉，不能再上傳照片');
  const item = auditItem_(body.item_id);
  const allowedItems = auditReturnedItemIds_(sheets.events, submission.submission_id);
  if (submission.status === 'rework' && allowedItems.indexOf(item.item_id) === -1) throw new Error('此項目未被退回，不需重新上傳');
  if (submission.status === 'submitted') throw new Error('回報待督導驗收中，暫時不能新增照片');
  const clientPhotoId = auditClientPhotoId_(body.client_photo_id);
  const photos = auditRows_(sheets.photos, AUDIT_PHOTO_FIELDS).filter(function(row) {
    return row.submission_id === submission.submission_id && row.item_id === item.item_id && row.status !== 'deleted';
  });
  const existing = photos.filter(function(row) { return row.client_photo_id === clientPhotoId; })[0];
  if (existing) return { duplicate: true, photo: auditPhotoForClient_(existing) };
  if (photos.length >= AUDIT_MAX_PHOTOS_PER_ITEM) throw new Error('單項最多 10 張照片');
  const file = body.file || {};
  const mimeType = String(file.type || '').toLowerCase();
  const base64 = String(file.base64 || '');
  if (!/^image\//.test(mimeType)) throw new Error('僅允許照片檔案');
  if (!base64) throw new Error('未收到照片內容');
  if (base64.length > Math.ceil(AUDIT_MAX_PHOTO_BYTES * 4 / 3) + 8) throw new Error('單張照片壓縮後上限為 10 MB');
  const bytes = Utilities.base64Decode(base64);
  if (bytes.length > AUDIT_MAX_PHOTO_BYTES) throw new Error('單張照片壓縮後上限為 10 MB');
  const folder = auditPhotoFolder_(submission, item);
  const now = auditNow_();
  const savedName = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss') + '_' + auditSafeName_(file.name, '稽核照片.jpg');
  const driveFile = folder.createFile(Utilities.newBlob(bytes, mimeType, savedName));
  const row = {
    batch_id: submission.batch_id,
    batch_name: submission.batch_name,
    submission_id: submission.submission_id,
    store_id: submission.store_id,
    store_name: submission.store_name,
    inspector_name: submission.inspector_name,
    item_id: item.item_id,
    item_name: item.item_name,
    photo_file_id: driveFile.getId(),
    private_url: '',
    photo_name: driveFile.getName(),
    client_photo_id: clientPhotoId,
    note: auditCleanNote_(body.note),
    status: submission.status === 'rework' ? 'rework_draft' : 'draft',
    reviewer_comment: '',
    submitted_at: '',
    reviewed_at: '',
    updated_at: now,
    revision: Number(submission.revision || 1),
    created_at: now
  };
  auditAppend_(sheets.photos, AUDIT_PHOTO_FIELDS, row);
  auditUpdateRow_(sheets.submissions, submission._row, { updated_at: now });
  return { duplicate: false, photo: auditPhotoForClient_(row) };
}

function auditDeletePhoto(payload) {
  const body = payload || {};
  const storeSession = auditStoreSession_(body);
  const sheets = auditSubmissionSheets_();
  const submission = auditOwnSubmission_(sheets.submissions, body);
  auditAssertStoreSession_(storeSession, submission);
  if (['draft','rework'].indexOf(submission.status) === -1) throw new Error('目前狀態不能刪除照片');
  const clientPhotoId = auditClientPhotoId_(body.client_photo_id);
  const row = auditRows_(sheets.photos, AUDIT_PHOTO_FIELDS).filter(function(photo) {
    return photo.submission_id === submission.submission_id && photo.client_photo_id === clientPhotoId && photo.status !== 'deleted';
  })[0];
  if (!row) return { deleted: false };
  if (submission.status === 'rework' && Number(row.revision || 0) < Number(submission.revision || 1)) throw new Error('原始回報照片必須保留');
  try { DriveApp.getFileById(row.photo_file_id).setTrashed(true); } catch (err) { throw new Error('照片刪除失敗，請稍後再試'); }
  const now = auditNow_();
  auditUpdateRow_(sheets.photos, row._row, { status: 'deleted', updated_at: now });
  auditUpdateRow_(sheets.submissions, submission._row, { updated_at: now });
  return { deleted: true };
}

function auditReturnedItemIds_(eventSheet, submissionId) {
  const latest = {};
  auditRows_(eventSheet, AUDIT_EVENT_FIELDS).filter(function(row) {
    return row.submission_id === submissionId && row.item_id;
  }).forEach(function(row) { latest[row.item_id] = row; });
  return Object.keys(latest).filter(function(itemId) { return latest[itemId].status === 'rework'; });
}

function auditSubmit(payload) {
  const body = payload || {};
  const storeSession = auditStoreSession_(body);
  const sheets = auditSubmissionSheets_();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const submission = auditOwnSubmission_(sheets.submissions, body);
    auditAssertStoreSession_(storeSession, submission);
    const isRework = submission.status === 'rework';
    if (submission.status === 'approved' || submission.status === 'submitted') {
      const previous = auditOwnStatus_(body);
      previous.readback_verified = true;
      return previous;
    }
    if (!isRework && submission.status !== 'draft') throw new Error('目前狀態不能送出');
    const notes = body.notes || {};
    const photos = auditRows_(sheets.photos, AUDIT_PHOTO_FIELDS).filter(function(row) {
      return row.submission_id === submission.submission_id && row.status !== 'deleted';
    });
    const returned = auditReturnedItemIds_(sheets.events, submission.submission_id);
    const required = isRework ? returned : AUDIT_ITEMS.map(function(item) { return item.item_id; });
    required.forEach(function(itemId) {
      const count = photos.filter(function(row) { return row.item_id === itemId; }).length;
      if (!count) throw new Error('尚缺照片：' + auditItem_(itemId).item_name);
      if (isRework) {
        const newCount = photos.filter(function(row) {
          return row.item_id === itemId && Number(row.revision || 0) >= Number(submission.revision || 1);
        }).length;
        if (!newCount) throw new Error('退回項目尚未加入補件照片：' + auditItem_(itemId).item_name);
      }
    });
    const now = auditNow_();
    required.forEach(function(itemId) {
      photos.filter(function(row) { return row.item_id === itemId; }).forEach(function(row) {
        auditUpdateRow_(sheets.photos, row._row, {
          inspector_name: submission.inspector_name,
          note: auditCleanNote_(notes[itemId]),
          status: 'submitted',
          submitted_at: row.submitted_at || now,
          updated_at: now
        });
      });
      auditAppendEventOnce_(sheets.events, {
        event_id: Utilities.getUuid(),
        event_key: (isRework ? 'resubmit:' : 'submit:') + submission.submission_id + ':' + itemId + ':' + submission.revision,
        batch_id: submission.batch_id,
        submission_id: submission.submission_id,
        store_id: submission.store_id,
        store_name: submission.store_name,
        item_id: itemId,
        item_name: auditItem_(itemId).item_name,
        event_type: isRework ? 'resubmitted' : 'submitted',
        status: 'submitted',
        comment: auditCleanNote_(notes[itemId]),
        actor: 'store',
        revision: submission.revision,
        created_at: now
      });
    });
    auditUpdateRow_(sheets.submissions, submission._row, {
      status: 'submitted',
      submitted_at: submission.submitted_at || now,
      updated_at: now
    });
    SpreadsheetApp.flush();
    const verified = auditOwnStatus_(body);
    if (verified.submission_status !== 'submitted' || required.some(function(itemId) {
      const item = verified.items.filter(function(row) { return row.item_id === itemId; })[0];
      return !item || item.photo_count < 1;
    })) throw new Error('寫入後讀回不一致，請只重試未完成項目');
    verified.readback_verified = true;
    return verified;
  } finally {
    lock.releaseLock();
  }
}

function auditPhotoForClient_(row) {
  return {
    client_photo_id: row.client_photo_id,
    photo_name: row.photo_name,
    revision: Number(row.revision || 1),
    status: row.status
  };
}

function auditTimeline_(eventSheet, submissionId) {
  return auditRows_(eventSheet, AUDIT_EVENT_FIELDS).filter(function(row) { return row.submission_id === submissionId; })
    .map(function(row) {
      return {
        item_id: row.item_id,
        item_name: row.item_name,
        event_type: row.event_type,
        status: row.status,
        comment: row.comment,
        actor: row.actor,
        revision: Number(row.revision || 1),
        created_at: row.created_at
      };
    });
}

function auditBuildDetail_(submission, photoSheet, eventSheet, includePhotos) {
  const photos = auditRows_(photoSheet, AUDIT_PHOTO_FIELDS).filter(function(row) {
    return row.submission_id === submission.submission_id && row.status !== 'deleted';
  });
  const events = auditTimeline_(eventSheet, submission.submission_id);
  const latest = {};
  events.filter(function(row) { return row.item_id; }).forEach(function(row) { latest[row.item_id] = row; });
  return {
    batch_id: submission.batch_id,
    batch_name: submission.batch_name,
    submission_id: submission.submission_id,
    store_id: submission.store_id,
    store_name: submission.store_name,
    inspector_name: submission.inspector_name,
    submission_status: submission.status,
    submitted_at: submission.submitted_at,
    reviewed_at: submission.reviewed_at,
    updated_at: submission.updated_at,
    revision: Number(submission.revision || 1),
    items: AUDIT_ITEMS.map(function(item) {
      const itemPhotos = photos.filter(function(row) { return row.item_id === item.item_id; });
      const last = latest[item.item_id] || {};
      const latestPhoto = itemPhotos[itemPhotos.length - 1] || {};
      return {
        item_id: item.item_id,
        item_name: item.item_name,
        status: last.status || (itemPhotos.length ? submission.status : 'draft'),
        reviewer_comment: last.status === 'rework' ? last.comment : '',
        note: latestPhoto.note || '',
        photo_count: itemPhotos.length,
        photos: includePhotos ? itemPhotos.map(auditPhotoForClient_) : undefined
      };
    }),
    timeline: events
  };
}

function auditOwnStatus_(payload) {
  const sheets = auditSubmissionSheets_();
  const submission = auditOwnSubmission_(sheets.submissions, payload || {});
  return auditBuildDetail_(submission, sheets.photos, sheets.events, true);
}

function auditOwnStatus(payload) {
  const body = payload || {};
  const storeSession = auditStoreSession_(body);
  const detail = auditOwnStatus_(body);
  auditAssertStoreSession_(storeSession, detail);
  return detail;
}

function auditSupervisorAuthorized_(payload) {
  if (!ptSessionAuthorized_(String((payload || {}).token || ''))) throw new Error('unauthorized');
}

function auditOverview(payload) {
  auditSupervisorAuthorized_(payload);
  const batch = auditActiveBatch_();
  const sheets = auditSubmissionSheets_();
  const submissions = auditRows_(sheets.submissions, AUDIT_SUBMISSION_FIELDS).filter(function(row) {
    return row.batch_id === batch.batch_id && row.status !== 'cancelled';
  });
  const rows = auditStores_().map(function(store) {
    const submission = submissions.filter(function(row) { return row.store_id === store.store_id; })[0];
    if (!submission) {
      return {
        store_id: store.store_id,
        store_name: store.store_name,
        submission_id: '',
        inspector_name: '',
        status: 'missing',
        submitted_at: '',
        last_rework_at: '',
        items: AUDIT_ITEMS.map(function(item) { return { item_id:item.item_id, item_name:item.item_name, status:'missing', photo_count:0 }; })
      };
    }
    const detail = auditBuildDetail_(submission, sheets.photos, sheets.events, false);
    const reworkEvents = detail.timeline.filter(function(event) { return event.event_type === 'resubmitted'; });
    return {
      store_id: store.store_id,
      store_name: store.store_name,
      submission_id: submission.submission_id,
      inspector_name: submission.inspector_name,
      status: submission.status,
      submitted_at: submission.submitted_at,
      last_rework_at: reworkEvents.length ? reworkEvents[reworkEvents.length - 1].created_at : '',
      items: detail.items.map(function(item) {
        return { item_id:item.item_id, item_name:item.item_name, status:item.status, photo_count:item.photo_count };
      })
    };
  });
  return { batch:auditPublicConfig().batch, stores:rows };
}

function auditDetail(payload) {
  auditSupervisorAuthorized_(payload);
  const sheets = auditSubmissionSheets_();
  const submission = auditFindSubmission_(sheets.submissions, auditSubmissionId_((payload || {}).submission_id));
  if (!submission) throw new Error('找不到稽核回報');
  return auditBuildDetail_(submission, sheets.photos, sheets.events, true);
}

function auditPhotoRead(payload) {
  const body = payload || {};
  const sheets = auditSubmissionSheets_();
  const submissionId = auditSubmissionId_(body.submission_id);
  const submission = auditFindSubmission_(sheets.submissions, submissionId);
  if (!submission) throw new Error('找不到稽核回報');
  if (!ptSessionAuthorized_(String(body.token || ''))) {
    const storeSession = auditStoreSession_(body);
    const owned = auditOwnSubmission_(sheets.submissions, body);
    auditAssertStoreSession_(storeSession, owned);
  }
  const clientPhotoId = auditClientPhotoId_(body.client_photo_id);
  const photo = auditRows_(sheets.photos, AUDIT_PHOTO_FIELDS).filter(function(row) {
    return row.submission_id === submissionId && row.client_photo_id === clientPhotoId && row.status !== 'deleted';
  })[0];
  if (!photo) throw new Error('找不到照片');
  const blob = DriveApp.getFileById(photo.photo_file_id).getBlob();
  const mimeType = String(blob.getContentType() || '').toLowerCase();
  if (!/^image\//.test(mimeType)) throw new Error('照片格式不正確');
  return {
    client_photo_id: photo.client_photo_id,
    photo_name: photo.photo_name,
    mime_type: mimeType,
    base64: Utilities.base64Encode(blob.getBytes())
  };
}

function auditCancel(payload) {
  auditSupervisorAuthorized_(payload);
  const body = payload || {};
  const sheets = auditSubmissionSheets_();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const submission = auditFindSubmission_(sheets.submissions, auditSubmissionId_(body.submission_id));
    if (!submission) throw new Error('找不到稽核回報');
    if (submission.status === 'cancelled') return auditBuildDetail_(submission, sheets.photos, sheets.events, true);
    const now = auditNow_();
    const comment = auditCleanNote_(body.comment) || '督導取消並開放門市重新回報';
    auditUpdateRow_(sheets.submissions, submission._row, { status:'cancelled', updated_at:now });
    auditAppendEventOnce_(sheets.events, {
      event_id: Utilities.getUuid(),
      event_key: 'cancelled:' + submission.submission_id,
      batch_id: submission.batch_id,
      submission_id: submission.submission_id,
      store_id: submission.store_id,
      store_name: submission.store_name,
      item_id: '',
      item_name: '',
      event_type: 'cancelled',
      status: 'cancelled',
      comment: comment,
      actor: 'supervisor',
      revision: Number(submission.revision || 1),
      created_at: now
    });
    SpreadsheetApp.flush();
    const cancelled = auditFindSubmission_(sheets.submissions, submission.submission_id);
    return auditBuildDetail_(cancelled, sheets.photos, sheets.events, true);
  } finally {
    lock.releaseLock();
  }
}

function auditReview(payload) {
  auditSupervisorAuthorized_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    return auditReviewUnlocked_(payload);
  } finally {
    lock.releaseLock();
  }
}

function auditReviewUnlocked_(payload) {
  const body = payload || {};
  const decision = String(body.decision || '');
  if (['approve','return'].indexOf(decision) === -1) throw new Error('覆核決定不正確');
  const comment = auditCleanNote_(body.comment);
  if (decision === 'return' && !comment) throw new Error('退回補件必須輸入原因');
  const item = auditItem_(body.item_id);
  const sheets = auditSubmissionSheets_();
  const submission = auditFindSubmission_(sheets.submissions, auditSubmissionId_(body.submission_id));
  if (!submission || ['submitted','rework'].indexOf(submission.status) === -1) throw new Error('目前沒有可覆核的回報');
  const now = auditNow_();
  const status = decision === 'approve' ? 'approved' : 'rework';
  const photos = auditRows_(sheets.photos, AUDIT_PHOTO_FIELDS).filter(function(row) {
    return row.submission_id === submission.submission_id && row.item_id === item.item_id && row.status !== 'deleted';
  });
  if (!photos.length) throw new Error('此項目沒有照片');
  photos.forEach(function(row) {
    auditUpdateRow_(sheets.photos, row._row, {
      status: status,
      reviewer_comment: comment,
      reviewed_at: now,
      updated_at: now
    });
  });
  auditAppendEventOnce_(sheets.events, {
    event_id: Utilities.getUuid(),
    event_key: 'review:' + submission.submission_id + ':' + item.item_id + ':' + submission.revision + ':' + decision,
    batch_id: submission.batch_id,
    submission_id: submission.submission_id,
    store_id: submission.store_id,
    store_name: submission.store_name,
    item_id: item.item_id,
    item_name: item.item_name,
    event_type: decision === 'approve' ? 'approved' : 'returned',
    status: status,
    comment: comment,
    actor: 'supervisor',
    revision: submission.revision,
    created_at: now
  });
  const detail = auditBuildDetail_(submission, sheets.photos, sheets.events, false);
  const statuses = detail.items.map(function(row) { return row.status; });
  const nextStatus = statuses.every(function(value) { return value === 'approved'; }) ? 'approved'
    : statuses.some(function(value) { return value === 'rework'; }) ? 'rework' : 'submitted';
  const patch = { status:nextStatus, reviewed_at:now, updated_at:now };
  if (nextStatus === 'rework' && submission.status !== 'rework') patch.revision = Number(submission.revision || 1) + 1;
  auditUpdateRow_(sheets.submissions, submission._row, patch);
  return auditDetail({ token:body.token, submission_id:submission.submission_id });
}
