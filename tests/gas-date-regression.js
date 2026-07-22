// GAS 日期回歸測試（純 node，不需瀏覽器）
// 目的：鎖住「savedAt 顯示 1899-12-30」的修正——readData() 對 savedAt 欄
//       必須回傳試算表的原始顯示字串（如 16:00:00），不得被 toDateStr() 轉成日期。
//
// 作法：用 vm 沙箱載入真實的 gas/Code.gs，注入 SpreadsheetApp / Utilities stub，
//       直接呼叫真的 readData()，斷言 savedAt 正確。
//
// 執行：node tests/gas-date-regression.js
// 檔名刻意不含 test/spec，避免被 Playwright 的 testMatch 誤抓。

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');

// ── 建立一個假的「回報資料」工作表 ──────────────────────────────
// 模擬 2026-07-20 16:00 的一筆資料。
// 關鍵：savedAt 在試算表是「純時間」→ getValues() 回傳 1899-12-30 基準的 Date；
//       getDisplayValues() 回傳原始顯示字串「16:00:00」。
const HEADERS = ['date', 'store', 'seg', 'savedAt', 'kpi'];
const dateCell = new Date(2026, 6, 20);            // 2026-07-20（date 欄，真的日期）
const savedAtCell = new Date(1899, 11, 30, 16, 0); // 純時間 16:00 → 1899-12-30 基準的 Date

const VALUES = [
  HEADERS,
  [dateCell, '通化', 16, savedAtCell, '88'],
];
const DISPLAY = [
  HEADERS,
  ['2026-07-20', '通化', '16', '16:00:00', '88'],
];

function makeRange(valuesGrid, displayGrid) {
  return {
    getValues: () => valuesGrid,
    getDisplayValues: () => displayGrid,
  };
}

const fakeSheet = {
  getDataRange: () => makeRange(VALUES, DISPLAY),
  // getSheet() 補欄位邏輯會用到：標題列已完整，回傳 headers。
  getRange: (row, col, numRows, numCols) => ({
    getValues: () => [HEADERS.slice(0, numCols || HEADERS.length)],
    setValue: () => {},
  }),
  getLastColumn: () => HEADERS.length,
  getLastRow: () => VALUES.length,
  appendRow: () => {},
  setFrozenRows: () => {},
};

// 鏈式 no-op：任何屬性存取或呼叫都回傳自己，讓頂層其他 GAS 服務呼叫不會炸。
function chainableNoop() {
  const fn = function () { return proxy; };
  const proxy = new Proxy(fn, {
    get: (t, prop) => {
      if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') {
        return () => '';
      }
      return proxy;
    },
    apply: () => proxy,
  });
  return proxy;
}

const sandbox = {
  SpreadsheetApp: {
    openById: () => ({
      getSheetByName: () => fakeSheet,
      insertSheet: () => fakeSheet,
    }),
  },
  Utilities: {
    // 只需支援 toDateStr 用到的 yyyy-MM-dd
    formatDate: (d, tz, fmt) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    },
  },
  // 頂層會用到的其他 GAS 服務，一律給 no-op（本測試不觸發它們的實際邏輯）
  PropertiesService: chainableNoop(),
  ContentService: chainableNoop(),
  MailApp: chainableNoop(),
  DriveApp: chainableNoop(),
  UrlFetchApp: chainableNoop(),
  ScriptApp: chainableNoop(),
  Session: chainableNoop(),
  CacheService: chainableNoop(),
  LockService: chainableNoop(),
  HtmlService: chainableNoop(),
  console,
  // 共用同一個 Date 建構子，讓 Code.gs 內的 `v instanceof Date` 對測試資料成立（跨 realm 修正）
  Date,
  JSON,
};
sandbox.globalThis = sandbox;

// 把真實原始碼 + 匯出行放進同一個 script scope，讓頂層 const/function 可被取出
const script = new vm.Script(SRC + '\n;globalThis.__readData = readData; globalThis.__toDateStr = toDateStr;');
vm.createContext(sandbox);
script.runInContext(sandbox);

const readData = sandbox.__readData;

// ── 測試 ─────────────────────────────────────────────────────
let pass = 0;
function check(name, fn) {
  fn();
  pass++;
  console.log('  ✓ ' + name);
}

console.log('GAS 日期回歸測試');

check('readData 對 2026-07-20 seg=16 讀得回門市', () => {
  const out = readData('2026-07-20', 16);
  assert.ok(out['通化'], '應讀到「通化」門市');
});

check('savedAt 回傳原始顯示時間 16:00:00，不含 1899-12-30', () => {
  const out = readData('2026-07-20', 16);
  assert.strictEqual(out['通化'].savedAt, '16:00:00', 'savedAt 應為 16:00:00');
  assert.ok(
    !String(out['通化'].savedAt).includes('1899'),
    'savedAt 不得出現 1899（日期化 bug）'
  );
});

check('date 欄仍正常轉為 yyyy-MM-dd', () => {
  const out = readData('2026-07-20', 16);
  assert.strictEqual(out['通化'].date, '2026-07-20', 'date 應為 2026-07-20');
});

console.log(`\n${pass}/${pass} passed`);
