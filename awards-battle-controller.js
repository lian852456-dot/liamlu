(function (root, factory) {
  const kpiController = typeof module === 'object' && module.exports
    ? require('./kpi-battle-controller.js')
    : root && root.KpiBattleController;
  const catalog = typeof module === 'object' && module.exports
    ? require('./award-model-catalog.js') : root && root.AwardModelCatalog;
  const api = factory(kpiController, catalog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.AwardsBattleController = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (KpiBattleController, Catalog) {
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

  function displayStoreName(value) {
    const name = String(value || '').trim();
    return name === '台灣大哥大台北三創' || name === '台灣大哥大數位生活台北三創'
      ? '台北三創'
      : name;
  }

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[ch]);
  }

  function storeKey(value) {
    return String(value || '').trim().replace(/\s+/g, '').replace(/^(?:台灣大哥大(?:數位生活)?)?台北/, '');
  }

  function valueNumber(value) {
    return (typeof value === 'number' || (typeof value === 'string' && value.trim())) &&
      Number.isFinite(Number(value)) ? Number(value) : null;
  }

  function novemberPriorities(data, row) {
    const rules = Catalog.november;
    const date = data.data_as_of_date;
    if (typeof date !== 'string' || date.slice(0, 7) !== rules.effectiveMonth) {
      return Array.isArray(row.priorities) && row.priorities.length ? row.priorities : null;
    }
    const validSource = kind => {
      const entry = data.source_files?.[kind];
      return entry?.source_data_date === date && entry.run_id === data.processing_run_id &&
        /^[a-f0-9]{64}$/.test(entry.sha256 || '');
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || data.config_version !== rules.configVersion || !data.processing_run_id ||
        !/^[a-f0-9]{64}$/.test(data.config_hash || '') || !validSource('store') || !validSource('person')) return null;

    const manager = rules.rewardRules.find(rule => rule.role === 'manager');
    const supervisor = rules.rewardRules.find(rule => rule.role === 'supervisor');
    const district = row === data.overall;
    const role = district ? supervisor : manager;
    const thresholds = role.tiers.map(tier => Number(tier.match(/\d+/)[0]));
    const candidates = [];
    for (const item of row.items) {
      const m = manager.amounts[item.name], s = supervisor.amounts[item.name];
      if (!m || !s || item.store_reward_50 !== m[0] || item.store_reward_100 !== m[2] ||
          item.district_reward_80 !== s[0] || item.district_reward_100 !== s[2]) return null;
      const actual = valueNumber(item.actual), goal = valueNumber(item.target), rate = valueNumber(item.rate);
      if (!Number.isSafeInteger(actual) || !Number.isSafeInteger(goal) || actual < 0 || goal <= 0 || rate === null) continue;
      if (Math.abs(actual / goal - rate) > 1e-6) return null;
      if (actual > goal) continue;
      const tier = percent => thresholds.filter(step => percent >= step).length - 1;
      const amount = units => {
        const percent = units * 100 / goal;
        const lower = tier(Math.floor(percent)), upper = tier(Math.ceil(percent));
        return lower === upper ? lower < 0 ? 0 : role.amounts[item.name][lower] : null;
      };
      const threshold = thresholds.find(step => actual * 100 < goal * step);
      const needed = Math.ceil(goal * threshold / 100) - actual;
      const before = amount(actual), after = amount(actual + needed);
      candidates.push({
        display_name: item.display_name,
        next_label: `${district ? '督導' : '店長'} ${threshold}%`,
        units_needed: needed,
        incremental_award: before === null || after === null ? null : after - before,
        order: Math.max(...m) + Math.max(...s),
      });
    }
    return candidates.sort((a, b) => b.order - a.order || (a.display_name < b.display_name ? -1 : a.display_name > b.display_name ? 1 : 0)).slice(0, 3);
  }

  function priorityText(item) {
    if (!item) return '—';
    const amount = valueNumber(item.incremental_award);
    const units = valueNumber(item.units_needed);
    return `<strong>${escapeText(item.display_name)}</strong><br>${escapeText(item.next_label || '獎階待確認')}${units === null ? '' : ` · 差 ${formatNumber(units)} 台`}<br><span class="award-estimate">${amount === null ? '預估待確認' : `預估 +${formatMoney(amount)}`}</span>`;
  }

  function awardRankRows(stores, basis) {
    const rows = stores.map(row => ({ store: row.store, amount: valueNumber(row.award?.[basis === 'actual' ? 'actual_total' : 'projected']) }));
    if (rows.some(row => row.amount === null)) return [];
    rows.sort((a, b) => b.amount - a.amount);
    let rank = 1, gap = 0;
    return rows.map((row, index) => {
      if (index && rows[index - 1].amount !== row.amount) {
        rank = index + 1;
        gap = rows[index - 1].amount - row.amount;
      }
      return { ...row, rank, gap };
    });
  }

  function renderIntegratedAwards(data, selected, basis) {
    const units = [data.overall, ...data.stores];
    const district = selected === data.overall;
    const threshold = district ? '80%' : '50%';
    const list = novemberPriorities(data, selected);
    const gaps = selected.items.map(item => {
      const actual = valueNumber(item.actual), goal = valueNumber(item.target), firstGoal = valueNumber(item.threshold_target);
      return { item, actual, goal, firstGoal,
        first: actual === null || firstGoal === null ? null : Math.max(0, firstGoal - actual),
        full: actual === null || goal === null ? null : Math.max(0, goal - actual) };
    });
    const firstCount = gaps.filter(row => row.first > 0).length;
    const fullCount = gaps.filter(row => row.full > 0).length;
    const missing = gaps.filter(row => row.first === null || row.full === null).length;
    const gapText = gap => gap === null ? '待確認' : gap === 0 ? '已達標' : `${formatNumber(gap)} 台`;
    const quantity = amount => amount === null ? '待確認' : formatNumber(amount);
    const rankings = awardRankRows(data.stores, basis);
    const viewer = data.viewer;
    const member = viewer?.mode === 'member';
    const supervisor = viewer?.mode === 'supervisor';
    const ownStore = member && rankings.find(row => storeKey(row.store) === viewer.store);
    const ownAward = member && viewer[basis];
    const storeLeaders = rankings.filter(row => row.rank === 1);
    const rankCard = (title, row) => `<div class="card"><strong>${escapeText(title)}</strong><p>${row && Number.isSafeInteger(row.rank) ? `區內第 ${row.rank} 名 · ${formatMoney(row.amount)} · ${row.rank === 1 ? '目前領先' : `追平前一名還差 ${formatMoney(row.gap)}`}` : '待取得正式排名'}</p></div>`;
    const leaderCard = (title, names, amount) => `<div class="card"><strong>${title}</strong><p>${names?.length ? `${escapeText(names.join('、'))} · ${formatMoney(amount)}` : '待取得正式排名'}</p></div>`;
    const ranks = supervisor
      ? leaderCard('全區店點第一名', storeLeaders.map(row => displayStoreName(row.store)), storeLeaders[0]?.amount) +
        leaderCard('全區同仁第一名', viewer[basis]?.leaders, viewer[basis]?.amount)
      : rankCard('我的店' + (ownStore ? ` · ${displayStoreName(ownStore.store)}` : ''), ownStore) + rankCard('我的台獎', ownAward);
    const gapRows = gaps.filter(row => row.first !== 0 || row.full !== 0);
    return `
      <section aria-label="優先追蹤機款">
        <div class="award-store-selector"><h2 class="section-divider">優先追蹤機款</h2><label>查看 <select id="awardsStoreSelect">${units.map(row => `<option value="${escapeText(row.store)}"${row === selected ? ' selected' : ''}>${escapeText(displayStoreName(row.store))}</option>`).join('')}</select></label></div>
        <div class="award-priority-grid">${list?.length ? list.map((item, i) => `<div class="award-priority-card"><span>順位 ${i + 1}</span><br>${priorityText(item)}</div>`).join('') : `<p>${list ? '目前沒有符合優先順位的機款' : '當月優先清單或規則尚待核對'}</p>`}</div>
        <details class="award-calculation"><summary>計算與資料說明</summary><p>依當月單款店長與督導最高獎階金額合計排序，超過 100% 由下一順位遞補。門檻台數無條件進位。十一月依公告第 1 頁試算，首階以下以 $0 起算。預估為單款獎階差額，店長各項競賽獎金合計除以 2 屬總額口徑，實領依完整資格與 D+30 結算。</p></details>
        <h3>未達標機款</h3><p>${escapeText(displayStoreName(selected.store))} · ${threshold} 門檻未達 ${firstCount} 款 · 100% 門檻未達 ${fullCount} 款${missing ? ` · 待確認 ${missing} 款` : ''}</p>
        <div class="award-table-wrap"><table><thead><tr><th>機款</th><th>實際台數</th><th>${threshold} 門檻</th><th>距 ${threshold} 還差</th><th>距 100% 還差</th></tr></thead><tbody>${gapRows.map(row => `<tr><th scope="row">${escapeText(row.item.display_name)}</th><td>${quantity(row.actual)}</td><td>${quantity(row.firstGoal)}</td><td>${gapText(row.first)}</td><td>${gapText(row.full)}（門檻 ${quantity(row.goal)}）</td></tr>`).join('') || '<tr><td colspan="5">所有機款已達 100% 門檻。</td></tr>'}</tbody></table></div>
      </section>
      <section aria-label="九店優先順位"><h2 class="section-divider">九店優先順位</h2><div class="award-table-wrap"><table><thead><tr><th>門市</th><th>第一順位</th><th>第二順位</th><th>第三順位</th></tr></thead><tbody>${data.stores.map(row => {
        const priorities = novemberPriorities(data, row);
        return `<tr><th scope="row">${escapeText(displayStoreName(row.store))}</th>${priorities ? [0, 1, 2].map(i => `<td>${priorityText(priorities[i])}</td>`).join('') : '<td colspan="3">資料待核對</td>'}</tr>`;
      }).join('')}</tbody></table></div></section>
      <section aria-label="區內獎金排名"><div class="award-store-selector"><h2 class="section-divider">區內獎金排名</h2><label>獎金 <select id="awardsRankingBasis"><option value="actual"${basis === 'actual' ? ' selected' : ''}>實際</option><option value="projected"${basis === 'projected' ? ' selected' : ''}>推估</option></select></label></div>
        <div class="award-ranking-cards">${ranks}</div><div class="award-table-wrap"><table><thead><tr><th>區內名次</th><th>門市</th><th>獎金</th><th>追平前一名還差</th></tr></thead><tbody>${rankings.map(row => `<tr><td>${row.rank}</td><th scope="row">${escapeText(displayStoreName(row.store))}</th><td>${formatMoney(row.amount)}</td><td>${row.rank === 1 ? '目前領先' : formatMoney(row.gap)}</td></tr>`).join('') || '<tr><td colspan="4">門市獎金待確認。</td></tr>'}</tbody></table></div>
      </section>
      <details class="card"><summary>督導區與各店原始台獎明細（公司排名）</summary><div class="award-store-grid">${units.map(row => renderAwardUnit(row, row === data.overall, false)).join('')}</div><div class="award-model-grid">${selected.items.map(item => renderAwardModel(item, district)).join('')}</div></details>`;
  }

  function awardRateTone(value) {
    if (value == null || value === '') return '';
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    if (number >= 1) return 'good';
    if (number >= 0.5) return 'warn';
    return 'bad';
  }

  function validateAwardsBattle(data, kpiData, snapshotKpi, readIntegrity) {
    // A later awards component retains its own real run. Its authenticated
    // read must bind it to the still-current KPI payload, not only a date.
    function recoveryCompatible(awards, kpi, integrity) {
      const context = awards.recovery_context;
      const sources = awards.source_files || {};
      const run = String(awards.processing_run_id || '');
      const parentRun = String(kpi.processing_run_id || kpi.kpi_run_id || '');
      const hash = String(integrity && integrity.kpi_payload_hash || '');
      const sourceHash = String(kpi.source_metadata && kpi.source_metadata.sha256 || '');
      return !!context && context.schema === 'north12b-awards-recovery/v1' &&
        !!integrity && integrity.awards_recovery_valid === true &&
        !!run && !!parentRun && run !== parentRun && context.recovery_run_id === run &&
        context.parent_kpi_run_id === parentRun &&
        /^[0-9a-f]{32}$/.test(hash) && context.parent_kpi_payload_hash === hash &&
        /^[0-9a-f]{64}$/.test(sourceHash) && context.parent_kpi_source_sha256 === sourceHash &&
        context.report_run_date === awards.report_run_date && context.report_run_date === kpi.report_run_date &&
        context.data_as_of_date === awards.data_as_of_date && context.data_as_of_date === kpi.data_as_of_date &&
        /^2026-10-\d{2}$/.test(context.data_as_of_date) && /^\d{4}-\d{2}-\d{2}$/.test(context.report_run_date) &&
        context.award_config_hash === '36e4f4245bf3f3b67a1dba6137aa6c29ea5390f7f214d91a91dc40fa2604ef51' &&
        ['store', 'person'].every(kind => sources[kind] && sources[kind].run_id === run &&
          sources[kind].source_data_date === context.data_as_of_date);
    }

    if (!data || typeof data !== 'object') return { ok: false, reason: '尚未取得與目前 KPI 同日期的台獎資料' };
    const awardsDate = String(data.report_run_date || data.report_date || '');
    const kpiDate = String((kpiData || {}).report_run_date || (kpiData || {}).report_date || '');
    const awardsCutoff = String(data.data_as_of_date || data.source_as_of_date || '');
    const kpiCutoff = String((kpiData || {}).data_as_of_date || (kpiData || {}).source_as_of_date || '');
    const cutoffMismatch = (awardsCutoff || kpiCutoff) && (!awardsCutoff || awardsCutoff !== kpiCutoff);
    const snapshotRun = String((snapshotKpi || {}).processing_run_id || (snapshotKpi || {}).kpi_run_id || '');
    const awardsRun = String(data.processing_run_id || '');
    const runMismatch = data.recovery_context
      ? !recoveryCompatible(data, snapshotKpi || {}, readIntegrity)
      : snapshotRun && awardsRun !== snapshotRun;
    if (!awardsDate || !kpiDate || awardsDate !== kpiDate || (kpiData || {}).supplement_synced === false || cutoffMismatch || runMismatch) {
      return {
        ok: false,
        reason: awardsDate
          ? `台獎戰報日期 ${awardsDate} 與 KPI 戰報日期 ${kpiDate || '—'} 不一致，或資料截止日／發布批次尚未同步`
          : '尚未取得與目前 KPI 同日期的台獎資料',
      };
    }

    // 依來源截止月份選方案，避免十月一日的九月收官套用十月機款。
    const modelDate = awardsCutoff || awardsDate;
    const expectedPhoneItems = Catalog.expectedCount(modelDate);
    const phoneItems = Number(data.phone_items);
    const storeRows = Number(data.store_rows);
    const stores = Array.isArray(data.stores) ? data.stores : [];
    const overallItems = Array.isArray(data.overall && data.overall.items) ? data.overall.items : [];
    const storeNames = new Set(stores.map(row => String((row || {}).store || '').trim()).filter(Boolean));
    const allStoresComplete = stores.every(row => Array.isArray(row && row.items) && row.items.length === expectedPhoneItems && Catalog.selectionMatches(row.items, modelDate));
    if (
      phoneItems !== expectedPhoneItems ||
      storeRows !== EXPECTED_STORE_ROWS ||
      stores.length !== EXPECTED_STORES ||
      storeNames.size !== EXPECTED_STORES ||
      overallItems.length !== expectedPhoneItems ||
      !Catalog.selectionMatches(overallItems, modelDate) ||
      !allStoresComplete ||
      !data.supervisor || typeof data.supervisor !== 'object'
    ) {
      return { ok: false, reason: `正式台獎資料不完整（需 ${expectedPhoneItems} 款、9 店與北一二B整體），因此不顯示任何台獎數值` };
    }
    return { ok: true, reason: '' };
  }

  function awardDifference(item) {
    const number = value => !['number', 'string'].includes(typeof value) || String(value).trim() === '' ? NaN : Number(value);
    // Explicit legacy difference, including null, remains authoritative.
    if (Object.prototype.hasOwnProperty.call(item, 'difference')) return number(item.difference);
    // gap is an unsigned, zero-clamped shortfall. Reconcile source quantities
    // before displaying a signed difference; missing or conflicting values stay missing.
    const gap = number(item.gap);
    const actual = number(item.actual);
    const threshold = number(item.threshold_target);
    if (![gap, actual, threshold].every(Number.isFinite) || gap < 0 || actual < 0 || threshold < 0) return NaN;
    const difference = actual - threshold;
    return gap === Math.max(-difference, 0) ? difference : NaN;
  }

  function renderAwardPriority(item) {
    if (!item) return '';
    const difference = awardDifference(item);
    const differenceText = Number.isFinite(difference) ? `${difference > 0 ? '+' : ''}${formatNumber(difference)}` : '尚未有資料';
    return `<div class="award-priority-card">
      <div class="award-priority-title">${escapeText(item.display_name)}</div>
      <div class="award-priority-action">${escapeText(item.next_label || '已達最高獎階')}</div>
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
    const difference = awardDifference(item);
    const differenceText = Number.isFinite(difference) ? `${difference > 0 ? '+' : ''}${formatNumber(difference)}` : '尚未有資料';
    const levels = district
      ? [{ label: '北一二B 80%獎金', amount: item.district_reward_80 }, { label: '北一二B 100%獎金', amount: item.district_reward_100 }]
      : [{ label: '店點 50%獎金', amount: item.store_reward_50 }, { label: '店點 100%獎金', amount: item.store_reward_100 }];
    const thresholdLabel = district ? '80%' : '50%';
    return `<div class="award-model"><div class="award-model-name">${escapeText(item.display_name)}</div><div class="award-model-rate ${awardRateTone(item.rate)}">${formatPercent(item.rate)}</div><span class="award-model-sub">實際 ${formatNumber(item.actual)}｜目標 ${formatNumber(item.target)}</span><span class="award-model-sub">${thresholdLabel}差異 ${differenceText}｜${thresholdLabel}目標 ${formatNumber(item.threshold_target)}</span><div class="award-model-tiers">${levels.map(level => `<div class="award-model-tier">${level.label}<strong>${formatMoney(level.amount)}</strong></div>`).join('')}</div></div>`;
  }

  function renderAwardUnit(row, district, showPriority = true) {
    const award = (row && row.award) || {};
    return `<div class="award-store-card"><div class="award-store-head"><div class="award-store-name">${district ? '🏢 ' : ''}${escapeText(displayStoreName(row && row.store) || '—')}</div><div class="award-store-rank">排名 ${escapeText(award.rank ?? '尚未有資料')}<br>${award.award === 'Y' ? '✅ 可領獎' : award.award === 'N' ? '⚠️ 未領獎' : '尚未有資料'}</div></div>
      <div class="award-role-indicator${district ? ' district' : ''}">${district ? '督導獎金角色｜北一二B 80%／100%' : '店長獎金角色｜店點 50%／100%'}</div>
      <div class="award-store-values"><div class="award-value"><div class="label">實際金額</div><div class="number">${formatMoney(award.actual_total)}</div></div><div class="award-value"><div class="label">推估金額</div><div class="number">${formatMoney(award.projected)}</div></div></div>
      ${showPriority ? `<div class="award-priority-grid">${((row && row.priorities) || []).map(renderAwardPriority).join('') || '<span class="val-dim">沒有符合優先順位的機款</span>'}</div>` : ''}
    </div>`;
  }

  function create(options) {
    const config = options || {};
    const win = config.window || (typeof window !== 'undefined' ? window : null);
    const doc = config.document || (win && win.document);
    if (!win || !doc) throw new Error('Awards controller requires a browser document');
    const renderLock = typeof config.renderLock === 'function' ? config.renderLock : () => {};
    const state = { data: null, unavailableReason: '', rankingBasis: 'actual' };

    function renderUnavailable() {
      const note = doc.getElementById('awardsBattleSourceNote');
      if (note) note.textContent = '台獎尚未有資料，待來源更新後顯示。';
      const content = doc.getElementById('awardsBattleContent');
      if (!content) return;
      content.innerHTML = `<div class="card private-lock"><h3>台獎尚未有資料</h3><p>${escapeText(state.unavailableReason || '尚未取得與目前 KPI 同日期的台獎資料。')}</p><p class="kpi-battle-note">已取得的 KPI 正常顯示；台獎待正式資料到齊後更新。</p></div>`;
    }

    function render() {
      if (!state.data) return;
      const data = state.data;
      const supervisor = data.supervisor || {};
      const stores = data.stores || [];
      const phoneItems = Number(data.phone_items);
      const storeRows = Number(data.store_rows);
      const eligibilityComplete = stores.every(row => row.award && ['Y', 'N'].includes(row.award.award));
      const eligibleStores = stores.filter(row => row.award && row.award.award === 'Y').length;
      const unawarded = stores.filter(row => row.award?.award === 'N').map(row => displayStoreName(row.store)).join('、');
      const unawardedNote = eligibilityComplete ? unawarded || '無' :
        [unawarded, '店點資格待確認'].filter(Boolean).join(' · ');
      const selectedBefore = doc.getElementById('awardsStoreSelect')?.value;
      const selectedDistrict = !selectedBefore || selectedBefore === '北一二B整體';
      const selectedUnit = selectedDistrict
        ? data.overall
        : (stores.find(row => row.store === selectedBefore) || data.overall);
      const note = doc.getElementById('awardsBattleSourceNote');
      if (note) note.textContent = `${phoneItems} 款重點機款｜${storeRows} 列店點與整體資料｜發布日期 ${data.report_run_date || data.report_date}｜資料截至 ${data.data_as_of_date || data.report_date}｜前三台依本月最高台獎順位；達成率超過 100% 由下一順位遞補｜店點差異數以 50% 目標無條件進位計算｜資料僅供受保護預覽`;
      const content = doc.getElementById('awardsBattleContent');
      if (!content) return;
      const summary = `
        <div class="summary-grid">
          <div class="summary-card"><div class="sc-label">督導區實際獎金</div><div class="sc-val award-summary-money" style="color:#6d28d9">${formatMoney(supervisor.actual_total)}</div><div class="sc-sub">公司實際獎金</div></div>
          <div class="summary-card"><div class="sc-label">督導區推估獎金</div><div class="sc-val award-summary-money" style="color:var(--accent)">${formatMoney(supervisor.projected)}</div><div class="sc-sub">依目前進度推估</div></div>
          <div class="summary-card"><div class="sc-label">督導區排名</div><div class="sc-val" style="color:var(--gold)">${escapeText(supervisor.rank ?? '尚未有資料')}</div><div class="sc-sub">公司獎金排名</div></div>
          <div class="summary-card"><div class="sc-label">是否領獎</div><div class="sc-val" style="color:${supervisor.award === 'Y' ? 'var(--green)' : 'var(--red)'}">${supervisor.award === 'Y' ? '有' : supervisor.award === 'N' ? '無' : '尚未有資料'}</div><div class="sc-sub">督導區資格</div></div>
          <div class="summary-card"><div class="sc-label">有領獎店</div><div class="sc-val" style="color:var(--green)">${eligibilityComplete ? eligibleStores : '尚未有資料'}</div><div class="sc-sub">家門市</div></div>
          <div class="summary-card"><div class="sc-label">未領獎店</div><div class="sc-val" style="color:var(--red)">${eligibilityComplete ? stores.length - eligibleStores : '尚未有資料'}</div><div class="sc-sub">${config.integrated ? escapeText(unawardedNote) : '家門市'}</div></div>
        </div>`;
      if (config.integrated) {
        content.innerHTML = summary + renderIntegratedAwards(data, selectedUnit, state.rankingBasis);
        return;
      }
      content.innerHTML = summary + `
        <div class="section-divider">督導區及各店台獎（依實際獎金排序）</div>
        <div class="award-store-grid">${renderAwardUnit(data.overall, true)}${stores.map(row => renderAwardUnit(row, false)).join('')}</div>
        <div class="section-divider">北一二B／門市 ${phoneItems} 款機款篩選</div>
        <div class="card"><div class="award-store-selector"><label>選擇北一二B／門市<select id="awardsStoreSelect"><option value="北一二B整體" ${selectedDistrict ? 'selected' : ''}>🏢 北一二B整體</option>${stores.map(row => `<option value="${row.store}" ${row.store === selectedUnit.store ? 'selected' : ''}>${displayStoreName(row.store)}</option>`).join('')}</select></label><span class="kpi-battle-note">${selectedDistrict ? '北一二B差異數＝實際數－80%目標台數（無條件進位）' : '店點差異數＝實際數－50%目標台數（無條件進位）'}</span></div><div class="award-role-indicator${selectedDistrict ? ' district' : ''}">${selectedDistrict ? '目前檢視：督導獎金角色｜北一二B 80%／100%' : '目前檢視：店長獎金角色｜店點 50%／100%'}</div><div class="award-model-grid">${selectedUnit.items.map(item => renderAwardModel(item, selectedDistrict)).join('')}</div></div>`;
    }

    function acceptKpiResult(payload) {
      const result = (payload || {}).result || {};
      const kpiData = (payload || {}).data || null;
      const awards = result.snapshot && result.snapshot.awardsBattle;
      const validation = validateAwardsBattle(awards, kpiData, result.snapshot && result.snapshot.kpiBattle, result.snapshot && result.snapshot._read_integrity);
      if (!validation.ok) {
        state.data = null;
        state.unavailableReason = validation.reason;
        renderUnavailable();
        return false;
      }
      const { person_awards: rawPeople, viewer, ...scoped } = awards;
      const validViewer = viewer?.schema === 'north12b-awards-viewer/v1' &&
        (viewer.mode === 'member' || (viewer.mode === 'supervisor' && result.trustSource === 'password-bound'));
      state.data = rawPeople === undefined && (viewer === undefined || validViewer)
        ? awards : { ...scoped, ...(validViewer ? { viewer } : {}) };
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
      if (event.target && event.target.id === 'awardsRankingBasis') {
        state.rankingBasis = event.target.value === 'projected' ? 'projected' : 'actual';
        render();
      }
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
    displayStoreName,
    renderAwardPriority,
    renderAwardModel,
    renderAwardUnit,
    novemberPriorities,
    renderIntegratedAwards,
  });
});
