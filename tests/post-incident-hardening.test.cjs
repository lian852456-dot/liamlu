'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const {
  LEGACY_CONTRACT,
  DEPLOYMENT_STATES,
  FEATURE_ORDER,
  canonicalDeviceDecision,
  assertBackwardCompatible,
  buildHealthMatrix,
  advanceDeployment,
  enableOneFeature
} = require('./support/post-incident-hardening-model.cjs');

const manifest = JSON.parse(fs.readFileSync('docs/contracts/production-release-manifest-20260813.json', 'utf8'));
const policy = JSON.parse(fs.readFileSync('docs/contracts/post-incident-hardening-v1.json', 'utf8'));
const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('app.html', 'utf8');
const sw = fs.readFileSync('service-worker.js', 'utf8');

test('immutable recovery manifest pins every production layer as one release', () => {
  assert.equal(manifest.immutable, true);
  assert.equal(manifest.web.commit, '6f2b42d9c91ff9c6c573e6767525f93105b6a059');
  assert.equal(manifest.web.semanticBaseline, '94070e0becd289287dae76fb461d719a898cb8d5');
  assert.equal(manifest.privateGas.version, 29);
  assert.equal(manifest.patrolGas.version, 53);
  assert.equal(manifest.native.commit, '4777746cd0daa9808eccf4260d8b161dfe53e7ac');
  assert.equal(manifest.runtimeConfig.enabled, false);
  assert.equal(manifest.web.assetQuery, 'emergency-rollback-20260813-1');
  assert.equal(manifest.web.serviceWorkerCache, 'liam-supervisor-app-1-2-emergency-rollback-20260813-v1');
  assert.ok(Object.values(manifest.featureFlags).every(value => value === false));
  assert.deepEqual(manifest.writes, { hwrite:false, halfMediaUpload:false });
});

test('recovery production assets still match the pinned manifest', () => {
  assert.match(html, new RegExp(`app\\.js\\?v=${manifest.web.assetQuery}`));
  assert.match(sw, new RegExp(manifest.web.serviceWorkerCache));
  assert.doesNotMatch(app, /app-runtime-config\.json|ptauth_device|private_patrol_assertion/);
  assert.doesNotMatch(app, /half_media_upload|patrolRead\(['"]hwrite/);
});

test('Private approved but Patrol not backed by the same canonical proof must fail', () => {
  const privateDecision = {
    status:'approved', employeeIdHash:'employee-A', deviceIdHash:'device-A', registryVersion:'r1'
  };
  assert.throws(
    () => canonicalDeviceDecision(privateDecision, { status:'rejected', source:'patrol-local-registry' }),
    /APPROVED_DEVICE_DECISION_MISMATCH/
  );
  assert.throws(
    () => canonicalDeviceDecision(privateDecision, {
      status:'approved', source:'canonical-proof', employeeIdHash:'employee-A', deviceIdHash:'device-B', registryVersion:'r1'
    }),
    /APPROVED_DEVICE_DECISION_MISMATCH/
  );
});

test('matching canonical device proof is the only design path that can mint Patrol approval', () => {
  const decision = {
    status:'approved', employeeIdHash:'employee-A', deviceIdHash:'device-A', registryVersion:'r1'
  };
  assert.deepEqual(canonicalDeviceDecision(decision, { ...decision, source:'canonical-proof' }), {
    status:'approved', registryVersion:'r1'
  });
  assert.deepEqual(canonicalDeviceDecision({ status:'rejected', reason:'revoked' }, null), {
    status:'rejected', reason:'revoked'
  });
});

test('backend candidates may add routes but may not remove or mutate legacy action semantics', () => {
  const additiveCandidate = { ...LEGACY_CONTRACT, new_read_only_route:{ service:'patrol', method:'POST', auth:'patrol-session', semantics:'candidate-v1' } };
  assert.equal(assertBackwardCompatible(additiveCandidate), true);

  const missing = { ...LEGACY_CONTRACT };
  delete missing.hread;
  assert.throws(() => assertBackwardCompatible(missing), /LEGACY_ACTION_MISSING:hread/);

  const changed = { ...LEGACY_CONTRACT, private_access:{ ...LEGACY_CONTRACT.private_access, auth:'client-approved-claim' } };
  assert.throws(() => assertBackwardCompatible(changed), /LEGACY_SEMANTICS_CHANGED:private_access:auth/);
});

test('per-module health never maps transport errors to zero-shaped formal data', () => {
  const matrix = buildHealthMatrix({
    kpiSnapshot:{ kind:'response', httpStatus:200, json:true, sourceStatus:'ok', data:{ stores:9 } },
    awardSnapshot:{ kind:'response', httpStatus:404, json:false },
    dailyReport:{ kind:'timeout' },
    schedule:{ kind:'response', httpStatus:200, json:true, sourceStatus:'ok', data:{ stores:9 } }
  });
  assert.deepEqual(matrix.kpiSnapshot, { module:'kpiSnapshot', status:'PASS', data:{ stores:9 } });
  assert.deepEqual(matrix.awardSnapshot, { module:'awardSnapshot', status:'FAIL', data:null });
  assert.deepEqual(matrix.dailyReport, { module:'dailyReport', status:'TIMEOUT', data:null });
  assert.deepEqual(matrix.schedule, { module:'schedule', status:'PASS', data:{ stores:9 } });
});

test('deployment state machine stops at the first failed gate', () => {
  let state = 'PREPARED';
  for (const expected of DEPLOYMENT_STATES.slice(1, 4)) {
    const result = advanceDeployment(state, true);
    state = result.state;
    assert.equal(state, expected);
  }
  const stopped = advanceDeployment(state, false);
  assert.deepEqual(stopped, { state:'C_NEW_ROUTE_SMOKE_PASSED', stopped:true });
});

test('only one dark feature can be enabled and canary order is enforced', () => {
  const flags = {
    managerStoreSemantics:false,
    yesterdayFollowUp:false,
    autoDeviceAuth:false
  };
  assert.deepEqual(enableOneFeature(flags, 'managerStoreSemantics'), { ...flags, managerStoreSemantics:true });
  assert.throws(() => enableOneFeature(flags, 'yesterdayFollowUp'), /CANARY_ORDER_VIOLATION/);
  assert.deepEqual(
    enableOneFeature(flags, 'yesterdayFollowUp', ['managerStoreSemantics']),
    { ...flags, yesterdayFollowUp:true }
  );
  assert.throws(
    () => enableOneFeature({ ...flags, managerStoreSemantics:true }, 'yesterdayFollowUp', ['managerStoreSemantics']),
    /ONE_PRODUCTION_CONCERN_ONLY/
  );
});

test('machine-readable policy contains complete smoke and canary matrices', () => {
  assert.equal(policy.approvedDevice.canonicalFunction, 'isApprovedDevice(employeeId, deviceId)');
  assert.equal(policy.approvedDevice.failClosed, true);
  assert.deepEqual(policy.legacyActions.private.sort(), ['kpicalc_access','pread','private_access','read'].sort());
  assert.deepEqual(policy.legacyActions.patrol.sort(), ['hread','ptauth','ptsummary','ptvisit_read','sread'].sort());
  assert.deepEqual(policy.legacyProductionSurfaces, [
    'kpiWebsite','awardWebsite','dailyReportWebsite','patrolWebsite','scheduleWebsite','ptvisit','halfMonthRead'
  ]);
  assert.deepEqual(policy.deploymentStates, DEPLOYMENT_STATES);
  assert.deepEqual(policy.canaryOrder, FEATURE_ORDER);
  assert.deepEqual(policy.healthModules, [
    'privateApi','kpiSnapshot','awardSnapshot','dailyReport','schedule','patrolSummary','ptvisit','halfMonthRead'
  ]);
});
