import {
  Core, WRITE_MAX_ROWS, WRITE_MAX_QUERY_LENGTH, state, $, escapeHtml,
  setBusy, setStep, status, showMessage, hideMessage, jsonpWrite,
  validateSession, authenticate
} from './patrol-import-runtime.js';
import { resetPending, chooseFile, fetchDetail, runPreflight } from './patrol-import-file.js';

async function login() {
  const passcode = $('passcode').value;
  if (!passcode) {
    status('authStatus', '請輸入巡店督導通行碼。', 'warn');
    $('passcode').focus();
    return;
  }
  setBusy(true);
  status('authStatus', '正在驗證巡店通行碼…', 'info');
  try {
    await authenticate(passcode);
    $('passcode').value = '';
    status('authStatus', '督導連線正常，可直接選擇本機報表。', 'ok');
    if (state.pending && state.pending.parsedRows && !state.pending.classified) await runPreflight(renderPreview);
  } catch (error) {
    status('authStatus', error.message || '巡店通行碼驗證失敗。', 'bad');
  } finally {
    setBusy(false);
  }
}

function outcomeLabel(row) {
  const result = String(row && row.result || '');
  if (result === 'v') return '合格';
  if (result === 'na') return 'NA';
  return row && row.reason ? `未合格：${row.reason}` : '未合格／未查';
}

function renderPreview() {
  const pending = state.pending;
  if (!pending) return;
  $('preview').classList.add('show');
  const classified = pending.classified || { additions:[], updates:[], existing:[], conflicts:[], writeRows:[] };
  $('metricParsed').textContent = String(pending.parsedRows.length);
  $('metricAdd').textContent = String(classified.additions.length);
  $('metricUpdate').textContent = String(classified.updates.length);
  $('metricExisting').textContent = String(classified.existing.length);
  $('metricConflict').textContent = String(classified.conflicts.length);
  const months = [...new Set(pending.parsedRows.map(row => row.month))].join('、');
  const stores = [...new Set(pending.parsedRows.map(row => row.store))].join('、');
  $('previewSummary').innerHTML = `<strong>${escapeHtml(pending.fileName)}</strong><div class="summary-grid"><span>工作表</span><span>${escapeHtml(pending.sheetName)}${pending.delimiter ? `（${escapeHtml(pending.delimiter)}）` : ''}</span><span>表頭位置</span><span>第 ${escapeHtml(pending.headerRow)} 列</span><span>月份</span><span>${escapeHtml(months)}</span><span>店點</span><span>${escapeHtml(stores)}</span><span>檔內重複</span><span>${escapeHtml(pending.duplicateCount)} 筆已安全合併</span><span>店點校正</span><span>${escapeHtml(pending.remapped || 0)} 筆</span></div>`;
  const samples = [];
  classified.additions.slice(0, 3).forEach(row => samples.push({ tag:'新增', row, detail:outcomeLabel(row) }));
  classified.updates.slice(0, 3).forEach(item => samples.push({ tag:'更新', row:item.row, detail:`${outcomeLabel(item.before)} → ${outcomeLabel(item.after)}` }));
  classified.conflicts.slice(0, 3).forEach(item => samples.push({ tag:'封鎖', row:item.row, detail:item.reason }));
  if (samples.length) {
    $('sampleRows').className = 'sample';
    $('sampleRows').innerHTML = `<div class="sample-title">預覽樣本</div>${samples.map(item => `<div class="sample-row"><span>${escapeHtml(item.tag)} · ${escapeHtml(item.row.month)}</span><span>${escapeHtml(item.row.store)}</span><span>題 ${escapeHtml(item.row.item)}</span><span class="muted">${escapeHtml(item.detail)}</span></div>`).join('')}`;
  } else {
    $('sampleRows').className = 'sample hidden';
    $('sampleRows').innerHTML = '';
  }
  $('confirmBtn').disabled = state.busy || pending.completed || pending.blocked || !pending.classified || classified.writeRows.length === 0;
  $('confirmBtn').textContent = classified.writeRows.length ? `確認寫入 ${classified.writeRows.length} 筆` : '沒有需要寫入的資料';
}

function toWireRow(row) {
  return {
    fillTime:String(row && row.fillTime || ''),
    arriveTime:String(row && row.arriveTime || ''),
    leaveTime:String(row && row.leaveTime || ''),
    district:String(row && row.district || ''),
    code:String(row && row.code || ''),
    store:String(row && row.store || ''),
    inspector:String(row && row.inspector || ''),
    item:Number(row && row.item),
    result:String(row && row.result || ''),
    reason:String(row && row.reason || ''),
    month:String(row && row.month || '')
  };
}

function buildWriteChunks(rows) {
  const chunks = [];
  let current = [];
  (Array.isArray(rows) ? rows : []).forEach(row => {
    const candidate = [...current, row];
    const probe = new URLSearchParams({ action:'ptwrite', token:state.token, callback:'probe', payload:JSON.stringify(candidate) }).toString().length;
    if (current.length && (candidate.length > WRITE_MAX_ROWS || probe > WRITE_MAX_QUERY_LENGTH)) {
      chunks.push(current);
      current = [row];
    } else current = candidate;
  });
  if (current.length) chunks.push(current);
  if (chunks.some(chunk => new URLSearchParams({ action:'ptwrite', token:state.token, callback:'probe', payload:JSON.stringify(chunk) }).toString().length > WRITE_MAX_QUERY_LENGTH)) {
    throw new Error('單筆巡店資料內容過長，無法安全送出；請改用原貼上備援流程檢查該筆內容。');
  }
  return chunks;
}

async function writeChunkWithRetry(chunk) {
  try { return await jsonpWrite(chunk); }
  catch (firstError) {
    if (!state.token) throw firstError;
    await new Promise(resolve => setTimeout(resolve, 600));
    return jsonpWrite(chunk);
  }
}

async function readbackAll(groups) {
  const all = [];
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    $('writeProgressLabel').textContent = `讀回驗證 ${index + 1}/${groups.length}：${group.month} · ${group.store}`;
    all.push(...await fetchDetail(group.month, group.store));
  }
  return all;
}

async function confirmWrite() {
  const pending = state.pending;
  if (!pending || !pending.classified || pending.blocked || !pending.classified.writeRows.length) return;
  if (!state.token) {
    status('authStatus', '督導驗證已逾時，請重新驗證後再寫入。', 'warn');
    $('authPanel').scrollIntoView({ behavior:'smooth' });
    return;
  }
  setBusy(true);
  setStep(4, 3);
  hideMessage('writeMessage');
  $('writeProgress').classList.add('show');
  $('writeProgressBar').style.width = '0%';
  try {
    const rows = pending.classified.writeRows.map(toWireRow);
    const chunks = buildWriteChunks(rows);
    let written = 0;
    let updated = 0;
    for (let index = 0; index < chunks.length; index += 1) {
      $('writeProgressLabel').textContent = `寫入 ${index + 1}/${chunks.length} 批，共 ${rows.length} 筆`;
      $('writeProgressBar').style.width = `${Math.round(index / Math.max(1, chunks.length + 1) * 100)}%`;
      const result = await writeChunkWithRetry(chunks[index]);
      written += Number(result.written || 0);
      updated += Number(result.updated || 0);
    }
    $('writeProgressBar').style.width = '82%';
    const verification = Core.verifyReadback(rows, await readbackAll(pending.groups));
    if (!verification.ok) throw new Error(`雲端讀回不一致：缺少 ${verification.missing.length} 筆、內容不符 ${verification.mismatched.length} 筆。已停止宣告完成，請勿重複送出。`);
    $('writeProgressBar').style.width = '100%';
    $('writeProgressLabel').textContent = '雲端寫入與讀回驗證完成';
    showMessage('writeMessage', `更新成功 ✅\n送出 ${rows.length} 筆；新增 ${written} 筆；更新 ${updated} 筆；讀回驗證 ${rows.length}/${rows.length} 筆一致。\n可返回巡店系統查看最新看板與移動里程。`, 'ok');
    setStep(4, 4);
    state.pending.completed = true;
    $('confirmBtn').disabled = true;
    $('confirmBtn').textContent = '本次已完成';
  } catch (error) {
    showMessage('writeMessage', `${error.message || '巡店寫入失敗。'}\n為避免重複資料，本頁不會自動重送整批。請先返回看板確認，再決定是否重新預檢。`, 'bad');
    if (!state.token) status('authStatus', '督導驗證已逾時，請重新驗證。', 'warn');
    setStep(4, 3);
  } finally {
    setBusy(false);
  }
}

$('loginBtn').addEventListener('click', login);
$('passcode').addEventListener('keydown', event => { if (event.key === 'Enter') login(); });
$('recheckSessionBtn').addEventListener('click', validateSession);
$('chooseFileBtn').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', event => chooseFile(event.target.files && event.target.files[0], renderPreview));
$('confirmBtn').addEventListener('click', confirmWrite);
$('cancelBtn').addEventListener('click', () => resetPending(false));
const uploadZone = $('uploadZone');
['dragenter','dragover'].forEach(name => uploadZone.addEventListener(name, event => { event.preventDefault(); if (!state.busy) uploadZone.classList.add('drag'); }));
['dragleave','drop'].forEach(name => uploadZone.addEventListener(name, event => { event.preventDefault(); uploadZone.classList.remove('drag'); }));
uploadZone.addEventListener('drop', event => { if (!state.busy) chooseFile(event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0], renderPreview); });

if (!Core) {
  status('authStatus', '本機解析核心載入失敗，請重新整理頁面。', 'bad');
  showMessage('parseMessage', '巡店本機解析核心未載入，已封鎖匯入。', 'bad');
  setBusy(true);
} else validateSession();
