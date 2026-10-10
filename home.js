(function startHome(scope) {
  'use strict';

  const Model = scope.HomeReminderModel;
  const DAILY_API = 'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
  const PATROL_API = 'https://script.google.com/macros/s/AKfycbxqBtW2yQw_u4qqJ9Knz6CK34hAiunaa6lIQu4pMa8Ff2voJZCWKEh8MXTJ6qAoGTax/exec';
  const EMPLOYEE_KEY = 'north12b_private_dashboard_employee_id';
  const DEVICE_KEY = 'north12b_private_dashboard_device_id';
  const SESSION_KEY = 'bei12b_patrol_session_token_v2';
  const $ = id => document.getElementById(id);
  const reducedMotion = scope.matchMedia('(prefers-reduced-motion: reduce)');
  let context;
  let feeds = { sales: [], patrol: [] };
  let items = [];
  let index = 0;
  let generation = 0;
  let rotationTimer;
  let freshnessTimer;
  let patrolExpiryTimer;
  let accessNoticeTimer;
  let patrolExpiresAt = 0;
  let salesVerified = false;
  let passwordVerified = false;
  let patrolVerified = false;
  let rolloverTimer;
  let userPaused = reducedMotion.matches;
  let hovered = false;
  let focused = false;
  let controllers = new Set();

  function icons() { if (scope.lucide) scope.lucide.createIcons(); }
  function storage(area, key) {
    try { return scope[area].getItem(key) || ''; } catch { return ''; }
  }
  function credentials() {
    // Read only identity already stored by an existing entrance. The server still
    // verifies the approved device; coordinated logout clears all three keys.
    return { employeeId: storage('sessionStorage', EMPLOYEE_KEY) || storage('localStorage', EMPLOYEE_KEY) || storage('localStorage', 'bei12b_kpi_emp'), deviceId: storage('localStorage', DEVICE_KEY) };
  }
  function updateAccessNotice(message) {
    const storedIdentity = credentials().employeeId || storage('localStorage', EMPLOYEE_KEY) || storage('localStorage', 'bei12b_kpi_emp');
    $('portal-logout').hidden = !storedIdentity && !storage('sessionStorage', SESSION_KEY) && !scope.DashboardB?.active();
    const states = [];
    if (passwordVerified) states.push('同仁專區登入已驗證');
    if (salesVerified) states.push('業績登入已驗證');
    if (patrolVerified) states.push('督導登入已驗證');
    $('portal-access-status').textContent = message || states.join('；') || '目前頁面尚未驗證登入';
    const remaining = patrolExpiresAt - Date.now();
    const minutes = Math.max(0, Math.ceil(remaining / 60000));
    const duration = minutes >= 60 ? `${Math.floor(minutes / 60)} 小時${minutes % 60 ? ` ${minutes % 60} 分鐘` : ''}` : `${minutes} 分鐘`;
    $('portal-expiry-notice').hidden = !patrolVerified;
    if (patrolVerified) {
      const deadline = new Date(patrolExpiresAt).toLocaleTimeString('zh-TW', { timeZone:'Asia/Taipei', hour:'2-digit', minute:'2-digit' });
      $('portal-expiry-notice').textContent = remaining > 0
        ? `督導登入於 ${deadline}（臺北時間）到期，約剩 ${duration}。操作與重新整理不會延長。${remaining <= 300000 ? '請先完成保存並保留原檔，繼續使用需重新驗證。' : ''}`
        : '督導登入已到期，請至原工作頁重新驗證。';
    }
  }
  async function logoutPortal() { await scope.PortalLogout.request(); }
  function sameCredentials(value) {
    const current = credentials();
    return value.employeeId === current.employeeId && value.deviceId === current.deviceId;
  }
  function abortReads() {
    controllers.forEach(controller => controller.abort());
    controllers.clear();
  }
  function pending(kind, text, status = 'pending') {
    return Model.pendingItems(context, text).filter(item => item.kind === kind).map(item => ({
      ...item, status, title: ['locked', 'loading'].includes(status) ? item.title.replace(/待更新$/, '提醒') : item.title
    }));
  }
  function render(manual = false) {
    const previousId = items[index] && items[index].id;
    const verified = [...(salesVerified ? feeds.sales : []), ...(patrolVerified ? feeds.patrol : [])];
    items = verified.length ? verified : [...feeds.sales, ...feeds.patrol];
    const previousIndex = items.findIndex(item => item.id === previousId);
    if (previousIndex >= 0) index = previousIndex;
    if (index >= items.length) index = 0;
    const item = items[index];
    if (!item) return;
    $('reminder-display').setAttribute('aria-live', manual ? 'polite' : 'off');
    $('reminder-status').textContent = item.status === 'loading' ? '讀取中' : item.status === 'locked' ? '待驗證' : item.status === 'ok' ? '已確認' : ['attention', 'warning'].includes(item.status) ? '待追蹤' : '待更新';
    $('reminder-status').dataset.status = item.status;
    $('reminder-period').textContent = item.period;
    $('reminder-title').textContent = item.title;
    $('reminder-text').textContent = item.text;
    $('reminder-link').setAttribute('href', item.href);
    $('reminder-count').textContent = `${index + 1} / ${items.length}`;
    $('reminder-prev').disabled = items.length < 2;
    $('reminder-next').disabled = items.length < 2;
    scheduleRotation();
  }
  function showNext(delta) {
    if (!items.length) return;
    index = (index + delta + items.length) % items.length;
    render(true);
  }
  function scheduleRotation() {
    clearTimeout(rotationTimer);
    if (userPaused || hovered || focused || document.hidden || items.length < 2) return;
    rotationTimer = scope.setTimeout(() => {
      index = (index + 1) % items.length;
      render();
    }, 5000);
  }
  function updatePauseButton() {
    $('reminder-pause').setAttribute('aria-label', userPaused ? '開始自動輪播' : '暫停自動輪播');
    $('reminder-pause').setAttribute('aria-pressed', String(userPaused));
    $('reminder-pause').innerHTML = `<i data-lucide="${userPaused ? 'play' : 'pause'}" aria-hidden="true"></i>`;
    icons();
    scheduleRotation();
  }

  async function post(url, payload) {
    // Existing verification and reads only; no registration or report writes.
    const allowed = url === PATROL_API ? ['ptauth', 'ptdashboard'] : ['private_access', 'read'];
    if (!allowed.includes(payload.action)) throw new Error('Unsupported reminder read');
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = scope.setTimeout(() => controller.abort(), 20000);
    try {
      const response = await scope.fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload), cache: 'no-store', credentials: 'omit', signal: controller.signal
      });
      if (!response.ok) throw new Error('Reminder service unavailable');
      const body = await response.json();
      if (!body || body.status !== 'ok') {
        const error = new Error('Reminder access or read unavailable');
        error.denied = Boolean(body && (body.message === 'unauthorized' || /^AUTH_/.test(body.reason || body.auth?.reason || '') || body.status === 'denied' || /尚未核准|未通過|unauthorized/i.test(body.message || '')));
        throw error;
      }
      return body;
    } finally {
      clearTimeout(timeout);
      controllers.delete(controller);
    }
  }

  async function loadSales(requestId) {
    const credential = credentials();
    const current = () => requestId === generation && !document.hidden && sameCredentials(credential)
      && Model.dateContext(new Date()).today === context.today;
    if (!credential.employeeId || !credential.deviceId) {
      feeds.sales = pending('sales', passwordVerified?'同仁專區已登入，請由下方入口查看 KPI、台獎與個績；此提醒尚未讀取。':'請在上方登入後開啟同仁專區。原裝置核准用戶可在 KPI 戰情驗證後更新提醒。', passwordVerified?'pending':'locked');
      render(); return;
    }
    feeds.sales = pending('sales', '正在驗證原有員編與核准裝置', 'loading'); render();
    try {
      // The legacy daily read action is not server-authenticated. Preserve the
      // existing app's Approved Device gate and never invoke it before approval.
      await post(DAILY_API, { action: 'private_access', ...credential });
      if (!current()) return;
      salesVerified = true; updateAccessNotice();
      const response = await post(DAILY_API, { action: 'read', date: context.yesterday, seg: 21, ...credential });
      if (!current()) return;
      feeds.sales = Model.fromSales(response, context);
    } catch (error) {
      if (!current()) return;
      feeds.sales = salesVerified ? pending('sales', '已驗證業績登入；昨日資料讀取未完成，請稍後更新，缺值不列為零業績')
        : error.denied ? pending('sales', '員編或裝置驗證未通過，請至 KPI 戰情確認', 'locked')
        : pending('sales', '登入狀態暫時無法確認，請稍後更新；尚未讀取私有業績');
    }
    render();
  }

  async function loadPatrol(requestId) {
    const token = storage('sessionStorage', SESSION_KEY);
    let sessionLive = true;
    const current = () => sessionLive && requestId === generation && !document.hidden && storage('sessionStorage', SESSION_KEY) === token
      && Model.dateContext(new Date()).today === context.today;
    if (!token) {
      feeds.patrol = pending('patrol', '請先在 Liam 情報站完成督導驗證，再返回更新提醒', 'locked');
      render(); return;
    }
    feeds.patrol = pending('patrol', '正在驗證既有督導短效連線', 'loading'); render();
    try {
      const auth = await post(PATROL_API, { action: 'ptauth', token });
      if (!current()) return;
      // Restore must return the same validated session; never persist a new
      // token from this public portal or use an unverified stored token.
      if (!auth.token || auth.token !== token) throw new Error('Session changed');
      const expiresAt = Number(auth.expiresAt) > 0 ? Number(auth.expiresAt) * 1000
        : Number(auth.expiresIn) > 0 ? Date.now() + Number(auth.expiresIn) * 1000 : 0;
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new Error('Session expiry unavailable');
      patrolExpiresAt = expiresAt; patrolVerified = true; updateAccessNotice();
      clearInterval(accessNoticeTimer);
      accessNoticeTimer = scope.setInterval(updateAccessNotice, 15000);
      clearTimeout(patrolExpiryTimer);
      patrolExpiryTimer = scope.setTimeout(() => {
        sessionLive = false;
        if (requestId !== generation) return;
        patrolVerified = false; patrolExpiresAt = 0; clearInterval(accessNoticeTimer);
        updateAccessNotice('督導登入已到期；業績登入依原系統驗證。');
        feeds.patrol = pending('patrol', '督導連線已到期，請至 Liam 情報站重新驗證', 'locked');
        render();
      }, Math.max(0, expiresAt - Date.now() - 250));
      const response = await post(PATROL_API, { action: 'ptdashboard', token, month: context.month });
      if (!current()) return;
      feeds.patrol = Model.fromPatrol(response, context);
    } catch (error) {
      if (!current()) return;
      feeds.patrol = patrolVerified ? pending('patrol', '已驗證督導登入；巡店資料讀取未完成，請稍後更新')
        : error.denied ? pending('patrol', '督導連線未通過驗證，請至 Liam 情報站重新驗證', 'locked')
        : pending('patrol', '督導登入狀態暫時無法確認，請稍後更新；尚未讀取巡店資料');
    }
    render();
  }

  function clearPrivateView(text = '返回頁面後重新驗證，不保留先前門市資料') {
    if (scope.PortalLogout?.isLocked()) { generation += 1; abortReads(); return; }
    generation += 1;
    abortReads();
    clearTimeout(freshnessTimer);
    clearTimeout(patrolExpiryTimer);
    clearInterval(accessNoticeTimer);
    patrolExpiresAt = 0; salesVerified = false; patrolVerified = false;
    updateAccessNotice();
    clearTimeout(rolloverTimer);
    clearTimeout(rotationTimer);
    if (!Model) return;
    context = Model.dateContext(new Date());
    feeds = { sales: pending('sales', text), patrol: pending('patrol', text) };
    render();
  }
  async function refresh() {
    if (!Model || document.hidden || scope.PortalLogout?.isLocked()) return;
    clearPrivateView('正在確認最新日期與權限');
    const requestId = generation;
    const nextMidnight = new Date(`${context.today}T00:00:00+08:00`).getTime() + 86400000;
    rolloverTimer = scope.setTimeout(refresh, Math.max(0, nextMidnight - Date.now()));
    $('today').textContent = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
    $('reminder-refresh').disabled = true;
    await Promise.allSettled([loadSales(requestId), loadPatrol(requestId)]);
    if (requestId !== generation || scope.PortalLogout?.isLocked()) return;
    $('reminder-refresh').disabled = false;
    // Bound in-memory access and freshness; verification runs again on return,
    // explicit refresh, credential change and every minute while visible.
    freshnessTimer = scope.setTimeout(refresh, 60000);
  }

  function setupSearch() {
    const input = $('tool-search');
    const cards = [...document.querySelectorAll('a.card')];
    input.addEventListener('input', () => {
      const query = input.value.trim().toLocaleLowerCase();
      let shown = 0;
      cards.forEach(card => {
        const matches = !query || card.dataset.search.toLocaleLowerCase().includes(query);
        card.hidden = !matches;
        if (matches) shown += 1;
      });
      document.querySelectorAll('[data-tool-group]').forEach(group => {
        group.hidden = ![...group.querySelectorAll('a.card')].some(card => !card.hidden);
      });
      const result = $('search-result');
      result.hidden = !query;
      result.textContent = shown ? `找到 ${shown} 個工具` : '沒有符合的工具，請換個關鍵字或清除搜尋';
    });
  }
  function setupNavigation() {
    const links = [...document.querySelectorAll('.section-nav a')];
    function active(id) {
      links.forEach(link => {
        const selected = link.getAttribute('href') === `#${id}`;
        link.classList.toggle('active', selected);
        if (selected) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    }
    links.forEach(link => link.addEventListener('click', () => active(link.hash.slice(1))));
    scope.addEventListener('scroll', () => {
      const atBottom = scope.scrollY > 0 && scope.innerHeight + scope.scrollY >= document.documentElement.scrollHeight - 4;
      active(atBottom || $('zone-supervisor').getBoundingClientRect().top < 180 ? 'zone-supervisor' : 'zone-staff');
    }, { passive: true });
  }

  icons(); setupSearch(); setupNavigation();
  if (!Model) return;
  $('reminder-prev').addEventListener('click', () => showNext(-1));
  $('reminder-next').addEventListener('click', () => showNext(1));
  $('reminder-pause').addEventListener('click', () => { userPaused = !userPaused; updatePauseButton(); });
  $('reminder-refresh').addEventListener('click', refresh);
  $('portal-logout').addEventListener('click', logoutPortal);
  const banner = document.querySelector('.reminder');
  banner.addEventListener('mouseenter', () => { hovered = true; scheduleRotation(); });
  banner.addEventListener('mouseleave', () => { hovered = false; scheduleRotation(); });
  // Replacing a pause icon under the pointer can omit mouseleave in Chromium.
  // Reconcile actual hover on movement so rotation resumes after leaving.
  document.addEventListener('pointermove', () => {
    const current = banner.matches(':hover');
    if (hovered !== current) { hovered = current; scheduleRotation(); }
  }, {passive:true});
  banner.addEventListener('focusin', () => { focused = true; scheduleRotation(); });
  banner.addEventListener('focusout', event => { focused = banner.contains(event.relatedTarget); scheduleRotation(); });
  reducedMotion.addEventListener('change', () => { userPaused = reducedMotion.matches; updatePauseButton(); });
  scope.addEventListener('portal-before-logout', () => { generation += 1; abortReads(); clearTimeout(rotationTimer); clearTimeout(freshnessTimer); clearTimeout(patrolExpiryTimer); clearInterval(accessNoticeTimer); clearTimeout(rolloverTimer); });
  scope.addEventListener('portal-login-changed', refresh);
  scope.addEventListener('storage', event => {
    if (!event.key || [EMPLOYEE_KEY, DEVICE_KEY, SESSION_KEY, 'bei12b_kpi_emp'].includes(event.key)) { clearPrivateView(); refresh(); }
  });
  scope.addEventListener('pagehide', () => clearPrivateView());
  scope.addEventListener('pageshow', event => { if (event.persisted) refresh(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearPrivateView(); else refresh(); });
  scope.DashboardBHost={
    sessionOnly:true,mountSelector:'#home-login',navigationSelector:'#zone-staff a, .quick-card',
    clear(){passwordVerified=false;updateAccessNotice();},
    accept(){passwordVerified=true;updateAccessNotice();if(!salesVerified){feeds.sales=pending('sales','同仁專區已登入，請由下方入口查看 KPI、台獎與個績；此提醒尚未讀取。');render();}},
    navigate(module){
      const targets={kpi:'kpi-battle.html',awards:'awards-battle.html',personal:'kpi.html',return:'#zone-staff'};
      scope.location.href=targets[module]||'#zone-staff';
    }
  };
  scope.DashboardB?.configure(scope.DashboardBHost);
  updatePauseButton();
  refresh();
})(window);
