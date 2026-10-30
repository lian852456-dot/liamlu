(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CityEmployeeLink = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const FORMAL_ORIGIN = 'https://lian852456-dot.github.io';
  const FORMAL_PATH_PREFIX = '/liamlu/';
  const CITY_ORIGIN = 'https://immediate-temporary-cage-warriors.trycloudflare.com';
  const AUDIENCE = 'north12b-city-formal-login';
  const WORLD_IDS = new Set(['current-guests', 'legacy-owners']);
  const CHALLENGE_KEYS = new Set(['challengeId', 'nonceHash', 'audience', 'expiresAt', 'worldId']);
  const BASE64URL = /^[A-Za-z0-9_-]+$/;
  const NONCE_HASH = /^[a-f0-9]{64}$/;
  const CHALLENGE_ID = /^[A-Za-z0-9_-]{16,160}$/;
  const HANDOFF_TYPE = 'city-employee-handoff/v1';
  const HANDOFF_ACK_TYPE = 'city-employee-handoff/ack/v1';
  const HANDOFF_CODE = /^CH1_[a-f0-9]{64}$/;
  const MAX_CHALLENGE_TTL_MS = 120 * 1000;

  function safeText(value) {
    return value == null ? '' : String(value);
  }

  function decodeFragmentValue(value) {
    let decoded = value;
    try { decoded = decodeURIComponent(value); } catch (_) { return null; }
    if (decoded.trim().startsWith('{')) return decoded;
    if (!BASE64URL.test(decoded) || decoded.length > 4096) return null;
    try {
      const padded = decoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - decoded.length % 4) % 4);
      if (typeof atob === 'function') {
        const bytes = atob(padded);
        let text = '';
        for (let index = 0; index < bytes.length; index += 1) text += String.fromCharCode(bytes.charCodeAt(index));
        return decodeURIComponent(escape(text));
      }
      if (typeof Buffer !== 'undefined') return Buffer.from(padded, 'base64').toString('utf8');
    } catch (_) { return null; }
    return null;
  }

  function parseChallengeHash(hash, now = Date.now()) {
    const input = safeText(hash).replace(/^#/, '');
    if (!input) return { ok: false, error: 'CITY_CHALLENGE_MISSING' };
    const separator = input.indexOf('=');
    const key = separator > 0 ? input.slice(0, separator) : '';
    const raw = key === 'cityChallenge' || key === 'challenge' ? input.slice(separator + 1) : input;
    const decoded = decodeFragmentValue(raw);
    if (!decoded) return { ok: false, error: 'CITY_CHALLENGE_ENCODING_INVALID' };
    let value;
    try { value = JSON.parse(decoded); } catch (_) { return { ok: false, error: 'CITY_CHALLENGE_JSON_INVALID' }; }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, error: 'CITY_CHALLENGE_SHAPE_INVALID' };
    const keys = Object.keys(value);
    if (keys.some(keyName => !CHALLENGE_KEYS.has(keyName)) || keys.length !== CHALLENGE_KEYS.size) {
      return { ok: false, error: 'CITY_CHALLENGE_FIELDS_INVALID' };
    }
    if (typeof value.challengeId !== 'string' || !CHALLENGE_ID.test(value.challengeId)) {
      return { ok: false, error: 'CITY_CHALLENGE_ID_INVALID' };
    }
    // The raw redemption nonce is server-only. The browser sees only its SHA-256 hex digest.
    if (typeof value.nonceHash !== 'string' || !NONCE_HASH.test(value.nonceHash)) {
      return { ok: false, error: 'CITY_CHALLENGE_NONCE_HASH_INVALID' };
    }
    if (value.audience !== AUDIENCE || !WORLD_IDS.has(value.worldId)) {
      return { ok: false, error: 'CITY_CHALLENGE_AUDIENCE_INVALID' };
    }
    if (!Number.isSafeInteger(value.expiresAt) || value.expiresAt <= now) {
      return { ok: false, error: 'CITY_CHALLENGE_EXPIRED' };
    }
    if (value.expiresAt > now + MAX_CHALLENGE_TTL_MS) {
      return { ok: false, error: 'CITY_CHALLENGE_EXPIRY_INVALID' };
    }
    return {
      ok: true,
      challenge: Object.freeze({
        challengeId: value.challengeId,
        nonceHash: value.nonceHash,
        audience: value.audience,
        expiresAt: value.expiresAt,
        worldId: value.worldId,
      }),
    };
  }

  function originOf(location) {
    return safeText(location && location.origin);
  }

  function create(options = {}) {
    const win = options.window || (typeof window !== 'undefined' ? window : null);
    const doc = options.document || win?.document || null;
    const ownerClient = options.ownerClient || null;
    const issueCityHandoff = typeof options.issueCityHandoff === 'function'
      ? options.issueCityHandoff
      : (typeof ownerClient?.issueCityHandoff === 'function' ? ownerClient.issueCityHandoff.bind(ownerClient) : null);
    const getDeviceId = typeof options.getDeviceId === 'function'
      ? options.getDeviceId
      : () => typeof ownerClient?.deviceId === 'function' ? ownerClient.deviceId() : ownerClient?.deviceId;
    const now = typeof options.now === 'function' ? options.now : () => Date.now();
    const state = {
      originOk: false,
      openerOk: false,
      challenge: null,
      challengeError: '',
      authenticated: false,
      handoffEnabled: false,
      sent: false,
      destroyed: false,
      deviceId: '',
    };
    const refs = {};
    let bound = false;

    const byId = id => doc && typeof doc.getElementById === 'function' ? doc.getElementById(id) : null;
    refs.status = byId('employee-link-status');
    refs.handoffStatus = byId('employee-link-handoff-status');
    refs.form = byId('employee-link-login-form');
    refs.employeeId = byId('employee-link-employee-id');
    refs.password = byId('employee-link-password');
    refs.login = byId('employee-link-login-submit');
    refs.handoff = byId('employee-link-handoff-submit');
    refs.app = byId('employee-link-app');

    function message(status, handoff = false) {
      const node = handoff ? refs.handoffStatus : refs.status;
      if (node) node.textContent = safeText(status);
    }

    function clearFragment() {
      try {
        const location = win && win.location;
        const path = safeText(location?.pathname || '/');
        const search = safeText(location?.search || '');
        win?.history?.replaceState?.(null, doc?.title || '', path + search);
      } catch (_) { /* A missing history API must not retain or expose the challenge. */ }
    }

    function render() {
      if (!refs.app) return;
      refs.app.dataset.originOk = state.originOk ? 'true' : 'false';
      refs.app.dataset.challengeOk = state.challenge ? 'true' : 'false';
      refs.app.dataset.handoffReady = state.handoffEnabled ? 'true' : 'false';
      if (refs.login) refs.login.disabled = !state.originOk || !state.challenge || !ownerClient || typeof ownerClient.login !== 'function';
      if (refs.employeeId) refs.employeeId.disabled = refs.login?.disabled || false;
      if (refs.password) refs.password.disabled = refs.login?.disabled || false;
      if (refs.handoff) refs.handoff.disabled = !state.handoffEnabled || !state.authenticated || state.sent;
      if (state.sent) message('已送回小城，請回原城市頁繼續。', true);
    }

    function onMessage(event) {
      if (state.destroyed || event?.origin !== CITY_ORIGIN || event?.source !== win?.opener) return;
      const data = event.data;
      if (!data || data.type !== HANDOFF_ACK_TYPE || data.challengeId !== state.challenge?.challengeId) return;
      message('小城已收到交接訊息。', true);
    }

    async function resolveDeviceId() {
      let value;
      try { value = await getDeviceId(); } catch (_) { value = ''; }
      return typeof value === 'string' && value.length >= 8 && value.length <= 256 ? value : '';
    }

    async function bootstrap() {
      state.originOk = originOf(win?.location) === FORMAL_ORIGIN
        && safeText(win?.location?.pathname).startsWith(FORMAL_PATH_PREFIX);
      state.openerOk = Boolean(win?.opener && typeof win.opener.postMessage === 'function');
      const parsed = parseChallengeHash(win?.location?.hash, now());
      // Parse first, then remove the fragment so the nonce hash/challenge never
      // remains in history or can be copied from the address bar.
      clearFragment();
      if (parsed.ok) state.challenge = parsed.challenge;
      else state.challengeError = parsed.error;

      if (!state.originOk) {
        message('請從正式登入網站開啟此頁；目前來源不在允許的正式 origin。');
        render();
        return;
      }
      if (!state.challenge) {
        message('城市交接邀請無效或已過期，請回城市重新開啟。');
        render();
        return;
      }
      if (!state.openerOk) {
        message('找不到原城市頁，請由城市登入入口開啟此頁。');
        render();
        return;
      }
      if (!ownerClient || typeof ownerClient.restore !== 'function' || typeof ownerClient.session !== 'function') {
        message('正式登入交接尚未啟用。');
        render();
        return;
      }
      state.deviceId = await resolveDeviceId();
      if (!state.deviceId) {
        message('本機裝置驗證尚未啟用，無法安全交接。');
        render();
        return;
      }
      try {
        await ownerClient.restore(state.deviceId);
        const session = await ownerClient.session(state.deviceId);
        state.authenticated = Boolean(session);
        state.handoffEnabled = Boolean(issueCityHandoff);
        if (!state.authenticated) message('請登入本人員編後，再手動綁定目前城市角色。');
        else if (!state.handoffEnabled) message('正式登入可用，但城市角色交接 adapter 尚未啟用。');
        else message('已確認正式登入；請按下「綁定目前城市角色」完成手動交接。');
      } catch (_) {
        state.authenticated = false;
        state.handoffEnabled = false;
        message('目前登入狀態無法確認，請稍後重試。');
      }
      render();
    }

    async function login() {
      if (!state.originOk || !state.challenge || !ownerClient || typeof ownerClient.login !== 'function') return false;
      const employeeId = safeText(refs.employeeId?.value).trim();
      const password = safeText(refs.password?.value);
      if (!employeeId || !password || !state.deviceId) {
        message('請輸入員編與驗證密碼。');
        return false;
      }
      try {
        await ownerClient.login({ employeeId, deviceId: state.deviceId, password });
        const session = await ownerClient.session(state.deviceId);
        state.authenticated = Boolean(session);
        state.handoffEnabled = Boolean(issueCityHandoff);
        if (!state.authenticated) throw new Error('SESSION_NOT_CONFIRMED');
        message(state.handoffEnabled ? '登入成功，請再手動按「綁定目前城市角色」。' : '登入成功，但城市角色交接尚未啟用。');
        render();
        return true;
      } catch (_) {
        state.authenticated = false;
        message('登入未完成，請確認員編與驗證密碼。');
        render();
        return false;
      } finally {
        if (refs.password) refs.password.value = '';
      }
    }

    async function handoff() {
      if (!state.handoffEnabled || !state.authenticated || state.sent || !state.challenge) return false;
      const opener = win?.opener;
      if (!opener || opener !== win.opener || typeof opener.postMessage !== 'function') {
        message('原城市頁已關閉，請回城市重新開啟。', true);
        return false;
      }
      let result;
      try { result = await issueCityHandoff(state.challenge); } catch (_) {
        message('城市角色交接尚未完成，請稍後重試。', true);
        return false;
      }
      const code = typeof result === 'object' && result !== null ? result.code : null;
      if (typeof code !== 'string' || !HANDOFF_CODE.test(code) || code === state.deviceId || code === safeText(refs.employeeId?.value)) {
        message('交接回應不符合一次性憑據格式，已停止。', true);
        return false;
      }
      const payload = { type: HANDOFF_TYPE, challengeId: state.challenge.challengeId, code };
      try { opener.postMessage(payload, CITY_ORIGIN); } catch (_) {
        message('無法回傳小城，請回城市重新開啟。', true);
        return false;
      }
      state.sent = true;
      message('交接訊息已送出；城市會在伺服器端核對一次性憑據。', true);
      render();
      return true;
    }

    function bindEvents() {
      if (bound) return;
      bound = true;
      refs.form?.addEventListener?.('submit', event => { event.preventDefault?.(); void login(); });
      refs.handoff?.addEventListener?.('click', () => { void handoff(); });
      win?.addEventListener?.('message', onMessage);
    }

    bindEvents();
    render();
    const ready = bootstrap();

    return {
      ready,
      state,
      login,
      handoff,
      refresh: bootstrap,
      destroy() {
        if (state.destroyed) return;
        state.destroyed = true;
        win?.removeEventListener?.('message', onMessage);
      },
    };
  }

  return {
    FORMAL_ORIGIN,
    FORMAL_PATH_PREFIX,
    CITY_ORIGIN,
    AUDIENCE,
    HANDOFF_TYPE,
    HANDOFF_CODE,
    MAX_CHALLENGE_TTL_MS,
    create,
    parseChallengeHash,
  };
});
