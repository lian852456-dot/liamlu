import assert from 'node:assert/strict';
import test from 'node:test';
import { assessAutomationEnvironment } from './automation_environment_preflight.mjs';
import { runAutomationRuntimeDryRun } from './automation_runtime_dry_run.mjs';

const credentialFixture = 'A12B345';
const dependencies = {
  adminKeychain: true,
  nodeRuntime: true,
  curlRuntime: true,
  publishEndpoints: true,
};

test('persistent identity preflight passes without exposing the identity', () => {
  const result = assessAutomationEnvironment({
    env: {
      REPORT_UPLOAD_EMPLOYEE_ID: credentialFixture,
      REPORT_UPLOAD_IDENTITY_SOURCE: 'macos-login-keychain',
    },
    dependencies,
  });
  assert.equal(result.status, 'PASS');
  assert.equal(result.retryable, false);
  assert.equal(JSON.stringify(result).includes(credentialFixture), false);
  assert.equal(JSON.stringify(result).includes('employee_id'), false);
});

test('missing identity is blocked before source, build, mail, publish, and readback', async () => {
  const result = await runAutomationRuntimeDryRun({ env: {}, dependencies });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.failure_class, 'configuration');
  assert.equal(result.retryable, false);
  assert.deepEqual(result.invocation_counts, {
    source: 0,
    build: 0,
    send_gate: 0,
    publish: 0,
    readback: 0,
  });
});

test('valid persistent identity invokes every fixture gate exactly once', async () => {
  const result = await runAutomationRuntimeDryRun({
    env: {
      REPORT_UPLOAD_EMPLOYEE_ID: credentialFixture,
      REPORT_UPLOAD_IDENTITY_SOURCE: 'macos-login-keychain',
    },
    dependencies,
  });
  assert.equal(result.status, 'PASS');
  assert.deepEqual(result.invocation_counts, {
    source: 1,
    build: 1,
    send_gate: 1,
    publish: 1,
    readback: 1,
  });
  assert.equal(result.events.includes('publish-function:INVOKED-no-production-write'), true);
  assert.equal(JSON.stringify(result).includes(credentialFixture), false);
});

test('invalid identity format is a non-retryable configuration failure', () => {
  const result = assessAutomationEnvironment({
    env: {
      REPORT_UPLOAD_EMPLOYEE_ID: 'bad value',
      REPORT_UPLOAD_IDENTITY_SOURCE: 'macos-login-keychain',
    },
    dependencies,
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.failure_class, 'configuration');
  assert.equal(result.retryable, false);
  assert.equal(result.checks.upload_identity_format.pass, false);
});
