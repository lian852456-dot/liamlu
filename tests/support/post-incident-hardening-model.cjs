'use strict';

const LEGACY_CONTRACT = Object.freeze({
  private_access: Object.freeze({ service:'private', method:'POST', auth:'approved-device', semantics:'private-summary-v1' }),
  read: Object.freeze({ service:'private', method:'POST', auth:'approved-device', semantics:'daily-report-store-v1' }),
  pread: Object.freeze({ service:'private', method:'POST', auth:'approved-device', semantics:'daily-report-person-v1' }),
  kpicalc_access: Object.freeze({ service:'private', method:'POST', auth:'approved-device', semantics:'kpi-calculation-read-v1' }),
  ptauth: Object.freeze({ service:'patrol', method:'POST', auth:'supervisor-passcode', semantics:'patrol-session-v3' }),
  sread: Object.freeze({ service:'patrol', method:'GET', auth:'patrol-session', semantics:'schedule-read-v1' }),
  ptsummary: Object.freeze({ service:'patrol', method:'POST', auth:'patrol-session', semantics:'patrol-summary-v1' }),
  ptvisit_read: Object.freeze({ service:'patrol', method:'GET', auth:'patrol-session', semantics:'patrol-visit-today-v1' }),
  hread: Object.freeze({ service:'patrol', method:'GET', auth:'patrol-session', semantics:'half-month-read-v1' })
});

const DEPLOYMENT_STATES = Object.freeze([
  'PREPARED',
  'A_BACKEND_DARK_DEPLOYED',
  'B_LEGACY_SMOKE_PASSED',
  'C_NEW_ROUTE_SMOKE_PASSED',
  'D_PAGES_DEPLOYED',
  'E_CANARY_DEVICE_PASSED',
  'F_ONE_FLAG_ENABLED',
  'G_LIAM_DEVICE_ACCEPTED',
  'RELEASED'
]);

const FEATURE_ORDER = Object.freeze([
  'managerStoreSemantics',
  'yesterdayFollowUp',
  'runtimeConfigInfrastructure',
  'autoDeviceAuth'
]);

function canonicalDeviceDecision(privateDecision, patrolDecision) {
  if (!privateDecision || privateDecision.status !== 'approved') {
    return { status:'rejected', reason:privateDecision?.reason || 'canonical_not_approved' };
  }
  if (!patrolDecision || patrolDecision.source !== 'canonical-proof') {
    throw new Error('APPROVED_DEVICE_DECISION_MISMATCH');
  }
  for (const key of ['employeeIdHash', 'deviceIdHash', 'registryVersion']) {
    if (!privateDecision[key] || privateDecision[key] !== patrolDecision[key]) {
      throw new Error('APPROVED_DEVICE_DECISION_MISMATCH');
    }
  }
  if (patrolDecision.status !== 'approved') throw new Error('APPROVED_DEVICE_DECISION_MISMATCH');
  return { status:'approved', registryVersion:privateDecision.registryVersion };
}

function assertBackwardCompatible(candidate) {
  for (const [action, baseline] of Object.entries(LEGACY_CONTRACT)) {
    if (!candidate[action]) throw new Error(`LEGACY_ACTION_MISSING:${action}`);
    for (const field of ['service', 'method', 'auth', 'semantics']) {
      if (candidate[action][field] !== baseline[field]) {
        throw new Error(`LEGACY_SEMANTICS_CHANGED:${action}:${field}`);
      }
    }
  }
  return true;
}

function healthResult(module, transport) {
  if (transport?.kind === 'timeout') return { module, status:'TIMEOUT', data:null };
  if (!transport || transport.kind !== 'response' || transport.httpStatus !== 200 || !transport.json || transport.sourceStatus !== 'ok') {
    return { module, status:'FAIL', data:null };
  }
  return { module, status:'PASS', data:transport.data };
}

function buildHealthMatrix(transports) {
  return Object.fromEntries(Object.entries(transports).map(([module, transport]) => [module, healthResult(module, transport)]));
}

function advanceDeployment(current, gatePassed) {
  const index = DEPLOYMENT_STATES.indexOf(current);
  if (index < 0) throw new Error('UNKNOWN_DEPLOYMENT_STATE');
  if (!gatePassed) return { state:current, stopped:true };
  if (index === DEPLOYMENT_STATES.length - 1) return { state:current, stopped:false };
  return { state:DEPLOYMENT_STATES[index + 1], stopped:false };
}

function enableOneFeature(flags, feature, acceptedFeatures = []) {
  if (!Object.hasOwn(flags, feature)) throw new Error('UNKNOWN_FEATURE_FLAG');
  if (flags[feature] !== false) throw new Error('FEATURE_NOT_DARK');
  const expected = FEATURE_ORDER.filter(name => Object.hasOwn(flags, name)).indexOf(feature);
  const required = FEATURE_ORDER.filter(name => Object.hasOwn(flags, name)).slice(0, expected);
  if (required.some(name => !acceptedFeatures.includes(name))) throw new Error('CANARY_ORDER_VIOLATION');
  if (Object.values(flags).some(Boolean)) throw new Error('ONE_PRODUCTION_CONCERN_ONLY');
  return { ...flags, [feature]:true };
}

module.exports = {
  LEGACY_CONTRACT,
  DEPLOYMENT_STATES,
  FEATURE_ORDER,
  canonicalDeviceDecision,
  assertBackwardCompatible,
  healthResult,
  buildHealthMatrix,
  advanceDeployment,
  enableOneFeature
};
