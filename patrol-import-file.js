import {
  Core, MAX_FILE_BYTES, state, $, setBusy, setStep, status,
  showMessage, hideMessage, postAction
} from './patrol-import-runtime.js';

function workbookSheets(arrayBuffer) {
  if (!window.XLSX) throw new Error('Excel 解析元件載入失敗；可先將報表另存 CSV 後再匯入。');
  const workbook = XLSX.read(arrayBuffer, { type:'array', cellDates:true, raw:true });
  const date1904 = Boolean(workbook && workbook.Workbook && workbook.Workbook.WBProps && workbook.Workbook.WBProps.date1904);
  return workbook.SheetNames.map(name => ({
    name,
    date1904,
    rows:XLSX.utils.sheet_to_json(workbook.Sheets[name], { header:1, raw:true, defval:'', blankrows:false })
  }));
}

async function readFile(file) {
  const extension = String(file.name.split('.').pop() || '').toLowerCase();
  if (['csv','tsv','txt'].includes(extension)) {
    const parsed = Core.parseDelimitedText(await file.text());
    return { sheetName:extension.toUpperCase(), rows:parsed.rows, date1904:false, delimiter:parsed.separator === '\t' ? 'Tab' : parsed.separator };
  }
  if (!['xlsx','xls'].includes(extension)) throw new Error('只支援 XLSX、XLS、CSV、TSV。');
  const best = Core.chooseBestSheet(workbookSheets(await file.arrayBuffer()));
  if (!best) throw new Error('Excel 找不到可讀取的工作表。');
  return { sheetName:best.name, rows:best.rows, date1904:best.date1904, delimiter:'' };
}

function resetPending(keepFileLabel) {
  state.pending = null;
  $('preview').classList.remove('show');
  ['metricParsed','metricAdd','metricUpdate','metricExisting','metricConflict'].forEach(id => $(id).textContent = '0');
  $('sampleRows').className = 'sample hidden';
  $('sampleRows').innerHTML = '';
  hideMessage('writeMessage');
  hideMessage('parseMessage');
  $('writeProgress').classList.remove('show');
  $('writeProgressBar').style.width = '0%';
  $('writeProgressLabel').textContent = '';
  if (!keepFileLabel) {
    $('fileInput').value = '';
    $('fileMeta').textContent = '尚未選擇檔案';
  }
  setStep(1, 0);
  setBusy(false);
}

async function chooseFile(file, renderPreview) {
  resetPending(true);
  if (!file) return;
  if (file.size > MAX_FILE_BYTES) {
    showMessage('parseMessage', '檔案超過 20 MB，已封鎖解析。請另存只含巡店明細的較小檔案。', 'bad');
    return;
  }
  $('fileMeta').textContent = `${file.name} · ${(file.size / 1024).toFixed(file.size > 1024 * 1024 ? 0 : 1)} KB`;
  setBusy(true);
  showMessage('parseMessage', '正在本機解析檔案，尚未上傳任何資料…', 'info');
  try {
    const source = await readFile(file);
    const normalized = Core.normalizeMatrix(source.rows, { date1904:source.date1904 });
    if (normalized.errors.length) throw new Error(normalized.errors.slice(0, 12).join('\n'));
    const deduped = Core.dedupeRows(normalized.rows);
    if (deduped.conflicts.length) throw new Error(`檔案內有 ${deduped.conflicts.length} 筆相同鍵值但內容不同，已封鎖匯入。`);
    state.pending = {
      fileName:file.name,
      sheetName:source.sheetName,
      delimiter:source.delimiter,
      headerRow:normalized.meta.headerRow + 1,
      duplicateCount:deduped.duplicateCount,
      parsedRows:deduped.rows,
      classified:null,
      blocked:false
    };
    $('metricParsed').textContent = String(deduped.rows.length);
    showMessage('parseMessage', `本機解析完成：有效 ${deduped.rows.length} 筆${deduped.duplicateCount ? `，檔內重複 ${deduped.duplicateCount} 筆已合併` : ''}。正在進行雲端預檢…`, 'ok');
    setStep(2, 1);
    if (!state.token) {
      status('authStatus', '檔案已在本機解析完成；請登入後繼續雲端預檢。', 'warn');
      $('authPanel').scrollIntoView({ behavior:'smooth', block:'start' });
      return;
    }
    await runPreflight(renderPreview);
  } catch (error) {
    state.pending = null;
    showMessage('parseMessage', error.message || '檔案解析失敗。', 'bad');
    setStep(1, 0);
  } finally {
    setBusy(false);
  }
}

async function getConfiguredStores(month) {
  const result = await postAction('ptsummary', { token:state.token, month }, 30000);
  if (!result || result.status !== 'ok' || !result.summary) throw new Error(result && result.message ? result.message : '無法讀取巡店店點設定');
  if (!Array.isArray(result.stores) || !result.stores.length) throw new Error('巡店服務未回傳店點清單');
  return result.stores;
}

async function fetchDetail(month, store) {
  const all = [];
  let page = 1;
  let totalRows = null;
  for (;;) {
    const result = await postAction('ptdetail', { token:state.token, month, store, page, limit:100 }, 30000);
    if (!result || result.status !== 'ok' || !Array.isArray(result.rows)) throw new Error(result && result.message ? result.message : `${store} 雲端明細讀取失敗`);
    const reported = Number(result.totalRows);
    if (!Number.isInteger(reported) || reported < 0) throw new Error(`${store} 雲端明細 contract 不完整`);
    if (totalRows == null) totalRows = reported;
    else if (totalRows !== reported) throw new Error(`${store} 雲端明細讀取期間筆數改變，請重新預檢`);
    all.push(...result.rows);
    if (all.length >= totalRows) break;
    page += 1;
    if (page > 100) throw new Error(`${store} 雲端明細分頁異常`);
  }
  if (all.length !== totalRows) throw new Error(`${store} 雲端明細讀取不完整`);
  return all;
}

function mergeClassifications(parts) {
  return parts.reduce((result, part) => {
    result.additions.push(...part.additions);
    result.updates.push(...part.updates);
    result.existing.push(...part.existing);
    result.conflicts.push(...part.conflicts);
    result.writeRows.push(...part.writeRows);
    return result;
  }, { additions:[], updates:[], existing:[], conflicts:[], writeRows:[] });
}

async function runPreflight(renderPreview) {
  const pending = state.pending;
  if (!pending || !pending.parsedRows.length) return;
  if (!state.token) {
    status('authStatus', '請先完成督導驗證。', 'warn');
    return;
  }
  setBusy(true);
  setStep(2, 1);
  showMessage('parseMessage', '正在比對雲端店點、月份、重複資料與更新差異…', 'info');
  try {
    const months = [...new Set(pending.parsedRows.map(row => row.month))].sort();
    const mapped = Core.mapConfiguredStores(pending.parsedRows, await getConfiguredStores(months[0]));
    if (mapped.errors.length) throw new Error(mapped.errors.slice(0, 15).join('\n'));
    const secondDedupe = Core.dedupeRows(mapped.rows);
    if (secondDedupe.conflicts.length) throw new Error(`店點標準化後出現 ${secondDedupe.conflicts.length} 筆鍵值衝突，已封鎖匯入。`);
    const groups = Core.groupRows(secondDedupe.rows);
    const parts = [];
    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      showMessage('parseMessage', `雲端預檢 ${index + 1}/${groups.length}：${group.month} · ${group.store}`, 'info');
      parts.push(Core.classifyAgainstServer(group.rows, await fetchDetail(group.month, group.store)));
    }
    const classified = mergeClassifications(parts);
    state.pending = { ...pending, parsedRows:secondDedupe.rows, remapped:mapped.remapped, groups, classified, blocked:classified.conflicts.length > 0 };
    renderPreview();
    if (state.pending.blocked) {
      showMessage('parseMessage', `雲端預檢發現 ${classified.conflicts.length} 筆衝突，已封鎖寫入。`, 'bad');
      setStep(2, 1);
    } else {
      const count = classified.writeRows.length;
      showMessage('parseMessage', count ? `預檢完成：可寫入 ${count} 筆，請確認摘要後再送出。` : '預檢完成：檔案內容均已存在，無需重複寫入。', count ? 'ok' : 'warn');
      setStep(3, 2);
    }
  } catch (error) {
    if (state.pending) state.pending = { ...state.pending, classified:null, blocked:true };
    showMessage('parseMessage', error.message || '雲端預檢失敗。', 'bad');
    renderPreview();
    setStep(2, 1);
  } finally {
    setBusy(false);
  }
}

export { resetPending, chooseFile, fetchDetail, runPreflight };
