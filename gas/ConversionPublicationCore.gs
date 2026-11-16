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
      renewalDetail:detail && {...detail, cohorts:(detail.cohorts || []).filter(row=>ids.has(row.store)), tiers:detail.tiers.filter(row => ids.has(row.store)),
        observation:detail.observation.filter(row => row.region === region), plans:detail.plans.filter(row => ids.has(row.store)),
        ...(detail.coverage.cross?{cross:detail.cross.filter(row=>ids.has(row.store))}:{})}});
  }
  const KINDS = ['daily','prior','tiers','plans','observation','cross','cohorts'];
  function source(data) {
    return {sha256:data.sha256, source_name:data.source_name, source_bytes:data.source_bytes,
      period_start:data.period_start, cutoff:data.cutoff};
  }
  function retained(value, regions) {
    if (value == null) return [];
    if (!Array.isArray(value) || value.length > 1000) throw Error('保留來源格式不符');
    const seen = new Set();
    return value.map(row => {
      const data = regions[row.region], ids = new Set(data?.stores.map(store => store.id));
      if (!data || !KINDS.includes(row.kind) || !Array.isArray(row.stores) || !row.stores.length ||
          row.stores.some(id => !ids.has(id)) || new Set(row.stores).size !== row.stores.length ||
          !/^[a-f0-9]{64}$/.test(row.sha256 || '') || typeof row.source_name !== 'string' ||
          !/^[^/\\\\\x00-\x1f]{1,155}\.xls[xm]$/i.test(row.source_name) ||
          !Number.isSafeInteger(row.source_bytes) || row.source_bytes <= 0 ||
          row.period_start !== data.period_start || row.cutoff !== data.cutoff) throw Error('保留來源身分不完整');
      for (const id of row.stores) {
        const key = row.region + '|' + row.kind + '|' + id;
        if (seen.has(key)) throw Error('保留來源重複');
        seen.add(key);
      }
      return {region:row.region, kind:row.kind, stores:[...row.stores].sort(), ...source(row)};
    }).sort((a,b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
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
      source_name:value.source_name, source_bytes:value.source_bytes, regions,
      ...(value.retained_sources?.length ? {retained_sources:retained(value.retained_sources, regions)} : {})};
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
  // Only keep fields observed over this exact period. A later cutoff never
  // relabels an older optional table as current.
  function mergeRegion(before, data) {
    if (!before || before.period_start !== data.period_start || before.cutoff !== data.cutoff) return data;
    const incomingIds = new Set(data.stores.map(store => store.id));
    const stores = before.stores.map(store => data.stores.find(next => next.id === store.id) || store)
      .concat(data.stores.filter(store => !before.stores.some(old => old.id === store.id)));
    const keep = rows => (rows || []).filter(row => !incomingIds.has(row.store));
    let prior = data.prior ? keep(before.prior).concat(data.prior) : before.prior;
    if (prior?.length !== stores.length) prior = null;
    const a = before.renewalDetail, b = data.renewalDetail;
    let renewalDetail;
    if (a || b) {
      renewalDetail = {schema:'north12-renewal-detail/v1', period_start:data.period_start, cutoff:data.cutoff,
        tiers:[], plans:[], observation:[], coverage:{tiers:false,plans:false,observation:false,
          ...((a?.coverage.cross!==undefined||b?.coverage.cross!==undefined)?{cross:false}:{})}};
      for (const key of ['tiers','plans','cross']) {
        const parts = stores.map(store => {
          const useNew = incomingIds.has(store.id) && b?.coverage[key];
          const detail = useNew ? b : a;
          return detail?.coverage[key] ? detail[key].filter(row => row.store === store.id) : null;
        });
        if (parts.every(rows => rows !== null)) {
          renewalDetail[key] = parts.flat(); renewalDetail.coverage[key] = true;
        }
      }
      const cohortParts = stores.map(store => {
        const detail = incomingIds.has(store.id) && b?.cohortAvailable ? b : a;
        return detail?.cohortAvailable ? detail.cohorts.filter(row=>row.store===store.id) : null;
      });
      renewalDetail.cohortAvailable = cohortParts.every(rows=>rows!==null);
      renewalDetail.cohorts = renewalDetail.cohortAvailable ? cohortParts.flat() : [];
      // Region-wide observations cannot be substituted with a partial store scope.
      const observation = incomingIds.size === stores.length && b?.coverage.observation ? b : a;
      if (observation?.coverage.observation) {
        renewalDetail.observation = observation.observation; renewalDetail.coverage.observation = true;
      }
      const issues = {...a?.issues, ...b?.issues};
      for (const key of ['tiers','plans','observation','cross','cohorts']) if (renewalDetail.coverage[key]) delete issues[key];
      if (Object.keys(issues).length) renewalDetail.issues = issues;
    }
    return Officer.validate({...data, stores,
      records:keep(before.records).concat(data.records), prior,
      prior_period:prior ? (data.prior_period || before.prior_period) : null,
      ...(renewalDetail ? {renewalDetail} : {})});
  }
  function combine(current, incoming) {
    const next = normalize(incoming), old = migrate(current), regions = {...old?.regions};
    const kept = (old?.retained_sources || []).filter(row => !next.regions[row.region]);
    let added = 0, changed = 0;
    for (const [region, data] of Object.entries(next.regions)) {
      const before = regions[region];
      if (before && (data.period_start < before.period_start || data.period_start === before.period_start && data.cutoff < before.cutoff)) throw Error(region + ' 截止不得倒退');
      const merged = mergeRegion(before, data), rows = new Map(merged.records.map(row => [row.store + '|' + row.date, row]));
      if (before?.period_start === data.period_start) {
        for (const row of before.records) {
          const replacement = rows.get(row.store + '|' + row.date);
          if (!replacement) throw Error(region + ' 新版本移除既有店日');
          if (Base.FIELDS.some(key => row[key] !== replacement[key])) changed++;
        }
        added += merged.records.length - before.records.length;
        if (before.sha256 === data.sha256 && JSON.stringify(before) !== JSON.stringify(merged)) throw Error('相同原始檔雜湊卻有不同彙總內容');
      } else added += data.records.length;
      if (before && before.period_start === data.period_start && before.cutoff === data.cutoff) {
        const ids = new Set(data.stores.map(store => store.id));
        for (const kind of KINDS) for (const store of merged.stores) {
          const usedOld = kind === 'daily' ? !ids.has(store.id) : kind === 'prior' ? !!merged.prior && (!data.prior || !ids.has(store.id))
            : kind === 'cohorts' ? !!merged.renewalDetail?.cohortAvailable && (!ids.has(store.id) || !data.renewalDetail?.cohortAvailable) : !!merged.renewalDetail?.coverage[kind] && (kind === 'observation'
              ? !(ids.size === merged.stores.length && data.renewalDetail?.coverage.observation)
              : !ids.has(store.id) || !data.renewalDetail?.coverage[kind]);
          if (!usedOld) continue;
          const previous = old.retained_sources?.find(row => row.region === region && row.kind === kind && row.stores.includes(store.id));
          kept.push({region, kind, stores:[store.id], ...source(previous || before)});
        }
      }
      regions[region] = merged;
    }
    const snapshot = normalize({...next, regions, retained_sources:kept});
    const equivalent = old && JSON.stringify(old.regions) === JSON.stringify(snapshot.regions) &&
      JSON.stringify(old.retained_sources || []) === JSON.stringify(snapshot.retained_sources || []);
    return {snapshot:equivalent ? old : snapshot, same_source:!!equivalent, added, changed, removed:0};
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
