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
  const sheets = auditSubmissionSheets_();
  const submission = auditOwnSubmission_(sheets.submissions, body);
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
  const sheets = auditSubmissionSheets_();
  const submission = auditOwnSubmission_(sheets.submissions, body);
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
  const sheets = auditSubmissionSheets_();
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const submission = auditOwnSubmission_(sheets.submissions, body);
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
        inspector_name: submission.inspector_name,
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
        inspector_name: row.inspector_name,
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
    employee_id: submission.employee_id || '',
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
  return auditOwnStatus_(payload || {});
}
