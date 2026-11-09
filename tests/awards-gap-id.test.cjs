const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Catalog = require('../award-model-catalog.js');
const Awards = require('../awards-battle-controller.js');
const Kpi = require('../kpi-battle-controller.js');
const { fixture } = require('./helpers/awards-gap-id-fixture.cjs');

test('gap reconciles signed differences; explicit nulls and inconsistent quantities stay missing', () => {
  const base = { display_name: '合成機款', actual: 2, threshold_target: 5, gap: 3 };
  for (const [changes, expected] of [
    [{}, '-3'], [{ actual: 5, gap: 0 }, '0'], [{ actual: 7, gap: 0 }, '+2'],
    [{ actual: 0, threshold_target: 0, gap: 0 }, '0'],
    [{ actual: '2', threshold_target: '5', gap: '3' }, '-3'],
    [{ difference: 4 }, '+4'], [{ difference: 0 }, '0'],
    [{ difference: null }, '尚未有資料'], [{ difference: '' }, '尚未有資料'],
    [{ difference: ' ' }, '尚未有資料'], [{ difference: Infinity }, '尚未有資料'],
    [{ actual: null }, '尚未有資料'], [{ actual: '' }, '尚未有資料'],
    [{ actual: ' ' }, '尚未有資料'], [{ actual: false }, '尚未有資料'],
    [{ threshold_target: null }, '尚未有資料'], [{ gap: null }, '尚未有資料'],
    [{ gap: -3 }, '尚未有資料'], [{ gap: 0 }, '尚未有資料'], [{ gap: 4 }, '尚未有資料'],
  ]) {
    const item = { ...base, ...changes }, before = structuredClone(item);
    assert.ok(Awards.renderAwardModel(item, false).includes(`50%差異 ${expected}｜`), JSON.stringify(changes));
    assert.ok(Awards.renderAwardPriority(item).includes(`>${expected}</strong></div>`), JSON.stringify(changes));
    assert.deepEqual(item, before);
  }
});

test('November accepts supported identities only when every supplied identity agrees', () => {
  const rows = Catalog.definitions('2026-11-04');
  for (const [field, value] of [['name', 'sourceName'], ['sourceName', 'sourceName'], ['modelId', 'modelId'], ['display_name', 'shortName']]) {
    assert.equal(Catalog.selectionMatches(rows.map(row => ({ [field]: row[value] })), '2026-11-04'), true);
  }
  for (const field of ['name', 'sourceName', 'modelId', 'display_name']) {
    for (const conflicting of ['vivo V80', 'vivo X300', 'unknown-model', 0, false]) {
      const items = fixture().snapshot.awardsBattle.overall.items;
      items[2][field] = conflicting;
      assert.equal(Catalog.selectionMatches(items, '2026-11-04'), false, `${field}: ${conflicting}`);
    }
  }
  const items = fixture().snapshot.awardsBattle.overall.items;
  items[1] = items[0];
  assert.equal(Catalog.selectionMatches(items, '2026-11-04'), false);
});

test('complete November rows survive adapter and render without fixed pending groups or input mutation', () => {
  const value = fixture(), before = structuredClone(value);
  const view = Kpi.mergeKpiBattleSupplement(Kpi.kpicalcToKpiBattleView(value.kpi, 'synthetic'), value.snapshot.kpiBattle);
  const nodes = { awardsBattleContent: { innerHTML: '' }, awardsBattleSourceNote: { textContent: '' } };
  const controller = Awards.create({ window: {}, document: { getElementById: id => nodes[id], addEventListener() {} } });
  assert.equal(controller.acceptKpiResult({ data: view, result: { snapshot: value.snapshot } }), true);
  assert.equal((nodes.awardsBattleContent.innerHTML.match(/class="award-store-card"/g) || []).length, 10);
  assert.equal((nodes.awardsBattleContent.innerHTML.match(/class="award-model"/g) || []).length, 10);
  assert.doesNotMatch(nodes.awardsBattleContent.innerHTML, /差異 尚未有資料|資料待核|✅ 可領獎/);
  assert.match(nodes.awardsBattleSourceNote.textContent, /發布日期 2026-11-05｜資料截至 2026-11-04/);
  assert.deepEqual(value, before);
});

test('older and unknown month behavior is unchanged and all entry points load the repaired assets', () => {
  for (const [date, count] of [['2026-08-31', 13], ['2026-09-30', 10], ['2026-10-31', 10], ['2026-11-04', 10], ['2026-12-01', 13]]) assert.equal(Catalog.expectedCount(date), count);
  for (const name of ['index.html', 'awards-battle.html', 'kpi-battle.html']) {
    const html = fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
    assert.ok(html.includes('award-model-catalog.js?v=20261105-awards-gap-id-1'));
    assert.ok(html.includes('awards-battle-controller.js?v=20261109-person-ranking-1'));
    assert.ok(!html.includes('award-model-pending'));
  }
});
