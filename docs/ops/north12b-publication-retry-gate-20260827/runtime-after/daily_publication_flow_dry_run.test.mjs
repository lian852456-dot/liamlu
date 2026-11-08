import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PrivateDashboardTransportError,
  withTransientPrivateDashboardRetry,
} from './private_dashboard_transport.mjs';
import { evaluateDailyPublicationGate, planPublicationResume } from './daily_publication_completion_gate.mjs';

async function simulateComponent({ component, transientStatuses = [], businessError = null }) {
  const events = ['source', 'build', 'send-gate'];
  const verified = { reportDate: '2026-08-28', cutoff: '2026-08-27', runId: 'fixture-run', sha256: 'fixture-hash' };
  const resume = planPublicationResume({
    component,
    state: { source: true, build: true, mail: true, publish: false, websiteReadback: false, appReadback: false },
    artifact: verified,
    expected: verified,
  });
  assert.deepEqual(resume.actions, ['publish', 'website-readback', 'app-readback']);
  assert.ok(resume.forbiddenActions.includes('send-mail'));
  let attempt = 0;
  await withTransientPrivateDashboardRetry(async () => {
    attempt += 1;
    events.push(`publish-attempt-${attempt}`);
    const status = transientStatuses[attempt - 1];
    if (status) throw new PrivateDashboardTransportError('fixture transient', { status });
    return { status: 'ok' };
  }, { sleep: async ms => events.push(`wait-${ms}`) });
  events.push('publish-gate', 'website-readback', 'app-readback');
  if (businessError) throw new Error(businessError);
  return { state: { source: true, build: true, mail: true, publish: true, websiteReadback: true, appReadback: true }, events };
}

test('simulated 8/28 formal flow recovers bounded 404 and 503 without sending mail', async () => {
  const KPI = await simulateComponent({ component: 'KPI', transientStatuses: [404, 503] });
  const awards = await simulateComponent({ component: 'awards', transientStatuses: [502] });
  const gate = evaluateDailyPublicationGate({ KPI: KPI.state, awards: awards.state });
  assert.equal(gate.result, 'PASS');
  assert.deepEqual(KPI.events.filter(value => value.startsWith('wait-')), ['wait-2000', 'wait-5000']);
  assert.equal(KPI.events.includes('send-mail'), false);
  assert.equal(awards.events.includes('send-mail'), false);
});

test('simulated real data errors remain fail-closed and are never transport-retried', async () => {
  let calls = 0;
  await assert.rejects(() => withTransientPrivateDashboardRetry(async () => {
    calls += 1;
    throw new Error('source date mismatch');
  }, { sleep: async () => {} }), /source date mismatch/);
  assert.equal(calls, 1);
  assert.throws(() => planPublicationResume({
    component: 'KPI',
    state: { source: true, build: true, mail: true },
    artifact: { reportDate: '2026-08-28', cutoff: '2026-08-26', runId: 'fixture-run', sha256: 'bad' },
    expected: { reportDate: '2026-08-28', cutoff: '2026-08-27', runId: 'fixture-run', sha256: 'good' },
  }), /cutoff mismatch/);
});
