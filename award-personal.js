(function attachAwardPersonal(scope) {
  'use strict';

  const EMPLOYEE_KEY = 'north12b_private_dashboard_employee_id';
  const DEVICE_KEY = 'north12b_private_dashboard_device_id';
  const DEFAULT_PRIVATE_API = 'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
  const STORES = ['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','台北三創','六張犁'];
  const STORE_ALIASES = new Map([['三創','台北三創']]);
  const REQUEST_TIMEOUT_MS = 20000;

  let active = false;
  let loading = false;
  let cached = null;
  let cachedCredential = '';
  let storeFilter = 'all';
  let sortMode = 'amount-desc';
  let renderGuard = false;

  function dom(selector) { return document.querySelector(selector); }
  function all(selector) { return [...document.querySelectorAll(selector)]; }
  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[char]);
  }
  function numberOrNull(value) {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  function normalizeStore(value) {
    const clean = String(value || '')
      .replace(/^台灣大哥大數位生活/, '')
      .replace(/^台北/, '')
      .replace(/\s+/g, '')
      .trim();
    return STORE_ALIASES.get(clean) || (clean === '三創' ? '台北三創' : clean);
  }
  function money(value) {
    return value == null ? '尚未同步' : `$${Math.round(Number(value)).toLocaleString('zh-TW')}`;
  }
  function endpointAllowed(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:'
        && url.hostname === 'script.google.com'
        && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)
        && !url.search
        && !url.hash;
    } catch (_) {
      return false;
    }
  }
  function currentCredential() {
    const employeeId = String(scope.localStorage.getItem(EMPLOYEE_KEY) || '').trim();
    const deviceId = String(scope.localStorage.getItem(DEVICE_KEY) || '').trim();
    return { employeeId, deviceId, key:`${employeeId}|${deviceId}` };
  }
  function clearCache() {
    cached = null;
    cachedCredential = '';
  }

  function personalAwardRows(snapshot) {
    const kpi = snapshot && snapshot.kpiBattle || {};
    const awards = snapshot && snapshot.awardsBattle || {};
    const kpiDate = String(kpi.report_date || '');
    const awardDate = String(awards.report_date || '');
    if (!kpiDate || !awardDate || kpiDate !== awardDate) {
      return { rows:[], reportDate:awardDate || kpiDate, aligned:false, note:awardDate && kpiDate ? `台獎日期與 KPI 日期不一致（台獎 ${awardDate}／KPI ${kpiDate}）` : '正式個人台獎尚未提供可對齊的資料日期' };
    }
    const rows = (Array.isArray(kpi.personal) ? kpi.personal : []).map(row => ({
      name:String(row && row.name || ''),
      store:normalizeStore(row && row.store),
      role:String(row && (row.category || row.role) || ''),
      amount:numberOrNull(row && row.phone_award_actual),
      projected:numberOrNull(row && row.phone_award_projected),
      rank:numberOrNull(row && row.phone_award_rank),
      eligible:String(row && row.phone_award_eligible || '').toUpperCase()
    })).filter(row => row.name && row.store);
    return { rows, reportDate:awardDate, aligned:true, note:'' };
  }

  function compareNullableAmount(a, b, direction) {
    const av = a.amount;
    const bv = b.amount;
    if (av == null && bv == null) return tieBreak(a,b);
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av !== bv) return direction === 'asc' ? av - bv : bv - av;
    return tieBreak(a,b);
  }
  function tieBreak(a,b) {
    if (a.rank != null && b.rank != null && a.rank !== b.rank) return a.rank - b.rank;
    if (a.rank != null && b.rank == null) return -1;
    if (a.rank == null && b.rank != null) return 1;
    return a.name.localeCompare(b.name,'zh-Hant');
  }
  function sortedRows(rows) {
    const filtered = (Array.isArray(rows) ? rows : []).filter(row => storeFilter === 'all' || row.store === storeFilter);
    const leaderboardRanks = new Map(filtered.slice().sort((a,b) => compareNullableAmount(a,b,'desc')).map((row,index) => [row,index + 1]));
    return filtered.slice().sort((a,b) => {
      if (sortMode === 'amount-asc') return compareNullableAmount(a,b,'asc');
      if (sortMode === 'name') return a.name.localeCompare(b.name,'zh-Hant') || tieBreak(a,b);
      return compareNullableAmount(a,b,'desc');
    }).map(row => ({ ...row, leaderboardRank:leaderboardRanks.get(row) }));
  }

  async function privateEndpoint() {
    try {
      const response = await fetch(`./app-runtime-config.json?ts=${Date.now()}`, { method:'GET', cache:'no-store', credentials:'omit' });
      if (!response.ok) throw new Error(`runtime config HTTP ${response.status}`);
      const config = await response.json();
      if (endpointAllowed(config && config.privateApi)) return String(config.privateApi);
    } catch (_) {}
    return DEFAULT_PRIVATE_API;
  }

  async function loadSnapshot() {
    const credential = currentCredential();
    if (!credential.employeeId || !credential.deviceId) throw new Error('請先從右上角解鎖正式資料。');
    if (cached && cachedCredential === credential.key) return cached;
    if (loading) return null;
    loading = true;
    const controller = new AbortController();
    const timer = scope.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const endpoint = await privateEndpoint();
      const response = await fetch(endpoint, {
        method:'POST', headers:{ 'Content-Type':'text/plain;charset=utf-8' },
        body:JSON.stringify({ action:'private_access', employeeId:credential.employeeId, deviceId:credential.deviceId }),
        cache:'no-store', credentials:'omit', signal:controller.signal
      });
      const body = await response.json();
      if (!response.ok || !body || body.status !== 'ok') throw new Error(body && body.message || `正式資料讀取失敗（HTTP ${response.status}）`);
      const adapted = personalAwardRows(body.snapshot || {});
      if (!adapted.aligned) throw new Error(adapted.note);
      cached = adapted;
      cachedCredential = credential.key;
      return cached;
    } catch (error) {
      if (error && error.name === 'AbortError') throw new Error('正式個人台獎讀取逾時，請稍後重試。');
      throw error;
    } finally {
      scope.clearTimeout(timer);
      loading = false;
    }
  }

  function setScopeVisual() {
    const control = dom('.scope-control');
    const button = dom('[data-award-person-scope]');
    const awardActive = dom('[data-battle-kind="award"]')?.classList.contains('active');
    if (!control || !button) return;
    button.hidden = !awardActive;
    control.classList.toggle('award-person-enabled',Boolean(awardActive));
    if (active && awardActive) {
      all('.scope-control button').forEach(item => item.classList.toggle('active',item === button));
      const picker = dom('#battleStorePicker');
      if (picker) picker.hidden = true;
    }
  }

  function controls() {
    return `<section class="award-person-controls" aria-label="個人台獎篩選">
      <label><span>店點</span><select id="awardPersonStoreSelect"><option value="all" ${storeFilter==='all'?'selected':''}>全部店點</option>${STORES.map(name=>`<option value="${escapeHtml(name)}" ${storeFilter===name?'selected':''}>${escapeHtml(name)}</option>`).join('')}</select></label>
      <label><span>排序</span><select id="awardPersonSortSelect"><option value="amount-desc" ${sortMode==='amount-desc'?'selected':''}>台獎高 → 低</option><option value="amount-asc" ${sortMode==='amount-asc'?'selected':''}>台獎低 → 高</option><option value="name" ${sortMode==='name'?'selected':''}>姓名</option></select></label>
    </section>`;
  }

  function personCard(row) {
    const visibleRank = row.leaderboardRank;
    const medal = visibleRank === 1 ? '🥇' : visibleRank === 2 ? '🥈' : visibleRank === 3 ? '🥉' : String(visibleRank);
    const eligibility = row.eligible === 'Y' ? '<span class="award-person-status yes">領獎</span>' : row.eligible === 'N' ? '<span class="award-person-status no">未領獎</span>' : '<span class="award-person-status pending">尚未同步</span>';
    const syncClass = row.amount == null ? ' unsynced' : '';
    return `<article class="award-person-row${syncClass}">
      <div class="award-person-order" aria-label="台獎排行榜第 ${visibleRank} 名">${medal}</div>
      <div class="award-person-main"><div class="award-person-name"><strong>${escapeHtml(row.name)}</strong>${eligibility}</div><small>${escapeHtml(row.store)} · ${row.role?escapeHtml(row.role):'職稱／類別尚未同步'}</small></div>
      <div class="award-person-money"><strong>${escapeHtml(money(row.amount))}</strong><small>推估 ${escapeHtml(money(row.projected))} · 正式排名 ${row.rank==null?'尚未同步':`#${escapeHtml(row.rank)}`}</small></div>
    </article>`;
  }

  function renderLoaded(data) {
    if (!active) return;
    const content = dom('#battleContent');
    if (!content) return;
    const credential = currentCredential();
    if (!credential.employeeId || !credential.deviceId || cachedCredential !== credential.key) {
      clearCache();
      renderMessage('請先從右上角解鎖正式資料。','locked');
      return;
    }
    const rows = sortedRows(data.rows);
    const label = storeFilter === 'all' ? '全部店點' : storeFilter;
    renderGuard = true;
    content.innerHTML = `<div data-award-personal-root>
      ${controls()}
      <section class="panel award-person-panel"><div class="panel-head"><div><h2>個人台獎</h2><small>${escapeHtml(label)} · ${rows.length} 人</small></div><span>${escapeHtml(data.reportDate || '—')}</span></div>
        <div class="award-person-list">${rows.length ? rows.map(personCard).join('') : '<div class="empty-state">目前篩選條件沒有個人台獎資料。</div>'}</div>
      </section>
      <p class="award-person-note">金額、推估、正式排名與領獎狀態皆沿用正式私有快照；App 只做篩選與排序，不重算台獎。</p>
      <a class="source-button" href="index.html">完整台獎入口 <i data-lucide="external-link"></i></a>
    </div>`;
    renderGuard = false;
    if (scope.lucide && typeof scope.lucide.createIcons === 'function') scope.lucide.createIcons({ attrs:{ 'aria-hidden':'true' } });
  }

  function renderMessage(message, state) {
    const content = dom('#battleContent');
    if (!content || !active) return;
    renderGuard = true;
    content.innerHTML = `<div data-award-personal-root class="award-person-state ${escapeHtml(state || '')}"><div class="empty-state">${escapeHtml(message)}</div></div>`;
    renderGuard = false;
  }

  async function renderPersonalAwards(force = false) {
    if (!active) return;
    setScopeVisual();
    const credential = currentCredential();
    if (!credential.employeeId || !credential.deviceId) {
      clearCache();
      renderMessage('請先從右上角解鎖正式資料。','locked');
      return;
    }
    if (force || cachedCredential !== credential.key) clearCache();
    if (cached) {
      renderLoaded(cached);
      return;
    }
    renderMessage('讀取正式個人台獎中…','loading');
    try {
      const data = await loadSnapshot();
      if (data) renderLoaded(data);
    } catch (error) {
      renderMessage(String(error && error.message || error || '正式個人台獎讀取失敗。'),'error');
    }
  }

  function activatePersonal() {
    const awardTab = dom('[data-battle-kind="award"]');
    if (!awardTab || !awardTab.classList.contains('active')) return;
    active = true;
    setScopeVisual();
    renderPersonalAwards();
  }

  function deactivatePersonal() {
    active = false;
    setScopeVisual();
  }

  function init() {
    const scopeControl = dom('.scope-control');
    const battleContent = dom('#battleContent');
    if (!scopeControl || !battleContent || dom('[data-award-person-scope]')) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.awardPersonScope = '1';
    button.textContent = '個人';
    button.hidden = true;
    scopeControl.appendChild(button);
    setScopeVisual();

    button.addEventListener('click', event => {
      event.preventDefault();
      activatePersonal();
    });

    document.addEventListener('click', event => {
      const kind = event.target.closest && event.target.closest('[data-battle-kind]');
      if (kind) {
        const nextKind = kind.dataset.battleKind;
        if (nextKind !== 'award') deactivatePersonal();
        scope.setTimeout(setScopeVisual,0);
      }
      const baseScope = event.target.closest && event.target.closest('[data-battle-scope]');
      if (baseScope) deactivatePersonal();
      if (event.target.closest && event.target.closest('[data-open-awards]')) deactivatePersonal();
      if (event.target.closest && event.target.closest('#privateLogout')) {
        clearCache();
        if (active) scope.setTimeout(() => renderPersonalAwards(true),0);
      }
      if (event.target.closest && event.target.closest('[data-refresh]')) {
        clearCache();
        if (active) scope.setTimeout(() => renderPersonalAwards(true),80);
      }
    });

    battleContent.addEventListener('change', event => {
      if (!active) return;
      if (event.target.id === 'awardPersonStoreSelect') {
        storeFilter = event.target.value;
        renderLoaded(cached);
      }
      if (event.target.id === 'awardPersonSortSelect') {
        sortMode = event.target.value;
        renderLoaded(cached);
      }
    });

    const observer = new MutationObserver(() => {
      if (renderGuard || !active) return;
      const awardTab = dom('[data-battle-kind="award"]');
      if (!awardTab || !awardTab.classList.contains('active')) {
        deactivatePersonal();
        return;
      }
      if (!battleContent.querySelector('[data-award-personal-root]')) scope.setTimeout(() => renderPersonalAwards(),0);
    });
    observer.observe(battleContent,{ childList:true });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',() => scope.requestAnimationFrame(init),{ once:true });
    else scope.requestAnimationFrame(init);
  }

  const api = { personalAwardRows, normalizeStore, numberOrNull };
  scope.LiamAwardPersonal = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
