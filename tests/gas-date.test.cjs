const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../gas/Code.gs'), 'utf8');
const start = source.indexOf('function toDateStr');
const end = source.indexOf('function jsonResponse', start);
const dateFunctions = source.slice(start, end);

test('readData 保留 savedAt 的試算表顯示時間，不回傳 1899-12-30', () => {
  const values = [
    ['date', 'store', 'seg', 'savedAt'],
    [new Date('2026-07-20T00:00:00Z'), '萬大', 16, new Date('1899-12-30T15:42:26Z')],
  ];
  const displayValues = [
    ['date', 'store', 'seg', 'savedAt'],
    ['2026-07-20', '萬大', '16', '下午 3:42:26'],
  ];
  const context = {
    Date,
    Utilities: {
      formatDate(value, timezone, pattern) {
        assert.equal(timezone, 'Asia/Taipei');
        assert.equal(pattern, 'yyyy-MM-dd');
        return value.toISOString().slice(0, 10);
      },
    },
    getSheet() {
      return {
        getDataRange() {
          return {
            getValues: () => values,
            getDisplayValues: () => displayValues,
          };
        },
      };
    },
  };
  vm.runInNewContext(dateFunctions, context);

  const result = context.readData('2026-07-20', 16);
  assert.equal(result['萬大'].date, '2026-07-20');
  assert.equal(result['萬大'].savedAt, '下午 3:42:26');
  assert.notEqual(result['萬大'].savedAt, '1899-12-30');
});
