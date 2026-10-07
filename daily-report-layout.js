/* Approved daily-report layout. Moves existing controls; never owns storage or APIs. */
(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  let panel, area, context, rank, core, insurance, other, zero, submit, dock;
  let selected = '', selectedDate = '', selectedSeg = 16, loading = false;
  let dirty = false;
  const drafts = new Map();
  const draftKey = () => JSON.stringify([selected, selectedDate, selectedSeg]);
  const edits = new Map(), saves = new Map();
  const snapshot = () => Object.fromEntries(Array.from(area.querySelectorAll('input:not([readonly]),textarea')).map(input => [input.id, input.value]));
  function recordEdit() {
    const key = draftKey();
    edits.set(key, { revision:(edits.get(key)?.revision || 0) + 1, values:snapshot() });
  }
  const zeroIds = ['z_reason', 'z_consult', 'z_method', 'z_plan'];

  function element(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls) el.className = cls;
    if (text) el.textContent = text;
    return el;
  }
  function section(title, cls) {
    const el = element('section', 'daily-section ' + cls);
    el.append(element('h2', '', title));
    area.append(el); // Keep moved input IDs discoverable while assembling the layout.
    return el;
  }
  function moveFields(keys, destination) {
    keys.forEach(key => {
      const input = byId('f_' + key);
      if (input) destination.append(input.closest('.kpi-input-wrap'));
    });
  }
  function labelControls(root) {
    root.querySelectorAll('.kpi-input-wrap').forEach(wrap => {
      const input = wrap.querySelector('input');
      const label = wrap.querySelector('label');
      if (!input || !label) return;
      label.htmlFor = input.id;
      if (/_pct$/.test(input.id)) input.readOnly = true;
      input.inputMode = ['kpi','aq_ttl','rt_pts','haosu','acc'].some(k => input.id === 'f_' + k) ? 'decimal' : 'numeric';
      input.placeholder = input.readOnly && /_pct$/.test(input.id) ? '—' : '未填';
    });
  }
  function locate(input) {
    if (!input) return;
    const details = input.closest('details');
    if (details) details.open = true;
    input.scrollIntoView({ block:'center', behavior:'instant' });
    input.focus({ preventScroll:true });
  }
  function summaryContext() {
    byId('dailyStoreName').textContent = selected || '請選門市';
    byId('dailySubmitContext').textContent = selected + ' · ' + selectedSeg + ':00 ' + (selectedSeg === 21 ? '晚間收官' : '下午回報');
    byId('dailyCoreTag').textContent = selectedSeg === 21 ? '晚間必填' : '當日累計';
    byId('dailyManagementNote').textContent = selectedSeg === 21
      ? 'OP 與 MyCharge 晚間必填；沒有數量請填 0。'
      : '下午可先略過；21:00 再填 OP 與 MyCharge，空白不會造成下午缺件。';
    panel.querySelectorAll('.seg-card').forEach(el => el.setAttribute('aria-pressed', String(Number(el.id.replace('newSeg','')) === selectedSeg)));
    panel.querySelectorAll('.store-card').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.store === selected)));
  }
  function rateNote(prefix, numerator, denominator) {
    const n = byId('f_' + numerator), d = byId('f_' + denominator);
    const note = byId(prefix);
    if (note && n && d) note.textContent = n.value === '0' && d.value === '0'
      ? '無適用案件，不計算比率。' : d.value === '0' ? '分母為 0，不計算比率。' : '分子 ÷ 分母，自動計算。';
  }
  function updateZero(record) {
    if (!zero) return;
    const keys = selectedSeg === 21 && !loading ? ['aq999','haosu','rt1399'].filter(k => byId('f_' + k).value !== '' && Number(byId('f_' + k).value) === 0) : [];
    zero.hidden = !keys.length;
    if (!keys.length) return;
    if (!byId('z_reason')) renderZeroReportInputs();
    const names = {aq999:'A999',haosu:'好速',rt1399:'R1399'};
    byId('dailyZeroNote').textContent = keys.map(k => names[k]).join('、') + ' 為 0，請填原有四項請益內容。填完使用下方「送出回報」。';
    if (record) zeroIds.forEach(id => { byId(id).value = record['zero_' + id.slice(2)] || ''; });
    zero.querySelectorAll('label').forEach(label => {
      const input = label.parentElement.querySelector('textarea');
      if (input) label.htmlFor = input.id;
    });
  }
  function updateRates() {
    rateNote('dailyInsuranceNote', 'insurance_num', 'insurance_den');
    rateNote('dailyMyChargeNote', 'mgmt_mycharge_clicked', 'mgmt_mycharge_tagged');
  }
  function keyboardLayout() {
    if (!dock) return;
    const viewport = window.visualViewport;
    const editing = area.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    dock.classList.toggle('daily-keyboard-open', !!(innerWidth <= 760 && editing && viewport && innerHeight - viewport.height > 140));
  }

  function initialize() {
    panel = byId('panel-fill'); area = byId('fillFormArea');
    if (!panel || !area || panel.classList.contains('daily-layout-ready')) return;
    context = element('section', 'daily-context');
    const row = element('div', 'daily-context-row');
    const storeCell = element('div');
    storeCell.append(element('label', '', '門市'));
    const toggle = element('button', 'daily-store-toggle'); toggle.type = 'button'; toggle.id = 'dailyStoreToggle';
    toggle.append(element('span', '', '請選門市'), element('span', '', '切換門市')); toggle.firstChild.id = 'dailyStoreName';
    toggle.setAttribute('aria-controls', 'dailyStoreGrid'); toggle.setAttribute('aria-expanded', 'true');
    storeCell.append(toggle);
    const dateCell = element('div'); const dateLabel = element('label', '', '回報日期'); dateLabel.htmlFor = 'fillDate';
    dateCell.append(dateLabel, byId('fillDate'));
    const periodCell = element('div'); periodCell.append(element('label', '', '回報時段'), panel.querySelector('.seg-cards'));
    row.append(storeCell, dateCell, periodCell); context.append(row);
    const stores = panel.querySelector('.store-grid'); stores.id = 'dailyStoreGrid'; context.append(stores);
    toggle.onclick = () => { stores.hidden = !stores.hidden; toggle.setAttribute('aria-expanded', String(!stores.hidden)); };
    panel.querySelectorAll(':scope > .kpi-section-title').forEach(el => { el.hidden = true; });
    panel.insertBefore(context, area);
    panel.querySelectorAll('.store-card,.seg-card').forEach(el => {
      el.setAttribute('role', 'button'); el.tabIndex = 0;
      el.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); el.click(); } });
    });

    rank = section('公司 KPI 排名', 'daily-rank');
    const carryNote = element('p', 'daily-note', '首次填排名與 KPI；晚間自動沿用，不用重填。'); carryNote.id = 'dailyCarryNote';
    rank.append(carryNote);
    const draftNote = element('p', 'daily-note', '尚有未送出修改；切換後會保留。晚間承接以已保存的 16:00 回報為準。');
    draftNote.id = 'dailyDraftNote'; draftNote.hidden = true; rank.append(draftNote);
    const rankGrid = element('div', 'daily-grid'); moveFields(['rank','kpi'], rankGrid); rank.append(rankGrid);
    core = section('核心業績', 'daily-core');
    const coreTag = element('span', 'daily-tag', '當日累計'); coreTag.id = 'dailyCoreTag'; core.firstChild.append(coreTag);
    core.append(element('p', 'daily-note', '截至本時段累計，兩時段不相加。'));
    const coreGrid = element('div', 'daily-grid'); moveFields(['aq999','aq1399','rt999','rt1399','haosu'], coreGrid); core.append(coreGrid);
    const short = {aq999:['A999','V+D ≥999 · 筆'],aq1399:['A1399','V+D ≥1399 · 筆'],rt999:['R999','V+D ≥999 · 筆'],rt1399:['R1399','V+D ≥1399 · 筆'],haosu:['好速','銷售點數']};
    Object.entries(short).forEach(([key,[name,definition]]) => {
      const input = byId('f_' + key), wrap = input.closest('.kpi-input-wrap'), label = wrap.querySelector('label');
      input.setAttribute('aria-label', name + '｜' + label.textContent); label.textContent = name;
      wrap.insertBefore(element('span', 'daily-definition', definition), input);
      wrap.classList.add('daily-metric'); if (key === 'haosu') wrap.classList.add('daily-haosu');
    });
    insurance = section('保險搭售', 'daily-insurance');
    const insuranceGrid = element('div', 'daily-grid'); moveFields(['insurance_num','insurance_den','insurance_pct'], insuranceGrid); insurance.append(insuranceGrid);
    const insuranceNote = element('p', 'daily-note'); insuranceNote.id = 'dailyInsuranceNote'; insurance.append(insuranceNote);
    other = element('details', 'daily-section daily-other');
    other.append(element('summary', '', '其他業績（展開填寫）'));
    const otherGrid = element('div', 'daily-grid');
    moveFields(['early_renew','5g','aq_ttl','rt_pts','special_renew','premium_renew','rt_close_num','rt_close_den','rt_close_pct','acc','film','insurance','myvideo','apple_google','hbo','netflix'], otherGrid); other.append(otherGrid);
    const management = byId('managementFocusSection'); management.classList.add('daily-section', 'daily-management');
    const managementNote = element('p', 'daily-note'); managementNote.id = 'dailyManagementNote'; management.insertBefore(managementNote, byId('managementFocusGrid'));
    const chargeNote = element('p', 'daily-note'); chargeNote.id = 'dailyMyChargeNote'; management.append(chargeNote);
    zero = section('零報請益與明日計畫', 'daily-zero'); zero.id = 'dailyZeroSection'; zero.hidden = true;
    const zeroNote = element('p', 'daily-note'); zeroNote.id = 'dailyZeroNote'; zero.append(zeroNote, byId('underForms'));
    const error = byId('closingReportError');
    const summary = byId('filledSummary');
    const layout = element('div', 'daily-columns'), left = element('div', 'daily-column'), right = element('div', 'daily-column');
    left.append(core, insurance, other); right.append(management); layout.append(left, right);
    area.prepend(error, rank, summary, layout, zero);
    // Old grid containers are now empty; all input nodes and their event handlers survive.
    Array.from(area.children).forEach(el => { if (el.classList.contains('form-grid') || el.classList.contains('kpi-section-title')) el.hidden = true; });
    dock = element('div', 'daily-submit-bar');
    const dockText = element('div'); const text = element('strong'); text.id = 'dailySubmitContext';
    dockText.append(text, element('small', '', '沒有成交請填 0；空白不代表 0。'));
    submit = panel.querySelector('.btn-save-main'); dock.append(dockText, submit); area.append(dock);
    labelControls(area);
    area.addEventListener('input', event => {
      dirty = true; byId('dailyDraftNote').hidden = false;
      // While the source is pending, retain only explicitly edited fields.
      // Untouched blanks must not replace values returned by the server.
      if (loading && event.target.id && !event.target.readOnly && !event.target.disabled) {
        drafts.set(draftKey(), { ...drafts.get(draftKey()), [event.target.id]:event.target.value });
      }
      updateZero(); updateRates();
      recordEdit();
      if (event.target.hasAttribute('aria-invalid')) event.target.removeAttribute('aria-invalid');
    });
    window.visualViewport?.addEventListener('resize', keyboardLayout);
    area.addEventListener('focusin', keyboardLayout); area.addEventListener('focusout', () => setTimeout(keyboardLayout, 0));
    panel.classList.add('daily-layout-ready'); summaryContext();
  }

  window.DailyReportLayout = {
    resetReadContext() {
      if (!panel) return;
      drafts.clear(); edits.clear(); saves.clear(); dirty = false; loading = true;
      selected = ''; selectedDate = ''; selectedSeg = 16;
      area.querySelectorAll('input,textarea').forEach(input => {input.value = ''; input.disabled = true;});
      byId('dailyDraftNote').hidden = true; byId('filledSummary').classList.remove('show');
      byId('fillStore').value = ''; panel.querySelectorAll('.store-card').forEach(card => card.classList.remove('selected'));
      panel.querySelector('.store-grid').hidden = false;
      byId('dailyStoreToggle').setAttribute('aria-expanded', 'true');
      area.style.display = 'none'; submit.disabled = true;
    },
    onSelectionStart(store, date, seg) {
      if (!panel) return;
      if (selected && !loading && dirty) drafts.set(draftKey(), snapshot());
      dirty = false; byId('dailyDraftNote').hidden = true;
      selected = store; selectedDate = date; selectedSeg = Number(seg); loading = true;
      panel.querySelector('.store-grid').hidden = true; byId('dailyStoreToggle').setAttribute('aria-expanded', 'false');
      byId('underForms').replaceChildren(); zero.hidden = true;
      area.querySelectorAll('input').forEach(input => { input.value = ''; input.disabled = true; input.removeAttribute('aria-invalid'); });
      ['kpi','rank'].forEach(key => { byId('f_' + key).readOnly = selectedSeg === 21; });
      renderManagementFocusInputs({}); labelControls(area);
      area.querySelectorAll('input,textarea').forEach(input => { input.disabled = input.readOnly; });
      const draft = drafts.get(draftKey());
      if (draft) {
        Object.entries(draft).forEach(([id, value]) => { const input = byId(id); if (input && !input.readOnly) input.value = value; });
        calcPct('insurance_num','insurance_den','insurance_pct'); calcPct('rt_close_num','rt_close_den','rt_close_pct'); calcManagementFocusPct(); updateRates();
        dirty = true; byId('dailyDraftNote').hidden = false;
      }
      byId('closingReportError').hidden = true;
      byId('dailyCarryNote').textContent = '正在讀取已保存回報；可先填寫，完成讀取後才能送出。';
      submit.disabled = true; summaryContext();
    },
    onStoreLoaded(store, date, seg, record, first) {
      if (!panel || selected !== store || selectedDate !== date || selectedSeg !== Number(seg)) return;
      loading = false; submit.disabled = false; area.querySelectorAll('input').forEach(input => { input.disabled = false; }); labelControls(area); updateZero(record); updateRates();
      const draft = drafts.get(draftKey());
      if (draft) {
        Object.entries(draft).forEach(([id, value]) => { const input = byId(id); if (input && !input.readOnly) input.value = value; });
        updateZero();
        Object.entries(draft).forEach(([id, value]) => { const input = byId(id); if (input && !input.readOnly) input.value = value; });
        calcPct('insurance_num','insurance_den','insurance_pct'); calcPct('rt_close_num','rt_close_den','rt_close_pct'); calcManagementFocusPct(); updateRates();
        dirty = true; byId('dailyDraftNote').hidden = false;
      }
      if (selectedSeg !== 21) byId('dailyCarryNote').textContent = '首次填排名與 KPI；晚間自動沿用，不用重填。';
      else {
        const missing = ['rank','kpi'].filter(key => byId('f_' + key).value === '');
        byId('dailyCarryNote').textContent = missing.length
          ? '同店同日首次回報（16:00）尚缺' + missing.map(key => key === 'rank' ? '公司 KPI 排名' : 'KPI 達成率').join('、') + '；晚間保持空白並鎖定，請回 16:00 補填並保存。'
          : '已沿用同店、同日已保存的首次回報（16:00）；晚間排名與 KPI 已鎖定，不用重填。';
      }
    },
    onStoreLoadError(store, date, seg, error, retry) {
      if (!panel || selected !== store || selectedDate !== date || selectedSeg !== Number(seg)) return;
      const note = byId('dailyCarryNote');
      note.textContent = error.name === 'TimeoutError'
        ? '讀取超過 30 秒；尚未確認已保存資料，請稍後重新讀取。'
        : '回報資料未取得；尚未確認已保存資料，請重新讀取。';
      const button = element('button', '', '重新讀取');
      button.type = 'button'; button.id = 'dailyReadRetry'; button.addEventListener('click', retry);
      note.append(' ', button);
      // Submission stays disabled; pending edits remain local to this selection.
    },
    canSubmit(store, date, seg) {
      return !panel || (!loading && selected === store && selectedDate === date && selectedSeg === Number(seg));
    },
    showClosingIssues(issues) {
      if (!panel) return;
      area.querySelectorAll('[aria-invalid]').forEach(input => input.removeAttribute('aria-invalid'));
      const error = byId('closingReportError');
      issues.forEach(issue => {
        const input = byId('f_' + issue.key); if (input) input.setAttribute('aria-invalid', 'true');
        const link = element('a', '', issue.label); link.href = '#f_' + issue.key;
        link.onclick = event => { event.preventDefault(); locate(input); }; error.append(link);
      });
      if (issues.length) locate(byId('f_' + issues[0].key));
    },
    showZeroDetails() {
      if (!panel) return false;
      updateZero(); zero.hidden = false;
      if (zeroIds.every(id => byId(id)?.value.trim())) submitZeroModal();
      else locate(byId(zeroIds.find(id => !byId(id)?.value.trim())));
      return true;
    },
    beginSave(store, date, seg) {
      const key = JSON.stringify([store, date, Number(seg)]);
      const sequence = (saves.get(key) || 0) + 1; saves.set(key, sequence);
      return { key, revision:edits.get(key)?.revision || 0, sequence };
    },
    onSaveSucceeded(token) {
      if (!panel || !token) return false;
      const edit = edits.get(token.key);
      const current = draftKey() === token.key && !loading;
      if ((edit?.revision || 0) !== token.revision) {
        // An older verified write may have replaced the source; keep the later edit as a draft.
        drafts.set(token.key, current ? snapshot() : edit.values);
        if (current) { dirty = true; byId('dailyDraftNote').hidden = false; }
        return false;
      }
      if (saves.get(token.key) !== token.sequence) return false;
      drafts.delete(token.key);
      if (current) { dirty = false; byId('dailyDraftNote').hidden = true; }
      return current;
    },
    onClear() { if (!panel) return; drafts.delete(draftKey()); dirty = loading; byId('dailyDraftNote').hidden = !dirty; byId('underForms').replaceChildren(); updateZero(); updateRates(); if (loading) drafts.set(draftKey(), snapshot()); recordEdit(); }
  };
  document.addEventListener('DOMContentLoaded', initialize);
})();
