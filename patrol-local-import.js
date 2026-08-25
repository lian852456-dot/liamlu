(function exposePatrolLocalFileImport(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PatrolLocalFileImport = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildPatrolLocalFileImport() {
  'use strict';

  const VERSION = 'patrol-local-file-import-v1';
  const MAX_FILE_BYTES = 20 * 1024 * 1024;
  const SUPPORTED_EXTENSIONS = Object.freeze(['xlsx', 'xls', 'csv', 'tsv']);
  const FIELDS = Object.freeze([
    'fillTime', 'arriveTime', 'leaveTime', 'district', 'code', 'store',
    'inspector', 'item', 'content', 'result', 'reason'
  ]);
  const OUTPUT_FIELDS = Object.freeze([...FIELDS, 'month']);
  const HEADERS = Object.freeze({
    fillTime:['填表時間'],
    arriveTime:['到店時間'],
    leaveTime:['離店時間'],
    district:['區處別'],
    code:['營業點代碼'],
    store:['檢查店點'],
    inspector:['檢查人員'],
    item:['題號'],
    content:['檢查內容'],
    result:['是否合格'],
    reason:['未查／不合格原因', '未查/不合格原因']
  });

  function text(value) { return String(value == null ? '' : value).trim(); }
  function pad(value) { return String(value).padStart(2, '0'); }
  function normalizeHeader(value) {
    return text(value)
      .replace(/^\uFEFF/, '')
      .replace(/[\s　]+/g, '')
      .replace(/／/g, '/')
      .replace(/[：:]/g, '')
      .toLowerCase();
  }
  function hasContent(row) {
    return Array.isArray(row) && row.some(value => text(value));
  }
  function datePartsValid(parts) {
    if (!parts || parts.year < 1900 || parts.year > 2200 || parts.month < 1 || parts.month > 12 ||
        parts.day < 1 || parts.day > 31 || parts.hour < 0 || parts.hour > 23 ||
        parts.minute < 0 || parts.minute > 59 || parts.second < 0 || parts.second > 59) return false;
    const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
    return probe.getUTCFullYear() === parts.year && probe.getUTCMonth() + 1 === parts.month &&
      probe.getUTCDate() === parts.day;
  }
  function excelSerialParts(value, date1904) {
    const serial = Number(value);
    if (!Number.isFinite(serial) || serial < 1) return null;
    const epoch = Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30);
    const result = new Date(epoch + Math.round(serial * 86400000));
    if (Number.isNaN(result.getTime())) return null;
    return {
      year:result.getUTCFullYear(), month:result.getUTCMonth() + 1, day:result.getUTCDate(),
      hour:result.getUTCHours(), minute:result.getUTCMinutes(), second:result.getUTCSeconds()
    };
  }
  function formatDateTime(parts, includeSeconds) {
    const base = `${parts.year}/${parts.month}/${parts.day} ${pad(parts.hour)}:${pad(parts.minute)}`;
    return includeSeconds ? `${base}:${pad(parts.second)}` : base;
  }
  function normalizeDateTime(value, options) {
    const settings = options || {};
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const parts = {
        year:value.getFullYear(), month:value.getMonth() + 1, day:value.getDate(),
        hour:value.getHours(), minute:value.getMinutes(), second:value.getSeconds()
      };
      return datePartsValid(parts) ? formatDateTime(parts, parts.second !== 0) : '';
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const parts = excelSerialParts(value, Boolean(settings.date1904));
      return parts && datePartsValid(parts) ? formatDateTime(parts, parts.second !== 0) : '';
    }
    const raw = text(value);
    if (!raw) return '';
    if (/^\d{5}(?:\.\d+)?$/.test(raw)) {
      const parts = excelSerialParts(Number(raw), Boolean(settings.date1904));
      return parts && datePartsValid(parts) ? formatDateTime(parts, parts.second !== 0) : '';
    }
    const normalized = raw
      .replace(/[年.\-]/g, '/')
      .replace(/月/g, '/')
      .replace(/日/g, ' ')
      .replace(/[ＴT]/g, ' ')
      .replace(/：/g, ':')
      .replace(/[\s　]+/g, ' ')
      .trim();
    const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (!match) return '';
    const parts = {
      year:Number(match[1]), month:Number(match[2]), day:Number(match[3]),
      hour:Number(match[4]), minute:Number(match[5]), second:Number(match[6] || 0)
    };
    return datePartsValid(parts) ? formatDateTime(parts, match[6] != null) : '';
  }

  function normalizeResult(resultValue, reasonValue) {
    const resultText = text(resultValue);
    const reasonText = text(reasonValue);
    const resultKey = resultText.toLowerCase();
    const reasonKey = reasonText.toLowerCase();
    let result = '';
    if (resultKey === 'v') result = 'v';
    else if (resultKey === 'na' || reasonKey === 'na') result = 'na';
    return {
      result,
      reason:result === 'na' && (!reasonText || reasonKey === 'na') ? 'na' : reasonText
    };
  }

  function headerMap(row) {
    const normalized = (Array.isArray(row) ? row : []).map(normalizeHeader);
    const map = {};
    FIELDS.forEach(field => {
      const aliases = HEADERS[field].map(normalizeHeader);
      const index = normalized.findIndex(value => aliases.includes(value));
      if (index >= 0) map[field] = index;
    });
    return map;
  }
  function detectHeader(matrix, maxRows) {
    const source = Array.isArray(matrix) ? matrix : [];
    const limit = Math.min(source.length, Number(maxRows || 100));
    let best = null;
    for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
      const map = headerMap(source[rowIndex]);
      const fields = FIELDS.filter(field => Number.isInteger(map[field]));
      if (!best || fields.length > best.fields.length) best = { rowIndex, map, fields };
      if (fields.length === FIELDS.length) break;
    }
    return best && best.fields.length ? best : null;
  }
  function isHeaderRow(row) {
    const detected = headerMap(row);
    return FIELDS.filter(field => Number.isInteger(detected[field])).length === FIELDS.length;
  }

  function canonicalRow(row) {
    const output = {};
    OUTPUT_FIELDS.forEach(field => { output[field] = row[field]; });
    output.item = Number(output.item);
    return output;
  }
  function canonicalTime(value) {
    const match = text(value).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
    if (!match) return '';
    return `${match[1]}-${pad(Number(match[2]))}-${pad(Number(match[3]))}T${pad(Number(match[4]))}:${pad(Number(match[5]))}:${pad(Number(match[6] || 0))}`;
  }
  function defaultRowKey(row) {
    return [canonicalTime(row && row.fillTime), text(row && row.store), Number(row && row.item)].join('|');
  }
  function comparableRow(row) {
    return OUTPUT_FIELDS.map(field => field === 'item' ? String(Number(row && row[field])) : text(row && row[field])).join('\u001f');
  }
  function dedupeRows(rows, keyResolver) {
    const byKey = new Map();
    const conflicts = [];
    let duplicateCount = 0;
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const key = String((keyResolver || defaultRowKey)(row) || '');
      if (!key || key.startsWith('|')) {
        conflicts.push({ key, input:row, reason:'無法建立 fillTime + store + item 唯一鍵' });
        return;
      }
      if (!byKey.has(key)) {
        byKey.set(key, row);
        return;
      }
      const existing = byKey.get(key);
      if (comparableRow(existing) === comparableRow(row)) duplicateCount += 1;
      else conflicts.push({ key, existing, input:row, reason:'檔案內同鍵異內容' });
    });
    return { rows:[...byKey.values()].map(canonicalRow), duplicateCount, conflicts };
  }

  function parseMatrix(matrix, options) {
    const settings = options || {};
    const source = Array.isArray(matrix) ? matrix : [];
    const detected = detectHeader(source, settings.maxHeaderRows || 100);
    if (!detected || detected.fields.length !== FIELDS.length) {
      const missing = FIELDS.filter(field => !detected || !detected.fields.includes(field));
      return {
        rows:[], blocked:true, errors:[`缺少必要表頭：${missing.map(field => HEADERS[field][0]).join('、')}`],
        invalidRows:[], duplicateCount:0, duplicateConflicts:[], rawRowCount:0,
        validRowCount:0, headerRow:-1, headerFields:detected ? detected.fields : []
      };
    }
    const candidates = source.slice(detected.rowIndex + 1).filter(row => hasContent(row) && !isHeaderRow(row));
    const valid = [];
    const invalidRows = [];
    candidates.forEach((cells, offset) => {
      const rowNumber = detected.rowIndex + offset + 2;
      const fillTime = normalizeDateTime(cells[detected.map.fillTime], settings);
      const arriveRaw = cells[detected.map.arriveTime];
      const leaveRaw = cells[detected.map.leaveTime];
      const arriveTime = text(arriveRaw) ? normalizeDateTime(arriveRaw, settings) : '';
      const leaveTime = text(leaveRaw) ? normalizeDateTime(leaveRaw, settings) : '';
      const store = text(cells[detected.map.store]);
      const itemRaw = text(cells[detected.map.item]);
      const item = Number(itemRaw);
      const reasons = [];
      if (!fillTime) reasons.push('填表時間無法辨識');
      if (text(arriveRaw) && !arriveTime) reasons.push('到店時間無法辨識');
      if (text(leaveRaw) && !leaveTime) reasons.push('離店時間無法辨識');
      if (!store) reasons.push('缺少檢查店點');
      if (!/^\d+$/.test(itemRaw) || !Number.isInteger(item) || item < 1 || item > 33) reasons.push('題號需為 1 至 33');
      if (reasons.length) {
        invalidRows.push({ rowNumber, reasons, values:Array.from(cells || []).map(text) });
        return;
      }
      const outcome = normalizeResult(cells[detected.map.result], cells[detected.map.reason]);
      valid.push({
        fillTime,
        arriveTime,
        leaveTime,
        district:text(cells[detected.map.district]),
        code:text(cells[detected.map.code]),
        store,
        inspector:text(cells[detected.map.inspector]),
        item,
        content:text(cells[detected.map.content]),
        result:outcome.result,
        reason:outcome.reason,
        month:''
      });
    });
    valid.forEach(row => {
      const match = row.fillTime.match(/^(\d{4})\/(\d{1,2})\//);
      row.month = match ? `${match[1]}-${pad(Number(match[2]))}` : '';
    });
    const deduped = dedupeRows(valid);
    const errors = invalidRows.slice(0, 20).map(entry => `第 ${entry.rowNumber} 列：${entry.reasons.join('、')}`);
    if (!candidates.length) errors.push('檔案內沒有巡店資料列。');
    if (deduped.conflicts.length) errors.push(`檔案內有 ${deduped.conflicts.length} 筆同鍵異內容，整批已封鎖。`);
    return {
      rows:deduped.rows,
      blocked:Boolean(errors.length),
      errors,
      invalidRows,
      duplicateCount:deduped.duplicateCount,
      duplicateConflicts:deduped.conflicts,
      rawRowCount:candidates.length,
      validRowCount:deduped.rows.length,
      headerRow:detected.rowIndex,
      headerFields:detected.fields
    };
  }

  function countDelimiter(line, delimiter) {
    let quoted = false;
    let count = 0;
    const source = String(line || '');
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] === '"') {
        if (quoted && source[index + 1] === '"') index += 1;
        else quoted = !quoted;
      } else if (!quoted && source[index] === delimiter) count += 1;
    }
    return count;
  }
  function detectDelimiter(source) {
    const lines = String(source || '').split(/\r?\n/).filter(line => line.trim()).slice(0, 12);
    const candidates = ['\t', ',', ';'];
    let best = '\t';
    let bestScore = -1;
    candidates.forEach(delimiter => {
      const counts = lines.map(line => countDelimiter(line, delimiter));
      const positive = counts.filter(count => count > 0);
      if (!positive.length) return;
      const score = positive.length * 1000 + positive.reduce((sum, count) => sum + count, 0);
      if (score > bestScore) { best = delimiter; bestScore = score; }
    });
    return best;
  }
  function parseDelimited(source, delimiter) {
    const separator = delimiter || detectDelimiter(source);
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    const value = String(source || '').replace(/^\uFEFF/, '');
    for (let index = 0; index < value.length; index += 1) {
      const char = value[index];
      if (quoted) {
        if (char === '"' && value[index + 1] === '"') { cell += '"'; index += 1; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') quoted = true;
      else if (char === separator) { row.push(cell); cell = ''; }
      else if (char === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (char !== '\r') cell += char;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return { rows, delimiter:separator };
  }

  function workbookMatrices(arrayBuffer, XLSX) {
    if (!XLSX || typeof XLSX.read !== 'function') throw new Error('本機 Excel 解析元件未載入。');
    const workbook = XLSX.read(arrayBuffer, { type:'array', cellDates:true, raw:true });
    const date1904 = Boolean(workbook && workbook.Workbook && workbook.Workbook.WBProps && workbook.Workbook.WBProps.date1904);
    return workbook.SheetNames.map(name => ({
      name,
      date1904,
      matrix:XLSX.utils.sheet_to_json(workbook.Sheets[name], { header:1, raw:true, defval:'', blankrows:true })
    }));
  }
  function chooseWorkbookSheet(sheets) {
    const candidates = (Array.isArray(sheets) ? sheets : []).map(sheet => {
      const parsed = parseMatrix(sheet.matrix, { date1904:sheet.date1904 });
      const fullHeader = parsed.headerFields.length === FIELDS.length;
      return { ...sheet, parsed, score:(fullHeader ? 1000000 : 0) + parsed.rawRowCount };
    });
    candidates.sort((left, right) => right.score - left.score);
    return candidates.find(candidate => candidate.parsed.headerFields.length === FIELDS.length) || null;
  }
  function parseWorkbook(arrayBuffer, XLSX) {
    const selected = chooseWorkbookSheet(workbookMatrices(arrayBuffer, XLSX));
    if (!selected) throw new Error('找不到包含完整巡店表頭的工作表。');
    return { ...selected.parsed, sheetName:selected.name };
  }
  function extensionOf(fileName) {
    return text(fileName).toLowerCase().split('.').pop();
  }
  async function parseFile(file, XLSX) {
    if (!file) throw new Error('未選擇檔案。');
    if (Number(file.size || 0) > MAX_FILE_BYTES) throw new Error('檔案超過 20 MB，已封鎖解析。');
    const extension = extensionOf(file.name);
    if (!SUPPORTED_EXTENSIONS.includes(extension)) throw new Error('只支援 .xlsx、.xls、.csv、.tsv。');
    if (extension === 'xlsx' || extension === 'xls') return { ...(parseWorkbook(await file.arrayBuffer(), XLSX)), fileName:file.name, extension };
    const parsedText = parseDelimited(await file.text(), extension === 'tsv' ? '\t' : undefined);
    return { ...parseMatrix(parsedText.rows), fileName:file.name, sheetName:extension.toUpperCase(), extension, delimiter:parsedText.delimiter };
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
    }[character]));
  }
  function renderBrowserStatus(documentRef, state, preflight, errorText) {
    const status = documentRef && documentRef.getElementById('patrolLocalImportStatus');
    if (!status || !state) return;
    const additions = preflight ? preflight.additions.length : 0;
    const existing = preflight ? preflight.existingSame.length : 0;
    const serverConflicts = preflight ? preflight.differences.length : 0;
    const fileConflicts = Number(state.fileConflictCount || 0);
    const invalid = Number(state.invalidCount || 0);
    const metric = (label, value) => `<div class="patrol-local-import-metric"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`;
    status.hidden = false;
    status.className = `patrol-local-import-status${errorText || fileConflicts || serverConflicts || invalid ? ' bad' : ''}`;
    status.innerHTML = `<strong>${errorText ? '巡店報表解析封鎖' : '巡店報表解析完成'}</strong>` +
      `檔案：${escapeHtml(state.fileName || '—')}<br>工作表：${escapeHtml(state.sheetName || '—')}<br>` +
      `<div class="patrol-local-import-metrics">` +
      metric('原始資料', state.rawRowCount ?? 0) + metric('有效資料', state.validRowCount ?? 0) +
      metric('檔案內重複', state.duplicateCount ?? 0) + metric('預計新增', preflight ? additions : '—') +
      metric('雲端已存在', preflight ? existing : '—') + metric('衝突', fileConflicts + serverConflicts) +
      metric('無法辨識', invalid) + metric('Server Preflight', preflight ? '完成' : '未完成') +
      `</div>${errorText ? `<div class="patrol-local-import-error">${escapeHtml(errorText)}</div>` : ''}`;
  }
  function prepareCandidates(rows, rawDetails, keyResolver) {
    const merged = (Array.isArray(rawDetails) ? rawDetails : []).slice();
    const index = new Map();
    merged.forEach((row, rowIndex) => index.set(keyResolver(row), rowIndex));
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const key = keyResolver(row);
      if (index.has(key)) merged[index.get(key)] = row;
      else { index.set(key, merged.length); merged.push(row); }
    });
    return { merged, addedRows:rows.slice(), writeRows:rows.slice(), duplicates:0, total:merged.length };
  }
  function createBrowserController(bridge) {
    const services = bridge || {};
    const documentRef = services.document || (typeof document !== 'undefined' ? document : null);
    let selected = null;
    function setConfirmation(visible, disabled) {
      if (typeof services.setConfirmation === 'function') services.setConfirmation(visible, disabled);
    }
    function setPending(value) {
      if (typeof services.setPending === 'function') services.setPending(value);
    }
    function message(value, type) {
      if (typeof services.showMessage === 'function') services.showMessage(value, type);
    }
    function reset(options) {
      selected = null;
      const input = documentRef && documentRef.getElementById('patrolLocalFileInput');
      if (input) input.value = '';
      if (!(options && options.keepStatus)) {
        const status = documentRef && documentRef.getElementById('patrolLocalImportStatus');
        if (status) { status.hidden = true; status.className = 'patrol-local-import-status'; status.textContent = ''; }
      }
    }
    async function handleSelection(event) {
      const input = event && event.target;
      const file = input && input.files && input.files[0];
      setPending(null);
      setConfirmation(false);
      reset();
      if (!file) return;
      const button = documentRef && documentRef.getElementById('patrolLocalFileButton');
      if (button) button.disabled = true;
      const initial = { fileName:file.name, sheetName:'讀取中', rawRowCount:0, validRowCount:0, duplicateCount:0, fileConflictCount:0, invalidCount:0 };
      const status = documentRef && documentRef.getElementById('patrolLocalImportStatus');
      if (status) {
        status.hidden = false;
        status.className = 'patrol-local-import-status';
        status.innerHTML = `<strong>正在本機解析</strong>檔案：${escapeHtml(file.name)}<br>尚未呼叫 ptwrite。`;
      }
      try {
        const xlsx = typeof services.getXlsx === 'function' ? services.getXlsx() : services.xlsx;
        if (!xlsx) throw new Error('本機 Excel 解析元件未載入，已封鎖匯入。');
        const parsed = await parseFile(file, xlsx);
        const localState = {
          file,
          fileName:parsed.fileName,
          sheetName:parsed.sheetName,
          rawRowCount:parsed.rawRowCount,
          validRowCount:parsed.validRowCount,
          duplicateCount:parsed.duplicateCount,
          fileConflictCount:parsed.duplicateConflicts.length,
          invalidCount:parsed.invalidRows.length,
          parsedRows:parsed.rows,
          preflight:null
        };
        if (parsed.blocked) {
          renderBrowserStatus(documentRef, localState, null, parsed.errors.join('；'));
          message('本機檔案未通過欄位／日期／題號檢查，整批禁止進入確認寫入。', 'err');
          if (input) input.value = '';
          return;
        }
        const canonicalized = dedupeRows(parsed.rows, services.candidateKey);
        localState.parsedRows = canonicalized.rows;
        localState.validRowCount = canonicalized.rows.length;
        localState.duplicateCount += canonicalized.duplicateCount;
        localState.fileConflictCount += canonicalized.conflicts.length;
        if (canonicalized.conflicts.length) {
          renderBrowserStatus(documentRef, localState, null, `店點標準化後有 ${canonicalized.conflicts.length} 筆同鍵異內容，整批已封鎖。`);
          message('檔案內存在同鍵異內容，禁止挑選其中一筆繼續。', 'err');
          if (input) input.value = '';
          return;
        }
        selected = localState;
        renderBrowserStatus(documentRef, localState, null, '');
        if (!services.isReady()) {
          message('檔案已在本機解析；必須完成督導驗證與連線後，才能執行 Server Preflight。', 'err');
          return;
        }
        message(`已解析 ${localState.validRowCount} 筆；正在沿用 ptdetail Server Preflight，完成前禁止寫入……`, 'ok');
        const preflight = await services.preflight(localState.parsedRows);
        localState.preflight = preflight;
        renderBrowserStatus(documentRef, localState, preflight, '');
        if (preflight.differences.length) {
          setPending(null);
          message(`Server Preflight 發現 ${preflight.differences.length} 筆雲端同鍵異內容，整批已封鎖。`, 'err');
          return;
        }
        if (!preflight.additions.length) {
          setPending(null);
          message(`Server Preflight 完成：雲端已存在 ${preflight.existingSame.length} 筆，沒有新增資料，不呼叫 ptwrite。`, 'ok');
          return;
        }
        setPending({
          sourceType:'file',
          raw:'',
          parsedRows:localState.parsedRows,
          candidate:prepareCandidates(preflight.additions, services.getRawDetails(), services.candidateKey),
          preflight,
          localFile:localState
        });
        setConfirmation(true);
        message(`Server Preflight PASS：預計新增 ${preflight.additions.length} 筆、已存在 ${preflight.existingSame.length} 筆；按確認後才會沿用 ptwrite。`, 'ok');
      } catch (error) {
        selected = null;
        setPending(null);
        renderBrowserStatus(documentRef, initial, null, error && error.message || '本機檔案解析失敗。');
        message(`${error && error.message || '本機檔案解析失敗'}；未呼叫 ptwrite。`, 'err');
        if (input) input.value = '';
      } finally {
        if (button) button.disabled = false;
      }
    }
    return Object.freeze({ handleSelection, reset, getState:() => selected });
  }

  return Object.freeze({
    VERSION, MAX_FILE_BYTES, SUPPORTED_EXTENSIONS, FIELDS, OUTPUT_FIELDS, HEADERS,
    normalizeHeader, normalizeDateTime, normalizeResult, detectHeader, parseMatrix,
    detectDelimiter, parseDelimited, dedupeRows, defaultRowKey, comparableRow,
    workbookMatrices, chooseWorkbookSheet, parseWorkbook, parseFile,
    prepareCandidates, renderBrowserStatus, createBrowserController
  });
});
