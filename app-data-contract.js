(function attachSupervisorContract(scope) {
  'use strict';

  const VERSION = 'liam-supervisor-app-1.2-contract-v1';
  const MODULE_KEYS = [
    'todayOperations', 'kpiSummary', 'kpiStores', 'kpiFullMetrics', 'awardSummary', 'awardStores',
    'awardTop2Models', 'personalPerformance', 'report1600', 'report2100', 'reportFailures',
    'scheduleToday', 'scheduleByDate', 'patrolToday', 'patrolOverview', 'patrolStores'
  ];
  const STATUSES = new Set(['ok', 'partial', 'no_data', 'unauthorized', 'stale', 'error']);

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

  function moduleState({ status = 'no_data', updatedAt = '', sourceUpdatedAt = '', stale = false, source, sourceLink = '', data = null, note = '' }) {
    return { status, updatedAt, sourceUpdatedAt, stale, source, sourceLink:sourceLink || (source && source.href) || '', data, note };
  }

  const api = { VERSION, MODULE_KEYS, STATUSES, validateContract, validateModule, moduleState };
  scope.LiamSupervisorContract = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
