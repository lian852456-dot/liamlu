(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CozyEmployeeCityLink = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const CITY_ORIGIN = 'https://immediate-temporary-cage-warriors.trycloudflare.com';
  const FORMAL_ORIGIN = 'https://lian852456-dot.github.io';
  const FORMAL_PATH = '/liamlu/city-employee-link.html';
  const AUDIENCE = 'north12b-city-formal-login';
  const HANDOFF_TYPE = 'city-employee-handoff/v1';
  const CHALLENGE_ID = /^[A-Za-z0-9_-]{16,160}$/;
  const NONCE_HASH = /^[a-f0-9]{64}$/;
  const HANDOFF_CODE = /^CH1_[a-f0-9]{64}$/;
  const EMPLOYEE_ID = /^[A-Za-z0-9]{5,12}$/;
  const MAX_CHALLENGE_TTL_MS = 120 * 1000;
  const CHALLENGE_FIELDS = new Set(['challengeId', 'nonceHash', 'audience', 'expiresAt', 'worldId']);

  const text = value => value == null ? '' : String(value);

  function ownKeysMatch(value, expected) {
    const keys = Object.keys(value || {});
    return keys.length === expected.size && keys.every(key => expected.has(key));
  }

  function validateChallenge(value, now = Date.now()) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !ownKeysMatch(value, CHALLENGE_FIELDS)) return null;
    if (typeof value.challengeId !== 'string' || !CHALLENGE_ID.test(value.challengeId)) return null;
    if (typeof value.nonceHash !== 'string' || !NONCE_HASH.test(value.nonceHash)) return null;
    if (value.audience !== AUDIENCE || !['current-guests', 'legacy-owners'].includes(value.worldId)) return null;
    if (!Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now || value.expiresAt > now + MAX_CHALLENGE_TTL_MS) return null;
    return Object.freeze({
      challengeId: value.challengeId,
      nonceHash: value.nonceHash,
      audience: value.audience,
      expiresAt: value.expiresAt,
      worldId: value.worldId,
    });
  }

  function encodeBase64url(value) {
    let bytes;
    if (typeof TextEncoder === 'function') bytes = new TextEncoder().encode(value);
    else if (typeof Buffer !== 'undefined') return Buffer.from(value, 'utf8').toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    else return '';
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const encoded = typeof btoa === 'function' ? btoa(binary) : '';
    return encoded.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  }

  function challengeUrl(challenge) {
    const encoded = encodeBase64url(JSON.stringify(challenge));
    return `${FORMAL_ORIGIN}${FORMAL_PATH}#cityChallenge=${encoded}`;
  }

  function sameOriginPath(win, path) {
    try {
      const url = new URL(path, win.location.origin);
      return url.origin === win.location.origin && url.pathname === path;
    } catch (_) { return false; }
  }

  function popupName(win) {
    try {
      const id = win?.crypto?.randomUUID?.();
      if (id) return `city-employee-link-${id}`;
    } catch (_) { /* Fall through to a non-sensitive local nonce. */ }
    return `city-employee-link-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function create(options = {}) {
    const win = options.window || (typeof window !== 'undefined' ? window : null);
    const doc = options.document || win?.document || null;
    const fetcher = options.fetch || win?.fetch?.bind(win);
    const getSession = typeof options.getSession === 'function' ? options.getSession : null;
    const reload = typeof options.reload === 'function' ? options.reload : () => win?.location?.reload?.();
    const onOpenBound = typeof options.onOpenBound === 'function' ? options.onOpenBound : null;
    const state = {
      booted: false,
      busy: false,
      completed: false,
      challenge: null,
      popupRef: null,
      popupName: '',
      generation: 0,
      statusPayload: null,
      destroyed: false,
    };
    const refs = {};
    let bound = false;
    let statusBound = false;

    const isBoundPayload = payload => payload?.bound === true || payload?.linked === true || payload?.status === 'linked';

    const createElement = tag => doc?.createElement?.(tag);
    const append = (parent, ...children) => children.forEach(child => child && parent?.appendChild?.(child));
    const button = (label, className) => {
      const node = createElement('button');
      if (!node) return null;
      node.type = 'button';
      node.className = className || '';
      node.textContent = label;
      return node;
    };
    const el = (tag, className, value) => {
      const node = createElement(tag);
      if (!node) return null;
      if (className) node.className = className;
      if (value != null) node.textContent = value;
      return node;
    };

    function setStatus(value, error = false) {
      if (!refs.status) return;
      refs.status.textContent = text(value);
      refs.status.dataset.kind = error ? 'error' : 'info';
    }

    function getKnownSession() {
      if (!getSession) return Promise.resolve(null);
      return Promise.resolve().then(() => getSession());
    }

    async function responseJSON(response) {
      let payload = null;
      try { payload = await response.json(); } catch (_) { payload = null; }
      if (!response?.ok) {
        const error = new Error(text(payload?.error || payload?.message || `HTTP_${response?.status || 0}`));
        error.status = response?.status;
        throw error;
      }
      return payload || {};
    }

    async function request(path, { method = 'GET', body, csrf = '' } = {}) {
      if (!sameOriginPath(win, path) || typeof fetcher !== 'function') throw new Error('SAME_ORIGIN_FETCH_UNAVAILABLE');
      const headers = { Accept: 'application/json' };
      const init = { method, credentials: 'same-origin', headers };
      if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        if (csrf) headers['X-City-CSRF'] = csrf;
        init.body = JSON.stringify(body);
      }
      return responseJSON(await fetcher(path, init));
    }

    async function refreshStatus() {
      try {
        state.statusPayload = await request('/api/employee/link/status');
        statusBound = isBoundPayload(state.statusPayload);
        setStatus(statusBound ? '目前城市角色已有員工綁定。' : '目前城市角色尚未完成員工綁定。');
        render();
        return state.statusPayload;
      } catch (_) {
        statusBound = false;
        render();
        setStatus('目前無法讀取員工綁定狀態，城市角色仍可繼續使用。', true);
        return null;
      }
    }

    function render() {
      if (!refs.panel) return;
      refs.panel.hidden = !refs.open;
      if (refs.launcher) {
        refs.launcher.textContent = statusBound ? '開啟本人員工角色' : '綁定本人員工角色';
        refs.launcher.setAttribute?.('aria-label', statusBound ? '開啟本人員工角色' : '綁定本人員工角色');
      }
      if (refs.start) refs.start.disabled = state.busy || state.completed;
      if (refs.employeeId) refs.employeeId.disabled = state.busy || state.completed;
      if (refs.status && state.completed) refs.status.textContent = '綁定完成，正在重新載入城市角色…';
    }

    function closeOwnedPopup(popup) {
      try { popup?.close?.(); } catch (_) { /* A closed or cross-origin popup is already safe to ignore. */ }
    }

    function invalidatePending() {
      const previous = state.popupRef;
      state.generation += 1;
      state.challenge = null;
      state.popupRef = null;
      state.popupName = '';
      closeOwnedPopup(previous);
    }

    async function beginChallenge() {
      if (state.busy || state.completed) return false;
      const employeeId = text(refs.employeeId?.value).trim();
      if (!EMPLOYEE_ID.test(employeeId)) {
        setStatus('請輸入正確員編格式；此欄只用於辨識，不會取代正式員工驗證。', true);
        return false;
      }
      // Open synchronously while the click still has user activation. Safari
      // blocks a popup opened after the session/challenge awaits below.
      invalidatePending();
      const name = popupName(win);
      const popup = win?.open?.('about:blank', name, 'popup,width=520,height=760');
      if (!popup) {
        setStatus('瀏覽器阻擋了正式登入視窗，請允許彈出視窗後重試。', true);
        return false;
      }
      state.popupRef = popup;
      state.popupName = name;
      const generation = state.generation;
      state.busy = true;
      render();
      try {
        let session;
        try { session = await getKnownSession(); } catch (_) { session = null; }
        if (generation !== state.generation || state.popupRef !== popup) {
          closeOwnedPopup(popup);
          return false;
        }
        const csrf = text(session?.csrf);
        const knownUser = Boolean(session?.profile || session?.knownUser || session?.user);
        if (!csrf || !knownUser) {
          state.popupRef = null;
          state.popupName = '';
          closeOwnedPopup(popup);
          setStatus('請先登入城市角色，才能提出本人員工綁定。', true);
          return false;
        }
        const response = await request('/api/employee/link/challenge', { method: 'POST', body: { employeeId }, csrf });
        if (generation !== state.generation || state.popupRef !== popup) {
          closeOwnedPopup(popup);
          return false;
        }
        const challenge = validateChallenge(response?.challenge || response, Date.now());
        if (!challenge) throw new Error('CITY_CHALLENGE_INVALID');
        const popupUrl = challengeUrl(challenge);
        state.challenge = challenge;
        if (typeof popup.location?.replace !== 'function') throw new Error('POPUP_NAVIGATION_UNAVAILABLE');
        popup.location.replace(popupUrl);
        refs.popupUrl.textContent = '已開啟正式登入頁，請完成本人員編驗證。';
        setStatus('請在新開的正式頁登入本人員編，完成後返回此城市。');
        return true;
      } catch (error) {
        if (generation !== state.generation || state.popupRef !== popup) {
          closeOwnedPopup(popup);
          return false;
        }
        state.challenge = null;
        state.popupRef = null;
        state.popupName = '';
        closeOwnedPopup(popup);
        setStatus('無法建立員工綁定邀請；原城市登入狀態未變更。', true);
        return false;
      } finally {
        if (generation === state.generation) {
          state.busy = false;
          render();
        }
      }
    }

    async function completeHandoff(data) {
      if (!state.challenge || !state.popupRef || state.completed || state.busy) return false;
      if (data.challengeId !== state.challenge.challengeId || !HANDOFF_CODE.test(data.code)) return false;
      if (state.challenge.expiresAt <= Date.now()) {
        setStatus('員工綁定邀請已過期；原城市登入狀態未變更。', true);
        return false;
      }
      let session;
      try { session = await getKnownSession(); } catch (_) { session = null; }
      const csrf = text(session?.csrf);
      if (!csrf) {
        setStatus('城市登入狀態已變更，未送出交接；請重新開啟邀請。', true);
        return false;
      }
      state.busy = true;
      render();
      try {
        await request('/api/employee/link/complete', {
          method: 'POST',
          body: { challengeId: state.challenge.challengeId, code: data.code },
          csrf,
        });
        state.completed = true;
        await refreshStatus();
        setStatus('綁定完成，正在重新載入城市角色…');
        await reload();
        return true;
      } catch (_) {
        setStatus('員工綁定尚未完成；原城市登入狀態與角色進度未清除。', true);
        return false;
      } finally {
        state.busy = false;
        render();
      }
    }

    function onMessage(event) {
      if (state.destroyed || event?.origin !== FORMAL_ORIGIN || event?.source !== state.popupRef) return;
      const data = event.data;
      if (!data || typeof data !== 'object' || !ownKeysMatch(data, new Set(['type', 'challengeId', 'code'])) || data.type !== HANDOFF_TYPE) return;
      void completeHandoff(data);
    }

    function buildUI() {
      if (!doc?.createElement || !doc?.body) return;
      const root = el('aside', 'employee-city-link-root');
      refs.root = root;
      root.id = 'employee-city-link-root';
      root.setAttribute?.('aria-label', '員工角色綁定');
      refs.launcher = button('綁定本人員工角色', 'employee-city-link-launcher');
      refs.launcher.id = 'employee-city-link-launcher';
      refs.launcher.setAttribute?.('aria-expanded', 'false');
      refs.panel = el('section', 'employee-city-link-panel');
      refs.panel.id = 'employee-city-link-panel';
      refs.panel.hidden = true;
      refs.open = false;
      const header = el('div', 'employee-city-link-header');
      const title = el('h2', '', '本人員工角色綁定');
      refs.close = button('×', 'employee-city-link-close');
      refs.close.setAttribute?.('aria-label', '關閉員工角色綁定');
      append(header, title, refs.close);
      const intro = el('p', 'employee-city-link-intro', '保留目前城市角色與進度；完成後只建立本人員工綁定，不建立新帳戶、不扣款。');
      const pilots = el('ul', 'employee-city-link-pilots');
      append(pilots,
        el('li', '', '本次先開放嘉玲與依芯，請使用自己原本遊玩的角色綁定。'));
      const label = el('label', 'employee-city-link-field', '本人員編');
      refs.employeeId = createElement('input');
      refs.employeeId.id = 'employee-city-link-employee-id';
      refs.employeeId.autocomplete = 'off';
      refs.employeeId.inputMode = 'text';
      label.appendChild?.(refs.employeeId);
      refs.start = button('提出綁定邀請', 'employee-city-link-start');
      refs.start.id = 'employee-city-link-start';
      refs.status = el('p', 'employee-city-link-status', '尚未讀取綁定狀態。');
      refs.status.id = 'employee-city-link-status';
      refs.popupUrl = el('p', 'employee-city-link-popup-status', '');
      refs.popupUrl.id = 'employee-city-link-popup-status';
      append(refs.panel, header, intro, pilots, label, refs.start, refs.status, refs.popupUrl);
      append(root, refs.launcher, refs.panel);
      doc.body.appendChild(root);
    }

    function bind() {
      if (bound) return;
      bound = true;
      refs.launcher?.addEventListener?.('click', () => {
        if (statusBound && onOpenBound) {
          refs.open = false;
          render();
          onOpenBound();
          return;
        }
        refs.open = !refs.open;
        refs.launcher.setAttribute?.('aria-expanded', refs.open ? 'true' : 'false');
        render();
      });
      refs.close?.addEventListener?.('click', () => {
        refs.open = false;
        refs.launcher.setAttribute?.('aria-expanded', 'false');
        render();
      });
      refs.start?.addEventListener?.('click', () => { void beginChallenge(); });
      win?.addEventListener?.('message', onMessage);
    }

    async function boot() {
      if (state.destroyed) return null;
      state.booted = true;
      if (!getSession) {
        setStatus('城市登入介面尚未提供 session adapter；角色進度不受影響。', true);
        return null;
      }
      return refreshStatus();
    }

    buildUI();
    bind();
    render();

    return {
      state,
      boot,
      beginChallenge,
      completeHandoff,
      refreshStatus,
      destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        win?.removeEventListener?.('message', onMessage);
        refs.root?.parentNode?.removeChild?.(refs.root);
      },
    };
  }

  return {
    CITY_ORIGIN,
    FORMAL_ORIGIN,
    FORMAL_PATH,
    HANDOFF_TYPE,
    HANDOFF_CODE,
    MAX_CHALLENGE_TTL_MS,
    challengeUrl,
    validateChallenge,
    create,
  };
});
