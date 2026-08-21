const SPREADSHEET_ID = '10MqzAWOPc4UPE-g5ZZPNZG3tYAndKW-DApLuuhIpQWA';

function patrolJsonResponse_(body, callback) {
  const json = JSON.stringify(body || {});
  const cb = String(callback || '');
  if (cb && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(cb)) {
    return ContentService.createTextOutput(cb + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function patrolPostPayload_(e) {
  const raw = String(e && e.postData && e.postData.contents || '');
  if (!raw) throw new Error('missing request body');
  const payload = JSON.parse(raw);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('invalid request body');
  return payload;
}

function patrolHealth_() {
  return {
    status: 'ok',
    app: 'patrol',
    configured: Boolean(ptConfiguredKey_()),
    contract: 'patrol-auth-v3',
    sessionContract: PATROL_SESSION_CONTRACT,
    authDeployment: PATROL_AUTH_DEPLOYMENT
  };
}

function patrolGetRoute_(action, params) {
  const query = params || {};
  if (action === 'ping') return {status: 'ok', app: 'patrol'};
  if (action === 'pthealth') return patrolHealth_();
  if (action === 'ptread') {
    ptRequireSession_(query.token, action);
    return {status: 'ok', rows: readPatrol(), stores: PT_STORES, title: PT_TITLE};
  }
  if (action === 'ptsummary') {
    ptRequireSession_(query.token, action);
    const month = patrolSummaryMonth_(query.month);
    return {status: 'ok', summary: readPatrolSummary_(month), stores: PT_STORES, title: PT_TITLE};
  }
  if (action === 'ptdetail') {
    ptRequireSession_(query.token, action);
    return readPatrolDetail_({month: patrolSummaryMonth_(query.month), store: query.store, page: query.page, limit: query.limit});
  }
  if (action === 'ptmileage') {
    ptRequireSession_(query.token, action);
    return readPatrolMileageMonth_({month: patrolSummaryMonth_(query.month), page: query.page, limit: query.limit});
  }
  if (action === 'ptvisit_read') {
    ptRequireSession_(query.token, action);
    const state = patrolVisitState_(query.date || '');
    return {status: 'ok', events: state.events, openVisit: state.openVisit, staleOpenVisit: state.staleOpenVisit};
  }
  if (action === 'hread') {
    ptRequireSession_(query.token, action);
    return {status: 'ok', rows: readHalfCheck()};
  }
  if (action === 'sread') {
    ptRequireSession_(query.token, action);
    return {status: 'ok', schedule: readSchedule(query.month || '')};
  }
  if (action === 'ptwrite') {
    ptRequireSession_(query.token, action);
    const result = writePatrol(JSON.parse(String(query.payload || '[]')));
    return {status: 'ok', written: result.written, updated: result.updated};
  }
  if (action === 'hwrite') {
    ptRequireSession_(query.token, action);
    return {status: 'ok', written: writeHalfCheck(JSON.parse(String(query.payload || '[]')))};
  }
  throw new Error('unknown patrol action');
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const action = String(params.action || '');
  try {
    return patrolJsonResponse_(patrolGetRoute_(action, params), params.callback);
  } catch (error) {
    return patrolJsonResponse_(ptRouteErrorPayload_(error, action, params.token), params.callback);
  }
}

function doPost(e) {
  let action = '';
  let payload = {};
  try {
    payload = patrolPostPayload_(e);
    action = String(payload.action || '');
    let result;
    if (action === 'ptauth') result = ptAuthenticatePayload(payload);
    else if (action === 'ptlogout') result = ptLogoutPayload(payload);
    else if (action === 'ptsummary') result = ptSummaryPostPayload_(payload);
    else if (action === 'ptdetail') result = ptDetailPostPayload_(payload);
    else if (action === 'ptmileage') result = ptMileageMonthPostPayload_(payload);
    else if (action === 'ptvisit_write') result = writePatrolVisitEvent_(payload);
    else if (action === 'ptvisit_read') {
      ptRequireSession_(payload.token, action);
      const state = patrolVisitState_(payload.date || '');
      result = {events: state.events, openVisit: state.openVisit, staleOpenVisit: state.staleOpenVisit};
    }
    else if (action === 'hwrite') result = writeHalfCheckPostPayload_(payload, e);
    else if (action === 'hread') {
      ptRequireSession_(payload.token, action);
      result = {rows: readHalfCheck()};
    }
    else if (action === 'sread') {
      ptRequireSession_(payload.token, action);
      result = {schedule: readSchedule(payload.month || '')};
    }
    else if (action === 'half_media_upload') result = uploadHalfMedia(payload);
    else throw new Error('unknown patrol action');
    return patrolJsonResponse_({status: 'ok', ...result});
  } catch (error) {
    return patrolJsonResponse_(ptRouteErrorPayload_(error, action, payload && payload.token));
  }
}

const PATROL_SESSION_TTL_SECONDS = 1800;
const PATROL_SESSION_CONTRACT = 'patrol-session-v2';
const PATROL_AUTH_DEPLOYMENT = 'patrol-isolated-v1';
const PATROL_SESSION_SIGNING_KEY_PROPERTY = 'PATROL_SESSION_SIGNING_KEY';
const PATROL_SESSION_REVOKED_PREFIX = 'PATROL_SESSION_REVOKED_';

// ── 分享給其他督導時，每人自建試算表與 GAS 部署，改這兩個設定即可 ──
// （網頁 patrol.html 大家共用，會自動抓各自 GAS 回傳的標題與門市清單）
const PT_TITLE = '北一二B區 · 33 項檢核追蹤';
const PT_STORES = [
  { code: 'DNB10059', name: '台北通化' },
  { code: 'DNB10062', name: '台北酒泉' },
  { code: 'DNB10307', name: '台北三創' },
  { code: 'DNB10xxx_wanda', name: '台北萬大' },
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

function patrolMileageCacheKey_(month, sourceVersion) {
  const version = Utilities.base64EncodeWebSafe(String(sourceVersion || '')).slice(0, 80);
  return ['ptmileage-visits-v2', month, version].join(':');
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

function readPatrolMileageMonth_(options) {
  const startedAt = Date.now();
  const month = patrolSummaryMonth_(options.month);
  const page = Number(options.page || 1);
  if (!Number.isInteger(page) || page < 1) throw new Error('invalid patrol mileage page');
  if (page !== 1) throw new Error('patrol mileage visits are single page');
  const limit = PATROL_MILEAGE_MAX_VISITS;
  const sheet = getPatrolSheet();
  const meta = patrolSummarySourceMeta_(sheet);
  const cache = CacheService.getScriptCache();
  const cacheKey = patrolMileageCacheKey_(month, meta.sourceVersion);
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

function ptStoreRows(all, st) {
  const key = st.name.replace('台北', '');
  return all.filter(r => {
    const rs = String(r.store || '');
    if (!rs) return false;
    if (st.code && String(r.code || '') === st.code) return true;
    return rs.indexOf(key) !== -1 || st.name.indexOf(rs) !== -1;
  });
}
