const Core = window.DailyLogCore;
const STORAGE_KEY = 'bei12b_daily_log_snapshot_v1';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(['xlsx', 'xls', 'csv', 'tsv']);

const state = {
  pending:null,
  pendingLog:null,
  pendingCalendar:null,
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

function setCalendarMessage(message, type) {
  $('calendarMessage').textContent = message || '';
  $('calendarMessage').className = `message${type ? ` ${type}` : ''}`;
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

function validateFile(file, label, setStatus) {
  const extension = String(file.name || '').split('.').pop().toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    setStatus(`${label}只接受 XLSX、XLS、CSV 或 TSV。`,'error');
    return false;
  }
  if (!file.size) {
    setStatus(`${label}檔案是空的，請重新匯出。`,'error');
    return false;
  }
  if (file.size > MAX_FILE_BYTES) {
    setStatus(`${label}檔案超過 20 MB，請先縮小報表範圍再重試。`,'error');
    return false;
  }
  return true;
}

function snapshotLogPart() {
  if (!state.snapshot) return null;
  const rows = Array.isArray(state.snapshot.logRows) ? state.snapshot.logRows : state.snapshot.rows.filter(row => row.formId !== 'calendar');
  return { rows, unknownForms:state.snapshot.unknownForms || [], warnings:[], fileName:state.snapshot.fileName || '', sheetName:state.snapshot.sheetName || '' };
}

function snapshotCalendarPart() {
  if (!state.snapshot) return null;
  const rows = Array.isArray(state.snapshot.calendarRows) ? state.snapshot.calendarRows : state.snapshot.rows.filter(row => row.formId === 'calendar');
  if (!rows.length && !state.snapshot.calendarFileName) return null;
  return { rows, warnings:[], fileName:state.snapshot.calendarFileName || '', sheetName:state.snapshot.calendarSheetName || '' };
}

function refreshPending() {
  const log = state.pendingLog || snapshotLogPart();
  const calendar = state.pendingCalendar || snapshotCalendarPart();
  if (!state.pendingLog && !state.pendingCalendar) return;
  const logRows = log ? log.rows : [];
  const calendarRows = calendar ? calendar.rows : [];
  const asOfDate = $('asOfDate').value;
  state.pending = {
    rows:Core.mergeLogAndCalendarRows(logRows, calendarRows),
    logRows,
    calendarRows,
    unknownForms:log ? log.unknownForms || [] : [],
    fileName:log ? log.fileName : '',
    sheetName:log ? log.sheetName : '',
    calendarFileName:calendar ? calendar.fileName : '',
    calendarSheetName:calendar ? calendar.sheetName : '',
    asOfDate,
    importedAt:new Date().toISOString()
  };
  const notes = [];
  if (log && log.fileName) notes.push(`日誌檢查：${log.fileName}／${log.sheetName || '已辨識工作表'}。`);
  if (calendar && calendar.fileName) notes.push(`店務行事曆：${calendar.fileName}／${calendar.sheetName || '已辨識工作表'}。`);
  if (log) notes.push(...(log.warnings || []));
  if (calendar) notes.push(...(calendar.warnings || []));
  $('parsedRows').textContent = String(state.pending.rows.length);
  $('parsedStores').textContent = String(new Set(state.pending.rows.map(row => row.store)).size);
  $('unknownRows').textContent = String(state.pending.unknownForms.length);
  $('previewNotes').innerHTML = notes.map(note => `<div>${escapeHtml(note)}</div>`).join('');
  $('importPreview').hidden = false;
  $('applyPreview').disabled = !state.pending.rows.length;
}

async function parseLogFile(file) {
  if (!file || !validateFile(file, '日誌檢查', setMessage)) return;
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
    state.pendingLog = {
      rows:parsed.rows,
      unknownForms:parsed.unknownForms,
      warnings:parsed.warnings,
      fileName:file.name,
      sheetName:selected.name
    };
    refreshPending();
    setMessage(parsed.unknownForms.length ? '解析完成，但有未定義表單；可先查看本機預覽，正式發布前仍需確認。' : '解析完成，可套用至本機預覽。', parsed.unknownForms.length ? '' : 'success');
  } catch (error) {
    state.pendingLog = null;
    setMessage(error.message || '日誌報表解析失敗。','error');
  }
}

async function parseCalendarFile(file) {
  if (!file || !validateFile(file, '店務行事曆', setCalendarMessage)) return;
  $('calendarFileName').textContent = file.name;
  $('applyPreview').disabled = true;
  setCalendarMessage('正在本機解析店務行事曆…');
  try {
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type:'array', cellDates:true });
    const selected = Core.chooseBestCalendarSheet(sheetRows(workbook), { date1904:Boolean(workbook.Workbook && workbook.Workbook.WBProps && workbook.Workbook.WBProps.date1904) });
    if (!selected) throw new Error('找不到包含「檢查日期、店點名稱（或營業點代碼）、處理狀態」的工作表。');
    if (selected.parsed.errors.length) throw new Error(selected.parsed.errors.slice(0, 4).join('\n'));
    if (!selected.parsed.rows.length) throw new Error('報表沒有可辨識的北一二B店務行事曆資料。');
    state.pendingCalendar = {
      rows:selected.parsed.rows,
      warnings:selected.parsed.warnings,
      fileName:file.name,
      sheetName:selected.name
    };
    refreshPending();
    setCalendarMessage(`行事曆解析完成：${selected.parsed.rows.length} 列，可與日誌檢查合併套用。`,'success');
  } catch (error) {
    state.pendingCalendar = null;
    setCalendarMessage(error.message || '店務行事曆解析失敗。','error');
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
  state.pendingLog = null;
  state.pendingCalendar = null;
  $('dashboard').hidden = true;
  $('importPreview').hidden = true;
  $('clearSnapshot').hidden = true;
  $('fileName').textContent = '尚未選擇檔案';
  $('calendarFileName').textContent = '尚未選擇檔案';
  $('fileInput').value = '';
  $('calendarFileInput').value = '';
  $('reminderPreview').hidden = true;
  $('groupReminderText').value = '';
  setMessage('已清除本機預覽。');
  setCalendarMessage('');
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
  $('copyMessage').textContent = '';
  $('reminderPreview').hidden = true;
  const selectedDate = Core.normalizeDate($('viewDate').value) || state.snapshot.asOfDate;
  $('viewDate').value = selectedDate;
  const model = Core.buildDashboard(state.snapshot.rows, selectedDate);
  state.model = model;
  $('dashboard').hidden = false;
  const sources = [
    state.snapshot.fileName ? `日誌：${state.snapshot.fileName}` : '',
    state.snapshot.calendarFileName ? `行事曆：${state.snapshot.calendarFileName}` : ''
  ].filter(Boolean).join(' · ');
  $('sourceMeta').textContent = `${sources || '本機資料'} · 資料基準日 ${selectedDate} · 僅本機預覽`;
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

async function copyGroupReminder() {
  if (!state.model || !state.snapshot) return;
  const reminder = Core.buildGroupReminder(state.model, state.snapshot.unknownForms);
  $('groupReminderText').value = reminder;
  $('reminderPreview').hidden = false;
  let copied = false;
  try {
    await navigator.clipboard.writeText(reminder);
    copied = true;
  } catch (_) {
    const textarea = document.createElement('textarea');
    textarea.value = reminder;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    copied = document.execCommand('copy');
    textarea.remove();
  }
  $('copyMessage').textContent = copied ? '已複製，可直接貼到 LINE 群組。' : '瀏覽器未允許複製，請重新點擊或檢查剪貼簿權限。';
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

$('fileInput').addEventListener('change', event => parseLogFile(event.target.files && event.target.files[0]));
$('calendarFileInput').addEventListener('change', event => parseCalendarFile(event.target.files && event.target.files[0]));
$('applyPreview').addEventListener('click', applyPending);
$('clearSnapshot').addEventListener('click', clearSnapshot);
$('viewDate').addEventListener('change', renderDashboard);
$('copyReminder').addEventListener('click', copyGroupReminder);
$('closeDialog').addEventListener('click', () => $('detailDialog').close());
$('detailDialog').addEventListener('click', event => { if (event.target === $('detailDialog')) $('detailDialog').close(); });

$('asOfDate').value = taipeiToday();
state.snapshot = loadSnapshot();
if (state.snapshot) {
  $('viewDate').value = state.snapshot.asOfDate;
  $('clearSnapshot').hidden = false;
  renderDashboard();
}
