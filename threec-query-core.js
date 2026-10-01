(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ThreecQueryCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // These are the identities already used by the private KPI/awards pages.
  // Price snapshots deliberately have no storage key: they live only in the
  // current page and are fetched again after a reload.
  const STORAGE_KEYS = Object.freeze({
    employee: 'north12b_private_dashboard_employee_id',
    device: 'north12b_private_dashboard_device_id',
  });
  const PROVIDERS = Object.freeze(['點子行動', 'FutureDial（FDI）', '愛鋒派']);
  const GRADES = Object.freeze(['S', 'A', 'B', 'C']);
  const UNGRADED = '未分級';
  function providerGrades(provider){return provider==='愛鋒派'?GRADES.concat(UNGRADED):GRADES.slice();}
  function providersForRow(row){return PROVIDERS.filter(provider=>row.quotes&&Object.prototype.hasOwnProperty.call(row.quotes,provider));}
  function gradeLabel(grade){return grade===UNGRADED?'來源未分級':grade+' 級';}

  function text(value) {
    return value == null ? '' : String(value).trim();
  }

  function rowList(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return [];
    if (Array.isArray(snapshot.rows)) return snapshot.rows;
    if (snapshot.data && Array.isArray(snapshot.data.rows)) return snapshot.data.rows;
    return [];
  }

  function sourceMeta(snapshot, registry, kind) {
    const slot = registry && registry.kinds && registry.kinds[kind]
      ? registry.kinds[kind]
      : registry && registry[kind] ? registry[kind] : null;
    const active = slot && slot.active ? slot.active : null;
    const source = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const snapshotHash = text(source.snapshot_hash || (active && active.snapshot_hash));
    return {
      kind,
      sourceVersionDate: text(source.source_version_date || (active && active.source_version_date)),
      sourceFileName: text(source.source_file_name || (active && active.source_file_name)),
      sourceFileSha256: text(source.source_file_sha256 || (active && active.source_file_sha256)),
      snapshotHash,
      publishedAt: text(source.published_at || (active && active.published_at)),
      parserVersion: text(source.parser_version),
      rowCount: Number(source.row_count != null ? source.row_count : (active && active.row_count) || rowList(source).length),
      sourceRowCount: Number(source.source_row_count != null ? source.source_row_count : (active && active.source_row_count) || 0),
      queryModelCount: Number(source.query_model_count != null ? source.query_model_count : (active && active.query_model_count) || 0),
      excludedNoPriceCount: Number(source.excluded_no_price_count != null ? source.excluded_no_price_count : (active && active.excluded_no_price_count) || 0),
      quoteConflictCount: Number(source.quote_conflict_count != null ? source.quote_conflict_count : (active && active.quote_conflict_count) || 0),
      // The immutable snapshot hash is the formal query version. Source date
      // stays a separate field because two same-date sources can differ.
      version: snapshotHash || text(source.version || source.version_id || (active && (active.version || active.version_id))),
    };
  }

  function numericValue(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const raw = text(value);
    if (!raw || !/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(raw)) return null;
    const number = Number(raw.replace(/,/g, ''));
    return Number.isFinite(number) ? number : null;
  }

  function priceState(value) {
    const missing = value == null || text(value) === '';
    if (missing) return { missing: true, zero: false, value: null, text: '無報價（缺價）' };
    const number = numericValue(value);
    const zero = number === 0;
    return {
      missing: false,
      zero,
      value,
      text: number == null ? text(value) : number.toLocaleString('en-US'),
    };
  }

  function formatPrice(value, suffix) {
    const state = priceState(value);
    if (state.missing) return '無報價（缺價）';
    return `${state.text}${suffix || ' 元'}`;
  }

  function colorlessModel(row) {
    return text(row && (row.colorless_model || row.colorlessModel || row.model));
  }

  function shoppingRow(row) {
    const sourceSheet = text(row && (row.source_sheet || row.sourceSheet));
    const brand = text(row && row.brand);
    const model = text(row && (row.model || row.source_model));
    const colorless = colorlessModel(row);
    const projectPrices = row && row.project_prices && typeof row.project_prices === 'object'
      ? row.project_prices : (row && row.projectPrices && typeof row.projectPrices === 'object' ? row.projectPrices : {});
    const prices = Object.fromEntries(Object.keys(projectPrices).map(name => [text(name), projectPrices[name]]));
    const retailPrice = row && (row.retail_price !== undefined ? row.retail_price : row.retailPrice);
    return {
      sourceSheet,
      sourceRowNumber: row && (row.source_row_number || row.sourceRowNumber),
      brand,
      code: text(row && row.code),
      model,
      colorlessModel: colorless,
      retailPrice,
      projectPrices: Object.keys(projectPrices).map(name => ({ name: text(name), value: projectPrices[name] })),
      prices,
      priceMatrix: { retailPrice, projectPrices: prices },
      raw: row,
    };
  }

  function shoppingGroups(snapshot) {
    const groups = new Map();
    rowList(snapshot).forEach((raw, index) => {
      const row = shoppingRow(raw);
      const key = [row.sourceSheet, row.brand, row.colorlessModel].join('\u0001');
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          sourceSheet: row.sourceSheet,
          brand: row.brand,
          colorlessModel: row.colorlessModel,
          rows: [],
          sourceIndex: index,
        });
      }
      groups.get(key).rows.push(row);
    });
    return Array.from(groups.values()).map(group => {
      const seen = new Set();
      group.rows = group.rows.filter(row => {
        const signature = JSON.stringify({
          retail: numericValue(row.retailPrice) == null ? text(row.retailPrice) : String(numericValue(row.retailPrice)),
          projects: Object.keys(row.prices).sort().map(name => [name, numericValue(row.prices[name]) == null ? text(row.prices[name]) : String(numericValue(row.prices[name]))]),
        });
        if (seen.has(signature)) return false;
        seen.add(signature);
        return true;
      });
      return group;
    });
  }

  function groupSearchText(group) {
    return [group.sourceSheet, group.brand, group.colorlessModel]
      .concat(group.rows.flatMap(row => [row.model, row.code, row.retailPrice].concat(row.projectPrices.flatMap(price => [price.name, price.value]))))
      .join(' ')
      .toLocaleLowerCase();
  }

  function filterShopping(snapshot, filters) {
    const query = text(filters && filters.query).toLocaleLowerCase();
    const selected = text(filters && filters.modelKey);
    return shoppingGroups(snapshot).filter(group => (!selected || group.key === selected) && (!query || groupSearchText(group).includes(query)));
  }

  function tradeinRow(row) {
    const quotes = row && row.quotes && typeof row.quotes === 'object' ? row.quotes : {};
    const normalizedQuotes = {};
    PROVIDERS.forEach(provider => {
      if(!Object.prototype.hasOwnProperty.call(quotes,provider))return;
      const values = quotes[provider] && typeof quotes[provider] === 'object' ? quotes[provider] : {};
      normalizedQuotes[provider] = {};
      providerGrades(provider).forEach(grade => { normalizedQuotes[provider][grade] = values[grade]; });
    });
    return {
      sourceSheet: text(row && (row.source_sheet || row.sourceSheet)),
      brand: text(row && row.brand),
      model: text(row && (row.model || row.source_model)),
      colorlessModel: colorlessModel(row),
      quotes: normalizedQuotes,
      prices: normalizedQuotes,
      raw: row,
    };
  }

  function filterTradein(snapshot, filters) {
    const query = text(filters && filters.query).toLocaleLowerCase();
    const provider=text(filters&&filters.provider),grade=text(filters&&filters.grade);
    return rowList(snapshot).map(tradeinRow).filter(row => (!query || [row.sourceSheet, row.brand, row.model, row.colorlessModel].join(' ').toLocaleLowerCase().includes(query)) && (!provider||Object.values(row.quotes[provider]||{}).some(value=>!priceState(value).missing)) && (!grade||(provider?[provider]:providersForRow(row)).some(vendor=>row.quotes[vendor]&&Object.prototype.hasOwnProperty.call(row.quotes[vendor],grade)&&!priceState(row.quotes[vendor][grade]).missing)));
  }

  function modelOptions(snapshot, kind) {
    if (kind === 'shopping') {
      return shoppingGroups(snapshot).map(group => ({ value: group.key, label: [group.sourceSheet, group.brand, group.colorlessModel].filter(Boolean).join(' · ') || '未命名機款' }));
    }
    const seen = new Set();
    return rowList(snapshot).map(tradeinRow).filter(row => {
      const key = [row.brand, row.colorlessModel || row.model].join('\u0001');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(row => ({ value: [row.brand, row.colorlessModel || row.model].join('\u0001'), label: [row.sourceSheet, row.brand, row.colorlessModel || row.model].filter(Boolean).join(' · ') || '未命名機款' }));
  }

  function filterTradeinByModel(snapshot, filters) {
    const modelKey = text(filters && filters.modelKey);
    const rows = filterTradein(snapshot, filters);
    if (!modelKey) return rows;
    return rows.filter(row => [row.brand, row.colorlessModel || row.model].join('\u0001') === modelKey);
  }

  function buildView(kind, response, filters) {
    const value = response || {};
    const snapshot = value.snapshot || {};
    const registry = value.registry || {};
    const meta = sourceMeta(snapshot, registry, kind);
    const allRows = kind === 'shopping'
      ? filterShopping(snapshot, filters)
      : filterTradeinByModel(snapshot, filters);
    const modelKey = text(filters && filters.modelKey);
    const displayLimit = kind === 'shopping' ? 20 : 50;
    const limited = !modelKey && allRows.length > displayLimit;
    return {
      kind, snapshot, registry, meta,
      available: Boolean(value.snapshot && typeof value.snapshot === 'object'),
      rows: limited ? allRows.slice(0, displayLimit) : allRows,
      totalRows: allRows.length,
      displayLimit,
      limited,
      modelOptions: modelOptions(snapshot, kind),
    };
  }

  function prices(row, kind) {
    return kind === 'tradein' ? tradeinRow(row).prices : shoppingRow(row).priceMatrix;
  }

  return Object.freeze({
    STORAGE_KEYS,
    PROVIDERS,
    GRADES, UNGRADED, providerGrades, providersForRow, gradeLabel,
    rowList,
    sourceMeta,
    priceState,
    formatPrice,
    shoppingRow,
    shoppingGroups,
    filterShopping,
    tradeinRow,
    filterTradein,
    filterTradeinByModel,
    modelOptions,
    buildView,
    prices,
  });
});
