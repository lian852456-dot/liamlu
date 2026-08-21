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
        employee_id: '',
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
      employee_id: submission.employee_id || '',
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
    const owned = auditOwnSubmission_(sheets.submissions, body);
    if (owned.submission_id !== submissionId) throw new Error('找不到本次回報或草稿識別已失效');
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
      inspector_name: submission.inspector_name,
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
    inspector_name: submission.inspector_name,
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
