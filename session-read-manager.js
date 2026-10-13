(function(root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SessionReadManager = api;
})(typeof window === 'object' ? window : globalThis, function() {
  'use strict';
  const CONTRACT = 'department-version-read/v1';
  function cancelled() { const error = new Error('讀取工作階段已變更'); error.code = 'SESSION_READ_CANCELLED'; return error; }
  function tokenDeadline(token) {
    try {
      const value = JSON.parse(atob(String(token).split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
      return Number.isFinite(value.exp) ? value.exp * 1000 : 0;
    } catch { return 0; }
  }
  // Each consumer owns its instance. There is no shared cache, storage, or credential registry.
  function create({namespace, getSession, isAuthorized = () => true, onExpired = () => {}, onMetric = () => {}, now = () => Date.now(), maxEntries = 8}) {
    let identity = '', epoch = 0, expiryTimer;
    const entries = new Map(), flights = new Map();
    function clear() {
      epoch += 1; clearTimeout(expiryTimer); identity = '';
      entries.clear();
      for (const flight of flights.values()) flight.controller.abort();
      flights.clear();
    }
    function scope() {
      const session = getSession() || {}, next = String(session.identity || '');
      if (!next || !isAuthorized() || (session.expiresAt && session.expiresAt <= now())) {
        clear();
        if (next && session.expiresAt && session.expiresAt <= now()) onExpired();
        throw cancelled();
      }
      if (identity !== next) {
        clear(); identity = next;
        if (session.expiresAt) {
          const expected = epoch;
          expiryTimer = setTimeout(() => { if (epoch === expected) { clear(); onExpired(); } }, Math.max(1, Math.min(2147483647, session.expiresAt - now())));
          expiryTimer?.unref?.();
        }
      }
      return {identity, epoch};
    }
    function current(expected) {
      const actual = scope();
      if (actual.identity !== expected.identity || actual.epoch !== expected.epoch) throw cancelled();
    }
    function metric(key, source, start) {
      // Fixed resource keys only: never emit session identities, versions, payloads, or errors.
      onMetric({namespace, resource:key, source, elapsedMs:Math.max(0, now() - start)});
    }
    function cancel(key) {
      const flight = flights.get(key);
      if (flight) { flights.delete(key); flight.controller.abort(); }
    }
    function invalidate(key) { entries.delete(key); cancel(key); }
    function read(key, {fetch, version, validate = value => value, refresh = false, full = false}) {
      const expected = scope(), started = now(), cached = entries.get(key);
      if (flights.has(key)) return flights.get(key).promise;
      if (cached && !refresh) { metric(key, 'memory', started); return Promise.resolve(cached.value); }
      const controller = new AbortController(), flight = {controller};
      flights.set(key, flight);
      flight.promise = Promise.resolve().then(async () => {
        current(expected);
        const knownVersion = !full && cached ? cached.version : undefined;
        const result = await fetch({knownVersion, signal:controller.signal});
        current(expected);
        if (controller.signal.aborted || flights.get(key) !== flight) throw cancelled();
        let value, source = 'full';
        if (result?.notModified === true) {
          if (!cached || full || result.readContract !== CONTRACT || version(result) !== knownVersion) throw new Error('資料版本核對失敗，請重新讀取');
          value = cached.value; source = 'unchanged';
        } else {
          value = await validate(result);
          current(expected);
          if (controller.signal.aborted || flights.get(key) !== flight) throw cancelled();
          const nextVersion = version(value);
          if (nextVersion === undefined || nextVersion === null || nextVersion === '') throw new Error('資料缺少版本識別');
          entries.set(key, {version:nextVersion, value});
          while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
        }
        metric(key, source, started); return value;
      }).catch(error => {
        if (flights.get(key) === flight) entries.delete(key);
        throw error;
      }).finally(() => { if (flights.get(key) === flight) flights.delete(key); });
      return flight.promise;
    }
    return {read, clear, invalidate, cancel};
  }
  return {create, tokenDeadline, CONTRACT};
});
