// On-demand loader for large third-party libraries.
// SheetJS (~930 KB) and officecrypto (~665 KB) are only needed when a user
// picks a file or exports a spreadsheet, so pages load them here instead of
// with a blocking <script> tag. Each library is fetched at most once; a
// failed fetch can be retried on the next call.
(function (root) {
  'use strict';
  if (root.VendorLoader) return;

  const LIBS = {
    xlsx: {
      src: 'assets/vendor/xlsx.full.min.js',
      ready: () => !!(root.XLSX && root.XLSX.utils && typeof root.XLSX.read === 'function'),
    },
    officecrypto: {
      src: 'assets/vendor/officecrypto.bundle.min.js?v=0.0.19',
      ready: () => !!(root.OfficeCrypto && typeof root.OfficeCrypto.isEncrypted === 'function'),
    },
  };
  const pending = Object.create(null);

  function load(name) {
    const lib = LIBS[name];
    if (!lib) return Promise.reject(new Error('未知的元件：' + name));
    if (lib.ready()) return Promise.resolve();
    if (pending[name]) return pending[name];
    pending[name] = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = lib.src;
      script.async = true;
      script.dataset.vendor = name;
      const fail = () => {
        delete pending[name];
        script.remove();
        reject(new Error('檔案解析元件載入失敗，請確認網路連線後再試一次。'));
      };
      script.onload = () => (lib.ready() ? resolve() : fail());
      script.onerror = fail;
      document.head.appendChild(script);
    });
    return pending[name];
  }

  // Start downloads early (e.g. on pointerdown) without waiting or throwing.
  function warm(...names) {
    names.forEach(name => { load(name).catch(() => {}); });
  }

  // XLSX.read in a Web Worker. Same library, same options, same workbook
  // (structured clone); only the thread changes. Falls back to the main
  // thread when workers are unavailable (file://, old browsers) or the
  // worker itself fails to start, so behaviour never depends on it.
  const WORKER_SRC = 'xlsx-read-worker.js?v=20261108-1';
  let workerSeq = 0;
  async function readOnMainThread(data, options) {
    await load('xlsx');
    return root.XLSX.read(data, options);
  }
  function readWorkbook(data, options) {
    if (typeof root.Worker !== 'function' || root.location.protocol === 'file:') {
      return readOnMainThread(data, options);
    }
    let worker;
    try { worker = new root.Worker(WORKER_SRC); } catch (_) { return readOnMainThread(data, options); }
    const id = ++workerSeq;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = () => { settled = true; worker.terminate(); };
      worker.onmessage = event => {
        const reply = event.data || {};
        if (reply.id !== id || settled) return;
        finish();
        if (reply.ok) resolve(reply.workbook);
        else reject(new Error(reply.message));
      };
      // A worker that cannot start (blocked script, CSP, offline without a
      // cached copy) must not leave the upload hanging.
      worker.onerror = event => {
        if (settled) return;
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        finish();
        readOnMainThread(data, options).then(resolve, reject);
      };
      worker.postMessage({ id, data, options: options || {} });
    });
  }

  root.VendorLoader = {
    ensure: (...names) => Promise.all(names.map(load)).then(() => undefined),
    warm,
    readWorkbook,
    isReady: name => !!(LIBS[name] && LIBS[name].ready()),
  };
})(window);
