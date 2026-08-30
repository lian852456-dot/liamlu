(function startLiveBattle(scope) {
  'use strict';

  const Core = scope.LiamLiveBattleCore;
  const API_URL = 'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
  const EMPLOYEE_KEY = 'north12b_private_dashboard_employee_id';
  const DEVICE_KEY = 'north12b_private_dashboard_device_id';
  const TIMEOUT_MS = 20_000;
  const state = { targets: null, aq: null, rt: null, analysis: null };
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
    $('targetMeta').innerHTML = `<span>資料截止 ${cutoff}</span><span>來源 ${escapeHtml(meta.sourceFile || '—')}</span><span>9 店 AQ／RT 目標已鎖定</span>`;
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
    message('targetMessage', `已驗證 ${result.profile.maskedName || '督導'}，正式九店目標載入完成。`, 'ok');
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

  async function parseFile(file, kind) {
    if (!state.targets) throw new Error('請先載入正式 AQ／RT 目標。');
    const matrices = await matricesFromFile(file);
    const candidates = [];
    const errors = [];
    matrices.forEach(entry => {
      try {
        const result = Core.parseMatrix(entry.matrix, { kind, fileName: file.name, stores: state.targets.stores });
        candidates.push({ ...result, sheetName: entry.sheetName });
      } catch (error) { errors.push(error.message); }
    });
    if (!candidates.length) throw new Error(errors[0] || '找不到可辨識的北一二B資料。');
    return candidates.sort((a, b) => b.meta.processedRows - a.meta.processedRows)[0];
  }

  function fileSummary(result) {
    const mode = result.meta.mode === 'points' ? '點數欄加總' : '明細列計件';
    const duplicate = result.meta.duplicateRows ? `，排除重複 ${result.meta.duplicateRows} 筆` : '';
    return `${result.meta.fileName}｜${result.meta.processedRows} 筆｜${mode}${duplicate}`;
  }

  async function handleFile(kind) {
    const input = $(kind === 'aq' ? 'aqFile' : 'rtFile');
    const status = $(kind === 'aq' ? 'aqFileStatus' : 'rtFileStatus');
    const file = input.files[0];
    if (!file) return;
    status.textContent = `${file.name}｜解析中…`;
    try {
      state[kind] = await parseFile(file, kind);
      status.textContent = fileSummary(state[kind]);
      message('fileMessage', `${kind.toUpperCase()} 已完成本機解析；${state[kind].meta.missingStores.length ? `目前無明細店點：${state[kind].meta.missingStores.join('、')}` : '九店皆有明細'}。`, 'ok');
    } catch (error) {
      state[kind] = null;
      input.value = '';
      status.textContent = '解析失敗';
      message('fileMessage', error.message, 'bad');
    }
    updateAnalyzeButton();
  }

  function updateAnalyzeButton() { $('analyzeBtn').disabled = !(state.targets && state.aq && state.rt); }
  function displayCount(value) { return Number.isInteger(value) ? String(value) : Number(value).toFixed(1); }
  function displayRate(value) { return Core.percent(value); }
  function rateClass(value) { return value >= 1 ? 'good' : 'warn'; }

  function renderAnalysis() {
    state.analysis = Core.analyze(state.aq, state.rt, state.targets);
    const a = state.analysis;
    $('regionSummary').innerHTML = `
      <article class="summary-card"><span>全區 AQ</span><strong>${displayRate(a.region.aqRate)}</strong><small>${displayCount(a.region.aqActual)} / ${displayCount(a.region.aqTarget)}${a.region.aqGap > 0 ? `・尚缺 ${displayCount(a.region.aqGap)}` : '・已達標'}</small></article>
      <article class="summary-card rt"><span>全區 RT</span><strong>${displayRate(a.region.rtRate)}</strong><small>${displayCount(a.region.rtActual)} / ${displayCount(a.region.rtTarget)}${a.region.rtGap > 0 ? `・尚缺 ${displayCount(a.region.rtGap)}` : '・已達標'}</small></article>`;
    const priorityNames = new Set(a.priority.slice(0, 4).map(store => store.name));
    $('storeRows').innerHTML = a.stores.map(store => {
      const aqGap = store.aqGap > 0 ? `AQ 缺 ${displayCount(store.aqGap)}` : '';
      const rtGap = store.rtGap > 0 ? `RT 缺 ${displayCount(store.rtGap)}` : '';
      return `<tr class="${priorityNames.has(store.name) ? 'priority' : ''}"><td><strong>${escapeHtml(store.name)}</strong></td><td>${displayCount(store.aqActual)} / ${displayCount(store.aqTarget)}</td><td><span class="rate ${rateClass(store.aqRate)}">${displayRate(store.aqRate)}</span></td><td>${displayCount(store.rtActual)} / ${displayCount(store.rtTarget)}</td><td><span class="rate ${rateClass(store.rtRate)}">${displayRate(store.rtRate)}</span></td><td class="gap ${!aqGap && !rtGap ? 'done' : ''}">${aqGap || rtGap ? [aqGap, rtGap].filter(Boolean).join('、') : '已達標'}</td></tr>`;
    }).join('');
    const now = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    $('generatedAt').textContent = `${now} 產生`;
    $('reportText').value = Core.composeMessage(a, { timeLabel: now });
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
    state.aq = null; state.rt = null; state.analysis = null;
    $('aqFile').value = ''; $('rtFile').value = '';
    $('aqFileStatus').textContent = '尚未選擇'; $('rtFileStatus').textContent = '尚未選擇';
    $('results').hidden = true; updateAnalyzeButton();
    message('fileMessage', '已清除本機 AQ／RT 檔案；正式目標仍保留於此頁記憶體。');
  }

  $('loadTargetsBtn').addEventListener('click', async () => {
    const button = $('loadTargetsBtn');
    button.disabled = true; button.textContent = '驗證中…'; setTargetState('', '讀取中');
    message('targetMessage', '正在驗證 Approved Device 並讀取正式九店目標…', 'busy');
    try { await loadTargets(); }
    catch (error) { state.targets = null; setTargetState('bad', '載入失敗'); message('targetMessage', error.message, 'bad'); updateAnalyzeButton(); }
    finally { button.disabled = false; button.textContent = '驗證並載入目標'; }
  });
  $('aqFile').addEventListener('change', () => handleFile('aq'));
  $('rtFile').addEventListener('change', () => handleFile('rt'));
  $('analyzeBtn').addEventListener('click', renderAnalysis);
  $('resetBtn').addEventListener('click', resetFiles);
  $('copyBtn').addEventListener('click', copyReport);
  $('employeeId').value = scope.localStorage.getItem(EMPLOYEE_KEY) || '';
})(window);
