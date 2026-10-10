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
  'management_focus_json',
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
const REPORT_AWARD_MONTH_IDS = {
  '2026-09': ["pixel-10a","s26u-zfold8-family","pixel-11-pro-family","s26-256g","pixel-11","vivo-v70fe","oppo-r16f","samsung-a57","oppo-a6x","samsung-a27"],
  '2026-10': ["zfold8-family","pixel-10a","pixel-11-pro-family","s26-ultra","pixel-11","s26-family","oppo-r16f","samsung-a57","vivo-v80-lite","oppo-a6x-a7pro"]
};
function reportAwardModelIds_(date) {
  return REPORT_AWARD_MONTH_IDS[String(date || '').slice(0,7)] || REPORT_AWARD_MODEL_IDS;
}
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

function normalizeReportAwardModels_(input, date, historicalRead) {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('awardModels 必須是物件');
  }
  const keys = Object.keys(input);
  const ids = reportAwardModelIds_(date);
  const knownIds = historicalRead
    ? REPORT_AWARD_MODEL_IDS.concat(...Object.keys(REPORT_AWARD_MONTH_IDS).map(month=>REPORT_AWARD_MONTH_IDS[month])) : ids;
  const unknown = keys.filter(k => knownIds.indexOf(k) === -1);
  if (unknown.length) throw new Error('未知 modelId：' + unknown.join('、'));
  const out = {};
  ids.forEach(id => {
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
  const normalized = normalizeReportAwardModels_(awardModels, date);
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
    try { awardModels = normalizeReportAwardModels_(JSON.parse(String(values[i][3] || '{}')), date, true); } catch (err) { throw new Error('ReportAwardModels 資料無效：' + err.message); }
    result[String(values[i][2])] = {
      awardModels,
      schemaVersion: String(values[i][4] || ''),
      versionId: String(values[i][5] || ''),
      savedAt: display[i][6] || String(values[i][6] || '')
    };
  }
  return result;
}

function mapLegacyAwardModels_(record, date) {
  const awardModels = {};
  const ids = reportAwardModelIds_(date);
  ids.forEach(id => { awardModels[id] = null; });
  const unmappedLegacyFields = [];
  Object.keys(REPORT_AWARD_SAFE_LEGACY_MAP).forEach(key => {
    const value = record && record[key];
    if (ids.indexOf(REPORT_AWARD_SAFE_LEGACY_MAP[key]) >= 0 && value !== null && value !== undefined && value !== '') awardModels[REPORT_AWARD_SAFE_LEGACY_MAP[key]] = value;
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
      const mapped = mapLegacyAwardModels_(result[store], date);
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
      mileageContracts: ['patrol-mileage-month-v1', 'patrol-mileage-visits-v2', 'patrol-mileage-leg-master-v1'],
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
// New logins use the approved fixed 12-hour window. Existing tokens keep their signed exp.
const PATROL_SESSION_TTL_SECONDS = 43200;
// CacheService accepts at most 6 hours; authentication always checks signed expiry and revocation first.
const PATROL_SESSION_CACHE_TTL_SECONDS = 21600;
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
  CacheService.getScriptCache().put(ptSessionCacheKey_(token), String(claims.exp), Math.min(PATROL_SESSION_TTL_SECONDS, PATROL_SESSION_CACHE_TTL_SECONDS));
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
    cache.put(ptSessionCacheKey_(clean), String(claims.exp), Math.max(1, Math.min(PATROL_SESSION_CACHE_TTL_SECONDS, Number(claims.exp) - now)));
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

function ptMileageLegsReadPayload_(payload) {
  const body = payload || {};
  ptRequireSession_(body.token, 'ptmileage_legs_read');
  return {
    contract:'patrol-mileage-leg-master-v1',
    legs:readPatrolMileageLegs_()
  };
}

function ptMileageLegWritePayload_(payload) {
  const body = payload || {};
  ptRequireSession_(body.token, 'ptmileage_leg_write');
  return {
    contract:'patrol-mileage-leg-master-v1',
    leg:writePatrolMileageLeg_(body)
  };
}

// ════════════════════════════════════
// 每日移動里程人工路段主檔（獨立工作表）
// 不修改「巡店明細」schema 或任何既有巡店列。
// routeKey 依兩端 canonical 名稱排序，故正向／反向共用同一筆正式人工距離。
// ════════════════════════════════════
const PATROL_MILEAGE_LEG_SHEET = '巡店里程路段主檔';
const PATROL_MILEAGE_LEG_HEADERS = ['routeKey','from','to','km','source','confirmedAt','createdAt','updatedAt'];
const PATROL_MILEAGE_LEG_NODES = [
  '台北酒泉','台北大稻埕','台北三創','台北六張犁','台北復興南',
  '台北萬大','台北通化','台北永吉','台北杭州南','台北電信'
];

function patrolMileageLegNode_(value) {
  const raw = String(value || '').replace(/\s+/g, '');
  const match = PATROL_MILEAGE_LEG_NODES.find(function(name) {
    const canonical = String(name).replace(/\s+/g, '');
    return raw === canonical || raw === canonical.replace(/^台北/, '');
  });
  if (!match) throw new Error('invalid mileage leg node');
  return match;
}

function patrolMileageLegKey_(fromValue, toValue) {
  const from = patrolMileageLegNode_(fromValue);
  const to = patrolMileageLegNode_(toValue);
  if (from === to) throw new Error('mileage leg endpoints must differ');
  return [from, to].sort().join('|');
}

function patrolMileageLegSheet_(create) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(PATROL_MILEAGE_LEG_SHEET);
  if (!sheet && create) {
    sheet = spreadsheet.insertSheet(PATROL_MILEAGE_LEG_SHEET);
  }
  if (sheet && sheet.getLastRow() === 0 && create) {
    sheet.appendRow(PATROL_MILEAGE_LEG_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange('A:H').setNumberFormat('@');
  }
  if (sheet && sheet.getLastRow() > 0) {
    const headers = sheet.getRange(1, 1, 1, PATROL_MILEAGE_LEG_HEADERS.length).getDisplayValues()[0];
    if (PATROL_MILEAGE_LEG_HEADERS.some(function(header, index) { return String(headers[index] || '') !== header; })) {
      throw new Error('invalid mileage leg master headers');
    }
  }
  return sheet;
}

function patrolMileageLegRecord_(row) {
  const key = String(row[0] || '').trim();
  const from = patrolMileageLegNode_(row[1]);
  const to = patrolMileageLegNode_(row[2]);
  const expectedKey = patrolMileageLegKey_(from, to);
  const km = Number(row[3]);
  const source = String(row[4] || '').trim();
  if (key !== expectedKey || !Number.isFinite(km) || km < 0.1 || km > 999 || source !== '人工確認') throw new Error('invalid mileage leg master row');
  return {
    routeKey:key, from:from, to:to, km:Math.round(km * 10) / 10,
    source:'人工確認', confirmedAt:String(row[5] || ''),
    createdAt:String(row[6] || ''), updatedAt:String(row[7] || '')
  };
}

function readPatrolMileageLegs_() {
  const sheet = patrolMileageLegSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, PATROL_MILEAGE_LEG_HEADERS.length).getDisplayValues()
    .filter(function(row) { return row.some(function(value) { return String(value || '').trim(); }); })
    .map(patrolMileageLegRecord_)
    .sort(function(left, right) { return left.routeKey.localeCompare(right.routeKey); });
}

function writePatrolMileageLeg_(payload) {
  const body = payload || {};
  const from = patrolMileageLegNode_(body.from);
  const to = patrolMileageLegNode_(body.to);
  const routeKey = patrolMileageLegKey_(from, to);
  const km = Math.round(Number(body.km) * 10) / 10;
  if (!Number.isFinite(km) || km < 0.1 || km > 999) throw new Error('mileage leg km must be between 0.1 and 999');
  const expectedUpdatedAt = String(body.expectedUpdatedAt || '');
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = patrolMileageLegSheet_(true);
    const rows = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, PATROL_MILEAGE_LEG_HEADERS.length).getDisplayValues();
    const index = rows.findIndex(function(row) { return String(row[0] || '').trim() === routeKey; });
    const existing = index >= 0 ? patrolMileageLegRecord_(rows[index]) : null;
    if (existing && expectedUpdatedAt !== existing.updatedAt) throw new Error('mileage leg changed; reload before updating');
    const now = Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX");
    const createdAt = existing ? existing.createdAt : now;
    const values = [routeKey, from, to, km, '人工確認', now, createdAt, now];
    if (existing) sheet.getRange(index + 2, 1, 1, values.length).setValues([values]);
    else sheet.appendRow(values);
    return patrolMileageLegRecord_(values);
  } finally {
    lock.releaseLock();
  }
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
    // key → { row: 試算表列號, values }
    const seen = {};
    for (let i = 1; i < data.length; i++) {
      seen[patrolKey(data[i][0], data[i][5], data[i][7])] =
        { row: i + 1, values: data[i].slice(0, 11).map(function(value) { return patrolTimeStr(value); }) };
    }
    const now = new Date().toISOString();
    const toAdd = [];
    let updated = 0;
    rows.forEach(r => {
      const k = patrolKey(r.fillTime, r.store, r.item);
      const ex = seen[k];
      const values = [
        patrolTimeStr(r.fillTime), String(r.arriveTime || ''), String(r.leaveTime || ''),
        String(r.district || ''), String(r.code || ''), String(r.store || ''), String(r.inspector || ''),
        String(r.item || ''), String(r.result || ''), String(r.reason || ''), String(r.month || '')
      ];
      if (ex) {
        // 同鍵資料以本次最新上傳為準，就地覆寫完整巡店內容。
        if (ex.row > 0 && JSON.stringify(values) !== JSON.stringify(ex.values)) {
          sh.getRange(ex.row, 1, 1, PATROL_HEADERS.length).setValues([[].concat(values, now)]);
          ex.values = values.slice();
          updated++;
        }
        return;
      }
      seen[k] = { row: -1, values: values.slice() };
      toAdd.push([].concat(values, now));
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
  // 第 1 項「督導打卡」保留在 25 項清單中供顯示，但不屬於巡店完成的必要條件。
  // 此處必須與前端 PatrolQuestionVersions 的 optional 規則一致。
  if (item === 1) return {status:'done', optional:true};
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

// ════════════════════════════════════
// 督導面談紀錄（獨立私有工作表）
// 只保留目前季度；員編不接受、不保存。名冊由同一份私有班表取得。
// ════════════════════════════════════
const SUPERVISOR_INTERVIEW_SHEET = '督導面談紀錄';
const SUPERVISOR_INTERVIEW_HEADERS = [
  'recordKey','quarter','sourceMonth','reporter','organization','interviewee','reason',
  'formStatus','interviewDate','filledDate','closedDate','guidance','feedback','createdAt','updatedAt'
];
const SUPERVISOR_INTERVIEW_CLIENT_FIELDS = [
  'reporter','organization','interviewee','reason','formStatus','interviewDate',
  'filledDate','closedDate','guidance','feedback','sourceMonth','quarter'
];

function supervisorInterviewNow_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function supervisorInterviewToday_() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
}

function supervisorInterviewQuarterForDate_(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new Error('面談日期格式不正確');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error('面談日期格式不正確');
  }
  return match[1] + '-Q' + Math.ceil(month / 3);
}

function supervisorInterviewCurrentQuarter_() {
  return supervisorInterviewQuarterForDate_(supervisorInterviewToday_());
}

function supervisorInterviewCurrentMonth_() {
  return supervisorInterviewToday_().slice(0, 7);
}

function supervisorInterviewSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SUPERVISOR_INTERVIEW_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(SUPERVISOR_INTERVIEW_SHEET);
    sheet.appendRow(SUPERVISOR_INTERVIEW_HEADERS);
    sheet.setFrozenRows(1);
    sheet.getRange('A:O').setNumberFormat('@');
  }
  const actual = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getDisplayValues()[0];
  if (actual.slice(0, SUPERVISOR_INTERVIEW_HEADERS.length).join('|') !== SUPERVISOR_INTERVIEW_HEADERS.join('|')) {
    throw new Error('督導面談紀錄欄位不一致，已停止讀寫');
  }
  return sheet;
}

function supervisorInterviewText_(value, limit, label) {
  const result = String(value == null ? '' : value).trim();
  if (result.length > limit) throw new Error(label + '過長');
  return result;
}

function supervisorInterviewOptionalDate_(value, label) {
  const result = supervisorInterviewText_(value, 10, label);
  if (!result) return '';
  try {
    supervisorInterviewQuarterForDate_(result);
  } catch (error) {
    throw new Error(label + '格式不正確');
  }
  return result;
}

function supervisorInterviewRecordKey_(row) {
  const material = [row.interviewDate, row.organization, row.interviewee, row.reason].join('|');
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, material);
  return bytes.map(function(byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function supervisorInterviewValidateRow_(raw, currentQuarter) {
  const row = {};
  Object.keys(raw || {}).forEach(function(key) {
    if (SUPERVISOR_INTERVIEW_CLIENT_FIELDS.indexOf(key) < 0) throw new Error('面談資料含不允許欄位');
  });
  row.reporter = supervisorInterviewText_(raw.reporter, 120, '填報人員');
  row.organization = supervisorInterviewText_(raw.organization, 120, '面談人員組織');
  row.interviewee = supervisorInterviewText_(raw.interviewee, 120, '面談人員');
  row.reason = supervisorInterviewText_(raw.reason, 120, '面談原因');
  row.formStatus = supervisorInterviewText_(raw.formStatus, 120, '表單狀態');
  row.interviewDate = supervisorInterviewOptionalDate_(raw.interviewDate, '面談日期');
  row.filledDate = supervisorInterviewOptionalDate_(raw.filledDate, '填表日期');
  row.closedDate = supervisorInterviewOptionalDate_(raw.closedDate, '結案日期');
  row.guidance = supervisorInterviewText_(raw.guidance, 2000, '建議與指導');
  row.feedback = supervisorInterviewText_(raw.feedback, 2000, '同仁回饋');
  row.sourceMonth = row.interviewDate.slice(0, 7);
  row.quarter = supervisorInterviewQuarterForDate_(row.interviewDate);
  if (!row.organization || !row.interviewee || !row.reason || !row.formStatus) throw new Error('面談資料缺少必要欄位');
  if (row.quarter !== currentQuarter) throw new Error('只能匯入目前季度的面談紀錄');
  if (String(raw.quarter || '') && String(raw.quarter) !== row.quarter) throw new Error('面談季度不一致');
  if (String(raw.sourceMonth || '') && String(raw.sourceMonth) !== row.sourceMonth) throw new Error('面談月份不一致');
  row.recordKey = supervisorInterviewRecordKey_(row);
  return row;
}

function supervisorInterviewRows_() {
  const sheet = supervisorInterviewSheet_();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, SUPERVISOR_INTERVIEW_HEADERS.length).getDisplayValues().map(function(values) {
    const row = {};
    SUPERVISOR_INTERVIEW_HEADERS.forEach(function(header, index) { row[header] = String(values[index] || ''); });
    return row;
  });
}

function supervisorInterviewRoster_() {
  const schedule = readSchedule(supervisorInterviewCurrentMonth_());
  const seen = {};
  const roster = [];
  (schedule.stores || []).forEach(function(store) {
    (store.staff || []).forEach(function(person) {
      const name = String(person.name || '').trim();
      const key = name.replace(/\s+/g, '');
      if (!key || seen[key]) return;
      seen[key] = true;
      roster.push({ name:name, store:String(store.store || ''), role:String(person.role || '') });
    });
  });
  roster.sort(function(a, b) { return a.store.localeCompare(b.store, 'zh-Hant') || a.name.localeCompare(b.name, 'zh-Hant'); });
  return { month:schedule.month, people:roster };
}

function supervisorInterviewReadPayload_(payload) {
  const body = payload || {};
  ptRequireSession_(body.token, 'interview_read');
  const currentQuarter = supervisorInterviewCurrentQuarter_();
  const roster = supervisorInterviewRoster_();
  const records = supervisorInterviewRows_().filter(function(row) { return row.quarter === currentQuarter; }).map(function(row) {
    const output = {};
    SUPERVISOR_INTERVIEW_CLIENT_FIELDS.forEach(function(field) { output[field] = row[field] || ''; });
    return output;
  });
  return { quarter:currentQuarter, rosterMonth:roster.month, roster:roster.people, records:records };
}

function supervisorInterviewWritePayload_(payload) {
  const body = payload || {};
  ptRequireSession_(body.token, 'interview_write');
  Object.keys(body).forEach(function(key) {
    if (['action','token','rows'].indexOf(key) < 0) throw new Error('面談寫入含不允許欄位');
  });
  const currentQuarter = supervisorInterviewCurrentQuarter_();
  const rawRows = Array.isArray(body.rows) ? body.rows : [];
  if (!rawRows.length || rawRows.length > 200) throw new Error('面談匯入筆數不正確');
  const rows = rawRows.map(function(row) { return supervisorInterviewValidateRow_(row, currentQuarter); });
  const keys = {};
  rows.forEach(function(row) {
    if (keys[row.recordKey]) throw new Error('面談檔案內有重複紀錄');
    keys[row.recordKey] = true;
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = supervisorInterviewSheet_();
    const existing = supervisorInterviewRows_();
    // 新季度首次成功寫入時，刪除上一季資料。讀取不刪資料，避免時鐘或空檔造成誤刪。
    for (let index = existing.length - 1; index >= 0; index -= 1) {
      if (existing[index].quarter !== currentQuarter) sheet.deleteRow(index + 2);
    }
    const current = supervisorInterviewRows_();
    const rowByKey = {};
    current.forEach(function(item, index) { rowByKey[item.recordKey] = index + 2; });
    let written = 0;
    let updated = 0;
    const now = supervisorInterviewNow_();
    rows.forEach(function(row) {
      const old = rowByKey[row.recordKey] ? current[rowByKey[row.recordKey] - 2] : null;
      const stored = Object.assign({}, row, { createdAt:old && old.createdAt ? old.createdAt : now, updatedAt:now });
      const values = SUPERVISOR_INTERVIEW_HEADERS.map(function(header) { return stored[header] || ''; });
      if (rowByKey[row.recordKey]) {
        sheet.getRange(rowByKey[row.recordKey], 1, 1, SUPERVISOR_INTERVIEW_HEADERS.length).setValues([values]);
        updated += 1;
      } else {
        sheet.getRange(sheet.getLastRow() + 1, 1, 1, SUPERVISOR_INTERVIEW_HEADERS.length).setValues([values]);
        written += 1;
      }
    });
    return { written:written, updated:updated, quarter:currentQuarter };
  } finally {
    lock.releaseLock();
  }
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

function readData(date, seg, include16) {
  const paired = include16 === true && Number(seg) === 21;
  const sh = getSheet();
  const lastRow = sh.getLastRow();
  const lastColumn = sh.getLastColumn();
  const headers = sh.getRange(1, 1, 1, lastColumn).getValues()[0];
  const dateIdx  = headers.indexOf('date');
  const storeIdx = headers.indexOf('store');
  const segIdx   = headers.indexOf('seg');
  const savedAtIdx = headers.lastIndexOf('savedAt');
  if (dateIdx < 0 || storeIdx < 0 || segIdx < 0) throw new Error('回報資料缺少 date/store/seg 欄位');
  if (lastRow < 2) return paired ? {data:{}, afternoon:{}} : {};

  // Read the date column first, then only the span containing this day's rows.
  // Do not assume chronological ordering: late updates and duplicate rows must
  // still be read in sheet order, with the latest matching row winning.
  const dates = sh.getRange(2, dateIdx + 1, lastRow - 1, 1).getValues();
  // Many rows share the same date. Format each timestamp only once per read;
  // keep Utilities' timezone semantics and discard this memo after returning.
  const formattedDates = new Map();
  function readDate(value) {
    if (!(value instanceof Date)) return toDateStr(value);
    const timestamp = value.getTime();
    if (!formattedDates.has(timestamp)) formattedDates.set(timestamp, toDateStr(value));
    return formattedDates.get(timestamp);
  }
  let first = -1, last = -1;
  for (let i = 0; i < dates.length; i++) {
    if (readDate(dates[i][0]) !== String(date)) continue;
    if (first < 0) first = i + 2;
    last = i + 2;
  }
  if (first < 0) return paired ? {data:{}, afternoon:{}} : {};
  const count = last - first + 1;
  const dataRange = sh.getRange(first, 1, count, lastColumn);
  const allData = dataRange.getValues();
  // savedAt 是純時間序號；使用試算表顯示值，避免被格式化為 1899-12-30。
  // Only this one column needs formatting, not the entire historical table.
  const displayTimes = savedAtIdx < 0 ? [] : sh.getRange(first, savedAtIdx + 1, count, 1).getDisplayValues();

  const result = {};
  const afternoon = {};
  for (let i = 0; i < allData.length; i++) {
    const r = allData[i];
    if (readDate(r[dateIdx]) !== date) continue;
    const rowSeg = Number(r[segIdx]);
    if (rowSeg === Number(seg) || (paired && rowSeg === 16)) {
      const store = r[storeIdx];
      const obj = {};
      headers.forEach((h, idx) => {
        const v = r[idx];
        if (h === 'savedAt') {
          obj[h] = displayTimes[i][0] || '';
        } else {
          obj[h] = (v instanceof Date) ? readDate(v) : v;
        }
      });
      (rowSeg === Number(seg) ? result : afternoon)[store] = obj;
    }
  }
  return paired ? {data:result, afternoon:afternoon} : result;
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
    const normalizedAwardModels = normalizeReportAwardModels_(data.awardModels, payload.date);
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
  const readback = readData(payload.date, Number(payload.seg))[String(payload.store)] || null;
  const keys = Object.keys(data).filter(function(key) {
    return key !== 'savedAt' && key !== 'awardModels' && data[key] !== null && data[key] !== undefined;
  });
  const readbackMatches = Boolean(readback) && keys.every(function(key) {
    if (key === 'management_focus_json') return String(readback[key] || '') === String(data[key] || '');
    const expected = reportSummaryNumber_(data[key]);
    const actual = reportSummaryNumber_(readback[key]);
    return expected === null ? String(readback[key] || '') === String(data[key] || '') : actual === expected;
  });
  if (!readbackMatches) throw new Error('每日回報寫入後讀回不一致');
  return {
    status:'ok', rowWritten:true, spreadsheetId:SPREADSHEET_ID, sheetName:SHEET_NAME,
    date:String(payload.date), store:String(payload.store), seg:Number(payload.seg),
    readbackMatches:true, readback:readback
  };
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

function reportManagementFocus_(record) {
  let raw = {};
  try {
    raw = record && record.management_focus_json
      ? JSON.parse(String(record.management_focus_json))
      : {};
  } catch (error) {
    raw = {};
  }
  const n = function(key) { return reportSummaryNumber_(raw[key]); };
  const clicked = n('mycharge_clicked');
  const tagged = n('mycharge_tagged');
  return {
    op: { online:n('op_online'), accumulated:n('op_accum'), target:n('op_target') },
    mycharge: {
      clicked:clicked, tagged:tagged,
      rate:clicked !== null && tagged !== null && tagged > 0 ? Number((clicked / tagged * 100).toFixed(1)) : null
    }
  };
}

function reportSummaryFromData_(data, date, seg) {
  const source = data && typeof data === 'object' ? data : {};
  const definitions = [
    { key:'A999', sourceField:'aq999', unit:'count', aggregation:'sum' },
    { key:'A1399', sourceField:'aq1399', unit:'count', aggregation:'sum' },
    { key:'好速', sourceField:'haosu', unit:'points', aggregation:'sum' },
    { key:'R999', sourceField:'rt999', unit:'count', aggregation:'sum' },
    { key:'R1399', sourceField:'rt1399', unit:'count', aggregation:'sum' },
    { key:'保險分子', sourceField:'insurance_num', unit:'count', aggregation:'sum' },
    { key:'保險分母', sourceField:'insurance_den', unit:'count', aggregation:'sum' },
    { key:'保險搭售率', sourceField:'insurance_pct', unit:'percent', aggregation:'average' }
  ];
  const stores = STORES.map(function(store) {
    const row = source[store] || null;
    const metrics = {};
    if (row) definitions.forEach(function(definition) {
      const value = reportSummaryNumber_(row[definition.sourceField]);
      if (value !== null) metrics[definition.key] = { value:value, unit:definition.unit, sourceField:definition.sourceField };
    });
    return {
      name:store, reported:Boolean(row),
      reportedAt:row ? String(row.savedAt || row.updatedAt || '') : '',
      metrics:metrics,
      managementFocus:row ? reportManagementFocus_(row) : null
    };
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
  const managementRows = reportedRows.map(reportManagementFocus_);
  const sumManagement = function(path) {
    const values = managementRows.map(function(row) {
      const value = path.reduce(function(current, key) { return current && current[key] !== undefined ? current[key] : null; }, row);
      return reportSummaryNumber_(value);
    }).filter(function(value) { return value !== null; });
    return values.length ? values.reduce(function(sum, value) { return sum + value; }, 0) : null;
  };
  const mychargeClicked = sumManagement(['mycharge','clicked']);
  const mychargeTagged = sumManagement(['mycharge','tagged']);
  const managementFocus = {
    op:{
      online:sumManagement(['op','online']),
      accumulated:sumManagement(['op','accumulated']),
      target:sumManagement(['op','target'])
    },
    mycharge:{
      clicked:mychargeClicked,
      tagged:mychargeTagged,
      rate:mychargeClicked !== null && mychargeTagged !== null && mychargeTagged > 0
        ? Number((mychargeClicked / mychargeTagged * 100).toFixed(1)) : null
    }
  };
  return {
    date:String(date || ''), segment:Number(seg), completedStores:stores.filter(function(store) { return store.reported; }).length,
    totalStores:STORES.length, missingStores:stores.filter(function(store) { return !store.reported; }).map(function(store) { return store.name; }),
    updatedAt:latest ? latest.text : '', metrics:metrics, managementFocus:managementFocus, stores:stores,
    semantics:'formal-index-summary-v2'
  };
}

function reportReadPayload_(payload) {
  const seg = parseInt(payload.seg, 10);
  if (payload.include16 === true && seg === 21) {
    const pair = readData(payload.date, seg, true);
    // Preserve failures that the separate original 16:00 read would report.
    reportSummaryFromData_(pair.afternoon, payload.date, 16);
    return {
      status:'ok', data:pair.data, summary:reportSummaryFromData_(pair.data, payload.date, seg),
      carry16:{schema:'daily-fill-pair-v1', date:String(payload.date), seg:16, data:pair.afternoon}
    };
  }
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
    // 部署隔離：上傳專用 Deployment 只放行原上傳路由與已授權價格讀取
    if (reportUploadIsUploadDeployment_() && REPORT_UPLOAD_ALLOWED_ACTIONS.indexOf(action) === -1) {
      throw new Error('route-not-available-on-upload-deployment');
    }
    const __authBResponse = privateDashboardGasBMaybePost_(e);
    if (__authBResponse) return __authBResponse;
    const __authRpcResponse = privateDashboardGasAuthMaybeRpcPost_(e);
    if (__authRpcResponse) return __authRpcResponse;
    let result;
    if (action === 'ptauth') result = ptAuthenticatePayload(payload);
    else if (action === 'ptlogout') result = ptLogoutPayload(payload);
    else if (action === 'ptsummary') result = ptSummaryPostPayload_(payload);
    else if (action === 'ptdashboard') result = ptDashboardPostPayload_(payload);
    else if (action === 'ptdetail') result = ptDetailPostPayload_(payload);
    else if (action === 'ptmileage') result = ptMileageMonthPostPayload_(payload);
    else if (action === 'ptmileage2') result = ptMileage2MonthPostPayload_(payload);
    else if (action === 'ptmileage_legs_read') result = ptMileageLegsReadPayload_(payload);
    else if (action === 'ptmileage_leg_write') result = ptMileageLegWritePayload_(payload);
    else if (action === 'ptvisit_write') result = writePatrolVisitEvent_(payload);
    else if (action === 'interview_read') result = supervisorInterviewReadPayload_(payload);
    else if (action === 'interview_write') result = supervisorInterviewWritePayload_(payload);
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
    else if (action === 'tradein_performance_read') result = tradeinPerformanceRead(payload);
    else if (action === 'tradein_performance_public_read') result = tradeinPerformancePublicRead(payload);
    else if (action === 'tradein_performance_public_publish') result = tradeinPerformancePublicPublish(payload);
    else if (action === 'tradein_performance_preview') result = tradeinPerformancePreview(payload);
    else if (action === 'tradein_performance_publish') result = tradeinPerformancePublish(payload);
    else if (action === 'tradein_performance_rollback') result = tradeinPerformanceRollback(payload);
    else if (action === 'tradein_performance_checkpoint_status') result = tradeinPerformanceCheckpointStatus(payload);
    else if (action === 'tradein_performance_checkpoint_capture') result = tradeinPerformanceCheckpointCapture(payload);
    else if (action === 'tradein_performance_checkpoint_restore') result = tradeinPerformanceCheckpointRestore(payload);
    else if (action === 'phone_stock_publish') result = phoneStockPublish(payload);
    else if (action === 'phone_stock_read') result = phoneStockRead(payload);
    else if (action === 'department_ops_read') result = departmentOpsRead(payload);
    else if (action === 'department_store_rules_read') result = storeRulesRead(payload);
    else if (['department_scores_read','department_scores_history_read','department_scores_publish','department_scores_restore'].indexOf(action) >= 0) result = departmentScoresDispatch_(payload);
    else if (action === 'north12b_gold_read') result = north12bGoldDailyRead(payload);
    else if (action === 'department_ops_publish') result = departmentOpsPublish(payload);
    else if (action === 'department_gold_access') result = departmentGoldAccess(payload);
    else if (action === 'threec_snapshot_read') result = threecSnapshotRead(payload);
    else if (action === 'threec_changes_read') result = threecChangesRead(payload);
    else if (action === 'private_admin_requests') result = privateDashboardAdminRequests(payload);
    else if (action === 'private_admin_approve') result = privateDashboardAdminApprove(payload);
    else if (action === 'private_admin_revoke') result = privateDashboardAdminRevoke(payload);
    else if (action === 'private_admin_restore_eligibility') result = privateDashboardAdminRestoreEligibility(payload);
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
    else throw new Error('unknown private dashboard action');
    return privateDashboardPostResponse({ status: 'ok', ...result }, e);
  } catch (err) {
    const patrolActions = ['ptauth','ptlogout','ptsummary','ptdashboard','ptdetail','ptmileage','ptmileage2','ptmileage_legs_read','ptmileage_leg_write','ptvisit_write','interview_read','interview_write','hwrite','half_media_upload'];
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
  return privateDashboardAuthGuardRoster_(SpreadsheetApp.openById(id));
}

function privateDashboardSheet(name, headers) {
  privateDashboardAuthGuardSheetName_(name, headers);
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
  privateDashboardAuthGuardSheet_(sheet, headers);
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function(row, offset) {
    const item = { _row: offset + 2 };
    headers.forEach(function(header, index) { item[header] = row[index] == null ? '' : String(row[index]); });
    return item;
  });
}

let privateDashboardRosterLockDepth_ = 0;

function privateDashboardRosterTransaction_(run) {
  privateDashboardRequireAuthOwner_();
  if (privateDashboardRosterLockDepth_) return run();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  privateDashboardRosterLockDepth_ = 1;
  try {
    return run();
  } finally {
    try { SpreadsheetApp.flush(); }
    finally {
      privateDashboardRosterLockDepth_ = 0;
      lock.releaseLock();
    }
  }
}

function privateDashboardRecordLogin_(employeeId, deviceId) {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('privateDashboardRecordLogin_', __authArgs, function() {

  return privateDashboardRosterTransaction_(function() {
    const lookup = privateDashboardUserByEmployeeId(employeeId);
    if (!lookup.user || lookup.user.status !== 'active' || (!privateDashboardIsTrustedEmployee(employeeId) && lookup.user.device_id !== deviceId)) {
      throw new Error('此員編尚未核准此裝置，請先申請並等待管理者核准');
    }
    lookup.user.last_login_at = privateDashboardNow();
    // A read must never write a stale status, profile or device binding back.
    lookup.sheet.getRange(lookup.user._row, 8, 1, 1).setValues([[lookup.user.last_login_at]]);
    return lookup.user;
  });

  });
}

function privateDashboardAdminRestoreEligibility(payload) {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('privateDashboardAdminRestoreEligibility', __authArgs, function() {

  privateDashboardAdminAuthorized(payload);
  if (payload.restoreEligibility !== true || payload.currentRosterConfirmed !== true) {
    throw new Error('須明確確認現職名冊並批准恢復資格');
  }
  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  return privateDashboardRosterTransaction_(function() {
    const lookup = privateDashboardUserByEmployeeId(employeeId);
    if (!lookup.user || (lookup.user.status !== 'revoked' && !privateDashboardAuthResumeNative_('privateDashboardAdminRestoreEligibility', employeeId))) throw new Error('找不到已撤權員編');
    const requestSheet = privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS);
    // Retrying a partially completed revoke must not leave a pre-revoke request
    // available for approval after eligibility is restored.
    privateDashboardRows(requestSheet, PRIVATE_DASHBOARD_REQUEST_HEADERS).forEach(function(request) {
      if (request.employee_id !== employeeId || request.status !== 'pending') return;
      request.status = 'revoked';
      privateDashboardWriteObject(requestSheet, PRIVATE_DASHBOARD_REQUEST_HEADERS, request._row, request);
    });
    privateDashboardAuthNativeBegin_('privateDashboardAdminRestoreEligibility', __authArgs);
    lookup.user.status = 'active';
    lookup.user.device_id = '';
    lookup.user.device_bound_at = '';
    lookup.user.last_login_at = '';
    privateDashboardWriteObject(lookup.sheet, PRIVATE_DASHBOARD_USERS_HEADERS, lookup.user._row, lookup.user, {restoreRevoked:true});
    return { restored: true, employeeId: employeeId, deviceApprovalRequired: !privateDashboardIsTrustedEmployee(employeeId) };
  });

  });
}

function privateDashboardWriteObject(sheet, headers, rowIndex, item, options) {
  const __authKind = privateDashboardAuthGuardSheet_(sheet, headers);
  function write() {
    if (__authKind === 'users') {
      const current = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
      if (current[0] && String(current[0]) !== item.employee_id) throw new Error('名冊列已變更，請重新讀取');
      if (String(current[4]) === 'revoked' && item.status !== 'revoked' && !(options && options.restoreRevoked === true)) {
        throw new Error('此員編已撤權，須由管理者明確恢復資格');
      }
    }
    sheet.getRange(rowIndex, 1, 1, headers.length).setValues([headers.map(function(header) { return item[header] || ''; })]);
  }
  if (__authKind) return privateDashboardRosterTransaction_(write);
  return write();
}

// 由管理者在 Apps Script 編輯器執行一次。建立的 Sheet 位於同一個私有 Drive 資料夾中。
function setupPrivateDashboard() {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('setupPrivateDashboard', __authArgs, function() {

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

  });
}

function privateDashboardUserByEmployeeId(employeeId) {
  privateDashboardRequireAuthOwner_();
  const canonicalId = privateDashboardCleanEmployeeId(employeeId);
  if (employeeId !== canonicalId) throw new Error('名冊員編格式不一致，請管理者核對');
  const sheet = privateDashboardSheet(PRIVATE_DASHBOARD_USERS_SHEET, PRIVATE_DASHBOARD_USERS_HEADERS);
  const found = privateDashboardRows(sheet, PRIVATE_DASHBOARD_USERS_HEADERS)
    .filter(function(item) {
      return String(item.employee_id || '').trim().toUpperCase() === canonicalId;
    });
  if (found.some(function(item) { return item.employee_id !== canonicalId; })) {
    throw new Error('名冊員編格式不一致，請管理者核對');
  }
  if (found.length > 1) throw new Error('名冊員編重複，請管理者核對');
  return { sheet: sheet, user: found.length ? found[0] : null };
}

function privateDashboardRequestBinding(payload) {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('privateDashboardRequestBinding', __authArgs, function() {

  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const deviceId = privateDashboardCleanDeviceId(payload.deviceId);
  const bootstrapCode = String(payload.bootstrapCode || '');
  if (privateDashboardHash(bootstrapCode) !== privateDashboardHash(privateDashboardRequiredProperty('DASHBOARD_BOOTSTRAP_CODE'))) {
    throw new Error('首次啟用碼不正確');
  }
  return privateDashboardRosterTransaction_(function() {
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
  });

  });
}

function privateDashboardRequestStatus(payload) {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('privateDashboardRequestStatus', __authArgs, function() {

  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const deviceId = privateDashboardCleanDeviceId(payload.deviceId);
  const user = privateDashboardUserByEmployeeId(employeeId).user;
  if (!user || user.status !== 'active') throw new Error('此員編不在可使用名冊中');
  const requests = privateDashboardRows(
    privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS),
    PRIVATE_DASHBOARD_REQUEST_HEADERS
  ).filter(function(item) { return item.employee_id === employeeId && item.device_id === deviceId; });
  requests.sort(function(a, b) { return b.requested_at.localeCompare(a.requested_at); });
  const latest = requests[0];
  if (!latest) return { requestStatus: 'none' };
  return { requestStatus: latest.status, requestedAt: latest.requested_at, approvedAt: latest.approved_at };

  });
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

function privateDashboardLatestSnapshotFile_() {
  const files = privateDashboardFolder().getFilesByName(PRIVATE_DASHBOARD_FILE);
  let latest = null;
  while (files.hasNext()) {
    const file = files.next();
    if (!latest || file.getLastUpdated().getTime() > latest.getLastUpdated().getTime()) latest = file;
  }
  return latest;
}

function privateDashboardSnapshot() {
  const file = privateDashboardLatestSnapshotFile_();
  if (!file) throw new Error('今日私有戰情尚未更新');
  const snapshot = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if (!snapshot || !snapshot.kpiBattle || !snapshot.awardsBattle) throw new Error('私有戰情快照格式不完整');
  return snapshot;
}

function privateDashboardAccess(payload) {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('privateDashboardAccess', __authArgs, function() {

  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const deviceId = privateDashboardCleanDeviceId(payload.deviceId);
  const user = privateDashboardRecordLogin_(employeeId, deviceId);
  const snapshot = privateDashboardSnapshot();
  return { snapshot: snapshot, profile: { maskedName: user.masked_name, store: user.store, role: user.role } };

  });
}

const PHONE_STOCK_FILE = 'north12b-phone-stock-latest.json';
const PHONE_STOCK_LATEST_ID = 'PHONE_STOCK_LATEST_FILE_ID';
const PHONE_STOCK_STORES = ['台北酒泉','台北永吉','台北復興南','台北萬大','台北通化','台北杭州南','台北大稻埕','台北三創','台北六張犁'];

function phoneStockTrustedUser_(payload) {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('phoneStockTrustedUser_', __authArgs, function() {

  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const user = privateDashboardUserByEmployeeId(employeeId).user;
  if (!privateDashboardIsTrustedEmployee(employeeId) || !user || user.status !== 'active') {
    throw new Error('此員編無手機庫存存取權限');
  }
  return {employeeId:employeeId,user:user};

  });
}

function phoneStockAuthorizeRead_(payload) {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('phoneStockAuthorizeRead_', __authArgs, function() {

  const trusted = phoneStockTrustedUser_(payload);
  const deviceId = privateDashboardCleanDeviceId(payload.deviceId);
  // APP 讀取庫存仍限督導已核准的裝置，避免其他人看見庫存數。
  if (trusted.user.device_id !== deviceId) throw new Error('此裝置尚未核准手機庫存存取');
  return trusted.employeeId;

  });
}

function phoneStockAuthorizePublish_(payload) {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('phoneStockAuthorizePublish_', __authArgs, function() {

  const trusted = phoneStockTrustedUser_(payload);
  // 發布端是督導使用的電腦，與已核准 APP 手機會有不同裝置 ID。
  // 確認發布端帶有有效裝置識別，但不要求它等於 APP 的綁定裝置。
  privateDashboardCleanDeviceId(payload.deviceId);
  return trusted.employeeId;

  });
}

function phoneStockRead(payload) {
  phoneStockAuthorizeRead_(payload || {});
  const id = String(privateDashboardProperties().getProperty(PHONE_STOCK_LATEST_ID) || '');
  if (!id) return { snapshot:null };
  const snapshot = JSON.parse(DriveApp.getFileById(id).getBlob().getDataAsString('UTF-8'));
  if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.rows)) throw new Error('庫存快照格式不正確');
  return { snapshot:snapshot };
}

function phoneStockPublish(payload) {
  const body = payload || {};
  const employeeId = phoneStockAuthorizePublish_(body);
  const rows = body.rows;
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 10000) throw new Error('庫存資料筆數不正確');
  const date = String(body.date || '');
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) throw new Error('請指定庫存快照日期');
  const normalized = [];
  rows.forEach(function(row) {
    const store = String(row && row.store || '');
    const model = String(row && row.model || '').trim();
    const quantity = Number(row && row.quantity);
    if (PHONE_STOCK_STORES.indexOf(store) < 0 || !model || model.length > 180 || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 100000) {
      throw new Error('庫存資料含有不正確的店點、機款或數量');
    }
    normalized.push({store:store,model:model,quantity:quantity});
  });
  const snapshot = {version:1,date:date,importedAt:new Date().toISOString(),rows:normalized};
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const folder = privateDashboardFolder();
    const file = folder.createFile(PHONE_STOCK_FILE, JSON.stringify(snapshot), MimeType.PLAIN_TEXT);
    const props = privateDashboardProperties();
    const previous = String(props.getProperty(PHONE_STOCK_LATEST_ID) || '');
    props.setProperty(PHONE_STOCK_LATEST_ID, file.getId());
    if (previous && previous !== file.getId()) {
      try { DriveApp.getFileById(previous).setTrashed(true); } catch (error) { console.log('old phone stock snapshot cleanup failed: ' + error); }
    }
  } finally { lock.releaseLock(); }
  return { publishedAt:snapshot.importedAt,date:date,rowCount:normalized.length,updatedBy:employeeId };
}

const DEPARTMENT_OPS_FILE = 'north12-department-ops-private-latest.json';
const DEPARTMENT_OPS_REGIONS = ['北一二A','北一二B','北一二C','北一二D'];

function departmentOpsEmployeeId_(value) {
  const employeeId = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{5,12}$/.test(employeeId)) throw new Error('員編格式不正確');
  return employeeId;
}

function departmentOpsFolder_() {
  const parents = DriveApp.getFileById(SPREADSHEET_ID).getParents();
  if (!parents.hasNext()) throw new Error('找不到部區金牌私有儲存位置');
  return parents.next();
}

function departmentOpsText_(value, maxLength) {
  const result = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  if (result.length > maxLength) throw new Error('部區金牌資料文字過長');
  return result;
}

function departmentOpsDate_(value) {
  const result = String(value || '');
  if (result && !/^20\d{2}-\d{2}-\d{2}$/.test(result)) throw new Error('部區金牌日期格式不正確');
  return result;
}

function departmentOpsNumber_(value, min, max) {
  const result = Number(value);
  if (!isFinite(result) || result < min || result > max) throw new Error('部區金牌數值超出範圍');
  return result;
}

function departmentOpsNormalizeRecord_(row) {
  const region = departmentOpsText_(row && row.region, 12);
  if (DEPARTMENT_OPS_REGIONS.indexOf(region) < 0) throw new Error('部區金牌含有不正確的區域');
  return {
    region:region,
    storeCode:departmentOpsText_(row.storeCode, 24),
    store:departmentOpsText_(row.store, 40),
    role:departmentOpsText_(row.role, 50),
    employeeId:departmentOpsEmployeeId_(row.employeeId),
    employeeName:departmentOpsText_(row.employeeName, 30),
    level:departmentOpsText_(row.level, 30),
    employment:departmentOpsText_(row.employment, 20),
    eligible9m:departmentOpsText_(row.eligible9m, 10),
    storeType:departmentOpsText_(row.storeType, 20),
    spe:departmentOpsNumber_(row.spe, -100, 100),
    medal:departmentOpsNumber_(row.medal, -10000, 10000)
  };
}

function departmentOpsNormalizeGold_(gold) {
  const months = gold && gold.months;
  if (!Array.isArray(months) || months.length < 1 || months.length > 24) throw new Error('部區金牌月份數不正確');
  return months.map(function(month) {
    const records = month && month.records;
    if (!Array.isArray(records) || records.length < 1 || records.length > 1000) throw new Error('部區金牌人員筆數不正確');
    return {
      sheetName:departmentOpsText_(month.sheetName, 30),
      monthKey:departmentOpsText_(month.monthKey, 20),
      dateRange:{
        start:departmentOpsDate_(month.dateRange && month.dateRange.start),
        end:departmentOpsDate_(month.dateRange && month.dateRange.end),
        cutoff:departmentOpsDate_(month.dateRange && month.dateRange.cutoff)
      },
      records:records.map(departmentOpsNormalizeRecord_)
    };
  }).sort(function(a,b){ return a.monthKey.localeCompare(b.monthKey); });
}

function departmentOpsNormalizeReviews_(reviews) {
  const source = reviews && typeof reviews === 'object' ? reviews : {};
  const keys = Object.keys(source);
  if (keys.length > 5000) throw new Error('複核註記筆數過多');
  const result = {};
  keys.forEach(function(key) {
    if (key.length > 80) return;
    const item = source[key] || {};
    result[key] = {
      reason:departmentOpsText_(item.reason, 40),
      status:departmentOpsText_(item.status, 20)
    };
  });
  return result;
}

function departmentOpsLatestSnapshot_() {
  const files = departmentOpsFolder_().getFilesByName(DEPARTMENT_OPS_FILE);
  let latest = null;
  while (files.hasNext()) {
    const file = files.next();
    if (!latest || file.getLastUpdated().getTime() > latest.getLastUpdated().getTime()) latest = file;
  }
  if (!latest) return null;
  departmentGoldMonthlyFile_(latest.getId(), departmentGoldMonthlyFolder_());
  const snapshot = JSON.parse(latest.getBlob().getDataAsString('UTF-8'));
  if (!snapshot || snapshot.version !== 1 || !Array.isArray(snapshot.months)) throw new Error('部區金牌快照格式不正確');
  return snapshot;
}

function departmentOpsPublish(payload) {
  const body = payload || {};
  ptRequireSession_(body.token, 'department_ops_publish');
  return departmentGoldMonthlyPublish_(body);
}

function departmentOpsRead(payload) {
  const body = payload || {};
  ptRequireSession_(body.token, 'department_ops_read');
  return departmentGoldMonthlyRead_(body);
}

function departmentGoldAuthorizedUser_(payload) {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('departmentGoldAuthorizedUser_', __authArgs, function() {

  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const deviceId = privateDashboardCleanDeviceId(payload.deviceId);
  return privateDashboardRecordLogin_(employeeId, deviceId);

  });
}

function departmentGoldSafeRecord_(row) {
  return {
    region:'北一二B',storeCode:row.storeCode,store:row.store,role:row.role,
    employeeName:row.employeeName,personKey:privateDashboardHash(row.employeeId).slice(0,16),
    level:row.level,employment:row.employment,eligible9m:row.eligible9m,storeType:row.storeType,
    spe:row.spe,medal:row.medal
  };
}

function departmentGoldPublicLedger_(ledger) {
  const changes = North12BGoldDaily.changes(ledger);
  let offset = 0;
  return {
    schema:'north12b-public-gold/v1',
    settlements:ledger.settlements.map(function(item) {
      return { date:item.date, rows:item.rows.map(function(row) {
        const delta = changes[offset++].delta;
        return { store:row.store, alias:row.alias, balance:row.balance, delta:delta, reason:row.reason, exemption:row.exemption };
      }) };
    })
  };
}

function departmentGoldAccess(payload) {
  return {ledger:departmentGoldPublicLedger_(north12bGoldDailyLedger_())};
}

// ═══════════════════════════════════
// 3C／舊換新私有標準化快照
// - 原始 Excel 只在管理頁的瀏覽器記憶體解析，後端只接受經驗證的 JSON。
// - 資料寫入獨立私有資料夾，不列舉、不存取其他 Drive 目錄。
// - registry 採用不可變檔案＋Script Property 指標；指標切換前失敗不會改變 active。
// 需先在 Script Properties 設定 THREEC_PRIVATE_FOLDER_ID，不得將資料夾 ID 寫進公開 repo。
// ═══════════════════════════════════

const THREEC_PRIVATE_FOLDER_PROPERTY = 'THREEC_PRIVATE_FOLDER_ID';
const THREEC_REGISTRY_POINTER_PROPERTY = 'THREEC_REGISTRY_FILE_ID';
const THREEC_PRIVATE_FOLDER_NAME = '3C／舊換新資料庫（私有）';
const THREEC_REGISTRY_SCHEMA = 'threec-private-registry/v1';
const THREEC_SNAPSHOT_SCHEMA = 'threec-normalized-snapshot/v1';
const THREEC_MAX_SNAPSHOT_JSON_BYTES = 25 * 1024 * 1024;
const THREEC_PROVIDERS = ['點子行動', 'FutureDial（FDI）', '愛鋒派'];
const THREEC_GRADES = ['S', 'A', 'B', 'C'];
function threecProviderGrades_(provider) { return provider === '愛鋒派' ? THREEC_GRADES.concat('未分級') : THREEC_GRADES.slice(); }


function threecKind_(value) {
  const kind = String(value || '').trim();
  if (kind !== 'shopping' && kind !== 'tradein') throw new Error('僅支援 3C 手機專案價與舊換新兩類資料');
  return kind;
}

function threecIsoDate_(value) {
  const source = String(value || '');
  const match = source.match(/^(20\d{2})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCFullYear() === Number(match[1]) && date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? source : '';
}

function threecPrivateFolder_() {
  const folderId = String(privateDashboardProperties().getProperty(THREEC_PRIVATE_FOLDER_PROPERTY) || '').trim();
  if (!folderId) throw new Error('尚未設定 3C／舊換新私有資料夾');
  const folder = DriveApp.getFolderById(folderId);
  if (folder.getName() !== THREEC_PRIVATE_FOLDER_NAME) throw new Error('3C／舊換新私有資料夾名稱不符，已停止存取');
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('3C／舊換新資料夾不是私有狀態，已停止存取');
  return folder;
}

function threecEmptyRegistry_() {
  return {
    schema_version:THREEC_REGISTRY_SCHEMA,
    updated_at:'',
    kinds:{ shopping:{ active:null, previous:null }, tradein:{ active:null, previous:null } },
    audit:[]
  };
}

function threecReadJsonFile_(fileId) {
  const file = DriveApp.getFileById(String(fileId || ''));
  const targetFolderId = threecPrivateFolder_().getId();
  const parents = file.getParents();
  let inTargetFolder = false;
  while (parents.hasNext()) {
    if (parents.next().getId() === targetFolderId) inTargetFolder = true;
  }
  if (!inTargetFolder) throw new Error('3C／舊換新檔案不在指定私有資料夾，已停止存取');
  const text = file.getBlob().getDataAsString('UTF-8');
  return JSON.parse(text);
}

function threecRegistry_() {
  const id = String(privateDashboardProperties().getProperty(THREEC_REGISTRY_POINTER_PROPERTY) || '').trim();
  if (!id) return threecEmptyRegistry_();
  const registry = threecReadJsonFile_(id);
  if (!registry || registry.schema_version !== THREEC_REGISTRY_SCHEMA || !registry.kinds || !registry.kinds.shopping || !registry.kinds.tradein) {
    throw new Error('3C／舊換新 registry 格式不正確');
  }
  return registry;
}

function threecRegistrySummary_(registry) {
  function clean(item) {
    if (!item) return null;
    return {
      kind:item.kind,
      source_version_date:item.source_version_date,
      published_at:item.published_at,
      source_file_sha256:item.source_file_sha256,
      snapshot_hash:item.snapshot_hash,
      row_count:Number(item.row_count || 0),
      source_row_count:Number(item.source_row_count || 0),
      excluded_no_price_count:Number(item.excluded_no_price_count || 0),
      query_model_count:Number(item.query_model_count || 0),
      quote_conflict_count:Number(item.quote_conflict_count || 0)
    };
  }
  return {
    schema_version:THREEC_REGISTRY_SCHEMA,
    updated_at:String(registry.updated_at || ''),
    shopping:{ active:clean(registry.kinds.shopping.active), previous:clean(registry.kinds.shopping.previous), can_rollback:threecCanRollback_(registry, 'shopping') },
    tradein:{ active:clean(registry.kinds.tradein.active), previous:clean(registry.kinds.tradein.previous), can_rollback:threecCanRollback_(registry, 'tradein') }
  };
}

function threecAllowedKeys_(value, allowed, label) {
  Object.keys(value || {}).forEach(function(key) {
    if (allowed.indexOf(key) === -1) throw new Error(label + '含有不允許的欄位：' + key);
  });
}

function threecTextField_(value, label, maxLength, required) {
  const text = String(value == null ? '' : value).trim();
  if (required && !text) throw new Error(label + '不得為空');
  if (text.length > maxLength) throw new Error(label + '過長');
  return text;
}

function threecPriceField_(value, label, allowEmpty) {
  if (value == null || String(value).trim() === '') {
    if (allowEmpty) return '';
    throw new Error(label + '不得為空');
  }
  const text = String(value).trim();
  // SheetJS raw:false preserves formatted Excel thousands separators.
  // Accept only complete groups; never strip arbitrary punctuation or fill zero.
  if (/^\d+(?:\.\d+)?$/.test(text)) return text;
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)) return text.replace(/,/g, '');
  throw new Error(label + '不是有效的非負價格');
}

function threecValidateShoppingRows_(rows, legacyColumnOrdinals) {
  const seen = {};
  return rows.map(function(row, index) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('3C 第 ' + (index + 1) + ' 筆格式不正確');
    threecAllowedKeys_(row, ['source_sheet','source_row_number','brand','code','model','colorless_model','retail_price','project_prices'], '3C 第 ' + (index + 1) + ' 筆');
    const sourceSheet = threecTextField_(row.source_sheet, '來源工作表', 160, true);
    const sourceRowNumber = Number(row.source_row_number);
    if (!Number.isSafeInteger(sourceRowNumber) || sourceRowNumber < 1 || sourceRowNumber > 1000000) throw new Error('3C 來源列號不正確');
    const key = sourceSheet + '\u0001' + sourceRowNumber;
    if (seen[key]) throw new Error('3C 資料含重複來源列');
    seen[key] = true;
    const project = row.project_prices;
    if (!project || typeof project !== 'object' || Array.isArray(project)) throw new Error('3C 專案價格式不正確');
    const projectPrices = {};
    const projectKeys = Object.keys(project);
    if (projectKeys.length > 120) throw new Error('3C 專案價欄位過多');
    projectKeys.forEach(function(name) {
      const displayName = threecTextField_(name, '專案價欄名', 120, true);
      const cleanName = legacyColumnOrdinals ? displayName.replace(/ \(\d+\)$/, '') : displayName;
      const price = threecPriceField_(project[name], cleanName, true);
      if (Object.prototype.hasOwnProperty.call(projectPrices, cleanName) && projectPrices[cleanName] !== price) throw new Error('相同完整方案條件有不同報價：' + cleanName);
      projectPrices[cleanName] = price;
    });
    const retailPrice = threecPriceField_(row.retail_price, '單機價', true);
    const hasPrice = retailPrice !== '' || Object.keys(projectPrices).some(function(name) { return projectPrices[name] !== ''; });
    if (!hasPrice) throw new Error('3C 正式快照不得包含全部價格空白的資料');
    return {
      source_sheet:sourceSheet,
      source_row_number:sourceRowNumber,
      brand:threecTextField_(row.brand, '品牌', 160, true),
      code:threecTextField_(row.code, '代碼', 160, true),
      model:threecTextField_(row.model, '機型', 240, true),
      colorless_model:threecTextField_(row.colorless_model, '無色機型', 240, true),
      retail_price:retailPrice,
      project_prices:projectPrices
    };
  });
}

function threecValidateTradeinRows_(rows) {
  return rows.map(function(row, index) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('舊換新第 ' + (index + 1) + ' 組格式不正確');
    threecAllowedKeys_(row, ['source_sheet','brand','model','quotes'], '舊換新第 ' + (index + 1) + ' 組');
    const quotes = row.quotes;
    if (!quotes || typeof quotes !== 'object' || Array.isArray(quotes)) throw new Error('舊換新報價格式不正確');
    const providerKeys = Object.keys(quotes).sort();
    if (THREEC_PROVIDERS.slice(0, 2).some(function(provider) { return !Object.prototype.hasOwnProperty.call(quotes, provider); }) || providerKeys.some(function(provider) { return THREEC_PROVIDERS.indexOf(provider) < 0; })) throw new Error('舊換新必須完整保留兩家回收商，僅可另加愛鋒派');
    const normalizedQuotes = {};
    let priceCount = 0;
    providerKeys.forEach(function(provider) {
      const expectedGrades = threecProviderGrades_(provider);
      const grades = quotes[provider];
      if (!grades || typeof grades !== 'object' || Array.isArray(grades)) throw new Error(provider + '報價格式不正確');
      if (JSON.stringify(Object.keys(grades).sort()) !== JSON.stringify(expectedGrades.slice().sort())) throw new Error(provider + '必須完整保留 S／A／B／C 欄位；愛鋒派另保留來源未分級');
      normalizedQuotes[provider] = {};
      expectedGrades.forEach(function(grade) {
        const value = grades[grade];
        const price = value == null || String(value).trim() === '' ? null : threecPriceField_(value, provider + ' ' + grade, false);
        if (price !== null) priceCount += 1;
        normalizedQuotes[provider][grade] = price;
      });
    });
    if (!priceCount) throw new Error('舊換新正式快照不得包含全無報價的機型');
    return {
      source_sheet:threecTextField_(row.source_sheet, '來源工作表', 160, true),
      brand:threecTextField_(row.brand, '品牌', 160, false),
      model:threecTextField_(row.model, '舊機機型', 240, true),
      quotes:normalizedQuotes
    };
  });
}

function threecNormalizeIncomingSnapshot_(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('3C／舊換新快照格式不正確');
  threecAllowedKeys_(raw, ['schema_version','kind','source_version_date','source_file_name','source_file_sha256','parser_version','internal_source_dates','source_row_count','row_count','catalog_row_count','excluded_no_price_count','query_model_count','quote_conflict_count','rows','published_at','operator_hash','snapshot_hash','change_basis','change_counts'], '快照');
  if (raw.schema_version !== THREEC_SNAPSHOT_SCHEMA) throw new Error('3C／舊換新快照 schema 不正確');
  const kind = threecKind_(raw.kind);
  const sourceVersionDate = threecIsoDate_(raw.source_version_date);
  if (!sourceVersionDate) throw new Error('來源檔名版本日期無效');
  const sourceFileName = threecTextField_(raw.source_file_name, '來源檔名', 280, true);
  const dateTokens = sourceFileName.match(/(?:^|\D)(20\d{6})(?=\D|$)/g) || [];
  const compactDate = sourceVersionDate.replace(/-/g, '');
  if (dateTokens.length !== 1 || dateTokens[0].replace(/\D/g, '') !== compactDate) throw new Error('來源檔名與 source_version_date 不一致');
  const sourceFileSha256 = String(raw.source_file_sha256 || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(sourceFileSha256)) throw new Error('來源檔案 SHA-256 不正確');
  if (!Array.isArray(raw.rows) || !raw.rows.length || raw.rows.length > (kind === 'shopping' ? 20000 : 5000)) throw new Error('正式快照筆數不正確');
  const rows = kind === 'shopping' ? threecValidateShoppingRows_(raw.rows, raw.parser_version === '2026.09.28-private-registry-1') : threecValidateTradeinRows_(raw.rows);
  const rowCount = Number(raw.row_count);
  const sourceRowCount = Number(raw.source_row_count);
  const excludedNoPriceCount = Number(raw.excluded_no_price_count || 0);
  const catalogRowCount = Number(raw.catalog_row_count || 0);
  if (!Number.isSafeInteger(catalogRowCount) || catalogRowCount < 0 || (kind !== 'shopping' && catalogRowCount)) throw new Error('目錄稽核筆數不正確');
  const queryModelCount = Number(raw.query_model_count || 0);
  const quoteConflictCount = Number(raw.quote_conflict_count || 0);
  if (!Number.isSafeInteger(rowCount) || rowCount !== rows.length) throw new Error('快照 row_count 與正式列不一致');
  if (!Number.isSafeInteger(sourceRowCount) || sourceRowCount < rowCount) throw new Error('快照 source_row_count 不正確');
  if (!Number.isSafeInteger(excludedNoPriceCount) || excludedNoPriceCount < 0) throw new Error('排除數不正確');
  if (kind === 'shopping' && sourceRowCount !== rowCount + excludedNoPriceCount + catalogRowCount) throw new Error('3C 來源筆數、發布筆數與排除數不一致');
  if (kind === 'tradein' && quoteConflictCount !== 0) throw new Error('舊換新含有報價衝突');
  return {
    schema_version:THREEC_SNAPSHOT_SCHEMA,
    kind:kind,
    source_version_date:sourceVersionDate,
    source_file_name:sourceFileName,
    source_file_sha256:sourceFileSha256,
    parser_version:threecTextField_(raw.parser_version, 'parser_version', 80, true),
    internal_source_dates:Array.isArray(raw.internal_source_dates) ? raw.internal_source_dates.map(function(value) { return threecTextField_(value, '檔內日期', 80, false); }).slice(0, 100) : [],
    source_row_count:sourceRowCount,
    row_count:rowCount,
    excluded_no_price_count:excludedNoPriceCount,
    query_model_count:queryModelCount,
    quote_conflict_count:quoteConflictCount,
    ...(Object.prototype.hasOwnProperty.call(raw, 'catalog_row_count') ? {catalog_row_count:catalogRowCount} : {}),
    rows:rows
  };
}

function threecSnapshotHash_(snapshot) {
  const copy = JSON.parse(JSON.stringify(snapshot));
  delete copy.snapshot_hash;
  // Hash the same UTF-8 JSON bytes without materializing a multi-million
  // element Apps Script Byte[] in JavaScript. Existing stored MD5s stay exact.
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(copy), Utilities.Charset.UTF_8)
    .map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}

function threecSnapshotSummary_(snapshot, file) {
  return {
    snapshot_file_id:file.getId(),
    snapshot_file_name:file.getName(),
    kind:snapshot.kind,
    source_version_date:snapshot.source_version_date,
    published_at:snapshot.published_at,
    source_file_sha256:snapshot.source_file_sha256,
    snapshot_hash:snapshot.snapshot_hash,
    row_count:snapshot.row_count,
    source_row_count:snapshot.source_row_count,
    excluded_no_price_count:snapshot.excluded_no_price_count,
    query_model_count:snapshot.query_model_count,
    quote_conflict_count:snapshot.quote_conflict_count,
    ...(Object.prototype.hasOwnProperty.call(snapshot, 'catalog_row_count') ? {catalog_row_count:snapshot.catalog_row_count} : {})
  };
}

function threecWriteRegistry_(registry) {
  const folder = threecPrivateFolder_();
  const stamp = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyyMMdd-HHmmss-SSS');
  const file = folder.createFile('threec-registry-' + stamp + '-' + Utilities.getUuid().slice(0, 8) + '.json', JSON.stringify(registry), MimeType.PLAIN_TEXT);
  const readback = threecReadJsonFile_(file.getId());
  if (!readback || readback.schema_version !== THREEC_REGISTRY_SCHEMA || reportVersionHash_(JSON.stringify(readback)) !== reportVersionHash_(JSON.stringify(registry))) {
    throw new Error('3C／舊換新 registry 寫入讀回失敗');
  }
  privateDashboardProperties().setProperty(THREEC_REGISTRY_POINTER_PROPERTY, file.getId());
  return file;
}

function threecAuditEvent_(registry, action, kind, employeeId, detail) {
  const events = Array.isArray(registry.audit) ? registry.audit.slice(-99) : [];
  events.push({
    action:String(action || ''),
    kind:String(kind || ''),
    acted_at:privateDashboardNow(),
    operator_hash:privateDashboardHash(employeeId).slice(0, 16),
    detail:String(detail || '').slice(0, 240)
  });
  registry.audit = events;
}

// Semantic comparisons are shared with the local parser preview. Prices stay
// in immutable snapshots; only counts/basis are added to the version metadata.
function threecVerifiedSnapshot_(item) {
  if (!item) return null;
  const raw = threecReadJsonFile_(item.snapshot_file_id);
  const normalized = threecNormalizeIncomingSnapshot_(raw);
  if (threecSnapshotHash_(raw) !== raw.snapshot_hash || item.snapshot_hash !== raw.snapshot_hash ||
      item.kind !== normalized.kind || item.source_version_date !== normalized.source_version_date ||
      item.source_file_sha256 !== normalized.source_file_sha256 || Number(item.row_count) !== normalized.row_count) {
    throw new Error('3C／舊換新 active 快照雜湊或版本驗證失敗');
  }
  normalized.published_at = raw.published_at;
  normalized.snapshot_hash = raw.snapshot_hash;
  return { raw:raw, normalized:normalized };
}

function threecDiff_(kind, before, after, options) {
  if (typeof ThreecPriceDiffCore === 'undefined') throw new Error('完整條件差異模組尚未部署');
  const opts = options || {};
  const offset = Math.max(0, Math.floor(Number(opts.offset || 0)));
  const limit = Math.min(1000, Math.max(1, Math.floor(Number(opts.limit || 100))));
  return ThreecPriceDiffCore.diffSnapshots(kind, before, after, { offset:offset, limit:limit, search:String(opts.search || '') });
}

function threecLatestSource_(slot) {
  const active = slot.active;
  const check = slot.latest_check;
  return check && active && check.snapshot_hash === active.snapshot_hash && check.source_version_date >= active.source_version_date ? check : active;
}

function threecPreviewBasis_(active) {
  return { snapshot_hash:active ? active.snapshot_hash : '', date:active ? active.source_version_date : '', source_sha:active ? active.source_file_sha256 : '' };
}

function threec_diff_preview(payload) {
  reportUploadAuthorize_(payload);
  const encoded = String((payload || {}).snapshotJson || '');
  if (!encoded || Utilities.newBlob(encoded).getBytes().length > THREEC_MAX_SNAPSHOT_JSON_BYTES) throw new Error('來源預覽缺少或過大');
  const incoming = threecNormalizeIncomingSnapshot_(JSON.parse(encoded));
  const registry = threecRegistry_();
  const source = threecLatestSource_(registry.kinds[incoming.kind]);
  const active = registry.kinds[incoming.kind].active;
  if (source && incoming.source_version_date < source.source_version_date) throw new Error('較舊檔名日期不得覆蓋目前正式版本');
  const previous = threecVerifiedSnapshot_(active);
  return { changeSet:threecDiff_(incoming.kind, previous && previous.normalized, incoming, payload), basis:threecPreviewBasis_(active), registry:threecRegistrySummary_(registry) };
}

function threec_changes_read(payload) {
  reportUploadAuthorize_(payload);
  return threecChangesResult_(payload || {});
}

function threecPublicResult_(result) {
  function pick(value, keys) {
    const clean = {};
    keys.forEach(function(key) { if (value && Object.prototype.hasOwnProperty.call(value, key)) clean[key] = value[key]; });
    return clean;
  }
  function publicChanges(value) {
    if (!value) return null;
    const clean = pick(value, ['kind','previousAvailable','currentAvailable','firstRelease','addedCount','changedCount','unchangedCount','removedCount','totalChangeCount','changeCount','totalRecordCount','recordCount','offset','limit','hasMore','search']);
    clean.counts = pick(value.counts, ['added','changed','unchanged','removed']);
    clean.changePage = (value.changePage || value.changes || []).map(function(row) {
      return pick(row, ['status','kind','model','modelCapacity','dimension','plan','condition','provider','grade','before','after','sourceModel','sourceCode']);
    });
    Object.defineProperty(clean, 'changes', {value:clean.changePage, enumerable:false});
    return clean;
  }
  const clean = {};
  if (Object.prototype.hasOwnProperty.call(result, 'snapshot')) {
    clean.snapshot = result.snapshot ? pick(result.snapshot, ['schema_version','kind','source_version_date','source_file_sha256','source_row_count','row_count','catalog_row_count','excluded_no_price_count','query_model_count','quote_conflict_count','published_at','snapshot_hash']) : null;
    if (clean.snapshot) clean.snapshot.rows = result.snapshot.rows.map(function(row) {
      const output = pick(row, result.snapshot.kind === 'shopping' ? ['source_sheet','brand','code','model','colorless_model','retail_price'] : ['source_sheet','brand','model']);
      if (result.snapshot.kind === 'shopping') output.project_prices = pick(row.project_prices, Object.keys(row.project_prices));
      else {
        output.quotes = {};
        THREEC_PROVIDERS.filter(function(provider) { return Object.prototype.hasOwnProperty.call(row.quotes, provider); }).forEach(function(provider) { output.quotes[provider] = pick(row.quotes[provider], threecProviderGrades_(provider)); });
      }
      return output;
    });
  }
  if (result.changesDeferred === true) clean.changesDeferred = true;
  if (Object.prototype.hasOwnProperty.call(result, 'snapshotHash')) clean.snapshotHash = result.snapshotHash;
  clean.changeSet = publicChanges(result.changeSet);
  clean.updateCheck = result.updateCheck ? pick(result.updateCheck, ['status','checked_at','snapshot_hash','source_version_date','source_file_sha256','row_count','source_row_count']) : null;
  if (clean.updateCheck) clean.updateCheck.changeSet = publicChanges(result.updateCheck.changeSet);
  return clean;
}

function threecChangesRead(payload) {
  return threecPublicResult_(threecChangesResult_(payload || {}));
}

function threecVersionChanges_(kind, verified, slot, payload) {
  let basis = verified.raw.change_basis || null;
  // Older snapshots predate this feature. A first version has no prior price
  // version; never use a newer rollback slot as its historical basis.
  if (!basis && slot.previous && slot.previous.published_at < verified.raw.published_at) basis = slot.previous;
  const previous = basis ? threecVerifiedSnapshot_(basis) : null;
  return threecDiff_(kind, previous && previous.normalized, verified.normalized, payload);
}

function threecChangesResult_(payload, suppliedRegistry, suppliedVerified) {
  const kind = threecKind_(payload.kind);
  const registry = suppliedRegistry || threecRegistry_();
  const slot = registry.kinds[kind];
  const active = slot.active;
  if (!active) return { changeSet:null, snapshotHash:'', updateCheck:null };
  if (payload.snapshotHash && String(payload.snapshotHash) !== active.snapshot_hash) throw new Error('正式版本已變動，請重新讀取再查詢異動清單');
  const verified = suppliedVerified || threecVerifiedSnapshot_(active);
  const updateCheck = slot.latest_check && slot.latest_check.snapshot_hash === active.snapshot_hash ? slot.latest_check : null;
  const changeSet = updateCheck && updateCheck.status === 'already_current'
    ? Object.assign({}, updateCheck.changeSet, { changes:[], offset:0, limit:100, changeCount:0, totalChangeCount:0, hasMore:false })
    : threecVersionChanges_(kind, verified, slot, payload);
  return { changeSet:changeSet, snapshotHash:active.snapshot_hash, updateCheck:updateCheck };
}

function threec_status(payload) { return threecStatus(payload); }
function threec_publish(payload) { return threecPublish(payload); }
function threec_rollback(payload) { return threecRollback(payload); }
function threec_readback(payload) {
  reportUploadAuthorize_(payload);
  return threecReadActive_((payload || {}).kind);
}

function threecStatus(payload) {
  reportUploadAuthorize_(payload);
  threecPrivateFolder_();
  return { registry:threecRegistrySummary_(threecRegistry_()) };
}

function threecPublish(payload) {
  const employeeId = reportUploadAuthorize_(payload);
  if ((payload || {}).confirmPublish !== true) throw new Error('請明確確認後再發布 3C／舊換新快照');
  const encoded = String((payload || {}).snapshotJson || '');
  if (!encoded || Utilities.newBlob(encoded).getBytes().length > THREEC_MAX_SNAPSHOT_JSON_BYTES) throw new Error('3C／舊換新標準化快照缺少或過大');
  const incoming = threecNormalizeIncomingSnapshot_(JSON.parse(encoded));
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const registry = threecRegistry_();
    const slot = registry.kinds[incoming.kind];
    const active = slot.active;
    if ((payload || {}).requiresDiffCheck === true && String((payload || {}).expectedActiveHash || '') !== String(active && active.snapshot_hash || '')) throw new Error('預覽後正式 active 已變動，請重新解析核對差異');
    const previous = threecVerifiedSnapshot_(active);
    const changeSet = threecDiff_(incoming.kind, previous && previous.normalized, incoming);
    const latestSource = threecLatestSource_(slot);
    if (latestSource && incoming.source_version_date < latestSource.source_version_date) throw new Error('較舊檔名日期不得覆蓋目前正式版本');
    const hasChanges = !!(changeSet.counts.changed || changeSet.counts.added || changeSet.counts.removed);
    if (active && incoming.source_file_sha256 === active.source_file_sha256 && hasChanges) throw new Error('相同來源 SHA 的解析價格與 active 不一致，請核對解析器與來源，不可重複發布');
    if (latestSource && incoming.source_version_date === latestSource.source_version_date && incoming.source_file_sha256 !== latestSource.source_file_sha256 && (payload || {}).confirmSameDateHashChange !== true) {
      return { status:'confirmation_required', reason:'same_date_hash_changed', kind:incoming.kind, registry:threecRegistrySummary_(registry) };
    }
    if (active && !hasChanges) {
      const existing = slot.latest_check;
      if (!existing || existing.snapshot_hash !== active.snapshot_hash || existing.source_file_sha256 !== incoming.source_file_sha256 || existing.source_version_date !== incoming.source_version_date) {
        const checked = JSON.parse(JSON.stringify(registry));
        checked.updated_at = privateDashboardNow();
        checked.kinds[incoming.kind].latest_check = { status:'already_current', checked_at:checked.updated_at, snapshot_hash:active.snapshot_hash, source_version_date:incoming.source_version_date, source_file_sha256:incoming.source_file_sha256, source_file_name:incoming.source_file_name, row_count:incoming.row_count, source_row_count:incoming.source_row_count, changeSet:changeSet };
        threecAuditEvent_(checked, 'check_no_price_change', incoming.kind, employeeId, 'unchanged=' + changeSet.counts.unchanged);
        threecWriteRegistry_(checked);
        return { status:'already_current', kind:incoming.kind, changeSet:changeSet, updateCheck:checked.kinds[incoming.kind].latest_check, registry:threecRegistrySummary_(checked) };
      }
      return { status:'already_current', kind:incoming.kind, changeSet:changeSet, updateCheck:existing, registry:threecRegistrySummary_(registry) };
    }
    const publishedAt = privateDashboardNow();
    const snapshot = Object.assign({}, incoming, {
      published_at:publishedAt,
      operator_hash:privateDashboardHash(employeeId).slice(0, 16),
      change_basis:active || null,
      change_counts:changeSet.counts
    });
    snapshot.snapshot_hash = threecSnapshotHash_(snapshot);
    const folder = threecPrivateFolder_();
    const compactDate = snapshot.source_version_date.replace(/-/g, '');
    const snapshotName = 'threec-' + snapshot.kind + '-' + compactDate + '-' + snapshot.source_file_sha256.slice(0, 12) + '-' + Utilities.getUuid().slice(0, 8) + '.json';
    const snapshotFile = folder.createFile(snapshotName, JSON.stringify(snapshot), MimeType.PLAIN_TEXT);
    const readback = threecReadJsonFile_(snapshotFile.getId());
    const validatedReadback = threecNormalizeIncomingSnapshot_(readback);
    if (validatedReadback.row_count !== snapshot.row_count || readback.snapshot_hash !== snapshot.snapshot_hash || threecSnapshotHash_(readback) !== snapshot.snapshot_hash) {
      throw new Error('3C／舊換新快照寫入讀回失敗，active 維持原版');
    }
    const next = JSON.parse(JSON.stringify(registry));
    next.updated_at = publishedAt;
    next.kinds[incoming.kind].empty_checkpoint = !next.kinds[incoming.kind].active;
    next.kinds[incoming.kind].latest_check = null;
    next.kinds[incoming.kind].previous = next.kinds[incoming.kind].active || null;
    next.kinds[incoming.kind].active = threecSnapshotSummary_(snapshot, snapshotFile);
    threecAuditEvent_(next, 'publish', incoming.kind, employeeId, incoming.source_version_date + ' rows=' + incoming.row_count);
    threecWriteRegistry_(next);
    return { status:'published', kind:incoming.kind, changeSet:changeSet, registry:threecRegistrySummary_(next) };
  } finally {
    lock.releaseLock();
  }
}

function threecCanRollback_(registry, kind) {
  const slot = registry.kinds[kind];
  const events = (registry.audit || []).filter(function(event) { return event.kind === kind; });
  return !!slot.previous || !!(slot.active && (slot.empty_checkpoint || (events.filter(function(event) { return event.action === 'publish'; }).length === 1 && !events.some(function(event) { return event.action === 'rollback'; }))));
}

function threecRollback(payload) {
  const employeeId = reportUploadAuthorize_(payload);
  const kind = threecKind_((payload || {}).kind);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const registry = threecRegistry_();
    const slot = registry.kinds[kind];
    if (!threecCanRollback_(registry, kind)) throw new Error('此類資料尚無可回復的 previous 版本');
    const previousSnapshot = slot.previous ? threecReadJsonFile_(slot.previous.snapshot_file_id) : null;
    if (previousSnapshot) {
      threecNormalizeIncomingSnapshot_(previousSnapshot);
      if (threecSnapshotHash_(previousSnapshot) !== previousSnapshot.snapshot_hash) throw new Error('previous 快照雜湊驗證失敗');
    }
    const next = JSON.parse(JSON.stringify(registry));
    const oldActive = next.kinds[kind].active;
    next.kinds[kind].active = next.kinds[kind].previous;
    next.kinds[kind].previous = oldActive;
    next.kinds[kind].empty_checkpoint = false;
    next.kinds[kind].latest_check = null;
    next.updated_at = privateDashboardNow();
    threecAuditEvent_(next, 'rollback', kind, employeeId, next.kinds[kind].active ? next.kinds[kind].active.source_version_date : 'restored-empty-first-release-checkpoint');
    threecWriteRegistry_(next);
    return { status:'rolled_back', kind:kind, registry:threecRegistrySummary_(next) };
  } finally {
    lock.releaseLock();
  }
}

function threecAuthorizeRead_(payload) {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('threecAuthorizeRead_', __authArgs, function() {

  const employeeId = privateDashboardCleanEmployeeId((payload || {}).employeeId);
  const deviceId = privateDashboardCleanDeviceId((payload || {}).deviceId);
  return privateDashboardRosterTransaction_(function() {
    const lookup = privateDashboardUserByEmployeeId(employeeId);
    if (!lookup.user || lookup.user.status !== 'active' || (!privateDashboardIsTrustedEmployee(employeeId) && lookup.user.device_id !== deviceId)) {
      throw new Error('此員編尚未核准此裝置，無法讀取 3C／舊換新私有資料');
    }
    lookup.sheet.getRange(lookup.user._row, 8, 1, 1).setValues([[privateDashboardNow()]]);
    return employeeId;
  });

  });
}

// Only verified, public price projections enter this ephemeral cache. Every
// request reads the current private registry first; a new active or deployment
// protocol gets a different key. Missing/tampered chunks are always a cold read.
function threecPublicCacheDigest_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text)
    .map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
}

function threecPublicCacheRead_(cache, key) {
  try {
    const manifest = JSON.parse(cache.get(key + ':manifest') || 'null');
    if (!manifest || manifest.protocol !== 'public-compact/v2' ||
        !Number.isInteger(manifest.count) || manifest.count < 1 || manifest.count > 500 ||
        !/^[a-f0-9]{64}$/.test(manifest.digest)) return null;
    const keys = Array.from({length:manifest.count}, function(_, index) { return key + ':' + index; });
    const chunks = cache.getAll(keys);
    if (keys.some(function(name) { return typeof chunks[name] !== 'string'; })) return null;
    const text = keys.map(function(name) { return chunks[name]; }).join('');
    if (threecPublicCacheDigest_(text) !== manifest.digest) return null;
    const result = JSON.parse(text);
    // Validate compact structure as well as the full-string checksum.
    ThreecPriceTransport.decode(result);
    return result;
  } catch (_) { return null; }
}

function threecPublicCacheWrite_(cache, key, result) {
  try {
    const text = JSON.stringify(result), chunks = {}, count = Math.ceil(text.length / 20000);
    if (count < 1 || count > 500) return;
    for (let index = 0; index < count; index++) chunks[key + ':' + index] = text.slice(index * 20000, (index + 1) * 20000);
    // <=60 KB UTF-8 per chunk, below CacheService's 100 KB limit.
    cache.putAll(chunks, 600);
    cache.put(key + ':manifest', JSON.stringify({protocol:'public-compact/v2', count:count, digest:threecPublicCacheDigest_(text)}), 600);
  } catch (_) { /* Cache availability never prevents a verified source read. */ }
}

function threecSnapshotRead(payload) {
  payload = payload || {};
  const started = Date.now(), timings = {};
  const kind = threecKind_(payload.kind);
  const registry = threecRegistry_();
  timings.registryMs = Date.now() - started;
  const active = registry.kinds[kind].active;
  const fast = kind === 'shopping' && payload.includeChanges === false && payload.priceEncoding === 'shopping-columns/v1' && active;
  let cache, key, result, stage = Date.now();
  if (fast) {
    // Code fingerprint invalidates cache when the deployed read contract changes.
    const revision = [threecReadActive_, threecSnapshotHash_, threecNormalizeIncomingSnapshot_, threecPublicResult_, threecPublicCacheRead_, threecPublicCacheWrite_, ThreecPriceTransport.encode, ThreecPriceTransport.decode].map(String).join('\n');
    key = 'threec-public-v2:' + threecPublicCacheDigest_(revision + JSON.stringify({active:active, registry:threecRegistrySummary_(registry)}));
    try { cache = CacheService.getScriptCache(); } catch (_) {}
    if (cache) result = threecPublicCacheRead_(cache, key);
    // Anchor cached metadata to the freshly verified registry, never the client.
    if (result && (!result.snapshot || result.snapshot.snapshot_hash !== active.snapshot_hash ||
        result.snapshot.kind !== active.kind || result.snapshot.source_version_date !== active.source_version_date ||
        result.snapshot.source_file_sha256 !== active.source_file_sha256 || Number(result.snapshot.row_count) !== Number(active.row_count))) result = null;
  }
  timings.cacheMs = Date.now() - stage;
  timings.cacheHit = !!result;
  if (!result) {
    result = threecPublicResult_(threecReadActive_(kind, {registry:registry, includeChanges:payload.includeChanges !== false, timings:timings}));
    stage = Date.now();
    if (payload.priceEncoding === 'shopping-columns/v1') result = ThreecPriceTransport.encode(result);
    timings.encodeMs = Date.now() - stage;
    if (fast && cache) threecPublicCacheWrite_(cache, key, result);
  }
  timings.totalMs = Date.now() - started;
  if (payload.includeReadTimings === true) result.readTimings = timings;
  return result;
}

function threecReadActive_(requestedKind, options) {
  const kind = threecKind_(requestedKind);
  const registry = options && options.registry || threecRegistry_();
  const active = registry.kinds[kind].active;
  if (!active) return { snapshot:null, registry:threecRegistrySummary_(registry) };
  let stage = Date.now();
  const snapshot = threecReadJsonFile_(active.snapshot_file_id);
  if (options && options.timings) options.timings.sourceReadMs = Date.now() - stage;
  stage = Date.now();
  const normalized = threecNormalizeIncomingSnapshot_(snapshot);
  if (options && options.timings) options.timings.normalizeMs = Date.now() - stage;
  stage = Date.now();
  const sourceHash = threecSnapshotHash_(snapshot);
  if (options && options.timings) options.timings.hashMs = Date.now() - stage;
  if (sourceHash !== snapshot.snapshot_hash ||
      active.snapshot_hash !== snapshot.snapshot_hash || active.kind !== normalized.kind ||
      active.source_version_date !== normalized.source_version_date ||
      active.source_file_sha256 !== normalized.source_file_sha256 ||
      Number(active.row_count) !== normalized.row_count) {
    throw new Error('3C／舊換新 active 快照雜湊或版本驗證失敗');
  }
  normalized.published_at = snapshot.published_at;
  normalized.snapshot_hash = snapshot.snapshot_hash;
  // Query prices need the complete verified snapshot, not a full historical
  // diff. Keep authenticated maintenance readbacks and legacy callers intact.
  if (options && options.includeChanges === false) {
    return { snapshot:normalized, registry:threecRegistrySummary_(registry), changeSet:null, updateCheck:null, changesDeferred:true };
  }
  const changes = threecChangesResult_({ kind:kind, snapshotHash:active.snapshot_hash, limit:100 }, registry, { raw:snapshot, normalized:normalized });
  return { snapshot:normalized, registry:threecRegistrySummary_(registry), changeSet:changes.changeSet, updateCheck:changes.updateCheck };
}

function privateDashboardAdminRequests(payload) {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('privateDashboardAdminRequests', __authArgs, function() {

  privateDashboardAdminAuthorized(payload);
  const requests = privateDashboardRows(
    privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS),
    PRIVATE_DASHBOARD_REQUEST_HEADERS
  ).filter(function(item) { return item.status === 'pending'; })
    .sort(function(a, b) { return b.requested_at.localeCompare(a.requested_at); });
  return { requests: requests.map(function(item) { return {
    requestId: item.request_id, employeeId: item.employee_id, requestedAt: item.requested_at
  }; }) };

  });
}

function privateDashboardAdminApprove(payload) {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('privateDashboardAdminApprove', __authArgs, function() {

  privateDashboardAdminAuthorized(payload);
  const requestId = String(payload.requestId || '');
  if (!requestId) throw new Error('缺少綁定申請編號');
  return privateDashboardRosterTransaction_(function() {
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
  });

  });
}

function privateDashboardAdminRevoke(payload) {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('privateDashboardAdminRevoke', __authArgs, function() {

  privateDashboardAdminAuthorized(payload);
  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  return privateDashboardRosterTransaction_(function() {
    const lookup = privateDashboardUserByEmployeeId(employeeId);
    if (!lookup.user) throw new Error('找不到員編');
    privateDashboardAuthNativeBegin_('privateDashboardAdminRevoke', __authArgs);
    lookup.user.status = 'revoked';
    lookup.user.device_id = '';
    lookup.user.device_bound_at = '';
    lookup.user.last_login_at = '';
    privateDashboardWriteObject(lookup.sheet, PRIVATE_DASHBOARD_USERS_HEADERS, lookup.user._row, lookup.user);
    const requestSheet = privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS);
    privateDashboardRows(requestSheet, PRIVATE_DASHBOARD_REQUEST_HEADERS).forEach(function(request) {
      if (request.employee_id !== employeeId || request.status !== 'pending') return;
      request.status = 'revoked';
      privateDashboardWriteObject(requestSheet, PRIVATE_DASHBOARD_REQUEST_HEADERS, request._row, request);
    });
    return { revoked: true, employeeId: employeeId };
  });

  });
}

function privateDashboardAdminSetTrustedEmployee(payload) {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('privateDashboardAdminSetTrustedEmployee', __authArgs, function() {

  privateDashboardAdminAuthorized(payload);
  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const lookup = privateDashboardUserByEmployeeId(employeeId);
  if (!lookup.user || lookup.user.status !== 'active') throw new Error('此員編不在可使用名冊中');
  const props = privateDashboardProperties();
    privateDashboardAuthNativeBegin_('privateDashboardAdminSetTrustedEmployee', __authArgs);
  props.setProperty('DASHBOARD_TRUSTED_EMPLOYEE_ID', employeeId);
  const notificationEmail = String(payload.notificationEmail || '').trim();
  if (notificationEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail)) throw new Error('通知信箱格式不正確');
    props.setProperty('DASHBOARD_NOTIFY_EMAIL', notificationEmail);
  }
  return { trustedEmployeeId: employeeId };

  });
}

function privateDashboardAdminSnapshotStatus(payload) {
  privateDashboardAdminAuthorized(payload);
  const file = privateDashboardLatestSnapshotFile_();
  if (!file) throw new Error('私有戰情快照不存在');
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
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('kpiCalcAccess', __authArgs, function() {

  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const deviceId = privateDashboardCleanDeviceId(payload.deviceId);
  const user = privateDashboardRecordLogin_(employeeId, deviceId);
  const file = kpiCalcLatestDataFile();
  if (!file) throw new Error('KPI 試算資料尚未發佈，請通知督導');
  const data = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if (!data || !data.meta || !data.stores || !data.persons) throw new Error('KPI 試算資料格式不完整');
  return { data: data, profile: { maskedName: user.masked_name, store: user.store, role: user.role, isTrusted: privateDashboardIsTrustedEmployee(employeeId) } };

  });
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
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('kpiCalcSetupSelf', __authArgs, function() {

  return privateDashboardRosterTransaction_(function() {
    const raw = PropertiesService.getScriptProperties().getProperty('DASHBOARD_TRUSTED_EMPLOYEE_ID');
    if (!raw) throw new Error('請先在「專案設定 > 指令碼屬性」新增 DASHBOARD_TRUSTED_EMPLOYEE_ID = 你的員編');
    const employeeId = privateDashboardCleanEmployeeId(raw);
    const lookup = privateDashboardUserByEmployeeId(employeeId);
    const user = lookup.user || {
      employee_id: employeeId, masked_name: '督導', store: '北一二B', role: '督導',
      device_id: '', device_bound_at: '', last_login_at: ''
    };
    if (user.status === 'revoked') throw new Error('此員編已撤權，須由管理者明確恢復資格');
    user.status = 'active';
    privateDashboardWriteObject(lookup.sheet, PRIVATE_DASHBOARD_USERS_HEADERS, user._row || lookup.sheet.getLastRow() + 1, user);
    return { trusted: employeeId, status: 'active', note: '此員編已可在任何裝置直接登入' };
  });

  });
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
// Renew password eligibility only from the existing administrator-authorized full roster sync.
// No new trigger, credential, automatic initialization, or binding/session reset.
function privateDashboardPreparePasswordRosterRenewal_(prepared) {
  if (PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ !== true || PRIVATE_DASHBOARD_GAS_PASSWORD_ENABLED_ !== true) return null;
  privateDashboardRequireAuthOwner_();
  if (!privateDashboardRosterLockDepth_) throw new Error('B_OWNER_LOCK_REQUIRED');
  const props = privateDashboardProperties();
  const before = props.getProperty(PRIVATE_DASHBOARD_B_CONFIG_KEY_);
  const config = privateDashboardCreateGasBStore_({}).config();
  const members = Object.create(null);
  prepared.forEach(function(member) {
    const store = String(member.store || '').trim().replace(/\s+/g, '').replace(/^台灣大哥大數位生活台北/, '').replace(/^台灣大哥大台北/, '').replace(/^台北/, '');
    if (PRIVATE_DASHBOARD_B_STORES_.indexOf(store) >= 0) members[member.employee_id] = store;
  });
  const ids = Object.keys(members).sort();
  if (!ids.length || ids.length > 64 || PRIVATE_DASHBOARD_B_STORES_.some(function(store) {
    return !ids.some(function(id) { return members[id] === store; });
  })) throw new Error('B_COMPLETE_ROSTER_REQUIRED');
  const canonical = JSON.stringify(ids.map(function(id) { return [id, members[id]]; }));
  const sourceHash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, canonical, Utilities.Charset.UTF_8)
    .map(function(byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
  const now = Date.now(), version = config.authority.version + 1;
  if (!Number.isSafeInteger(version)) throw new Error('B_STATE_INVALID');
  config.authority = {version: version, sourceHash: sourceHash, effectiveAt: now, validUntil: now + 48 * 60 * 60 * 1000, members: members};
  delete config.fingerprint;
  const after = privateDashboardGasAuthJson_(config, 8000);
  return function() {
    if (props.getProperty(PRIVATE_DASHBOARD_B_CONFIG_KEY_) !== before) throw new Error('B_CONFIG_CHANGED');
    props.setProperty(PRIVATE_DASHBOARD_B_CONFIG_KEY_, after);
    if (props.getProperty(PRIVATE_DASHBOARD_B_CONFIG_KEY_) !== after) throw new Error('B_PERSISTENCE_FAILED');
  };
}

function privateDashboardSyncRoster(payload) {
  const __authArgs = Array.prototype.slice.call(arguments);
  return privateDashboardAuthRun_('privateDashboardSyncRoster', __authArgs, function() {

  privateDashboardAdminAuthorized(payload);
  const members = Array.isArray(payload.members) ? payload.members : [];
  // Reject an unsafe batch before even creating/repairing the roster sheet.
  const seen = Object.create(null);
  const prepared = members.map(function(member) {
    if (!member || typeof member !== 'object' || Array.isArray(member)) throw new Error('名冊成員格式不正確');
    const employeeId = privateDashboardCleanEmployeeId(member.employeeId);
    if (seen[employeeId]) throw new Error('同步名冊員編重複，請管理者核對');
    seen[employeeId] = true;
    return {
      employee_id: employeeId, masked_name: String(member.maskedName || ''),
      store: String(member.store || ''), role: String(member.role || ''),
      status: member.status === 'inactive' ? 'inactive' : 'active'
    };
  });
  return privateDashboardRosterTransaction_(function() {
    const sheet = privateDashboardSheet(PRIVATE_DASHBOARD_USERS_SHEET, PRIVATE_DASHBOARD_USERS_HEADERS);
    const existing = privateDashboardRows(sheet, PRIVATE_DASHBOARD_USERS_HEADERS);
    const byId = Object.create(null);
    existing.forEach(function(item) {
      const employeeId = privateDashboardCleanEmployeeId(item.employee_id);
      if (employeeId !== item.employee_id) throw new Error('名冊員編格式不一致，請管理者核對');
      if (byId[employeeId]) throw new Error('名冊員編重複，請管理者核對');
      byId[employeeId] = item;
    });
    const renewPasswordRoster = privateDashboardPreparePasswordRosterRenewal_(prepared);
    let synced = 0;
    privateDashboardAuthNativeBegin_('privateDashboardSyncRoster', __authArgs);
    prepared.forEach(function(member) {
      const employeeId = member.employee_id;
      const item = byId[employeeId] || {
        employee_id: employeeId, device_id: '', device_bound_at: '', last_login_at: ''
      };
      item.masked_name = member.masked_name;
      item.store = member.store;
      item.role = member.role;
      // Only the separate, explicit admin restore action may clear this deny.
      item.status = ['revoked', 'inactive'].indexOf(item.status) >= 0 ? item.status : member.status;
      item._row = item._row || sheet.getLastRow() + 1;
      privateDashboardWriteObject(sheet, PRIVATE_DASHBOARD_USERS_HEADERS, item._row, item);
      byId[employeeId] = item;
      synced += 1;
    });
    if (renewPasswordRoster) renewPasswordRoster();
    return { synced: synced };
  });

  });
}

function privateDashboardCanonicalKpiSource_(value) {
  const raw = String(value || '').replace(/\\/g, '/').split('/').pop();
  const staged = raw.match(/^report-upload-temp-[a-f0-9]{32,64}-(\d{4}\.xlsx)$/i);
  return staged ? staged[1] : raw;
}

function privateDashboardCanonicalKpiStore_(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/^台灣大哥大數位生活台北/, '')
    .replace(/^台灣大哥大台北/, '')
    .replace(/^台北/, '');
}

function privateDashboardCanonicalKpiPersonName_(value) {
  return String(value || '').trim().replace(/\s+/g, '').replace(/＊/g, '*');
}

function privateDashboardKpiPersonKeys_(kpicalc, kpiBattle) {
  const codeToStore = {};
  (Array.isArray(kpicalc && kpicalc.stores) ? kpicalc.stores : []).forEach(function(store) {
    const code = String(store && store.code || '').trim();
    const name = privateDashboardCanonicalKpiStore_(store && (store.name || store.store));
    if (code && name) codeToStore[code] = name;
  });
  const protectedKeys = (Array.isArray(kpicalc && kpicalc.persons) ? kpicalc.persons : []).map(function(person) {
    const rawStore = String(person && person.store || '').trim();
    const store = codeToStore[rawStore] || privateDashboardCanonicalKpiStore_(rawStore);
    const name = privateDashboardCanonicalKpiPersonName_(person && (person.pname || person.name));
    return store && name ? store + '|' + name : '';
  }).sort();
  const supplementKeys = (Array.isArray(kpiBattle && kpiBattle.personal) ? kpiBattle.personal : []).map(function(person) {
    const store = privateDashboardCanonicalKpiStore_(person && person.store);
    const name = privateDashboardCanonicalKpiPersonName_(person && (person.name || person.pname));
    return store && name ? store + '|' + name : '';
  }).sort();
  return { protectedKeys: protectedKeys, supplementKeys: supplementKeys };
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
  const protectedPersonCount = Array.isArray(kpicalc.persons) ? kpicalc.persons.length : 0;
  if (!Array.isArray(kpicalc.stores) || kpicalc.stores.length !== 9 ||
      protectedPersonCount < 10 ||
      !Array.isArray(kpicalc.items) || kpicalc.items.length !== 25) {
    throw new Error('protected KPI 必須為 9 店／至少 10 人／25 KPI items');
  }
  if (!Array.isArray(kpiBattle.stores) || kpiBattle.stores.length !== 9 ||
      !Array.isArray(kpiBattle.personal) || kpiBattle.personal.length !== protectedPersonCount) {
    throw new Error('KPI supplement 必須為九店，且人員筆數需與 protected KPI 一致（' + protectedPersonCount + ' 人）');
  }
  const personKeys = privateDashboardKpiPersonKeys_(kpicalc, kpiBattle);
  if (personKeys.protectedKeys.some(function(key) { return !key; }) ||
      personKeys.supplementKeys.some(function(key) { return !key; })) {
    throw new Error('KPI 人員名單含無法辨識的店點或姓名');
  }
  if (JSON.stringify(personKeys.protectedKeys) !== JSON.stringify(personKeys.supplementKeys)) {
    throw new Error('KPI supplement 人員名單與 protected KPI 不一致');
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
  const file = privateDashboardLatestSnapshotFile_();
  if (!file) throw new Error('既有私有戰情快照不存在');
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
  const expectedPhoneItems = /^2026-(09|10)-/.test(cutoff) ? 10 : 13;
  if (Number(awardsBattle.phone_items) !== expectedPhoneItems || Number(awardsBattle.store_rows) !== 10 ||
      !Array.isArray(awardsBattle.stores) || awardsBattle.stores.length !== 9 ||
      !awardsBattle.overall || !Array.isArray(awardsBattle.overall.items) || awardsBattle.overall.items.length !== expectedPhoneItems ||
      awardsBattle.stores.some(row => !Array.isArray(row.items) || row.items.length !== expectedPhoneItems)) {
    throw new Error('awards component 必須為 ' + expectedPhoneItems + ' 機款／九店／10 列');
  }
  if (cutoff.slice(0,7) === '2026-10') {
    const expectedModels = ["ZFold8Ultra/ZFold8/ZFlip8","Pixel10a","Pixel11Pro/11ProXL/11ProFold","S26Ultra","Pixel11","S26/S26+","Reno16F","A57","V80Lite","A6x6G/128G/A7Pro"];
    const normalizeName = name => String(name || '').replace(/Google|Samsung|Galaxy|OPPO|vivo/gi,'').replace(/[\s/／&＆+]/g,'').toLowerCase();
    const expected = expectedModels.map(normalizeName);
    const matches = items => {
      const names = items.map(item=>normalizeName(item && (item.name || item.display_name)));
      return new Set(names).size === expected.length && names.every(name=>expected.indexOf(name)>=0);
    };
    if (!matches(awardsBattle.overall.items) || awardsBattle.stores.some(row=>!matches(row.items))) {
      throw new Error('AWARDS_MODEL_MONTH_MISMATCH：十月機款組合不符');
    }
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
  const file = privateDashboardLatestSnapshotFile_();
  if (!file) throw new Error('既有私有戰情快照不存在');
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
  let file = privateDashboardLatestSnapshotFile_();
  if (file) {
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
  'report_upload_preview', 'report_upload_commit', 'report_upload_log', 'report_upload_rollback',
  'threec_snapshot_read', 'threec_changes_read'
];

// 上傳頁與上傳 API 同屬新 Deployment，使用 google.script.run 直接呼叫這四個包裝函式。
// 不從 GitHub Pages fetch，不需要 CORS／preflight，也不把任何設定值注入 HTML。
function reportUploadHtmlService_() {
  return HtmlService.createTemplateFromFile('ReportUpload').evaluate()
    .setTitle('北一二B 資料快速上傳');
}

function reportUploadInclude_(name) {
  if (name !== 'ReportUploadSheetJs' && name !== 'ReportUploadTradeInCore' && name !== 'ReportUploadThreecDiffCore') {
    throw new Error('report-upload-include-not-allowed');
  }
  // Assets are JavaScript, not standalone HTML. Read them without HTML parsing;
  // escape literal codepage control characters before inserting into <script>.
  return HtmlService.createTemplateFromFile(name).getRawContent()
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, function(character) {
      return '\\x' + ('0' + character.charCodeAt(0).toString(16)).slice(-2);
    });
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

// BEGIN TRADEIN PERFORMANCE MODULE (generated by scripts/build-tradein-gas.mjs)
/* Shared calculation contract. Raw transaction keys exist only during this call. */
var TradeinPerformanceCore = (function () {
  'use strict';
  const STORES = Object.freeze([
    ['DNB10062','酒泉'],['DNB10082','永吉'],['DNB10094','復興南'],
    ['DNB10146','杭州南'],['DNB10168','萬大'],['DNB10174','通化'],
    ['DNB10284','大稻埕'],['DNB10307','三創'],['DNB10440','六張犁']
  ]);
  const RULE_ID = 'monthly3-inclusive-original-month-v1';
  function shortModel(value) {
    if(value===null || value===undefined || value==='')return null;
    if(typeof value!=='string' || value.length>300 || /[<>\u0000-\u001f]|\d{10,}/.test(value))throw new Error('回收機款格式無效');
    let model=value.trim().replace(/^\(舊機\)\s*/,'').replace(/\((20\d{2})\)/g,' $1 ').replace(/\([^)]*\)/g,'')
      .replace(/_[A-Z]等.*$/i,'').replace(/[_-]+$/,'').replace(/_/g,' ').replace(/\s+/g,' ').trim();
    model=model.replace(/^APPLE\s+/i,'').replace(/iPhone\s*(\d+)\s*Pro\s*Max/i,'i$1PM')
      .replace(/iPhone\s*(\d+)\s*Pro/i,'i$1P').replace(/iPhone\s*(\d+)\s*Plus/i,'i$1Plus')
      .replace(/iPhone\s*(\d+)/i,'i$1').replace(/iPhone\s*SE\s*/i,'iSE ')
      .replace(/^Google\s+/i,'').replace(/\bPixel\s*(\d+)\s*Pro\s*XL/i,'Pixel $1P XL').replace(/\bPixel\s*(\d+)\s*Pro/i,'Pixel $1P')
      .replace(/^SAMSUNG\s+(?:Galaxy\s+)?/i,'').replace(/\bUltra\b/gi,'U')
      .replace(/\d+GB\/(\d+)(?:GB|G)\b/gi,'$1G').replace(/\b(\d+)GB\b/gi,'$1G')
      .replace(/\bPlus\b/gi,'+').replace(/\s*[-_]\s*(?=\d+(?:G|T)\b)/gi,' ')
      .replace(/\s*[-_]\s*$/,'').replace(/\s+/g,' ').trim();
    if(!model || model.length>80 || !/^[A-Za-z0-9 .+()\/\-]+$/.test(model))throw new Error('回收機款簡稱無法辨識');
    return model;
  }
  function date(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || isNaN(Date.parse(value+'T00:00:00Z')) ||
        new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value) throw new Error('日期無效');
    return value;
  }
  function monthPeriod(month) {
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month || '')) throw new Error('月份無效');
    const parts=month.split('-').map(Number);
    return {start:month+'-01',end:new Date(Date.UTC(parts[0],parts[1],0)).toISOString().slice(0,10)};
  }
  function storeName(value) {
    const v=String(value || '').trim();
    if (v==='台灣大哥大數位生活台北三創' || v==='台北三創') return '三創';
    const short=v.replace(/^台北/,'');
    return STORES.some(s=>s[1]===short)?short:null;
  }
  function role(value) {
    if (value==='店長') return '店長';
    if (value==='代理店長') return '代理店長';
    if (/^(副店長|資深業務代表|業務代表\([I]+\)|業代|銷售人員|同仁)$/.test(value || '')) return '同仁';
    return '待核';
  }
  // Only an owner-loaded private configuration may supply this third argument.
  // Transaction payloads cannot supply a crosswalk or grant roster/auth status.
  function references(input, config) {
    if(!config || config.schema_version!=='tradein-private-reference/v1' ||
       config.source_sha256!==input.source_sha256 || config.source_start!==input.source_start || config.source_end!==input.source_end)
      throw new Error('私有對照配置缺漏或與本批來源不符');
    if(!Array.isArray(config.stores) || config.stores.length!==9 || !Array.isArray(config.employees))throw new Error('私有店碼／員編對照格式無效');
    const stores=new Map(),storeNames=new Set(),employees=new Map(),canonical=new Set();
    config.stores.forEach(s=>{
      const name=storeName(s.store);
      if(typeof s.store_code!=='string' || !STORES.some(v=>v[0]===s.store_code&&v[1]===name) || stores.has(s.store_code) || storeNames.has(name))
        throw new Error('私有店碼對照未知、重複或衝突');
      stores.set(s.store_code,name);storeNames.add(name);
    });
    config.employees.forEach(e=>{
      if(typeof e.source_employee_id!=='string' || !/^[A-Za-z0-9]{5}$/.test(e.source_employee_id) ||
         typeof e.employee_key!=='string' || !/^[A-Z0-9]{7}$/.test(e.employee_key) ||
         employees.has(e.source_employee_id) || canonical.has(e.employee_key) || !Array.isArray(e.observations) || !e.observations.length)
        throw new Error('私有員編對照未知、重複或衝突');
      const observations=new Set();
      e.observations.forEach(o=>{
        const observed=date(o.trade_date);
        if(observed<input.source_start || observed>input.source_end || !stores.has(o.store_code))throw new Error('員編對照觀測期間／店碼衝突');
        observations.add(JSON.stringify([observed,o.store_code]));
      });
      employees.set(e.source_employee_id,{employee_key:e.employee_key,observations});canonical.add(e.employee_key);
    });
    return {stores,employees};
  }
  function build(input, roster, privateConfig) {
    if (!input || input.rule_id!==RULE_ID || input.complete_nine_stores!==true) throw new Error('九店涵蓋或計數規則尚未確認');
    const period=monthPeriod(input.month), start=date(input.source_start), end=date(input.source_end);
    const statusAsOf=date(input.status_as_of_date || end);
    if(statusAsOf<end)throw new Error('取消核對日期不可早於報表查詢截止');
    if (start!==period.start || end>period.end || end<start) throw new Error('必須提供選定月首日起的完整九店報表');
    if (!/^[a-f0-9]{64}$/.test(input.source_sha256 || '')) throw new Error('來源雜湊無效');
    if (!Array.isArray(input.records) || input.records.length>20000 || !Array.isArray(roster)) throw new Error('來源／名冊格式無效');
    const reference=references(input,privateConfig);
    const people=[], byId={};
    roster.forEach(r=>{
      if (r.status!=='active') return;
      const store=storeName(r.store);
      if (!store) return;
      if(typeof r.employee_id!=='string')throw new Error('名冊員編必須為字串');
      const employee=r.employee_id.toUpperCase();
      if (!/^[A-Z0-9]{5,12}$/.test(employee) || byId[employee]) throw new Error('名冊員編重複或無效');
      const p={employee_key:employee,store:store,masked_name:String(r.masked_name || '姓名未提供'),
        role:role(r.role),original_role:String(r.role || ''),identity_status:'confirmed',actual_units:0};
      p.recovered_models=[];p.recovered_days=[];people.push(p);byId[employee]=p;
    });
    const stores=STORES.map(s=>({store:s[1],store_code:s[0],total_units:0,pending_identity_units:0,
      target_staff_count:0,staff_target_units:0,target_staff_actual_units:0,met_staff_count:0,
      manager_actual_units:0,acting_manager_actual_units:0,staff_gap_units:0,pending_staff_count:0,coverage:'complete'}));
    const byStore=Object.fromEntries(stores.map(s=>[s.store,s]));
    const unique={};let duplicates=0,cancelled=0;
    input.records.forEach(r=>{
      const store=reference.stores.get(r.store_code);
      if (!store) throw new Error('來源含九店範圍以外或未知店碼');
      const trade=date(r.trade_date), cancel=r.cancel_date?date(r.cancel_date):null;
      if (trade<start || trade>end || cancel && (cancel<trade || cancel>statusAsOf)) throw new Error('交易／取消日期與來源期間衝突');
      if (!['單銷','RT','AQNP'].includes(r.project)) throw new Error('未知專案類別，停止計數');
      if(typeof r.source_employee_id!=='string' || !/^[A-Za-z0-9]{5}$/.test(r.source_employee_id))throw new Error('來源員編必須保留五碼字串');
      const seller=r.source_employee_id,identity=reference.employees.get(seller);
      if(!identity || !identity.observations.has(JSON.stringify([trade,r.store_code])))throw new Error('來源員編缺少本批日期／店碼的精確私有對照');
      if(typeof r.recycle_code!=='string' || typeof r.order_number!=='string')throw new Error('回收碼／銷貨單號必須為字串');
      const key=r.recycle_code.trim(), order=r.order_number.trim();
      if (!key || !order || key.length>100 || order.length>100) throw new Error('缺少有效回收碼／銷貨單號');
      const model=shortModel(r.recycle_model);
      const normalized={store:store,trade_date:trade,cancel_date:cancel,employee_key:identity.employee_key,order:order,project:r.project,model:model};
      if (unique[key]) {
        const prior=unique[key];
        if (prior.store!==store || prior.trade_date!==trade || prior.employee_key!==normalized.employee_key || prior.order!==order || prior.project!==r.project) throw new Error('同回收碼的交易、人員或店點衝突');
        if(prior.model!==model)throw new Error('同回收碼的機款衝突');
        if (cancel && (!prior.cancel_date || cancel>prior.cancel_date)) prior.cancel_date=cancel;
        duplicates++;
      } else unique[key]=normalized;
    });
    Object.values(unique).forEach(r=>{
      const person=byId[r.employee_key];
      if(!r.cancel_date && person && person.store!==r.store)person.identity_status='conflict';
    });
    Object.values(unique).forEach(r=>{
      if (r.cancel_date) {cancelled++;return;}
      const store=byStore[r.store];store.total_units++;
      const person=byId[r.employee_key];
      if (!person || person.store!==r.store || person.identity_status==='conflict') {store.pending_identity_units++;store.coverage='partial_identity';return;}
      person.actual_units++;
      let daily=person.recovered_days.find(d=>d.date===r.trade_date);
      if(!daily){daily={date:r.trade_date,actual_units:0,recovered_models:[]};person.recovered_days.push(daily);}
      daily.actual_units++;
      if(!r.model)daily.recovered_models=null;
      else if(daily.recovered_models!==null){const item=daily.recovered_models.find(m=>m.model===r.model);if(item)item.units++;else daily.recovered_models.push({model:r.model,units:1});}
      if(!r.model)person.recovered_models=null;
      else if(person.recovered_models!==null){const item=person.recovered_models.find(m=>m.model===r.model);if(item)item.units++;else person.recovered_models.push({model:r.model,units:1});}
    });
    people.forEach(p=>{
      const s=byStore[p.store], exempt=['店長','代理店長'].includes(p.role);
      if(p.identity_status==='conflict'){p.actual_units=null;p.recovered_models=null;p.recovered_days=null;s.coverage='partial_identity';}
      if(p.recovered_models)p.recovered_models.sort((a,b)=>a.model.localeCompare(b.model,'en'));
      if(p.recovered_days){p.recovered_days.sort((a,b)=>a.date.localeCompare(b.date));p.recovered_days.forEach(d=>{if(d.recovered_models)d.recovered_models.sort((a,b)=>a.model.localeCompare(b.model,'en'));});}
      p.target_units=p.role==='同仁'?3:null;
      p.remaining_units=p.target_units===null||p.actual_units===null?null:Math.max(3-p.actual_units,0);
      p.attainment_status=exempt?'exempt':p.role==='同仁'&&p.actual_units!==null?(p.actual_units>=3?'met':'in_progress'):'pending';
      if (p.role==='同仁') {
        s.target_staff_count++;s.staff_target_units+=3;s.target_staff_actual_units+=p.actual_units;
        s.staff_gap_units+=p.remaining_units;if(p.actual_units>=3)s.met_staff_count++;if(p.actual_units===null)s.pending_staff_count++;
      } else if(p.role==='店長') s.manager_actual_units=p.actual_units===null||s.manager_actual_units===null?null:s.manager_actual_units+p.actual_units;
      else if(p.role==='代理店長') s.acting_manager_actual_units=p.actual_units===null||s.acting_manager_actual_units===null?null:s.acting_manager_actual_units+p.actual_units;
      else s.coverage='partial_roster';
    });
    const sum=key=>stores.reduce((n,s)=>n+s[key],0);
    const summary={total_units:sum('total_units'),assigned_units:people.reduce((n,p)=>n+p.actual_units,0),
      pending_identity_units:sum('pending_identity_units'),target_staff_count:sum('target_staff_count'),
      staff_target_units:sum('staff_target_units'),met_staff_count:sum('met_staff_count'),staff_gap_units:sum('staff_gap_units'),
      mobilized_stores:stores.filter(s=>s.total_units>0).length,pending_staff_count:sum('pending_staff_count'),store_count:9,duplicate_rows:duplicates,cancelled_units:cancelled};
    if (summary.assigned_units+summary.pending_identity_units!==summary.total_units) throw new Error('店、人員與未分配台數對帳失敗');
    return {schema_version:'tradein-performance/v1',period_key:input.month,rule_id:RULE_ID,target_period:period,
      source_period:{start:start,end:end},source_cutoff_date:end,cutoff_precision:'date',timezone:'Asia/Taipei',
      source_sha256:input.source_sha256,status_as_of_date:statusAsOf,printed_at:String(input.printed_at || ''),people:people,stores:stores,summary:summary};
  }
  function csv(text) {
    const rows=[];let row=[],cell='',quoted=false;
    for(let i=0;i<text.length;i++){
      const c=text[i];
      if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(!quoted&&cell.length)cell+='"';else quoted=!quoted;}
      else if(c===','&&!quoted){row.push(cell);cell='';}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
      else cell+=c;
    }
    if(quoted)throw new Error('CSV 引號未完整結束');
    if(cell||row.length){row.push(cell);rows.push(row);}return rows;
  }
  function unwrap(v){return String(v || '').trim().replace(/^="(.*)"$/,'$1');}
  function roc(v){const s=unwrap(v).replace(/[\/\-]/g,'');if(!/^\d{7}$/.test(s))throw new Error('SAR74 日期格式無效');return date(String(Number(s.slice(0,3))+1911)+'-'+s.slice(3,5)+'-'+s.slice(5,7));}
  function parseSar74(text) {
    const rows=csv(String(text).replace(/^\uFEFF/,''));
    const labels=['序號','店點代碼','區域別','日期','專案類別','回收代碼/IMEI','銷貨單號','員工編號','取消交易日期'];
    const headers=rows.map((r,i)=>({names:r.map(c=>String(c).trim()),i})).filter(r=>r.names.includes('序號')&&r.names.includes('店點代碼'));
    if(headers.length!==1)throw new Error('無法辨識 SAR74 欄位');
    const names=headers[0].names,h=headers[0].i;
    // Keep the empty placeholders: the verified export metadata describes 29
    // columns with blanks at 15/18, while earlier synthetic exports use 30.
    const nonemptyNames=names.filter(Boolean);
    const legacy30=names.length===30 && nonemptyNames.length===30;
    const sar29=names.length===29 && names[15]==='' && names[18]==='' && nonemptyNames.length===27 &&
      names[17]==='銷貨單號' && names[23]==='員工編號' && names[26]==='取消交易日期';
    if((!legacy30&&!sar29) || new Set(nonemptyNames).size!==nonemptyNames.length || labels.some(n=>!names.includes(n)))throw new Error('無法辨識 SAR74 欄位');
    const columns=Object.fromEntries(labels.map(n=>[n,names.indexOf(n)]));
    if(names.includes('回收舊機品名'))columns['回收舊機品名']=names.indexOf('回收舊機品名');
    const header=rows.slice(0,h).flat().join(' '),ranges=Array.from(header.matchAll(/(\d{3}\/\d{2}\/\d{2})\s*-\s*(\d{3}\/\d{2}\/\d{2})/g));
    if(ranges.length!==1)throw new Error('SAR74 查詢期間缺漏或不唯一');
    const start=roc(ranges[0][1]),end=roc(ranges[0][2]),period=monthPeriod(start.slice(0,7));
    if(start!==period.start || end<start || end>period.end)throw new Error('SAR74 必須為選定月首日起的單月查詢期間');
    const printed=header.match(/(\d{2})年(\d{2})月(\d{2})日\s+(\d{2}):(\d{2})/);
    const statusAsOf=printed?date('20'+printed[1]+'-'+printed[2]+'-'+printed[3]):end;
    if(statusAsOf<end || printed&&(Number(printed[4])>23||Number(printed[5])>59))throw new Error('SAR74 列印／取消核對日期無效');
    const field=(r,label)=>unwrap(r[columns[label]]);
    function transactionDate(value) {
      if(!/^\d{7}$/.test(value))throw new Error('SAR74 日期必須為民國七碼');
      return roc(value);
    }
    const records=[],serials=new Set();
    rows.slice(h+1).forEach(r=>{
      if(r.every(c=>!String(c).trim()))return;
      if(r.length!==names.length)throw new Error('SAR74 欄位數衝突');
      const nonempty=r.map(c=>String(c).trim()).filter(Boolean);
      if(nonempty.length===2 && nonempty.includes('主管:') && nonempty.includes('製表:'))return;
      const serial=field(r,'序號');
      if(!/^[1-9]\d*$/.test(serial) || !Number.isSafeInteger(Number(serial)) || serials.has(serial))throw new Error('SAR74 序號無效或重複');
      serials.add(serial);
      const store=field(r,'店點代碼'),region=field(r,'區域別'),project=field(r,'專案類別'),seller=field(r,'員工編號');
      if(!/^DNB\d{5}$/.test(store) || region!=='北一二B')throw new Error('SAR74 店碼或區域格式衝突');
      if(!['單銷','RT','AQNP'].includes(project))throw new Error('SAR74 未知專案類別');
      if(!/^[A-Za-z0-9]{5}$/.test(seller))throw new Error('SAR74 來源員編必須保留五碼英數字');
      const recycle=field(r,'回收代碼/IMEI'),order=field(r,'銷貨單號');
      if(!recycle || !order || recycle.length>100 || order.length>100)throw new Error('SAR74 缺少有效回收碼／銷貨單號');
      const trade=transactionDate(field(r,'日期')),cancelValue=field(r,'取消交易日期');
      const cancel=cancelValue?transactionDate(cancelValue):null;
      if(trade<start || trade>end || cancel&&(cancel<trade || cancel>statusAsOf))throw new Error('SAR74 交易／取消日期與來源期間衝突');
      // Preserve identifiers as source strings. Store verification and employee
      // crosswalk are separate release prerequisites; no alias/prefix is inferred.
      const record={store_code:store,trade_date:trade,project:project,source_employee_id:seller,
        recycle_code:recycle,order_number:order,cancel_date:cancel};
      if(names.includes('回收舊機品名'))record.recycle_model=field(r,'回收舊機品名');
      records.push(record);
    });
    return {month:start.slice(0,7),source_start:start,source_end:end,status_as_of_date:statusAsOf,rule_id:RULE_ID,complete_nine_stores:false,header_column_count:names.length,
      printed_at:printed?printed[0]:'',records:records};
  }
  return Object.freeze({STORES:STORES,RULE_ID:RULE_ID,monthPeriod:monthPeriod,storeName:storeName,build:build,parseSar74:parseSar74,shortModel:shortModel});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TradeinPerformanceCore;

// Monthly performance has its own private registry; it never enters public price data.
function tradeinPerformanceAuthorize_(payload) {
  return privateDashboardTradeinReadBoundary_(payload, function() {

  const id=privateDashboardCleanEmployeeId((payload || {}).employeeId);
  const device=privateDashboardCleanDeviceId((payload || {}).deviceId);
  const lookup=privateDashboardUserByEmployeeId(id);
  const trusted=privateDashboardBTrusted_(id);
  if(!lookup.user || lookup.user.status!=='active' || !trusted && lookup.user.device_id!==device)
    throw new Error('此員編或裝置尚未核准，無法讀取個人舊換新');
  if(!trusted && !TradeinPerformanceCore.storeName(lookup.user.store))throw new Error('此員編不在九店範圍');
  return {id:id,user:lookup.user,supervisor:trusted && lookup.user.role==='督導'};

  });
}
function tradeinPerformanceRoster_() {
  return privateDashboardRows(privateDashboardSheet(PRIVATE_DASHBOARD_USERS_SHEET,PRIVATE_DASHBOARD_USERS_HEADERS),PRIVATE_DASHBOARD_USERS_HEADERS)
    .map(function(r){return {employee_id:r.employee_id,masked_name:r.masked_name,store:r.store,role:r.role,status:r.status};});
}
function tradeinPerformanceMonthRoster_(month) {
  // Access roster authorizes viewing; it is not an HR/monthly-target source.
  const period=TradeinPerformanceCore.monthPeriod(month);
  const file=tradeinPerformanceFile_('north12b-tradein-monthly-roster-'+month+'.json');
  if(!file)throw new Error('本月正式名冊／職務生效期間尚未核實，不能用登入名冊推算目標');
  const basis=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if(basis.schema_version!=='tradein-monthly-roster/v1' || basis.month!==month || basis.review_status!=='verified' ||
     basis.rule_id!==TradeinPerformanceCore.RULE_ID || !/^[a-f0-9]{64}$/.test(basis.source_sha256 || '') || (!Array.isArray(basis.people) || !basis.people.length || basis.people.length>5000))
    throw new Error('月名冊來源、月份或核定狀態不符');
  const seen={},roles=['店長','代理店長','副店長','資深業務代表','業代','銷售人員','同仁','業務代表(I)','業務代表(II)','業務代表(III)'];
  function validDate(v){return typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}
  return basis.people.map(function(p){
    if(typeof p.employee_id!=='string' || !/^[A-Z0-9]{7}$/.test(p.employee_id) || seen[p.employee_id] ||
       !TradeinPerformanceCore.storeName(p.store) || !roles.includes(p.role) || !['active','inactive'].includes(p.status) ||
       typeof p.masked_name!=='string' || !p.masked_name.trim() || !validDate(p.effective_from) ||
       p.effective_to!==null && (!validDate(p.effective_to) || p.effective_to<p.effective_from))
      throw new Error('月名冊身份、店點、職務或生效期間缺漏／衝突');
    seen[p.employee_id]=true;
    // Partial-month employment/role changes require an explicit reviewed policy.
    // No proration, role inference or automatic monthly target is introduced here.
    if(p.status==='active' && (p.effective_from>period.start || p.effective_to!==null && p.effective_to<period.end))
      throw new Error('月中到離職／職務異動尚待核定，本批停止目標計算');
    return {employee_id:p.employee_id,masked_name:p.masked_name,store:p.store,role:p.role,status:p.status,
      effective_from:p.effective_from,effective_to:p.effective_to,monthly_basis_sha256:basis.source_sha256};
  });
}
function tradeinPerformancePrivateReference_(source) {
  if(!source || !/^[a-f0-9]{64}$/.test(source.source_sha256 || ''))throw new Error('來源雜湊無效');
  const file=tradeinPerformanceFile_('north12b-tradein-reference-'+source.source_sha256+'.json');
  if(!file)throw new Error('本批私有員編／店碼對照尚未配置，停止預覽與同步');
  const value=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  // Monthly actuals reset independently. Until cancellation attribution has
  // been approved, this narrow policy only admits batches with no cancellations.
  if(value.counting_review_status!=='verified' || value.counting_rule_id!==TradeinPerformanceCore.RULE_ID ||
     value.counting_policy!=='monthly-reset-no-cancellations/v1')
    throw new Error('每月重新計數口徑尚未核定，停止實績計算');
  if(!Array.isArray(source.records) || source.records.some(function(r){return r.cancel_date!==null && r.cancel_date!==undefined && r.cancel_date!=='';}))
    throw new Error('本批含取消交易；取消／跨月沖回月份尚待核定，整批停止同步');
  return value;
}
function tradeinPerformanceFolder_() {
  const folder=privateDashboardFolder();
  if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE || folder.getSharingPermission()!==DriveApp.Permission.NONE)
    throw new Error('舊換新資料夾必須維持私有');
  return folder;
}
function tradeinPerformanceFile_(name) {
  const files=tradeinPerformanceFolder_().getFilesByName(name);let found=null;
  while(files.hasNext()){if(found)throw new Error('舊換新私有資料檔重複');found=files.next();}return found;
}
function tradeinPerformanceRegistry_() {
  const file=tradeinPerformanceFile_('north12b-tradein-performance-registry.json');
  if(!file)return {schema_version:'tradein-performance-registry/v1',months:{}};
  const registry=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if(!registry || registry.schema_version!=='tradein-performance-registry/v1' || !registry.months)throw new Error('舊換新 registry 格式無效');
  return registry;
}
// Business hashes use UTF-8 explicitly; legacy authentication hashing is untouched.
function tradeinPerformanceDigest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''), Utilities.Charset.UTF_8)
    .map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('');
}
function tradeinPerformanceHash_(value) {return tradeinPerformanceDigest_(JSON.stringify(value));}
function tradeinPerformanceSnapshot_(entry) {
  if(!entry)return null;
  const file=DriveApp.getFileById(entry.file_id),parents=file.getParents(),folderId=tradeinPerformanceFolder_().getId();
  let inFolder=false;while(parents.hasNext()){if(parents.next().getId()===folderId)inFolder=true;}
  if(!inFolder)throw new Error('舊換新快照不屬於指定私有資料夾');
  const value=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if(value.schema_version!=='tradein-performance/v1' || value.rule_id!==TradeinPerformanceCore.RULE_ID ||
      tradeinPerformanceHash_(value)!==entry.snapshot_hash)throw new Error('舊換新私有快照版本或雜湊核對失敗');
  return value;
}
function tradeinPerformanceProjection_(snapshot,auth) {
  if(!snapshot)return null;
  const people=snapshot.people.filter(function(p){return auth.supervisor || p.employee_key===auth.id;});
  return {
    schema_version:snapshot.schema_version,period_key:snapshot.period_key,rule_id:snapshot.rule_id,
    target_period:snapshot.target_period,source_period:snapshot.source_period,source_cutoff_date:snapshot.source_cutoff_date,
    cutoff_precision:snapshot.cutoff_precision,timezone:snapshot.timezone,published_at:snapshot.published_at,status_as_of_date:snapshot.status_as_of_date,
    people:people.map(function(p){return {store:p.store,masked_name:p.masked_name,role:p.role,original_role:p.original_role,
      actual_units:p.actual_units,target_units:p.target_units,remaining_units:p.remaining_units,attainment_status:p.attainment_status};}),
    stores:auth.supervisor?snapshot.stores:[],summary:auth.supervisor?snapshot.summary:null
  };
}
function tradeinPerformanceRead(payload) {
  return privateDashboardTradeinReadBoundary_(payload, function() {

  const auth=tradeinPerformanceAuthorize_(payload);
  TradeinPerformanceCore.monthPeriod(payload.month);
  const registry=tradeinPerformanceRegistry_(),entry=(registry.months[payload.month] || {}).active;
  if(entry && entry.roster_hash!==tradeinPerformanceHash_(tradeinPerformanceMonthRoster_(payload.month)))throw new Error('核定月名冊已變更，請管理者重新核對來源與月份；不以登入名冊回填');
  const snapshot=tradeinPerformanceSnapshot_(entry);
  return {snapshot:tradeinPerformanceProjection_(snapshot,auth),snapshotHash:entry?entry.snapshot_hash:null,
    access:{mode:auth.supervisor?'supervisor':'self',allowedStores:auth.supervisor?TradeinPerformanceCore.STORES.map(function(s){return s[1];}):[],
      maskedName:auth.user.masked_name,role:auth.user.role,store:TradeinPerformanceCore.storeName(auth.user.store)},
    availableMonths:Object.keys(registry.months).sort()};

  });
}
function tradeinPerformancePreview(payload) {
  reportUploadAuthorize_(payload);
  const roster=tradeinPerformanceMonthRoster_(payload.source.month),snapshot=tradeinPerformanceBuild_(payload.source,roster);
  const current=(tradeinPerformanceRegistry_().months[snapshot.period_key] || {}).active;
  return {snapshot:tradeinPerformanceProjection_(snapshot,{supervisor:true}),expectedActiveHash:current?current.snapshot_hash:null,
    rosterHash:tradeinPerformanceHash_(roster),previewHash:tradeinPerformanceHash_(snapshot),sourceHash:snapshot.source_sha256};
}
function tradeinPerformanceBuild_(source,roster) {
  const today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
  if(source.source_end>today || source.status_as_of_date>today)throw new Error('來源或取消核對日期不可晚於今天');
  return TradeinPerformanceCore.build(source,roster,tradeinPerformancePrivateReference_(source));
}
function tradeinPerformanceSaveRegistry_(registry) {
  const name='north12b-tradein-performance-registry.json',file=tradeinPerformanceFile_(name),body=JSON.stringify(registry);
  if(file)file.setContent(body);else tradeinPerformanceFolder_().createFile(name,body,MimeType.PLAIN_TEXT);
}
function tradeinPerformancePublish(payload) {
  const operator=reportUploadAuthorize_(payload),lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const roster=tradeinPerformanceMonthRoster_(payload.source.month);
    if(tradeinPerformanceHash_(roster)!==payload.rosterHash)throw new Error('名冊已變更，請重新預覽');
    const value=tradeinPerformanceBuild_(payload.source,roster),registry=tradeinPerformanceRegistry_();
    if(payload.previewHash!==tradeinPerformanceHash_(value))throw new Error('來源或計算結果與預覽不同，請重新預覽');
    const current=registry.months[value.period_key] || {active:null,previous:null};
    const activeHash=current.active?current.active.snapshot_hash:null;
    if(payload.expectedActiveHash!==activeHash)throw new Error('同期版本已變更，請重新預覽');
    if(current.active && current.active.source_sha256===value.source_sha256 && current.active.roster_hash===payload.rosterHash) {
      const saved=tradeinPerformanceSnapshot_(current.active);
      if(current.active.preview_hash!==payload.previewHash){
        // A legacy snapshot may lack only the newly added safe aggregates.
        // Compare every original calculation field before preserving the no-op.
        const legacy=JSON.parse(JSON.stringify(value));
        ['recovered_models','recovered_days'].forEach(function(key){
          if(saved.people.every(p=>!Object.prototype.hasOwnProperty.call(p,key)))legacy.people.forEach(p=>delete p[key]);
          else if(!saved.people.every(p=>Object.prototype.hasOwnProperty.call(p,key)))throw new Error('舊快照聚合欄位不完整');
        });
        if(current.active.preview_hash!==tradeinPerformanceHash_(legacy))throw new Error('相同來源雜湊的計算結果不同，請核對原檔後重新預覽');
      }
      return {status:'unchanged',snapshotHash:activeHash,snapshot:tradeinPerformanceProjection_(saved,{supervisor:true})};
    }
    if(current.active && value.source_cutoff_date<current.active.source_cutoff_date)throw new Error('來源比目前版本舊，請使用回復功能');
    value.published_at=privateDashboardNow();
    const hash=tradeinPerformanceHash_(value),file=tradeinPerformanceFolder_().createFile(
      'north12b-tradein-performance-'+value.period_key+'-'+hash.slice(0,16)+'.json',JSON.stringify(value),MimeType.PLAIN_TEXT);
    const entry={file_id:file.getId(),snapshot_hash:hash,source_sha256:value.source_sha256,
      source_cutoff_date:value.source_cutoff_date,roster_hash:payload.rosterHash,preview_hash:payload.previewHash,operator_hash:tradeinPerformanceDigest_(operator)};
    // Validate bytes before switching active. All historical files are retained.
    tradeinPerformanceSnapshot_(entry);
    registry.months[value.period_key]={active:entry,previous:current.active};
    tradeinPerformanceSaveRegistry_(registry);
    const readback=tradeinPerformanceRegistry_().months[value.period_key].active;
    if(readback.snapshot_hash!==hash)throw new Error('保存後版本回讀核對失敗');
    return {status:'published',snapshotHash:hash,snapshot:tradeinPerformanceProjection_(tradeinPerformanceSnapshot_(readback),{supervisor:true})};
  } finally {lock.releaseLock();}
}
function tradeinPerformanceRollback(payload) {
  reportUploadAuthorize_(payload);TradeinPerformanceCore.monthPeriod(payload.month);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const registry=tradeinPerformanceRegistry_(),current=registry.months[payload.month];
    if(!current || !current.active || current.active.snapshot_hash!==payload.expectedActiveHash)throw new Error('版本已變更，請重新讀取');
    if(!current.previous)throw new Error('本月沒有可回復的前一版');
    tradeinPerformanceSnapshot_(current.previous);
    const prior=current.active;current.active=current.previous;current.previous=prior;
    tradeinPerformanceSaveRegistry_(registry);
    const readback=tradeinPerformanceRegistry_().months[payload.month].active;
    if(readback.snapshot_hash!==current.active.snapshot_hash)throw new Error('回復後版本核對失敗');
    return {status:'rolled_back',snapshotHash:readback.snapshot_hash};
  } finally {lock.releaseLock();}
}

// Checkpoints are owner-held business-data backups, never auth-state backups.
// These operations do not enable the auth gate, initialize eligibility, or grant access.
function tradeinPerformanceCheckpointAuthorize_(payload) {
  const operator=reportUploadAuthorize_(payload);
  const owner=String(privateDashboardProperties().getProperty('TRADEIN_PERFORMANCE_OWNER_SCRIPT_ID') || '');
  if(!/^[A-Za-z0-9_-]{12,120}$/.test(owner) || owner!==String(ScriptApp.getScriptId()))
    throw new Error('檢查點只能在已明確配置的同一 owner 執行');
  TradeinPerformanceCore.monthPeriod(payload.month);
  if(!/^[a-f0-9]{64}$/.test(payload.sourceHash || ''))throw new Error('檢查點來源雜湊無效');
  return {operator:operator,owner:owner};
}
function tradeinPerformanceCheckpointConfig_(name) {
  const file=tradeinPerformanceFile_(name),body=file?file.getBlob().getDataAsString('UTF-8'):null;
  if(body!==null && body.length>1000000)throw new Error('檢查點配置超過容量');
  return {name:name,exists:!!file,body:body,sha256:body===null?null:tradeinPerformanceDigest_(body)};
}
function tradeinPerformanceCheckpointRegistryValue_(body) {
  if(typeof body!=='string' || body.length>1000000)throw new Error('檢查點 registry 容量／內容無效');
  const value=JSON.parse(body);
  if(!value || value.schema_version!=='tradein-performance-registry/v1' ||
      !value.months || typeof value.months!=='object' || Array.isArray(value.months))
    throw new Error('檢查點 registry 格式無效');
  Object.keys(value.months).forEach(function(month){TradeinPerformanceCore.monthPeriod(month);});
  return value;
}
function tradeinPerformanceCheckpointState_(payload) {
  const registryFile=tradeinPerformanceFile_('north12b-tradein-performance-registry.json');
  const registryBody=registryFile?registryFile.getBlob().getDataAsString('UTF-8'):
    JSON.stringify({schema_version:'tradein-performance-registry/v1',months:{}});
  const registry=tradeinPerformanceCheckpointRegistryValue_(registryBody);
  const slotPresent=Object.prototype.hasOwnProperty.call(registry.months,payload.month);
  const slot=slotPresent?registry.months[payload.month]:null;
  if(slotPresent && (!slot || typeof slot!=='object' || Array.isArray(slot)))throw new Error('本月指標格式無效');
  const publicFile=tradeinPerformanceFile_('north12b-tradein-public-registry.json');
  const publicBody=publicFile?publicFile.getBlob().getDataAsString('UTF-8'):JSON.stringify({schema_version:'tradein-public-registry/v1',months:{}});
  const publicRegistry=tradeinPerformancePublicRegistry_();
  return {registry:registry,registryBody:registryBody,registryExists:!!registryFile,
    publicRegistry:publicRegistry,publicRegistryBody:publicBody,publicRegistryExists:!!publicFile,publicRegistryHash:tradeinPerformanceDigest_(publicBody),
    registryHash:tradeinPerformanceDigest_(registryBody),slotPresent:slotPresent,slot:slot,
    activeHash:slot && slot.active?slot.active.snapshot_hash:null,
    monthly:tradeinPerformanceCheckpointConfig_('north12b-tradein-monthly-roster-'+payload.month+'.json'),
    reference:tradeinPerformanceCheckpointConfig_('north12b-tradein-reference-'+payload.sourceHash+'.json')};
}
function tradeinPerformanceCheckpointSummary_(state) {
  return {registryExists:state.registryExists,registryHash:state.registryHash,slotPresent:state.slotPresent,
    publicRegistryExists:state.publicRegistryExists,publicRegistryHash:state.publicRegistryHash,
    activeHash:state.activeHash,monthlyHash:state.monthly.sha256,referenceHash:state.reference.sha256};
}
function tradeinPerformanceCheckpointCompare_(state,payload) {
  const expected=['expectedRegistryHash','expectedPublicRegistryHash','expectedActiveHash','expectedMonthlyHash','expectedReferenceHash'];
  expected.forEach(function(key){
    if(!Object.prototype.hasOwnProperty.call(payload,key) ||
        !(payload[key]===null && !['expectedRegistryHash','expectedPublicRegistryHash'].includes(key)) && !/^[a-f0-9]{64}$/.test(payload[key] || ''))
      throw new Error('檢查點必須明確提供完整預期雜湊');
  });
  if(typeof payload.expectedRegistryExists!=='boolean' || payload.expectedRegistryExists!==state.registryExists ||
      typeof payload.expectedPublicRegistryExists!=='boolean' || payload.expectedPublicRegistryExists!==state.publicRegistryExists ||
      payload.expectedPublicRegistryHash!==state.publicRegistryHash ||
      payload.expectedRegistryHash!==state.registryHash || payload.expectedActiveHash!==state.activeHash ||
      payload.expectedMonthlyHash!==state.monthly.sha256 || payload.expectedReferenceHash!==state.reference.sha256)
    throw new Error('registry／本月指標或配置已變更，請重新讀取檢查點狀態');
}
function tradeinPerformanceCheckpointSlot_(slot,month,monthly) {
  if(slot===null)return;
  if(!slot || typeof slot!=='object' || Array.isArray(slot) ||
      !Object.prototype.hasOwnProperty.call(slot,'active') || !Object.prototype.hasOwnProperty.call(slot,'previous') ||
      slot.previous && !slot.active)throw new Error('檢查點本月指標格式無效');
  ['active','previous'].forEach(function(key){
    const entry=slot[key];if(entry===null)return;
    if(!entry || typeof entry.file_id!=='string' || !entry.file_id ||
        !['snapshot_hash','source_sha256','roster_hash','preview_hash'].every(function(k){return /^[a-f0-9]{64}$/.test(entry[k] || '');}))
      throw new Error('檢查點快照指標格式無效');
    const snapshot=tradeinPerformanceSnapshot_(entry);
    if(snapshot.period_key!==month)throw new Error('檢查點快照月份不符');
    if(key==='active'){
      if(!monthly.exists)throw new Error('檢查點缺少原月名冊');
      const basis=JSON.parse(monthly.body);
      if(basis.month!==month || basis.review_status!=='verified')throw new Error('檢查點原月名冊未核定');
      // The canonical validated roster hash was captured while this exact file was active.
      if(entry.roster_hash!==monthly.rosterHash)throw new Error('檢查點原名冊與快照不符');
    }
  });
}
function tradeinPerformanceCheckpointStatus(payload) {
  tradeinPerformanceCheckpointAuthorize_(payload);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{return tradeinPerformanceCheckpointSummary_(tradeinPerformanceCheckpointState_(payload));}
  finally{lock.releaseLock();}
}
function tradeinPerformanceCheckpointCapture(payload) {
  const auth=tradeinPerformanceCheckpointAuthorize_(payload);
  if(!['C0','C1'].includes(payload.stage))throw new Error('檢查點階段無效');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const state=tradeinPerformanceCheckpointState_(payload);tradeinPerformanceCheckpointCompare_(state,payload);
    if(state.monthly.exists)state.monthly.rosterHash=tradeinPerformanceHash_(tradeinPerformanceMonthRoster_(payload.month));
    tradeinPerformanceCheckpointSlot_(state.slot,payload.month,state.monthly);
    const publicEntry=state.publicRegistry.months[payload.month];
    if(publicEntry){
      if(!state.slot || !state.slot.active || publicEntry.private_snapshot_hash!==state.slot.active.snapshot_hash)throw new Error('公開／私人本月版本不一致，停止檢查點');
      tradeinPerformancePublicSnapshot_(publicEntry,payload.month);
    }
    let previewHash=null;
    if(payload.stage==='C1'){
      if(!payload.source || payload.source.month!==payload.month || payload.source.source_sha256!==payload.sourceHash)
        throw new Error('C1 必須核對本批來源');
      const snapshot=tradeinPerformanceBuild_(payload.source,tradeinPerformanceMonthRoster_(payload.month));
      previewHash=tradeinPerformanceHash_(snapshot);
      if(payload.previewHash!==previewHash || payload.rosterHash!==state.monthly.rosterHash)
        throw new Error('C1 來源／名冊與預覽不符');
    }
    const value={schema_version:'tradein-checkpoint/v1',stage:payload.stage,month:payload.month,
      source_sha256:payload.sourceHash,owner_script_id:auth.owner,folder_id:tradeinPerformanceFolder_().getId(),
      captured_at:privateDashboardNow(),operator_hash:tradeinPerformanceDigest_(auth.operator),
      registry_exists:state.registryExists,registry_body:state.registryBody,registry_sha256:state.registryHash,
      public_registry_exists:state.publicRegistryExists,public_registry_body:state.publicRegistryBody,public_registry_sha256:state.publicRegistryHash,
      slot_present:state.slotPresent,slot:state.slot,monthly:state.monthly,reference:state.reference,preview_hash:previewHash};
    const body=JSON.stringify(value),hash=tradeinPerformanceDigest_(body);
    const file=tradeinPerformanceFolder_().createFile('north12b-tradein-checkpoint-'+payload.month+'-'+payload.stage+'-'+hash.slice(0,16)+'.json',body,MimeType.PLAIN_TEXT);
    if(tradeinPerformanceDigest_(file.getBlob().getDataAsString('UTF-8'))!==hash)throw new Error('檢查點保存後內容核對失敗');
    return {status:'checkpoint_saved',checkpointId:file.getId(),checkpointHash:hash,stage:payload.stage,
      state:tradeinPerformanceCheckpointSummary_(state),previewHash:previewHash};
  } finally{lock.releaseLock();}
}
function tradeinPerformanceCheckpointRestore(payload) {
  const auth=tradeinPerformanceCheckpointAuthorize_(payload);
  if(payload.restoreMonth!==true || typeof payload.checkpointId!=='string' ||
      !/^[a-f0-9]{64}$/.test(payload.checkpointHash || ''))throw new Error('必須明確確認本月檢查點恢復');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const current=tradeinPerformanceCheckpointState_(payload);tradeinPerformanceCheckpointCompare_(current,payload);
    const file=DriveApp.getFileById(payload.checkpointId),parents=file.getParents(),folderId=tradeinPerformanceFolder_().getId();
    let inFolder=false;while(parents.hasNext()){if(parents.next().getId()===folderId)inFolder=true;}
    if(!inFolder)throw new Error('檢查點不在指定私有 owner 資料夾');
    const body=file.getBlob().getDataAsString('UTF-8');
    if(body.length>3000000 || tradeinPerformanceDigest_(body)!==payload.checkpointHash)throw new Error('檢查點完整性核對失敗');
    const saved=JSON.parse(body);
    if(saved.schema_version!=='tradein-checkpoint/v1' || !['C0','C1'].includes(saved.stage) || saved.month!==payload.month ||
        saved.source_sha256!==payload.sourceHash || saved.owner_script_id!==auth.owner || saved.folder_id!==folderId ||
        typeof saved.registry_exists!=='boolean' || typeof saved.slot_present!=='boolean' ||
        typeof saved.public_registry_exists!=='boolean' || tradeinPerformanceDigest_(saved.public_registry_body)!==saved.public_registry_sha256 ||
        tradeinPerformanceDigest_(saved.registry_body)!==saved.registry_sha256)
      throw new Error('檢查點 owner／月份／來源或 registry 核對失敗');
    const prior=tradeinPerformanceCheckpointRegistryValue_(saved.registry_body);
    if(Object.prototype.hasOwnProperty.call(prior.months,payload.month)!==saved.slot_present ||
        JSON.stringify(saved.slot_present?prior.months[payload.month]:null)!==JSON.stringify(saved.slot))
      throw new Error('檢查點本月指標與原 registry 不符');
    [['monthly',current.monthly.name],['reference',current.reference.name]].forEach(function(pair){
      const config=saved[pair[0]];
      if(!config || config.name!==pair[1] || typeof config.exists!=='boolean' ||
          config.exists && (typeof config.body!=='string' || config.body.length>1000000 || tradeinPerformanceDigest_(config.body)!==config.sha256) ||
          !config.exists && (config.body!==null || config.sha256!==null))throw new Error('檢查點配置完整性核對失敗');
    });
    tradeinPerformanceCheckpointSlot_(saved.slot,payload.month,saved.monthly);
    const priorPublic=JSON.parse(saved.public_registry_body);
    if(!priorPublic || priorPublic.schema_version!=='tradein-public-registry/v1' || !priorPublic.months || typeof priorPublic.months!=='object' || Array.isArray(priorPublic.months))throw new Error('公開檢查點 registry 格式無效');
    Object.keys(priorPublic.months).forEach(function(month){TradeinPerformanceCore.monthPeriod(month);});
    const priorPublicEntry=priorPublic.months[payload.month];
    if(priorPublicEntry){
      if(!saved.slot || !saved.slot.active || priorPublicEntry.private_snapshot_hash!==saved.slot.active.snapshot_hash)throw new Error('公開檢查點本月快照版本不符');
      tradeinPerformancePublicSnapshot_(priorPublicEntry,payload.month);
    }
    // Only the captured month and its two fixed configuration names are mutable.
    // New files from a first import are retained. No auth property or roster is written.
    const retained=[];
    ['monthly','reference'].forEach(function(key){
      const config=saved[key],existing=tradeinPerformanceFile_(config.name);
      if(!config.exists){if(existing)retained.push(key);return;}
      if(existing){if(tradeinPerformanceDigest_(existing.getBlob().getDataAsString('UTF-8'))!==config.sha256)existing.setContent(config.body);}
      else tradeinPerformanceFolder_().createFile(config.name,config.body,MimeType.PLAIN_TEXT);
      if(tradeinPerformanceCheckpointConfig_(config.name).sha256!==config.sha256)throw new Error('檢查點配置恢復後核對失敗');
    });
    if(saved.slot && saved.slot.active && tradeinPerformanceHash_(tradeinPerformanceMonthRoster_(payload.month))!==saved.slot.active.roster_hash)
      throw new Error('恢復名冊與原月快照不符；尚未切换 registry');
    const next=JSON.parse(JSON.stringify(current.registry));
    if(saved.slot_present)next.months[payload.month]=saved.slot;else delete next.months[payload.month];
    const nextBody=JSON.stringify(next);
    tradeinPerformanceSaveRegistry_(next);
    const nextPublic=JSON.parse(JSON.stringify(current.publicRegistry));
    if(priorPublicEntry)nextPublic.months[payload.month]=priorPublicEntry;else delete nextPublic.months[payload.month];
    const nextPublicBody=JSON.stringify(nextPublic),publicFile=tradeinPerformanceFile_('north12b-tradein-public-registry.json');
    if(publicFile)publicFile.setContent(nextPublicBody);
    else if(saved.public_registry_exists)tradeinPerformanceFolder_().createFile('north12b-tradein-public-registry.json',nextPublicBody,MimeType.PLAIN_TEXT);
    const restored=tradeinPerformanceCheckpointState_(payload);
    if(restored.registryHash!==tradeinPerformanceDigest_(nextBody) || restored.slotPresent!==saved.slot_present ||
        restored.publicRegistryHash!==tradeinPerformanceDigest_(nextPublicBody) ||
        JSON.stringify(restored.slot)!==JSON.stringify(saved.slot))throw new Error('檢查點恢復後完整 registry 核對失敗');
    return {status:'checkpoint_restored',stage:saved.stage,state:tradeinPerformanceCheckpointSummary_(restored),
      retainedNewConfigurationFiles:retained,historyRetained:true};
  } finally{lock.releaseLock();}
}

/* Server-only whitelist. Public IDs are random, never employee-derived. */
var TradeinPublicCore=(function(){
  'use strict';
  const STORES=['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','三創','六張犁'];
  const keys=(v,names)=>v && typeof v==='object' && !Array.isArray(v) && Object.keys(v).sort().join('|')===names.slice().sort().join('|');
  const number=(n,nullable=false)=>nullable&&n===null || Number.isSafeInteger(n)&&n>=0&&n<=10000000;
  const day=v=>typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  function validateModels(models,actual){
    if(models===null)return;
    if(!Array.isArray(models)||models.length>20000||actual===null)throw Error('公開回收機款格式無效');
    const seen=new Set();let total=0;
    models.forEach(m=>{if(!keys(m,['model','units'])||typeof m.model!=='string'||!m.model||m.model.length>80||
      !/^[A-Za-z0-9 .+()\/\-]+$/.test(m.model)||/\d{10,}/.test(m.model)||!number(m.units)||m.units===0||seen.has(m.model))throw Error('公開回收機款白名單格式無效');seen.add(m.model);total+=m.units;});
    if(total!==actual)throw Error('公開回收機款與實績不一致');
  }
  function mask(value){const chars=Array.from(String(value||'').trim());if(!chars.length||chars.length>40)throw Error('公開姓名來源格式無效');return chars.length<2?'＊':chars[0]+'＊'+chars[chars.length-1];}
  function validateDays(days,actual,period,models){
    if(days===null)return;
    if(!Array.isArray(days)||days.length>31||actual===null)throw Error('公開逐日回收格式無效');
    const seen=new Set(),totals=new Map();let total=0,complete=true;
    days.forEach(d=>{
      if(!keys(d,['date','actual_units','recovered_models'])||!day(d.date)||d.date<period.start||d.date>period.end||seen.has(d.date)||!number(d.actual_units)||d.actual_units===0)throw Error('公開逐日回收日期／台數無效');
      seen.add(d.date);total+=d.actual_units;validateModels(d.recovered_models,d.actual_units);
      if(d.recovered_models===null)complete=false;
      else d.recovered_models.forEach(m=>totals.set(m.model,(totals.get(m.model)||0)+m.units));
    });
    if(total!==actual)throw Error('逐日回收與整月實績不一致');
    if(Array.isArray(models)&&(!complete||models.length!==totals.size||models.some(m=>totals.get(m.model)!==m.units)))throw Error('逐日機款與整月機款不一致');
  }
  function copyDays(days){return days===null?null:days.map(d=>({date:d.date,actual_units:d.actual_units,recovered_models:d.recovered_models===null?null:d.recovered_models.map(m=>({model:m.model,units:m.units}))}));}
  function validate(value){
    if(!keys(value,['schema_version','region','month','source_period','source_cutoff_date','published_at','people','stores','summary']) ||
      value.schema_version!=='tradein-public/v1'||value.region!=='北一二B'||!/^20\d{2}-(0[1-9]|1[0-2])$/.test(value.month)||
      !keys(value.source_period,['start','end'])||!day(value.source_period.start)||!day(value.source_period.end)||
      value.source_period.start.slice(0,7)!==value.month||value.source_period.end.slice(0,7)!==value.month||
      value.source_period.start>value.source_period.end||value.source_cutoff_date!==value.source_period.end||
      typeof value.published_at!=='string'||isNaN(Date.parse(value.published_at))||!Array.isArray(value.people)||value.people.length>5000||
      !Array.isArray(value.stores)||value.stores.length!==9)throw Error('公開績效白名單格式無效');
    const seen=new Set();
    value.people.forEach(function(p){
      const fields=['public_id','store','masked_name','actual_units','target_units','remaining_units','attainment_status'];
      if(Object.prototype.hasOwnProperty.call(p,'recovered_models'))fields.push('recovered_models');
      if(Object.prototype.hasOwnProperty.call(p,'recovered_days'))fields.push('recovered_days');
      if(!keys(p,fields)||
        !/^tp_[a-f0-9]{32}$/.test(p.public_id)||seen.has(p.public_id)||!STORES.includes(p.store)||
        !(p.masked_name==='＊'||Array.from(p.masked_name||'').length===3&&Array.from(p.masked_name)[1]==='＊')||
        /[<>\r\n\t]/.test(p.masked_name)||!number(p.actual_units,true)||![null,3].includes(p.target_units)||
        !number(p.remaining_units,true)||p.remaining_units!==(p.target_units===null||p.actual_units===null?null:Math.max(3-p.actual_units,0))||
        p.attainment_status!==(p.target_units===null?'exempt':p.actual_units===null?'pending':p.actual_units>=3?'met':'in_progress'))
        throw Error('公開人員白名單格式無效');seen.add(p.public_id);
      if(Object.prototype.hasOwnProperty.call(p,'recovered_models'))validateModels(p.recovered_models,p.actual_units);
      if(Object.prototype.hasOwnProperty.call(p,'recovered_days'))validateDays(p.recovered_days,p.actual_units,value.source_period,p.recovered_models);
    });
    value.stores.forEach(function(s,i){
      if(!keys(s,['store','actual_units','target_units','remaining_units','target_people','met_people'])||s.store!==STORES[i]||
        !['actual_units','target_units','remaining_units','target_people','met_people'].every(k=>number(s[k])))throw Error('公開店點白名單格式無效');
      const people=value.people.filter(p=>p.store===s.store),targets=people.filter(p=>p.target_units===3);
      if(s.target_units!==targets.length*3||s.target_people!==targets.length||s.met_people!==targets.filter(p=>p.attainment_status==='met').length||
        s.remaining_units!==targets.reduce((n,p)=>n+(p.remaining_units||0),0)||s.actual_units<people.reduce((n,p)=>n+(p.actual_units||0),0))throw Error('公開店點數字不一致');
    });
    const s=value.summary;
    if(!keys(s,['actual_units','target_units','remaining_units','target_people','met_people','store_count'])||s.store_count!==9||
       !['actual_units','target_units','remaining_units','target_people','met_people'].every(k=>number(s[k])&&s[k]===value.stores.reduce((n,p)=>n+p[k],0)))throw Error('公開區數字不一致');
    return value;
  }
  function project(snapshot,randomId){
    if(!snapshot||snapshot.schema_version!=='tradein-performance/v1'||!Array.isArray(snapshot.people)||!Array.isArray(snapshot.stores))throw Error('公開來源尚未核實');
    const value={schema_version:'tradein-public/v1',region:'北一二B',month:snapshot.period_key,
      source_period:{start:snapshot.source_period.start,end:snapshot.source_period.end},source_cutoff_date:snapshot.source_cutoff_date,
      published_at:snapshot.published_at,people:snapshot.people.map(function(p){
        const publicId='tp_'+String(randomId()).replace(/-/g,'').toLowerCase();
        return {public_id:publicId,store:p.store,masked_name:mask(p.masked_name),actual_units:p.actual_units,target_units:p.target_units,
          remaining_units:p.remaining_units,attainment_status:p.target_units===null?'exempt':p.actual_units===null?'pending':p.actual_units>=3?'met':'in_progress',
          recovered_models:p.recovered_models===undefined?(p.actual_units===0?[]:null):p.recovered_models===null?null:p.recovered_models.map(m=>({model:m.model,units:m.units})),
          ...(Object.prototype.hasOwnProperty.call(p,'recovered_days')?{recovered_days:copyDays(p.recovered_days)}:{})};
      }),stores:STORES.map(function(store){
        const s=snapshot.stores.find(s=>s.store===store);if(!s)throw Error('公開來源店點缺漏');
        return {store:store,actual_units:s.total_units,target_units:s.staff_target_units,remaining_units:s.staff_gap_units,
          target_people:s.target_staff_count,met_people:s.met_staff_count};
      }),summary:{}};
    ['actual_units','target_units','remaining_units','target_people','met_people'].forEach(k=>{value.summary[k]=value.stores.reduce((n,s)=>n+s[k],0);});
    value.summary.store_count=9;return validate(value);
  }
  function withModels(value,source,basis){
    validate(value);
    if(!basis||basis.schema_version!=='tradein-recovered-models/v1'||basis.review_status!=='verified'||basis.source_sha256!==source.source_sha256||
      basis.month!==value.month||basis.source_start!==value.source_period.start||basis.source_end!==value.source_period.end||
      !Array.isArray(basis.people)||basis.people.length>5000||source.people.length!==value.people.length)throw Error('回收機款來源尚未核對');
    const byId=new Map();basis.people.forEach(p=>{if(!keys(p,['employee_key','store','actual_units','recovered_models'])||
      typeof p.employee_key!=='string'||!STORES.includes(p.store)||!number(p.actual_units)||byId.has(p.employee_key))throw Error('回收機款私有對照衝突');
      validateModels(p.recovered_models,p.actual_units);if(p.recovered_models===null)throw Error('回收機款資料不完整');byId.set(p.employee_key,p);});
    const people=value.people.map((p,i)=>{const privatePerson=source.people[i],detail=byId.get(privatePerson.employee_key);
      if(p.store!==privatePerson.store||p.masked_name!==mask(privatePerson.masked_name)||p.actual_units!==privatePerson.actual_units||p.target_units!==privatePerson.target_units)throw Error('回收機款人員來源不符');
      if(detail&&(detail.store!==p.store||detail.actual_units!==p.actual_units))throw Error('回收機款台數／店點不符');
      if(p.actual_units>0&&!detail)throw Error('回收機款人員缺漏');
      if(detail)byId.delete(privatePerson.employee_key);
      return {...p,recovered_models:detail?detail.recovered_models.map(m=>({model:m.model,units:m.units})):p.actual_units===0?[]:null};});
    if(byId.size)throw Error('回收機款含未知人員');
    return validate({...value,people:people});
  }
  function withDays(value,source,basis,rosterHash){
    validate(value);
    if(!basis||basis.schema_version!=='tradein-recovered-days/v1'||basis.review_status!=='verified'||basis.source_sha256!==source.source_sha256||
      basis.month!==value.month||basis.source_start!==value.source_period.start||basis.source_end!==value.source_period.end||
      basis.roster_hash!==rosterHash||!Array.isArray(basis.people)||basis.people.length!==value.people.length||source.people.length!==value.people.length)throw Error('逐日回收來源尚未核對');
    const byId=new Map();basis.people.forEach(p=>{
      if(!keys(p,['employee_key','store','actual_units','recovered_days'])||typeof p.employee_key!=='string'||!STORES.includes(p.store)||!number(p.actual_units,true)||byId.has(p.employee_key))throw Error('逐日回收私有對照衝突');
      validateDays(p.recovered_days,p.actual_units,value.source_period);byId.set(p.employee_key,p);
    });
    const people=value.people.map((p,i)=>{
      const original=source.people[i],detail=byId.get(original.employee_key);
      if(!detail||p.store!==original.store||p.masked_name!==mask(original.masked_name)||p.actual_units!==original.actual_units||p.target_units!==original.target_units||detail.store!==p.store||detail.actual_units!==p.actual_units)throw Error('逐日回收人員／實績來源不符');
      byId.delete(original.employee_key);return {...p,recovered_days:copyDays(detail.recovered_days)};
    });
    if(byId.size)throw Error('逐日回收含未知人員');
    return validate({...value,people:people});
  }
  return Object.freeze({project:project,validate:validate,mask:mask,withModels:withModels,withDays:withDays});
})();
if(typeof module!=='undefined'&&module.exports)module.exports=TradeinPublicCore;

// Independent anonymous read. Never calls or exposes the private reader.
function tradeinPerformancePublicRegistry_(){
  const file=tradeinPerformanceFile_('north12b-tradein-public-registry.json');
  const value=file?JSON.parse(file.getBlob().getDataAsString('UTF-8')):{schema_version:'tradein-public-registry/v1',months:{}};
  if(!value||value.schema_version!=='tradein-public-registry/v1'||!value.months||typeof value.months!=='object'||Array.isArray(value.months))throw Error('公開績效版本索引無效');
  Object.keys(value.months).forEach(function(month){TradeinPerformanceCore.monthPeriod(month);});
  return value;
}
function tradeinPerformancePublicSnapshot_(entry,month){
  if(!entry||!entry.file_id||!/^[a-f0-9]{64}$/.test(entry.snapshot_hash||''))throw Error('公開績效快照指標無效');
  const file=DriveApp.getFileById(entry.file_id),parents=file.getParents(),folder=tradeinPerformanceFolder_().getId();
  let present=false;while(parents.hasNext())if(parents.next().getId()===folder)present=true;
  if(!present)throw Error('公開投影來源位置不符');
  const value=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if(tradeinPerformanceHash_(value)!==entry.snapshot_hash||value.month!==month)throw Error('公開投影內容雜湊不符');
  return TradeinPublicCore.validate(value);
}
function tradeinPerformancePublicRead(payload){
  TradeinPerformanceCore.monthPeriod(payload.month);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const registry=tradeinPerformancePublicRegistry_(),entry=registry.months[payload.month];
    if(!entry)return {snapshot:null,availableMonths:Object.keys(registry.months).sort()};
    const current=(tradeinPerformanceRegistry_().months[payload.month]||{}).active;
    if(!current||current.snapshot_hash!==entry.private_snapshot_hash)throw Error('本月公開進度待重新核對');
    if(tradeinPerformanceHash_(tradeinPerformanceMonthRoster_(payload.month))!==current.roster_hash)throw Error('本月公開基線待重新核對');
    let value=tradeinPerformancePublicSnapshot_(entry,payload.month);
    const modelsFile=value.people.some(p=>p.actual_units>0&&!Array.isArray(p.recovered_models))?
      tradeinPerformanceFile_('north12b-tradein-models-'+current.source_sha256+'.json'):null;
    if(modelsFile)value=TradeinPublicCore.withModels(value,tradeinPerformanceSnapshot_(current),JSON.parse(modelsFile.getBlob().getDataAsString('UTF-8')));
    const daysFile=payload.includeDays===true&&value.people.some(p=>!Object.prototype.hasOwnProperty.call(p,'recovered_days'))?
      tradeinPerformanceFile_('north12b-tradein-days-'+current.source_sha256+'.json'):null;
    if(daysFile)value=TradeinPublicCore.withDays(value,tradeinPerformanceSnapshot_(current),JSON.parse(daysFile.getBlob().getDataAsString('UTF-8')),current.roster_hash);
    // Old cached clients validate the original allowlist. Daily aggregates are opt-in.
    if(payload.includeDays!==true)value=TradeinPublicCore.validate({...value,people:value.people.map(function(p){const safe={...p};delete safe.recovered_days;return safe;})});
    // Reconstruct the response from a strict validated allowlist, never spread registry/entry/private JSON.
    return {snapshot:value,availableMonths:Object.keys(registry.months).sort()};
  }catch(error){throw Error('公開目標進度尚未完成核對，請稍後重新讀取');}
  finally{lock.releaseLock();}
}
function tradeinPerformancePublicPublish(payload){
  tradeinPerformanceCheckpointAuthorize_(payload);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const current=(tradeinPerformanceRegistry_().months[payload.month]||{}).active;
    if(!current||current.snapshot_hash!==payload.expectedActiveHash)throw Error('私人月版本已變更，停止公開投影');
    if(current.source_sha256!==payload.sourceHash)throw Error('公開投影來源雜湊不符');
    const registry=tradeinPerformancePublicRegistry_(),previous=registry.months[payload.month];
    if(previous&&previous.private_snapshot_hash===current.snapshot_hash){
      tradeinPerformancePublicSnapshot_(previous,payload.month);return {status:'unchanged'};
    }
    const source=tradeinPerformanceSnapshot_(current);
    if(tradeinPerformanceHash_(tradeinPerformanceMonthRoster_(payload.month))!==current.roster_hash)throw Error('核定月名冊已變更，停止公開投影');
    const value=TradeinPublicCore.project(source,function(){return Utilities.getUuid();}),hash=tradeinPerformanceHash_(value);
    const file=tradeinPerformanceFolder_().createFile('north12b-tradein-public-'+payload.month+'-'+hash.slice(0,16)+'.json',JSON.stringify(value),MimeType.PLAIN_TEXT);
    const entry={file_id:file.getId(),snapshot_hash:hash,private_snapshot_hash:current.snapshot_hash};
    tradeinPerformancePublicSnapshot_(entry,payload.month);registry.months[payload.month]=entry;
    const name='north12b-tradein-public-registry.json',registryFile=tradeinPerformanceFile_(name),body=JSON.stringify(registry);
    if(registryFile)registryFile.setContent(body);else tradeinPerformanceFolder_().createFile(name,body,MimeType.PLAIN_TEXT);
    if(JSON.stringify(tradeinPerformancePublicRegistry_())!==body)throw Error('公開投影版本保存後核對失敗');
    return {status:'published'};
  }finally{lock.releaseLock();}
}

// END TRADEIN PERFORMANCE MODULE

// Auth ownership candidate. No transport, credentials, scopes, Properties
// writes or trigger installation are supplied by this module. Missing approved
// owner transport/provider fails closed; it never falls back to a peer roster.
const PRIVATE_DASHBOARD_AUTH_OPERATIONS_ = [
  'privateDashboardRequestBinding','privateDashboardRequestStatus',
  'privateDashboardAccess','kpiCalcAccess','privateDashboardAdminRequests',
  'privateDashboardAdminApprove','privateDashboardAdminRevoke',
  'privateDashboardAdminRestoreEligibility','privateDashboardAdminSetTrustedEmployee',
  'privateDashboardSyncRoster','phoneStockAuthorizeRead_','phoneStockAuthorizePublish_',
  'threecAuthorizeRead_','privateDashboardThreecRead_'
];
let privateDashboardAuthFrames_ = [];

function privateDashboardAuthBoundaryEnabled_() {
  // Source-only boundary fixtures have no GAS release switch. Concrete GAS
  // candidates preserve native A while off; only host-held synthetic Script
  // identities may exercise adapters without enabling a real deployment.
  return typeof PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ === 'undefined' ||
    PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ === true ||
    (typeof ScriptApp !== 'undefined' && /^SYNTHETIC_[A-Z_]+$/.test(String(ScriptApp.getScriptId())));
}

function privateDashboardAuthOwnerConfig_() {
  const owner = String(privateDashboardProperties().getProperty('DASHBOARD_AUTH_OWNER_SCRIPT_ID') || '');
  const current = String(ScriptApp.getScriptId() || '');
  if (!/^[A-Za-z0-9_-]{12,120}$/.test(owner) || !/^[A-Za-z0-9_-]{12,120}$/.test(current)) {
    throw new Error('AUTH_OWNER_CONFIGURATION_REQUIRED');
  }
  return { owner:owner, current:current };
}

function privateDashboardRequireAuthOwner_() {
  if (!privateDashboardAuthBoundaryEnabled_()) return;
  const config = privateDashboardAuthOwnerConfig_();
  if (config.current !== config.owner) throw new Error('AUTH_OWNER_ONLY');
}

function privateDashboardAuthProvider_() {
  privateDashboardRequireAuthOwner_();
  if (typeof privateDashboardAuthNativeProvider_ !== 'function') throw new Error('AUTH_NATIVE_PROVIDER_REQUIRED');
  const provider = privateDashboardAuthNativeProvider_();
  if (!provider || typeof provider.assertNativeEntry !== 'function' ||
      typeof provider.begin !== 'function' || typeof provider.complete !== 'function') {
    throw new Error('AUTH_NATIVE_PROVIDER_REQUIRED');
  }
  return provider;
}

function privateDashboardAuthRun_(operation, args, run) {
  if (!privateDashboardAuthBoundaryEnabled_()) return run();
  const config = privateDashboardAuthOwnerConfig_();
  const input = Array.prototype.slice.call(args);
  if (config.current !== config.owner) {
    if (PRIVATE_DASHBOARD_AUTH_OPERATIONS_.indexOf(operation) < 0 ||
        typeof privateDashboardAuthOwnerTransport_ !== 'function') throw new Error('AUTH_OWNER_UNAVAILABLE');
    // The endpoint/provider is host-held. No request field selects an owner.
    if (operation === 'threecAuthorizeRead_' && typeof privateDashboardGasThreecPayload_ === 'function') {
      if (input.length !== 1) throw new Error('AUTH_REQUEST_INVALID');
      const payload = privateDashboardGasThreecPayload_(input[0]);
      delete payload.kind; // The legacy helper never reads business data, even when its caller has kind.
      const reply = privateDashboardAuthOwnerTransport_(config.owner,'privateDashboardThreecRead_',[payload]);
      if (!reply || reply.employeeId !== payload.employeeId) throw new Error('AUTH_OWNER_DENIED');
      return reply.employeeId;
    }
    return privateDashboardAuthOwnerTransport_(config.owner, operation, input);
  }
  return privateDashboardRosterTransaction_(function() {
    const provider = privateDashboardAuthProvider_();
    const frame = { operation:operation, args:input, receipt:null };
    privateDashboardAuthFrames_.push(frame);
    try {
      provider.assertNativeEntry(operation, input);
      const result = run();
      SpreadsheetApp.flush();
      if (frame.receipt) provider.complete(frame.receipt);
      return result;
    } finally {
      // Failed native mutations retain their pending fence/deny. Only a
      // successful, validated owner operation may complete that transition.
      privateDashboardAuthFrames_.pop();
    }
  });
}

function privateDashboardAuthNativeBegin_(operation, args) {
  if (!privateDashboardAuthBoundaryEnabled_()) return;
  privateDashboardRequireAuthOwner_();
  const frame = privateDashboardAuthFrames_[privateDashboardAuthFrames_.length - 1];
  if (!frame || frame.operation !== operation || frame.receipt) throw new Error('AUTH_OWNER_OPERATION_REQUIRED');
  frame.receipt = privateDashboardAuthProvider_().begin(operation, Array.prototype.slice.call(args));
}

function privateDashboardAuthResumeNative_(operation, employeeId) {
  if (!privateDashboardAuthBoundaryEnabled_()) return false;
  privateDashboardRequireAuthOwner_();
  const frame = privateDashboardAuthFrames_[privateDashboardAuthFrames_.length - 1];
  if (!frame || frame.operation !== operation) throw new Error('AUTH_OWNER_OPERATION_REQUIRED');
  const provider = privateDashboardAuthProvider_();
  return typeof provider.canResume === 'function' && provider.canResume(operation, employeeId) === true;
}

function privateDashboardAuthSheetKind_(sheet, headers) {
  const name = sheet && typeof sheet.getName === 'function' ? String(sheet.getName()) : '';
  const key = Array.isArray(headers) ? headers.join('|') : '';
  if (name === PRIVATE_DASHBOARD_USERS_SHEET) return 'users';
  if (name === PRIVATE_DASHBOARD_REQUESTS_SHEET) return 'requests';
  if (key === PRIVATE_DASHBOARD_USERS_HEADERS.join('|') || key === PRIVATE_DASHBOARD_REQUEST_HEADERS.join('|')) {
    throw new Error('AUTH_SHEET_IDENTITY_REQUIRED');
  }
  return '';
}

function privateDashboardAuthGuardSheet_(sheet, headers) {
  const kind = privateDashboardAuthSheetKind_(sheet, headers);
  if (!privateDashboardAuthBoundaryEnabled_()) return kind;
  if (!kind) return '';
  privateDashboardRequireAuthOwner_();
  const expected = kind === 'users' ? PRIVATE_DASHBOARD_USERS_HEADERS : PRIVATE_DASHBOARD_REQUEST_HEADERS;
  if (!Array.isArray(headers) || headers.join('|') !== expected.join('|')) throw new Error('AUTH_SHEET_SCHEMA_REQUIRED');
  return kind;
}

function privateDashboardAuthGuardSheetName_(name, headers) {
  if (name !== PRIVATE_DASHBOARD_USERS_SHEET && name !== PRIVATE_DASHBOARD_REQUESTS_SHEET) return;
  privateDashboardAuthGuardSheet_({getName:function() { return name; }}, headers);
}

function privateDashboardAuthGuardRoster_(roster) {
  if (!privateDashboardAuthBoundaryEnabled_()) return roster;
  // Existing callers require these two methods only. Never expose a raw
  // Spreadsheet/getSheets/getSheetById capability to a nonowner runtime.
  const guard = function(name) {
    if (name === PRIVATE_DASHBOARD_USERS_SHEET || name === PRIVATE_DASHBOARD_REQUESTS_SHEET) {
      privateDashboardRequireAuthOwner_();
    }
  };
  return {
    getSheetByName:function(name) { guard(name); return roster.getSheetByName(name); },
    insertSheet:function(name) { guard(name); return roster.insertSheet(name); }
  };
}

// Candidate only. Every production entry remains disabled. Synthetic mode
// additionally requires a synthetic ScriptApp identity, never a payload flag.
const PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ = false;
const PRIVATE_DASHBOARD_GAS_AUTH_STATE_KEY_ = 'DASHBOARD_AUTH_NATIVE_V1';
const PRIVATE_DASHBOARD_GAS_AUTH_NONCE_PREFIX_ = 'DASHBOARD_AUTH_RPC_V1_';

function privateDashboardGasAuthGate_(options) {
  const synthetic = options && options.mode === 'LOCAL_SYNTHETIC_ONLY' &&
    /^SYNTHETIC_[A-Z_]+$/.test(String(ScriptApp.getScriptId()));
  if (!synthetic && PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ !== true) throw new Error('AUTH_RELEASE_DISABLED');
  return synthetic;
}

function privateDashboardGasAuthDigest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value))
    .map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}

function privateDashboardGasAuthJson_(value, maxBytes) {
  const text = JSON.stringify(value);
  if (typeof text !== 'string' || encodeURIComponent(text).replace(/%[A-F0-9]{2}/g, 'x').length > maxBytes) {
    throw new Error('AUTH_CAPACITY');
  }
  return text;
}

function privateDashboardCreateGasAuthStore_(options) {
  privateDashboardGasAuthGate_(options);
  privateDashboardRequireAuthOwner_();
  const config = privateDashboardAuthOwnerConfig_();
  const props = options.properties || privateDashboardProperties();
  const now = options.now || function() { return Date.now(); };
  function writeChecked(key, value) {
    const text = privateDashboardGasAuthJson_(value, 8000);
    props.setProperty(key, text);
    if (props.getProperty(key) !== text) throw new Error('AUTH_PERSISTENCE_FAILED');
  }
  function readState() {
    const text = props.getProperty(PRIVATE_DASHBOARD_GAS_AUTH_STATE_KEY_);
    if (!text || text.length > 8000) throw new Error('AUTH_STATE_REQUIRED');
    let state;
    try { state = JSON.parse(text); } catch (_) { throw new Error('AUTH_STATE_INVALID'); }
    if (!state || Object.keys(state).sort().join('|') !== 'owner|revision|subjects|v' || state.v !== 1 ||
        state.owner !== config.owner || !Number.isSafeInteger(state.revision) || state.revision < 0 ||
        !state.subjects || Array.isArray(state.subjects) || typeof state.subjects !== 'object' ||
        Object.keys(state.subjects).length > 64) throw new Error('AUTH_STATE_INVALID');
    Object.keys(state.subjects).forEach(function(id) {
      const row = state.subjects[id];
      if (!/^[A-Z0-9]{5,12}$/.test(id) || !row || Object.keys(row).sort().join('|') !== 'denied|generation|pending' ||
          !Number.isSafeInteger(row.generation) || row.generation < 0 || typeof row.denied !== 'boolean' ||
          row.pending !== null && (!row.pending || Object.keys(row.pending).sort().join('|') !== 'intent|operation|version' ||
            !Number.isInteger(row.pending.operation) || row.pending.operation < 0 || row.pending.operation > 3 ||
            row.pending.version !== row.generation || !/^[a-f0-9]{32}$/.test(row.pending.intent))) {
        throw new Error('AUTH_STATE_INVALID');
      }
    });
    return state;
  }
  function transaction(run) {
    return privateDashboardRosterTransaction_(function() {
      const state = readState(), result = run(state);
      if (result && typeof result.then === 'function') throw new Error('AUTH_ASYNC_TRANSACTION_FORBIDDEN');
      state.revision++;
      if (!Number.isSafeInteger(state.revision)) throw new Error('AUTH_CAPACITY');
      writeChecked(PRIVATE_DASHBOARD_GAS_AUTH_STATE_KEY_, state);
      return result;
    });
  }
  function read(run) { return privateDashboardRosterTransaction_(function() { return run(readState()); }); }
  function consumeRequest(requestId, issuedAt) {
    // Sixteen bounded buckets; no getProperties(), credential reads, persisted
    // request bodies, responses, actor names, devices or credential digests.
    return privateDashboardRosterTransaction_(function() {
      const current = now();
      if (!/^[A-Za-z0-9_-]{20,80}$/.test(requestId) || !Number.isSafeInteger(issuedAt) ||
          issuedAt > current + 30000 || issuedAt < current - 120000) throw new Error('AUTH_REQUEST_EXPIRED');
      const digest = privateDashboardGasAuthDigest_(requestId), key = PRIVATE_DASHBOARD_GAS_AUTH_NONCE_PREFIX_ + digest[0];
      const text = props.getProperty(key);
      if (!text || text.length > 8000) throw new Error('AUTH_REPLAY_STATE_REQUIRED');
      let bucket;
      try { bucket = JSON.parse(text); } catch (_) { throw new Error('AUTH_REPLAY_STATE_INVALID'); }
      if (!bucket || Object.keys(bucket).sort().join('|') !== 'entries|owner|v' || bucket.v !== 1 ||
          bucket.owner !== config.owner || !Array.isArray(bucket.entries) || bucket.entries.length > 64 ||
          bucket.entries.some(function(e) { return !Array.isArray(e) || e.length !== 2 ||
            !/^[a-f0-9]{64}$/.test(e[0]) || e[0][0] !== digest[0] || !Number.isSafeInteger(e[1]); }) ||
          new Set(bucket.entries.map(function(e) { return e[0]; })).size !== bucket.entries.length) throw new Error('AUTH_REPLAY_STATE_INVALID');
      bucket.entries = bucket.entries.filter(function(e) { return e[1] >= current; });
      if (bucket.entries.some(function(e) { return e[0] === digest; })) throw new Error('AUTH_REPLAY_DENIED');
      if (bucket.entries.length >= 64) throw new Error('AUTH_CAPACITY');
      // Retain beyond the maximum accepted request timestamp lifetime, including
      // clock skew. The nonce is consumed before the native operation can write.
      bucket.entries.push([digest, issuedAt + 150000]);
      writeChecked(key, bucket);
    });
  }
  readState();
  return Object.freeze({transaction:transaction,read:read,consumeRequest:consumeRequest});
}

// GAS-native native-authority provider. No Node APIs, new KDF, credentials,
// logging, resource creation, implicit initialization or cross-project stores.
function privateDashboardCreateGasAuthProvider_(options) {
  privateDashboardGasAuthGate_(options);
  privateDashboardRequireAuthOwner_();
  const store = options.store;
  if (!store || typeof store.transaction !== 'function' || typeof store.read !== 'function') throw new Error('AUTH_STATE_REQUIRED');
  const mutations = ['privateDashboardAdminRevoke','privateDashboardAdminRestoreEligibility','privateDashboardSyncRoster','privateDashboardAdminSetTrustedEmployee'];
  const receipts = new WeakSet(), snapshots = new WeakSet();
  const canonical = function(id) { return privateDashboardCleanEmployeeId(id); };
  const nativeUsers = function() {
    return privateDashboardRows(privateDashboardSheet(PRIVATE_DASHBOARD_USERS_SHEET, PRIVATE_DASHBOARD_USERS_HEADERS), PRIVATE_DASHBOARD_USERS_HEADERS);
  };
  function subject(state, id) {
    if (!Object.prototype.hasOwnProperty.call(state.subjects, id)) {
      if (Object.keys(state.subjects).length >= 64) throw new Error('AUTH_CAPACITY');
      state.subjects[id] = {generation:0,denied:false,pending:null};
    }
    return state.subjects[id];
  }
  function assertEmployee(id) {
    return store.read(function(state) {
      const row = state.subjects[id];
      if (row && (row.denied || row.pending)) throw new Error('NATIVE_ELIGIBILITY_DENIED');
      return true;
    });
  }
  function intent(operation, id, payload) {
    const target = operation === 2 ? (payload.members || []).filter(function(m) { return canonical(m.employeeId) === id; })[0] : null;
    const meaning = operation === 2 ? [id,String(target.store || ''),String(target.role || ''),target.status === 'inactive' ? 'inactive' : 'active'] :
      operation === 3 ? [canonical(payload.employeeId)] : [id];
    return privateDashboardGasAuthDigest_(JSON.stringify(meaning)).slice(0,32);
  }
  function begin(operation, args) {
    const code = mutations.indexOf(operation), payload = args[0] || {};
    if (code < 0) throw new Error('NATIVE_OPERATION_INVALID');
    return store.transaction(function(state) {
      let ids;
      if (code === 2) {
        const previous = Object.create(null);
        nativeUsers().forEach(function(row) { previous[row.employee_id] = row; });
        ids = (payload.members || []).filter(function(m) {
          const id = canonical(m.employeeId), row = previous[id], current = state.subjects[id];
          return (!row || row.status !== 'revoked') && (current && current.pending && current.pending.operation === code ||
            !row || row.status !== (m.status === 'inactive' ? 'inactive' : 'active') || row.store !== String(m.store || '') || row.role !== String(m.role || ''));
        }).map(function(m) { return canonical(m.employeeId); });
      } else if (code === 3) {
        const target = canonical(payload.employeeId), fingerprint = intent(code, target, payload);
        ids = [privateDashboardProperties().getProperty('DASHBOARD_TRUSTED_EMPLOYEE_ID'), target].filter(Boolean).map(canonical);
        // The prior trusted property may already have changed before a failure.
        Object.keys(state.subjects).forEach(function(id) {
          const pending = state.subjects[id].pending;
          if (pending && pending.operation === code && pending.intent === fingerprint) ids.push(id);
        });
      } else ids = [canonical(payload.employeeId)];
      ids = Array.from(new Set(ids));
      if (!ids.length) return null;
      ids.forEach(function(id) {
        const row = subject(state, id), fingerprint = intent(code, id, payload);
        if (code > 1 && row.pending && (row.pending.operation !== code || row.pending.intent !== fingerprint)) throw new Error('NATIVE_TRANSITION_CONFLICT');
      });
      const versions = ids.map(function(id) {
        const row = subject(state, id); row.generation++;
        if (!Number.isSafeInteger(row.generation)) throw new Error('AUTH_CAPACITY');
        if (code < 2) row.denied = true;
        row.pending = {operation:code,version:row.generation,intent:intent(code,id,payload)};
        return row.generation;
      });
      const receipt = Object.freeze({operation:code,ids:ids,versions:versions});
      receipts.add(receipt); return receipt;
    });
  }
  function complete(receipt) {
    if (!receipts.has(receipt)) throw new Error('NATIVE_RECEIPT_REQUIRED');
    store.transaction(function(state) {
      receipt.ids.forEach(function(id,index) {
        const row = state.subjects[id];
        if (!row || !row.pending || row.pending.operation !== receipt.operation ||
            row.pending.version !== receipt.versions[index] || row.generation !== receipt.versions[index]) throw new Error('NATIVE_TRANSITION_REQUIRED');
      });
      receipt.ids.forEach(function(id) {
        const row = state.subjects[id]; row.generation++;
        if (!Number.isSafeInteger(row.generation)) throw new Error('AUTH_CAPACITY');
        if (receipt.operation === 1) row.denied = false;
        row.pending = null;
      });
    });
    receipts.delete(receipt);
  }
  function assertNativeEntry(operation, args) {
    const payload = args[0] || {}, reads = ['privateDashboardAccess','kpiCalcAccess','privateDashboardRequestBinding','privateDashboardRequestStatus',
      'privateDashboardRecordLogin_','phoneStockTrustedUser_','phoneStockAuthorizeRead_','phoneStockAuthorizePublish_','threecAuthorizeRead_','privateDashboardThreecRead_','departmentGoldAuthorizedUser_'];
    let id = reads.indexOf(operation) >= 0 ? operation === 'privateDashboardRecordLogin_' ? payload : payload.employeeId : null;
    if (operation === 'kpiCalcSetupSelf') id = privateDashboardProperties().getProperty('DASHBOARD_TRUSTED_EMPLOYEE_ID');
    if (operation === 'privateDashboardAdminApprove') {
      privateDashboardAdminAuthorized(payload);
      const requests = privateDashboardRows(privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS),PRIVATE_DASHBOARD_REQUEST_HEADERS);
      const request = requests.filter(function(r) { return r.request_id === payload.requestId; })[0];
      id = request && request.employee_id;
    }
    if (id) assertEmployee(canonical(id));
  }
  function capture(employee) {
    const id = canonical(employee);
    return privateDashboardRosterTransaction_(function() {
      assertEmployee(id);
      const user = privateDashboardUserByEmployeeId(id).user;
      if (user && user.status !== 'active') throw new Error('NATIVE_ELIGIBILITY_DENIED');
      const snapshot = store.read(function(state) { return Object.freeze({employee:id,generation:(state.subjects[id] || {}).generation || 0}); });
      snapshots.add(snapshot); return snapshot;
    });
  }
  function commit(snapshot, run) {
    if (!snapshots.has(snapshot) || typeof run !== 'function') throw new Error('AUTH_SNAPSHOT_REQUIRED');
    return privateDashboardRosterTransaction_(function() {
      assertEmployee(snapshot.employee);
      const user = privateDashboardUserByEmployeeId(snapshot.employee).user;
      if (user && user.status !== 'active') throw new Error('NATIVE_ELIGIBILITY_DENIED');
      return store.read(function(state) {
        if (((state.subjects[snapshot.employee] || {}).generation || 0) !== snapshot.generation) throw new Error('AUTH_GENERATION_CHANGED');
        const result = run();
        if (result && typeof result.then === 'function') throw new Error('AUTH_ASYNC_TRANSACTION_FORBIDDEN');
        return result;
      });
    });
  }
  return Object.freeze({assertNativeEntry:assertNativeEntry,begin:begin,complete:complete,
    canResume:function(operation,id) { return operation === mutations[1] && store.read(function(state) {
      const row = state.subjects[canonical(id)];return Boolean(row && row.denied && row.pending && row.pending.operation === 1);
    }); },
    capture:capture,commit:commit,withEligibility:function(id,run) { return commit(capture(id),run); },
    // Host-only source for the existing verifier/session core. It cannot be
    // selected, overridden or supplied as a generation by an RPC caller.
    currentGeneration:function(employee) { const id=canonical(employee);return store.read(function(state) { return (state.subjects[id] || {}).generation || 0; }); },
    eligibilityStatus:function(employee) { const id=canonical(employee);return privateDashboardRosterTransaction_(function() {
      return store.read(function(state) {
        const row=state.subjects[id],user=privateDashboardUserByEmployeeId(id).user;
        return row && (row.denied || row.pending) || user && user.status !== 'active' ? 'blocked' : 'allowed';
      });
    }); }
  });
}

// Owner-local adapter derived from the native store/provider wiring.
// No RPC, peer transport, B/password endpoint, implicit state initialization,
// settings values, resource creation, triggers or authority extension.



function privateDashboardTradeinReadBoundary_(payload, read) {
  if (!privateDashboardAuthBoundaryEnabled_()) return read();
  privateDashboardRequireAuthOwner_();
  const id = privateDashboardCleanEmployeeId((payload || {}).employeeId);
  return privateDashboardAuthProvider_().withEligibility(id, read);
}

// Offline B integration: owner-local provider retained; production gates remain off.
// Complete-operation RPC only. Authorize on the owner using original caller
// proof, consume a durable nonce, then run the whole operation under its lock.
// This module supplies no endpoint/credentials, logger or automatic retry.
const PRIVATE_DASHBOARD_GAS_RPC_SPECS_ = {
  privateDashboardRequestBinding:{action:'private_request',fields:['employeeId','deviceId','bootstrapCode'],result:['requestStatus','requestId','message']},
  privateDashboardRequestStatus:{action:'private_request_status',fields:['employeeId','deviceId'],result:['requestStatus','requestedAt','approvedAt']},
  privateDashboardAccess:{action:'private_access',fields:['employeeId','deviceId'],result:['snapshot','profile']},
  kpiCalcAccess:{action:'kpicalc_access',fields:['employeeId','deviceId'],result:['data','profile']},
  privateDashboardThreecRead_:{action:'threec_snapshot_read',fields:['employeeId','deviceId','kind'],result:['employeeId','snapshot','registry']},
  privateDashboardAdminRequests:{action:'private_admin_requests',fields:['adminSecret'],result:['requests']},
  privateDashboardAdminApprove:{action:'private_admin_approve',fields:['adminSecret','requestId'],result:['approved','employeeId']},
  privateDashboardAdminRevoke:{action:'private_admin_revoke',fields:['adminSecret','employeeId'],result:['revoked','employeeId']},
  privateDashboardAdminRestoreEligibility:{action:'private_admin_restore_eligibility',fields:['adminSecret','employeeId','restoreEligibility','currentRosterConfirmed'],result:['restored','employeeId','deviceApprovalRequired']},
  privateDashboardAdminSetTrustedEmployee:{action:'private_admin_set_trusted_employee',fields:['adminSecret','employeeId','notificationEmail'],result:['trustedEmployeeId']},
  privateDashboardSyncRoster:{action:'private_sync_roster',fields:['adminSecret','members'],result:['synced']}
};

function privateDashboardGasRpcResponseLimit_(operation) {
  // Existing 3C schemas allow up to 25 MiB snapshots; reserve a bounded 64 KiB
  // envelope/registry budget. Other operations retain their prior 1 MiB limit.
  return operation === 'privateDashboardThreecRead_' ? 25*1024*1024+65536 : 1024*1024;
}

function privateDashboardGasAuthParse_(text, responseOperation) {
  if (typeof text !== 'string') throw new Error('AUTH_REQUEST_INVALID');
  const parsed = JSON.parse(text);
  let index = 0, nodes = 0;
  function space() { while (/\s/.test(text[index] || '') && index < text.length) index++; }
  function string() {
    const start = index++;
    while (index < text.length) {
      const ch = text[index++];
      if (ch === '\\') index++;
      else if (ch === '"') return JSON.parse(text.slice(start,index));
    }
    throw new Error('AUTH_REQUEST_INVALID');
  }
  function value(depth) {
    const maxNodes = responseOperation === 'privateDashboardThreecRead_' ? 3000000 : responseOperation === 'privateDashboardBRead_' ? 5000000 : 20000;
    space(); if (depth > 20 || ++nodes > maxNodes) throw new Error('AUTH_CAPACITY');
    const ch = text[index];
    if (ch === '"') { string(); return; }
    if (ch === '{') {
      index++; space(); const keys = new Set();
      if (text[index] === '}') { index++; return; }
      for (;;) {
        space(); const key = string();
        if (keys.has(key) || ['__proto__','constructor','prototype'].indexOf(key) >= 0) throw new Error('AUTH_REQUEST_INVALID');
        keys.add(key); space(); if (text[index++] !== ':') throw new Error('AUTH_REQUEST_INVALID');
        value(depth+1); space(); const end = text[index++];
        if (end === '}') return; if (end !== ',') throw new Error('AUTH_REQUEST_INVALID');
      }
    }
    if (ch === '[') {
      index++; space(); if (text[index] === ']') { index++; return; }
      for (;;) { value(depth+1); space(); const end = text[index++]; if (end === ']') return; if (end !== ',') throw new Error('AUTH_REQUEST_INVALID'); }
    }
    while (index < text.length && !/[\s,}\]]/.test(text[index])) index++;
  }
  value(0); space(); if (index !== text.length) throw new Error('AUTH_REQUEST_INVALID');
  return parsed;
}

function privateDashboardGasRpcPayload_(operation, input, originalRoute) {
  if (!Object.prototype.hasOwnProperty.call(PRIVATE_DASHBOARD_GAS_RPC_SPECS_, operation)) throw new Error('AUTH_OPERATION_DENIED');
  if (!input || Array.isArray(input) || typeof input !== 'object') throw new Error('AUTH_REQUEST_INVALID');
  const spec = PRIVATE_DASHBOARD_GAS_RPC_SPECS_[operation], payload = {};
  Object.keys(input).forEach(function(key) {
    if (originalRoute && key === 'action' && input.action === spec.action) return;
    if (spec.fields.indexOf(key) < 0) throw new Error('AUTH_REQUEST_INVALID');
    payload[key] = input[key];
  });
  spec.fields.forEach(function(key) {
    if (operation === 'privateDashboardThreecRead_' && key === 'kind') {
      if (payload.kind !== undefined && payload.kind !== 'shopping' && payload.kind !== 'tradein') throw new Error('AUTH_REQUEST_INVALID');
    } else if (key === 'notificationEmail') {
      if (payload[key] !== undefined && (typeof payload[key] !== 'string' || payload[key].length > 254)) throw new Error('AUTH_REQUEST_INVALID');
    } else if (key === 'members') {
      if (!Array.isArray(payload.members) || payload.members.length > 64) throw new Error('AUTH_REQUEST_INVALID');
      const ids = new Set();
      payload.members = payload.members.map(function(member) {
        if (!member || Array.isArray(member) || typeof member !== 'object' ||
            Object.keys(member).some(function(k) { return ['employeeId','maskedName','store','role','status'].indexOf(k) < 0; })) throw new Error('AUTH_REQUEST_INVALID');
        const result = {};
        Object.keys(member).forEach(function(k) {
          if (typeof member[k] !== 'string' || member[k].length > 100) throw new Error('AUTH_REQUEST_INVALID');
          result[k] = member[k];
        });
        result.employeeId = privateDashboardCleanEmployeeId(member.employeeId);
        if (ids.has(result.employeeId) || result.status !== undefined && ['active','inactive'].indexOf(result.status) < 0) throw new Error('AUTH_REQUEST_INVALID');
        ids.add(result.employeeId); return result;
      });
    } else if (key === 'restoreEligibility' || key === 'currentRosterConfirmed') {
      if (payload[key] !== true) throw new Error('AUTH_REQUEST_INVALID');
    } else {
      if (typeof payload[key] !== 'string' || !payload[key] || payload[key].length > 256) throw new Error('AUTH_REQUEST_INVALID');
      if (key === 'employeeId') payload[key] = privateDashboardCleanEmployeeId(payload[key]);
      if (key === 'deviceId') payload[key] = privateDashboardCleanDeviceId(payload[key]);
    }
  });
  privateDashboardGasAuthJson_(payload,64000); return payload;
}

function privateDashboardGasRpcResult_(operation, result, payload, hostResponseProfile) {
  if(hostResponseProfile!==undefined && hostResponseProfile!=='privateDashboardBRead_')throw new Error('AUTH_RESULT_INVALID');
  const spec = PRIVATE_DASHBOARD_GAS_RPC_SPECS_[operation];
  if (!result || Array.isArray(result) || typeof result !== 'object' ||
      Object.keys(result).some(function(k) { return spec.result.indexOf(k) < 0; })) throw new Error('AUTH_RESULT_INVALID');
  if (operation === 'privateDashboardThreecRead_') {
    const keys = Object.keys(result).sort().join('|');
    if (result.employeeId !== payload.employeeId || keys !== (payload.kind === undefined ? 'employeeId' : 'employeeId|registry|snapshot') ||
        payload.kind !== undefined && (!result.registry || Array.isArray(result.registry) || typeof result.registry !== 'object' ||
          result.snapshot !== null && (!result.snapshot || Array.isArray(result.snapshot) || typeof result.snapshot !== 'object' || result.snapshot.kind !== payload.kind))) throw new Error('AUTH_RESULT_INVALID');
  }
  const secrets = ['adminSecret','bootstrapCode','deviceId'].map(function(k) { return payload[k]; }).filter(Boolean);
  function inspect(value, depth) {
    if (depth > 20) throw new Error('AUTH_CAPACITY');
    if (typeof value === 'string' && secrets.some(function(secret) { return value.indexOf(secret) >= 0; })) throw new Error('AUTH_RESULT_INVALID');
    if (value && typeof value === 'object') Object.keys(value).forEach(function(k) {
      if (['adminSecret','bootstrapCode','password','token','apiKey','deviceCredential','__proto__','constructor','prototype'].indexOf(k) >= 0) throw new Error('AUTH_RESULT_INVALID');
      inspect(value[k],depth+1);
    });
  }
  inspect(result,0);
  return privateDashboardGasAuthParse_(privateDashboardGasAuthJson_(result,hostResponseProfile==='privateDashboardBRead_'?8*1024*1024+65536:privateDashboardGasRpcResponseLimit_(operation)),hostResponseProfile || operation);
}

function privateDashboardCreateGasAuthRpcOwner_(options) {
  privateDashboardGasAuthGate_(options); privateDashboardRequireAuthOwner_();
  const config = privateDashboardAuthOwnerConfig_(), store = options.store, provider = options.provider;
  if (!store || !provider || !options.invoke || typeof options.invoke !== 'function') throw new Error('AUTH_OWNER_UNAVAILABLE');
  function authorize(operation,payload) {
    const spec = PRIVATE_DASHBOARD_GAS_RPC_SPECS_[operation];
    if (spec.fields.indexOf('adminSecret') >= 0) privateDashboardAdminAuthorized(payload);
    else {
      const id = privateDashboardCleanEmployeeId(payload.employeeId), device = privateDashboardCleanDeviceId(payload.deviceId);
      if (operation === 'privateDashboardRequestBinding' && privateDashboardHash(payload.bootstrapCode) !==
          privateDashboardHash(privateDashboardRequiredProperty('DASHBOARD_BOOTSTRAP_CODE'))) throw new Error('AUTH_CALLER_DENIED');
      const user = privateDashboardUserByEmployeeId(id).user;
      if (!user || user.status !== 'active') throw new Error('AUTH_CALLER_DENIED');
      if (operation !== 'privateDashboardRequestBinding' && operation !== 'privateDashboardRequestStatus' &&
          !privateDashboardIsTrustedEmployee(id) && user.device_id !== device) throw new Error('AUTH_CALLER_DENIED');
    }
    provider.assertNativeEntry(operation,[payload]);
  }
  function handle(text) {
    try {
      if (typeof reportUploadIsUploadDeployment_ === 'function' && reportUploadIsUploadDeployment_()) throw new Error('AUTH_OPERATION_DENIED');
      if (typeof text !== 'string' || text.length > 64000) throw new Error('AUTH_REQUEST_INVALID');
      const request = privateDashboardGasAuthParse_(text);
      if (!request || Array.isArray(request) || Object.keys(request).sort().join('|') !== 'action|issuedAt|operation|owner|payload|protocol|requestId' ||
          request.action !== 'auth_owner_rpc' || request.protocol !== 'auth-owner/v1' || request.owner !== config.owner) throw new Error('AUTH_REQUEST_INVALID');
      const payload = privateDashboardGasRpcPayload_(request.operation,request.payload,false);
      return privateDashboardRosterTransaction_(function() {
        authorize(request.operation,payload);
        store.consumeRequest(request.requestId,request.issuedAt);
        const result = options.invoke(request.operation,payload);
        SpreadsheetApp.flush();
        return {protocol:'auth-owner/v1',requestId:request.requestId,owner:config.owner,operation:request.operation,status:'ok',
          result:privateDashboardGasRpcResult_(request.operation,result,payload)};
      });
    } catch (_) { return {status:'error',code:'AUTH_OWNER_DENIED'}; }
  }
  return Object.freeze({handle:handle});
}

function privateDashboardCreateGasAuthPeerTransport_(options) {
  const synthetic = privateDashboardGasAuthGate_(options), config = privateDashboardAuthOwnerConfig_();
  const endpoint = String(options.endpoint || '');
  if (!(synthetic && endpoint === 'https://synthetic-owner.invalid/exec') &&
      !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{20,200}\/exec$/.test(endpoint)) throw new Error('AUTH_ENDPOINT_REQUIRED');
  if (options.owner !== config.owner) throw new Error('AUTH_OWNER_UNAVAILABLE');
  const fetcher = options.fetch || function(url,parameters) { return UrlFetchApp.fetch(url,parameters); };
  const now = options.now || function() { return Date.now(); };
  const uuid = options.requestId || function() { return Utilities.getUuid(); };
  function fetchResult(request) {
    let response = fetcher(endpoint,{method:'post',contentType:'text/plain',payload:JSON.stringify(request),
      muteHttpExceptions:true,followRedirects:false,validateHttpsCertificates:true});
    const code = response.getResponseCode();
    if (code === 302 || code === 303) {
      const headers = response.getAllHeaders(), location = headers.Location || headers.location;
      if (typeof location !== 'string' || !/^https:\/\/script\.googleusercontent\.com\/macros\/echo\?[A-Za-z0-9_%=&.-]+$/.test(location)) throw new Error('AUTH_REDIRECT_DENIED');
      const keys = location.slice(location.indexOf('?')+1).split('&').map(function(pair) { return pair.split('=')[0]; });
      if (keys.length !== 2 || new Set(keys).size !== 2 || keys.some(function(key) { return ['user_content_key','lib'].indexOf(key) < 0; })) throw new Error('AUTH_REDIRECT_DENIED');
      // A single pinned response GET carries no caller body/credentials. Never
      // repeat the native mutation POST, including network/timeout failures.
      response = fetcher(location,{method:'get',muteHttpExceptions:true,followRedirects:false,validateHttpsCertificates:true});
    }
    if (response.getResponseCode() !== 200) throw new Error('AUTH_TRANSPORT_FAILED');
    const text = response.getContentText();
    if (typeof text !== 'string' || text.length > privateDashboardGasRpcResponseLimit_(request.operation)) throw new Error('AUTH_RESULT_INVALID');
    const reply = privateDashboardGasAuthParse_(text,request.operation);
    if (!reply || Object.keys(reply).sort().join('|') !== 'operation|owner|protocol|requestId|result|status' || reply.status !== 'ok' ||
        reply.protocol !== request.protocol || reply.owner !== config.owner || reply.operation !== request.operation || reply.requestId !== request.requestId) throw new Error('AUTH_OWNER_DENIED');
    return privateDashboardGasRpcResult_(request.operation,reply.result,request.payload);
  }
  return function(destination,operation,args) {
    try {
      if (destination !== config.owner || !Array.isArray(args) || args.length !== 1) throw new Error('AUTH_OWNER_UNAVAILABLE');
      const payload = privateDashboardGasRpcPayload_(operation,args[0],true);
      return fetchResult({action:'auth_owner_rpc',protocol:'auth-owner/v1',owner:config.owner,operation:operation,payload:payload,requestId:uuid(),issuedAt:now()});
    } catch (_) { throw new Error('AUTH_OWNER_DENIED'); }
  };
}

// One typed, owner-executed 3C operation. No generic method, roster projection,
// credential provisioning, bearer grant or business-data write is exposed.
function privateDashboardGasThreecPayload_(input) {
  if (!input || Array.isArray(input) || typeof input !== 'object' ||
      Object.keys(input).some(function(k) { return ['employeeId','deviceId','kind','action'].indexOf(k) < 0; })) throw new Error('AUTH_REQUEST_INVALID');
  if (input.action !== undefined && input.action !== 'threec_snapshot_read') throw new Error('AUTH_REQUEST_INVALID');
  const result = {employeeId:privateDashboardCleanEmployeeId(input.employeeId),deviceId:privateDashboardCleanDeviceId(input.deviceId)};
  if (Object.prototype.hasOwnProperty.call(input,'kind')) {
    if (input.kind !== 'shopping' && input.kind !== 'tradein') throw new Error('AUTH_REQUEST_INVALID');
    result.kind = input.kind;
  }
  return result;
}

function privateDashboardThreecRead_(payload) {
  privateDashboardGasAuthGate_({mode:'LOCAL_SYNTHETIC_ONLY'});
  return privateDashboardAuthRun_('privateDashboardThreecRead_', [payload], function() {
    const body = privateDashboardGasRpcPayload_('privateDashboardThreecRead_',payload,false);
    // Original A device/trusted rules plus the durable native deny/pending gate
    // execute inside the owner's transaction before any private file lookup.
    const employeeId = threecAuthorizeRead_(body);
    if (body.kind === undefined) return {employeeId:employeeId}; // Legacy helper compatibility only.
    const kind = threecKind_(body.kind), registry = threecRegistry_();
    const active = registry.kinds[kind].active;
    if (!active) return {employeeId:employeeId,snapshot:null,registry:threecRegistrySummary_(registry)};
    const snapshot = threecReadJsonFile_(active.snapshot_file_id);
    threecNormalizeIncomingSnapshot_(snapshot);
    if (snapshot.kind !== kind || threecSnapshotHash_(snapshot) !== snapshot.snapshot_hash ||
        active.snapshot_hash !== snapshot.snapshot_hash) throw new Error('THREEC_SNAPSHOT_INVALID');
    return {employeeId:employeeId,snapshot:snapshot,registry:threecRegistrySummary_(registry)};
  });
}

function privateDashboardGasThreecSnapshotEntry_(input) {
  const payload = privateDashboardGasThreecPayload_(input);
  if (payload.kind === undefined) throw new Error('AUTH_REQUEST_INVALID');
  const result = privateDashboardThreecRead_(payload);
  return {snapshot:result.snapshot,registry:result.registry};
}

// Concrete candidate wiring, still disabled by GasAuthStore.gs. No placeholder
// endpoint, secret provisioning, initialization, trigger or deployment code.
let privateDashboardGasAuthAdapterInstance_ = null;

function privateDashboardGasAuthInvoke_(operation, payload) {
  const functions = {
    privateDashboardRequestBinding:privateDashboardRequestBinding,
    privateDashboardRequestStatus:privateDashboardRequestStatus,
    privateDashboardAccess:privateDashboardAccess,
    kpiCalcAccess:kpiCalcAccess,
    privateDashboardThreecRead_:privateDashboardThreecRead_,
    privateDashboardAdminRequests:privateDashboardAdminRequests,
    privateDashboardAdminApprove:privateDashboardAdminApprove,
    privateDashboardAdminRevoke:privateDashboardAdminRevoke,
    privateDashboardAdminRestoreEligibility:privateDashboardAdminRestoreEligibility,
    privateDashboardAdminSetTrustedEmployee:privateDashboardAdminSetTrustedEmployee,
    privateDashboardSyncRoster:privateDashboardSyncRoster
  };
  if (!Object.prototype.hasOwnProperty.call(functions,operation)) throw new Error('AUTH_OPERATION_DENIED');
  return functions[operation](payload);
}

function privateDashboardCreateGasAuthAdapters_(options) {
  privateDashboardGasAuthGate_(options);
  const config = privateDashboardAuthOwnerConfig_();
  if (config.current === config.owner) {
    const store = privateDashboardCreateGasAuthStore_(options);
    const provider = privateDashboardCreateGasAuthProvider_({mode:options.mode,store:store});
    const rpc = privateDashboardCreateGasAuthRpcOwner_({mode:options.mode,store:store,provider:provider,invoke:privateDashboardGasAuthInvoke_});
    return Object.freeze({store:store,provider:provider,rpc:rpc});
  }
  const send = privateDashboardCreateGasAuthPeerTransport_({mode:options.mode,owner:config.owner,
    endpoint:options.endpoint,fetch:options.fetch,now:options.now,requestId:options.requestId});
  return Object.freeze({send:send});
}

function privateDashboardGasAuthAdapters_() {
  privateDashboardGasAuthGate_({});
  if (!privateDashboardGasAuthAdapterInstance_) {
    privateDashboardGasAuthAdapterInstance_ = privateDashboardCreateGasAuthAdapters_({
      endpoint:privateDashboardProperties().getProperty('DASHBOARD_AUTH_OWNER_EXEC_URL')
    });
  }
  return privateDashboardGasAuthAdapterInstance_;
}

function privateDashboardAuthNativeProvider_() {
  return privateDashboardGasAuthAdapters_().provider;
}

function privateDashboardAuthOwnerTransport_(owner, operation, args) {
  const send = privateDashboardGasAuthAdapters_().send;
  if (typeof send !== 'function') throw new Error('AUTH_OWNER_UNAVAILABLE');
  return send(owner,operation,args);
}

function privateDashboardGasAuthRpcPost_(event) {
  try {
    if (!event || !event.postData || !/^text\/plain(?:;\s*charset=utf-8)?$/i.test(String(event.postData.type || ''))) throw new Error('AUTH_REQUEST_INVALID');
    const result = privateDashboardGasAuthAdapters_().rpc.handle(event.postData.contents);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (_) {
    return ContentService.createTextOutput('{"status":"error","code":"AUTH_OWNER_DENIED"}').setMimeType(ContentService.MimeType.JSON);
  }
}

function privateDashboardGasAuthMaybeRpcPost_(event) {
  if (!event || !event.postData || typeof event.postData.contents !== 'string') return null;
  try {
    const body = JSON.parse(event.postData.contents);
    if (body && body.action === 'auth_owner_rpc') return privateDashboardGasAuthRpcPost_(event);
  } catch (_) { /* Other original routes retain their existing parser. */ }
  return null;
}

// Retained fast-sha256 1.3.0 factory body; no Node loader or network.
const PRIVATE_DASHBOARD_B_PBKDF2_ = (function() {
var exports = {};

"use strict";
exports.__esModule = true;
// SHA-256 (+ HMAC and PBKDF2) for JavaScript.
//
// Written in 2014-2016 by Dmitry Chestnykh.
// Public domain, no warranty.
//
// Functions (accept and return Uint8Arrays):
//
//   sha256(message) -> hash
//   sha256.hmac(key, message) -> mac
//   sha256.pbkdf2(password, salt, rounds, dkLen) -> dk
//
//  Classes:
//
//   new sha256.Hash()
//   new sha256.HMAC(key)
//
exports.digestLength = 32;
exports.blockSize = 64;
// SHA-256 constants
var K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b,
    0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
    0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7,
    0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
    0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152,
    0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
    0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
    0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819,
    0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
    0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f,
    0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
    0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);
function hashBlocks(w, v, p, pos, len) {
    var a, b, c, d, e, f, g, h, u, i, j, t1, t2;
    while (len >= 64) {
        a = v[0];
        b = v[1];
        c = v[2];
        d = v[3];
        e = v[4];
        f = v[5];
        g = v[6];
        h = v[7];
        for (i = 0; i < 16; i++) {
            j = pos + i * 4;
            w[i] = (((p[j] & 0xff) << 24) | ((p[j + 1] & 0xff) << 16) |
                ((p[j + 2] & 0xff) << 8) | (p[j + 3] & 0xff));
        }
        for (i = 16; i < 64; i++) {
            u = w[i - 2];
            t1 = (u >>> 17 | u << (32 - 17)) ^ (u >>> 19 | u << (32 - 19)) ^ (u >>> 10);
            u = w[i - 15];
            t2 = (u >>> 7 | u << (32 - 7)) ^ (u >>> 18 | u << (32 - 18)) ^ (u >>> 3);
            w[i] = (t1 + w[i - 7] | 0) + (t2 + w[i - 16] | 0);
        }
        for (i = 0; i < 64; i++) {
            t1 = (((((e >>> 6 | e << (32 - 6)) ^ (e >>> 11 | e << (32 - 11)) ^
                (e >>> 25 | e << (32 - 25))) + ((e & f) ^ (~e & g))) | 0) +
                ((h + ((K[i] + w[i]) | 0)) | 0)) | 0;
            t2 = (((a >>> 2 | a << (32 - 2)) ^ (a >>> 13 | a << (32 - 13)) ^
                (a >>> 22 | a << (32 - 22))) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
            h = g;
            g = f;
            f = e;
            e = (d + t1) | 0;
            d = c;
            c = b;
            b = a;
            a = (t1 + t2) | 0;
        }
        v[0] += a;
        v[1] += b;
        v[2] += c;
        v[3] += d;
        v[4] += e;
        v[5] += f;
        v[6] += g;
        v[7] += h;
        pos += 64;
        len -= 64;
    }
    return pos;
}
// Hash implements SHA256 hash algorithm.
var Hash = /** @class */ (function () {
    function Hash() {
        this.digestLength = exports.digestLength;
        this.blockSize = exports.blockSize;
        // Note: Int32Array is used instead of Uint32Array for performance reasons.
        this.state = new Int32Array(8); // hash state
        this.temp = new Int32Array(64); // temporary state
        this.buffer = new Uint8Array(128); // buffer for data to hash
        this.bufferLength = 0; // number of bytes in buffer
        this.bytesHashed = 0; // number of total bytes hashed
        this.finished = false; // indicates whether the hash was finalized
        this.reset();
    }
    // Resets hash state making it possible
    // to re-use this instance to hash other data.
    Hash.prototype.reset = function () {
        this.state[0] = 0x6a09e667;
        this.state[1] = 0xbb67ae85;
        this.state[2] = 0x3c6ef372;
        this.state[3] = 0xa54ff53a;
        this.state[4] = 0x510e527f;
        this.state[5] = 0x9b05688c;
        this.state[6] = 0x1f83d9ab;
        this.state[7] = 0x5be0cd19;
        this.bufferLength = 0;
        this.bytesHashed = 0;
        this.finished = false;
        return this;
    };
    // Cleans internal buffers and re-initializes hash state.
    Hash.prototype.clean = function () {
        for (var i = 0; i < this.buffer.length; i++) {
            this.buffer[i] = 0;
        }
        for (var i = 0; i < this.temp.length; i++) {
            this.temp[i] = 0;
        }
        this.reset();
    };
    // Updates hash state with the given data.
    //
    // Optionally, length of the data can be specified to hash
    // fewer bytes than data.length.
    //
    // Throws error when trying to update already finalized hash:
    // instance must be reset to use it again.
    Hash.prototype.update = function (data, dataLength) {
        if (dataLength === void 0) { dataLength = data.length; }
        if (this.finished) {
            throw new Error("SHA256: can't update because hash was finished.");
        }
        var dataPos = 0;
        this.bytesHashed += dataLength;
        if (this.bufferLength > 0) {
            while (this.bufferLength < 64 && dataLength > 0) {
                this.buffer[this.bufferLength++] = data[dataPos++];
                dataLength--;
            }
            if (this.bufferLength === 64) {
                hashBlocks(this.temp, this.state, this.buffer, 0, 64);
                this.bufferLength = 0;
            }
        }
        if (dataLength >= 64) {
            dataPos = hashBlocks(this.temp, this.state, data, dataPos, dataLength);
            dataLength %= 64;
        }
        while (dataLength > 0) {
            this.buffer[this.bufferLength++] = data[dataPos++];
            dataLength--;
        }
        return this;
    };
    // Finalizes hash state and puts hash into out.
    //
    // If hash was already finalized, puts the same value.
    Hash.prototype.finish = function (out) {
        if (!this.finished) {
            var bytesHashed = this.bytesHashed;
            var left = this.bufferLength;
            var bitLenHi = (bytesHashed / 0x20000000) | 0;
            var bitLenLo = bytesHashed << 3;
            var padLength = (bytesHashed % 64 < 56) ? 64 : 128;
            this.buffer[left] = 0x80;
            for (var i = left + 1; i < padLength - 8; i++) {
                this.buffer[i] = 0;
            }
            this.buffer[padLength - 8] = (bitLenHi >>> 24) & 0xff;
            this.buffer[padLength - 7] = (bitLenHi >>> 16) & 0xff;
            this.buffer[padLength - 6] = (bitLenHi >>> 8) & 0xff;
            this.buffer[padLength - 5] = (bitLenHi >>> 0) & 0xff;
            this.buffer[padLength - 4] = (bitLenLo >>> 24) & 0xff;
            this.buffer[padLength - 3] = (bitLenLo >>> 16) & 0xff;
            this.buffer[padLength - 2] = (bitLenLo >>> 8) & 0xff;
            this.buffer[padLength - 1] = (bitLenLo >>> 0) & 0xff;
            hashBlocks(this.temp, this.state, this.buffer, 0, padLength);
            this.finished = true;
        }
        for (var i = 0; i < 8; i++) {
            out[i * 4 + 0] = (this.state[i] >>> 24) & 0xff;
            out[i * 4 + 1] = (this.state[i] >>> 16) & 0xff;
            out[i * 4 + 2] = (this.state[i] >>> 8) & 0xff;
            out[i * 4 + 3] = (this.state[i] >>> 0) & 0xff;
        }
        return this;
    };
    // Returns the final hash digest.
    Hash.prototype.digest = function () {
        var out = new Uint8Array(this.digestLength);
        this.finish(out);
        return out;
    };
    // Internal function for use in HMAC for optimization.
    Hash.prototype._saveState = function (out) {
        for (var i = 0; i < this.state.length; i++) {
            out[i] = this.state[i];
        }
    };
    // Internal function for use in HMAC for optimization.
    Hash.prototype._restoreState = function (from, bytesHashed) {
        for (var i = 0; i < this.state.length; i++) {
            this.state[i] = from[i];
        }
        this.bytesHashed = bytesHashed;
        this.finished = false;
        this.bufferLength = 0;
    };
    return Hash;
}());
exports.Hash = Hash;
// HMAC implements HMAC-SHA256 message authentication algorithm.
var HMAC = /** @class */ (function () {
    function HMAC(key) {
        this.inner = new Hash();
        this.outer = new Hash();
        this.blockSize = this.inner.blockSize;
        this.digestLength = this.inner.digestLength;
        var pad = new Uint8Array(this.blockSize);
        if (key.length > this.blockSize) {
            (new Hash()).update(key).finish(pad).clean();
        }
        else {
            for (var i = 0; i < key.length; i++) {
                pad[i] = key[i];
            }
        }
        for (var i = 0; i < pad.length; i++) {
            pad[i] ^= 0x36;
        }
        this.inner.update(pad);
        for (var i = 0; i < pad.length; i++) {
            pad[i] ^= 0x36 ^ 0x5c;
        }
        this.outer.update(pad);
        this.istate = new Uint32Array(8);
        this.ostate = new Uint32Array(8);
        this.inner._saveState(this.istate);
        this.outer._saveState(this.ostate);
        for (var i = 0; i < pad.length; i++) {
            pad[i] = 0;
        }
    }
    // Returns HMAC state to the state initialized with key
    // to make it possible to run HMAC over the other data with the same
    // key without creating a new instance.
    HMAC.prototype.reset = function () {
        this.inner._restoreState(this.istate, this.inner.blockSize);
        this.outer._restoreState(this.ostate, this.outer.blockSize);
        return this;
    };
    // Cleans HMAC state.
    HMAC.prototype.clean = function () {
        for (var i = 0; i < this.istate.length; i++) {
            this.ostate[i] = this.istate[i] = 0;
        }
        this.inner.clean();
        this.outer.clean();
    };
    // Updates state with provided data.
    HMAC.prototype.update = function (data) {
        this.inner.update(data);
        return this;
    };
    // Finalizes HMAC and puts the result in out.
    HMAC.prototype.finish = function (out) {
        if (this.outer.finished) {
            this.outer.finish(out);
        }
        else {
            this.inner.finish(out);
            this.outer.update(out, this.digestLength).finish(out);
        }
        return this;
    };
    // Returns message authentication code.
    HMAC.prototype.digest = function () {
        var out = new Uint8Array(this.digestLength);
        this.finish(out);
        return out;
    };
    return HMAC;
}());
exports.HMAC = HMAC;
// Returns SHA256 hash of data.
function hash(data) {
    var h = (new Hash()).update(data);
    var digest = h.digest();
    h.clean();
    return digest;
}
exports.hash = hash;
// Function hash is both available as module.hash and as default export.
exports["default"] = hash;
// Returns HMAC-SHA256 of data under the key.
function hmac(key, data) {
    var h = (new HMAC(key)).update(data);
    var digest = h.digest();
    h.clean();
    return digest;
}
exports.hmac = hmac;
// Fills hkdf buffer like this:
// T(1) = HMAC-Hash(PRK, T(0) | info | 0x01)
function fillBuffer(buffer, hmac, info, counter) {
    // Counter is a byte value: check if it overflowed.
    var num = counter[0];
    if (num === 0) {
        throw new Error("hkdf: cannot expand more");
    }
    // Prepare HMAC instance for new data with old key.
    hmac.reset();
    // Hash in previous output if it was generated
    // (i.e. counter is greater than 1).
    if (num > 1) {
        hmac.update(buffer);
    }
    // Hash in info if it exists.
    if (info) {
        hmac.update(info);
    }
    // Hash in the counter.
    hmac.update(counter);
    // Output result to buffer and clean HMAC instance.
    hmac.finish(buffer);
    // Increment counter inside typed array, this works properly.
    counter[0]++;
}
var hkdfSalt = new Uint8Array(exports.digestLength); // Filled with zeroes.
function hkdf(key, salt, info, length) {
    if (salt === void 0) { salt = hkdfSalt; }
    if (length === void 0) { length = 32; }
    var counter = new Uint8Array([1]);
    // HKDF-Extract uses salt as HMAC key, and key as data.
    var okm = hmac(salt, key);
    // Initialize HMAC for expanding with extracted key.
    // Ensure no collisions with `hmac` function.
    var hmac_ = new HMAC(okm);
    // Allocate buffer.
    var buffer = new Uint8Array(hmac_.digestLength);
    var bufpos = buffer.length;
    var out = new Uint8Array(length);
    for (var i = 0; i < length; i++) {
        if (bufpos === buffer.length) {
            fillBuffer(buffer, hmac_, info, counter);
            bufpos = 0;
        }
        out[i] = buffer[bufpos++];
    }
    hmac_.clean();
    buffer.fill(0);
    counter.fill(0);
    return out;
}
exports.hkdf = hkdf;
// Derives a key from password and salt using PBKDF2-HMAC-SHA256
// with the given number of iterations.
//
// The number of bytes returned is equal to dkLen.
//
// (For better security, avoid dkLen greater than hash length - 32 bytes).
function pbkdf2(password, salt, iterations, dkLen) {
    var prf = new HMAC(password);
    var len = prf.digestLength;
    var ctr = new Uint8Array(4);
    var t = new Uint8Array(len);
    var u = new Uint8Array(len);
    var dk = new Uint8Array(dkLen);
    for (var i = 0; i * len < dkLen; i++) {
        var c = i + 1;
        ctr[0] = (c >>> 24) & 0xff;
        ctr[1] = (c >>> 16) & 0xff;
        ctr[2] = (c >>> 8) & 0xff;
        ctr[3] = (c >>> 0) & 0xff;
        prf.reset();
        prf.update(salt);
        prf.update(ctr);
        prf.finish(u);
        for (var j = 0; j < len; j++) {
            t[j] = u[j];
        }
        for (var j = 2; j <= iterations; j++) {
            prf.reset();
            prf.update(u).finish(u);
            for (var k = 0; k < len; k++) {
                t[k] ^= u[k];
            }
        }
        for (var j = 0; j < len && i * len + j < dkLen; j++) {
            dk[i * len + j] = t[j];
        }
    }
    for (var i = 0; i < len; i++) {
        t[i] = u[i] = 0;
    }
    for (var i = 0; i < 4; i++) {
        ctr[i] = 0;
    }
    prf.clean();
    return dk;
}
exports.pbkdf2 = pbkdf2;

return Object.freeze(exports);
})();

// Production-shaped GAS verifier. No credential initialization or entropy API.
// GasBPbkdf2.gs embeds the already reviewed fast-sha256 1.3.0 implementation.
function privateDashboardBBytes_(hex) {
  if (typeof hex !== 'string' || !/^(?:[a-f0-9]{2})+$/.test(hex)) throw new Error('B_CONFIG_INVALID');
  return new Uint8Array(hex.match(/../g).map(function(pair) { return parseInt(pair,16); }));
}

function privateDashboardBVerifyPassword_(password, verifier) {
  let bytes, valid = typeof password === 'string';
  try {
    const encoded = encodeURIComponent(valid ? password : 'INVALID_PASSWORD_INPUT');
    const values = [];
    for (let i=0;i<encoded.length;i++) {
      if (encoded[i] === '%') { values.push(parseInt(encoded.slice(i+1,i+3),16));i+=2; }
      else values.push(encoded.charCodeAt(i));
    }
    valid = valid && values.length > 0 && values.length <= 1024;
    bytes = new Uint8Array(valid ? values : [0]);
  } catch (_) { valid=false;bytes=new Uint8Array([0]); }
  const salt=privateDashboardBBytes_(verifier.salt), expected=privateDashboardBBytes_(verifier.digest);
  let actual;
  try {
    actual=PRIVATE_DASHBOARD_B_PBKDF2_.pbkdf2(bytes,salt,600000,32);
    let difference=0;
    for(let i=0;i<32;i++) difference |= actual[i]^expected[i];
    return difference === 0 && valid;
  } finally {
    bytes.fill(0);salt.fill(0);expected.fill(0);if(actual)actual.fill(0);
  }
}

// Candidate GAS ScriptProperties persistence; never initializes or migrates.
const PRIVATE_DASHBOARD_GAS_PASSWORD_ENABLED_ = false;
const PRIVATE_DASHBOARD_B_CONFIG_KEY_ = 'DASHBOARD_AUTH_B_CONFIG_V1';
const PRIVATE_DASHBOARD_B_BIND_KEY_ = 'DASHBOARD_AUTH_B_BIND_V1';
const PRIVATE_DASHBOARD_B_LIMIT_KEY_ = 'DASHBOARD_AUTH_B_LIMIT_V1';
const PRIVATE_DASHBOARD_B_SESSION_PREFIX_ = 'DASHBOARD_AUTH_B_SESS_V1_';
const PRIVATE_DASHBOARD_B_STORES_ = ['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','三創','六張犁'];

function privateDashboardBGate_(options) {
  const synthetic=privateDashboardGasAuthGate_(options);
  if (!synthetic && PRIVATE_DASHBOARD_GAS_PASSWORD_ENABLED_ !== true) throw new Error('B_RELEASE_DISABLED');
  privateDashboardRequireAuthOwner_();
  return synthetic;
}

function privateDashboardBShape_(value, keys) {
  if (!value || Array.isArray(value) || typeof value !== 'object' || Object.keys(value).sort().join('|') !== keys.slice().sort().join('|')) throw new Error('B_STATE_INVALID');
}

function privateDashboardBInt_(value, minimum) {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error('B_STATE_INVALID');
}

function privateDashboardBDigestShape_(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new Error('B_STATE_INVALID');
}

function privateDashboardCreateGasBStore_(options) {
  privateDashboardBGate_(options);
  const owner=privateDashboardAuthOwnerConfig_().owner, props=privateDashboardProperties();
  function locked() { if (!privateDashboardRosterLockDepth_) throw new Error('B_OWNER_LOCK_REQUIRED'); }
  function load(key, fields) {
    locked();const text=props.getProperty(key);
    if (!text) throw new Error('B_STATE_REQUIRED');
    const value=privateDashboardGasAuthParse_(text);
    privateDashboardGasAuthJson_(value,8000);privateDashboardBShape_(value,fields);
    if(value.v!==1 || value.owner!==owner)throw new Error('B_STATE_INVALID');
    return value;
  }
  function write(key,value) {
    locked();const text=privateDashboardGasAuthJson_(value,8000);
    props.setProperty(key,text);
    if(props.getProperty(key)!==text)throw new Error('B_PERSISTENCE_FAILED');
  }
  function revision(value) { privateDashboardBInt_(value.revision,0);value.revision++;privateDashboardBInt_(value.revision,0); }
  function config() {
    const value=load(PRIVATE_DASHBOARD_B_CONFIG_KEY_,['v','owner','epoch','verifier','authority']);
    privateDashboardBInt_(value.epoch,1);
    privateDashboardBShape_(value.verifier,['algorithm','iterations','salt','digest']);
    if(value.verifier.algorithm!=='PBKDF2-HMAC-SHA256' || value.verifier.iterations!==600000 ||
      typeof value.verifier.salt!=='string' || !/^(?:[a-f0-9]{2}){16,32}$/.test(value.verifier.salt))throw new Error('B_CONFIG_INVALID');
    privateDashboardBDigestShape_(value.verifier.digest);
    const a=value.authority;privateDashboardBShape_(a,['version','sourceHash','effectiveAt','validUntil','members']);
    privateDashboardBInt_(a.version,1);privateDashboardBDigestShape_(a.sourceHash);
    privateDashboardBInt_(a.effectiveAt,0);privateDashboardBInt_(a.validUntil,0);
    if(a.validUntil<=a.effectiveAt || !a.members || Array.isArray(a.members) || typeof a.members!=='object' ||
      !Object.keys(a.members).length || Object.keys(a.members).length>64)throw new Error('B_CONFIG_INVALID');
    Object.keys(a.members).forEach(function(id) {
      if(privateDashboardCleanEmployeeId(id)!==id || PRIVATE_DASHBOARD_B_STORES_.indexOf(a.members[id])<0)throw new Error('B_CONFIG_INVALID');
    });
    // Approved authority must contain all nine stores, never a truncated source.
    if(PRIVATE_DASHBOARD_B_STORES_.some(function(store) { return !Object.keys(a.members).some(function(id) { return a.members[id]===store; }); }))throw new Error('B_CONFIG_INVALID');
    value.fingerprint=privateDashboardGasAuthDigest_(JSON.stringify([value.epoch,value.verifier,a.version,a.sourceHash,a.effectiveAt,a.validUntil,
      Object.keys(a.members).sort().map(function(id) { return [id,a.members[id]]; })]));
    return value;
  }
  function bindings() {
    const value=load(PRIVATE_DASHBOARD_B_BIND_KEY_,['v','owner','revision','bindings']);
    privateDashboardBInt_(value.revision,0);
    if(!value.bindings || Array.isArray(value.bindings) || typeof value.bindings!=='object' || Object.keys(value.bindings).length>64)throw new Error('B_STATE_INVALID');
    Object.keys(value.bindings).forEach(function(id) {
      const b=value.bindings[id];
      if(privateDashboardCleanEmployeeId(id)!==id || !Array.isArray(b) || b.length!==2)throw new Error('B_STATE_INVALID');
      privateDashboardBDigestShape_(b[0]);privateDashboardBInt_(b[1],1);
    });
    return value;
  }
  function sessions(bucket) {
    if(!/^[a-f0-9]$/.test(bucket))throw new Error('B_STATE_INVALID');
    const value=load(PRIVATE_DASHBOARD_B_SESSION_PREFIX_+bucket,['v','owner','revision','sessions','tombstones']);
    privateDashboardBInt_(value.revision,0);
    if(!Array.isArray(value.sessions) || value.sessions.length>12)throw new Error('B_STATE_INVALID');
    const seen=new Set();
    value.sessions.forEach(function(s) {
      privateDashboardBShape_(s,['digest','employee','device','bindingVersion','nativeGeneration','epoch','configHash','idempotencyHash','nonceHash','mint','issuedAt','expiresAt','revoked']);
      ['digest','device','configHash','idempotencyHash','nonceHash','mint'].forEach(function(key) { privateDashboardBDigestShape_(s[key]); });
      if(privateDashboardCleanEmployeeId(s.employee)!==s.employee || privateDashboardGasAuthDigest_(s.employee)[0]!==bucket || seen.has(s.digest) || typeof s.revoked!=='boolean')throw new Error('B_STATE_INVALID');
      seen.add(s.digest);privateDashboardBInt_(s.epoch,1);privateDashboardBInt_(s.bindingVersion,0); // zero: trusted, device-scoped session without persistent binding
      ['nativeGeneration','issuedAt','expiresAt'].forEach(function(key) { privateDashboardBInt_(s[key],0); });
      if(s.expiresAt-s.issuedAt!==1800000)throw new Error('B_STATE_INVALID');
    });
    if(!Array.isArray(value.tombstones) || value.tombstones.length>32 || value.tombstones.length+value.sessions.length>32)throw new Error('B_STATE_INVALID');
    const tombstones=new Set();
    value.tombstones.forEach(function(t) {
      if(!Array.isArray(t) || t.length!==3 || privateDashboardCleanEmployeeId(t[0])!==t[0] ||
        privateDashboardGasAuthDigest_(t[0])[0]!==bucket || tombstones.has(t[0]+'|'+t[1]))throw new Error('B_STATE_INVALID');
      privateDashboardBDigestShape_(t[1]);privateDashboardBInt_(t[2],0);tombstones.add(t[0]+'|'+t[1]);
    });
    return value;
  }
  function limiter() {
    const value=load(PRIVATE_DASHBOARD_B_LIMIT_KEY_,['v','owner','revision','start','total','employees','devices']);
    ['revision','start','total'].forEach(function(key) { privateDashboardBInt_(value[key],0); });
    ['employees','devices'].forEach(function(key) {
      if(!value[key] || Array.isArray(value[key]) || typeof value[key]!=='object' || Object.keys(value[key]).length>30)throw new Error('B_STATE_INVALID');
      Object.keys(value[key]).forEach(function(hash) { privateDashboardBDigestShape_(hash);privateDashboardBInt_(value[key][hash],1); });
    });
    if(value.total>30)throw new Error('B_STATE_INVALID');return value;
  }
  function admit(id,device,now) {
    const value=limiter();
    if(now<value.start)throw new Error('B_CLOCK_INVALID');
    if(now-value.start>=60000){value.start=now;value.total=0;value.employees={};value.devices={};}
    if(value.total>=30)return {allowed:false,delay:0};
    const employee=privateDashboardGasAuthDigest_(id);
    value.total++;value.employees[employee]=(value.employees[employee]||0)+1;value.devices[device]=(value.devices[device]||0)+1;
    const allowed=value.employees[employee]<=6 && value.devices[device]<=12;
    revision(value);write(PRIVATE_DASHBOARD_B_LIMIT_KEY_,value);
    return {allowed:allowed,delay:Math.min(1000,(Math.max(value.employees[employee],value.devices[device])-1)*75)};
  }
  return Object.freeze({config:config,bindings:bindings,sessions:sessions,limiter:limiter,admit:admit,
    validateAll:function() { config();bindings();limiter();'0123456789abcdef'.split('').forEach(sessions); },
    saveBindings:function(value) {revision(value);write(PRIVATE_DASHBOARD_B_BIND_KEY_,value);},
    saveSessions:function(bucket,value) {revision(value);write(PRIVATE_DASHBOARD_B_SESSION_PREFIX_+bucket,value);}});
}

// GAS owner endpoint. Original A routes remain separate; B cannot invoke admin,
// phone-stock, 3C, WORK, arbitrary readers or caller-selected roles/resources.
// Additional entries affect password-channel device exemption only. They never
// grant the independent Patrol/supervisor passcode or legacy trusted privileges.
function privateDashboardBTrusted_(id) {
  if(privateDashboardIsTrustedEmployee(id))return true;
  const text=privateDashboardProperties().getProperty('DASHBOARD_AUTH_B_SUPERVISORS_V1');
  if(!text)return false;
  const ids=JSON.parse(text);
  if(!Array.isArray(ids) || ids.length>32 || new Set(ids).size!==ids.length || ids.some(function(x){return typeof x!=='string' || privateDashboardCleanEmployeeId(x)!==x;}))throw new Error('B_STATE_INVALID');
  return ids.indexOf(id)>=0;
}

function privateDashboardBStrictNative_(id,config,now) {
  const trusted=privateDashboardBTrusted_(id);
  if(now<config.authority.effectiveAt || now>=config.authority.validUntil || !trusted && !Object.prototype.hasOwnProperty.call(config.authority.members,id))throw new Error('B_ELIGIBILITY_DENIED');
  const sheet=privateDashboardRoster().getSheetByName(PRIVATE_DASHBOARD_USERS_SHEET);
  if(!sheet || sheet.getLastColumn()!==PRIVATE_DASHBOARD_USERS_HEADERS.length ||
    sheet.getRange(1,1,1,PRIVATE_DASHBOARD_USERS_HEADERS.length).getValues()[0].join('|')!==PRIVATE_DASHBOARD_USERS_HEADERS.join('|'))throw new Error('B_NATIVE_SCHEMA_INVALID');
  const count=sheet.getLastRow()-1;
  if(count<1 || count>10000)throw new Error('B_NATIVE_SCHEMA_INVALID');
  const rows=sheet.getRange(2,1,count,5).getValues().filter(function(row) { return String(row[0]||'').trim().toUpperCase()===id; });
  if(rows.length!==1 || String(rows[0][0])!==id || rows[0][4]!=='active')throw new Error('B_ELIGIBILITY_DENIED');
  const store=String(rows[0][2]||'').trim().replace(/\s+/g,'').replace(/^台灣大哥大數位生活台北/,'').replace(/^台灣大哥大台北/,'').replace(/^台北/,'');
  if(!trusted && store!==config.authority.members[id])throw new Error('B_ELIGIBILITY_DENIED');
  return {maskedName:String(rows[0][1]||''),store:store,role:'employee',isTrusted:false};
}

function privateDashboardBPayload_(input) {
  if(!input || Array.isArray(input) || typeof input!=='object')throw new Error('B_REQUEST_INVALID');
  const adminFields={employee_admin_list:['action','adminSecret'],employee_admin_reset_device:['action','adminSecret','employeeId'],
    employee_admin_supervisor:['action','adminSecret','employeeId','enabled']};
  if(Object.prototype.hasOwnProperty.call(adminFields,input.action)) {
    privateDashboardBShape_(input,adminFields[input.action]);
    if(typeof input.adminSecret!=='string' || !input.adminSecret || input.adminSecret.length>1024)throw new Error('B_REQUEST_INVALID');
    if(input.action!=='employee_admin_list' && (typeof input.employeeId!=='string' || privateDashboardCleanEmployeeId(input.employeeId)!==input.employeeId))throw new Error('B_REQUEST_INVALID');
    if(input.action==='employee_admin_supervisor' && typeof input.enabled!=='boolean')throw new Error('B_REQUEST_INVALID');
    return input;
  }
  const fields={employee_status:['action'],employee_login:['action','employeeId','deviceId','track','password','sessionNonce','idempotencyKey'],
    employee_session:['action','deviceId','token'],employee_logout:['action','deviceId','token'],
    employee_private_read:['action','deviceId','token'],employee_kpi_read:['action','deviceId','token']};
  if(!Object.prototype.hasOwnProperty.call(fields,input.action))throw new Error('B_REQUEST_INVALID');
  privateDashboardBShape_(input,fields[input.action]);
  if(input.action==='employee_status')return input;
  if(typeof input.deviceId!=='string' || privateDashboardCleanDeviceId(input.deviceId)!==input.deviceId)throw new Error('B_REQUEST_INVALID');
  if(input.action==='employee_login') {
    if(input.track!=='password-bound' || typeof input.employeeId!=='string' || privateDashboardCleanEmployeeId(input.employeeId)!==input.employeeId ||
      typeof input.password!=='string' || input.password.length>1024 || typeof input.sessionNonce!=='string' || !/^[a-f0-9]{64}$/.test(input.sessionNonce) ||
      typeof input.idempotencyKey!=='string' || !/^[A-Za-z0-9_-]{20,80}$/.test(input.idempotencyKey))throw new Error('B_REQUEST_INVALID');
  } else if(typeof input.token!=='string' || !/^B1_[a-f0-9]_[a-f0-9]{64}$/.test(input.token))throw new Error('B_REQUEST_INVALID');
  return input;
}

function privateDashboardBToken_(id,device,bindingVersion,generation,config,nonce,mint) {
  // Entropy comes from the client's 32-byte WebCrypto nonce; GAS UUID is only
  // a mint uniqueness marker. No raw nonce or token is stored on the owner.
  return 'B1_'+privateDashboardGasAuthDigest_(id)[0]+'_'+privateDashboardGasAuthDigest_(JSON.stringify([
    nonce,mint,id,device,bindingVersion,generation,config.epoch,config.fingerprint]));
}

function privateDashboardCreateGasB_(options) {
  const synthetic=privateDashboardBGate_(options), store=privateDashboardCreateGasBStore_(options);
  const provider=options.provider || privateDashboardAuthNativeProvider_();
  const now=options.now || function() { return Date.now(); };
  // Only explicit local synthetic hosts may replace KDF to isolate races.
  const verify=synthetic && options.verify ? options.verify : privateDashboardBVerifyPassword_;
  const sleep=synthetic && options.sleep ? options.sleep : function(ms) { if(ms)Utilities.sleep(ms); };
  function transaction(run) { return privateDashboardRosterTransaction_(run); }
  function retire(sessions,predicate,time) {
    sessions.tombstones=sessions.tombstones.filter(function(t) { return t[2]>time; });
    sessions.sessions=sessions.sessions.filter(function(s) {
      if(s.expiresAt<=time)return false;
      if(!predicate(s))return true;
      if(!sessions.tombstones.some(function(t) { return t[0]===s.employee && t[1]===s.idempotencyHash; })) {
        if(sessions.tombstones.length>=32)throw new Error('B_CAPACITY');
        sessions.tombstones.push([s.employee,s.idempotencyHash,s.expiresAt]);
      }
      return false;
    });
  }
  function status() {
    return transaction(function() { store.validateAll();const c=store.config(),t=now();
      if(t<c.authority.effectiveAt || t>=c.authority.validUntil)throw new Error('B_ELIGIBILITY_DENIED');
      return {status:'ok',enabled:true,passwordAvailable:true}; });
  }
  function login(p) {
    const id=p.employeeId,device=privateDashboardGasAuthDigest_(p.deviceId);
    const captured=transaction(function() {
      const config=store.config(),admission=store.admit(id,device,now());
      if(!admission.allowed)throw new Error('B_RATE_DENIED');
      let snapshot=null;
      try {privateDashboardBStrictNative_(id,config,now());snapshot=provider.capture(id);}catch(_){/* Same KDF for an unknown/ineligible canonical identity. */}
      return {config:config,snapshot:snapshot,delay:admission.delay};
    });
    sleep(captured.delay);
    const verified=verify(p.password,captured.config.verifier);
    if(!verified || !captured.snapshot)throw new Error('B_LOGIN_DENIED');
    return provider.commit(captured.snapshot,function() {
      const config=store.config();
      if(config.fingerprint!==captured.config.fingerprint)throw new Error('B_CONFIG_CHANGED');
      privateDashboardBStrictNative_(id,config,now());
      const trusted=privateDashboardBTrusted_(id);
      const bindingState=store.bindings(),existing=bindingState.bindings[id];
      if(!trusted && (existing && existing[0]!==device || Object.keys(bindingState.bindings).some(function(other) { return other!==id && bindingState.bindings[other][0]===device; })))throw new Error('B_BINDING_DENIED');
      if(!trusted && !existing && Object.keys(bindingState.bindings).length>=64)throw new Error('B_CAPACITY');
      const binding=trusted ? [device,0] : existing || [device,1],generation=provider.currentGeneration(id),bucket=privateDashboardGasAuthDigest_(id)[0];
      const sessions=store.sessions(bucket),time=now(),idem=privateDashboardGasAuthDigest_(p.idempotencyKey),nonce=privateDashboardGasAuthDigest_(p.sessionNonce);
      retire(sessions,function(s) { return s.revoked || s.epoch!==config.epoch || s.configHash!==config.fingerprint || s.employee===id && s.nativeGeneration!==generation; },time);
      if(sessions.tombstones.some(function(t) { return t[0]===id && t[1]===idem; }))throw new Error('B_LOGIN_DENIED');
      const prior=sessions.sessions.filter(function(s) { return s.employee===id && s.idempotencyHash===idem; });
      if(prior.length>1)throw new Error('B_STATE_INVALID');
      if(prior.length) {
        const s=prior[0];
        const token=privateDashboardBToken_(id,device,binding[1],generation,config,p.sessionNonce,s.mint);
        if(s.revoked || s.nonceHash!==nonce || s.device!==device || s.bindingVersion!==binding[1] || s.nativeGeneration!==generation ||
          s.epoch!==config.epoch || s.configHash!==config.fingerprint || time<s.issuedAt || s.digest!==privateDashboardGasAuthDigest_(token))throw new Error('B_LOGIN_DENIED');
        return {status:'ok',token:token,expiresAt:s.expiresAt,trustSource:'password-bound'};
      }
      // Reserve a durable tombstone slot for every active session, so even a
      // full ledger can invalidate every already-issued token on logout.
      if(sessions.sessions.length>=12 || sessions.sessions.length+sessions.tombstones.length>=32 ||
        sessions.sessions.filter(function(s) { return s.employee===id; }).length>=3)throw new Error('B_CAPACITY');
      const mint=privateDashboardGasAuthDigest_(JSON.stringify([Utilities.getUuid(),time,sessions.revision+1])),token=privateDashboardBToken_(id,device,binding[1],generation,config,p.sessionNonce,mint);
      const record={digest:privateDashboardGasAuthDigest_(token),employee:id,device:device,bindingVersion:binding[1],nativeGeneration:generation,
        epoch:config.epoch,configHash:config.fingerprint,idempotencyHash:idem,nonceHash:nonce,mint:mint,issuedAt:time,expiresAt:time+1800000,revoked:false};
      if(sessions.sessions.some(function(s) {return s.digest===record.digest;}))throw new Error('B_STATE_INVALID');
      if(!trusted)bindingState.bindings[id]=binding;sessions.sessions.push(record);
      // Check both capacities before either write. A partial write returns no
      // token; existing durable binding is never reset or moved on retry.
      privateDashboardBInt_(sessions.revision+1,0);
      privateDashboardGasAuthJson_(Object.assign({},sessions,{revision:sessions.revision+1}),8000);
      if(!trusted && !existing) {
        privateDashboardBInt_(bindingState.revision+1,0);
        privateDashboardGasAuthJson_(Object.assign({},bindingState,{revision:bindingState.revision+1}),8000);
      }
      if(!trusted && !existing)store.saveBindings(bindingState);
      store.saveSessions(bucket,sessions);
      return {status:'ok',token:token,expiresAt:record.expiresAt,trustSource:'password-bound'};
    });
  }
  function sessionOperation(p) {
    return transaction(function() {
      const bucket=p.token.split('_')[1],sessions=store.sessions(bucket),hash=privateDashboardGasAuthDigest_(p.token),device=privateDashboardGasAuthDigest_(p.deviceId);
      const matches=sessions.sessions.filter(function(s) { return s.digest===hash; });
      if(matches.length!==1 || matches[0].device!==device)throw new Error('B_SESSION_DENIED');
      const s=matches[0],time=now();
      if(s.revoked || time<s.issuedAt || time>=s.expiresAt)throw new Error('B_SESSION_DENIED');
      // Logout may invalidate the matching session after an authority change;
      // it still requires both its token and original device proof.
      if(p.action==='employee_logout') {retire(sessions,function(record) { return record.digest===s.digest; },time);store.saveSessions(bucket,sessions);return {status:'ok'};}
      const config=store.config(),bindings=store.bindings(),binding=bindings.bindings[s.employee];
      const profile=privateDashboardBStrictNative_(s.employee,config,time);
      const validBinding=s.bindingVersion===0 ? privateDashboardBTrusted_(s.employee) : binding && binding[0]===device && binding[1]===s.bindingVersion;
      if(!validBinding || config.epoch!==s.epoch || config.fingerprint!==s.configHash)throw new Error('B_SESSION_DENIED');
      return provider.withEligibility(s.employee,function() {
        if(provider.currentGeneration(s.employee)!==s.nativeGeneration)throw new Error('B_SESSION_DENIED');
        if(p.action==='employee_session')return {status:'ok',expiresAt:s.expiresAt,trustSource:'password-bound'};
        let result;
        if(p.action==='employee_private_read')result={snapshot:privateDashboardSnapshot()};
        else if(p.action==='employee_kpi_read') {
          const file=kpiCalcLatestDataFile();if(!file)throw new Error('B_DATA_UNAVAILABLE');
          const data=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
          if(!data || !data.meta || !data.stores || !data.persons)throw new Error('B_DATA_INVALID');
          result={data:data};
        } else throw new Error('B_REQUEST_INVALID');
        // Use the existing strict private-result validator under the same lock;
        // no password/token/device proof may leak through a data projection.
        result.profile=profile;
        result=privateDashboardGasRpcResult_(p.action==='employee_private_read'?'privateDashboardAccess':'kpiCalcAccess',result,
          {deviceId:p.deviceId,adminSecret:p.token,bootstrapCode:''},'privateDashboardBRead_');
        return Object.assign({status:'ok',trustSource:'password-bound'},result);
      });
    });
  }
  function adminOperation(p) {
    privateDashboardAdminAuthorized(p);
    return transaction(function() {
      const state=store.bindings();
      if(p.action==='employee_admin_list') {
        const users=privateDashboardRows(privateDashboardSheet(PRIVATE_DASHBOARD_USERS_SHEET,PRIVATE_DASHBOARD_USERS_HEADERS),PRIVATE_DASHBOARD_USERS_HEADERS);
        return {status:'ok',users:users.map(function(u){return {employeeId:u.employee_id,maskedName:u.masked_name,store:u.store,status:u.status,
          passwordBound:Boolean(state.bindings[u.employee_id]),supervisor:privateDashboardBTrusted_(u.employee_id),primarySupervisor:privateDashboardIsTrustedEmployee(u.employee_id)};})};
      }
      const id=p.employeeId,lookup=privateDashboardUserByEmployeeId(id);
      if(!lookup.user)throw new Error('B_ELIGIBILITY_DENIED');
      if(p.action==='employee_admin_supervisor' && privateDashboardIsTrustedEmployee(id))throw new Error('B_PRIMARY_SUPERVISOR_PROTECTED');
      if(p.action==='employee_admin_supervisor' && p.enabled && lookup.user.status!=='active')throw new Error('B_ELIGIBILITY_DENIED');
      // Persist tombstones before releasing the binding. Replays of previous
      // login requests must not silently bind the retired browser again.
      const bucket=privateDashboardGasAuthDigest_(id)[0],sessions=store.sessions(bucket);
      retire(sessions,function(record){return record.employee===id;},now());
      store.saveSessions(bucket,sessions);
      if(p.action==='employee_admin_reset_device') {
        if(state.bindings[id]) {delete state.bindings[id];store.saveBindings(state);}
        return {status:'ok',reset:true};
      }
      const props=privateDashboardProperties(),key='DASHBOARD_AUTH_B_SUPERVISORS_V1';
      privateDashboardBTrusted_(id); // validate prior state before writing
      const ids=JSON.parse(props.getProperty(key)||'[]').filter(function(x){return x!==id;});
      if(p.enabled)ids.push(id);
      if(ids.length>32)throw new Error('B_CAPACITY');
      const text=JSON.stringify(ids.sort());props.setProperty(key,text);
      if(props.getProperty(key)!==text)throw new Error('B_PERSISTENCE_FAILED');
      return {status:'ok',supervisor:p.enabled};
    });
  }
  function handle(text) {
    try {
      if(typeof reportUploadIsUploadDeployment_==='function' && reportUploadIsUploadDeployment_())throw new Error('B_REQUEST_INVALID');
      if(typeof text!=='string' || text.length>16384)throw new Error('B_REQUEST_INVALID');
      const p=privateDashboardBPayload_(privateDashboardGasAuthParse_(text));
      return p.action.indexOf('employee_admin_')===0?adminOperation(p):p.action==='employee_status'?status():p.action==='employee_login'?login(p):sessionOperation(p);
    } catch (_) { return {status:'error',code:'B_AUTH_DENIED'}; }
  }
  return Object.freeze({handle:handle});
}

function privateDashboardGasBMaybePost_(event) {
  if(!event || !event.postData || typeof event.postData.contents!=='string')return null;
  let input;
  try {input=JSON.parse(event.postData.contents);}catch(_){return null;}
  if(!input || typeof input.action!=='string' || input.action.indexOf('employee_')!==0)return null;
  let result={status:'error',code:'B_AUTH_DENIED'};
  try {
    if(!/^text\/plain(?:;\s*charset=utf-8)?$/i.test(String(event.postData.type||'')) || event.postData.contents.length>16384 ||
      typeof reportUploadIsUploadDeployment_==='function' && reportUploadIsUploadDeployment_())throw new Error('B_REQUEST_INVALID');
    const p=privateDashboardBPayload_(privateDashboardGasAuthParse_(event.postData.contents));
    if(p.action==='employee_status' && (PRIVATE_DASHBOARD_GAS_PASSWORD_ENABLED_!==true || PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_!==true))result={status:'ok',enabled:false,passwordAvailable:false};
    else result=privateDashboardCreateGasB_({}).handle(event.postData.contents);
  } catch(_){/* Never expose exceptions, identity, source or credentials. */}
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}
