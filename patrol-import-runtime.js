const Core = window.PatrolLocalImport;
const PATROL_GAS_URL = 'https://script.google.com/macros/s/AKfycbxqBtW2yQw_u4qqJ9Knz6CK34hAiunaa6lIQu4pMa8Ff2voJZCWKEh8MXTJ6qAoGTax/exec';
const SESSION_STORAGE_KEY = 'bei12b_patrol_session_token_v2';
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const WRITE_MAX_ROWS = 8;
const WRITE_MAX_QUERY_LENGTH = 7200;
const state = {
  token:sessionStorage.getItem(SESSION_STORAGE_KEY) || '',
  pending:null,
  busy:false
};
const $ = id => document.getElementById(id);
const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

function setBusy(value) {
  state.busy = Boolean(value);
  ['loginBtn','chooseFileBtn','confirmBtn','cancelBtn','recheckSessionBtn'].forEach(id => {
    const element = $(id);
    if (!element) return;
    if (id === 'confirmBtn') {
      const pending = state.pending;
      element.disabled = state.busy || !pending || pending.completed || pending.blocked || !pending.classified || pending.classified.writeRows.length === 0;
    } else element.disabled = state.busy;
  });
  $('fileInput').disabled = state.busy;
}

function setStep(active, doneThrough) {
  document.querySelectorAll('[data-step]').forEach(element => {
    const step = Number(element.dataset.step);
    element.classList.toggle('active', step === active);
    element.classList.toggle('done', step <= Number(doneThrough || 0));
  });
}

function status(elementId, message, type) {
  const element = $(elementId);
  element.className = `status-line ${type || 'info'}`;
  element.innerHTML = `<span class="status-dot"></span><span>${escapeHtml(message)}</span>`;
}

function showMessage(elementId, message, type) {
  const element = $(elementId);
  element.className = `message show ${type || 'info'}`;
  element.textContent = message;
}

function hideMessage(elementId) {
  const element = $(elementId);
  element.className = 'message';
  element.textContent = '';
}

function authFailure(payload) {
  return payload && payload.status === 'error' && (String(payload.message || '') === 'unauthorized' || /^AUTH_/.test(String(payload.reason || '')));
}

function clearToken() {
  state.token = '';
  sessionStorage.removeItem(SESSION_STORAGE_KEY);
}

async function postAction(action, params, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(timeoutMs || 30000));
  try {
    const response = await fetch(PATROL_GAS_URL, {
      method:'POST',
      headers:{'Content-Type':'text/plain;charset=utf-8'},
      body:JSON.stringify({ action, ...(params || {}) }),
      cache:'no-store',
      signal:controller.signal
    });
    const raw = await response.text();
    let payload;
    try { payload = JSON.parse(raw); }
    catch { throw new Error('巡店服務回應格式無法辨識'); }
    if (authFailure(payload)) {
      const reason = String(payload.reason || 'AUTH_SESSION_EXPIRED');
      clearToken();
      const error = new Error(reason === 'AUTH_CREDENTIAL_INVALID' ? '巡店通行碼錯誤' : '督導驗證已逾時，請重新驗證');
      error.authReason = reason;
      throw error;
    }
    return payload;
  } catch (error) {
    if (error && error.name === 'AbortError') throw new Error('巡店服務回應逾時，請稍後重試');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function jsonpWrite(rows) {
  return new Promise((resolve, reject) => {
    if (!state.token) { reject(new Error('督導驗證已逾時，請重新驗證')); return; }
    const callback = `patrolLocalImport_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement('script');
    let settled = false;
    const timer = setTimeout(() => finish(new Error('巡店寫入逾時，請重新整理確認雲端結果')), 30000);
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { delete window[callback]; } catch {}
      script.remove();
      if (error) reject(error); else resolve(value);
    }
    window[callback] = payload => {
      if (authFailure(payload)) {
        clearToken();
        finish(new Error('督導驗證已逾時，請重新驗證'));
        return;
      }
      if (!payload || payload.status !== 'ok') {
        finish(new Error(payload && payload.message ? payload.message : '巡店寫入失敗'));
        return;
      }
      finish(null, payload);
    };
    const query = new URLSearchParams({ action:'ptwrite', token:state.token, callback, payload:JSON.stringify(rows) });
    script.onerror = () => finish(new Error('無法連上巡店寫入服務'));
    script.src = `${PATROL_GAS_URL}?${query.toString()}`;
    document.head.appendChild(script);
  });
}

async function validateSession() {
  setBusy(true);
  status('authStatus', state.token ? '正在驗證現有巡店 session…' : '尚未登入，請輸入巡店通行碼。', state.token ? 'info' : 'warn');
  try {
    if (!state.token) return false;
    const result = await postAction('ptauth', { token:state.token }, 15000);
    if (!result || result.status !== 'ok' || !result.token) throw new Error('巡店 session 驗證失敗');
    state.token = String(result.token);
    sessionStorage.setItem(SESSION_STORAGE_KEY, state.token);
    status('authStatus', '督導連線正常，可直接選擇本機報表。', 'ok');
    return true;
  } catch (error) {
    clearToken();
    status('authStatus', error.message || '請重新輸入巡店通行碼。', 'warn');
    return false;
  } finally {
    setBusy(false);
  }
}

async function authenticate(passcode) {
  const result = await postAction('ptauth', { key:passcode }, 15000);
  if (!result || result.status !== 'ok' || !result.token) throw new Error(result && result.message ? result.message : '驗證失敗');
  state.token = String(result.token);
  sessionStorage.setItem(SESSION_STORAGE_KEY, state.token);
  return result;
}

export {
  Core, PATROL_GAS_URL, SESSION_STORAGE_KEY, MAX_FILE_BYTES,
  WRITE_MAX_ROWS, WRITE_MAX_QUERY_LENGTH, state, $, escapeHtml,
  setBusy, setStep, status, showMessage, hideMessage, clearToken,
  postAction, jsonpWrite, validateSession, authenticate
};
