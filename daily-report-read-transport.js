/* Daily read/pread only. Entries exist only while a request is in flight. */
(function (scope) {
  'use strict';
  function create({getEndpoint, getContext, post, timeoutMs = 30000}) {
    const pending = new Map();
    let isolatedSequence = 0;
    const cancelled = () => new DOMException('讀取已取消，請重新讀取。', 'AbortError');
    function finish(entry, error, value) {
      if (entry.done) return;
      entry.done = true;
      clearTimeout(entry.timer);
      if (pending.get(entry.key) === entry) pending.delete(entry.key);
      for (const consumer of entry.consumers) {
        consumer.signal?.removeEventListener('abort', consumer.abort);
        if (error) consumer.reject(error);
        else consumer.resolve(JSON.parse(JSON.stringify(value)));
      }
      entry.consumers.clear();
    }
    function stop(entry, error = cancelled()) {
      finish(entry, error);
      entry.controller.abort();
    }
    function invalidate({date, seg} = {}) {
      for (const entry of [...pending.values()]) {
        if (date === undefined || (!entry.isolated && entry.payload.date === date && Number(entry.payload.seg) === Number(seg))) stop(entry);
      }
    }
    function read(payload, {signal, force = false, isolated = false} = {}) {
      if (!['read', 'pread'].includes(payload.action)) return Promise.reject(new Error('只允許資料讀取'));
      if (signal?.aborted) return Promise.reject(cancelled());
      payload = JSON.parse(JSON.stringify(payload));
      const context = getContext(), endpoint = getEndpoint();
      const key = JSON.stringify([endpoint, context, Object.keys(payload).sort().map(key => [key, payload[key]]), isolated ? ++isolatedSequence : null]);
      let entry = pending.get(key);
      if (entry && force) { stop(entry); entry = null; }
      if (!entry) {
        entry = {key, context, isolated, payload:{...payload}, consumers:new Set(), controller:new AbortController(), done:false};
        pending.set(key, entry);
        entry.timer = setTimeout(() => {
          const error = new Error('讀取超過 30 秒，請稍後手動重新讀取。');
          error.name = 'TimeoutError'; stop(entry, error);
        }, timeoutMs);
        // Subscribe before starting transport; timeout also covers response decoding.
        Promise.resolve().then(() => {
          if (entry.done) throw cancelled();
          return post(payload, entry.controller.signal, endpoint);
        }).then(value => {
          finish(entry, getContext() === context && getEndpoint() === endpoint ? null : cancelled(), value);
        }, error => finish(entry, error));
      }
      return new Promise((resolve, reject) => {
        const consumer = {resolve, reject, signal};
        consumer.abort = () => {
          entry.consumers.delete(consumer);
          signal.removeEventListener('abort', consumer.abort);
          reject(cancelled());
          if (!entry.consumers.size) stop(entry);
        };
        entry.consumers.add(consumer);
        signal?.addEventListener('abort', consumer.abort, {once:true});
      });
    }
    return Object.freeze({read, invalidate});
  }
  scope.DailyReportReadTransport = Object.freeze({create});
})(globalThis);
