import { isDate } from './tradein-export-core.mjs?v=20261120-store-trend';

const OWNER = 'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
const EMPLOYEE_KEY = 'north12b_private_dashboard_employee_id';
const DEVICE_KEY = 'north12b_private_dashboard_device_id';
const SESSION_KEY = 'north12b_password_session_v1';
const LOGOUT_KEY = 'north12b_portal_logout_event_v1';
const LOGIN_KEY = 'north12b_portal_login_event_v1';
const PAGE_SIZE = 50;
const PROJECTS = ['單銷', 'RT', 'AQNP'];
const LABELS = ['成交日', '成交店', '同仁', '專案', '回收機款', '舊機折抵', '專案機款', '銷貨單金額'];
const $ = id => document.getElementById(id);
const currency = new Intl.NumberFormat('zh-TW', {style:'currency', currency:'TWD', maximumFractionDigits:0});
const percent = new Intl.NumberFormat('zh-TW', {style:'percent', maximumFractionDigits:1});
const money = value => value == null ? '未提供' : currency.format(value);

function saved(area, key) {
  try { return window[area].getItem(key) || ''; } catch { return ''; }
}

function parsed(value) {
  try { return JSON.parse(value); } catch { return null; }
}

function readProof() {
  if (window.PortalLogout?.isLocked()) return null;
  const logout = parsed(saved('localStorage', LOGOUT_KEY));
  const epoch = logout?.id || '';
  const deviceId = saved('localStorage', DEVICE_KEY);
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(deviceId)) return null;
  const session = parsed(saved('sessionStorage', SESSION_KEY));
  const now = Date.now();
  if (session?.v === 1 && session.owner === OWNER && session.logoutEpoch === epoch && session.deviceId === deviceId
      && /^B1_[a-f0-9]_[a-f0-9]{64}$/.test(session.token) && Number.isSafeInteger(session.expiresAt)
      && session.expiresAt > now && session.expiresAt <= now + 1800000) {
    return {action:'employee_tradein_transactions_read', deviceId, token:session.token, expiresAt:session.expiresAt};
  }
  const login = parsed(saved('localStorage', LOGIN_KEY));
  if (epoch && !(login?.type === 'login' && login.at > logout.at)) return null;
  const employeeId = (saved('sessionStorage', EMPLOYEE_KEY) || saved('localStorage', EMPLOYEE_KEY)).trim().toUpperCase();
  if (!/^[A-Z0-9]{5,12}$/.test(employeeId)) return null;
  return {action:'tradein_performance_transactions_read', employeeId, deviceId};
}

function element(tag, value) {
  const item = document.createElement(tag);
  item.textContent = value;
  return item;
}

function validateSnapshot(value, month) {
  const valid = value.month === month && ['self', 'supervisor'].includes(value.scope);
  if (valid && value.sourcePeriod === null && value.rows === null) return;
  const {start, end} = value.sourcePeriod || {};
  const canonicalStores = window.TradeinPerformanceCore.STORES.map(([, store]) => store);
  const stores = value.stores;
  const dateInPeriod = date => isDate(date) && date >= start && date <= end;
  const validMoney = amount => amount == null || Number.isSafeInteger(amount) && amount >= 0;
  const validText = text => text == null || typeof text === 'string';
  if (!valid || !isDate(start) || !isDate(end) || start !== month + '-01' || end.slice(0, 7) !== month || end < start
      || !Array.isArray(stores) || new Set(stores).size !== stores.length || stores.some(store => !canonicalStores.includes(store))
      || value.scope === 'supervisor' && stores.length !== canonicalStores.length
      || (value.rows !== null && (!Array.isArray(value.rows) || value.rows.some(row => !row || !dateInPeriod(row.date)
        || !stores.includes(row.store) || !PROJECTS.includes(row.project)
        || ![row.staff, row.projectCode, row.model, row.projectModel].every(validText)
        || ![row.credit, row.orderAmount].every(validMoney))))) {
    throw Error('成交明細的月份、店點或欄位核對失敗。');
  }
}

function renderBreakdown(id, rows, field, limit, showPercent = false) {
  const counts = new Map();
  for (const row of rows) {
    const name = row[field];
    if (name) counts.set(name, (counts.get(name) || 0) + 1);
  }
  const sorted = [...counts].sort(([a, n], [b, m]) => m - n || a.localeCompare(b, 'zh-TW')).slice(0, limit);
  $(id).replaceChildren(...sorted.map(([name, count]) => {
    const item = document.createElement('li');
    const bar = document.createElement('span');
    bar.className = 'tx-bar';
    bar.setAttribute('aria-hidden', 'true');
    bar.style.setProperty('--share', percent.format(count / rows.length));
    const label = count + ' 筆' + (showPercent ? ' · ' + percent.format(count / rows.length) : '');
    item.append(element('span', name), element('strong', label), bar);
    return item;
  }));
  if (!sorted.length) $(id).append(element('li', '來源未提供'));
}

export function createTransactionsPanel(month) {
  const panel = $('actual-transactions');
  const results = $('transactionResults');
  const date = $('transactionDate');
  const store = $('transactionStore');
  const project = $('transactionProject');
  const search = $('transactionSearch');
  const login = $('transactionLogin');
  let active = false;
  let request;
  let snapshot;
  let leaseTimer;
  let page = 0;

  function status(message, needsLogin = false) {
    $('transactionStatus').textContent = message;
    login.hidden = !needsLogin;
  }

  function clear() {
    request?.abort();
    request = null;
    clearTimeout(leaseTimer);
    snapshot = null;
    page = 0;
    results.hidden = true;
    panel.removeAttribute('aria-busy');
    for (const id of ['transactionRows', 'transactionSummary', 'transactionStoreMix', 'transactionProjectMix',
      'transactionTopModels', 'transactionTopSoldModels', 'sourcePeriod', 'transactionCount', 'transactionPage',
      'transactionStore', 'transactionProject']) $(id).replaceChildren();
    date.value = '';
    search.value = '';
    status('');
  }

  function render() {
    if (!snapshot) return;
    const query = search.value.trim().toLocaleLowerCase('zh-TW');
    const inPeriod = !date.value || date.value >= snapshot.sourcePeriod.start && date.value <= snapshot.sourcePeriod.end;
    const rows = snapshot.rows.filter(row => (!store.value || row.store === store.value) && (!date.value || row.date === date.value)
      && (!project.value || row.project === project.value)
      && (!query || [row.project, row.projectCode, row.model, row.projectModel].some(value => value?.toLocaleLowerCase('zh-TW').includes(query))));
    $('transactionCount').textContent = !inPeriod ? '所選日超出 SAR74 來源期間。'
      : rows.length ? '共 ' + rows.length + ' 筆有效成交' : '這個篩選範圍沒有有效成交。';
    $('transactionAnalysis').hidden = $('transactionTable').hidden = rows.length === 0;
    if (!rows.length) {
      $('transactionRows').replaceChildren();
      return;
    }
    const credits = rows.map(row => row.credit).filter(value => value != null);
    const sum = credits.reduce((total, value) => total + value, 0);
    const creditCoverage = '有折抵金額 ' + credits.length + '／' + rows.length + ' 筆';
    $('transactionSummary').replaceChildren(...[
      ['有效成交', rows.length + ' 筆', new Set(rows.map(row => row.store)).size + ' 店有成交'],
      ['舊機折抵合計', money(credits.length ? sum : null), creditCoverage],
      ['平均每筆折抵', money(credits.length ? sum / credits.length : null), creditCoverage]
    ].map(([label, value, note]) => {
      const card = document.createElement('article');
      card.append(element('span', label), element('strong', value), element('small', note));
      return card;
    }));
    renderBreakdown('transactionStoreMix', rows, 'store', 9);
    renderBreakdown('transactionProjectMix', rows, 'project', 3, true);
    renderBreakdown('transactionTopModels', rows, 'model', 5);
    renderBreakdown('transactionTopSoldModels', rows, 'projectModel', 5);

    const pages = Math.ceil(rows.length / PAGE_SIZE);
    page = Math.min(page, pages - 1);
    $('transactionRows').replaceChildren(...rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(row => {
      const tr = document.createElement('tr');
      const values = [row.date, row.store, row.staff || '待核', [row.project, row.projectCode].filter(Boolean).join(' · '),
        row.model || '未提供', money(row.credit), row.projectModel || '未提供', money(row.orderAmount)];
      values.forEach((value, index) => {
        const td = element('td', value);
        td.dataset.label = LABELS[index];
        if (index === 5 || index === 7) td.className = 'num';
        tr.append(td);
      });
      return tr;
    }));
    $('transactionPages').hidden = pages <= 1;
    $('transactionPage').textContent = (page + 1) + ' ／ ' + pages;
    $('previousTransactions').disabled = page === 0;
    $('nextTransactions').disabled = page + 1 === pages;
  }

  async function load() {
    clear();
    if (!active || document.hidden) return;
    const requestedMonth = month.value;
    if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(requestedMonth)) { status('請選擇有效統計月份。'); return; }
    const proof = readProof();
    if (!proof) { status('請使用既有營運中心帳號或核准裝置登入，再查看成交明細。', true); return; }
    const {expiresAt, ...credentials} = proof;
    const controller = new AbortController();
    request = controller;
    const current = () => request === controller && active && !document.hidden && month.value === requestedMonth
      && JSON.stringify(proof) === JSON.stringify(readProof());
    const timer = setTimeout(() => controller.abort(), 45000);
    panel.setAttribute('aria-busy', 'true');
    status('正在讀取 SAR74 成交明細…');
    try {
      const response = await fetch(OWNER, {
        method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, credentials:'omit', cache:'no-store',
        signal:controller.signal, body:JSON.stringify({...credentials, month:requestedMonth})
      });
      if (!response.ok) throw Error('成交明細連線失敗，請重新讀取。');
      const data = await response.json();
      if (!current()) return;
      if (data?.status !== 'ok') {
        const code = data?.code || data?.message;
        if (['B_AUTH_DENIED', 'B_SESSION_DENIED', 'B_ELIGIBILITY_DENIED', 'TRADEIN_AUTH_REQUIRED', 'TRADEIN_DEVICE_NOT_APPROVED'].includes(code)) {
          status('登入已失效或此裝置未核准，請回營運中心登入後重新開啟。', true);
        } else if (code === 'unknown private dashboard action') {
          status('正式服務尚未提供成交明細，請稍後重新讀取。');
        } else {
          status('成交明細來源尚待核對，請稍後重新讀取。');
        }
        return;
      }
      if (expiresAt && data.expiresAt !== expiresAt) throw Error('登入期限核對失敗，請回營運中心登入。');
      validateSnapshot(data, requestedMonth);
      if (!data.sourcePeriod) { status('選定月份尚未同步 SAR74。'); return; }
      const {start, end} = data.sourcePeriod;
      $('sourcePeriod').textContent = (data.scope === 'supervisor' ? '九店' : '本人') + ' · SAR74 ' + start + ' ～ ' + end;
      if (!Array.isArray(data.rows)) { status('這個月份的快照只有進度彙總，請同步該月份的完整 SAR74 原檔補齊成交明細。'); return; }
      snapshot = {...data, rows:data.rows.sort((a, b) => b.date.localeCompare(a.date) || a.store.localeCompare(b.store, 'zh-TW'))};
      store.replaceChildren(new Option(data.scope === 'supervisor' ? '全部門市' : '本人成交店', ''), ...data.stores.map(value => new Option(value, value)));
      project.replaceChildren(new Option('全部專案', ''), ...PROJECTS.map(value => new Option(value, value)));
      date.min = start;
      date.max = end;
      results.hidden = false;
      status('');
      render();
      if (expiresAt) leaseTimer = setTimeout(() => {
        clear();
        status('登入已到期，請回營運中心登入。', true);
      }, Math.max(0, expiresAt - Date.now()));
    } catch (error) {
      if (current()) status(error.name === 'AbortError' ? '讀取逾時，請重新讀取。' : error.message);
    } finally {
      clearTimeout(timer);
      if (request === controller) {
        request = null;
        panel.removeAttribute('aria-busy');
        if (!readProof()) { clear(); status('登入已到期，請回營運中心登入。', true); }
      }
    }
  }

  function setActive(value) {
    if (value === active) return;
    active = value;
    if (active) void load();
    else clear();
  }

  const update = () => { page = 0; render(); };
  for (const input of [store, date, project]) input.addEventListener('change', update);
  search.addEventListener('input', update);
  $('clearTransactionFilters').addEventListener('click', () => {
    store.value = date.value = project.value = search.value = '';
    update();
  });
  $('previousTransactions').addEventListener('click', () => { page--; render(); });
  $('nextTransactions').addEventListener('click', () => { page++; render(); });

  window.addEventListener('pagehide', clear);
  window.addEventListener('pageshow', event => { if (event.persisted && active) void load(); });
  window.addEventListener('portal-before-logout', clear);
  window.addEventListener('portal-login-changed', () => { if (active) void load(); });
  window.addEventListener('storage', event => {
    if (event.key === LOGOUT_KEY || event.key === null) {
      clear();
      if (active) status('已登出，請回營運中心登入。', true);
    } else if ([LOGIN_KEY, EMPLOYEE_KEY, DEVICE_KEY, SESSION_KEY].includes(event.key) && active) {
      void load();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) clear();
    else if (active) void load();
  });
  return {setActive, load};
}
