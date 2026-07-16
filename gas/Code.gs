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
  const cb = e.parameter.callback;

  if (action === 'ping') {
    return jsonResponse({ status: 'ok' }, cb);
  }

  if (action === 'debug') {
    try {
      if (!ptAuthorized(e)) throw new Error('unauthorized');
      const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      const sheets = ss.getSheets().map(s => ({
        name: s.getName(),
        rows: s.getLastRow(),
        cols: s.getLastColumn()
      }));
      const sh = ss.getSheetByName(SHEET_NAME);
      const headers = sh ? sh.getRange(1,1,1,sh.getLastColumn()).getValues()[0] : [];
      const sample = sh && sh.getLastRow() > 1 ? sh.getRange(2,1,1,sh.getLastColumn()).getValues()[0] : [];
      return jsonResponse({ status:'ok', sheets, headers, sample }, cb);
    } catch(err) {
      return jsonResponse({ status:'error', message: err.message }, cb);
    }
  }

  if (action === 'write') {
    try {
      const payload = JSON.parse(decodeURIComponent(e.parameter.payload));
      writeData(payload.date, payload.store, payload.seg, payload.data);
      return jsonResponse({ status: 'ok' }, cb);
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.message }, cb);
    }
  }

  if (action === 'read') {
    try {
      const date = e.parameter.date;
      const seg  = parseInt(e.parameter.seg);
      const data = readData(date, seg);
      return jsonResponse({ status: 'ok', data }, cb);
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.message }, cb);
    }
  }

  // ── 個人回報：寫入 ──
  if (action === 'pwrite') {
    try {
      const payload = JSON.parse(decodeURIComponent(e.parameter.payload));
      writePersonal(payload);
      return jsonResponse({ status: 'ok' }, cb);
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.message }, cb);
    }
  }

  // ── 個人回報：讀取（某日某時段全部）──
  if (action === 'pread') {
    try {
      const date = e.parameter.date;
      const seg  = parseInt(e.parameter.seg);
      const data = readPersonal(date, seg);
      return jsonResponse({ status: 'ok', data }, cb);
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.message }, cb);
    }
  }

  // ── 巡店追蹤：寫入（patrol.html，JSONP）──
  if (action === 'ptwrite') {
    const cb = e.parameter.callback;
    try {
      if (!ptAuthorized(e)) throw new Error('unauthorized');
      const rows = JSON.parse(e.parameter.payload);
      const res = writePatrol(rows);
      const out = { status: 'ok', written: res.written, updated: res.updated };
      if (cb) {
        return ContentService.createTextOutput(cb + '(' + JSON.stringify(out) + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return jsonResponse(out);
    } catch(err) {
      if (cb) {
        return ContentService.createTextOutput(cb + '(' + JSON.stringify({ status: 'error', message: err.message }) + ')')
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      return jsonResponse({ status: 'error', message: err.message });
    }
  }

  // ── 巡店追蹤：讀取全部明細＋本區設定（patrol.html，需通行碼）──
  if (action === 'ptread') {
    try {
      if (!ptAuthorized(e)) throw new Error('unauthorized');
      return jsonResponse({ status: 'ok', rows: readPatrol(), stores: PT_STORES, title: PT_TITLE });
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.message });
    }
  }

  // ── 督導半月檢查：寫入（patrol.html，JSONP）──
  if (action === 'hwrite') {
    const cb = e.parameter.callback;
    try {
      if (!ptAuthorized(e)) throw new Error('unauthorized');
      const rows = JSON.parse(e.parameter.payload);
      const written = writeHalfCheck(rows);
      const body = { status: 'ok', written: written };
      if (cb) return ContentService.createTextOutput(cb + '(' + JSON.stringify(body) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
      return jsonResponse(body);
    } catch(err) {
      const body = { status: 'error', message: err.message };
      if (cb) return ContentService.createTextOutput(cb + '(' + JSON.stringify(body) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
      return jsonResponse(body);
    }
  }

  // ── 督導半月檢查：讀取（patrol.html，需通行碼）──
  if (action === 'hread') {
    try {
      if (!ptAuthorized(e)) throw new Error('unauthorized');
      return jsonResponse({ status: 'ok', rows: readHalfCheck() });
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.message });
    }
  }

  // ── 每月班表：讀取指定月份（patrol.html，需通行碼）──
  if (action === 'sread') {
    try {
      if (!ptAuthorized(e)) throw new Error('unauthorized');
      return jsonResponse({ status: 'ok', schedule: readSchedule(e.parameter.month || '') });
    } catch(err) {
      return jsonResponse({ status: 'error', message: err.message });
    }
  }

  return jsonResponse({ status: 'error', message: 'unknown action' }, cb);
}

// ════════════════════════════════════
// 督導巡店追蹤（patrol.html）
// 工作表：巡店明細
// 欄位：fillTime, arriveTime, leaveTime, district, code, store,
//       inspector, item, result, reason, month, savedAt
// 以 fillTime+store+item 為唯一鍵，重複上傳自動略過
//
// ⚠️ 通行碼：貼進 GAS 編輯器後，把下面 PT_KEY 的 'CHANGE_ME'
// 改成你自己的密碼再存檔部署（repo 裡只放佔位字，密碼不會公開）。
// 保持 'CHANGE_ME' 不改的話，巡店讀寫一律拒絕。
// ════════════════════════════════════
const PT_KEY = 'CHANGE_ME';

// ── 分享給其他督導時，每人自建試算表與 GAS 部署，改這兩個設定即可 ──
// （網頁 patrol.html 大家共用，會自動抓各自 GAS 回傳的標題與門市清單）
const PT_TITLE = '北一二B區 · 33 項檢核追蹤';
const PT_STORES = [
  { code: 'DNB10059', name: '台北通化' },
  { code: 'DNB10062', name: '台北酒泉' },
  { code: 'DNB10307', name: '台北三創' },
  { code: 'DNB10xxx_wanda', name: '台北萬大' },
  { code: 'DNB10440', name: '台北六張犁' },
  { code: 'DNB10094', name: '台北復興南' },
  { code: 'DNB10082', name: '台北永吉' },
  { code: 'DNB10284', name: '台北大稻埕' },
  { code: 'DNB10146', name: '台北杭州南' },
];

function ptAuthorized(e) {
  return PT_KEY !== 'CHANGE_ME' && e.parameter.key === PT_KEY;
}

const PATROL_SHEET = '巡店明細';
const PATROL_HEADERS = ['fillTime','arriveTime','leaveTime','district','code','store','inspector','item','result','reason','month','savedAt'];

function getPatrolSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(PATROL_SHEET);
  if (!sh) {
    sh = ss.insertSheet(PATROL_SHEET);
    sh.appendRow(PATROL_HEADERS);
    sh.setFrozenRows(1);
    // 全欄設純文字，避免 2026/7/1 之類被試算表轉成 Date 物件
    sh.getRange('A:L').setNumberFormat('@');
  }
  return sh;
}

function patrolTimeStr(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Taipei', 'yyyy/M/d H:mm');
  return String(v == null ? '' : v).trim();
}

function patrolKey(fillTime, store, item) {
  return patrolTimeStr(fillTime) + '|' + String(store) + '|' + Number(item);
}

function writePatrol(rows) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sh = getPatrolSheet();
    const data = sh.getDataRange().getValues();
    // key → { row: 試算表列號, result, reason }
    const seen = {};
    for (let i = 1; i < data.length; i++) {
      seen[patrolKey(data[i][0], data[i][5], data[i][7])] =
        { row: i + 1, result: String(data[i][8] || ''), reason: String(data[i][9] || '') };
    }
    const now = new Date().toISOString();
    const toAdd = [];
    let updated = 0;
    rows.forEach(r => {
      const k = patrolKey(r.fillTime, r.store, r.item);
      const ex = seen[k];
      if (ex) {
        // 同一筆但結果/原因有變（來源表事後補填「是否合格」）→ 就地更新
        const nr = String(r.result || ''), nrs = String(r.reason || '');
        if (ex.row > 0 && (nr !== ex.result || nrs !== ex.reason)) {
          sh.getRange(ex.row, 9, 1, 2).setValues([[nr, nrs]]);
          sh.getRange(ex.row, 12).setValue(now);
          ex.result = nr; ex.reason = nrs;
          updated++;
        }
        return;
      }
      seen[k] = { row: -1, result: String(r.result || ''), reason: String(r.reason || '') };
      toAdd.push([
        patrolTimeStr(r.fillTime), String(r.arriveTime || ''), String(r.leaveTime || ''),
        String(r.district || ''), String(r.code || ''), String(r.store || ''), String(r.inspector || ''),
        String(r.item || ''), String(r.result || ''), String(r.reason || ''), String(r.month || ''), now
      ]);
    });
    if (toAdd.length > 0) {
      sh.getRange(sh.getLastRow() + 1, 1, toAdd.length, PATROL_HEADERS.length).setValues(toAdd);
    }
    return { written: toAdd.length, updated: updated };
  } finally {
    lock.releaseLock();
  }
}

function readPatrol() {
  const sh = getPatrolSheet();
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const o = {};
    headers.forEach((h, idx) => {
      let v = data[i][idx];
      if (v instanceof Date) v = patrolTimeStr(v);
      o[h] = v;
    });
    rows.push(o);
  }
  return rows;
}

// ════════════════════════════════════
// 督導半月檢查
// 工作表：半月督導檢查
// 預先建立每店、每期 33 題，寫入時更新對應題目，不碰每日回報與巡店頁籤。
// 證據只保存私有 Google Drive 連結／檔名；原始影像不寫入試算表。
// ════════════════════════════════════
const HALF_CHECK_SHEET = '半月督導檢查';
const HALF_CHECK_HEADERS = [
  '檢查ID','檢查期別','檢查日期','門市','督導','項目','檢查結果','缺失說明',
  '改善措施','改善期限','改善狀態','證據檔案連結','建立時間','更新時間','執行頻率','填寫狀態'
];

function getHalfCheckSheet() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = findNamedSheet(ss, HALF_CHECK_SHEET);
  if (!sh) {
    sh = ss.insertSheet(HALF_CHECK_SHEET);
    sh.appendRow(HALF_CHECK_HEADERS);
    sh.setFrozenRows(1);
    sh.getRange('A:P').setNumberFormat('@');
  }
  return sh;
}

function halfCheckItemNo(value) {
  const match = String(value || '').match(/^(\d+)/);
  return match ? Number(match[1]) : Number(value || 0);
}

function halfCheckKey(row) {
  return [String(row[1] || ''), String(row[3] || ''), halfCheckItemNo(row[5])].join('|');
}

function halfResultToSheet(result) {
  return ({ ok:'符合', abnormal:'缺失／異常', na:'不適用' })[String(result || '')] || '';
}

function halfResultToClient(result) {
  return ({ '符合':'ok', '缺失／異常':'abnormal', '不適用':'na' })[String(result || '')] || '';
}

function writeHalfCheck(rows) {
  const sh = getHalfCheckSheet();
  const data = sh.getDataRange().getValues();
  const existing = {};
  for (let i = 1; i < data.length; i++) existing[halfCheckKey(data[i])] = i + 1;
  let written = 0;
  (rows || []).forEach(r => {
    const month = String(r.month || String(r.date || '').slice(0, 7));
    const period = `${month}-${String(r.period || '')}`;
    const itemNo = Number(r.item || 0);
    const key = [period, String(r.store || ''), itemNo].join('|');
    const oldRow = existing[key] ? data[existing[key] - 1] : [];
    const now = String(r.savedAt || new Date().toISOString());
    const itemText = oldRow[5] || String(itemNo);
    const row = [
      String(r.checkId || `${r.date}|${r.store}|${r.period}`), period, String(r.date || ''),
      String(r.store || ''), String(r.inspector || ''), String(itemText), halfResultToSheet(r.result),
      String(r.note || ''), String(r.improvement || ''), String(oldRow[9] || ''),
      String(r.result === 'abnormal' ? '待改善' : (oldRow[10] || '')),
      String(r.evidenceNames || ''), String(oldRow[12] || now), now,
      String(oldRow[14] || ''), String(r.result ? '已完成' : '填寫中')
    ];
    if (existing[key]) {
      sh.getRange(existing[key], 1, 1, HALF_CHECK_HEADERS.length).setValues([row]);
      data[existing[key] - 1] = row;
    } else {
      sh.getRange(sh.getLastRow() + 1, 1, 1, HALF_CHECK_HEADERS.length).setValues([row]);
      existing[key] = sh.getLastRow();
      data.push(row);
    }
    written++;
  });
  return written;
}

function readHalfCheck() {
  const sh = getHalfCheckSheet();
  const data = sh.getDataRange().getValues();
  if (!data.length) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const o = {};
    headers.forEach((h, idx) => o[h] = row[idx] instanceof Date ? patrolTimeStr(row[idx]) : row[idx]);
    const periodText = String(o['檢查期別'] || '');
    return {
      checkId: String(o['檢查ID'] || ''),
      date: String(o['檢查日期'] || ''),
      period: periodText.slice(-2),
      month: periodText.slice(0, 7),
      store: String(o['門市'] || ''),
      inspector: String(o['督導'] || ''),
      item: halfCheckItemNo(o['項目']),
      result: halfResultToClient(o['檢查結果']),
      note: String(o['缺失說明'] || ''),
      improvement: String(o['改善措施'] || ''),
      evidenceNames: String(o['證據檔案連結'] || ''),
      savedAt: String(o['更新時間'] || o['建立時間'] || '')
    };
  }).filter(o => o.date || o.result || o.inspector);
}

// ════════════════════════════════════
// 每月班表（工作表：班表明細）
// 僅由受保護頁籤讀取，GitHub Pages 不保存任何班表內容。
// ════════════════════════════════════
const SCHEDULE_SHEET = '班表明細';

// Some imported Excel sheets can carry invisible leading/trailing whitespace
// in their tab name. Match the exact name first, then a normalized fallback.
function findNamedSheet(ss, sheetName) {
  return ss.getSheetByName(sheetName) || ss.getSheets().find(sh => {
    const normalized = String(sh.getName() || '').replace(/\u3000/g, ' ').trim();
    return normalized === sheetName;
  });
}

function readSchedule(requestedMonth) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = findNamedSheet(ss, SCHEDULE_SHEET);
  if (!sh || sh.getLastRow() < 2) throw new Error('尚無已匯入的班表資料');
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);
  const available = data.slice(1).map(r => String(r[idx['版本月份']] || '')).filter(Boolean).sort();
  const month = requestedMonth && available.indexOf(requestedMonth) >= 0 ? requestedMonth : available[available.length - 1];
  if (!month) throw new Error('找不到指定月份班表');
  const stores = {};
  data.slice(1).filter(r => String(r[idx['版本月份']] || '') === month).forEach(r => {
    const storeName = String(r[idx['門市']] || '');
    const date = scheduleDateString(r[idx['日期']]);
    if (!storeName || !date) return;
    if (!stores[storeName]) stores[storeName] = { store: storeName, title: storeName, staff: {}, days: {} };
    const store = stores[storeName];
    const name = String(r[idx['同仁']] || '');
    const role = String(r[idx['職務']] || '');
    const status = String(r[idx['班別']] || '');
    const working = String(r[idx['出勤']] || '') === '是';
    const manager = String(r[idx['值班主管']] || '') === '是';
    if (name && !store.staff[name]) store.staff[name] = { name: name, role: role };
    if (!store.days[date]) store.days[date] = { date: date, staff: [], managers: [], workingStaff: [] };
    const assignment = { name: name, role: role, status: status, working: working };
    store.days[date].staff.push(assignment);
    if (working) store.days[date].workingStaff.push(assignment);
    if (manager) store.days[date].managers.push(assignment);
  });
  const list = Object.keys(stores).sort().map(name => ({
    store: stores[name].store,
    title: stores[name].title,
    staff: Object.keys(stores[name].staff).sort().map(k => stores[name].staff[k]),
    days: Object.keys(stores[name].days).sort().map(k => stores[name].days[k])
  }));
  const parts = month.split('-').map(Number);
  return { month: month, rocMonth: `民國${parts[0] - 1911}年${String(parts[1]).padStart(2, '0')}月`, stores: list };
}

function scheduleDateString(value) {
  if (value instanceof Date) return Utilities.formatDate(value, 'Asia/Taipei', 'yyyy-MM-dd');
  return String(value || '').slice(0, 10);
}

// 每週一巡店週報（Email 夾 Excel）
//
// 啟用方式（只需做一次）：
//   函式選單選「setupWeeklyReport」→ 執行（會要求授權，同意即可）
//   之後每週一 08:00（台北時間）寄巡店報告到 NOTIFY_EMAIL，
//   夾檔 Excel 含「檢核總表」（每店×33題 ✓✗矩陣）與「本月明細」。
// 想立即試寄：函式選單選「testWeeklyReport」執行。
// 注意：時間觸發器跑最新存檔程式碼，不需重新部署。
// ════════════════════════════════════
const PT_ITEM_TEXT = {
  1:'督導駐點', 2:'店格陳列／展機防盜／回收桶上鎖', 3:'中島展示機無不當資訊且開機恆亮',
  4:'前後場整潔、公佈欄符合規範', 5:'有價商品櫃是否上鎖', 6:'電腦記事本／資料夾mail個資檢查',
  7:'申裝書3日回送、無不當留存個資', 8:'同仁服裝儀容與服務態度', 9:'出勤與班表一致並載休息時間',
  10:'人員面談及輔導', 11:'門市安全（禁菸／禁火源）', 12:'監控設備運作正常',
  13:'店務日誌與督導簽名', 14:'待銷毀文件打包歸檔上鎖', 15:'待回送／未結案維修機盤點',
  16:'保全金零找金現金盤點', 17:'iPhone手機盤點盤差登載', 18:'到店全盤作業（2月1次）',
  19:'知悉：NCC風險管理機制指引公布', 20:'知悉：受理申請證件納入KYC審核', 21:'知悉：拒絕提供資料者應拒辦',
  22:'知悉：公司已成立查核部門', 23:'知悉：自然人雙證件正本核對', 24:'知悉：法人團體證件核對',
  25:'知悉：企業客戶用途清冊實地查訪', 26:'知悉：委託代理人證件核對', 27:'知悉：初次申辦臨櫃／數位簽章',
  28:'知悉：初次申辦拍照留存1年', 29:'知悉：外籍短效預付卡免拍照條件', 30:'知悉：外籍申辦以1門為原則',
  31:'知悉：外籍簽證少於1月限短效卡', 32:'知悉：詐欺受限3年申辦限制', 33:'知悉：受限用戶3年再申辦限制'
};

function setupWeeklyReport() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'sendWeeklyPatrolReport') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendWeeklyPatrolReport').timeBased().everyWeeks(1)
    .onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).inTimezone('Asia/Taipei').create();
}

function testWeeklyReport() { sendWeeklyPatrolReport(); }

// 題18固定雙月週期（1-2、3-4、5-6、7-8、9-10、11-12）的兩個月份
function ptWinMonths(monthKey) {
  const p = monthKey.split('-');
  const y = Number(p[0]), m = Number(p[1]);
  const s = (m % 2 === 1) ? m : m - 1;
  const pad = n => ('0' + n).slice(-2);
  return [y + '-' + pad(s), y + '-' + pad(s + 1)];
}

function ptDayOf(fillTime) {
  const m = String(fillTime).match(/\d{4}\/\d{1,2}\/(\d{1,2})/);
  return m ? Number(m[1]) : 0;
}

// 與前端看板同一套完成度判定
function ptItemDone(storeRows, item, monthKey) {
  const isV = r => String(r.result).toLowerCase() === 'v';
  if (item === 18) {
    const winM = ptWinMonths(monthKey);
    return storeRows.some(r => Number(r.item) === 18 && isV(r) && winM.indexOf(String(r.month)) !== -1);
  }
  const mRows = storeRows.filter(r => Number(r.item) === item && String(r.month) === monthKey);
  if (item === 1) return mRows.length > 0; // 駐點：當月有紀錄即可（v或na）
  if (item >= 2 && item <= 13) {           // 上下半月各1次
    const h1 = mRows.some(r => isV(r) && ptDayOf(r.fillTime) <= 15);
    const h2 = mRows.some(r => isV(r) && ptDayOf(r.fillTime) > 15);
    return h1 && h2;
  }
  return mRows.some(isV);                  // 每月至少1次
}

// 某官方門市對應的所有明細列（店名關鍵字或營業點代碼比對，與前端 findRecordStore 一致）
function ptStoreRows(all, st) {
  const key = st.name.replace('台北', '');
  return all.filter(r => {
    const rs = String(r.store || '');
    if (!rs) return false;
    if (st.code && String(r.code || '') === st.code) return true;
    return rs.indexOf(key) !== -1 || st.name.indexOf(rs) !== -1;
  });
}

// 由 fillTime 取 'M/D' 顯示用日期
function ptDateOf(fillTime) {
  const m = String(fillTime).match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  return m ? (Number(m[2]) + '/' + Number(m[3])) : '';
}

function sendWeeklyPatrolReport() {
  const tz = 'Asia/Taipei';
  const now = new Date();
  const monthKey = Utilities.formatDate(now, tz, 'yyyy-MM');
  const dateStr = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const todayDay = Number(Utilities.formatDate(now, tz, 'd'));
  const monthNum = Number(monthKey.split('-')[1]);
  const all = readPatrol();
  const isV = r => String(r.result).toLowerCase() === 'v';
  const inMonth = r => String(r.month) === monthKey;

  // 每店明細（官方門市清單順序）
  const stores = PT_STORES.map(st => ({ st: st, rows: ptStoreRows(all, st) }));

  // ── 分頁1：巡店紀錄（本月明細）──
  const tabDetail = [['填表時間', '店點', '題號', '檢查內容', '結果', '未查/不合格原因', '上傳時間']];
  all.filter(inMonth)
    .sort((a, b) => String(a.fillTime) < String(b.fillTime) ? -1 : 1)
    .forEach(r => {
      tabDetail.push([String(r.fillTime), String(r.store), Number(r.item),
        PT_ITEM_TEXT[Number(r.item)] || '', String(r.result || ''), String(r.reason || ''), String(r.savedAt || '')]);
    });

  // ── 分頁2：未巡店（本月無任何紀錄）──
  const notVisited = stores.filter(s => !s.rows.some(inMonth));
  const tabNotVisited = [['店點', '營業點代碼', '本月狀態', '最近一次巡店']];
  notVisited.forEach(s => {
    let lastDate = '';
    s.rows.forEach(r => { const d = String(r.fillTime); if (d > lastDate) lastDate = d; });
    tabNotVisited.push([s.st.name, s.st.code, '本月尚未巡店', lastDate || '（從無紀錄）']);
  });
  if (notVisited.length === 0) tabNotVisited.push(['—', '—', '✓ 九店本月皆已巡店', '—']);

  // ── 分頁3：上下半月（題2-13）──
  const tabHalf = [['店點'].concat(Array.from({length: 12}, (_, i) => String(i + 2)))];
  stores.forEach(s => {
    const row = [s.st.name];
    for (let it = 2; it <= 13; it++) {
      const mRows = s.rows.filter(r => inMonth(r) && Number(r.item) === it);
      const h1 = mRows.some(r => isV(r) && ptDayOf(r.fillTime) <= 15);
      const h2 = mRows.some(r => isV(r) && ptDayOf(r.fillTime) > 15);
      row.push(h1 && h2 ? '完成' : (h1 ? '缺下' : (h2 ? '缺上' : '未做')));
    }
    tabHalf.push(row);
  });
  tabHalf.push(['說明：完成=上下半月各1次皆✓／缺上·缺下=只做一半／未做=本月無合格紀錄']);

  // ── 分頁4：每月盤點（題14-17）──
  const tabMonthly = [['店點', '14.銷毀文件', '15.維修機盤點', '16.現金盤點', '17.iPhone盤點', '四項完成']];
  let monthlyDone = 0;
  stores.forEach(s => {
    const cells = [];
    let all4 = true;
    for (let it = 14; it <= 17; it++) {
      const e = s.rows.find(r => inMonth(r) && Number(r.item) === it && isV(r));
      cells.push(e ? '✓ ' + ptDateOf(e.fillTime) : '✗');
      if (!e) all4 = false;
    }
    if (all4) monthlyDone++;
    tabMonthly.push([s.st.name].concat(cells, [all4 ? '✓' : '✗']));
  });

  // ── 分頁5：雙月全盤（題18，固定週期）──
  const winM = ptWinMonths(monthKey);
  const prevStart = (Number(winM[0].split('-')[1]) === 1)
    ? (Number(winM[0].split('-')[0]) - 1) + '-11'
    : winM[0].split('-')[0] + '-' + ('0' + (Number(winM[0].split('-')[1]) - 2)).slice(-2);
  const prevWinM = ptWinMonths(prevStart);
  const winLabel = Number(winM[0].split('-')[1]) + '–' + Number(winM[1].split('-')[1]) + '月';
  const tab18 = [['店點', '本期 ' + winLabel, '本期完成日', '上期完成日']];
  let done18 = 0;
  stores.forEach(s => {
    const v18 = s.rows.filter(r => Number(r.item) === 18 && isV(r));
    const cur = v18.find(r => winM.indexOf(String(r.month)) !== -1);
    const prev = v18.find(r => prevWinM.indexOf(String(r.month)) !== -1);
    if (cur) done18++;
    tab18.push([s.st.name, cur ? '✓ 已完成' : '✗ 未完成',
      cur ? ptDateOf(cur.fillTime) : '—', prev ? ptDateOf(prev.fillTime) : '—']);
  });

  // ── 分頁6：知悉20日前（題19-33）──
  const daysLeft = 20 - todayDay;
  const tabAware = [['店點', '進度', '狀態', '完成日']];
  let doneAware = 0;
  stores.forEach(s => {
    let cnt = 0, doneDay = 0;
    for (let it = 19; it <= 33; it++) {
      const days = s.rows.filter(r => inMonth(r) && Number(r.item) === it && isV(r))
        .map(r => ptDayOf(r.fillTime)).filter(d => d > 0);
      if (days.length) {
        cnt++;
        const first = Math.min.apply(null, days);
        if (first > doneDay) doneDay = first;
      }
    }
    const allDone = cnt === 15;
    if (allDone) doneAware++;
    const state = allDone ? ('✓ 已完成' + (doneDay > 20 ? '（逾20日）' : ''))
      : (daysLeft >= 0 ? '剩 ' + daysLeft + ' 天' : '⚠ 逾期 ' + (-daysLeft) + ' 天');
    tabAware.push([s.st.name, cnt + '/15', state, allDone ? monthNum + '/' + doneDay : '—']);
  });

  // ── 產生暫存試算表（6個分頁）→ 匯出 xlsx → 寄出 → 刪除暫存 ──
  const ss = SpreadsheetApp.create('巡店報告_' + dateStr);
  const tabs = [
    ['巡店紀錄', tabDetail], ['未巡店', tabNotVisited], ['上下半月2-13', tabHalf],
    ['每月盤點14-17', tabMonthly], ['雙月全盤18', tab18], ['知悉20日前19-33', tabAware]
  ];
  tabs.forEach((t, i) => {
    const sh = i === 0 ? ss.getSheets()[0] : ss.insertSheet();
    sh.setName(t[0]);
    const w = Math.max.apply(null, t[1].map(r => r.length));
    const grid = t[1].map(r => r.concat(Array(w - r.length).fill('')));
    sh.getRange(1, 1, grid.length, w).setValues(grid);
    sh.setFrozenRows(1);
  });
  SpreadsheetApp.flush();

  const blob = UrlFetchApp.fetch(
    'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?format=xlsx',
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }
  ).getBlob().setName('巡店報告_' + dateStr + '.xlsx');

  const body =
    '📋 巡店週報 ' + dateStr + '（追蹤月份 ' + monthKey + '）\n\n' +
    '・已巡店：' + (PT_STORES.length - notVisited.length) + '/' + PT_STORES.length +
    (notVisited.length ? '（未巡：' + notVisited.map(s => s.st.name).join('、') + '）' : '') + '\n' +
    '・每月盤點(14-17)四項完成：' + monthlyDone + '/' + PT_STORES.length + ' 店\n' +
    '・雙月全盤(18)本期 ' + winLabel + '：' + done18 + '/' + PT_STORES.length + ' 店\n' +
    '・知悉(19-33)全數勾核：' + doneAware + '/' + PT_STORES.length + ' 店' +
    (daysLeft >= 0 ? '（截止 ' + monthNum + '/20，剩 ' + daysLeft + ' 天）' : '（已逾 ' + monthNum + '/20 截止日）') + '\n\n' +
    '各項明細請見夾檔 Excel 的六個分頁。\n' +
    '看板：https://lian852456-dot.github.io/liamlu/patrol.html';
  MailApp.sendEmail(NOTIFY_EMAIL, '📊 巡店週報 ' + dateStr + '｜' + PT_TITLE, body, { attachments: [blob] });
  DriveApp.getFileById(ss.getId()).setTrashed(true);
}

// ════════════════════════════════════
// 知悉宣導月中提醒（題19-33，每月20日前需全數完成）
//
// 啟用方式（只需做一次）：
//   函式選單選「setupAwareTrigger」→ 執行（會要求授權，同意即可）
//   之後每月 15 號 09:00（台北時間）自動檢查「巡店明細」，
//   未完成門市寄提醒信到 NOTIFY_EMAIL。
// 注意：時間觸發器跑的是編輯器最新存檔的程式碼，【不需要】重新部署。
// 想立即測試：函式選單選「testAwareNotify」執行，馬上寄一封。
// ════════════════════════════════════
const AWARE_FROM = 19, AWARE_TO = 33;
const AWARE_TOTAL = AWARE_TO - AWARE_FROM + 1; // 15 題

function setupAwareTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'checkAwareAndNotify') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('checkAwareAndNotify').timeBased()
    .onMonthDay(15).atHour(9).inTimezone('Asia/Taipei').create();
}

function testAwareNotify() { checkAwareAndNotify(); }

function checkAwareAndNotify() {
  const tz = 'Asia/Taipei';
  const monthKey = Utilities.formatDate(new Date(), tz, 'yyyy-MM');
  const monthLabel = Number(monthKey.split('-')[1]) + '月';

  const sh = getPatrolSheet();
  const data = sh.getDataRange().getValues();
  const headers = data[0];
  const idx = {};
  headers.forEach((h, i) => idx[h] = i);

  // 每個貼上店名 → 本月已勾核(v)的知悉題號集合
  const done = {};
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    const item = Number(r[idx.item]);
    if (item < AWARE_FROM || item > AWARE_TO) continue;
    if (String(r[idx.result]).toLowerCase() !== 'v') continue;
    if (String(r[idx.month]) !== monthKey) continue;
    const store = String(r[idx.store]);
    if (!done[store]) done[store] = {};
    done[store][item] = true;
  }

  // 對應本區門市（貼上店名可能含「台北」前綴，用關鍵字比對）
  const rows = PT_STORES.map(s => {
    const key = s.name.replace('台北', '');
    let cnt = 0;
    Object.keys(done).forEach(ps => {
      if (ps.indexOf(key) !== -1) cnt = Math.max(cnt, Object.keys(done[ps]).length);
    });
    return { store: s.name, cnt: cnt };
  });
  const incomplete = rows.filter(r => r.cnt < AWARE_TOTAL)
    .sort((a, b) => a.cnt - b.cnt);
  const complete = rows.filter(r => r.cnt >= AWARE_TOTAL);

  if (incomplete.length > 0) {
    const subject = '📣 巡店知悉提醒 ' + monthKey + '：尚有 ' + incomplete.length + ' 店未完成（20日前需全數勾核）';
    const body =
      '📋 ' + monthLabel + ' 知悉宣導（題19-33）進度檢查\n' +
      '⏰ 截止：' + monthLabel + '20日前每店需全數勾核一次\n\n' +
      '🔴 未完成（' + incomplete.length + ' 店）：\n' +
      incomplete.map(r => '　・' + r.store + '　' + r.cnt + '/' + AWARE_TOTAL).join('\n') + '\n\n' +
      '✅ 已完成（' + complete.length + ' 店）：' + (complete.map(r => r.store).join('、') || '無') + '\n\n' +
      '追蹤看板：https://lian852456-dot.github.io/liamlu/patrol.html';
    MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
  } else {
    const subject = '✅ 巡店知悉 ' + monthKey + ' 九店全數完成';
    const body = monthLabel + ' 知悉宣導（題19-33）九店皆已於期限前全數勾核，無需跟進。\n\n' +
      '追蹤看板：https://lian852456-dot.github.io/liamlu/patrol.html';
    MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
  }
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

function jsonResponse(obj, callback) {
  const body = JSON.stringify(obj);
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$]*$/.test(callback)) {
    return ContentService.createTextOutput(`${callback}(${body})`)
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body)
    .setMimeType(ContentService.MimeType.JSON);
}

// ════════════════════════════════════
// 北一二B KPI／台獎私有戰情
//
// 重要：資料快照、員編、裝置綁定皆不會放進 GitHub Pages 或公開原始碼。
// 請先在「專案設定 > 指令碼屬性」設定：
// - DASHBOARD_PRIVATE_FOLDER_ID：私有 Google Drive 資料夾 ID
// - DASHBOARD_ADMIN_SECRET：僅區主管持有的強密碼
// - DASHBOARD_BOOTSTRAP_CODE：首次綁定碼（目前為 0935）
// 然後在 Apps Script 編輯器手動執行一次 setupPrivateDashboard()。
// ════════════════════════════════════

const PRIVATE_DASHBOARD_FILE = 'north12b-dashboard-private-latest.json';
const PRIVATE_DASHBOARD_USERS_SHEET = 'DashboardUsers';
const PRIVATE_DASHBOARD_REQUESTS_SHEET = 'DashboardRequests';
const PRIVATE_DASHBOARD_USERS_HEADERS = [
  'employee_id', 'masked_name', 'store', 'role', 'status',
  'device_id', 'device_bound_at', 'last_login_at'
];
const PRIVATE_DASHBOARD_REQUEST_HEADERS = [
  'request_id', 'employee_id', 'device_id', 'requested_at', 'status',
  'approved_at', 'approved_by', 'replaced_device_id'
];

function doPost(e) {
  try {
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = String(payload.action || '');
    let result;
    if (action === 'private_request') result = privateDashboardRequestBinding(payload);
    else if (action === 'private_request_status') result = privateDashboardRequestStatus(payload);
    else if (action === 'private_access') result = privateDashboardAccess(payload);
    else if (action === 'private_admin_requests') result = privateDashboardAdminRequests(payload);
    else if (action === 'private_admin_approve') result = privateDashboardAdminApprove(payload);
    else if (action === 'private_admin_revoke') result = privateDashboardAdminRevoke(payload);
    else if (action === 'private_admin_set_trusted_employee') result = privateDashboardAdminSetTrustedEmployee(payload);
    else if (action === 'private_sync_roster') result = privateDashboardSyncRoster(payload);
    else if (action === 'private_publish') result = privateDashboardPublish(payload);
    else throw new Error('unknown private dashboard action');
    return jsonResponse({ status: 'ok', ...result });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err && err.message ? err.message : String(err) });
  }
}

function privateDashboardProperties() {
  return PropertiesService.getScriptProperties();
}

function privateDashboardRequiredProperty(name) {
  const value = privateDashboardProperties().getProperty(name);
  if (!value || /^CHANGE_ME/i.test(value)) throw new Error('private dashboard is not configured: ' + name);
  return value;
}

function privateDashboardNow() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function privateDashboardCleanEmployeeId(value) {
  const employeeId = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{5,12}$/.test(employeeId)) throw new Error('員編格式不正確');
  return employeeId;
}

function privateDashboardIsTrustedEmployee(employeeId) {
  const trustedEmployeeId = String(privateDashboardProperties().getProperty('DASHBOARD_TRUSTED_EMPLOYEE_ID') || '')
    .trim()
    .toUpperCase();
  return /^[A-Z0-9]{5,12}$/.test(trustedEmployeeId) && employeeId === trustedEmployeeId;
}

function privateDashboardCleanDeviceId(value) {
  const deviceId = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(deviceId)) throw new Error('裝置識別不正確，請重新開啟頁面');
  return deviceId;
}

function privateDashboardHash(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''));
  return bytes.map(function(byte) {
    const normalized = byte < 0 ? byte + 256 : byte;
    return ('0' + normalized.toString(16)).slice(-2);
  }).join('');
}

function privateDashboardAdminAuthorized(payload) {
  const expected = privateDashboardRequiredProperty('DASHBOARD_ADMIN_SECRET');
  const actual = String((payload || {}).adminSecret || '');
  if (privateDashboardHash(actual) !== privateDashboardHash(expected)) throw new Error('管理者驗證失敗');
}

function privateDashboardFolder() {
  return DriveApp.getFolderById(privateDashboardRequiredProperty('DASHBOARD_PRIVATE_FOLDER_ID'));
}

function privateDashboardRoster() {
  const props = privateDashboardProperties();
  const id = props.getProperty('DASHBOARD_ROSTER_SHEET_ID');
  if (!id) throw new Error('尚未初始化私有戰情名冊，請先執行 setupPrivateDashboard');
  return SpreadsheetApp.openById(id);
}

function privateDashboardSheet(name, headers) {
  const ss = privateDashboardRoster();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  const existing = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  if (existing.join('|') !== headers.join('|')) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sheet;
}

function privateDashboardRows(sheet, headers) {
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues().map(function(row, offset) {
    const item = { _row: offset + 2 };
    headers.forEach(function(header, index) { item[header] = row[index] == null ? '' : String(row[index]); });
    return item;
  });
}

function privateDashboardWriteObject(sheet, headers, rowIndex, item) {
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([headers.map(function(header) { return item[header] || ''; })]);
}

// 由管理者在 Apps Script 編輯器執行一次。建立的 Sheet 位於同一個私有 Drive 資料夾中。
function setupPrivateDashboard() {
  const props = privateDashboardProperties();
  const folder = privateDashboardFolder();
  let rosterId = props.getProperty('DASHBOARD_ROSTER_SHEET_ID');
  let roster;
  if (rosterId) {
    roster = SpreadsheetApp.openById(rosterId);
  } else {
    roster = SpreadsheetApp.create('北一二B 私有戰情登入名冊（系統管理）');
    const file = DriveApp.getFileById(roster.getId());
    folder.addFile(file);
    DriveApp.getRootFolder().removeFile(file);
    props.setProperty('DASHBOARD_ROSTER_SHEET_ID', roster.getId());
    rosterId = roster.getId();
  }
  privateDashboardSheet(PRIVATE_DASHBOARD_USERS_SHEET, PRIVATE_DASHBOARD_USERS_HEADERS);
  privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS);
  return { rosterSheetId: rosterId, folderId: folder.getId() };
}

function privateDashboardUserByEmployeeId(employeeId) {
  const sheet = privateDashboardSheet(PRIVATE_DASHBOARD_USERS_SHEET, PRIVATE_DASHBOARD_USERS_HEADERS);
  const found = privateDashboardRows(sheet, PRIVATE_DASHBOARD_USERS_HEADERS)
    .filter(function(item) { return item.employee_id === employeeId; });
  return { sheet: sheet, user: found.length ? found[0] : null };
}

function privateDashboardRequestBinding(payload) {
  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const deviceId = privateDashboardCleanDeviceId(payload.deviceId);
  const bootstrapCode = String(payload.bootstrapCode || '');
  if (privateDashboardHash(bootstrapCode) !== privateDashboardHash(privateDashboardRequiredProperty('DASHBOARD_BOOTSTRAP_CODE'))) {
    throw new Error('首次啟用碼不正確');
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const lookup = privateDashboardUserByEmployeeId(employeeId);
    if (!lookup.user || lookup.user.status !== 'active') throw new Error('此員編不在可使用名冊中');
    if (lookup.user.device_id === deviceId) return { requestStatus: 'approved', message: '此裝置已核准，可直接以員編登入。' };
    const requestSheet = privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS);
    const requests = privateDashboardRows(requestSheet, PRIVATE_DASHBOARD_REQUEST_HEADERS);
    const prior = requests.filter(function(item) {
      return item.employee_id === employeeId && item.device_id === deviceId && item.status === 'pending';
    })[0];
    if (prior) return { requestStatus: 'pending', requestId: prior.request_id, message: '已送出綁定申請，等待管理者核准。' };
    const request = {
      request_id: Utilities.getUuid(), employee_id: employeeId, device_id: deviceId,
      requested_at: privateDashboardNow(), status: 'pending', approved_at: '', approved_by: '', replaced_device_id: ''
    };
    privateDashboardWriteObject(requestSheet, PRIVATE_DASHBOARD_REQUEST_HEADERS, requestSheet.getLastRow() + 1, request);
    privateDashboardNotifyAdminOfBindingRequest(request, lookup.user);
    return { requestStatus: 'pending', requestId: request.request_id, message: '已送出綁定申請，等待管理者核准。' };
  } finally {
    lock.releaseLock();
  }
}

function privateDashboardRequestStatus(payload) {
  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const deviceId = privateDashboardCleanDeviceId(payload.deviceId);
  const requests = privateDashboardRows(
    privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS),
    PRIVATE_DASHBOARD_REQUEST_HEADERS
  ).filter(function(item) { return item.employee_id === employeeId && item.device_id === deviceId; });
  requests.sort(function(a, b) { return b.requested_at.localeCompare(a.requested_at); });
  const latest = requests[0];
  if (!latest) return { requestStatus: 'none' };
  return { requestStatus: latest.status, requestedAt: latest.requested_at, approvedAt: latest.approved_at };
}

function privateDashboardNotifyAdminOfBindingRequest(request, user) {
  const notifyEmail = String(privateDashboardProperties().getProperty('DASHBOARD_NOTIFY_EMAIL') || '').trim();
  if (!notifyEmail) return;
  const body = [
    '北一二B KPI／台獎戰情有新的裝置綁定申請。',
    '員編：' + request.employee_id,
    '姓名：' + String(user.masked_name || ''),
    '店點：' + String(user.store || ''),
    '職務：' + String(user.role || ''),
    '申請時間：' + request.requested_at,
    '',
    '請開啟網站的 KPI戰情或台獎戰情頁籤，按「管理者核准」處理。'
  ].join('\n');
  try {
    MailApp.sendEmail(notifyEmail, '🔐 北一二B 戰情登入申請待核准', body);
  } catch (error) {
    console.log('private dashboard binding notification failed: ' + error);
  }
}

function privateDashboardSnapshot() {
  const files = privateDashboardFolder().getFilesByName(PRIVATE_DASHBOARD_FILE);
  if (!files.hasNext()) throw new Error('今日私有戰情尚未更新');
  const snapshot = JSON.parse(files.next().getBlob().getDataAsString('UTF-8'));
  if (!snapshot || !snapshot.kpiBattle || !snapshot.awardsBattle) throw new Error('私有戰情快照格式不完整');
  return snapshot;
}

function privateDashboardAccess(payload) {
  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const deviceId = privateDashboardCleanDeviceId(payload.deviceId);
  const lookup = privateDashboardUserByEmployeeId(employeeId);
  if (!lookup.user || lookup.user.status !== 'active' || (!privateDashboardIsTrustedEmployee(employeeId) && lookup.user.device_id !== deviceId)) {
    throw new Error('此員編尚未核准此裝置，請先申請並等待管理者核准');
  }
  lookup.user.last_login_at = privateDashboardNow();
  privateDashboardWriteObject(lookup.sheet, PRIVATE_DASHBOARD_USERS_HEADERS, lookup.user._row, lookup.user);
  const snapshot = privateDashboardSnapshot();
  return { snapshot: snapshot, profile: { maskedName: lookup.user.masked_name, store: lookup.user.store, role: lookup.user.role } };
}

function privateDashboardAdminRequests(payload) {
  privateDashboardAdminAuthorized(payload);
  const requests = privateDashboardRows(
    privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS),
    PRIVATE_DASHBOARD_REQUEST_HEADERS
  ).filter(function(item) { return item.status === 'pending'; })
    .sort(function(a, b) { return b.requested_at.localeCompare(a.requested_at); });
  return { requests: requests.map(function(item) { return {
    requestId: item.request_id, employeeId: item.employee_id, requestedAt: item.requested_at
  }; }) };
}

function privateDashboardAdminApprove(payload) {
  privateDashboardAdminAuthorized(payload);
  const requestId = String(payload.requestId || '');
  if (!requestId) throw new Error('缺少綁定申請編號');
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const requestSheet = privateDashboardSheet(PRIVATE_DASHBOARD_REQUESTS_SHEET, PRIVATE_DASHBOARD_REQUEST_HEADERS);
    const requests = privateDashboardRows(requestSheet, PRIVATE_DASHBOARD_REQUEST_HEADERS);
    const request = requests.filter(function(item) { return item.request_id === requestId; })[0];
    if (!request || request.status !== 'pending') throw new Error('找不到待核准的綁定申請');
    const lookup = privateDashboardUserByEmployeeId(request.employee_id);
    if (!lookup.user || lookup.user.status !== 'active') throw new Error('名冊內找不到啟用中的員編');
    const previousDeviceId = lookup.user.device_id || '';
    lookup.user.device_id = request.device_id;
    lookup.user.device_bound_at = privateDashboardNow();
    lookup.user.last_login_at = '';
    privateDashboardWriteObject(lookup.sheet, PRIVATE_DASHBOARD_USERS_HEADERS, lookup.user._row, lookup.user);
    requests.forEach(function(item) {
      if (item.employee_id !== request.employee_id || item.status !== 'pending') return;
      item.status = item.request_id === request.request_id ? 'approved' : 'superseded';
      if (item.request_id === request.request_id) {
        item.approved_at = privateDashboardNow();
        item.approved_by = 'admin';
        item.replaced_device_id = previousDeviceId;
      }
      privateDashboardWriteObject(requestSheet, PRIVATE_DASHBOARD_REQUEST_HEADERS, item._row, item);
    });
    return { approved: true, employeeId: request.employee_id };
  } finally {
    lock.releaseLock();
  }
}

function privateDashboardAdminRevoke(payload) {
  privateDashboardAdminAuthorized(payload);
  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const lookup = privateDashboardUserByEmployeeId(employeeId);
  if (!lookup.user) throw new Error('找不到員編');
  lookup.user.device_id = '';
  lookup.user.device_bound_at = '';
  lookup.user.last_login_at = '';
  privateDashboardWriteObject(lookup.sheet, PRIVATE_DASHBOARD_USERS_HEADERS, lookup.user._row, lookup.user);
  return { revoked: true, employeeId: employeeId };
}

function privateDashboardAdminSetTrustedEmployee(payload) {
  privateDashboardAdminAuthorized(payload);
  const employeeId = privateDashboardCleanEmployeeId(payload.employeeId);
  const lookup = privateDashboardUserByEmployeeId(employeeId);
  if (!lookup.user || lookup.user.status !== 'active') throw new Error('此員編不在可使用名冊中');
  const props = privateDashboardProperties();
  props.setProperty('DASHBOARD_TRUSTED_EMPLOYEE_ID', employeeId);
  const notificationEmail = String(payload.notificationEmail || '').trim();
  if (notificationEmail) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notificationEmail)) throw new Error('通知信箱格式不正確');
    props.setProperty('DASHBOARD_NOTIFY_EMAIL', notificationEmail);
  }
  return { trustedEmployeeId: employeeId };
}

// 每日自動化以管理者密碼同步遮罩後名冊。既有裝置綁定不會被覆蓋。
function privateDashboardSyncRoster(payload) {
  privateDashboardAdminAuthorized(payload);
  const members = Array.isArray(payload.members) ? payload.members : [];
  const sheet = privateDashboardSheet(PRIVATE_DASHBOARD_USERS_SHEET, PRIVATE_DASHBOARD_USERS_HEADERS);
  const existing = privateDashboardRows(sheet, PRIVATE_DASHBOARD_USERS_HEADERS);
  const byId = {};
  existing.forEach(function(item) { byId[item.employee_id] = item; });
  let synced = 0;
  members.forEach(function(member) {
    const employeeId = privateDashboardCleanEmployeeId(member.employeeId);
    const item = byId[employeeId] || {
      employee_id: employeeId, device_id: '', device_bound_at: '', last_login_at: ''
    };
    item.masked_name = String(member.maskedName || '');
    item.store = String(member.store || '');
    item.role = String(member.role || '');
    item.status = member.status === 'inactive' ? 'inactive' : 'active';
    if (item._row) privateDashboardWriteObject(sheet, PRIVATE_DASHBOARD_USERS_HEADERS, item._row, item);
    else privateDashboardWriteObject(sheet, PRIVATE_DASHBOARD_USERS_HEADERS, sheet.getLastRow() + 1, item);
    synced += 1;
  });
  return { synced: synced };
}

// 每日自動化在寄件成功後呼叫。快照僅存於私有 Drive，不經 GitHub。
function privateDashboardPublish(payload) {
  privateDashboardAdminAuthorized(payload);
  const encoded = String(payload.snapshotBase64 || '');
  if (!encoded || encoded.length > 8 * 1024 * 1024) throw new Error('私有戰情快照缺少或過大');
  const text = Utilities.newBlob(Utilities.base64Decode(encoded)).getDataAsString('UTF-8');
  const snapshot = JSON.parse(text);
  if (!snapshot || !snapshot.kpiBattle || !snapshot.awardsBattle) throw new Error('私有戰情快照格式不完整');
  const folder = privateDashboardFolder();
  const files = folder.getFilesByName(PRIVATE_DASHBOARD_FILE);
  const blob = Utilities.newBlob(text, 'application/json', PRIVATE_DASHBOARD_FILE);
  if (files.hasNext()) {
    files.next().setContent(blob.getDataAsString('UTF-8'));
  } else {
    folder.createFile(blob);
  }
  return { publishedAt: privateDashboardNow(), reportDate: snapshot.kpiBattle.report_date || '' };
}

// ════════════════════════════════════
// 自動檢查未回報 + Email 通知
//
// 啟用方式（只需做一次）：
//   1. 把本檔最新內容貼進 GAS 編輯器並存檔
//   2. 上方函式選單選「setupTriggers」→ 執行（會跳出授權畫面，同意即可）
//   3. 之後每天 16:30、22:00（台北時間，±15分）自動檢查並寄信
//
// 注意：時間觸發器執行的是「編輯器裡最新存檔的程式碼」，
// 這部分【不需要】重新部署 Web App；只有 doGet 相關改動才要重新部署。
// 想立即測試：函式選單選「testNotify」執行，會用目前時段寄一封測試信。
// ════════════════════════════════════

// 在 Apps Script「專案設定 > 指令碼屬性」設定 NOTIFY_EMAIL，避免收件地址進入公開原始碼。
const NOTIFY_EMAIL = PropertiesService.getScriptProperties().getProperty('NOTIFY_EMAIL') || 'CHANGE_ME@example.invalid';
const STORES = ['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];

function setupTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (['check16', 'check21'].indexOf(t.getHandlerFunction()) !== -1) {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('check16').timeBased().everyDays(1)
    .atHour(16).nearMinute(30).inTimezone('Asia/Taipei').create();
  ScriptApp.newTrigger('check21').timeBased().everyDays(1)
    .atHour(22).nearMinute(0).inTimezone('Asia/Taipei').create();
}

function check16() { checkSegAndNotify(16); }
function check21() { checkSegAndNotify(21); }

// 手動測試用：依目前台北時間挑最近的時段檢查一次
function testNotify() {
  const hour = Number(Utilities.formatDate(new Date(), 'Asia/Taipei', 'H'));
  checkSegAndNotify(hour >= 19 ? 21 : 16);
}

function checkSegAndNotify(seg) {
  const today = Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
  const data = readData(today, seg);
  const missing = STORES.filter(s => !data[s]);

  if (missing.length > 0) {
    const filled = STORES.filter(s => !!data[s]);
    const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
    const fmt = n => n % 1 === 0 ? String(n) : n.toFixed(2);
    const sum = k => filled.reduce((a, s) => a + num(data[s][k]), 0);
    const kpiVals = filled.map(s => parseFloat(data[s].kpi)).filter(v => !isNaN(v));
    const kpiAvg = kpiVals.length
      ? (kpiVals.reduce((a, b) => a + b, 0) / kpiVals.length).toFixed(1) + '%' : '—';
    const n12b = filled.length === 0
      ? '　（尚無回填資料）'
      : '　KPI 均值 ' + kpiAvg + '\n' +
        '　A999 ' + fmt(sum('aq999')) + ' 筆｜A1399 ' + fmt(sum('aq1399')) + ' 筆\n' +
        '　好速 ' + fmt(sum('haosu')) + ' 點｜R1399 ' + fmt(sum('rt1399')) + ' 筆';
    const subject = '⚠️ 北一二B ' + today + ' ' + seg + ':00 尚有 ' + missing.length + ' 間未回報';
    const body =
      '📋 ' + today + ' ' + seg + ':00 時段回報檢查\n\n' +
      '🔴 未回報（' + missing.length + ' 間）：\n' +
      missing.map(s => '　・' + s).join('\n') + '\n\n' +
      '✅ 已回報（' + filled.length + ' 間）：' + (filled.join('、') || '無') + '\n\n' +
      '📊 N12B 目前加總（已回報 ' + filled.length + ' 間）：\n' + n12b + '\n\n' +
      '請儘速跟進未填門市。';
    MailApp.sendEmail(NOTIFY_EMAIL, subject, body);
    return;
  }

  // ── 全數完成：報平安 + A999/好速/R1399 三項進度 ──
  const items = [
    { key: 'aq999',  label: 'A999(筆)' },
    { key: 'haosu',  label: '好速(點)' },
    { key: 'rt1399', label: 'R1399(筆)' },
  ];
  const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const rows = STORES.map(s => {
    const vals = items.map(it => num(data[s][it.key]));
    return { store: s, vals: vals, total: vals[0] + vals[1] + vals[2] };
  });
  const totals = items.map((it, i) => rows.reduce((a, r) => a + r.vals[i], 0));
  const sorted = rows.slice().sort((a, b) => b.total - a.total);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const zeroStores = rows.filter(r => r.vals.some(v => v === 0));

  const fmtN = n => n % 1 === 0 ? String(n) : n.toFixed(2);
  const td = 'padding:6px 12px;border:1px solid #e5e7eb;text-align:center;';
  const tableRows = rows.map(r => {
    const mark = r.store === best.store ? ' 🏆' : (r.store === worst.store ? ' 📢' : '');
    const cells = r.vals.map(v =>
      '<td style="' + td + (v === 0 ? 'color:#ef4444;font-weight:700;' : '') + '">' + fmtN(v) + '</td>'
    ).join('');
    return '<tr><td style="' + td + 'text-align:left;font-weight:700;">' + r.store + mark + '</td>' +
           cells + '<td style="' + td + '">' + fmtN(r.total) + '</td></tr>';
  }).join('');
  const totalRow =
    '<tr style="background:#fff7ed;font-weight:800;"><td style="' + td + 'text-align:left;">全區合計</td>' +
    totals.map(t => '<td style="' + td + '">' + fmtN(t) + '</td>').join('') +
    '<td style="' + td + '">' + fmtN(totals[0] + totals[1] + totals[2]) + '</td></tr>';

  const htmlBody =
    '<div style="font-family:sans-serif;font-size:14px;color:#1f2937;">' +
    '<h2 style="color:#16a34a;">✅ ' + today + ' ' + seg + ':00 全數回報完成！</h2>' +
    '<p>🏆 表現最佳：<strong>' + best.store + '</strong>（三項合計 ' + fmtN(best.total) + '）<br>' +
    '📢 需要加油：<strong>' + worst.store + '</strong>（三項合計 ' + fmtN(worst.total) + '）</p>' +
    (zeroStores.length
      ? '<p style="color:#ef4444;">🔴 有項目掛 0 的門市：' + zeroStores.map(r => r.store).join('、') + '</p>'
      : '<p style="color:#16a34a;">🌟 所有門市三項皆有開出！</p>') +
    '<table style="border-collapse:collapse;font-size:13px;">' +
    '<tr style="background:#f9fafb;font-weight:700;"><td style="' + td + '">店點</td>' +
    items.map(it => '<td style="' + td + '">' + it.label + '</td>').join('') +
    '<td style="' + td + '">合計</td></tr>' +
    tableRows + totalRow +
    '</table></div>';

  const subject = '✅ 北一二B ' + today + ' ' + seg + ':00 全數回報完成｜A999 ' +
    fmtN(totals[0]) + '筆・好速 ' + fmtN(totals[1]) + '點・R1399 ' + fmtN(totals[2]) + '筆';
  MailApp.sendEmail(NOTIFY_EMAIL, subject, '請用支援 HTML 的信箱檢視此郵件。', { htmlBody: htmlBody });
}
