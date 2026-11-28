(function (scope) {
  'use strict';
  function onDemand(src, globalName, method, message) {
    let pending;
    return function load() {
      if (scope[globalName]?.[method]) return Promise.resolve(scope[globalName]);
      if (pending) return pending;
      pending = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        function failed() {
          script.remove();
          pending = null;
          reject(new Error(message));
        }
        script.onload = () => scope[globalName]?.[method] ? resolve(scope[globalName]) : failed();
        script.onerror = failed;
        document.head.append(script);
      });
      return pending;
    };
  }
  scope.loadWorkbookReader = onDemand('assets/vendor/xlsx.full.min.js', 'XLSX', 'read', 'Excel 讀取工具載入失敗，請重新選檔再試一次。');
  scope.loadWorkbookCrypto = onDemand('assets/vendor/officecrypto.bundle.min.js?v=0.0.19', 'OfficeCrypto', 'isEncrypted', 'Excel 解密工具載入失敗，請重新選檔再試一次。');
})(window);
