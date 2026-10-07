const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../gas/Code.gs'), 'utf8');
const start = source.indexOf('function toDateStr');
const end = source.indexOf('function jsonResponse', start);
const dateFunctions = source.slice(start, end);

function loadSheet(values, displayValues = values.map(row => row.map(String))) {
  const calls = [];
  const sheet = {
    getLastRow: () => values.length,
    getLastColumn: () => values[0].length,
    getRange(row, column, count, width) {
      return Object.fromEntries([['getValues', values], ['getDisplayValues', displayValues]].map(([method, rows]) => [method, () => {
        calls.push({method, row, column, count, width});
        return rows.slice(row - 1, row - 1 + count).map(r => r.slice(column - 1, column - 1 + width));
      }]));
    },
  };
  const context = {Date, getSheet: () => sheet, Utilities: {formatDate(value, timezone, pattern) {
    assert.equal(timezone, 'Asia/Taipei');
    assert.equal(pattern, 'yyyy-MM-dd');
    return value.toISOString().slice(0, 10);
  }}};
  vm.runInNewContext(dateFunctions, context);
  return {read: context.readData, calls};
}

test('readData 保留 savedAt 的試算表顯示時間，不回傳 1899-12-30', () => {
  assert.match(source, /function attachReportAwardModels_/);
  const values = [
    ['date', 'store', 'seg', 'savedAt'],
    [new Date('2026-07-20T00:00:00Z'), '萬大', 16, new Date('1899-12-30T15:42:26Z')],
  ];
  const displayValues = [
    ['date', 'store', 'seg', 'savedAt'],
    ['2026-07-20', '萬大', '16', '下午 3:42:26'],
  ];
  const result = loadSheet(values, displayValues).read('2026-07-20', 16);
  assert.equal(result['萬大'].date, '2026-07-20');
  assert.equal(result['萬大'].savedAt, '下午 3:42:26');
  assert.notEqual(result['萬大'].savedAt, '1899-12-30');
});

test('a large history reads only a date index, this day and formatted savedAt; no persisted cache', () => {
  const headers = ['date','store','seg','savedAt', ...Array.from({length:50}, (_,i) => 'metric'+i)];
  const values = [headers, ...Array.from({length:5000}, () => ['2026-09-01','萬大',16,'15:00',...Array(50).fill(1)])];
  values.push(['2026-10-07','萬大',16,'16:02',...Array(50).fill(2)], ['2026-10-07','萬大',21,'21:02',...Array(50).fill(3)]);
  const h = loadSheet(values);
  assert.equal(h.read('2026-10-07',16).萬大.metric0, 2);
  const cells = h.calls.reduce((n,r) => n + r.count*r.width, 0);
  assert.ok(cells < 6000, `requested ${cells} cells instead of two full-history scans`);
  assert.equal(h.calls.filter(r => r.method === 'getDisplayValues').every(r => r.width === 1), true);
  values[5001][4] = 9;
  assert.equal(h.read('2026-10-07',16).萬大.metric0, 9);
});

test('late and out-of-order rows retain last-row precedence, segment isolation, zeros and blanks', () => {
  const h = loadSheet([
    ['store','seg','savedAt','aq999','date'],
    ['萬大',16,'16:00',1,new Date('2026-10-07T00:00:00Z')],
    ['萬大',16,'16:01',999,'2026-10-08'],
    ['萬大',21,'21:00',8,'2026-10-07'],
    ['酒泉',16,'16:03','','2026-10-07'],
    ['萬大','16','16:04',0,'2026-10-07'],
  ]);
  const result = h.read('2026-10-07',16);
  assert.equal(result.萬大.aq999, 0);
  assert.equal(result.萬大.savedAt, '16:04');
  assert.equal(result.酒泉.aq999, '');
  assert.equal(h.read('2026-10-07',21).萬大.aq999, 8);
});

test('absent dates and header-only sheets return empty without fetching unrelated full rows', () => {
  const h = loadSheet([['date','store','seg','savedAt'], ['2026-10-06','萬大',16,'16:00']]);
  assert.deepEqual(Object.keys(h.read('2026-10-07',16)), []);
  assert.equal(h.calls.some(r => r.method === 'getDisplayValues'), false);
  assert.deepEqual(Object.keys(loadSheet([['date','store','seg']]).read('2026-10-07',16)), []);
  assert.throws(() => loadSheet([['store','seg']]).read('2026-10-07',16), /缺少/);
});
