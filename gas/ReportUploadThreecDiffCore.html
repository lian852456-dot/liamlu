(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ThreecPriceDiffCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PROVIDERS = Object.freeze(['點子行動', 'FutureDial（FDI）', '愛鋒派']);
  const GRADES = Object.freeze(['S', 'A', 'B', 'C', '未分級']);
  const MISSING = Object.freeze({ kind:'missing', value:null, display:'無報價（缺價）' });

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function stableKey(parts) {
    // JSON array encoding avoids collisions when a source field contains a
    // delimiter. It is deterministic and deliberately does not hash data.
    return JSON.stringify(parts.map(value => text(value)));
  }

  function canonicalPrice(value) {
    if (value == null || text(value) === '') return MISSING;
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('價格不是有限數字');
    }
    const raw = text(value);
    const plain = /^\d+(?:\.\d+)?$/;
    const grouped = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;
    if (!plain.test(raw) && !grouped.test(raw)) {
      throw new Error('價格不是有效的非負數字：' + raw);
    }
    const normalized = raw.replace(/,/g, '');
    let [integer, fraction] = normalized.split('.');
    integer = integer.replace(/^0+(?=\d)/, '') || '0';
    fraction = (fraction || '').replace(/0+$/, '');
    const number = fraction ? `${integer}.${fraction}` : integer;
    if (number === '0') return Object.freeze({ kind:'zero', value:'0', display:'0' });
    return Object.freeze({ kind:'number', value:number, display:number });
  }

  function samePrice(left, right) {
    return left.kind === right.kind && left.value === right.value;
  }

  function clonePrice(value) {
    if (value == null) return null;
    return { kind:value.kind, value:value.value, display:value.display };
  }

  function rowRefs(row) {
    if (!row || typeof row !== 'object') return [];
    const sourceSheet = text(row.source_sheet || row.sourceSheet);
    const number = Number(row.source_row_number || row.sourceRowNumber);
    if (!sourceSheet && !Number.isSafeInteger(number)) return [];
    return [{
      source_sheet:sourceSheet,
      source_row_number:Number.isSafeInteger(number) && number > 0 ? number : null,
    }];
  }

  function refKey(ref) {
    return stableKey([ref.source_sheet, ref.source_row_number]);
  }

  function mergeRefs(left, right) {
    const map = new Map();
    [...(left || []), ...(right || [])].forEach(ref => map.set(refKey(ref), ref));
    return Array.from(map.values()).sort((a, b) =>
      text(a.source_sheet).localeCompare(text(b.source_sheet), 'zh-Hant') ||
      Number(a.source_row_number || 0) - Number(b.source_row_number || 0));
  }

  function sourceVariantKey(variant) {
    return stableKey([variant && variant.model, variant && variant.code]);
  }

  function mergeSourceVariants(left, right) {
    const map = new Map();
    [...(left || []), ...(right || [])].forEach(variant => {
      const value = {
        model:text(variant && variant.model),
        code:text(variant && variant.code),
      };
      map.set(sourceVariantKey(value), value);
    });
    return Array.from(map.values()).sort((a, b) =>
      a.model.localeCompare(b.model, 'zh-Hant') || a.code.localeCompare(b.code, 'en'));
  }

  function snapshotRows(value) {
    if (!value || typeof value !== 'object') return [];
    const snapshot = value.snapshot && typeof value.snapshot === 'object' ? value.snapshot : value;
    return Array.isArray(snapshot.rows) ? snapshot.rows : [];
  }

  function hasSnapshot(value) {
    if (!value || typeof value !== 'object') return false;
    const snapshot = value.snapshot && typeof value.snapshot === 'object' ? value.snapshot : value;
    return Boolean(snapshot && Array.isArray(snapshot.rows));
  }

  function assertKind(kind, value) {
    if (value && typeof value === 'object' && value.kind && text(value.kind) !== kind) {
      throw new Error(`snapshot kind 不符：期待 ${kind}，收到 ${value.kind}`);
    }
  }

  function shoppingRowRecords(row) {
    const sourceSheet = text(row && (row.source_sheet || row.sourceSheet));
    const brand = text(row && row.brand);
    const sourceModel = text(row && (row.model || row.source_model));
    const model = text(row && (row.colorless_model || row.colorlessModel || sourceModel));
    const code = text(row && row.code);
    const retail = row && row.retail_price !== undefined ? row.retail_price : row && row.retailPrice;
    const projects = row && row.project_prices && typeof row.project_prices === 'object'
      ? row.project_prices
      : row && row.projectPrices && typeof row.projectPrices === 'object' ? row.projectPrices : {};
    const identityBase = [sourceSheet, brand, model];
    const refs = rowRefs(row);
    const sourceVariants = [{model:sourceModel, code}];
    const records = [{
      key:stableKey(['shopping', ...identityBase, 'retail']),
      identity:{ kind:'shopping', source_sheet:sourceSheet, brand, model, condition:'retail' },
      model,
      sourceModel,
      sourceCode:code,
      sourceVariants,
      dimension:'retail',
      plan:'',
      provider:'',
      grade:'',
      value:canonicalPrice(retail),
      rowRefs:refs,
    }];
    Object.keys(projects).sort((left, right) => left.localeCompare(right, 'zh-Hant')).forEach(plan => {
      const condition = text(plan);
      records.push({
        key:stableKey(['shopping', ...identityBase, 'project_price', condition]),
        identity:{ kind:'shopping', source_sheet:sourceSheet, brand, model, condition:'project_price', plan:condition },
        model,
        sourceModel,
        sourceCode:code,
        sourceVariants,
        dimension:'project_price',
        plan:condition,
        provider:'',
        grade:'',
        value:canonicalPrice(projects[plan]),
        rowRefs:refs,
      });
    });
    return records;
  }

  function tradeinRowRecords(row) {
    const sourceSheet = text(row && (row.source_sheet || row.sourceSheet));
    const brand = text(row && row.brand);
    const model = text(row && (row.model || row.source_model));
    const quotes = row && row.quotes && typeof row.quotes === 'object' ? row.quotes : {};
    const refs = rowRefs(row);
    const records = [];
    Object.keys(quotes).sort((left, right) => left.localeCompare(right, 'zh-Hant')).forEach(provider => {
      const grades = quotes[provider] && typeof quotes[provider] === 'object' ? quotes[provider] : {};
      Object.keys(grades).sort((left, right) => left.localeCompare(right, 'en')).forEach(grade => {
        const vendor = text(provider);
        const level = text(grade);
        records.push({
          key:stableKey(['tradein', sourceSheet, brand, model, vendor, level]),
          identity:{ kind:'tradein', source_sheet:sourceSheet, brand, model, provider:vendor, grade:level },
          model,
          dimension:'tradein_quote',
          plan:'',
          provider:vendor,
          grade:level,
          value:canonicalPrice(grades[grade]),
          rowRefs:refs,
        });
      });
    });
    return records;
  }

  function normalizeRecords(kind, snapshot) {
    assertKind(kind, snapshot);
    const map = new Map();
    snapshotRows(snapshot).forEach(row => {
      const records = kind === 'shopping' ? shoppingRowRecords(row) : tradeinRowRecords(row);
      records.forEach(record => {
        const prior = map.get(record.key);
        if (!prior) {
          map.set(record.key, record);
          return;
        }
        if (!samePrice(prior.value, record.value)) {
          const error = new Error(`同一語意 key 有不同價格：${record.key}`);
          error.code = 'DUPLICATE_CONFLICT';
          error.key = record.key;
          throw error;
        }
        prior.rowRefs = mergeRefs(prior.rowRefs, record.rowRefs);
        if (record.sourceVariants) {
          prior.sourceVariants = mergeSourceVariants(prior.sourceVariants, record.sourceVariants);
        }
      });
    });
    return map;
  }

  function outputRecord(status, before, after) {
    const source = after || before;
    const output = {
      status,
      kind:source.identity.kind,
      key:source.key,
      identity:Object.assign({}, source.identity),
      model:source.model,
      modelCapacity:source.model,
      dimension:source.dimension,
      plan:source.plan,
      condition:source.plan || source.dimension,
      provider:source.provider,
      grade:source.grade,
      before:before ? clonePrice(before.value) : null,
      after:after ? clonePrice(after.value) : null,
      rowRefs:{
        previous:before ? before.rowRefs.map(ref => Object.assign({}, ref)) : [],
        current:after ? after.rowRefs.map(ref => Object.assign({}, ref)) : [],
      },
    };
    if (source.sourceVariants) {
      output.sourceModel = source.sourceModel;
      output.sourceCode = source.sourceCode;
      output.sourceVariants = source.sourceVariants.map(variant => Object.assign({}, variant));
    }
    return output;
  }

  function normalizeDiffOptions(options) {
    const input = options && typeof options === 'object' ? options : {};
    const offset = input.offset === undefined ? 0 : input.offset;
    const limit = input.limit === undefined ? 100 : input.limit;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new Error('差異 offset 必須是非負整數');
    }
    if (limit !== Infinity && (!Number.isSafeInteger(limit) || limit < 0)) {
      throw new Error('差異 limit 必須是非負整數或 Infinity');
    }
    const search = text(input.search).toLocaleLowerCase('zh-Hant');
    return {
      offset,
      limit,
      includeUnchanged:Boolean(input.includeUnchanged),
      includeRecords:Boolean(input.includeRecords),
      search,
    };
  }

  function recordSearchText(record, before, after) {
    const identity = record.identity || {};
    return [
      record.model,
      record.model,
      record.sourceModel,
      record.sourceCode,
      record.dimension,
      record.plan,
      record.condition,
      record.provider,
      record.grade,
      identity.source_sheet,
      identity.brand,
      identity.model,
      identity.code,
      identity.plan,
      identity.condition,
      before && before.value,
      after && after.value,
      before && before.kind,
      after && after.kind,
    ].map(value => text(value).toLocaleLowerCase('zh-Hant')).join(' ');
  }

  function diffSnapshots(kind, previous, current, options) {
    if (kind !== 'shopping' && kind !== 'tradein') throw new Error('不支援的 3C 差異類型');
    const opts = normalizeDiffOptions(options);
    const previousMap = normalizeRecords(kind, previous);
    const currentMap = normalizeRecords(kind, current);
    const keys = Array.from(new Set([...previousMap.keys(), ...currentMap.keys()])).sort((left, right) => left.localeCompare(right, 'zh-Hant'));
    const records = { added:[], changed:[], unchanged:[], removed:[] };
    const countValues = { added:0, changed:0, unchanged:0, removed:0 };
    const page = [];
    let filteredChangeCount = 0;
    let candidateCount = 0;
    keys.forEach(key => {
      const before = previousMap.get(key);
      const after = currentMap.get(key);
      let status;
      if (!before) status = 'added';
      else if (!after) status = 'removed';
      else status = samePrice(before.value, after.value) ? 'unchanged' : 'changed';
      countValues[status] += 1;
      const source = after || before;
      const matches = !opts.search || recordSearchText(source, before, after).includes(opts.search);
      if (status !== 'unchanged' && matches) filteredChangeCount += 1;
      if (opts.includeRecords) records[status].push(outputRecord(status, before, after));
      const isCandidate = opts.includeUnchanged || status !== 'unchanged';
      if (!isCandidate || !matches) return;
      const candidateIndex = candidateCount;
      candidateCount += 1;
      const inPage = opts.limit === Infinity
        ? candidateIndex >= opts.offset
        : candidateIndex >= opts.offset && candidateIndex < opts.offset + opts.limit;
      if (inPage) page.push(outputRecord(status, before, after));
    });
    const counts = Object.freeze(countValues);
    const result = {
      kind,
      previousAvailable:hasSnapshot(previous),
      currentAvailable:hasSnapshot(current),
      firstRelease:!hasSnapshot(previous),
      counts,
      addedCount:counts.added,
      changedCount:counts.changed,
      unchangedCount:counts.unchanged,
      removedCount:counts.removed,
      totalChangeCount:counts.added + counts.changed + counts.removed,
      changeCount:filteredChangeCount,
      totalRecordCount:candidateCount,
      recordCount:page.length,
      offset:opts.offset,
      limit:opts.limit,
      hasMore:opts.offset + page.length < candidateCount,
      search:opts.search,
      changePage:page,
    };
    // Keep the historical property for callers that consume the object in JS,
    // while keeping default JSON small and free of duplicated record arrays.
    Object.defineProperty(result, 'changes', {
      value:page,
      enumerable:false,
      configurable:false,
    });
    if (opts.includeRecords) {
      result.records = records;
      for (const status of Object.keys(records)) {
        Object.defineProperty(result, status, {
          value:records[status],
          enumerable:false,
          configurable:false,
        });
      }
    }
    return result;
  }

  return Object.freeze({
    PROVIDERS,
    GRADES,
    canonicalPrice,
    samePrice,
    stableKey,
    shoppingRowRecords,
    tradeinRowRecords,
    normalizeRecords,
    diffSnapshots,
    diff:diffSnapshots,
    buildPriceDiff:diffSnapshots,
    compareSnapshots:diffSnapshots,
  });
});
