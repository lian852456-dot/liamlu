// ════════════════════════════════════
// 北一二B 回報系統 — Google Apps Script
// ════════════════════════════════════

const SHEET_NAME = '回報資料';

const FIELDS = [
  'date','store','seg','savedAt',
  'kpi','rank',
  'acc','film','insurance',
  'myvideo','apple_google','hbo','netflix',
  '5g','aq_ttl','aq999','aq1399','rt_pts',
  'special_renew','premium_renew','rt999','rt1399','haosu',
  'early_renew','rt_close_num','rt_close_den','rt_close_pct',
  'insurance_num','insurance_den','insurance_pct',
  'device_num','device_den','device_ratio',
  'tw_pixel10','tw_s26u','tw_sharpr11','tw_vivo','tw_s26','tw_reno16f',
  'tw_pixel10fold','tw_findx9s','tw_sony1','tw_poketomo',
  'tw_oppoa6x','tw_a27','tw_y21','tw_myfirst',
  'zero_reason','zero_consult','zero_method','zero_plan'
];

const SPREADSHEET_ID = '10MqzAWOPc4UPE-g5ZZPNZG3tYAndKW-DApLuuhIpQWA';

// 8 月台獎回報相容層：新資料只寫入獨立工作表，不拆寫既有 tw_* 欄位。
const REPORT_AWARD_MODELS_SHEET = 'ReportAwardModels';
const REPORT_AWARD_MODELS_HEADERS = ['date','seg','store','award_models_json','schemaVersion','versionId','savedAt'];
const REPORT_AWARD_MODELS_SCHEMA = 'award-models-v1';
const REPORT_AWARD_MODEL_IDS = [
  'pixel-10-family', 'razr-fold', 's26u-zfold8-family', 'sharp-r11',
  'vivo-x300-v70fe', 'pixel-11-pro-family', 's26-zflip8-family',
  'pixel-11', 'oppo-r16f', 'samsung-a57', 'oppo-a6x',
  'samsung-a27-a17', 'vivo-y21'
];
const REPORT_AWARD_SAFE_LEGACY_MAP = {
  tw_pixel10: 'pixel-10-family',
  tw_sharpr11: 'sharp-r11',
  tw_reno16f: 'oppo-r16f',
  tw_oppoa6x: 'oppo-a6x',
  tw_a27: 'samsung-a27-a17'
};
const REPORT_AWARD_UNMAPPED_LEGACY = [
  'tw_s26u','tw_vivo','tw_s26','tw_pixel10fold','tw_findx9s',
  'tw_sony1','tw_poketomo','tw_y21','tw_myfirst'
];

function getReportAwardModelsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(REPORT_AWARD_MODELS_SHEET);
  if (!sh) {
    sh = ss.insertSheet(REPORT_AWARD_MODELS_SHEET);
  }
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, REPORT_AWARD_MODELS_HEADERS.length).setValues([REPORT_AWARD_MODELS_HEADERS]);
    sh.setFrozenRows(1);
  } else {
    const headers = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), REPORT_AWARD_MODELS_HEADERS.length)).getValues()[0];
    if (REPORT_AWARD_MODELS_HEADERS.some((h, i) => headers[i] !== h)) {
      throw new Error('ReportAwardModels 標題列不符合 award-models-v1 契約');
    }
  }
  return sh;
}

function normalizeReportAwardModels_(input) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('awardModels 必須是物件');
  }
  const keys = Object.keys(input);
  const unknown = keys.filter(k => REPORT_AWARD_MODEL_IDS.indexOf(k) === -1);
  if (unknown.length) throw new Error('未知 modelId：' + unknown.join('、'));
  const out = {};
  REPORT_AWARD_MODEL_IDS.forEach(id => {
    const value = Object.prototype.hasOwnProperty.call(input, id) ? input[id] : null;
    if (value === null || value === '') {
      out[id] = null;
      return;
    }
    const number = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(number) || number < 0) throw new Error('modelId ' + id + ' 的數值無效');
    out[id] = number;
  });
  return out;
}

// JSON.parse 會把重複 key 靜默折疊；在進入 JSON.parse 前先檢查 awardModels 物件的 key。
function assertNoDuplicateReportAwardModelIds_(jsonText) {
  const match = String(jsonText || '').match(/"awardModels"\s*:\s*\{([^{}]*)\}/);
  if (!match) return;
  const seen = {};
  const keyPattern = /"((?:\\.|[^"\\])*)"\s*:/g;
  let item;
  while ((item = keyPattern.exec(match[1])) !== null) {
    const key = item[1];
    if (seen[key]) throw new Error('重複 modelId：' + key);
    seen[key] = true;
  }
}

function reportAwardVersionId_() {
  return REPORT_AWARD_MODELS_SCHEMA + '-' + new Date().getTime() + '-' + Math.random().toString(36).slice(2, 8);
}

function writeReportAwardModels_(date, store, seg, awardModels, versionId) {
  const sh = getReportAwardModelsSheet_();
  const normalized = normalizeReportAwardModels_(awardModels);
  const values = sh.getDataRange().getValues();
  let rowIdx = -1;
  for (let i = 1; i < values.length; i++) {
    if (toDateStr(values[i][0]) === String(date) && String(values[i][1]) === String(seg) && String(values[i][2]) === String(store)) {
      rowIdx = i + 1;
      break;
    }
  }
  const row = [String(date), String(seg), String(store), JSON.stringify(normalized), REPORT_AWARD_MODELS_SCHEMA, String(versionId || reportAwardVersionId_()), new Date().toISOString()];
  let rowNumber;
  if (rowIdx > 0) {
    sh.getRange(rowIdx, 1, 1, row.length).setValues([row]);
    rowNumber = rowIdx;
  } else {
    sh.appendRow(row);
    rowNumber = sh.getLastRow();
  }

  // 寫入成功不能只代表 setValues/appendRow 沒拋錯；用同一個 Spreadsheet
  // 與工作表立即讀回，避免前端只看到假成功或寫到錯誤的資料來源。
  const readback = readReportAwardModels_(date, seg)[String(store)];
  const readbackMatches = !!readback &&
    JSON.stringify(readback.awardModels) === JSON.stringify(normalized) &&
    String(readback.schemaVersion) === REPORT_AWARD_MODELS_SCHEMA &&
    String(readback.versionId) === String(row[5]);
  if (!readbackMatches) throw new Error('ReportAwardModels 寫入後讀回不一致');

  return {
    rowWritten: true,
    spreadsheetId: SPREADSHEET_ID,
    sheetName: REPORT_AWARD_MODELS_SHEET,
    rowNumber,
    date: String(date),
    seg: String(seg),
    store: String(store),
    schemaVersion: REPORT_AWARD_MODELS_SCHEMA,
    versionId: row[5],
    savedAt: row[6],
    awardModels: normalized,
    readbackMatches,
    readback: {
      awardModels: readback.awardModels,
      schemaVersion: readback.schemaVersion,
      versionId: readback.versionId,
      savedAt: readback.savedAt
    }
  };
}

function readReportAwardModels_(date, seg) {
  const sh = getReportAwardModelsSheet_();
  const values = sh.getDataRange().getValues();
  const display = sh.getDataRange().getDisplayValues();
  const result = {};
  for (let i = 1; i < values.length; i++) {
    if (toDateStr(values[i][0]) !== String(date) || String(values[i][1]) !== String(seg)) continue;
    let awardModels = null;
    try { awardModels = normalizeReportAwardModels_(JSON.parse(String(values[i][3] || '{}'))); } catch (err) { throw new Error('ReportAwardModels 資料無效：' + err.message); }
    result[String(values[i][2])] = {
      awardModels,
      schemaVersion: String(values[i][4] || ''),
      versionId: String(values[i][5] || ''),
      savedAt: display[i][6] || String(values[i][6] || '')
    };
  }
  return result;
}

function mapLegacyAwardModels_(record) {
  const awardModels = {};
  REPORT_AWARD_MODEL_IDS.forEach(id => { awardModels[id] = null; });
  const unmappedLegacyFields = [];
  Object.keys(REPORT_AWARD_SAFE_LEGACY_MAP).forEach(key => {
    const value = record && record[key];
    if (value !== null && value !== undefined && value !== '') awardModels[REPORT_AWARD_SAFE_LEGACY_MAP[key]] = value;
  });
  REPORT_AWARD_UNMAPPED_LEGACY.forEach(key => {
    const value = record && record[key];
    if (value !== null && value !== undefined && value !== '') unmappedLegacyFields.push(key);
  });
  return { awardModels, unmappedLegacyFields };
}

function attachReportAwardModels_(result, date, seg) {
  const fresh = readReportAwardModels_(date, seg);
  Object.keys(result || {}).forEach(store => {
    if (fresh[store]) {
      result[store].awardModels = fresh[store].awardModels;
      result[store].awardModelsMeta = {
        schemaVersion: fresh[store].schemaVersion,
        versionId: fresh[store].versionId,
        savedAt: fresh[store].savedAt,
        source: REPORT_AWARD_MODELS_SHEET
      };
      result[store].unmappedLegacyFields = [];
    } else {
      const mapped = mapLegacyAwardModels_(result[store]);
      result[store].awardModels = mapped.awardModels;
      result[store].unmappedLegacyFields = mapped.unmappedLegacyFields;
    }
  });
  Object.keys(fresh).forEach(store => {
    if (result[store]) return;
    result[store] = {
      date: String(date), store, seg,
      awardModels: fresh[store].awardModels,
      awardModelsMeta: {
        schemaVersion: fresh[store].schemaVersion,
        versionId: fresh[store].versionId,
        savedAt: fresh[store].savedAt,
        source: REPORT_AWARD_MODELS_SHEET
      },
      unmappedLegacyFields: []
    };
  });
  return result;
}

function getSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(FIELDS);
    sh.setFrozenRows(1);
  }
  // 確保標題列有所有欄位
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const missingFields = FIELDS.filter(f => !headers.includes(f));
  if (missingFields.length > 0) {
    missingFields.forEach(f => {
      sh.getRange(1, headers.length + 1).setValue(f);
      headers.push(f);
    });
  }
  return sh;
}

function doGet(e) {
  const action = e.parameter.action;
  const cb = e.parameter.callback;

  // 部署隔離：上傳專用 Deployment 只回應 ping／同源 HtmlService，
  // 其餘 JSON GET（包括每日回報 read）一律拒絕。
  if (reportUploadIsUploadDeployment_()) {
    if (action === 'ping') return jsonResponse({ status: 'ok', app: 'report-upload' }, cb);
    if (!action) return reportUploadHtmlService_();
    return jsonResponse({ status: 'error', message: 'route-not-available-on-upload-deployment' }, cb);
  }

  if (action === 'ping') {
    return jsonResponse({ status: 'ok' }, cb);
  }

  if (action === 'pthealth') {
    return jsonResponse({
      status: 'ok',
      configured: Boolean(ptConfiguredKey_()),
      contract: 'patrol-auth-v3',
      sessionContract: PATROL_SESSION_CONTRACT,
      authDeployment: PATROL_AUTH_DEPLOYMENT,
      mileageContracts: ['patrol-mileage-month-v1', 'patrol-mileage-visits-v2']
    }, cb);
  }

  if (action === 'debug') {
    try {
      ptRequireSession_(e.parameter.token, action);
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const sheets = ss.getSheets().map(s => ({
        name: s.getName(),
        rows: s.getLastRow(),
        cols: s.getLastColumn()
      }));
      const sh = ss.getSheetByName(SHEET_NAME);
      const headers = sh ? sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0] : [];
      const sample = sh && sh.getLastRow() > 1 ? sh.getRange(2,1,1,sh.getLastColumn()).getValues()[0] : [];
      return jsonResponse({ status:'ok', sheets, headers, sample }, cb);
    } catch(err) {
      return jsonResponse(ptRouteErrorPayload_(err, action, e.parameter.token), cb);
    }
  }

  if (action === 'write') {
    try {
      const rawPayload = decodeURIComponent(e.parameter.payload);
      assertNoDuplicateReportAwardModelIds_(rawPayload);
      const payload = JSON.parse(rawPayload);
      return jsonResponse(reportWritePayload_(payload), cb);
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.message }, cb);
    }
  }

  if (action === 'read') {
    try {
      const date = e.parameter.date;
      const seg  = parseInt(e.parameter.seg);
      const data = readData(date, seg);
      return jsonResponse({ status: 'ok', data, summary: reportSummaryFromData_(data, date, seg) }, cb);
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.message }, cb);
    }
  }

  // ── 個人回報：寫入 ──
  if (action === 'pwrite') {
    try {
      const payload = JSON.parse(decodeURIComponent(e.parameter.payload));
      return jsonResponse(personalWritePayload_(payload), cb);
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.message }, cb);
    }
  }

  // ── 個人回報：讀取（某日某時段全部）──
  if (action === 'pread') {
    try {
      const date = e.parameter.date;
      const seg  = parseInt(e.parameter.seg);
      return jsonResponse(personalReadPayload_({ date, seg }), cb);
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.message }, cb);
    }
  }

  // ── 巡店追蹤：寫入（patrol.html，JSONP）──
  if (action === 'ptwrite') {
    const cb = e.parameter.callback;
    try {
      ptRequireSession_(e.parameter.token, action);
      const rows = JSON.parse(e.parameter.payload);
      const res = writePatrol(rows);
      const out = { status: 'ok', written: res.written, updated: res.updated };
      if (cb) {
        return ContentService.createTextOutput(cb + '(' + JSON.stringify(out) + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return jsonResponse(out);
    } catch(err) {
      if (cb) {
        return ContentService.createTextOutput(cb + '(' + JSON.stringify(ptRouteErrorPayload_(err, action, e.parameter.token)) + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return jsonResponse(ptRouteErrorPayload_(err, action, e.parameter.token));
    }
  }

  // ── 巡店追蹤：讀取全部明細＋本區設定（patrol.html；現行資料端點免密碼）──
  if (action === 'ptread') {
    try {
      ptRequireSession_(e.parameter.token, action);
      return jsonResponse({ status: 'ok', rows: readPatrol(), stores: PT_STORES, title: PT_TITLE });
    } catch(err) {
      return jsonResponse(ptRouteErrorPayload_(err, action, e.parameter.token));
    }
  }

  // ── 巡店追蹤：手機／大盤輕量摘要（不回傳全部巡店明細）──
  if (action === 'ptsummary') {
    try {
      ptRequireSession_(e.parameter.token, action);
      const month = patrolSummaryMonth_(e.parameter.month);
      return jsonResponse({ status:'ok', summary:readPatrolSummary_(month), stores:PT_STORES, title:PT_TITLE });
    } catch(err) {
      return jsonResponse(ptRouteErrorPayload_(err, action, e.parameter.token));
    }
  }

  // ── 巡店追蹤：按月／店點延遲讀取明細；大盤不得呼叫 ──
  if (action === 'ptdetail') {
    try {
      ptRequireSession_(e.parameter.token, action);
      return jsonResponse(readPatrolDetail_({
        month:patrolSummaryMonth_(e.parameter.month),
        store:e.parameter.store,
        page:e.parameter.page,
        limit:e.parameter.limit
      }));
    } catch(err) {
      return jsonResponse(ptRouteErrorPayload_(err, action, e.parameter.token));
    }
  }

  // ── 巡店到離店：讀取指定日期（獨立於巡店明細）──
  if (action === 'ptvisit_read') {
    try {
      ptRequireSession_(e.parameter.token, action);
      const state = patrolVisitState_(e.parameter.date || '');
      return jsonResponse({ status: 'ok', events: state.events, openVisit: state.openVisit });
    } catch(err) {
      return jsonResponse(ptRouteErrorPayload_(err, action, e.parameter.token));
    }
  }

  // ── 督導半月檢查：寫入（patrol.html，JSONP）──
  if (action === 'hwrite') {
    const cb = e.parameter.callback;
    try {
      ptRequireSession_(e.parameter.token, action);
      const rows = JSON.parse(e.parameter.payload);
      const written = writeHalfCheck(rows);
      const body = { status: 'ok', written: written };
      if (cb) return ContentService.createTextOutput(cb + '(' + JSON.stringify(body) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
      return jsonResponse(body);
    } catch(err) {
      const body = ptRouteErrorPayload_(err, action, e.parameter.token);
      if (cb) return ContentService.createTextOutput(cb + '(' + JSON.stringify(body) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
      return jsonResponse(body);
    }
  }

  // ── 督導半月檢查：讀取（patrol.html；現行資料端點免密碼）──
  if (action === 'hread') {
    try {
      ptRequireSession_(e.parameter.token, action);
      return jsonResponse({ status: 'ok', rows: readHalfCheck() });
    } catch(err) {
      return jsonResponse(ptRouteErrorPayload_(err, action, e.parameter.token));
    }
  }

  // ── 每月班表：讀取指定月份（patrol.html；現行資料端點免密碼）──
  if (action === 'sread') {
    try {
      ptRequireSession_(e.parameter.token, action);
      return jsonResponse({ status: 'ok', schedule: readSchedule(e.parameter.month || '') });
    } catch(err) {
      return jsonResponse(ptRouteErrorPayload_(err, action, e.parameter.token));
    }
  }

  return jsonResponse({ status: 'error', message: 'unknown action' }, cb);
}

// ════════════════════════════════════
// 督導巡店追蹤（patrol.html）
// 工作表：巡店明細
// 欄位：fillTime, arriveTime, leaveTime, district, code, store,
//       inspector, item, result, reason, month, savedAt
// 以 fillTime+store+item 為唯一鍵，重複上傳自動略過
//
// PT_KEY 僅從 Apps Script Script Properties 讀取，絕不寫入 repo。
// 驗證成功後簽發短效 token；巡店、班表、半月檢查與私有媒體共用同一授權邊界。
// ════════════════════════════════════
const PATROL_SESSION_TTL_SECONDS = 1800;
const PATROL_SESSION_CONTRACT = 'patrol-session-v2';
const PATROL_AUTH_DEPLOYMENT = 'patrol-auth-stateless-20260821';
const PATROL_SESSION_SIGNING_KEY_PROPERTY = 'PATROL_SESSION_SIGNING_KEY';
const PATROL_SESSION_REVOKED_PREFIX = 'PATROL_SESSION_REVOKED_';

// ── 分享給其他督導時，每人自建試算表與 GAS 部署，改這兩個設定即可 ──
// （網頁 patrol.html 大家共用，會自動抓各自 GAS 回傳的標題與門市清單）
const PT_TITLE = '北一二B區 · 33 項檢核追蹤';
const PT_STORES = [
  { code: 'DNB10059', name: '台北通化' },
  { code: 'DNB10062', name: '台北酒泉' },
  { code: 'DNB10307', name: '台北三創' },
  { code: 'DNB10168', name: '台北萬大' },
  { code: 'DNB10440', name: '台北六張犁' },
  { code: 'DNB10094', name: '台北復興南' },
  { code: 'DNB10082', name: '台北永吉' },
  { code: 'DNB10284', name: '台北大稻埕' },
  { code: 'DNB10146', name: '台北杭州南' },
];

function ptConfiguredKey_() {
  const value = PropertiesService.getScriptProperties().getProperty('PT_KEY');
  const key = String(value || '').trim();
  return key && !/^CHANGE_ME$/i.test(key) ? key : '';
}

function ptSessionCacheKey_(token) {
  return 'patrol_session:' + ptHashHex_(String(token || '')).slice(0, 40);
}

function ptHashHex_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || '')).map(function(byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function ptBase64UrlEncode_(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/g, '');
}

function ptBase64UrlDecodeText_(value) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(String(value || ''))).getDataAsString('UTF-8');
}

function ptSessionNowSeconds_() {
  return Math.floor(Date.now() / 1000);
}

function ptSessionSigningKey_() {
  const props = PropertiesService.getScriptProperties();
  let key = String(props.getProperty(PATROL_SESSION_SIGNING_KEY_PROPERTY) || '');
  if (key) return key;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    key = String(props.getProperty(PATROL_SESSION_SIGNING_KEY_PROPERTY) || '');
    if (!key) {
      key = [Utilities.getUuid(), Utilities.getUuid(), Utilities.getUuid()].join('');
      props.setProperty(PATROL_SESSION_SIGNING_KEY_PROPERTY, key);
    }
    return key;
  } finally {
    lock.releaseLock();
  }
}

function ptConstantTimeEqual_(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  let diff = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index++) diff |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  return diff === 0;
}

function ptAuthError_(reason) {
  const error = new Error('unauthorized');
  error.authReason = String(reason || 'AUTH_TOKEN_INVALID');
  return error;
}

function ptAuthLog_(action, reason, tokenPresent, extra) {
  const event = {
    event:'PATROL_AUTH', action:String(action || ''), reason:String(reason || ''),
    deployment:PATROL_AUTH_DEPLOYMENT, sessionContract:PATROL_SESSION_CONTRACT,
    tokenPresent:Boolean(tokenPresent), serverTime:new Date().toISOString()
  };
  Object.keys(extra || {}).forEach(function(key) { event[key] = extra[key]; });
  Logger.log(JSON.stringify(event));
}

function ptAuthErrorPayload_(error, action, token) {
  const reason = String(error && error.authReason || 'AUTH_TOKEN_INVALID');
  const tokenPresent = Boolean(String(token || '').trim());
  ptAuthLog_(action, reason, tokenPresent);
  return {
    status:'error', message:'unauthorized', reason:reason,
    auth:{
      reason:reason, action:String(action || ''), deployment:PATROL_AUTH_DEPLOYMENT,
      sessionContract:PATROL_SESSION_CONTRACT, tokenPresent:tokenPresent,
      serverTime:new Date().toISOString()
    }
  };
}

function ptRouteErrorPayload_(error, action, token) {
  if (error && error.authReason) return ptAuthErrorPayload_(error, action, token);
  return {status:'error', message:error && error.message ? error.message : String(error)};
}

function ptSessionSignature_(payloadPart) {
  return ptBase64UrlEncode_(Utilities.computeHmacSha256Signature(String(payloadPart || ''), ptSessionSigningKey_()));
}

function ptIssueSession_() {
  const now = ptSessionNowSeconds_();
  const claims = {v:2, aud:PATROL_AUTH_DEPLOYMENT, iat:now, exp:now + PATROL_SESSION_TTL_SECONDS, jti:Utilities.getUuid()};
  const payloadPart = ptBase64UrlEncode_(Utilities.newBlob(JSON.stringify(claims), 'application/json').getBytes());
  const token = payloadPart + '.' + ptSessionSignature_(payloadPart);
  CacheService.getScriptCache().put(ptSessionCacheKey_(token), String(claims.exp), PATROL_SESSION_TTL_SECONDS);
  return {token:token, claims:claims};
}

function ptSessionRevocationKey_(jti) {
  return PATROL_SESSION_REVOKED_PREFIX + ptHashHex_(String(jti || '')).slice(0, 40);
}

function ptVerifySession_(token, action) {
  const clean = String(token || '').trim();
  if (!clean) throw ptAuthError_('AUTH_TOKEN_MISSING');
  const parts = clean.split('.');
  if (parts.length !== 2) {
    if (/^[A-Za-z0-9-]{20,160}$/.test(clean)) {
      if (CacheService.getScriptCache().get(ptSessionCacheKey_(clean)) === 'ok') {
        throw ptAuthError_('AUTH_DEPLOYMENT_MISMATCH');
      }
      throw ptAuthError_('AUTH_SESSION_NOT_FOUND');
    }
    throw ptAuthError_('AUTH_TOKEN_INVALID');
  }
  if (!/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) throw ptAuthError_('AUTH_TOKEN_INVALID');
  if (!ptConstantTimeEqual_(parts[1], ptSessionSignature_(parts[0]))) throw ptAuthError_('AUTH_TOKEN_INVALID');
  let claims;
  try { claims = JSON.parse(ptBase64UrlDecodeText_(parts[0])); }
  catch (error) { throw ptAuthError_('AUTH_TOKEN_INVALID'); }
  if (!claims || claims.v !== 2 || !claims.jti || !Number.isFinite(Number(claims.exp))) throw ptAuthError_('AUTH_TOKEN_INVALID');
  if (String(claims.aud || '') !== PATROL_AUTH_DEPLOYMENT) throw ptAuthError_('AUTH_DEPLOYMENT_MISMATCH');
  const now = ptSessionNowSeconds_();
  if (Number(claims.exp) <= now) throw ptAuthError_('AUTH_SESSION_EXPIRED');
  const revokedUntil = Number(PropertiesService.getScriptProperties().getProperty(ptSessionRevocationKey_(claims.jti)) || 0);
  if (revokedUntil >= now) throw ptAuthError_('AUTH_SESSION_REVOKED');
  const cache = CacheService.getScriptCache();
  if (!cache.get(ptSessionCacheKey_(clean))) {
    ptAuthLog_(action, 'AUTH_CACHE_MISS', true);
    cache.put(ptSessionCacheKey_(clean), String(claims.exp), Math.max(1, Math.min(PATROL_SESSION_TTL_SECONDS, Number(claims.exp) - now)));
  }
  return claims;
}

function ptRequireSession_(token, action) {
  return ptVerifySession_(token, action);
}

function ptSessionAuthorized_(token) {
  try { ptRequireSession_(token, 'legacy-auth-check'); return true; }
  catch (error) { return false; }
}

function ptCredentialAuthorized_(key, token) {
  const configuredKey = ptConfiguredKey_();
  if (!configuredKey) return false;
  if (ptSessionAuthorized_(token)) return true;
  return String(key || '') === configuredKey;
}

function ptAuthorized(e) {
  const params = (e && e.parameter) || {};
  return ptCredentialAuthorized_(params.key, params.token);
}

function ptAuthenticatePayload(payload) {
  const body = payload || {};
  if (!ptConfiguredKey_()) throw ptAuthError_('AUTH_TOKEN_INVALID');

  const existingToken = String(body.token || '').trim();
  if (existingToken) {
    const claims = ptRequireSession_(existingToken, 'ptauth');
    return {
      token:existingToken, expiresIn:Math.max(0, Number(claims.exp) - ptSessionNowSeconds_()),
      expiresAt:Number(claims.exp), deployment:PATROL_AUTH_DEPLOYMENT, sessionContract:PATROL_SESSION_CONTRACT
    };
  }

  if (String(body.key || '') !== ptConfiguredKey_()) throw ptAuthError_('AUTH_CREDENTIAL_INVALID');
  const issued = ptIssueSession_();
  ptAuthLog_('ptauth', 'AUTH_SESSION_ISSUED', false, {sessionIssued:true, expiresAt:issued.claims.exp});
  return {
    token:issued.token, expiresIn:PATROL_SESSION_TTL_SECONDS, expiresAt:issued.claims.exp,
    deployment:PATROL_AUTH_DEPLOYMENT, sessionContract:PATROL_SESSION_CONTRACT
  };
}

function ptLogoutPayload(payload) {
  const token = String((payload || {}).token || '').trim();
  if (token) {
    try {
      const claims = ptRequireSession_(token, 'ptlogout');
      PropertiesService.getScriptProperties().setProperty(ptSessionRevocationKey_(claims.jti), String(claims.exp));
    } catch (error) {
      if (error.authReason !== 'AUTH_SESSION_EXPIRED') throw error;
    }
    CacheService.getScriptCache().remove(ptSessionCacheKey_(token));
  }
  return {};
}

function ptSummaryPostPayload_(payload) {
  const body = payload || {};
  ptRequireSession_(body.token, 'ptsummary');
  const month = patrolSummaryMonth_(body.month);
  return { summary:readPatrolSummary_(month), stores:PT_STORES, title:PT_TITLE };
}

function ptDetailPostPayload_(payload) {
  const body = payload || {};
  ptRequireSession_(body.token, 'ptdetail');
  return readPatrolDetail_({
    month:patrolSummaryMonth_(body.month),
    store:body.store,
    page:body.page,
    limit:body.limit
  });
}

function ptMileageMonthPostPayload_(payload) {
  const body = payload || {};
  ptRequireSession_(body.token, 'ptmileage');
  return readPatrolMileageMonth_({
    month:patrolSummaryMonth_(body.month),
    page:body.page,
    limit:body.limit
  });
}

function ptMileage2MonthPostPayload_(payload) {
  const body = payload || {};
  ptRequireSession_(body.token, 'ptmileage2');
  return readPatrolMileageMonthV2_({
    month:patrolSummaryMonth_(body.month),
    page:body.page
  });
}

const PATROL_SHEET = '巡店明細';
const PATROL_HEADERS = ['fillTime','arriveTime','leaveTime','district','code','store','inspector','item','result','reason','month','savedAt'];

function getPatrolSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(PATROL_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PATROL_SHEET);
    sh.appendRow(PATROL_HEADERS);
    sh.setFrozenRows(1);
    // 全欄設純文字，避免 2026/7/1 之類被試算表轉成 Date 物件
    sh.getRange('A:L').setNumberFormat('@');
  }
  return sh;
}

function patrolTimeStr(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy/M/d H:mm');
  return String(v == null ? '' : v).trim();
}

function patrolKey(fillTime, store, item) {
  return patrolTimeStr(fillTime) + '|' + String(store) + '|' + Number(item);
}

function writePatrol(rows) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getPatrolSheet();
    const data = sh.getDataRange().getValues();
    // key → { row: 試算表列號, result, reason }
    const seen = {};
    for (let i = 1; i < data.length; i++) {
      seen[patrolKey(data[i][0], data[i][5], data[i][7])] =
        { row: i + 1, result: String(data[i][8] || ''), reason: String(data[i][9] || '') };
    }
    const now = new Date().toISOString();
    const toAdd = [];
    let updated = 0;
    rows.forEach(r => {
      const k = patrolKey(r.fillTime, r.store, r.item);
      const ex = seen[k];
      if (ex) {
        // 同一筆但結果/原因有變（來源表事後補填「是否合格」）→ 就地更新
        const nr = String(r.result || ''), nrs = String(r.reason || '');
        if (ex.row > 0 && (nr !== ex.result || nrs !== ex.reason)) {
          sh.getRange(ex.row, 9, 1, 2).setValues([[nr, nrs]]);
          sh.getRange(ex.row, 12).setValue(now);
          ex.result = nr; ex.reason = nrs;
          updated++;
        }
        return;
      }
      seen[k] = { row: -1, result: String(r.result || ''), reason: String(r.reason || '') };
      toAdd.push([
        patrolTimeStr(r.fillTime), String(r.arriveTime || ''), String(r.leaveTime || ''),
        String(r.district || ''), String(r.code || ''), String(r.store || ''), String(r.inspector || ''),
        String(r.item || ''), String(r.result || ''), String(r.reason || ''), String(r.month || ''), now
      ]);
    });
    if (toAdd.length > 0) {
      sh.getRange(sh.getLastRow() + 1, 1, toAdd.length, PATROL_HEADERS.length).setValues(toAdd);
    }
    return { written: toAdd.length, updated: updated };
  } finally {
    lock.releaseLock();
  }
}

function readPatrol() {
  return readPatrolFromSheet_(getPatrolSheet());
}

function readPatrolFromSheet_(sh) {
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const o = {};
    headers.forEach((h, idx) => {
      let v = data[i][idx];
      if (v instanceof Date) v = patrolTimeStr(v);
      o[h] = v;
    });
    rows.push(o);
  }
  return rows;
}

// 摘要／分頁明細只讀既有巡店 schema 的 A:L，避免將工作表其他格式化欄位載入記憶體。
// raw ptread 仍保留原本 readPatrolFromSheet_ 語意，兩者互不影響。
function readPatrolContractColumns_(sh) {
  const lastRow = sh.getLastRow();
  if (lastRow < 1) return [];
  const data = sh.getRange(1, 1, lastRow, PATROL_HEADERS.length).getValues();
  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const item = {};
    headers.forEach(function(header, index) {
      let value = data[i][index];
      if (value instanceof Date) value = patrolTimeStr(value);
      item[header] = value;
    });
    rows.push(item);
  }
  return rows;
}

const PATROL_SUMMARY_CACHE_SECONDS = 120;
const PATROL_DETAIL_MAX_LIMIT = 100;
// v1 是已發布 Patrol 前端的永久相容 contract；不可改成 visits v2。
const PATROL_MILEAGE_MAX_LIMIT = 500;
// 一個月份理論上最多 31 日 × 9 店 = 279 個巡店事件。里程 API 不得再
// 回傳 33 題逐題 raw rows，也不需要以第二頁 cache 命中來維持正確性。
const PATROL_MILEAGE_MAX_VISITS = 279;
const PATROL_MILEAGE_CACHE_SECONDS = 120;
const PATROL_MILEAGE_FIELDS = ['fillTime','arriveTime','code','store','month'];

function patrolSummaryMonth_(value) {
  const month = String(value || '').trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('invalid patrol month');
  return month;
}

function patrolSummaryNow_() {
  return new Date(Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX"));
}

function patrolSummaryIsoDate_(row) {
  const values = [row && row.arriveTime, row && row.fillTime];
  for (let i = 0; i < values.length; i++) {
    const text = String(values[i] || '').trim();
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
      const parsed = new Date(text);
      if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, 'Asia/Taipei', 'yyyy-MM-dd');
    }
    const match = text.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (match) return match[1] + '-' + ('0' + Number(match[2])).slice(-2) + '-' + ('0' + Number(match[3])).slice(-2);
  }
  return '';
}

function patrolSummaryRowMonth_(row) {
  const explicit = String(row && row.month || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(explicit) ? explicit : patrolSummaryIsoDate_(row).slice(0, 7);
}

function patrolSummaryFillIsoDate_(row) {
  const match = String(row && row.fillTime || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  return match ? match[1] + '-' + ('0' + Number(match[2])).slice(-2) + '-' + ('0' + Number(match[3])).slice(-2) : '';
}

function patrolSummarySourceMeta_(sheet) {
  const lastRow = sheet.getLastRow();
  // 巡店正式寫入只會 append；以最後資料列的 server savedAt 作 source version。
  // cache hit 不可再為了版本判定掃描 1,475+ 列，否則輕量摘要仍會被 transport latency 吃掉。
  const latestValue = lastRow > 1 ? patrolTimeStr(sheet.getRange(lastRow, 12).getValue()) : '';
  return {
    sourceVersion:String(lastRow) + ':' + latestValue,
    sourceUpdatedAt:latestValue,
    lastRow:lastRow
  };
}

function patrolSummaryPreviousWindow_(monthKey) {
  const parts = monthKey.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const start = month % 2 === 1 ? month : month - 1;
  const previousMonth = start === 1 ? 11 : start - 2;
  const previousYear = start === 1 ? year - 1 : year;
  const key = previousYear + '-' + ('0' + previousMonth).slice(-2);
  return { months:ptWinMonths(key), label:previousMonth + '–' + (previousMonth + 1) + '月' };
}

function patrolSummaryDaysSince_(dateValue, now) {
  if (!dateValue) return null;
  const end = Date.parse(String(dateValue) + 'T00:00:00+08:00');
  return Number.isFinite(end) ? Math.max(0, Math.floor((now.getTime() - end) / 86400000)) : null;
}

function patrolSummaryAwareness_(rows, month, now) {
  let count = 0;
  const completionDays = [];
  for (let item = 19; item <= 33; item++) {
    const days = rows.filter(function(row) {
      return String(row.month) === month && Number(row.item) === item && String(row.result).toLowerCase() === 'v';
    }).map(function(row) { return ptDayOf(row.fillTime); }).filter(Number.isFinite);
    if (days.length) { count++; completionDays.push(Math.min.apply(null, days)); }
  }
  const all = count === 15;
  const completedDay = all ? Math.max.apply(null, completionDays) : null;
  const realMonth = Utilities.formatDate(now, 'Asia/Taipei', 'yyyy-MM');
  const daysLeft = 20 - Number(Utilities.formatDate(now, 'Asia/Taipei', 'd'));
  let status = 'not_complete';
  if (all) status = completedDay <= 20 ? 'complete' : 'late';
  else if (month === realMonth) status = daysLeft >= 0 ? 'due' : 'overdue';
  return { count:count, total:15, all:all, completedDay:completedDay, status:status, daysLeft:month === realMonth ? daysLeft : null };
}

function patrolSummaryItem18State_(rows, months) {
  const row = rows.find(function(item) {
    return Number(item.item) === 18 && String(item.result).toLowerCase() === 'v' && months.indexOf(String(item.month)) !== -1;
  });
  return { done:Boolean(row), date:row ? patrolSummaryFillIsoDate_(row) : '' };
}

function patrolSummaryDashboardProgress_(rows, expectedItems) {
  const done = function(item) {
    return rows.some(function(row) { return Number(row.item) === item && String(row.result).toLowerCase() === 'v'; });
  };
  const abnormal = function(item) {
    return !done(item) && rows.some(function(row) {
      const reason = String(row.reason || '').trim();
      return Number(row.item) === item && reason && !/^na$/i.test(reason);
    });
  };
  const completed = expectedItems.filter(done).length;
  const issues = expectedItems.filter(abnormal).length;
  const missing = expectedItems.length - completed;
  return { completed:completed, total:expectedItems.length, missing:missing, issues:issues, status:issues ? 'issue' : missing ? 'miss' : 'done' };
}

function patrolSummaryHalfDashboard_(allRows, month) {
  const windowMonths = ptWinMonths(month);
  const window = { months:windowMonths, label:Number(windowMonths[0].slice(5)) + '–' + Number(windowMonths[1].slice(5)) + '月' };
  const twiceItems = []; for (let item = 2; item <= 13; item++) twiceItems.push(item);
  const monthlyItems = [14,15,16,17];
  const stores = PT_STORES.map(function(store) {
    const rows = ptStoreRows(allRows, store);
    const monthRows = rows.filter(function(row) { return String(row.month || '').slice(0, 7) === month; });
    const h1Rows = monthRows.filter(function(row) { return ptDayOf(row.fillTime) <= 15; });
    const h2Rows = monthRows.filter(function(row) { return ptDayOf(row.fillTime) > 15; });
    const dates = {};
    monthRows.forEach(function(row) { const date = patrolSummaryIsoDate_(row); if (date) dates[date] = true; });
    const checked = {};
    monthRows.forEach(function(row) {
      const reason = String(row.reason || '').trim();
      const item = Number(row.item);
      if (item >= 1 && item <= 33 && (String(row.result).toLowerCase() === 'v' || /^na$/i.test(reason))) checked[item] = true;
    });
    const visitCount = Object.keys(dates).length;
    const checkedItems = Object.keys(checked).length;
    return {
      store:String(store.name),
      h1:patrolSummaryDashboardProgress_(h1Rows, twiceItems),
      h2:patrolSummaryDashboardProgress_(h2Rows, twiceItems),
      inventory14to17:patrolSummaryDashboardProgress_(monthRows, monthlyItems),
      item18:patrolSummaryDashboardProgress_(rows.filter(function(row) { return windowMonths.indexOf(String(row.month || '').slice(0, 7)) !== -1; }), [18]),
      visitCount:visitCount, checkedItems:checkedItems,
      eligibleForIssues:checkedItems >= 10 && visitCount > 4
    };
  });
  const completed = function(key) { return stores.filter(function(store) { return store[key].status === 'done'; }).length; };
  const abnormalItems = stores.filter(function(store) { return store.eligibleForIssues; }).reduce(function(sum, store) {
    return sum + store.h1.issues + store.h2.issues + store.inventory14to17.issues + store.item18.issues;
  }, 0);
  return {
    month:month, window:window,
    completedH1Stores:completed('h1'), completedH2Stores:completed('h2'),
    completedInventoryStores:completed('inventory14to17'), completedItem18Stores:completed('item18'),
    abnormalItems:abnormalItems, stores:stores
  };
}

function patrolSummaryContract_(allRows, month, now, meta) {
  allRows = (Array.isArray(allRows) ? allRows : []).map(function(row) {
    if (/^\d{4}-\d{2}$/.test(String(row && row.month || '').slice(0, 7))) return row;
    const copy = Object.assign({}, row);
    copy.month = patrolSummaryFillIsoDate_(row).slice(0, 7);
    return copy;
  });
  const windowMonths = ptWinMonths(month);
  const item18Window = { months:windowMonths, label:Number(windowMonths[0].slice(5)) + '–' + Number(windowMonths[1].slice(5)) + '月' };
  const previousWindow = patrolSummaryPreviousWindow_(month);
  const storeRows = PT_STORES.map(function(store) {
    const rows = ptStoreRows(allRows, store);
    const recordName = rows.length ? String(rows[0].store || '') : null;
    const visited = rows.some(function(row) { return String(row.month) === month; });
    const missingItemNumbers = [];
    for (let item = 1; item <= 33; item++) if (!ptItemDone(rows, item, month)) missingItemNumbers.push(item);
    const dates = rows.map(patrolSummaryFillIsoDate_).filter(Boolean).sort();
    const lastVisit = dates.length ? dates[dates.length - 1] : '';
    const awareness = rows.length ? patrolSummaryAwareness_(rows, month, now) : { count:0, total:15, all:false, completedDay:null, status:'not_complete', daysLeft:null };
    const item18Current = patrolSummaryItem18State_(rows, item18Window.months);
    return {
      name:String(store.name), code:String(store.code || ''), recordName:recordName, visited:visited,
      done:33 - missingItemNumbers.length, missingItems:missingItemNumbers.length,
      missingItemNumbers:missingItemNumbers, lastVisit:lastVisit,
      daysSince:patrolSummaryDaysSince_(lastVisit, now),
      status:visited ? (missingItemNumbers.length ? 'attention' : 'complete') : 'pending',
      result:visited ? (missingItemNumbers.length ? '缺 ' + missingItemNumbers.length + ' 項' : '全項完成') : '本月未巡',
      item18:item18Current.done ? { status:'done' } : { status:'miss', detail:'本期(' + item18Window.label + ')未完成' },
      awareness:awareness
    };
  });

  const inventoryStores = PT_STORES.map(function(store) {
    const rows = ptStoreRows(allRows, store);
    const items = {};
    [14,15,16,17].forEach(function(item) { items[item] = ptItemDone(rows, item, month); });
    return { name:String(store.name), items:items, complete:[14,15,16,17].every(function(item) { return items[item]; }) };
  });
  const item18Stores = PT_STORES.map(function(store) {
    const rows = ptStoreRows(allRows, store);
    return {
      name:String(store.name),
      current:patrolSummaryItem18State_(rows, item18Window.months),
      previous:patrolSummaryItem18State_(rows, previousWindow.months)
    };
  });
  const groupedVisits = [];
  const visitCounts = PT_STORES.map(function(store) {
    const groups = {};
    ptStoreRows(allRows, store).forEach(function(row) {
      const date = patrolSummaryIsoDate_(row);
      const rowMonth = patrolSummaryRowMonth_(row);
      if (!date || rowMonth !== month) return;
      if (!groups[date]) groups[date] = [];
      groups[date].push(row);
    });
    Object.keys(groups).forEach(function(date) {
      const byItem = {};
      groups[date].forEach(function(row) {
        const item = Number(row.item);
        const result = String(row.result || '').trim().toLowerCase();
        const reason = String(row.reason || '').trim();
        if (item >= 1 && item <= 33) byItem[item] = byItem[item] === true || result === 'v' || result === 'na' || /^na$/i.test(reason);
      });
      const missing = Object.keys(byItem).map(Number).filter(function(item) { return item !== 1 && byItem[item] !== true; });
      groupedVisits.push({ date:date, store:String(store.name), complete:Object.keys(byItem).length > 0 && missing.length === 0, missingItems:missing.length, missingItemNumbers:missing });
    });
    return { store:String(store.name), count:Object.keys(groups).length, basis:'unique-store-date', sameDayMultipleVisitsDistinguishable:false };
  });
  groupedVisits.sort(function(left, right) { return right.date.localeCompare(left.date) || left.store.localeCompare(right.store); });
  const visitedStores = storeRows.filter(function(store) { return store.visited; }).length;
  const attentionStores = storeRows.filter(function(store) { return store.status === 'attention'; }).map(function(store) { return store.name; });
  const unvisitedStores = storeRows.filter(function(store) { return !store.visited; }).map(function(store) { return store.name; });
  const awarenessStores = storeRows.map(function(store) {
    return { store:store.name, count:store.awareness.count, total:store.awareness.total, completedDay:store.awareness.completedDay, status:store.awareness.status, daysLeft:store.awareness.daysLeft };
  });
  return {
    month:month, statisticsPeriod:month.replace('-', ' 年 ') + ' 月', periodVerified:true,
    totalStores:PT_STORES.length, visitedStores:visitedStores, unvisitedStores:unvisitedStores,
    completionRate:PT_STORES.length ? visitedStores / PT_STORES.length : 0,
    fullyDoneStores:storeRows.filter(function(store) { return store.visited && store.missingItems === 0; }).length,
    totalMissingItems:storeRows.filter(function(store) { return store.visited; }).reduce(function(sum, store) { return sum + store.missingItems; }, 0),
    attentionStores:attentionStores,
    item18:{ window:item18Window, previousWindow:previousWindow, completedStores:item18Stores.filter(function(store) { return store.current.done; }).length, total:PT_STORES.length, stores:item18Stores },
    inventory14to17:{ items:[14,15,16,17], completedStores:inventoryStores.filter(function(store) { return store.complete; }).length, total:PT_STORES.length, stores:inventoryStores },
    items19to33:{ deadlineDay:20, completedStores:awarenessStores.filter(function(store) { return store.count === store.total; }).length, total:PT_STORES.length, stores:awarenessStores },
    halfDashboard:patrolSummaryHalfDashboard_(allRows, month),
    visitCounts:visitCounts, recentVisits:groupedVisits.slice(0, 10), stores:storeRows,
    visitCountBasis:'unique-store-date', sameDayMultipleVisitsDistinguishable:false,
    sourceVersion:String(meta.sourceVersion || ''), sourceUpdatedAt:String(meta.sourceUpdatedAt || ''),
    generatedAt:Utilities.formatDate(now, 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX")
  };
}

function readPatrolSummary_(month) {
  const sheet = getPatrolSheet();
  const meta = patrolSummarySourceMeta_(sheet);
  const cache = CacheService.getScriptCache();
  const cacheKey = 'ptsummary:' + month + ':' + Utilities.base64EncodeWebSafe(meta.sourceVersion).slice(0, 80);
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);
  const summary = patrolSummaryContract_(readPatrolContractColumns_(sheet), month, patrolSummaryNow_(), meta);
  const serialized = JSON.stringify(summary);
  if (serialized.length < 95000) cache.put(cacheKey, serialized, PATROL_SUMMARY_CACHE_SECONDS);
  return summary;
}

function readPatrolDetail_(options) {
  const store = patrolVisitStore_(options.store);
  const page = Number(options.page || 1);
  const requestedLimit = Number(options.limit || 50);
  if (!Number.isInteger(page) || page < 1) throw new Error('invalid patrol detail page');
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw new Error('invalid patrol detail limit');
  const limit = Math.min(PATROL_DETAIL_MAX_LIMIT, requestedLimit);
  const all = ptStoreRows(readPatrolContractColumns_(getPatrolSheet()), { name:store, code:(PT_STORES.find(function(item) { return item.name === store; }) || {}).code || '' })
    .filter(function(row) { return patrolSummaryRowMonth_(row) === options.month; })
    .map(function(row) { const normalized = Object.assign({}, row); normalized.month = patrolSummaryRowMonth_(row); return normalized; })
    .sort(function(left, right) { return patrolSummaryIsoDate_(right).localeCompare(patrolSummaryIsoDate_(left)) || Number(left.item) - Number(right.item); });
  const start = (page - 1) * limit;
  return { status:'ok', month:options.month, store:store, page:page, limit:limit, totalRows:all.length, rows:all.slice(start, start + limit) };
}

function patrolMileageStore_(row) {
  const code = String(row && row.code || '').trim();
  const rawStore = String(row && row.store || '').trim();
  const match = PT_STORES.find(function(store) {
    if (code && String(store.code || '') === code) return true;
    const official = String(store.name || '').replace(/\s+/g, '');
    const raw = rawStore.replace(/\s+/g, '');
    const key = official.replace(/^台北/, '');
    return raw && (raw === official || raw === key || raw.indexOf(key) !== -1 || official.indexOf(raw) !== -1);
  });
  // 無法正規化時保留原值，讓前端回報 MILEAGE_STORE_MAPPING_ERROR，不能靜默排除。
  return match ? String(match.name) : rawStore;
}

function patrolMileageCacheKey_(month, sourceVersion, page, limit) {
  const version = Utilities.base64EncodeWebSafe(String(sourceVersion || '')).slice(0, 80);
  return ['ptmileage', month, version, page, limit].join(':');
}

function patrolMileageV2CacheKey_(month, sourceVersion) {
  const version = Utilities.base64EncodeWebSafe(String(sourceVersion || '')).slice(0, 80);
  return ['ptmileage-visits-v2', month, version].join(':');
}

// Legacy, published contract. Keep ptmlieage stable for existing Patrol pages
// while ptmlieage2 rolls out the deduplicated visit shape independently.
function readPatrolMileageMonth_(options) {
  const startedAt = Date.now();
  const month = patrolSummaryMonth_(options.month);
  const page = Number(options.page || 1);
  const requestedLimit = Number(options.limit || PATROL_MILEAGE_MAX_LIMIT);
  if (!Number.isInteger(page) || page < 1) throw new Error('invalid patrol mileage page');
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) throw new Error('invalid patrol mileage limit');
  const limit = Math.min(PATROL_MILEAGE_MAX_LIMIT, requestedLimit);
  const sheet = getPatrolSheet();
  const meta = patrolSummarySourceMeta_(sheet);
  const cache = CacheService.getScriptCache();
  const cacheKey = patrolMileageCacheKey_(month, meta.sourceVersion, page, limit);
  const cached = cache.get(cacheKey);
  if (cached) {
    const result = JSON.parse(cached);
    result.diagnostics = Object.assign({}, result.diagnostics, {
      cacheHit:true, sheetScans:0, serverDurationMs:Date.now() - startedAt
    });
    return result;
  }

  // 每個 request 以單次 A:L scan 產生完整月份的 v1 分頁快照。
  const rows = readPatrolContractColumns_(sheet)
    .filter(function(row) { return patrolSummaryRowMonth_(row) === month; })
    .map(function(row) {
      return {
        fillTime:String(row.fillTime || ''), arriveTime:String(row.arriveTime || ''),
        code:String(row.code || ''), store:patrolMileageStore_(row), month:month
      };
    })
    .sort(function(left, right) {
      return patrolSummaryIsoDate_(left).localeCompare(patrolSummaryIsoDate_(right)) ||
        String(left.arriveTime).localeCompare(String(right.arriveTime)) || String(left.store).localeCompare(String(right.store));
    });
  const totalRows = rows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / limit));
  if (page > totalPages) throw new Error('invalid patrol mileage page');
  const generatedAt = Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX");
  const diagnostics = {
    sourceRows:Math.max(0, Number(meta.lastRow || 1) - 1), matchedRows:totalRows,
    cacheHit:false, sheetScans:1, serverDurationMs:Date.now() - startedAt
  };
  let requestedResult = null;
  for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
    const start = (currentPage - 1) * limit;
    const result = {
      status:'ok', contract:'patrol-mileage-month-v1', fields:PATROL_MILEAGE_FIELDS.slice(),
      month:month, page:currentPage, limit:limit, totalRows:totalRows, totalPages:totalPages,
      rows:rows.slice(start, start + limit), sourceVersion:String(meta.sourceVersion || ''),
      generatedAt:generatedAt, diagnostics:diagnostics
    };
    const serialized = JSON.stringify(result);
    if (serialized.length < 95000) cache.put(
      patrolMileageCacheKey_(month, meta.sourceVersion, currentPage, limit),
      serialized,
      PATROL_MILEAGE_CACHE_SECONDS
    );
    if (currentPage === page) requestedResult = result;
  }
  return requestedResult;
}

function patrolMileageArriveSort_(row, date) {
  const text = String(row && (row.arriveTime || row.fillTime) || '').trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const parsed = new Date(text);
    if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ss.SSS");
  }
  const match = text.match(/\d{4}[\/-]\d{1,2}[\/-]\d{1,2}[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match && date) {
    return date + 'T' + ('0' + Number(match[1])).slice(-2) + ':' + match[2] + ':' + (match[3] || '00');
  }
  // 缺少可比較的到店時間仍回傳，讓前端顯示日期解析異常；不可靜默排除。
  return date ? date + 'T99:99:99' : 'invalid-time';
}

function patrolMileageVisits_(rows, month) {
  const byVisit = {};
  rows.forEach(function(row, sourceIndex) {
    const date = patrolSummaryIsoDate_(row);
    const store = patrolMileageStore_(row);
    const arriveSort = patrolMileageArriveSort_(row, date);
    // 無法取得日期或店點時不去重，保留原值給前端 reason code；正常事件才以日期＋店點去重。
    const key = date && store ? date + '|' + store : 'invalid:' + sourceIndex;
    const visit = {
      fillTime:String(row.fillTime || ''), arriveTime:String(row.arriveTime || ''),
      code:String(row.code || ''), store:store, month:month,
      _date:date, _arriveSort:arriveSort
    };
    const current = byVisit[key];
    if (!current || arriveSort < current._arriveSort) byVisit[key] = visit;
  });
  return Object.keys(byVisit).map(function(key) {
    const visit = byVisit[key];
    return {
      fillTime:visit.fillTime, arriveTime:visit.arriveTime, code:visit.code,
      store:visit.store, month:visit.month, _date:visit._date, _arriveSort:visit._arriveSort
    };
  }).sort(function(left, right) {
    return String(left._date).localeCompare(String(right._date)) ||
      String(left._arriveSort).localeCompare(String(right._arriveSort)) || String(left.store).localeCompare(String(right.store));
  }).map(function(visit) {
    return {fillTime:visit.fillTime, arriveTime:visit.arriveTime, code:visit.code, store:visit.store, month:visit.month};
  });
}

function readPatrolMileageMonthV2_(options) {
  const startedAt = Date.now();
  const month = patrolSummaryMonth_(options.month);
  const page = Number(options.page || 1);
  if (!Number.isInteger(page) || page < 1) throw new Error('invalid patrol mileage page');
  if (page !== 1) throw new Error('patrol mileage visits are single page');
  const limit = PATROL_MILEAGE_MAX_VISITS;
  const sheet = getPatrolSheet();
  const meta = patrolSummarySourceMeta_(sheet);
  const cache = CacheService.getScriptCache();
  const cacheKey = patrolMileageV2CacheKey_(month, meta.sourceVersion);
  const cached = cache.get(cacheKey);
  if (cached) {
    const result = JSON.parse(cached);
    result.diagnostics = Object.assign({}, result.diagnostics, {
      cacheHit:true, sheetScans:0, serverDurationMs:Date.now() - startedAt
    });
    return result;
  }

  // 唯一一次完整 A:L scan：先月篩選，再正規化／日期＋店點去重。Cache miss 只會重算這次 response，
  // 不會將 raw rows 分頁後要求前端以第二頁 cache hit 取得正確結果。
  const matchedRows = readPatrolContractColumns_(sheet)
    .filter(function(row) { return patrolSummaryRowMonth_(row) === month; });
  const visits = patrolMileageVisits_(matchedRows, month);
  const generatedAt = Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX");
  const diagnostics = {
    sourceRows:Math.max(0, Number(meta.lastRow || 1) - 1), matchedRows:matchedRows.length, uniqueVisits:visits.length,
    cacheHit:false, sheetScans:1, serverDurationMs:Date.now() - startedAt
  };
  const result = {
    status:'ok', contract:'patrol-mileage-visits-v2', fields:PATROL_MILEAGE_FIELDS.slice(),
    month:month, page:1, limit:limit, totalVisits:visits.length, totalPages:1,
    visits:visits, sourceVersion:String(meta.sourceVersion || ''), generatedAt:generatedAt, diagnostics:diagnostics
  };
  const serialized = JSON.stringify(result);
  if (serialized.length < 95000) cache.put(cacheKey, serialized, PATROL_MILEAGE_CACHE_SECONDS);
  return result;
}

// ════════════════════════════════════
// 巡店到離店紀錄（獨立 action／獨立工作表）
// 不修改「巡店明細」schema，也不改 ptread／ptwrite 語意。
// ════════════════════════════════════
const PATROL_VISIT_SHEET = '巡店到離店紀錄';
const PATROL_VISIT_HEADERS = ['serverTime','date','action','store','note','visitSessionId'];
const PATROL_VISIT_NOTE_MAX = 200;
const PATROL_VISIT_RAPID_SECONDS = 15;
const PATROL_VISIT_TEST_NOTE_PREFIX = 'DEPLOY_TEST_';

function patrolVisitNow_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function patrolVisitDate_(dateValue) {
  const date = String(dateValue || '').trim();
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid visit date');
  return date || Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
}

function patrolVisitStore_(value) {
  const clean = String(value || '').replace(/\s+/g, '').trim();
  const match = PT_STORES.find(function(store) {
    const name = String(store.name || '').replace(/\s+/g, '');
    return clean === name || clean === name.replace(/^台北/, '');
  });
  if (!match) throw new Error('invalid patrol store');
  return String(match.name);
}

function patrolVisitPayload_(payload) {
  const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const allowed = { action:true, token:true, visitAction:true, store:true, note:true };
  Object.keys(body).forEach(function(key) {
    if (!allowed[key]) throw new Error('unexpected patrol visit field');
  });
  ptRequireSession_(body.token, 'ptvisit_write');
  const visitAction = String(body.visitAction || '').trim();
  if (visitAction !== 'arrival' && visitAction !== 'departure') throw new Error('invalid patrol visit action');
  const note = String(body.note || '').trim();
  if (Array.from(note).length > PATROL_VISIT_NOTE_MAX) throw new Error('patrol visit note is too long');
  return { visitAction:visitAction, store:patrolVisitStore_(body.store), note:note };
}

function getPatrolVisitSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(PATROL_VISIT_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PATROL_VISIT_SHEET);
    sh.appendRow(PATROL_VISIT_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange('A:F').setNumberFormat('@');
  }
  return sh;
}

function patrolVisitRowsFromSheet_(sh) {
  if (!sh || sh.getLastRow() < 2) return [];
  const values = sh.getDataRange().getDisplayValues();
  const headers = values[0];
  return values.slice(1).map(function(row) {
    const result = {};
    headers.forEach(function(header, index) { result[header] = String(row[index] || ''); });
    return result;
  });
}

function patrolVisitIsTestRecord_(row) {
  return String((row && row.note) || '').trim().indexOf(PATROL_VISIT_TEST_NOTE_PREFIX) === 0;
}

function patrolVisitSort_(rows) {
  return rows.slice().sort(function(a, b) { return String(a.serverTime || '').localeCompare(String(b.serverTime || '')); });
}

function readPatrolVisitEvents_(dateValue) {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATROL_VISIT_SHEET);
  const date = patrolVisitDate_(dateValue);
  return patrolVisitSort_(patrolVisitRowsFromSheet_(sh).filter(function(row) {
    return row.date === date && !patrolVisitIsTestRecord_(row);
  }));
}

function latestOpenPatrolVisit_(rows) {
  const open = new Map();
  rows.forEach(function(row) {
    if (row.action === 'arrival') open.set(row.visitSessionId, row);
    else if (row.action === 'departure') open.delete(row.visitSessionId);
  });
  const remaining = Array.from(open.values());
  return remaining.length ? remaining[remaining.length - 1] : null;
}

function patrolVisitState_(dateValue) {
  const sh = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATROL_VISIT_SHEET);
  const rows = patrolVisitSort_(patrolVisitRowsFromSheet_(sh).filter(function(row) { return !patrolVisitIsTestRecord_(row); }));
  const date = patrolVisitDate_(dateValue);
  const todayRows = rows.filter(function(row) { return row.date === date; });
  const openAcrossHistory = latestOpenPatrolVisit_(rows);
  return {
    events:todayRows,
    openVisit:latestOpenPatrolVisit_(todayRows),
    staleOpenVisit:openAcrossHistory && openAcrossHistory.date !== date ? openAcrossHistory : null
  };
}

function patrolVisitRapidDuplicate_(rows, action, store, serverTime) {
  const last = rows.length ? rows[rows.length - 1] : null;
  if (!last || last.action !== action || last.store !== store) return false;
  const previous = Date.parse(last.serverTime);
  const current = Date.parse(serverTime);
  return Number.isFinite(previous) && Number.isFinite(current) && current - previous < PATROL_VISIT_RAPID_SECONDS * 1000;
}

function writePatrolVisitEvent_(payload) {
  const clean = patrolVisitPayload_(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getPatrolVisitSheet_();
    const rows = patrolVisitRowsFromSheet_(sh);
    const serverTime = patrolVisitNow_();
    const testWrite = clean.note.indexOf(PATROL_VISIT_TEST_NOTE_PREFIX) === 0;
    const scopedRows = patrolVisitSort_(rows.filter(function(row) { return patrolVisitIsTestRecord_(row) === testWrite; }));
    const today = serverTime.slice(0, 10);
    const todayRows = scopedRows.filter(function(row) { return row.date === today; });
    if (patrolVisitRapidDuplicate_(todayRows, clean.visitAction, clean.store, serverTime)) throw new Error('duplicate patrol visit action');
    const open = latestOpenPatrolVisit_(todayRows);
    let visitSessionId;
    if (clean.visitAction === 'arrival') {
      if (open) throw new Error('patrol visit already open');
      visitSessionId = Utilities.getUuid();
    } else {
      if (!open) throw new Error('no open patrol visit');
      if (open.store !== clean.store) throw new Error('departure store does not match open visit');
      visitSessionId = open.visitSessionId;
    }
    const event = {
      serverTime:serverTime,
      date:serverTime.slice(0, 10),
      action:clean.visitAction,
      store:clean.store,
      note:clean.note,
      visitSessionId:visitSessionId
    };
    const worksheetRow = sh.getLastRow() + 1;
    sh.appendRow(PATROL_VISIT_HEADERS.map(function(header) { return event[header] || ''; }));
    const state = patrolVisitState_(event.date);
    return { event:event, events:state.events, openVisit:state.openVisit, staleOpenVisit:state.staleOpenVisit, worksheetRow:worksheetRow };
  } finally {
    lock.releaseLock();
  }
}

// ════════════════════════════════════
// 督導半月檢查
// 工作表：半月督導檢查
// 預先建立每店、每期 33 題，寫入時更新對應題目，不碰每日回報與巡店頁籤。
// 證據只保存私有 Google Drive 連結／檔名；原始影像不寫入試算表。
// ════════════════════════════════════
const HALF_CHECK_SHEET = '半月督導檢查';
const HALF_CHECK_HEADERS = [
  '檢查ID','檢查期別','檢查日期','門市','督導','項目','檢查結果','缺失說明',
  '改善措施','改善期限','改善狀態','證據檔案連結','建立時間','更新時間','執行頻率','填寫狀態'
];

function getHalfCheckSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = findNamedSheet(ss, HALF_CHECK_SHEET);
  if (!sh) {
    sh = ss.insertSheet(HALF_CHECK_SHEET);
    sh.appendRow(HALF_CHECK_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange('A:P').setNumberFormat('@');
  }
  return sh;
}

function halfCheckItemNo(value) {
  const match = String(value || '').match(/^(\d+)/);
  return match ? Number(match[1]) : Number(value || 0);
}

function halfCheckKey(row) {
  return [String(row[1] || ''), String(row[3] || ''), halfCheckItemNo(row[5])].join('|');
}

function halfResultToSheet(result) {
  return ({ ok:'符合', abnormal:'缺失／異常', na:'不適用' })[String(result || '')] || '';
}

function halfResultToClient(result) {
  return ({ '符合':'ok', '缺失／異常':'abnormal', '不適用':'na' })[String(result || '')] || '';
}

const HALF_WRITE_FIELDS = ['checkId','date','period','month','store','inspector','item','result','note','improvement','evidenceNames','savedAt'];
const HALF_APP_WRITE_FIELDS = ['checkId','date','period','month','store','inspector','item','result','note','improvement'];
const HALF_APP_POST_FIELDS = ['action','token','mode','rows'];

function halfCheckCanonicalStore_(value) {
  const clean = String(value || '').replace(/^台灣大哥大數位生活/, '').replace(/^台北/, '').replace(/\s+/g, '').trim();
  const match = PT_STORES.find(store => String(store.name || '').replace(/^台北/, '').replace(/\s+/g, '') === clean);
  if (!match) throw new Error('invalid store');
  return String(match.name || '').replace(/^台北/, '');
}

function halfCheckValidDate_(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]);
}

function validateHalfWriteRows_(rows, options) {
  const config = options || {};
  const strictApp = config.strictApp === true;
  const mode = String(config.mode || 'legacy');
  if (strictApp && ['draft','complete'].indexOf(mode) < 0) throw new Error('invalid mode');
  if (!Array.isArray(rows) || !rows.length || rows.length > 18) throw new Error('invalid rows');
  const seen = {};
  const cleanRows = rows.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid row');
    const allowedFields = strictApp ? HALF_APP_WRITE_FIELDS : HALF_WRITE_FIELDS;
    Object.keys(raw).forEach(key => { if (allowedFields.indexOf(key) < 0) throw new Error('extra field'); });
    const date = String(raw.date || '');
    if (!halfCheckValidDate_(date)) throw new Error('invalid date');
    const month = String(raw.month || '');
    if (month !== date.slice(0, 7)) throw new Error('invalid month');
    const period = String(raw.period || '');
    const expectedPeriod = Number(date.slice(-2)) <= 15 ? 'H1' : 'H2';
    if (period !== expectedPeriod) throw new Error('invalid period');
    const store = halfCheckCanonicalStore_(raw.store);
    const item = Number(raw.item);
    if (!Number.isInteger(item) || item < 1 || item > 18) throw new Error('invalid item');
    if (seen[item]) throw new Error('duplicate item');
    seen[item] = true;
    const result = String(raw.result || '');
    if (['','ok','abnormal','na'].indexOf(result) < 0) throw new Error('invalid status');
    const inspector = String(raw.inspector || '').trim();
    if (!inspector || inspector.length > 80) throw new Error('invalid inspector');
    const note = String(raw.note || '').trim();
    const improvement = String(raw.improvement || '').trim();
    if (note.length > 1000 || improvement.length > 1000) throw new Error('text too long');
    if (strictApp && result !== 'abnormal' && (note || improvement)) throw new Error('non-abnormal text not allowed');
    if (strictApp && mode === 'complete' && result === 'abnormal' && (!note || !improvement)) throw new Error('abnormal detail required');
    const evidenceNames = strictApp ? '' : String(raw.evidenceNames || '');
    if (evidenceNames.length > 20000) throw new Error('evidence too long');
    const rawStore = String(raw.store || '');
    const suppliedCheckId = String(raw.checkId || '');
    const allowedCheckIds = [`${date}|${rawStore}|${period}`, `${date}|${store}|${period}`];
    if (suppliedCheckId && allowedCheckIds.indexOf(suppliedCheckId) < 0) throw new Error('invalid checkId');
    return { checkId:`${date}|${store}|${period}`, date, period, month, store, inspector, item, result, note, improvement, evidenceNames };
  });
  if (strictApp && mode === 'complete') {
    if (cleanRows.length !== 18 || cleanRows.some(row => !row.result)) throw new Error('complete requires 18 answered items');
    const itemNumbers = cleanRows.map(row => row.item).sort((a, b) => a - b);
    if (!itemNumbers.every((item, index) => item === index + 1)) throw new Error('complete requires items 1-18');
  }
  return cleanRows;
}

function writeHalfCheck(rows, options) {
  // 所有 rows 必須先完整驗證；鎖內不再執行可能造成中途拒絕的 payload validation。
  const cleanRows = validateHalfWriteRows_(rows, options);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getHalfCheckSheet();
    const data = sh.getDataRange().getValues();
    const existing = {};
    for (let i = 1; i < data.length; i++) existing[halfCheckKey(data[i])] = i + 1;
    let written = 0;
    cleanRows.forEach(r => {
      const month = String(r.month || String(r.date || '').slice(0, 7));
      const period = `${month}-${String(r.period || '')}`;
      const itemNo = Number(r.item || 0);
      const key = [period, String(r.store || ''), itemNo].join('|');
      const oldRow = existing[key] ? data[existing[key] - 1] : [];
      const now = new Date().toISOString();
      const itemText = oldRow[5] || String(itemNo);
      const row = [
        String(r.checkId || `${r.date}|${r.store}|${r.period}`), period, String(r.date || ''),
        String(r.store || ''), String(r.inspector || ''), String(itemText), halfResultToSheet(r.result),
        String(r.note || ''), String(r.improvement || ''), String(oldRow[9] || ''),
        String(r.result === 'abnormal' ? '待改善' : (oldRow[10] || '')),
        // App POST 不接受附件欄位；既有 patrol.html JSONP 仍可沿用原附件保留語意。
        String(r.evidenceNames || oldRow[11] || ''), String(oldRow[12] || now), now,
        String(oldRow[14] || ''), String(r.result ? '已完成' : '填寫中')
      ];
      if (existing[key]) {
        sh.getRange(existing[key], 1, 1, HALF_CHECK_HEADERS.length).setValues([row]);
        data[existing[key] - 1] = row;
      } else {
        sh.getRange(sh.getLastRow() + 1, 1, 1, HALF_CHECK_HEADERS.length).setValues([row]);
        existing[key] = sh.getLastRow();
        data.push(row);
      }
      written++;
    });
    return written;
  } finally {
    lock.releaseLock();
  }
}

function writeHalfCheckPostPayload_(payload, e) {
  const body = payload || {};
  const query = e && e.parameter ? e.parameter : {};
  if (query.token != null || query.payload != null) throw new Error('hwrite body required');
  ptRequireSession_(body.token, 'hwrite');
  Object.keys(body).forEach(key => { if (HALF_APP_POST_FIELDS.indexOf(key) < 0) throw new Error('extra field'); });
  if (String(body.action || '') !== 'hwrite') throw new Error('invalid action');
  const mode = String(body.mode || 'draft');
  return { written:writeHalfCheck(body.rows, { strictApp:true, mode:mode }) };
}

function readHalfCheck() {
  const sh = getHalfCheckSheet();
  const data = sh.getDataRange().getValues();
  if (!data.length) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const o = {};
    headers.forEach((h, idx) => {
      if (!(row[idx] instanceof Date)) o[h] = row[idx];
      else o[h] = h === '檢查日期' ? Utilities.formatDate(row[idx], 'Asia/Taipei', 'yyyy-MM-dd') : patrolTimeStr(row[idx]);
    });
    const periodText = String(o['檢查期別'] || '');
    return {
      checkId: String(o['檢查ID'] || ''),
      date: String(o['檢查日期'] || ''),
      period: periodText.slice(-2),
      month: periodText.slice(0, 7),
      store: String(o['門市'] || ''),
      inspector: String(o['督導'] || ''),
      item: halfCheckItemNo(o['項目']),
      result: halfResultToClient(o['檢查結果']),
      note: String(o['缺失說明'] || ''),
      improvement: String(o['改善措施'] || ''),
      evidenceNames: String(o['證據檔案連結'] || ''),
      savedAt: String(o['更新時間'] || o['建立時間'] || '')
    };
  }).filter(o => o.date || o.result || o.inspector);
}

// ════════════════════════════════════
// 每月班表（工作表：班表明細）
// 僅由受保護頁籤讀取，GitHub Pages 不保存任何班表內容。
// ════════════════════════════════════
const SCHEDULE_SHEET = '班表明細';

// Some imported Excel sheets can carry invisible leading/trailing whitespace
// in their tab name. Match the exact name first, then a normalized fallback.
function findNamedSheet(ss, sheetName) {
  return ss.getSheetByName(sheetName) || ss.getSheets().find(sh => {
    const normalized = String(sh.getName() || '').replace(/\u3000/g, ' ').trim();
    return normalized === sheetName;
  });
}

function readSchedule(requestedMonth) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = findNamedSheet(ss, SCHEDULE_SHEET);
  if (!sh || sh.getLastRow() < 2) throw new Error('尚無已匯入的班表資料');
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);
  const available = data.slice(1).map(r => String(r[idx['版本月份']] || '')).filter(Boolean).sort();
  const month = requestedMonth && available.indexOf(requestedMonth) >= 0 ? requestedMonth : available[available.length - 1];
  if (!month) throw new Error('找不到指定月份班表');
  const stores = {};
  data.slice(1).filter(r => String(r[idx['版本月份']] || '') === month).forEach(r => {
    const storeName = String(r[idx['門市']] || '');
    const date = scheduleDateString(r[idx['日期']]);
    if (!storeName || !date) return;
    if (!stores[storeName]) stores[storeName] = { store: storeName, title: storeName, staff: {}, days: {} };
    const store = stores[storeName];
    const name = String(r[idx['同仁']] || '');
    const role = String(r[idx['職務']] || '');
    const status = String(r[idx['班別']] || '');
    const working = String(r[idx['出勤']] || '') === '是';
    const manager = String(r[idx['值班主管']] || '') === '是';
    if (name && !store.staff[name]) store.staff[name] = { name: name, role: role };
    if (!store.days[date]) store.days[date] = { date: date, staff: [], managers: [], workingStaff: [] };
    const assignment = { name: name, role: role, status: status, working: working };
    store.days[date].staff.push(assignment);
    if (working) store.days[date].workingStaff.push(assignment);
    if (manager) store.days[date].managers.push(assignment);
  });
  const list = Object.keys(stores).sort().map(name => ({
    store: stores[name].store,
    title: stores[name].title,
    staff: Object.keys(stores[name].staff).sort().map(k => stores[name].staff[k]),
    days: Object.keys(stores[name].days).sort().map(k => stores[name].days[k])
  }));
  const parts = month.split('-').map(Number);
  return { month: month, rocMonth: `民國${parts[0] - 1911}年${String(parts[1]).padStart(2, '0')}月`, stores: list };
}

function scheduleDateString(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Taipei', 'yyyy-MM-dd');
  return String(value || '').slice(0, 10);
}

// 每週一巡店週報（Email 夾 Excel）
//
// 啟用方式（只需做一次）：
//   函式選單選「setupWeeklyReport」→ 執行（會要求授權，同意即可）
//   之後每週一 08:00（台北時間）寄巡店報告到 NOTIFY_EMAIL，
//   夾檔 Excel 含「檢核總表」（每店×33題 ✓✗矩陣）與「本月明細」。
// 想立即試寄：函式選單選「testWeeklyReport」執行。
// 注意：時間觸發器跑最新存檔程式碼，不需重新部署。
// ════════════════════════════════════
const PT_ITEM_TEXT = {
  1:'督導駐點', 2:'店格陳列／展機防盜／回收桶上鎖', 3:'中島展示機無不當資訊且開機恆亮',
  4:'前後場整潔、公佈欄符合規範', 5:'有價商品櫃是否上鎖', 6:'電腦記事本／資料夾mail個資檢查',
  7:'申裝書3日回送、無不當留存個資', 8:'同仁服裝儀容與服務態度', 9:'出勤與班表一致並載休息時間',
  10:'人員面談及輔導', 11:'門市安全（禁菸／禁火源）', 12:'監控設備運作正常',
  13:'店務日誌與督導簽名', 14:'待銷毀文件打包歸檔上鎖', 15:'待回送／未結案維修機盤點',
  16:'保全金零找金現金盤點', 17:'iPhone手機盤點盤差登載', 18:'到店全盤作業（2月1次）',
  19:'知悉：NCC風險管理機制指引公布', 20:'知悉：受理申請證件納入KYC審核', 21:'知悉：拒絕提供資料者應拒辦',
  22:'知悉：公司已成立查核部門', 23:'知悉：自然人雙證件正本核對', 24:'知悉：法人團體證件核對',
  25:'知悉：企業客戶用途清冊實地查訪', 26:'知悉：委託代理人證件核對', 27:'知悉：初次申辦臨櫃／數位簽章',
  28:'知悉：初次申辦拍照留存1年', 29:'知悉：外籍短效預付卡免拍照條件', 30:'知悉：外籍申辦以1門為原則',
  31:'知悉：外籍簽證少於1月限短效卡', 32:'知悉：詐欺受限3年申辦限制', 33:'知悉：受限用戶3年再申辦限制'
};

function setupWeeklyReport() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'sendWeeklyPatrolReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendWeeklyPatrolReport').timeBased().everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).inTimezone('Asia/Taipei').create();
}

function testWeeklyReport() { sendWeeklyPatrolReport(); }

// 題18固定雙月週期（1-2、3-4、5-6、7-8、9-10、11-12）的兩個月份
function ptWinMonths(monthKey) {
  const p = monthKey.split('-');
  const y = Number(p[0]), m = Number(p[1]);
  const s = (m % 2 === 1) ? m : m - 1;
  const pad = n => ('0' + n).slice(-2);
  return [y + '-' + pad(s), y + '-' + pad(s + 1)];
}

function ptDayOf(fillTime) {
  const m = String(fillTime).match(/\d{4}\/\d{1,2}\/(\d{1,2})/);
  return m ? Number(m[1]) : 0;
}

// 與前端看板同一套完成度判定
function ptItemDone(storeRows, item, monthKey) {
  const isV = r => String(r.result).toLowerCase() === 'v';
  if (item === 18) {
    const winM = ptWinMonths(monthKey);
    return storeRows.some(r => Number(r.item) === 18 && isV(r) && winM.indexOf(String(r.month)) !== -1);
  }
  const mRows = storeRows.filter(r => Number(r.item) === item && String(r.month) === monthKey);
  if (item === 1) return mRows.length > 0; // 駐點：當月有紀錄即可（v或na）
  if (item >= 2 && item <= 13) {           // 上下半月各1次
    const h1 = mRows.some(r => isV(r) && ptDayOf(r.fillTime) <= 15);
    const h2 = mRows.some(r => isV(r) && ptDayOf(r.fillTime) > 15);
    return h1 && h2;
  }
  return mRows.some(isV);                  // 每月至少1次
}

// 某官方門市對應的所有明細列（店名關鍵字或營業點代碼比對，與前端 findRecordStore 一致）
function ptStoreRows(all, st) {
  const key = st.name.replace('台北', '');
  return all.filter(r => {
    const rs = String(r.store || '');
    if (!rs) return false;
    if (st.code && String(r.code || '') === st.code) return true;
    return rs.indexOf(key) !== -1 || st.name.indexOf(rs) !== -1;
  });
}

// 由 fillTime 取 'M/D' 顯示用日期
function ptDateOf(fillTime) {
  const m = String(fillTime).match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  return m ? (Number(m[2]) + '/' + Number(m[3])) : '';
}

function weeklyHalfMediaItems(value) {
  const text = String(value || '').trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.media) ? parsed.media : []);
    return list.filter(item => item && typeof item === 'object').map(item => ({
      id: String(item.id || ''),
      name: String(item.name || '附件'),
      mimeType: String(item.mimeType || ''),
      viewUrl: String(item.viewUrl || item.url || ''),
      previewUrl: String(item.previewUrl || item.url || '')
    }));
  } catch (err) {
    return [{ id: '', name: '既有附件', mimeType: '', viewUrl: text, previewUrl: text }];
  }
}

function weeklyHalfResultLabel(result) {
  return ({ ok:'符合', abnormal:'缺失／異常', na:'不適用' })[String(result || '')] || '待填';
}

function weeklyHalfPeriodLabel(period) {
  return String(period || '') === 'H2' ? '下半月' : '上半月';
}

function weeklyReadHalfCheck() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheetName = '半月督導檢查';
  const sh = ss.getSheetByName(sheetName) || ss.getSheets().find(sheet => {
    return String(sheet.getName() || '').replace(/\u3000/g, ' ').trim() === sheetName;
  });
  if (!sh || sh.getLastRow() < 2) return [];
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(value => String(value || '').replace(/\u3000/g, ' ').trim());
  return data.slice(1).map(row => {
    const item = {};
    headers.forEach((header, index) => {
      const value = row[index];
      item[header] = value instanceof Date ? Utilities.formatDate(value, 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX") : value;
    });
    const periodText = String(item['檢查期別'] || '');
    const itemMatch = String(item['項目'] || '').match(/^(\d+)/);
    const result = ({ '符合':'ok', '缺失／異常':'abnormal', '不適用':'na' })[String(item['檢查結果'] || '')] || '';
    return {
      date: String(item['檢查日期'] || ''),
      period: periodText.slice(-2),
      month: periodText.slice(0, 7),
      store: String(item['門市'] || ''),
      inspector: String(item['督導'] || ''),
      item: itemMatch ? Number(itemMatch[1]) : Number(item['項目'] || 0),
      result: result,
      note: String(item['缺失說明'] || ''),
      improvement: String(item['改善措施'] || ''),
      evidenceNames: String(item['證據檔案連結'] || ''),
      savedAt: String(item['更新時間'] || item['建立時間'] || '')
    };
  }).filter(item => item.date || item.result || item.inspector);
}

function weeklyHalfPhotoBlob(media) {
  if (!media.id || String(media.mimeType || '').indexOf('image/') !== 0) return null;
  const file = DriveApp.getFileById(media.id);
  let blob = file.getBlob();
  const type = String(blob.getContentType() || media.mimeType || '').toLowerCase();
  if (['image/jpeg', 'image/png', 'image/gif'].indexOf(type) === -1) {
    blob = blob.getAs('image/jpeg').setName(String(media.name || 'photo') + '.jpg');
  }
  return blob;
}

function buildWeeklyHalfCheckTab(monthKey) {
  const source = weeklyReadHalfCheck().filter(r => {
    const month = String(r.month || String(r.date || '').slice(0, 7));
    const item = Number(r.item || 0);
    return month === monthKey && item >= 1 && item <= 18;
  }).filter(r => String(r.note || '').trim() || String(r.improvement || '').trim() || weeklyHalfMediaItems(r.evidenceNames).length);

  source.sort((a, b) => {
    const ka = [a.date, a.store, Number(a.item || 0)].join('|');
    const kb = [b.date, b.store, Number(b.item || 0)].join('|');
    return ka < kb ? -1 : (ka > kb ? 1 : 0);
  });

  const rows = [[
    '日期', '期別', '店點', '督導', '題號', '檢查內容', '結果',
    '提醒／缺失內容', '改善說明', '照片', '私有附件連結', '最後更新'
  ]];
  const mediaJobs = [];
  let photoCount = 0;

  source.forEach(r => {
    const media = weeklyHalfMediaItems(r.evidenceNames);
    const items = media.length ? media : [null];
    items.forEach(item => {
      rows.push([
        String(r.date || ''), weeklyHalfPeriodLabel(r.period), String(r.store || ''),
        String(r.inspector || ''), Number(r.item || 0), PT_ITEM_TEXT[Number(r.item)] || '',
        weeklyHalfResultLabel(r.result), String(r.note || ''), String(r.improvement || ''),
        item ? String(item.name || '附件') : '—', item && (item.viewUrl || item.previewUrl) ? '開啟私有附件' : '—',
        String(r.savedAt || '')
      ]);
      if (item) {
        const row = rows.length;
        const isPhoto = String(item.mimeType || '').indexOf('image/') === 0;
        if (isPhoto) photoCount++;
        mediaJobs.push({ row: row, media: item, isPhoto: isPhoto });
      }
    });
  });

  if (rows.length === 1) rows.push(['—', '—', '—', '—', '—', '本月尚無已填寫的提醒、改善或照片', '—', '—', '—', '—', '—', '—']);
  return { rows: rows, mediaJobs: mediaJobs, sourceCount: source.length, photoCount: photoCount };
}

function formatWeeklyHalfCheckSheet(sheet, tab) {
  const lastRow = tab.rows.length;
  const lastCol = tab.rows[0].length;
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, lastRow, lastCol).setWrap(true).setVerticalAlignment('top');
  sheet.getRange(1, 1, 1, lastCol).setFontWeight('bold').setBackground('#fce7d6');
  [90, 75, 100, 85, 50, 240, 85, 240, 240, 150, 110, 160].forEach((width, index) => sheet.setColumnWidth(index + 1, width));

  tab.mediaJobs.forEach(job => {
    const media = job.media;
    const link = String(media.viewUrl || media.previewUrl || '');
    if (link) {
      const rich = SpreadsheetApp.newRichTextValue().setText('開啟私有附件').setLinkUrl(link).build();
      sheet.getRange(job.row, 11).setRichTextValue(rich);
    }
    if (!job.isPhoto) return;
    try {
      const blob = weeklyHalfPhotoBlob(media);
      if (!blob) throw new Error('無法取得照片');
      const image = sheet.insertImage(blob, 10, job.row);
      image.setWidth(140).setHeight(100);
      sheet.setRowHeight(job.row, 110);
      sheet.getRange(job.row, 10).setValue('');
    } catch (err) {
      sheet.getRange(job.row, 10).setValue('照片嵌入失敗，請使用右側私有連結');
    }
  });
}

function sendWeeklyPatrolReport() {
  const tz = 'Asia/Taipei';
  const now = new Date();
  const monthKey = Utilities.formatDate(now, tz, 'yyyy-MM');
  const dateStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const todayDay = Number(Utilities.formatDate(now, tz, 'd'));
  const monthNum = Number(monthKey.split('-')[1]);
  const all = readPatrol();
  const isV = r => String(r.result).toLowerCase() === 'v';
  const inMonth = r => String(r.month) === monthKey;

  // 每店明細（官方門市清單順序）
  const stores = PT_STORES.map(st => ({ st: st, rows: ptStoreRows(all, st) }));

  // ── 分頁1：巡店紀錄（本月明細）──
  const tabDetail = [['填表時間', '店點', '題號', '檢查內容', '結果', '未查/不合格原因', '上傳時間']];
  all.filter(inMonth)
    .sort((a, b) => String(a.fillTime) < String(b.fillTime) ? -1 : 1)
    .forEach(r => {
      tabDetail.push([String(r.fillTime), String(r.store), Number(r.item),
        PT_ITEM_TEXT[Number(r.item)] || '', String(r.result || ''), String(r.reason || ''), String(r.savedAt || '')]);
    });

  // ── 分頁2：未巡店（本月無任何紀錄）──
  const notVisited = stores.filter(s => !s.rows.some(inMonth));
  const tabNotVisited = [['店點', '營業點代碼', '本月狀態', '最近一次巡店']];
  notVisited.forEach(s => {
    let lastDate = '';
    s.rows.forEach(r => { const d = String(r.fillTime); if (d > lastDate) lastDate = d; });
    tabNotVisited.push([s.st.name, s.st.code, '本月尚未巡店', lastDate || '（從無紀錄）']);
  });
  if (notVisited.length === 0) tabNotVisited.push(['—', '—', '✓ 九店本月皆已巡店', '—']);

  // ── 分頁3：上下半月（題2-13）──
  const tabHalf = [['店點'].concat(Array.from({length: 12}, (_, i) => String(i + 2)))];
  stores.forEach(s => {
    const row = [s.st.name];
    for (let it = 2; it <= 13; it++) {
      const mRows = s.rows.filter(r => inMonth(r) && Number(r.item) === it);
      const h1 = mRows.some(r => isV(r) && ptDayOf(r.fillTime) <= 15);
      const h2 = mRows.some(r => isV(r) && ptDayOf(r.fillTime) > 15);
      row.push(h1 && h2 ? '完成' : (h1 ? '缺下' : (h2 ? '缺上' : '未做')));
    }
    tabHalf.push(row);
  });
  tabHalf.push(['說明：完成=上下半月各1次皆✓／缺上·缺下=只做一半／未做=本月無合格紀錄']);

  // ── 分頁4：每月盤點（題14-17）──
  const tabMonthly = [['店點', '14.銷毀文件', '15.維修機盤點', '16.現金盤點', '17.iPhone盤點', '四項完成']];
  let monthlyDone = 0;
  stores.forEach(s => {
    const cells = [];
    let all4 = true;
    for (let it = 14; it <= 17; it++) {
      const e = s.rows.find(r => inMonth(r) && Number(r.item) === it && isV(r));
      cells.push(e ? '✓ ' + ptDateOf(e.fillTime) : '✗');
      if (!e) all4 = false;
    }
    if (all4) monthlyDone++;
    tabMonthly.push([s.st.name].concat(cells, [all4 ? '✓' : '✗']));
  });

  // ── 分頁5：雙月全盤（題18，固定週期）──
  const winM = ptWinMonths(monthKey);
  const prevStart = (Number(winM[0].split('-')[1]) === 1)
    ? (Number(winM[0].split('-')[0]) - 1) + '-11'
    : winM[0].split('-')[0] + '-' + ('0' + (Number(winM[0].split('-')[1]) - 2)).slice(-2);
  const prevWinM = ptWinMonths(prevStart);
  const winLabel = Number(winM[0].split('-')[1]) + '–' + Number(winM[1].split('-')[1]) + '月';
  const tab18 = [['店點', '本期 ' + winLabel, '本期完成日', '上期完成日']];
  let done18 = 0;
  stores.forEach(s => {
    const v18 = s.rows.filter(r => Number(r.item) === 18 && isV(r));
    const cur = v18.find(r => winM.indexOf(String(r.month)) !== -1);
    const prev = v18.find(r => prevWinM.indexOf(String(r.month)) !== -1);
    if (cur) done18++;
    tab18.push([s.st.name, cur ? '✓ 已完成' : '✗ 未完成',
      cur ? ptDateOf(cur.fillTime) : '—', prev ? ptDateOf(prev.fillTime) : '—']);
  });

  // ── 分頁6：知悉20日前（題19-33）──
  const daysLeft = 20 - todayDay;
  const tabAware = [['店點', '進度', '狀態', '完成日']];
  let doneAware = 0;
  stores.forEach(s => {
    let cnt = 0, doneDay = 0;
    for (let it = 19; it <= 33; it++) {
      const days = s.rows.filter(r => inMonth(r) && Number(r.item) === it && isV(r))
        .map(r => ptDayOf(r.fillTime)).filter(d => d > 0);
      if (days.length) {
        cnt++;
        const first = Math.min.apply(null, days);
        if (first > doneDay) doneDay = first;
      }
    }
    const allDone = cnt === 15;
    if (allDone) doneAware++;
    const state = allDone ? ('✓ 已完成' + (doneDay > 20 ? '（逾20日）' : ''))
      : (daysLeft >= 0 ? '剩 ' + daysLeft + ' 天' : '⚠ 逾期 ' + (-daysLeft) + ' 天');
    tabAware.push([s.st.name, cnt + '/15', state, allDone ? monthNum + '/' + doneDay : '—']);
  });

  // ── 分頁7：半月督導檢查的提醒、改善與照片 ──
  const halfCheckTab = buildWeeklyHalfCheckTab(monthKey);

  // ── 產生暫存試算表（7個分頁）→ 匯出 xlsx → 寄出 → 刪除暫存 ──
  const ss = SpreadsheetApp.create('巡店報告_' + dateStr);
  const tabs = [
    ['巡店紀錄', tabDetail], ['未巡店', tabNotVisited], ['上下半月2-13', tabHalf],
    ['每月盤點14-17', tabMonthly], ['雙月全盤18', tab18], ['知悉20日前19-33', tabAware],
    ['改善提醒與照片', halfCheckTab.rows]
  ];
  tabs.forEach((t, i) => {
    const sh = i === 0 ? ss.getSheets()[0] : ss.insertSheet();
    sh.setName(t[0]);
    const w = Math.max.apply(null, t[1].map(r => r.length));
    const grid = t[1].map(r => r.concat(Array(w - r.length).fill('')));
    sh.getRange(1, 1, grid.length, w).setValues(grid);
    sh.setFrozenRows(1);
    if (t[0] === '改善提醒與照片') formatWeeklyHalfCheckSheet(sh, halfCheckTab);
  });
  SpreadsheetApp.flush();

  const blob = UrlFetchApp.fetch(
    'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx',
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }
  ).getBlob().setName('巡店報告_' + dateStr + '.xlsx');

  const body =
    '📋 巡店週報 ' + dateStr + '（追蹤月份 ' + monthKey + '）\n\n' +
    '・已巡店：' + (PT_STORES.length - notVisited.length) + '/' + PT_STORES.length +
    (notVisited.length ? '（未巡：' + notVisited.map(s => s.st.name).join('、') + '）' : '') + '\n' +
    '・每月盤點(14-17)四項完成：' + monthlyDone + '/' + PT_STORES.length + ' 店\n' +
    '・雙月全盤(18)本期 ' + winLabel + '：' + done18 + '/' + PT_STORES.length + ' 店\n' +
    '・知悉(19-33)全數勾核：' + doneAware + '/' + PT_STORES.length + ' 店' +
    (daysLeft >= 0 ? '（截止 ' + monthNum + '/20，剩 ' + daysLeft + ' 天）' : '（已逾 ' + monthNum + '/20 截止日）') + '\n\n' +
    '・本月改善／提醒：' + halfCheckTab.sourceCount + ' 項；照片：' + halfCheckTab.photoCount + ' 張\n\n' +
    '各項明細請見夾檔 Excel 的七個分頁；「改善提醒與照片」已直接嵌入照片並保留私有附件連結。\n' +
    '看板：https://lian852456-dot.github.io/liamlu/patrol.html';
  MailApp.sendEmail(NOTIFY_EMAIL, '📊 巡店週報 ' + dateStr + '｜' + PT_TITLE, body, { attachments: [blob] });
  DriveApp.getFileById(ss.getId()).setTrashed(true);
}

// ════════════════════════════════════
// 知悉宣導月中提醒（題19-33，每月20日前需全數完成）
//
// 啟用方式（只需做一次）：
//   函式選單選「setupAwareTrigger」→ 執行（會要求授權，同意即可）
//   之後每月 15 號 09:00（台北時間）自動檢查「巡店明細」，
//   未完成門市寄提醒信到 NOTIFY_EMAIL。
// 注意：時間觸發器跑的是編輯器最新存檔的程式碼，【不需要】重新部署。
// 想立即測試：函式選單選「testAwareNotify」執行，馬上寄一封。
// ════════════════════════════════════
const AWARE_FROM = 19, AWARE_TO = 33;
const AWARE_TOTAL = AWARE_TO - AWARE_FROM + 1; // 15 題

function setupAwareTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'checkAwareAndNotify') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkAwareAndNotify').timeBased()
    .onMonthDay(15).atHour(9).inTimezone('Asia/Taipei').create();
}

function testAwareNotify() { checkAwareAndNotify(); }

function checkAwareAndNotify() {
  const tz = 'Asia/Taipei';
  const monthKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  const monthLabel = Number(monthKey.split('-')[1]) + '月';

  const sh = getPatrolSheet();
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  // 每個貼上店名 → 本月已勾核(v)的知悉題號集合
  const done = {};
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const item = Number(r[idx.item]);
    if (item < AWARE_FROM || item > AWARE_TO) continue;
    if (String(r[idx.result]).toLowerCase() !== 'v') continue;
    if (String(r[idx.month]) !== monthKey) continue;
    const store = String(r[idx.store]);
    if (!done[store]) done[store] = {};
    done[store][item] = true;
  }

  // 對應本區門市（貼上店名可能含「台北」前綴，用關鍵字比對）
  const rows = PT_STORES.map(s => {
    const key = s.name.replace('台北', '');
    let cnt = 0;
    Object.keys(done).forEach(ps => {
      if (ps.indexOf(key) !== -1) cnt = Math.max(cnt, Object.keys(done[ps]).length);
    });
    return { store: s.name, cnt: cnt };
  });
  const incomplete = rows.filter(r => r.cnt < AWARE_TOTAL)
    .sort((a, b) => a.cnt - b.cnt);
  const complete = rows.filter(r => r.cnt >= AWARE_TOTAL);

  if (incomplete.length > 0) {
    const subject = '📣 巡店知悉提醒 ' + monthKey + '：尚有 ' + incomplete.length + ' 店未完成（20日前需全數勾核）';
    const body =
      '📋 ' + monthLabel + ' 知悉宣導（題19-33）進度檢查\n' +
      '⏰ 截止：' + monthLabel + '20日前每店需全數勾核一次\n\n' +
      '🔴 未完成（' + incomplete.length + ' 店）：\n' +
      incomplete.map(r => '　・' + r.store + '　' + r.cnt + '/' + AWARE_TOTAL).join('\n') + '\n\n' +
      '✅ 已完成（' + complete.length + ' 店）：' + (complete.map(r => r.store).join('、') || '無') + '\n\n' +
      '追蹤看板：https://lian852456-dot.github.io/liamlu/patrol.html';
    MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
  } else {
    const subject = '✅ 巡店知悉 ' + monthKey + ' 九店全數完成';
    const body = monthLabel + ' 知悉宣導（題19-33）九店皆已於期限前全數勾核，無需跟進。\n\n' +
      '追蹤看板：https://lian852456-dot.github.io/liamlu/patrol.html';
    MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
  }
}

// ════════════════════════════════════
// 個人回報（工作表：個人回報）
// 欄位：date, seg, store, name, record(JSON字串), savedAt
// ════════════════════════════════════
const PERSONAL_SHEET = '個人回報';
const PERSONAL_HEADERS = ['date','seg','store','name','record','savedAt'];

function getPersonalSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(PERSONAL_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PERSONAL_SHEET);
    sh.appendRow(PERSONAL_HEADERS);
    sh.setFrozenRows(1);
    // record 欄設為純文字，避免 JSON 被試算表亂轉
    sh.getRange('E:E').setNumberFormat('@');
  }
  return sh;
}

function writePersonal(p) {
  // p = { date, seg, store, name, record }
  const sh = getPersonalSheet();
  const allData = sh.getDataRange().getValues();

  let rowIdx = -1;
  for (let i = 1; i < allData.length; i++) {
    const r = allData[i];
    if (toDateStr(r[0]) === p.date && Number(r[1]) === Number(p.seg) &&
        String(r[2]) === String(p.store) && String(r[3]) === String(p.name)) {
      rowIdx = i + 1;
      break;
    }
  }

  const row = [p.date, p.seg, p.store, p.name, JSON.stringify(p.record), new Date().toISOString()];
  if (rowIdx > 0) {
    sh.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }
}

function readPersonal(date, seg) {
  const sh = getPersonalSheet();
  const allData = sh.getDataRange().getValues();
  // 回傳 { store: { name: record } }
  const result = {};
  for (let i = 1; i < allData.length; i++) {
    const r = allData[i];
    if (toDateStr(r[0]) === date && Number(r[1]) === Number(seg)) {
      const store = String(r[2]);
      const name  = String(r[3]);
      let record = null;
      try { record = JSON.parse(r[4]); } catch(e) {}
      if (!result[store]) result[store] = {};
      result[store][name] = record;
    }
  }
  return result;
}

function writeData(date, store, seg, data) {
  const sh = getSheet();
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const allData = sh.getDataRange().getValues();

  // 找現有列（同 date+store+seg）
  let rowIdx = -1;
  for (let i = 1; i < allData.length; i++) {
    const r = allData[i];
    const rDate  = r[headers.indexOf('date')];
    const rStore = r[headers.indexOf('store')];
    const rSeg   = r[headers.indexOf('seg')];
    if (String(rDate) === String(date) && String(rStore) === String(store) && Number(rSeg) === Number(seg)) {
      rowIdx = i + 1; // 1-based
      break;
    }
  }

  // 組成要寫入的列
  const row = headers.map(h => {
    if (h === 'date')  return date;
    if (h === 'store') return store;
    if (h === 'seg')   return seg;
    return data[h] != null ? data[h] : (rowIdx > 0 ? allData[rowIdx-1][headers.indexOf(h)] : '');
  });

  if (rowIdx > 0) {
    sh.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }
}

function toDateStr(v) {
  if (!v && v !== 0) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd');
  return String(v).substring(0, 10);
}

function readData(date, seg) {
  const sh = getSheet();
  const dataRange = sh.getDataRange();
  const allData = dataRange.getValues();
  // savedAt 是純時間序號；使用試算表顯示值，避免被格式化為 1899-12-30。
  const displayData = dataRange.getDisplayValues();
  const headers = allData[0];
  const dateIdx  = headers.indexOf('date');
  const storeIdx = headers.indexOf('store');
  const segIdx   = headers.indexOf('seg');

  const result = {};
  for (let i = 1; i < allData.length; i++) {
    const r = allData[i];
    if (toDateStr(r[dateIdx]) === date && Number(r[segIdx]) === Number(seg)) {
      const store = r[storeIdx];
      const obj = {};
      headers.forEach((h, idx) => {
        const v = r[idx];
        if (h === 'savedAt') {
          obj[h] = displayData[i][idx] || '';
        } else {
          obj[h] = (v instanceof Date) ? toDateStr(v) : v;
        }
      });
      result[store] = obj;
    }
  }
  return attachReportAwardModels_(result, date, seg);
}

function jsonResponse(obj, callback) {
  const body = JSON.stringify(obj);
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(`${callback}(${body})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════
// 北一二B KPI／台獎私有戰情
//
// 重要：資料快照、員編、裝置綁定皆不會放進 GitHub Pages 或公開原始碼。
// 請先在「專案設定 > 指令碼屬性」設定：
// - DASHBOARD_PRIVATE_FOLDER_ID：私有 Google Drive 資料夾 ID
// - DASHBOARD_ADMIN_SECRET：僅區主管持有的強密碼
// - DASHBOARD_BOOTSTRAP_CODE：首次綁定碼（只存在 Script Properties，不寫入程式碼）
// 然後在 Apps Script 編輯器手動執行一次 setupPrivateDashboard()。
// ════════════════════════════════════

const PRIVATE_DASHBOARD_FILE = 'north12b-dashboard-private-latest.json';
const PRIVATE_DASHBOARD_USERS_SHEET = 'DashboardUsers';
const PRIVATE_DASHBOARD_REQUESTS_SHEET = 'DashboardRequests';
const PRIVATE_DASHBOARD_USERS_HEADERS = [
  'employee_id', 'masked_name', 'store', 'role', 'status',
  'device_id', 'device_bound_at', 'last_login_at'
];
const PRIVATE_DASHBOARD_REQUEST_HEADERS = [
  'request_id', 'employee_id', 'device_id', 'requested_at', 'status',
  'approved_at', 'approved_by', 'replaced_device_id'
];

const PRIVATE_DASHBOARD_POST_MESSAGE_TYPE = 'north12b-gas-response-v1';
const PRIVATE_DASHBOARD_PRODUCTION_ORIGIN = 'https://lian852456-dot.github.io';

function privateDashboardPostIsIframeTransport(e) {
  return String((e && e.parameter && e.parameter.transport) || '') === 'iframe';
}

function privateDashboardPostOrigin(e) {
  const requested = String((e && e.parameter && e.parameter.origin) || '');
  const allowed = [
    PRIVATE_DASHBOARD_PRODUCTION_ORIGIN,
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'null'
  ];
  return allowed.indexOf(requested) >= 0 ? requested : PRIVATE_DASHBOARD_PRODUCTION_ORIGIN;
}

function privateDashboardPostResponse(body, e) {
  if (!privateDashboardPostIsIframeTransport(e)) return jsonResponse(body);
  const message = JSON.stringify({
    type: PRIVATE_DASHBOARD_POST_MESSAGE_TYPE,
    requestId: String((e && e.parameter && e.parameter.requestId) || ''),
    body: body
  }).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  const targetOrigin = JSON.stringify(privateDashboardPostOrigin(e));
  // Apps Script wraps HtmlService output in a nested sandbox iframe. The
  // top-level caller is the GitHub Pages page that submitted the form.
  const html = '<!doctype html><meta charset="utf-8"><script>' +
    'window.top.postMessage(' + message + ',' + targetOrigin + ');' +
    '</script>';
  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function privateDashboardPostRawPayload(e) {
  const formPayload = e && e.parameter && e.parameter.payload;
  return formPayload != null
    ? formPayload
    : ((e && e.postData && e.postData.contents) || '{}');
}

function privateDashboardParsePostPayload(e) {
  return JSON.parse(privateDashboardPostRawPayload(e) || '{}');
}

function reportWritePayload_(payload) {
  const data = payload.data || {};
  if (data.awardModels !== undefined) {
    const normalizedAwardModels = normalizeReportAwardModels_(data.awardModels);
    // 新契約資料不得回寫 legacy tw_*；其餘既有 KPI 欄位仍維持 v15 寫入方式。
    const legacyData = {};
    Object.keys(data).forEach(key => {
      if (key !== 'awardModels' && key.indexOf('tw_') !== 0) legacyData[key] = data[key];
    });
    writeData(payload.date, payload.store, payload.seg, legacyData);
    const saved = writeReportAwardModels_(payload.date, payload.store, payload.seg, normalizedAwardModels, payload.versionId);
    return { status: 'ok', ...saved };
  }
  writeData(payload.date, payload.store, payload.seg, data);
  return { status: 'ok' };
}

function reportSummaryNumber_(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return isFinite(number) ? number : null;
}

function reportSummaryClock_(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const zh = text.match(/^(上午|下午)\s*(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (zh) {
    let hour = Number(zh[2]) % 12;
    if (zh[1] === '下午') hour += 12;
    return { seconds:hour * 3600 + Number(zh[3]) * 60 + Number(zh[4] || 0), text:String(hour).padStart(2, '0') + ':' + zh[3] + ':' + String(zh[4] || '00').padStart(2, '0') };
  }
  const plain = text.match(/(?:^|T|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!plain) return null;
  const hour = Number(plain[1]);
  return { seconds:hour * 3600 + Number(plain[2]) * 60 + Number(plain[3] || 0), text:String(hour).padStart(2, '0') + ':' + plain[2] + ':' + String(plain[3] || '00').padStart(2, '0') };
}

function reportSummaryFromData_(data, date, seg) {
  const source = data && typeof data === 'object' ? data : {};
  const definitions = [
    { key:'A999', sourceField:'aq999', unit:'count', aggregation:'sum' },
    { key:'好速', sourceField:'haosu', unit:'points', aggregation:'sum' },
    { key:'R1399', sourceField:'rt1399', unit:'count', aggregation:'sum' },
    { key:'R999', sourceField:'rt999', unit:'count', aggregation:'sum' },
    { key:'保險搭售率', sourceField:'insurance_pct', unit:'percent', aggregation:'average' },
    { key:'設備案佔比', sourceField:'device_ratio', unit:'percent', aggregation:'average' }
  ];
  const stores = STORES.map(function(store) {
    const row = source[store] || null;
    const metrics = {};
    if (row) definitions.forEach(function(definition) {
      const value = reportSummaryNumber_(row[definition.sourceField]);
      if (value !== null) metrics[definition.key] = { value:value, unit:definition.unit, sourceField:definition.sourceField };
    });
    return { name:store, reported:Boolean(row), reportedAt:row ? String(row.savedAt || row.updatedAt || '') : '', metrics:metrics };
  });
  const reportedRows = STORES.map(function(store) { return source[store] || null; }).filter(Boolean);
  const metrics = {};
  if (reportedRows.length) definitions.forEach(function(definition) {
    const values = reportedRows.map(function(row) { return reportSummaryNumber_(row[definition.sourceField]); }).filter(function(value) { return value !== null; });
    if (!values.length) return;
    const value = definition.aggregation === 'average'
      ? Number((values.reduce(function(sum, item) { return sum + item; }, 0) / values.length).toFixed(1))
      : values.reduce(function(sum, item) { return sum + item; }, 0);
    metrics[definition.key] = { value:value, unit:definition.unit, sourceField:definition.sourceField, aggregation:definition.aggregation };
  });
  const latest = stores.map(function(store) { return reportSummaryClock_(store.reportedAt); }).filter(Boolean).sort(function(a, b) { return a.seconds - b.seconds; }).pop();
  return {
    date:String(date || ''), segment:Number(seg), completedStores:stores.filter(function(store) { return store.reported; }).length,
    totalStores:STORES.length, missingStores:stores.filter(function(store) { return !store.reported; }).map(function(store) { return store.name; }),
    updatedAt:latest ? latest.text : '', metrics:metrics, stores:stores,
    semantics:'formal-index-summary-v1'
  };
}

function reportReadPayload_(payload) {
  const seg = parseInt(payload.seg, 10);
  const data = readData(payload.date, seg);
  return { status: 'ok', data:data, summary:reportSummaryFromData_(data, payload.date, seg) };
}

function personalWritePayload_(payload) {
  writePersonal(payload);
  return { status: 'ok' };
}

function personalReadPayload_(payload) {
  return { status: 'ok', data: readPersonal(payload.date, parseInt(payload.seg, 10)) };
}

function doPost(e) {
  let action = '';
  let payload = {};
  try {
    const rawPayload = privateDashboardPostRawPayload(e);
    payload = privateDashboardParsePostPayload(e);
    action = String(payload.action || '');
    if (action === 'write') assertNoDuplicateReportAwardModelIds_(rawPayload);
    // 部署隔離：上傳專用 Deployment 只放行四個上傳路由
    if (reportUploadIsUploadDeployment_() && REPORT_UPLOAD_ALLOWED_ACTIONS.indexOf(action) === -1) {
      throw new Error('route-not-available-on-upload-deployment');
    }
    let result;
    if (action === 'ptauth') result = ptAuthenticatePayload(payload);
    else if (action === 'ptlogout') result = ptLogoutPayload(payload);
    else if (action === 'ptsummary') result = ptSummaryPostPayload_(payload);
    else if (action === 'ptdetail') result = ptDetailPostPayload_(payload);
    else if (action === 'ptmileage') result = ptMileageMonthPostPayload_(payload);
    else if (action === 'ptmileage2') result = ptMileage2MonthPostPayload_(payload);
    else if (action === 'ptvisit_write') result = writePatrolVisitEvent_(payload);
    else if (action === 'hwrite') result = writeHalfCheckPostPayload_(payload, e);
    else if (action === 'half_media_upload') result = uploadHalfMedia(payload);
    else if (action === 'audit_config') result = auditPublicConfig();
    else if (action === 'audit_start') result = auditStart(payload);
    else if (action === 'audit_upload') result = auditUploadPhoto(payload);
    else if (action === 'audit_photo_delete') result = auditDeletePhoto(payload);
    else if (action === 'audit_submit') result = auditSubmit(payload);
    else if (action === 'audit_status') result = auditOwnStatus(payload);
    else if (action === 'audit_overview') result = auditOverview(payload);
    else if (action === 'audit_detail') result = auditDetail(payload);
    else if (action === 'audit_photo_read') result = auditPhotoRead(payload);
    else if (action === 'audit_review') result = auditReview(payload);
    else if (action === 'audit_cancel') result = auditCancel(payload);
    else if (action === 'private_request') result = privateDashboardRequestBinding(payload);
    else if (action === 'private_request_status') result = privateDashboardRequestStatus(payload);
    else if (action === 'private_access') result = privateDashboardAccess(payload);
    else if (action === 'private_admin_requests') result = privateDashboardAdminRequests(payload);
    else if (action === 'private_admin_approve') result = privateDashboardAdminApprove(payload);
    else if (action === 'private_admin_revoke') result = privateDashboardAdminRevoke(payload);
    else if (action === 'private_admin_set_trusted_employee') result = privateDashboardAdminSetTrustedEmployee(payload);
    else if (action === 'private_admin_snapshot_status') result = privateDashboardAdminSnapshotStatus(payload);
    else if (action === 'private_sync_roster') result = privateDashboardSyncRoster(payload);
    else if (action === 'private_publish_kpi_component') result = privateDashboardPublishKpiComponent(payload);
    else if (action === 'private_publish_awards_component') result = privateDashboardPublishAwardsComponent(payload);
    else if (action === 'private_publish') result = privateDashboardPublish(payload);
    else if (action === 'kpicalc_access') result = kpiCalcAccess(payload);
    else if (action === 'kpicalc_publish') result = kpiCalcPublish(payload);
    else if (action === 'read') result = reportReadPayload_(payload);
    else if (action === 'write') result = reportWritePayload_(payload);
    else if (action === 'pwrite') result = personalWritePayload_(payload);
    else if (action === 'pread') result = personalReadPayload_(payload);
    else if (action === 'report_upload_preview') result = reportUploadPreview(payload);
    else if (action === 'report_upload_commit') result = reportUploadCommit(payload);
    else if (action === 'report_upload_log') result = reportUploadLog(payload);
    else if (action === 'report_upload_rollback') result = reportUploadRollback(payload);
    else if (action === 'report_award_pair_preview') result = reportAwardPairPreview(payload);
    else throw new Error('unknown private dashboard action');
    return privateDashboardPostResponse({ status: 'ok', ...result }, e);
  } catch (err) {
    const patrolActions = ['ptauth','ptlogout','ptsummary','ptdetail','ptmileage','ptmileage2','ptvisit_write','hwrite','half_media_upload'];
    const response = patrolActions.indexOf(action) >= 0
      ? ptRouteErrorPayload_(err, action, payload && payload.token)
      : { status: 'error', message: err && err.message ? err.message : String(err) };
    return privateDashboardPostResponse(response, e);
  }
}

function privateDashboardProperties() {
  return PropertiesService.getScriptProperties();
}

function privateDashboardRequiredProperty(name) {
  const value = privateDashboardProperties().getProperty(name);
  if (!value || /^CHANGE_ME/i.test(value)) throw new Error('private dashboard is not configured: ' + name);
  return value;
}

function privateDashboardNow() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function privateDashboardCleanEmployeeId(value) {
  const employeeId = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{5,12}$/.test(employeeId)) throw new Error('員編格式不正確');
  return employeeId;
}

function privateDashboardIsTrustedEmployee(employeeId) {
  const trustedEmployeeId = String(privateDashboardProperties().getProperty('DASHBOARD_TRUSTED_EMPLOYEE_ID') || '')
    .trim()
    .toUpperCase();
  return /^[A-Z0-9]{5,12}$/.test(trustedEmployeeId) && employeeId === trustedEmployeeId;
}

function privateDashboardCleanDeviceId(value) {
  const deviceId = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(deviceId)) throw new Error('裝置識別不正確，請重新開啟頁面');
  return deviceId;
}

function privateDashboardHash(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''));
  return bytes.map(function(byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function privateDashboardAdminAuthorized(payload) {
  const expected = privateDashboardRequiredProperty('DASHBOARD_ADMIN_SECRET');
  const actual = String((payload || {}).adminSecret || '');
  if (privateDashboardHash(actual) !== privateDashboardHash(expected)) throw new Error('管理者驗證失敗');
}

function privateDashboardFolder() {
  return DriveApp.getFolderById(privateDashboardRequiredProperty('DASHBOARD_PRIVATE_FOLDER_ID'));
}

function privateDashboardRoster() {
  const props = privateDashboardProperties();
  const id = props.getProperty('DASHBOARD_ROSTER_SHEET_ID');
  if (!id) throw new Error('尚未初始化私有戰情名冊，請先執行 setupPrivateDashboard');
  return SpreadsheetApp.openById(id);
}

function privateDashboardSheet(name, headers) {
  const ss = privateDashboardRoster();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  const existing = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  if (existing.join('|') !== headers.join('|')) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function privateDashboardRows(sheet, headers) {
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function(row, offset) {
    const item = { _row: offset + 2 };
    headers.forEach(function(header, index) { item[header] = row[index] == null ? '' : String(row[index]); });
    return item;
  });
}

function privateDashboardWriteObject(sheet, headers, rowIndex, item) {
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([headers.map(function(header) { return item[header] || ''; })]);
}

// 由管理者在 Apps Script 編輯器執行一次。建立的 Sheet 位於同一個私有 Drive 資料夾中。
function setupPrivateDashboard() {
  const props = privateDashboardProperties();
  const folder = privateDashboardFolder();
  let rosterId = props.getProperty('DASHBOARD_ROSTER_SHEET_ID');
  let roster;
  if (rosterId) {
    roster = SpreadsheetApp.openById(rosterId);
  } else {
    roster = SpreadsheetApp.create('北一二B 私有戰情登入名冊（系統管理）');
    const file = DriveApp.getFileById(roster.getId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
    props.setProperty('DASHBOARD_ROSTER_SHEET_ID', roster.getId());
    rosterId = roster.getId();
  }
  privateDashboardSheet(PRIVATE_DASHBOARD_USERS_SHEET, PRIVATE_DASHBOARD_USERS_HEADERS);
  privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS);
  return { rosterSheetId: rosterId, folderId: folder.getId() };
}

function privateDashboardUserByEmployeeId(employeeId) {
  const sheet = privateDashboardSheet(PRIVATE_DASHBOARD_USERS_SHEET, PRIVATE_DASHBOARD_USERS_HEADERS);
  const found = privateDashboardRows(sheet, PRIVATE_DASHBOARD_USERS_HEADERS)
    .filter(function(item) { return item.employee_id === employeeId; });
  return { sheet: sheet, user: found.length ? found[0] : null };
}

function privateDashboardRequestBinding(payload) {
  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const deviceId = privateDashboardCleanDeviceId(payload.deviceId);
  const bootstrapCode = String(payload.bootstrapCode || '');
  if (privateDashboardHash(bootstrapCode) !== privateDashboardHash(privateDashboardRequiredProperty('DASHBOARD_BOOTSTRAP_CODE'))) {
    throw new Error('首次啟用碼不正確');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const lookup = privateDashboardUserByEmployeeId(employeeId);
    if (!lookup.user || lookup.user.status !== 'active') throw new Error('此員編不在可使用名冊中');
    if (lookup.user.device_id === deviceId) return { requestStatus: 'approved', message: '此裝置已核准，可直接以員編登入。' };
    const requestSheet = privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS);
    const requests = privateDashboardRows(requestSheet, PRIVATE_DASHBOARD_REQUEST_HEADERS);
    const prior = requests.filter(function(item) {
      return item.employee_id === employeeId && item.device_id === deviceId && item.status === 'pending';
    })[0];
    if (prior) return { requestStatus: 'pending', requestId: prior.request_id, message: '已送出綁定申請，等待管理者核准。' };
    const request = {
      request_id: Utilities.getUuid(), employee_id: employeeId, device_id: deviceId,
      requested_at: privateDashboardNow(), status: 'pending', approved_at: '', approved_by: '', replaced_device_id: ''
    };
    privateDashboardWriteObject(requestSheet, PRIVATE_DASHBOARD_REQUEST_HEADERS, requestSheet.getLastRow() + 1, request);
    privateDashboardNotifyAdminOfBindingRequest(request, lookup.user);
    return { requestStatus: 'pending', requestId: request.request_id, message: '已送出綁定申請，等待管理者核准。' };
  } finally {
    lock.releaseLock();
  }
}

function privateDashboardRequestStatus(payload) {
  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const deviceId = privateDashboardCleanDeviceId(payload.deviceId);
  const requests = privateDashboardRows(
    privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS),
    PRIVATE_DASHBOARD_REQUEST_HEADERS
  ).filter(function(item) { return item.employee_id === employeeId && item.device_id === deviceId; });
  requests.sort(function(a, b) { return b.requested_at.localeCompare(a.requested_at); });
  const latest = requests[0];
  if (!latest) return { requestStatus: 'none' };
  return { requestStatus: latest.status, requestedAt: latest.requested_at, approvedAt: latest.approved_at };
}

function privateDashboardNotifyAdminOfBindingRequest(request, user) {
  const notifyEmail = String(privateDashboardProperties().getProperty('DASHBOARD_NOTIFY_EMAIL') || '').trim();
  if (!notifyEmail) return;
  const body = [
    '北一二B KPI／台獎戰情有新的裝置綁定申請。',
    '員編：' + request.employee_id,
    '姓名：' + String(user.masked_name || ''),
    '店點：' + String(user.store || ''),
    '職務：' + String(user.role || ''),
    '申請時間：' + request.requested_at,
    '',
    '請開啟網站的 KPI戰情或台獎戰情頁籤，按「管理者核准」處理。'
  ].join('\n');
  try {
    MailApp.sendEmail(notifyEmail, '🔐 北一二B 戰情登入申請待核准', body);
  } catch (error) {
    console.log('private dashboard binding notification failed: ' + error);
  }
}

function privateDashboardSnapshot() {
  const files = privateDashboardFolder().getFilesByName(PRIVATE_DASHBOARD_FILE);
  if (!files.hasNext()) throw new Error('今日私有戰情尚未更新');
  const snapshot = JSON.parse(files.next().getBlob().getDataAsString('UTF-8'));
  if (!snapshot || !snapshot.kpiBattle || !snapshot.awardsBattle) throw new Error('私有戰情快照格式不完整');
  return snapshot;
}

function privateDashboardAccess(payload) {
  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const deviceId = privateDashboardCleanDeviceId(payload.deviceId);
  const lookup = privateDashboardUserByEmployeeId(employeeId);
  if (!lookup.user || lookup.user.status !== 'active' || (!privateDashboardIsTrustedEmployee(employeeId) && lookup.user.device_id !== deviceId)) {
    throw new Error('此員編尚未核准此裝置，請先申請並等待管理者核准');
  }
  lookup.user.last_login_at = privateDashboardNow();
  privateDashboardWriteObject(lookup.sheet, PRIVATE_DASHBOARD_USERS_HEADERS, lookup.user._row, lookup.user);
  const snapshot = privateDashboardSnapshot();
  return { snapshot: snapshot, profile: { maskedName: lookup.user.masked_name, store: lookup.user.store, role: lookup.user.role } };
}

function privateDashboardAdminRequests(payload) {
  privateDashboardAdminAuthorized(payload);
  const requests = privateDashboardRows(
    privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS),
    PRIVATE_DASHBOARD_REQUEST_HEADERS
  ).filter(function(item) { return item.status === 'pending'; })
    .sort(function(a, b) { return b.requested_at.localeCompare(a.requested_at); });
  return { requests: requests.map(function(item) { return {
    requestId: item.request_id, employeeId: item.employee_id, requestedAt: item.requested_at
  }; }) };
}

function privateDashboardAdminApprove(payload) {
  privateDashboardAdminAuthorized(payload);
  const requestId = String(payload.requestId || '');
  if (!requestId) throw new Error('缺少綁定申請編號');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const requestSheet = privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS);
    const requests = privateDashboardRows(requestSheet, PRIVATE_DASHBOARD_REQUEST_HEADERS);
    const request = requests.filter(function(item) { return item.request_id === requestId; })[0];
    if (!request || request.status !== 'pending') throw new Error('找不到待核准的綁定申請');
    const lookup = privateDashboardUserByEmployeeId(request.employee_id);
    if (!lookup.user || lookup.user.status !== 'active') throw new Error('名冊內找不到啟用中的員編');
    const previousDeviceId = lookup.user.device_id || '';
    lookup.user.device_id = request.device_id;
    lookup.user.device_bound_at = privateDashboardNow();
    lookup.user.last_login_at = '';
    privateDashboardWriteObject(lookup.sheet, PRIVATE_DASHBOARD_USERS_HEADERS, lookup.user._row, lookup.user);
    requests.forEach(function(item) {
      if (item.employee_id !== request.employee_id || item.status !== 'pending') return;
      item.status = item.request_id === request.request_id ? 'approved' : 'superseded';
      if (item.request_id === request.request_id) {
        item.approved_at = privateDashboardNow();
        item.approved_by = 'admin';
        item.replaced_device_id = previousDeviceId;
      }
      privateDashboardWriteObject(requestSheet, PRIVATE_DASHBOARD_REQUEST_HEADERS, item._row, item);
    });
    return { approved: true, employeeId: request.employee_id };
  } finally {
    lock.releaseLock();
  }
}

function privateDashboardAdminRevoke(payload) {
  privateDashboardAdminAuthorized(payload);
  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const lookup = privateDashboardUserByEmployeeId(employeeId);
  if (!lookup.user) throw new Error('找不到員編');
  lookup.user.device_id = '';
  lookup.user.device_bound_at = '';
  lookup.user.last_login_at = '';
  privateDashboardWriteObject(lookup.sheet, PRIVATE_DASHBOARD_USERS_HEADERS, lookup.user._row, lookup.user);
  return { revoked: true, employeeId: employeeId };
}

function privateDashboardAdminSetTrustedEmployee(payload) {
  privateDashboardAdminAuthorized(payload);
  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const lookup = privateDashboardUserByEmployeeId(employeeId);
  if (!lookup.user || lookup.user.status !== 'active') throw new Error('此員編不在可使用名冊中');
  const props = privateDashboardProperties();
  props.setProperty('DASHBOARD_TRUSTED_EMPLOYEE_ID', employeeId);
  const notificationEmail = String(payload.notificationEmail || '').trim();
  if (notificationEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail)) throw new Error('通知信箱格式不正確');
    props.setProperty('DASHBOARD_NOTIFY_EMAIL', notificationEmail);
  }
  return { trustedEmployeeId: employeeId };
}

function privateDashboardAdminSnapshotStatus(payload) {
  privateDashboardAdminAuthorized(payload);
  const files = privateDashboardFolder().getFilesByName(PRIVATE_DASHBOARD_FILE);
  if (!files.hasNext()) throw new Error('私有戰情快照不存在');
  const file = files.next();
  const snapshot = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if (!snapshot || !snapshot.kpiBattle || !snapshot.awardsBattle) throw new Error('私有戰情快照格式不完整');
  const owner = file.getOwner();
  return {
    fileName: file.getName(),
    fileId: file.getId(),
    ownerEmail: owner ? owner.getEmail() : '',
    sharingAccess: String(file.getSharingAccess()),
    sharingPermission: String(file.getSharingPermission()),
    lastUpdated: Utilities.formatDate(file.getLastUpdated(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX"),
    publishedAt: snapshot.publishedAt || '',
    kpiReportDate: snapshot.kpiBattle.report_date || '',
    awardsReportDate: snapshot.awardsBattle.report_date || '',
    kpiComponentStatus: String((((snapshot.components || {}).kpi || {}).status) || ''),
    kpiComponentRunId: String((((snapshot.components || {}).kpi || {}).run_id) || ''),
    kpiComponentSourceFile: String((((snapshot.components || {}).kpi || {}).source_file) || ''),
    kpiComponentDataAsOfDate: String((((snapshot.components || {}).kpi || {}).data_as_of_date) || ''),
    awardsComponentStatus: String((((snapshot.components || {}).awards || {}).status) || ''),
    awardsComponentReason: String((((snapshot.components || {}).awards || {}).reason) || ''),
    awardsComponentDataAsOfDate: String((((snapshot.components || {}).awards || {}).data_as_of_date) || ''),
    kpiPayloadHash: reportVersionHash_(JSON.stringify(snapshot.kpiBattle)),
    awardsPayloadHash: reportVersionHash_(JSON.stringify(snapshot.awardsBattle)),
    phoneItems: snapshot.awardsBattle.phone_items || 0,
    storeRows: snapshot.awardsBattle.store_rows || 0
  };
}

// ════════════════════════════════════
// KPI 試算（kpi.html）— 與私有戰情共用員編名冊、裝置綁定與審核流程
// 資料檔存在同一個私有 Drive 資料夾，不進 GitHub。
// 發佈方式：kpi.html 進階設定 → 督導發佈區（管理者密碼＋JSON 檔）。
// ════════════════════════════════════

const PRIVATE_KPICALC_FILE = 'north12b-kpicalc-private-latest.json';

function kpiCalcAccess(payload) {
  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const deviceId = privateDashboardCleanDeviceId(payload.deviceId);
  const lookup = privateDashboardUserByEmployeeId(employeeId);
  if (!lookup.user || lookup.user.status !== 'active' || (!privateDashboardIsTrustedEmployee(employeeId) && lookup.user.device_id !== deviceId)) {
    throw new Error('此員編尚未核准此裝置，請先「首次申請綁定」並等待督導核准');
  }
  lookup.user.last_login_at = privateDashboardNow();
  privateDashboardWriteObject(lookup.sheet, PRIVATE_DASHBOARD_USERS_HEADERS, lookup.user._row, lookup.user);
  const file = kpiCalcLatestDataFile();
  if (!file) throw new Error('KPI 試算資料尚未發佈，請通知督導');
  const data = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if (!data || !data.meta || !data.stores || !data.persons) throw new Error('KPI 試算資料格式不完整');
  return { data: data, profile: { maskedName: lookup.user.masked_name, store: lookup.user.store, role: lookup.user.role, isTrusted: privateDashboardIsTrustedEmployee(employeeId) } };
}

// 取私有資料夾中最新的一份 KPI 試算資料。
// 相容三種來源：自動更新/督導發佈寫的 north12b-kpicalc-private-latest.json，
// 以及外部工具（例如 AI 助手經 Drive 直接補檔）建立的 north12b-kpicalc-<日期>.json。
// 一律取「最後更新時間最新」者，避免舊檔覆蓋新資料。
function kpiCalcLatestDataFile() {
  const files = privateDashboardFolder().getFiles();
  let best = null;
  while (files.hasNext()) {
    const f = files.next();
    if (!/^north12b-kpicalc-.*\.json$/i.test(f.getName())) continue;
    if (!best || f.getLastUpdated() > best.getLastUpdated()) best = f;
  }
  return best;
}

function kpiCalcPublish(payload) {
  privateDashboardAdminAuthorized(payload);
  const encoded = String(payload.dataBase64 || '');
  if (!encoded || encoded.length > 8 * 1024 * 1024) throw new Error('KPI 試算資料缺少或過大');
  const text = Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString('UTF-8');
  const data = JSON.parse(text);
  if (!data || !data.meta || !data.stores || !data.persons) throw new Error('KPI 試算資料格式不完整');
  const folder = privateDashboardFolder();
  const files = folder.getFilesByName(PRIVATE_KPICALC_FILE);
  const blob = Utilities.newBlob(text, 'application/json', PRIVATE_KPICALC_FILE);
  if (files.hasNext()) files.next().setContent(blob.getDataAsString('UTF-8'));
  else folder.createFile(blob);
  // 手動發佈也寄確認信，留下更新紀錄（與自動更新的 ✅ 信格式一致）
  const meta = data.meta || {};
  kpiCalcNotify('✅ KPI試算資料已更新（手動發佈｜' + (meta.sourceFile || '未標示來源') + '）',
    '發佈方式：督導發佈區（手動上傳）\n' +
    '來源：' + (meta.sourceFile || '-') + '\n' +
    '期間：' + (meta.period || '-') + '（累計到第 ' + (meta.snapshotDay || '?') + ' 天）\n' +
    '店點 ' + data.stores.length + ' 家、人員 ' + data.persons.length + ' 位。\n' +
    kpiCalcBrief(data) +
    '\n同仁重新登入 kpi.html 即可看到新累計數。\n' +
    '※ 收到這封信代表資料已更新成功；若某天既沒有自動更新信也沒有這封，就是當天沒更新。');
  // 同上：kpi.html 督導發佈區是既有手動流程，只登記版本、不擋。
  reportVersionRecord_('kpi', {
    dataDate: reportUploadKpiDate_(meta), source: 'manual-upload',
    fileHash: reportVersionHash_(text), fileName: String(meta.sourceFile || PRIVATE_KPICALC_FILE),
    operator: 'kpi.html-publish'
  }, 'success', { rule: 'record-only' });
  return { publishedAt: privateDashboardNow(), period: meta.period || '' };
}

// ════════════════════════════════════
// KPI 試算：每日自動更新（讀 Drive 日報 xlsx → 解析 → 發佈私有資料檔）
//
// 啟用方式（只需做一次）：
//   1. 左側「服務 +」加入「Drive API」（識別碼 Drive，版本 v3）
//   2. 函式選單選「setupKpiCalcAutoUpdate」→ 執行（會要求授權）
//   3. 之後每天 11:00（台北時間，±15分）自動檢查來源資料夾，
//      有新日報（檔名 MMDD.xlsx）就更新；沒有新檔就靜靜略過。
// 想立即測試或當天補跑：函式選單選「testKpiCalcAutoUpdate」執行。
// 注意：時間觸發器跑最新存檔程式碼，這部分不需重新部署 Web App。
// 來源資料夾可用指令碼屬性 KPICALC_SOURCE_FOLDER_ID 覆蓋。
// ════════════════════════════════════

const KPICALC_SOURCE_FOLDER_ID_DEFAULT = '1zs4flckF4uysz55tXkAxojM5-yB6a9sH';
const KPICALC_ITEMS = [
  ['5G銷售數','5G',1],['HBO Max&Disney+&Prime Video銷售數','HBO/D+/PV',1],
  ['Netflix多享組銷售數','Netflix多享組',1],['TTL AQ上線點數','AQ上線點數',0.5],
  ['自退數','自退數',1],['解約後NP OUT','解約後NP OUT',1],['解約後NP OUT(督導績)','NP OUT(督導績)',1],
  ['AQ V+D 999 (含)以上','AQ V+D≧999',1],['AQ V+D 1399 (含)以上','AQ V+D≧1399',1],
  ['預付卡開卡面額','預付卡開卡面額',1],['RT上線點數','RT上線點數',0.1],
  ['特殊維繫用戶續約數','特殊維繫續約',1],['高高特維用戶續約數','高高特維續約',1],
  ['RT V+D 999 (含)以上','RT V+D≧999',1],['RT V+D 1399 (含)以上','RT V+D≧1399',1],
  ['Device專案銷售數','Device專案',1],['重點Device銷售量','重點Device',1],
  ['好速案銷售點數','好速案點數',0.25],['換約淨新增金額','換約淨新增金額',1],
  ['空機、3C、物聯網及門市購營收','空機/3C/物聯網營收',1],['配件及其他營收','配件及其他營收',1],
  ['包膜與保貼營收','包膜與保貼營收',1],['手機保險服務點數','手機保險點數',0.5],
  ['MyVideo&KKBOX','MyVideo&KKBOX',1],['Apple&Google服務及雜誌週刊開通數','Apple&Google開通',1],
];

// 督導本人免裝置綁定：
//   1. 專案設定（⚙️）→ 指令碼屬性 → 新增 DASHBOARD_TRUSTED_EMPLOYEE_ID = 你的員編
//   2. 函式選單選 kpiCalcSetupSelf → 執行一次
// 之後該員編在任何裝置輸入員編即可登入 kpi.html 與戰情，不用申請綁定。
function kpiCalcSetupSelf() {
  const raw = PropertiesService.getScriptProperties().getProperty('DASHBOARD_TRUSTED_EMPLOYEE_ID');
  if (!raw) throw new Error('請先在「專案設定 > 指令碼屬性」新增 DASHBOARD_TRUSTED_EMPLOYEE_ID = 你的員編');
  const employeeId = privateDashboardCleanEmployeeId(raw);
  const sheet = privateDashboardSheet(PRIVATE_DASHBOARD_USERS_SHEET, PRIVATE_DASHBOARD_USERS_HEADERS);
  const lookup = privateDashboardUserByEmployeeId(employeeId);
  const user = lookup.user || {
    employee_id: employeeId, masked_name: '督導', store: '北一二B', role: '督導',
    device_id: '', device_bound_at: '', last_login_at: ''
  };
  user.status = 'active';
  if (user._row) privateDashboardWriteObject(sheet, PRIVATE_DASHBOARD_USERS_HEADERS, user._row, user);
  else privateDashboardWriteObject(sheet, PRIVATE_DASHBOARD_USERS_HEADERS, sheet.getLastRow() + 1, user);
  return { trusted: employeeId, status: 'active', note: '此員編已可在任何裝置直接登入' };
}

function setupKpiCalcAutoUpdate() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'kpiCalcAutoUpdate') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('kpiCalcAutoUpdate').timeBased().everyDays(1).atHour(11).inTimezone('Asia/Taipei').create();
  return kpiCalcAutoUpdate();
}

function testKpiCalcAutoUpdate() {
  PropertiesService.getScriptProperties().deleteProperty('KPICALC_LAST_IMPORT');
  return kpiCalcAutoUpdate();
}

// 中午巡檢：每天 12:30 檢查今日資料是否已更新，未更新才寄提醒（正常則靜默）。
// 啟用：執行一次 setupKpiCalcWatchdog()（用同一個授權，不需重新部署）。
function setupKpiCalcWatchdog() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'kpiCalcWatchdog') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('kpiCalcWatchdog').timeBased().everyDays(1)
    .atHour(12).nearMinute(30).inTimezone('Asia/Taipei').create();
  return kpiCalcWatchdog();
}

function kpiCalcWatchdog() {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('KPICALC_SOURCE_FOLDER_ID') || KPICALC_SOURCE_FOLDER_ID_DEFAULT;
  const todayTag = Utilities.formatDate(new Date(), 'Asia/Taipei', 'MMdd');
  let todayFile = null;
  const files = DriveApp.getFolderById(folderId).getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const m = f.getName().match(/^(\d{4})\.xlsx$/);
    if (m && m[1] === todayTag) { todayFile = f; break; }
  }
  if (!todayFile) {
    kpiCalcNotify('⚠️ 今日尚未上傳 KPI 日報（' + todayTag + '.xlsx）',
      '中午 12:30 巡檢：來源資料夾還沒有今天的 ' + todayTag + '.xlsx。\n' +
      '請記得上傳今日日報，否則 kpi.html 的同仁實際數會停留在前一天。\n' +
      '上傳後可在 GAS 手動執行 testKpiCalcAutoUpdate 立即更新，或等明天 11:00 自動處理。');
    return { status: 'no-today-file', tag: todayTag };
  }
  const stamp = todayFile.getName() + ':' + todayFile.getLastUpdated().getTime();
  if (props.getProperty('KPICALC_LAST_IMPORT') !== stamp) {
    kpiCalcNotify('⚠️ 今日 KPI 試算資料可能未更新（' + todayFile.getName() + '）',
      '中午 12:30 巡檢：今天的 ' + todayFile.getName() + ' 已上傳，但自動更新的紀錄對不上——上午 11:00 的更新可能沒跑成功。\n' +
      '請開 kpi.html 登入確認資料日期；或在 GAS 手動執行 testKpiCalcAutoUpdate 補跑，若補跑仍失敗代表日報格式有變，請把檔案交給 AI 檢查。');
    return { status: 'not-imported', tag: todayTag };
  }
  return { status: 'ok', tag: todayTag };  // 正常：不寄信
}

function kpiCalcNotify(subject, body) {
  const email = String(PropertiesService.getScriptProperties().getProperty('DASHBOARD_NOTIFY_EMAIL') || '').trim() || NOTIFY_EMAIL;
  if (!email || /CHANGE_ME/.test(email)) return;
  try { MailApp.sendEmail(email, subject, body); } catch (e) { console.log('kpicalc notify failed: ' + e); }
}

function kpiCalcAutoUpdate() {
  const props = PropertiesService.getScriptProperties();
  let latest = null;
  try {
    const folderId = props.getProperty('KPICALC_SOURCE_FOLDER_ID') || KPICALC_SOURCE_FOLDER_ID_DEFAULT;
    const files = DriveApp.getFolderById(folderId).getFiles();
    while (files.hasNext()) {
      const f = files.next();
      const m = f.getName().match(/^(\d{4})\.xlsx$/);
      if (!m) continue;
      if (!latest || Number(m[1]) > Number(latest.tag) ||
          (Number(m[1]) === Number(latest.tag) && f.getLastUpdated() > latest.file.getLastUpdated())) {
        latest = { file: f, tag: m[1] };
      }
    }
    if (!latest) { console.log('kpicalc: 找不到 MMDD.xlsx 日報檔'); return { status: 'no-file' }; }
    const stamp = latest.file.getName() + ':' + latest.file.getLastUpdated().getTime();
    if (props.getProperty('KPICALC_LAST_IMPORT') === stamp) return { status: 'up-to-date', file: latest.file.getName() };

    const data = kpiCalcParseReport(latest.file);
    const text = JSON.stringify(data);

    // 防衝突：排程不得覆蓋較新的、或同日期已由網站手動上傳的資料。
    // （例：10:55 手動上傳 0731 更正版，11:00 排程掃到舊的 0731.xlsx。）
    const incoming = {
      dataDate: reportUploadKpiDate_(data.meta), source: 'scheduled',
      fileHash: reportVersionHash_(text), fileName: latest.file.getName(), operator: 'trigger'
    };
    const decision = reportVersionDecide_('kpi', incoming);
    if (!decision.accept) {
      props.setProperty('KPICALC_LAST_IMPORT', stamp);   // 記下已看過，避免每天重複判斷
      reportVersionRecord_('kpi', incoming, 'skipped', { skipRule: decision.rule });
      kpiCalcNotify('ℹ️ KPI試算資料未更新（' + latest.file.getName() + '｜' + decision.rule + '）',
        '排程判斷不應覆蓋目前正式版本，已略過。\n原因：' + decision.reason +
        '\n目前正式版本維持不變。\n\n若確定要用這份來源檔覆蓋，請在 GAS 執行 testKpiCalcAutoUpdate 前' +
        '先確認，或改用網站「戰報快速更新」上傳（手動上傳可強制覆寫）。');
      return { status: 'skipped', rule: decision.rule, file: latest.file.getName() };
    }

    const folder = privateDashboardFolder();
    const existing = folder.getFilesByName(PRIVATE_KPICALC_FILE);
    if (existing.hasNext()) existing.next().setContent(text);
    else folder.createFile(Utilities.newBlob(text, 'application/json', PRIVATE_KPICALC_FILE));
    props.setProperty('KPICALC_LAST_IMPORT', stamp);
    reportVersionRecord_('kpi', incoming, 'success', { rule: decision.rule });
    kpiCalcNotify('✅ KPI試算資料已更新（' + latest.file.getName() + '）',
      '來源：' + latest.file.getName() + '\n期間：' + data.meta.period +
      '\n店點 ' + data.stores.length + ' 家、人員 ' + data.persons.length + ' 位。\n' +
      kpiCalcBrief(data) +
      '\n同仁重新登入 kpi.html 即可看到新累計數。');
    return { status: 'updated', file: latest.file.getName(), period: data.meta.period };
  } catch (err) {
    console.log('kpicalc auto update failed: ' + err);
    kpiCalcNotify('❌ KPI試算資料自動更新失敗' + (latest ? '（' + latest.file.getName() + '）' : ''),
      '錯誤：' + (err && err.message ? err.message : String(err)) +
      '\n舊資料維持不變。可能是日報欄位排版變動，請把檔案交給 Claude 檢查。');
    return { status: 'error', message: String(err) };
  }
}

// ── 業績重點提醒（附在更新通知信裡）──
// 與 kpi.html「督導試算區」同一套算法：潛力分＝權重×落後幅度、激勵加分門檻、防退警示。
// 與 Codex 的每日戰報互補（那份報現況，這份報「該追什麼」）。
const KPICALC_FLOORS = {
  '5G銷售數': 0.7, 'HBO Max&Disney+&Prime Video銷售數': 0.7, 'Netflix多享組銷售數': 0.7,
  'TTL AQ上線點數': 0.6, 'AQ V+D 999 (含)以上': 0.7, '預付卡開卡面額': 0.7, 'RT上線點數': 0.7,
  '特殊維繫用戶續約數': 0.7, '高高特維用戶續約數': 0.7,
  'RT V+D 999 (含)以上': 0.7, 'RT V+D 1399 (含)以上': 0.7
};
const KPICALC_ANTI = ['自退數', '解約後NP OUT', '解約後NP OUT(督導績)'];

function kpiCalcRound4(x) { return Math.round(x * 10000) / 10000; }

function kpiCalcRate(key, a, t, f) {
  if (!t) return null;
  const x = kpiCalcRound4(a / t * f);
  if (key === '自退數' || key === '解約後NP OUT(督導績)') return Math.max(0, Math.min(2.5, kpiCalcRound4(2 - x)));
  if (key === '解約後NP OUT') {
    const raw = kpiCalcRound4(2 - x);
    return raw >= 1 ? Math.min(2.5, raw) : kpiCalcRound4(0.5 + 0.5 * Math.max(raw, 0));
  }
  return Math.min(2.5, x);
}

function kpiCalcPct(x) { return (x * 100).toFixed(2) + '%'; }

// 前一日各店總達成率快照（存指令碼屬性，用於算「昨日變化」）
// 結構：{ cur:{snapDay, totals:{店名:率}}, prev:{snapDay, totals:{...}} }
// 設計要點：同一天重複發佈時只更新 cur、不動 prev，避免把昨日基準洗掉而讓變化變成 0。
const KPICALC_PREV_KEY = 'KPICALC_PREV_TOTALS';

function kpiCalcReadSnapshots() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(KPICALC_PREV_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return (o && o.cur) ? o : null;
  } catch (e) { return null; }
}

function kpiCalcSaveSnapshots(store, data) {
  const totals = {};
  data.stores.forEach(function(s) { totals[s.name] = s.official || 0; });
  const incoming = { snapDay: data.meta.snapshotDay, totals: totals };
  let next;
  if (!store) next = { cur: incoming, prev: null };
  else if (incoming.snapDay > store.cur.snapDay) next = { cur: incoming, prev: store.cur };
  else if (incoming.snapDay === store.cur.snapDay) next = { cur: incoming, prev: store.prev || null };
  else return;   // 補發舊檔：不動快照
  try {
    PropertiesService.getScriptProperties().setProperty(KPICALC_PREV_KEY, JSON.stringify(next));
  } catch (e) { console.log('kpicalc snapshot save failed: ' + e); }
}

function kpiCalcBrief(data) {
  try {
    const monthDays = data.meta.monthDays, snapDay = data.meta.snapshotDay;
    const left = Math.max(1, monthDays - snapDay);   // 含今天的剩餘天數
    const f = monthDays / snapDay;
    const shortOf = {};
    (data.items || []).forEach(function(it) { shortOf[it.key] = it.short; });

    // 區平均與未達標店
    let sum = 0, below = [];
    data.stores.forEach(function(s) {
      sum += (s.official || 0);
      if ((s.official || 0) < 1) below.push(s.name + ' ' + kpiCalcPct(s.official || 0));
    });
    const avg = kpiCalcRound4(sum / data.stores.length);
    const over = data.stores.length - below.length;

    // 區彙總各項 → 潛力分
    const rows = [];
    (data.items || []).forEach(function(it) {
      let T = 0, A = 0, w = 0, any = false;
      data.stores.forEach(function(s) {
        const d = s.items[it.key]; if (!d) return;
        T += (d.t || 0); A += (d.a || 0); w = d.w; any = true;
      });
      if (!any || !w || T <= 0) return;
      const anti = KPICALC_ANTI.indexOf(it.key) !== -1;
      const r = kpiCalcRate(it.key, A, T, f);
      rows.push({ short: shortOf[it.key] || it.key, w: w, r: r, anti: anti,
                  pot: anti ? 0 : w * Math.max(0, 1 - r), need: Math.max(0, kpiCalcRound4(T - A)) });
    });

    const chase = rows.filter(function(r) { return !r.anti && r.pot > 0; })
                      .sort(function(a, b) { return b.pot - a.pot; }).slice(0, 3);
    const antiBad = rows.filter(function(r) { return r.anti && r.r < 1; });

    // 激勵加分
    const b = { aqA:0, aqT:0, dnHiN:0, dnHiD:0, upN:0, upD:0 };
    data.stores.forEach(function(s) {
      for (const k in b) b[k] += (s.bonus[k] || 0);
    });
    const bonusLines = [];
    if (b.upD > 0) {
      const up = b.upN / b.upD;
      bonusLines.push(up >= 0.30
        ? '・升轉率(<1399) ' + kpiCalcPct(up) + '｜✅ 已達標 +0.75%'
        : '・升轉率(<1399) ' + kpiCalcPct(up) + '｜門檻30%｜還差約 ' +
          Math.ceil((0.30 * b.upD - b.upN) / 0.70) + ' 件 ← 通常最划算');
    }
    if (b.dnHiD > 0) {
      const dn = b.dnHiN / b.dnHiD;
      bonusLines.push(dn <= 0.37
        ? '・降轉率(≧1399) ' + kpiCalcPct(dn) + '｜✅ 已達標 +0.75%'
        : '・降轉率(≧1399) ' + kpiCalcPct(dn) + '｜門檻≦37%｜需再 ' +
          Math.ceil(b.dnHiN / 0.37 - b.dnHiD) + ' 件「≧1399上線且不降轉」');
    }
    if (b.aqT > 0) {
      const aq = Math.min(2.5, kpiCalcRound4(b.aqA / b.aqT * f));
      bonusLines.push(aq >= 1.3
        ? '・AQ件數加分 ' + kpiCalcPct(aq) + '｜✅ 已達標 +1%'
        : '・AQ件數加分 ' + kpiCalcPct(aq) + '｜門檻130%｜還需 ' +
          Math.ceil(1.30 * b.aqT / f - b.aqA) + ' 件');
    }

    let out = '\n━━━━━━━━━━━━━━\n📊 業績重點提醒（月底剩 ' + left + ' 天）\n━━━━━━━━━━━━━━\n';
    out += '區平均總達成率 ' + kpiCalcPct(avg) + '（' + over + '/' + data.stores.length + ' 店破百）\n';
    out += below.length ? '\n🔴 未達100%：' + below.join('、') + '\n' : '\n🟢 全店破百\n';

    if (chase.length) {
      out += '\n🎯 最該追（潛力分＝權重×落後幅度）\n';
      chase.forEach(function(r, i) {
        out += (i + 1) + '. ' + r.short + ' ' + kpiCalcPct(r.r) + ' → 潛力 +' + kpiCalcPct(r.pot) +
               '｜月底還需 ' + Math.round(r.need) + '（日均 ' + (r.need / left).toFixed(1) + '）\n';
      });
    }
    if (bonusLines.length) out += '\n💰 激勵加分（共 +2.5% 空間，不吃權重）\n' + bonusLines.join('\n') + '\n';
    if (antiBad.length) {
      out += '\n⚠️ 防退未達標：' + antiBad.map(function(r) { return r.short + ' ' + kpiCalcPct(r.r); }).join('、') +
             '\n（衝量時注意退件，退一件是雙重損失）\n';
    }

    // ── 昨日變化 + 各店一行摘要 ──
    const snaps = kpiCalcReadSnapshots();
    const base = snaps && snaps.prev ? snaps.prev :
                 (snaps && snaps.cur && snaps.cur.snapDay < snapDay ? snaps.cur : null);
    const storeLines = [];
    const dropped = [];
    data.stores.slice().sort(function(a, b) { return (a.official || 0) - (b.official || 0); })
      .forEach(function(s) {
        const off = s.official || 0;
        const flag = off < 1 ? '🔴' : (off < 1.05 ? '🟡' : '🟢');
        // 昨日變化
        let dTxt = '';
        if (base && base.totals && base.totals[s.name] !== undefined) {
          const d = (off - base.totals[s.name]) * 100;
          dTxt = (d >= 0 ? ' ▲' : ' ▼') + Math.abs(d).toFixed(2);
          if (d <= -1.0) dropped.push(s.name + ' ' + d.toFixed(2));
        }
        // 該店潛力最高項
        let best = null;
        (data.items || []).forEach(function(it) {
          const d = s.items[it.key];
          if (!d || KPICALC_ANTI.indexOf(it.key) !== -1 || !d.w || (d.t || 0) <= 0) return;
          const r = kpiCalcRate(it.key, d.a || 0, d.t || 0, f);
          const pot = d.w * Math.max(0, 1 - r);
          if (pot > 0 && (!best || pot > best.pot)) {
            best = { pot: pot, short: shortOf[it.key] || it.key, r: r,
                     need: Math.max(0, kpiCalcRound4((d.t || 0) - (d.a || 0))) };
          }
        });
        const bTxt = best ? '｜追 ' + best.short + ' ' + Math.round(best.r * 100) + '%(缺' + Math.round(best.need) + ')' : '｜各項已達標';
        storeLines.push(flag + ' ' + s.name + ' ' + kpiCalcPct(off) + dTxt + bTxt);
      });

    if (dropped.length) {
      out += '\n📉 昨日掉分（≧1pp）：' + dropped.join('、') + '\n（單日大幅下滑通常代表前一日幾乎沒進單，連兩天要注意）\n';
    }
    out += '\n🏪 各店現況' + (base ? '（▲▼＝與資料第 ' + base.snapDay + ' 天相比）' : '（首次執行，尚無昨日基準）') + '\n' +
           storeLines.join('\n') + '\n';

    out += '\n※ 完整分析與各店分配請開 kpi.html → 督導試算區\n';
    kpiCalcSaveSnapshots(snaps, data);   // 產生完才更新快照
    return out;
  } catch (e) {
    console.log('kpiCalcBrief failed: ' + e);
    return '\n（業績重點提醒產生失敗：' + e + '）\n';   // 不讓提醒失敗影響更新通知
  }
}

// xlsx → 暫存 Google 試算表 → 解析兩張明細表 → 刪暫存
function kpiCalcParseReport(xlsxFile) {
  const converted = Drive.Files.create(
    { name: 'kpicalc-tmp-' + xlsxFile.getName(), mimeType: 'application/vnd.google-apps.spreadsheet' },
    xlsxFile.getBlob()
  );
  try {
    const ss = SpreadsheetApp.openById(converted.id);
    const storeSheet = ss.getSheetByName('上線數KPI_店點達成率_明細');
    if (!storeSheet) throw new Error('找不到「上線數KPI_店點達成率_明細」工作表');

    // 個人資料有兩個來源。優先用 _明細；2026-07-28 起日報有時不含這張表，
    // 此時回退到 _個人達成率_店點（依門市分群的版面）。兩張表在 0727 逐項
    // 3000 格完全一致，差別只在 _店點 沒有「職稱」與店代碼欄，需另外補。
    let personSheet = ss.getSheetByName('上線數KPI_個人達成率_明細');
    let personLayout = 'detail';
    if (!personSheet) {
      personSheet = ss.getSheetByName('上線數KPI_個人達成率_店點');
      personLayout = 'byStore';
    }
    if (!personSheet) throw new Error('找不到個人達成率工作表（_明細 與 _店點 都不存在）');

    const sv = storeSheet.getRange(1, 1, Math.min(60, storeSheet.getLastRow()), 236).getValues();
    const pv = personSheet.getRange(1, 1,
      Math.min(personLayout === 'detail' ? 120 : 160, personSheet.getLastRow()),
      Math.min(236, personSheet.getLastColumn())).getValues();

    const meta = kpiCalcParseMeta(sv, xlsxFile.getName());
    const aggregateBands = kpiCalcBands(sv[7], 8); // 北一二B整體：標題列 8、資料列 10
    const sBands = kpiCalcBands(sv[12], 8);   // 店點表：標題列 13、I 欄(9)起
    // 個人表：_明細 標題列 8、K 欄(11)起且固定 4 欄一段；
    // _店點 標題列 9／子標題列 10、D 欄(4)起，且合併儲存格會讓欄寬不固定，改逐段偵測
    const pBands = personLayout === 'detail'
      ? kpiCalcBands(pv[7], 10)
      : kpiCalcBandsPairs(pv[8], pv[9], 2);

    // KPI 頁面的達成率直接沿用正式報表「進度達成率」，不由前端以實績／目標重算。
    const aggregateRates = {};
    KPICALC_ITEMS.forEach(function(it) {
      const c = aggregateBands[it[0]];
      aggregateRates[it[0]] = c === undefined ? null : kpiCalcReportRate(sv[9][c + 3]);
    });

    const stores = [];
    for (let r = 14; r < sv.length; r++) {
      const code = String(sv[r][3] || '').trim();
      if (!/^DNB/i.test(code)) { if (stores.length) break; else continue; }
      const items = {};
      KPICALC_ITEMS.forEach(function(it) {
        const c = sBands[it[0]];
        if (c === undefined) throw new Error('店點表缺少欄位：' + it[0]);
        items[it[0]] = {
          t: kpiCalcNum(sv[r][c + 1]), a: kpiCalcNum(sv[r][c]), w: kpiCalcPct(sv[r][c + 2]),
          reportRate: kpiCalcReportRate(sv[r][c + 3])
        };
      });
      const bx = {};
      const aq = sBands['TTL AQ上線數_加分項'];
      bx.aqA = aq === undefined ? 0 : kpiCalcNum(sv[r][aq]);
      bx.aqT = aq === undefined ? 0 : kpiCalcNum(sv[r][aq + 1]);
      bx.dnHiN = kpiCalcBandVal(sBands, sv[r], 'RT降轉率_降轉數(前約 V+D 1399(含)以上)');
      bx.dnHiD = kpiCalcBandVal(sBands, sv[r], 'RT降轉率_上線件數(前約 V+D 1399(含)以上)');
      bx.upN = kpiCalcBandVal(sBands, sv[r], 'RT升轉率_升轉數(前約 V+D 1399以下)');
      bx.upD = kpiCalcBandVal(sBands, sv[r], 'RT升轉率_上線件數(前約 V+D 1399以下)');
      stores.push({ code: code, name: String(sv[r][4] || ''), official: kpiCalcNum(sv[r][7]), items: items, bonus: bx });
    }

    const persons = [];
    if (personLayout === 'detail') {
      for (let r = 9; r < pv.length; r++) {
        const code = String(pv[r][2] || '').trim();
        if (!/^DNB/i.test(code)) { if (persons.length) break; else continue; }
        const items = {};
        KPICALC_ITEMS.forEach(function(it) {
          const c = pBands[it[0]];
          if (c === undefined) throw new Error('個人表缺少欄位：' + it[0]);
          items[it[0]] = {
            t: kpiCalcNum(pv[r][c + 1]), a: kpiCalcNum(pv[r][c]), w: kpiCalcPct(pv[r][c + 2]),
            reportRate: kpiCalcReportRate(pv[r][c + 3])
          };
        });
        persons.push({ store: code, role: String(pv[r][4] || ''), pname: String(pv[r][6] || ''),
                       official: kpiCalcNum(pv[r][9]), items: items });
      }
    } else {
      // _店點 版面：每間門市一段，段首是「…／門市名」，段尾是「合計」列
      const codeByName = {};
      stores.forEach(function(s) { codeByName[s.name] = s.code; });
      const roleMap = kpiCalcPrevRoles();   // 職稱沿用上一份已發佈資料
      const noRole = [];
      let curStore = null;
      for (let r = 0; r < pv.length; r++) {
        const c0 = String(pv[r][0] || '').trim();
        const c1 = String(pv[r][1] || '').trim();
        if (!c1 && c0.indexOf('/') >= 0) {
          const seg = c0.split('/').pop().trim();
          if (codeByName[seg]) { curStore = seg; }
          continue;
        }
        if (!c0 || !c1 || c1 === '合計') continue;
        const code = codeByName[curStore];
        if (!code) throw new Error('個人表門市名對不到代碼：' + curStore);
        const items = {};
        KPICALC_ITEMS.forEach(function(it) {
          const b = pBands[it[0]];
          if (!b) throw new Error('個人表缺少欄位：' + it[0]);
          items[it[0]] = {
            t: kpiCalcNum(pv[r][b.t]), a: kpiCalcNum(pv[r][b.a]), w: kpiCalcPct(pv[r][b.w]),
            reportRate: b.r === undefined ? null : kpiCalcReportRate(pv[r][b.r])
          };
        });
        const role = roleMap[code + '|' + c1] || '';
        if (!role) noRole.push(curStore + '/' + c1);
        persons.push({ store: code, role: role, pname: c1, official: kpiCalcNum(pv[r][2]), items: items });
      }
      if (noRole.length) console.log('kpicalc 查不到職稱（新進或改名）：' + noRole.join('、'));
    }

    if (stores.length < 5 || persons.length < 10) {
      throw new Error('解析結果不合理（店 ' + stores.length + '、人 ' + persons.length + '），疑似格式變動');
    }
    return {
      meta: meta,
      items: KPICALC_ITEMS.map(function(it) { return { key: it[0], short: it[1], step: it[2] }; }),
      aggregateRates: aggregateRates,
      stores: stores,
      persons: persons
    };
  } finally {
    try { DriveApp.getFileById(converted.id).setTrashed(true); } catch (e) { console.log('kpicalc tmp cleanup failed: ' + e); }
  }
}

function kpiCalcBands(headerRow, startCol0) {
  const bands = {};
  for (let c = startCol0; c <= 233; c += 4) {
    const name = String(headerRow[c] || '').trim();
    if (name) bands[name] = c;
  }
  return bands;
}

// 名稱列＋子標題列（實際數／目標數／權重）成對偵測，容忍合併儲存格造成的欄寬不一
function kpiCalcBandsPairs(nameRow, subRow, startCol0) {
  const starts = [];
  for (let c = startCol0; c < nameRow.length; c++) {
    if (String(nameRow[c] || '').trim()) starts.push(c);
  }
  const bands = {};
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i];
    const to = (i + 1 < starts.length) ? starts[i + 1] : nameRow.length;
    const name = String(nameRow[from]).replace(/\n/g, '').trim();
    const b = {};
    for (let c = from; c < to; c++) {
      const s = String(subRow[c] || '').replace(/\n/g, '').trim();
      if (s === '實際數') b.a = c;
      else if (s === '目標數') b.t = c;
      else if (s === '權重') b.w = c;
      else if (s === '達成率' || s === '進度達成率') b.r = c;
    }
    if (b.a !== undefined && b.t !== undefined && b.w !== undefined) bands[name] = b;
  }
  return bands;
}

// 讀最近一份已發佈的 KPI 資料，取出「店代碼|姓名 → 職稱」對照
function kpiCalcPrevRoles() {
  const map = {};
  try {
    const f = kpiCalcLatestDataFile();
    if (!f) return map;
    const j = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
    (j.persons || []).forEach(function(p) { map[p.store + '|' + p.pname] = p.role || ''; });
  } catch (e) {
    console.log('kpiCalcPrevRoles failed: ' + e);
  }
  return map;
}

function kpiCalcBandVal(bands, row, name) {
  const c = bands[name];
  return c === undefined ? 0 : kpiCalcNum(row[c]);
}

function kpiCalcNum(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function kpiCalcPct(v) {
  if (v === '' || v === null || v === undefined) return 0;
  if (typeof v === 'number') return Math.round(v * 1e6) / 1e6;
  const s = String(v).trim();
  const n = Number(s.replace(/[%,]/g, ''));
  if (isNaN(n)) return 0;
  return /%/.test(s) ? Math.round(n / 100 * 1e6) / 1e6 : Math.round(n * 1e6) / 1e6;
}

function kpiCalcReportRate(v) {
  if (v === '' || v === null || v === undefined) return null;
  const raw = String(v).trim().replace(/[%,]/g, '');
  if (raw === '' || isNaN(Number(raw))) return null;
  return kpiCalcPct(v);
}

function kpiCalcParseMeta(sv, fileName) {
  for (let r = 0; r < Math.min(10, sv.length); r++) {
    for (let c = 0; c < 12; c++) {
      const m = String(sv[r][c] || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})\s*~\s*(\d{1,2})\/(\d{1,2})/);
      if (m) {
        const year = Number(m[1]), month = Number(m[2]), endDay = Number(m[5]);
        return {
          period: m[0],
          snapshotDay: endDay,
          monthDays: new Date(year, month, 0).getDate(),
          month: year + '-' + ('0' + month).slice(-2),
          sourceFile: fileName
        };
      }
    }
  }
  throw new Error('找不到資料期間（例：2026/07/01 ~ 07/19）');
}

// 每日自動化以管理者密碼同步遮罩後名冊。既有裝置綁定不會被覆蓋。
function privateDashboardSyncRoster(payload) {
  privateDashboardAdminAuthorized(payload);
  const members = Array.isArray(payload.members) ? payload.members : [];
  const sheet = privateDashboardSheet(PRIVATE_DASHBOARD_USERS_SHEET, PRIVATE_DASHBOARD_USERS_HEADERS);
  const existing = privateDashboardRows(sheet, PRIVATE_DASHBOARD_USERS_HEADERS);
  const byId = {};
  existing.forEach(function(item) { byId[item.employee_id] = item; });
  let synced = 0;
  members.forEach(function(member) {
    const employeeId = privateDashboardCleanEmployeeId(member.employeeId);
    const item = byId[employeeId] || {
      employee_id: employeeId, device_id: '', device_bound_at: '', last_login_at: ''
    };
    item.masked_name = String(member.maskedName || '');
    item.store = String(member.store || '');
    item.role = String(member.role || '');
    item.status = member.status === 'inactive' ? 'inactive' : 'active';
    if (item._row) privateDashboardWriteObject(sheet, PRIVATE_DASHBOARD_USERS_HEADERS, item._row, item);
    else privateDashboardWriteObject(sheet, PRIVATE_DASHBOARD_USERS_HEADERS, sheet.getLastRow() + 1, item);
    synced += 1;
  });
  return { synced: synced };
}

function privateDashboardCanonicalKpiSource_(value) {
  const raw = String(value || '').replace(/\\/g, '/').split('/').pop();
  const staged = raw.match(/^report-upload-temp-[a-f0-9]{32,64}-(\d{4}\.xlsx)$/i);
  return staged ? staged[1] : raw;
}

function privateDashboardValidateKpiComponent_(kpiBattle, kpicalc) {
  if (!kpiBattle || typeof kpiBattle !== 'object' || Array.isArray(kpiBattle)) {
    throw new Error('KPI component 格式不完整');
  }
  if (!kpicalc || !kpicalc.meta) throw new Error('protected KPI 格式不完整');
  const dataDate = reportUploadKpiDate_(kpicalc.meta);
  const sourceFile = privateDashboardCanonicalKpiSource_(kpicalc.meta.sourceFile);
  if (!dataDate || !sourceFile) throw new Error('protected KPI 日期或來源無效');
  ['report_date', 'data_as_of_date', 'source_as_of_date'].forEach(function(field) {
    if (String(kpiBattle[field] || '') !== dataDate) {
      throw new Error('KPI component ' + field + ' 與 protected KPI 不一致');
    }
  });
  if (privateDashboardCanonicalKpiSource_(kpiBattle.source_file) !== sourceFile) {
    throw new Error('KPI component source_file 與 protected KPI 不一致');
  }
  if (!Array.isArray(kpicalc.stores) || kpicalc.stores.length !== 9 ||
      !Array.isArray(kpicalc.persons) || kpicalc.persons.length !== 40 ||
      !Array.isArray(kpicalc.items) || kpicalc.items.length !== 25) {
    throw new Error('protected KPI 必須為 9 店／40 人／25 KPI items');
  }
  if (!Array.isArray(kpiBattle.stores) || kpiBattle.stores.length !== 9 ||
      !Array.isArray(kpiBattle.personal) || kpiBattle.personal.length !== 40) {
    throw new Error('KPI supplement 必須為九店與 40 人');
  }
  const rows = [kpiBattle.aggregate].concat(kpiBattle.stores);
  const required = ['overall_kpi', 'company_rank', 'overall_kpi_dod', 'company_rank_dod', 'addon_score'];
  rows.forEach(function(row) {
    required.forEach(function(field) {
      if (!row || row[field] === '' || row[field] === null || row[field] === undefined || !isFinite(Number(row[field]))) {
        throw new Error('KPI supplement 欄位缺漏：' + field);
      }
    });
  });
  const runId = String(kpicalc.meta.processingRunId || kpiBattle.kpi_run_id || '').trim();
  if (!runId || (kpiBattle.kpi_run_id && String(kpiBattle.kpi_run_id) !== runId)) {
    throw new Error('KPI component run_id 與 protected KPI 不一致');
  }
  return { dataDate: dataDate, sourceFile: sourceFile, runId: runId };
}

// KPI 與台獎採 component-level 發布：只替換通過 protected KPI 對齊驗證的
// kpiBattle；awardsBattle payload 原樣保留。container 的 publishedAt 只代表
// 檔案寫入時間，consumer 必須繼續使用各 component 自己的日期與來源 gate。
function privateDashboardPublishKpiComponent(payload) {
  privateDashboardAdminAuthorized(payload);
  const encoded = String(payload.kpiBattleBase64 || '');
  if (!encoded || encoded.length > 8 * 1024 * 1024) throw new Error('KPI component 缺少或過大');
  const decoded = Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString('UTF-8');
  const incomingKpi = JSON.parse(decoded);
  const kpiFile = kpiCalcLatestDataFile();
  if (!kpiFile) throw new Error('protected KPI 尚未發佈');
  const kpicalc = JSON.parse(kpiFile.getBlob().getDataAsString('UTF-8'));
  const identity = privateDashboardValidateKpiComponent_(incomingKpi, kpicalc);
  const folder = privateDashboardFolder();
  const files = folder.getFilesByName(PRIVATE_DASHBOARD_FILE);
  if (!files.hasNext()) throw new Error('既有私有戰情快照不存在');
  const file = files.next();
  const currentText = file.getBlob().getDataAsString('UTF-8');
  const current = JSON.parse(currentText);
  if (!current || !current.kpiBattle || !current.awardsBattle) throw new Error('既有私有戰情快照格式不完整');
  const awardsTextBefore = JSON.stringify(current.awardsBattle);
  const publishedAt = privateDashboardNow();
  current.kpiBattle = incomingKpi;
  current.publishedAt = publishedAt;
  current.components = current.components && typeof current.components === 'object' ? current.components : {};
  current.components.kpi = {
    status: 'fresh',
    data_as_of_date: identity.dataDate,
    source_file: identity.sourceFile,
    run_id: identity.runId,
    published_at: publishedAt
  };
  const awardsDate = String(current.awardsBattle.data_as_of_date || current.awardsBattle.report_date || '');
  current.components.awards = {
    status: awardsDate === identity.dataDate ? 'fresh' : 'blocked',
    data_as_of_date: awardsDate,
    reason: awardsDate === identity.dataDate ? '' : 'upstream-source-not-updated'
  };
  const text = JSON.stringify(current);
  file.setContent(text);
  const stored = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if (JSON.stringify(stored.awardsBattle) !== awardsTextBefore) {
    throw new Error('awardsBattle payload 在 KPI component 發布時遭修改');
  }
  reportVersionRecord_('kpi', {
    dataDate: identity.dataDate, source: 'external-publish',
    fileHash: reportVersionHash_(JSON.stringify(incomingKpi)), fileName: identity.sourceFile,
    operator: 'external-component-publish'
  }, 'success', { rule: 'component-record-only' });
  return {
    publishedAt: publishedAt,
    reportDate: identity.dataDate,
    sourceFile: identity.sourceFile,
    runId: identity.runId,
    awardsStatus: current.components.awards.status,
    awardsReportDate: awardsDate,
    awardsPayloadHash: reportVersionHash_(awardsTextBefore),
    fileId: file.getId(),
    lastUpdated: Utilities.formatDate(file.getLastUpdated(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX")
  };
}

function privateDashboardValidateAwardsComponent_(awardsBattle, kpiBattle) {
  if (!awardsBattle || typeof awardsBattle !== 'object' || Array.isArray(awardsBattle)) {
    throw new Error('awards component 格式不完整');
  }
  if (!kpiBattle || typeof kpiBattle !== 'object' || Array.isArray(kpiBattle)) {
    throw new Error('既有 KPI component 格式不完整');
  }
  const cutoff = String(kpiBattle.data_as_of_date || kpiBattle.source_as_of_date || kpiBattle.report_date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) throw new Error('既有 KPI cutoff 無效');
  ['report_date', 'data_as_of_date'].forEach(function(field) {
    if (String(awardsBattle[field] || '') !== cutoff) {
      throw new Error('awards component ' + field + ' 與 KPI cutoff 不一致');
    }
  });
  if (Number(awardsBattle.phone_items) !== 13 || Number(awardsBattle.store_rows) !== 10 ||
      !Array.isArray(awardsBattle.stores) || awardsBattle.stores.length !== 9 ||
      !awardsBattle.overall || !Array.isArray(awardsBattle.overall.items) || awardsBattle.overall.items.length !== 13) {
    throw new Error('awards component 必須為 13 機款／九店／10 列');
  }
  const expectedNames = {
    store:'01-08-03-(密)直營_手機競賽日報_店點達成率、排名及獎金.xlsx',
    person:'01-08-04-(密)直營_手機競賽日報_個人達成率、排名及獎金.xlsx'
  };
  let runId = '';
  let provider = '';
  Object.keys(expectedNames).forEach(function(kind) {
    const source = (awardsBattle.source_files || {})[kind];
    const sourceProvider = String(source && source.provider || '');
    if (!source || ['onedrive-cloud', 'google-drive-cloud'].indexOf(sourceProvider) < 0 ||
        String(source.basename || source.canonical_basename || '') !== expectedNames[kind] ||
        !String(source.driveItemId || '') ||
        (sourceProvider === 'onedrive-cloud' && !String(source.eTag || '')) ||
        (sourceProvider === 'google-drive-cloud' &&
          String(source.googleDriveFileId || source.driveItemId || '') !== String(source.driveItemId || '')) ||
        isNaN(Date.parse(String(source.lastModifiedDateTime || ''))) ||
        !isFinite(Number(source.size)) || Number(source.size) <= 0 ||
        !/^[a-f0-9]{64}$/i.test(String(source.sha256 || '')) ||
        String(source.source_data_date || '') !== cutoff || !String(source.run_id || '')) {
      throw new Error('awards ' + kind + ' cloud source identity 不完整');
    }
    if (provider && provider !== sourceProvider) throw new Error('awards source pair provider 不一致');
    provider = sourceProvider;
    if (runId && runId !== String(source.run_id)) throw new Error('awards source pair run_id 不一致');
    runId = String(source.run_id);
  });
  return { cutoff:cutoff, runId:runId, provider:provider };
}

// Awards component-only publish: replace awardsBattle after cloud identity,
// pair cutoff and shape validation. KPI payload and its component metadata are
// preserved byte-for-byte; top-level publishedAt is only the container write time.
function privateDashboardPublishAwardsComponent(payload) {
  privateDashboardAdminAuthorized(payload);
  const encoded = String(payload.awardsBattleBase64 || '');
  if (!encoded || encoded.length > 8 * 1024 * 1024) throw new Error('awards component 缺少或過大');
  const decoded = Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString('UTF-8');
  const incomingAwards = JSON.parse(decoded);
  const folder = privateDashboardFolder();
  const files = folder.getFilesByName(PRIVATE_DASHBOARD_FILE);
  if (!files.hasNext()) throw new Error('既有私有戰情快照不存在');
  const file = files.next();
  const currentText = file.getBlob().getDataAsString('UTF-8');
  const current = JSON.parse(currentText);
  if (!current || !current.kpiBattle || !current.awardsBattle) throw new Error('既有私有戰情快照格式不完整');
  const identity = privateDashboardValidateAwardsComponent_(incomingAwards, current.kpiBattle);
  const kpiTextBefore = JSON.stringify(current.kpiBattle);
  const kpiComponentBefore = JSON.stringify((current.components || {}).kpi || null);
  const publishedAt = privateDashboardNow();
  current.awardsBattle = incomingAwards;
  current.publishedAt = publishedAt;
  current.components = current.components && typeof current.components === 'object' ? current.components : {};
  current.components.awards = {
    status:'fresh', data_as_of_date:identity.cutoff, run_id:identity.runId,
    provider:identity.provider, published_at:publishedAt, reason:''
  };
  try {
    file.setContent(JSON.stringify(current));
    const stored = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
    if (JSON.stringify(stored.kpiBattle) !== kpiTextBefore ||
        JSON.stringify((stored.components || {}).kpi || null) !== kpiComponentBefore) {
      throw new Error('KPI component 在 awards component 發布時遭修改');
    }
  } catch (error) {
    file.setContent(currentText);
    throw error;
  }
  reportVersionRecord_('awards', {
    dataDate:identity.cutoff, source:identity.provider,
    fileHash:reportVersionHash_(JSON.stringify(incomingAwards)), fileName:'awardsBattle',
    operator:'external-component-publish'
  }, 'success', { rule:'component-record-only' });
  return {
    publishedAt:publishedAt, reportDate:identity.cutoff, runId:identity.runId,
    kpiPayloadHash:reportVersionHash_(kpiTextBefore),
    awardsPayloadHash:reportVersionHash_(JSON.stringify(incomingAwards)),
    fileId:file.getId(),
    lastUpdated:Utilities.formatDate(file.getLastUpdated(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX")
  };
}

// 每日自動化在寄件成功後呼叫。快照僅存於私有 Drive，不經 GitHub。
function privateDashboardPublish(payload) {
  privateDashboardAdminAuthorized(payload);
  const encoded = String(payload.snapshotBase64 || '');
  if (!encoded || encoded.length > 8 * 1024 * 1024) throw new Error('私有戰情快照缺少或過大');
  const decoded = Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString('UTF-8');
  const snapshot = JSON.parse(decoded);
  if (!snapshot || !snapshot.kpiBattle || !snapshot.awardsBattle) throw new Error('私有戰情快照格式不完整');
  const publishedAt = privateDashboardNow();
  snapshot.publishedAt = publishedAt;
  const text = JSON.stringify(snapshot);
  const folder = privateDashboardFolder();
  const files = folder.getFilesByName(PRIVATE_DASHBOARD_FILE);
  let file;
  if (files.hasNext()) {
    file = files.next();
    file.setContent(text);
  } else {
    file = folder.createFile(Utilities.newBlob(text, 'application/json', PRIVATE_DASHBOARD_FILE));
  }
  // 只登記版本、不擋。privateDashboardPublish 是 Codex 每日自動化的入口，
  // 這裡若改成硬擋，外部管線會在無預警下失敗——要不要升級為硬擋是 Liam 的決定，見 SPEC §4。
  reportVersionRecord_('award', {
    dataDate: String(snapshot.kpiBattle.report_date || ''), source: 'external-publish',
    fileHash: reportVersionHash_(text), fileName: PRIVATE_DASHBOARD_FILE, operator: 'external'
  }, 'success', { rule: 'record-only' });
  return {
    publishedAt: publishedAt,
    reportDate: snapshot.kpiBattle.report_date || '',
    fileId: file.getId(),
    lastUpdated: Utilities.formatDate(
      file.getLastUpdated(),
      'Asia/Taipei',
      "yyyy-MM-dd'T'HH:mm:ssXXX"
    )
  };
}

// ════════════════════════════════════
// 自動檢查未回報 + Email 通知
//
// 啟用方式（只需做一次）：
//   1. 把本檔最新內容貼進 GAS 編輯器並存檔
//   2. 上方函式選單選「setupTriggers」→ 執行（會跳出授權畫面，同意即可）
//   3. 之後每天 16:20、21:20（台北時間，±15分）自動檢查並寄信
//
// 注意：時間觸發器執行的是「編輯器裡最新存檔的程式碼」，
// 這部分【不需要】重新部署 Web App；只有 doGet 相關改動才要重新部署。
// 想立即測試：函式選單選「testNotify」執行，會用目前時段寄一封測試信。
// ════════════════════════════════════

// 在 Apps Script「專案設定 > 指令碼屬性」設定 NOTIFY_EMAIL，避免收件地址進入公開原始碼。
const NOTIFY_EMAIL = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || 'CHANGE_ME@example.invalid';
const STORES = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['check16', 'check21'].indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('check16').timeBased().everyDays(1)
    .atHour(16).nearMinute(20).inTimezone('Asia/Taipei').create();
  ScriptApp.newTrigger('check21').timeBased().everyDays(1)
    .atHour(21).nearMinute(20).inTimezone('Asia/Taipei').create();
}

function check16() { checkSegAndNotify(16); }
function check21() { checkSegAndNotify(21); }

// 手動測試用：依目前台北時間挑最近的時段檢查一次
function testNotify() {
  const hour = Number(Utilities.formatDate(new Date(), 'Asia/Taipei', 'H'));
  checkSegAndNotify(hour >= 19 ? 21 : 16);
}

function checkSegAndNotify(seg) {
  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  const data = readData(today, seg);
  const missing = STORES.filter(s => !data[s]);

  if (missing.length > 0) {
    const filled = STORES.filter(s => !!data[s]);
    const subject = '⚠️ 北一二B ' + today + ' ' + seg + ':00 尚有 ' + missing.length + ' 間未回報';
    const body =
      '📋 ' + today + ' ' + seg + ':00 時段回報檢查\n\n' +
      '🔴 未回報（' + missing.length + ' 間）：\n' +
      missing.map(s => '　・' + s).join('\n') + '\n\n' +
      '✅ 已回報（' + filled.length + ' 間）：' + (filled.join('、') || '無') + '\n\n' +
      '請儘速跟進未填門市。';
    MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
    return;
  }

  // ── 全數完成：報平安 + A999/好速/R1399 三項進度 ──
  const items = [
    { key: 'aq999',  label: 'A999(筆)' },
    { key: 'haosu',  label: '好速(點)' },
    { key: 'rt1399', label: 'R1399(筆)' },
  ];
  const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const rows = STORES.map(s => {
    const vals = items.map(it => num(data[s][it.key]));
    return { store: s, vals: vals, total: vals[0] + vals[1] + vals[2] };
  });
  const totals = items.map((it, i) => rows.reduce((a, r) => a + r.vals[i], 0));
  const sorted = rows.slice().sort((a, b) => b.total - a.total);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const zeroStores = rows.filter(r => r.vals.some(v => v === 0));

  const fmtN = n => n % 1 === 0 ? String(n) : n.toFixed(2);
  const td = 'padding:6px 12px;border:1px solid #e5e7eb;text-align:center;';
  const tableRows = rows.map(r => {
    const mark = r.store === best.store ? ' 🏆' : (r.store === worst.store ? ' 📢' : '');
    const cells = r.vals.map(v =>
      '<td style="' + td + (v === 0 ? 'color:#ef4444;font-weight:700;' : '') + '">' + fmtN(v) + '</td>'
    ).join('');
    return '<tr><td style="' + td + 'text-align:left;font-weight:700;">' + r.store + mark + '</td>' +
           cells + '<td style="' + td + '">' + fmtN(r.total) + '</td></tr>';
  }).join('');
  const totalRow =
    '<tr style="background:#fff7ed;font-weight:800;"><td style="' + td + 'text-align:left;">全區合計</td>' +
    totals.map(t => '<td style="' + td + '">' + fmtN(t) + '</td>').join('') +
    '<td style="' + td + '">' + fmtN(totals[0] + totals[1] + totals[2]) + '</td></tr>';

  const htmlBody =
    '<div style="font-family:sans-serif;font-size:14px;color:#1f2937;">' +
    '<h2 style="color:#16a34a;">✅ ' + today + ' ' + seg + ':00 全數回報完成！</h2>' +
    '<p>🏆 表現最佳：<strong>' + best.store + '</strong>（三項合計 ' + fmtN(best.total) + '）<br>' +
    '📢 需要加油：<strong>' + worst.store + '</strong>（三項合計 ' + fmtN(worst.total) + '）</p>' +
    (zeroStores.length
      ? '<p style="color:#ef4444;">🔴 有項目掛 0 的門市：' + zeroStores.map(r => r.store).join('、') + '</p>'
      : '<p style="color:#16a34a;">🌟 所有門市三項皆有開出！</p>') +
    '<table style="border-collapse:collapse;font-size:13px;">' +
    '<tr style="background:#f9fafb;font-weight:700;"><td style="' + td + '">店點</td>' +
    items.map(it => '<td style="' + td + '">' + it.label + '</td>').join('') +
    '<td style="' + td + '">合計</td></tr>' +
    tableRows + totalRow +
    '</table></div>';

  const subject = '✅ 北一二B ' + today + ' ' + seg + ':00 全數回報完成｜A999 ' +
    fmtN(totals[0]) + '筆・好速 ' + fmtN(totals[1]) + '點・R1399 ' + fmtN(totals[2]) + '筆';
  MailApp.sendEmail(NOTIFY_EMAIL, subject, '請用支援 HTML 的信箱檢視此郵件。', { htmlBody: htmlBody });
}

// ════════════════════════════════════════════════════════════════
// 戰報快速更新（report-upload.html）— M+／OneDrive 無法使用時的備援入口
//
// 設計原則（Liam 2026-07-31 指示）：
//   1. 不重寫原網站、不改既有 Google Sheet 結構。
//   2. 不破壞既有自動化：kpiCalcAutoUpdate() 完全沒有被改動。
//   3. 網站上傳與既有自動化「共用同一套解析程式」：KPI 一律呼叫
//      kpiCalcParseReport()，本節不含任何第二套 KPI 解析邏輯。
//   4. KPI 與台獎完全分開：各自獨立的 preview／commit／rollback 呼叫，
//      任一方失敗不影響另一方。
//   5. 驗證失敗不覆蓋正式資料：preview 只寫暫存，commit 前先備份正式檔。
//
// 啟用前置（與私有戰情共用，不需另外設定）：
//   - 指令碼屬性 DASHBOARD_PRIVATE_FOLDER_ID／DASHBOARD_ADMIN_SECRET
//   - 指令碼屬性 REPORT_UPLOAD_ALLOWED_EMPLOYEES（逗號分隔員編白名單；
//     未設定時退回只允許 DASHBOARD_TRUSTED_EMPLOYEE_ID）
//   - 左側「服務 +」需已加入 Drive API（kpiCalcParseReport 需要）
//   - 改動了 doPost，必須「部署 → 管理部署作業 → ✏️ → 新版本 → 部署」
// ════════════════════════════════════════════════════════════════

// ── 部署隔離（2026-07-31 Liam 指示）──────────────────────────
// 每日回報 Deployment 固定停在第 15 版（舊碼，本來就沒有上傳路由）；
// 快速上傳改走「獨立的新 Web App Deployment」。兩個 Deployment 共用同一份專案，
// 但新 Deployment 設定指令碼屬性 REPORT_UPLOAD_DEPLOYMENT_URL = 它自己的 /exec URL 後，
// 只服務固定的上傳與 preview 路由——其餘 read/write/巡店/戰情一律拒絕，
// 確保上傳功能的部署動作完全影響不到每日回報與其他系統。
const REPORT_UPLOAD_ALLOWED_ACTIONS = [
  'report_upload_preview', 'report_upload_commit', 'report_upload_log', 'report_upload_rollback',
  // 雙檔台獎僅供解析與預覽，沒有任何 commit／publish 對應 action。
  'report_award_pair_preview'
];

// 上傳頁與上傳 API 同屬新 Deployment，使用 google.script.run 直接呼叫固定包裝函式。
// 不從 GitHub Pages fetch，不需要 CORS／preflight，也不把任何設定值注入 HTML。
function reportUploadHtmlService_() {
  return HtmlService.createHtmlOutputFromFile('ReportUpload')
    .setTitle('北一二B 戰報快速更新');
}

function report_upload_preview(payload) { return reportUploadPreview(payload); }
function report_upload_commit(payload) { return reportUploadCommit(payload); }
function report_upload_log(payload) { return reportUploadLog(payload); }
function report_upload_rollback(payload) { return reportUploadRollback(payload); }
function report_award_pair_preview(payload) { return reportAwardPairPreview(payload); }

function reportUploadIsUploadDeployment_() {
  try {
    const expected = String(PropertiesService.getScriptProperties()
      .getProperty('REPORT_UPLOAD_DEPLOYMENT_URL') || '').trim();
    if (!expected) return false;   // 未設定＝未啟用隔離，主部署行為完全不變
    const current = String(ScriptApp.getService().getUrl() || '').trim();
    return !!current && current === expected;
  } catch (e) {
    return false;   // 時間觸發器等非 Web App 情境沒有 getUrl()，一律視為非上傳部署
  }
}

const REPORT_UPLOAD_LOG_SHEET = 'ReportUploadLog';
const REPORT_UPLOAD_LOG_HEADERS = [
  'log_id', 'kind', 'employee_id', 'file_name', 'data_date',
  'acted_at', 'result', 'stages', 'backup_file', 'message'
];
const REPORT_UPLOAD_MAX_BYTES = 12 * 1024 * 1024;
// Drive 暫存檔固定前綴。兩者都建立在「私有戰情資料夾」，
// **絕不進入 KPI 來源資料夾（KPICALC_SOURCE_FOLDER_ID）**，
// 且不符合排程的 /^\d{4}\.xlsx$/ 命名，因此 kpiCalcAutoUpdate 掃不到。
const REPORT_UPLOAD_TEMP_PREFIX = 'report-upload-temp-';
const REPORT_UPLOAD_STAGING_PREFIX = 'report-upload-staging-';
const REPORT_UPLOAD_TEMP_MAX_AGE_HOURS = 6;
const REPORT_UPLOAD_STAGE_TTL_SECONDS = 1800;
const REPORT_UPLOAD_KINDS = {
  kpi: {
    label: 'KPI',
    ext: '.xlsx',
    liveFile: PRIVATE_KPICALC_FILE,
    // ⚠️ 備份檔名刻意「不以 north12b-kpicalc- 開頭」：kpiCalcLatestDataFile()
    // 會撈私有資料夾中最後更新最新的 north12b-kpicalc-*.json，若備份符合該樣式，
    // 一旦「備份成功但寫入正式檔失敗」，備份就會變成最新檔而被當成正式資料。
    backupPrefix: 'backup-north12b-kpicalc-',
    rawPrefix: 'kpi-raw-',
    // KPI 正式資料供 kpi.html 使用；index.html 戰情頁籤走另一份快照。
    targets: { site: 'KPI 網站（kpi.html）', ops: '智慧營運中心（index.html 戰情）' }
  },
  award: {
    label: '台獎',
    ext: '.json',
    liveFile: PRIVATE_DASHBOARD_FILE,
    backupPrefix: 'backup-north12b-dashboard-',
    rawPrefix: 'award-raw-',
    targets: { site: '台獎網站（index.html 台獎戰情）', ops: '智慧營運中心（index.html 戰情）' }
  }
};

function reportUploadKind_(value) {
  const kind = String(value || '').trim();
  if (!REPORT_UPLOAD_KINDS[kind]) throw new Error('未知的報表類型（僅支援 kpi／award）');
  return kind;
}

// 權限：管理者密碼 + 員編白名單。前端也會擋一次，但後端這關才是真的。
function reportUploadAuthorize_(payload) {
  privateDashboardAdminAuthorized(payload);
  const employeeId = privateDashboardCleanEmployeeId((payload || {}).employeeId);
  const raw = String(privateDashboardProperties().getProperty('REPORT_UPLOAD_ALLOWED_EMPLOYEES') || '').trim();
  const allowed = raw
    ? raw.split(/[,;\s]+/).map(function(s) { return s.trim().toUpperCase(); }).filter(Boolean)
    : [String(privateDashboardProperties().getProperty('DASHBOARD_TRUSTED_EMPLOYEE_ID') || '').trim().toUpperCase()];
  if (allowed.indexOf(employeeId) === -1) throw new Error('此員編未被授權使用戰報快速更新');
  return employeeId;
}

function reportUploadStamp_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss');
}

function reportUploadToken_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function reportUploadCache_() { return CacheService.getScriptCache(); }

function reportUploadFileByName_(name) {
  const files = privateDashboardFolder().getFilesByName(name);
  return files.hasNext() ? files.next() : null;
}

// 清理暫存檔。錯誤紀錄只寫檔案 ID，不寫檔名或任何業績內容。
function reportUploadTrash_(file) {
  if (!file) return;
  let id = '(unknown)';
  try { id = file.getId(); } catch (e) {}
  try { file.setTrashed(true); } catch (e) {
    console.log('report upload temp cleanup failed, fileId=' + id);
  }
}

// 清掉異常中斷（例如執行逾時）留下的舊暫存檔。
// 只掃私有戰情資料夾，只刪符合固定前綴且超過保留時數的檔案。
// 可由 GAS 編輯器手動執行，也在每次 preview 開頭順手跑一次。
function reportUploadCleanupTemp(maxAgeHours) {
  const hours = Number(maxAgeHours) > 0 ? Number(maxAgeHours) : REPORT_UPLOAD_TEMP_MAX_AGE_HOURS;
  const cutoff = Date.now() - hours * 3600 * 1000;
  const removed = [];
  try {
    const files = privateDashboardFolder().getFiles();
    while (files.hasNext()) {
      const f = files.next();
      const name = f.getName();
      if (name.indexOf(REPORT_UPLOAD_TEMP_PREFIX) !== 0 &&
          name.indexOf(REPORT_UPLOAD_STAGING_PREFIX) !== 0) continue;
      if (f.getLastUpdated().getTime() > cutoff) continue;
      const id = f.getId();
      try { f.setTrashed(true); removed.push(id); }
      catch (e) { console.log('report upload orphan cleanup failed, fileId=' + id); }
    }
  } catch (e) {
    console.log('report upload orphan scan failed: ' + (e && e.message ? e.message : e));
  }
  return { removed: removed.length, fileIds: removed, olderThanHours: hours };
}

// 目前正式資料的「資料日期」，用來擋比正式版本更舊的檔案。
function reportUploadLiveInfo_(kind) {
  try {
    if (kind === 'kpi') {
      const f = kpiCalcLatestDataFile();
      if (!f) return null;
      const j = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
      const meta = (j && j.meta) || {};
      return {
        fileName: f.getName(),
        dataDate: reportUploadKpiDate_(meta),
        label: (meta.period || '') + '（第 ' + (meta.snapshotDay || '?') + ' 天）',
        updatedAt: Utilities.formatDate(f.getLastUpdated(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX")
      };
    }
    const f = reportUploadFileByName_(PRIVATE_DASHBOARD_FILE);
    if (!f) return null;
    const j = JSON.parse(f.getBlob().getDataAsString('UTF-8'));
    const date = String(((j || {}).kpiBattle || {}).report_date || '');
    return {
      fileName: f.getName(),
      dataDate: date,
      label: date || '(無日期)',
      updatedAt: Utilities.formatDate(f.getLastUpdated(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX")
    };
  } catch (e) {
    console.log('report upload live info failed: ' + e);
    return null;
  }
}

// KPI 的版本日期只能來自已解析的資料期間末日與 snapshotDay；不可使用
// 檔名、寄件日或執行日。兩個來源同時存在卻不一致時 fail-closed，避免
// 前一天的 manual-upload 被誤當成同日期版本。
function reportUploadKpiDate_(meta) {
  const input = meta || {};
  const month = String(input.month || '');
  const day = Number(input.snapshotDay || 0);
  const period = String(input.period || '');
  const dateText = function(year, monthNum, dayNum) {
    const y = Number(year), m = Number(monthNum), d = Number(dayNum);
    const date = new Date(Date.UTC(y, m - 1, d));
    if (!y || !m || !d || date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return '';
    return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2);
  };

  let snapshotDate = '';
  const monthMatch = month.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch && day) snapshotDate = dateText(monthMatch[1], monthMatch[2], day);

  let periodDate = '';
  const periodMatch = period.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s*[~～]\s*(?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})$/);
  if (periodMatch) {
    const startDate = dateText(periodMatch[1], periodMatch[2], periodMatch[3]);
    const endYear = periodMatch[4] || periodMatch[1];
    const endDate = dateText(endYear, periodMatch[5], periodMatch[6]);
    if (!startDate || !endDate || endDate < startDate) return '';
    periodDate = endDate;
  }

  if (periodDate && snapshotDate && periodDate !== snapshotDate) return '';
  return periodDate || snapshotDate;
}

// ── 檔案驗證 ──────────────────────────────────────────────
// 回傳檢查清單，level：ok（通過）／warn（可提醒但放行）／block（禁止更新）。
// block 一律不進入 commit，正式資料不會被覆蓋。

function reportUploadCheck_(key, label, level, detail) {
  return { key: key, label: label, level: level, detail: String(detail == null ? '' : detail) };
}

function reportUploadValidateFile_(kind, fileName, byteLength) {
  const spec = REPORT_UPLOAD_KINDS[kind];
  const checks = [];
  const lower = String(fileName || '').toLowerCase();
  checks.push(lower.slice(-spec.ext.length) === spec.ext
    ? reportUploadCheck_('ext', '副檔名', 'ok', fileName)
    : reportUploadCheck_('ext', '副檔名', 'block', spec.label + ' 需要 ' + spec.ext + ' 檔，收到：' + fileName));
  if (!byteLength) {
    checks.push(reportUploadCheck_('size', '檔案大小', 'block', '檔案是空的'));
  } else if (byteLength > REPORT_UPLOAD_MAX_BYTES) {
    checks.push(reportUploadCheck_('size', '檔案大小', 'block',
      Math.round(byteLength / 1024 / 1024 * 10) / 10 + ' MB 超過上限 ' + (REPORT_UPLOAD_MAX_BYTES / 1024 / 1024) + ' MB'));
  } else {
    checks.push(reportUploadCheck_('size', '檔案大小', 'ok', Math.round(byteLength / 1024) + ' KB'));
  }
  return checks;
}

// 門市名比對：報表的店名與 STORES 清單寫法不同，不能用精確比對。
// 2026-07-31 以真實 0730.xlsx 實測：報表為「台北酒泉」「台北通化」等帶「台北」前綴，
// 三創更是「台灣大哥大數位生活台北三創」，而 STORES 是「酒泉」「通化」「台北三創」。
// 原本的 indexOf 精確比對會讓 9 家全部對不到 → 真實日報被誤判為「其他區資料」而擋下。
// 改為雙向包含比對後 9/9 命中。
// 回傳 { status, store, candidates }：
//   matched            —— 唯一命中，store 為對應的 STORES 名稱
//   none               —— 完全沒命中（外區店名走這裡）
//   ambiguous-store-match —— 同時命中兩家以上，**不自行選擇**，交由呼叫端擋下
// 完全相等視為最強訊號，可用來消解包含比對造成的歧義。
function reportUploadStoreMatch_(name) {
  const clean = String(name || '').trim();
  if (!clean) return { status: 'none', store: '', candidates: [] };
  const hits = [];
  for (let i = 0; i < STORES.length; i++) {
    const s = STORES[i];
    if (clean === s || clean.indexOf(s) !== -1 || s.indexOf(clean) !== -1) hits.push(s);
  }
  if (!hits.length) return { status: 'none', store: '', candidates: [] };
  if (hits.length === 1) return { status: 'matched', store: hits[0], candidates: hits };
  const exact = hits.filter(function(s) { return s === clean; });
  if (exact.length === 1) return { status: 'matched', store: exact[0], candidates: hits };
  return { status: 'ambiguous-store-match', store: '', candidates: hits };
}

// 把一組店名分成命中／未命中／歧義三類
function reportUploadStoreBuckets_(names) {
  const matched = [], none = [], ambiguous = [];
  (names || []).forEach(function(n) {
    const r = reportUploadStoreMatch_(n);
    if (r.status === 'matched') matched.push(n);
    else if (r.status === 'ambiguous-store-match') ambiguous.push(n + ' → ' + r.candidates.join('／'));
    else none.push(n);
  });
  return { matched: matched, none: none, ambiguous: ambiguous };
}

// 資料日期比對：新檔早於（或等於）正式版本時擋下／提醒。
function reportUploadDateChecks_(incomingDate, live) {
  const checks = [];
  if (!incomingDate) {
    checks.push(reportUploadCheck_('date', '資料日期', 'block', '檔案裡讀不到資料日期'));
    return checks;
  }
  checks.push(reportUploadCheck_('date', '資料日期', 'ok', incomingDate));
  if (!live || !live.dataDate) {
    checks.push(reportUploadCheck_('newer', '是否早於正式版本', 'warn', '目前沒有正式資料可比對，視為首次發佈'));
  } else if (incomingDate < live.dataDate) {
    checks.push(reportUploadCheck_('newer', '是否早於正式版本', 'block',
      '上傳資料 ' + incomingDate + ' 比正式版本 ' + live.dataDate + ' 舊，拒絕覆蓋'));
  } else if (incomingDate === live.dataDate) {
    checks.push(reportUploadCheck_('newer', '是否早於正式版本', 'warn',
      '與正式版本同一天（' + live.dataDate + '），確認後會覆蓋為這一份'));
  } else {
    checks.push(reportUploadCheck_('newer', '是否早於正式版本', 'ok',
      '比正式版本 ' + live.dataDate + ' 新'));
  }
  return checks;
}

// KPI 必須等到資料日期確實較新才可走正式更新；同日期或更舊的來源
// 僅能停在預覽，不允許透過 force 取代目前正式 JSON。
function reportUploadKpiDateChecks_(incomingDate, live) {
  const checks = reportUploadDateChecks_(incomingDate, live);
  const newer = checks.filter(function(check) { return check.key === 'newer'; })[0];
  if (newer && live && live.dataDate && incomingDate <= live.dataDate) {
    newer.level = 'block';
    newer.detail = incomingDate === live.dataDate
      ? '上傳資料與正式版本同一天（' + live.dataDate + '），依規則等待日期較新的正式 Excel，拒絕覆寫'
      : '上傳資料 ' + incomingDate + ' 比正式版本 ' + live.dataDate + ' 舊，拒絕覆寫';
  }
  return checks;
}

function reportUploadValidateKpi_(data, live) {
  const checks = [];
  const meta = (data && data.meta) || {};
  const stores = (data && data.stores) || [];
  const persons = (data && data.persons) || [];

  checks.push(reportUploadCheck_('sheets', '工作表名稱', 'ok', '店點達成率＋個人達成率皆已讀到'));
  checks.push(reportUploadCheck_('fields', '必要欄位', 'ok', KPICALC_ITEMS.length + ' 項加權欄位齊全'));
  checks.push(reportUploadCheck_('period', '資料期間', meta.period ? 'ok' : 'block', meta.period || '讀不到期間'));

  reportUploadKpiDateChecks_(reportUploadKpiDate_(meta), live).forEach(function(c) { checks.push(c); });

  // 區域檢查：北一二B 的店代碼是 DNB 開頭，且店名應落在已知門市清單內。
  const badCode = stores.filter(function(s) { return !/^DNB/i.test(String(s.code || '')); });
  const buckets = reportUploadStoreBuckets_(stores.map(function(s) { return s.name; }));
  const known = buckets.matched;
  if (badCode.length) {
    checks.push(reportUploadCheck_('region', '區域或店點', 'block',
      '有 ' + badCode.length + ' 家店代碼不是 DNB 開頭，疑似非本區報表'));
  } else if (buckets.ambiguous.length) {
    // 同時命中兩家以上：不自行選擇，直接擋下請人確認
    checks.push(reportUploadCheck_('region', '區域或店點', 'block',
      'ambiguous-store-match：' + buckets.ambiguous.join('；') + '。請確認門市清單後再上傳'));
  } else if (!known.length) {
    checks.push(reportUploadCheck_('region', '區域或店點', 'block',
      '店名完全對不到北一二B 門市清單，疑似上傳其他區資料'));
  } else if (known.length < Math.min(5, STORES.length)) {
    checks.push(reportUploadCheck_('region', '區域或店點', 'warn',
      '只有 ' + known.length + ' 家對得到本區門市清單，請確認是否為完整報表'));
  } else {
    checks.push(reportUploadCheck_('region', '區域或店點', 'ok',
      known.length + ' 家對到本區門市：' + known.join('、')));
  }

  const countLevel = (stores.length >= 5 && persons.length >= 10) ? 'ok' : 'block';
  checks.push(reportUploadCheck_('count', '資料筆數', countLevel,
    '店點 ' + stores.length + ' 家、人員 ' + persons.length + ' 位'));

  // 疑似上傳錯報表：筆數與正式版本落差過大時提醒（不擋，門市可能真的增減）。
  if (live && live.storeCount && stores.length && Math.abs(stores.length - live.storeCount) > 2) {
    checks.push(reportUploadCheck_('mismatch', '是否可能上傳錯報表', 'warn',
      '店點數由 ' + live.storeCount + ' 變成 ' + stores.length + '，落差偏大'));
  } else {
    checks.push(reportUploadCheck_('mismatch', '是否可能上傳錯報表', 'ok', '筆數與正式版本相當'));
  }
  return checks;
}

function reportUploadValidateAward_(snapshot, live) {
  const checks = [];
  // 形狀檢查刻意與 privateDashboardPublish 用同一組必要欄位，避免兩套標準。
  const hasShape = !!(snapshot && snapshot.kpiBattle && snapshot.awardsBattle);
  checks.push(reportUploadCheck_('fields', '必要欄位', hasShape ? 'ok' : 'block',
    hasShape ? 'kpiBattle／awardsBattle 皆存在' : '缺少 kpiBattle 或 awardsBattle，格式不完整'));
  if (!hasShape) return checks;

  checks.push(reportUploadCheck_('sheets', '資料區塊', 'ok', '台獎戰情快照結構正確'));
  reportUploadDateChecks_(String(snapshot.kpiBattle.report_date || ''), live).forEach(function(c) { checks.push(c); });

  const rows = Array.isArray(snapshot.awardsBattle.stores) ? snapshot.awardsBattle.stores : [];
  const buckets = reportUploadStoreBuckets_(rows.map(function(r) { return r.store; }));
  const known = buckets.matched;
  if (!rows.length) {
    checks.push(reportUploadCheck_('region', '區域或店點', 'block', '台獎快照沒有任何店點資料'));
  } else if (buckets.ambiguous.length) {
    checks.push(reportUploadCheck_('region', '區域或店點', 'block',
      'ambiguous-store-match：' + buckets.ambiguous.join('；') + '。請確認門市清單後再上傳'));
  } else if (!known.length) {
    checks.push(reportUploadCheck_('region', '區域或店點', 'block', '店名對不到北一二B 門市清單，疑似其他區資料'));
  } else {
    checks.push(reportUploadCheck_('region', '區域或店點', 'ok',
      known.length + ' 家對到本區門市：' + known.join('、')));
  }
  checks.push(reportUploadCheck_('count', '資料筆數', rows.length ? 'ok' : 'block', '店點 ' + rows.length + ' 家'));
  checks.push(reportUploadCheck_('mismatch', '是否可能上傳錯報表', 'ok', '已確認為台獎戰情快照格式'));
  return checks;
}

function reportUploadBlocked_(checks) {
  return checks.filter(function(c) { return c.level === 'block'; });
}

// ── 台獎雙檔：僅記憶體解析預覽，沒有 staging、commit 或正式發布 ───────────
const REPORT_AWARD_PAIR_MAX_BYTES = 8 * 1024 * 1024;
const REPORT_AWARD_PAIR_MAX_ENTRIES = 500;
const REPORT_AWARD_PAIR_MAX_UNZIPPED_BYTES = 48 * 1024 * 1024;
const REPORT_AWARD_PAIR_MIMES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'application/octet-stream'
];
const REPORT_AWARD_PAIR_FILES = {
  store: { label: '店點台獎檔', sheet: '上線數KPI_店點達成率_明細' },
  person: { label: '個人台獎檔', sheet: '手機競賽_個人達成率' }
};
const REPORT_AWARD_PAIR_EXPECTED_STORES = 9;
const REPORT_AWARD_PAIR_EXPECTED_PERSONS = 41;

function reportAwardPairSafeText_(value) {
  return String(value == null ? '' : value).replace(/[\u0000\r\n]/g, ' ').slice(0, 180);
}

function reportAwardPairDecode_(file, expected) {
  const input = file || {};
  const fileName = reportAwardPairSafeText_(input.fileName || '');
  const mimeType = String(input.mimeType || '').toLowerCase().split(';')[0].trim();
  const base64 = String(input.fileBase64 || '');
  if (!base64) throw new Error(expected.label + '沒有收到檔案內容');
  if (!/\.xlsx$/i.test(fileName) || /[\\/]/.test(fileName) || fileName.indexOf('..') !== -1) {
    throw new Error(expected.label + '檔名必須是安全的 .xlsx');
  }
  if (REPORT_AWARD_PAIR_MIMES.indexOf(mimeType) === -1) throw new Error(expected.label + ' MIME 不受支援');
  if (base64.length > REPORT_AWARD_PAIR_MAX_BYTES * 1.4) throw new Error(expected.label + '超過安全大小上限');
  const bytes = Utilities.base64Decode(base64);
  if (!bytes || bytes.length < 4 || bytes.length > REPORT_AWARD_PAIR_MAX_BYTES ||
      bytes[0] !== 80 || bytes[1] !== 75 || bytes[2] !== 3 || bytes[3] !== 4) {
    throw new Error(expected.label + '不是有效 XLSX ZIP');
  }
  return { fileName: fileName, bytes: bytes, mimeType: mimeType };
}

function reportAwardPairXmlText_(value) {
  return String(value || '').replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

function reportAwardPairXmlAttribute_(tag, name) {
  const match = String(tag || '').match(new RegExp('(?:^|\\s)' + name.replace(/:/g, '\\:') + '="([^"]*)"'));
  return match ? reportAwardPairXmlText_(match[1]) : '';
}

function reportAwardPairSharedStrings_(xml) {
  const values = [];
  const matcher = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match;
  while ((match = matcher.exec(String(xml || ''))) !== null) {
    const pieces = [];
    const textMatcher = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let text;
    while ((text = textMatcher.exec(match[1])) !== null) pieces.push(reportAwardPairXmlText_(text[1]));
    values.push(pieces.join(''));
  }
  return values;
}

function reportAwardPairCellText_(cellXml, sharedStrings) {
  const type = reportAwardPairXmlAttribute_(cellXml, 't');
  const inline = String(cellXml || '').match(/<is(?:\s[^>]*)?>([\s\S]*?)<\/is>/);
  if (inline) return reportAwardPairXmlText_(inline[1]);
  const value = String(cellXml || '').match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/);
  if (!value) return '';
  const raw = reportAwardPairXmlText_(value[1]);
  return type === 's' && sharedStrings[Number(raw)] != null ? sharedStrings[Number(raw)] : raw;
}

function reportAwardPairXmlRows_(sheetXml, sharedStrings) {
  const rows = [];
  const rowMatcher = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowMatcher.exec(String(sheetXml || ''))) !== null) {
    const cells = {};
    const cellMatcher = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let cellMatch;
    while ((cellMatch = cellMatcher.exec(rowMatch[2])) !== null) {
      const column = reportAwardPairXmlAttribute_(cellMatch[1], 'r').replace(/\d+/g, '');
      if (column) cells[column] = reportAwardPairCellText_(cellMatch[2], sharedStrings);
    }
    if (Object.keys(cells).length) rows.push({ row: Number(reportAwardPairXmlAttribute_(rowMatch[1], 'r') || 0), cells: cells });
  }
  return rows;
}

function reportAwardPairSafeZipName_(name) {
  const clean = String(name || '');
  return !!clean && clean.charAt(0) !== '/' && clean.indexOf('\\') === -1 && clean.split('/').indexOf('..') === -1;
}

function reportAwardPairReadWorkbook_(decoded, expected) {
  let files;
  try { files = Utilities.unzip(Utilities.newBlob(decoded.bytes, 'application/zip', 'award.xlsx')); }
  catch (err) { throw new Error(expected.label + ' XLSX 無法解壓'); }
  if (!files.length || files.length > REPORT_AWARD_PAIR_MAX_ENTRIES) throw new Error(expected.label + ' XLSX entry 數量異常');
  let expanded = 0;
  const byName = {};
  files.forEach(function(file) {
    if (!reportAwardPairSafeZipName_(file.getName())) throw new Error(expected.label + ' XLSX entry 路徑不安全');
    expanded += file.getBytes().length;
    if (expanded > REPORT_AWARD_PAIR_MAX_UNZIPPED_BYTES) throw new Error(expected.label + ' XLSX 解壓後超過安全上限');
    byName[file.getName()] = file;
  });
  if (!byName['[Content_Types].xml'] || !byName['xl/workbook.xml'] || !byName['xl/_rels/workbook.xml.rels']) {
    throw new Error(expected.label + '不是完整 XLSX 容器');
  }
  const workbook = byName['xl/workbook.xml'].getDataAsString('UTF-8');
  const relationships = byName['xl/_rels/workbook.xml.rels'].getDataAsString('UTF-8');
  const targets = {};
  const relMatcher = /<Relationship\b([^>]*)\/?\s*>/g;
  let rel;
  while ((rel = relMatcher.exec(relationships)) !== null) {
    const id = reportAwardPairXmlAttribute_(rel[1], 'Id');
    const target = reportAwardPairXmlAttribute_(rel[1], 'Target').replace(/^\/+/, '');
    if (id && target) targets[id] = target.indexOf('xl/') === 0 ? target : 'xl/' + target;
  }
  const sheets = [];
  const sheetMatcher = /<sheet\b([^>]*)\/?>(?:<\/sheet>)?/g;
  let sheet;
  while ((sheet = sheetMatcher.exec(workbook)) !== null) {
    const name = reportAwardPairXmlAttribute_(sheet[1], 'name');
    const id = reportAwardPairXmlAttribute_(sheet[1], 'r:id');
    if (name && targets[id] && byName[targets[id]]) sheets.push({ name: name, xml: byName[targets[id]].getDataAsString('UTF-8') });
  }
  const selected = sheets.filter(function(item) { return item.name === expected.sheet; })[0];
  if (!selected) throw new Error(expected.label + '缺少指定工作表');
  return { sheetNames: sheets.map(function(item) { return item.name; }), selectedSheet: selected.name,
    rows: reportAwardPairXmlRows_(selected.xml, reportAwardPairSharedStrings_(byName['xl/sharedStrings.xml'] ? byName['xl/sharedStrings.xml'].getDataAsString('UTF-8') : '')) };
}

function reportAwardPairRangeDate_(rows) {
  const text = (rows || []).slice(0, 30).map(function(row) {
    return Object.keys(row.cells || {}).map(function(column) { return row.cells[column]; }).join(' ');
  }).join(' ');
  const range = text.match(/(20\d{2})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{1,2})\s*~\s*(?:(20\d{2})\s*[\/-]\s*)?(\d{1,2})\s*[\/-]\s*(\d{1,2})/);
  if (range) return (range[4] || range[1]) + '-' + ('0' + range[5]).slice(-2) + '-' + ('0' + range[6]).slice(-2);
  const dates = text.match(/20\d{2}\s*[\/-]\s*\d{1,2}\s*[\/-]\s*\d{1,2}/g) || [];
  const last = dates.length ? dates[dates.length - 1].match(/(20\d{2})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{1,2})/) : null;
  return last ? last[1] + '-' + ('0' + last[2]).slice(-2) + '-' + ('0' + last[3]).slice(-2) : '';
}

function reportAwardPairHeaders_(rows) {
  const values = {};
  (rows || []).filter(function(row) { return row.row > 0 && row.row <= 18; }).forEach(function(row) {
    Object.keys(row.cells || {}).forEach(function(column) {
      const value = String(row.cells[column] || '').trim();
      if (value) values[column] = (values[column] || []).concat(values[column] && values[column].indexOf(value) >= 0 ? [] : [value]);
    });
  });
  return Object.keys(values).sort().map(function(column) { return { column: column, name: values[column].join(' / ') }; });
}

function reportAwardPairDuplicates_(keys) {
  const counts = {};
  (keys || []).filter(Boolean).forEach(function(key) { counts[key] = (counts[key] || 0) + 1; });
  return Object.keys(counts).filter(function(key) { return counts[key] > 1; }).length;
}

function reportAwardPairAnalyze_(workbook, role) {
  const isStore = role === 'store';
  const rows = workbook.rows || [];
  const records = rows.filter(function(row) {
    const c = row.cells || {};
    return isStore ? c.F === '北一二B' && /^DNB/i.test(String(c.G || '')) : c.B === '北一二B' && /^DNB/i.test(String(c.C || ''));
  }).map(function(row) {
    const c = row.cells || {};
    const store = String(isStore ? c.I || '' : c.D || '').trim();
    const personKey = isStore ? store : [store, String(c.F || '').trim(), String(c.G || '').trim()].join('|');
    return { row: row.row, store: store, key: personKey, complete: isStore ? !!store : !!store && !!c.F && !!c.G };
  });
  const canonical = {}, unmatched = [];
  records.forEach(function(record) {
    const match = reportUploadStoreMatch_(record.store);
    if (match.status === 'matched') canonical[match.store] = true;
    else if (record.store) unmatched.push(record.store);
  });
  const headers = reportAwardPairHeaders_(rows);
  const headerText = headers.map(function(header) { return header.name; }).join('｜');
  return {
    role: role, sheetNames: workbook.sheetNames, selectedSheet: workbook.selectedSheet,
    dataDate: reportAwardPairRangeDate_(rows), recordCount: records.length,
    canonicalStores: Object.keys(canonical).sort(), missingStores: STORES.filter(function(store) { return !canonical[store]; }),
    unmatchedCount: unmatched.length, duplicateCount: reportAwardPairDuplicates_(records.map(function(record) { return record.key; })),
    incompleteCount: records.filter(function(record) { return !record.complete; }).length,
    rankFieldFound: /(排名|名次)/.test(headerText), awardFieldFound: /(獎金|領獎)/.test(headerText),
    headers: headers.map(function(header) { return header.name; })
  };
}

function reportAwardPairBuildPreview_(store, person, files) {
  const sameDate = !!store.dataDate && store.dataDate === person.dataDate;
  const storeCountOk = store.canonicalStores.length === REPORT_AWARD_PAIR_EXPECTED_STORES && !store.missingStores.length && !store.unmatchedCount;
  const personCountOk = person.recordCount === REPORT_AWARD_PAIR_EXPECTED_PERSONS && !person.unmatchedCount;
  const cleanRecords = !store.duplicateCount && !person.duplicateCount && !store.incompleteCount && !person.incompleteCount;
  const rankOk = store.rankFieldFound && person.rankFieldFound;
  const awardOk = store.awardFieldFound && person.awardFieldFound;
  const checks = [
    reportUploadCheck_('date', '資料日期一致', sameDate ? 'ok' : 'block', '店點：' + (store.dataDate || '讀不到') + '；個人：' + (person.dataDate || '讀不到')),
    reportUploadCheck_('stores', '店點完整性', storeCountOk ? 'ok' : 'block', '預期 ' + REPORT_AWARD_PAIR_EXPECTED_STORES + ' 店，讀到 ' + store.canonicalStores.length + ' 店；缺少 ' + store.missingStores.length + '、未匹配 ' + store.unmatchedCount),
    reportUploadCheck_('people', '人員完整性', personCountOk ? 'ok' : 'block', '預期 ' + REPORT_AWARD_PAIR_EXPECTED_PERSONS + ' 人，讀到 ' + person.recordCount + ' 人；未匹配店點 ' + person.unmatchedCount),
    reportUploadCheck_('duplicates', '重複／缺漏', cleanRecords ? 'ok' : 'block', '店點重複 ' + store.duplicateCount + '、個人重複 ' + person.duplicateCount + '、店點缺欄 ' + store.incompleteCount + '、個人缺欄 ' + person.incompleteCount),
    reportUploadCheck_('ranking', '排名欄位', rankOk ? 'ok' : 'block', '店點／個人皆須含排名或名次欄位'),
    reportUploadCheck_('award', '獎金欄位', awardOk ? 'ok' : 'block', '店點／個人皆須含獎金或領獎欄位')
  ];
  return {
    schemaVersion: 'phone-awards-preview-v2',
    // 固定為兩端欄位，不再因一致而改成單一字串，避免 store／person 被讀成 null。
    reportDate: { store: store.dataDate || null, person: person.dataDate || null },
    summary: { sameDate: sameDate, storeCount: store.canonicalStores.length, expectedStores: REPORT_AWARD_PAIR_EXPECTED_STORES,
      personCount: person.recordCount, expectedPersons: REPORT_AWARD_PAIR_EXPECTED_PERSONS },
    diff: checks.map(function(check) { return { item: check.label, result: check.level, detail: check.detail }; }),
    checks: checks, sourceFiles: files, publishable: false, formalDataChanged: false,
    debug: { store: store, person: person }
  };
}

function reportAwardPairPreview(payload) {
  reportUploadAuthorize_(payload);
  const storeFile = reportAwardPairDecode_((payload || {}).storeFile, REPORT_AWARD_PAIR_FILES.store);
  const personFile = reportAwardPairDecode_((payload || {}).personFile, REPORT_AWARD_PAIR_FILES.person);
  const store = reportAwardPairAnalyze_(reportAwardPairReadWorkbook_(storeFile, REPORT_AWARD_PAIR_FILES.store), 'store');
  const person = reportAwardPairAnalyze_(reportAwardPairReadWorkbook_(personFile, REPORT_AWARD_PAIR_FILES.person), 'person');
  const preview = reportAwardPairBuildPreview_(store, person, [
    { role: 'store', fileName: storeFile.fileName, size: storeFile.bytes.length },
    { role: 'person', fileName: personFile.fileName, size: personFile.bytes.length }
  ]);
  return { ok: reportUploadBlocked_(preview.checks).length === 0, preview: preview, checks: preview.checks,
    publishable: false, formalDataChanged: false, message: '僅完成雙檔預覽；未建立暫存檔、未寫入正式台獎 JSON。' };
}

// ── 步驟一：預覽（只寫暫存，絕不碰正式資料）──────────────
function reportUploadPreview(payload) {
  const employeeId = reportUploadAuthorize_(payload);
  const kind = reportUploadKind_((payload || {}).kind);
  const spec = REPORT_UPLOAD_KINDS[kind];
  const fileName = String((payload || {}).fileName || '');
  const encoded = String((payload || {}).fileBase64 || '');
  if (!encoded) throw new Error('沒有收到檔案內容');
  if (encoded.length > REPORT_UPLOAD_MAX_BYTES * 1.4) throw new Error('檔案過大');

  const bytes = Utilities.base64Decode(encoded);
  let checks = reportUploadValidateFile_(kind, fileName, bytes.length);
  if (reportUploadBlocked_(checks).length) {
    return { ok: false, kind: kind, checks: checks, live: reportUploadLiveInfo_(kind) };
  }

  reportUploadCleanupTemp();   // 順手清掉異常中斷留下的舊暫存檔

  const live = reportUploadLiveInfo_(kind);
  const token = reportUploadToken_();
  const folder = privateDashboardFolder();
  const uploadedAt = privateDashboardNow();
  let rawFile = null;
  let data = null;
  let dataDate = '';
  let preview = null;
  let stagingName = '';
  // keepRaw 只有在「驗證通過並成功寫入暫存資料檔」後才為 true；
  // 其餘所有路徑（含丟例外）都會在 finally 把原始暫存檔移到垃圾桶。
  let keepRaw = false;

  try {
    if (kind === 'kpi') {
      // 原始 xlsx 先落地私有 Drive，再交給「既有的、唯一的」解析器。
      // 這裡刻意不自寫任何 xlsx 解析，與 kpiCalcAutoUpdate 共用 kpiCalcParseReport。
      rawFile = folder.createFile(Utilities.newBlob(bytes,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        REPORT_UPLOAD_TEMP_PREFIX + token + '-' + fileName));
      data = kpiCalcParseReport(rawFile);
      if (live) live.storeCount = null;
      checks = checks.concat(reportUploadValidateKpi_(data, live));
      dataDate = reportUploadKpiDate_(data.meta);
      preview = {
        period: data.meta.period,
        snapshotDay: data.meta.snapshotDay,
        month: data.meta.month,
        storeCount: data.stores.length,
        personCount: data.persons.length,
        stores: data.stores.map(function(s) {
          return { name: s.name, code: s.code, official: s.official };
        }),
        persons: data.persons.slice(0, 8).map(function(p) {
          return { store: p.store, pname: p.pname, role: p.role, official: p.official };
        })
      };
    } else {
      const text = Utilities.newBlob(bytes).getDataAsString('UTF-8');
      try {
        data = JSON.parse(text);
      } catch (parseError) {
        checks.push(reportUploadCheck_('parse', '檔案解析', 'block', 'JSON 解析失敗：' + parseError));
        return { ok: false, kind: kind, checks: checks, live: live,
                 fileName: fileName, uploadedAt: uploadedAt };
      }
      rawFile = folder.createFile(Utilities.newBlob(text, 'application/json',
        REPORT_UPLOAD_TEMP_PREFIX + token + '-' + fileName));
      checks = checks.concat(reportUploadValidateAward_(data, live));
      dataDate = String(((data || {}).kpiBattle || {}).report_date || '');
      const rows = Array.isArray(((data || {}).awardsBattle || {}).stores) ? data.awardsBattle.stores : [];
      preview = {
        reportDate: dataDate,
        storeCount: rows.length,
        stores: rows.slice(0, 12).map(function(r) {
          return { name: String(r.store || ''), bonus: r.bonus == null ? '' : r.bonus };
        })
      };
    }
    if (reportUploadBlocked_(checks).length) {
      // 驗證失敗：正式資料一個位元都沒動；暫存檔由 finally 清掉
      return { ok: false, kind: kind, checks: checks, live: live,
               fileName: fileName, uploadedAt: uploadedAt };
    }

    // 通過驗證才寫暫存資料檔（正式檔仍未更動）
    stagingName = REPORT_UPLOAD_STAGING_PREFIX + kind + '-' + token + '.json';
    folder.createFile(Utilities.newBlob(JSON.stringify(data), 'application/json', stagingName));
    keepRaw = true;   // 之後由 commit 改名保留為原始檔備份
  } catch (err) {
    checks.push(reportUploadCheck_('parse', '檔案解析', 'block',
      (err && err.message ? err.message : String(err))));
    return { ok: false, kind: kind, checks: checks, live: live,
             fileName: fileName, uploadedAt: uploadedAt };
  } finally {
    if (!keepRaw) reportUploadTrash_(rawFile);
  }
  const fileHash = reportVersionHash_(bytes);
  reportUploadCache_().put('rupload_' + token, JSON.stringify({
    kind: kind, employeeId: employeeId, fileName: fileName, dataDate: dataDate,
    rawFileId: rawFile.getId(), stagingName: stagingName, fileHash: fileHash
  }), REPORT_UPLOAD_STAGE_TTL_SECONDS);

  // 先行預告版本判斷結果，讓使用者在按下確認前就知道會不會被擋、需不需要強制覆寫
  const decision = reportVersionDecide_(kind,
    { dataDate: dataDate, source: 'manual-upload', fileHash: fileHash });
  const current = reportVersionGet_(kind);
  if (!decision.accept) {
    checks.push(reportUploadCheck_('version', '版本衝突檢查',
      decision.rule === 'same-hash' ? 'warn' : 'warn', decision.reason + '（可勾選強制覆寫）'));
  } else {
    checks.push(reportUploadCheck_('version', '版本衝突檢查', 'ok', decision.reason));
  }

  return {
    ok: true, kind: kind, token: token, checks: checks, preview: preview,
    live: live, dataDate: dataDate, targets: spec.targets, fileHash: fileHash,
    // 預覽畫面用：檔名代表「產出日」，dataDate 代表「統計截止日」，兩者本來就會差一天
    fileName: fileName, uploadedAt: uploadedAt,
    newerThanLive: (live && live.dataDate) ? (dataDate > live.dataDate)
                                           : null,
    version: { decision: decision, current: current },
    needsForce: !decision.accept,
    warnings: checks.filter(function(c) { return c.level === 'warn'; }).length
  };
}

// ── 步驟二：確認更新（分階段執行，逐項回報成功／失敗／未執行／維持上一版）──
function reportUploadStage_(key, label, status, detail) {
  return { key: key, label: label, status: status, detail: String(detail == null ? '' : detail) };
}

function reportUploadCommit(payload) {
  const employeeId = reportUploadAuthorize_(payload);
  const token = String((payload || {}).token || '');
  const cached = token ? reportUploadCache_().get('rupload_' + token) : null;
  if (!cached) throw new Error('預覽已逾時或不存在，請重新上傳檔案');
  const staged = JSON.parse(cached);
  if (staged.employeeId !== employeeId) throw new Error('預覽與確認的操作者不一致');
  const kind = reportUploadKind_(staged.kind);
  const spec = REPORT_UPLOAD_KINDS[kind];
  const folder = privateDashboardFolder();
  const stamp = reportUploadStamp_();
  const stages = [];
  let overall = 'ok';
  let backupName = '';
  let message = '';

  // KPI 不接受同日／舊日期強制覆寫；既有 award JSON 路徑不在本階段調整。
  const incoming = {
    dataDate: staged.dataDate, source: 'manual-upload', fileHash: staged.fileHash,
    fileName: staged.fileName, operator: employeeId, force: !!(payload || {}).force
  };
  if (kind === 'kpi') incoming.force = false;
  const decision = reportVersionDecide_(kind, incoming);
  if (!decision.accept) {
    reportVersionRecord_(kind, incoming, 'skipped', { skipRule: decision.rule });
    return {
      result: 'blocked', kind: kind, logId: '', stages: [
        reportUploadStage_('version', '版本衝突檢查', 'fail', decision.reason),
        reportUploadStage_('json', 'JSON／API', 'skip', '未執行，正式資料維持上一版')
      ],
      backupFile: '', dataDate: staged.dataDate, needsForce: true,
      message: decision.reason, live: reportUploadLiveInfo_(kind)
    };
  }

  function fail(stage, err) {
    overall = 'error';
    message = message || (err && err.message ? err.message : String(err));
    stages.push(reportUploadStage_(stage[0], stage[1], 'fail', err && err.message ? err.message : String(err)));
  }

  // 1) 原始檔備份至私人 Google Drive
  let rawFile = null;
  try {
    rawFile = DriveApp.getFileById(staged.rawFileId);
    rawFile.setName(spec.rawPrefix + stamp + '-' + staged.fileName);
    stages.push(reportUploadStage_('raw_backup', '原始檔備份', 'ok', rawFile.getName()));
  } catch (err) {
    fail(['raw_backup', '原始檔備份'], err);
  }

  // 2) 既有 Google Sheet：本流程刻意不改既有試算表結構（原則 2），
  //    只在私有名冊試算表另開稽核用分頁記錄，正式資料仍走 JSON。
  stages.push(reportUploadStage_('sheet', 'Google Sheet', 'skip',
    spec.label + ' 正式資料存於私有 Drive JSON，未使用既有試算表（僅寫入稽核紀錄分頁）'));

  // 3) 備份目前正式資料
  let liveFile = null;
  let previousText = '';
  if (overall === 'ok') {
    try {
      liveFile = reportUploadFileByName_(spec.liveFile);
      if (liveFile) {
        previousText = liveFile.getBlob().getDataAsString('UTF-8');
        backupName = spec.backupPrefix + stamp + '.json';
        folder.createFile(Utilities.newBlob(previousText, 'application/json', backupName));
        stages.push(reportUploadStage_('backup_current', '備份目前正式資料', 'ok', backupName));
      } else {
        stages.push(reportUploadStage_('backup_current', '備份目前正式資料', 'skip', '目前沒有正式資料（首次發佈）'));
      }
    } catch (err) {
      fail(['backup_current', '備份目前正式資料'], err);
    }
  }

  // 4) 更新 JSON／API（正式資料在這一步、也只在這一步被改寫）
  let newText = '';
  if (overall === 'ok') {
    try {
      const stagingFile = reportUploadFileByName_(staged.stagingName);
      if (!stagingFile) throw new Error('找不到暫存資料檔，請重新上傳');
      newText = stagingFile.getBlob().getDataAsString('UTF-8');
      if (liveFile) liveFile.setContent(newText);
      else folder.createFile(Utilities.newBlob(newText, 'application/json', spec.liveFile));
      stages.push(reportUploadStage_('json', 'JSON／API', 'ok', spec.liveFile));
    } catch (err) {
      fail(['json', 'JSON／API'], err);
    }
  } else {
    stages.push(reportUploadStage_('json', 'JSON／API', 'skip', '前一階段失敗，正式資料維持上一版'));
  }

  // 5) 確認網站可取得新資料（讀回驗證；失敗就立刻還原，不留半套更新）
  if (overall === 'ok') {
    try {
      const check = reportUploadLiveInfo_(kind);
      if (!check) throw new Error('讀回正式資料失敗');
      if (staged.dataDate && check.dataDate && check.dataDate !== staged.dataDate) {
        throw new Error('讀回的資料日期 ' + check.dataDate + ' 與上傳的 ' + staged.dataDate + ' 不符');
      }
      stages.push(reportUploadStage_('verify', '網站讀取確認', 'ok', check.label || check.dataDate));
      stages.push(reportUploadStage_('site', spec.targets.site, 'ok', '已指向新資料'));
    } catch (err) {
      try {
        if (liveFile && previousText) { liveFile.setContent(previousText); }
        message = (err && err.message ? err.message : String(err)) + '（已自動還原上一版）';
      } catch (restoreError) {
        message = '讀回驗證失敗且還原也失敗：' + restoreError;
      }
      overall = 'error';
      stages.push(reportUploadStage_('verify', '網站讀取確認', 'fail', message));
      stages.push(reportUploadStage_('site', spec.targets.site, 'kept', '維持上一版'));
    }
  } else {
    stages.push(reportUploadStage_('verify', '網站讀取確認', 'skip', '未執行'));
    stages.push(reportUploadStage_('site', spec.targets.site, 'kept', '維持上一版'));
  }

  // 6) 智慧營運中心：KPI 與台獎讀的是兩份不同快照，互不覆蓋。
  if (kind === 'award') {
    stages.push(reportUploadStage_('ops', spec.targets.ops, overall === 'ok' ? 'ok' : 'kept',
      overall === 'ok' ? '台獎戰情快照已更新' : '維持上一版'));
  } else {
    stages.push(reportUploadStage_('ops', spec.targets.ops, 'kept',
      'KPI 上傳不動戰情快照，智慧營運中心維持上一版（需另外更新台獎）'));
  }

  // 7) 寫入更新狀態（稽核紀錄）
  const logId = stamp + '-' + kind;
  try {
    const sheet = privateDashboardSheet(REPORT_UPLOAD_LOG_SHEET, REPORT_UPLOAD_LOG_HEADERS);
    privateDashboardWriteObject(sheet, REPORT_UPLOAD_LOG_HEADERS, sheet.getLastRow() + 1, {
      log_id: logId, kind: kind, employee_id: employeeId, file_name: staged.fileName,
      data_date: staged.dataDate, acted_at: privateDashboardNow(),
      result: overall === 'ok' ? 'success' : 'failed',
      stages: stages.map(function(s) { return s.key + ':' + s.status; }).join(','),
      backup_file: backupName, message: message
    });
    stages.push(reportUploadStage_('log', '更新紀錄', 'ok', logId));
  } catch (err) {
    stages.push(reportUploadStage_('log', '更新紀錄', 'fail', err && err.message ? err.message : String(err)));
  }

  // 清掉暫存資料檔與 token（原始檔已改名保留為備份）
  reportUploadTrash_(reportUploadFileByName_(staged.stagingName));
  reportUploadCache_().remove('rupload_' + token);

  // 只有整段成功才登記為正式版本；失敗時正式資料已還原，版本狀態不能動
  reportVersionRecord_(kind, incoming, overall === 'ok' ? 'success' : 'failed',
    { rule: decision.rule, versionBackup: backupName });

  if (overall === 'ok') {
    kpiCalcNotify('✅ ' + spec.label + '戰報快速更新成功（' + staged.fileName + '）',
      '操作者員編：' + employeeId + '\n資料日期：' + (staged.dataDate || '-') +
      '\n備份檔：' + (backupName || '無（首次發佈）') +
      '\n來源：網站戰報快速更新（M+／OneDrive 備援入口）');
  }

  return {
    result: overall, kind: kind, logId: logId, stages: stages,
    backupFile: backupName, dataDate: staged.dataDate, message: message,
    live: reportUploadLiveInfo_(kind)
  };
}

// ── 更新紀錄與回復上一版 ──────────────────────────────────
function reportUploadLog(payload) {
  reportUploadAuthorize_(payload);
  const limit = Math.min(50, Math.max(1, Number((payload || {}).limit || 20)));
  const sheet = privateDashboardSheet(REPORT_UPLOAD_LOG_SHEET, REPORT_UPLOAD_LOG_HEADERS);
  const rows = privateDashboardRows(sheet, REPORT_UPLOAD_LOG_HEADERS);
  return {
    entries: rows.slice(-limit).reverse(),
    live: { kpi: reportUploadLiveInfo_('kpi'), award: reportUploadLiveInfo_('award') }
  };
}

// 回復上一個成功版本：把最近一份備份寫回正式檔（KPI／台獎各自獨立）。
function reportUploadRollback(payload) {
  const employeeId = reportUploadAuthorize_(payload);
  const kind = reportUploadKind_((payload || {}).kind);
  const spec = REPORT_UPLOAD_KINDS[kind];
  const folder = privateDashboardFolder();
  const wanted = String((payload || {}).backupFile || '');
  let target = null;
  const files = folder.getFiles();
  while (files.hasNext()) {
    const f = files.next();
    const name = f.getName();
    if (name.indexOf(spec.backupPrefix) !== 0) continue;
    if (wanted && name !== wanted) continue;
    if (!target || f.getLastUpdated() > target.getLastUpdated()) target = f;
  }
  if (!target) throw new Error('找不到可回復的備份檔');

  const text = target.getBlob().getDataAsString('UTF-8');
  const parsed = JSON.parse(text);
  const valid = kind === 'kpi'
    ? !!(parsed && parsed.meta && parsed.stores && parsed.persons)
    : !!(parsed && parsed.kpiBattle && parsed.awardsBattle);
  if (!valid) throw new Error('備份檔格式不完整，拒絕回復');

  const liveFile = reportUploadFileByName_(spec.liveFile);
  if (liveFile) liveFile.setContent(text);
  else folder.createFile(Utilities.newBlob(text, 'application/json', spec.liveFile));

  // 回復後登記為 rollback 版本：排程之後不得用同日期的舊檔把它蓋回去
  const restoredDate = kind === 'kpi'
    ? reportUploadKpiDate_((parsed || {}).meta)
    : String(((parsed || {}).kpiBattle || {}).report_date || '');
  reportVersionRecord_(kind, {
    dataDate: restoredDate, source: 'rollback', fileHash: reportVersionHash_(text),
    fileName: target.getName(), operator: employeeId
  }, 'success', { rule: 'rollback' });

  const stamp = reportUploadStamp_();
  try {
    const sheet = privateDashboardSheet(REPORT_UPLOAD_LOG_SHEET, REPORT_UPLOAD_LOG_HEADERS);
    privateDashboardWriteObject(sheet, REPORT_UPLOAD_LOG_HEADERS, sheet.getLastRow() + 1, {
      log_id: stamp + '-' + kind + '-rollback', kind: kind, employee_id: employeeId,
      file_name: target.getName(), data_date: '', acted_at: privateDashboardNow(),
      result: 'rollback', stages: 'rollback:ok', backup_file: target.getName(), message: '回復上一個成功版本'
    });
  } catch (e) { console.log('report upload rollback log failed: ' + e); }

  return { restored: target.getName(), kind: kind, live: reportUploadLiveInfo_(kind) };
}

// ════════════════════════════════════════════════════════════════
// 資料版本狀態與防衝突（2026-07-31 Liam 指示補上）
//
// 問題：11:00 排程與網站手動上傳是兩條互不知情的寫入路徑。
// 若 10:55 手動上傳了 0731 資料，11:00 排程掃到來源資料夾的 0731.xlsx
// 仍會照寫一次；若手動上傳的是更正後版本，就會被排程的舊檔覆蓋。
//
// 解法：每次寫入正式資料都登記一筆版本狀態（指令碼屬性 REPORT_UPDATE_STATE），
// 任何寫入前先問 reportVersionDecide_() 能不能寫。
//
// 判斷規則（rule 值會寫進通知信與紀錄，方便事後追）：
//   1. 資料日期較新                    → 一律接受
//   2. 資料日期較舊                    → 拒絕（manual-upload 可帶 force 覆寫）
//   3. 同日期 + 檔案雜湊相同            → 略過（同一份檔案，不必重寫）
//   4. 同日期 + 目前版本來自 manual-upload／rollback + 新來源是 scheduled／onedrive
//                                      → 拒絕（這就是 11:00 蓋掉 10:55 的情境）
//   5. 同日期 + 其餘情形                → 接受（後到的視為更正版）
// ════════════════════════════════════════════════════════════════

const REPORT_VERSION_PROP = 'REPORT_UPDATE_STATE';
const REPORT_VERSION_SOURCES = ['scheduled', 'onedrive', 'manual-upload', 'rollback', 'external-publish'];
// 手動性質的來源：排程不得覆蓋這些來源的同日期資料
const REPORT_VERSION_MANUAL_SOURCES = ['manual-upload', 'rollback'];
const REPORT_VERSION_AUTO_SOURCES = ['scheduled', 'onedrive'];

function reportVersionState_() {
  try {
    const raw = PropertiesService.getScriptProperties().getProperty(REPORT_VERSION_PROP);
    const parsed = raw ? JSON.parse(raw) : null;
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) {
    console.log('report version state unreadable: ' + e);
    return {};
  }
}

function reportVersionGet_(kind) {
  const state = reportVersionState_();
  return state[kind] || null;
}

// 寫入版本狀態。永遠不讓這裡的失敗影響資料更新本身。
function reportVersionSet_(kind, meta) {
  try {
    const state = reportVersionState_();
    state[kind] = meta;
    PropertiesService.getScriptProperties().setProperty(REPORT_VERSION_PROP, JSON.stringify(state));
  } catch (e) {
    console.log('report version state write failed: ' + e);
  }
}

function reportVersionId_(kind, source) {
  return [reportUploadStamp_(), kind, source, Utilities.getUuid().slice(0, 8)].join('-');
}

function reportVersionHash_(input) {
  try {
    const bytes = typeof input === 'string'
      ? Utilities.newBlob(input).getBytes()
      : input;
    return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, bytes)
      .map(function(b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  } catch (e) {
    console.log('report version hash failed: ' + e);
    return '';
  }
}

// incoming: { dataDate, source, fileHash, fileName, operator, force }
// 回傳 { accept, rule, reason }
function reportVersionDecide_(kind, incoming) {
  const current = reportVersionGet_(kind);
  const source = String((incoming || {}).source || '');
  const dataDate = String((incoming || {}).dataDate || '');
  const fileHash = String((incoming || {}).fileHash || '');
  const force = !!(incoming || {}).force;

  if (!current || !current.dataDate) {
    return { accept: true, rule: 'first-version', reason: '目前沒有版本紀錄，視為首次寫入' };
  }
  if (dataDate && dataDate > current.dataDate) {
    return { accept: true, rule: 'newer-date', reason: '資料日期 ' + dataDate + ' 比目前 ' + current.dataDate + ' 新' };
  }
  if (dataDate && dataDate < current.dataDate) {
    if (force && REPORT_VERSION_MANUAL_SOURCES.indexOf(source) !== -1) {
      return { accept: true, rule: 'forced-older', reason: '操作者強制覆寫較舊資料 ' + dataDate };
    }
    return { accept: false, rule: 'older-date',
      reason: '資料日期 ' + dataDate + ' 比目前正式版本 ' + current.dataDate + ' 舊，拒絕覆蓋' };
  }
  // 以下為同日期
  if (fileHash && current.fileHash && fileHash === current.fileHash) {
    return { accept: false, rule: 'same-hash',
      reason: '與目前正式版本是同一個檔案（雜湊相同），不需重複寫入' };
  }
  if (REPORT_VERSION_AUTO_SOURCES.indexOf(source) !== -1 &&
      REPORT_VERSION_MANUAL_SOURCES.indexOf(current.source) !== -1) {
    if (force) {
      return { accept: true, rule: 'forced-over-manual', reason: '強制覆寫手動版本' };
    }
    return { accept: false, rule: 'manual-wins',
      reason: '同日期 ' + dataDate + ' 已由 ' + current.source + ' 於 ' +
              (current.uploadedAt || '(未知時間)') + ' 更新，排程不覆蓋手動上傳的資料' };
  }
  return { accept: true, rule: 'same-date-replace',
    reason: '同日期資料，後到的視為更正版本' };
}

// 統一的版本登記入口。updateStatus：success / skipped / failed
function reportVersionRecord_(kind, incoming, updateStatus, extra) {
  const meta = {
    reportType: kind,
    dataDate: String((incoming || {}).dataDate || ''),
    source: String((incoming || {}).source || ''),
    uploadedAt: privateDashboardNow(),
    fileName: String((incoming || {}).fileName || ''),
    fileHash: String((incoming || {}).fileHash || ''),
    operator: String((incoming || {}).operator || ''),
    versionId: reportVersionId_(kind, String((incoming || {}).source || 'unknown')),
    updateStatus: updateStatus
  };
  if (extra) Object.keys(extra).forEach(function(k) { meta[k] = extra[k]; });
  // 只有真正寫進正式資料才更新狀態，否則會把「被拒絕的版本」誤記成正式版本
  if (updateStatus === 'success') reportVersionSet_(kind, meta);
  return meta;
}

// 供 GAS 編輯器手動查詢目前兩邊的版本狀態
function reportVersionStatus() {
  return { state: reportVersionState_(), sources: REPORT_VERSION_SOURCES };
}
