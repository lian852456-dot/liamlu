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
    message('targetMessage', `已驗證 ${result.profile.maskedName || '督導'}，AQ／RT 七項正式目標載入完成；將追加今日動態目標。`, 'ok');
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
    const regionCandidates = [];
    const nationalCandidates = [];
    const errors = [];
    matrices.forEach(entry => {
      const regionSummary = Core.parseRegionSummary(entry.matrix, kind);
      if (regionSummary) regionCandidates.push(regionSummary);
      const nationalSummary = Core.parseNationalSummary(entry.matrix, kind);
      if (nationalSummary) nationalCandidates.push(nationalSummary);
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
    const result = candidates.sort((a, b) => b.meta.processedRows - a.meta.processedRows)[0];
    const regionSummary = regionCandidates.sort((a, b) => b.recognizedRegions.length - a.recognizedRegions.length || Number(b.detailScore || 0) - Number(a.detailScore || 0) || b.processedRows - a.processedRows)[0];
    if (regionSummary) {
      regionSummary.recognizedRegions.forEach(key => { result.regions[key] = regionSummary.regions[key]; });
      result.meta.recognizedRegions = Core.REGION_KEYS.filter(key => result.regions[key] && (result.regions[key].total !== 0 || regionSummary.recognizedRegions.includes(key)));
      result.meta.regionSource = 'summary-sheet';
    }
    const nationalSummary = nationalCandidates.sort((a, b) => b.processedRows - a.processedRows || Number(b.detailScore || 0) - Number(a.detailScore || 0))[0];
    if (nationalSummary) {
      result.nationalSummary = nationalSummary;
      result.meta.nationalRows = nationalSummary.processedRows;
    }
    return { result, diagnostic };
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

  function regionDetailTable(kind, analysis) {
    const isRt = kind === 'rt';
    const prefix = isRt ? 'R' : 'A';
    const detailKey = isRt ? 'rt' : 'aq';
    const bands = isRt ? Core.RT_PLAN_BANDS : Core.AQ_PLAN_BANDS;
    const labels = ['督導區', '合計', `${prefix}999↑`, `${prefix}999↑占比`, isRt ? '小R' : '小A', ...bands.map(key => key === '2699' && !isRt ? '2699' : `${prefix}${key}`), '好速', ...(isRt ? ['提前續約'] : [])];
    const rows = Core.REGION_KEYS.map(key => {
      const detail = analysis.regions[key][detailKey];
      const values = [`北一二${key}`, detail.total, detail.up999, Core.percent(detail.up999Rate), detail.small, ...bands.map(band => detail.bands[band]), detail.speed, ...(isRt ? [detail.earlyRenewal] : [])];
      return `<tr class="${key === 'B' ? 'is-home' : ''}">${values.map((value, index) => `<td>${index === 0 ? `<strong>${escapeHtml(value)}</strong>` : escapeHtml(typeof value === 'string' ? value : displayCount(value))}</td>`).join('')}</tr>`;
    }).join('');
    return `<section class="region-detail-block ${isRt ? 'rt-detail' : 'aq-detail'}"><div class="region-detail-title">${prefix === 'A' ? 'AQ' : 'RT'}</div><div class="table-wrap"><table class="region-detail-table"><thead><tr>${labels.map(label => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div><p class="region-detail-note">${prefix}999↑占比＝${prefix}999↑ ÷ 合計；好速接在 2699 後方。</p></section>`;
  }

  function nationalHomeIndex(kind, analysis) {
    const rows = analysis.national && analysis.national[kind] || [];
    const detail = analysis.regions.B[kind];
    const prefix = kind === 'rt' ? 'R' : 'A';
    const candidates = rows.map((row, index) => ({ row, index })).filter(({ row }) => {
      if (!normalizeForMatch(row.department).includes('北一二')) return false;
      const checks = [row.total === detail.total, row.up999 === detail.up999];
      ['999', '1399'].forEach(band => {
        if (row.bands[band] != null) checks.push(row.bands[band] === detail.bands[band]);
      });
      return checks.every(Boolean);
    });
    return candidates.length === 1 ? candidates[0].index : -1;
  }

  function normalizeForMatch(value) {
    return String(value == null ? '' : value).normalize('NFKC').replace(/[\s　_／/()（）【】\[\]：:・·.\-－]+/g, '').toUpperCase();
  }

  function nationalDetailTable(kind, analysis) {
    const rows = analysis.national && analysis.national[kind] || [];
    if (!rows.length) {
      return `<section class="region-detail-block national-missing"><div class="region-detail-title">${kind === 'rt' ? 'RT' : 'AQ'} 全國戰情</div><p>這份原始檔未辨識到全國彙總表；下方僅顯示北一二 A／B／C／D，不能視為全國數字。</p>${regionDetailTable(kind, analysis)}</section>`;
    }
    const isRt = kind === 'rt';
    const prefix = isRt ? 'R' : 'A';
    const bands = isRt ? Core.RT_PLAN_BANDS : Core.AQ_PLAN_BANDS;
    const showRanks = rows.some(row => row.ranks && (row.ranks.total != null || row.ranks.up999 != null));
    const labels = ['部', '合計', `${prefix}999↑`, `${prefix}999↑占比`, isRt ? '小R' : '小A', ...bands.map(key => key === '2699' && !isRt ? '2699' : `${prefix}${key}`), '好速', ...(isRt ? ['提前續約'] : []), ...(showRanks ? [`RANK ${isRt ? 'RT' : 'AQ'}`, `RANK ${prefix}999`] : [])];
    const homeIndex = nationalHomeIndex(kind, analysis);
    const totalRow = analysis.nationalTotals && analysis.nationalTotals[kind];
    const renderRow = (row, rowIndex, extraClass) => {
      const values = [row.department, row.total, row.up999, Core.percent(row.up999Rate), row.small, ...bands.map(band => row.bands[band]), row.speed, ...(isRt ? [row.earlyRenewal] : []), ...(showRanks ? [row.ranks.total, row.ranks.up999] : [])];
      return `<tr class="${[extraClass, rowIndex === homeIndex ? 'is-home' : ''].filter(Boolean).join(' ')}">${values.map((value, index) => `<td>${index === 0 ? `<strong>${escapeHtml(value)}</strong>` : escapeHtml(typeof value === 'string' ? value : displayCount(value))}</td>`).join('')}</tr>`;
    };
    const body = `${totalRow ? renderRow(totalRow, -1, 'is-national-total') : ''}${rows.map((row, rowIndex) => renderRow(row, rowIndex, '')).join('')}`;
    return `<section class="region-detail-block ${isRt ? 'rt-detail' : 'aq-detail'}"><div class="region-detail-title">全國 ${isRt ? 'RT' : 'AQ'} 戰情｜${rows.length} 列</div><div class="table-wrap"><table class="region-detail-table national-detail-table"><thead><tr>${labels.map(label => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div><p class="region-detail-note">依原始全國彙總表順序呈現；好速固定接在 ${isRt ? 'R2699' : '2699'} 後。${homeIndex >= 0 ? '深藍列為北一二B。' : '若原表無法唯一對應北一二B，將不任意標色。'}</p></section>`;
  }

  function metricCell(metric) {
    const target = metric.todayGoal;
    if (target == null) return `<strong>${displayCount(metric.actual)}</strong><small>目前上線</small>`;
    const detail = metric.gap > 0 ? `缺 ${displayCount(metric.gap)}` : '達標';
    return `<strong>${displayCount(metric.actual)}<span> / ${displayCount(target)}</span></strong><small class="${metric.gap > 0 ? 'negative' : 'positive'}">${detail}</small>`;
  }

  function storeMetricSequence(store) {
    return [
      ['AQ上線', { actual: store.aqActual, todayGoal: store.aqTodayGoal, gap: store.aqGap }],
      ['A999', store.metrics.A999], ['A1399', store.metrics.A1399],
      ['RT上線', { actual: store.rtActual, todayGoal: store.rtTodayGoal, gap: store.rtGap }],
      ['R999', store.metrics.R999], ['R1399', store.metrics.R1399], ['好速', store.metrics['好速']]
    ];
  }

  function storeGapEntries(store) {
    return storeMetricSequence(store).filter(([, metric]) => metric.gap > 0).map(([label, metric]) => `${label}缺${displayCount(metric.gap)}`);
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
      return `<tr><td><strong>${escapeHtml(store.name)}</strong></td>${values.map(value => `<td${value ? ' class="product-hit"' : ''}>${displayCount(value)}</td>`).join('')}<td><strong>${displayCount(values.reduce((total, value) => total + value, 0))}</strong></td></tr>`;
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

  const EXPORT_COLORS = {
    navy: '#07182a', blue: '#0b69a7', green: '#087a60', red: '#bd2d3a', amber: '#a55d00',
    ink: '#132f46', muted: '#66798b', line: '#d7e2ea', paper: '#ffffff', bg: '#f3f7fa'
  };

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function exportSurface(width, height, requestedScale) {
    const scale = requestedScale == null ? 2 : requestedScale;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);
    ctx.fillStyle = EXPORT_COLORS.bg;
    ctx.fillRect(0, 0, width, height);
    ctx.textBaseline = 'middle';
    return { canvas, ctx };
  }

  function drawExportHeader(ctx, width, title, subtitle) {
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    gradient.addColorStop(0, EXPORT_COLORS.navy);
    gradient.addColorStop(.68, '#0a4770');
    gradient.addColorStop(1, '#0b8eb0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, 132);
    ctx.fillStyle = '#63d9ef'; ctx.font = '800 19px system-ui, "Microsoft JhengHei", sans-serif';
    ctx.fillText('北一二B｜行進間戰報', 54, 34);
    ctx.fillStyle = '#ffffff'; ctx.font = '900 36px system-ui, "Microsoft JhengHei", sans-serif';
    ctx.fillText(title, 54, 76);
    ctx.fillStyle = '#d8eff8'; ctx.font = '600 18px system-ui, "Microsoft JhengHei", sans-serif';
    ctx.fillText(subtitle, 54, 112);
  }

  function drawExportFooter(ctx, width, height) {
    ctx.strokeStyle = EXPORT_COLORS.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(48, height - 55); ctx.lineTo(width - 48, height - 55); ctx.stroke();
    ctx.fillStyle = EXPORT_COLORS.muted; ctx.font = '500 16px system-ui, "Microsoft JhengHei", sans-serif';
    ctx.fillText('本機 AQ／RT 即時解析｜原始檔未上傳｜正式成績以公司報表為準', 48, height - 28);
  }

  function drawCell(ctx, x, y, width, height, fill, stroke) {
    ctx.fillStyle = fill || EXPORT_COLORS.paper; roundedRect(ctx, x, y, width, height, 10); ctx.fill();
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }

  function truncateCanvasText(ctx, value, maxWidth) {
    const textValue = String(value == null ? '' : value);
    if (ctx.measureText(textValue).width <= maxWidth) return textValue;
    let result = textValue;
    while (result && ctx.measureText(`${result}…`).width > maxWidth) result = result.slice(0, -1);
    return `${result}…`;
  }

  function wrapCanvasText(ctx, value, maxWidth, maxLines) {
    const chars = Array.from(String(value == null ? '' : value));
    const lines = [];
    let line = '';
    chars.forEach(char => {
      if (lines.length >= maxLines) return;
      const next = line + char;
      if (line && ctx.measureText(next).width > maxWidth) { lines.push(line); line = char; }
      else line = next;
    });
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines && chars.join('') !== lines.join('')) lines[maxLines - 1] = truncateCanvasText(ctx, `${lines[maxLines - 1]}…`, maxWidth);
    return lines;
  }

  function exportTimeLabel() {
    return new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  }

  function fileStamp() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}${values.month}${values.day}_${values.hour}${values.minute}`;
  }

  function createSummaryPng(analysis) {
    const aqRows = analysis.national && analysis.national.aq || [];
    const rtRows = analysis.national && analysis.national.rt || [];
    const rowHeight = 44, groupHeight = 42, headHeight = 54, tableY = 188;
    const displayRows = (kind) => {
      const rows = kind === 'rt' ? rtRows : aqRows;
      if (rows.length) return rows;
      return Core.REGION_KEYS.map(key => ({ department: `北一二${key}`, ...analysis.regions[key][kind], ranks: { total: null, up999: null } }));
    };
    const aqDisplayRows = displayRows('aq'), rtDisplayRows = displayRows('rt');
    const blockHeight = (rows, hasTotal) => groupHeight + headHeight + (rows.length + (hasTotal ? 1 : 0)) * rowHeight;
    const height = tableY + blockHeight(aqDisplayRows, analysis.nationalTotals && analysis.nationalTotals.aq) + blockHeight(rtDisplayRows, analysis.nationalTotals && analysis.nationalTotals.rt) + 24 + 80;
    const width = 2020;
    const { canvas, ctx } = exportSurface(width, height, 1);
    const targetNote = analysis.dynamic.available
      ? `北一二B目標已載入；各店今日差異請看第③張`
      : '尚未載入今日目標｜本圖先顯示 AQ／RT／好速完整資費明細';
    drawExportHeader(ctx, width, '① 全國 AQ／RT 完整戰情', `${exportTimeLabel()} 產生｜${targetNote}`);

    function drawRegionBlock(kind, startY) {
      const isRt = kind === 'rt';
      const prefix = isRt ? 'R' : 'A';
      const detailKey = isRt ? 'rt' : 'aq';
      const bands = isRt ? Core.RT_PLAN_BANDS : Core.AQ_PLAN_BANDS;
      const sourceRows = isRt ? rtDisplayRows : aqDisplayRows;
      const nationalRows = isRt ? rtRows : aqRows;
      const nationalTotal = analysis.nationalTotals && analysis.nationalTotals[kind];
      const canvasRows = nationalTotal ? [nationalTotal, ...sourceRows] : sourceRows;
      const showRanks = nationalRows.some(row => row.ranks && (row.ranks.total != null || row.ranks.up999 != null));
      const labels = ['部', '合計', `${prefix}999↑`, `${prefix}999↑占比`, isRt ? '小R' : '小A', ...bands.map(key => key === '2699' && !isRt ? '2699' : `${prefix}${key}`), '好速', ...(isRt ? ['提前續約'] : []), ...(showRanks ? [`RANK ${isRt ? 'RT' : 'AQ'}`, `RANK ${prefix}999`] : [])];
      const widths = [170, 105, 120, 145, 100, ...bands.map(() => 105), 110, ...(isRt ? [140] : []), ...(showRanks ? [120, 125] : [])];
      const tableWidth = widths.reduce((total, value) => total + value, 0);
      const left = Math.round((width - tableWidth) / 2);
      ctx.fillStyle = '#c9f6ca'; ctx.fillRect(left, startY, tableWidth, groupHeight);
      ctx.strokeStyle = EXPORT_COLORS.line; ctx.strokeRect(left, startY, tableWidth, groupHeight);
      ctx.fillStyle = EXPORT_COLORS.navy; ctx.font = '950 22px system-ui, "Microsoft JhengHei", sans-serif';
      ctx.fillText(`${nationalRows.length ? '全國 ' : '北一二 A／B／C／D（非全國）'}${isRt ? 'RT' : 'AQ'}`, width / 2 - 90, startY + 26);
      let x = left;
      labels.forEach((label, index) => {
        ctx.fillStyle = index === 0 ? '#6d2ca5' : '#fff600'; ctx.fillRect(x, startY + groupHeight, widths[index], headHeight);
        ctx.strokeStyle = EXPORT_COLORS.line; ctx.strokeRect(x, startY + groupHeight, widths[index], headHeight);
        ctx.fillStyle = index === 0 ? '#ffffff' : EXPORT_COLORS.ink; ctx.font = '900 16px system-ui, "Microsoft JhengHei", sans-serif';
        const labelWidth = ctx.measureText(label).width;
        ctx.fillText(label, x + Math.max(8, (widths[index] - labelWidth) / 2), startY + groupHeight + 35);
        x += widths[index];
      });
      const homeIndex = nationalRows.length ? nationalHomeIndex(kind, analysis) : 1;
      canvasRows.forEach((row, rowIndex) => {
        const isTotal = Boolean(nationalTotal && rowIndex === 0);
        const sourceIndex = rowIndex - (nationalTotal ? 1 : 0);
        const detail = nationalRows.length ? row : analysis.regions[Core.REGION_KEYS[sourceIndex]][detailKey];
        const values = [row.department, displayCount(detail.total), displayCount(detail.up999), Core.percent(detail.up999Rate), displayCount(detail.small), ...bands.map(band => displayCount(detail.bands[band])), displayCount(detail.speed), ...(isRt ? [displayCount(detail.earlyRenewal)] : []), ...(showRanks ? [displayCount(detail.ranks.total), displayCount(detail.ranks.up999)] : [])];
        const y = startY + groupHeight + headHeight + rowIndex * rowHeight;
        x = left;
        values.forEach((value, index) => {
          const home = !isTotal && sourceIndex === homeIndex;
          ctx.fillStyle = isTotal ? '#777777' : home ? (index === 0 ? '#274f8d' : '#315a9d') : (index === 0 ? '#eef5f8' : sourceIndex % 2 ? '#fff8dd' : '#ffffff');
          ctx.fillRect(x, y, widths[index], rowHeight);
          ctx.strokeStyle = EXPORT_COLORS.line; ctx.strokeRect(x, y, widths[index], rowHeight);
          ctx.fillStyle = home || isTotal ? '#ffffff' : EXPORT_COLORS.ink; ctx.font = `${index === 0 || home || isTotal ? '900' : '750'} 19px system-ui, "Microsoft JhengHei", sans-serif`;
          const textWidth = ctx.measureText(String(value)).width;
          ctx.fillText(String(value), x + Math.max(8, (widths[index] - textWidth) / 2), y + 43);
          x += widths[index];
        });
      });
    }

    drawRegionBlock('aq', tableY);
    drawRegionBlock('rt', tableY + blockHeight(aqDisplayRows, analysis.nationalTotals && analysis.nationalTotals.aq) + 24);
    drawExportFooter(ctx, width, height);
    return canvas;
  }

  function createStoresPng(analysis) {
    const width = 1900, rowHeight = 96, tableY = 188, height = tableY + 58 + analysis.stores.length * rowHeight + 80;
    const { canvas, ctx } = exportSurface(width, height);
    drawExportHeader(ctx, width, '③ 九店 AQ／RT 戰情', `${exportTimeLabel()} 產生｜數字為目前上線 / 今日目標`);
    const labels = ['店點', 'AQ上線', 'A999', 'A1399', 'RT上線', 'R999', 'R1399', '好速', '今日差異'];
    const widths = [160, 150, 150, 150, 150, 150, 150, 150, 520];
    let x = 52;
    labels.forEach((label, index) => {
      ctx.fillStyle = '#e9eff3'; ctx.fillRect(x, tableY, widths[index], 58);
      ctx.fillStyle = EXPORT_COLORS.muted; ctx.font = '800 18px system-ui, "Microsoft JhengHei", sans-serif'; ctx.fillText(label, x + 14, tableY + 29);
      x += widths[index];
    });
    analysis.stores.forEach((store, rowIndex) => {
      const y = tableY + 58 + rowIndex * rowHeight;
      const gaps = storeGapEntries(store);
      const values = [store.name, ...storeMetricSequence(store).map(([, metric]) => {
        return metric.todayGoal == null ? displayCount(metric.actual) : `${displayCount(metric.actual)} / ${displayCount(metric.todayGoal)}`;
      }), analysis.dynamic.available ? (gaps.join('、') || '今日已達標') : '尚未載入目標'];
      x = 52;
      values.forEach((value, index) => {
        ctx.fillStyle = rowIndex % 2 ? '#f8fbfd' : '#ffffff'; ctx.fillRect(x, y, widths[index], rowHeight);
        ctx.strokeStyle = EXPORT_COLORS.line; ctx.strokeRect(x, y, widths[index], rowHeight);
        ctx.fillStyle = index === values.length - 1 ? (gaps.length ? EXPORT_COLORS.red : EXPORT_COLORS.green) : EXPORT_COLORS.ink;
        ctx.font = `${index === 0 || index === values.length - 1 ? '800' : '700'} ${index === values.length - 1 ? 16 : 19}px system-ui, "Microsoft JhengHei", sans-serif`;
        const lines = wrapCanvasText(ctx, value, widths[index] - 24, index === values.length - 1 ? 3 : 2);
        lines.forEach((line, lineIndex) => ctx.fillText(line, x + 12, y + rowHeight / 2 + (lineIndex - (lines.length - 1) / 2) * 23));
        x += widths[index];
      });
    });
    drawExportFooter(ctx, width, height);
    return canvas;
  }

  function createProductsPng(analysis) {
    const models = analysis.productModels;
    const width = 1800, rowHeight = 72, tableY = 188, rows = Math.max(1, models.length), height = tableY + 58 + rows * rowHeight + 80;
    const { canvas, ctx } = exportSurface(width, height);
    drawExportHeader(ctx, width, '② 目前上線商品', `${exportTimeLabel()} 產生｜深紫色格＝該店有設備上線數`);
    if (!models.length) {
      drawCell(ctx, 52, tableY, width - 104, 130, '#ffffff', EXPORT_COLORS.line);
      ctx.fillStyle = EXPORT_COLORS.muted; ctx.font = '700 24px system-ui, "Microsoft JhengHei", sans-serif'; ctx.fillText('原始檔未提供可辨識的商品型號', 82, tableY + 65);
      drawExportFooter(ctx, width, height); return canvas;
    }
    const modelWidth = 440, totalWidth = 110, storeWidth = (width - 104 - modelWidth - totalWidth) / Core.STORE_NAMES.length;
    const labels = ['商品型號', '合計', ...Core.STORE_NAMES];
    const widths = [modelWidth, totalWidth, ...Core.STORE_NAMES.map(() => storeWidth)];
    let x = 52;
    labels.forEach((label, index) => {
      ctx.fillStyle = '#e9eff3'; ctx.fillRect(x, tableY, widths[index], 58);
      ctx.fillStyle = EXPORT_COLORS.muted; ctx.font = '800 17px system-ui, "Microsoft JhengHei", sans-serif';
      ctx.fillText(truncateCanvasText(ctx, label, widths[index] - 16), x + 8, tableY + 29); x += widths[index];
    });
    models.forEach((model, rowIndex) => {
      const y = tableY + 58 + rowIndex * rowHeight;
      const storeValues = Core.STORE_NAMES.map(name => Number(analysis.products[name][model] || 0));
      const values = [model, storeValues.reduce((total, value) => total + value, 0), ...storeValues];
      x = 52;
      values.forEach((value, index) => {
        const hasDevice = index > 1 && Number(value) > 0;
        ctx.fillStyle = hasDevice ? '#6741a5' : '#ffffff'; ctx.fillRect(x, y, widths[index], rowHeight);
        ctx.strokeStyle = EXPORT_COLORS.line; ctx.strokeRect(x, y, widths[index], rowHeight);
        ctx.fillStyle = hasDevice ? '#ffffff' : EXPORT_COLORS.ink; ctx.font = `${index < 2 || value ? '900' : '700'} 18px system-ui, "Microsoft JhengHei", sans-serif`;
        if (index === 0) {
          const lines = wrapCanvasText(ctx, value, widths[index] - 22, 2);
          lines.forEach((line, lineIndex) => ctx.fillText(line, x + 11, y + rowHeight / 2 + (lineIndex - (lines.length - 1) / 2) * 22));
        } else ctx.fillText(String(value), x + widths[index] / 2 - ctx.measureText(String(value)).width / 2, y + rowHeight / 2);
        x += widths[index];
      });
    });
    drawExportFooter(ctx, width, height);
    return canvas;
  }

  function createGiftsPng(analysis) {
    const rows = analysis.giftAudit;
    const width = 1600, rowHeight = 76, tableY = 188, count = Math.max(1, rows.length), height = tableY + 58 + count * rowHeight + 80;
    const { canvas, ctx } = exportSurface(width, height);
    drawExportHeader(ctx, width, '④ KKBOX／MyVideo 漏搭提醒', `${exportTimeLabel()} 產生｜5G 599 型含以上・提前續約適用・企客排除`);
    if (!rows.length) {
      drawCell(ctx, 52, tableY, width - 104, 130, '#e8f7f1', '#b9ddcf');
      ctx.fillStyle = EXPORT_COLORS.green; ctx.font = '900 28px system-ui, "Microsoft JhengHei", sans-serif'; ctx.fillText('目前沒有辨識到符合資格的漏搭案件', 82, tableY + 65);
      drawExportFooter(ctx, width, height); return canvas;
    }
    const labels = ['店點', '承辦人', '遮罩門號／案件', '資費', '類型', '缺少項目'];
    const widths = [170, 200, 260, 160, 210, 490];
    let x = 52;
    labels.forEach((label, index) => { ctx.fillStyle = '#fff0e6'; ctx.fillRect(x, tableY, widths[index], 58); ctx.fillStyle = EXPORT_COLORS.amber; ctx.font = '800 18px system-ui, "Microsoft JhengHei", sans-serif'; ctx.fillText(label, x + 12, tableY + 29); x += widths[index]; });
    rows.forEach((item, rowIndex) => {
      const y = tableY + 58 + rowIndex * rowHeight;
      const values = [item.store, item.staff, item.caseId, `5G ${displayCount(item.plan)}`, item.earlyRenewal ? '提前續約' : '一般續約', item.missing.join('、')];
      x = 52;
      values.forEach((value, index) => {
        ctx.fillStyle = rowIndex % 2 ? '#fff8f9' : '#ffffff'; ctx.fillRect(x, y, widths[index], rowHeight); ctx.strokeStyle = EXPORT_COLORS.line; ctx.strokeRect(x, y, widths[index], rowHeight);
        ctx.fillStyle = index === values.length - 1 ? EXPORT_COLORS.red : EXPORT_COLORS.ink; ctx.font = `${index === 0 || index === values.length - 1 ? '800' : '650'} 19px system-ui, "Microsoft JhengHei", sans-serif`;
        ctx.fillText(truncateCanvasText(ctx, value, widths[index] - 24), x + 12, y + rowHeight / 2); x += widths[index];
      });
    });
    drawExportFooter(ctx, width, height);
    return canvas;
  }

  function downloadCanvas(canvas, label) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error('圖片產生失敗。')); return; }
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url; link.download = `行進間戰報_${label}_${fileStamp()}.png`;
        document.body.appendChild(link); link.click(); link.remove();
        scope.setTimeout(() => URL.revokeObjectURL(url), 1500);
        resolve();
      }, 'image/png');
    });
  }

  async function exportPng(kind, button) {
    if (!state.analysis) return;
    const original = button.textContent;
    button.disabled = true; button.classList.add('is-busy'); button.textContent = '產生圖片中…';
    try {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      const builders = { summary: [createSummaryPng, '全國AQRT戰情'], stores: [createStoresPng, '九店AQRT戰情'], products: [createProductsPng, '上線商品'], gifts: [createGiftsPng, '影音漏搭'] };
      const [build, label] = builders[kind];
      await downloadCanvas(build(state.analysis), label);
      button.textContent = '已下載 PNG';
      scope.setTimeout(() => { button.textContent = original; }, 1500);
    } catch (error) {
      button.textContent = '下載失敗，請再試一次';
      scope.setTimeout(() => { button.textContent = original; }, 2500);
    } finally { button.disabled = false; button.classList.remove('is-busy'); }
  }

  function renderAnalysis() {
    state.analysis = Core.analyze(state.aq, state.rt, state.targets, { todayIso: taipeiTodayIso() });
    const a = state.analysis;
    $('regionSummary').innerHTML = nationalDetailTable('aq', a) + nationalDetailTable('rt', a);
    const priorityNames = new Set(a.priority.slice(0, 4).map(store => store.name));
    $('storeRows').innerHTML = a.stores.map(store => {
      const gaps = storeGapEntries(store);
      const gapLabel = !a.dynamic.available ? '載入目標後顯示' : (gaps.length ? gaps.join('、') : '今日已達標');
      return `<tr class="${priorityNames.has(store.name) ? 'priority' : ''}"><td><strong>${escapeHtml(store.name)}</strong></td>${storeMetricSequence(store).map(([, metric]) => `<td class="metric-cell">${metricCell(metric)}</td>`).join('')}<td class="gap ${a.dynamic.available && !gaps.length ? 'done' : ''}">${gapLabel}</td></tr>`;
    }).join('');
    renderProducts(a);
    renderGiftAudit(a);
    const now = new Intl.DateTimeFormat('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    $('generatedAt').textContent = `${now} 產生`;
    $('reportText').value = Core.composeMessage(a, { timeLabel: now });
    $('dynamicNotice').textContent = a.dynamic.available ? a.dynamic.notice : a.dynamic.reason;
    $('dynamicNotice').className = `dynamic-notice${a.dynamic.available && a.dynamic.staleDays > 0 ? ' stale' : ''}`;
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
  $('downloadSummaryBtn').addEventListener('click', event => exportPng('summary', event.currentTarget));
  $('downloadStoresBtn').addEventListener('click', event => exportPng('stores', event.currentTarget));
  $('downloadProductsBtn').addEventListener('click', event => exportPng('products', event.currentTarget));
  $('downloadGiftsBtn').addEventListener('click', event => exportPng('gifts', event.currentTarget));
  $('employeeId').value = scope.localStorage.getItem(EMPLOYEE_KEY) || '';
})(window);
