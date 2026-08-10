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
  const PATROL_READ_ACTIONS = new Set(['sread','ptread']);
  const PREVIEW_MODE = new URLSearchParams(scope.location.search).get('preview') === '1';
  const STALE_MS = 30 * 60 * 60 * 1000;

  let contract = PREVIEW_MODE ? C.validateContract(scope.LiamSupervisorPreviewData) : emptyFormalContract();
  let reportSegment = 16;
  let battleKind = 'kpi';
  let battleScope = 'region';
  let patrolToken = scope.sessionStorage.getItem(PATROL_TOKEN_KEY) || '';
  let scheduleRaw = null;
  let scheduleViewData = null;
  let patrolRaw = null;

  const dom = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const moduleSource = (label, href) => ({ label, href });

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
    if (!READ_ACTIONS.has(payload.action)) throw new Error('App 1.1 僅允許既有唯讀 action。');
    const response = await fetch(DAILY_REPORT_API, {
      method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body:JSON.stringify(payload), cache:'no-store', credentials:'omit'
    });
    if (!response.ok) throw new Error(`正式摘要連線失敗（HTTP ${response.status}）`);
    const body = await response.json();
    if (!body || body.status !== 'ok') throw new Error((body && body.message) || '正式摘要讀取失敗。');
    return body;
  }

  async function postPatrolAuth(payload) {
    if (!['ptauth','ptlogout'].includes(payload.action)) throw new Error('不允許的 session action。');
    const response = await fetch(PATROL_API, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload), cache:'no-store' });
    const body = await response.json();
    if (!body || body.status !== 'ok') throw new Error((body && body.message) || '班表／巡店驗證失敗。');
    return body;
  }

  async function patrolRead(action, params = {}) {
    if (!PATROL_READ_ACTIONS.has(action)) throw new Error('App 1.1 僅允許 sread／ptread。');
    if (!patrolToken) throw new Error('班表／巡店 session 尚未驗證。');
    const url = new URL(PATROL_API);
    url.searchParams.set('action', action);
    url.searchParams.set('token', patrolToken);
    Object.entries(params).forEach(([key,value]) => { if (value) url.searchParams.set(key,value); });
    const response = await fetch(url, { method:'GET', cache:'no-store' });
    const body = await response.json();
    if (!body || body.status !== 'ok') throw new Error((body && body.message) || '班表／巡店讀取失敗。');
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
      const models = (row.items || []).filter(item => String(item.award || item.eligible || '').toUpperCase() === 'Y').slice(0,3).map(item => item.display_name || item.name).filter(Boolean);
      return { name:normalizeStore(row.store), amount:numberOrNull(award.actual_total) || 0, eligible:String(award.award || '').toUpperCase() === 'Y', models };
    }).filter(row => row.name) : [];
    const models = Array.isArray(sourceOverall.items) ? sourceOverall.items : [];
    const top2 = models.map(item => ({
      name:String(item.display_name || item.name || ''), amount100:numberOrNull(item.district_reward_100 != null ? item.district_reward_100 : item.store_reward_100),
      progress:numberOrNull(item.rate), status:String(item.award || item.status || '')
    })).filter(item => item.name && item.amount100 != null).sort((a,b) => b.amount100 - a.amount100).slice(0,2);
    const winningStores = storeRows.filter(row => row.eligible).length;
    const totalAmount = numberOrNull(overallAward.actual_total);
    const summary = { totalAmount, winningStores, totalStores:9, reportDate };
    const base = { updatedAt:readAt, sourceUpdatedAt:updatedAt, stale:stale(updatedAt), source };
    return {
      summary:C.moduleState({ ...base, status:totalAmount != null ? 'ok':'no_data', data:summary }),
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

  function adaptReport(segment, storeData, personalData) {
    const stores = STORES.map(name => {
      const report = (storeData || {})[name] || (storeData || {})[normalizeStore(name)] || null;
      const peopleSource = (personalData || {})[name] || {};
      const people = Object.entries(peopleSource).map(([personName,raw]) => ({ name:personName, ...personalRecord(raw) }));
      const metrics = report ? {
        A999:numberOrNull(report.aq999), A1399:numberOrNull(report.aq1399), '好速':numberOrNull(report.haosu),
        R999:numberOrNull(report.rt999), R1399:numberOrNull(report.rt1399)
      } : {};
      return { name, reported:Boolean(report), reportedAt:report ? String(report.savedAt || report.updatedAt || '') : '', metrics, people };
    });
    const completed = stores.filter(store => store.reported).length;
    const missing = stores.filter(store => !store.reported).map(store => store.name);
    const sourceTimes = stores.map(store => store.reportedAt).filter(Boolean).sort();
    const totals = {};
    stores.forEach(store => Object.entries(store.metrics).forEach(([key,value]) => { if (value != null) totals[key] = (totals[key] || 0) + value; }));
    return { segment, completedStores:completed, totalStores:9, missingStores:missing, updatedAt:sourceTimes.at(-1) || '', totals, stores };
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
    const requests = await Promise.allSettled([
      postReadOnly({ action:'private_access', ...credential }),
      postReadOnly({ action:'kpicalc_access', ...credential }),
      postReadOnly({ action:'read', date:taipeiDate(), seg:16 }),
      postReadOnly({ action:'read', date:taipeiDate(), seg:21 }),
      postReadOnly({ action:'pread', date:taipeiDate(), seg:16 }),
      postReadOnly({ action:'pread', date:taipeiDate(), seg:21 })
    ]);
    if (requests[0].status === 'rejected') throw requests[0].reason;
    const privateResult = requests[0].value;
    const snapshot = privateResult.snapshot || {};
    const readAt = nowIso();
    const kpi = requests[1].status === 'fulfilled'
      ? adaptKpi(requests[1].value.data || {}, snapshot, readAt)
      : { summary:statusModule('kpiSummary','error',null,'正式 kpicalc 讀取失敗'), stores:statusModule('kpiStores','error',[], '正式 kpicalc 讀取失敗'), full:statusModule('kpiFullMetrics','error',{region:[],stores:{}},'正式 kpicalc 讀取失敗') };
    const awards = adaptAwards(snapshot, kpi.summary.data && kpi.summary.data.reportDate, readAt);
    const report16 = adaptReport(16, requests[2].status === 'fulfilled' ? requests[2].value.data : {}, requests[4].status === 'fulfilled' ? requests[4].value.data : {});
    const report21 = adaptReport(21, requests[3].status === 'fulfilled' ? requests[3].value.data : {}, requests[5].status === 'fulfilled' ? requests[5].value.data : {});
    const reportModule = (report, result) => C.moduleState({
      status:result.status === 'fulfilled' ? (report.completedStores === 9 ? 'ok' : 'partial') : 'error', updatedAt:readAt,
      sourceUpdatedAt:report.updatedAt, stale:false, source:moduleSource('北一二B每日回報','index.html'), data:report,
      note:result.status === 'fulfilled' ? '' : '正式回報來源讀取失敗'
    });
    contract = C.validateContract({
      ...contract, version:C.VERSION, generatedAt:readAt, mode:'formal',
      todayOperations:C.moduleState({ status:'ok', updatedAt:readAt, sourceUpdatedAt:report21.updatedAt || report16.updatedAt, stale:false, source:moduleSource('北一二B每日回報','index.html'), data:{ date:taipeiDate(), segments:[report16,report21] } }),
      kpiSummary:kpi.summary, kpiStores:kpi.stores, kpiFullMetrics:kpi.full,
      awardSummary:awards.summary, awardStores:awards.stores, awardTop2Models:awards.top2,
      report1600:reportModule(report16,requests[2]), report2100:reportModule(report21,requests[3]),
      reportFailures:C.moduleState({ status:requests[4].status === 'fulfilled' || requests[5].status === 'fulfilled' ? 'ok':'error', updatedAt:readAt, sourceUpdatedAt:report21.updatedAt || report16.updatedAt, stale:false, source:moduleSource('正式個人回報','index.html'), data:{16:failureSummary(report16),21:failureSummary(report21)} })
    });
    scope.sessionStorage.setItem(EMPLOYEE_KEY,id);
    dom('#viewerState').textContent = privateResult.profile && privateResult.profile.maskedName ? privateResult.profile.maskedName : 'Approved';
    setMessage('#privateAccessMessage','已由既有 Approved Device 讀回正式唯讀摘要。','success');
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
    mode.className = `mode-pill${contract.mode === 'preview' ? ' preview':''}`;
    mode.textContent = contract.mode === 'preview' ? 'Preview／示意資料' : '正式唯讀';
    dom('#previewBanner').hidden = contract.mode !== 'preview';
    document.body.classList.toggle('preview-mode',contract.mode === 'preview');
  }

  function renderOperations() {
    const rows = contract.todayOperations.data && contract.todayOperations.data.segments || [];
    dom('#operationsRows').innerHTML = rows.length ? rows.map(segment => {
      const failures = contract.reportFailures.data && contract.reportFailures.data[segment.segment] || {};
      const missing = segment.missingStores ? segment.missingStores.length : Math.max(0,9-segment.completedStores);
      const totals = segment.totals || {};
      const failingPeople = failures.people || [];
      return `<article class="operation-item"><div class="operation-row">
        <span class="operation-time">${escapeHtml(segment.segment)}:00</span>
        <span class="operation-metric"><span>已回報</span><b class="${segment.completedStores===9?'good':'warn'}">${segment.completedStores}/9</b></span>
        <span class="operation-metric"><span>缺店</span><b class="${missing?'warn':'good'}">${missing}</b></span>
        <span class="operation-metric"><span>未過店</span><b class="${failures.failedStoreCount?'bad':'good'}">${failures.failedStoreCount || 0}</b></span>
        <span class="operation-metric"><span>未過人</span><b class="${failures.failedPeopleCount?'bad':'good'}">${failures.failedPeopleCount || 0}</b></span>
        <button class="attention-button" type="button" data-toggle-operation="${segment.segment}" aria-label="展開 ${segment.segment}:00 戰況"><i data-lucide="triangle-alert"></i></button>
      </div><div class="operation-detail"><div class="operation-detail-summary">${['A999','A1399','好速','R999','R1399'].map(key=>`<span>${key} ${fmtNumber(totals[key],1)}</span>`).join('')}</div>
        <p>${segment.missingStores.length?`未回報：${segment.missingStores.map(escapeHtml).join('、')}`:'九店已完成回報'}${failingPeople.length?`｜未過關：${failingPeople.slice(0,3).map(person=>`${escapeHtml(person.store)} ${escapeHtml(person.name)}（${escapeHtml(person.failed.join('、'))}）`).join('、')}`:'｜目前無正式未過關紀錄'}</p>
        <div>${segment.stores.filter(store=>store.reported).map(store=>`<div class="operation-store-mini"><span>${escapeHtml(store.name)}</span>${['A999','A1399','好速','R999','R1399'].map(key=>`<span>${fmtNumber(store.metrics&&store.metrics[key],1)}</span>`).join('')}</div>`).join('')}</div>
      </div></article>`;
    }).join('') : '<div class="empty-state">正式回報摘要尚未解鎖。</div>';
  }

  function renderKpiHero() {
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
      <span class="store-name">${warn?`<i data-lucide="${row.kpi<.8?'triangle-alert':'circle-alert'}" class="store-alert ${row.kpi<.8?'critical':''}"></i>`:`<span class="store-rank">${index+1}</span>`}${escapeHtml(row.name)}</span>
      <span class="store-kpi ${row.kpi<.8?'negative':''}">${fmtPct(row.kpi)}</span><span class="store-company">${row.rank??'—'}</span>
      <span class="${valueClass(row.kpiDod)}">${fmtSignedPct(row.kpiDod)}</span><span class="${valueClass(row.rankChange)}">${fmtSigned(row.rankChange)}</span>
      <span class="${valueClass(row.addon)}">${fmtNumber(row.addon)}</span><i data-lucide="chevron-down" class="row-chevron"></i>
    </button><div class="store-detail"><div class="core-grid">${['A999','A1399','好速','R999','R1399','RT'].map(key => `<div class="core-cell"><span>${key}</span><b class="${core[key]!=null&&core[key]<1?'negative':''}">${fmtPct(core[key])}</b></div>`).join('')}</div><a class="detail-link" href="index.html">查看完整 KPI <i data-lucide="arrow-right"></i></a></div></article>`;
  }

  function renderStores() {
    const rows = Array.isArray(contract.kpiStores.data) ? contract.kpiStores.data.slice().sort((a,b)=>(b.kpi??-1)-(a.kpi??-1)) : [];
    dom('#kpiStoreUpdated').textContent = `更新 ${formatTime(contract.kpiStores.sourceUpdatedAt)}`;
    dom('#homeStoreList').innerHTML = rows.length ? rows.map(storeRow).join('') : '<div class="empty-state">登入 Approved Device 後顯示九店摘要。</div>';
  }

  function renderAwardsHome() {
    const summary = contract.awardSummary.data || {};
    const stores = Array.isArray(contract.awardStores.data) ? contract.awardStores.data : [];
    const top = Array.isArray(contract.awardTop2Models.data) ? contract.awardTop2Models.data : [];
    dom('#awardHome').innerHTML = `<div class="award-summary"><h2 id="awardHomeTitle">台獎總覽</h2><span>領獎總額 <b>$${fmtNumber(summary.totalAmount,0)}</b></span><span>領獎店數 <b>${summary.winningStores??'—'}<small> / 9</small></b></span></div>
      <div class="award-list"><div class="award-row header"><span>店名</span><span>獎勵金額</span><span>狀態</span><span>100% 獎勵機型</span></div>${stores.slice(0,5).map(row=>`<div class="award-row"><span>${escapeHtml(row.name)}</span><span class="award-amount">${row.amount?'$'+fmtNumber(row.amount,0):'—'}</span><span><i class="award-tag ${row.eligible?'':'no'}">${row.eligible?'已符合':'未達標'}</i></span><span class="top-models">${(row.models||[]).slice(0,2).map(model=>`<i class="award-tag">${escapeHtml(model)}</i>`).join('')||'—'}</span></div>`).join('')}</div>
      <div class="home-top-models">${top.map((model,index)=>`<div class="home-top-model"><b>Top ${index+1} · ${escapeHtml(model.name)}</b><span>100% $${fmtNumber(model.amount100,0)}</span><span>${fmtPct(model.progress)} · ${escapeHtml(model.status||'—')}</span></div>`).join('')||'<span>正式資料尚未提供 Top 2 欄位。</span>'}</div>
      <a class="award-link" href="#battle" data-open-awards>查看完整台獎摘要 <i data-lucide="arrow-right"></i></a>`;
  }

  function renderScheduleHome() {
    const data = contract.scheduleToday.data;
    const node = dom('#scheduleHome');
    if (!data || !Array.isArray(data.stores) || !data.stores.length) {
      node.innerHTML = `<div class="home-schedule-head"><span class="compact-icon"><i data-lucide="calendar-days"></i></span><div class="compact-copy"><h2 id="scheduleHomeTitle">今日班表</h2><p>${contract.scheduleToday.status==='unauthorized'?'至「我的」解鎖後顯示':'目前尚無班表摘要'}</p></div><span class="compact-next"><b>${formatDate(taipeiDate())}</b><small>${contract.scheduleToday.note||'唯讀'}</small></span></div>`;
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
      node.innerHTML = `<span class="compact-icon"><i data-lucide="route"></i></span><div class="compact-copy"><h2 id="patrolHomeTitle">今日巡店</h2><p>${contract.patrolToday.note || '今日無排定巡店'}</p></div><span class="compact-next"><b>${contract.patrolToday.status==='unauthorized'?'需解鎖':'今日無排定'}</b><small>不自行推測路線</small></span>`;
      return;
    }
    node.innerHTML = `<span class="compact-icon"><i data-lucide="route"></i></span><div class="compact-copy"><h2 id="patrolHomeTitle">今日巡店</h2><p>${data.route.map(escapeHtml).join(' → ')}</p></div><span class="compact-next"><b>下一站：${escapeHtml(data.nextStop||'—')}</b><small>${data.nextEta?`預計 ${escapeHtml(data.nextEta)} 到達`:''}</small></span>`;
  }

  function renderBattle() {
    const content = dom('#battleContent');
    const stores = Array.isArray(contract.kpiStores.data)?contract.kpiStores.data:[];
    const awardStores = Array.isArray(contract.awardStores.data)?contract.awardStores.data:[];
    const select = dom('#battleStoreSelect');
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
    } else if (battleScope === 'region') {
      const a=contract.awardSummary.data||{}; const top=contract.awardTop2Models.data||[];
      content.innerHTML=`<div class="metric-card-grid"><article class="metric-card"><span>區領獎總額</span><strong class="gold-value">$${fmtNumber(a.totalAmount,0)}</strong><small>正式台獎</small></article><article class="metric-card"><span>領獎店數</span><strong>${a.winningStores??'—'}/9</strong><small>未領獎 ${9-(a.winningStores||0)} 店</small></article></div><div class="battle-list"><div class="battle-list-row header"><span>店點</span><span>金額</span><span>狀態</span><span>機款</span><span></span></div>${awardStores.map(row=>`<div class="battle-list-row"><span>${escapeHtml(row.name)}</span><span>${row.amount?'$'+fmtNumber(row.amount,0):'—'}</span><span class="${row.eligible?'positive':'neutral-value'}">${row.eligible?'領獎':'未領獎'}</span><span>${(row.models||[]).length}</span><span></span></div>`).join('')}</div>${top.map((model,index)=>`<article class="top-model-card"><h3>Top ${index+1} · ${escapeHtml(model.name)}</h3><p>100% 獎金 $${fmtNumber(model.amount100,0)} · 目前進度 ${fmtPct(model.progress)} · ${escapeHtml(model.status||'')}</p></article>`).join('')}`;
    } else {
      const row=awardStores.find(item=>item.name===selected);
      content.innerHTML=row?`<div class="metric-card-grid"><article class="metric-card"><span>店領獎金額</span><strong class="gold-value">$${fmtNumber(row.amount,0)}</strong><small>${escapeHtml(row.name)}</small></article><article class="metric-card"><span>領獎狀態</span><strong class="${row.eligible?'positive':'neutral-value'}">${row.eligible?'已領獎':'未領獎'}</strong><small>正式台獎判定</small></article></div><section class="panel"><div class="panel-head"><div><h2>主要得獎機款</h2><small>正式台獎資料</small></div></div><div class="award-list">${(row.models||[]).length?row.models.map(name=>`<div class="award-row"><span>${escapeHtml(name)}</span><span></span><span class="positive">已符合</span><span></span></div>`).join(''):'<div class="empty-state">目前無得獎機款。</div>'}</div><a class="detail-link" href="index.html">完整台獎入口 <i data-lucide="external-link"></i></a></section>`:'<div class="empty-state">尚無此店台獎摘要。</div>';
    }
    refreshIcons();
  }

  function activeReport() { return reportSegment===16?contract.report1600:contract.report2100; }

  function renderReport() {
    const module=activeReport(); const report=module.data; const failures=contract.reportFailures.data&&contract.reportFailures.data[reportSegment];
    if (!report) { dom('#reportOverview').innerHTML='<div class="empty-state">登入 Approved Device 後顯示正式回報。</div>'; dom('#reportFailures').innerHTML=''; dom('#reportStoreList').innerHTML=''; return; }
    dom('#reportOverview').innerHTML=`<div class="report-summary"><article><span>完成店數</span><b class="${report.completedStores===9?'positive':''}">${report.completedStores}/9</b></article><article><span>尚未完成</span><b class="${report.missingStores.length?'negative':'positive'}">${report.missingStores.length}</b></article><article><span>最後更新</span><b>${escapeHtml(report.updatedAt||'—')}</b></article></div>${report.missingStores.length?`<p class="stale-note">尚未完成：${report.missingStores.map(escapeHtml).join('、')}</p>`:''}`;
    dom('#reportFailures').innerHTML=failures?`<div class="failure-summary"><div class="failure-grid"><div><span>未過關店數</span><b class="${failures.failedStoreCount?'negative':'positive'}">${failures.failedStoreCount}</b></div><div><span>未過關人數</span><b class="${failures.failedPeopleCount?'negative':'positive'}">${failures.failedPeopleCount}</b></div><div><span>未回報店點</span><b>${failures.missingStores.length}</b></div><div><span>各指標未過人數</span><b>${Object.entries(failures.byMetric||{}).map(([key,value])=>`${escapeHtml(key)} ${value}`).join(' · ')||'0'}</b></div></div><div class="tracking-list">${(failures.people||[]).map(person=>`<div class="tracking-item"><b>${escapeHtml(person.store)} · ${escapeHtml(person.name)}</b><br>${escapeHtml(person.failed.join('、')||'未過關')}｜${escapeHtml(person.reason||'尚未填寫原因')}</div>`).join('')||'<div class="empty-state">目前沒有正式未過關紀錄。</div>'}</div></div>`:'<div class="empty-state">尚無個人未過關資料。</div>';
    dom('#reportStoreList').innerHTML=report.stores.map(store=>{
      const failed=store.people.filter(person=>person.status==='fail').length;
      const status=!store.reported?'未回報':failed?'未過關':store.people.length?'過關':'已回報';
      return `<article class="report-store"><button class="report-store-button" type="button" aria-expanded="false"><span>${escapeHtml(store.name)}</span><span class="${store.reported?'positive':'negative'}">${store.reported?'已回報':'未回報'}</span><span class="${status==='未過關'?'negative':status==='過關'?'positive':''}">${status}</span><span>${escapeHtml(store.reportedAt||'—')}</span><i data-lucide="chevron-down"></i></button><div class="report-person-list">${store.people.length?store.people.map(person=>`<article class="person-card"><div class="person-head"><b>${escapeHtml(person.name)}</b><span class="${person.status==='fail'?'fail':''}">${person.status==='fail'?'未過關':'過關'}</span></div><div class="person-metrics">${Object.entries(person.metrics||{}).map(([key,value])=>`<span>${key} ${value==null?'—':fmtNumber(value)}</span>`).join('')}</div>${person.status==='fail'?`<p class="person-note">未過關：${escapeHtml(person.failed.join('、'))}<br>${escapeHtml(person.reason||'尚未填寫原因')}<br>${escapeHtml(person.improvePlan||'尚未填寫改善計畫')}</p>`:''}</article>`).join(''):'<div class="empty-state">尚無正式個人回報。</div>'}</div></article>`;
    }).join('');
    refreshIcons();
  }

  function renderPatrol() {
    const overview=contract.patrolOverview.data; const today=contract.patrolToday.data;
    if (overview) {
      const completed=numberOrNull(overview.visited); const expected=numberOrNull(overview.expected != null ? overview.expected : overview.total);
      const remaining=numberOrNull(overview.remaining); const rate=numberOrNull(overview.completionRate);
      const attentionCount=numberOrNull(overview.attentionCount) ?? (Array.isArray(overview.attention)?overview.attention.length:0);
      const progressWidth=rate==null?0:Math.min(100,Math.max(0,rate*100));
      const unvisitedBlock=Array.isArray(overview.unvisited)&&overview.unvisited.length
        ? `<div class="patrol-unvisited"><b>未巡店點</b><p>${overview.unvisited.map(escapeHtml).join('、')}</p></div>`
        : `<div class="patrol-unvisited"><b>未巡店點</b><p>${overview.periodVerified?'無':'等待正式期間資料'}</p></div>`;
      const verificationNote=overview.periodVerified?'':'<p class="stale-note">正式來源未提供可驗證的統計期間與完整進度，本頁不自行假定月份或補算。</p>';
      dom('#patrolOverview').innerHTML=`<section class="panel patrol-progress-panel"><div class="panel-head"><div><h2>本月／本期巡店大盤進度</h2><small>${escapeHtml(overview.statisticsPeriod||'正式來源未提供統計期間')}</small></div></div><div class="patrol-progress-hero"><div><span>完成率</span><strong class="${rate!=null&&rate<1?'gold-value':'positive'}">${fmtPct(rate)}</strong></div><div class="patrol-progress-track" role="progressbar" aria-label="巡店完成率" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${rate==null?0:Math.round(progressWidth)}"><i style="width:${progressWidth}%"></i></div></div><div class="patrol-kpis"><article><span>已完成 / 應完成</span><b class="positive">${completed==null?'—':completed}/${expected==null?'—':expected}</b></article><article><span>剩餘數</span><b class="${remaining?'negative':'positive'}">${remaining==null?'—':remaining}</b></article><article><span>需關注數</span><b class="${attentionCount?'negative':'positive'}">${attentionCount}</b></article></div>${unvisitedBlock}${verificationNote}</section>`;
    } else dom('#patrolOverview').innerHTML='<div class="empty-state">解鎖後顯示巡店大盤。</div>';
    dom('#patrolTodayDetail').innerHTML=today&&today.route&&today.route.length?`<section class="patrol-today-card"><h2>今日巡店</h2><div class="route-line"><b>${today.route.map(escapeHtml).join(' → ')}</b></div><div class="route-line">已完成 ${today.completed}/${today.total} · 下一站 ${escapeHtml(today.nextStop||'—')} · ${escapeHtml(today.nextEta||'—')}</div></section>`:`<section class="patrol-today-card"><h2>今日巡店</h2><div class="route-line">${escapeHtml(contract.patrolToday.note||'今日無排定巡店')}</div></section>`;
    dom('#patrolStoreList').innerHTML=overview&&overview.stores?overview.stores.map(row=>`<div class="patrol-store-row"><span>${escapeHtml(row.name)}</span><span>${escapeHtml(row.lastVisit||'—')}</span><span>${row.daysSince==null?'—':row.daysSince+' 天'}</span><span class="${row.status==='attention'?'negative':'positive'}">${escapeHtml(row.result||row.status)}</span></div>`).join(''):'<div class="empty-state">尚無店點巡店摘要。</div>';
    dom('#patrolRecentList').innerHTML=overview&&overview.recent?overview.recent.map(row=>`<div class="recent-row"><span>${escapeHtml(row.store)}</span><span>${escapeHtml(row.date||'—')}</span><span class="${String(row.result).includes('待')?'negative':'positive'}">${escapeHtml(row.result||'—')}</span></div>`).join(''):'<div class="empty-state">尚無最近巡店紀錄。</div>';
  }

  function renderSchedule() {
    const date=dom('#scheduleDate').value||taipeiDate(); const filter=dom('#scheduleStoreFilter').value;
    const byDate=contract.scheduleByDate.data;
    const data=scheduleViewData&&scheduleViewData.date===date?scheduleViewData:
      (byDate&&byDate.selectedDate===date?{date,stores:byDate.stores}:(contract.scheduleToday.data&&contract.scheduleToday.data.date===date?contract.scheduleToday.data:null));
    dom('#scheduleSourceTime').textContent=`更新 ${formatTime(contract.scheduleToday.sourceUpdatedAt)}`;
    if (!data||!Array.isArray(data.stores)) { const locked=contract.scheduleToday.status==='unauthorized'; dom('#scheduleList').className=locked?'locked-state':'empty-state'; dom('#scheduleList').innerHTML=locked?'請從右上角個人／設定入口解鎖班表。':`${escapeHtml(date)} 尚無班表資料。`; return; }
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

  function patrolVisitDate(row) {
    const match=String(row.arriveTime||row.fillTime||'').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    return match?`${match[1]}-${String(match[2]).padStart(2,'0')}-${String(match[3]).padStart(2,'0')}`:'';
  }

  function adaptPatrol(raw) {
    const rows=raw&&raw.rows||[]; const configured=raw&&raw.config&&raw.config.stores||STORES.map(name=>({name}));
    const summary=raw&&((raw.summary&&typeof raw.summary==='object'&&raw.summary)||(raw.overview&&typeof raw.overview==='object'&&raw.overview))||{};
    const period=raw&&((raw.period&&typeof raw.period==='object'&&raw.period)||(raw.config&&raw.config.period&&typeof raw.config.period==='object'&&raw.config.period))||{};
    const periodStart=String(period.startDate||period.start||summary.periodStart||summary.startDate||'').slice(0,10);
    const periodEnd=String(period.endDate||period.end||summary.periodEnd||summary.endDate||'').slice(0,10);
    const hasBoundaries=/^\d{4}-\d{2}-\d{2}$/.test(periodStart)&&/^\d{4}-\d{2}-\d{2}$/.test(periodEnd);
    const statisticsPeriod=String(period.label||period.name||summary.statisticsPeriod||summary.periodLabel||(hasBoundaries?`${periodStart}～${periodEnd}`:''));
    const officialCompleted=numberOrNull(summary.completed!=null?summary.completed:summary.completedCount);
    const officialExpected=numberOrNull(summary.expected!=null?summary.expected:summary.expectedCount);
    const officialRemaining=numberOrNull(summary.remaining!=null?summary.remaining:summary.remainingCount);
    const officialRate=numberOrNull(summary.completionRate!=null?summary.completionRate:summary.rate);
    const officialUnvisited=Array.isArray(summary.unvisited)?summary.unvisited:Array.isArray(summary.missingStores)?summary.missingStores:null;
    const officialAttention=Array.isArray(summary.attention)?summary.attention:Array.isArray(summary.attentionStores)?summary.attentionStores:null;
    const stores=configured.map(item=>{
      const name=String(item.name||item.store||''); const matching=rows.filter(row=>normalizeStore(row.store)===normalizeStore(name));
      const dates=matching.map(patrolVisitDate).filter(Boolean).sort(); const lastVisit=dates.at(-1)||'';
      const visited=hasBoundaries&&dates.some(date=>date>=periodStart&&date<=periodEnd);
      const followUps=matching.filter(row=>String(row.result||'').toLowerCase()!=='v'&&String(row.reason||'').trim()&&!/^na$/i.test(String(row.reason||'').trim())).length;
      const daysSince=lastVisit?Math.max(0,Math.floor((Date.now()-Date.parse(`${lastVisit}T00:00:00+08:00`))/86400000)):null;
      const officiallyUnvisited=officialUnvisited&&officialUnvisited.map(normalizeStore).includes(normalizeStore(name));
      const status=followUps?'attention':visited?'complete':(hasBoundaries||officiallyUnvisited)?'pending':'unknown';
      return { name, lastVisit, daysSince, status, followUps, result:followUps?`待追蹤 ${followUps}`:visited?'完成':status==='pending'?'本期未巡':'待正式期間' };
    });
    const derivedVisited=hasBoundaries?stores.filter(row=>row.status==='complete'||row.status==='attention').length:null;
    const visited=officialCompleted!=null?officialCompleted:derivedVisited;
    const expected=officialExpected!=null?officialExpected:(hasBoundaries?stores.length:null);
    const remaining=officialRemaining!=null?officialRemaining:(visited!=null&&expected!=null?Math.max(0,expected-visited):null);
    const completionRate=officialRate!=null?officialRate:(visited!=null&&expected?visited/expected:null);
    const unvisited=officialUnvisited?officialUnvisited.map(normalizeStore):(hasBoundaries?stores.filter(row=>row.status==='pending').map(row=>row.name):[]);
    const attention=officialAttention?officialAttention.map(normalizeStore):stores.filter(row=>row.status==='attention').map(row=>row.name);
    const recent=rows.slice().sort((a,b)=>String(b.fillTime||'').localeCompare(String(a.fillTime||''))).slice(0,8).map(row=>({store:row.store,date:patrolVisitDate(row)||row.fillTime,result:String(row.result||'').toLowerCase()==='v'?'完成':(String(row.reason||'').trim()||'待追蹤')}));
    return { visited,total:expected,expected,remaining,completionRate,unvisited,attention,attentionCount:numberOrNull(summary.attentionCount)??attention.length,statisticsPeriod,periodVerified:Boolean(statisticsPeriod&&visited!=null&&expected!=null),stores,recent };
  }

  async function loadPatrolData() {
    const date=dom('#scheduleDate').value||taipeiDate(); const month=date.slice(0,7);
    const results=await Promise.allSettled([patrolRead('sread',{month}),patrolRead('ptread')]); const readAt=nowIso();
    if (results[0].status==='fulfilled') {
      scheduleRaw=results[0].value.schedule; scheduleViewData=adaptSchedule(scheduleRaw,date);
      contract.scheduleByDate=C.moduleState({status:scheduleViewData.stores.length?'ok':'no_data',updatedAt:readAt,sourceUpdatedAt:readAt,stale:false,source:moduleSource('既有班表 sread','patrol.html'),data:{selectedDate:date,availableMonth:String(scheduleRaw&&scheduleRaw.month||month),stores:scheduleViewData.stores}});
      const today=taipeiDate();
      if (scheduleRaw&&scheduleRaw.month===today.slice(0,7)) {
        const todayData=adaptSchedule(scheduleRaw,today);
        contract.scheduleToday=C.moduleState({status:todayData.stores.length?'ok':'no_data',updatedAt:readAt,sourceUpdatedAt:readAt,stale:false,source:moduleSource('既有班表 sread','patrol.html'),data:todayData});
      }
      populateScheduleStores(scheduleViewData.stores.map(row=>row.store));
    } else { scheduleRaw=null; scheduleViewData=null; contract.scheduleToday=statusModule('scheduleToday','error',null,results[0].reason.message); contract.scheduleByDate=statusModule('scheduleByDate','error',null,results[0].reason.message); }
    if (results[1].status==='fulfilled') {
      patrolRaw=results[1].value; const data=adaptPatrol(patrolRaw);
      contract.patrolOverview=C.moduleState({status:data.stores.length?'ok':'no_data',updatedAt:readAt,sourceUpdatedAt:readAt,stale:false,source:moduleSource('既有巡店 ptread','patrol.html'),data});
      contract.patrolStores=C.moduleState({status:data.stores.length?'ok':'no_data',updatedAt:readAt,sourceUpdatedAt:readAt,stale:false,source:moduleSource('既有巡店 ptread','patrol.html'),data:data.stores});
      contract.patrolToday=C.moduleState({status:'no_data',updatedAt:readAt,sourceUpdatedAt:readAt,stale:false,source:moduleSource('既有巡店 ptread','patrol.html'),data:null,note:'現有正式來源未提供今日預定路線與移動時間'});
    } else {
      contract.patrolOverview=statusModule('patrolOverview','error',null,results[1].reason.message);
      contract.patrolToday=statusModule('patrolToday','error',null,results[1].reason.message);
      contract.patrolStores=statusModule('patrolStores','error',[],results[1].reason.message);
    }
    contract.generatedAt=readAt; renderAll();
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
    catch (_) { patrolToken=''; scope.sessionStorage.removeItem(PATROL_TOKEN_KEY); }
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
  all('[data-report-segment]').forEach(button=>button.addEventListener('click',()=>{ reportSegment=Number(button.dataset.reportSegment); all('[data-report-segment]').forEach(item=>item.classList.toggle('active',item===button)); renderReport(); }));
  dom('#privateAccessForm').addEventListener('submit',async event=>{ event.preventDefault(); const button=event.currentTarget.querySelector('button'); button.disabled=true; setMessage('#privateAccessMessage','正在以既有 Approved Device 讀取正式摘要…'); try { await loadFormalSummary(dom('#employeeId').value); } catch(error) { setMessage('#privateAccessMessage',error.message,'error'); } finally { button.disabled=false; } });
  dom('#patrolAccessForm').addEventListener('submit',async event=>{ event.preventDefault(); const button=event.currentTarget.querySelector('button'); button.disabled=true; try { await unlockPatrol(dom('#patrolPasscode').value); dom('#patrolPasscode').value=''; } catch(error) { setMessage('#patrolAccessMessage',error.message,'error'); } finally { button.disabled=false; } });
  dom('#patrolLogout').addEventListener('click',()=>{ const token=patrolToken; patrolToken=''; scheduleRaw=null; scheduleViewData=null; scope.sessionStorage.removeItem(PATROL_TOKEN_KEY); dom('#patrolLogout').hidden=true; contract.scheduleToday=statusModule('scheduleToday'); contract.scheduleByDate=statusModule('scheduleByDate'); contract.patrolToday=statusModule('patrolToday'); contract.patrolOverview=statusModule('patrolOverview'); contract.patrolStores=statusModule('patrolStores'); renderAll(); if(token) postPatrolAuth({action:'ptlogout',token}).catch(()=>{}); });
  all('[data-date-step]').forEach(button=>button.addEventListener('click',()=>shiftDate(Number(button.dataset.dateStep))));
  dom('[data-date-today]').addEventListener('click',()=>{ dom('#scheduleDate').value=taipeiDate(); if(patrolToken)loadPatrolData(); else renderSchedule(); });
  dom('#scheduleDate').addEventListener('change',()=>patrolToken?loadPatrolData():renderSchedule());
  dom('#scheduleStoreFilter').addEventListener('change',renderSchedule);
  all('[data-refresh]').forEach(button=>button.addEventListener('click',()=>{ if(PREVIEW_MODE)renderAll(); else { const id=scope.sessionStorage.getItem(EMPLOYEE_KEY); if(id)loadFormalSummary(id).catch(error=>setMessage('#privateAccessMessage',error.message,'error')); if(patrolToken)loadPatrolData(); } }));
  document.addEventListener('click',event=>{
    const scheduleButton=event.target.closest('[data-toggle-home-schedule]'); if(scheduleButton){ const card=scheduleButton.closest('#scheduleHome'); const expanded=card.classList.toggle('expanded'); scheduleButton.setAttribute('aria-expanded',String(expanded)); scheduleButton.querySelector('span').textContent=expanded?'收合當日班表':'顯示九店當日班表'; return; }
    const operationButton=event.target.closest('[data-toggle-operation]'); if(operationButton){ const item=operationButton.closest('.operation-item'); item.classList.toggle('expanded'); operationButton.setAttribute('aria-expanded',item.classList.contains('expanded')); return; }
    const reportButton=event.target.closest('[data-open-report]'); if(reportButton){ reportSegment=Number(reportButton.dataset.openReport); all('[data-report-segment]').forEach(button=>button.classList.toggle('active',Number(button.dataset.reportSegment)===reportSegment)); setView('report'); renderReport(); return; }
    const awardLink=event.target.closest('[data-open-awards]'); if(awardLink){ event.preventDefault(); battleKind='award'; battleScope='region'; all('[data-battle-kind]').forEach(button=>button.classList.toggle('active',button.dataset.battleKind==='award')); all('[data-battle-scope]').forEach(button=>button.classList.toggle('active',button.dataset.battleScope==='region')); setView('battle'); renderBattle(); return; }
    const storeButton=event.target.closest('.store-row'); if(storeButton){ const item=storeButton.closest('.store-item'); item.classList.toggle('expanded'); storeButton.setAttribute('aria-expanded',item.classList.contains('expanded')); return; }
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
    const stored=scope.sessionStorage.getItem(EMPLOYEE_KEY)||''; dom('#employeeId').value=stored;
    if(stored) loadFormalSummary(stored).catch(error=>setMessage('#privateAccessMessage',error.message,'error'));
    restorePatrol();
  }
  const initial=location.hash.slice(1); setView(all('[data-view]').some(view=>view.dataset.view===initial)?initial:'home'); renderAll();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') scope.addEventListener('load',()=>navigator.serviceWorker.register('./service-worker.js',{scope:'./'}).catch(()=>{}));
})(window);
