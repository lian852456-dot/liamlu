(function (scope) {
  'use strict';
  const EVENT_KEY = 'north12b_portal_logout_event_v1';
  const LOGIN_EVENT_KEY = 'north12b_portal_login_event_v1';
  const SEEN_KEY = 'north12b_portal_logout_seen_v1';
  const NOTE_KEY = 'north12b_portal_logout_note_v1';
  const CHANNEL = 'north12b-portal-logout-v1';
  const SCOPE_NOTE = '同步登出同一瀏覽器內本網站的營運中心頁籤；手機 App 另行登出。';
  const EMPLOYEE_KEY = 'north12b_private_dashboard_employee_id';
  const PT_KEY = 'bei12b_patrol_session_token_v2';
  const UAT_KEY = 'bei12b_patrol_uat_session_token_v1';
  const AUDIT_KEY = 'bei12b_pt_session_token';
  const PATROL_API = 'https://script.google.com/macros/s/AKfycbxqBtW2yQw_u4qqJ9Knz6CK34hAiunaa6lIQu4pMa8Ff2voJZCWKEh8MXTJ6qAoGTax/exec';
  const AUDIT_API = 'https://script.google.com/macros/s/AKfycbznzoWOzzPJLEh8PCwTLw8UfWEyiCXwawd0T49JXpK4MP70vTdrrfTMN1G2Grghd-Mv/exec';
  const LOGOUT_BUTTONS = '[data-portal-logout], #portal-logout, #departmentLogout, #monthlyLogout, #store-rules-logout, #privateLogoutBtn, #privateLogout, #patrolLogout, #supervisorLogoutButton, #logoutButton, #signOutButton, a[onclick="kpiLogout()"]';
  const nativeFetch = scope.fetch.bind(scope);
  let locked = false;
  let activeWrites = 0;
  let getWorkState = () => ({});
  let showBusy = () => scope.alert('正在保存資料，請等結果並讀回確認後再登出，避免重複提交。');
  let channel;
  let control;
  let logoutPromise;
  const auditRevocations = new Map();

  function read(area, key) { try { return scope[area].getItem(key) || ''; } catch { return ''; } }
  function write(area, key, value) { try { scope[area].setItem(key, value); return true; } catch { return false; } }
  function remove(area, key) { try { scope[area].removeItem(key); } catch {} }
  function parse(text) { try { return JSON.parse(text); } catch { return null; } }
  function validEvent(value, type = 'logout') {
    return value && value.type === type && value.version === 1 && /^[a-f0-9-]{20,80}$/i.test(value.id || '')
      && Number.isFinite(value.at) && Object.keys(value).every(key => ['type','version','id','at'].includes(key));
  }
  function latestEvent() { const value = parse(read('localStorage', EVENT_KEY)); return validEvent(value) ? value : null; }
  let savedEpoch;
  try { savedEpoch = scope.sessionStorage.getItem(SEEN_KEY); } catch { savedEpoch = null; }
  let epoch = savedEpoch ?? '';
  const initial = latestEvent();
  function persistentLoginAfter(event) {
    const login = parse(read('localStorage',LOGIN_EVENT_KEY));
    return validEvent(login,'login') && login.at > event.at;
  }
  function hasSessionIdentity() {
    return [PT_KEY,UAT_KEY,AUDIT_KEY,EMPLOYEE_KEY].some(key => read('sessionStorage',key));
  }
  function hasPersistentIdentity() { return read('localStorage',EMPLOYEE_KEY) || read('localStorage','bei12b_kpi_emp'); }
  // An unseen historical logout invalidates old tab credentials. A new tab may
  // still restore a later explicit persistent login through the page's server gate.
  const missedLogout = initial && ((savedEpoch !== null && epoch !== initial.id)
    || (savedEpoch === null && (hasSessionIdentity() || (hasPersistentIdentity() && !persistentLoginAfter(initial)))));
  if (savedEpoch === null && !missedLogout) { epoch = initial?.id || ''; write('sessionStorage', SEEN_KEY, epoch); }
  function assertActive(expected = epoch) {
    if (locked || expected !== epoch) throw new DOMException('營運中心網頁已登出，請重新驗證。', 'AbortError');
  }

  // In-flight headers and body decoding both respect the logout boundary. Do not replay writes.
  scope.fetch = async function (...args) {
    const expected = epoch;
    assertActive(expected);
    let action = '';
    try { action = JSON.parse(args[1]?.body || '{}').action || ''; } catch {}
    const mutation = /(?:write|publish|restore|commit|upload)$/.test(action) && action !== 'ptlogout';
    if (mutation) activeWrites += 1;
    let finished = false;
    const finish = () => { if (!finished && mutation) { activeWrites -= 1; finished = true; } };
    try {
      const response = await nativeFetch(...args);
      assertActive(expected);
      for (const method of ['json','text','blob','arrayBuffer']) {
        const decode = response[method].bind(response);
        response[method] = async () => {
          try { assertActive(expected); const value = await decode(); assertActive(expected); return value; }
          finally { finish(); }
        };
      }
      if (!response.ok) finish();
      return response;
    } catch (error) { finish(); throw error; }
  };

  function clearIdentity(event,forcePersistent) {
    for (const key of [PT_KEY, UAT_KEY, AUDIT_KEY, EMPLOYEE_KEY, 'bei12b_half_checks']) remove('sessionStorage', key);
    // A delayed old-tab notification must not delete a newer shared login.
    // It still clears every old sessionStorage credential and its private cache.
    if (forcePersistent || !persistentLoginAfter(event)) {
      for (const key of [EMPLOYEE_KEY, 'bei12b_kpi_emp']) remove('localStorage', key);
    }
    // Only the existing protected summary cache is cleared. Draft files, prefs and device IDs remain.
    try {
      for (let i = scope.sessionStorage.length - 1; i >= 0; i -= 1) {
        const key = scope.sessionStorage.key(i);
        if (key?.startsWith('patrol-summary-safe-v1:')) remove('sessionStorage', key);
      }
    } catch {}
  }
  function note(message) { write('sessionStorage', NOTE_KEY, message); }
  function lockScreen() {
    if (!document.body) return;
    const main = document.createElement('main');
    main.id = 'portal-logout-screen';
    main.style.cssText = 'max-width:700px;margin:10vh auto;padding:28px;font:16px/1.7 system-ui;color:#171b22;background:white;border:1px solid #e5e7eb;border-radius:16px';
    const heading = document.createElement('h1'); heading.textContent = '營運中心網頁已登出';
    const copy = document.createElement('p'); copy.id = 'portal-logout-result'; copy.setAttribute('role','status');
    copy.textContent = '本頁已鎖定並清除畫面。正在結束督導連線，完成後會重新開啟登入頁。';
    const help = document.createElement('p'); help.textContent = '未保存的預覽需保留原檔重新載入。若剛才正在保存，重新登入後請先讀回確認結果，勿重複提交。手機 App 請另行登出。';
    main.append(heading,copy,help);
    document.body.replaceChildren(main);
  }
  function allowedAuditOrigin(value) {
    try { const url = new URL(value); return url.protocol === 'https:' && !url.port &&
      (['script.google.com','script.googleusercontent.com'].includes(url.hostname) || url.hostname.endsWith('-script.googleusercontent.com')); } catch { return false; }
  }
  function auditTransportSource(source, frame) {
    // HtmlService replies from a sandbox child of the form target. Only that
    // frame's descendant chain is accepted, alongside origin + request nonce.
    try {
      for (let depth = 0; source && depth < 12; depth += 1) {
        if (source === frame.contentWindow) return true;
        const parent = source.parent;
        if (!parent || parent === source || parent === scope) return false;
        source = parent;
      }
    } catch {}
    return false;
  }
  function revokeAudit(token) {
    // Preserve audit's existing POST form + iframe response transport.
    return new Promise(resolve => {
      const requestId = scope.crypto.randomUUID();
      const frame = document.createElement('iframe');
      const form = document.createElement('form');
      const field = document.createElement('textarea');
      const endpoint = new URL(AUDIT_API);
      endpoint.searchParams.set('transport','iframe');
      endpoint.searchParams.set('requestId',requestId);
      endpoint.searchParams.set('origin',scope.location.origin);
      const finish = value => {
        auditRevocations.delete(requestId); scope.clearTimeout(timer);
        frame.remove(); form.remove(); resolve(value);
      };
      const timer = scope.setTimeout(() => finish(false),12000);
      frame.name = 'portal_logout_' + requestId; frame.hidden = true; frame.title = '結束稽核督導連線';
      form.method = 'POST'; form.action = endpoint.href; form.target = frame.name;
      form.enctype = 'application/x-www-form-urlencoded'; form.hidden = true;
      field.name = 'payload'; field.value = JSON.stringify({action:'ptlogout',token});
      form.append(field); document.body.append(frame,form);
      auditRevocations.set(requestId,{frame,finish});
      try { form.submit(); form.remove(); } catch { finish(false); }
    });
  }
  async function revoke(url, token) {
    if (url === AUDIT_API) return revokeAudit(token);
    const controller = new AbortController();
    const timer = scope.setTimeout(() => controller.abort(), 12000);
    try {
      const response = await nativeFetch(url, {method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'ptlogout',token}),cache:'no-store',credentials:'omit',keepalive:true,signal:controller.signal});
      const result = await response.json();
      return response.ok && (result.status === 'ok' || result.reason === 'AUTH_SESSION_REVOKED' || result.auth?.reason === 'AUTH_SESSION_REVOKED');
    } catch { return false; }
    finally { scope.clearTimeout(timer); }
  }
  async function applyLogout(event, broadcast = false) {
    if (locked) return logoutPromise;
    const tokens = [[PATROL_API,read('sessionStorage',PT_KEY)],[PATROL_API,read('sessionStorage',UAT_KEY)],[AUDIT_API,read('sessionStorage',AUDIT_KEY)]].filter((entry,index,all) => entry[1] && all.findIndex(other => other[0] === entry[0] && other[1] === entry[1]) === index);
    locked = true; epoch = event.id;
    write('sessionStorage',SEEN_KEY,epoch);
    clearIdentity(event,broadcast);
    note('已同步登出同一瀏覽器內本網站的營運中心頁籤。裝置核准資格保留；手機 App 請另行登出。');
    scope.dispatchEvent(new Event('portal-before-logout'));
    lockScreen();
    if (broadcast) {
      // The event deliberately contains no employee, device, token, password or report data.
      const stored = write('localStorage',EVENT_KEY,JSON.stringify(event));
      let posted = false;
      try { if (channel) { channel.postMessage(event); posted = true; } } catch {}
      if (!stored && !posted) note('本頁已登出，但頁籤同步通知未確認，請關閉其他已開啟的營運中心頁籤。');
    }
    logoutPromise = (async () => {
      if (!document.body) await new Promise(resolve => document.addEventListener('DOMContentLoaded',resolve,{once:true}));
      const results = await Promise.all(tokens.map(([url,token]) => revoke(url,token)));
      if (results.some(value => !value)) note('本頁已登出並通知網站頁籤；督導連線撤銷未確認，請關閉其他已開啟的營運中心頁籤。');
      // A new document removes each page's private memory without changing its business module.
      scope.location.reload();
    })();
    return logoutPromise;
  }
  function accept(event) {
    if (!validEvent(event) || event.id === epoch || locked) return;
    void applyLogout(event);
  }
  function checkMissedLogout() { const event = latestEvent(); if (event && event.id !== epoch) accept(event); }
  function hasIdentity() {
    return hasSessionIdentity() || hasPersistentIdentity();
  }
  async function requestLogout() {
    if (locked) return logoutPromise;
    if (getWorkState().busy || activeWrites > 0) { showBusy(); return false; }
    if (!scope.confirm('登出會清除目前畫面與員編，並同步登出同一瀏覽器內、本網站的營運中心頁籤。未保存的預覽請先保留原檔；手機 App 需另行登出。確定登出嗎？')) return false;
    const event = {type:'logout',version:1,id:scope.crypto.randomUUID(),at:Date.now()};
    return applyLogout(event,true);
  }
  function ready() {
    if (locked) { lockScreen(); return; }
    const savedNote = read('sessionStorage',NOTE_KEY);
    const ownControls = document.getElementById('portal-logout') || document.getElementById('departmentLogout');
    if (!ownControls || savedNote) {
      control = document.createElement('aside'); control.id = 'portal-session-controls';
      control.setAttribute('aria-label','營運中心網頁登出');
      control.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:12px;padding:12px 20px;background:#fff;color:#171b22;border-bottom:1px solid #e5e7eb;font:14px/1.6 system-ui;position:relative;z-index:10';
      const copy = document.createElement('span'); copy.id = 'portal-session-note'; copy.setAttribute('role','status');
      copy.textContent = savedNote || SCOPE_NOTE;
      const button = document.createElement('button'); button.type = 'button'; button.dataset.portalLogout = ''; button.textContent = '登出';
      button.style.cssText = 'margin-left:auto;min-height:44px;padding:8px 16px;border:1px solid #e5e7eb;border-radius:8px;background:white;color:#bd4700;font:inherit;font-weight:700;cursor:pointer';
      control.append(copy,button); document.body.prepend(control);
      const update = () => { if (!locked) {
        const currentNote = read('sessionStorage',NOTE_KEY);
        copy.textContent = currentNote || SCOPE_NOTE;
        button.hidden = !hasIdentity() || Boolean(ownControls);
        const visible = Boolean((!ownControls && hasIdentity()) || currentNote);
        control.hidden = !visible; control.style.display = visible ? 'flex' : 'none';
      } };
      update(); scope.setInterval(update,1000);
    }
  }
  function notifyLogin() {
    assertActive(); remove('sessionStorage',NOTE_KEY);
    const event = {type:'login',version:1,id:scope.crypto.randomUUID(),at:Date.now()};
    write('localStorage',LOGIN_EVENT_KEY,JSON.stringify(event));
    try { channel?.postMessage(event); } catch {}
    scope.dispatchEvent(new Event('portal-login-changed'));
  }
  function acceptLogin(event) {
    if (!locked && validEvent(event,'login')) scope.dispatchEvent(new Event('portal-login-changed'));
  }
  scope.PortalLogout = Object.freeze({request:requestLogout,isLocked:() => locked,assertActive,notifyLogin,
    beginWrite() {
      assertActive(); activeWrites += 1; let done = false;
      return () => { if (!done) { done = true; activeWrites -= 1; } };
    },
    setWorkState(reader,onBusy) { getWorkState = reader; if (onBusy) showBusy = onBusy; }});
  document.addEventListener('click', event => {
    if (!event.target.closest?.(LOGOUT_BUTTONS)) return;
    event.preventDefault(); event.stopImmediatePropagation(); void requestLogout();
  },true);
  // Legacy iframe transports must not deliver private replies into a locked document.
  scope.addEventListener('message',event => {
    const message = event.data;
    const pending = auditRevocations.get(message?.requestId);
    if (pending && allowedAuditOrigin(event.origin)
        && auditTransportSource(event.source,pending.frame) && message.type === 'north12b-gas-response-v1') {
      const result = message.body;
      pending.finish(result?.status === 'ok' || result?.reason === 'AUTH_SESSION_REVOKED');
    }
    if (locked) event.stopImmediatePropagation();
  },true);
  scope.addEventListener('pagehide',event => { if (locked) event.stopImmediatePropagation(); },true);
  document.addEventListener('visibilitychange',event => { if (locked) event.stopImmediatePropagation(); },true);
  scope.addEventListener('beforeunload',event => { if (locked) event.stopImmediatePropagation(); },true);
  scope.addEventListener('storage',event => { if (event.key === EVENT_KEY) accept(parse(event.newValue));
    else if (event.key === LOGIN_EVENT_KEY) acceptLogin(parse(event.newValue)); });
  scope.addEventListener('pageshow',checkMissedLogout);
  document.addEventListener('visibilitychange',() => { if (!document.hidden) checkMissedLogout(); },true);
  try { channel = new scope.BroadcastChannel(CHANNEL); channel.onmessage = event => { accept(event.data); acceptLogin(event.data); }; } catch {}
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',ready,{once:true}); else ready();
  if (missedLogout) void applyLogout(initial);
})(window);
