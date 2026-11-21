// Optional, private conversion component. Existing report-upload authorization,
// private folder and reader authorization remain the only authorities.
// Immutable files + a separate CAS pointer never rewrite the KPI/awards file.
const READONLY_CONVERSION_STATE_ = 'READONLY_CONVERSION_STATE_V1';
const READONLY_CONVERSION_STAGE_ = 'readonly_conversion_preview_';
const READONLY_CONVERSION_MAX_TEXT_ = 1000000;
const READONLY_CONVERSION_CHUNK_ = 24000;

function readonlyConversionHash_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function readonlyConversionState_() {
  const raw = privateDashboardProperties().getProperty(READONLY_CONVERSION_STATE_);
  const value = raw ? JSON.parse(raw) : {schema:1, revision:0, active:null, previous:null, canRollback:false};
  if (!value || value.schema !== 1 || !Number.isSafeInteger(value.revision) || value.revision < 0 ||
      typeof value.canRollback !== 'boolean') throw Error('締結率版本指標不完整');
  ['active','previous'].forEach(function(key) {
    const e = value[key];
    if (e !== null && (!e || typeof e.fileId !== 'string' || !e.fileId ||
        !/^[a-f0-9]{64}$/.test(e.hash || '') || !/^[a-f0-9]{64}$/.test(e.sourceHash || ''))) {
      throw Error('締結率版本指標不完整');
    }
  });
  return {raw:raw, value:value};
}

function readonlyConversionNormalize_(incoming) {
  const value = ReadonlyDashboardCore.validateConversion(incoming);
  if (!value.source_bytes || value.source_bytes > 40 * 1024 * 1024 ||
      !/^[^/\\\x00-\x1f]{1,155}\.xls[xm]$/i.test(value.source_name)) throw Error('締結率原始檔身分不完整');
  // validateConversion returns a strict aggregate projection; arbitrary original
  // workbook columns, customer records and unrecognized fields never persist.
  if (incoming.renewalEvidence) {
    value.renewalEvidence = readonlyConversionEvidence_(incoming.renewalEvidence, value);
  }
  return value;
}

function readonlyConversionEvidence_(incoming, conversion) {
  const value = StoreRenewalEvidence.validate(incoming);
  for (const part of Object.values(value)) {
    if (!part) continue;
    if (!/^[^/\\\x00-\x1f]{1,155}\.xls[xm]$/i.test(part.source) ||
        part.start.slice(0, 7) !== conversion.period_start.slice(0, 7)) {
      throw Error('續約洞察需要同月份及可核對的來源檔名');
    }
  }
  // Problem descriptions are local parser diagnostics. They are not persisted
  // as evidence or exposed in the data returned to viewers.
  const detail = value.detail?.detail;
  if (value.detail && !detail) throw Error('門市 Tier／原方案彙總格式不符');
  if (detail) delete detail.issues;
  if (detail?.coverage.tiers && value.detail.start === conversion.period_start &&
      value.detail.end === conversion.cutoff &&
      value.detail.source === conversion.source_name) {
    for (const s of ReadonlyDashboardCore.STORES) {
      const total = ReadonlyDashboardCore.aggregate(conversion.records.filter(row => row.store === s.id));
      const tiers = detail.tiers.filter(row => row.store === s.id);
      if (tiers.reduce((sum, row) => sum + row.visitors, 0) !== total.rt_d ||
          tiers.reduce((sum, row) => sum + row.renewals, 0) !== total.rt_n) {
        throw Error(s.short + ' 同期間門市 Tier 與正式 RT 分子母不符');
      }
    }
  }
  return value;
}

function readonlyConversionMergeEvidence_(before, parts, conversion) {
  const evidence = {};
  if (before?.period_start === conversion.period_start && before.renewalEvidence) {
    Object.assign(evidence, before.renewalEvidence);
  }
  for (const part of parts) {
    const incoming = readonlyConversionEvidence_(part, conversion);
    if (!Object.values(incoming).some(Boolean)) throw Error('來源無可核對的續約洞察彙總');
    for (const [key, value] of Object.entries(incoming)) {
      const prior = evidence[key];
      if (!value || (prior && value.end < prior.end)) continue;
      if (key === 'detail' && prior && Object.keys(prior.detail.coverage).some(
        facet => prior.detail.coverage[facet] && !value.detail.coverage[facet]
      )) continue;
      evidence[key] = value;
    }
  }
  return Object.values(evidence).some(Boolean) ? readonlyConversionEvidence_(evidence, conversion) : null;
}

function readonlyConversionEvidenceDates_(snapshot) {
  const value = snapshot?.renewalEvidence;
  if (!value) return null;
  return {
    tiers: value.detail?.detail.coverage.tiers ? value.detail.end : null,
    plans: value.detail?.detail.coverage.plans ? value.detail.end : null,
    tariffs: value.tariffs?.end || null,
    daily: value.daily?.end || null
  };
}

function readonlyConversionFolder_() {
  const folder = privateDashboardFolder();
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE ||
      folder.getSharingPermission() !== DriveApp.Permission.NONE) throw Error('締結率資料夾必須維持私有');
  return folder;
}

function readonlyConversionReadEntry_(entry) {
  if (!entry) return null;
  const folder = readonlyConversionFolder_();
  const file = DriveApp.getFileById(entry.fileId);
  const parents = file.getParents();
  let inFolder = false;
  while (parents.hasNext()) if (parents.next().getId() === folder.getId()) inFolder = true;
  if (!inFolder || file.isTrashed() || file.getSharingAccess() !== DriveApp.Access.PRIVATE ||
      file.getSharingPermission() !== DriveApp.Permission.NONE ||
      file.getOwner().getEmail() !== folder.getOwner().getEmail()) throw Error('締結率版本不在既有私有資料域');
  const text = file.getBlob().getDataAsString('UTF-8');
  if (text.length > READONLY_CONVERSION_MAX_TEXT_ || readonlyConversionHash_(text) !== entry.hash) throw Error('締結率版本讀回雜湊不符');
  const value = readonlyConversionNormalize_(JSON.parse(text));
  if (JSON.stringify(value) !== text || value.sha256 !== entry.sourceHash ||
      value.cutoff !== entry.cutoff || value.source_name !== entry.sourceName) throw Error('締結率版本內容不完整');
  return value;
}

function readonlyConversionSummary_(state, snapshot) {
  return {revision:state.revision, activeHash:state.active ? state.active.hash : null,
    previousHash:state.previous ? state.previous.hash : null, canRollback:state.canRollback,
    cutoff:state.active ? state.active.cutoff : null,
    sourceName:state.active ? state.active.sourceName : null,
    sourceHash:state.active ? state.active.sourceHash : null,
    publishedAt:state.publishedAt || null, renewalEvidence:readonlyConversionEvidenceDates_(snapshot)};
}

// Called only from the existing protected privateDashboardSnapshot reader.
// A broken optional component must not remove or replace other source domains.
function readonlyConversionAttach_(snapshot) {
  try {
    const state = readonlyConversionState_().value;
    if (!state.revision) return snapshot;
    delete snapshot.conversionBattle;
    snapshot.conversionStatus = {status:state.active ? 'verified' : 'unavailable', revision:state.revision};
    if (state.active) snapshot.conversionBattle = readonlyConversionReadEntry_(state.active);
  } catch (error) {
    delete snapshot.conversionBattle;
    snapshot.conversionStatus = {status:'unavailable', reason:'私有締結率元件讀回未通過，請由主管核對版本'};
  }
  return snapshot;
}

function readonlyConversionStatus(payload) {
  reportUploadAuthorize_(payload);
  const state = readonlyConversionState_().value;
  const snapshot = readonlyConversionReadEntry_(state.active);
  return {status:'ok', live:readonlyConversionSummary_(state, snapshot)};
}

function readonlyConversionPreview(payload) {
  const employeeId = reportUploadAuthorize_(payload);
  const parts = payload.renewalEvidence || [];
  if (!Array.isArray(parts) || parts.length > 5 ||
      JSON.stringify(payload.snapshot || null).length + JSON.stringify(parts).length > READONLY_CONVERSION_MAX_TEXT_) {
    throw Error('締結率或續約洞察彙總檔過大');
  }
  const state = readonlyConversionState_().value;
  const current = readonlyConversionReadEntry_(state.active);
  if (!payload.snapshot && (!current || !parts.length)) throw Error('請先提供正式 AQ／RT 締結率來源');
  const input = payload.snapshot || current;
  const incoming = readonlyConversionNormalize_(input);
  if (current && incoming.period_start < current.period_start) throw Error('不可發布較舊月份');
  const diff = current && current.period_start === incoming.period_start
    ? ReadonlyDashboardCore.diff(current, incoming)
    : {same_source:false, added:incoming.records.length, changed:0, removed:0};
  if (diff.removed) throw Error('新版本移除既有店日，停止發布');
  if (diff.same_source && JSON.stringify(ReadonlyDashboardCore.validateConversion(current)) !==
      JSON.stringify(ReadonlyDashboardCore.validateConversion(incoming))) throw Error('相同原始檔雜湊卻有不同彙總內容');
  const evidence = readonlyConversionMergeEvidence_(current,
    [...(payload.snapshot?.renewalEvidence ? [payload.snapshot.renewalEvidence] : []), ...parts], incoming);
  if (evidence) incoming.renewalEvidence = evidence;
  const canonical = JSON.stringify(incoming), hash = readonlyConversionHash_(canonical);
  if (canonical.length > READONLY_CONVERSION_MAX_TEXT_) throw Error('續約洞察彙總檔過大');
  const token = Utilities.getUuid().replace(/-/g, '');
  const chunks = canonical.match(new RegExp('.{1,' + READONLY_CONVERSION_CHUNK_ + '}', 'gsu'));
  const staged = {employeeId:employeeId, expiresAt:Date.now() + 1800000,
    expectedRevision:state.revision, expectedHash:state.active ? state.active.hash : null,
    hash:hash, chunks:chunks.length};
  const cache = CacheService.getScriptCache(), key = READONLY_CONVERSION_STAGE_ + token;
  chunks.forEach((chunk, index) => cache.put(key + '_' + index, chunk, 1800));
  cache.put(key, JSON.stringify(staged), 1800);
  return {status:'ok', token:token, live:readonlyConversionSummary_(state, current),
    preview:{sourceName:incoming.source_name, sourceHash:incoming.sha256,
      cutoff:incoming.cutoff, periodStart:incoming.period_start, storeDateKeys:incoming.records.length,
      totals:ReadonlyDashboardCore.aggregate(incoming.records), hash:hash,
      sameSource:diff.same_source, added:diff.added, changed:diff.changed, removed:diff.removed,
      renewalEvidence:readonlyConversionEvidenceDates_(incoming)}};
}

function readonlyConversionRestoreState_(raw) {
  const props = privateDashboardProperties();
  if (raw === null) props.deleteProperty(READONLY_CONVERSION_STATE_);
  else props.setProperty(READONLY_CONVERSION_STATE_, raw);
}

function readonlyConversionClearPreview_(cache, key, count) {
  cache.remove(key);
  for (let i = 0; i < count; i++) cache.remove(key + '_' + i);
}

function readonlyConversionPublish(payload) {
  const employeeId = reportUploadAuthorize_(payload);
  if (payload.confirm !== true || !/^[a-f0-9]{32}$/i.test(payload.previewToken || '')) throw Error('請先預覽並確認發布');
  const cache = CacheService.getScriptCache(), key = READONLY_CONVERSION_STAGE_ + payload.previewToken;
  const raw = cache.get(key);
  if (!raw) throw Error('預覽已失效，請重新檢查原始檔');
  const staged = JSON.parse(raw);
  if (staged.employeeId !== employeeId || staged.expiresAt <= Date.now()) throw Error('預覽操作者或期限不符');
  if (!Number.isSafeInteger(staged.chunks) || staged.chunks < 1 ||
      staged.chunks > Math.ceil(READONLY_CONVERSION_MAX_TEXT_ / READONLY_CONVERSION_CHUNK_)) {
    throw Error('預覽彙總內容不完整');
  }
  const pieces = [];
  for (let i = 0; i < staged.chunks; i++) {
    const piece = cache.get(key + '_' + i);
    if (!piece) throw Error('預覽已失效，請重新檢查原始檔');
    pieces.push(piece);
  }
  const text = pieces.join('');
  if (readonlyConversionHash_(text) !== staged.hash) throw Error('預覽彙總內容不完整');
  const snapshot = readonlyConversionNormalize_(JSON.parse(text));
  if (JSON.stringify(snapshot) !== text) throw Error('預覽彙總內容不完整');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const prior = readonlyConversionState_(), state = prior.value;
    if (state.revision !== staged.expectedRevision ||
        (state.active ? state.active.hash : null) !== staged.expectedHash) throw Error('正式版本已變更，請重新預覽');
    readonlyConversionReadEntry_(state.active);
    if (state.active && state.active.hash === staged.hash) {
      readonlyConversionClearPreview_(cache, key, staged.chunks);
      return {status:'already_current', live:readonlyConversionSummary_(state, snapshot)};
    }
    const file = readonlyConversionFolder_().createFile(Utilities.newBlob(text, 'application/json',
      'readonly-conversion-' + Utilities.getUuid() + '.json'));
    const entry = {fileId:file.getId(), hash:staged.hash, sourceHash:snapshot.sha256,
      sourceName:snapshot.source_name, cutoff:snapshot.cutoff};
    // Complete canonical readback before switching the active pointer.
    readonlyConversionReadEntry_(entry);
    const next = {schema:1, revision:state.revision + 1, active:entry, previous:state.active,
      canRollback:true, operator:employeeId, publishedAt:new Date().toISOString()};
    try {
      privateDashboardProperties().setProperty(READONLY_CONVERSION_STATE_, JSON.stringify(next));
      const saved = readonlyConversionState_().value;
      if (saved.revision !== next.revision || !saved.active || saved.active.hash !== entry.hash) throw Error('締結率正式指標讀回不符');
      readonlyConversionReadEntry_(saved.active);
    } catch (error) { readonlyConversionRestoreState_(prior.raw); throw error; }
    readonlyConversionClearPreview_(cache, key, staged.chunks);
    return {status:'published', live:readonlyConversionSummary_(next, snapshot)};
  } finally { lock.releaseLock(); }
}

function readonlyConversionRollback(payload) {
  const employeeId = reportUploadAuthorize_(payload);
  if (payload.confirm !== true || !Number.isSafeInteger(payload.expectedRevision)) throw Error('請先讀取版本並確認回復');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const prior = readonlyConversionState_(), state = prior.value;
    if (!state.canRollback || state.revision !== payload.expectedRevision ||
        (state.active ? state.active.hash : null) !== payload.expectedActiveHash) throw Error('版本已變更或沒有回復點');
    const restored = readonlyConversionReadEntry_(state.previous);
    const next = {schema:1, revision:state.revision + 1, active:state.previous, previous:state.active,
      canRollback:true, operator:employeeId, publishedAt:new Date().toISOString()};
    try {
      privateDashboardProperties().setProperty(READONLY_CONVERSION_STATE_, JSON.stringify(next));
      const saved = readonlyConversionState_().value;
      if (JSON.stringify(saved) !== JSON.stringify(next)) throw Error('回復指標讀回不符');
      readonlyConversionReadEntry_(saved.active);
    } catch (error) { readonlyConversionRestoreState_(prior.raw); throw error; }
    return {status:'rolled_back', live:readonlyConversionSummary_(next, restored)};
  } finally { lock.releaseLock(); }
}

