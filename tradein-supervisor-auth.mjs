// Presentation access uses the existing Patrol supervisor session. Staff and
// password-channel device exemptions are not supervisor proof.
export const PATROL_API = 'https://script.google.com/macros/s/AKfycbxqBtW2yQw_u4qqJ9Knz6CK34hAiunaa6lIQu4pMa8Ff2voJZCWKEh8MXTJ6qAoGTax/exec';
export const SESSION_KEY = 'bei12b_patrol_session_token_v2';
const LOGOUT_EVENT_KEY = 'north12b_portal_logout_event_v1';
const REQUEST_TIMEOUT_MS = 20000;

function accessError(message, code = 'SUPERVISOR_REQUIRED') {
  const error = new Error(message);
  error.name = 'SupervisorAccessError';
  error.code = code;
  return error;
}
const cancelled = () => new DOMException('督導驗證已取消，請重新驗證。', 'AbortError');
const signedToken = value => typeof value === 'string' && value.length <= 4096 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value);

export function createSupervisorAccess({ onRevoke = () => {} } = {}) {
  let verified = null;
  let knownDeadline = null;
  let pending = null;
  let epoch = 0;
  let expiryTimer;
  let destroyed = false;
  let logoutBlocked = false;
  let explicitLoginAt = 0;

  function storedToken() {
    try { return window.sessionStorage.getItem(SESSION_KEY) || ''; }
    catch { return ''; }
  }
  function activeDocument(allowLogin = false) {
    if (destroyed || document.hidden || window.PortalLogout?.isLocked()) throw cancelled();
    window.PortalLogout?.assertActive();
    if (logoutBlocked && !allowLogin) throw accessError('督導已登出，請重新輸入通行碼驗證。', 'AUTH_LOGGED_OUT');
  }
  function revoke(error = accessError('請先完成督導驗證。'), forgetToken = '') {
    epoch += 1;
    pending?.controller.abort();
    pending = null;
    clearTimeout(expiryTimer);
    verified = null;
    // Never erase a newer login or an otherwise valid shared session after a
    // temporary network failure, backgrounding, or a local preview reset.
    if (forgetToken && storedToken() === forgetToken) {
      try { window.sessionStorage.removeItem(SESSION_KEY); } catch {}
    }
    try { onRevoke(error); } catch {}
  }
  function current() {
    if (!verified || pending) return false;
    try { activeDocument(); }
    catch (error) { revoke(error); return false; }
    if (storedToken() !== verified.token) {
      revoke(accessError('督導登入已變更，請重新驗證。'));
      return false;
    }
    if (Date.now() >= verified.expiresAt) {
      revoke(accessError('督導登入已到期，請重新驗證。', 'AUTH_SESSION_EXPIRED'), verified.token);
      return false;
    }
    return true;
  }
  function requireCurrent() {
    if (!current()) throw accessError('請先完成有效的督導驗證。');
    return { ...verified };
  }
  function scheduleExpiry() {
    clearTimeout(expiryTimer);
    if (!verified) return;
    const expected = verified;
    expiryTimer = setTimeout(() => {
      if (verified !== expected) return;
      if (Date.now() < expected.expiresAt) { scheduleExpiry(); return; }
      revoke(accessError('督導登入已到期，請重新驗證。', 'AUTH_SESSION_EXPIRED'), expected.token);
    }, Math.max(0, Math.min(expected.expiresAt - Date.now(), 2147483647)));
  }
  async function request(payload, controller) {
    let timedOut = false;
    let abort;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
    try {
      const aborted = new Promise((_, reject) => {
        abort = () => reject(timedOut
          ? accessError('督導驗證連線逾時，請稍後重試。', 'AUTH_TIMEOUT')
          : cancelled());
        controller.signal.addEventListener('abort', abort, { once: true });
        if (controller.signal.aborted) abort();
      });
      const response = (async () => {
        const result = await window.fetch(PATROL_API, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload), credentials: 'omit', cache: 'no-store',
          signal: controller.signal
        });
        if (!result.ok) {
          const error = accessError('督導驗證服務暫時無法使用，請稍後重試。', 'AUTH_SERVICE_UNAVAILABLE');
          error.authDenied = result.status === 401 || result.status === 403;
          throw error;
        }
        return result.json();
      })();
      return await Promise.race([response, aborted]);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', abort);
    }
  }
  async function verify({ key, signal } = {}) {
    const login = key !== undefined;
    const initialToken = storedToken();
    const restoreToken = login ? '' : initialToken;
    pending?.controller.abort();
    const ticket = ++epoch;
    const controller = new AbortController();
    pending = { ticket, controller, initialToken };
    // A successful recheck preserves the caller's preview. Only denial,
    // cancellation, expiry or lifecycle events invoke its revoke callback.
    verified = null;
    clearTimeout(expiryTimer);
    const abort = () => controller.abort();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      activeDocument(login);
      if (signal?.aborted) throw cancelled();
      if (login && (typeof key !== 'string' || !key.trim() || key.length > 1024)) {
        throw accessError('請輸入督導通行碼。', 'AUTH_CREDENTIAL_MISSING');
      }
      if (!login && !restoreToken) throw accessError('請先完成督導驗證。', 'AUTH_TOKEN_MISSING');
      if (!login && !signedToken(restoreToken)) {
        const error = accessError('督導登入無效，請重新驗證。', 'AUTH_TOKEN_INVALID');
        error.authDenied = true;
        throw error;
      }
      const result = await request(login ? { action: 'ptauth', key } : { action: 'ptauth', token: restoreToken }, controller);
      if (ticket !== epoch || controller.signal.aborted) throw cancelled();
      activeDocument(login);
      if (storedToken() !== initialToken) throw cancelled();
      if (!result || result.status !== 'ok') {
        const error = accessError('督導驗證未通過，請確認通行碼或重新登入。', 'AUTH_DENIED');
        error.authDenied = result?.status === 'denied' || /^AUTH_/.test(result?.reason || result?.auth?.reason || '')
          || /unauthorized|未通過|驗證失敗/i.test(result?.message || '');
        throw error;
      }
      if (!signedToken(result.token) || !login && result.token !== restoreToken
          || result.sessionContract !== undefined && result.sessionContract !== 'patrol-session-v2') {
        throw accessError('督導驗證回應不符，請重新驗證。', 'AUTH_RESPONSE_INVALID');
      }
      // Use only the server's absolute deadline. expiresIn and re-verification
      // must never create a new local lifetime for the same token.
      if (!Number.isSafeInteger(result.expiresAt) || result.expiresAt <= 0
          || !Number.isSafeInteger(result.expiresAt * 1000)) {
        throw accessError('督導驗證未提供有效期限，請重新驗證。', 'AUTH_RESPONSE_INVALID');
      }
      const serverDeadline = result.expiresAt * 1000;
      const expiresAt = knownDeadline?.token === result.token
        ? Math.min(knownDeadline.expiresAt, serverDeadline) : serverDeadline;
      if (expiresAt <= Date.now()) {
        throw accessError('督導登入已到期，請重新驗證。', 'AUTH_SESSION_EXPIRED');
      }
      if (login) {
        try { window.sessionStorage.setItem(SESSION_KEY, result.token); }
        catch { throw accessError('瀏覽器無法保存督導登入，請檢查瀏覽器設定。', 'AUTH_STORAGE_UNAVAILABLE'); }
        logoutBlocked = false;
        explicitLoginAt = Date.now();
      }
      if (storedToken() !== result.token) throw cancelled();
      verified = Object.freeze({ token: result.token, expiresAt });
      knownDeadline = verified;
      pending = null;
      scheduleExpiry();
      if (login) window.PortalLogout?.notifyLogin();
      return requireCurrent();
    } catch (error) {
      if (ticket !== epoch) throw cancelled();
      const failure = error?.name === 'AbortError' || error?.name === 'SupervisorAccessError'
        ? error : accessError('督導驗證連線失敗，請稍後重試。', 'AUTH_SERVICE_UNAVAILABLE');
      const forget = failure.authDenied || failure.code === 'AUTH_SESSION_EXPIRED' ? restoreToken : '';
      revoke(failure, forget);
      throw failure;
    } finally {
      signal?.removeEventListener('abort', abort);
      if (pending?.ticket === ticket) pending = null;
    }
  }
  const clear = () => revoke();
  function onLogout(event) {
    let notice;
    try { notice = event?.newValue ? JSON.parse(event.newValue) : null; } catch {}
    // A delayed old logout must not invalidate a later explicit login in this
    // document. Never remove shared credentials in response to these notices.
    if (notice?.type === 'logout' && notice.version === 1 && Number.isFinite(notice.at)
        && notice.at < explicitLoginAt) return;
    // Public target/price pages intentionally do not load PortalLogout. Their
    // restored token must stay blocked while server-side revocation is pending,
    // including after focus, background return, or another staff login notice.
    logoutBlocked = true;
    revoke(accessError('督導已登出，請重新輸入通行碼驗證。', 'AUTH_LOGGED_OUT'));
  }
  function credentialsChanged() {
    const token = storedToken();
    if (verified && token !== verified.token || pending && token !== pending.initialToken) {
      revoke(accessError('督導登入已變更，請重新驗證。'));
    }
  }
  const onStorage = event => {
    if (event.key === LOGOUT_EVENT_KEY) onLogout(event);
    else if (event.key === null) clear();
    else if (event.key === SESSION_KEY) credentialsChanged();
  };
  const onVisibility = () => { if (document.hidden) clear(); };
  const onPageShow = event => { if (event.persisted) clear(); };
  const listeners = [
    [window, 'portal-before-logout', onLogout], [window, 'portal-login-changed', credentialsChanged],
    [window, 'storage', onStorage], [window, 'pagehide', clear],
    [window, 'pageshow', onPageShow], [document, 'visibilitychange', onVisibility]
  ];
  listeners.forEach(([target, event, listener]) => target.addEventListener(event, listener));
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clear();
    listeners.forEach(([target, event, listener]) => target.removeEventListener(event, listener));
  }
  return Object.freeze({ verify, current, requireCurrent, clear, destroy });
}
