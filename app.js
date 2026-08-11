(function startLiamSupervisorApp(scope) {
  'use strict';

  const C = scope.LiamSupervisorContract;
  const DAILY_REPORT_API = 'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
  const PATROL_API = 'https://script.google.com/macros/s/AKfycbznzoWOzzPJLEh8PCwTLw8UfWEyiCXwawd0T49JXpK4MP70vTdrrfTMN1G2Grghd-Mv/exec';
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
  const PATROL_READ_ACTIONS = new Set(['sread','ptread','ptvisit_read']);
  const PATROL_WRITE_ACTIONS = new Set(['ptvisit_write']);
  const PRIVATE_MODULE_KEYS = ['todayOperations','kpiSummary','kpiStores','kpiFullMetrics','awardSummary','awardStores','awardTop2Models','personalPerformance','report1600','report2100','reportFailures'];
  const PREVIEW_MODE = new URLSearchParams(scope.location.search).get('preview') === '1';
  const STALE_MS = 30 * 60 * 60 * 1000;

  let contract = PREVIEW_MODE ? C.validateContract(scope.LiamSupervisorPreviewData) : emptyFormalContract();
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
      scheduleToday:moduleSource('既有班表 sread','patrol.html'), scheduleByDate:moduleSource('既有班表 sread','patrol.html'),
      patrolToday:moduleSource('巡店唯讀摘要','patrol.html'), patrolOverview:moduleSource('既有巡店 ptread','patrol.html'), patrolStores:moduleSource('既有巡店 ptread','patrol.html')
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
    const response = await fetch(DAILY_REPORT_API, {
      method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body:JSON.stringify(payload), cache:'no-store', credentials:'omit'
    });
    if (!response.ok) throw new Error(`正式摘要連線失敗（HTTP ${response.status}）`);
    const body = await response.json();
    if (!body || body.status !== 'ok') throw new Error((body && body.message) || '正式摘要讀取失敗。');
    return body;
  }

  async function postDeviceAccess(payload) {
    if (!DEVICE_ACTIONS.has(payload.action)) throw new Error('不允許的裝置授權 action。');
    const response = await fetch(DAILY_REPORT_API, {
      method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body:JSON.stringify(payload), cache:'no-store', credentials:'omit'
    });
    if (!response.ok) throw new Error(`裝置授權連線失敗（HTTP ${response.status}）`);
    const body = await response.json();
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
      : '尚未解鎖這台 iPhone App 裝置';
    if (message) setMessage('#privateAccessMessage',message,status === 'approved' ? 'success' : status === 'pending' ? '' : 'error');
  }

  function resetPrivateSummary(status = 'unauthorized', note = '') {
    PRIVATE_MODULE_KEYS.forEach(key => { contract[key] = statusModule(key,status,null,note); });
    contract.kpiStores = statusModule('kpiStores',status,[],note);
    contract.kpiFullMetrics = statusModule('kpiFullMetrics',status,{region:[],stores:{}},note);
    contract.awardStores = statusModule('awardStores',status,[],note);
    contract.awardTop2Models = statusModule('awardTop2Models',status,[],note);
    contract.personalPerformance = statusModule('personalPerformance',status,{ summary:null, people:[] },note);
    contract.generatedAt = nowIso();
  }

  async function postPatrolAuth(payload) {
    if (!['ptauth','ptlogout'].includes(payload.action)) throw new Error('不允許的 session action。');
    const response = await fetch(PATROL_API, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload), cache:'no-store' });
    const body = await response.json();
    if (!body || body.status !== 'ok') throw new Error((body && body.message) || '班表／巡店驗證失敗。');
    return body;
  }

  async function patrolRead(action, params = {}) {
    if (!PATROL_READ_ACTIONS.has(action)) throw new Error('App 1.2 僅允許既有班表／巡店讀取與獨立到離店讀取。');
    if (!patrolToken) throw new Error('班表／巡店 session 尚未驗證。');
    const url = new URL(PATROL_API);
    url.searchParams.set('action', action);
    url.searchParams.set('token', patrolToken);
    Object.entries(params).forEach(([key,value]) => { if (value) url.searchParams.set(key,value); });
    const response = await fetch(url, { method:'GET', cache:'no-store' });
    const body = await response.json();
    if (!body || body.status !== 'ok') {
      const message = (body && body.message) || '班表／巡店讀取失敗。';
      if (/unauthorized|session|授權|逾時|失效/i.test(message)) {
        patrolToken='';
        scope.sessionStorage.removeItem(PATROL_TOKEN_KEY);
        dom('#patrolLogout').hidden=true;
        throw new Error('班表／巡店授權已逾時，請重新驗證');
      }
      throw new Error(message);
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
      const message=(body&&body.message)||'到離店寫入失敗。';
      if (/unauthorized|session|授權|逾時|失效/i.test(message)) {
        patrolToken=''; scope.sessionStorage.removeItem(PATROL_TOKEN_KEY); dom('#patrolLogout').hidden=true;
        throw new Error('班表／巡店授權已逾時，請重新驗證');
      }
      throw new Error(message);
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

  function sourceFileName(value) { return String(value || '').split(/[\\/]/).pop().trim().toLowerCase(); }

  function kpiSupplementIsCurrent(data, supplement) {
    const dataAsOf = kpiDataAsOfDate(data);
    const supplementAsOf = String(supplement && (supplement.data_as_of_date || supplement.source_as_of_date) || '');
    return Boolean(dataAsOf && supplement && supplement.report_date && supplementAsOf === dataAsOf &&
      sourceFileName(supplement.source_file) && sourceFileName(supplement.source_file) === sourceFileName(data && data.meta && data.meta.sourceFile));
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
    const summary = { totalAmount, regionTotalAvailable:totalAmount != null, winningStores, totalStores:9, reportDate };
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

  function adaptReport(segment, storeData, personalData, formalSummary) {
    const summary = formalSummary && typeof formalSummary === 'object' ? formalSummary : null;
    const summaryStores = new Map((summary && Array.isArray(summary.stores) ? summary.stores : []).map(row => [normalizeStore(row.name), row]));
    const stores = STORES.map(name => {
      const report = (storeData || {})[name] || (storeData || {})[normalizeStore(name)] || null;
      const summaryStore = summaryStores.get(normalizeStore(name)) || null;
      const peopleSource = (personalData || {})[name] || {};
      const people = Object.entries(peopleSource).map(([personName,raw]) => ({ name:personName, ...personalRecord(raw) }));
      const metrics = summaryStore ? Object.fromEntries(Object.entries(summaryStore.metrics || {}).map(([key,metric]) => [key,numberOrNull(metric && metric.value)]).filter(([,value]) => value != null)) : {};
      return { name, reported:summaryStore ? Boolean(summaryStore.reported) : Boolean(report), reportedAt:summaryStore ? String(summaryStore.reportedAt || '') : report ? String(report.savedAt || report.updatedAt || '') : '', metrics, people };
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
      resetPrivateSummary('unauthorized',pending ? '此 iPhone App 裝置待核准' : '正式資料尚未解鎖');
      setPrivateAccessState(pending ? 'pending' : 'unauthorized',pending ? '此 iPhone App 裝置待核准。核准後按「查看核准狀態」。' : String(error.message || error));
      dom('#viewerState').textContent = pending ? '待核准' : '未登入';
      dom('#privateLogout').hidden = false;
      renderAll();
      throw error;
    }
    const requests = await Promise.allSettled([
      postReadOnly({ action:'kpicalc_access', ...credential }),
      postReadOnly({ action:'read', date:taipeiDate(), seg:16 }),
      postReadOnly({ action:'read', date:taipeiDate(), seg:21 }),
      postReadOnly({ action:'pread', date:taipeiDate(), seg:16 }),
      postReadOnly({ action:'pread', date:taipeiDate(), seg:21 })
    ]);
    const snapshot = privateResult.snapshot || {};
    const readAt = nowIso();
    const kpi = requests[0].status === 'fulfilled'
      ? adaptKpi(requests[0].value.data || {}, snapshot, readAt)
      : { summary:statusModule('kpiSummary','error',null,'正式 kpicalc 讀取失敗'), stores:statusModule('kpiStores','error',[], '正式 kpicalc 讀取失敗'), full:statusModule('kpiFullMetrics','error',{region:[],stores:{}},'正式 kpicalc 讀取失敗') };
    const awards = adaptAwards(snapshot, kpi.summary.data && kpi.summary.data.reportDate, readAt);
    const personalPerformance = adaptPersonalPerformance(snapshot, readAt);
    const report16 = adaptReport(16, requests[1].status === 'fulfilled' ? requests[1].value.data : {}, requests[3].status === 'fulfilled' ? requests[3].value.data : {}, requests[1].status === 'fulfilled' ? requests[1].value.summary : null);
    const report21 = adaptReport(21, requests[2].status === 'fulfilled' ? requests[2].value.data : {}, requests[4].status === 'fulfilled' ? requests[4].value.data : {}, requests[2].status === 'fulfilled' ? requests[2].value.summary : null);
    const reportModule = (report, result) => C.moduleState({
      status:result.status === 'fulfilled' ? (report.completedStores === 0 ? 'no_data' : report.completedStores === 9 && report.summaryAvailable ? 'ok' : 'partial') : 'error', updatedAt:readAt,
      sourceUpdatedAt:report.updatedAt, stale:false, source:moduleSource('北一二B每日回報','index.html'), data:report,
      note:result.status !== 'fulfilled' ? '正式回報來源讀取失敗' : !report.summaryAvailable ? '正式來源尚未提供 report summary adapter；營運摘要 fail-closed。' : report.completedStores === 0 ? `尚未進入／尚無正式 ${report.segment}:00 回報` : ''
    });
    contract = C.validateContract({
      ...contract, version:C.VERSION, generatedAt:readAt, mode:'formal',
      todayOperations:C.moduleState({ status:'ok', updatedAt:readAt, sourceUpdatedAt:report21.updatedAt || report16.updatedAt, stale:false, source:moduleSource('北一二B每日回報','index.html'), data:{ date:taipeiDate(), segments:[report16,report21] } }),
      kpiSummary:kpi.summary, kpiStores:kpi.stores, kpiFullMetrics:kpi.full,
      awardSummary:awards.summary, awardStores:awards.stores, awardTop2Models:awards.top2,
      personalPerformance,
      report1600:reportModule(report16,requests[1]), report2100:reportModule(report21,requests[2]),
      reportFailures:C.moduleState({ status:requests[3].status === 'fulfilled' || requests[4].status === 'fulfilled' ? 'ok':'error', updatedAt:readAt, sourceUpdatedAt:report21.updatedAt || report16.updatedAt, stale:false, source:moduleSource('正式個人回報','index.html'), data:{16:failureSummary(report16),21:failureSummary(report21)} })
    });
    privateAccessStatus = 'approved';
    dom('#viewerState').textContent = privateResult.profile && privateResult.profile.maskedName ? privateResult.profile.maskedName : 'Approved';
    dom('#privateLogout').hidden = false;
    setPrivateAccessState('approved','已由既有 Approved Device 讀回正式唯讀摘要。');
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
  function fmtSigned(value) { if (value == null) return '—'; const n=Number(value); return n===0?'—':`${n>0?'↑':'↓'}${Math.abs(n)}`; }
  function fmtNumber(value, digits=2) { if (value == null) return '—'; return Number(value).toLocaleString('zh-TW',{maximumFractionDigits:digits}); }
  function valueClass(value) { if (value == null || Number(value)===0) return 'neutral-value'; return Number(value)>0?'positive':'negative'; }
  function privateUnlockState(message = '解鎖後顯示正式資料') {
    return `<div class="unlock-state"><span>${escapeHtml(message)}</span><button class="unlock-cta" type="button" data-unlock-private>解鎖正式資料</button></div>`;
  }
  function patrolUnlockState(message = '解鎖後顯示班表／巡店') {
    return `<div class="unlock-state"><span>${escapeHtml(message)}</span><button class="unlock-cta" type="button" data-unlock-patrol>班表／巡店解鎖</button></div>`;
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
    mode.textContent = contract.mode === 'preview' ? 'Preview／示意資料' : privateAccessStatus === 'approved' ? '正式唯讀' : privateAccessStatus === 'pending' ? '裝置待核准' : '解鎖正式資料';
    dom('#previewBanner').hidden = contract.mode !== 'preview';
    document.body.classList.toggle('preview-mode',contract.mode === 'preview');
  }

  function renderOperations() {
    const rows = contract.todayOperations.data && contract.todayOperations.data.segments || [];
    dom('#operationsRows').innerHTML = rows.length ? rows.map(segment => {
      const failures = contract.reportFailures.data && contract.reportFailures.data[segment.segment] || {};
      const missing = segment.missingStores ? segment.missingStores.length : Math.max(0,9-segment.completedStores);
      const summaryMetrics = segment.summaryMetrics || {};
      const failingPeople = failures.people || [];
      return `<article class="operation-item"><div class="operation-row">
        <span class="operation-time">${escapeHtml(segment.segment)}:00</span>
        <span class="operation-metric"><span>已回報</span><b class="${segment.completedStores===9?'good':'warn'}">${segment.completedStores}/9</b></span>
        <span class="operation-metric"><span>缺店</span><b class="${missing?'warn':'good'}">${missing}</b></span>
        <span class="operation-metric"><span>未過店</span><b class="${failures.failedStoreCount?'bad':'good'}">${failures.failedStoreCount || 0}</b></span>
        <span class="operation-metric"><span>未過人</span><b class="${failures.failedPeopleCount?'bad':'good'}">${failures.failedPeopleCount || 0}</b></span>
        <button class="attention-button" type="button" data-toggle-operation="${segment.segment}" aria-label="展開 ${segment.segment}:00 戰況"><i data-lucide="triangle-alert"></i></button>
      </div><div class="operation-detail"><div class="operation-detail-summary">${['A999','好速','R999','R1399'].filter(key=>summaryMetrics[key]).map(key=>`<span>${key} ${formatOperationMetric(summaryMetrics[key])}</span>`).join('') || '<span>正式營運摘要尚無資料</span>'}</div>
        <div class="operation-detail-summary operation-detail-percent">${['保險搭售率','設備案佔比'].filter(key=>summaryMetrics[key]).map(key=>`<span>${key==='保險搭售率'?'保險':'設備案'} ${formatOperationMetric(summaryMetrics[key])}</span>`).join('')}</div>
        <p>${segment.missingStores.length?`未回報：${segment.missingStores.map(escapeHtml).join('、')}`:'九店已完成回報'}${failingPeople.length?`｜未過關：${failingPeople.slice(0,3).map(person=>`${escapeHtml(person.store)} ${escapeHtml(person.name)}（${escapeHtml(person.failed.join('、'))}）`).join('、')}`:'｜目前無正式未過關紀錄'}</p>
        <div>${segment.stores.filter(store=>store.reported).map(store=>`<div class="operation-store-mini"><span>${escapeHtml(store.name)}</span>${['A999','好速','R999','R1399'].map(key=>`<span>${store.metrics&&store.metrics[key]!=null?fmtNumber(store.metrics[key],1):'—'}</span>`).join('')}</div>`).join('')}</div>
      </div></article>`;
    }).join('') : privateUnlockState(privateAccessStatus === 'pending' ? '此 iPhone App 裝置待核准' : '正式回報摘要尚未解鎖');
  }

  function renderKpiHero() {
    if (contract.kpiSummary.status === 'unauthorized') {
      dom('#kpiHero').innerHTML = privateUnlockState(privateAccessStatus === 'pending' ? '此 iPhone App 裝置待核准' : 'KPI／台獎／回報尚未解鎖');
      return;
    }
    const data = contract.kpiSummary.data || {};
    dom('#kpiHero').innerHTML = `<div class="kpi-stat"><span>KPI</span><strong class="cyan-value">${fmtPct(data.kpi)}</strong><div class="mini-progress"><i style="width:${Math.min(100,Math.max(0,Number(data.kpi||0)*100))}%"></i></div></div>
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
    dom('#homeStoreList').innerHTML = rows.length ? rows.map(storeRow).join('') : contract.kpiStores.status === 'unauthorized' ? privateUnlockState('Approved Device 核准後顯示九店摘要') : '<div class="empty-state">正式來源目前沒有九店摘要。</div>';
  }

  function renderAwardsHome() {
    if (contract.awardSummary.status === 'unauthorized') {
      dom('#awardHome').innerHTML = `<h2 id="awardHomeTitle" class="sr-only">台獎總覽</h2>${privateUnlockState('台獎九店摘要尚未解鎖')}`;
      return;
    }
    const summary = contract.awardSummary.data || {};
    const stores = Array.isArray(contract.awardStores.data) ? contract.awardStores.data : [];
    const losingStores=summary.winningStores==null?'—':Math.max(0,Number(summary.totalStores||9)-Number(summary.winningStores));
    dom('#awardHome').innerHTML = `<div class="award-summary"><h2 id="awardHomeTitle">台獎總覽</h2><span>領獎店數 <b>${summary.winningStores??'—'}<small> / 9</small></b></span><span>未領獎店數 <b>${losingStores}</b></span></div>
      <div class="award-list"><div class="award-row header"><span>店名</span><span>獎勵金額</span><span>狀態</span></div>${stores.map(row=>`<div class="award-row"><span>${escapeHtml(row.name)}</span><span class="award-amount">${row.amount==null?'—':'$'+fmtNumber(row.amount,0)}</span><span><i class="award-tag ${row.eligible?'':'no'}">${row.eligible?'領獎':'未領獎'}</i></span></div>`).join('')}</div>
      <a class="award-link" href="#battle" data-open-awards>查看完整台獎摘要 <i data-lucide="arrow-right"></i></a>`;
  }

  function renderScheduleHome() {
    const data = contract.scheduleToday.data;
    const node = dom('#scheduleHome');
    if (!data || !Array.isArray(data.stores) || !data.stores.length) {
      node.innerHTML = `<div class="home-schedule-head"><span class="compact-icon"><i data-lucide="calendar-days"></i></span><div class="compact-copy"><h2 id="scheduleHomeTitle">今日班表</h2><p>${contract.scheduleToday.status==='unauthorized'?'班表／巡店尚未解鎖':'目前尚無班表摘要'}</p></div><span class="compact-next"><b>${formatDate(taipeiDate())}</b><small>${contract.scheduleToday.note||'唯讀'}</small></span></div>${contract.scheduleToday.status==='unauthorized'?patrolUnlockState('使用既有 30 分鐘短效授權'):''}`;
      return;
    }
    const working = data.stores.reduce((sum,row)=>sum+Number(row.working||0),0);
    const off = data.stores.reduce((sum,row)=>sum+Number(row.off||0),0);
    const rows = data.stores.map(row => {
      const shifts = [...new Set((row.staff||[]).map(person=>person.status).filter(Boolean))];
      return `<div class="home-schedule-row"><span><b>${escapeHtml(row.store)}</b><small>${escapeHtml(shifts.join(' · ')||'尚無班別')}</small></span><span class="positive">上班 ${row.working}</span><span>休假 ${row.off}</span></div>`;
    }).join('');
    node.innerHTML = `<div class="home-schedule-head"><span class="compact-icon"><i data-lucide="calendar-days"></i></span><div class="compact-copy"><h2 id="scheduleHomeTitle">今日班表</h2><p>${data.stores.length} 店 · 上班 ${working} 人 · 休假 ${off} 人</p></div><span class="compact-next"><b>${formatDate(data.date)}</b><small>更新 ${formatTime(contract.scheduleToday.sourceUpdatedAt)}</small></span></div><div class="home-schedule-list">${rows}</div><button class="home-schedule-toggle" type="button" data-toggle-home-schedule aria-expanded="false"><span>顯示九店當日班表</span><i data-lucide="chevron-down"></i></button>`;
  }

  function renderPatrolHome() {
    const data = contract.patrolToday.data;
    const node = dom('#patrolHome');
    if (!data || !Array.isArray(data.route) || !data.route.length) {
      node.innerHTML = `<span class="compact-icon"><i data-lucide="route"></i></span><div class="compact-copy"><h2 id="patrolHomeTitle">今日巡店</h2><p>${contract.patrolToday.note || '今日無排定巡店'}</p></div><span class="compact-next"><b>${contract.patrolToday.status==='unauthorized'?'需解鎖':'今日無排定'}</b><small>不自行推測路線</small></span>${contract.patrolToday.status==='unauthorized'?patrolUnlockState('使用既有 30 分鐘短效授權'):''}`;
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
      const storePeople=allPeople.filter(person=>person.store===selected);
      return `<div class="award-selected-store"><span>店點個績</span><strong>${escapeHtml(selected)}</strong></div><section class="panel personal-performance-panel"><div class="panel-head"><div><h2>店點人員</h2><small>${storePeople.length} 人 · 維持正式來源排序</small></div></div><div class="personal-performance-list">${storePeople.map(person=>personalPerformanceRow(person)).join('') || '<div class="empty-state">此店正式來源目前沒有個績人員。</div>'}</div></section><p class="personal-source-note">${escapeHtml(module.note || '')}</p><a class="source-button" href="index.html">開啟正式個績網站 <i data-lucide="external-link"></i></a>`;
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
      content.innerHTML=`<div class="metric-card-grid"><article class="metric-card"><span>領獎店數</span><strong>${a.winningStores??'—'}/9</strong><small>正式台獎判定</small></article><article class="metric-card"><span>未領獎店數</span><strong>${a.winningStores==null?'—':Math.max(0,9-a.winningStores)}</strong><small>九店完整顯示</small></article></div><div class="battle-list award-battle-list"><div class="battle-list-row award-battle-row header"><span>店點</span><span>金額</span><span>狀態</span></div>${awardStores.map(row=>`<div class="battle-list-row award-battle-row"><span>${escapeHtml(row.name)}</span><span>${row.amount==null?'—':'$'+fmtNumber(row.amount,0)}</span><span class="${row.eligible?'positive':'neutral-value'}">${row.eligible?'領獎':'未領獎'}</span></div>`).join('')}</div>`;
    } else if (battleKind === 'award') {
      const row=awardStores.find(item=>item.name===selected);
      content.innerHTML=row?`<div class="award-selected-store"><span>店點</span><strong>${escapeHtml(row.name)}</strong></div><div class="metric-card-grid"><article class="metric-card"><span>店領獎金額</span><strong class="gold-value">${row.amount==null?'—':'$'+fmtNumber(row.amount,0)}</strong><small>正式台獎金額</small></article><article class="metric-card"><span>領獎狀態</span><strong class="${row.eligible?'positive':'neutral-value'}">${row.eligible?'領獎':'未領獎'}</strong><small>正式台獎判定</small></article></div>${renderAwardStoreItems(row)}<a class="source-button" href="index.html">完整台獎入口 <i data-lucide="external-link"></i></a>`:'<div class="empty-state">尚無此店台獎摘要。</div>';
    } else content.innerHTML = renderPersonalPerformance(selected);
    refreshIcons();
  }

  function activeReport() { return reportSegment===16?contract.report1600:contract.report2100; }

  function renderReport() {
    const module=activeReport(); const report=module.data; const failures=contract.reportFailures.data&&contract.reportFailures.data[reportSegment];
    if (!report) { dom('#reportOverview').innerHTML=privateUnlockState(privateAccessStatus === 'pending' ? '此 iPhone App 裝置待核准' : '解鎖後顯示 16:00／21:00 正式回報'); dom('#reportOperations').innerHTML=''; dom('#reportFailures').innerHTML=''; dom('#reportStoreList').innerHTML=''; return; }
    dom('#reportOverview').innerHTML=`<div class="report-summary"><article><span>完成店數</span><b class="${report.completedStores===9?'positive':''}">${report.completedStores}/9</b></article><article><span>尚未完成</span><b class="${report.missingStores.length?'negative':'positive'}">${report.missingStores.length}</b></article><article><span>最後更新</span><b>${escapeHtml(report.updatedAt||'—')}</b></article></div>${report.missingStores.length?`<p class="stale-note">尚未完成：${report.missingStores.map(escapeHtml).join('、')}</p>`:''}`;
    const summaryMetrics=report.summaryMetrics||{};
    dom('#reportOperations').innerHTML=report.summaryAvailable&&Object.keys(summaryMetrics).length?`<div class="report-operation-grid">${['A999','好速','R1399','R999','保險搭售率','設備案佔比'].filter(key=>summaryMetrics[key]).map(key=>`<article><span>${escapeHtml(key==='A999'?'A999 上線數':key==='好速'?'好速銷售點數':key==='R1399'?'R1399 上線數':key==='R999'?'R999 上線數':key)}</span><b>${formatOperationMetric(summaryMetrics[key])}</b></article>`).join('')}</div>`:`<div class="empty-state">${module.status==='no_data'?`尚未進入／尚無正式 ${report.segment}:00 回報`:'正式來源尚未提供營運摘要欄位；App 不自行計算。'}</div>`;
    dom('#reportFailures').innerHTML=failures?`<div class="failure-summary"><div class="failure-grid"><div><span>未過關店數</span><b class="${failures.failedStoreCount?'negative':'positive'}">${failures.failedStoreCount}</b></div><div><span>未過關人數</span><b class="${failures.failedPeopleCount?'negative':'positive'}">${failures.failedPeopleCount}</b></div><div><span>未回報店點</span><b>${failures.missingStores.length}</b></div><div><span>各指標未過人數</span><b>${Object.entries(failures.byMetric||{}).map(([key,value])=>`${escapeHtml(key)} ${value}`).join(' · ')||'0'}</b></div></div><div class="tracking-list">${(failures.people||[]).map(person=>`<div class="tracking-item"><b>${escapeHtml(person.store)} · ${escapeHtml(person.name)}</b><br>${escapeHtml(person.failed.join('、')||'未過關')}｜${escapeHtml(person.reason||'尚未填寫原因')}</div>`).join('')||'<div class="empty-state">目前沒有正式未過關紀錄。</div>'}</div></div>`:'<div class="empty-state">尚無個人未過關資料。</div>';
    dom('#reportStoreList').innerHTML=report.stores.map(store=>{
      const failed=store.people.filter(person=>person.status==='fail').length;
      const status=!store.reported?'未回報':failed?'未過關':store.people.length?'過關':'已回報';
      return `<article class="report-store"><button class="report-store-button" type="button" aria-expanded="false"><span>${escapeHtml(store.name)}</span><span class="${store.reported?'positive':'negative'}">${store.reported?'已回報':'未回報'}</span><span class="${status==='未過關'?'negative':status==='過關'?'positive':''}">${status}</span><span>${escapeHtml(store.reportedAt||'—')}</span><i data-lucide="chevron-down"></i></button><div class="report-person-list"><div class="report-store-operation-grid">${['A999','好速','R1399','R999','保險搭售率','設備案佔比'].filter(key=>store.metrics&&store.metrics[key]!=null).map(key=>`<span><small>${escapeHtml(key)}</small><b>${key.includes('率')||key.includes('佔比')?`${fmtNumber(store.metrics[key],1)}%`:fmtNumber(store.metrics[key],key==='好速'?2:1)}</b></span>`).join('') || '<div class="empty-state">此店正式來源尚無營運數字。</div>'}</div>${store.people.length?store.people.map(person=>`<article class="person-card"><div class="person-head"><b>${escapeHtml(person.name)}</b><span class="${person.status==='fail'?'fail':''}">${person.status==='fail'?'未過關':'過關'}</span></div><div class="person-metrics">${Object.entries(person.metrics||{}).map(([key,value])=>`<span>${key} ${value==null?'—':fmtNumber(value)}</span>`).join('')}</div>${person.status==='fail'?`<p class="person-note">未過關：${escapeHtml(person.failed.join('、'))}<br>原因：${escapeHtml(person.reason||'尚未填寫原因')}<br>改善計畫：${escapeHtml(person.improvePlan||'尚未填寫改善計畫')}</p>`:''}</article>`).join(''):'<div class="empty-state">尚無正式個人回報。</div>'}</div></article>`;
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

  function renderPatrol() {
    const overview=contract.patrolOverview.data; const today=contract.patrolToday.data;
    renderPatrolVisits();
    if (overview) {
      const completed=numberOrNull(overview.visited); const expected=numberOrNull(overview.expected != null ? overview.expected : overview.total);
      const remaining=numberOrNull(overview.remaining); const rate=numberOrNull(overview.completionRate);
      const attentionCount=numberOrNull(overview.attentionCount) ?? (Array.isArray(overview.attention)?overview.attention.length:0);
      const progressWidth=rate==null?0:Math.min(100,Math.max(0,rate*100));
      const unvisitedBlock=Array.isArray(overview.unvisited)&&overview.unvisited.length
        ? `<div class="patrol-unvisited"><b>未巡店點</b><p>${overview.unvisited.map(escapeHtml).join('、')}</p></div>`
        : `<div class="patrol-unvisited"><b>未巡店點</b><p>${overview.periodVerified?'無':'等待正式期間資料'}</p></div>`;
      const verificationNote=overview.periodVerified?'':'<p class="stale-note">巡店純讀取規則無法建立本月大盤，本頁已 fail-closed。</p>';
      dom('#patrolOverview').innerHTML=`<section class="panel patrol-progress-panel"><div class="panel-head"><div><h2>本月巡店大盤進度</h2><small>${escapeHtml(overview.statisticsPeriod||'—')}</small></div></div><div class="patrol-progress-hero"><div><span>本月巡店率</span><strong class="${rate!=null&&rate<1?'gold-value':'positive'}">${fmtPct(rate)}</strong></div><div class="patrol-progress-track" role="progressbar" aria-label="本月巡店率" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${rate==null?0:Math.round(progressWidth)}"><i style="width:${progressWidth}%"></i></div></div><div class="patrol-kpis patrol-kpis-four"><article><span>本月已巡店數</span><b class="positive">${completed==null?'—':completed}</b></article><article><span>全項完成店數</span><b class="positive">${overview.fullyDone==null?'—':overview.fullyDone}</b></article><article><span>尚缺檢核項次</span><b class="${overview.totalMissingItems?'negative':'positive'}">${overview.totalMissingItems==null?'—':overview.totalMissingItems}</b></article><article><span>尚未巡店數</span><b class="${remaining?'negative':'positive'}">${remaining==null?'—':remaining}</b></article></div><div class="patrol-rule-summary"><span>需關注店 <b class="${attentionCount?'negative':'positive'}">${attentionCount}</b></span><span>題 18 週期 <b>${escapeHtml(overview.item18Window&&overview.item18Window.label||'—')}</b></span><span>題 19–33 <b>每月 20 日前</b></span></div>${unvisitedBlock}${verificationNote}</section>${renderPatrolRuleBoards(overview)}`;
    } else dom('#patrolOverview').innerHTML=contract.patrolOverview.status==='unauthorized'?patrolUnlockState('解鎖後顯示巡店大盤'):'<div class="empty-state">正式來源目前沒有巡店大盤。</div>';
    dom('#patrolTodayDetail').innerHTML=today&&today.route&&today.route.length?`<section class="patrol-today-card"><h2>今日巡店</h2><div class="route-line"><b>${today.route.map(escapeHtml).join(' → ')}</b></div><div class="route-line">已完成 ${today.completed}/${today.total} · 下一站 ${escapeHtml(today.nextStop||'—')} · ${escapeHtml(today.nextEta||'—')}</div></section>`:`<section class="patrol-today-card"><h2>今日巡店</h2><div class="route-line">${escapeHtml(contract.patrolToday.note||'今日無排定巡店')}</div></section>`;
    dom('#patrolStoreList').innerHTML=overview&&overview.stores?overview.stores.map(row=>`<div class="patrol-store-row"><span>${escapeHtml(row.name)}</span><span>${escapeHtml(row.lastVisit||'—')}</span><span>${row.daysSince==null?'—':row.daysSince+' 天'}</span><span class="${row.status==='attention'||row.status==='pending'?'negative':'positive'}">${escapeHtml(row.result||row.status)}<small>題18 ${row.item18&&row.item18.status==='done'?'完成':'未完成'} · 題19–33 ${row.awareness?row.awareness.count:0}/15</small></span></div>`).join(''):'<div class="empty-state">尚無店點巡店摘要。</div>';
    dom('#patrolRecentList').innerHTML=overview&&overview.recent&&overview.recent.length?overview.recent.map(row=>`<div class="recent-row"><span>${escapeHtml(formatDate(row.date))}</span><span>${escapeHtml(row.store)}</span><span class="${row.complete?'positive':'negative'}">${row.complete?'完成':`待補 ${row.missingItems} 項`}</span></div>`).join(''):'<div class="empty-state">尚無最近巡店紀錄。</div>';
  }

  function renderSchedule() {
    const date=dom('#scheduleDate').value||taipeiDate(); const filter=dom('#scheduleStoreFilter').value;
    const byDate=contract.scheduleByDate.data;
    const data=scheduleViewData&&scheduleViewData.date===date?scheduleViewData:
      (byDate&&byDate.selectedDate===date?{date,stores:byDate.stores}:(contract.scheduleToday.data&&contract.scheduleToday.data.date===date?contract.scheduleToday.data:null));
    dom('#scheduleSourceTime').textContent=`更新 ${formatTime(contract.scheduleToday.sourceUpdatedAt)}`;
    if (!data||!Array.isArray(data.stores)) { const locked=contract.scheduleToday.status==='unauthorized'; dom('#scheduleList').className=locked?'locked-state':'empty-state'; dom('#scheduleList').innerHTML=locked?patrolUnlockState('解鎖後顯示九店人員、班別與上班／休假'): `${escapeHtml(date)} 尚無班表資料。`; return; }
    const rows=data.stores.filter(row=>!filter||row.store===filter);
    dom('#scheduleList').className='';
    dom('#scheduleList').innerHTML=rows.length?rows.map(row=>`<article class="schedule-store"><div class="schedule-store-head"><b>${escapeHtml(row.store)}</b><span>${row.working} 人上班 · ${row.off} 人休假</span></div>${(row.staff||[]).map(person=>`<div class="schedule-person ${person.working?'':'off'}"><span>${escapeHtml(person.name)} · ${escapeHtml(person.role||'—')}</span><i>${escapeHtml(person.status||'—')}</i></div>`).join('')}</article>`).join(''):`<div class="empty-state">${escapeHtml(date)} 尚無班表資料。</div>`;
  }

  function renderSystemStatus() {
    const entries=[['資料模式',contract.mode==='preview'?'展示資料':'正式唯讀'],['正式寫入','停用'],['OAuth／Cookie／Session','未修改'],['KPI／台獎／回報',contract.kpiSummary.status],['班表／巡店',contract.scheduleToday.status]];
    dom('#systemStatus').innerHTML=entries.map(([label,value])=>`<div class="system-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join('');
  }

  function renderAll() {
    renderHeader(); renderOperations(); renderKpiHero(); renderStores(); renderAwardsHome(); renderScheduleHome(); renderPatrolHome();
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

  function adaptPatrol(raw, currentMonth) {
    if (!scope.PatrolReadModel || !/^\d{4}-\d{2}$/.test(String(currentMonth || ''))) throw new Error('巡店共用唯讀計算模組無法使用。');
    const rows=raw&&Array.isArray(raw.rows)?raw.rows:[];
    const configured=raw&&Array.isArray(raw.stores)&&raw.stores.length?raw.stores:
      raw&&raw.config&&Array.isArray(raw.config.stores)&&raw.config.stores.length?raw.config.stores:
      STORES.map(name=>({name}));
    const data=scope.PatrolReadModel.overview(rows, configured, currentMonth, new Date());
    data.stores=data.stores.map(row=>({ ...row, name:normalizeStore(row.name) }));
    data.unvisited=data.unvisited.map(normalizeStore);
    data.attention=data.attention.map(normalizeStore);
    data.recent=data.recent.map(row=>({ ...row, store:normalizeStore(row.store) }));
    data.visitCounts=(data.visitCounts||[]).map(row=>({ ...row, name:normalizeStore(row.name) }));
    if(data.inventory) data.inventory.stores=data.inventory.stores.map(row=>({ ...row, name:normalizeStore(row.name) }));
    if(data.item18Progress) data.item18Progress.stores=data.item18Progress.stores.map(row=>({ ...row, name:normalizeStore(row.name) }));
    return data;
  }

  async function loadPatrolData() {
    const date=dom('#scheduleDate').value||taipeiDate(); const month=date.slice(0,7);
    const results=await Promise.allSettled([patrolRead('sread',{month}),patrolRead('ptread'),patrolRead('ptvisit_read',{date:taipeiDate()})]); const readAt=nowIso();
    if (results[0].status==='fulfilled') {
      scheduleRaw=results[0].value.schedule; scheduleViewData=adaptSchedule(scheduleRaw,date);
      contract.scheduleByDate=C.moduleState({status:scheduleViewData.stores.length?'ok':'no_data',updatedAt:readAt,sourceUpdatedAt:readAt,stale:false,source:moduleSource('既有班表 sread','patrol.html'),data:{selectedDate:date,availableMonth:String(scheduleRaw&&scheduleRaw.month||month),stores:scheduleViewData.stores}});
      const today=taipeiDate();
      if (scheduleRaw&&scheduleRaw.month===today.slice(0,7)) {
        const todayData=adaptSchedule(scheduleRaw,today);
        contract.scheduleToday=C.moduleState({status:todayData.stores.length?'ok':'no_data',updatedAt:readAt,sourceUpdatedAt:readAt,stale:false,source:moduleSource('既有班表 sread','patrol.html'),data:todayData});
      }
      populateScheduleStores(scheduleViewData.stores.map(row=>row.store));
    } else { const expired=/授權已逾時/.test(results[0].reason.message); scheduleRaw=null; scheduleViewData=null; contract.scheduleToday=statusModule('scheduleToday',expired?'unauthorized':'error',null,results[0].reason.message); contract.scheduleByDate=statusModule('scheduleByDate',expired?'unauthorized':'error',null,results[0].reason.message); if(expired)setMessage('#patrolAccessMessage','班表／巡店授權已逾時，請重新驗證','error'); }
    if (results[1].status==='fulfilled') {
      patrolRaw=results[1].value; const data=adaptPatrol(patrolRaw,month);
      contract.patrolOverview=C.moduleState({status:data.stores.length?'ok':'no_data',updatedAt:readAt,sourceUpdatedAt:readAt,stale:false,source:moduleSource('既有巡店 ptread','patrol.html'),data});
      contract.patrolStores=C.moduleState({status:data.stores.length?'ok':'no_data',updatedAt:readAt,sourceUpdatedAt:readAt,stale:false,source:moduleSource('既有巡店 ptread','patrol.html'),data:data.stores});
      contract.patrolToday=C.moduleState({status:'no_data',updatedAt:readAt,sourceUpdatedAt:readAt,stale:false,source:moduleSource('既有巡店 ptread','patrol.html'),data:null,note:'現有正式來源未提供今日預定路線與移動時間'});
    } else {
      const expired=/授權已逾時/.test(results[1].reason.message);
      contract.patrolOverview=statusModule('patrolOverview',expired?'unauthorized':'error',null,results[1].reason.message);
      contract.patrolToday=statusModule('patrolToday',expired?'unauthorized':'error',null,results[1].reason.message);
      contract.patrolStores=statusModule('patrolStores',expired?'unauthorized':'error',[],results[1].reason.message);
      if(expired)setMessage('#patrolAccessMessage','班表／巡店授權已逾時，請重新驗證','error');
    }
    if(results[2].status==='fulfilled') {
      patrolVisitEvents=formalPatrolVisitEvents(results[2].value.events);
      patrolOpenVisit=isFormalPatrolVisit(results[2].value.openVisit)?results[2].value.openVisit:latestOpenPatrolVisit(patrolVisitEvents);
      patrolStaleOpenVisit=results[2].value.staleOpenVisit||null;
      patrolVisitError='';
    } else {
      patrolVisitEvents=[];
      patrolOpenVisit=null;
      patrolStaleOpenVisit=null;
      patrolVisitError=/授權已逾時/.test(results[2].reason.message)?'班表／巡店授權已逾時，請重新驗證':'到離店服務尚未可用；巡店唯讀大盤不受影響。';
    }
    contract.generatedAt=readAt; renderAll();
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
    catch (_) { patrolToken=''; scope.sessionStorage.removeItem(PATROL_TOKEN_KEY); setMessage('#patrolAccessMessage','班表／巡店授權已逾時，請重新驗證','error'); }
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
  dom('#patrolLogout').addEventListener('click',()=>{ const token=patrolToken; patrolToken=''; scheduleRaw=null; scheduleViewData=null; patrolVisitEvents=[]; patrolOpenVisit=null; patrolStaleOpenVisit=null; patrolVisitError=''; scope.sessionStorage.removeItem(PATROL_TOKEN_KEY); dom('#patrolLogout').hidden=true; contract.scheduleToday=statusModule('scheduleToday'); contract.scheduleByDate=statusModule('scheduleByDate'); contract.patrolToday=statusModule('patrolToday'); contract.patrolOverview=statusModule('patrolOverview'); contract.patrolStores=statusModule('patrolStores'); renderAll(); if(token) postPatrolAuth({action:'ptlogout',token}).catch(()=>{}); });
  all('[data-patrol-visit]').forEach(button=>button.addEventListener('click',()=>openPatrolVisitDialog(button.dataset.patrolVisit)));
  dom('#patrolVisitClose').addEventListener('click',()=>dom('#patrolVisitDialog').close());
  dom('#patrolVisitStore').addEventListener('change',updatePatrolVisitSubmitState);
  dom('#patrolVisitForm').addEventListener('submit',event=>{ event.preventDefault(); submitPatrolVisit(event.currentTarget); });
  all('[data-date-step]').forEach(button=>button.addEventListener('click',()=>shiftDate(Number(button.dataset.dateStep))));
  dom('[data-date-today]').addEventListener('click',()=>{ dom('#scheduleDate').value=taipeiDate(); if(patrolToken)loadPatrolData(); else renderSchedule(); });
  dom('#scheduleDate').addEventListener('change',()=>patrolToken?loadPatrolData():renderSchedule());
  dom('#scheduleStoreFilter').addEventListener('change',renderSchedule);
  all('[data-refresh]').forEach(button=>button.addEventListener('click',()=>{ if(PREVIEW_MODE)renderAll(); else { const id=scope.localStorage.getItem(EMPLOYEE_KEY); if(id)loadFormalSummary(id).catch(error=>{ if(!privateAccessPending(error.message))setMessage('#privateAccessMessage',error.message,'error'); }); if(patrolToken)loadPatrolData(); } }));
  document.addEventListener('click',event=>{
    const privateUnlock=event.target.closest('[data-unlock-private]'); if(privateUnlock){ setView('me'); dom('#employeeId').focus(); return; }
    const patrolUnlock=event.target.closest('[data-unlock-patrol]'); if(patrolUnlock){ setView('me'); dom('#patrolPasscode').focus(); return; }
    const scheduleButton=event.target.closest('[data-toggle-home-schedule]'); if(scheduleButton){ const card=scheduleButton.closest('#scheduleHome'); const expanded=card.classList.toggle('expanded'); scheduleButton.setAttribute('aria-expanded',String(expanded)); scheduleButton.querySelector('span').textContent=expanded?'收合當日班表':'顯示九店當日班表'; return; }
    const operationButton=event.target.closest('[data-toggle-operation]'); if(operationButton){ const item=operationButton.closest('.operation-item'); item.classList.toggle('expanded'); operationButton.setAttribute('aria-expanded',item.classList.contains('expanded')); return; }
    const reportButton=event.target.closest('[data-open-report]'); if(reportButton){ reportSegment=Number(reportButton.dataset.openReport); all('[data-report-segment]').forEach(button=>button.classList.toggle('active',Number(button.dataset.reportSegment)===reportSegment)); setView('report'); renderReport(); return; }
    const awardLink=event.target.closest('[data-open-awards]'); if(awardLink){ event.preventDefault(); battleKind='award'; battleScope='region'; all('[data-battle-kind]').forEach(button=>button.classList.toggle('active',button.dataset.battleKind==='award')); all('[data-battle-scope]').forEach(button=>button.classList.toggle('active',button.dataset.battleScope==='region')); setView('battle'); renderBattle(); return; }
    const storeButton=event.target.closest('.store-row'); if(storeButton){ const item=storeButton.closest('.store-item'); item.classList.toggle('expanded'); storeButton.setAttribute('aria-expanded',item.classList.contains('expanded')); return; }
    const personalButton=event.target.closest('.personal-performance-button'); if(personalButton){ const item=personalButton.closest('.personal-performance-item'); item.classList.toggle('expanded'); personalButton.setAttribute('aria-expanded',item.classList.contains('expanded')); return; }
    const personalViewButton=event.target.closest('[data-personal-view]'); if(personalViewButton){ personalRegionView=personalViewButton.dataset.personalView; renderBattle(); return; }
    const reportStore=event.target.closest('.report-store-button'); if(reportStore){ const item=reportStore.closest('.report-store'); item.classList.toggle('expanded'); reportStore.setAttribute('aria-expanded',item.classList.contains('expanded')); }
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

  if ('serviceWorker' in navigator && location.protocol !== 'file:') scope.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js',{scope:'./'}).catch(()=>{}));
})(window);
