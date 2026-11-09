(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.KpiBattleController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
  const QUICK_UPLOAD_URL = 'https://script.google.com/macros/s/AKfycbzkvUUKtaFvEi7gaYWp8M98M_5fAmSD8a7g0ds5WarG5ikiOETTwalHattGKDMfqOfq/exec';
  const TRANSIENT_HTTP_STATUSES = new Set([404, 429, 500, 502, 503, 504]);
  const RETRYABLE_PRIVATE_ACTIONS = new Set(['private_access', 'kpicalc_access']);
  const DEFAULT_RETRY_DELAYS_MS = [2000, 5000];
  const KPI_BATTLE_CORE_KEYS = { a999: 'AQ V+D 999 (含)以上', a1399: 'AQ V+D 1399 (含)以上', haosu: '好速案銷售點數', r1399: 'RT V+D 1399 (含)以上' };
  const KPI_BATTLE_PERSONAL_KEYS = { A999: 'AQ V+D 999 (含)以上', A1399: 'AQ V+D 1399 (含)以上', '好速': '好速案銷售點數', R1399: 'RT V+D 1399 (含)以上', R999: 'RT V+D 999 (含)以上', RT: 'RT上線點數', '特維': '特殊維繫用戶續約數', '配件': '配件及其他營收', '包膜': '包膜與保貼營收' };
  // Display grouping from the approved Y26/11 KPI weight chart. These keys
  // only order the existing source fields; they never alter values or weights.
  const KPI_DETAIL_GROUPS = Object.freeze([
    {id:'core',label:'AQ／RT',keys:['5G銷售數','好速案銷售點數','TTL AQ上線點數','AQ V+D 999 (含)以上','AQ V+D 1399 (含)以上','預付卡開卡面額','RT上線點數','RT V+D 999 (含)以上','RT V+D 1399 (含)以上','特殊維繫用戶續約數','高高特維用戶續約數','自退數','解約後NP OUT','解約後NP OUT(督導績)']},
    {id:'addon',label:'加掛／DEVICE',keys:['Device專案銷售數','重點Device銷售量','換約淨新增金額','空機、3C、物聯網及門市購營收','配件及其他營收','包膜與保貼營收','手機保險服務點數','HBO Max&Disney+&Prime Video銷售數','Netflix多享組銷售數','MyVideo&KKBOX','Apple&Google服務及雜誌週刊開通數']},
  ]);
  function kpiBattleDetailGroups(keys) {
    const source=[...new Set(keys)],known=new Set(KPI_DETAIL_GROUPS.flatMap(group=>group.keys));
    return [...KPI_DETAIL_GROUPS.map(group=>({...group,keys:group.keys.filter(key=>source.includes(key))})),
      {id:'other',label:'來源未分類',keys:source.filter(key=>!known.has(key))}];
  }
  const KNOWN_HAOSU_CORRECTIONS = Object.freeze({
    '0904.xlsx': Object.freeze({
      dataAsOfDate: '2026-09-03',
      districtExcluded: 5,
      stores: Object.freeze({ '台北杭州南': 1.25, '台北通化': 2.5, '台北三創': 1.25 }),
    }),
  });

  function resolveGasUrl(storage) {
    const savedGasUrl = storage.getItem('bei12b_gas_url');
    const gasUrl = savedGasUrl === DEFAULT_GAS_URL ? savedGasUrl : DEFAULT_GAS_URL;
    if (savedGasUrl !== gasUrl) storage.setItem('bei12b_gas_url', gasUrl);
    return gasUrl;
  }

  function diagnosticResponseUrl(value) {
    try {
      const parsed = new URL(String(value || ''));
      return `${parsed.origin}${parsed.pathname}`;
    } catch (error) {
      return '';
    }
  }

  function kpiPendingCell() {
    return '<span class="kpi-sub" style="font-weight:800;color:var(--text-muted)">尚未有資料</span>';
  }

  function kpicalcMetric(entry, meta) {
    if (!entry) return null;
    const actual = entry.a == null || entry.a === '' ? null : Number(entry.a);
    const target = entry.t == null || entry.t === '' ? null : Number(entry.t);
    const reportRate = entry.reportRate === '' || entry.reportRate === null || entry.reportRate === undefined
      ? null : Number(entry.reportRate);
    const expected = (target > 0 && Number(meta.monthDays) > 0) ? target * Number(meta.snapshotDay) / Number(meta.monthDays) : null;
    return { actual, target, rate: Number.isFinite(reportRate) ? reportRate : null, daily_gap: expected == null || actual == null ? null : actual - expected };
  }

  function kpiBattleDataAsOfDate(meta) {
    return (/^\d{4}-\d{2}$/.test(meta.month || '') && meta.snapshotDay)
      ? `${meta.month}-${String(meta.snapshotDay).padStart(2, '0')}` : '';
  }

  function kpiBattleSourceFile(value) {
    const raw = String(value || '').split(/[\\/]/).pop().trim().toLowerCase();
    const staged = raw.match(/^report-upload-temp-[a-f0-9]{32,64}-(\d{4}\.xlsx)$/i);
    return staged ? staged[1].toLowerCase() : raw;
  }

  function kpiBattleReportDateFromSource(value, dataAsOfDate) {
    const source = kpiBattleSourceFile(value);
    const match = source.match(/^(0[1-9]|1[0-2])([0-2][0-9]|3[01])\.xlsx$/i);
    const asOf = String(dataAsOfDate || '');
    const yearMatch = asOf.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match || !yearMatch) return '';
    let year = Number(yearMatch[1]);
    const sourceMonth = Number(match[1]);
    const asOfMonth = Number(yearMatch[2]);
    if (sourceMonth === 1 && asOfMonth === 12) year += 1;
    if (sourceMonth === 12 && asOfMonth === 1) year -= 1;
    return `${year}-${match[1]}-${match[2]}`;
  }

  function kpiBattleCorrectMetric(metric, excluded) {
    if (!metric || !Number.isFinite(Number(excluded)) || Number(excluded) <= 0) return metric;
    const actual = Math.max(0, (Number(metric.actual) || 0) - Number(excluded));
    const priorActual = Number(metric.actual) || 0;
    const priorGap = Number(metric.daily_gap);
    const expected = Number.isFinite(priorGap) ? priorActual - priorGap : null;
    const rate = expected && expected > 0 ? Math.min(2.5, actual / expected) : metric.rate;
    return { ...metric, actual, rate, daily_gap: expected == null ? metric.daily_gap : actual - expected };
  }

  function kpiBattleApplyKnownCorrections(data) {
    const copy = data || {};
    const source = kpiBattleSourceFile(copy.source_file);
    const correction = KNOWN_HAOSU_CORRECTIONS[source];
    if (!correction || correction.dataAsOfDate !== String(copy.data_as_of_date || '')) return copy;
    const key = KPI_BATTLE_CORE_KEYS.haosu;
    const adjust = (container, excluded) => {
      if (!container || !container.metrics || !container.metrics[key]) return;
      const corrected = kpiBattleCorrectMetric(container.metrics[key], excluded);
      container.metrics[key] = corrected;
      container.core = { ...(container.core || {}), haosu: corrected };
    };
    adjust(copy.aggregate, correction.districtExcluded);
    (copy.stores || []).forEach(row => adjust(row, Number(correction.stores[displayStoreName(row.store)]) || 0));
    (copy.personal || []).forEach(row => {
      const excluded = Number(correction.stores[displayStoreName(row.store)]) || 0;
      if (excluded && row.metrics && row.metrics['好速']) row.metrics['好速'] = kpiBattleCorrectMetric(row.metrics['好速'], excluded);
      row.insurance_attach_rate = null;
      row.phone_award_actual = null;
      row.phone_award_projected = null;
      row.phone_award_rank = null;
      row.phone_award_eligible = null;
    });
    if (copy.aggregate) copy.aggregate.insurance_attach_rate = null;
    (copy.stores || []).forEach(row => { row.insurance_attach_rate = null; });
    copy.supplement_status = '核心 KPI 已更新；QIS、保險與台獎待補';
    copy.corrections = [...(copy.corrections || []), {
      type: 'haosu-enterprise-exclusion', source_file: source,
      excluded_points: correction.districtExcluded, effective_points: copy.aggregate?.metrics?.[key]?.actual,
    }];
    return copy;
  }

  function kpiBattleSourceDateRange(value) {
    const normalized = String(value || '').trim().replace(/\s*[~～]\s*/g, '～');
    return normalized || '—';
  }

  function kpiBattleSourceMetadata(data, supplement) {
    const items = [
      ['戰報日期', data.report_date || '—'],
      ['資料統計至', data.data_as_of_date || data.source_as_of_date || '—'],
      ['來源檔', data.source_file || '—'],
      ['統計區間', kpiBattleSourceDateRange(data.source_date_range)],
      ['同步狀態', supplement],
    ];
    return `<div class="kpi-source-metadata">${items.map(([label, value], index) => `<div class="kpi-source-item${index === 4 ? ' status' : ''}"><strong>${label}</strong><span> ${value}</span></div>`).join('')}</div>`;
  }

  function kpiBattleStoreKey(value) {
    return String(value || '').replace(/^台灣大哥大數位生活台北/, '').replace(/^台北/, '').replace(/\s+/g, '').trim();
  }

  function displayStoreName(value) {
    const name = String(value || '').trim();
    return name === '台灣大哥大台北三創' || name === '台灣大哥大數位生活台北三創'
      ? '台北三創'
      : name;
  }

  function kpiBattlePersonKey(row) {
    return `${kpiBattleStoreKey(row && row.store)}|${String((row && row.name) || '').replace(/［來源缺字］/g, '?').replace(/[＊*]/g, '').trim()}`;
  }

  function kpiBattleSupplementIsCurrent(kpiData, snapshot) {
    const snapshotReportDate = String((snapshot || {}).report_date || '');
    const snapshotDataAsOf = String((snapshot || {}).data_as_of_date || '');
    const kpiReportDate = String((kpiData || {}).report_date || '');
    const kpiDataAsOf = String((kpiData || {}).data_as_of_date || '');
    const snapshotSource = kpiBattleSourceFile((snapshot || {}).source_file);
    const kpiDataSource = kpiBattleSourceFile((kpiData || {}).source_file);
    const reportDateCompatible = snapshotReportDate === kpiReportDate || snapshotReportDate === snapshotDataAsOf;
    return Boolean(
      snapshot && snapshotReportDate && snapshotDataAsOf && kpiDataAsOf && snapshotSource && kpiDataSource &&
      reportDateCompatible && snapshotDataAsOf === kpiDataAsOf && snapshotSource === kpiDataSource
    );
  }

  function mergeKpiBattleSupplement(kpiData, snapshot) {
    if (!kpiBattleSupplementIsCurrent(kpiData, snapshot)) return kpiBattleApplyKnownCorrections({ ...kpiData, supplement_synced: false });
    const copy = JSON.parse(JSON.stringify(kpiData));
    const aggregate = snapshot.aggregate || {};
    const copyFields = (target, source, fields) => fields.forEach(field => {
      if (source && source[field] != null) target[field] = source[field];
    });
    copy.report_date = String(kpiData.report_date || snapshot.report_date);
    // Preserve the source's explicit publication day separately from its cutoff.
    copy.report_run_date = String(snapshot.report_run_date || '');
    copy.source_date_range = snapshot.source_date_range || copy.source_date_range;
    copy.aggregate = { ...copy.aggregate };
    copyFields(copy.aggregate, aggregate, ['overall_kpi', 'overall_kpi_dod', 'company_rank', 'company_rank_dod', 'addon_score', 'addon_score_dod', 'insurance_attach_rate', 'insurance_attach_rate_dod']);
    const snapshotStores = new Map((snapshot.stores || []).map(row => [kpiBattleStoreKey(row.store), row]));
    copy.stores = copy.stores.map(row => {
      const source = snapshotStores.get(kpiBattleStoreKey(row.store));
      const merged = { ...row };
      copyFields(merged, source, ['overall_kpi_dod', 'company_rank', 'company_rank_dod', 'addon_score', 'addon_score_dod', 'insurance_attach_rate', 'insurance_attach_rate_dod']);
      return merged;
    });
    const snapshotPeople = new Map((snapshot.personal || []).map(row => [kpiBattlePersonKey(row), row]));
    const trustedManagerSupplement = String(snapshot.personal_semantics || '') === 'individual-v1';
    const rankSource = snapshot.personal_rank_source || {};
    const trustedRankSupplement = String(snapshot.personal_rank_semantics || '') === 'individual-rank-v1' &&
      rankSource.sheet === '上線數KPI_個人達成率_明細' && rankSource.column === 'I' &&
      rankSource.source_file === snapshot.source_file && rankSource.data_as_of_date === snapshot.data_as_of_date &&
      /^[a-f0-9]{64}$/.test(String(rankSource.sha256 || ''));
    copy.personal = copy.personal.map(row => {
      const source = snapshotPeople.get(kpiBattlePersonKey(row));
      const merged = { ...row };
      const manager = /店長/.test(String(row.role || row.category || '')) && !/副店長/.test(String(row.role || row.category || ''));
      copyFields(merged, source, manager && !trustedManagerSupplement
        ? ['insurance_attach_rate', 'phone_award_actual', 'phone_award_projected', 'phone_award_rank', 'phone_award_eligible', ...(trustedRankSupplement ? ['rank', 'rank_dod'] : [])]
        : ['rank', 'rank_dod', 'overall_rate_dod', 'insurance_attach_rate', 'phone_award_actual', 'phone_award_projected', 'phone_award_rank', 'phone_award_eligible']);
      return merged;
    });
    return kpiBattleApplyKnownCorrections({ ...copy, supplement_synced: true });
  }

  function kpicalcToKpiBattleView(data, fetchedAt) {
    const safeData = data || {};
    const meta = safeData.meta || {};
    const dataAsOfDate = kpiBattleDataAsOfDate(meta);
    const sourceFile = kpiBattleSourceFile(meta.sourceFile);
    // The MMDD source filename is the publication-day identity, not the
    // business cutoff.  Leave report_date unset until the same-source formal
    // snapshot supplies the authoritative report/data cutoff date.
    const reportDate = '';
    const codeName = {};
    (safeData.stores || []).forEach(store => { codeName[store.code] = store.name; });
    const metricsOf = itemsObj => {
      const output = {};
      (safeData.items || []).forEach(item => {
        const metric = kpicalcMetric((itemsObj || {})[item.key], meta);
        if (metric) output[item.key] = metric;
      });
      return output;
    };
    const coreOf = metrics => {
      const core = {};
      Object.entries(KPI_BATTLE_CORE_KEYS).forEach(([short, key]) => { core[short] = metrics[key] || null; });
      return core;
    };
    const stores = (safeData.stores || []).map(store => {
      const metrics = metricsOf(store.items);
      return { store: store.name, overall_kpi: store.official, company_rank: null, addon_score: null, insurance_attach_rate: null, core: coreOf(metrics), metrics };
    });
    const aggregateItems = {};
    const aggregateRates = safeData.aggregateRates || {};
    (safeData.items || []).forEach(item => {
      let actual = 0;
      let target = 0;
      let seen = false;
      let actualComplete = true;
      let targetComplete = true;
      (safeData.stores || []).forEach(store => {
        const entry = (store.items || {})[item.key];
        if (entry) {
          if (entry.a == null || entry.a === '') actualComplete = false; else actual += Number(entry.a);
          if (entry.t == null || entry.t === '') targetComplete = false; else target += Number(entry.t);
          seen = true;
        } else { actualComplete = false; targetComplete = false; }
      });
      if (seen) aggregateItems[item.key] = kpicalcMetric({ a: actualComplete ? actual : null, t: targetComplete ? target : null, reportRate: aggregateRates[item.key] }, meta);
    });
    const personal = (safeData.persons || []).map(person => {
      const metrics = {};
      Object.entries(KPI_BATTLE_PERSONAL_KEYS).forEach(([short, key]) => {
        metrics[short] = kpicalcMetric((person.items || {})[key], meta);
      });
      return {
        store: codeName[person.store] || person.store,
        category: person.role || '—',
        role: person.role || '',
        name: person.pname,
        overall_rate: person.official,
        overall_rate_dod: null,
        rank: null,
        rank_dod: null,
        insurance_attach_rate: null,
        phone_award_actual: null,
        phone_award_projected: null,
        metrics,
      };
    });
    return {
      source: 'kpicalc',
      fetchedAt: fetchedAt || '',
      source_file: sourceFile,
      report_date: reportDate,
      data_as_of_date: dataAsOfDate,
      source_as_of_date: dataAsOfDate,
      source_date_range: meta.period || '',
      metric_keys: (safeData.items || []).map(item=>item.key),
      previous_report_date: null,
      aggregate: { store: '北一二B整體', overall_kpi: meta.aggregateOfficialCorrected == null ? null : Number(meta.aggregateOfficialCorrected), company_rank: null, addon_score: null, insurance_attach_rate: null, core: coreOf(aggregateItems), metrics: aggregateItems },
      stores,
      personal,
    };
  }

  function formatPercent(value) {
    if (value == null || value === '') return '尚未有資料';
    const number = Number(value);
    return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : '—';
  }

  function kpiBattleTone(value) {
    if (value == null || value === '') return '';
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    if (number >= 1) return 'good';
    if (number >= 0.8) return 'warn';
    return 'bad';
  }

  function formatNumber(value) {
    if (value == null || value === '') return '尚未有資料';
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return String(Math.round(number * 100) / 100);
  }

  function formatMoney(value) {
    if (value == null || value === '') return '尚未有資料';
    const number = Number(value);
    return Number.isFinite(number) ? `$${Math.round(number).toLocaleString('en-US')}` : '—';
  }

  function kpiBattleTargetLine(metric, verbose) {
    if (!metric || metric.actual == null || metric.target == null) return '';
    const gap = metric.daily_gap == null ? NaN : Number(metric.daily_gap);
    const gapText = !Number.isFinite(gap) ? '進度差 —' : gap < -0.05 ? `尚差 ${formatNumber(Math.abs(gap))}` : gap > 0.05 ? `超前 ${formatNumber(gap)}` : '已達進度';
    const gapTone = gap > 0.05 ? 'up' : gap < -0.05 ? 'down' : '';
    const separator = verbose ? '｜' : '｜';
    return `<span class="kpi-sub" title="依資料截止日換算應達進度">實績 ${formatNumber(metric.actual)} ${separator} 月目標 ${formatNumber(metric.target)} ${separator} <span class="kpi-gap ${gapTone}">${gapText}</span></span>`;
  }

  function kpiBattleDod(value) {
    if (value == null || value === '') return '';
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    const direction = number > 0.0005 ? 'up' : number < -0.0005 ? 'down' : '';
    const wording = direction === 'up' ? `較昨日上升 ${(number * 100).toFixed(1)}pp` : direction === 'down' ? `較昨日下降 ${Math.abs(number * 100).toFixed(1)}pp` : '較昨日持平';
    return `<span class="kpi-dod ${direction}">${wording}</span>`;
  }

  function kpiBattleRankDod(value) {
    if (value == null || value === '') return '';
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    if (number > 0) return `<span class="kpi-dod up">DOD ↑ ${number}名</span>`;
    if (number < 0) return `<span class="kpi-dod down">DOD ↓ ${Math.abs(number)}名</span>`;
    return '<span class="kpi-dod">DOD 持平</span>';
  }

  function kpiBattleRate(value, dod) {
    if (value == null || !Number.isFinite(Number(value))) return kpiPendingCell();
    return `<span class="kpi-rate ${kpiBattleTone(value)}">${formatPercent(value)}</span>${kpiBattleDod(dod)}`;
  }

  function kpiBattleMetricCell(metric, includeDod) {
    if (!metric) return kpiPendingCell();
    if (metric.rate == null) return `${kpiPendingCell()}${kpiBattleTargetLine(metric)}${includeDod ? kpiBattleDod(metric.dod) : ''}`;
    return `<span class="kpi-rate ${kpiBattleTone(metric.rate)}">${formatPercent(metric.rate)}</span>${kpiBattleTargetLine(metric)}${includeDod ? kpiBattleDod(metric.dod) : ''}`;
  }

  function kpiBattleAwardCell(row) {
    if (row.phone_award_actual == null && row.phone_award_projected == null) return kpiPendingCell();
    const eligible = row.phone_award_eligible === 'Y';
    return `<span class="kpi-award-meta">實際獎金</span><span class="kpi-award-val">${formatMoney(row.phone_award_actual)}</span><span class="kpi-award-meta">推估獎金 ${formatMoney(row.phone_award_projected)}</span><span class="kpi-award-meta ${eligible ? '' : 'no'}">獎金排名 ${row.phone_award_rank ?? '—'}｜${eligible ? '可領獎' : '未領獎'}</span>`;
  }

  function kpiBattleInsuranceCell(row) {
    if (row?.insurance_attach_rate == null) return kpiPendingCell();
    return `<span class="kpi-rate rate-only">${formatPercent(row.insurance_attach_rate)}</span><span class="kpi-sub">實際搭售率</span>`;
  }

  function privateDashboardLockMarkup(kind) {
    const title = kind === 'awards' ? '台獎戰情受保護' : 'KPI 戰情受保護';
    const uploadEntry = kind === 'kpi' ? `<a class="secondary" href="${QUICK_UPLOAD_URL}" target="_blank" rel="noopener">資料快速上傳</a>` : '';
    return `<div class="card private-lock">
      <h3>🔐 ${title}</h3>
      <p>僅限北一二B在職同仁使用。姓名維持遮罩，KPI、排名與獎金不會出現在公開 GitHub 頁面。</p>
      <div class="private-lock-form">
        <input id="privateEmployeeId" inputmode="text" autocomplete="username" autocapitalize="characters" placeholder="輸入員工編號">
        <input id="privateBootstrapCode" inputmode="numeric" autocomplete="one-time-code" placeholder="首次綁定碼（首次才需填）">
      </div>
      <div class="private-lock-actions">
        <button data-private-dashboard-action="login">以員編登入</button>
        <button class="secondary" data-private-dashboard-action="request-binding">首次申請綁定</button>
        <button class="secondary" data-private-dashboard-action="check-request">查看核准結果</button>
        <button class="secondary" data-private-dashboard-action="open-admin">管理者核准</button>
        ${uploadEntry}
      </div>
      <div class="private-lock-status">首次使用：輸入員編＋啟用碼提出申請；管理者核准後，該員編只綁定這一台手機或電腦。往後僅輸入員編登入。</div>
      <div class="private-admin" id="privateAdminPanel" style="display:none;"></div>
    </div>`;
  }

  function create(options) {
    const config = options || {};
    const win = config.window || (typeof window !== 'undefined' ? window : null);
    const doc = config.document || (win && win.document);
    if (!win || !doc) throw new Error('KPI controller requires a browser document');
    const storage = config.localStorage || win.localStorage;
    const session = config.sessionStorage || win.sessionStorage;
    const getGasUrl = typeof config.getGasUrl === 'function' ? config.getGasUrl : () => DEFAULT_GAS_URL;
    const getAwardsData = typeof config.getAwardsData === 'function' ? config.getAwardsData : () => null;
    const onKpiLoaded = typeof config.onKpiLoaded === 'function' ? config.onKpiLoaded : () => {};
    const onKpiLoadError = typeof config.onKpiLoadError === 'function' ? config.onKpiLoadError : () => {};
    const transport = typeof config.post === 'function' ? config.post : post;
    const retryDelaysMs = Array.isArray(config.retryDelaysMs) ? config.retryDelaysMs : DEFAULT_RETRY_DELAYS_MS;
    const sleep = typeof config.sleep === 'function' ? config.sleep : delay => new Promise(resolve => win.setTimeout(resolve, delay));
    const logger = config.logger || win.console || (typeof console !== 'undefined' ? console : null);
    const request = payload => requestWithRetry(payload);
    const state = { data: null, view: 'stores', profile: null, adminSecret: '', loading: false, store: '', metricGroup: 'all' };
    function updateNotice(message) {
      const compactRefresh=doc.querySelector('.compact-refresh');if(compactRefresh)compactRefresh.disabled=!state.data||state.loading;
      for (const id of ['kpiBattleContent','awardsBattleContent']) {
        const content=doc.getElementById(id);if(!content)continue;
        let notice=doc.getElementById(id+'ReadStatus');
        if(!notice){notice=doc.createElement('div');notice.id=id+'ReadStatus';notice.className='card kpi-battle-note';notice.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap';if(config.compactOverview&&id==='kpiBattleContent')content.after(notice);else content.before(notice);}
        notice.replaceChildren();
        if(!state.data){notice.hidden=true;notice.style.display='none';continue;}
        notice.hidden=false;notice.style.display='flex';
        const text=doc.createElement('span');text.setAttribute('role','status');
        text.textContent=message||`上次讀取：${state.data.fetchedAt}。有效登入期間保留資料；需要最新資料時請手動更新。`;
        if(config.compactOverview)notice.classList.add('compact-read-status');
        const button=doc.createElement('button');button.type='button';button.textContent='更新資料';button.disabled=state.loading;
        button.dataset.privateDashboardAction='refresh';notice.append(text,button);
        if(win.BattleHtmlExport&&win.OfflineHtml){
          const kind=id==='kpiBattleContent'?'kpi':'awards',data=kind==='kpi'?state.data:getAwardsData();
          if(data){
            const exportButton=doc.createElement('button');exportButton.type='button';exportButton.textContent=kind==='kpi'?'一鍵匯出 KPI HTML':'一鍵匯出台獎 HTML';exportButton.disabled=state.loading;exportButton.dataset.battleHtmlExport=kind;
            exportButton.addEventListener('click',()=>{
              try{
                win.PortalLogout?.assertActive();
                if(state.loading||doc.hidden||!state.data||!state.profile||!(privateDashboardSessionEmployeeId()||win.DashboardB?.active()))throw Error('請先完成登入與資料核對。');
                const current=kind==='kpi'?state.data:getAwardsData();if(!current)throw Error('來源已清除，請重新讀取。');
                const html=kind==='kpi'?win.BattleHtmlExport.buildKpi(current):win.BattleHtmlExport.buildAwards(current);
                win.OfflineHtml.download(html,'北一二B_'+(kind==='kpi'?'KPI個績':'台獎')+'_'+String(current.data_as_of_date||current.report_date||'快照')+'.html',doc);
                text.textContent='HTML 已交給瀏覽器下載，包含目前已授權的完整明細，可離線開啟。';
              }catch(error){text.textContent='匯出停止：'+error.message;}
            });notice.append(exportButton);
          }
        }

      }
    }

    function privateDashboardDeviceId() {
      const key = 'north12b_private_dashboard_device_id';
      let deviceId = storage.getItem(key);
      if (deviceId) return deviceId;
      if (win.crypto && win.crypto.randomUUID) deviceId = win.crypto.randomUUID().replace(/-/g, '');
      else {
        const bytes = new Uint8Array(24);
        (win.crypto || {}).getRandomValues?.(bytes);
        deviceId = Array.from(bytes).map(value => value.toString(16).padStart(2, '0')).join('') || `${Date.now()}${Math.random()}`.replace(/\D/g, '');
      }
      storage.setItem(key, deviceId);
      return deviceId;
    }

    function privateDashboardSessionEmployeeId() {
      return session.getItem('north12b_private_dashboard_employee_id') || '';
    }

    function privateDashboardSetStatus(message, error) {
      doc.querySelectorAll('.private-lock-status').forEach(element => {
        element.textContent = message || '';
        element.style.color = error ? 'var(--red)' : 'var(--text-muted)';
      });
    }

    async function post(payload) {
      const gasUrl = getGasUrl();
      if (!gasUrl) throw new Error('尚未設定 Apps Script 服務網址');
      let response;
      try {
        response = await win.fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload),
          cache: 'no-store',
        });
      } catch (error) {
        const networkError = new Error('服務連線失敗，請稍後再試。');
        networkError.kind = 'network';
        networkError.exceptionType = String(error?.name || 'Error');
        throw networkError;
      }
      if (!response.ok) {
        const httpError = new Error(`服務連線失敗（HTTP ${response.status}）`);
        httpError.kind = 'http';
        httpError.httpStatus = Number(response.status) || 0;
        httpError.responseUrl = diagnosticResponseUrl(response.url || gasUrl);
        httpError.responseRedirected = Boolean(response.redirected);
        httpError.responseContentType = String(response.headers?.get?.('content-type') || '');
        throw httpError;
      }
      let body;
      try {
        body = await response.json();
      } catch (error) {
        const responseError = new Error('服務回應格式無法辨識');
        responseError.kind = 'response';
        responseError.exceptionType = String(error?.name || 'Error');
        throw responseError;
      }
      if (!body || body.status !== 'ok') {
        const businessError = new Error((body && body.message) || '服務回應失敗');
        businessError.kind = 'business';
        throw businessError;
      }
      return body;
    }

    function normalizeTransportError(error) {
      if (error && error.kind) return error;
      if (error && error.name === 'TypeError') {
        const networkError = new Error('服務連線失敗，請稍後再試。');
        networkError.kind = 'network';
        networkError.exceptionType = 'TypeError';
        return networkError;
      }
      return error;
    }

    function isTransientTransportError(error) {
      return Boolean(error && (
        error.kind === 'network' ||
        (error.kind === 'http' && TRANSIENT_HTTP_STATUSES.has(Number(error.httpStatus)))
      ));
    }

    function requestDiagnostic(error, payload, attempt, retrySucceeded) {
      const gasUrl = diagnosticResponseUrl(getGasUrl());
      const responseUrl = diagnosticResponseUrl(error?.responseUrl);
      let failureTarget = 'original-exec';
      if (error?.kind === 'network') failureTarget = 'network-exception';
      else if (error?.responseRedirected || (responseUrl && responseUrl !== gasUrl)) failureTarget = 'redirect-target';
      return {
        timestamp: new Date().toISOString(),
        action: String(payload?.action || 'unknown'),
        attempt,
        httpStatus: error?.kind === 'http' ? Number(error.httpStatus) || 0 : null,
        responseUrl,
        responseRedirected: Boolean(error?.responseRedirected),
        responseContentType: String(error?.responseContentType || ''),
        exceptionType: error?.kind === 'network' ? String(error.exceptionType || 'Error') : '',
        retrySucceeded: Boolean(retrySucceeded),
        failureTarget,
      };
    }

    function finalTransportError(error) {
      const detail = error.kind === 'http' ? `HTTP ${Number(error.httpStatus) || 0}` : '網路錯誤';
      const finalError = new Error(`服務暫時無法連線（${detail}），請稍後再試。`);
      finalError.kind = error.kind;
      finalError.httpStatus = error.httpStatus || null;
      finalError.failureTarget = error.failureTarget || '';
      return finalError;
    }

    async function requestWithRetry(payload) {
      const maxAttempts = retryDelaysMs.length + 1;
      let lastDiagnostic = null;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const result = await transport(payload);
          if (attempt > 1 && lastDiagnostic) {
            logger?.info?.('[KPI Battle private request recovered after retry]', {
              ...lastDiagnostic,
              timestamp: new Date().toISOString(),
              attempt,
              retrySucceeded: true,
            });
          }
          return result;
        } catch (caught) {
          const error = normalizeTransportError(caught);
          if (!RETRYABLE_PRIVATE_ACTIONS.has(String(payload?.action || '')) || !isTransientTransportError(error)) throw error;
          lastDiagnostic = requestDiagnostic(error, payload, attempt, false);
          if (attempt >= maxAttempts) {
            logger?.error?.('[KPI Battle private request failed after retries]', {
              ...lastDiagnostic,
              finalFailure: true,
            });
            const finalError = finalTransportError(error);
            finalError.failureTarget = lastDiagnostic.failureTarget;
            throw finalError;
          }
          logger?.warn?.('[KPI Battle private request transient failure]', lastDiagnostic);
          privateDashboardSetStatus('服務暫時不穩定，正在重新連線…');
          await sleep(Number(retryDelaysMs[attempt - 1]) || 0);
        }
      }
      throw new Error('服務暫時無法連線，請稍後再試。');
    }

    function renderLock() {
      const kpiContent = doc.getElementById('kpiBattleContent');
      const awardsContent = doc.getElementById('awardsBattleContent');
      if (kpiContent && !state.data) kpiContent.innerHTML = privateDashboardLockMarkup('kpi');
      if (awardsContent && !getAwardsData()) awardsContent.innerHTML = privateDashboardLockMarkup('awards');
      const storedId = privateDashboardSessionEmployeeId();
      doc.querySelectorAll('#privateEmployeeId').forEach(input => { input.value = storedId; });
    }

    function privateDashboardEmployeeInput() {
      const input = Array.from(doc.querySelectorAll('#privateEmployeeId')).find(element => element.offsetParent !== null) || doc.querySelector('#privateEmployeeId');
      return String(input?.value || '').trim();
    }

    function privateDashboardBootstrapInput() {
      const input = Array.from(doc.querySelectorAll('#privateBootstrapCode')).find(element => element.offsetParent !== null) || doc.querySelector('#privateBootstrapCode');
      return String(input?.value || '').trim();
    }

    function renderCompactStores() {
      const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
      const number = value => value == null || value === '' || !Number.isFinite(Number(value)) ? '—' : formatNumber(value);
      const percent = value => value == null || value === '' || !Number.isFinite(Number(value)) ? '—' : formatPercent(value);
      const delta = (value, unit) => value == null || value === '' || !Number.isFinite(Number(value)) ? '—' : `${Number(value)>0?'+':''}${number(Number(value)*(unit==='pp'?100:1))} ${unit}`;
      const aggregate = state.data.aggregate || {};
      const stores = [...(state.data.stores || [])];
      const valid = stores.filter(row => row.overall_kpi != null && row.overall_kpi !== '' && Number.isFinite(Number(row.overall_kpi))).sort((a,b)=>Number(b.overall_kpi)-Number(a.overall_kpi));
      const rank = row => valid.includes(row) ? 1+valid.filter(other=>Number(other.overall_kpi)>Number(row.overall_kpi)).length : null;
      const rankMark=(kind,label)=>`<b class="rank-${kind}"><svg class="rank-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${kind==='top'?'<path d="M8 3h8v5a4 4 0 0 1-8 0V3ZM8 5H4v2a4 4 0 0 0 4 4m8-6h4v2a4 4 0 0 1-4 4m-4 1v6m-4 3h8m-7 0v-3h6v3"/>':'<path d="M6 21V3m0 1h13l-3 4 3 4H6"/>'}</svg><span>${label}</span></b>`;
      const badge = row => {
        const position=rank(row);
        const bottom=valid.filter(other=>Number(other.overall_kpi)<Number(row.overall_kpi)).length;
        return position == null ? '<small>區內排名待載入</small>' : `<small>區內第 ${position} 名 ${position<=3?rankMark('top','TOP3'):bottom<3?rankMark('bottom','BOT3'):''}</small>`;
      };
      const rows = [{...aggregate, store:'北一二B整體',isDistrict:true},...stores];
      const selected = rows.find(row=>row.store===state.store)||rows[0];
      state.store=selected.store;
      const metrics=selected.metrics||{};
      const labels={'AQ V+D 999 (含)以上':'A999','AQ V+D 1399 (含)以上':'A1399','好速案銷售點數':'好速','RT V+D 999 (含)以上':'R999','RT V+D 1399 (含)以上':'R1399','RT上線點數':'RT達成率'};
      const groups=kpiBattleDetailGroups(state.data.metric_keys||Object.keys(metrics));
      const metricRow=(label,metric,key=label)=>`<tr data-kpi-metric="${esc(key)}"><th scope="row">${esc(label)}</th><td>${number(metric?.target)}</td><td>${number(metric?.actual)}</td><td class="${kpiBattleTone(metric?.rate)}">${percent(metric?.rate)}</td><td>${number(metric?.target)}</td></tr>`;
      const headers='<tr><th>項目</th><th>月目標</th><th>月累計實績</th><th>進度達成率</th><th>目標<br>（不打折）</th></tr>';
      const metricTable=body=>`<div class="table-wrap" tabindex="0" role="region" aria-label="各店成績，可左右捲動"><table class="compact-details"><thead>${headers}</thead><tbody>${body||'<tr><td colspan="5">目前分類沒有項目</td></tr>'}</tbody></table></div>`;
      const rateCell=metric=>`<td class="${kpiBattleTone(metric?.rate)}">${percent(metric?.rate)}</td>`;
      const insuranceCell=value=>`<td data-insurance-rate class="${value==null||value===''||!Number.isFinite(Number(value))?'':Number(value)>=.5?'insurance-met':'insurance-low'}" title="保險搭售率門檻 50%">${percent(value)}</td>`;
      const underTarget=value=>value!=null&&value!==''&&Number.isFinite(Number(value))&&Number(value)<1;
      const groupTables=groups.filter(group=>(group.keys.length||group.id==='addon')&&(state.metricGroup==='all'||state.metricGroup===group.id)).map(group=>{
        const extra=group.id==='addon'?`<tr><th scope="row">附掛得分</th><td>—</td><td>${number(selected.addon_score)} 分</td><td>—</td><td>—</td></tr><tr><th scope="row">保險搭售率</th><td>—</td><td>${percent(selected.insurance_attach_rate)}</td><td>—</td><td>—</td></tr>`:'';
        return `<section class="compact-metric-group" data-kpi-group="${group.id}"><h4>${group.label}</h4>${metricTable(group.keys.map(key=>metricRow(labels[key]||key,metrics[key],key)).join('')+extra)}</section>`;
      }).join('');
      const summary=(label,value,dod)=>`<article class="summary-card"><div class="sc-label">${label}</div><div class="sc-val">${value}</div><div class="sc-sub">DOD：${dod}</div></article>`;
      return `<div class="summary-grid compact-summary">
        ${summary('全區 KPI',percent(aggregate.overall_kpi),delta(aggregate.overall_kpi_dod,'pp'))}
        ${summary('公司排名',number(aggregate.company_rank),aggregate.company_rank_dod==null?'—':kpiBattleRankDod(aggregate.company_rank_dod).replace('DOD ',''))}
        ${summary('附掛得分',number(aggregate.addon_score),delta(aggregate.addon_score_dod,'分'))}
        ${summary('保險搭售',percent(aggregate.insurance_attach_rate),delta(aggregate.insurance_attach_rate_dod,'pp'))}
      </div>
      <section class="compact-overview" aria-labelledby="storeOverviewHeading"><div class="compact-section-heading"><h2 id="storeOverviewHeading">店點總覽</h2>${rankMark('top','區內TOP3')}${rankMark('bottom','區內BOT3')}<span class="kpi-battle-note">依有效 KPI 排名；缺值不列名次</span></div>
      <div class="table-wrap" tabindex="0" role="region" aria-label="九店 KPI 總覽，可左右捲動"><table class="compact-matrix"><thead><tr><th>店點／區內標示</th><th>KPI</th><th>公司排名</th><th>DOD<br>（較前日）</th><th>附掛得分</th><th>保險<br>搭售率</th><th>A999</th><th>A1399</th><th>好速</th><th>RT</th><th>R1399</th></tr></thead><tbody>
      ${stores.map(row=>`<tr><th scope="row">${esc(displayStoreName(row.store))}${badge(row)}</th><td data-overall-kpi class="${kpiBattleTone(row.overall_kpi)}${underTarget(row.overall_kpi)?' kpi-attention':''}">${percent(row.overall_kpi)}</td><td>${number(row.company_rank)}</td><td>${delta(row.overall_kpi_dod,'pp')}</td><td>${number(row.addon_score)}<small>DOD ${delta(row.addon_score_dod,'分')}</small></td>${insuranceCell(row.insurance_attach_rate)}${rateCell(row.core?.a999)}${rateCell(row.core?.a1399)}${rateCell(row.core?.haosu)}${rateCell(row.metrics?.['RT上線點數'])}${rateCell(row.core?.r1399)}</tr>`).join('')}
      </tbody></table></div><p class="kpi-battle-note">KPI 以 100% 標色提醒；保險搭售率依 50% 門檻獨立標色，缺值顯示 —。</p></section>
      <section class="compact-store-details" aria-labelledby="storeDetailHeading"><h2 id="storeDetailHeading">各店詳細成績</h2>
        <div class="kpi-battle-filter"><label>選擇門市<select id="kpiBattleStoreSelect">${rows.map(row=>`<option value="${esc(row.store)}"${row.store===selected.store?' selected':''}>${esc(displayStoreName(row.store))}</option>`).join('')}</select></label><label>項目分類<select id="kpiBattleMetricGroup"><option value="all"${state.metricGroup==='all'?' selected':''}>全部項目</option>${groups.filter(group=>group.keys.length||group.id==='addon').map(group=>`<option value="${group.id}"${state.metricGroup===group.id?' selected':''}>${group.label}</option>`).join('')}</select></label></div>
        <h3>${esc(displayStoreName(selected.store))}｜KPI 分類明細</h3><div class="kpi-battle-toggle">${[['all','全部'],...groups.filter(group=>group.keys.length||group.id==='addon').map(group=>[group.id,group.label])].map(([id,label])=>`<button type="button" data-kpi-detail-tab="${id}" class="${state.metricGroup===id?'active':''}" aria-pressed="${state.metricGroup===id}">${label}</button>`).join('')}</div>
        ${groupTables}
        <p class="kpi-battle-note">目標（不打折）直接取正式來源原月目標，未按天數或折扣換算；進度達成率沿用正式報表。未提供的目標顯示 —。</p>
        <details class="compact-disclosure"><summary>個別項目完整明細</summary>${metricTable(Object.entries(metrics).map(([name,metric])=>metricRow(name,metric)).join(''))}</details>
      </section>`;
    }

    function renderStores() {
      if(config.compactOverview)return renderCompactStores();
      const aggregate = state.data.aggregate || {};
      const stores = [...(state.data.stores || [])].sort((left, right) => (left.company_rank || 9999) - (right.company_rank || 9999));
      const rows = [{ ...aggregate, store: '北一二B整體', isDistrict: true }, ...stores];
      const selected = rows.find(row => row.store === doc.getElementById('kpiBattleStoreSelect')?.value) || rows[0];
      return `
        <div class="summary-grid">
          <div class="summary-card"><div class="sc-label">北一二B KPI</div><div class="sc-val ${kpiBattleTone(aggregate.overall_kpi)}">${aggregate.overall_kpi == null ? kpiPendingCell() : formatPercent(aggregate.overall_kpi)}</div><div class="sc-sub">${kpiBattleDod(aggregate.overall_kpi_dod) || '整體達成率'}</div></div>
          <div class="summary-card"><div class="sc-label">公司排名</div><div class="sc-val" style="color:var(--gold)">${aggregate.company_rank ?? kpiPendingCell()}</div><div class="sc-sub">${kpiBattleRankDod(aggregate.company_rank_dod) || '北一二B整體'}</div></div>
          <div class="summary-card"><div class="sc-label">加掛得分</div><div class="sc-val" style="color:var(--purple)">${aggregate.addon_score == null ? kpiPendingCell() : formatNumber(aggregate.addon_score)}</div><div class="sc-sub">${aggregate.addon_score_dod == null ? '整體得分' : `DOD ${aggregate.addon_score_dod > 0 ? '+' : ''}${formatNumber(aggregate.addon_score_dod)} 分`}</div></div>
          <div class="summary-card"><div class="sc-label">保險搭售率</div><div class="sc-val" style="color:#0f766e">${aggregate.insurance_attach_rate == null ? kpiPendingCell() : formatPercent(aggregate.insurance_attach_rate)}</div><div class="sc-sub">實際搭售率</div></div>
          <div class="summary-card"><div class="sc-label">KPI未達100%</div><div class="sc-val" style="color:var(--red)">${stores.every(row => row.overall_kpi != null && row.overall_kpi !== '') ? stores.filter(row => Number(row.overall_kpi) < 1).length : kpiPendingCell()}</div><div class="sc-sub">間門市</div></div>
        </div>
        <div class="section-divider">北一二B／店點 KPI 排名</div>
        <div class="card" style="padding:14px 10px;"><div class="table-wrap"><table>
          <thead><tr><th style="text-align:left">店點</th><th>公司排名</th><th>KPI總達成</th><th>加掛</th><th>保險搭售率</th><th>A999</th><th>A1399</th><th>好速</th><th>R1399</th></tr></thead>
          <tbody>${rows.map(row => `<tr${row.isDistrict ? ' style="background:rgba(255,102,0,.08);border-top:2px solid rgba(255,102,0,.35)"' : ''}><td class="store-name"${row.isDistrict ? ' style="color:var(--accent-bright)"' : ''}>${row.isDistrict ? '🏢 ' : ''}${displayStoreName(row.store)}</td><td>${row.company_rank == null ? kpiPendingCell() : `<span class="val-gold">${row.company_rank}</span>`}${kpiBattleRankDod(row.company_rank_dod)}</td><td>${row.overall_kpi == null ? kpiPendingCell() : kpiBattleRate(row.overall_kpi, row.overall_kpi_dod)}</td><td>${row.addon_score == null ? kpiPendingCell() : formatNumber(row.addon_score)}${row.addon_score_dod == null ? '' : `<span class="kpi-dod ${row.addon_score_dod > 0 ? 'up' : row.addon_score_dod < 0 ? 'down' : ''}">DOD ${row.addon_score_dod > 0 ? '+' : ''}${formatNumber(row.addon_score_dod)}</span>`}</td><td>${kpiBattleInsuranceCell(row)}</td><td>${kpiBattleMetricCell(row.core?.a999, true)}</td><td>${kpiBattleMetricCell(row.core?.a1399, true)}</td><td>${kpiBattleMetricCell(row.core?.haosu, true)}</td><td>${kpiBattleMetricCell(row.core?.r1399, true)}</td></tr>`).join('')}</tbody>
        </table></div></div>
        <div class="section-divider">各項 KPI 達成</div>
        <div class="card">
          <div class="kpi-battle-filter"><label>選擇區／店點<select id="kpiBattleStoreSelect">${rows.map(row => `<option value="${row.store}" ${row.store === selected?.store ? 'selected' : ''}>${row.isDistrict ? '🏢 ' : ''}${displayStoreName(row.store)}</option>`).join('')}</select></label></div>
          <div class="kpi-metric-grid">${Object.entries(selected?.metrics || {}).map(([name, metric]) => `<div class="kpi-metric-card"><div class="label">${name}</div><div class="value kpi-rate ${kpiBattleTone(metric.rate)}">${formatPercent(metric.rate)}</div>${kpiBattleTargetLine(metric, true)}${kpiBattleDod(metric.dod)}</div>`).join('')}</div>
        </div>`;
    }

    function renderPersonal() {
      const people = state.data.personal || [];
      const storeOptions = [...new Set(people.map(row => row.store))];
      const roleOptions = [...new Set(people.map(row => row.category))];
      const store = doc.getElementById('kpiBattlePersonalStore')?.value || 'all';
      const role = doc.getElementById('kpiBattlePersonalRole')?.value || 'all';
      const rows = people.filter(row => (store === 'all' || row.store === store) && (role === 'all' || row.category === role))
        .sort((left, right) => Number(right.overall_rate || -1) - Number(left.overall_rate || -1));
      return `
        <div class="card"><div class="kpi-battle-filter">
          <label>店點<select id="kpiBattlePersonalStore"><option value="all">全部店點</option>${storeOptions.map(value => `<option value="${value}" ${value === store ? 'selected' : ''}>${displayStoreName(value)}</option>`).join('')}</select></label>
          <label>職類<select id="kpiBattlePersonalRole"><option value="all">全部職類</option>${roleOptions.map(value => `<option value="${value}" ${value === role ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
          <span class="kpi-battle-note">共 ${rows.length} 人｜姓名已遮罩</span>
        </div></div>
        <div class="card" style="padding:14px 10px;"><div class="table-wrap"><table>
          <thead><tr><th style="text-align:left">姓名</th><th>總達成率</th><th>KPI排名</th><th>個人台獎</th><th>保險搭售率</th><th>店點</th><th>職類</th><th>A999</th><th>A1399</th><th>好速</th><th>R1399</th><th>R999</th><th>RT</th><th>特維</th><th>配件</th><th>包膜</th></tr></thead>
          <tbody>${rows.map(row => `<tr><td class="store-name">${row.name}</td><td>${kpiBattleRate(row.overall_rate, row.overall_rate_dod)}</td><td>${row.rank ?? kpiPendingCell()}${kpiBattleRankDod(row.rank_dod)}</td><td>${row.phone_award_actual == null && row.phone_award_projected == null ? kpiPendingCell() : kpiBattleAwardCell(row)}</td><td>${row.insurance_attach_rate == null ? kpiPendingCell() : `<span class="kpi-rate rate-only">${formatPercent(row.insurance_attach_rate)}</span><span class="kpi-sub">個人搭售率</span>`}</td><td>${displayStoreName(row.store)}</td><td>${row.role || '—'}</td><td>${kpiBattleMetricCell(row.metrics?.A999, false)}</td><td>${kpiBattleMetricCell(row.metrics?.A1399, false)}</td><td>${kpiBattleMetricCell(row.metrics?.好速, false)}</td><td>${kpiBattleMetricCell(row.metrics?.R1399, false)}</td><td>${kpiBattleMetricCell(row.metrics?.R999, false)}</td><td>${kpiBattleMetricCell(row.metrics?.RT, false)}</td><td>${kpiBattleMetricCell(row.metrics?.特維, false)}</td><td>${kpiBattleMetricCell(row.metrics?.配件, false)}</td><td>${kpiBattleMetricCell(row.metrics?.包膜, false)}</td></tr>`).join('') || '<tr><td colspan="16" class="val-dim">目前篩選條件沒有資料</td></tr>'}</tbody>
        </table></div></div>`;
    }

    function render() {
      if (!state.data) return;
      const note = doc.getElementById('kpiBattleSourceNote');
      if (note) {
        const supplement = state.data.supplement_status || (state.data.supplement_synced ? '同次正式來源已對齊；缺項顯示尚未有資料' : '補充欄位尚未有資料；有效 KPI 已顯示');
        note.innerHTML = kpiBattleSourceMetadata(state.data, supplement);
        if(config.compactOverview){
          const summary=doc.createElement('summary');summary.textContent='資料來源與口徑';
          const details=doc.createElement('details');details.className='compact-disclosure';
          details.append(summary,...Array.from(note.childNodes));note.replaceChildren(details);
          const cutoff=doc.getElementById('kpiCompactCutoff');if(cutoff)cutoff.textContent=`資料截至 ${state.data.data_as_of_date||'—'} · ${state.data.source_date_range||'統計區間待載入'}`;
        }
      }
      const content = doc.getElementById('kpiBattleContent');
      if (!content) return;
      content.innerHTML = state.view === 'personal' ? renderPersonal() : renderStores();
    }

    function setView(view) {
      if (view !== 'stores' && view !== 'personal') return;
      state.view = view;
      doc.getElementById('kpiBattleStoreBtn')?.classList.toggle('active', view === 'stores');
      doc.getElementById('kpiBattlePersonalBtn')?.classList.toggle('active', view === 'personal');
      render();
    }

    function load() {
      if (state.data) {
        render();
        return;
      }
      const note = doc.getElementById('kpiBattleSourceNote');
      if (note) note.textContent = '需通過員編與已核准裝置驗證後，才會由私有 Google Drive 載入資料。';
      renderLock();
    }

    async function login({refresh=false}={}) {
      if(state.loading)return;
      if(refresh&&win.DashboardB?.active())return win.DashboardB.refresh(true,true);
      await win.DashboardB?.leaveForA();
      const authContext=win.DashboardB?.context()||0;
      const employeeId = refresh?privateDashboardSessionEmployeeId():privateDashboardEmployeeInput();
      if (!employeeId) {
        privateDashboardSetStatus('請先輸入員工編號。', true);
        return;
      }
      privateDashboardSetStatus('正在驗證這台裝置…');
      state.loading=true;updateNotice('正在更新，仍顯示上次資料…');
      try {
        const deviceId = privateDashboardDeviceId();
        const result = await request({ action: 'private_access', employeeId, deviceId });
        if(authContext!==(win.DashboardB?.context()||0))return;
        session.setItem('north12b_private_dashboard_employee_id', employeeId);
        globalThis.PortalLogout?.notifyLogin();
        state.profile = result.profile || null;
        try {
          const kpiResult = await request({ action: 'kpicalc_access', employeeId, deviceId });
          if(authContext!==(win.DashboardB?.context()||0))return;
          const kpiData = kpicalcToKpiBattleView(kpiResult.data, new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }));
          const snapshotKpi = result.snapshot && result.snapshot.kpiBattle;
          state.data = mergeKpiBattleSupplement(kpiData, snapshotKpi);
          render();
          onKpiLoaded({ result, data: state.data, profile: state.profile });
          updateNotice();
        } catch (kpiError) {
          if(authContext!==(win.DashboardB?.context()||0))return;
          const retain=refresh&&state.data&&isTransientTransportError(kpiError);
          if(!retain)state.data = null;
          privateDashboardSetStatus(kpiError.message, true);
          const note = doc.getElementById('kpiBattleSourceNote');
          if(!retain){failClosed(`KPI 資料載入失敗：${kpiError.message}`);renderLock();onKpiLoadError({ result, error: kpiError, profile: state.profile });}
          updateNotice(retain?`更新失敗，仍顯示上次資料（${state.data.fetchedAt}），請稍後手動更新。`:undefined);
        }
      } catch (error) {
        if(authContext!==(win.DashboardB?.context()||0))return;
        const retain=refresh&&state.data&&isTransientTransportError(error);
        if(!retain){failClosed(error.message);onKpiLoadError({error});renderLock();}
        privateDashboardSetStatus(error.message, true);
        updateNotice(retain?`更新失敗，仍顯示上次資料（${state.data.fetchedAt}），請稍後手動更新。`:undefined);
      } finally {
        state.loading=false;
        for(const id of ['kpiBattleContentReadStatus','awardsBattleContentReadStatus'])doc.getElementById(id)?.querySelectorAll('button').forEach(button=>button.removeAttribute('disabled'));
      }
    }

    async function requestBinding() {
      const employeeId = privateDashboardEmployeeInput();
      const bootstrapCode = privateDashboardBootstrapInput();
      if (!employeeId || !bootstrapCode) {
        privateDashboardSetStatus('首次申請需要輸入員編與啟用碼。', true);
        return;
      }
      privateDashboardSetStatus('正在送出裝置綁定申請…');
      try {
        const result = await request({ action: 'private_request', employeeId, bootstrapCode, deviceId: privateDashboardDeviceId() });
        session.setItem('north12b_private_dashboard_employee_id', employeeId);
        privateDashboardSetStatus(result.message || '已送出申請，請等待管理者核准。');
      } catch (error) {
        privateDashboardSetStatus(error.message, true);
      }
    }

    async function checkRequest() {
      const employeeId = privateDashboardEmployeeInput();
      if (!employeeId) {
        privateDashboardSetStatus('請輸入員工編號。', true);
        return;
      }
      privateDashboardSetStatus('正在查看申請狀態…');
      try {
        const result = await request({ action: 'private_request_status', employeeId, deviceId: privateDashboardDeviceId() });
        if (result.requestStatus === 'approved') privateDashboardSetStatus('這台裝置已核准，現在可直接登入。');
        else if (result.requestStatus === 'pending') privateDashboardSetStatus(`已申請，等待管理者核准（${result.requestedAt || ''}）。`);
        else if (result.requestStatus === 'superseded') privateDashboardSetStatus('此申請已被新的裝置申請取代，請重新提出綁定。', true);
        else privateDashboardSetStatus('尚未找到此裝置的申請紀錄。', true);
      } catch (error) {
        privateDashboardSetStatus(error.message, true);
      }
    }

    async function loadAdminRequests() {
      if (!state.adminSecret) {
        privateDashboardSetStatus('請先通過管理者驗證。', true);
        return;
      }
      try {
        const result = await request({ action: 'private_admin_requests', adminSecret: state.adminSecret });
        doc.querySelectorAll('#privateAdminPanel').forEach(panel => {
          panel.style.display = 'block';
          panel.innerHTML = `<strong>管理者待核准裝置</strong><div class="private-admin-list">${(result.requests || []).map(request =>
            `<div class="private-admin-item"><span>員編 ${request.employeeId}<br><small>${request.requestedAt}</small></span><button data-private-dashboard-action="approve" data-request-id="${request.requestId}">核准此裝置</button></div>`
          ).join('') || '<div class="val-dim">目前沒有待核准申請</div>'}</div>`;
        });
      } catch (error) {
        state.adminSecret = '';
        privateDashboardSetStatus(error.message, true);
      }
    }

    async function openAdmin() {
      const secret = win.prompt('請輸入管理者密碼（不會儲存在瀏覽器）');
      if (!secret) return;
      state.adminSecret = secret;
      await loadAdminRequests();
    }

    async function approve(requestId) {
      if (!state.adminSecret) {
        privateDashboardSetStatus('管理者驗證已逾時，請重新開啟管理者核准。', true);
        return;
      }
      try {
        await request({ action: 'private_admin_approve', adminSecret: state.adminSecret, requestId });
        privateDashboardSetStatus('已核准此裝置；若該員編原本綁定其他裝置，舊裝置已自動失效。');
        await loadAdminRequests();
      } catch (error) {
        privateDashboardSetStatus(error.message, true);
      }
    }

    function failClosed(message) {
      state.profile=null;state.adminSecret='';
      state.data = null;
      const cutoff=doc.getElementById('kpiCompactCutoff');if(cutoff)cutoff.textContent=message||'尚未取得已授權資料';
      updateNotice();
      const note = doc.getElementById('kpiBattleSourceNote');
      if (note) note.textContent = message || 'KPI 戰情目前無法載入。';
      const content = doc.getElementById('kpiBattleContent');
      if (content) content.innerHTML = '<div class="card private-lock"><h3>KPI 戰情暫時無法載入</h3><p>未取得正式授權資料，因此不顯示任何 KPI 數值。</p></div>';
    }

    function handleClick(event) {
      const detail=event.target.closest('[data-kpi-detail-tab]');
      if(detail){state.metricGroup=detail.dataset.kpiDetailTab;render();return;}
      const actionElement = event.target.closest('[data-private-dashboard-action]');
      if (actionElement) {
        const action = actionElement.dataset.privateDashboardAction;
        if (action === 'login') login();
        if (action === 'refresh') login({refresh:true});
        if (action === 'request-binding') requestBinding();
        if (action === 'check-request') checkRequest();
        if (action === 'open-admin') openAdmin();
        if (action === 'approve') approve(actionElement.dataset.requestId || '');
        return;
      }
      const viewElement = event.target.closest('[data-kpi-battle-view]');
      if (viewElement) setView(viewElement.dataset.kpiBattleView);
    }

    function handleChange(event) {
      if(config.compactOverview&&event.target.id==='kpiBattleStoreSelect')state.store=event.target.value;
      if(event.target.id==='kpiBattleMetricGroup'){state.metricGroup=event.target.value;render();return;}
      if (['kpiBattleStoreSelect', 'kpiBattlePersonalStore', 'kpiBattlePersonalRole'].includes(event.target.id)) render();
    }

    doc.addEventListener('click', handleClick);
    doc.addEventListener('change', handleChange);

    return Object.freeze({
      load,
      login,
      post: request,
      render,
      renderLock,
      setView,
      failClosed,
      acceptB(bundle) {
        state.profile=bundle.privateResult.profile;
        const data=kpicalcToKpiBattleView(bundle.kpiResult.data,new Date(bundle.loadedAt||Date.now()).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}));
        state.data=mergeKpiBattleSupplement(data,bundle.privateResult.snapshot?.kpiBattle);
        render();onKpiLoaded({result:bundle.privateResult,data:state.data,profile:state.profile});updateNotice();
      },
      getData: () => state.data,
      getProfile: () => state.profile,
    });
  }

  return Object.freeze({
    DEFAULT_GAS_URL,
    create,
    resolveGasUrl,
    kpicalcMetric,
    kpicalcToKpiBattleView,
    kpiBattleSupplementIsCurrent,
    mergeKpiBattleSupplement,
    kpiBattleSourceMetadata,
    kpiBattleDetailGroups,
    kpiBattleReportDateFromSource,
    kpiBattleApplyKnownCorrections,
    displayStoreName,
    formatNumber,
    formatPercent,
    formatMoney,
  });
});
