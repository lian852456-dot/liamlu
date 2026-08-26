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
    return '<span class="kpi-sub" style="font-weight:800;color:var(--text-muted)">尚未同步</span>';
  }

  function kpicalcMetric(entry, meta) {
    if (!entry) return null;
    const actual = Number(entry.a) || 0;
    const target = Number(entry.t) || 0;
    const reportRate = entry.reportRate === '' || entry.reportRate === null || entry.reportRate === undefined
      ? null : Number(entry.reportRate);
    const expected = (target > 0 && Number(meta.monthDays) > 0) ? target * Number(meta.snapshotDay) / Number(meta.monthDays) : null;
    return { actual, target, rate: Number.isFinite(reportRate) ? reportRate : null, daily_gap: expected == null ? null : actual - expected };
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
    return `${kpiBattleStoreKey(row && row.store)}|${String((row && row.name) || '').replace(/[＊*]/g, '').trim()}`;
  }

  function kpiBattleSupplementIsCurrent(kpiData, snapshot) {
    const snapshotReportDate = String((snapshot || {}).report_date || '');
    const snapshotDataAsOf = String((snapshot || {}).data_as_of_date || '');
    const kpiDataAsOf = String((kpiData || {}).data_as_of_date || '');
    const snapshotSource = kpiBattleSourceFile((snapshot || {}).source_file);
    const kpiDataSource = kpiBattleSourceFile((kpiData || {}).source_file);
    return Boolean(
      snapshot && snapshotReportDate && snapshotDataAsOf && kpiDataAsOf && snapshotSource && kpiDataSource &&
      snapshotReportDate === snapshotDataAsOf &&
      snapshotDataAsOf === kpiDataAsOf &&
      snapshotSource === kpiDataSource
    );
  }

  function mergeKpiBattleSupplement(kpiData, snapshot) {
    if (!kpiBattleSupplementIsCurrent(kpiData, snapshot)) return { ...kpiData, supplement_synced: false };
    const copy = JSON.parse(JSON.stringify(kpiData));
    const aggregate = snapshot.aggregate || {};
    const copyFields = (target, source, fields) => fields.forEach(field => {
      if (source && source[field] != null) target[field] = source[field];
    });
    copy.report_date = String(snapshot.report_date);
    copy.source_date_range = snapshot.source_date_range || copy.source_date_range;
    copy.aggregate = { ...copy.aggregate };
    copyFields(copy.aggregate, aggregate, ['overall_kpi', 'overall_kpi_dod', 'company_rank', 'company_rank_dod', 'addon_score', 'addon_score_dod', 'insurance_attach_rate']);
    const snapshotStores = new Map((snapshot.stores || []).map(row => [kpiBattleStoreKey(row.store), row]));
    copy.stores = copy.stores.map(row => {
      const source = snapshotStores.get(kpiBattleStoreKey(row.store));
      const merged = { ...row };
      copyFields(merged, source, ['company_rank', 'company_rank_dod', 'addon_score', 'addon_score_dod', 'insurance_attach_rate']);
      return merged;
    });
    const snapshotPeople = new Map((snapshot.personal || []).map(row => [kpiBattlePersonKey(row), row]));
    copy.personal = copy.personal.map(row => {
      const source = snapshotPeople.get(kpiBattlePersonKey(row));
      const merged = { ...row };
      copyFields(merged, source, ['rank', 'rank_dod', 'insurance_attach_rate', 'phone_award_actual', 'phone_award_projected', 'phone_award_rank', 'phone_award_eligible']);
      return merged;
    });
    return { ...copy, supplement_synced: true };
  }

  function kpicalcToKpiBattleView(data, fetchedAt) {
    const safeData = data || {};
    const meta = safeData.meta || {};
    const dataAsOfDate = kpiBattleDataAsOfDate(meta);
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
      (safeData.stores || []).forEach(store => {
        const entry = (store.items || {})[item.key];
        if (entry) {
          actual += Number(entry.a) || 0;
          target += Number(entry.t) || 0;
          seen = true;
        }
      });
      if (seen) aggregateItems[item.key] = kpicalcMetric({ a: actual, t: target, reportRate: aggregateRates[item.key] }, meta);
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
      source_file: kpiBattleSourceFile(meta.sourceFile),
      report_date: '',
      data_as_of_date: dataAsOfDate,
      source_as_of_date: dataAsOfDate,
      source_date_range: meta.period || '',
      previous_report_date: null,
      aggregate: { store: '北一二B整體', overall_kpi: null, company_rank: null, addon_score: null, insurance_attach_rate: null, core: coreOf(aggregateItems), metrics: aggregateItems },
      stores,
      personal,
    };
  }

  function formatPercent(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `${(number * 100).toFixed(1)}%` : '—';
  }

  function kpiBattleTone(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    if (number >= 1) return 'good';
    if (number >= 0.8) return 'warn';
    return 'bad';
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '—';
    return String(Math.round(number * 100) / 100);
  }

  function formatMoney(value) {
    const number = Number(value);
    return Number.isFinite(number) ? `$${Math.round(number).toLocaleString('en-US')}` : '—';
  }

  function kpiBattleTargetLine(metric, verbose) {
    if (!metric || metric.actual == null || metric.target == null) return '';
    const gap = Number(metric.daily_gap);
    const gapText = !Number.isFinite(gap) ? '進度差 —' : gap < -0.05 ? `尚差 ${formatNumber(Math.abs(gap))}` : gap > 0.05 ? `超前 ${formatNumber(gap)}` : '已達進度';
    const gapTone = gap > 0.05 ? 'up' : gap < -0.05 ? 'down' : '';
    const separator = verbose ? '｜' : '｜';
    return `<span class="kpi-sub" title="依資料截止日換算應達進度">實績 ${formatNumber(metric.actual)} ${separator} 月目標 ${formatNumber(metric.target)} ${separator} <span class="kpi-gap ${gapTone}">${gapText}</span></span>`;
  }

  function kpiBattleDod(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    const direction = number > 0.0005 ? 'up' : number < -0.0005 ? 'down' : '';
    const wording = direction === 'up' ? `較昨日上升 ${(number * 100).toFixed(1)}pp` : direction === 'down' ? `較昨日下降 ${Math.abs(number * 100).toFixed(1)}pp` : '較昨日持平';
    return `<span class="kpi-dod ${direction}">${wording}</span>`;
  }

  function kpiBattleRankDod(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    if (number > 0) return `<span class="kpi-dod up">DOD ↑ ${number}名</span>`;
    if (number < 0) return `<span class="kpi-dod down">DOD ↓ ${Math.abs(number)}名</span>`;
    return '<span class="kpi-dod">DOD 持平</span>';
  }

  function kpiBattleRate(value, dod) {
    if (value == null || !Number.isFinite(Number(value))) return '<span class="val-dim">—</span>';
    return `<span class="kpi-rate ${kpiBattleTone(value)}">${formatPercent(value)}</span>${kpiBattleDod(dod)}`;
  }

  function kpiBattleMetricCell(metric, includeDod) {
    if (!metric) return '<span class="val-dim">—</span>';
    if (metric.rate == null) return `<span class="val-dim">—</span>${kpiBattleTargetLine(metric)}${includeDod ? kpiBattleDod(metric.dod) : ''}`;
    return `<span class="kpi-rate ${kpiBattleTone(metric.rate)}">${formatPercent(metric.rate)}</span>${kpiBattleTargetLine(metric)}${includeDod ? kpiBattleDod(metric.dod) : ''}`;
  }

  function kpiBattleAwardCell(row) {
    if (row.phone_award_actual == null && row.phone_award_projected == null) return '<span class="val-dim">—</span>';
    const eligible = row.phone_award_eligible === 'Y';
    return `<span class="kpi-award-meta">實際獎金</span><span class="kpi-award-val">${formatMoney(row.phone_award_actual)}</span><span class="kpi-award-meta">推估獎金 ${formatMoney(row.phone_award_projected)}</span><span class="kpi-award-meta ${eligible ? '' : 'no'}">獎金排名 ${row.phone_award_rank ?? '—'}｜${eligible ? '可領獎' : '未領獎'}</span>`;
  }

  function kpiBattleInsuranceCell(row) {
    if (row?.insurance_attach_rate == null) return kpiPendingCell();
    return `<span class="kpi-rate rate-only">${formatPercent(row.insurance_attach_rate)}</span><span class="kpi-sub">實際搭售率</span>`;
  }

  function privateDashboardLockMarkup(kind) {
    const title = kind === 'awards' ? '台獎戰情受保護' : 'KPI 戰情受保護';
    const uploadEntry = kind === 'kpi' ? `<a class="secondary" href="${QUICK_UPLOAD_URL}" target="_blank" rel="noopener">戰報快速更新</a>` : '';
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
    const state = { data: null, view: 'stores', profile: null, adminSecret: '' };

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

    function renderStores() {
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
          <div class="summary-card"><div class="sc-label">KPI未達100%</div><div class="sc-val" style="color:var(--red)">${stores.filter(row => Number(row.overall_kpi) < 1).length}</div><div class="sc-sub">間門市</div></div>
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
        const supplement = state.data.supplement_synced ? '同次正式快照已同步排名、加掛、個人台獎與保險' : '補充欄位尚未同步（來源或日期不一致）';
        note.innerHTML = kpiBattleSourceMetadata(state.data, supplement);
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

    async function login() {
      const employeeId = privateDashboardEmployeeInput();
      if (!employeeId) {
        privateDashboardSetStatus('請先輸入員工編號。', true);
        return;
      }
      privateDashboardSetStatus('正在驗證這台裝置…');
      try {
        const deviceId = privateDashboardDeviceId();
        const result = await request({ action: 'private_access', employeeId, deviceId });
        session.setItem('north12b_private_dashboard_employee_id', employeeId);
        state.profile = result.profile || null;
        try {
          const kpiResult = await request({ action: 'kpicalc_access', employeeId, deviceId });
          const kpiData = kpicalcToKpiBattleView(kpiResult.data, new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }));
          const snapshotKpi = result.snapshot && result.snapshot.kpiBattle;
          state.data = mergeKpiBattleSupplement(kpiData, snapshotKpi);
          render();
          onKpiLoaded({ result, data: state.data, profile: state.profile });
        } catch (kpiError) {
          state.data = null;
          privateDashboardSetStatus(kpiError.message, true);
          const note = doc.getElementById('kpiBattleSourceNote');
          if (note) note.textContent = `KPI 資料載入失敗：${kpiError.message}`;
          onKpiLoadError({ result, error: kpiError, profile: state.profile });
        }
      } catch (error) {
        state.data = null;
        privateDashboardSetStatus(error.message, true);
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
      state.data = null;
      const note = doc.getElementById('kpiBattleSourceNote');
      if (note) note.textContent = message || 'KPI 戰情目前無法載入。';
      const content = doc.getElementById('kpiBattleContent');
      if (content) content.innerHTML = '<div class="card private-lock"><h3>KPI 戰情暫時無法載入</h3><p>未取得正式授權資料，因此不顯示任何 KPI 數值。</p></div>';
    }

    function handleClick(event) {
      const actionElement = event.target.closest('[data-private-dashboard-action]');
      if (actionElement) {
        const action = actionElement.dataset.privateDashboardAction;
        if (action === 'login') login();
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
    displayStoreName,
    formatNumber,
    formatPercent,
    formatMoney,
  });
});
