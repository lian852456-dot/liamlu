const Core = window.DailyLogCore;
const STORAGE_KEY = 'bei12b_daily_log_snapshot_v1';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['xlsx', 'xls', 'csv', 'tsv']);

const state = {
  pending:null,
  snapshot:null,
  view:'daily'
};

const $ = id => document.getElementById(id);
const escapeHtml = value => String(value == null ? '' : value)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');

function taipeiToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit' })
    .formatToParts(new Date()).reduce((acc, part) => { acc[part.type] = part.value; return acc; }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function setMessage(message, type) {
  $('parseMessage').textContent = message || '';
  $('parseMessage').className = `message${type ? ` ${type}` : ''}`;
}

function statusLabel(status) {
  return { done:'已完成', pending:'未完成', missing:'缺資料', unknown:'待確認', upcoming:'未到期' }[status] || '待確認';
}

function sheetRows(workbook) {
  return workbook.SheetNames.map(name => ({
    name,
    rows:window.XLSX.utils.sheet_to_json(workbook.Sheets[name], { header:1, raw:true, defval:'', blankrows:false })
  }));
}

async function parseFile(file) {
  if (!file) return;
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    setMessage('只接受 XLSX、XLS、CSV 或 TSV 日誌報表。','error');
    return;
  }
  if (!file.size) {
    setMessage('檔案是空的，請重新匯出日誌報表。','error');
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    setMessage('檔案超過 20 MB，請先縮小報表範圍再重試。','error');
    return;
  }
  const asOfDate = $('asOfDate').value;
  if (!Core.normalizeDate(asOfDate)) {
    setMessage('請先選擇資料基準日。','error');
    return;
  }
  $('fileName').textContent = file.name;
  $('applyPreview').disabled = true;
  $('importPreview').hidden = true;
  setMessage('正在本機解析報表…');
  try {
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type:'array', cellDates:true });
    const selected = Core.chooseBestSheet(sheetRows(workbook), { asOfDate, date1904:Boolean(workbook.Workbook && workbook.Workbook.WBProps && workbook.Workbook.WBProps.date1904) });
    if (!selected) throw new Error('找不到包含「店點、檢查項目、處理狀態、細項名稱」的工作表。');
    if (selected.parsed.errors.length) throw new Error(selected.parsed.errors.slice(0, 4).join('\n'));
    if (!selected.parsed.rows.length) throw new Error('報表沒有可辨識的北一二B日誌資料。');
    const parsed = selected.parsed;
    state.pending = {
      rows:parsed.rows,
      unknownForms:parsed.unknownForms,
      warnings:parsed.warnings,
      fileName:file.name,
      sheetName:selected.name,
      asOfDate,
      importedAt:new Date().toISOString()
    };
    $('parsedRows').textContent = String(parsed.rows.length);
    $('parsedStores').textContent = String(new Set(parsed.rows.map(row => row.store)).size);
    $('unknownRows').textContent = String(parsed.unknownForms.length);
    const notes = [
      `工作表：${selected.name}；表頭位於第 ${parsed.meta.headerRow + 1} 列。`,
      `辨識 ${new Set(parsed.rows.map(row => row.formId)).size} 種已確認表單。`,
      ...parsed.warnings
    ];
    $('previewNotes').innerHTML = notes.map(note => `<div>${escapeHtml(note)}</div>`).join('');
    $('importPreview').hidden = false;
    $('applyPreview').disabled = false;
    setMessage(parsed.unknownForms.length ? '解析完成，但有未定義表單；可先查看本機預覽，正式發布前仍需確認。' : '解析完成，可套用至本機預覽。', parsed.unknownForms.length ? '' : 'success');
  } catch (error) {
    state.pending = null;
    setMessage(error.message || '日誌報表解析失敗。','error');
  }
}

function saveSnapshot(snapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch (_) {
    return false;
  }
}

function loadSnapshot() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.rows) || !Core.normalizeDate(parsed.asOfDate)) return null;
    return parsed;
  } catch (_) { return null; }
}

function applyPending() {
  if (!state.pending) return;
  state.snapshot = state.pending;
  const persisted = saveSnapshot(state.snapshot);
  $('viewDate').value = state.snapshot.asOfDate;
  $('clearSnapshot').hidden = false;
  renderDashboard();
  setMessage(persisted ? '已套用本機預覽；目前尚未寫入雲端。' : '已套用本機預覽；瀏覽器未允許保存，重新整理後需重新選檔。', persisted ? 'success' : '');
  $('dashboard').scrollIntoView({ behavior:'smooth', block:'start' });
}

function clearSnapshot() {
  if (!window.confirm('確定清除這台裝置上的日誌預覽？公司原始資料不會受到影響。')) return;
  try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* 無持久儲存時仍可清除記憶體狀態 */ }
  state.snapshot = null;
  state.pending = null;
  $('dashboard').hidden = true;
  $('importPreview').hidden = true;
  $('clearSnapshot').hidden = true;
  $('fileName').textContent = '尚未選擇檔案';
  $('fileInput').value = '';
  setMessage('已清除本機預覽。');
}

function metricScore(store, view) {
  if (view === 'daily') return [store.dailyDone, store.daily.length];
  if (view === 'weekly') return [store.weeklyDone, store.weekly.length];
  return [store.monthlyDone, store.monthly.length];
}

function renderStoreCard(store, view) {
  const forms = store[view];
  const [done, total] = metricScore(store, view);
  const hasDueException = forms.some(form => form.isDue && form.status !== 'done');
  const scoreClass = hasDueException ? ' incomplete' : done === total ? ' complete' : ' neutral';
  return `<button class="store-card" type="button" data-store="${escapeHtml(store.store)}">
    <div class="store-card-head"><h3>${escapeHtml(store.store)}</h3><span class="score${scoreClass}">${done} / ${total}</span></div>
    <div class="check-list">${forms.map(form => `<div class="check-row"><span>${escapeHtml(form.shortLabel)}</span><span class="status ${escapeHtml(form.status)}">${escapeHtml(statusLabel(form.status))}</span></div>`).join('')}</div>
  </button>`;
}

function renderExceptions(model) {
  const rows = model.stores.flatMap(store => store.exceptions.map(form => ({ store:store.store, form })));
  const unknownRows = Array.isArray(state.snapshot.unknownForms) ? state.snapshot.unknownForms : [];
  $('storeGrid').hidden = true;
  $('exceptionList').hidden = false;
  const tracked = rows.map(item => `<button class="exception-row" type="button" data-store="${escapeHtml(item.store)}" data-form="${escapeHtml(item.form.id)}"><strong>${escapeHtml(item.store)}</strong><span>${escapeHtml(item.form.label)}</span><span class="status ${escapeHtml(item.form.status)}">${escapeHtml(statusLabel(item.form.status))}</span></button>`).join('');
  const unknown = unknownRows.map(item => `<div class="exception-row unknown-row"><strong>${escapeHtml(item.store)}</strong><span>未定義表單：${escapeHtml(item.formName)}</span><span class="status unknown">待確認</span></div>`).join('');
  $('exceptionList').innerHTML = tracked || unknown ? tracked + unknown : '<div class="empty-state">目前沒有需追蹤項目。</div>';
}

function renderDashboard() {
  if (!state.snapshot) return;
  const selectedDate = Core.normalizeDate($('viewDate').value) || state.snapshot.asOfDate;
  $('viewDate').value = selectedDate;
  const model = Core.buildDashboard(state.snapshot.rows, selectedDate);
  state.model = model;
  $('dashboard').hidden = false;
  $('sourceMeta').textContent = `${state.snapshot.fileName} · ${state.snapshot.sheetName} · 資料基準日 ${selectedDate} · 僅本機預覽`;
  $('dailyMetric').textContent = `${model.dailyDone} / ${model.dailyExpected}`;
  $('weeklyMetric').textContent = `${model.weeklyDone} / ${model.weeklyExpected}`;
  $('monthlyMetric').textContent = `${model.monthlyDone} / ${model.monthlyExpected}`;
  const unknownCount = Array.isArray(state.snapshot.unknownForms) ? state.snapshot.unknownForms.length : 0;
  $('exceptionMetric').textContent = String(model.exceptionCount + unknownCount);
  if (state.view === 'exceptions') renderExceptions(model);
  else {
    $('exceptionList').hidden = true;
    $('storeGrid').hidden = false;
    $('storeGrid').innerHTML = model.stores.map(store => renderStoreCard(store, state.view)).join('');
  }
  bindDetailButtons();
}

function renderFormDetail(form) {
  const dueText = form.dueDate ? `${form.dueLabel}（${form.dueDate}）` : form.dueLabel;
  const meta = [dueText, form.submittedAt ? `最後填寫 ${form.submittedAt}` : '', form.submitters && form.submitters.length ? `填寫人 ${form.submitters.join('、')}` : ''].filter(Boolean).join(' · ');
  const rows = form.rows.length ? form.rows.map(row => `<details class="detail-item"><summary>${escapeHtml(row.section || '檢查細項')} · ${escapeHtml(statusLabel(row.status))}</summary><p>${escapeHtml(row.itemText || '原始報表未提供細項文字')}</p></details>`).join('') : '<p class="detail-meta">本次資料中沒有這張表單的紀錄。</p>';
  return `<section class="detail-form"><div class="detail-form-head"><h3>${escapeHtml(form.label)}</h3><span class="status ${escapeHtml(form.status)}">${escapeHtml(statusLabel(form.status))}</span></div><p class="detail-meta">${escapeHtml(meta)}</p>${rows}</section>`;
}

function openDetail(storeName, formId) {
  const store = state.model && state.model.stores.find(item => item.store === storeName);
  if (!store) return;
  let forms;
  if (formId) forms = [...store.daily, ...store.weekly, ...store.monthly].filter(form => form.id === formId);
  else forms = store[state.view] || store.exceptions;
  $('detailCadence').textContent = formId ? '需追蹤項目' : ({daily:'每日',weekly:'每週',monthly:'每月'}[state.view] || '需追蹤');
  $('detailTitle').textContent = store.store;
  $('detailBody').innerHTML = forms.map(renderFormDetail).join('');
  $('detailDialog').showModal();
}

function bindDetailButtons() {
  document.querySelectorAll('[data-store]').forEach(button => button.addEventListener('click', () => openDetail(button.dataset.store, button.dataset.form || '')));
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
  state.view = button.dataset.view;
  document.querySelectorAll('[data-view]').forEach(item => {
    const active = item === button;
    item.classList.toggle('active', active);
    item.setAttribute('aria-selected', String(active));
  });
  renderDashboard();
}));

$('fileInput').addEventListener('change', event => parseFile(event.target.files && event.target.files[0]));
$('applyPreview').addEventListener('click', applyPending);
$('clearSnapshot').addEventListener('click', clearSnapshot);
$('viewDate').addEventListener('change', renderDashboard);
$('closeDialog').addEventListener('click', () => $('detailDialog').close());
$('detailDialog').addEventListener('click', event => { if (event.target === $('detailDialog')) $('detailDialog').close(); });

$('asOfDate').value = taipeiToday();
state.snapshot = loadSnapshot();
if (state.snapshot) {
  $('viewDate').value = state.snapshot.asOfDate;
  $('clearSnapshot').hidden = false;
  renderDashboard();
}
