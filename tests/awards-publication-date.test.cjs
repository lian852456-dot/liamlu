const test = require('node:test');
const assert = require('node:assert/strict');
const Kpi = require('../kpi-battle-controller.js');
const Awards = require('../awards-battle-controller.js');
const Catalog = require('../award-model-catalog.js');

function fixture(cutoff = '2026-10-01', publication = '2026-10-02') {
  const definitions = Catalog.definitions(cutoff);
  const items = definitions.map(row => ({ name: row.sourceName || row.shortName, actual: 8, target: 10, rate: .8 }));
  const snapshot = {
    report_date: cutoff, report_run_date: publication, data_as_of_date: cutoff,
    source_file: publication.slice(5).replace('-', '') + '.xlsx', processing_run_id: 'synthetic-run',
    aggregate: {}, stores: [], personal: [],
  };
  return {
    kpi: { meta: { month: cutoff.slice(0, 7), snapshotDay: Number(cutoff.slice(8)), sourceFile: snapshot.source_file }, items: [], stores: [], persons: [] },
    snapshot,
    awards: {
      report_date: cutoff, report_run_date: publication, data_as_of_date: cutoff,
      processing_run_id: snapshot.processing_run_id, phone_items: items.length, store_rows: 10,
      supervisor: {}, overall: { items },
      stores: Array.from({ length: 9 }, (_, i) => ({ store: `合成店${i + 1}`, items: structuredClone(items) })),
    },
  };
}

function pipeline(value, previousView) {
  const raw = previousView || Kpi.kpicalcToKpiBattleView(value.kpi, 'synthetic');
  const merged = Kpi.mergeKpiBattleSupplement(raw, value.snapshot);
  return { raw, merged, validation: Awards.validateAwardsBattle(value.awards, merged, value.snapshot) };
}

test('same-source D+1 publication survives the kpicalc → supplement → awards path', () => {
  const value = fixture();
  const before = structuredClone(value);
  const result = pipeline(value);
  assert.equal(result.validation.ok, true);
  assert.equal(result.raw.report_date, '');
  assert.equal(result.merged.report_date, '2026-10-01');
  assert.equal(result.merged.data_as_of_date, '2026-10-01');
  assert.equal(result.merged.report_run_date, '2026-10-02');
  assert.equal(result.merged.supplement_synced, true);
  assert.deepEqual(value, before);
});

test('same-day publication uses the same explicit date fields', () => {
  assert.equal(pipeline(fixture('2026-10-01', '2026-10-01')).validation.ok, true);
});

test('October 1 publication of September 30 data keeps September model count', () => {
  const value = fixture('2026-09-30', '2026-10-01');
  assert.equal(value.awards.phone_items, Catalog.expectedCount('2026-09-30'));
  assert.equal(pipeline(value).validation.ok, true);
  value.awards.phone_items = 13;
  assert.equal(pipeline(value).validation.ok, false);
});

test('legacy snapshots without publication fields retain the cutoff-date fallback', () => {
  const value = fixture();
  delete value.snapshot.report_run_date;
  delete value.awards.report_run_date;
  const result = pipeline(value);
  assert.equal(result.merged.report_date, '2026-10-01');
  assert.ok(!result.merged.report_run_date);
  assert.equal(result.validation.ok, true);
});

const invalid = [
  ['only awards has a publication date', value => { delete value.snapshot.report_run_date; }],
  ['only KPI has a publication date', value => { delete value.awards.report_run_date; }],
  ['different publication dates', value => { value.awards.report_run_date = '2026-10-03'; }],
  ['cross-month cutoff mismatch', value => { value.awards.data_as_of_date = '2026-09-30'; }],
  ['stale KPI supplement cutoff', value => { value.snapshot.report_date = value.snapshot.data_as_of_date = '2026-09-30'; }],
  ['different canonical KPI source', value => { value.snapshot.source_file = '1003.xlsx'; }],
  ['different batch', value => { value.awards.processing_run_id = 'other-run'; }],
  ['missing batch required by KPI', value => { delete value.awards.processing_run_id; }],
  ['missing KPI source identity', value => { delete value.snapshot.source_file; }],
  ['missing KPI snapshot report date', value => { delete value.snapshot.report_date; }],
  ['missing KPI cutoff', value => { delete value.snapshot.data_as_of_date; }],
  ['missing kpicalc date', value => { delete value.kpi.meta.snapshotDay; }],
  ['missing awards date identities', value => { delete value.awards.report_date; delete value.awards.report_run_date; }],
  ['missing awards cutoff', value => { delete value.awards.data_as_of_date; }],
  ['incomplete overall items', value => { value.awards.overall.items.pop(); }],
  ['incomplete store items', value => { value.awards.stores[0].items.pop(); }],
  ['missing store', value => { value.awards.stores.pop(); }],
  ['duplicate store', value => { value.awards.stores[1].store = value.awards.stores[0].store; }],
  ['missing supervisor object', value => { delete value.awards.supervisor; }],
  ['stale October model group', value => { value.awards.overall.items[0].name = 'S26Ultra/ZFold8/ZFold8Ultra'; }],
];
for (const [name, mutate] of invalid) {
  test(`date transfer remains fail-closed: ${name}`, () => {
    const value = fixture();
    mutate(value);
    assert.equal(pipeline(value).validation.ok, false);
  });
}

test('a failed source merge cannot reuse an earlier compatible view to accept awards', () => {
  const value = fixture();
  delete value.snapshot.report_run_date;
  delete value.awards.report_run_date;
  const previous = pipeline(value).merged;
  value.snapshot.source_file = '1003.xlsx';
  const result = pipeline(value, previous);
  assert.equal(result.merged.supplement_synced, false);
  assert.equal(result.validation.ok, false);
});
