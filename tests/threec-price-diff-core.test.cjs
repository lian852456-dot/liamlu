'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const Diff = require('../threec-price-diff-core.js');

function shoppingRow(overrides = {}) {
  return Object.assign({
    source_sheet:'專案價', source_row_number:2, brand:'Apple', code:'A16',
    model:'iPhone 16 256GB 黑色', colorless_model:'iPhone 16 256GB',
    retail_price:'29,900', project_prices:{'999型專案價':'0','合約24期':'1,299'},
  }, overrides);
}

function tradeinRow(overrides = {}) {
  return Object.assign({
    source_sheet:'回收價', brand:'Apple', model:'iPhone 16 256GB', quotes:{
      '點子行動':{S:'18,000',A:'12,000',B:'8,000',C:''},
      'FutureDial（FDI）':{S:'17,500',A:'11,500',B:'7,500',C:null},
    },
  }, overrides);
}

function fullDiff(kind, previous, current) {
  return Diff.diffSnapshots(kind, previous, current, {includeRecords:true, limit:Infinity});
}

test('canonical price 區分千分位、zero 與 missing，不把 missing 當 0', () => {
  assert.deepEqual(Diff.canonicalPrice('1,299'), {kind:'number', value:'1299', display:'1299'});
  assert.deepEqual(Diff.canonicalPrice('0.00'), {kind:'zero', value:'0', display:'0'});
  assert.deepEqual(Diff.canonicalPrice(''), {kind:'missing', value:null, display:'無報價（缺價）'});
  assert.throws(() => Diff.canonicalPrice('1234,567'));
  assert.equal(Diff.samePrice(Diff.canonicalPrice('0'), Diff.canonicalPrice('')), false);
});

test('無 previous 的初版全部 added，shopping 語意 record 保留完整方案欄名', () => {
  const result = fullDiff('shopping', null, { kind:'shopping', source_version_date:'2026-10-01', rows:[shoppingRow()] });
  assert.equal(result.firstRelease, true);
  assert.deepEqual(result.counts, {added:3, changed:0, unchanged:0, removed:0});
  assert.equal(result.added.some(record => record.dimension === 'retail'), true);
  const plan = result.added.find(record => record.plan === '合約24期');
  assert.equal(plan.identity.model, 'iPhone 16 256GB');
  assert.equal(plan.sourceModel, 'iPhone 16 256GB 黑色');
  assert.equal(plan.identity.code, undefined);
  assert.equal(plan.identity.condition, 'project_price');
  assert.equal(plan.before, null);
  assert.equal(plan.after.value, '1299');
});

test('資料列重排、日期改變與 source row number 改變不會造成價格 changed', () => {
  const previous = { kind:'shopping', source_version_date:'2026-09-30', rows:[
    shoppingRow({source_row_number:20}),
    shoppingRow({source_row_number:21, model:'iPhone 16 512GB 黑色', colorless_model:'iPhone 16 512GB', retail_price:'39,900'}),
  ] };
  const current = { kind:'shopping', source_version_date:'2026-10-01', rows:[
    shoppingRow({source_row_number:3, model:'iPhone 16 512GB 黑色', colorless_model:'iPhone 16 512GB', retail_price:'39,900'}),
    shoppingRow({source_row_number:2}),
  ] };
  const result = Diff.diffSnapshots('shopping', previous, current);
  assert.equal(result.counts.changed, 0);
  assert.equal(result.counts.added, 0);
  assert.equal(result.counts.removed, 0);
  assert.ok(result.counts.unchanged > 0);
  assert.deepEqual(result.changes, []);
});

test('容量與完整資費／合約／條件欄名是語意 key，改名視為 removed + added', () => {
  const previous = { kind:'shopping', rows:[shoppingRow({project_prices:{'合約24期／月租999':'1,299'}})] };
  const current = { kind:'shopping', rows:[shoppingRow({model:'iPhone 16 512GB 黑色', colorless_model:'iPhone 16 512GB', project_prices:{'合約36期／月租999':'1,299'}})] };
  const result = Diff.diffSnapshots('shopping', previous, current);
  assert.equal(result.counts.changed, 0);
  assert.equal(result.changes.filter(record => record.status === 'added').length, 2);
  assert.equal(result.changes.filter(record => record.status === 'removed').length, 2);
  assert.equal(result.changes.some(record => record.identity.model === 'iPhone 16 512GB'), true);
  assert.equal(result.changes.some(record => record.plan === '合約24期／月租999' && record.status === 'removed'), true);
});

test('retail 與 project 各自比較，zero／missing 互換會是 changed', () => {
  const previous = { kind:'shopping', rows:[shoppingRow({retail_price:'', project_prices:{'方案':'0'}})] };
  const current = { kind:'shopping', rows:[shoppingRow({retail_price:'0', project_prices:{'方案':''}})] };
  const result = fullDiff('shopping', previous, current);
  assert.equal(result.counts.changed, 2);
  const retail = result.changed.find(record => record.dimension === 'retail');
  const plan = result.changed.find(record => record.plan === '方案');
  assert.equal(retail.before.kind, 'missing');
  assert.equal(retail.after.kind, 'zero');
  assert.equal(plan.before.kind, 'zero');
  assert.equal(plan.after.kind, 'missing');
});

test('同 key 同值 duplicate 合併 row refs；同 key 異值 duplicate fail closed', () => {
  const same = fullDiff('shopping', null, { kind:'shopping', rows:[
    shoppingRow({source_row_number:2}), shoppingRow({source_row_number:3}),
  ] });
  const retail = same.added.find(record => record.dimension === 'retail');
  assert.deepEqual(retail.rowRefs.current.map(ref => ref.source_row_number), [2,3]);

  assert.throws(() => Diff.diffSnapshots('shopping', null, { kind:'shopping', rows:[
    shoppingRow({source_row_number:2}), shoppingRow({source_row_number:3, retail_price:'30,000'}),
  ] }), error => error.code === 'DUPLICATE_CONFLICT');
});

test('色別與 code 變更不改 shopping 語意 key，追溯資訊保留且同價合併', () => {
  const previous = {kind:'shopping', rows:[shoppingRow({
    source_row_number:2, model:'iPhone 16 256GB 黑色', code:'A16-BLK', retail_price:'29,900',
  })]};
  const current = {kind:'shopping', rows:[shoppingRow({
    source_row_number:3, model:'iPhone 16 256GB 藍色', code:'A16-BLU', retail_price:'29,900',
  })]};
  const result = fullDiff('shopping', previous, current);
  assert.equal(result.counts.added, 0);
  assert.equal(result.counts.changed, 0);
  assert.equal(result.counts.removed, 0);
  assert.equal(result.unchanged.length, 3);
  const retail = result.unchanged.find(record => record.dimension === 'retail');
  assert.equal(retail.identity.model, 'iPhone 16 256GB');
  assert.equal(retail.identity.code, undefined);
  assert.deepEqual(retail.rowRefs.previous.map(ref => ref.source_row_number), [2]);
  assert.deepEqual(retail.rowRefs.current.map(ref => ref.source_row_number), [3]);
  assert.deepEqual(retail.sourceVariants, [{model:'iPhone 16 256GB 藍色', code:'A16-BLU'}]);
});

test('shopping 缺少 colorless_model 時退回完整原始 model', () => {
  const result = fullDiff('shopping', null, {kind:'shopping', rows:[shoppingRow({colorless_model:undefined})]});
  const retail = result.added.find(record => record.dimension === 'retail');
  assert.equal(retail.identity.model, 'iPhone 16 256GB 黑色');
});

test('同去色機款不同色別若完整價格不一致，duplicate conflict fail closed', () => {
  assert.throws(() => Diff.diffSnapshots('shopping', null, {kind:'shopping', rows:[
    shoppingRow({source_row_number:2, model:'iPhone 16 256GB 黑色', code:'A16-BLK', retail_price:'29,900'}),
    shoppingRow({source_row_number:3, model:'iPhone 16 256GB 藍色', code:'A16-BLU', retail_price:'30,000'}),
  ]}), error => error.code === 'DUPLICATE_CONFLICT');
});

test('不同 colorless_model 容量與完整方案條件不合併', () => {
  const previous = {kind:'shopping', rows:[shoppingRow({
    model:'iPhone 16 256GB 黑色', colorless_model:'iPhone 16 256GB',
    project_prices:{'合約24期／月租999':'1,299'},
  })]};
  const current = {kind:'shopping', rows:[shoppingRow({
    model:'iPhone 16 512GB 黑色', colorless_model:'iPhone 16 512GB',
    project_prices:{'合約24期／月租999':'1,299'},
  })]};
  const result = Diff.diffSnapshots('shopping', previous, current);
  assert.equal(result.counts.changed, 0);
  assert.equal(result.counts.added, 2);
  assert.equal(result.counts.removed, 2);
  assert.equal(result.changes.every(record => record.identity.model.includes('iPhone 16 ')), true);
});

test('tradein provider／grade 各自獨立，兩家不互相比價或錯位', () => {
  const previous = { kind:'tradein', rows:[tradeinRow()] };
  const current = { kind:'tradein', rows:[tradeinRow({quotes:{
    'FutureDial（FDI）':{C:null,B:'7,500',A:'12,500',S:'17,500'},
    '點子行動':{C:'0',B:'8,000',A:'12,000',S:'18,000'},
  }})] };
  const result = fullDiff('tradein', previous, current);
  assert.equal(result.counts.changed, 2);
  const fdi = result.changed.find(record => record.provider === 'FutureDial（FDI）' && record.grade === 'A');
  const idea = result.changed.find(record => record.provider === '點子行動' && record.grade === 'C');
  assert.equal(fdi.before.value, '11500');
  assert.equal(fdi.after.value, '12500');
  assert.equal(idea.before.kind, 'missing');
  assert.equal(idea.after.kind, 'zero');
  assert.equal(result.changed.every(record => record.identity.provider && record.identity.grade), true);
});

test('no change 只回 unchanged records，changes 清單穩定排序', () => {
  const snapshot = { kind:'tradein', rows:[tradeinRow()] };
  const result = fullDiff('tradein', snapshot, { kind:'tradein', rows:[tradeinRow()] });
  assert.equal(result.counts.added, 0);
  assert.equal(result.counts.changed, 0);
  assert.equal(result.counts.removed, 0);
  assert.ok(result.counts.unchanged > 0);
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.unchanged.map(record => record.key), [...result.unchanged].map(record => record.key).sort((left, right) => left.localeCompare(right, 'zh-Hant')));
});

test('default diff page 分頁且 counts 不受 page／search 影響，JSON 不重複完整 arrays', () => {
  const rows = Array.from({length:130}, (_, index) => shoppingRow({
    source_row_number:index + 1,
    model:`Model ${index}`,
    colorless_model:`Model ${index}`,
    project_prices:{方案:String(index)},
  }));
  const current = {kind:'shopping', rows};
  const first = Diff.diffSnapshots('shopping', null, current);
  assert.equal(first.limit, 100);
  assert.equal(first.offset, 0);
  assert.equal(first.changePage.length, 100);
  assert.equal(first.counts.added, 260);
  assert.equal(first.totalChangeCount, 260);
  assert.equal(first.changeCount, 260);
  assert.equal(first.hasMore, true);
  assert.equal(first.added, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(first, 'records'), false);
  const serialized = JSON.parse(JSON.stringify(first));
  assert.equal(Array.isArray(serialized.changePage), true);
  assert.equal(serialized.added, undefined);

  const second = Diff.diffSnapshots('shopping', null, current, {offset:100, limit:100});
  const last = Diff.diffSnapshots('shopping', null, current, {offset:200, limit:100});
  assert.equal(second.changePage.length, 100);
  assert.equal(second.hasMore, true);
  assert.equal(last.changePage.length, 60);
  assert.equal(last.hasMore, false);

  const full = Diff.diffSnapshots('shopping', null, current, {limit:Infinity});
  assert.equal(full.changePage.length, 260);
  const filtered = Diff.diffSnapshots('shopping', null, current, {search:'Model 129'});
  assert.equal(filtered.counts.added, 260);
  assert.equal(filtered.totalChangeCount, 260);
  assert.equal(filtered.changeCount, 2);
  assert.equal(filtered.changePage.length, 2);
});

test('includeUnchanged 只在明確要求時將 unchanged 放入 page', () => {
  const snapshot = {kind:'tradein', rows:[tradeinRow()]};
  const normal = Diff.diffSnapshots('tradein', snapshot, snapshot);
  assert.deepEqual(normal.changePage, []);
  const withUnchanged = Diff.diffSnapshots('tradein', snapshot, snapshot, {includeUnchanged:true, limit:Infinity});
  assert.equal(withUnchanged.changeCount, 0);
  assert.equal(withUnchanged.totalChangeCount, 0);
  assert.equal(withUnchanged.changePage.length, 8);
  assert.equal(withUnchanged.changePage.every(record => record.status === 'unchanged'), true);
});
