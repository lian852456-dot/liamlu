const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Core = require('../daily-log-core.js');

test('延後出現的七欄表頭仍可辨識', () => {
  const matrix = [
    ['北一二B 日誌匯出'],
    [],
    ['店點', '填寫人員', '填寫時間', '檢查項目', '處理狀態', '大項名稱', '細項名稱']
  ];
  const found = Core.detectHeader(matrix);
  assert.equal(found.rowIndex, 2);
  assert.deepEqual(found.map, {
    store:0,
    submitter:1,
    submittedAt:2,
    formName:3,
    status:4,
    section:5,
    itemText:6
  });
});

test('已確認的每日四項、每週四項與每月兩項都有固定分類', () => {
  const cases = [
    ['店務行事曆', 'calendar'],
    ['每日營業前檢查表', 'opening'],
    ['每日營業中檢查表', 'midday'],
    ['每日打烊後檢查表', 'closing'],
    ['門市環境檢查表（第一週，每周日前完成）', 'environment-w1'],
    ['門市環境檢查表(第二週)', 'environment-w2'],
    ['門市環境檢查表（第三週）', 'environment-w3'],
    ['門市環境檢查表（第四週）', 'environment-w4'],
    ['重要店務物品清點表', 'inventory'],
    ['資安個資檢查表', 'security']
  ];
  assert.equal(Core.FORM_DEFINITIONS.length, 10);
  cases.forEach(([input, id]) => assert.equal(Core.classifyForm(input)?.id, id));
  assert.equal(Core.classifyForm('門市環境檢查表（第五週）'), null);
});

test('門市、日期與狀態可容忍常見匯出格式', () => {
  assert.equal(Core.canonicalStore('台灣大哥大數位生活台北三創直營'), '台北三創');
  assert.equal(Core.canonicalStore('六張犁'), '台北六張犁');
  assert.equal(Core.normalizeDate('2026/9/2 10:30'), '2026-09-02');
  assert.equal(Core.normalizeDate(25569), '1970-01-01');
  assert.equal(Core.normalizeStatus('已完成'), 'done');
  assert.equal(Core.normalizeStatus('未完成'), 'pending');
  assert.equal(Core.normalizeStatus('人工複核'), 'unknown');
});

test('解析保留長細項，未定義表單不混入正式結果', () => {
  const longItem = '確認展示手機、平板及配件均依規定定位，價卡內容正確，並完成逐項清潔與異常回報。';
  const matrix = [
    ['報表產生時間', '2026-09-02'],
    ['店點', '填寫人員', '填寫時間', '檢查項目', '處理狀態', '大項名稱', '細項名稱'],
    ['台北三創', '王小明', '2026/09/02 09:15', '每日營業前檢查表', '已完成', '展示區', longItem],
    ['台北三創', '王小明', '2026/09/02 09:20', '自訂臨時檢查', '已完成', '其他', '臨時題目']
  ];
  const result = Core.normalizeMatrix(matrix, { asOfDate:'2026-09-02' });
  assert.deepEqual(result.errors, []);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].itemText, longItem);
  assert.equal(result.rows[0].formId, 'opening');
  assert.equal(result.unknownForms.length, 1);
  assert.match(result.warnings.at(-1), /正式發布前需確認/);
});

test('到期判斷排除尚未到期的週表與月表', () => {
  const rows = [
    {
      store:'台北酒泉', date:'2026-09-02', month:'2026-09', formId:'calendar',
      status:'done', submittedAt:'2026-09-02 09:00', submitter:'A', section:'店務', itemText:'查看今日事項'
    },
    {
      store:'台北酒泉', date:'2026-09-01', month:'2026-09', formId:'inventory',
      status:'done', submittedAt:'2026-09-01 10:00', submitter:'A', section:'清點', itemText:'完成清點'
    }
  ];
  const model = Core.buildDashboard(rows, '2026-09-02');
  const firstStore = model.stores[0];
  assert.equal(model.dailyExpected, 36);
  assert.equal(model.weeklyExpected, 36);
  assert.equal(model.monthlyExpected, 18);
  assert.equal(model.exceptionCount, 43);
  assert.ok(firstStore.weekly.every(item => item.status === 'upcoming' && item.isDue === false));
  assert.equal(firstStore.monthly.find(item => item.id === 'inventory').status, 'done');
  assert.equal(firstStore.monthly.find(item => item.id === 'security').status, 'upcoming');
  assert.equal(Core.dueDateFor(Core.FORM_DEFINITIONS.find(item => item.id === 'environment-w1'), '2026-09-02'), '2026-09-06');
});

test('群組提醒只列已到期需追蹤項目並附完成摘要', () => {
  const rows = [{
    store:'台北酒泉', date:'2026-09-02', month:'2026-09', formId:'calendar',
    status:'done', submittedAt:'2026-09-02 09:00', submitter:'A', section:'店務', itemText:'查看今日事項'
  }];
  const model = Core.buildDashboard(rows, '2026-09-02');
  const reminder = Core.buildGroupReminder(model, [{ store:'台北酒泉', formName:'臨時測試表' }]);
  assert.match(reminder, /📋 北一二B每日日誌提醒｜2026\/09\/02/);
  assert.match(reminder, /完成：每日 1\/36｜每週 0\/36｜每月 0\/18/);
  assert.match(reminder, /台北酒泉｜每日：營業前（缺資料）、營業中（缺資料）、打烊後（缺資料）｜每月：物品清點（缺資料）｜未定義表單：臨時測試表/);
  assert.doesNotMatch(reminder, /第一週（未到期）/);
  assert.match(reminder, /需追蹤 45 項/);
});

test('獨立店務行事曆報表可依店名或營業點代碼解析', () => {
  const matrix = [
    ['店務行事曆填寫狀況'],
    ['機密等級：'],
    ['檢查日期', '督導區', '業務督導姓名', '營業點代碼', '店點名稱', '檢查人員', '填寫時間', '處理狀態'],
    ['2026/09/02', '北一二B', '盧*榮', 'DNB10307', '台灣大哥大數位生活台北三創', '鍾*玲', '2026-09-02 16:35', '已完成'],
    ['2026/09/02', '北一二B', '盧*榮', 'DNB10440', '', '劉*妮', '2026-09-02 16:58', '未完成']
  ];
  const result = Core.normalizeCalendarMatrix(matrix);
  assert.deepEqual(result.errors, []);
  assert.equal(result.meta.headerRow, 2);
  assert.deepEqual(result.rows.map(row => [row.store, row.date, row.formId, row.status]), [
    ['台北三創', '2026-09-02', 'calendar', 'done'],
    ['台北六張犁', '2026-09-02', 'calendar', 'pending']
  ]);
});

test('獨立行事曆只覆蓋相同店點與日期的行事曆列', () => {
  const logRows = [
    { store:'台北三創', date:'2026-09-02', formId:'calendar', status:'pending' },
    { store:'台北三創', date:'2026-09-02', formId:'opening', status:'done' },
    { store:'台北三創', date:'2026-09-01', formId:'calendar', status:'done' }
  ];
  const calendarRows = [{ store:'台北三創', date:'2026-09-02', formId:'calendar', status:'done' }];
  const merged = Core.mergeLogAndCalendarRows(logRows, calendarRows);
  assert.equal(merged.length, 3);
  assert.equal(merged.find(row => row.date === '2026-09-02' && row.formId === 'calendar').status, 'done');
  assert.equal(merged.find(row => row.date === '2026-09-01' && row.formId === 'calendar').status, 'done');
});

test('頁面契約使用本機 SheetJS、標示候選版並接入同仁大廳', () => {
  const root = path.resolve(__dirname, '..');
  const page = fs.readFileSync(path.join(root, 'daily-log-dashboard.html'), 'utf8');
  const controller = fs.readFileSync(path.join(root, 'daily-log-dashboard.js'), 'utf8');
  const home = fs.readFileSync(path.join(root, 'home.html'), 'utf8');
  assert.match(page, /assets\/vendor\/xlsx\.full\.min\.js/);
  assert.doesNotMatch(page, /https?:\/\//);
  assert.match(page, /<input class="file-input" id="fileInput" type="file" accept="\.xlsx,\.xls,\.csv,\.tsv">/);
  assert.doesNotMatch(page, /id="chooseFile"/);
  assert.match(page, /<script src="daily-log-dashboard\.js\?v=20260902-3"><\/script>/);
  assert.doesNotMatch(page, /type="module" src="daily-log-dashboard\.js"/);
  assert.match(page, /候選版 · 本機預覽/);
  assert.match(page, /尚未寫入雲端/);
  assert.match(controller, /bei12b_daily_log_snapshot_v1/);
  assert.match(controller, /MAX_FILE_BYTES = 20 \* 1024 \* 1024/);
  assert.match(controller, /SUPPORTED_EXTENSIONS = new Set\(\['xlsx', 'xls', 'csv', 'tsv'\]\)/);
  assert.match(page, /id="copyReminder"[^>]*>一鍵複製群組提醒</);
  assert.match(controller, /Core\.buildGroupReminder/);
  assert.match(page, /id="calendarFileInput" type="file"/);
  assert.match(page, /店務行事曆 Excel/);
  assert.match(controller, /Core\.chooseBestCalendarSheet/);
  assert.match(page, /daily-log-dashboard\.js\?v=20260902-3/);
  assert.match(home, /href="daily-log-dashboard\.html"/);
  assert.match(home, />每日日誌檢查</);
});
