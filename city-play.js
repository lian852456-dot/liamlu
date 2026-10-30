(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CityPlay = api;
  if (root?.document) {
    const start = () => { root.CityPlayController = api.init({ window: root }); };
    if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start, { once: true });
    else start();
  }
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const TRY_CLOUDFLARE_SUFFIX = '.trycloudflare.com';
  const DEFAULT_HEALTH_PATH = '/health';
  const DEFAULT_READY_PATH = '/ready';
  const PAGE_FALLBACK_HREF = 'city-play.html';

  function text(value) {
    return value == null ? '' : String(value);
  }

  function strictOrigin(value) {
    if (typeof value !== 'string' || !value.trim()) return null;
    let parsed;
    try { parsed = new URL(value.trim()); } catch (_) { return null; }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.pathname !== '/' || parsed.port) return null;
    return parsed.origin;
  }

  function isAllowedOrigin(value, options = {}) {
    const origin = strictOrigin(value);
    if (!origin) return false;
    const hostname = new URL(origin).hostname.toLowerCase();
    if (hostname.endsWith(TRY_CLOUDFLARE_SUFFIX) && hostname.length > TRY_CLOUDFLARE_SUFFIX.length) return true;
    const fixedOrigins = Array.isArray(options.fixedOrigins) ? options.fixedOrigins : [];
    return fixedOrigins.some(candidate => strictOrigin(candidate) === origin);
  }

  function safePath(value, fallback) {
    const path = typeof value === 'string' && value ? value : fallback;
    if (!path.startsWith('/') || path.startsWith('//') || path.includes('?') || path.includes('#') || path.includes('..')) return null;
    return path;
  }

  function resolveEndpointConfig(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'CITY_ENDPOINT_CONFIG_INVALID' };
    const fixedOrigins = Array.isArray(raw.fixedOrigins) ? raw.fixedOrigins.slice() : [];
    const healthPath = safePath(raw.healthPath, DEFAULT_HEALTH_PATH);
    const readyPath = safePath(raw.readyPath, DEFAULT_READY_PATH);
    if (!healthPath || !readyPath) return { ok: false, error: 'CITY_ENDPOINT_PATH_INVALID' };
    if (raw.enabled !== true) {
      return { ok: true, enabled: false, origin: '', healthPath, readyPath, release: text(raw.release), fixedOrigins };
    }
    const origin = strictOrigin(raw.origin);
    if (!origin || !isAllowedOrigin(origin, { fixedOrigins })) return { ok: false, error: 'CITY_ENDPOINT_ORIGIN_INVALID' };
    return { ok: true, enabled: true, origin, healthPath, readyPath, release: text(raw.release), fixedOrigins };
  }

  function endpointUrl(origin, path) {
    const url = new URL(path, origin);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash || url.pathname !== path) return null;
    return url.href;
  }

  async function probe(config, options = {}) {
    if (!config || config.ok !== true || config.enabled !== true) {
      return { state: 'offline', ok: false, error: 'CITY_ENDPOINT_DISABLED' };
    }
    const fetcher = options.fetcher || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!fetcher) return { state: 'offline', ok: false, error: 'CITY_FETCH_UNAVAILABLE' };
    const healthUrl = endpointUrl(config.origin, config.healthPath);
    const readyUrl = endpointUrl(config.origin, config.readyPath);
    if (!healthUrl || !readyUrl) return { state: 'offline', ok: false, error: 'CITY_ENDPOINT_URL_INVALID' };
    if (typeof options.onState === 'function') options.onState('connecting');
    const request = async url => {
      const timeout = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(7000) : undefined;
      const response = await fetcher(url, {
        method: 'GET',
        mode: 'cors',
        cache: 'no-store',
        credentials: 'omit',
        headers: { Accept: 'application/json' }, signal: timeout,
      });
      if (!response || response.ok !== true) throw new Error(`HTTP_${response?.status || 0}`);
      let body = null;
      try { body = await response.json(); } catch (_) { /* health endpoints may be empty */ }
      return body;
    };
    try {
      const health = await request(healthUrl);
      const ready = await request(readyUrl);
      if (health?.schema !== 'north12b-city-health/v1' || health.status !== 'ok' || ready?.schema !== health.schema || ready.status !== 'ok' || ready.ready !== true) throw new Error('CITY_NOT_READY');
      return { state: 'connected', ok: true, origin: config.origin, health, ready };
    } catch (_) {
      return { state: 'offline', ok: false, origin: config.origin, error: 'CITY_ENDPOINT_UNAVAILABLE' };
    }
  }

  function init(options = {}) {
    const win = options.window || (typeof window !== 'undefined' ? window : null);
    const doc = options.document || win?.document || null;
    const fetcher = options.fetcher || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    const refs = {
      app: doc?.getElementById?.('city-play-app'),
      status: doc?.getElementById?.('city-play-status'),
      detail: doc?.getElementById?.('city-play-detail'),
      enter: doc?.getElementById?.('city-enter'),
      retry: doc?.getElementById?.('city-retry'),
    };
    const state = { status: 'unknown', config: null, result: null };

    function render() {
      const connected = state.status === 'connected' && state.result?.ok && state.config?.origin;
      const copy = {
        unknown: '正在確認小城狀態…',
        connecting: '正在連線…',
        connected: '目前可進入小城',
        offline: '目前離線，請稍後重試',
      };
      if (refs.app) refs.app.dataset.cityState = state.status;
      if (refs.status) refs.status.textContent = copy[state.status] || copy.unknown;
      if (refs.enter) {
        refs.enter.classList.toggle('is-disabled', !connected);
        refs.enter.setAttribute('aria-disabled', connected ? 'false' : 'true');
        refs.enter.href = connected ? state.config.origin : PAGE_FALLBACK_HREF;
      }
      if (refs.retry) refs.retry.hidden = state.status === 'connected';
    }

    function setState(next, detail) {
      state.status = next;
      if (refs.detail && detail) refs.detail.textContent = detail;
      render();
    }

    async function load() {
      state.config = null;
      state.result = null;
      setState('connecting', '正在讀取固定入口設定…');
      if (!fetcher) return setState('offline', '目前無法讀取入口設定，請稍後重試。');
      try {
        const response = await fetcher('city-endpoint.json', {
          method: 'GET', mode: 'same-origin', cache: 'no-store', credentials: 'omit',
          headers: { Accept: 'application/json' },
        });
        if (!response || response.ok !== true) throw new Error('CITY_CONFIG_FETCH_FAILED');
        const raw = await response.json();
        const config = resolveEndpointConfig(raw);
        if (!config.ok) throw new Error(config.error);
        state.config = config;
        if (!config.enabled) return setState('offline', '固定入口已準備，遊戲目前尚未開放。');
        state.result = await probe(config, { fetcher, onState: next => setState(next, '正在確認小城健康狀態…') });
        if (state.result.ok) setState('connected', '健康檢查已完成，可以進入小城。');
        else setState('offline', '小城目前無法連線，請稍後重試。');
      } catch (_) {
        setState('offline', '入口設定或連線暫時無法使用，請稍後重試。');
      }
    }

    refs.enter?.addEventListener('click', event => {
      if (state.status !== 'connected' || !state.result?.ok) event.preventDefault();
    });
    refs.retry?.addEventListener('click', () => { load(); });
    render();
    if (options.autoStart !== false) load();
    return { state, load, render };
  }

  return { isAllowedOrigin, resolveEndpointConfig, endpointUrl, probe, init };
});
