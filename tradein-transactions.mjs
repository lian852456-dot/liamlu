const API = 'https://script.google.com/macros/s/AKfycbwf_ms5rkOIg92FOZwZuHCft3JWpC7ENPUN6c6ebPb1Jd6eqKYfa_2tmrI8onDIl4Mi/exec';
const EMPLOYEE_KEY = 'north12b_private_dashboard_employee_id';
const DEVICE_KEY = 'north12b_private_dashboard_device_id';
const PAGE_SIZE = 50;
const $ = id => document.getElementById(id);
const currency = new Intl.NumberFormat('zh-TW');
const labels = ['成交日', '成交店', '同仁', '專案', '回收機款', '手機折抵'];
const projectName = row => [row.project, row.projectCode].filter(Boolean).join(' ');
const month = $('transactionMonth');
const date = $('transactionDate');
const store = $('transactionStore');
const results = $('transactionResults');
let snapshot = null;
let request = null;
let page = 0;

function status(message) { $('transactionStatus').textContent = message; }
function node(tag, value) {
  const element = document.createElement(tag);
  element.textContent = value;
  return element;
}
function savedEmployee() {
  return sessionStorage.getItem(EMPLOYEE_KEY) || localStorage.getItem(EMPLOYEE_KEY) || '';
}
function clear(message = '') {
  request?.abort();
  request = null;
  snapshot = null;
  page = 0;
  results.hidden = true;
  for (const id of ['transactionRows', 'topModels', 'topProjects', 'transactionStore', 'sourcePeriod', 'transactionCount', 'transactionPage']) $(id).replaceChildren();
  $('readSelf').disabled = $('readSupervisor').disabled = false;
  status(message);
}
function renderTop(id, values) {
  const counts = new Map();
  for (const value of values) if (value) counts.set(value, (counts.get(value) || 0) + 1);
  const top = [...counts].sort(([a, n], [b, m]) => m - n || a.localeCompare(b, 'zh-TW')).slice(0, 5);
  $(id).replaceChildren(...top.map(([name, count]) => {
    const item = document.createElement('li');
    item.append(node('span', name), node('span', `${count} 台`));
    return item;
  }));
  if (!top.length) $(id).append(node('li', '來源未提供'));
}
function render() {
  if (!snapshot) return;
  const selection = snapshot.rows.filter(row => (!store.value || row.store === store.value) && (!date.value || row.date === date.value));
  const pages = Math.max(1, Math.ceil(selection.length / PAGE_SIZE));
  page = Math.min(page, pages - 1);
  const covered = !date.value || date.value >= snapshot.sourcePeriod.start && date.value <= snapshot.sourcePeriod.end;
  $('transactionCount').textContent = !covered ? '這一天超出來源期間。'
    : selection.length ? `${selection.length} 筆有效成交` : '這個篩選範圍沒有有效成交。';
  const credits = selection.map(row => row.credit).filter(value => value !== null);
  const creditSum = credits.reduce((sum, value) => sum + value, 0);
  const stores = new Set(selection.map(row => row.store).filter(Boolean));
  const summary = $('transactionSummary');
  summary.hidden = !selection.length;
  summary.replaceChildren(...[
    ['筆數', selection.length ? `${selection.length} 筆` : '0 筆'],
    ['折抵合計', credits.length ? `NT$ ${currency.format(creditSum)}` : '未提供'],
    ['店點', `${stores.size} 店`]
  ].map(([label, value]) => {
    const card = document.createElement('article');
    card.append(node('span', label), node('strong', value));
    return card;
  }));
  $('transactionHighlights').hidden = !selection.length;
  renderTop('topModels', selection.map(row => row.model));
  renderTop('topProjects', selection.map(projectName));
  $('transactionRows').replaceChildren(...selection.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(row => {
    const tr = document.createElement('tr');
    const values = [row.date, row.store, row.staff || '待核', projectName(row), row.model || '未提供',
      row.credit === null ? '未提供' : `NT$ ${currency.format(row.credit)}`];
    values.forEach((value, index) => {
      const td = node('td', value);
      td.dataset.label = labels[index];
      if (index === 5) td.className = 'num';
      tr.append(td);
    });
    return tr;
  }));
  $('transactionPages').hidden = pages === 1;
  $('transactionPage').textContent = `${page + 1} ／ ${pages}`;
  $('previousTransactions').disabled = page === 0;
  $('nextTransactions').disabled = page + 1 === pages;
}
async function load(supervisor) {
  const adminSecret = $('supervisorSecret').value;
  $('supervisorSecret').value = '';
  clear();
  const requestedMonth = month.value;
  if (!month.reportValidity()) return;
  const employeeId = supervisor ? $('supervisorId').value.trim() : savedEmployee();
  const deviceId = localStorage.getItem(DEVICE_KEY) || (supervisor ? crypto.randomUUID() : '');
  if (!supervisor && (!employeeId || !deviceId)) { status('請先在同仁入口使用已核准的裝置登入。'); return; }
  if (window.PortalLogout.isLocked()) { status('營運中心已登出，請重新登入後再讀取。'); return; }
  const controller = new AbortController();
  request = controller;
  const timeout = setTimeout(() => controller.abort(), 30000);
  $('readSelf').disabled = $('readSupervisor').disabled = true;
  status('正在驗證並讀取成交明細…');
  try {
    const credentials = supervisor ? {employeeId, deviceId, adminSecret} : {employeeId, deviceId};
    const response = await fetch(API, {
      method: 'POST', headers: {'Content-Type': 'text/plain;charset=utf-8'}, credentials: 'omit', cache: 'no-store',
      signal: controller.signal, body: JSON.stringify({action: 'tradein_performance_transactions_read', month: requestedMonth, ...credentials})
    });
    if (!response.ok) throw Error('成交明細暫時無法讀取，請稍後再試。');
    const data = await response.json();
    if (request !== controller || requestedMonth !== month.value) return;
    if (data.status !== 'ok') {
      if (data.message === 'unknown private dashboard action') throw Error('成交明細尚待後端部署。');
      throw Error(data.message || '成交明細讀取失敗。');
    }
    if (data.month !== requestedMonth || data.scope !== (supervisor ? 'supervisor' : 'self')) throw Error('成交明細的月份或授權範圍不符。');
    if (!data.sourcePeriod) { status('本月尚未同步 SAR74。'); return; }
    if (!Array.isArray(data.rows)) { status(`已同步至 ${data.sourcePeriod.end}，這個版本尚無逐筆明細。請由管理者重新同步對應的 SAR74 原檔。`); return; }
    snapshot = {...data, rows: data.rows.sort((a, b) => b.date.localeCompare(a.date) || a.store.localeCompare(b.store, 'zh-TW'))};
    store.replaceChildren(new Option(supervisor ? '全部門市' : '本人成交店', ''), ...data.stores.map(value => new Option(value, value)));
    date.value = '';
    date.min = data.sourcePeriod.start;
    date.max = data.sourcePeriod.end;
    $('sourcePeriod').textContent = `${supervisor ? '九店' : '本人'} · SAR74 ${data.sourcePeriod.start} ～ ${data.sourcePeriod.end}`;
    status('');
    results.hidden = false;
    render();
  } catch (error) {
    if (request === controller) clear(error.name === 'AbortError' ? '讀取逾時，請重新讀取。' : error.message);
  } finally {
    clearTimeout(timeout);
    if (request === controller) {
      request = null;
      $('readSelf').disabled = $('readSupervisor').disabled = false;
    }
  }
}

const linkedMonth = new URLSearchParams(location.search).get('month');
month.value = /^20\d{2}-(0[1-9]|1[0-2])$/.test(linkedMonth || '') ? linkedMonth : new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 7);
$('supervisorId').value = savedEmployee();
$('transactionRead').addEventListener('submit', event => { event.preventDefault(); void load(false); });
$('supervisorRead').addEventListener('submit', event => { event.preventDefault(); void load(true); });
month.addEventListener('change', () => clear());
for (const input of [store, date]) input.addEventListener('change', () => { page = 0; render(); });
$('clearTransactionDate').addEventListener('click', () => { date.value = ''; page = 0; render(); });
$('previousTransactions').addEventListener('click', () => { page--; render(); });
$('nextTransactions').addEventListener('click', () => { page++; render(); });
window.PortalLogout.registerMemoryRevoker(() => { $('supervisorSecret').value = ''; clear('已登出，請重新登入。'); });
window.addEventListener('pagehide', () => { $('supervisorSecret').value = ''; clear(); });
window.addEventListener('storage', event => { if (event.key === EMPLOYEE_KEY || event.key === DEVICE_KEY) clear(); });
