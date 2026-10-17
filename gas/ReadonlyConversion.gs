// Optional, private conversion component. Existing report-upload authorization,
// private folder and reader authorization remain the only authorities.
// Immutable files + a separate CAS pointer never rewrite the KPI/awards file.
const READONLY_CONVERSION_STATE_ = 'READONLY_CONVERSION_STATE_V1';
const READONLY_CONVERSION_STAGE_ = 'readonly_conversion_preview_';

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
      !/^[^/\\\x00-\x1f]{1,155}\.xlsx$/i.test(value.source_name)) throw Error('締結率原始檔身分不完整');
  // validateConversion returns a strict aggregate projection; arbitrary original
  // workbook columns, customer records and unrecognized fields never persist.
  return value;
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
  if (text.length > 100000 || readonlyConversionHash_(text) !== entry.hash) throw Error('締結率版本讀回雜湊不符');
  const value = readonlyConversionNormalize_(JSON.parse(text));
  if (JSON.stringify(value) !== text || value.sha256 !== entry.sourceHash ||
      value.cutoff !== entry.cutoff || value.source_name !== entry.sourceName) throw Error('締結率版本內容不完整');
  return value;
}

function readonlyConversionSummary_(state) {
  return {revision:state.revision, activeHash:state.active ? state.active.hash : null,
    previousHash:state.previous ? state.previous.hash : null, canRollback:state.canRollback,
    cutoff:state.active ? state.active.cutoff : null,
    sourceName:state.active ? state.active.sourceName : null,
    sourceHash:state.active ? state.active.sourceHash : null,
    publishedAt:state.publishedAt || null};
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
  readonlyConversionReadEntry_(state.active);
  return {status:'ok', live:readonlyConversionSummary_(state)};
}

function readonlyConversionPreview(payload) {
  const employeeId = reportUploadAuthorize_(payload);
  const text = JSON.stringify(payload.snapshot || null);
  if (text.length > 100000) throw Error('締結率彙總檔過大');
  const incoming = readonlyConversionNormalize_(payload.snapshot);
  const state = readonlyConversionState_().value;
  const current = readonlyConversionReadEntry_(state.active);
  if (current && incoming.period_start < current.period_start) throw Error('不可發布較舊月份');
  const diff = current && current.period_start === incoming.period_start
    ? ReadonlyDashboardCore.diff(current, incoming)
    : {same_source:false, added:incoming.records.length, changed:0, removed:0};
  if (diff.removed) throw Error('新版本移除既有店日，停止發布');
  const canonical = JSON.stringify(incoming), hash = readonlyConversionHash_(canonical);
  if (diff.same_source && state.active.hash !== hash) throw Error('相同原始檔雜湊卻有不同彙總內容');
  const token = Utilities.getUuid().replace(/-/g, '');
  const staged = {employeeId:employeeId, expiresAt:Date.now() + 1800000,
    expectedRevision:state.revision, expectedHash:state.active ? state.active.hash : null,
    hash:hash, snapshot:incoming};
  CacheService.getScriptCache().put(READONLY_CONVERSION_STAGE_ + token, JSON.stringify(staged), 1800);
  return {status:'ok', token:token, live:readonlyConversionSummary_(state),
    preview:{sourceName:incoming.source_name, sourceHash:incoming.sha256,
      cutoff:incoming.cutoff, periodStart:incoming.period_start, storeDateKeys:incoming.records.length,
      totals:ReadonlyDashboardCore.aggregate(incoming.records), hash:hash,
      sameSource:diff.same_source, added:diff.added, changed:diff.changed, removed:diff.removed}};
}

function readonlyConversionRestoreState_(raw) {
  const props = privateDashboardProperties();
  if (raw === null) props.deleteProperty(READONLY_CONVERSION_STATE_);
  else props.setProperty(READONLY_CONVERSION_STATE_, raw);
}

function readonlyConversionPublish(payload) {
  const employeeId = reportUploadAuthorize_(payload);
  if (payload.confirm !== true || !/^[a-f0-9]{32}$/i.test(payload.previewToken || '')) throw Error('請先預覽並確認發布');
  const cache = CacheService.getScriptCache(), key = READONLY_CONVERSION_STAGE_ + payload.previewToken;
  const raw = cache.get(key);
  if (!raw) throw Error('預覽已失效，請重新檢查原始檔');
  const staged = JSON.parse(raw);
  if (staged.employeeId !== employeeId || staged.expiresAt <= Date.now()) throw Error('預覽操作者或期限不符');
  const snapshot = readonlyConversionNormalize_(staged.snapshot), text = JSON.stringify(snapshot);
  if (readonlyConversionHash_(text) !== staged.hash) throw Error('預覽彙總內容不完整');
  const lock = LockService.getScriptLock(); lock.waitLock(10000);
  try {
    const prior = readonlyConversionState_(), state = prior.value;
    if (state.revision !== staged.expectedRevision ||
        (state.active ? state.active.hash : null) !== staged.expectedHash) throw Error('正式版本已變更，請重新預覽');
    readonlyConversionReadEntry_(state.active);
    if (state.active && state.active.hash === staged.hash) {
      cache.remove(key);
      return {status:'already_current', live:readonlyConversionSummary_(state)};
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
    cache.remove(key);
    return {status:'published', live:readonlyConversionSummary_(next)};
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
    readonlyConversionReadEntry_(state.previous);
    const next = {schema:1, revision:state.revision + 1, active:state.previous, previous:state.active,
      canRollback:true, operator:employeeId, publishedAt:new Date().toISOString()};
    try {
      privateDashboardProperties().setProperty(READONLY_CONVERSION_STATE_, JSON.stringify(next));
      const saved = readonlyConversionState_().value;
      if (JSON.stringify(saved) !== JSON.stringify(next)) throw Error('回復指標讀回不符');
      readonlyConversionReadEntry_(saved.active);
    } catch (error) { readonlyConversionRestoreState_(prior.raw); throw error; }
    return {status:'rolled_back', live:readonlyConversionSummary_(next)};
  } finally { lock.releaseLock(); }
}

