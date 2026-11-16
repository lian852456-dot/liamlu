(function(root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./north12-officer-core.js') : root.North12OfficerCore,
    typeof module === 'object' && module.exports ? require('./readonly-dashboard-core.js') : root.ReadonlyDashboardCore);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ConversionPublicationCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function(Officer, Base) {
  'use strict';
  const SCHEMA = 'north12-conversion-publication/v1';
  function selectRegion(value, region) {
    const stores = value.stores.filter(store => store.region === region);
    const ids = new Set(stores.map(store => store.id));
    const detail = value.renewalDetail;
    return Officer.validate({...value, stores, records:value.records.filter(row => ids.has(row.store)),
      prior:value.prior && value.prior.filter(row => ids.has(row.store)),
      renewalDetail:detail && {...detail, tiers:detail.tiers.filter(row => ids.has(row.store)),
        observation:detail.observation.filter(row => row.region === region), plans:detail.plans.filter(row => ids.has(row.store))}});
  }
  function normalize(value) {
    if (value.schema !== SCHEMA) throw Error('部區發布格式不符');
    const regions = {};
    for (const region of Officer.REGIONS) {
      if (!value.regions?.[region]) continue;
      const data = Officer.validate(value.regions[region]);
      if (data.stores.some(store => store.region !== region)) throw Error('區域版本含跨區門市');
      regions[region] = data;
    }
    if (!Object.keys(regions).length) throw Error('沒有可發布區域');
    const ids = Object.values(regions).flatMap(data => data.stores.map(store => store.id));
    if (new Set(ids).size !== ids.length) throw Error('不同區域包含相同店碼');
    if (!/^[a-f0-9]{64}$/.test(value.sha256 || '') || !Number.isSafeInteger(value.source_bytes) || value.source_bytes <= 0) throw Error('來源身分不完整');
    if (!Object.values(regions).some(data => data.sha256 === value.sha256 && data.period_start === value.period_start && data.cutoff === value.cutoff && data.source_name === value.source_name)) throw Error('發布批次與區域來源不符');
    return {schema:SCHEMA, period_start:value.period_start, cutoff:value.cutoff, sha256:value.sha256,
      source_name:value.source_name, source_bytes:value.source_bytes, regions};
  }
  function fromOfficer(value) {
    const data = Officer.validate(value), regions = {};
    for (const region of new Set(data.stores.map(store => store.region))) regions[region] = selectRegion(data, region);
    return normalize({...data, schema:SCHEMA, regions});
  }
  function migrate(value) {
    if (!value) return null;
    if (value.schema === SCHEMA) return normalize(value);
    const data = Base.validateConversion(value);
    return fromOfficer({...data, schema:Officer.SCHEMA});
  }
  function combine(current, incoming) {
    const next = normalize(incoming), old = migrate(current), regions = {...old?.regions};
    let added = 0, changed = 0;
    for (const [region, data] of Object.entries(next.regions)) {
      const before = regions[region];
      if (before && (data.period_start < before.period_start || data.period_start === before.period_start && data.cutoff < before.cutoff)) throw Error(region + ' 截止不得倒退');
      if (before?.period_start === data.period_start) {
        const rows = new Map(data.records.map(row => [row.store + '|' + row.date, row]));
        for (const row of before.records) {
          const replacement = rows.get(row.store + '|' + row.date);
          if (!replacement) throw Error(region + ' 新版本移除既有店日');
          if (Base.FIELDS.some(key => row[key] !== replacement[key])) changed++;
        }
        added += data.records.length - before.records.length;
        if (before.sha256 === data.sha256 && JSON.stringify(before) !== JSON.stringify(data)) throw Error('相同原始檔雜湊卻有不同彙總內容');
      } else added += data.records.length;
      regions[region] = data;
    }
    return {snapshot:normalize({...next, regions}), added, changed, removed:0};
  }
  function projectB(value) {
    if (value.schema !== SCHEMA) return Base.validateConversion(value);
    const data = normalize(value).regions['北一二B'];
    return data ? Base.validateConversion({...data, schema:Base.SCHEMA}) : null;
  }
  function coverage(value) {
    const publication = migrate(value);
    return Officer.REGIONS.map(region => {
      const data = publication?.regions[region];
      return {region, available:!!data, cutoff:data?.cutoff || null, sourceName:data?.source_name || null,
        sourceHash:data?.sha256 || null, stores:data?.stores.length || 0,
        updated:!!data && data.sha256 === publication.sha256};
    });
  }
  return {SCHEMA, normalize, fromOfficer, combine, migrate, projectB, coverage};
});
