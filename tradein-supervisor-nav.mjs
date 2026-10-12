import { createSupervisorAccess, SESSION_KEY } from './tradein-supervisor-auth.mjs?v=20261012-supervisor-1';

// Public target/price pages do not prompt staff to log in. Their presentation
// links appear only after the existing supervisor token passes the server gate.
export function initializeSupervisorNavigation() {
  const links = [...document.querySelectorAll('[data-supervisor-brief]')];
  if (!links.length) return;
  const hide = () => links.forEach(link => { link.hidden = true; });
  hide();
  const access = createSupervisorAccess({ onRevoke: hide });
  let pending = null;
  let destroyed = false;
  function savedToken() {
    try { return window.sessionStorage.getItem(SESSION_KEY) || ''; }
    catch { return ''; }
  }
  function suspend() {
    hide();
    pending?.controller.abort();
    pending = null;
    access.clear();
  }
  async function refresh() {
    if (destroyed) return;
    const token = savedToken();
    if (document.hidden || !token || window.PortalLogout?.isLocked()) { suspend(); return; }
    if (pending?.token === token && !pending.controller.signal.aborted) return pending.promise;
    hide();
    pending?.controller.abort();
    const request = { token, controller: new AbortController() };
    pending = request;
    request.promise = (async () => {
      try {
        await access.verify({ signal: request.controller.signal });
        if (pending === request && access.current()) links.forEach(link => { link.hidden = false; });
      } catch { if (pending === request) hide(); }
      finally { if (pending === request) pending = null; }
    })();
    return request.promise;
  }
  const onVisibility = () => { if (document.hidden) suspend(); else void refresh(); };
  const onStorage = event => {
    if (event.key === 'north12b_portal_logout_event_v1') { suspend(); return; }
    if (event.key === null || [SESSION_KEY, 'north12b_portal_login_event_v1'].includes(event.key)) void refresh();
  };
  const listeners = [
    [window, 'focus', refresh], [window, 'pageshow', refresh],
    [window, 'pagehide', suspend], [window, 'portal-before-logout', suspend],
    [window, 'portal-login-changed', refresh], [window, 'storage', onStorage],
    [document, 'visibilitychange', onVisibility]
  ];
  listeners.forEach(([target, event, listener]) => target.addEventListener(event, listener));
  void refresh();
  return Object.freeze({
    refresh,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      suspend();
      access.destroy();
      listeners.forEach(([target, event, listener]) => target.removeEventListener(event, listener));
    }
  });
}

initializeSupervisorNavigation();
