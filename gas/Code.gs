// ════════════════════════════════════
// 北一二B 回報系統 — Google Apps Script
// ════════════════════════════════════

const SHEET_NAME = '回報資料';

const FIELDS = [
  'date','store','seg','savedAt',
  'kpi','rank',
  'acc','film','insurance',
  'myvideo','apple_google','hbo','netflix',
  '5g','aq_ttl','aq999','aq1399','rt_pts',
  'special_renew','premium_renew','rt999','rt1399','haosu',
  'early_renew','rt_close_num','rt_close_den','rt_close_pct',
  'insurance_num','insurance_den','insurance_pct',
  'device_num','device_den','device_ratio',
  'tw_pixel10','tw_s26u','tw_sharpr11','tw_vivo','tw_s26','tw_reno16f',
  'tw_pixel10fold','tw_findx9s','tw_sony1','tw_poketomo',
  'tw_oppoa6x','tw_a27','tw_y21','tw_myfirst',
  'zero_reason','zero_consult','zero_method','zero_plan'
];

const SPREADSHEET_ID = '10MqzAWOPc4UPE-g5ZZPNZG3tYAndKW-DApLuuhIpQWA';

function getSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(FIELDS);
    sh.setFrozenRows(1);
  }
  // 確保標題列有所有欄位
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const missingFields = FIELDS.filter(f => !headers.includes(f));
  if (missingFields.length > 0) {
    missingFields.forEach(f => {
      sh.getRange(1, headers.length + 1).setValue(f);
      headers.push(f);
    });
  }
  return sh;
}

function doGet(e) {
  const action = e.parameter.action;

  if (action === 'ping') {
    return jsonResponse({ status: 'ok' });
  }

  if (action === 'debug') {
    try {
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const sheets = ss.getSheets().map(s => ({
        name: s.getName(),
        rows: s.getLastRow(),
        cols: s.getLastColumn()
      }));
      const sh = ss.getSheetByName(SHEET_NAME);
      const headers = sh ? sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0] : [];
      const sample = sh && sh.getLastRow() > 1 ? sh.getRange(2,1,1,sh.getLastColumn()).getValues()[0] : [];
      return jsonResponse({ status:'ok', sheets, headers, sample });
    } catch(err) {
      return jsonResponse({ status:'error', message: err.message });
    }
  }

  if (action === 'write') {
    try {
      const payload = JSON.parse(decodeURIComponent(e.parameter.payload));
      writeData(payload.date, payload.store, payload.seg, payload.data);
      const cb = e.parameter.callback;
      if (cb) {
        return ContentService.createTextOutput(`${cb}({"status":"ok"})`)
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return jsonResponse({ status: 'ok' });
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.message });
    }
  }

  if (action === 'read') {
    try {
      const date = e.parameter.date;
      const seg  = parseInt(e.parameter.seg);
      const data = readData(date, seg);
      return jsonResponse({ status: 'ok', data });
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.message });
    }
  }

  // ── 個人回報：寫入 ──
  if (action === 'pwrite') {
    try {
      const payload = JSON.parse(decodeURIComponent(e.parameter.payload));
      writePersonal(payload);
      const cb = e.parameter.callback;
      if (cb) {
        return ContentService.createTextOutput(`${cb}({"status":"ok"})`)
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return jsonResponse({ status: 'ok' });
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.message });
    }
  }

  // ── 個人回報：讀取（某日某時段全部）──
  if (action === 'pread') {
    try {
      const date = e.parameter.date;
      const seg  = parseInt(e.parameter.seg);
      const data = readPersonal(date, seg);
      return jsonResponse({ status: 'ok', data });
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.message });
    }
  }

  return jsonResponse({ status: 'error', message: 'unknown action' });
}

// ════════════════════════════════════
// 個人回報（工作表：個人回報）
// 欄位：date, seg, store, name, record(JSON字串), savedAt
// ════════════════════════════════════
const PERSONAL_SHEET = '個人回報';
const PERSONAL_HEADERS = ['date','seg','store','name','record','savedAt'];

function getPersonalSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(PERSONAL_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PERSONAL_SHEET);
    sh.appendRow(PERSONAL_HEADERS);
    sh.setFrozenRows(1);
    // record 欄設為純文字，避免 JSON 被試算表亂轉
    sh.getRange('E:E').setNumberFormat('@');
  }
  return sh;
}

function writePersonal(p) {
  // p = { date, seg, store, name, record }
  const sh = getPersonalSheet();
  const allData = sh.getDataRange().getValues();

  let rowIdx = -1;
  for (let i = 1; i < allData.length; i++) {
    const r = allData[i];
    if (toDateStr(r[0]) === p.date && Number(r[1]) === Number(p.seg) &&
        String(r[2]) === String(p.store) && String(r[3]) === String(p.name)) {
      rowIdx = i + 1;
      break;
    }
  }

  const row = [p.date, p.seg, p.store, p.name, JSON.stringify(p.record), new Date().toISOString()];
  if (rowIdx > 0) {
    sh.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }
}

function readPersonal(date, seg) {
  const sh = getPersonalSheet();
  const allData = sh.getDataRange().getValues();
  // 回傳 { store: { name: record } }
  const result = {};
  for (let i = 1; i < allData.length; i++) {
    const r = allData[i];
    if (toDateStr(r[0]) === date && Number(r[1]) === Number(seg)) {
      const store = String(r[2]);
      const name  = String(r[3]);
      let record = null;
      try { record = JSON.parse(r[4]); } catch(e) {}
      if (!result[store]) result[store] = {};
      result[store][name] = record;
    }
  }
  return result;
}

function writeData(date, store, seg, data) {
  const sh = getSheet();
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const allData = sh.getDataRange().getValues();

  // 找現有列（同 date+store+seg）
  let rowIdx = -1;
  for (let i = 1; i < allData.length; i++) {
    const r = allData[i];
    const rDate  = r[headers.indexOf('date')];
    const rStore = r[headers.indexOf('store')];
    const rSeg   = r[headers.indexOf('seg')];
    if (String(rDate) === String(date) && String(rStore) === String(store) && Number(rSeg) === Number(seg)) {
      rowIdx = i + 1; // 1-based
      break;
    }
  }

  // 組成要寫入的列
  const row = headers.map(h => {
    if (h === 'date')  return date;
    if (h === 'store') return store;
    if (h === 'seg')   return seg;
    return data[h] != null ? data[h] : (rowIdx > 0 ? allData[rowIdx-1][headers.indexOf(h)] : '');
  });

  if (rowIdx > 0) {
    sh.getRange(rowIdx, 1, 1, row.length).setValues([row]);
  } else {
    sh.appendRow(row);
  }
}

function toDateStr(v) {
  if (!v && v !== 0) return '';
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy-MM-dd');
  return String(v).substring(0, 10);
}

function readData(date, seg) {
  const sh = getSheet();
  const allData = sh.getDataRange().getValues();
  const headers = allData[0];
  const dateIdx  = headers.indexOf('date');
  const storeIdx = headers.indexOf('store');
  const segIdx   = headers.indexOf('seg');

  const result = {};
  for (let i = 1; i < allData.length; i++) {
    const r = allData[i];
    if (toDateStr(r[dateIdx]) === date && Number(r[segIdx]) === Number(seg)) {
      const store = r[storeIdx];
      const obj = {};
      headers.forEach((h, idx) => {
        const v = r[idx];
        obj[h] = (v instanceof Date) ? toDateStr(v) : v;
      });
      result[store] = obj;
    }
  }
  return result;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
