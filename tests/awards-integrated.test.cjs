const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../award-model-catalog.js').november;
const { novemberPriorities, renderIntegratedAwards } = require('../awards-battle-controller.js');

function fixture() {
  const rule = Object.fromEntries(catalog.rewardRules.map(row => [row.role, row.amounts]));
  const source = {source_data_date:'2026-11-07', run_id:'synthetic-run', sha256:'a'.repeat(64)};
  const row = (store, actual) => ({
    store,
    award: {actual_total: actual, projected: 100 - actual, award: 'Y'},
    items: catalog.selectedModels.map(name => ({
      name, display_name:name, actual:1, target:5, rate:0.2, threshold_target:3,
      store_reward_50:rule.manager[name][0], store_reward_100:rule.manager[name][2],
      district_reward_80:rule.supervisor[name][0], district_reward_100:rule.supervisor[name][2],
    })),
    priorities: [],
  });
  return {
    data_as_of_date:source.source_data_date, processing_run_id:source.run_id,
    config_version:catalog.configVersion, config_hash:'b'.repeat(64),
    source_files:{store:source, person:{...source}},
    overall:row('北一二B整體',40), stores:[row('台北甲店',30), row('乙店',20)],
  };
}

test('verified November input with empty published priorities uses the month-specific estimate', () => {
  const data = fixture();
  const store = novemberPriorities(data, data.stores[0]);
  const area = novemberPriorities(data, data.overall);
  assert.equal(store.length, 3);
  assert.equal(area.length, 3);
  assert.equal(store[0].next_label, '店長 50%');
  assert.equal(store[0].units_needed, 2);
  assert.equal(store[0].incremental_award, 1370);
  assert.equal(area[0].next_label, '督導 80%');
  assert.equal(area[0].units_needed, 3);
  assert.equal(area[0].incremental_award, 1415);
  assert.deepEqual(data.overall.priorities, []);
  for (const change of [
    d => { d.data_as_of_date = '2026-12-01'; },
    d => { d.config_version = 'unknown'; },
    d => { d.source_files.person.run_id = 'wrong'; },
    d => { d.overall.items[0].district_reward_80 += 1; },
    d => { d.overall.items[0].rate = 0.1; },
  ]) {
    const invalid = fixture();
    change(invalid);
    assert.equal(novemberPriorities(invalid, invalid.overall), null);
  }
});

test('the store selector does not change the logged-in store, and the basis changes both rankings', () => {
  const data = fixture();
  data.viewer = { mode:'member', store:'甲店', actual:{rank:3,amount:50,gap:10}, projected:{rank:1,amount:100,gap:0} };
  const actual = renderIntegratedAwards(data, data.stores[1], 'actual');
  assert.match(actual, /我的店 · 台北甲店/);
  assert.match(actual, /區內第 3 名 · \$50 · 追平前一名還差 \$10/);
  assert.doesNotMatch(actual, /全區同仁第一名/);
  const projected = renderIntegratedAwards(data, data.overall, 'projected');
  assert.match(projected, /區內第 2 名 · \$70 · 追平前一名還差 \$10/);
  assert.match(projected, /區內第 1 名 · \$100 · 目前領先/);
  data.viewer = {mode:'supervisor', actual:{amount:50,leaders:['甲＊']}};
  const supervisor = renderIntegratedAwards(data, data.overall, 'actual');
  assert.match(supervisor, /全區店點第一名/);
  assert.match(supervisor, /全區同仁第一名<\/strong><p>甲＊ · \$50/);
  assert.doesNotMatch(supervisor, /我的台獎/);
});

test('the personal board renders masked peers, self, and the selected award basis', () => {
  const data = fixture();
  data.viewer = {mode:'member', rankings:{
    actual:[{name:'甲＊',store:'台北甲店',amount:50,rank:1,gap:0},
      {name:'乙＊',store:'乙店',amount:0,rank:2,gap:50,self:true}],
    projected:[{name:'乙＊',store:'乙店',amount:110,rank:1,gap:0,self:true}],
  }};
  assert.doesNotMatch(renderIntegratedAwards(data, data.overall, 'actual'), /乙＊/);
  const actual = renderIntegratedAwards(data, data.overall, 'actual', 'people');
  assert.match(actual, /value="people" selected/);
  assert.match(actual, /aria-label="區內同仁獎金排名"/);
  assert.match(actual, /乙＊（我）<br><small>乙店<\/small><\/th><td>\$0<\/td><td>\$50/);
  const projected = renderIntegratedAwards(data, data.overall, 'projected', 'people');
  assert.match(projected, /乙＊（我）.*?\$110<\/td><td>目前領先/);
  assert.doesNotMatch(projected, /甲＊/);
  delete data.viewer.rankings;
  assert.match(renderIntegratedAwards(data, data.overall, 'actual', 'people'), /同仁獎金待確認/);
});
