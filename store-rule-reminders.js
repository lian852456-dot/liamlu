(function () {
  'use strict';
  const panel = document.getElementById('storePanel');
  const workspace = document.getElementById('workspace');
  const mount = document.getElementById('storeRulesMount');
  if (!panel || !workspace || !mount) return;
  const API = 'https://script.google.com/macros/s/AKfycbxqBtW2yQw_u4qqJ9Knz6CK34hAiunaa6lIQu4pMa8Ff2voJZCWKEh8MXTJ6qAoGTax/exec';
  const SESSION_KEY = 'bei12b_patrol_session_token_v2';
  const CONTRACT = 'store-rule-reminders-v1';
  const NOTICE = '規則提醒，尚未提供本期執行資料';
  let generation = 0;
  let controller = null;
  let expiryTimer = null;
  let refreshTimer = null;
  let loadedToken = '';
  let loading = false;
  let revoked = false;

  const section = document.createElement('section');
  section.className = 'store-rules';
  section.setAttribute('aria-labelledby', 'store-rules-title');
  section.innerHTML = '<details class="store-rules-disclosure"><summary class="store-rules-toggle"><h2 id="store-rules-title">門市規則提醒</h2><span class="store-rules-toggle-hint"><span class="store-rules-expand">展開查看</span><span class="store-rules-collapse">收合提醒</span></span></summary><div class="store-rules-content"><div class="store-rules-actions"><button id="store-rules-refresh" class="secondary-button" type="button">重新讀取提醒</button><button id="store-rules-logout" class="secondary-button" type="button">登出</button></div><p id="store-rules-status" class="store-rules-status" role="status" aria-live="polite">登入後讀取私有提醒。</p><details id="store-rules-context" class="store-rules-context" hidden><summary>來源版本與適用說明</summary><p id="store-rules-context-copy"></p></details><div id="store-rules-list" class="store-rules-list"></div></div></details>';
  mount.replaceChildren(section);
  const status = section.querySelector('#store-rules-status');
  const context = section.querySelector('#store-rules-context');
  const contextCopy = section.querySelector('#store-rules-context-copy');
  const list = section.querySelector('#store-rules-list');
  const refresh = section.querySelector('#store-rules-refresh');
  const active = () => !revoked && !workspace.hidden && !panel.hidden && document.visibilityState !== 'hidden';
  const token = () => sessionStorage.getItem(SESSION_KEY) || '';

  function clear(message) {
    generation += 1;
    controller?.abort();
    controller = null;
    clearTimeout(expiryTimer);
    clearTimeout(refreshTimer);
    loading = false;
    loadedToken = '';
    list.replaceChildren();
    contextCopy.textContent = '';
    context.open = false;
    context.hidden = true;
    status.textContent = message || '登入後讀取私有提醒。';
    refresh.disabled = false;
  }

  async function request(payload, signal) {
    const response = await fetch(API, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(payload), cache:'no-store', signal});
    if (!response.ok) throw new Error('提醒服務暫時無回應，請重新讀取。');
    const result = await response.json();
    if (result?.status !== 'ok') {
      const error = new Error('提醒服務未通過驗證，請重新登入。');
      error.auth = result?.status === 'unauthorized' || Boolean(result?.auth) || /^AUTH_/.test(result?.reason || result?.code || '');
      throw error;
    }
    return result;
  }

  function validate(result) {
    if (result.contract !== CONTRACT || !Number.isFinite(result.expiresAt) || result.expiresAt * 1000 <= Date.now()) throw new Error('提醒資料或登入期限不一致，請重新讀取。');
    if (!result.available) return null;
    const document = result.document;
    const text = (value, limit) => typeof value === 'string' && value.trim() && value.length <= limit;
    if (!document || document.contract !== CONTRACT || document.scope !== 'store-daily-reminders' || !text(document.context,1200) || !text(document.revision,80) || !Array.isArray(document.rules) || !document.rules.length || document.rules.length > 50) throw new Error('提醒資料不完整，請重新讀取。');
    const ids = new Set();
    for (const rule of document.rules) {
      if (!rule || !text(rule.id,60) || !/^[a-z0-9-]+$/.test(rule.id) || ids.has(rule.id) || !text(rule.category,40) || !text(rule.title,120) || !text(rule.instruction,1600) || !text(rule.frequency,160) || !text(rule.audience,160) || !Array.isArray(rule.exceptions) || rule.exceptions.length > 8 || rule.exceptions.some(item => !text(item,600)) || !Array.isArray(rule.sources) || !rule.sources.length || rule.sources.length > 6 || rule.sources.some(source => !text(source?.shortName,80) || !Array.isArray(source.pages) || !source.pages.length || source.pages.length > 10 || source.pages.some(page => !Number.isInteger(page) || page < 1 || page > 99))) throw new Error('提醒來源或適用說明不完整，請重新讀取。');
      if (Object.keys(rule).some(key => !['id','category','title','instruction','frequency','audience','exceptions','sources'].includes(key))) throw new Error('提醒資料含有不支援的欄位。');
      ids.add(rule.id);
    }
    return document;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }

  function render(data) {
    contextCopy.textContent = data.context;
    context.hidden = false;
    const cards = data.rules.map(rule => {
      const card = element('article','store-rule-card');
      card.append(element('span','store-rule-category',rule.category), element('h3','',rule.title), element('p','store-rule-instruction',rule.instruction));
      const meta = element('dl','store-rule-meta');
      for (const [label,value] of [['頻率',rule.frequency],['適用對象',rule.audience]]) meta.append(element('dt','',label),element('dd','',value));
      card.append(meta);
      if (rule.exceptions.length) {
        const notes = element('div','store-rule-exceptions');
        notes.append(element('strong','','適用說明與例外'));
        rule.exceptions.forEach(note => notes.append(element('p','',note)));
        card.append(notes);
      }
      card.append(element('p','store-rule-sources','來源：'+rule.sources.map(source => `${source.shortName}｜第 ${source.pages.join('、')} 頁`).join('；')),element('p','store-rule-notice',NOTICE));
      return card;
    });
    list.replaceChildren(...cards);
    status.textContent = `${data.rules.length} 則提醒｜${NOTICE}`;
  }

  async function load() {
    if (!active() || loading) return;
    const session = token();
    clear('正在驗證並讀取私有提醒…');
    if (!session) { status.textContent = '請先登入，再讀取規則提醒。'; return; }
    loading = true;
    refresh.disabled = true;
    controller = new AbortController();
    const current = generation;
    const signal = controller.signal;
    const timeout = setTimeout(() => controller?.abort(), 20000);
    try {
      const auth = await request({action:'ptauth',token:session},signal);
      if (auth.token !== session) throw new Error('登入狀態已變更，請重新登入。');
      const result = await request({action:'department_store_rules_read',token:session},signal);
      if (current !== generation || token() !== session || !active()) return;
      const data = validate(result);
      loadedToken = session;
      if (data) render(data); else status.textContent = '尚未提供私有規則提醒。';
      expiryTimer = setTimeout(() => clear('登入已到期，請重新登入後讀取提醒。'), Math.min(2147483647,result.expiresAt*1000-Date.now()));
      refreshTimer = setTimeout(load,60000);
    } catch (error) {
      if (current !== generation) return;
      clear(error.name === 'AbortError' ? '提醒服務逾時，請重新讀取。' : error.message);
      if (error.auth) {
        sessionStorage.removeItem(SESSION_KEY);
        window.dispatchEvent(new Event('department-session-cleared'));
      }
    } finally {
      clearTimeout(timeout);
      if (current === generation) { loading = false; refresh.disabled = false; controller = null; }
    }
  }

  function sync() {
    if (!active()) { clear('開啟店務後重新驗證並讀取提醒。'); return; }
    if (!loadedToken || loadedToken !== token()) load();
  }

  refresh.addEventListener('click',load);
  section.querySelector('#store-rules-logout').addEventListener('click', () => {
    const session = token();
    revoked = true;
    clear('已登出。');
    sessionStorage.removeItem(SESSION_KEY);
    // Each authenticated module clears its own state while preserving shared DOM anchors.
    workspace.hidden = true;
    window.dispatchEvent(new Event('department-session-cleared'));
    if (session) fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'ptlogout',token:session}),cache:'no-store',keepalive:true}).catch(() => {});
    location.reload();
  });
  const observer = new MutationObserver(sync);
  observer.observe(workspace,{attributes:true,attributeFilter:['hidden']});
  observer.observe(panel,{attributes:true,attributeFilter:['hidden']});
  document.addEventListener('visibilitychange',sync);
  window.addEventListener('pagehide',() => clear());
  window.addEventListener('pageshow',sync);
  window.addEventListener('storage',event => { if (event.key === SESSION_KEY) sync(); });
  sync();
})();
