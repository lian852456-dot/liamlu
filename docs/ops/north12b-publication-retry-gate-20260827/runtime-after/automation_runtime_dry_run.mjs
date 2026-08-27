#!/usr/bin/env node

import { assessAutomationEnvironment } from './automation_environment_preflight.mjs';

export async function runAutomationRuntimeDryRun({ env = process.env, dependencies = {}, phases = {} } = {}) {
  const counts = { source: 0, build: 0, send_gate: 0, publish: 0, readback: 0 };
  const events = [];
  const preflight = assessAutomationEnvironment({ env, dependencies });
  events.push(`env-preflight:${preflight.status}`);
  if (preflight.status !== 'PASS') {
    return {
      schema_version: 1,
      mode: 'fixture-dry-run-no-production-writes',
      status: 'BLOCKED',
      failure_class: 'configuration',
      retryable: false,
      preflight,
      invocation_counts: counts,
      events,
    };
  }

  for (const [name, event] of [
    ['source', 'source:PASS'],
    ['build', 'build:PASS'],
    ['send_gate', 'send-gate:PASS-no-mail'],
    ['publish', 'publish-function:INVOKED-no-production-write'],
    ['readback', 'readback-gate:PASS-fixture'],
  ]) {
    counts[name] += 1;
    if (typeof phases[name] === 'function') await phases[name]();
    events.push(event);
  }
  return {
    schema_version: 1,
    mode: 'fixture-dry-run-no-production-writes',
    status: 'PASS',
    preflight,
    invocation_counts: counts,
    events,
  };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const result = await runAutomationRuntimeDryRun({
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
