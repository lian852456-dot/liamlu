(function (root) {
  'use strict';

  // Manual bootstrap for the bound employee city add-on. This deliberately
  // never creates a guest, logs out, clears storage, or carries auth data to
  // another origin.
  function sameOriginFetch(win, path, init) {
    const url = new URL(path, win.location.origin);
    if (url.origin !== win.location.origin) throw new Error('CITY_SAME_ORIGIN_REQUIRED');
    return win.fetch(url.pathname + url.search, { credentials: 'same-origin', ...(init || {}) });
  }

  function json(response) {
    return response.json().then(payload => {
      if (!response.ok) {
        const error = new Error(payload?.error || payload?.message || `HTTP_${response.status}`);
        error.status = response.status;
        throw error;
      }
      return payload || {};
    });
  }

  function start(options = {}) {
    const win = options.window || root;
    const doc = options.document || win?.document;
    if (!win || !doc || !win.fetch) return null;
    const panelAPI = options.panelAPI || win.CozyEmployeeCityPanel;
    const linkAPI = options.linkAPI || win.CozyEmployeeCityLink;
    const peersAPI = options.peersAPI || win.CozyStaffPeerRender;
    const world = options.world || win.CozyWorld;
    let cachedSession = null;
    let cachedSelfId = '';
    let sessionInFlight = null;
    let sessionRetryTimer = null;
    let crowdTimer = null;
    let sessionReady = false;
    let disposed = false;
    let peerRender = null;
    let panel = null;
    let cityLink = null;
    let panelSessionId = '';
    let cityLinkSessionId = '';

    const getSession = async () => {
      // This is intentionally a same-origin GET only. It does not register a
      // guest or read/write local/session storage.
      if (sessionInFlight) return sessionInFlight;
      sessionInFlight = (async () => {
        const response = await sameOriginFetch(win, '/api/session', { method: 'GET', headers: { Accept: 'application/json' } });
        const data = await json(response);
        cachedSession = data;
        cachedSelfId = data?.profile?.id ? String(data.profile.id) : '';
        return data;
      })().catch(error => {
        if (error?.status === 401) clearSession(true);
        throw error;
      }).finally(() => { sessionInFlight = null; });
      return sessionInFlight;
    };

    const fetchCrowd = async ({ x = 0, z = 0, scene = 'outdoor' } = {}) => {
      const params = new URLSearchParams({ x: String(Number.isFinite(Number(x)) ? Number(x) : 0), z: String(Number.isFinite(Number(z)) ? Number(z) : 0), scene: String(scene || 'outdoor') });
      const response = await sameOriginFetch(win, `/api/employee/crowd?${params.toString()}`, { method: 'GET', headers: { Accept: 'application/json' } });
      return json(response);
    };

    const isVisible = () => doc.visibilityState !== 'hidden';
    const stopSessionRetry = () => { if (sessionRetryTimer != null) { win.clearInterval?.(sessionRetryTimer); sessionRetryTimer = null; } };
    const stopCrowdPolling = () => { if (crowdTimer != null) { win.clearInterval?.(crowdTimer); crowdTimer = null; } };
    const clearSession = (retry = true) => {
      cachedSession = null;
      cachedSelfId = '';
      sessionReady = false;
      stopCrowdPolling();
      // Keep the network presence list intact; only remove the offline NPCs
      // and let staff-peer-render redraw real peers without a self id.
      try { peerRender?.setOfflinePeers?.([]); } catch (_) { /* best effort */ }
      if (retry && !disposed && isVisible()) startSessionRetry();
    };
    const refreshPeers = () => {
      if (disposed || !isVisible() || !peerRender || !cachedSelfId) return;
      Promise.resolve(peerRender.refresh()).then(result => {
        const message = String(result?.error || '');
        if (/401|UNAUTHORIZED|SESSION/i.test(message)) clearSession(true);
      }).catch(error => {
        if (/401|UNAUTHORIZED|SESSION/i.test(String(error?.message || error))) clearSession(true);
      });
    };
    const startCrowdPolling = () => {
      if (disposed || crowdTimer != null || !isVisible() || !peerRender || !cachedSelfId) return;
      refreshPeers();
      crowdTimer = win.setInterval?.(refreshPeers, 1000) ?? null;
    };
    const createPeerRenderer = () => {
      if (peerRender || disposed || !peersAPI?.create || !world || typeof world.setPeers !== 'function') return;
      try {
        peerRender = peersAPI.create({
          world,
          fetchCrowd,
          getSelfId: () => cachedSelfId,
          getScene: () => world.getScene?.() || 'outdoor',
          getPose: () => world.getPose?.() || {},
        });
      } catch (_) { peerRender = null; }
    };
    const attachForSession = async () => {
      if (disposed || !cachedSelfId) return false;
      if (panel && panelSessionId !== cachedSelfId) {
        try { await panel.boot?.(); } catch (_) { /* unbound guests keep the panel hidden */ }
        panelSessionId = cachedSelfId;
      }
      if (cityLink && cityLinkSessionId !== cachedSelfId) {
        try { await cityLink.boot?.(); } catch (_) { /* link status is optional */ }
        cityLinkSessionId = cachedSelfId;
      }
      createPeerRenderer();
      startCrowdPolling();
      return true;
    };
    const attemptSession = async () => {
      if (disposed || !isVisible() || sessionInFlight) return false;
      try {
        const data = await getSession();
        if (!data?.profile?.id) {
          clearSession(false);
          return false;
        }
        cachedSession = data;
        cachedSelfId = String(data.profile.id);
        sessionReady = true;
        stopSessionRetry();
        return attachForSession();
      } catch (_) {
        sessionReady = false;
        if (!disposed && isVisible()) startSessionRetry();
        return false;
      }
    };
    const startSessionRetry = () => {
      if (disposed || !isVisible() || cachedSelfId || sessionRetryTimer != null) return;
      void attemptSession();
      sessionRetryTimer = win.setInterval?.(() => { void attemptSession(); }, 1000) ?? null;
    };
    const visibilityChange = () => {
      if (!isVisible()) {
        stopSessionRetry();
        stopCrowdPolling();
        return;
      }
      if (cachedSelfId) startCrowdPolling();
      else startSessionRetry();
    };
    const pagehide = () => { dispose(); };

    async function initialize() {
      if (disposed) return false;
      if (panelAPI?.create) {
        panel = panelAPI.create({ window: win, document: doc, fetch: win.fetch.bind(win), getSession, reload: () => win.location?.reload?.() });
      }
      if (linkAPI?.create) {
        try {
          cityLink = linkAPI.create({
            window: win,
            document: doc,
            fetch: win.fetch.bind(win),
            getSession,
            reload: () => win.location?.reload?.(),
            onOpenBound: () => { panel?.open?.(); },
          });
        } catch (_) { cityLink = null; }
      }
      if (!isVisible()) return false;
      return attemptSession();
    }
    const ready = initialize();
    doc.addEventListener?.('visibilitychange', visibilityChange);
    win.addEventListener?.('pagehide', pagehide, { once: true });

    function dispose() {
      if (disposed) return;
      disposed = true;
      stopSessionRetry();
      stopCrowdPolling();
      doc.removeEventListener?.('visibilitychange', visibilityChange);
      win.removeEventListener?.('pagehide', pagehide);
      try { peerRender?.dispose?.(); } catch (_) { /* best effort */ }
      try { panel?.dispose?.(); } catch (_) { /* best effort */ }
      try { cityLink?.destroy?.(); } catch (_) { /* best effort */ }
      peerRender = null;
      panel = null;
      cityLink = null;
    }

    return Object.freeze({ ready, getSession, fetchCrowd, refresh: refreshPeers, dispose, state: () => ({ disposed, polling: crowdTimer != null, sessionRetrying: sessionRetryTimer != null, sessionReady, hasPanel: Boolean(panel), hasPeerRender: Boolean(peerRender), hasCityLink: Boolean(cityLink) }) });
  }

  const api = Object.freeze({ start });
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CozyEmployeeCityBootstrap = api;
})(typeof window === 'undefined' ? globalThis : window);
