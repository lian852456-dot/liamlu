const Catalog = require('../../award-model-catalog.js');

// Complete synthetic rows; no formal employee records or fixed pending groups.
function fixture() {
  const award = { actual_total: null, projected: null, rank: null, award: null };
  const items = district => Catalog.definitions('2026-11-04').map((group, index) => {
    const threshold = district ? 8 : 5;
    const actual = index % 3 === 0 ? 0 : index % 3 === 1 ? threshold : threshold + 2;
    return {
      name: group.sourceName, display_name: group.shortName, modelId: group.modelId,
      actual, target: 10, rate: actual / 10, threshold_target: threshold,
      gap: Math.max(threshold - actual, 0), status: actual < threshold ? '落後' : '達標',
      store_reward_50: null, store_reward_100: null, district_reward_80: null, district_reward_100: null,
    };
  });
  const kpiBattle = {
    report_date: '2026-11-04', report_run_date: '2026-11-05', data_as_of_date: '2026-11-04',
    source_file: '1105.xlsx', processing_run_id: 'synthetic-gap-id', aggregate: {}, stores: [], personal: [],
  };
  return {
    kpi: { meta: { month: '2026-11', snapshotDay: 4, sourceFile: '1105.xlsx' }, items: [], stores: [], persons: [] },
    snapshot: {
      kpiBattle,
      awardsBattle: {
        ...kpiBattle, phone_items: 10, store_rows: 10, supervisor: structuredClone(award),
        overall: { store: '北一二B整體', award: structuredClone(award), items: items(true), priorities: [] },
        stores: Array.from({ length: 9 }, (_, i) => ({ store: `合成店${i + 1}`, award: structuredClone(award), items: items(false), priorities: [] })),
      },
    },
  };
}
module.exports = { fixture };
