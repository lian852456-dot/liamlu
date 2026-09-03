(function startLiamSupervisorApp(scope) {
  'use strict';

  const C = scope.LiamSupervisorContract;
  const H = scope.LiamHalfMonthCheckReadModel;
  const Y = scope.LiamYesterdayFollowUpModel;
  const P = scope.PatrolReadModel;
  const Q = scope.PatrolQuestionVersions;
  const DAILY_REPORT_API = 'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
  const PATROL_API = 'https://script.google.com/macros/s/AKfycbznzoWOzzPJLEh8PCwTLw8UfWEyiCXwawd0T49JXpK4MP70vTdrrfTMN1G2Grghd-Mv/exec';
  const PRIVATE_TIMEOUT_MS = 20_000;
  const PATROL_TIMEOUT_MS = Object.freeze({ sread:30_000, ptsummary:20_000, ptdetail:60_000, ptmileage2:30_000, hread:90_000, ptvisit_read:30_000 });
  const RETRY_DELAY_MS = 1_000;
  const EMPLOYEE_KEY = 'north12b_private_dashboard_employee_id';
  const DEVICE_KEY = 'north12b_private_dashboard_device_id';
  const PATROL_TOKEN_KEY = 'bei12b_pt_session_token';
  const STORES = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
  const STORE_ALIASES = new Map([['三創','台北三創']]);
  const KPI_CORE_KEYS = {
    A999:'AQ V+D 999 (含)以上', A1399:'AQ V+D 1399 (含)以上', '好速':'好速案銷售點數',
    R999:'RT V+D 999 (含)以上', R1399:'RT V+D 1399 (含)以上', RT:'RT上線點數'
  };
  const FAILURE_LABELS = { a999:'A999', a1399:'A1399', haosu:'好速', achieve:'R999', r1399:'R1399', insurance:'保險搭售率' };
  const READ_ACTIONS = new Set(['private_access','read','pread','kpicalc_access']);
  const DEVICE_ACTIONS = new Set(['private_request','private_request_status']);
  const PATROL_READ_ACTIONS = new Set(['sread','ptsummary','ptdetail','ptmileage2','ptvisit_read','hread']);
  const PATROL_WRITE_ACTIONS = new Set(['ptvisit_write']);
  const PRIVATE_MODULE_KEYS = ['todayOperations','kpiSummary','kpiStores','kpiFullMetrics','awardSummary','awardStores','awardTop2Models','personalPerformance','report1600','report2100','reportFailures'];
  const PREVIEW_MODE = new URLSearchParams(scope.location.search).get('preview') === '1';
  const STALE_MS = 30 * 60 * 60 * 1000;

  let contract = PREVIEW_MODE ? C.validateContract(scope.LiamSupervisorPreviewData) : emptyFormalContract();
  let yesterdayFollowUpModule = PREVIEW_MODE && Y ? C.moduleState({
    status:'ok', updatedAt:contract.report2100.updatedAt, sourceUpdatedAt:contract.report2100.sourceUpdatedAt, stale:false,
    source:moduleSource('昨日 21:00 正式每日回報','index.html'),
    data:Y.adapt({date:taipeiDateOffset(-1),report:contract.report2100.data}),
    note:'Preview／示意資料'
  }) : statusModule('yesterdayFollowUp');
  let reportSegment = 16;
  let battleKind = 'kpi';
  let battleScope = 'region';
  let personalRegionView = 'role';
  let personalRole = '店長';
  let personalGapMetric = 'A999';
  let patrolToken = scope.sessionStorage.getItem(PATROL_TOKEN_KEY) || '';
  let scheduleRaw = null;
  let scheduleViewData = null;
  let patrolRaw = null;
  let patrolVisitEvents = [];
  let patrolOpenVisit = null;
  let patrolStaleOpenVisit = null;
  let patrolVisitError = '';
  let patrolMileageState = {status:PREVIEW_MODE?'preview':'idle',data:null,note:''};
  let patrolCheckView = 'patrol';
  let halfMonthPreviewScreen = 'overview';
  let halfMonthPreviewStore = '';
  let halfMonthPreviewAnswers = {};
  let halfMonthPreviewMessage = '';
  let halfMonthPreviewResult = null;
  let halfMonthFormalRows = [];
  let halfMonthReadState = 'idle';
  let halfMonthReadMessage = '';
  let halfMonthSelectedPeriod = H ? H.periodForDate(taipeiDate()) : '';
  let privateAccessStatus = PREVIEW_MODE ? 'preview' : 'unauthorized';

  const dom = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  function moduleSource(label, href) { return { label, href }; }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);
  }

  function taipeiDate() {
    return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date());
  }

  function taipeiDateOffset(days) {
    const anchor = new Date(`${taipeiDate()}T12:00:00+08:00`);
    anchor.setTime(anchor.getTime() + Number(days || 0) * 86400000);
    return new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit' }).format(anchor);
  }

  function nowIso() { return new Date().toISOString(); }

  function formatTime(value, fallback = '—') {
    if (!value) return fallback;
    const timeOnly = String(value).match(/(?:^|\s)(\d{1,2}:\d{2})(?::\d{2})?/);
    if (timeOnly && !String(value).includes('T')) return timeOnly[1];
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('zh-TW', { timeZone:'Asia/Taipei', hour:'2-digit', minute:'2-digit', hour12:false }).format(date);
  }

  function formatDate(value, fallback = '—') {
    if (!value) return fallback;
    const date = new Date(String(value).includes('T') ? value : `${value}T00:00:00+08:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat('zh-TW', { timeZone:'Asia/Taipei', month:'2-digit', day:'2-digit' }).format(date);
  }

  function formatReliableDateOnly(value, fallback = '—') {
    if (!value) return fallback;
    const match = String(value).match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    return match ? `${Number(match[1])}/${Number(match[2])}/${Number(match[3])}` : fallback;
  }

  function stale(value) {
    const parsed = Date.parse(String(value || ''));
    return !Number.isFinite(parsed) || Date.now() - parsed > STALE_MS;
  }

  function normalizeStore(value) {
    const clean = String(value || '')
      .replace(/^台灣大哥大數位生活/, '')
      .replace(/^台北/, '')
      .replace(/\s+/g, '')
      .trim();
    return STORE_ALIASES.get(clean) || (clean === '三創' ? '台北三創' : clean);
  }

  function statusModule(key, status = 'unauthorized', data = null, note = '') {
    const sources = {
      todayOperations:moduleSource('北一二B每日回報','index.html'),
      kpiSummary:moduleSource('正式 KPI kpicalc','kpi.html'), kpiStores:moduleSource('正式 KPI kpicalc','kpi.html'), kpiFullMetrics:moduleSource('正式 KPI kpicalc','kpi.html'),
      awardSummary:moduleSource('正式台獎私有戰情','index.html'), awardStores:moduleSource('正式台獎私有戰情','index.html'), awardTop2Models:moduleSource('正式台獎私有戰情','index.html'),
      personalPerformance:moduleSource('正式 KPI 個績快照','index.html'),
      report1600:moduleSource('北一二B每日回報','index.html'), report2100:moduleSource('北一二B每日回報','index.html'), reportFailures:moduleSource('正式個人回報','index.html'),
      yesterdayFollowUp:moduleSource('昨日 21:00 正式每日回報','index.html'),
      scheduleToday:moduleSource('既有班表 sread','patrol.html'), scheduleByDate:moduleSource('既有班表 sread','patrol.html'),
      patrolToday:moduleSource('巡店唯讀摘要','patrol.html'), patrolOverview:moduleSource('巡店 ptsummary','patrol.html'), patrolStores:moduleSource('巡店 ptsummary','patrol.html')
    };
    return C.moduleState({ status, updatedAt:'', sourceUpdatedAt:'', stale:false, source:sources[key], data, note });
  }

  function emptyFormalContract() {
    const result = { version:C.VERSION, generatedAt:nowIso(), mode:'formal' };
    C.MODULE_KEYS.forEach(key => { result[key] = statusModule(key); });
    return C.validateContract(result);
  }

  function refreshIcons() {
    if (scope.lucide && typeof scope.lucide.createIcons === 'function') scope.lucide.createIcons({ attrs: { 'aria-hidden':'true' } });
  }

  class ReadTransportError extends Error {
    constructor(kind, message, retryable = false, status = 0) {
      super(message);
      this.name = 'ReadTransportError';
      this.kind = kind;
      this.retryable = retryable;
      this.status = status;
    }
  }

  async function fetchJsonAttempt(input, options, timeoutMs, timeoutMessage) {
    const controller = new AbortController();
    const timer = scope.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(input, { ...options, signal:controller.signal });
      const text = await response.text();
      let body;
      try {
        body = JSON.parse(text);
      } catch (_) {
        const googleHtml404 = response.status === 404 && /(?:text\/html|<!doctype html|<html)/i.test(`${response.headers.get('content-type') || ''}\n${text.slice(0,200)}`);
        throw new ReadTransportError(googleHtml404 ? 'google-html-404' : 'non-json', googleHtml404 ? '正式資料服務暫時回傳 HTTP 404。' : '正式資料服務回傳無法解析的內容。', googleHtml404, response.status);
      }
      if (!response.ok) throw new ReadTransportError('http', `正式資料服務連線失敗（HTTP ${response.status}）`, false, response.status);
      return { response, body };
    } catch (error) {
      if (error && error.name === 'AbortError') throw new ReadTransportError('timeout', timeoutMessage, true);
      if (error instanceof ReadTransportError) throw error;
      if (error instanceof TypeError) throw new ReadTransportError('network', '正式資料服務網路連線失敗。', true);
      throw error;
    } finally {
      scope.clearTimeout(timer);
    }
  }

  async function fetchJsonWithRecovery(input, options, timeoutMs, timeoutMessage) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await fetchJsonAttempt(input, options, timeoutMs, timeoutMessage);
      } catch (error) {
        lastError = error;
        if (!error || !error.retryable || attempt === 1) throw error;
        await new Promise(resolve => scope.setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
    throw lastError;
  }

  function readErrorNote(error, label = '正式資料') {
    return error && error.kind === 'timeout' ? `${label}讀取逾時` : `${label}讀取失敗`;
  }

  function deviceId() {
    let value = scope.localStorage.getItem(DEVICE_KEY);
    if (value) return value;
    value = scope.crypto && scope.crypto.randomUUID ? scope.crypto.randomUUID().replace(/-/g,'') : '';
    if (!value) throw new Error('此瀏覽器無法建立既有裝置識別。');
    scope.localStorage.setItem(DEVICE_KEY, value);
    return value;
  }

  async function postReadOnly(payload) {
    if (!READ_ACTIONS.has(payload.action)) throw new Error('App 1.2 僅允許既有唯讀 action。');
    const { body } = await fetchJsonWithRecovery(DAILY_REPORT_API, {
      method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body:JSON.stringify(payload), cache:'no-store', credentials:'omit'
    }, PRIVATE_TIMEOUT_MS, '正式資料讀取逾時，請稍後重試。');
    if (!body || body.status !== 'ok') throw new Error((body && body.message) || '正式摘要讀取失敗。');
    return body;
  }

  async function postDeviceAccess(payload) {
    if (!DEVICE_ACTIONS.has(payload.action)) throw new Error('不允許的裝置授權 action。');
    const { body } = await fetchJsonWithRecovery(DAILY_REPORT_API, {
      method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body:JSON.stringify(payload), cache:'no-store', credentials:'omit'
    }, PRIVATE_TIMEOUT_MS, '裝置授權讀取逾時，請稍後重試。');
    if (!body || body.status !== 'ok') throw new Error((body && body.message) || '裝置授權失敗。');
    return body;
  }

  function privateAccessPending(message) {
    return /尚未核准此裝置|等待.*核准|待核准|首次申請綁定/.test(String(message || ''));
  }

  function setPrivateAccessState(status, message = '') {
    privateAccessStatus = status;
    const state = dom('#privateDeviceStatus');
    state.className = `device-status${status === 'approved' ? ' approved' : status === 'pending' ? ' pending' : ''}`;
    state.textContent = status === 'approved' ? '此 iPhone App 裝置已核准'
      : status === 'pending' ? '此 iPhone App 裝置待核准'
      : status === 'error' ? '正式資料讀取失敗'
      : '尚未解鎖這台 iPhone App 裝置';
    if (message) setMessage('#privateAccessMessage',message,status === 'approved' ? 'success' : status === 'pending' ? '' : 'error');
  }

  function resetPrivateSummary(status = 'unauthorized', note = '') {
    PRIVATE_MODULE_KEYS.forEach(key => { contract[key] = statusModule(key,status,null,note); });
    yesterdayFollowUpModule=statusModule('yesterdayFollowUp',status,null,note);
    if (status === 'unauthorized') {
      contract.kpiStores = statusModule('kpiStores',status,[],note);
      contract.kpiFullMetrics = statusModule('kpiFullMetrics',status,{region:[],stores:{}},note);
      contract.awardStores = statusModule('awardStores',status,[],note);
      contract.awardTop2Models = statusModule('awardTop2Models',status,[],note);
      contract.personalPerformance = statusModule('personalPerformance',status,{ summary:null, people:[] },note);
    }
    contract.generatedAt = nowIso();
  }

  function privateLoadingModule(key, label) {
    const current=contract[key];
    if(current&&current.data!=null) return C.moduleState({...current,status:'stale',stale:true,note:`上次成功資料 · ${formatTime(current.updatedAt)} · ${label}讀取中`});
    return statusModule(key,'stale',null,`${label}讀取中`);
  }

  function privateFailureModule(key, error, label) {
    const current=contract[key];
    const note=readErrorNote(error,label);
    if(current&&current.data!=null) return C.moduleState({...current,status:'stale',stale:true,note:`上次成功資料 · ${formatTime(current.updatedAt)} · ${note}`});
    return statusModule(key,'error',null,note);
  }

  function yesterdayLoadingModule() {
    const current=yesterdayFollowUpModule;
    if(current&&current.data!=null) return C.moduleState({...current,status:'stale',stale:true,note:`上次成功資料 · ${formatTime(current.updatedAt)} · 昨日 21:00 正式資料讀取中`});
    return statusModule('yesterdayFollowUp','stale',null,'昨日 21:00 正式資料讀取中');
  }

  function yesterdayFailureModule(error) {
    const current=yesterdayFollowUpModule;
    const note=readErrorNote(error,'昨日 21:00 正式資料');
    if(current&&current.data!=null) return C.moduleState({...current,status:'stale',stale:true,note:`上次成功資料 · ${formatTime(current.updatedAt)} · ${note}`});
    return statusModule('yesterdayFollowUp','error',null,note);
  }

  function failPrivateSummary(error) {
    PRIVATE_MODULE_KEYS.forEach(key=>{ contract[key]=privateFailureModule(key,error,'正式資料'); });
    yesterdayFollowUpModule=yesterdayFailureModule(error);
    contract.generatedAt=nowIso();
  }

  const PATROL_REAUTH_REASONS = new Set(['AUTH_SESSION_EXPIRED','AUTH_SESSION_REVOKED']);
  const PATROL_AUTH_REASON_TEXT = {
    AUTH_TOKEN_MISSING:'班表／巡店請求未帶 session token',
    AUTH_TOKEN_INVALID:'班表／巡店 session token 無效',
    AUTH_SESSION_NOT_FOUND:'班表／巡店 session 無法辨識',
    AUTH_SESSION_EXPIRED:'班表／巡店授權已逾時，請重新驗證',
    AUTH_SESSION_REVOKED:'班表／巡店授權已撤銷，請重新驗證',
    AUTH_DEPLOYMENT_MISMATCH:'班表／巡店 session 與正式部署版本不相容',
    AUTH_CREDENTIAL_INVALID:'班表／巡店通行碼錯誤'
  };

  function patrolApiReason(body) { return String(body&&((body.auth&&body.auth.reason)||body.reason)||''); }
  function patrolApiError(body, fallback) {
    const reason=patrolApiReason(body); const error=new Error(PATROL_AUTH_REASON_TEXT[reason]||(body&&body.message)||fallback);
    error.authReason=reason; return error;
  }
  function patrolApiNeedsReauth(error) { return PATROL_REAUTH_REASONS.has(String(error&&error.authReason||'')); }
  function clearExpiredPatrolSession(error) {
    if(!patrolApiNeedsReauth(error)) return false;
    patrolToken=''; scope.sessionStorage.removeItem(PATROL_TOKEN_KEY); dom('#patrolLogout').hidden=true;
    return true;
  }

  async function postPatrolAuth(payload) {
    if (!['ptauth','ptlogout'].includes(payload.action)) throw new Error('不允許的 session action。');
    const { body } = await fetchJsonWithRecovery(PATROL_API, {
      method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload), cache:'no-store'
    }, 30_000, '班表／巡店驗證逾時，請稍後重試。');
    if (!body || body.status !== 'ok') throw patrolApiError(body,'班表／巡店驗證失敗。');
    return body;
  }

  async function patrolRead(action, params = {}) {
    if (!PATROL_READ_ACTIONS.has(action)) throw new Error('App 1.2 僅允許既有班表／巡店讀取與獨立到離店讀取。');
    if (!patrolToken) throw new Error('班表／巡店 session 尚未驗證。');
    const timeoutMs = PATROL_TIMEOUT_MS[action];
    const timeoutMessage = action === 'hread' ? '督導到店檢查讀取逾時，請點擊重試。'
      : action === 'ptmileage2' ? '移動里程讀取逾時'
      : action === 'ptsummary' || action === 'ptdetail' ? '巡店資料讀取逾時'
      : action === 'sread' ? '班表讀取逾時，請點擊重試。'
      : '今日到離店紀錄讀取逾時，請點擊重試。';
    if (action === 'ptsummary' || action === 'ptdetail' || action === 'ptmileage2') {
      const { body } = await fetchJsonWithRecovery(PATROL_API, {
        method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({ action, token:patrolToken, ...params }), cache:'no-store'
      }, timeoutMs, timeoutMessage);
      if (!body || body.status !== 'ok') {
        const error=patrolApiError(body,'巡店資料讀取失敗。');clearExpiredPatrolSession(error);throw error;
      }
      return body;
    }
    const query = [['action',action],['token',patrolToken]];
    Object.entries(params).forEach(([key,value]) => {
      if (value !== '' && value != null) query.push([key,String(value)]);
    });
    const url = `${PATROL_API}?${query.map(([key,value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join('&')}`;
    const { body } = await fetchJsonWithRecovery(url, { method:'GET', cache:'no-store' }, timeoutMs, timeoutMessage);
    if (!body || body.status !== 'ok') {
      const error=patrolApiError(body,'班表／巡店讀取失敗。');clearExpiredPatrolSession(error);throw error;
    }
    return body;
  }

  async function patrolVisitWrite(visitAction, store, note) {
    const action = 'ptvisit_write';
    if (!PATROL_WRITE_ACTIONS.has(action)) throw new Error('不允許的巡店寫入 action。');
    if (!patrolToken) throw new Error('班表／巡店 session 尚未驗證。');
    const response = await fetch(PATROL_API, {
      method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, cache:'no-store', credentials:'omit',
      body:JSON.stringify({ action, token:patrolToken, visitAction, store, note:String(note || '') })
    });
    const body = await response.json();
    if (!body || body.status !== 'ok') {
      const error=patrolApiError(body,'到離店寫入失敗。');clearExpiredPatrolSession(error);throw error;
    }
    return body;
  }

  function rateFromMetric(metric) {
    if (metric == null || metric === '') return null;
    if (typeof metric !== 'object') {
      const direct = Number(metric);
      return Number.isFinite(direct) ? direct : null;
    }
    const value = metric.reportRate != null ? metric.reportRate : metric.rate;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function metricFrom(source, candidates) {
    const core = source && source.core || {};
    const metrics = source && source.metrics || {};
    for (const candidate of candidates) {
      if (Object.prototype.hasOwnProperty.call(core,candidate)) return rateFromMetric(core[candidate]);
      if (Object.prototype.hasOwnProperty.call(metrics,candidate)) return rateFromMetric(metrics[candidate]);
    }
    return null;
  }

  function fullKpiItems(source) {
    const metrics = source && source.metrics || {};
    const core = source && source.core || {};
    const bucket = Object.keys(metrics).length ? metrics : core;
    return Object.entries(bucket).map(([key,metric], index) => ({
      key:String(key),
      label:String(metric && (metric.displayName || metric.display_name || metric.label || metric.name) || key),
      category:String(metric && (metric.category || metric.group || metric.section || metric.categoryName) || '其他 KPI'),
      rate:rateFromMetric(metric),
      order:numberOrNull(metric && metric.order) == null ? index : numberOrNull(metric.order)
    })).sort((a,b) => a.order - b.order);
  }

  function kpiDataAsOfDate(data) {
    const meta = data && data.meta || {};
    return /^\d{4}-\d{2}$/.test(String(meta.month || '')) && meta.snapshotDay
      ? `${meta.month}-${String(meta.snapshotDay).padStart(2,'0')}` : '';
  }

  function sourceFileName(value) {
    const raw = String(value || '').split(/[\\/]/).pop().trim().toLowerCase();
    const staged = raw.match(/^report-upload-temp-[a-f0-9]{32,64}-(\d{4}\.xlsx)$/i);
    return staged ? staged[1].toLowerCase() : raw;
  }

  function kpiSupplementIsCurrent(data, supplement) {
    const dataAsOf = kpiDataAsOfDate(data);
    const supplementReportDate = String(supplement && supplement.report_date || '');
    const supplementAsOf = String(supplement && (supplement.data_as_of_date || supplement.source_as_of_date) || '');
    const supplementSource = sourceFileName(supplement && supplement.source_file);
    const kpiSource = sourceFileName(data && data.meta && data.meta.sourceFile);
    return Boolean(dataAsOf && supplement && supplementReportDate && supplementAsOf &&
      supplementReportDate === supplementAsOf && supplementAsOf === dataAsOf &&
      supplementSource && kpiSource && supplementSource === kpiSource);
  }

  function officialKpiRate(entry) {
    const value = entry && typeof entry === 'object' ? entry.reportRate : null;
    return numberOrNull(value);
  }

  function kpicalcMetricItems(data, rates) {
    return (data && Array.isArray(data.items) ? data.items : []).map((item,index) => ({
      key:String(item.key || ''), label:String(item.displayName || item.display_name || item.label || item.name || item.key || ''),
      category:String(item.category || item.group || item.section || item.categoryName || '完整 KPI'),
      rate:officialKpiRate(rates && rates[item.key]), order:numberOrNull(item.order) == null ? index : numberOrNull(item.order)
    })).sort((a,b)=>a.order-b.order);
  }

  function adaptKpi(data, snapshot, readAt) {
    const supplement = snapshot && snapshot.kpiBattle || {};
    const aligned = kpiSupplementIsCurrent(data, supplement);
    const sourceUpdatedAt = String(data && data.meta && (data.meta.updatedAt || data.meta.publishedAt) || (aligned && supplement.generated_at) || '');
    const source = moduleSource('正式 KPI kpicalc','kpi.html');
    const supplementStores = new Map((aligned && Array.isArray(supplement.stores) ? supplement.stores : []).map(row=>[normalizeStore(row.store),row]));
    const storeRows = (data && Array.isArray(data.stores) ? data.stores : []).map(store => {
      const supplementRow = supplementStores.get(normalizeStore(store.name)) || {};
      const fullKpis = kpicalcMetricItems(data, store.items || {});
      const rates = new Map(fullKpis.map(metric=>[metric.key,metric.rate]));
      return {
        name:normalizeStore(store.name), kpi:numberOrNull(store.official), rank:numberOrNull(supplementRow.company_rank),
        kpiDod:numberOrNull(supplementRow.overall_kpi_dod), rankChange:numberOrNull(supplementRow.company_rank_dod), addon:numberOrNull(supplementRow.addon_score),
        core:Object.fromEntries(Object.entries(KPI_CORE_KEYS).map(([short,key])=>[short,rates.has(key)?rates.get(key):null])), fullKpis
      };
    }).filter(row=>row.name);
    const aggregate = aligned && supplement.aggregate || {};
    const aggregateRates = data && data.aggregateRates || {};
    const fullRegion = kpicalcMetricItems(data, Object.fromEntries(Object.keys(aggregateRates).map(key=>[key,{reportRate:aggregateRates[key]}])));
    const summaryData = {
      kpi:numberOrNull(aggregate.overall_kpi), companyRank:numberOrNull(aggregate.company_rank), companyRankTotal:numberOrNull(supplement.company_rank_total),
      kpiDod:numberOrNull(aggregate.overall_kpi_dod), rankChange:numberOrNull(aggregate.company_rank_dod), addonScore:numberOrNull(aggregate.addon_score),
      reportDate:aligned ? String(supplement.report_date || '') : '', fullKpis:fullRegion
    };
    const completeMetrics = fullRegion.length === 25 && fullRegion.every(metric=>metric.rate != null) && storeRows.length === 9 && storeRows.every(row=>row.fullKpis.length === 25);
    const base = { updatedAt:readAt, sourceUpdatedAt, stale:sourceUpdatedAt ? stale(sourceUpdatedAt) : false, source };
    const summaryStatus = summaryData.kpi != null && summaryData.companyRank != null ? (completeMetrics?'ok':'partial') : 'partial';
    const note = aligned ? (completeMetrics?'':'正式 kpicalc 未完整提供 9 店 × 25 項 rate') : 'kpicalc 與摘要日期／來源檔不一致，排名與 DOD 已 fail-closed';
    return {
      summary:C.moduleState({ ...base, status:summaryStatus, data:summaryData, note }),
      stores:C.moduleState({ ...base, status:completeMetrics?'ok':(storeRows.length?'partial':'no_data'), data:storeRows, note }),
      full:C.moduleState({ ...base, status:completeMetrics?'ok':(fullRegion.length?'partial':'no_data'), data:{ region:fullRegion, stores:Object.fromEntries(storeRows.map(row=>[row.name,row.fullKpis])) }, note })
    };
  }

  function numberOrNull(value) {
    if (value === null || value === undefined || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function adaptAwards(snapshot, expectedReportDate, readAt) {
    const awards = snapshot && snapshot.awardsBattle || {};
    const updatedAt = String(awards.generated_at || snapshot && snapshot.publishedAt || '');
    const reportDate = String(awards.report_date || '');
    const source = moduleSource('正式台獎私有戰情','index.html');
    if (!expectedReportDate || reportDate !== expectedReportDate) {
      const note = reportDate ? `台獎日期 ${reportDate} 與 KPI 日期 ${expectedReportDate || '—'} 不一致` : '正式台獎未提供可對齊的資料日期';
      const missing = data => C.moduleState({ status:'no_data', updatedAt:readAt, sourceUpdatedAt:updatedAt, stale:updatedAt?stale(updatedAt):false, source, data, note });
      return { summary:missing(null), stores:missing([]), top2:missing([]) };
    }
    const sourceOverall = awards.overall || {};
    const supervisorAward = awards.supervisor || {};
    const overallAward = sourceOverall.award || awards.supervisor || {};
    const storeRows = Array.isArray(awards.stores) ? awards.stores.map(row => {
      const award = row.award || {};
      // Formal index.html renders the selected store's own row.items without Top2 filtering.
      // Preserve only fields that the formal award snapshot actually supplied; never recalculate them.
      const items = (Array.isArray(row.items) ? row.items : []).map(item => ({
        name:String(item && (item.display_name || item.name) || ''),
        actual:numberOrNull(item && item.actual), target:numberOrNull(item && item.target), rate:numberOrNull(item && item.rate),
        difference:numberOrNull(item && item.difference), thresholdTarget:numberOrNull(item && item.threshold_target),
        reward50:numberOrNull(item && item.store_reward_50), reward100:numberOrNull(item && item.store_reward_100),
        status:item && item.award != null ? String(item.award) : item && item.status != null ? String(item.status) : item && item.eligible != null ? String(item.eligible) : ''
      })).filter(item => item.name);
      return { name:normalizeStore(row.store), amount:numberOrNull(award.actual_total) || 0, eligible:String(award.award || '').toUpperCase() === 'Y', items };
    }).filter(row => row.name) : [];
    const models = Array.isArray(sourceOverall.items) ? sourceOverall.items : [];
    const top2 = models.map(item => ({
      name:String(item.display_name || item.name || ''), amount100:numberOrNull(item.district_reward_100 != null ? item.district_reward_100 : item.store_reward_100),
      progress:numberOrNull(item.rate), status:String(item.award || item.status || '')
    })).filter(item => item.name && item.amount100 != null).sort((a,b) => b.amount100 - a.amount100).slice(0,2);
    const winningStores = storeRows.filter(row => row.eligible).length;
    // overallAward.actual_total is not the same currency contract as store award.actual_total
    // (the formal snapshot currently exposes count-scale 179 beside store amounts in the thousands).
    // Fail closed until the source publishes an explicit same-unit district amount field.
    const totalAmount = numberOrNull(overallAward.district_award_amount != null ? overallAward.district_award_amount : overallAward.region_award_amount);
    const supervisorEligibility = String(supervisorAward.award || '').trim().toUpperCase();
    const summary = {
      totalAmount, regionTotalAvailable:totalAmount != null,
      areaActualAward:numberOrNull(supervisorAward.actual_total),
      areaCompanyRank:numberOrNull(supervisorAward.rank),
      areaEligible:supervisorEligibility === 'Y' ? true : supervisorEligibility === 'N' ? false : null,
      winningStores, totalStores:9, reportDate
    };
    const base = { updatedAt:readAt, sourceUpdatedAt:updatedAt, stale:stale(updatedAt), source };
    return {
      summary:C.moduleState({ ...base, status:storeRows.length === 9 ? 'ok':(storeRows.length?'partial':'no_data'), data:summary, note:totalAmount == null?'正式來源未提供與九店獎勵金額同口徑的區總額；App 不顯示 aggregate actual_total。':'' }),
      stores:C.moduleState({ ...base, status:storeRows.length === 9 ? 'ok' : (storeRows.length ? 'partial':'no_data'), data:storeRows }),
      top2:C.moduleState({ ...base, status:top2.length === 2 ? 'ok' : (top2.length ? 'partial':'no_data'), data:top2, note:top2.length < 2 ? '正式資料缺少足夠的 100% 獎金欄位' : '' })
    };
  }

  function personalRecord(raw) {
    const row = raw && raw.record ? raw.record : raw || {};
    const failed = Array.isArray(row.failed) ? row.failed.map(value => FAILURE_LABELS[String(value)] || String(value)) : [];
    const metrics = row.data || {};
    const extra = row.extra || {};
    return {
      status:failed.length ? 'fail':'pass', failed,
      metrics:{ A999:numberOrNull(metrics.a999), A1399:numberOrNull(metrics.a1399), '好速':numberOrNull(metrics.haosu), R999:numberOrNull(metrics.achieve), R1399:numberOrNull(metrics.r1399) },
      reason:String(extra.fail_reason || ''), improvePlan:String(extra.improve_plan || ''),
      consult:String(extra.consult_method || ''), customers:String(extra.customers || '')
    };
  }

  function personalRoleGroup(source) {
    const category=String(source && source.category || '').trim();
    const role=String(source && source.role || '').trim();
    if(category) return category==='店長'?'店長':category==='副店'?'副店':'其他業代';
    if(/副店/.test(role)) return '副店';
    if(/店長/.test(role)) return '店長';
    return '其他業代';
  }

  function personalMetricByKey(person,key) {
    return (person && Array.isArray(person.metrics) ? person.metrics : []).find(metric=>metric.key===key) || null;
  }

  function personalRankedByRole(people,roleGroup) {
    return (Array.isArray(people)?people:[]).filter(person=>person.roleGroup===roleGroup).slice().sort((a,b)=>{
      if(a.rank==null&&b.rank==null) return 0;
      if(a.rank==null) return 1;
      if(b.rank==null) return -1;
      return a.rank-b.rank;
    });
  }

  function managerStorePerformanceRows(people,stores) {
    const storeByName=new Map((Array.isArray(stores)?stores:[]).map(store=>[normalizeStore(store.name),store]));
    return (Array.isArray(people)?people:[]).filter(person=>person.roleGroup==='店長').map(person=>{
      const store=storeByName.get(normalizeStore(person.store)) || null;
      const aq=personalMetricByKey(person,'AQ');
      const aqActual=aq&&aq.actual!=null?aq.actual:null;
      return { person,store,aqActual,aqGap:aqActual==null?null:Math.max(0,10-aqActual) };
    }).sort((a,b)=>{
      const aRank=a.store&&a.store.rank!=null?a.store.rank:null;
      const bRank=b.store&&b.store.rank!=null?b.store.rank:null;
      if(aRank==null&&bRank==null) return 0;
      if(aRank==null) return 1;
      if(bRank==null) return -1;
      return aRank-bRank;
    });
  }

  function personalStoreViewRows(people,stores,selectedStore) {
    const selected=normalizeStore(selectedStore);
    const storePeople=(Array.isArray(people)?people:[]).filter(person=>normalizeStore(person.store)===selected);
    return {
      managers:managerStorePerformanceRows(storePeople,stores),
      staff:storePeople.filter(person=>person.roleGroup!=='店長')
    };
  }

  function personalUnderTargetByMetric(people,key) {
    const nonManagers=(Array.isArray(people)?people:[]).filter(person=>person.roleGroup!=='店長');
    const missing=nonManagers.filter(person=>{ const metric=personalMetricByKey(person,key); return !metric||metric.rate==null; });
    const rows=nonManagers.filter(person=>{ const metric=personalMetricByKey(person,key); return metric&&metric.rate!=null&&metric.rate<1; })
      .slice().sort((a,b)=>personalMetricByKey(b,key).rate-personalMetricByKey(a,key).rate);
    return { rows,missing };
  }

  function personalAqReview(people) {
    const managers=(Array.isArray(people)?people:[]).filter(person=>person.roleGroup==='店長');
    const missing=managers.filter(person=>{ const metric=personalMetricByKey(person,'AQ'); return !metric||metric.actual==null; });
    const attention=managers.filter(person=>{ const metric=personalMetricByKey(person,'AQ'); return metric&&metric.actual!=null&&metric.actual<10; })
      .map(person=>({ person,actual:personalMetricByKey(person,'AQ').actual,gap:Math.max(0,10-personalMetricByKey(person,'AQ').actual) }));
    return { attention,missing };
  }

  function adaptPersonalPerformance(snapshot, readAt) {
    const sourceData = snapshot && snapshot.kpiBattle || {};
    const rows = Array.isArray(sourceData.personal) ? sourceData.personal : [];
    const people = rows.map(row => ({
      name:String(row.name || ''), store:normalizeStore(row.store), role:String(row.role || ''), category:String(row.category || ''),
      roleGroup:personalRoleGroup(row),
      totalRate:numberOrNull(row.overall_rate), rank:numberOrNull(row.rank), dod:numberOrNull(row.overall_rate_dod), rankChange:numberOrNull(row.rank_dod),
      metrics:Object.entries(row.metrics || {}).map(([key,metric]) => ({
        key:String(key), rate:numberOrNull(metric && metric.rate), actual:numberOrNull(metric && metric.actual), target:numberOrNull(metric && metric.target),
        dailyTarget:numberOrNull(metric && metric.daily_target), dailyGap:numberOrNull(metric && metric.daily_gap), dod:numberOrNull(metric && metric.dod)
      }))
    })).filter(row => row.name && row.store);
    const personalPeople=people.filter(row=>row.roleGroup!=='店長');
    const achieved = personalPeople.filter(row => row.totalRate != null && row.totalRate >= 1).length;
    const underTarget = personalPeople.filter(row => row.totalRate != null && row.totalRate < 1).length;
    const aqReview=personalAqReview(people);
    const complete = people.length > 0 && people.every(row => row.roleGroup === '店長'
      ? row.metrics.length > 0
      : row.totalRate != null && row.rank != null && row.dod != null && row.rankChange != null && row.metrics.length > 0);
    const updatedAt = String(sourceData.generated_at || snapshot && snapshot.publishedAt || '');
    return C.moduleState({
      status:people.length ? (complete ? 'ok' : 'partial') : 'no_data', updatedAt:readAt, sourceUpdatedAt:updatedAt,
      stale:updatedAt ? stale(updatedAt) : false, source:moduleSource('正式 KPI 個績快照','index.html'),
      data:{
        summary:{ total:people.length, achieved, underTarget, aqAttentionCount:aqReview.attention.length, aqMissingCount:aqReview.missing.length, reportDate:String(sourceData.report_date || ''), sourceAsOfDate:String(sourceData.source_as_of_date || '') },
        people
      },
      note:people.length ? 'AQ需關注店長只依管理規則顯示 AQ actual < 10；不修改正式總績效、KPI 或公司排名。正式來源目前提供 10 項個人 KPI，未提供個人 25 項。' : '正式來源尚無個績資料。'
    });
  }

  function reportStoreFeedback(report, summaryStore) {
    const canonical = summaryStore && summaryStore.storeFeedback && typeof summaryStore.storeFeedback === 'object'
      ? summaryStore.storeFeedback
      : null;
    return {
      reason:String(canonical ? canonical.reason || '' : report && report.zero_reason || ''),
      consult:String(canonical ? canonical.consult || '' : report && report.zero_consult || ''),
      method:String(canonical ? canonical.method || '' : report && report.zero_method || ''),
      plan:String(canonical ? canonical.plan || '' : report && report.zero_plan || '')
    };
  }

  function adaptReport(segment, storeData, personalData, formalSummary) {
    const summary = formalSummary && typeof formalSummary === 'object' ? formalSummary : null;
    const summaryStores = new Map((summary && Array.isArray(summary.stores) ? summary.stores : []).map(row => [normalizeStore(row.name), row]));
    const stores = STORES.map(name => {
      const report = (storeData || {})[name] || (storeData || {})[normalizeStore(name)] || null;
      const summaryStore = summaryStores.get(normalizeStore(name)) || null;
      const peopleSource = (personalData || {})[name] || {};
      const people = Object.entries(peopleSource).map(([personName,raw]) => ({ name:personName, ...personalRecord(raw) }));
      const metrics = summaryStore ? Object.fromEntries(Object.entries(summaryStore.metrics || {}).map(([key,metric]) => [key,numberOrNull(metric && metric.value)]).filter(([,value]) => value != null)) : {};
      return {
        name,
        reported:summaryStore ? Boolean(summaryStore.reported) : Boolean(report),
        reportedAt:summaryStore ? String(summaryStore.reportedAt || '') : report ? String(report.savedAt || report.updatedAt || '') : '',
        metrics,
        people,
        storeFeedback:reportStoreFeedback(report,summaryStore)
      };
    });
    const completed = summary && numberOrNull(summary.completedStores) != null ? Number(summary.completedStores) : stores.filter(store => store.reported).length;
    const missing = summary && Array.isArray(summary.missingStores) ? summary.missingStores.map(normalizeStore) : stores.filter(store => !store.reported).map(store => store.name);
    const summaryMetrics = summary ? Object.fromEntries(Object.entries(summary.metrics || {}).map(([key,metric]) => [key,{
      value:numberOrNull(metric && metric.value), unit:String(metric && metric.unit || ''), sourceField:String(metric && metric.sourceField || ''), aggregation:String(metric && metric.aggregation || '')
    }]).filter(([,metric]) => metric.value != null)) : {};
    return { segment, completedStores:completed, totalStores:summary && numberOrNull(summary.totalStores) != null ? Number(summary.totalStores) : 9, missingStores:missing, updatedAt:summary ? String(summary.updatedAt || '') : '', summaryAvailable:Boolean(summary && summary.semantics === 'formal-index-summary-v1'), summaryMetrics, stores };
  }

  function failureSummary(report) {
    const people = report.stores.flatMap(store => store.people.filter(person => person.status === 'fail').map(person => ({ store:store.name, ...person })));
    const byMetric = {};
    people.forEach(person => person.failed.forEach(metric => { byMetric[metric] = (byMetric[metric] || 0) + 1; }));
    return { segment:report.segment, failedStoreCount:new Set(people.map(person => person.store)).size, failedPeopleCount:people.length, missingStores:report.missingStores, byMetric, people };
  }

  async function loadFormalSummary(employeeId) {
    const id = String(employeeId || '').trim();
    if (!id) throw new Error('請輸入既有員工編號。');
    const credential = { employeeId:id, deviceId:deviceId() };
    scope.localStorage.setItem(EMPLOYEE_KEY,id);
    let privateResult;
    try {
      privateResult = await postReadOnly({ action:'private_access', ...credential });
    } catch (error) {
      const pending = privateAccessPending(error && error.message);
      const transportFailure = error instanceof ReadTransportError;
      const state = pending ? 'unauthorized' : transportFailure ? 'error' : 'unauthorized';
      const note = pending ? '此 iPhone App 裝置待核准' : transportFailure ? readErrorNote(error) : '正式資料尚未解鎖';
      if(transportFailure) failPrivateSummary(error); else resetPrivateSummary(state,note);
      setPrivateAccessState(pending ? 'pending' : transportFailure ? 'error' : 'unauthorized',pending ? '此 iPhone App 裝置待核准。核准後按「查看核准狀態」。' : String(error.message || error));
      dom('#viewerState').textContent = pending ? '待核准' : transportFailure ? '讀取失敗' : '未登入';
      dom('#privateLogout').hidden = false;
      renderAll();
      throw error;
    }
    const snapshot = privateResult.snapshot || {};
    const readAt = nowIso();
    const awards = adaptAwards(snapshot, String(snapshot.kpiBattle&&snapshot.kpiBattle.report_date||''), readAt);
    const personalPerformance = adaptPersonalPerformance(snapshot, readAt);
    contract = C.validateContract({
      ...contract, version:C.VERSION, generatedAt:readAt, mode:'formal',
      todayOperations:privateLoadingModule('todayOperations','正式回報資料'),
      kpiSummary:privateLoadingModule('kpiSummary','正式 KPI 資料'), kpiStores:privateLoadingModule('kpiStores','正式 KPI 資料'), kpiFullMetrics:privateLoadingModule('kpiFullMetrics','正式 KPI 資料'),
      awardSummary:awards.summary, awardStores:awards.stores, awardTop2Models:awards.top2,
      personalPerformance,
      report1600:privateLoadingModule('report1600','16:00 正式回報'), report2100:privateLoadingModule('report2100','21:00 正式回報'),
      reportFailures:privateLoadingModule('reportFailures','正式個人回報')
    });
    yesterdayFollowUpModule=yesterdayLoadingModule();
    privateAccessStatus = 'approved';
    dom('#viewerState').textContent = privateResult.profile && privateResult.profile.maskedName ? privateResult.profile.maskedName : 'Approved';
    dom('#privateLogout').hidden = false;
    setPrivateAccessState('approved','Approved Device 已確認；各正式唯讀模組正在獨立載入。');
    renderAll();
    loadYesterdayFollowUp(credential);

    const reportRows={16:null,21:null};
    const failureRows={};
    const updateOperations=()=>{
      const segments=[reportRows[16],reportRows[21]].filter(Boolean);
      const pending=[contract.report1600,contract.report2100].some(module=>module.status==='stale');
      const failed=[contract.report1600,contract.report2100].some(module=>module.status==='error');
      const status=segments.length?(pending||failed?'partial':'ok'):(pending?'stale':'error');
      contract.todayOperations=C.moduleState({status,updatedAt:nowIso(),sourceUpdatedAt:segments.map(row=>row.updatedAt).filter(Boolean).at(-1)||'',stale:false,source:moduleSource('北一二B每日回報','index.html'),data:segments.length?{date:taipeiDate(),segments}:null,note:pending?'正式回報資料讀取中':failed?'部分正式回報讀取失敗':''});
      const failureValues=Object.values(failureRows);
      contract.reportFailures=C.moduleState({status:pending?'stale':failureValues.some(row=>row.unavailable)?'partial':failureValues.length?'ok':'error',updatedAt:nowIso(),sourceUpdatedAt:'',stale:false,source:moduleSource('正式個人回報','index.html'),data:failureValues.length?failureRows:null,note:failureValues.some(row=>row.unavailable)?'部分個人回報讀取失敗':pending?'正式個人回報讀取中':''});
      contract.generatedAt=nowIso();
      renderAll();
    };

    const kpiTask=postReadOnly({action:'kpicalc_access',...credential}).then(result=>{
      const kpi=adaptKpi(result.data||{},snapshot,nowIso());
      contract.kpiSummary=kpi.summary; contract.kpiStores=kpi.stores; contract.kpiFullMetrics=kpi.full;
      contract.generatedAt=nowIso(); renderAll();
    }).catch(error=>{
      const note=readErrorNote(error,'正式 KPI');
      contract.kpiSummary=privateFailureModule('kpiSummary',error,'正式 KPI'); contract.kpiStores=privateFailureModule('kpiStores',error,'正式 KPI'); contract.kpiFullMetrics=privateFailureModule('kpiFullMetrics',error,'正式 KPI');
      contract.generatedAt=nowIso(); renderAll();
    });

    const reportTask=async segment=>{
      const key=segment===16?'report1600':'report2100';
      try{
        const [reportResult,peopleResult]=await Promise.allSettled([
          postReadOnly({action:'read',date:taipeiDate(),seg:segment,...credential}),
          postReadOnly({action:'pread',date:taipeiDate(),seg:segment,...credential})
        ]);
        if(reportResult.status==='rejected') throw reportResult.reason;
        const report=adaptReport(segment,reportResult.value.data,peopleResult.status==='fulfilled'?peopleResult.value.data:{},reportResult.value.summary);
        reportRows[segment]=report;
        contract[key]=C.moduleState({status:report.completedStores===0?'no_data':report.completedStores===9&&report.summaryAvailable?'ok':'partial',updatedAt:nowIso(),sourceUpdatedAt:report.updatedAt,stale:false,source:moduleSource('北一二B每日回報','index.html'),data:report,note:!report.summaryAvailable?'正式來源尚未提供 report summary adapter；營運摘要 fail-closed。':report.completedStores===0?`尚未進入／尚無正式 ${segment}:00 回報`:''});
        failureRows[segment]=peopleResult.status==='fulfilled'?failureSummary(report):{unavailable:true,failedStoreCount:null,failedPeopleCount:null,missingStores:report.missingStores,byMetric:null,people:null};
      }catch(error){
        reportRows[segment]=null;
        contract[key]=privateFailureModule(key,error,`${segment}:00 正式回報`);
        failureRows[segment]={unavailable:true,failedStoreCount:null,failedPeopleCount:null,missingStores:[],byMetric:null,people:null};
      }
      updateOperations();
    };
    await Promise.allSettled([kpiTask,reportTask(16),reportTask(21)]);
    setPrivateAccessState('approved','已由既有 Approved Device 完成正式唯讀模組載入。');
  }

  async function loadYesterdayFollowUp(credential) {
    const date=taipeiDateOffset(-1);
    try {
      const [reportResult,peopleResult]=await Promise.all([
        postReadOnly({action:'read',date,seg:21,...credential}),
        postReadOnly({action:'pread',date,seg:21,...credential})
      ]);
      const report=adaptReport(21,reportResult.data,peopleResult.data,reportResult.summary);
      const data=Y.adapt({date,report});
      yesterdayFollowUpModule=C.moduleState({
        status:data.formalDataAvailable?'ok':'no_data',updatedAt:nowIso(),sourceUpdatedAt:report.updatedAt,stale:false,
        source:moduleSource('昨日 21:00 正式每日回報','index.html'),data,
        note:data.formalDataAvailable?'':'昨日 21:00 尚無正式資料'
      });
    } catch(error) {
      yesterdayFollowUpModule=yesterdayFailureModule(error);
    }
    contract.generatedAt=nowIso();
    renderAll();
  }

  async function requestDeviceBinding(employeeId, bootstrapCode) {
    const id = String(employeeId || '').trim();
    const code = String(bootstrapCode || '').trim();
    if (!id || !code) throw new Error('首次申請需要本人輸入既有員工編號與啟用碼。');
    scope.localStorage.setItem(EMPLOYEE_KEY,id);
    const result = await postDeviceAccess({ action:'private_request', employeeId:id, bootstrapCode:code, deviceId:deviceId() });
    const status = String(result.requestStatus || 'pending');
    setPrivateAccessState(status === 'approved' ? 'approved' : 'pending',status === 'approved' ? '此 iPhone App 裝置已核准，正在讀取正式資料。' : '此 iPhone App 裝置待核准。明早核准後按「查看核准狀態」。');
    dom('#viewerState').textContent = status === 'approved' ? 'Approved' : '待核准';
    dom('#privateLogout').hidden = false;
    if (status === 'approved') await loadFormalSummary(id);
  }

  async function checkDeviceBinding(employeeId) {
    const id = String(employeeId || '').trim();
    if (!id) throw new Error('請先輸入既有員工編號。');
    scope.localStorage.setItem(EMPLOYEE_KEY,id);
    const result = await postDeviceAccess({ action:'private_request_status', employeeId:id, deviceId:deviceId() });
    const status = String(result.requestStatus || 'none');
    if (status === 'approved') {
      setPrivateAccessState('approved','裝置已核准，正在重新讀取 KPI／台獎／回報。');
      await loadFormalSummary(id);
      return;
    }
    if (status === 'pending') {
      setPrivateAccessState('pending','此 iPhone App 裝置待核准。');
      dom('#viewerState').textContent = '待核准';
      renderAll();
      return;
    }
    setPrivateAccessState('unauthorized','尚無此 iPhone App 裝置申請，請展開「首次使用這台 iPhone App」。');
    renderAll();
  }

  function logoutPrivateSummary() {
    scope.localStorage.removeItem(EMPLOYEE_KEY);
    resetPrivateSummary();
    setPrivateAccessState('unauthorized','已登出正式摘要；Native Device ID 保留供既有 Approved Device 驗證。');
    dom('#employeeId').value = '';
    dom('#viewerState').textContent = '未登入';
    dom('#privateLogout').hidden = true;
    renderAll();
  }

  function setMessage(selector, message, state = '') {
    const node = dom(selector);
    node.textContent = message;
    node.className = `form-message ${state}`.trim();
  }

  function fmtPct(value) { return value == null ? '—' : `${(Number(value) * 100).toFixed(1)}%`; }
  function fmtSignedPct(value) { if (value == null) return '—'; const n=Number(value)*100; return `${n>0?'+':''}${n.toFixed(1)}pp`; }
  function fmtSigned(value) { if (value == null) return '—'; const n=Number(value); return n===0?'0':`${n>0?'↑':'↓'}${Math.abs(n)}`; }
  function fmtNumber(value, digits=2) { if (value == null) return '—'; return Number(value).toLocaleString('zh-TW',{maximumFractionDigits:digits}); }
  function valueClass(value) { if (value == null || Number(value)===0) return 'neutral-value'; return Number(value)>0?'positive':'negative'; }
  function privateUnlockState(message = '解鎖後顯示正式資料') {
    return `<div class="unlock-state"><span>${escapeHtml(message)}</span><button class="unlock-cta" type="button" data-unlock-private>解鎖正式資料</button></div>`;
  }
  function patrolUnlockState(message = '解鎖後顯示班表／巡店') {
    return `<div class="unlock-state"><span>${escapeHtml(message)}</span><button class="unlock-cta" type="button" data-unlock-patrol>班表／巡店解鎖</button></div>`;
  }
  function staleBanner(module) {
    return module&&module.status==='stale'?`<p class="stale-note">${escapeHtml(module.note||'上次成功資料')}</p>`:'';
  }

  function renderFullKpis(items, contextLabel) {
    const rows = Array.isArray(items) ? items : [];
    if (!rows.length) return `<section class="panel full-kpi-panel"><div class="panel-head"><div><h2>完整 KPI</h2><small>${escapeHtml(contextLabel)}</small></div></div><div class="empty-state">正式來源尚未提供完整 KPI 欄位。</div></section>`;
    const groups = new Map();
    rows.forEach(item => {
      const category = String(item.category || '其他 KPI');
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(item);
    });
    return `<section class="panel full-kpi-panel"><div class="panel-head"><div><h2>完整 KPI</h2><small>${escapeHtml(contextLabel)} · ${rows.length} 項</small></div></div><div class="full-kpi-groups">${[...groups.entries()].map(([category,metrics])=>`<section class="kpi-category"><h3>${escapeHtml(category)}</h3><div class="full-kpi-grid">${metrics.map(metric=>`<article class="full-kpi-item"><span>${escapeHtml(metric.label||metric.key)}</span><b class="${metric.rate!=null&&metric.rate<1?'negative':'positive'}">${fmtPct(metric.rate)}</b></article>`).join('')}</div></section>`).join('')}</div></section>`;
  }

  function awardItemStatusText(value) {
    const normalized=String(value == null?'':value).trim();
    if (!normalized) return '';
    if (/^(Y|TRUE)$/i.test(normalized)) return '領獎';
    if (/^(N|FALSE)$/i.test(normalized)) return '未領獎';
    return normalized;
  }

  function renderAwardStoreItems(row) {
    const items=Array.isArray(row&&row.items)?row.items:[];
    if (!items.length) return `<section class="panel award-store-items"><div class="panel-head"><div><h2>指定機款</h2><small>${escapeHtml(row&&row.name||'—')}</small></div></div><div class="empty-state">正式來源未提供此店指定機款。</div></section>`;
    return `<section class="panel award-store-items"><div class="panel-head"><div><h2>指定機款</h2><small>${escapeHtml(row.name)} · ${items.length} 款</small></div></div><div class="award-store-item-list">${items.map(item=>{
      const status=awardItemStatusText(item.status);
      const metrics=[
        item.rate==null?null:['達成率',fmtPct(item.rate)], item.actual==null?null:['實際',fmtNumber(item.actual)],
        item.target==null?null:['目標',fmtNumber(item.target)], item.thresholdTarget==null?null:['50% 目標',fmtNumber(item.thresholdTarget)],
        item.difference==null?null:['50% 差異',`${item.difference>0?'+':''}${fmtNumber(item.difference)}`],
        item.reward50==null?null:['50% 獎金',`$${fmtNumber(item.reward50,0)}`], item.reward100==null?null:['100% 獎金',`$${fmtNumber(item.reward100,0)}`]
      ].filter(Boolean);
      return `<article class="award-store-item"><div class="award-store-item-head"><strong>${escapeHtml(item.name)}</strong>${status?`<span class="award-store-item-status ${/未領獎/i.test(status)?'no':''}">${escapeHtml(status)}</span>`:''}</div>${metrics.length?`<div class="award-store-item-metrics">${metrics.map(([label,value])=>`<span><small>${label}</small><b>${escapeHtml(value)}</b></span>`).join('')}</div>`:''}</article>`;
    }).join('')}</div></section>`;
  }

  function setView(name) {
    all('[data-view]').forEach(view => { view.hidden = view.dataset.view !== name; });
    all('[data-nav]').forEach(button => {
      const active = button.dataset.nav === name;
      button.classList.toggle('active',active);
      button.setAttribute('aria-current',active?'page':'false');
    });
    history.replaceState(null,'',`#${name}`);
    scope.scrollTo({top:0,behavior:'auto'});
    refreshIcons();
  }

  function renderHeader() {
    const operations = contract.todayOperations.data || {};
    dom('#appDate').textContent = operations.date || taipeiDate();
    dom('#appUpdatedAt').textContent = `updatedAt ${formatTime(contract.generatedAt,'—')}`;
    const mode = dom('#dataMode');
    mode.className = `mode-pill${contract.mode === 'preview' ? ' preview' : privateAccessStatus === 'approved' ? ' safe' : privateAccessStatus === 'pending' ? ' pending' : ' locked'}`;
    mode.textContent = contract.mode === 'preview' ? 'Preview／示意資料' : privateAccessStatus === 'approved' ? '正式唯讀' : privateAccessStatus === 'pending' ? '裝置待核准' : privateAccessStatus === 'error' ? '正式資料讀取失敗' : '解鎖正式資料';
    dom('#previewBanner').hidden = contract.mode !== 'preview';
    document.body.classList.toggle('preview-mode',contract.mode === 'preview');
  }

  function renderOperations() {
    const rows = contract.todayOperations.data && contract.todayOperations.data.segments || [];
    dom('#operationsRows').innerHTML = rows.length ? staleBanner(contract.todayOperations)+rows.map(segment => {
      const failures = contract.reportFailures.data && contract.reportFailures.data[segment.segment] || {};
      const missing = segment.missingStores ? segment.missingStores.length : Math.max(0,9-segment.completedStores);
      const summaryMetrics = segment.summaryMetrics || {};
      const failingPeople = failures.people || [];
      return `<article class="operation-item"><div class="operation-row">
        <span class="operation-time">${escapeHtml(segment.segment)}:00</span>
        <span class="operation-metric"><span>已回報</span><b class="${segment.completedStores===9?'good':'warn'}">${segment.completedStores}/9</b></span>
        <span class="operation-metric"><span>缺店</span><b class="${missing?'warn':'good'}">${missing}</b></span>
        <span class="operation-metric"><span>未過店</span><b class="${failures.unavailable?'warn':failures.failedStoreCount?'bad':'good'}">${failures.unavailable?'—':failures.failedStoreCount || 0}</b></span>
        <span class="operation-metric"><span>未過人</span><b class="${failures.unavailable?'warn':failures.failedPeopleCount?'bad':'good'}">${failures.unavailable?'—':failures.failedPeopleCount || 0}</b></span>
        <button class="attention-button" type="button" data-toggle-operation="${segment.segment}" aria-label="展開 ${segment.segment}:00 戰況"><i data-lucide="triangle-alert"></i></button>
      </div><div class="operation-detail"><div class="operation-detail-summary">${['A999','好速','R999','R1399'].filter(key=>summaryMetrics[key]).map(key=>`<span>${key} ${formatOperationMetric(summaryMetrics[key])}</span>`).join('') || '<span>正式營運摘要尚無資料</span>'}</div>
        <div class="operation-detail-summary operation-detail-percent">${['保險搭售率','設備案佔比'].filter(key=>summaryMetrics[key]).map(key=>`<span>${key==='保險搭售率'?'保險':'設備案'} ${formatOperationMetric(summaryMetrics[key])}</span>`).join('')}</div>
        <p>${segment.missingStores.length?`未回報：${segment.missingStores.map(escapeHtml).join('、')}`:'九店已完成回報'}${failingPeople.length?`｜未過關：${failingPeople.slice(0,3).map(person=>`${escapeHtml(person.store)} ${escapeHtml(person.name)}（${escapeHtml(person.failed.join('、'))}）`).join('、')}`:'｜目前無正式未過關紀錄'}</p>
        <div>${segment.stores.filter(store=>store.reported).map(store=>`<div class="operation-store-mini"><span>${escapeHtml(store.name)}</span>${['A999','好速','R999','R1399'].map(key=>`<span>${store.metrics&&store.metrics[key]!=null?fmtNumber(store.metrics[key],1):'—'}</span>`).join('')}</div>`).join('')}</div>
      </div></article>`;
    }).join('') : contract.todayOperations.status==='unauthorized'
      ? privateUnlockState(privateAccessStatus === 'pending' ? '此 iPhone App 裝置待核准' : '正式回報摘要尚未解鎖')
      : `<div class="empty-state">${escapeHtml(contract.todayOperations.note||'正式回報讀取失敗')}</div>`;
  }

  const YESTERDAY_FEEDBACK_LABELS = [
    ['reason','零報原因'],['consult','請益對象'],['method','改善做法'],['plan','明日計畫／後續追蹤']
  ];

  function renderYesterdayFeedback(feedback) {
    const entries=YESTERDAY_FEEDBACK_LABELS
      .map(([key,label])=>({label,value:String(feedback&&feedback[key]||'')}))
      .filter(entry=>entry.value);
    return entries.length?`<div class="yesterday-feedback">${entries.map(entry=>`<div><b>${escapeHtml(entry.label)}</b><p>${escapeHtml(entry.value)}</p></div>`).join('')}</div>`:'';
  }

  function renderYesterdayFollowUp() {
    const module=yesterdayFollowUpModule;
    const data=module&&module.data;
    const home=dom('#yesterdayFollowUpHome');
    const detail=dom('#yesterdayFollowUp');
    if(!data||!data.formalDataAvailable) {
      if(home) home.hidden=true;
      if(detail) detail.innerHTML=`<div class="empty-state">${escapeHtml(data&&!data.formalDataAvailable?'昨日 21:00 尚無正式資料':module&&module.note||'昨日 21:00 正式資料讀取中')}</div>`;
      return;
    }
    if(home) {
      home.hidden=false;
      home.innerHTML=`<button type="button" data-open-yesterday-followup><span><small>${escapeHtml(data.date)} · 21:00</small><b>昨日待追蹤</b></span><strong class="${data.trackingStoreCount?'negative':'positive'}">${data.trackingStoreCount} 店</strong><i data-lucide="chevron-right"></i></button>`;
    }
    if(!detail) return;
    detail.innerHTML=`${staleBanner(module)}<div class="yesterday-summary">
      <article><span>未過關店數</span><b>${data.failedStoreCount}</b></article>
      <article><span>未過關人數</span><b>${data.failedPeopleCount}</b></article>
      <article><span>有請益店數</span><b>${data.consultStoreCount}</b></article>
      <article><span>需要追蹤店數</span><b>${data.trackingStoreCount}</b></article>
    </div>${data.stores.length?`<div class="yesterday-store-list">${data.stores.map(store=>`<article class="yesterday-store-card"><h3>${escapeHtml(store.name)}</h3>${store.failedMetrics.length?`<p><b>未過關項目</b>${escapeHtml(store.failedMetrics.join('、'))}</p>`:''}${store.failedPeople.map(person=>`<div class="yesterday-person"><p><b>${escapeHtml(person.name)}</b>${escapeHtml(person.failed.join('、')||'正式未過關')}</p>${person.reason?`<p><b>未過原因</b>${escapeHtml(person.reason)}</p>`:''}${person.improvePlan?`<p><b>個人後續追蹤</b>${escapeHtml(person.improvePlan)}</p>`:''}</div>`).join('')}${renderYesterdayFeedback(store.storeFeedback)}</article>`).join('')}</div>`:'<div class="empty-state">昨日 21:00 無需追蹤店點。</div>'}`;
  }

  function renderKpiHero() {
    if (!contract.kpiSummary.data) {
      const message=contract.kpiSummary.status==='unauthorized'?(privateAccessStatus === 'pending' ? '此 iPhone App 裝置待核准' : 'KPI／台獎／回報尚未解鎖'):(contract.kpiSummary.note||'正式 KPI 讀取失敗');
      dom('#kpiHero').innerHTML = contract.kpiSummary.status==='unauthorized'?privateUnlockState(message):`<div class="empty-state">${escapeHtml(message)}</div>`;
      return;
    }
    const data = contract.kpiSummary.data || {};
    dom('#kpiHero').innerHTML = `${staleBanner(contract.kpiSummary)}<div class="kpi-stat"><span>KPI</span><strong class="cyan-value">${fmtPct(data.kpi)}</strong><div class="mini-progress"><i style="width:${Math.min(100,Math.max(0,Number(data.kpi||0)*100))}%"></i></div></div>
      <div class="kpi-stat"><span>公司排名</span><strong class="gold-value">${data.companyRank == null?'—':escapeHtml(data.companyRank)}</strong><small>/ ${data.companyRankTotal || '—'}</small></div>
      <div class="kpi-stat"><span>KPI DOD</span><strong class="${valueClass(data.kpiDod)}">${fmtSignedPct(data.kpiDod)}</strong></div>
      <div class="kpi-stat"><span>排名變動</span><strong class="${valueClass(data.rankChange)}">${fmtSigned(data.rankChange)}</strong></div>
      <div class="kpi-stat"><span>加減分</span><strong class="gold-value">${fmtNumber(data.addonScore)}</strong></div>`;
  }

  function storeRow(row,index) {
    const warn = row.kpi != null && row.kpi < 1;
    const core = row.core || {};
    return `<article class="store-item${index===0?' expanded':''}"><button class="store-row" type="button" aria-expanded="${index===0?'true':'false'}">
      <span class="store-row-line store-row-primary"><span class="store-name">${warn?`<i data-lucide="${row.kpi<.8?'triangle-alert':'circle-alert'}" class="store-alert ${row.kpi<.8?'critical':''}"></i>`:`<span class="store-rank">${index+1}</span>`}${escapeHtml(row.name)}</span>
      <span class="store-metric store-kpi ${row.kpi<.8?'negative':''}"><small>KPI</small><b>${fmtPct(row.kpi)}</b></span><span class="store-metric store-company"><small>公司排名</small><b>${row.rank??'—'}</b></span></span>
      <span class="store-row-line store-row-secondary"><span class="store-metric store-dod ${valueClass(row.kpiDod)}"><small>KPI DOD</small><b>${fmtSignedPct(row.kpiDod)}</b></span><span class="store-metric store-rank-change ${valueClass(row.rankChange)}"><small>排名變動</small><b>${fmtSigned(row.rankChange)}</b></span>
      <span class="store-metric store-addon ${valueClass(row.addon)}"><small>加減分</small><b>${fmtNumber(row.addon)}</b></span></span><i data-lucide="chevron-down" class="row-chevron"></i>
    </button><div class="store-detail"><div class="core-grid">${['A999','A1399','好速','R999','R1399','RT'].map(key => `<div class="core-cell"><span>${key}</span><b class="${core[key]!=null&&core[key]<1?'negative':''}">${fmtPct(core[key])}</b></div>`).join('')}</div><a class="detail-link" href="index.html">查看完整 KPI <i data-lucide="arrow-right"></i></a></div></article>`;
  }

  function renderStores() {
    const rows = Array.isArray(contract.kpiStores.data) ? contract.kpiStores.data.slice().sort((a,b)=>(b.kpi??-1)-(a.kpi??-1)) : [];
    dom('#kpiStoreUpdated').textContent = `更新 ${formatTime(contract.kpiStores.sourceUpdatedAt)}`;
    dom('#homeStoreList').innerHTML = rows.length ? staleBanner(contract.kpiStores)+rows.map(storeRow).join('') : contract.kpiStores.status === 'unauthorized' ? privateUnlockState('Approved Device 核准後顯示九店摘要') : `<div class="empty-state">${escapeHtml(contract.kpiStores.status==='error'?(contract.kpiStores.note||'正式 KPI 讀取失敗'):'正式來源目前沒有九店摘要。')}</div>`;
  }

  function renderAwardsHome() {
    if (!contract.awardSummary.data) {
      dom('#awardHome').innerHTML = `<h2 id="awardHomeTitle" class="sr-only">台獎總覽</h2>${contract.awardSummary.status==='unauthorized'?privateUnlockState('台獎九店摘要尚未解鎖'):`<div class="empty-state">${escapeHtml(contract.awardSummary.note||'正式台獎讀取失敗')}</div>`}`;
      return;
    }
    const summary = contract.awardSummary.data || {};
    const stores = Array.isArray(contract.awardStores.data) ? contract.awardStores.data : [];
    const losingStores=summary.winningStores==null?'—':Math.max(0,Number(summary.totalStores||9)-Number(summary.winningStores));
    dom('#awardHome').innerHTML = `${staleBanner(contract.awardSummary)}<div class="award-summary"><h2 id="awardHomeTitle">台獎總覽</h2><span>領獎店數 <b>${summary.winningStores??'—'}<small> / 9</small></b></span><span>未領獎店數 <b>${losingStores}</b></span></div>
      <div class="award-list"><div class="award-row header"><span>店名</span><span>獎勵金額</span><span>狀態</span></div>${stores.map(row=>`<div class="award-row"><span>${escapeHtml(row.name)}</span><span class="award-amount">${row.amount==null?'—':'$'+fmtNumber(row.amount,0)}</span><span><i class="award-tag ${row.eligible?'':'no'}">${row.eligible?'領獎':'未領獎'}</i></span></div>`).join('')}</div>
      <a class="award-link" href="#battle" data-open-awards>查看完整台獎摘要 <i data-lucide="arrow-right"></i></a>`;
  }

  function renderScheduleHome() {
    const data = contract.scheduleToday.data;
    const node = dom('#scheduleHome');
    if (!data || !Array.isArray(data.stores) || !data.stores.length) {
      const message=contract.scheduleToday.status==='unauthorized'?'班表／巡店尚未解鎖':contract.scheduleToday.status==='error'?(contract.scheduleToday.note||'正式班表讀取失敗'):'目前尚無班表摘要';
      node.innerHTML = `<div class="home-schedule-head"><span class="compact-icon"><i data-lucide="calendar-days"></i></span><div class="compact-copy"><h2 id="scheduleHomeTitle">今日班表</h2><p>${escapeHtml(message)}</p></div><span class="compact-next"><b>${formatDate(taipeiDate())}</b><small>${contract.scheduleToday.note||'唯讀'}</small></span></div>${contract.scheduleToday.status==='unauthorized'?patrolUnlockState('使用既有 30 分鐘短效授權'):''}`;
      return;
    }
    const working = data.stores.reduce((sum,row)=>sum+Number(row.working||0),0);
    const off = data.stores.reduce((sum,row)=>sum+Number(row.off||0),0);
    const rows = data.stores.map(row => {
      const shifts = [...new Set((row.staff||[]).map(person=>person.status).filter(Boolean))];
      return `<div class="home-schedule-row"><span><b>${escapeHtml(row.store)}</b><small>${escapeHtml(shifts.join(' · ')||'尚無班別')}</small></span><span class="positive">上班 ${row.working}</span><span>休假 ${row.off}</span></div>`;
    }).join('');
    node.innerHTML = `${contract.scheduleToday.status==='stale'?`<p class="stale-note">${escapeHtml(contract.scheduleToday.note)}</p>`:''}<div class="home-schedule-head"><span class="compact-icon"><i data-lucide="calendar-days"></i></span><div class="compact-copy"><h2 id="scheduleHomeTitle">今日班表</h2><p>${data.stores.length} 店 · 上班 ${working} 人 · 休假 ${off} 人</p></div><span class="compact-next"><b>${formatDate(data.date)}</b><small>更新 ${formatTime(contract.scheduleToday.sourceUpdatedAt)}</small></span></div><div class="home-schedule-list">${rows}</div><button class="home-schedule-toggle" type="button" data-toggle-home-schedule aria-expanded="false"><span>顯示九店當日班表</span><i data-lucide="chevron-down"></i></button>`;
  }

  function renderPatrolHome() {
    const data = contract.patrolToday.data;
    const node = dom('#patrolHome');
    if (!data || !Array.isArray(data.route) || !data.route.length) {
      const message=contract.patrolToday.status==='error'?(contract.patrolToday.note||'正式巡店讀取失敗'):(contract.patrolToday.note || '今日無排定巡店');
      node.innerHTML = `<span class="compact-icon"><i data-lucide="route"></i></span><div class="compact-copy"><h2 id="patrolHomeTitle">今日巡店</h2><p>${escapeHtml(message)}</p></div><span class="compact-next"><b>${contract.patrolToday.status==='unauthorized'?'需解鎖':contract.patrolToday.status==='error'?'讀取失敗':'今日無排定'}</b><small>不自行推測路線</small></span>${contract.patrolToday.status==='unauthorized'?patrolUnlockState('使用既有 30 分鐘短效授權'):''}`;
      return;
    }
    node.innerHTML = `<span class="compact-icon"><i data-lucide="route"></i></span><div class="compact-copy"><h2 id="patrolHomeTitle">今日巡店</h2><p>${data.route.map(escapeHtml).join(' → ')}</p></div><span class="compact-next"><b>下一站：${escapeHtml(data.nextStop||'—')}</b><small>${data.nextEta?`預計 ${escapeHtml(data.nextEta)} 到達`:''}</small></span>`;
  }

  function formatOperationMetric(metric) {
    if (!metric || metric.value == null) return '—';
    return metric.unit === 'percent' ? `${fmtNumber(metric.value,1)}%` : fmtNumber(metric.value,metric.unit === 'points' ? 2 : 1);
  }

  function personalMetricTone(rate) { return rate == null ? '' : rate < 1 ? 'negative' : 'positive'; }

  function personalPriorityMetrics(person) {
    const core = ['A999','A1399','好速','R999','R1399','RT'];
    const metrics = (person.metrics || []).filter(metric => core.includes(metric.key));
    return [...metrics.filter(metric => metric.rate != null && metric.rate < 1), ...metrics.filter(metric => metric.rate == null || metric.rate >= 1)].slice(0,2);
  }

  function personalPerformanceRow(person,options = {}) {
    const priorities = personalPriorityMetrics(person);
    const focusMetric=options.focusMetric?personalMetricByKey(person,options.focusMetric):null;
    return `<article class="personal-performance-item"><button class="personal-performance-button" type="button" aria-expanded="false">
      <span class="personal-primary"><b>${escapeHtml(person.name)}</b><small>${escapeHtml(person.store)} · ${escapeHtml(person.role || person.category)}</small></span>
      <span class="personal-rate ${personalMetricTone(focusMetric?focusMetric.rate:person.totalRate)}"><small>${focusMetric?escapeHtml(options.focusMetric):'總績效'}</small><b>${fmtPct(focusMetric?focusMetric.rate:person.totalRate)}</b></span>
      <span class="personal-priority">${options.regionRanking?`<small>職稱 ${escapeHtml(person.role || person.category)}</small><small>正式排名 ${person.rank??'—'}</small><small class="${valueClass(person.dod)}">DOD ${fmtSignedPct(person.dod)}</small><small class="${valueClass(person.rankChange)}">排名變化 ${fmtSigned(person.rankChange)}</small>`:priorities.map(metric=>`<small class="${personalMetricTone(metric.rate)}">${escapeHtml(metric.key)} ${fmtPct(metric.rate)}</small>`).join('') || '<small>正式來源無主力指標</small>'}</span>
      <i data-lucide="chevron-down"></i>
    </button><div class="personal-performance-detail">
      <div class="personal-performance-stats"><span>排名 <b>${person.rank??'—'}</b></span><span>DOD <b class="${valueClass(person.dod)}">${fmtSignedPct(person.dod)}</b></span><span>排名變化 <b class="${valueClass(person.rankChange)}">${fmtSigned(person.rankChange)}</b></span></div>
      <div class="personal-metric-grid">${(person.metrics||[]).map(metric=>`<article><span>${escapeHtml(metric.key)}</span><b class="${personalMetricTone(metric.rate)}">${fmtPct(metric.rate)}</b><small>${metric.actual==null&&metric.target==null?'正式來源未提供實績／目標':`實績 ${fmtNumber(metric.actual)} / 目標 ${fmtNumber(metric.target)}`}${metric.dod==null?'':` · DOD ${fmtSignedPct(metric.dod)}`}</small></article>`).join('')}</div>
    </div></article>`;
  }

  function managerStorePerformanceRow(row) {
    const store=row.store||{};
    return `<article class="personal-performance-item manager-store-performance"><div class="manager-store-row">
      <span class="personal-primary"><b>${escapeHtml(row.person.name)}</b><small>${escapeHtml(row.person.store)} · 店長</small></span>
      <span class="personal-rate ${personalMetricTone(store.kpi)}"><small>店 KPI</small><b>${fmtPct(store.kpi)}</b></span>
      <span class="personal-priority"><small>公司排名 ${store.rank??'—'}</small><small class="${valueClass(store.kpiDod)}">店 KPI DOD ${fmtSignedPct(store.kpiDod)}</small><small class="${valueClass(store.rankChange)}">店排名變化 ${fmtSigned(store.rankChange)}</small><small class="${row.aqActual!=null&&row.aqActual<10?'negative':''}">AQ ${row.aqActual==null?'—':fmtNumber(row.aqActual)+' 點'}</small><small class="${row.aqGap>0?'negative':''}">缺 ${row.aqGap==null?'—':fmtNumber(row.aqGap)+' 點'}</small></span>
    </div></article>`;
  }

  function renderPersonalRegionControls() {
    const roleOptions=['店長','副店','其他業代'];
    const gapOptions=['A999','好速','R1399'];
    return `<section class="personal-region-controls" aria-label="全區個績檢視"><span>檢視</span><div class="segment-control personal-view-control"><button class="${personalRegionView==='role'?'active':''}" data-personal-view="role" type="button">職稱排名</button><button class="${personalRegionView==='gap'?'active':''}" data-personal-view="gap" type="button">指標未達</button></div>${personalRegionView==='role'?`<label class="personal-filter-field"><span>職稱</span><select id="personalRoleSelect">${roleOptions.map(value=>`<option value="${value}"${value===personalRole?' selected':''}>${value}</option>`).join('')}</select></label>`:`<label class="personal-filter-field"><span>指標未達</span><select id="personalGapMetricSelect">${gapOptions.map(value=>`<option value="${value}"${value===personalGapMetric?' selected':''}>${value}</option>`).join('')}</select></label>`}</section>`;
  }

  function renderPersonalAqAttention(allPeople) {
    const review=personalAqReview(allPeople);
    const rows=review.attention.map(item=>`<div class="personal-aq-row"><span><b>${escapeHtml(item.person.name)}</b><small>${escapeHtml(item.person.store)}</small></span><span>${fmtNumber(item.actual)} 點</span><span class="negative">缺 ${fmtNumber(item.gap)} 點</span></div>`).join('');
    return `<section class="panel personal-aq-panel"><div class="panel-head"><div><h2>AQ 店長關注明細</h2><small>店長 AQ actual 低於 10 點</small></div></div><div class="personal-aq-list">${rows||'<div class="empty-state">目前沒有 AQ 低於 10 點的店長。</div>'}</div>${review.missing.length?`<p class="personal-aq-missing">AQ 正式資料缺少：${review.missing.length} 人；未當作 0 點。</p>`:''}<p class="personal-management-note">店長 AQ 低於 10 點，每少 1 點依管理辦法影響 KPI 達成率 1%。App 只作提示，不重算正式總績效、KPI 或公司排名。</p></section>`;
  }

  function renderPersonalPerformance(selected) {
    const module = contract.personalPerformance;
    const data = module.data || {};
    const summary = data.summary || {};
    const allPeople = Array.isArray(data.people) ? data.people : [];
    if (!allPeople.length) return '<div class="empty-state">正式來源目前沒有個績資料。</div>';
    if(battleScope==='store') {
      const storeView=personalStoreViewRows(allPeople,contract.kpiStores.data,selected);
      const managerCards=storeView.managers.map(managerStorePerformanceRow).join('');
      const staffRows=storeView.staff.map(person=>personalPerformanceRow(person)).join('');
      return `<div class="award-selected-store"><span>店點個績</span><strong>${escapeHtml(selected)}</strong></div><section class="panel personal-performance-panel manager-store-panel"><div class="panel-head"><div><h2>店長管理資訊</h2><small>店績來自正式 kpiStores · AQ 來自個人 AQ actual</small></div></div><div class="personal-performance-list">${managerCards || '<div class="empty-state">此店正式來源目前沒有店長管理資料。</div>'}</div></section><section class="panel personal-performance-panel"><div class="panel-head"><div><h2>店點人員</h2><small>${storeView.staff.length} 人 · 副店／其他業代正式個績</small></div></div><div class="personal-performance-list">${staffRows || '<div class="empty-state">此店正式來源目前沒有副店／業代個績。</div>'}</div></section><p class="personal-source-note">${escapeHtml(module.note || '')}</p><a class="source-button" href="index.html">開啟正式個績網站 <i data-lucide="external-link"></i></a>`;
    }
    const aqReview=personalAqReview(allPeople);
    const summaryCards = `<div class="metric-card-grid personal-summary-grid">
      <article class="metric-card"><span>總人數</span><strong>${summary.total??'—'}</strong><small>正式個績快照</small></article>
      <article class="metric-card"><span>達標人數</span><strong class="positive">${summary.achieved??'—'}</strong><small>正式總達成率 ≥100%</small></article>
      <article class="metric-card"><span>未達標人數</span><strong class="negative">${summary.underTarget??'—'}</strong><small>正式總達成率 &lt;100%</small></article>
      <article class="metric-card"><span>AQ需關注店長</span><strong class="${aqReview.attention.length?'negative':'positive'}">${aqReview.attention.length}</strong><small>AQ 點數 &lt; 10</small></article>
    </div>`;
    let people=[]; let managerRows=null; let heading=''; let note=''; let empty=''; let rowOptions={regionRanking:true};
    if(personalRegionView==='role') {
      if(personalRole==='店長') {
        managerRows=managerStorePerformanceRows(allPeople,contract.kpiStores.data); heading='店長店績'; note=`${managerRows.length} 人 · 依店公司排名由前至後`; empty='目前沒有可對應的店長／店績資料。';
      } else {
        people=personalRankedByRole(allPeople,personalRole); heading=`${personalRole}正式排名`; note=`${people.length} 人 · 正式排名由前至後`; empty=`目前沒有${personalRole}正式個績。`;
      }
    } else {
      const result=personalUnderTargetByMetric(allPeople,personalGapMetric); people=result.rows; heading=`${personalGapMetric} 未達`; note=`${people.length} 人 · 達成率由高到低`; empty=`非店長同仁 ${personalGapMetric} 全數達標`; rowOptions={focusMetric:personalGapMetric};
      if(result.missing.length) note+=` · ${result.missing.length} 人無正式資料（未列入）`;
    }
    const rows=managerRows?managerRows.map(managerStorePerformanceRow).join(''):people.map(person=>personalPerformanceRow(person,rowOptions)).join('');
    return `${summaryCards}${renderPersonalAqAttention(allPeople)}${renderPersonalRegionControls()}<section class="panel personal-performance-panel"><div class="panel-head"><div><h2>${escapeHtml(heading)}</h2><small>${escapeHtml(note)}</small></div></div><div class="personal-performance-list">${rows || `<div class="empty-state">${escapeHtml(empty)}</div>`}</div></section><p class="personal-source-note">${escapeHtml(module.note || '')}</p><a class="source-button" href="index.html">開啟正式個績網站 <i data-lucide="external-link"></i></a>`;
  }

  function renderBattle() {
    const content = dom('#battleContent');
    if (contract.kpiSummary.status === 'unauthorized') {
      content.innerHTML = privateUnlockState(privateAccessStatus === 'pending' ? '此 iPhone App 裝置待核准' : '解鎖後顯示 KPI／台獎正式摘要');
      return;
    }
    if (battleKind === 'kpi' && !contract.kpiSummary.data) {
      content.innerHTML=`<div class="empty-state">${escapeHtml(contract.kpiSummary.note||'正式 KPI 讀取失敗')}</div>`;
      return;
    }
    if (battleKind === 'award' && !contract.awardSummary.data) {
      content.innerHTML=`<div class="empty-state">${escapeHtml(contract.awardSummary.note||'正式台獎讀取失敗')}</div>`;
      return;
    }
    if (battleKind === 'personal' && !contract.personalPerformance.data) {
      content.innerHTML=`<div class="empty-state">${escapeHtml(contract.personalPerformance.note||'正式個績讀取失敗')}</div>`;
      return;
    }
    const stores = Array.isArray(contract.kpiStores.data)?contract.kpiStores.data:[];
    const awardStores = Array.isArray(contract.awardStores.data)?contract.awardStores.data:[];
    const select = dom('#battleStoreSelect');
    dom('.scope-control').classList.toggle('personal-scope-control',battleKind==='personal');
    if (!select.options.length) select.innerHTML = STORES.map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    dom('#battleStorePicker').hidden = battleScope !== 'store';
    const selected = select.value || STORES[0];
    if (battleKind === 'kpi' && battleScope === 'region') {
      const k = contract.kpiSummary.data||{};
      content.innerHTML = `<div class="metric-card-grid">${[
        ['KPI 達成率',fmtPct(k.kpi),'cyan-value'],['公司排名',k.companyRank??'—','gold-value'],['KPI DOD',fmtSignedPct(k.kpiDod),valueClass(k.kpiDod)],['排名變化',fmtSigned(k.rankChange),valueClass(k.rankChange)],['加減分',fmtNumber(k.addonScore),'gold-value'],['九店比較',`${stores.filter(row=>row.kpi>=1).length}/9 達標`,'']
      ].map(([label,value,cls])=>`<article class="metric-card"><span>${label}</span><strong class="${cls}">${value}</strong><small>更新 ${formatTime(contract.kpiSummary.sourceUpdatedAt)}</small></article>`).join('')}</div><div class="battle-list"><div class="battle-list-row header"><span>店點</span><span>KPI</span><span>排名</span><span>DOD</span><span>加減分</span></div>${stores.slice().sort((a,b)=>(b.kpi??-1)-(a.kpi??-1)).map(row=>`<div class="battle-list-row"><span>${escapeHtml(row.name)}</span><span>${fmtPct(row.kpi)}</span><span>${row.rank??'—'}</span><span class="${valueClass(row.kpiDod)}">${fmtSignedPct(row.kpiDod)}</span><span>${fmtNumber(row.addon)}</span></div>`).join('')}</div>${renderFullKpis(k.fullKpis,'北一二B')}<a class="source-button" href="index.html">開啟正式 KPI 網站 <i data-lucide="external-link"></i></a>`;
    } else if (battleKind === 'kpi') {
      const row=stores.find(item=>item.name===selected);
      content.innerHTML = row ? `<div class="metric-card-grid"><article class="metric-card"><span>店 KPI</span><strong class="cyan-value">${fmtPct(row.kpi)}</strong><small>${escapeHtml(row.name)}</small></article><article class="metric-card"><span>公司排名</span><strong class="gold-value">${row.rank??'—'}</strong><small>${fmtSigned(row.rankChange)}</small></article><article class="metric-card"><span>KPI DOD</span><strong class="${valueClass(row.kpiDod)}">${fmtSignedPct(row.kpiDod)}</strong><small>正式快照</small></article><article class="metric-card"><span>加減分</span><strong>${fmtNumber(row.addon)}</strong><small>正式快照</small></article></div><section class="panel"><div class="panel-head"><div><h2>六項主要 KPI</h2><small>${escapeHtml(row.name)}</small></div></div><div class="core-grid">${Object.entries(row.core||{}).map(([key,value])=>`<div class="core-cell"><span>${key}</span><b class="${value!=null&&value<1?'negative':''}">${fmtPct(value)}</b></div>`).join('')}</div></section>${renderFullKpis(row.fullKpis,row.name)}<a class="source-button" href="index.html">開啟正式 KPI 網站 <i data-lucide="external-link"></i></a>` : '<div class="empty-state">尚無此店 KPI 摘要。</div>';
    } else if (battleKind === 'award' && battleScope === 'region') {
      const a=contract.awardSummary.data||{};
      const areaEligibility=a.areaEligible===true?'領獎':a.areaEligible===false?'未領獎':'尚未同步';
      const areaEligibilityClass=a.areaEligible===true?'positive':a.areaEligible===false?'neutral-value':'gold-value';
      content.innerHTML=`<section class="panel award-area-summary"><div class="panel-head"><div><h2>督導區台獎摘要</h2></div></div><div class="metric-card-grid"><article class="metric-card"><span>督導區實際獎金</span><strong class="gold-value">${a.areaActualAward==null?'—':'$'+fmtNumber(a.areaActualAward,0)}</strong><small>正式區域級欄位</small></article><article class="metric-card"><span>公司排名</span><strong>${a.areaCompanyRank==null?'—':fmtNumber(a.areaCompanyRank,0)}</strong><small>正式區域級欄位</small></article><article class="metric-card"><span>領獎資格</span><strong class="${areaEligibilityClass}">${areaEligibility}</strong><small>正式台獎判定</small></article></div></section><div class="metric-card-grid"><article class="metric-card"><span>領獎店數</span><strong>${a.winningStores??'—'}/9</strong><small>正式台獎判定</small></article><article class="metric-card"><span>未領獎店數</span><strong>${a.winningStores==null?'—':Math.max(0,9-a.winningStores)}</strong><small>九店完整顯示</small></article></div><div class="battle-list award-battle-list"><div class="battle-list-row award-battle-row header"><span>店點</span><span>金額</span><span>狀態</span></div>${awardStores.map(row=>`<div class="battle-list-row award-battle-row"><span>${escapeHtml(row.name)}</span><span>${row.amount==null?'—':'$'+fmtNumber(row.amount,0)}</span><span class="${row.eligible?'positive':'neutral-value'}">${row.eligible?'領獎':'未領獎'}</span></div>`).join('')}</div>`;
    } else if (battleKind === 'award') {
      const row=awardStores.find(item=>item.name===selected);
      content.innerHTML=row?`<div class="award-selected-store"><span>店點</span><strong>${escapeHtml(row.name)}</strong></div><div class="metric-card-grid"><article class="metric-card"><span>店領獎金額</span><strong class="gold-value">${row.amount==null?'—':'$'+fmtNumber(row.amount,0)}</strong><small>正式台獎金額</small></article><article class="metric-card"><span>領獎狀態</span><strong class="${row.eligible?'positive':'neutral-value'}">${row.eligible?'領獎':'未領獎'}</strong><small>正式台獎判定</small></article></div>${renderAwardStoreItems(row)}<a class="source-button" href="index.html">完整台獎入口 <i data-lucide="external-link"></i></a>`:'<div class="empty-state">尚無此店台獎摘要。</div>';
    } else content.innerHTML = renderPersonalPerformance(selected);
    const battleModule=battleKind==='kpi'?contract.kpiSummary:battleKind==='award'?contract.awardSummary:contract.personalPerformance;
    if(battleModule.status==='stale') content.insertAdjacentHTML('afterbegin',staleBanner(battleModule));
    refreshIcons();
  }

  function activeReport() { return reportSegment===16?contract.report1600:contract.report2100; }

  const REPORT_FEEDBACK_LABELS = [
    ['reason','零報原因'],['consult','請益對象'],['method','改善做法'],['plan','明日計劃']
  ];

  function storeFeedbackEntries(feedback) {
    return REPORT_FEEDBACK_LABELS.map(([key,label])=>({ key,label,value:String(feedback && feedback[key] || '') })).filter(item=>item.value);
  }

  function renderStoreFeedback(feedback, compact = false) {
    const entries=storeFeedbackEntries(feedback);
    if(!entries.length) return '';
    return `<section class="report-store-feedback${compact?' compact':''}">${compact?'':'<h3>門市回覆</h3>'}${entries.map(item=>`<div><b>${escapeHtml(item.label)}</b><p>${escapeHtml(item.value)}</p></div>`).join('')}</section>`;
  }

  function renderReport() {
    const module=activeReport(); const report=module.data; const failures=contract.reportFailures.data&&contract.reportFailures.data[reportSegment];
    if (!report) { const message=module.status==='unauthorized'?(privateAccessStatus === 'pending' ? '此 iPhone App 裝置待核准' : '解鎖後顯示 16:00／21:00 正式回報'):(module.note||'正式回報讀取失敗'); dom('#reportOverview').innerHTML=module.status==='unauthorized'?privateUnlockState(message):`<div class="empty-state">${escapeHtml(message)}</div>`; dom('#reportOperations').innerHTML=''; dom('#reportFeedbackSummary').innerHTML=''; dom('#reportFailures').innerHTML=''; dom('#reportStoreList').innerHTML=''; return; }
    dom('#reportOverview').innerHTML=`${staleBanner(module)}<div class="report-summary"><article><span>完成店數</span><b class="${report.completedStores===9?'positive':''}">${report.completedStores}/9</b></article><article><span>尚未完成</span><b class="${report.missingStores.length?'negative':'positive'}">${report.missingStores.length}</b></article><article><span>最後更新</span><b>${escapeHtml(report.updatedAt||'—')}</b></article></div>${report.missingStores.length?`<p class="stale-note">尚未完成：${report.missingStores.map(escapeHtml).join('、')}</p>`:''}`;
    const summaryMetrics=report.summaryMetrics||{};
    dom('#reportOperations').innerHTML=report.summaryAvailable&&Object.keys(summaryMetrics).length?`<div class="report-operation-grid">${['A999','好速','R1399','R999','保險搭售率','設備案佔比'].filter(key=>summaryMetrics[key]).map(key=>`<article><span>${escapeHtml(key==='A999'?'A999 上線數':key==='好速'?'好速銷售點數':key==='R1399'?'R1399 上線數':key==='R999'?'R999 上線數':key)}</span><b>${formatOperationMetric(summaryMetrics[key])}</b></article>`).join('')}</div>`:`<div class="empty-state">${module.status==='no_data'?`尚未進入／尚無正式 ${report.segment}:00 回報`:'正式來源尚未提供營運摘要欄位；App 不自行計算。'}</div>`;
    const feedbackStores=report.stores.filter(store=>storeFeedbackEntries(store.storeFeedback).length);
    dom('#reportFeedbackSummary').innerHTML=feedbackStores.length?`<div class="report-feedback-list">${feedbackStores.map(store=>`<article class="report-feedback-card"><h3>🏪 ${escapeHtml(store.name)}</h3>${renderStoreFeedback(store.storeFeedback,true)}</article>`).join('')}</div>`:'<div class="empty-state">此時段目前沒有正式門市回覆。</div>';
    dom('#reportFailures').innerHTML=failures&&!failures.unavailable?`<div class="failure-summary"><div class="failure-grid"><div><span>未過關店數</span><b class="${failures.failedStoreCount?'negative':'positive'}">${failures.failedStoreCount}</b></div><div><span>未過關人數</span><b class="${failures.failedPeopleCount?'negative':'positive'}">${failures.failedPeopleCount}</b></div><div><span>未回報店點</span><b>${failures.missingStores.length}</b></div><div><span>各指標未過人數</span><b>${Object.entries(failures.byMetric||{}).map(([key,value])=>`${escapeHtml(key)} ${value}`).join(' · ')||'0'}</b></div></div><div class="tracking-list">${(failures.people||[]).map(person=>`<div class="tracking-item"><b>${escapeHtml(person.store)} · ${escapeHtml(person.name)}</b><br>${escapeHtml(person.failed.join('、')||'未過關')}｜${escapeHtml(person.reason||'尚未填寫原因')}</div>`).join('')||'<div class="empty-state">目前沒有正式未過關紀錄。</div>'}</div></div>`:`<div class="empty-state">${failures&&failures.unavailable?'正式個人回報讀取失敗':'尚無個人未過關資料。'}</div>`;
    dom('#reportStoreList').innerHTML=report.stores.map(store=>{
      const failed=store.people.filter(person=>person.status==='fail').length;
      const status=!store.reported?'未回報':failed?'未過關':store.people.length?'過關':'已回報';
      return `<article class="report-store"><button class="report-store-button" type="button" aria-expanded="false"><span>${escapeHtml(store.name)}</span><span class="${store.reported?'positive':'negative'}">${store.reported?'已回報':'未回報'}</span><span class="${status==='未過關'?'negative':status==='過關'?'positive':''}">${status}</span><span>${escapeHtml(store.reportedAt||'—')}</span><i data-lucide="chevron-down"></i></button><div class="report-person-list"><div class="report-store-operation-grid">${['A999','好速','R1399','R999','保險搭售率','設備案佔比'].filter(key=>store.metrics&&store.metrics[key]!=null).map(key=>`<span><small>${escapeHtml(key)}</small><b>${key.includes('率')||key.includes('佔比')?`${fmtNumber(store.metrics[key],1)}%`:fmtNumber(store.metrics[key],key==='好速'?2:1)}</b></span>`).join('') || '<div class="empty-state">此店正式來源尚無營運數字。</div>'}</div>${renderStoreFeedback(store.storeFeedback)}${store.people.length?store.people.map(person=>`<article class="person-card"><div class="person-head"><b>${escapeHtml(person.name)}</b><span class="${person.status==='fail'?'fail':''}">${person.status==='fail'?'未過關':'過關'}</span></div><div class="person-metrics">${Object.entries(person.metrics||{}).map(([key,value])=>`<span>${key} ${value==null?'—':fmtNumber(value)}</span>`).join('')}</div>${person.status==='fail'?`<p class="person-note">未過關：${escapeHtml(person.failed.join('、'))}<br>原因：${escapeHtml(person.reason||'尚未填寫原因')}<br>改善計畫：${escapeHtml(person.improvePlan||'尚未填寫改善計畫')}</p>`:''}</article>`).join(''):'<div class="empty-state">尚無正式個人回報。</div>'}</div></article>`;
    }).join('');
    refreshIcons();
  }

  function latestOpenPatrolVisit(events = patrolVisitEvents) {
    if(events===patrolVisitEvents&&patrolOpenVisit) return patrolOpenVisit;
    const open=new Map();
    (Array.isArray(events)?events:[]).forEach(event=>{
      if(event.action==='arrival') open.set(event.visitSessionId,event);
      else if(event.action==='departure') open.delete(event.visitSessionId);
    });
    const rows=[...open.values()];
    return rows.at(-1)||null;
  }

  function isFormalPatrolVisit(event, date = taipeiDate()) {
    return Boolean(event && event.date === date && !/^DEPLOY_TEST_/i.test(String(event.note || '').trim()));
  }

  function formalPatrolVisitEvents(events) {
    return (Array.isArray(events)?events:[]).filter(event=>isFormalPatrolVisit(event)).sort((a,b)=>String(a.serverTime||'').localeCompare(String(b.serverTime||'')));
  }

  function renderPatrolVisits() {
    const open=latestOpenPatrolVisit();
    const enabled=Boolean(patrolToken&&!PREVIEW_MODE&&!patrolVisitError);
    dom('#patrolArrivalButton').disabled=!enabled||Boolean(open);
    dom('#patrolDepartureButton').disabled=!enabled||!open;
    if(PREVIEW_MODE) setMessage('#patrolVisitMessage','Preview／示意資料不執行正式到離店寫入。');
    else if(!patrolToken) setMessage('#patrolVisitMessage','解鎖班表／巡店後可使用。');
    else if(patrolVisitError) setMessage('#patrolVisitMessage',patrolVisitError,'error');
    else if(open) setMessage('#patrolVisitMessage',`目前在 ${normalizeStore(open.store)}，可記錄離店。`,'success');
    else if(patrolStaleOpenVisit) setMessage('#patrolVisitMessage',`異常：${normalizeStore(patrolStaleOpenVisit.store)} 有跨日未離店紀錄；不會自動延續到今天。`,'error');
    else setMessage('#patrolVisitMessage','目前沒有尚未離店的巡店紀錄。');
    dom('#patrolVisitToday').innerHTML=patrolVisitEvents.length?patrolVisitEvents.map(event=>`<div class="patrol-visit-event"><time>${escapeHtml(formatTime(event.serverTime))}</time><b>${event.action==='arrival'?'到店':'離店'}</b><span>${escapeHtml(normalizeStore(event.store))}</span>${event.note?`<small>${escapeHtml(event.note)}</small>`:''}</div>`).join(''):'<div class="empty-state">今日尚無到離店紀錄。</div>';
  }

  function halfMonthData() {
    if(PREVIEW_MODE) return scope.LiamSupervisorHalfMonthPreviewData||null;
    if(!H||!['ok','stale'].includes(halfMonthReadState)) return null;
    return H.adapt({rows:halfMonthFormalRows,stores:STORES,date:taipeiDate(),period:halfMonthSelectedPeriod,normalizeStore});
  }

  function halfMonthOpenVisit() {
    return latestOpenPatrolVisit() || (halfMonthData() && halfMonthData().openVisit) || null;
  }

  function halfMonthStatus(store) {
    const total=Number(store&&store.totalItems)||18;
    if(!store||store.answeredItems===0) return ['尚未填','negative','circle-dashed'];
    if(store.answeredItems<total) return [`${store.answeredItems}/${total} 已填`,'gold-value','loader-circle'];
    return [`${total}/${total} 已填`,store.abnormalCount?'gold-value':'positive',store.abnormalCount?'triangle-alert':'check-circle-2'];
  }

  function captureHalfMonthPreviewForm() {
    const store=dom('#halfMonthStore');
    if(store) halfMonthPreviewStore=store.value;
    all('[data-half-preview-question]').forEach(card=>{
      const item=Number(card.dataset.halfPreviewQuestion);
      const current=halfMonthPreviewAnswers[item]||{};
      const note=card.querySelector('[data-half-note]');
      const improvement=card.querySelector('[data-half-improvement]');
      const evidence=card.querySelector('[data-half-evidence]');
      halfMonthPreviewAnswers[item]={
        result:current.result||'',
        note:note?note.value:current.note||'',
        improvement:improvement?improvement.value:current.improvement||'',
        evidence:evidence?evidence.value:current.evidence||''
      };
    });
  }

  function halfMonthPreviewProgress(data) {
    const total=Array.isArray(data&&data.questions)?data.questions.length:0;
    const completed=Object.values(halfMonthPreviewAnswers).filter(answer=>answer&&answer.result).length;
    return {completed,total};
  }

  function seedHalfMonthPreviewAnswers(data, storeName) {
    const store=(data&&Array.isArray(data.stores)?data.stores:[]).find(row=>row.name===storeName);
    halfMonthPreviewAnswers={};
    (store&&Array.isArray(store.questions)?store.questions:[]).forEach(question=>{
      halfMonthPreviewAnswers[question.item]={
        result:question.result||'',
        note:question.note||'',
        improvement:question.improvement||'',
        evidence:question.evidence||''
      };
    });
  }

  function renderHalfMonthOverview(data) {
    const summary=data.summary||{};
    const total=Array.isArray(data.questions)?data.questions.length:18;
    const open=halfMonthOpenVisit();
    const storeRows=(data.stores||[]).map(store=>{
      const [label,className,icon]=halfMonthStatus(store);
      return `<article class="half-preview-store"><div><strong>${escapeHtml(store.name)}</strong><small>${store.latestDate?`最近填寫 ${escapeHtml(formatReliableDateOnly(store.latestDate))}`:'本期尚無填寫資料'}</small></div><div class="half-preview-store-status ${className}"><i data-lucide="${icon}"></i><b>${label}</b><small>異常 ${store.abnormalCount||0}</small></div></article>`;
    }).join('');
    const periodControl=PREVIEW_MODE?'':`<div class="segmented half-period-selector" role="group" aria-label="半月期別"><button type="button" class="${data.period.key==='H1'?'active':''}" data-half-period="H1" aria-pressed="${data.period.key==='H1'}">上半月</button><button type="button" class="${data.period.key==='H2'?'active':''}" data-half-period="H2" aria-pressed="${data.period.key==='H2'}">下半月</button></div>`;
    const readBanner=PREVIEW_MODE?'<b>PREVIEW / 尚未寫入正式資料</b><span>本頁只驗證資訊架構；不會寫入正式資料或上傳媒體。</span>':`<b>FORMAL READ / 正式唯讀</b><span>資料來自 hread；填寫進度是 ${total} 題完整度，不是 backend completed。</span>`;
    return `<section class="preview-only-banner">${readBanner}</section>
      ${open?`<section class="half-preview-location"><i data-lucide="map-pin"></i><div><span>目前在：</span><b>${escapeHtml(normalizeStore(open.store))}</b><small>到店不會自動開始檢查</small></div></section>`:''}
      <section class="panel half-preview-period"><div class="panel-head"><div><h2>督導到店檢查</h2><small>${escapeHtml(data.source&&data.source.label||'正式 hread contract')}</small></div></div><strong>${escapeHtml(data.period&&data.period.label||'—')}</strong><span>${escapeHtml(data.period&&data.period.dateRange||'—')}</span>${periodControl}</section>
      <section class="half-preview-summary" aria-label="本期半月檢查摘要">
        <article><span>${total}/${total} 已填</span><b>${summary.filledStores==null?'—':`${summary.filledStores} / ${summary.totalStores}`}</b></article>
        <article><span>有異常</span><b class="${summary.abnormalStores?'gold-value':''}">${summary.abnormalStores==null?'—':`${summary.abnormalStores} 店`}</b></article>
        <article><span>異常項目</span><b class="${summary.abnormalItems?'negative':''}">${summary.abnormalItems==null?'—':summary.abnormalItems}</b></article>
        <article><span>尚未填</span><b class="${summary.emptyStores?'negative':''}">${summary.emptyStores==null?'—':`${summary.emptyStores} 店`}</b></article>
      </section>
      <section class="panel half-preview-stores"><div class="panel-head"><div><h2>九店本期狀態</h2><small>顯示 ${total} 題填寫進度，不代表 backend completed</small></div></div>${storeRows}</section>
      <button class="half-preview-start" type="button" data-half-preview-action="start">${PREVIEW_MODE?'+ 開始檢查 Preview':'查看到店檢查內容'}</button>`;
  }

  function renderHalfMonthForm(data) {
    const open=halfMonthOpenVisit();
    if(!halfMonthPreviewStore && open) halfMonthPreviewStore=normalizeStore(open.store);
    const options=[`<option value="" disabled ${halfMonthPreviewStore?'':'selected'}>請選擇店點</option>`].concat(STORES.map(store=>`<option value="${escapeHtml(store)}" ${halfMonthPreviewStore===store?'selected':''}>${escapeHtml(store)}</option>`)).join('');
    const formStatuses=data.statuses||[];
    const questions=(data.questions||[]).map(question=>{
      const answer=halfMonthPreviewAnswers[question.item]||{};
      const abnormal=answer.result==='abnormal';
      const sourceOriginal=!abnormal&&(answer.note||answer.improvement||answer.evidence)?`<div class="half-formal-original"><b>正式來源原文</b>${answer.note?`<p>檢查紀錄：${escapeHtml(answer.note)}</p>`:''}${answer.improvement?`<p>改善說明：${escapeHtml(answer.improvement)}</p>`:''}${answer.evidence?`<p>佐證：${escapeHtml(answer.evidence)}</p>`:''}</div>`:'';
      return `<article class="half-preview-question ${abnormal?'issue':''}" data-half-preview-question="${question.item}">
        <div class="half-preview-question-head"><span>${String(question.item).padStart(2,'0')}</span><strong>${escapeHtml(question.title)}</strong></div>
        <small class="half-preview-result-label">目前值：${escapeHtml(H&&H.RESULT_LABELS[answer.result||'']||'尚未填寫')}</small>
        <div class="half-preview-statuses" role="group" aria-label="第 ${question.item} 題狀態">${formStatuses.map(status=>`<button type="button" class="${answer.result===status.value?'active':''}" data-half-answer="${status.value}" ${PREVIEW_MODE?'':'disabled'}>${escapeHtml(status.label)}</button>`).join('')}</div>
        <div class="half-preview-abnormal" ${abnormal?'':'hidden'}>
          <label>缺失內容<textarea rows="2" data-half-note placeholder="原文記錄，不自動改寫" ${PREVIEW_MODE?'':'readonly'}>${escapeHtml(answer.note||'')}</textarea></label>
          <label>改善說明<textarea rows="2" data-half-improvement placeholder="改善做法／待追蹤事項" ${PREVIEW_MODE?'':'readonly'}>${escapeHtml(answer.improvement||'')}</textarea></label>
          <label>佐證／Drive 連結（本輪唯讀）<textarea rows="2" data-half-evidence readonly>${escapeHtml(answer.evidence||'')}</textarea></label>
        </div>
        ${sourceOriginal}
      </article>`;
    }).join('');
    const progress=halfMonthPreviewProgress(data);
    return `<section class="preview-only-banner"><b>${PREVIEW_MODE?'PREVIEW / 尚未寫入正式資料':'FORMAL READ / 正式唯讀'}</b><span>${PREVIEW_MODE?'暫存與完成只存在此頁記憶體，不會寫入正式資料。':'本頁僅顯示正式現值，所有修改與儲存操作均已停用。'}</span></section>
      ${open?`<section class="half-preview-location"><i data-lucide="map-pin"></i><div><span>目前在：</span><b>${escapeHtml(normalizeStore(open.store))}</b><small>店點僅預選，仍由 Liam 主動開始</small></div></section>`:''}
      <section class="panel half-preview-form-meta"><div class="panel-head"><div><h2>${escapeHtml(data.period.label)}</h2><small>${escapeHtml(data.period.dateRange)}</small></div></div><label>檢查店點<select id="halfMonthStore" required>${options}</select></label></section>
      <div class="half-preview-questions">${questions}</div>
      <div class="half-preview-sticky"><div><b id="halfMonthProgress">已填 ${progress.completed} / ${progress.total}</b><span id="halfMonthPreviewMessage">${escapeHtml(halfMonthPreviewMessage)}</span></div>${PREVIEW_MODE?'<button type="button" data-half-preview-action="draft">暫存</button><button type="button" data-half-preview-action="complete">完成 Preview</button>':''}</div>`;
  }

  function renderHalfMonthResult(data) {
    const result=halfMonthPreviewResult||{store:halfMonthPreviewStore,completed:0,total:data.questions.length,abnormal:[]};
    return `<section class="preview-only-banner"><b>PREVIEW / 尚未寫入正式資料</b><span>以下為本機結果畫面示意，不代表正式檢查已完成。</span></section>
      <section class="panel half-preview-result"><i data-lucide="badge-check"></i><h2>${escapeHtml(result.store||'未選店點')}</h2><p>${escapeHtml(data.period.label)}</p><div class="half-preview-result-grid"><span><b>${result.completed}/${result.total}</b>本機已填</span><span><b class="${result.abnormal.length?'negative':'positive'}">${result.abnormal.length}</b>異常</span><span><b class="${result.abnormal.length?'gold-value':'positive'}">${result.abnormal.length}</b>待改善</span></div></section>
      <section class="panel"><div class="panel-head"><div><h2>異常項目</h2><small>只顯示 Preview 中選為異常的題目</small></div></div><div class="half-preview-result-list">${result.abnormal.length?result.abnormal.map(row=>`<article><b>${String(row.item).padStart(2,'0')} ${escapeHtml(row.title)}</b><span>待改善</span>${row.improvement?`<p>${escapeHtml(row.improvement)}</p>`:''}</article>`).join(''):'<div class="empty-state">本次 Preview 無異常項目。</div>'}</div></section>
      <button class="half-preview-start secondary" type="button" data-half-preview-action="overview">返回本期大盤</button>`;
  }

  function renderHalfMonthCheck() {
    const container=dom('#halfMonthCheckPreview');
    if(!container) return;
    if(!PREVIEW_MODE&&!patrolToken){
      container.innerHTML=patrolUnlockState(halfMonthReadMessage||'請先解鎖班表／巡店');
      refreshIcons();
      return;
    }
    if(!PREVIEW_MODE&&halfMonthReadState==='loading'){
      container.innerHTML='<section class="preview-only-banner"><b>FORMAL READ / 唯讀</b><span>正在透過既有短效 session 讀取 hread；不會呼叫正式 write。</span></section><div class="empty-state">正在讀取督導到店檢查…</div>';
      return;
    }
    if(!PREVIEW_MODE&&halfMonthReadState==='error'){
      container.innerHTML=`<section class="preview-only-banner"><b>FORMAL READ / 唯讀</b><span>hread 讀取失敗，沒有使用舊資料或猜測值。</span></section><div class="empty-state">${escapeHtml(halfMonthReadMessage||'正式半月資料讀取失敗。')}</div>`;
      return;
    }
    const data=halfMonthData();
    if(!data){
      container.innerHTML='<section class="preview-only-banner"><b>FORMAL READ / 唯讀</b><span>切換至本頁後才讀取 hread；不會呼叫正式 write。</span></section><div class="empty-state">準備讀取督導到店檢查。</div>';
      return;
    }
    const content=halfMonthPreviewScreen==='form'?renderHalfMonthForm(data):halfMonthPreviewScreen==='result'?renderHalfMonthResult(data):renderHalfMonthOverview(data);
    container.innerHTML=`${halfMonthReadState==='stale'?`<p class="stale-note">${escapeHtml(halfMonthReadMessage)}</p>`:''}${content}`;
    refreshIcons();
  }

  function setPatrolCheckView(view) {
    patrolCheckView=view==='half-month'?'half-month':'patrol';
    all('[data-patrol-check-view]').forEach(button=>{
      const active=button.dataset.patrolCheckView===patrolCheckView;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    dom('#patrolCheckContent').hidden=patrolCheckView!=='patrol';
    dom('#halfMonthCheckPreview').hidden=patrolCheckView!=='half-month';
    if(patrolCheckView==='half-month') renderHalfMonthCheck();
  }

  async function loadHalfMonthFormalRead() {
    if(PREVIEW_MODE) return;
    if(!patrolToken){
      halfMonthReadState='unauthorized';
      halfMonthReadMessage='請先解鎖班表／巡店';
      renderHalfMonthCheck();
      return;
    }
    halfMonthReadState='loading';
    halfMonthReadMessage='';
    renderHalfMonthCheck();
    try{
      const response=await patrolRead('hread');
      if(!Array.isArray(response.rows)) throw new Error('正式 hread 未回傳 rows。');
      halfMonthFormalRows=response.rows;
      halfMonthReadState='ok';
    }catch(error){
      halfMonthReadMessage=String(error&&error.message||'正式督導到店檢查讀取失敗。');
      const unauthorized=/授權已逾時/.test(halfMonthReadMessage);
      halfMonthReadState=unauthorized?'unauthorized':halfMonthFormalRows.length?'stale':'error';
      if(halfMonthReadState==='stale') halfMonthReadMessage=`上次成功資料 · ${halfMonthReadMessage}`;
      else if(halfMonthReadState!=='unauthorized') halfMonthFormalRows=[];
      if(halfMonthReadState==='unauthorized') setMessage('#patrolAccessMessage','班表／巡店授權已逾時，請重新驗證','error');
    }
    renderHalfMonthCheck();
  }

  function renderPatrolRuleBoards(overview) {
    if(!overview) return '';
    const item18=overview.item18Progress;
    const inventory=overview.inventory;
    const visits=overview.visitCounts;
    const item18Panel=item18?`<section class="panel patrol-rule-panel"><div class="panel-head"><div><h2>題 18 雙月全盤進度</h2><small>本期 ${escapeHtml(item18.window.label)} · ${item18.completedStores}/${item18.total} 店完成</small></div></div><div class="patrol-rule-table patrol-item18-table"><div class="patrol-rule-row header"><span>店點</span><span>本期</span><span>完成日</span><span>上期 ${escapeHtml(item18.previousWindow.label)}</span></div>${item18.stores.map(row=>`<div class="patrol-rule-row"><span>${escapeHtml(row.name)}</span><span class="${row.current.done?'positive':'negative'}">${row.current.done?'✓':'✕'}</span><span>${row.current.date?escapeHtml(formatDate(row.current.date)):'—'}</span><span class="${row.previous.done?'positive':'negative'}">${row.previous.done?`✓ ${escapeHtml(formatDate(row.previous.date))}`:'✕'}</span></div>`).join('')}</div></section>`:'';
    const inventoryPanel=inventory?`<section class="panel patrol-rule-panel"><div class="panel-head"><div><h2>題 14–17 每月盤點</h2><small>${inventory.completedStores}/${inventory.total} 店全項完成</small></div></div><div class="patrol-rule-table patrol-inventory-table"><div class="patrol-rule-row header"><span>店點</span>${inventory.items.map(item=>`<span>題${item}</span>`).join('')}</div>${inventory.stores.map(row=>`<div class="patrol-rule-row"><span>${escapeHtml(row.name)}</span>${inventory.items.map(item=>`<span class="${row.items[item]?'positive':'negative'}">${row.items[item]?'✓':'✕'}</span>`).join('')}</div>`).join('')}</div></section>`:'';
    const visitPanel=Array.isArray(visits)?`<section class="panel patrol-rule-panel"><div class="panel-head"><div><h2>本月各店巡店次數</h2><small>依不同到店日期計算</small></div></div><div class="patrol-visit-counts">${visits.map(row=>`<div><span>${escapeHtml(row.name)}</span><b>${row.count} 次</b></div>`).join('')}</div><p class="patrol-count-note">正式 ptread 無 visit/session identifier；同店同日多次到店無法可靠區分，因此只計 1 次，不補猜。</p></section>`:'';
    return item18Panel+inventoryPanel+visitPanel;
  }

  function renderSep25RuleBoards(overview) {
    const groupCard=(title,completed,total,note)=>`<article class="patrol-version-card ${completed<total?'warn':''}"><strong>${completed}/${total}</strong><span>${escapeHtml(title)}</span><small>${escapeHtml(note)}</small></article>`;
    const monthlyDone=overview.stores.filter(store=>store.monthly.missing===0).length;
    const bimonthlyDone=overview.stores.filter(store=>store.bimonthly.missing===0).length;
    const nccDone=overview.stores.filter(store=>store.ncc.missing===0).length;
    return `<section class="panel patrol-rule-panel"><div class="panel-head"><div><h2>新版 25 項進度</h2><small>與完整巡店看板共用規則；只有 V 計入完成，NA 列為缺項</small></div></div><div class="patrol-version-grid">${groupCard('每月到店檢查・第 1–9 項',monthlyDone,overview.totalStores,'每店每月完成')}${groupCard('到店全盤・第 10 項',bimonthlyDone,overview.totalStores,`${overview.window.label}共用進度`)}${groupCard('NCC 知悉宣導・第 11–25 項',nccDone,overview.totalStores,'每店每月 15 項')}</div></section>`;
  }

  function renderPatrolMileage() {
    const node=dom('#patrolMileage');
    if(!node) return;
    if(PREVIEW_MODE){node.innerHTML='';return;}
    if(!patrolToken){node.innerHTML='<section class="panel"><div class="panel-head"><div><h2>每日移動里程</h2><small>正式 ptmileage2</small></div></div><div class="empty-state">解鎖後顯示本月正式移動里程。</div></section>';return;}
    if(patrolMileageState.status==='loading'){node.innerHTML='<section class="panel"><div class="panel-head"><div><h2>每日移動里程</h2><small>正式 ptmileage2</small></div></div><div class="empty-state">正在讀取本月移動里程…</div></section>';return;}
    if(!patrolMileageState.data){node.innerHTML=`<section class="panel"><div class="panel-head"><div><h2>每日移動里程</h2><small>正式 ptmileage2</small></div></div><div class="empty-state">${escapeHtml(patrolMileageState.note||'尚無移動里程資料。')}</div></section>`;return;}
    const data=patrolMileageState.data;
    const recent=data.days.slice(0,5).map(day=>`<div class="patrol-mileage-row"><time>${escapeHtml(formatDate(day.date))}</time><span>${escapeHtml(day.route.join(' → '))}</span><b class="${day.km==null?'negative':'positive'}">${day.km==null?'待查':`${fmtNumber(day.km,1)} KM`}</b></div>`).join('');
    node.innerHTML=`${patrolMileageState.status==='stale'?`<p class="stale-note">${escapeHtml(patrolMileageState.note)}</p>`:''}<section class="panel patrol-mileage-panel"><div class="panel-head"><div><h2>每日移動里程</h2><small>${escapeHtml(data.month)} · 正式 ptmileage2</small></div></div><div class="patrol-mileage-kpis"><article><span>本月累積</span><b>${fmtNumber(data.totalKm,1)} KM</b></article><article><span>報銷出差日</span><b>${data.reimbursementDays} 天</b></article><article><span>待確認路段</span><b class="${data.pendingLegs?'negative':'positive'}">${data.pendingLegs} 段</b></article></div><div class="patrol-mileage-list">${recent||'<div class="empty-state">本月尚無巡店移動紀錄。</div>'}</div><div class="source-actions patrol-mileage-link"><a href="patrol.html#miMonth">開啟完整里程明細 <i data-lucide="external-link"></i></a></div></section>`;
  }

  function renderPatrol() {
    const overview=contract.patrolOverview.data; const today=contract.patrolToday.data;
    renderPatrolVisits();
    renderPatrolMileage();
    if (overview&&overview.mode==='sep25') {
      const rate=overview.totalStores?overview.visitedStores/overview.totalStores:0;
      const progressWidth=Math.min(100,Math.max(0,rate*100));
      const pendingVisits=overview.stores.filter(store=>!store.visits.completed);
      const reminder=pendingVisits.length?pendingVisits.map(store=>store.visits.firstVisit?`${store.name}：第 2 次最早 ${formatReliableDateOnly(store.visits.nextEligibleDate)}`:`${store.name}：尚未完成第 1 次`).join('；'):'九店皆已完成每月 2 次巡店，且日期至少相隔 7 天。';
      dom('#patrolOverview').innerHTML=`${contract.patrolOverview.status==='stale'?`<p class="stale-note">${escapeHtml(contract.patrolOverview.note)}</p>`:''}<section class="panel patrol-progress-panel"><div class="panel-head"><div><h2>本月巡店進度</h2><small>${escapeHtml(overview.currentMonth)} · 新版 25 項</small></div></div><div class="patrol-progress-hero"><div><span>本月有到店店數</span><strong class="${rate<1?'gold-value':'positive'}">${fmtPct(rate)}</strong></div><div class="patrol-progress-track" role="progressbar" aria-label="本月有到店店數" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(progressWidth)}"><i style="width:${progressWidth}%"></i></div><p>已有到店 ${overview.visitedStores} / ${overview.totalStores} 店</p></div><div class="patrol-kpis patrol-kpis-four"><article><span>25 項完成店數</span><b class="positive">${overview.questionCompleteStores}</b></article><article><span>2 次且間隔 7 天</span><b class="positive">${overview.visitCadenceCompleteStores}</b></article><article><span>巡店完整完成</span><b class="positive">${overview.fullyDoneStores}</b></article><article><span>尚缺檢核項次</span><b class="${overview.totalMissingItems?'negative':'positive'}">${overview.totalMissingItems}</b></article></div><div class="patrol-rule-summary"><span>每月巡店 <b>2 次</b></span><span>兩次間隔 <b>至少 7 天</b></span><span>檢核題數 <b>25 項</b></span></div><div class="patrol-visit-reminder"><b>巡店提醒</b><p>${escapeHtml(reminder)}</p></div><div class="patrol-unvisited"><b>本月未巡店點</b><p>${overview.unvisited.length?overview.unvisited.map(escapeHtml).join('、'):'無'}</p></div></section>${renderSep25RuleBoards(overview)}`;
    } else if (overview) {
      const cycle=P&&P.halfMonthProgress?P.halfMonthProgress(overview,taipeiDate()):{verified:false};
      const completed=cycle.verified?cycle.currentCompleted:null; const expected=cycle.verified?cycle.total:null;
      const remaining=cycle.verified?cycle.currentRemaining:null; const rate=cycle.verified?cycle.currentRate:null;
      const attentionCount=numberOrNull(overview.attentionCount) ?? (Array.isArray(overview.attention)?overview.attention.length:0);
      const progressWidth=rate==null?0:Math.min(100,Math.max(0,rate*100));
      const unvisitedBlock=cycle.verified&&cycle.currentUnvisited.length
        ? `<div class="patrol-unvisited"><b>本期未巡店點</b><p>${cycle.currentUnvisited.map(escapeHtml).join('、')}</p></div>`
        : `<div class="patrol-unvisited"><b>本期未巡店點</b><p>${cycle.verified?'無':'等待可驗證的半月巡店摘要'}</p></div>`;
      const verificationNote=cycle.verified?'':'<p class="stale-note">巡店摘要缺少可驗證的上下半月店點進度，本頁已 fail-closed，不沿用本月數字。</p>';
      const cycleLabel=cycle.verified?cycle.period.label:'本期';
      const doubleRound=cycle.verified?`<section class="patrol-double-round" aria-label="本月雙輪進度"><h3>本月雙輪進度</h3><div><span>上半月</span><b class="${cycle.h1Completed===cycle.total?'positive':cycle.period.half==='H1'?'cyan-value':''}">${cycle.h1Completed===cycle.total?'✅':cycle.period.half==='H1'?'🔵':'○'} ${cycle.h1Completed} / ${cycle.total}</b></div><div><span>下半月</span><b class="${cycle.h2Completed===cycle.total?'positive':cycle.period.half==='H2'?'cyan-value':''}">${cycle.h2Completed===cycle.total?'✅':cycle.period.half==='H2'?'🔵':'○'} ${cycle.h2Completed} / ${cycle.total}</b></div><div class="total"><span>整月</span><b>${cycle.wholeCompleted} / ${cycle.wholeTotal}</b></div></section>`:'';
      dom('#patrolOverview').innerHTML=`${contract.patrolOverview.status==='stale'?`<p class="stale-note">${escapeHtml(contract.patrolOverview.note)}</p>`:''}<section class="panel patrol-progress-panel"><div class="panel-head"><div><h2>本期巡店進度</h2><small>${escapeHtml(cycle.verified?cycle.period.subtitle:'半月期別待驗證')}</small></div></div><div class="patrol-progress-hero"><div><span>${escapeHtml(cycleLabel)}巡店率</span><strong class="${rate!=null&&rate<1?'gold-value':'positive'}">${fmtPct(rate)}</strong></div><div class="patrol-progress-track" role="progressbar" aria-label="${escapeHtml(cycleLabel)}巡店率" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${rate==null?0:Math.round(progressWidth)}"><i style="width:${progressWidth}%"></i></div><p>已完成 ${completed==null?'—':completed} / ${expected==null?'—':expected} 店</p></div><div class="patrol-kpis patrol-kpis-four"><article><span>本期已巡店數</span><b class="positive">${completed==null?'—':completed}</b></article><article><span>本期未巡店數</span><b class="${remaining?'negative':'positive'}">${remaining==null?'—':remaining}</b></article><article><span>本期全項完成店數</span><b class="positive">${cycle.verified?cycle.currentFullyDone:'—'}</b></article><article><span>尚缺檢核項次</span><b class="${cycle.verified&&cycle.currentMissingItems?'negative':'positive'}">${cycle.verified?cycle.currentMissingItems:'—'}</b></article></div>${doubleRound}<div class="patrol-rule-summary"><span>本期檢核 <b>題 2–13</b></span><span>月檢需關注店 <b class="${attentionCount?'negative':'positive'}">${attentionCount}</b></span><span>題 18 週期 <b>${escapeHtml(overview.item18Window&&overview.item18Window.label||'—')}</b></span><span>題 19–33 <b>每月 20 日前</b></span></div>${unvisitedBlock}${verificationNote}</section>${renderPatrolRuleBoards(overview)}`;
    } else dom('#patrolOverview').innerHTML=contract.patrolOverview.status==='unauthorized'?patrolUnlockState('解鎖後顯示巡店大盤'):`<div class="empty-state patrol-read-failure"><b>${escapeHtml(contract.patrolOverview.note||'巡店資料讀取失敗')}</b><button class="secondary-button" type="button" data-retry-patrol>重新整理</button></div>`;
    dom('#patrolTodayDetail').innerHTML=today&&today.route&&today.route.length?`<section class="patrol-today-card"><h2>今日巡店</h2><div class="route-line"><b>${today.route.map(escapeHtml).join(' → ')}</b></div><div class="route-line">${today.distanceKm!=null?`本日 ${fmtNumber(today.distanceKm,1)} KM · ${today.route.length} 店`:`已完成 ${today.completed}/${today.total} · 下一站 ${escapeHtml(today.nextStop||'—')} · ${escapeHtml(today.nextEta||'—')}`}</div></section>`:`<section class="patrol-today-card"><h2>今日巡店</h2><div class="route-line">${escapeHtml(contract.patrolToday.note||'今日無排定巡店')}</div></section>`;
    dom('#patrolStoreList').innerHTML=overview&&overview.stores?overview.stores.map(row=>overview.mode==='sep25'
      ? `<div class="patrol-store-row"><span>${escapeHtml(row.name)}</span><span>${escapeHtml(row.lastVisit||'—')}</span><span>${row.visits.qualifyingVisits}/2 次</span><span class="${row.status==='complete'?'positive':'negative'}">${row.status==='complete'?'完成':row.status==='pending'?'本月未巡':'待補'}<small>第1–9項 ${row.monthly.completed}/9 · 第10項 ${row.bimonthly.completed}/1 · 第11–25項 ${row.ncc.completed}/15</small></span></div>`
      : `<div class="patrol-store-row"><span>${escapeHtml(row.name)}</span><span>${escapeHtml(row.lastVisit||'—')}</span><span>${row.daysSince==null?'—':row.daysSince+' 天'}</span><span class="${row.status==='attention'||row.status==='pending'?'negative':'positive'}">${escapeHtml(row.result||row.status)}<small>題18 ${row.item18&&row.item18.status==='done'?'完成':'未完成'} · 題19–33 ${row.awareness?row.awareness.count:0}/15</small></span></div>`).join(''):`<div class="empty-state">${escapeHtml(contract.patrolStores.status==='error'?(contract.patrolStores.note||'正式巡店讀取失敗'):'尚無店點巡店摘要。')}</div>`;
    dom('#patrolRecentList').innerHTML=overview&&overview.recent&&overview.recent.length?overview.recent.map(row=>`<div class="recent-row"><span>${escapeHtml(formatDate(row.date))}</span><span>${escapeHtml(row.store)}</span><span class="${row.complete?'positive':'negative'}">${row.complete?'完成':`待補 ${row.missingItems} 項`}</span></div>`).join(''):`<div class="empty-state">${escapeHtml(contract.patrolOverview.status==='error'?(contract.patrolOverview.note||'正式巡店讀取失敗'):'尚無最近巡店紀錄。')}</div>`;
    setPatrolCheckView(patrolCheckView);
  }

  function renderSchedule() {
    const date=dom('#scheduleDate').value||taipeiDate(); const filter=dom('#scheduleStoreFilter').value;
    const byDate=contract.scheduleByDate.data;
    const data=scheduleViewData&&scheduleViewData.date===date?scheduleViewData:
      (byDate&&byDate.selectedDate===date?{date,stores:byDate.stores}:(contract.scheduleToday.data&&contract.scheduleToday.data.date===date?contract.scheduleToday.data:null));
    dom('#scheduleSourceTime').textContent=`更新 ${formatTime(contract.scheduleToday.sourceUpdatedAt)}`;
    if (!data||!Array.isArray(data.stores)) { const locked=contract.scheduleToday.status==='unauthorized'; dom('#scheduleList').className=locked?'locked-state':'empty-state'; dom('#scheduleList').innerHTML=locked?patrolUnlockState('解鎖後顯示九店人員、班別與上班／休假'):escapeHtml(contract.scheduleByDate.status==='error'?(contract.scheduleByDate.note||'正式班表讀取失敗'):`${date} 尚無班表資料。`); return; }
    const rows=data.stores.filter(row=>!filter||row.store===filter);
    dom('#scheduleList').className='';
    dom('#scheduleList').innerHTML=`${contract.scheduleByDate.status==='stale'?`<p class="stale-note">${escapeHtml(contract.scheduleByDate.note)}</p>`:''}${rows.length?rows.map(row=>`<article class="schedule-store"><div class="schedule-store-head"><b>${escapeHtml(row.store)}</b><span>${row.working} 人上班 · ${row.off} 人休假</span></div>${(row.staff||[]).map(person=>`<div class="schedule-person ${person.working?'':'off'}"><span>${escapeHtml(person.name)} · ${escapeHtml(person.role||'—')}</span><i>${escapeHtml(person.status||'—')}</i></div>`).join('')}</article>`).join(''):`<div class="empty-state">${escapeHtml(date)} 尚無班表資料。</div>`}`;
  }

  function renderSystemStatus() {
    const entries=[['資料模式',contract.mode==='preview'?'展示資料':'正式唯讀'],['正式寫入','停用'],['OAuth／Cookie／Session','未修改'],['KPI／台獎／回報',contract.kpiSummary.status],['班表／巡店',contract.scheduleToday.status]];
    dom('#systemStatus').innerHTML=entries.map(([label,value])=>`<div class="system-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('');
  }

  function renderAll() {
    renderHeader(); renderOperations(); renderYesterdayFollowUp(); renderKpiHero(); renderStores(); renderAwardsHome(); renderScheduleHome(); renderPatrolHome();
    renderBattle(); renderReport(); renderPatrol(); renderSchedule(); renderSystemStatus(); refreshIcons();
  }

  function scheduleDay(store,date) { return (store.days||[]).find(day=>day.date===date); }

  function adaptSchedule(schedule,date) {
    const rows=(schedule&&schedule.stores||[]).map(store=>{
      const day=scheduleDay(store,date); const staff=day&&Array.isArray(day.staff)?day.staff:[];
      return { store:String(store.store||''), working:staff.filter(person=>person.working).length, off:staff.filter(person=>!person.working).length, staff:staff.map(person=>({name:person.name,role:person.role,status:person.status||(person.working?'上班':'休假'),working:Boolean(person.working)})) };
    });
    return { date, stores:rows };
  }

  function adaptPatrolSummary(raw, currentMonth) {
    const summary=raw&&raw.summary;
    if(!summary||summary.month!==currentMonth||!summary.periodVerified) throw new Error('巡店摘要月份或正式期間無法驗證。');
    if(!Array.isArray(summary.stores)||!Array.isArray(summary.unvisitedStores)||!Array.isArray(summary.attentionStores)) throw new Error('巡店摘要缺少九店狀態。');
    const data={
      currentMonth:summary.month, statisticsPeriod:String(summary.statisticsPeriod||''), periodVerified:true,
      visited:numberOrNull(summary.visitedStores), total:numberOrNull(summary.totalStores), expected:numberOrNull(summary.totalStores),
      remaining:summary.unvisitedStores.length, completionRate:numberOrNull(summary.completionRate),
      fullyDone:numberOrNull(summary.fullyDoneStores), totalMissingItems:numberOrNull(summary.totalMissingItems),
      unvisited:summary.unvisitedStores.slice(), attention:summary.attentionStores.slice(), attentionCount:summary.attentionStores.length,
      item18Progress:summary.item18||null, inventory:summary.inventory14to17||null, items19to33:summary.items19to33||null,
      halfDashboard:summary.halfDashboard||null,
      item18Window:summary.item18&&summary.item18.window||null, awarenessDeadlineDay:summary.items19to33&&summary.items19to33.deadlineDay||20,
      visitCounts:Array.isArray(summary.visitCounts)?summary.visitCounts.map(row=>({ ...row, name:row.store })):[],
      recent:Array.isArray(summary.recentVisits)?summary.recentVisits:[], stores:summary.stores,
      visitCountBasis:summary.visitCountBasis, sameDayMultipleVisitsDistinguishable:Boolean(summary.sameDayMultipleVisitsDistinguishable),
      sourceVersion:String(summary.sourceVersion||''), sourceUpdatedAt:String(summary.sourceUpdatedAt||''), generatedAt:String(summary.generatedAt||'')
    };
    if(data.total!==STORES.length||data.stores.length!==STORES.length) throw new Error('巡店摘要不是完整九店資料。');
    data.stores=data.stores.map(row=>({ ...row, name:normalizeStore(row.name) }));
    data.unvisited=data.unvisited.map(normalizeStore);
    data.attention=data.attention.map(normalizeStore);
    data.recent=data.recent.map(row=>({ ...row, store:normalizeStore(row.store) }));
    data.visitCounts=(data.visitCounts||[]).map(row=>({ ...row, name:normalizeStore(row.name) }));
    if(data.inventory) data.inventory.stores=data.inventory.stores.map(row=>({ ...row, name:normalizeStore(row.name) }));
    if(data.item18Progress) data.item18Progress.stores=data.item18Progress.stores.map(row=>({ ...row, name:normalizeStore(row.name) }));
    if(data.items19to33) data.items19to33.stores=data.items19to33.stores.map(row=>({ ...row, store:normalizeStore(row.store) }));
    if(data.halfDashboard) data.halfDashboard.stores=data.halfDashboard.stores.map(row=>({ ...row, store:normalizeStore(row.store) }));
    return data;
  }

  function patrolStoreDefinitions(summary) {
    const source=Array.isArray(summary&&summary.stores)?summary.stores:[];
    return STORES.map(name=>{
      const matched=source.find(row=>normalizeStore(row&&row.name||row&&row.store)===name);
      return {name:String(matched&&matched.name||name),code:String(matched&&matched.code||'')};
    });
  }

  async function loadSep25DetailRows(month, summary) {
    if(!Q||!Q.isSep25Month(month)) throw new Error('App 未載入新版 25 題規則。');
    const definitions=patrolStoreDefinitions(summary);
    const months=Q.bimWindow(month).months.filter(value=>value<=month);
    const summaryStores=Array.isArray(summary&&summary.stores)?summary.stores:[];
    const hasVisitedContract=summaryStores.length===STORES.length&&summaryStores.every(store=>typeof store.visited==='boolean');
    const currentStores=hasVisitedContract?definitions.filter(store=>{
      const matched=summaryStores.find(row=>(store.code&&String(row&&row.code||'')===store.code)||normalizeStore(row&&row.name||row&&row.store)===normalizeStore(store.name));
      return matched&&matched.visited;
    }):definitions;
    const tasks=months.flatMap(value=>(value===month?currentStores:definitions).map(store=>({month:value,store:store.name})));
    const rows=[];
    let nextTask=0;
    async function loadTask(task) {
      let page=1,totalRows=null,loaded=0;
      for(;;){
        const response=await patrolRead('ptdetail',{month:task.month,store:task.store,page,limit:100});
        if(!Array.isArray(response.rows)) throw new Error('新版 25 題 ptdetail 分頁 contract 不完整。');
        const reportedTotal=Number(response.totalRows);
        if(!Number.isInteger(reportedTotal)||reportedTotal<0) throw new Error('新版 25 題 ptdetail totalRows contract 不完整。');
        if(totalRows===null) totalRows=reportedTotal;
        else if(totalRows!==reportedTotal) throw new Error('新版 25 題正式資料讀取期間筆數變更。');
        rows.push(...response.rows);loaded+=response.rows.length;
        if(loaded===totalRows) return;
        if(!response.rows.length||loaded>totalRows||page>=100) throw new Error('新版 25 題 ptdetail 分頁筆數不一致。');
        page+=1;
      }
    }
    async function worker(){
      for(;;){
        const index=nextTask;nextTask+=1;
        if(index>=tasks.length) return;
        await loadTask(tasks[index]);
      }
    }
    await Promise.all(Array.from({length:Math.min(3,tasks.length)},()=>worker()));
    return {rows,definitions};
  }

  function adaptSep25Patrol(raw, month, rows, definitions) {
    const model=Q.overview(rows,definitions,month);
    const currentRows=rows.filter(row=>Q.rowMonth(row)===month);
    const recentKeys=new Set();
    const recent=currentRows.slice().sort((a,b)=>String(Q.rowVisitIsoDate(b)).localeCompare(String(Q.rowVisitIsoDate(a)))).flatMap(row=>{
      const store=normalizeStore(row&&row.store)||normalizeStore(definitions.find(item=>item.code&&item.code===String(row&&row.code||''))?.name);
      const date=Q.rowVisitIsoDate(row); const key=`${date}|${store}`;
      if(!date||!store||recentKeys.has(key)) return [];
      recentKeys.add(key);
      const storeModel=model.stores.find(item=>normalizeStore(item.name)===store);
      return [{date,store,complete:Boolean(storeModel&&storeModel.questionsComplete),missingItems:storeModel?storeModel.missingItems:25}];
    }).slice(0,12);
    model.stores=model.stores.map(store=>({...store,name:normalizeStore(store.name)}));
    return {
      ...model, mode:'sep25', currentMonth:month, total:model.totalStores, expected:model.totalStores,
      visited:model.visitedStores, remaining:model.unvisitedStores.length,
      completionRate:model.totalStores?model.visitedStores/model.totalStores:0,
      fullyDone:model.fullyDoneStores, unvisited:model.unvisitedStores.map(normalizeStore),
      attention:model.stores.filter(store=>store.status==='attention').map(store=>store.name),
      attentionCount:model.stores.filter(store=>store.status==='attention').length,
      recent, sourceVersion:String(raw&&raw.summary&&raw.summary.sourceVersion||'sep25-ptdetail'),
      sourceUpdatedAt:String(raw&&raw.summary&&raw.summary.sourceUpdatedAt||''), generatedAt:String(raw&&raw.summary&&raw.summary.generatedAt||'')
    };
  }

  const APP_MILEAGE_LEGS = new Map([
    ['台北三創|六張犁',4.5],['酒泉|通化',8.5],['台北三創|萬大',5.4],['台北三創|復興南',3.5],['台北三創|永吉',4.4],
    ['永吉|酒泉',10],['酒泉|萬大',6.6],['大稻埕|六張犁',7.7],['大稻埕|復興南',6.5],['大稻埕|永吉',7.2],
    ['台北三創|通化',3.6],['通化|萬大',7.4],['酒泉|復興南',8.2],['酒泉|杭州南',5.7],['大稻埕|通化',6.5],
    ['台北三創|杭州南',3],['杭州南|六張犁',3.8],['大稻埕|萬大',4.5],['六張犁|萬大',6.3],['六張犁|酒泉',9.5],
    ['大稻埕|酒泉',2],['大稻埕|杭州南',4.5],['台北三創|酒泉',4.5]
  ].flatMap(([route,km])=>{const [from,to]=route.split('|');return [[`${from}|${to}`,km],[`${to}|${from}`,km]];}));

  function mileageVisitDateTime(value) {
    const text=String(value||'');
    if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)){
      const date=new Date(text);
      if(!Number.isNaN(date.getTime())){
        const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
        const get=type=>(parts.find(part=>part.type===type)||{}).value||'';
        return {date:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}:${get('minute')}`};
      }
    }
    const match=text.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})[ T](\d{1,2}):(\d{2})/);
    if(!match) return null;
    const pad=value=>String(Number(value)).padStart(2,'0');
    return {date:`${match[1]}-${pad(match[2])}-${pad(match[3])}`,time:`${pad(match[4])}:${match[5]}`};
  }

  function adaptPatrolMileage(response, month) {
    if(!response||response.contract!=='patrol-mileage-visits-v2'||response.month!==month||!Array.isArray(response.visits)) throw new Error('月份級移動里程 contract 不完整。');
    if(Number(response.totalVisits)!==response.visits.length) throw new Error('月份級移動里程筆數不一致。');
    const fields=Array.isArray(response.fields)?response.fields:[];
    if(['fillTime','arriveTime','code','store','month'].some(field=>!fields.includes(field))||Number(response.page)!==1||Number(response.totalPages)!==1) throw new Error('月份級移動里程欄位 contract 不完整。');
    const byDate=new Map();
    response.visits.forEach((row,index)=>{
      const parsed=mileageVisitDateTime(row&&row.arriveTime||row&&row.fillTime);
      const date=parsed&&parsed.date;
      const store=normalizeStore(row&&row.store);
      if(!date||date.slice(0,7)!==month||!STORES.includes(store)) throw new Error(`移動里程第 ${index+1} 筆日期或店點無法辨識。`);
      const time=parsed.time;
      const day=byDate.get(date)||new Map();
      const current=day.get(store);
      if(!current||time<current.time) day.set(store,{store,time});
      byDate.set(date,day);
    });
    const days=[...byDate.entries()].sort(([a],[b])=>b.localeCompare(a)).map(([date,storeMap])=>{
      const visits=[...storeMap.values()].sort((a,b)=>a.time.localeCompare(b.time));
      const unknown=[]; let km=0;
      for(let index=0;index<visits.length-1;index+=1){
        const route=`${visits[index].store}|${visits[index+1].store}`;
        const distance=APP_MILEAGE_LEGS.get(route);
        if(distance==null) unknown.push(route.replace('|',' → ')); else km+=distance;
      }
      return {date,visits,route:visits.map(item=>item.store),km:unknown.length?null:Math.round(km*10)/10,unknown};
    });
    const billable=days.filter(day=>day.route.length>1&&day.km!=null);
    return {month,days,totalKm:Math.round(billable.reduce((sum,day)=>sum+day.km,0)*10)/10,reimbursementDays:billable.length,pendingLegs:days.reduce((sum,day)=>sum+day.unknown.length,0)};
  }

  async function loadPatrolData() {
    const date=dom('#scheduleDate').value||taipeiDate(); const month=date.slice(0,7);
    const previousScheduleToday=contract.scheduleToday;
    const previousScheduleByDate=contract.scheduleByDate;
    const previousPatrolOverview=contract.patrolOverview;
    const previousPatrolStores=contract.patrolStores;
    const previousPatrolToday=contract.patrolToday;
    const previousVisitEvents=patrolVisitEvents.slice();
    const previousOpenVisit=patrolOpenVisit;
    const previousMileageState=patrolMileageState;
    const markLoading=(module,label)=>C.moduleState({ ...module, status:'stale', stale:Boolean(module.data), note:module.data?`上次成功資料 · ${formatTime(module.updatedAt)} · 正在更新`:`${label}資料讀取中` });
    contract.scheduleToday=markLoading(previousScheduleToday,'班表');
    contract.scheduleByDate=markLoading(previousScheduleByDate,'班表');
    contract.patrolOverview=markLoading(previousPatrolOverview,'巡店');
    contract.patrolStores=markLoading(previousPatrolStores,'巡店');
    contract.patrolToday=markLoading(previousPatrolToday,'巡店');
    patrolVisitError='今日到離店紀錄讀取中';
    patrolMileageState={status:'loading',data:previousMileageState.data,note:previousMileageState.data?'正在更新本月移動里程':''};
    renderAll();

    const scheduleTask=patrolRead('sread',{month}).then(result=>{
      const readAt=nowIso();
      scheduleRaw=result.schedule; scheduleViewData=adaptSchedule(scheduleRaw,date);
      contract.scheduleByDate=C.moduleState({status:scheduleViewData.stores.length?'ok':'no_data',updatedAt:readAt,sourceUpdatedAt:readAt,stale:false,source:moduleSource('既有班表 sread','patrol.html'),data:{selectedDate:date,availableMonth:String(scheduleRaw&&scheduleRaw.month||month),stores:scheduleViewData.stores}});
      const today=taipeiDate();
      if (scheduleRaw&&scheduleRaw.month===today.slice(0,7)) {
        const todayData=adaptSchedule(scheduleRaw,today);
        contract.scheduleToday=C.moduleState({status:todayData.stores.length?'ok':'no_data',updatedAt:readAt,sourceUpdatedAt:readAt,stale:false,source:moduleSource('既有班表 sread','patrol.html'),data:todayData});
      }
      populateScheduleStores(scheduleViewData.stores.map(row=>row.store));
      contract.generatedAt=readAt;
      renderAll();
    }).catch(error=>{
      const expired=/授權已逾時/.test(error.message);
      const note=String(error.message||readErrorNote(error,'正式班表'));
      if(!expired&&previousScheduleToday.data){ contract.scheduleToday=C.moduleState({...previousScheduleToday,status:'stale',stale:true,note:`上次成功資料 · ${formatTime(previousScheduleToday.updatedAt)} · ${note}`}); contract.scheduleByDate=C.moduleState({...previousScheduleByDate,status:'stale',stale:true,note:`上次成功資料 · ${formatTime(previousScheduleByDate.updatedAt)} · ${note}`}); }
      else { scheduleRaw=null; scheduleViewData=null; contract.scheduleToday=statusModule('scheduleToday',expired?'unauthorized':'error',null,note); contract.scheduleByDate=statusModule('scheduleByDate',expired?'unauthorized':'error',null,note); }
      if(expired)setMessage('#patrolAccessMessage','班表／巡店授權已逾時，請重新驗證','error');
      renderAll();
    });

    const patrolTask=patrolRead('ptsummary',{month}).then(async result=>{
      const readAt=nowIso();
      patrolRaw=result;
      let data,sourceLabel='巡店 ptsummary';
      if(Q&&Q.isSep25Month(month)){
        const detail=await loadSep25DetailRows(month,result.summary);
        data=adaptSep25Patrol(result,month,detail.rows,detail.definitions);
        sourceLabel='巡店 ptdetail・新版 25 項';
      }else data=adaptPatrolSummary(patrolRaw,month);
      const sourceUpdatedAt=data.sourceUpdatedAt||readAt;
      contract.patrolOverview=C.moduleState({status:'ok',updatedAt:readAt,sourceUpdatedAt,stale:false,source:moduleSource(sourceLabel,'patrol.html'),data});
      contract.patrolStores=C.moduleState({status:'ok',updatedAt:readAt,sourceUpdatedAt,stale:false,source:moduleSource(sourceLabel,'patrol.html'),data:data.stores});
      const mileageToday=patrolMileageState.data&&patrolMileageState.data.days.find(day=>day.date===taipeiDate());
      if(!mileageToday) contract.patrolToday=C.moduleState({status:'no_data',updatedAt:readAt,sourceUpdatedAt,stale:false,source:moduleSource('巡店 ptdetail','patrol.html'),data:null,note:'今日尚無正式巡店移動紀錄'});
      contract.generatedAt=readAt;
      renderAll();
    }).catch(error=>{
      const expired=/授權已逾時/.test(error.message);
      const note=String(error.message||readErrorNote(error,'正式巡店'));
      if(!expired&&previousPatrolOverview.data&&previousPatrolOverview.data.currentMonth===month){ contract.patrolOverview=C.moduleState({...previousPatrolOverview,status:'stale',stale:true,note:`上次成功資料 · ${formatTime(previousPatrolOverview.updatedAt)} · ${note}`}); contract.patrolStores=C.moduleState({...previousPatrolStores,status:'stale',stale:true,note:`上次成功資料 · ${formatTime(previousPatrolStores.updatedAt)} · ${note}`}); contract.patrolToday=C.moduleState({...previousPatrolToday,status:'stale',stale:Boolean(previousPatrolToday.data),note:`上次成功資料 · ${formatTime(previousPatrolToday.updatedAt)} · ${note}`}); }
      else { contract.patrolOverview=statusModule('patrolOverview',expired?'unauthorized':'error',null,note); contract.patrolToday=statusModule('patrolToday',expired?'unauthorized':'error',null,note); contract.patrolStores=statusModule('patrolStores',expired?'unauthorized':'error',null,note); }
      if(expired)setMessage('#patrolAccessMessage','班表／巡店授權已逾時，請重新驗證','error');
      renderAll();
    });

    const mileageTask=patrolRead('ptmileage2',{month}).then(result=>{
      const data=adaptPatrolMileage(result,month);
      patrolMileageState={status:'ok',data,note:''};
      const today=data.days.find(day=>day.date===taipeiDate());
      if(today&&today.route.length){
        contract.patrolToday=C.moduleState({status:'ok',updatedAt:nowIso(),sourceUpdatedAt:nowIso(),stale:false,source:moduleSource('巡店 ptmileage2','patrol.html'),data:{route:today.route,completed:today.route.length,total:today.route.length,nextStop:'—',nextEta:'',distanceKm:today.km}});
      }
      renderAll();
    }).catch(error=>{
      const note=String(error&&error.message||'正式移動里程讀取失敗。');
      patrolMileageState=previousMileageState.data&&previousMileageState.data.month===month?{status:'stale',data:previousMileageState.data,note:`上次成功資料 · ${note}`}:{status:'error',data:null,note};
      renderPatrol();
    });

    const visitTask=patrolRead('ptvisit_read',{date:taipeiDate()}).then(result=>{
      patrolVisitEvents=formalPatrolVisitEvents(result.events);
      patrolOpenVisit=isFormalPatrolVisit(result.openVisit)?result.openVisit:latestOpenPatrolVisit(patrolVisitEvents);
      patrolStaleOpenVisit=result.staleOpenVisit||null;
      patrolVisitError='';
      renderPatrolVisits();
    }).catch(error=>{
      if(previousVisitEvents.length){ patrolVisitEvents=previousVisitEvents; patrolOpenVisit=previousOpenVisit; patrolVisitError=`上次成功資料 · ${String(error.message||'今日到離店紀錄讀取失敗')}`; }
      else { patrolVisitEvents=[]; patrolOpenVisit=null; patrolStaleOpenVisit=null; patrolVisitError=/授權已逾時/.test(error.message)?'班表／巡店授權已逾時，請重新驗證':String(error.message||'今日到離店紀錄讀取失敗'); }
      renderPatrolVisits();
    });
    return Promise.allSettled([scheduleTask,patrolTask,mileageTask,visitTask]);
  }

  function populatePatrolVisitStores(names, selected = '') {
    const select=dom('#patrolVisitStore');
    select.innerHTML='<option value="" disabled>請選擇店點</option>'+names.map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    select.value=names.includes(selected)?selected:'';
  }

  function updatePatrolVisitSubmitState() {
    const departure=dom('#patrolVisitAction').value==='departure';
    const open=latestOpenPatrolVisit();
    dom('#patrolVisitSubmit').disabled=departure?!open:!dom('#patrolVisitStore').value;
  }

  function validatePatrolVisitWriteResult(result, action, submittedStore, openVisit) {
    const event=result&&result.event;
    if(!event||event.action!==action||!event.serverTime||!event.visitSessionId) throw new Error('伺服器未回傳完整到離店寫入結果。');
    if(normalizeStore(event.store)!==normalizeStore(submittedStore)) throw new Error('伺服器回傳店點與送出店點不一致，未顯示成功。');
    if(action==='departure'&&(!openVisit||event.visitSessionId!==openVisit.visitSessionId)) throw new Error('離店紀錄未綁定目前到店 session，未顯示成功。');
    return event;
  }

  function openPatrolVisitDialog(action) {
    if(!patrolToken||PREVIEW_MODE||patrolVisitError) return;
    const overview=contract.patrolOverview.data;
    const stores=overview&&Array.isArray(overview.stores)?overview.stores.map(row=>row.name):STORES;
    const open=latestOpenPatrolVisit();
    const departure=action==='departure';
    populatePatrolVisitStores(stores,departure&&open?normalizeStore(open.store):'');
    dom('#patrolVisitAction').value=action;
    dom('#patrolVisitDialogTitle').textContent=departure?'巡店離店':'巡店到店';
    dom('#patrolVisitSubmit').textContent=departure?'確認離店':'確認到店';
    dom('#patrolVisitStore').disabled=departure;
    dom('#patrolVisitCurrentStore').hidden=!departure;
    dom('#patrolVisitCurrentStore').textContent=departure&&open?`目前在：${normalizeStore(open.store)}`:'';
    dom('#patrolVisitNote').value='';
    updatePatrolVisitSubmitState();
    dom('#patrolVisitDialog').showModal();
  }

  async function submitPatrolVisit(form) {
    const button=dom('#patrolVisitSubmit'); const action=dom('#patrolVisitAction').value; const store=dom('#patrolVisitStore').value; const open=latestOpenPatrolVisit();
    if(!store) { setMessage('#patrolVisitMessage','請先明確選擇店點。','error'); updatePatrolVisitSubmitState(); return; }
    button.disabled=true;
    try {
      const result=await patrolVisitWrite(action,store,dom('#patrolVisitNote').value);
      const event=validatePatrolVisitWriteResult(result,action,store,open);
      patrolVisitEvents=formalPatrolVisitEvents(Array.isArray(result.events)?result.events:patrolVisitEvents.concat(event));
      patrolOpenVisit=result.openVisit||null;
      patrolStaleOpenVisit=result.staleOpenVisit||null;
      patrolVisitError=''; dom('#patrolVisitDialog').close(); renderPatrolVisits();
      setMessage('#patrolVisitMessage',`✅ 已記錄\n${formatTime(event.serverTime)} ${event.action==='arrival'?'到店':'離店'}｜${normalizeStore(event.store)}`,'success');
    } catch(error) {
      dom('#patrolVisitDialog').close(); setMessage('#patrolVisitMessage',error.message,'error');
      if(/授權已逾時/.test(error.message)) setView('me');
    } finally { updatePatrolVisitSubmitState(); }
  }

  function populateScheduleStores(names) {
    const select=dom('#scheduleStoreFilter'); const current=select.value;
    select.innerHTML='<option value="">九店全部</option>'+names.map(name=>`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    if (names.includes(current)) select.value=current;
  }

  async function unlockPatrol(passcode) {
    const result=await postPatrolAuth({action:'ptauth',key:String(passcode||'').trim()}); patrolToken=String(result.token||'');
    if (!patrolToken) throw new Error('正式服務未簽發短效 session。');
    scope.sessionStorage.setItem(PATROL_TOKEN_KEY,patrolToken); setMessage('#patrolAccessMessage','短效 session 已驗證，正在讀取班表／巡店。','success'); dom('#patrolLogout').hidden=false; await loadPatrolData();
  }

  async function restorePatrol() {
    if (!patrolToken||PREVIEW_MODE) return;
    try { const result=await postPatrolAuth({action:'ptauth',token:patrolToken}); patrolToken=String(result.token||''); if(!patrolToken) throw new Error('session 已失效'); scope.sessionStorage.setItem(PATROL_TOKEN_KEY,patrolToken); dom('#patrolLogout').hidden=false; await loadPatrolData(); }
    catch (error) {
      if(clearExpiredPatrolSession(error)) setMessage('#patrolAccessMessage',error.message,'error');
      else setMessage('#patrolAccessMessage',`session 保留，恢復失敗：${String(error.message||error)}`,'error');
    }
  }

  function shiftDate(days) {
    const input=dom('#scheduleDate'); const date=new Date(`${input.value||taipeiDate()}T00:00:00+08:00`); date.setDate(date.getDate()+days); input.value=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
    if (scheduleRaw && scheduleRaw.month===input.value.slice(0,7)) { scheduleViewData=adaptSchedule(scheduleRaw,input.value); contract.scheduleByDate=C.moduleState({status:scheduleViewData.stores.length?'ok':'no_data',updatedAt:nowIso(),sourceUpdatedAt:contract.scheduleToday.sourceUpdatedAt,stale:false,source:moduleSource('既有班表 sread','patrol.html'),data:{selectedDate:input.value,availableMonth:scheduleRaw.month,stores:scheduleViewData.stores}}); renderSchedule(); }
    else if (patrolToken) loadPatrolData();
    else renderSchedule();
  }

  all('[data-nav]').forEach(button=>button.addEventListener('click',event=>{ event.preventDefault(); setView(button.dataset.nav); }));
  all('[data-battle-kind]').forEach(button=>button.addEventListener('click',()=>{ battleKind=button.dataset.battleKind; all('[data-battle-kind]').forEach(item=>item.classList.toggle('active',item===button)); renderBattle(); }));
  all('[data-battle-scope]').forEach(button=>button.addEventListener('click',()=>{ battleScope=button.dataset.battleScope; all('[data-battle-scope]').forEach(item=>item.classList.toggle('active',item===button)); renderBattle(); }));
  dom('#battleStoreSelect').addEventListener('change',renderBattle);
  dom('#battleContent').addEventListener('change',event=>{
    if(event.target.id==='personalRoleSelect'){ personalRole=event.target.value; renderBattle(); }
    if(event.target.id==='personalGapMetricSelect'){ personalGapMetric=event.target.value; renderBattle(); }
  });
  all('[data-report-segment]').forEach(button=>button.addEventListener('click',()=>{ reportSegment=Number(button.dataset.reportSegment); all('[data-report-segment]').forEach(item=>item.classList.toggle('active',item===button)); renderReport(); }));
  dom('#privateAccessForm').addEventListener('submit',async event=>{ event.preventDefault(); const button=event.currentTarget.querySelector('button'); button.disabled=true; setMessage('#privateAccessMessage','正在以既有 Approved Device 讀取正式摘要…'); try { await loadFormalSummary(dom('#employeeId').value); } catch(error) { if(!privateAccessPending(error.message))setMessage('#privateAccessMessage',error.message,'error'); } finally { button.disabled=false; } });
  dom('#privateBindingForm').addEventListener('submit',async event=>{ event.preventDefault(); const button=event.currentTarget.querySelector('button'); const input=dom('#bootstrapCode'); const code=input.value; input.value=''; button.disabled=true; try { await requestDeviceBinding(dom('#employeeId').value,code); } catch(error) { setMessage('#privateAccessMessage',error.message,'error'); } finally { button.disabled=false; } });
  dom('#privateStatusCheck').addEventListener('click',async event=>{ event.currentTarget.disabled=true; try { await checkDeviceBinding(dom('#employeeId').value); } catch(error) { setMessage('#privateAccessMessage',error.message,'error'); } finally { event.currentTarget.disabled=false; } });
  dom('#privateLogout').addEventListener('click',logoutPrivateSummary);
  dom('#patrolAccessForm').addEventListener('submit',async event=>{ event.preventDefault(); const button=event.currentTarget.querySelector('button'); const input=dom('#patrolPasscode'); const passcode=input.value; input.value=''; button.disabled=true; try { await unlockPatrol(passcode); } catch(error) { setMessage('#patrolAccessMessage',error.message,'error'); } finally { button.disabled=false; } });
  dom('#patrolLogout').addEventListener('click',()=>{ const token=patrolToken; patrolToken=''; scheduleRaw=null; scheduleViewData=null; patrolVisitEvents=[]; patrolOpenVisit=null; patrolStaleOpenVisit=null; patrolVisitError=''; patrolMileageState={status:'idle',data:null,note:''}; halfMonthFormalRows=[]; halfMonthReadState='unauthorized'; halfMonthReadMessage='請先解鎖班表／巡店'; scope.sessionStorage.removeItem(PATROL_TOKEN_KEY); dom('#patrolLogout').hidden=true; contract.scheduleToday=statusModule('scheduleToday'); contract.scheduleByDate=statusModule('scheduleByDate'); contract.patrolToday=statusModule('patrolToday'); contract.patrolOverview=statusModule('patrolOverview'); contract.patrolStores=statusModule('patrolStores'); renderAll(); if(token) postPatrolAuth({action:'ptlogout',token}).catch(()=>{}); });
  all('[data-patrol-visit]').forEach(button=>button.addEventListener('click',()=>openPatrolVisitDialog(button.dataset.patrolVisit)));
  all('[data-patrol-check-view]').forEach(button=>button.addEventListener('click',()=>{ setPatrolCheckView(button.dataset.patrolCheckView); if(button.dataset.patrolCheckView==='half-month')loadHalfMonthFormalRead(); }));
  dom('#patrolVisitClose').addEventListener('click',()=>dom('#patrolVisitDialog').close());
  dom('#patrolVisitStore').addEventListener('change',updatePatrolVisitSubmitState);
  dom('#patrolVisitForm').addEventListener('submit',event=>{ event.preventDefault(); submitPatrolVisit(event.currentTarget); });
  all('[data-date-step]').forEach(button=>button.addEventListener('click',()=>shiftDate(Number(button.dataset.dateStep))));
  dom('[data-date-today]').addEventListener('click',()=>{ dom('#scheduleDate').value=taipeiDate(); if(patrolToken)loadPatrolData(); else renderSchedule(); });
  dom('#scheduleDate').addEventListener('change',()=>patrolToken?loadPatrolData():renderSchedule());
  dom('#scheduleStoreFilter').addEventListener('change',renderSchedule);
  all('[data-refresh]').forEach(button=>button.addEventListener('click',()=>{ if(PREVIEW_MODE)renderAll(); else { const id=scope.localStorage.getItem(EMPLOYEE_KEY); if(id)loadFormalSummary(id).catch(error=>{ if(!privateAccessPending(error.message))setMessage('#privateAccessMessage',error.message,'error'); }); if(patrolToken)loadPatrolData(); } }));
  document.addEventListener('click',event=>{
    const patrolRetry=event.target.closest('[data-retry-patrol]');
    if(patrolRetry){
      if(patrolToken) loadPatrolData();
      else setMessage('#patrolAccessMessage','請先解鎖班表／巡店','error');
      return;
    }
    const halfPeriodButton=event.target.closest('[data-half-period]');
    if(halfPeriodButton){
      halfMonthSelectedPeriod=halfPeriodButton.dataset.halfPeriod;
      halfMonthPreviewScreen='overview';
      halfMonthPreviewStore='';
      halfMonthPreviewAnswers={};
      halfMonthPreviewMessage='';
      halfMonthPreviewResult=null;
      renderHalfMonthCheck();
      return;
    }
    const halfAnswer=event.target.closest('[data-half-answer]');
    if(halfAnswer){
      if(!PREVIEW_MODE) return;
      const card=halfAnswer.closest('[data-half-preview-question]');
      if(!card) return;
      captureHalfMonthPreviewForm();
      const item=Number(card.dataset.halfPreviewQuestion);
      halfMonthPreviewAnswers[item]={...(halfMonthPreviewAnswers[item]||{}),result:halfAnswer.dataset.halfAnswer};
      halfMonthPreviewMessage='';
      renderHalfMonthCheck();
      return;
    }
    const halfAction=event.target.closest('[data-half-preview-action]');
    if(halfAction){
      const action=halfAction.dataset.halfPreviewAction;
      const data=halfMonthData();
      if(!data) return;
      if(action==='start'){
        halfMonthPreviewStore=halfMonthOpenVisit()?normalizeStore(halfMonthOpenVisit().store):'';
        seedHalfMonthPreviewAnswers(data,halfMonthPreviewStore);
        halfMonthPreviewMessage='';
        halfMonthPreviewResult=null;
        halfMonthPreviewScreen='form';
      }else if(action==='draft'){
        if(!PREVIEW_MODE) return;
        captureHalfMonthPreviewForm();
        halfMonthPreviewMessage='已暫存於 Preview 記憶體；正式資料仍為 0 次寫入。';
      }else if(action==='complete'){
        if(!PREVIEW_MODE) return;
        captureHalfMonthPreviewForm();
        const progress=halfMonthPreviewProgress(data);
        if(!halfMonthPreviewStore){ halfMonthPreviewMessage='請先選擇店點。'; }
        else if(progress.completed<progress.total){ halfMonthPreviewMessage=`尚有 ${progress.total-progress.completed} 題未選狀態；Preview 未完成。`; }
        else{
          const abnormal=(data.questions||[]).filter(question=>halfMonthPreviewAnswers[question.item]?.result==='abnormal').map(question=>({item:question.item,title:question.title,...halfMonthPreviewAnswers[question.item]}));
          halfMonthPreviewResult={store:halfMonthPreviewStore,completed:progress.completed,total:progress.total,abnormal};
          halfMonthPreviewScreen='result';
          halfMonthPreviewMessage='';
        }
      }else if(action==='overview'){
        halfMonthPreviewScreen='overview';
        halfMonthPreviewMessage='';
      }
      renderHalfMonthCheck();
      return;
    }
    const privateUnlock=event.target.closest('[data-unlock-private]'); if(privateUnlock){ setView('me'); dom('#employeeId').focus(); return; }
    const patrolUnlock=event.target.closest('[data-unlock-patrol]'); if(patrolUnlock){ setView('me'); dom('#patrolPasscode').focus(); return; }
    const scheduleButton=event.target.closest('[data-toggle-home-schedule]'); if(scheduleButton){ const card=scheduleButton.closest('#scheduleHome'); const expanded=card.classList.toggle('expanded'); scheduleButton.setAttribute('aria-expanded',String(expanded)); scheduleButton.querySelector('span').textContent=expanded?'收合當日班表':'顯示九店當日班表'; return; }
    const operationButton=event.target.closest('[data-toggle-operation]'); if(operationButton){ const item=operationButton.closest('.operation-item'); item.classList.toggle('expanded'); operationButton.setAttribute('aria-expanded',item.classList.contains('expanded')); return; }
    const reportButton=event.target.closest('[data-open-report]'); if(reportButton){ reportSegment=Number(reportButton.dataset.openReport); all('[data-report-segment]').forEach(button=>button.classList.toggle('active',Number(button.dataset.reportSegment)===reportSegment)); setView('report'); renderReport(); return; }
    const yesterdayButton=event.target.closest('[data-open-yesterday-followup]'); if(yesterdayButton){ setView('report'); renderYesterdayFollowUp(); scope.setTimeout(()=>dom('#yesterdayFollowUpPanel').scrollIntoView({block:'start',behavior:'smooth'}),0); return; }
    const awardLink=event.target.closest('[data-open-awards]'); if(awardLink){ event.preventDefault(); battleKind='award'; battleScope='region'; all('[data-battle-kind]').forEach(button=>button.classList.toggle('active',button.dataset.battleKind==='award')); all('[data-battle-scope]').forEach(button=>button.classList.toggle('active',button.dataset.battleScope==='region')); setView('battle'); renderBattle(); return; }
    const storeButton=event.target.closest('.store-row'); if(storeButton){ const item=storeButton.closest('.store-item'); item.classList.toggle('expanded'); storeButton.setAttribute('aria-expanded',item.classList.contains('expanded')); return; }
    const personalButton=event.target.closest('.personal-performance-button'); if(personalButton){ const item=personalButton.closest('.personal-performance-item'); item.classList.toggle('expanded'); personalButton.setAttribute('aria-expanded',item.classList.contains('expanded')); return; }
    const personalViewButton=event.target.closest('[data-personal-view]'); if(personalViewButton){ personalRegionView=personalViewButton.dataset.personalView; renderBattle(); return; }
    const reportStore=event.target.closest('.report-store-button'); if(reportStore){ const item=reportStore.closest('.report-store'); item.classList.toggle('expanded'); reportStore.setAttribute('aria-expanded',item.classList.contains('expanded')); }
  });
  document.addEventListener('change',event=>{
    if(event.target.id!=='halfMonthStore') return;
    halfMonthPreviewStore=event.target.value;
    seedHalfMonthPreviewAnswers(halfMonthData(),halfMonthPreviewStore);
    halfMonthPreviewMessage=PREVIEW_MODE?'已載入此店 Preview 值；修改只存在本機。':'已載入此店正式目前值；目前為唯讀。';
    renderHalfMonthCheck();
  });
  scope.addEventListener('hashchange',()=>{ const name=location.hash.slice(1); if(all('[data-view]').some(view=>view.dataset.view===name))setView(name); });

  dom('#scheduleDate').value=taipeiDate();
  if (PREVIEW_MODE) {
    scheduleViewData=contract.scheduleToday.data;
    populateScheduleStores((contract.scheduleToday.data.stores||[]).map(row=>row.store));
    dom('#employeeId').disabled=true; dom('#privateAccessForm button').disabled=true; dom('#patrolPasscode').disabled=true; dom('#patrolAccessForm button').disabled=true;
    setMessage('#privateAccessMessage','Preview 僅顯示展示資料，不呼叫正式端點。'); setMessage('#patrolAccessMessage','Preview 不建立正式 session。'); dom('#viewerState').textContent='Preview';
  } else {
    const stored=scope.localStorage.getItem(EMPLOYEE_KEY)||''; dom('#employeeId').value=stored;
    setPrivateAccessState('unauthorized');
    if(stored) loadFormalSummary(stored).catch(error=>{ if(!privateAccessPending(error.message))setMessage('#privateAccessMessage',error.message,'error'); });
    restorePatrol();
  }
  const initial=location.hash.slice(1); setView(all('[data-view]').some(view=>view.dataset.view===initial)?initial:'home'); renderAll();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') scope.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js?v=app-na-v-20260903-1',{scope:'./',updateViaCache:'none'}).catch(()=>{}));
})(window);
