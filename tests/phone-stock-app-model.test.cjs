const { test } = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../phone-stock-core.js');

test('庫存簡稱保留 iPhone 機款、容量與顏色，未知品牌保留可辨識名稱', () => {
  assert.equal(Core.shortModel('APPLE iPhone 18 Pro   Max_512G-(勃根地紅)(5G)'), 'i18PM_512G_紅');
  assert.equal(Core.shortModel('APPLE iPhone 18 Pro_512G-(銀)(5G)'), 'i18P_512G_銀');
  assert.equal(Core.shortModel('SAMSUNG Galaxy S26 Ultra_512G-(黑)(5G)'), 'SAMSUNG Galaxy S26 Ultra_512G-(黑)');
});

test('新增品牌的庫存列仍能辨識店點與數量', () => {
  const matrix = [['店點', '商品名稱', '庫存數'], ['台北三創', 'APPLE iPhone 18 Pro_512G-(銀)(5G)', 3], ['台北萬大', 'SAMSUNG Galaxy S26 Ultra_512G-(黑)(5G)', 2]];
  const parsed = Core.parseMatrix(matrix, 'stock');
  assert.equal(parsed.rows.length, 2);
  assert.deepEqual(parsed.rows.map(({ store, quantity }) => [store, quantity]), [['台北三創', 3], ['台北萬大', 2]]);
});
