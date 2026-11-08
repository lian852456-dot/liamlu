// On-demand loader for large third-party libraries.
// SheetJS (~930 KB) and officecrypto (~665 KB) are only needed when a user
// picks a file or exports a spreadsheet, so pages load them here instead of
// with a blocking <script> tag.
//
// Guarantees:
// - each library is fetched at most once at a time; concurrent callers share it
// - each attempt times out (25 s) and its <script> element is removed
// - one automatic retry, then a clear error; the next call starts over
// - a visible notice while a download takes longer than a moment
// - run() keeps an export/import from starting twice while it waits
(function (root) {
  'use strict';
  if (root.VendorLoader) return;

  const LIBS = {
    xlsx: {
      label: '試算表元件',
      src: 'assets/vendor/xlsx.full.min.js',
      ready: () => !!(root.XLSX && root.XLSX.utils && typeof root.XLSX.read === 'function'),
    },
    officecrypto: {
      label: '加密檔解密元件',
      src: 'assets/vendor/officecrypto.bundle.min.js?v=0.0.19',
      ready: () => !!(root.OfficeCrypto && typeof root.OfficeCrypto.isEncrypted === 'function'),
    },
  };
  const config = { timeoutMs: 25000, attempts: 2, noticeDelayMs: 250 };
  const pending = Object.create(null);
  const inflight = Object.create(null);

  // ---- visible notice -------------------------------------------------
  let notice = null, noticeTimer = 0, active = 0;
  function showNotice(text) {
    if (!document.body) return;
    if (!notice) {
      notice = document.createElement('div');
      notice.id = 'vendorLoaderNotice';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      notice.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;'
        + 'max-width:calc(100vw - 32px);box-sizing:border-box;padding:10px 16px;border-radius:999px;'
        + 'background:rgba(20,24,31,.92);color:#fff;font:600 14px/1.4 system-ui,-apple-system,"PingFang TC","Noto Sans TC",sans-serif;'
        + 'box-shadow:0 4px 16px rgba(0,0,0,.25);pointer-events:none;text-align:center';
    }
    notice.textContent = text;
    if (!notice.isConnected) document.body.appendChild(notice);
  }
  function beginNotice(lib) {
    active += 1;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { if (active) showNotice(`正在下載${lib.label}，首次使用約需數秒…`); }, config.noticeDelayMs);
  }
  function endNotice() {
    active = Math.max(0, active - 1);
    if (active) return;
    clearTimeout(noticeTimer);
    if (notice) notice.remove();
  }

  // ---- loading --------------------------------------------------------
  function attempt(name, lib, number) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = lib.src;
      script.async = true;
      script.dataset.vendor = name;
      let done = false;
      const finish = (error) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        script.onload = script.onerror = null;
        if (error) { script.remove(); reject(error); } else resolve();
      };
      const timer = setTimeout(() => {
        finish(Object.assign(new Error(`${lib.label}下載逾時（超過 ${Math.round(config.timeoutMs / 1000)} 秒），請確認網路後再按一次。`), { code: 'VENDOR_TIMEOUT' }));
      }, config.timeoutMs);
      script.onload = () => (lib.ready() ? finish() : finish(Object.assign(new Error(`${lib.label}載入不完整，請再按一次。`), { code: 'VENDOR_INVALID' })));
      script.onerror = () => finish(Object.assign(new Error(`${lib.label}載入失敗，請確認網路連線後再按一次。`), { code: 'VENDOR_NETWORK' }));
      if (number > 1) showNotice(`下載較慢，正在重試${lib.label}…`);
      document.head.appendChild(script);
    });
  }

  function load(name) {
    const lib = LIBS[name];
    if (!lib) return Promise.reject(new Error('未知的元件：' + name));
    if (lib.ready()) return Promise.resolve();
    if (pending[name]) return pending[name];
    beginNotice(lib);
    pending[name] = (async () => {
      let lastError;
      try {
        for (let number = 1; number <= config.attempts; number += 1) {
          try { await attempt(name, lib, number); return; }
          catch (error) { lastError = error; if (lib.ready()) return; }
        }
        throw lastError;
      } finally {
        delete pending[name];
        endNotice();
      }
    })();
    return pending[name];
  }

  function ensure(...names) {
    return Promise.all(names.map(load)).then(() => undefined);
  }

  // Start downloads early without waiting or throwing.
  function warm(...names) {
    names.forEach(name => { load(name).catch(() => {}); });
  }

  // Runs task once the libraries are ready; a second call with the same key
  // while the first is still waiting or running is ignored (no double export).
  // The button, if given, is disabled meanwhile and restored afterwards.
  // Authorization and data checks belong inside task, so they run after the
  // wait: an export started before a logout is refused by the page's own checks.
  // options.isCurrent(): when it returns false after the wait (logged out,
  // page locked, workspace gone), the task and its error handler are skipped.
  // options.cooldownMs: keep the key busy (button disabled) this long after
  // the task ran, so quick repeat taps once the library is ready do not
  // export again; a deliberate second export after the pause still works.
  async function run(key, names, task, options = {}) {
    if (inflight[key]) return false;
    inflight[key] = true;
    const button = options.button || null;
    const wasDisabled = button ? button.disabled : false;
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
    const current = () => typeof options.isCurrent !== 'function' || options.isCurrent();
    try {
      await ensure(...names);
      if (!current()) return false;
      await task();
      if (options.cooldownMs > 0) await new Promise(resolve => setTimeout(resolve, options.cooldownMs));
      return true;
    } catch (error) {
      if (!current()) return false;
      if (typeof options.onError === 'function') options.onError(error);
      else throw error;
      return false;
    } finally {
      delete inflight[key];
      if (button && button.isConnected) { button.removeAttribute('aria-busy'); if (!wasDisabled) button.disabled = false; }
    }
  }

  // Pages list what their uploads need: <script src="vendor-loader.js"
  // data-warm="xlsx officecrypto">. Opening any file picker starts those
  // downloads, so they finish while the user is still choosing a file.
  const script = document.currentScript;
  const warmOnPick = String((script && script.dataset.warm) || '').split(/\s+/).filter(name => LIBS[name]);
  if (warmOnPick.length) {
    document.addEventListener('click', event => {
      const target = event.target;
      if (target && target.matches && target.matches('input[type="file"]')) warm(...warmOnPick);
    }, true);
  }

  root.VendorLoader = {
    ensure,
    warm,
    run,
    isReady: name => !!(LIBS[name] && LIBS[name].ready()),
    needsDownload: (...names) => names.some(name => LIBS[name] && !LIBS[name].ready()),
    // Test hook: shorter timeouts so failure paths can be exercised quickly.
    configure: options => { Object.assign(config, options || {}); return { ...config }; },
  };
})(window);
