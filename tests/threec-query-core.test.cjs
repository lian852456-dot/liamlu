'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Core = require('../threec-query-core.js');

function shoppingSnapshot() {
  return { rows: [
    { source_sheet:'iPhone', source_row_number:2, brand:'Apple', model:'iPhone 16 256GB 黑色', colorless_model:'iPhone 16 256GB', code:'A16', retail_price:'29,900', project_prices:{'999型專案價':'0','合約24期':'1,299'} },
    { source_sheet:'iPhone', source_row_number:3, brand:'Apple', model:'iPhone 16 256GB 白色', colorless_model:'iPhone 16 256GB', code:'A16W', retail_price:'29900', project_prices:{'999型專案價':'', '合約24期':'1,499'} },
  ] };
}

test('手機專案同色款合併，但容量與不同完整價格矩陣都保留', () => {
  const groups = Core.shoppingGroups(shoppingSnapshot());
  assert.equal(groups.length, 1);
  assert.equal(groups[0].rows.length, 2);
  assert.deepEqual(groups[0].rows.map(row => row.model), ['iPhone 16 256GB 黑色', 'iPhone 16 256GB 白色']);
  assert.deepEqual(groups[0].rows[0].projectPrices.map(price => price.name), ['999型專案價', '合約24期']);
  assert.equal(Core.priceState(groups[0].rows[0].projectPrices[0].value).zero, true);
  assert.equal(Core.priceState(groups[0].rows[1].projectPrices[0].value).missing, true);
});

test('零元與缺價格式化不混淆，也不替缺價補零', () => {
  assert.equal(Core.formatPrice(0), '0 元');
  assert.equal(Core.formatPrice('0.00'), '0 元');
  assert.equal(Core.formatPrice(''), '無報價（缺價）');
  assert.equal(Core.formatPrice(null), '無報價（缺價）');
  assert.equal(Core.formatPrice('29,900'), '29,900 元');
});

test('舊換新兩家回收商與 S/A/B/C 各級獨立保留', () => {
  const snapshot = { rows: [{ source_sheet:'回收價', brand:'Samsung', model:'Galaxy S25 512GB', quotes:{
    '點子行動':{S:'18,000',A:0,B:'',C:'500'},
    'FutureDial（FDI）':{S:'17,500',A:'12,000',B:'8,000',C:null},
  } }] };
  const row = Core.tradeinRow(snapshot.rows[0]);
  assert.deepEqual(Object.keys(row.quotes), Core.PROVIDERS);
  assert.deepEqual(Object.keys(row.quotes['點子行動']), Core.GRADES);
  assert.equal(Core.priceState(row.quotes['點子行動'].A).zero, true);
  assert.equal(Core.priceState(row.quotes['點子行動'].B).missing, true);
  assert.equal(Core.priceState(row.quotes['FutureDial（FDI）'].C).missing, true);
});

test('正式版本 metadata 優先讀 snapshot，缺少時回 registry active', () => {
  const meta = Core.sourceMeta({ source_version_date:'2026-10-01', snapshot_hash:'snapshot-v2', rows:[] }, { shopping:{ active:{ source_version_date:'2026-09-28', row_count:1 } } }, 'shopping');
  assert.equal(meta.sourceVersionDate, '2026-10-01');
  assert.equal(meta.version, 'snapshot-v2');
  const fallback = Core.sourceMeta({ rows:[] }, { shopping:{ active:{ source_version_date:'2026-09-28', row_count:1, source_file_sha256:'abc', snapshot_hash:'snapshot-v1' } } }, 'shopping');
  assert.equal(fallback.sourceVersionDate, '2026-09-28');
  assert.equal(fallback.rowCount, 1);
  assert.equal(fallback.snapshotHash, 'snapshot-v1');
});

test('完全相同 price matrix 可去重，不同 matrix 保留原始列', () => {
  const snapshot = { rows: [
    { source_sheet:'SheetA', source_row_number:1, brand:'Apple', model:'iPhone 16 256GB 黑', colorless_model:'iPhone 16 256GB', retail_price:'29900', project_prices:{'合約24期':'1299'} },
    { source_sheet:'SheetA', source_row_number:2, brand:'Apple', model:'iPhone 16 256GB 白', colorless_model:'iPhone 16 256GB', retail_price:'29,900', project_prices:{'合約24期':'1299'} },
    { source_sheet:'SheetA', source_row_number:3, brand:'Apple', model:'iPhone 16 256GB 藍', colorless_model:'iPhone 16 256GB', retail_price:'29900', project_prices:{'合約24期':'1499'} },
  ] };
  const group = Core.shoppingGroups(snapshot)[0];
  assert.equal(group.rows.length, 2);
  assert.deepEqual(group.rows.map(row => row.model), ['iPhone 16 256GB 黑', 'iPhone 16 256GB 藍']);
});

test('大型 snapshot 預設限量，選機款後展開完整 rows，並暴露 prices', () => {
  const rows = Array.from({ length: 65 }, (_, index) => ({
    source_sheet:'SheetA', source_row_number:index + 1, brand:'Brand', model:`Model ${index}`, colorless_model:`Model ${index}`, retail_price:String(index), project_prices:{'方案':'0'},
  }));
  const snapshot = { rows };
  const response = { snapshot, registry:{ shopping:{ active:{ snapshot_hash:'hash' } } } };
  const initial = Core.buildView('shopping', response, {});
  assert.equal(initial.limited, true);
  assert.equal(initial.rows.length, 20);
  assert.equal(initial.modelOptions.length, 65);
  const selected = Core.buildView('shopping', response, { modelKey: initial.modelOptions[0].value });
  assert.equal(selected.rows.length, 1);
  assert.deepEqual(Core.prices(rows[0], 'shopping'), { retailPrice:'0', projectPrices:{方案:'0'} });

  const tradeRows = Array.from({ length: 55 }, (_, index) => ({
    source_sheet:'Trade', brand:'Brand', model:`Trade ${index}`, colorless_model:`Trade ${index}`,
    quotes:{'點子行動':{S:'1',A:'2',B:'3',C:'4'},'FutureDial（FDI）':{S:'1',A:'2',B:'3',C:'4'}},
  }));
  const trade = Core.buildView('tradein', { snapshot:{ rows:tradeRows }, registry:{} }, {});
  assert.equal(trade.rows.length, 50);
  assert.equal(trade.modelOptions.length, 55);
});
