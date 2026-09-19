Warning: truncated output (original token count: 61557)
Total output lines: 5098

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
      mileageContracts: ['patrol-mileage-month-v1', 'patrol-mileage-visits-v2'],
      dashboardContracts: [PATROL_DASHBOARD_CONTRACT]
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

  // ── 巡店追蹤：新版 25 題完整看板單次唯讀（向下相容新增 action）──
  if (action === 'ptdashboard') {
    try {
      ptRequireSession_(e.parameter.token, action);
      return jsonResponse(readPatrolDashboard_({ month:patrolSummaryMonth_(e.parameter.month) }));
    } catch(err) {
      return jsonResponse(ptRouteErrorPayload_(err, action, e.parameter.token), cb);
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

function ptDashboardPostPayload_(payload) {
  const body = payload || {};
  ptRequireSession_(body.token, 'ptdashboard');
  return readPatrolDashboard_({ month:patrolSummaryMonth_(body.month) });
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
const PATROL_DASHBOARD_CONTRACT = 'patrol-dashboard-sep25-v1';
const PATROL_DASHBOARD_VERSION = 1;
const PATROL_DASHBOARD_MAX_ROWS = 5000;
const PATROL_DASHBOARD_TOTAL_ITEMS = 25;
const PATROL_DASHBOARD_MONTHLY_ITEMS = [1,2,3,4,5,6,7,8,9];
const PATROL_DASHBOARD_BIMONTHLY_ITEMS = [10];
const PATROL_DASHBOARD_NCC_ITEMS = [11,12,13,14,15,16,17,18,19,20,21,22,23,24,25];
const PATROL_DASHBOARD_MIN_GAP_DAYS = 7;

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

// ── 新版 25 題完整看板：單次 A:L scan，summary-only response；完整列仍由 ptdetail 按需讀取 ──
function patrolDashboardMonths_(month) {
  return ptWinMonths(month).filter(function(value) { return value <= month; });
}

function patrolDashboardStoreKey_(value) {
  return String(value || '').replace('台灣大哥大數位生活', '').replace(/^台北/, '').replace(/\s+/g, '').trim();
}

function patrolDashboardRowsForStore_(rows, store) {
  const code = String(store && store.code || '');
  const key = patrolDashboardStoreKey_(store && store.name);
  return (Array.isArray(rows) ? rows : []).filter(function(row) {
    return (code && String(row && row.code || '') === code) || patrolDashboardStoreKey_(row && row.store) === key;
  });
}

function patrolDashboardDate_(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
    const parsed = new Date(text);
    if (!isNaN(parsed.getTime())) return Utilities.formatDate(parsed, 'Asia/Taipei', 'yyyy-MM-dd');
  }
  const match = text.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
  return match ? match[1] + '-' + ('0' + Number(match[2])).slice(-2) + '-' + ('0' + Number(match[3])).slice(-2) : '';
}

function patrolDashboardFillDate_(row) {
  return patrolDashboardDate_(row && (row.fillTime || row.arriveTime || row.date));
}

function patrolDashboardVisitDate_(row) {
  return patrolDashboardDate_(row && (row.arriveTime || row.fillTime || row.date));
}

function patrolDashboardRowMonth_(row) {
  const explicit = String(row && row.month || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(explicit) ? explicit : patrolDashboardFillDate_(row).slice(0, 7);
}

function patrolDashboardIsoDayGap_(first, second) {
  const start = Date.parse(String(first || '') + 'T00:00:00Z');
  const end = Date.parse(String(second || '') + 'T00:00:00Z');
  return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86400000) : 0;
}

function patrolDashboardAddDays_(value, days) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.getUTCFullYear() + '-' + ('0' + (date.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + date.getUTCDate()).slice(-2);
}

function patrolDashboardVisitCadence_(rows, store, month) {
  const dates = [];
  const seen = {};
  patrolDashboardRowsForStore_(rows, store).forEach(function(row) {
    if (patrolDashboardRowMonth_(row) !== month) return;
    const date = patrolDashboardVisitDate_(row);
    if (date && !seen[date]) { seen[date] = true; dates.push(date); }
  });
  dates.sort();
  const firstVisit = dates[0] || '';
  const nextEligibleDate = firstVisit ? patrolDashboardAddDays_(firstVisit, PATROL_DASHBOARD_MIN_GAP_DAYS) : '';
  const secondVisit = firstVisit ? dates.find(function(date) {
    return patrolDashboardIsoDayGap_(firstVisit, date) >= PATROL_DASHBOARD_MIN_GAP_DAYS;
  }) || '' : '';
  return {
    target:2, minGapDays:PATROL_DASHBOARD_MIN_GAP_DAYS, recordedVisits:dates.length,
    qualifyingVisits:secondVisit ? 2 : (firstVisit ? 1 : 0), completed:Boolean(secondVisit),
    firstVisit:firstVisit, secondVisit:secondVisit, nextEligibleDate:nextEligibleDate,
    gapDays:secondVisit ? patrolDashboardIsoDayGap_(firstVisit, secondVisit) : 0, dates:dates
  };
}

function patrolDashboardItemStatus_(rows, month, itemNo) {
  const item = Number(itemNo);
  const relevantMonths = item === 10 ? ptWinMonths(month) : [month];
  const match = (Array.isArray(rows) ? rows : []).find(function(row) {
    return Number(row && row.item) === item && relevantMonths.indexOf(patrolDashboardRowMonth_(row)) !== -1 && String(row && row.result || '').trim().toLowerCase() === 'v';
  });
  if (match) return {status:'done', date:patrolDashboardFillDate_(match)};
  return {status:'miss', detail:item === 10 ? '本期(' + Number(relevantMonths[0].slice(5)) + '–' + Number(relevantMonths[1].slice(5)) + '月)未完成' : item >= 11 ? 'NCC每月宣導1次' : '每月執行1次'};
}

function patrolDashboardGroupProgress_(rows, month, itemNumbers) {
  const items = itemNumbers.map(function(itemNo) {
    return Object.assign({no:itemNo}, patrolDashboardItemStatus_(rows, month, itemNo));
  });
  const completed = items.filter(function(item) { return item.status === 'done'; }).length;
  return {
    completed:completed, total:items.length, missing:items.length - completed,
    missingItems:items.filter(function(item) { return item.status !== 'done'; }).map(function(item) { return item.no; })
  };
}

function patrolDashboardStoreSummary_(rows, store, month) {
  const storeRows = patrolDashboardRowsForStore_(rows, store);
  const currentRows = storeRows.filter(function(row) { return patrolDashboardRowMonth_(row) === month; });
  const visits = patrolDashboardVisitCadence_(rows, store, month);
  const monthly = patrolDashboardGroupProgress_(storeRows, month, PATROL_DASHBOARD_MONTHLY_ITEMS);
  const bimonthly = patrolDashboardGroupProgress_(storeRows, month, PATROL_DASHBOARD_BIMONTHLY_ITEMS);
  const ncc = patrolDashboardGroupProgress_(storeRows, month, PATROL_DASHBOARD_NCC_ITEMS);
  const missingItemNumbers = monthly.missingItems.concat(bimonthly.missingItems, ncc.missingItems);
  const dates = currentRows.map(patrolDashboardFillDate_).filter(Boolean).sort();
  const questionsComplete = missingItemNumbers.length === 0;
  return {
    name:String(store && (store.name || store.store) || ''), code:String(store && store.code || ''),
    visited:currentRows.length > 0, done:PATROL_DASHBOARD_TOTAL_ITEMS - missingItemNumbers.length,
    missingItems:missingItemNumbers.length, missingItemNumbers:missingItemNumbers,
    pct:Math.round((PATROL_DASHBOARD_TOTAL_ITEMS - missingItemNumbers.length) / PATROL_DASHBOARD_TOTAL_ITEMS * 100),
    status:currentRows.length ? (questionsComplete && visits.completed ? 'complete' : 'attention') : 'pending',
    questionsComplete:questionsComplete, visits:visits,
    lastVisit:dates.length ? dates[dates.length - 1] : '', monthly:monthly, bimonthly:bimonthly, ncc:ncc
  };
}

function patrolDashboardOverview_(rows, month) {
  const stores = PT_STORES.map(function(store) { return patrolDashboardStoreSummary_(rows, store, month); });
  const visited = stores.filter(function(store) { return store.visited; });
  return {
    month:month, totalStores:stores.length, visitedStores:visited.length,
    fullyDoneStores:visited.filter(function(store) { return store.status === 'complete'; }).length,
    questionCompleteStores:visited.filter(function(store) { return store.questionsComplete; }).length,
    visitCadenceCompleteStores:visited.filter(function(store) { return store.visits.completed; }).length,
    totalMissingItems:visited.reduce(function(sum, store) { return sum + store.missingItems; }, 0),
    unvisitedStores:stores.filter(function(store) { return !store.visited; }).map(function(store) { return store.name; }),
    stores:stores, groups:{monthly:PATROL_DASHBOARD_MONTHLY_ITEMS, bimonthly:PATROL_DASHBOARD_BIMONTHLY_ITEMS, ncc:PATROL_DASHBOARD_NCC_ITEMS},
    window:(function() {
      const months = ptWinMonths(month);
      return {months:months, label:Number(months[0].slice(5)) + '–' + Number(months[1].slice(5)) + '月'};
    })(), totalItems:PATROL_DASHBOARD_TOTAL_ITEMS
  };
}

function readPatrolDashboard_(options) {
  const month = patrolSummaryMonth_(options && options.month);
  if (month < '2026-09') throw new Error('ptdashboard_requires_sep25_contract');
  if (PT_STORES.length !== 9) throw new Error('ptdashboard_store_contract_mismatch');
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(PATROL_SHEET);
  if (!sheet) throw new Error('ptdashboard_source_missing');
  const meta = patrolSummarySourceMeta_(sheet);
  const cache = CacheService.getScriptCache();
  const cacheKey = 'ptdashboard:' + month + ':' + Utilities.base64EncodeWebSafe(meta.sourceVersion).slice(0, 80);
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const months = patrolDashboardMonths_(month);
  const allRows = readPatrolContractColumns_(sheet);
  const sourceRows = allRows.filter(function(row) {
    return months.indexOf(patrolDashboardRowMonth_(row)) !== -1 && PT_STORES.some(function(store) {
      return patrolDashboardRowsForStore_([row], store).length > 0;
    });
  });
  if (sourceRows.length > PATROL_DASHBOARD_MAX_ROWS) throw new Error('ptdashboard_row_cap_exceeded');
  const rowCount = sourceRows.filter(function(row) {
    const item = Number(row && row.item);
    return item >= 1 && item <= PATROL_DASHBOARD_TOTAL_ITEMS;
  }).length;
  const result = {
    status:'ok', contract:PATROL_DASHBOARD_CONTRACT, version:PATROL_DASHBOARD_VERSION,
    month:month, months:months, stores:PT_STORES, storeCount:PT_STORES.length,
    rowCount:rowCount, sourceRowCount:sourceRows.length, maxRows:PATROL_DASHBOARD_MAX_ROWS,
    summary:patrolDashboardOverview_(sourceRows, month),
    sourceVersion:String(meta.sourceVersion || ''), sourceUpdatedAt:String(meta.sourceUpdatedAt || ''),
    generatedAt:Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX")
  };
  const serialized = JSON.stringify(result);
  if (serialized.length >= 95000) throw new Error('ptdashboard_response_too_large');
  cache.put(cacheKey, serialized, PATROL_SUMMARY_CACHE_SECONDS);
  return result;
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

  // 每個 request 以單次 A:L scan 產生完整月份的 v1 分…31557 tokens truncated…表
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
// 就只服務 report_upload_* 四個路由——其餘 read/write/巡店/戰情一律拒絕，
// 確保上傳功能的部署動作完全影響不到每日回報與其他系統。
const REPORT_UPLOAD_ALLOWED_ACTIONS = [
  'report_upload_preview', 'report_upload_commit', 'report_upload_log', 'report_upload_rollback'
];

// 上傳頁與上傳 API 同屬新 Deployment，使用 google.script.run 直接呼叫這四個包裝函式。
// 不從 GitHub Pages fetch，不需要 CORS／preflight，也不把任何設定值注入 HTML。
function reportUploadHtmlService_() {
  return HtmlService.createHtmlOutputFromFile('ReportUpload')
    .setTitle('北一二B 戰報快速更新');
}

function report_upload_preview(payload) { return reportUploadPreview(payload); }
function report_upload_commit(payload) { return reportUploadCommit(payload); }
function report_upload_log(payload) { return reportUploadLog(payload); }
function report_upload_rollback(payload) { return reportUploadRollback(payload); }

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

function reportUploadValidateKpi_(data, live) {
  const checks = [];
  const meta = (data && data.meta) || {};
  const stores = (data && data.stores) || [];
  const persons = (data && data.persons) || [];

  checks.push(reportUploadCheck_('sheets', '工作表名稱', 'ok', '店點達成率＋個人達成率皆已讀到'));
  checks.push(reportUploadCheck_('fields', '必要欄位', 'ok', KPICALC_ITEMS.length + ' 項加權欄位齊全'));
  checks.push(reportUploadCheck_('period', '資料期間', meta.period ? 'ok' : 'block', meta.period || '讀不到期間'));

  reportUploadDateChecks_(reportUploadKpiDate_(meta), live).forEach(function(c) { checks.push(c); });

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

  // 版本衝突把關：手動上傳可由操作者勾選強制覆寫，但必須是明示的
  const incoming = {
    dataDate: staged.dataDate, source: 'manual-upload', fileHash: staged.fileHash,
    fileName: staged.fileName, operator: employeeId, force: !!(payload || {}).force
  };
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
