const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const code = fs.readFileSync(path.resolve(__dirname, '../gas/Code.gs'), 'utf8');

function functionSource(name) {
  const start = code.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const next = code.indexOf('\nfunction ', start + 10);
  return code.slice(start, next === -1 ? undefined : next);
}

test('weekly patrol report keeps all seven workbook tabs in order', () => {
  const weekly = functionSource('sendWeeklyPatrolReport');
  const tabs = [
    '巡店紀錄',
    '未巡店',
    '上下半月2-13',
    '每月盤點14-17',
    '雙月全盤18',
    '知悉20日前19-33',
    '改善提醒與照片',
  ];
  let previous = -1;
  for (const tab of tabs) {
    const index = weekly.indexOf(`'${tab}'`);
    assert.ok(index > previous, `${tab} missing or out of order`);
    previous = index;
  }
  assert.match(weekly, /七個分頁/);
  assert.match(weekly, /formatWeeklyHalfCheckSheet\(sh, halfCheckTab\)/);
});

test('seventh tab preserves reminder, improvement, photo and private-link behavior', () => {
  const requiredFunctions = [
    'weeklyHalfMediaItems',
    'weeklyHalfResultLabel',
    'weeklyHalfPeriodLabel',
    'weeklyReadHalfCheck',
    'weeklyHalfPhotoBlob',
    'buildWeeklyHalfCheckTab',
    'formatWeeklyHalfCheckSheet',
  ];
  for (const name of requiredFunctions) functionSource(name);

  const read = functionSource('weeklyReadHalfCheck');
  assert.match(read, /半月督導檢查/);
  assert.match(read, /缺失說明/);
  assert.match(read, /改善措施/);
  assert.match(read, /證據檔案連結/);

  const build = functionSource('buildWeeklyHalfCheckTab');
  assert.match(build, /item >= 1 && item <= 18/);
  for (const heading of [
    '日期', '期別', '店點', '督導', '題號', '檢查內容', '結果',
    '提醒／缺失內容', '改善說明', '照片', '私有附件連結', '最後更新',
  ]) {
    assert.ok(build.includes(`'${heading}'`), `missing seventh-tab column ${heading}`);
  }

  const format = functionSource('formatWeeklyHalfCheckSheet');
  assert.match(format, /insertImage\(blob, 10, job\.row\)/);
  assert.match(format, /setLinkUrl\(link\)/);
  assert.match(format, /照片嵌入失敗，請使用右側私有連結/);
});

test('seventh tab neutralizes spreadsheet formulas and rejects non-Drive links', () => {
  assert.match(code, /function weeklySafeCellText_\(value\)/);
  assert.match(code, /\/\^\[=\+\\-@\]\//);
  assert.match(code, /function weeklySafeDriveUrl_\(value\)/);
  assert.match(code, /weeklySafeCellText_\(r\.note\)/);
  assert.match(code, /weeklySafeCellText_\(r\.improvement\)/);
  assert.match(code, /weeklySafeDriveUrl_\(media\.viewUrl \|\| media\.previewUrl\)/);
});

test('four formal trigger handlers and shared automation remain present', () => {
  for (const name of [
    'check21',
    'sendWeeklyPatrolReport',
    'checkAwareAndNotify',
    'check16',
    'kpiCalcAutoUpdate',
    'kpiCalcWatchdog',
    'checkSegAndNotify',
  ]) {
    functionSource(name);
  }
});
