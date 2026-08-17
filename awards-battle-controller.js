(function (root, factory) {
  const kpiController = typeof module === 'object' && module.exports
    ? require('./kpi-battle-controller.js')
    : root && root.KpiBattleController;
  const api = factory(kpiController);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AwardsBattleController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (KpiBattleController) {
  'use strict';

  const EXPECTED_PHONE_ITEMS = 13;
  const EXPECTED_STORE_ROWS = 10;
  const EXPECTED_STORES = 9;

  function formatNumber(value) {
    return KpiBattleController.formatNumber(value);
  }

  function formatPercent(value) {
    return KpiBattleController.formatPercent(value);
  }

  function formatMoney(value) {
    return KpiBattleController.formatMoney(value);
  }

  function awardRateTone(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    if (number >= 1) return 'good';
    if (number >= 0.5) return 'warn';
    return 'bad';
  }

  function validateAwardsBattle(data, kpiData) {
    if (!data || typeof data !== 'object') return { ok: false, reason: '尚未取得與目前 KPI 同日期的台獎資料' };
    const awardsDate = String(data.report_date || '');
    const kpiDate = String((kpiData || {}).report_date || '');
    if (!awardsDate || !kpiDate || awardsDate !== kpiDate) {
      return {
        ok: false,
        reason: awardsDate
          ? `台獎戰報日期 ${awardsDate} 與 KPI 戰報日期 ${kpiDate || '—'} 不一致`
          : '尚未取得與目前 KPI 同日期的台獎資料',
      };
    }

    // kpiData.report_date 只有在 KPI controller 通過同次截止日與來源檔 gate 後才會存在。
    // 台獎沿用既有契約，以同一份 private_access snapshot 的 report_date 與其對齊。
    const phoneItems = Number(data.phone_items);
    const storeRows = Number(data.store_rows);
    const stores = Array.isArray(data.stores) ? data.stores : [];
    const overallItems = Array.isArray(data.overall && data.overall.items) ? data.overall.items : [];
    const storeNames = new Set(stores.map(row => String((row || {}).store || '').trim()).filter(Boolean));
    const allStoresComplete = stores.every(row => Array.isArray(row && row.items) && row.items.length === EXPECTED_PHONE_ITEMS);
    if (
      phoneItems !== EXPECTED_PHONE_ITEMS ||
      storeRows !== EXPECTED_STORE_ROWS ||
      stores.length !== EXPECTED_STORES ||
      storeNames.size !== EXPECTED_STORES ||
      overallItems.length !== EXPECTED_PHONE_ITEMS ||
      !allStoresComplete ||
      !data.supervisor || typeof data.supervisor !== 'object'
    ) {
      return { ok: false, reason: '正式台獎資料不完整（需 13 款、9 店與北一二B整體），因此不顯示任何台獎數值' };
    }
    return { ok: true, reason: '' };
  }

  function renderAwardPriority(item) {
    if (!item) return '';
    const difference = Number(item.difference);
    const differenceText = Number.isFinite(difference) ? `${difference > 0 ? '+' : ''}${formatNumber(difference)}` : '—';
    return `<div class="award-priority-card">
      <div class="award-priority-title">${item.display_name}</div>
      <div class="award-priority-action">${item.next_label || '已達最高獎階'}</div>
      <div class="award-priority-metrics">
        <div class="award-metric">實際數<strong>${formatNumber(item.actual)}</strong></div>
        <div class="award-metric">目標數<strong>${formatNumber(item.target)}</strong></div>
        <div class="award-metric">達成率<strong class="${awardRateTone(item.rate)}">${formatPercent(item.rate)}</strong></div>
        <div class="award-metric">差異數<strong class="${difference < 0 ? 'bad' : 'good'}">${differenceText}</strong></div>
        <div class="award-metric wide">會增加多少獎金<strong>${formatMoney(item.incremental_award)}</strong></div>
      </div>
    </div>`;
  }

  function renderAwardModel(item, district) {
    const difference = Number(item.difference);
    const differenceText = Number.isFinite(difference) ? `${difference > 0 ? '+' : ''}${formatNumber(difference)}` : '—';
    const levels = district
      ? [{ label: '北一二B 80%獎金', amount: item.district_reward_80 }, { label: '北一二B 100%獎金', amount: item.district_reward_100 }]
      : [{ label: '店點 50%獎金', amount: item.store_reward_50 }, { label: '店點 100%獎金', amount: item.store_reward_100 }];
    const thresholdLabel = district ? '80%' : '50%';
    return `<div class="award-model"><div class="award-model-name">${item.display_name}</div><div class="award-model-rate ${awardRateTone(item.rate)}">${formatPercent(item.rate)}</div><span class="award-model-sub">實際 ${formatNumber(item.actual)}｜目標 ${formatNumber(item.target)}</span><span class="award-model-sub">${thresholdLabel}差異 ${differenceText}｜${thresholdLabel}目標 ${formatNumber(item.threshold_target)}</span><div class="award-model-tiers">${levels.map(level => `<div class="award-model-tier">${level.label}<strong>${formatMoney(level.amount)}</strong></div>`).join('')}</div></div>`;
  }

  function renderAwardUnit(row, district) {
    const award = (row && row.award) || {};
    return `<div class="award-store-card"><div class="award-store-head"><div class="award-store-name">${district ? '🏢 ' : ''}${(row && row.store) || '—'}</div><div class="award-store-rank">排名 ${award.rank ?? '—'}<br>${award.award === 'Y' ? '✅ 可領獎' : '⚠️ 未領獎'}</div></div>
      <div class="award-role-indicator${district ? ' district' : ''}">${district ? '督導獎金角色｜北一二B 80%／100%' : '店長獎金角色｜店點 50%／100%'}</div>
      <div class="award-store-values"><div class="award-value"><div class="label">實際金額</div><div class="number">${formatMoney(award.actual_total)}</div></div><div class="award-value"><div class="label">推估金額</div><div class="number">${formatMoney(award.projected)}</div></div></div>
      <div class="award-priority-grid">${((row && row.priorities) || []).map(renderAwardPriority).join('') || '<span class="val-dim">沒有符合優先順位的機款</span>'}</div>
    </div>`;
  }

  function create(options) {
    const config = options || {};
    const win = config.window || (typeof window !== 'undefined' ? window : null);
    const doc = config.document || (win && win.document);
    if (!win || !doc) throw new Error('Awards controller requires a browser document');
    const renderLock = typeof config.renderLock === 'function' ? config.renderLock : () => {};
    const state = { data: null, unavailableReason: '' };

    function renderUnavailable() {
      const note = doc.getElementById('awardsBattleSourceNote');
      if (note) note.textContent = '台獎尚未同步：不使用舊 dashboard snapshot 的數字。';
      const content = doc.getElementById('awardsBattleContent');
      if (!content) return;
      content.innerHTML = `<div class="card private-lock"><h3>台獎尚未同步</h3><p>${state.unavailableReason || '尚未取得與目前 KPI 同日期的台獎資料。'}</p><p class="kpi-battle-note">KPI 已使用最新正式 JSON；台獎會在同日期正式資料完成後另行顯示。</p></div>`;
    }

    function render() {
      if (!state.data) return;
      const data = state.data;
      const supervisor = data.supervisor || {};
      const stores = data.stores || [];
      const phoneItems = Number(data.phone_items);
      const storeRows = Number(data.store_rows);
      const eligibleStores = stores.filter(row => row.award && row.award.award === 'Y').length;
      const selectedBefore = doc.getElementById('awardsStoreSelect')?.value;
      const selectedDistrict = !selectedBefore || selectedBefore === '北一二B整體';
      const selectedUnit = selectedDistrict
        ? data.overall
        : (stores.find(row => row.store === selectedBefore) || data.overall);
      const note = doc.getElementById('awardsBattleSourceNote');
      if (note) note.textContent = `${phoneItems} 款重點機款｜${storeRows} 列店點與整體資料｜台獎戰報日期 ${data.report_date}｜前三台依本月最高台獎順位；達成率超過 100% 由下一順位遞補｜店點差異數以 50% 目標無條件進位計算｜資料僅供受保護預覽`;
      const content = doc.getElementById('awardsBattleContent');
      if (!content) return;
      content.innerHTML = `
        <div class="summary-grid">
          <div class="summary-card"><div class="sc-label">督導區實際獎金</div><div class="sc-val" style="color:#6d28d9">${formatMoney(supervisor.actual_total)}</div><div class="sc-sub">公司實際獎金</div></div>
          <div class="summary-card"><div class="sc-label">督導區推估獎金</div><div class="sc-val" style="color:var(--accent)">${formatMoney(supervisor.projected)}</div><div class="sc-sub">依目前進度推估</div></div>
          <div class="summary-card"><div class="sc-label">督導區排名</div><div class="sc-val" style="color:var(--gold)">${supervisor.rank ?? '—'}</div><div class="sc-sub">公司獎金排名</div></div>
          <div class="summary-card"><div class="sc-label">是否領獎</div><div class="sc-val" style="color:${supervisor.award === 'Y' ? 'var(--green)' : 'var(--red)'}">${supervisor.award === 'Y' ? '有' : '無'}</div><div class="sc-sub">督導區資格</div></div>
          <div class="summary-card"><div class="sc-label">有領獎店</div><div class="sc-val" style="color:var(--green)">${eligibleStores}</div><div class="sc-sub">家門市</div></div>
          <div class="summary-card"><div class="sc-label">未領獎店</div><div class="sc-val" style="color:var(--red)">${stores.length - eligibleStores}</div><div class="sc-sub">家門市</div></div>
        </div>
        <div class="section-divider">督導區及各店台獎（依實際獎金排序）</div>
        <div class="award-store-grid">${renderAwardUnit(data.overall, true)}${stores.map(row => renderAwardUnit(row, false)).join('')}</div>
        <div class="section-divider">北一二B／門市 ${phoneItems} 款機款篩選</div>
        <div class="card"><div class="award-store-selector"><label>選擇北一二B／門市<select id="awardsStoreSelect"><option value="北一二B整體" ${selectedDistrict ? 'selected' : ''}>🏢 北一二B整體</option>${stores.map(row => `<option value="${row.store}" ${row.store === selectedUnit.store ? 'selected' : ''}>${row.store}</option>`).join('')}</select></label><span class="kpi-battle-note">${selectedDistrict ? '北一二B差異數＝實際數－80%目標台數（無條件進位）' : '店點差異數＝實際數－50%目標台數（無條件進位）'}</span></div><div class="award-role-indicator${selectedDistrict ? ' district' : ''}">${selectedDistrict ? '目前檢視：督導獎金角色｜北一二B 80%／100%' : '目前檢視：店長獎金角色｜店點 50%／100%'}</div><div class="award-model-grid">${selectedUnit.items.map(item => renderAwardModel(item, selectedDistrict)).join('')}</div></div>`;
    }

    function acceptKpiResult(payload) {
      const result = (payload || {}).result || {};
      const kpiData = (payload || {}).data || null;
      const awards = result.snapshot && result.snapshot.awardsBattle;
      const validation = validateAwardsBattle(awards, kpiData);
      if (!validation.ok) {
        state.data = null;
        state.unavailableReason = validation.reason;
        renderUnavailable();
        return false;
      }
      state.data = awards;
      state.unavailableReason = '';
      render();
      return true;
    }

    function handleKpiLoadError() {
      state.data = null;
      state.unavailableReason = 'KPI 正式資料尚未讀回，因此不顯示可能過期的台獎資料';
      renderUnavailable();
    }

    function load() {
      if (state.data) {
        render();
        return;
      }
      if (state.unavailableReason) {
        renderUnavailable();
        return;
      }
      const note = doc.getElementById('awardsBattleSourceNote');
      if (note) note.textContent = '需通過員編與已核准裝置驗證後，才會由私有 Google Drive 載入資料。';
      renderLock();
    }

    function failClosed(message) {
      state.data = null;
      state.unavailableReason = message || '未取得正式授權資料，因此不顯示任何台獎數值';
      renderUnavailable();
    }

    function handleChange(event) {
      if (event.target && event.target.id === 'awardsStoreSelect') render();
    }

    doc.addEventListener('change', handleChange);

    return Object.freeze({
      load,
      render,
      renderUnavailable,
      acceptKpiResult,
      handleKpiLoadError,
      failClosed,
      getData: () => state.data,
      getUnavailableReason: () => state.unavailableReason,
    });
  }

  return Object.freeze({
    EXPECTED_PHONE_ITEMS,
    EXPECTED_STORE_ROWS,
    EXPECTED_STORES,
    create,
    validateAwardsBattle,
    renderAwardPriority,
    renderAwardModel,
    renderAwardUnit,
  });
});
