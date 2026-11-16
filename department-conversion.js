(function() {
  'use strict';
  const $ = id => document.getElementById(id);
  const owner = 'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
  let employeeId = '', adminSecret = '', publication = null, html = '', epoch = 0, controller = null;
  function clear() {
    epoch++; controller?.abort(); controller = null;
    employeeId = ''; adminSecret = ''; publication = null; html = '';
    $('secret').value = ''; $('report').srcdoc = ''; $('coverage').textContent = '';
    $('region').replaceChildren();
    $('workspace').hidden = true; $('auth').hidden = false;
  }
  function show() {
    html = ''; $('report').srcdoc = ''; $('export').disabled = true;
    if (!publication) return;
    const selected = $('region').value;
    let data = publication.regions[selected];
    if (selected === 'all') {
      const regions = window.North12OfficerCore.REGIONS;
      const values = regions.map(region => publication.regions[region]);
      if (values.some(value => !value)) { $('message').textContent = '四區來源尚未齊備，可選擇已有資料的區域查看。'; return; }
      if (new Set(values.map(value => value.period_start + '|' + value.cutoff)).size !== 1) {
        $('message').textContent = '四區截止不同，請先查看各區版本；同期間齊備後顯示部整體比較。'; return;
      }
      data = values.reduce((combined, value) => window.North12OfficerCore.merge(combined, value), null);
    }
    html = window.North12OfficerCore.buildHtml(data, window.North12OfficerExportAssets);
    $('report').srcdoc = html; $('export').disabled = false;
    $('message').textContent = '已讀回正式來源。統計截止 ' + data.cutoff + '，來源 ' + data.source_name;
  }
  async function read() {
    const ticket = ++epoch;
    controller?.abort(); controller = new AbortController();
    const timer = setTimeout(() => controller?.abort(), 45000);
    $('login').disabled = true; $('refresh').disabled = true;
    $('report').srcdoc = ''; $('export').disabled = true; html = ''; publication = null;
    $('coverage').textContent = ''; $('region').replaceChildren();
    try {
      const response = await fetch(owner, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify({action:'readonly_conversion_department_read', employeeId, adminSecret}),
        cache:'no-store', credentials:'omit', signal:controller.signal});
      if (!response.ok) throw Error('正式服務讀取失敗');
      const result = await response.json();
      if (ticket !== epoch) return;
      if (result.status !== 'ok' || !result.live || !('publication' in result)) throw Error(result.message || '部區服務尚未部署或主管驗證未通過');
      $('secret').value = ''; $('auth').hidden = true; $('workspace').hidden = false;
      if (!result.publication) { $('message').textContent = '尚無已發布來源，請從快速上傳發布。'; return; }
      publication = window.ConversionPublicationCore.normalize(result.publication);
      const coverage = window.ConversionPublicationCore.coverage(publication);
      $('coverage').textContent = '正式版本 ' + result.live.revision + '\n' + coverage.map(row => row.region + '：' + (row.available ? row.cutoff + '／' + row.stores + ' 店／' + row.sourceName : '來源未提供')).join('\n');
      $('region').replaceChildren(new Option('北一二部整體', 'all'), ...coverage.filter(row => row.available).map(row => new Option(row.region, row.region)));
      show();
    } catch (error) {
      if (ticket !== epoch) return;
      clear(); $('message').textContent = error.message;
    } finally {
      clearTimeout(timer); $('login').disabled = false; $('refresh').disabled = false;
    }
  }
  $('login').onclick = () => {
    employeeId = $('employee').value.trim().toUpperCase(); adminSecret = $('secret').value;
    if (!employeeId || !adminSecret) { $('message').textContent = '請輸入既有主管員編與管理者驗證碼。'; return; }
    void read();
  };
  $('refresh').onclick = read;
  $('region').onchange = show;
  $('logout').onclick = () => { clear(); $('message').textContent = '已清除本次私有報表。'; };
  $('export').onclick = () => {
    if (!html || !publication) return;
    const url = URL.createObjectURL(new Blob([html], {type:'text/html;charset=utf-8'}));
    const link = document.createElement('a'); link.href = url; link.download = '北一二部_正式締結率.html'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  window.addEventListener('pagehide', clear);
})();
