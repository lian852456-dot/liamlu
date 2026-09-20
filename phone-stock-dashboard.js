(() => {
  'use strict';
  const Core = window.PhoneStockCore;
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const SUPPORTED_EXTENSIONS = new Set(['xlsx', 'xls', 'csv', 'tsv']);
  const state = { sales:null, stock:null, report:null };
  const $ = id => document.getElementById(id);
  const taipeiToday = () => {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit' })
      .formatToParts(new Date()).reduce((result, part) => { result[part.type] = part.value; return result; }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  const displayCount = value => new Intl.NumberFormat('zh-TW', { maximumFractionDigits:1 }).format(Number(value || 0));
  const displayRate = value => value == null ? '—' : `${(Number(value) * 100).toFixed(1)}%`;
  const extensionOf = file => String(file && file.name || '').split('.').pop().toLowerCase();
  const csvTextScore = value => (String(value).match(/店點|門市|品名|庫存|銷貨|日期|數量|區域|營業點/g) || []).length * 10 - (String(value).match(/�/g) || []).length * 50;

  function setMessage(kind, message, type) {
    const target = $(kind === 'sales' ? 'salesMessage' : 'stockMessage');
    target.textContent = message || '';
    target.className = `message${type ? ` ${type}` : ''}`;
  }
  function validateFile(file, kind) {
    const label = kind === 'sales' ? '銷售檔' : '庫存檔';
    const extension = extensionOf(file);
    if (!file || !SUPPORTED_EXTENSIONS.has(extension)) { setMessage(kind, `${label}只接受 XLSX、XLS、CSV 或 TSV。`, 'error'); return false; }
    if (!file.size) { setMessage(kind, `${label}是空檔，請重新匯出。`, 'error'); return false; }
    if (file.size > MAX_FILE_BYTES) { setMessage(kind, `${label}超過 20 MB，請先縮小報表範圍再重試。`, 'error'); return false; }
    return true;
  }
  function sheetRows(workbook) {
    return workbook.SheetNames.map(name => ({ name, rows:window.XLSX.utils.sheet_to_json(workbook.Sheets[name], { header:1, raw:true, defval:'', blankrows:false }) }));
  }
  async function readWorkbook(file) {
    const buffer = await file.arrayBuffer();
    const extension = extensionOf(file);
    if (extension !== 'csv' && extension !== 'tsv') return { workbook:window.XLSX.read(buffer, { type:'array', cellDates:true }), encoding:'' };
    const utf8 = new TextDecoder('utf-8').decode(buffer);
    let content = utf8;
    let encoding = 'UTF-8';
    try {
      const big5 = new TextDecoder('big5').decode(buffer);
      if (csvTextScore(big5) > csvTextScore(utf8)) { content = big5; encoding = 'Big5'; }
    } catch (_) { /* Browser does not provide a Big5 decoder; retain UTF-8. */ }
    return { workbook:window.XLSX.read(content, { type:'string', cellDates:true, FS:extension === 'tsv' ? '\t' : ',' }), encoding };
  }
  function refreshPreview() {
    const ready = Boolean(state.sales && state.stock);
    const stores = new Set([...(state.sales ? state.sales.rows : []), ...(state.stock ? state.stock.rows : [])].map(row => row.store));
    $('salesRows').textContent = state.sales ? String(state.sales.rows.length) : '0';
    $('stockRows').textContent = state.stock ? String(state.stock.rows.length) : '0';
    $('detectedStores').textContent = String(stores.size);
    $('importPreview').hidden = !state.sales && !state.stock;
    $('generateReport').disabled = !ready;
    const notes = [];
    if (state.sales) notes.push(`銷售：${state.sales.fileName}／${state.sales.sheetName}`);
    if (state.stock) notes.push(`庫存：${state.stock.fileName}／${state.stock.sheetName}`);
    $('importNote').textContent = ready ? `${notes.join(' · ')}。兩份資料皆完成，可產生分析。` : `${notes.join(' · ')}。請再選擇另一份資料。`;
    $('uploadStatus').textContent = ready ? '可產生分析' : '尚待選檔';
    $('uploadStatus').className = `status-badge ${ready ? 'ok' : 'neutral'}`;
  }
  async function parseFile(file, kind) {
    if (!validateFile(file, kind)) return;
    const label = kind === 'sales' ? 'salesFileName' : 'stockFileName';
    $(label).textContent = file.name;
    setMessage(kind, '正在本機解析檔案…');
    try {
      const loaded = await readWorkbook(file);
      const selected = Core.chooseBestSheet(sheetRows(loaded.workbook), kind, $('asOfDate').value);
      if (!selected) throw new Error(kind === 'sales' ? '找不到可辨識的北一二B銷售工作表；請確認店點、機型、日期及銷售數欄。' : '找不到可辨識的北一二B庫存工作表；請確認店點、機型及庫存數欄。');
      state[kind] = { rows:selected.parsed.rows, fileName:file.name, sheetName:selected.name };
      const warnings = selected.parsed.warnings.length ? `\n${selected.parsed.warnings.join('\n')}` : '';
      const encoding = loaded.encoding ? `／${loaded.encoding}` : '';
      setMessage(kind, `解析完成：${selected.parsed.rows.length} 列／${selected.name}${encoding}。${warnings}`, selected.parsed.warnings.length ? '' : 'success');
      refreshPreview();
    } catch (error) {
      state[kind] = null;
      setMessage(kind, error.message || '檔案解析失敗。', 'error');
      refreshPreview();
    }
  }
  function rateCell(value) {
    if (value == null) return '<span class="rate">—</span>';
    const className = value >= .5 ? 'good' : 'low';
    return `<span class="rate ${className}">${displayRate(value)}</span>`;
  }
  const displaySalesDate = iso => String(iso || '').slice(5).replace('-', '/');
  function salesHeaderCells(report) {
    return report.salesDates.map(date => `<th>${displaySalesDate(date)}</th>`).join('') + '<th>加總</th>';
  }
  function salesValueCells(row, report) {
    return report.salesDates.map(date => `<td>${displayCount((row.salesByDate || {})[date] || 0)}</td>`).join('') + `<td>${displayCount(row.sales)}</td>`;
  }
  function minimumValue(id) {
    const value = $(id).value.trim();
    if (!value) return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }
  function renderModelRows() {
    const selected = $('storeFilter').value;
    const rows = selected === 'all' ? state.report.modelSummary : state.report.storeModels[selected];
    const query = $('modelQuery').value.trim().toLocaleLowerCase('zh-Hant');
    const minSales = minimumValue('minSales');
    const minStock = minimumValue('minStock');
    const filtered = (rows || []).filter(row => (!query || row.model.toLocaleLowerCase('zh-Hant').includes(query)) && (minSales == null || row.sales >= minSales) && (minStock == null || row.stock >= minStock));
    $('modelFilterSummary').textContent = `顯示 ${filtered.length} / ${(rows || []).length} 款機型`;
    const columnCount = state.report.salesDates.length + 4;
    $('modelRows').innerHTML = filtered.length ? filtered.map(row => `<tr><td><strong>${escapeHtml(row.model)}</strong></td>${salesValueCells(row, state.report)}<td>${displayCount(row.stock)}</td><td>${rateCell(row.rate)}</td></tr>`).join('') : `<tr><td class="empty-row" colspan="${columnCount}">沒有符合篩選條件的機型。</td></tr>`;
  }
  function renderReport() {
    const report = state.report;
    const salesDateLabel = report.salesDates.length ? report.salesDates.map(displaySalesDate).join('、') : `${report.startDate} ～ ${report.endDate}`;
    $('sourceMeta').textContent = `報表銷售日期 ${salesDateLabel} · ${report.stockDate ? `庫存快照 ${report.stockDate}` : '庫存檔未提供日期，依本次上傳內容計算'} · 僅本機預覽`;
    $('totalSales').textContent = displayCount(report.totalSales);
    $('totalStock').textContent = displayCount(report.totalStock);
    $('totalRate').textContent = displayRate(report.totalRate);
    $('activeStores').textContent = `${report.storeSummary.filter(row => row.sales > 0).length} / 9`;
    $('storeTableHead').innerHTML = `<th>店點</th>${salesHeaderCells(report)}<th>目前庫存</th><th>去化率</th>`;
    $('modelTableHead').innerHTML = `<th>機型</th>${salesHeaderCells(report)}<th>目前庫存</th><th>去化率</th>`;
    $('storeRows').innerHTML = report.storeSummary.map(row => `<tr><td><strong>${escapeHtml(row.store)}</strong></td>${salesValueCells(row, report)}<td>${displayCount(row.stock)}</td><td>${rateCell(row.rate)}</td></tr>`).join('');
    $('storeFilter').innerHTML = '<option value="all">北一二B 整體</option>' + Core.STORE_NAMES.map(store => `<option value="${escapeHtml(store)}">${escapeHtml(store)}</option>`).join('');
    renderModelRows();
    $('results').hidden = false;
    $('results').scrollIntoView({ behavior:'smooth', block:'start' });
  }
  function generateReport() {
    if (!state.sales || !state.stock) return;
    try {
      state.report = Core.buildReport(state.sales.rows, state.stock.rows, $('asOfDate').value);
      renderReport();
    } catch (error) { setMessage('sales', error.message || '無法產生分析。', 'error'); }
  }

  $('asOfDate').value = taipeiToday();
  $('salesFile').addEventListener('change', event => parseFile(event.target.files && event.target.files[0], 'sales'));
  $('stockFile').addEventListener('change', event => parseFile(event.target.files && event.target.files[0], 'stock'));
  $('generateReport').addEventListener('click', generateReport);
  $('storeFilter').addEventListener('change', renderModelRows);
  ['modelQuery', 'minSales', 'minStock'].forEach(id => $(id).addEventListener('input', renderModelRows));
  $('clearModelFilters').addEventListener('click', () => {
    $('modelQuery').value = ''; $('minSales').value = ''; $('minStock').value = ''; renderModelRows();
  });
  $('asOfDate').addEventListener('change', () => {
    state.sales = null; state.stock = null; state.report = null; $('results').hidden = true;
    $('salesFile').value = ''; $('stockFile').value = '';
    $('salesFileName').textContent = '選擇 Excel／CSV 檔案'; $('stockFileName').textContent = '選擇 Excel／CSV 檔案';
    setMessage('sales', '已變更資料截止日，請重新選擇兩份檔案。'); setMessage('stock', ''); refreshPreview();
  });
})();
