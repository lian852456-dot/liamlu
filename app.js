const views = [...document.querySelectorAll('[data-view]')];
const navButtons = [...document.querySelectorAll('[data-nav]')];
const appStatus = document.querySelector('#connectionStatus');
const PATROL_API_URL = 'https://script.google.com/macros/s/AKfycbznzoWOzzPJLEh8PCwTLw8UfWEyiCXwawd0T49JXpK4MP70vTdrrfTMN1G2Grghd-Mv/exec';
const PATROL_TOKEN_KEY = 'bei12b_pt_session_token';
const STORE_NAMES = ['酒泉', '萬大', '大稻埕', '復興南', '三創', '杭州南', '永吉', '通化', '六張犁'];

let patrolToken = sessionStorage.getItem(PATROL_TOKEN_KEY) || '';
let scheduleData = null;
let patrolData = null;
let scheduleReadAt = '';
let patrolReadAt = '';

function setView(viewName) {
  views.forEach(view => { view.hidden = view.dataset.view !== viewName; });
  navButtons.forEach(button => {
    const active = button.dataset.nav === viewName;
    button.classList.toggle('active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
  history.replaceState(null, '', `#${viewName}`);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function updateConnectionState() {
  const online = navigator.onLine;
  appStatus.className = `connection-pill ${online ? 'online' : 'offline'}`;
  appStatus.textContent = online ? '正式入口就緒' : '離線：不顯示真資料';
}

function taipeiToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function formatReadAt(date = new Date()) {
  return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function normalizeStore(value) {
  return String(value || '').replace('台灣大哥大數位生活', '').replace(/^台北/, '').replace(/南$/, '').replace(/\s+/g, '').trim();
}

function setSecureMessage(message, error = false) {
  const node = document.querySelector('#secureGateMessage');
  node.textContent = message;
  node.classList.toggle('error', error);
}

function setSecureUi(unlocked) {
  document.querySelector('#secureReadGate').classList.toggle('unlocked', unlocked);
  document.querySelector('#patrolAuthForm').hidden = unlocked;
  document.querySelector('#patrolLogout').hidden = !unlocked;
  const status = document.querySelector('#patrolSessionStatus');
  status.className = `status-tag ${unlocked ? 'success' : 'neutral'}`;
  status.textContent = unlocked ? '班表／巡店 session 已驗證' : '班表／巡店尚未解鎖';
}

async function postPatrolAuth(payload) {
  const response = await fetch(PATROL_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
    cache: 'no-store'
  });
  const result = await response.json();
  if (!result || result.status !== 'ok') throw new Error((result && result.message) || '驗證失敗');
  return result;
}

async function patrolRead(action, params = {}) {
  if (!['sread', 'ptread'].includes(action)) throw new Error('Pilot 僅允許班表與巡店唯讀 action');
  if (!patrolToken) throw new Error('session 尚未驗證');
  const url = new URL(PATROL_API_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('token', patrolToken);
  Object.entries(params).forEach(([key, value]) => { if (value) url.searchParams.set(key, value); });
  const response = await fetch(url, { method: 'GET', cache: 'no-store' });
  const result = await response.json();
  if (!result || result.status !== 'ok') throw new Error((result && result.message) || '正式資料讀取失敗');
  return result;
}

async function unlockPatrol(passcode) {
  const result = await postPatrolAuth({ action: 'ptauth', key: String(passcode || '').trim() });
  patrolToken = String(result.token || '');
  if (!patrolToken) throw new Error('正式服務未簽發短效 session');
  sessionStorage.setItem(PATROL_TOKEN_KEY, patrolToken);
  setSecureUi(true);
  setSecureMessage('已通過既有正式驗證；正在讀取班表與巡店摘要。');
  await loadSupervisorReadOnly();
}

async function restorePatrolSession() {
  if (!patrolToken) return false;
  try {
    const result = await postPatrolAuth({ action: 'ptauth', token: patrolToken });
    patrolToken = String(result.token || '');
    if (!patrolToken) throw new Error('session 已失效');
    sessionStorage.setItem(PATROL_TOKEN_KEY, patrolToken);
    setSecureUi(true);
    setSecureMessage('已恢復既有短效 session；正在更新真資料。');
    await loadSupervisorReadOnly();
    return true;
  } catch (error) {
    clearPatrolSession();
    setSecureMessage('短效 session 已失效，請以既有通行碼重新解鎖。', true);
    return false;
  }
}

function clearPatrolSession() {
  patrolToken = '';
  scheduleData = null;
  patrolData = null;
  sessionStorage.removeItem(PATROL_TOKEN_KEY);
  setSecureUi(false);
  document.querySelector('#scheduleSummary').innerHTML = '解鎖後顯示九店人員、班別與上班／休假狀態。';
  document.querySelector('#patrolSummary').innerHTML = '解鎖後顯示最近巡店日期與待追蹤／異常摘要。';
  document.querySelector('#patrolDetail').innerHTML = '請先回首頁解鎖既有 Liam 情報站 session。';
  document.querySelector('#scheduleUpdatedAt').textContent = '尚未讀取';
  document.querySelector('#patrolUpdatedAt').textContent = '尚未讀取';
}

async function loadSupervisorReadOnly() {
  const requestedDate = document.querySelector('#scheduleDate').value || taipeiToday();
  const month = requestedDate.slice(0, 7);
  const results = await Promise.allSettled([
    patrolRead('sread', { month }),
    patrolRead('ptread')
  ]);
  const failures = [];
  if (results[0].status === 'fulfilled') {
    scheduleData = results[0].value.schedule;
    scheduleReadAt = formatReadAt();
    populateScheduleStores();
    renderSchedule();
  } else {
    failures.push(`班表：${results[0].reason.message}`);
    document.querySelector('#scheduleSummary').innerHTML = `<div class="read-error">班表讀取失敗；請使用下方完整班表入口。<small>${escapeHtml(results[0].reason.message)}</small></div>`;
  }
  if (results[1].status === 'fulfilled') {
    patrolData = results[1].value;
    patrolReadAt = formatReadAt();
    populatePatrolStores();
    renderPatrol();
  } else {
    failures.push(`巡店：${results[1].reason.message}`);
    const fallback = '<div class="read-error">巡店摘要暫時無法安全讀取；Pilot 仍可使用既有完整巡店入口。</div>';
    document.querySelector('#patrolSummary').innerHTML = fallback;
    document.querySelector('#patrolDetail').innerHTML = fallback;
  }
  setSecureMessage(failures.length ? failures.join('；') : '班表與巡店摘要已由既有受保護來源讀回；App 未保存資料。', failures.length > 0);
}

function populateSelect(select, names) {
  const current = select.value;
  select.innerHTML = '<option value="">九店全部</option>' + names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
  if (names.includes(current)) select.value = current;
}

function populateScheduleStores() {
  const names = (scheduleData && scheduleData.stores || []).map(store => store.store);
  populateSelect(document.querySelector('#scheduleStoreFilter'), names);
}

function dateLabel(date) {
  const parsed = new Date(`${date}T00:00:00+08:00`);
  return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', month: 'numeric', day: 'numeric', weekday: 'short' }).format(parsed);
}

function scheduleDay(store, date) {
  return (store.days || []).find(day => day.date === date);
}

function renderSchedule() {
  const container = document.querySelector('#scheduleSummary');
  const date = document.querySelector('#scheduleDate').value || taipeiToday();
  if (!scheduleData || scheduleData.month !== date.slice(0, 7)) {
    if (patrolToken) loadScheduleMonth(date.slice(0, 7));
    return;
  }
  const filter = document.querySelector('#scheduleStoreFilter').value;
  const stores = (scheduleData.stores || []).filter(store => !filter || store.store === filter);
  document.querySelector('#scheduleUpdatedAt').textContent = `updatedAt（本次讀取）${scheduleReadAt}`;
  container.innerHTML = `<p class="source-note">${escapeHtml(dateLabel(date))}・${escapeHtml(scheduleData.rocMonth || scheduleData.month || '')}・正式 sread</p><div class="schedule-list">${stores.map(store => {
    const day = scheduleDay(store, date);
    const assignments = day && Array.isArray(day.staff) ? day.staff : [];
    return `<article class="schedule-store"><div class="store-title"><strong>${escapeHtml(store.store)}</strong><span>${day ? `${(day.workingStaff || []).length} 人上班` : '尚無班表'}</span></div><div class="assignment-list">${assignments.length ? assignments.map(person => `<div class="assignment ${person.working ? 'working' : 'off'}"><span><b>${escapeHtml(person.name)}</b><small>${escapeHtml(person.role || '—')}</small></span><i>${escapeHtml(person.status || (person.working ? '上班' : '休假'))}</i></div>`).join('') : '<p class="empty-row">此日無人員班別資料</p>'}</div></article>`;
  }).join('')}</div>`;
}

async function loadScheduleMonth(month) {
  try {
    const result = await patrolRead('sread', { month });
    scheduleData = result.schedule;
    scheduleReadAt = formatReadAt();
    populateScheduleStores();
    renderSchedule();
  } catch (error) {
    document.querySelector('#scheduleSummary').innerHTML = `<div class="read-error">${escapeHtml(error.message)}</div>`;
  }
}

function shiftDate(days) {
  const input = document.querySelector('#scheduleDate');
  const current = new Date(`${input.value || taipeiToday()}T00:00:00+08:00`);
  current.setUTCDate(current.getUTCDate() + days);
  input.value = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(current);
  renderSchedule();
}

function patrolVisitDate(row) {
  const match = String(row.arriveTime || row.fillTime || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  return match ? `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}` : '';
}

function patrolRowMonth(row) {
  const stored = String(row.month || '').slice(0, 7);
  return /^\d{4}-\d{2}$/.test(stored) ? stored : patrolVisitDate(row).slice(0, 7);
}

function progressFor(rows, expected) {
  const done = item => rows.some(row => Number(row.item) === item && String(row.result || '').toLowerCase() === 'v');
  const abnormal = item => !done(item) && rows.some(row => Number(row.item) === item && String(row.reason || '').trim() && !/^na$/i.test(String(row.reason || '').trim()));
  const completed = expected.filter(done).length;
  const issues = expected.filter(abnormal).length;
  const missing = expected.length - completed;
  return { completed, issues, missing, text: missing ? (issues ? `缺 ${missing}・${issues} 異常` : (completed ? `缺 ${missing}` : '尚未開始')) : '完成' };
}

function patrolCards() {
  if (!patrolData) return [];
  const rows = patrolData.rows || [];
  const configured = Array.isArray(patrolData.stores) && patrolData.stores.length ? patrolData.stores : STORE_NAMES.map(name => ({ name }));
  const month = taipeiToday().slice(0, 7);
  const monthNumber = Number(month.slice(5, 7));
  const biStart = monthNumber % 2 ? monthNumber : monthNumber - 1;
  const biMonths = [`${month.slice(0, 4)}-${String(biStart).padStart(2, '0')}`, `${month.slice(0, 4)}-${String(biStart + 1).padStart(2, '0')}`];
  return configured.map(store => {
    const name = String(store.name || store.store || '');
    const storeRows = rows.filter(row => (store.code && String(row.code || '') === String(store.code)) || normalizeStore(row.store) === normalizeStore(name));
    const current = storeRows.filter(row => patrolRowMonth(row) === month);
    const lastDate = storeRows.map(patrolVisitDate).filter(Boolean).sort().at(-1) || '尚無紀錄';
    const visits = new Set(current.map(patrolVisitDate).filter(Boolean)).size;
    const halfRows = current.filter(row => Number(patrolVisitDate(row).slice(-2)) <= 15);
    const secondHalfRows = current.filter(row => Number(patrolVisitDate(row).slice(-2)) > 15);
    return {
      name,
      lastDate,
      visits,
      h1: progressFor(halfRows, Array.from({ length: 12 }, (_, index) => index + 2)),
      h2: progressFor(secondHalfRows, Array.from({ length: 12 }, (_, index) => index + 2)),
      monthly: progressFor(current, [14, 15, 16, 17]),
      bi: progressFor(storeRows.filter(row => biMonths.includes(patrolRowMonth(row))), [18]),
      rows: storeRows
    };
  });
}

function populatePatrolStores() {
  populateSelect(document.querySelector('#patrolStoreFilter'), patrolCards().map(card => card.name));
}

function renderPatrol() {
  const filter = document.querySelector('#patrolStoreFilter').value;
  const cards = patrolCards().filter(card => !filter || card.name === filter);
  const rows = patrolData && patrolData.rows || [];
  const sourceUpdated = rows.map(row => String(row.savedAt || '')).filter(Boolean).sort().at(-1);
  const latestVisit = rows.map(patrolVisitDate).filter(Boolean).sort().at(-1);
  const updated = sourceUpdated || latestVisit || patrolReadAt;
  document.querySelector('#patrolUpdatedAt').textContent = `${sourceUpdated ? 'updatedAt（來源）' : 'updatedAt（最近紀錄）'}${updated}`;
  const cardHtml = `<p class="source-note">九店巡店狀態・正式 ptread・本次讀取 ${escapeHtml(patrolReadAt)}</p><div class="patrol-grid">${cards.map(card => `<article class="patrol-store"><div class="store-title"><strong>${escapeHtml(card.name)}</strong><span>本月到店 ${card.visits} 次</span></div><p class="last-visit">最近巡店：${escapeHtml(card.lastDate)}</p><div class="patrol-states"><span>上半月 ${escapeHtml(card.h1.text)}</span><span>下半月 ${escapeHtml(card.h2.text)}</span><span>月檢 ${escapeHtml(card.monthly.text)}</span><span>雙月 ${escapeHtml(card.bi.text)}</span></div></article>`).join('')}</div>`;
  document.querySelector('#patrolSummary').innerHTML = cardHtml;
  const recent = rows.slice().sort((a, b) => String(b.fillTime || '').localeCompare(String(a.fillTime || ''))).slice(0, 8);
  document.querySelector('#patrolDetail').innerHTML = cardHtml + `<section class="recent-records"><h2>最近巡店紀錄</h2>${recent.length ? recent.map(row => `<article><span><b>${escapeHtml(row.store || '—')}</b><small>${escapeHtml(patrolVisitDate(row) || row.fillTime || '—')}・題 ${escapeHtml(row.item || '—')}</small></span><i class="${String(row.result || '').toLowerCase() === 'v' ? 'ok' : 'attention'}">${String(row.result || '').toLowerCase() === 'v' ? '符合' : (String(row.reason || '').trim() || '待追蹤')}</i></article>`).join('') : '<p class="empty-row">尚無巡店紀錄</p>'}</section>`;
}

navButtons.forEach(button => button.addEventListener('click', event => {
  if (button.tagName === 'A' && !button.hash) return;
  event.preventDefault();
  setView(button.dataset.nav);
}));
document.querySelector('#patrolAuthForm').addEventListener('submit', async event => {
  event.preventDefault();
  const input = document.querySelector('#patrolPasscode');
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  setSecureMessage('正在向既有正式後端驗證…');
  try {
    await unlockPatrol(input.value);
    input.value = '';
  } catch (error) {
    clearPatrolSession();
    input.value = '';
    setSecureMessage(`解鎖失敗：${error.message}；資料仍保持鎖定。`, true);
  } finally {
    button.disabled = false;
  }
});
document.querySelector('#patrolLogout').addEventListener('click', async () => {
  const token = patrolToken;
  clearPatrolSession();
  setSecureMessage('已登出班表／巡店短效 session。');
  if (token) postPatrolAuth({ action: 'ptlogout', token }).catch(() => {});
});
document.querySelectorAll('[data-date-step]').forEach(button => button.addEventListener('click', () => shiftDate(Number(button.dataset.dateStep))));
document.querySelector('[data-date-today]').addEventListener('click', () => { document.querySelector('#scheduleDate').value = taipeiToday(); renderSchedule(); });
document.querySelector('#scheduleDate').addEventListener('change', renderSchedule);
document.querySelector('#scheduleStoreFilter').addEventListener('change', renderSchedule);
document.querySelector('#patrolStoreFilter').addEventListener('change', renderPatrol);
window.addEventListener('online', updateConnectionState);
window.addEventListener('offline', updateConnectionState);
window.addEventListener('hashchange', () => {
  const viewName = location.hash.slice(1);
  if (views.some(view => view.dataset.view === viewName)) setView(viewName);
});

const today = taipeiToday();
document.querySelector('#scheduleDate').value = today;
document.querySelector('#todayLabel').textContent = `${dateLabel(today)}・Liam Supervisor Pilot 1.0`;
const hashView = location.hash.slice(1);
setView(views.some(view => view.dataset.view === hashView) ? hashView : 'home');
setSecureUi(false);
updateConnectionState();
restorePatrolSession();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(error => {
    console.warn('Liam Supervisor Service Worker 註冊失敗', error);
  }));
}
