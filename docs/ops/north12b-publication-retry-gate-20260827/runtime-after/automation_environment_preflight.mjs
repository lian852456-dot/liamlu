#!/usr/bin/env node

export const EMPLOYEE_ID_PATTERN = /^[A-Z0-9]{5,12}$/;

function check(value, message) {
  return { pass: Boolean(value), ...(value ? {} : { message }) };
}

export function assessAutomationEnvironment({ env = process.env, dependencies = {} } = {}) {
  const identity = String(env.REPORT_UPLOAD_EMPLOYEE_ID || '').trim().toUpperCase();
  const identityPresent = identity.length > 0;
  const identityFormatValid = identityPresent && EMPLOYEE_ID_PATTERN.test(identity);
  const identityFromPersistentLayer = env.REPORT_UPLOAD_IDENTITY_SOURCE === 'macos-login-keychain';
  const checks = {
    upload_identity_present: check(identityPresent, 'REPORT_UPLOAD_EMPLOYEE_ID is missing'),
    upload_identity_format: check(identityFormatValid, 'REPORT_UPLOAD_EMPLOYEE_ID format is invalid'),
    upload_identity_persistent_source: check(identityFromPersistentLayer, 'upload identity is not sourced from macOS Login Keychain'),
    admin_keychain: check(dependencies.adminKeychain === true, 'publisher administrator Keychain dependency is unavailable'),
    node_runtime: check(dependencies.nodeRuntime === true, 'Node.js runtime is unavailable'),
    curl_runtime: check(dependencies.curlRuntime === true, 'curl runtime is unavailable'),
    publish_endpoints: check(dependencies.publishEndpoints === true, 'publish/readback endpoint configuration is unavailable'),
  };
  const failures = Object.entries(checks).filter(([, result]) => !result.pass).map(([name]) => name);
  return {
    schema_version: 1,
    action: 'credential-environment-preflight',
    status: failures.length ? 'BLOCKED' : 'PASS',
    failure_class: failures.length ? 'configuration' : null,
    retryable: false,
    checks,
    failures,
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const result = assessAutomationEnvironment({
    dependencies: {
      adminKeychain: process.env.AUTOMATION_PREFLIGHT_ADMIN_KEYCHAIN === '1',
      nodeRuntime: process.env.AUTOMATION_PREFLIGHT_NODE === '1',
      curlRuntime: process.env.AUTOMATION_PREFLIGHT_CURL === '1',
      publishEndpoints: process.env.AUTOMATION_PREFLIGHT_ENDPOINTS === '1',
    },
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== 'PASS') process.exitCode = 78;
}
