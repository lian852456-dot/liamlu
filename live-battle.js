(function startLiveBattle(scope) {
  'use strict';

  const Core = scope.LiamLiveBattleCore;
  const API_URL = 'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
  const EMPLOYEE_KEY = 'north12b_private_dashboard_employee_id';
  const DEVICE_KEY = 'north12b_private_dashboard_device_id';
  const TIMEOUT_MS = 20_000;
  const state = { targets: null, aq: null, rt: null, analysis: null, diagnostics: { aq: null, rt: null } };
  const $ = id => document.getElementById(id);

  function message(id, value, tone) {
    const node = $(id);
    node.textContent = value;
    node.className = `message${tone ? ` ${tone}` : ''}`;
  }

  function deviceId() {
    let value = scope.localStorage.getItem(DEVICE_KEY);
    if (value) return value;
    value = scope.crypto && scope.crypto.randomUUID ? scope.crypto.randomUUID().replace(/-/g, '') : '';
    if (!value) throw new Error('此瀏覽器無法建立既有裝置識別。');
    scope.localStorage.setItem(DEVICE_KEY, value);
    return value;
  }

  async function post(payload) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timer = scope.setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const response = await fetch(API_URL, {
          method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(payload), cache: 'no-store', credentials: 'omit', signal: controller.signal
        });
        const body = await response.json();
        if (!response.ok || !body || body.status !== 'ok') throw new Error(body && body.message ? body.message : `正式資料讀取失敗（HTTP ${response.status}）`);
        return body;
      } catch (error) {
        lastError = error && error.name === 'AbortError' ? new Error('正式資料讀取逾時，請稍後重試。') : error;
        if (attempt === 0 && (error && (error.name === 'AbortError' || error instanceof TypeError))) await new Promise(resolve => scope.setTimeout(resolve, 800));
        else throw lastError;
      } finally { scope.clearTimeout(timer); }
    }
    throw lastError;
  }

  function setTargetState(status, label) {
    $('targetBadge').textContent = label;
    $('targetBadge').className = `status-badge${status ? ` ${status}` : ''}`;
  }

  function formatTargetMeta(meta) {
    const cutoff = meta.month && meta.snapshotDay ? `${meta.month}-${String(meta.snapshotDay).padStart(2, '0')}` : '—';
    $('targetMeta').innerHTML = `<span>資料截止 ${cutoff}</span><span>來源 ${escapeHtml(meta.sourceFile || '—')}</span><span>依剩餘天數動態分配今日目標</span>`;
    $('targetMeta').hidden = false;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
  }

  async function loadTargets() {
    const employeeId = $('employeeId').value.trim().toUpperCase();
    if (!employeeId) throw new Error('請輸入既有員工編號。');
    const credential = { employeeId, deviceId: deviceId() };
    await post({ action: 'private_access', ...credential });
    const result = await post({ action: 'kpicalc_access', ...credential });
    if (!result.profile || result.profile.isTrusted !== true) throw new Error('此功能只開放督導帳號使用。');
    state.targets = Core.extractTargets(result.data || {});
    scope.localStorage.setItem(EMPLOYEE_KEY, employeeId);
    setTargetState('ok', '目標已載入');
    formatTargetMeta(state.targets.meta);
    message('targetMessage', `已驗證 ${result.profile.maskedName || '督導'}，五項正式目標載入完成；將追加今日動態目標。`, 'ok');
    updateAnalyzeButton();
  }

  function extension(name) {
    const match = String(name || '').toLowerCase().match(/\.[a-z0-9]+$/);
    return match ? match[0] : '';
  }

  function loadSheetJs() {
    if (scope.XLSX) return Promise.resolve(scope.XLSX);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-live-battle-xlsx]');
      if (existing) { existing.addEventListener('load', () => resolve(scope.XLSX), { once: true }); existing.addEventListener('error', () => reject(new Error('Excel 解析元件載入失敗。')), { once: true }); return; }
      const script = document.createElement('script');
      script.src = 'assets/vendor/xlsx.full.min.js';
      script.dataset.liveBattleXlsx = '1';
      script.onload = () => resolve(scope.XLSX);
      script.onerror = () => reject(new Error('Excel 解析元件載入失敗。'));
      document.head.appendChild(script);
    });
  }

  async function matricesFromFile(file) {
    const ext = extension(file.name);
    const buffer = await file.arrayBuffer();
    if (ext === '.csv' || ext === '.tsv') {
      const source = Core.decodeCsv(buffer);
      return [{ sheetName: ext === '.csv' ? 'CSV' : 'TSV', matrix: Core.parseDelimited(source, Core.separatorFor(source, file.name)) }];
    }
    if (!['.xlsx', '.xls'].includes(ext)) throw new Error('只支援 CSV、TSV、XLSX 或 XLS。');
    const XLSX = await loadSheetJs();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, codepage: 950 });
    return workbook.SheetNames.map(sheetName => ({ sheetName, matrix: XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: true, defval: '' }) }));
  }

  function inspectFile(file, kind, matrices) {
    return {
      kind: kind.toUpperCase(),
      fileName: file.name,
      sheets: matrices.map(entry => ({ sheetName: entry.sheetName, ...Core.inspectMatrix(entry.matrix) }))
    };
  }

  function diagnosticText() {
    const lines = ['【行進間戰報｜安全辨識資訊】', '僅包含檔案結構、欄位名稱與業務分類值，不含姓名、門號或案件資料。'];
    ['aq', 'rt'].forEach(kind => {
      const diagnostic = state.diagnostics[kind];
      if (!diagnostic) return;
      lines.push('', `${diagnostic.kind}｜${diagnostic.fileName}`);
      diagnostic.sheets.forEach(sheet => {
        lines.push(`・${sheet.sheetName}：${sheet.rowCount} 列／${sheet.columnCount} 欄`);
        lines.push(sheet.headers.length ? `  表頭候選：${sheet.headers.join('｜')}` : '  表頭候選：未辨識');
        sheet.safeValues.forEach(group => lines.push(`  ${group.label}（${group.header}）：${group.values.length ? group.values.join('、') : '無值'}`));
      });
    });
    return lines.join('\n');
  }

  function renderDiagnostics() {
    const hasAny = Boolean((state.diagnostics.aq && !state.aq) || (state.diagnostics.rt && !state.rt));
    $('diagnostics').hidden = !hasAny;
    if (hasAny) $('diagnosticText').textContent = diagnosticText();
  }

  async function parseFile(file, kind) {
    const matrices = await matricesFromFile(file);
    const diagnostic = inspectFile(file, kind, matrices);
    const candidates = [];
    const errors = [];
    matrices.forEach(entry => {
      try {
        const result = Core.parseMatrix(entry.matrix, { kind, fileName: file.name, stores: state.targets && state.targets.stores });
        candidates.push({ ...result, sheetName: entry.sheetName });
      } catch (error) { errors.push(error.message); }
    });
    if (!candidates.length) {
      const error = new Error(errors[0] || '找不到可辨識的北一二B資料。');
      error.diagnostic = diagnostic;
      throw error;
    }
    return { result: candidates.sort((a, b) => b.meta.processedRows - a.meta.processedRows)[0], diagnostic };
  }

  function fileSummary(result) {
    const mode = result.meta.mode === 'points' ? '點數欄加總' : '明細列計件';
    const duplicate = result.meta.duplicateRows ? `，排除重複 ${result.meta.duplicateRows} 筆` : '';
    const relevant = result.kind === 'aq' ? ['A999', 'A1399', '好速'] : ['R999', 'R1399', '好速'];
    const metricSummary = relevant.map(key => `${key} ${Core.STORE_NAMES.reduce((total, name) => total + Number(result.metrics && result.metrics[name] && result.metrics[name][key] || 0), 0)}`).join('／');
    return `${result.meta.fileName}｜${result.meta.processedRows} 筆｜${metricSummary}｜${mode}${duplicate}`;
  }

  async function handleFile(kind, options) {
    const settings = options || {};
    const input = $(kind === 'aq' ? 'aqFile' : 'rtFile');
    const status = $(kind === 'aq' ? 'aqFileStatus' : 'rtFileStatus');
    const file = input.files[0];
    if (!file) return;
    state[kind] = null;
    updateAnalyzeButton();
    status.textContent = `${file.name}｜解析中…`;
    try {
      const parsed = await parseFile(file, kind);
      state[kind] = parsed.result;
      state.diagnostics[kind] = parsed.diagnostic;
      status.textContent = fileSummary(state[kind]);
      message('fileMessage', `${kind.toUpperCase()} 已完成本機解析；${state[kind].meta.missingStores.length ? `目前無明細店點：${state[kind].meta.missingStores.join('、')}` : '九店皆有明細'}。`, 'ok');
    } catch (error) {
      state[kind] = null;
      state.diagnostics[kind] = error.diagnostic || null;
      status.textContent = `${file.name}｜待確認欄位`;
      message('fileMessage', `${error.message} 已保留安全辨識資訊；可載入正式目標補入店碼後重試。`, 'bad');
    }
    renderDiagnostics();
    updateAnalyzeButton();
    if (!settings.deferRender && state.aq && state.rt) renderAnalysis();
  }

  function updateAnalyzeButton() { $('analyzeBtn').disabled = !(state.aq && state.rt); }
  function displayCount(value) { return value == null ? '—' : (Number.isInteger(value) ? String(value) : Number(value).toFixed(1)); }
  function displayRate(value) { return Core.percent(value); }
  function rateClass(value) { return value >= 1 ? 'good' : 'warn'; }

  function taipeiTodayIso() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function summaryDetail(actual, target, gap) {
    if (target == null) return '尚未載入今日目標';
    const result = gap > 0 ? `尚缺 ${displayCount(gap)}` : (actual > target ? `超標 ${displayCount(actual - target)}` : '已達標');
    return `${displayCount(actual)} / 今日 ${displayCount(target)}・${result}`;
  }

  function metricCell(metric) {
    const target = metric.todayGoal;
    if (target == null) return `<strong>${displayCount(metric.actual)}</strong><small>目前上線</small>`;
    const detail = metric.gap > 0 ? `缺 ${displayCount(metric.gap)}` : '達標';
    return `<strong>${displayCount(metric.actual)}<span> / ${displayCount(target)}</span></strong><small class="${metric.gap > 0 ? 'negative' : 'positive'}">${detail}</small>`;
  }

  function renderProducts(analysis) {
    const models = analysis.productModels;
    $('productCount').textContent = `${models.length} 款`;
    $('productEmpty').hidden = models.length > 0;
    $('productTableWrap').hidden = models.length === 0;
    if (!models.length) return;
    $('productHead').innerHTML = `<th>店點</th>${models.map(model => `<th>${escapeHtml(model)}</th>`).join('')}<th>合計</th>`;
    $('productRows').innerHTML = analysis.stores.map(store => {
      const values = models.map(model => Number(analysis.products[store.name][model] || 0));
      return `<tr><td><strong>${escapeHtml(store.name)}</strong></td>${values.map(value => `<td class="${value ? 'product-hit' : ''}">${displayCount(value)}</td>`).join('')}<td><strong>${displayCount(values.reduce((total, value) => total + value, 0))}</strong></td></tr>`;
    }).join('');
  }

  function renderGiftAudit(analysis) {
    const rows = analysis.giftAudit;
    $('giftCount').textContent = `${rows.length} 件`;
    $('giftCount').className = `status-badge${rows.length ? ' bad' : ' ok'}`;
    $('giftEmpty').hidden = rows.length > 0;
    $('giftTableWrap').hidden = rows.length === 0;
    $('giftRows').innerHTML = rows.map(item => `<tr class="gift-missing"><td><strong>${escapeHtml(item.store)}</strong></td><td>${escapeHtml(item.staff)}</td><td>${escapeHtml(item.caseId)}</td><td>5G ${displayCount(item.plan)}</td><td>${item.earlyRenewal ? '提前續約' : '一般續約'}</td><td><strong>${escapeHtml(item.missing.join('、'))}</strong></td></tr>`).join('');
  }

  function renderAnalysis() {
    state.analysis = Core.analyze(state.aq, state.rt, state.targets, { todayIso: taipeiTodayIso() });
    const a = state.analysis;
    $('regionSummary').innerHTML = Core.METRIC_KEYS.map((key, index) => {
      const metric = a.region.metrics[key];
      return `<article class="summary-card metric-${index}"><span>全區 ${escapeHtml(key)}</span><strong>${displayCount(metric.actual)}</strong><small>${summaryDetail(metric.actual, metric.todayGoal, metric.gap)}</small></article>`;
    }).join('');
    const priorityNames = new Set(a.priority.slice(0, 4).map(store => store.name));
    $('storeRows').innerHTML = a.stores.map(store => {
      const gaps = Core.METRIC_KEYS.filter(key => store.metrics[key].gap > 0).map(key => `${key} 缺 ${displayCount(store.metrics[key].gap)}`);
      const gapLabel = !a.dynamic.available ? '載入目標後顯示' : (gaps.length ? gaps.join('、') : '今日已達標');
      return `<tr class="${priorityNames.has(store.name) ? 'priority' : ''}"><td><strong>${escapeHtml(store.name)}</strong></td>${Core.METRIC_KEYS.map(key => `<td class="metric-cell">${metricCell(store.metrics[key])}</td>`).join('')}<td class="gap ${a.dynamic.available && !gaps.length ? 'done' : ''}">${gapLabel}</td></tr>`;
    }).join('');
    renderProducts(a);
    renderGiftAudit(a);
    const now = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    $('generatedAt').textContent = `${now} 產生`;
    $('reportText').value = Core.composeMessage(a, { timeLabel: now });
    $('dynamicNotice').textContent = a.dynamic.available
      ? `今日目標依截至 ${a.dynamic.cutoff} 的正式累積實績，分配至剩餘 ${a.dynamic.remainingDays} 天。`
      : a.dynamic.reason;
    $('results').hidden = false;
    $('copyStatus').textContent = '';
    scope.setTimeout(() => $('results').scrollIntoView({ behavior: 'smooth', block: 'start' }), 0);
  }

  async function copyReport() {
    const value = $('reportText').value;
    try {
      if (navigator.clipboard && scope.isSecureContext) await navigator.clipboard.writeText(value);
      else { $('reportText').focus(); $('reportText').select(); document.execCommand('copy'); }
      $('copyStatus').textContent = '已複製，可直接貼到群組。';
    } catch (_) { $('copyStatus').textContent = '複製失敗，請長按文字手動複製。'; }
  }

  function resetFiles() {
    state.aq = null; state.rt = null; state.analysis = null; state.diagnostics = { aq: null, rt: null };
    $('aqFile').value = ''; $('rtFile').value = '';
    $('aqFileStatus').textContent = '尚未選擇'; $('rtFileStatus').textContent = '尚未選擇';
    $('results').hidden = true; $('diagnostics').hidden = true; updateAnalyzeButton();
    $('productRows').innerHTML = ''; $('giftRows').innerHTML = '';
    message('fileMessage', '已清除本機兩份原始檔；正式目標仍保留於此頁記憶體。');
  }

  async function copyDiagnostics() {
    const value = diagnosticText();
    try {
      if (navigator.clipboard && scope.isSecureContext) await navigator.clipboard.writeText(value);
      else { $('diagnosticText').focus(); document.getSelection().selectAllChildren($('diagnosticText')); document.execCommand('copy'); document.getSelection().removeAllRanges(); }
      $('diagnosticCopyStatus').textContent = '已複製，可貼回對話或截圖。';
    } catch (_) { $('diagnosticCopyStatus').textContent = '複製失敗，請直接截圖這個區塊。'; }
  }

  $('loadTargetsBtn').addEventListener('click', async () => {
    const button = $('loadTargetsBtn');
    button.disabled = true; button.textContent = '驗證中…'; setTargetState('', '讀取中');
    message('targetMessage', '正在驗證 Approved Device 並讀取正式九店目標…', 'busy');
    try {
      await loadTargets();
      if ($('aqFile').files[0]) await handleFile('aq', { deferRender: true });
      if ($('rtFile').files[0]) await handleFile('rt', { deferRender: true });
      if (state.aq && state.rt) renderAnalysis();
    }
    catch (error) { state.targets = null; setTargetState('bad', '載入失敗'); message('targetMessage', error.message, 'bad'); updateAnalyzeButton(); }
    finally { button.disabled = false; button.textContent = '驗證並載入目標'; }
  });
  $('aqFile').addEventListener('change', () => handleFile('aq'));
  $('rtFile').addEventListener('change', () => handleFile('rt'));
  $('analyzeBtn').addEventListener('click', renderAnalysis);
  $('resetBtn').addEventListener('click', resetFiles);
  $('copyBtn').addEventListener('click', copyReport);
  $('copyDiagnosticBtn').addEventListener('click', copyDiagnostics);
  $('employeeId').value = scope.localStorage.getItem(EMPLOYEE_KEY) || '';
})(window);
