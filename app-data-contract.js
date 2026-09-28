(function attachSupervisorContract(scope) {
  'use strict';

  const VERSION = 'liam-supervisor-app-1.2-contract-v1';
  const MODULE_KEYS = [
    'todayOperations', 'kpiSummary', 'kpiStores', 'kpiFullMetrics', 'awardSummary', 'awardStores',
    'awardTop2Models', 'personalPerformance', 'report1600', 'report2100', 'reportFailures',
    'scheduleToday', 'scheduleByDate', 'patrolToday', 'patrolOverview', 'patrolStores'
  ];
  const STATUSES = new Set(['ok', 'partial', 'no_data', 'unauthorized', 'stale', 'error']);
  const REPORT_FEEDBACK_FIELDS = ['reason','consult','method','plan'];
  const KPI_COMPLETENESS_WARNING = '正式 kpicalc 未完整提供 9 店 × 25 項 rate';
  const KPI_REGION_OPTIONAL_RATE_KEYS = new Set(['解約後NP OUT(督導績)']);
  let pendingKpiCompletenessStates = [];

  function assert(condition, message) {
    if (!condition) throw new Error(`App 1.2 contract: ${message}`);
  }

  function validateSource(source, key) {
    assert(source && typeof source === 'object', `${key}.source is required`);
    assert(typeof source.label === 'string' && source.label.trim(), `${key}.source.label is required`);
    assert(typeof source.href === 'string' && source.href.trim(), `${key}.source.href is required`);
  }

  function validateModule(module, key) {
    assert(module && typeof module === 'object', `${key} is required`);
    assert(STATUSES.has(module.status), `${key}.status is invalid`);
    assert(typeof module.updatedAt === 'string', `${key}.updatedAt must be a string`);
    assert(typeof module.sourceUpdatedAt === 'string', `${key}.sourceUpdatedAt must be a string`);
    assert(typeof module.stale === 'boolean', `${key}.stale must be a boolean`);
    validateSource(module.source, key);
    assert(typeof module.sourceLink === 'string' && module.sourceLink.trim(), `${key}.sourceLink is required`);
    assert(Object.prototype.hasOwnProperty.call(module, 'data'), `${key}.data is required`);
    if ((key === 'report1600' || key === 'report2100') && module.data && Array.isArray(module.data.stores)) {
      module.data.stores.forEach((store,index) => {
        assert(store.storeFeedback && typeof store.storeFeedback === 'object', `${key}.data.stores[${index}].storeFeedback is required`);
        REPORT_FEEDBACK_FIELDS.forEach(field => assert(typeof store.storeFeedback[field] === 'string', `${key}.data.stores[${index}].storeFeedback.${field} must be a string`));
      });
    }
    return module;
  }

  function validateContract(contract) {
    assert(contract && typeof contract === 'object', 'contract is required');
    assert(contract.version === VERSION, `version must be ${VERSION}`);
    assert(typeof contract.generatedAt === 'string' && contract.generatedAt, 'generatedAt is required');
    assert(contract.mode === 'preview' || contract.mode === 'formal', 'mode must be preview or formal');
    MODULE_KEYS.forEach(key => validateModule(contract[key], key));
    return contract;
  }

  function knownKpiAggregateGapIsBenign(data) {
    if (!data || !Array.isArray(data.region) || !data.stores || typeof data.stores !== 'object') return false;
    if (data.region.length !== 25) return false;
    const storeLists = Object.values(data.stores);
    if (storeLists.length !== 9 || storeLists.some(items => !Array.isArray(items) || items.length !== 25)) return false;
    const missing = data.region.filter(metric => !metric || metric.rate == null).map(metric => String(metric && metric.key || ''));
    return missing.length > 0 && missing.every(key => KPI_REGION_OPTIONAL_RATE_KEYS.has(key));
  }

  function normalizePendingKpiCompletenessStates(proofData) {
    if (!knownKpiAggregateGapIsBenign(proofData)) return;
    pendingKpiCompletenessStates.forEach(state => {
      state.note = '';
      if (Array.isArray(state.data)) {
        state.status = state.data.length === 9 ? 'ok' : state.status;
        return;
      }
      if (state.data && Array.isArray(state.data.region) && state.data.stores) {
        state.status = 'ok';
        return;
      }
      if (state.data && Array.isArray(state.data.fullKpis) && state.data.kpi != null && state.data.companyRank != null) {
        state.status = 'ok';
      }
    });
    pendingKpiCompletenessStates = [];
  }

  function moduleState({ status = 'no_data', updatedAt = '', sourceUpdatedAt = '', stale = false, source, sourceLink = '', data = null, note = '' }) {
    const state = { status, updatedAt, sourceUpdatedAt, stale, source, sourceLink:sourceLink || (source && source.href) || '', data, note };
    if (note === KPI_COMPLETENESS_WARNING) {
      if (data && Array.isArray(data.fullKpis) && !Array.isArray(data.region)) pendingKpiCompletenessStates = [];
      pendingKpiCompletenessStates.push(state);
      normalizePendingKpiCompletenessStates(data);
    } else if (pendingKpiCompletenessStates.length && status === 'error') {
      pendingKpiCompletenessStates = [];
    }
    return state;
  }

  const api = { VERSION, MODULE_KEYS, STATUSES, REPORT_FEEDBACK_FIELDS, validateContract, validateModule, moduleState };
  scope.LiamSupervisorContract = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
