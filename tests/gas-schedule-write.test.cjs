const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../gas/Code.gs'), 'utf8');
const start = source.indexOf('const SCHEDULE_HEADERS');
const end = source.indexOf('// 每週一巡店週報', start);
assert.ok(start > 0 && end > start, 'schedule write block not found in Code.gs');
const scheduleSource = source.slice(start, end);

const HEADERS = ['版本月份', '門市', '日期', '日', '週', '同仁',
                 '職務', '班別', '出勤', '值班主管', '來源檔', '匯入時間'];

/** Minimal stand-in for a Sheets range over a backing array-of-arrays. */
function makeSheet(rows) {
  const sheet = {
    rows,
    deleted: [],
    getLastRow: () => rows.length,
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValues() {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const line = rows[row - 1 + r] || [];
            out.push(line.slice(col - 1, col - 1 + numCols));
          }
          return out;
        },
        setValues(values) {
          values.forEach((line, r) => {
            const target = row - 1 + r;
            while (rows.length <= target) rows.push([]);
            line.forEach((cell, c) => { rows[target][col - 1 + c] = cell; });
          });
        },
      };
    },
    deleteRows(startRow, count) {
      sheet.deleted.push([startRow, count]);
      rows.splice(startRow - 1, count);
    },
  };
  return sheet;
}

function loadSchedule({ sheet, versionSheet, authorized = true } = {}) {
  const context = {
    Date,
    Object,
    String,
    Array,
    SCHEDULE_SHEET: '班表明細',
    SPREADSHEET_ID: 'test-sheet',
    findNamedSheet(ss, name) {
      return name === '班表明細' ? sheet : versionSheet;
    },
    ptCredentialAuthorized_: () => authorized,
    SpreadsheetApp: { openById: () => ({ insertSheet: () => sheet }) },
    LockService: {
      getScriptLock: () => ({ waitLock() {}, releaseLock() {} }),
    },
  };
  vm.createContext(context);
  vm.runInContext(scheduleSource, context);
  return context;
}

function detailRow(month, store, day, name) {
  return [month, store, `${month}-${String(day).padStart(2, '0')}`, String(day),
          '一', name, '業務代表', '全', '是', '否', 'x.png', 'ts'];
}

test('scheduleRemoveMonth_ 刪掉目標月份且完整保留其他月份', () => {
  const rows = [HEADERS.slice()];
  ['2026-07', '2026-08', '2026-07', '2026-08', '2026-08', '2026-09']
    .forEach((m, i) => rows.push(detailRow(m, '大稻埕', i + 1, `員${i}`)));
  const sheet = makeSheet(rows);
  const ctx = loadSchedule({ sheet });

  const removed = ctx.scheduleRemoveMonth_(sheet, '2026-08');

  assert.equal(removed, 3);
  const remaining = sheet.rows.slice(1).map(r => r[0]);
  assert.deepEqual(remaining, ['2026-07', '2026-07', '2026-09']);
  // 不連續的區段必須分開刪，且由下往上，否則會刪錯列。
  // 目標落在試算表第 3、5、6 列 → 先刪 (5,2) 再刪 (3,1)。
  assert.deepEqual(sheet.deleted, [[5, 2], [3, 1]]);
});

test('scheduleRemoveMonth_ 處理目標月份就在最頂端的情況', () => {
  const rows = [HEADERS.slice(),
                detailRow('2026-08', '酒泉', 1, 'A'),
                detailRow('2026-08', '酒泉', 2, 'B'),
                detailRow('2026-07', '酒泉', 3, 'C')];
  const sheet = makeSheet(rows);
  const ctx = loadSchedule({ sheet });

  assert.equal(ctx.scheduleRemoveMonth_(sheet, '2026-08'), 2);
  assert.deepEqual(sheet.rows.slice(1).map(r => r[0]), ['2026-07']);
});

test('scheduleRemoveMonth_ 對空白工作表回傳 0 而不丟錯', () => {
  const sheet = makeSheet([HEADERS.slice()]);
  const ctx = loadSchedule({ sheet });
  assert.equal(ctx.scheduleRemoveMonth_(sheet, '2026-08'), 0);
});

test('scheduleSafeCell_ 讓公式開頭的內容保持文字', () => {
  const ctx = loadSchedule({ sheet: makeSheet([HEADERS.slice()]) });
  assert.equal(ctx.scheduleSafeCell_('=HYPERLINK("evil")'), "'=HYPERLINK(\"evil\")");
  assert.equal(ctx.scheduleSafeCell_('+1'), "'+1");
  assert.equal(ctx.scheduleSafeCell_('-1'), "'-1");
  assert.equal(ctx.scheduleSafeCell_('@x'), "'@x");
  assert.equal(ctx.scheduleSafeCell_(' 全 '), '全');
  assert.equal(ctx.scheduleSafeCell_(null), '');
});

test('writeSchedule 未授權時拒絕寫入', () => {
  const sheet = makeSheet([HEADERS.slice()]);
  const ctx = loadSchedule({ sheet, authorized: false });
  assert.throws(() => ctx.writeSchedule({ month: '2026-08', rows: [detailRow('2026-08', '酒泉', 1, 'A')] }),
                /unauthorized/);
  assert.equal(sheet.rows.length, 1);
});

test('writeSchedule 擋掉月份格式錯誤與跨月份混入的資料', () => {
  const sheet = makeSheet([HEADERS.slice()]);
  const ctx = loadSchedule({ sheet });
  assert.throws(() => ctx.writeSchedule({ month: '2026-8', rows: [detailRow('2026-8', '酒泉', 1, 'A')] }),
                /YYYY-MM/);
  assert.throws(() => ctx.writeSchedule({
    month: '2026-08',
    rows: [detailRow('2026-08', '酒泉', 1, 'A'), detailRow('2026-07', '酒泉', 2, 'B')],
  }), /版本月份與本次匯入月份不符/);
  assert.equal(sheet.rows.length, 1, '驗證失敗時不可寫入任何一列');
});

test('writeSchedule 的 replace 讓重跑同一個月不會變成兩份', () => {
  const rows = [HEADERS.slice(), detailRow('2026-08', '酒泉', 1, '舊'), detailRow('2026-07', '酒泉', 1, '七月')];
  const sheet = makeSheet(rows);
  const ctx = loadSchedule({ sheet });

  const result = ctx.writeSchedule({
    month: '2026-08', replace: true,
    rows: [detailRow('2026-08', '酒泉', 1, '新')],
  });

  assert.equal(result.removed, 1);
  assert.equal(result.written, 1);
  const names = sheet.rows.slice(1).map(r => r[5]);
  assert.deepEqual(names, ['七月', '新'], '七月資料必須原封不動');
});

test('writeSchedule 蓋掉用戶端送來的匯入時間', () => {
  const sheet = makeSheet([HEADERS.slice()]);
  const ctx = loadSchedule({ sheet });
  const row = detailRow('2026-08', '酒泉', 1, 'A');
  row[11] = '1999-01-01T00:00:00.000Z';
  ctx.writeSchedule({ month: '2026-08', rows: [row] });
  assert.notEqual(sheet.rows[1][11], '1999-01-01T00:00:00.000Z');
  assert.match(sheet.rows[1][11], /^\d{4}-\d{2}-\d{2}T/);
});

test('writeSchedule 拒絕超量批次', () => {
  const sheet = makeSheet([HEADERS.slice()]);
  const ctx = loadSchedule({ sheet });
  const many = Array.from({ length: 801 }, (_, i) => detailRow('2026-08', '酒泉', 1, `員${i}`));
  assert.throws(() => ctx.writeSchedule({ month: '2026-08', rows: many }), /單批上限/);
});

test('finalize 依實際寫入結果寫版本列，門市數與列數自己算', () => {
  const sheet = makeSheet([HEADERS.slice()]);
  const versionSheet = makeSheet([['版本ID', '月份', '匯入時間', '來源位置',
                                   '來源檔數', '門市數', '班表明細數', '狀態', '備註']]);
  const ctx = loadSchedule({ sheet, versionSheet });

  ctx.writeSchedule({
    month: '2026-08', replace: true,
    rows: [detailRow('2026-08', '酒泉', 1, 'A'), detailRow('2026-08', '萬大', 1, 'B')],
  });
  const result = ctx.writeSchedule({
    month: '2026-08', finalize: true,
    rows: [detailRow('2026-08', '萬大', 2, 'C')],
  });

  assert.equal(result.total, 3);
  assert.equal(result.storeCount, 2);
  assert.equal(result.version, 'inserted');
  assert.deepEqual(versionSheet.rows[1].slice(0, 2), ['SCH-2026-08-001', '2026-08']);
  // 版本列沿用 7 月既有格式：各欄一律存成文字
  assert.equal(versionSheet.rows[1][5], '2', '門市數');
  assert.equal(versionSheet.rows[1][6], '3', '班表明細數');
  assert.equal(versionSheet.rows[1][7], '已匯入');
});

test('同一個月重跑時更新版本列而不是再加一列', () => {
  const sheet = makeSheet([HEADERS.slice()]);
  const versionSheet = makeSheet([['版本ID', '月份', '匯入時間', '來源位置',
                                   '來源檔數', '門市數', '班表明細數', '狀態', '備註'],
                                  ['SCH-2026-08-001', '2026-08', 'old', 'old', 1, 1, 1, '已匯入', '']]);
  const ctx = loadSchedule({ sheet, versionSheet });

  const result = ctx.writeSchedule({
    month: '2026-08', replace: true, finalize: true,
    rows: [detailRow('2026-08', '酒泉', 1, 'A')],
  });

  assert.equal(result.version, 'updated');
  assert.equal(versionSheet.rows.length, 2, '版本表不可長出第二列 2026-08');
});
