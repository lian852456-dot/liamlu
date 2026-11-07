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

  // Start downloads early without waiting or throwing.
  function warm(...names) {
    names.forEach(name => { load(name).catch(() => {}); });
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
    ensure: (...names) => Promise.all(names.map(load)).then(() => undefined),
    warm,
    isReady: name => !!(LIBS[name] && LIBS[name].ready()),
  };
})(window);
