import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDailyPublicationGate, planPublicationResume } from './daily_publication_completion_gate.mjs';

const pass = { source: true, build: true, mail: 'verified', publish: true, websiteReadback: 'PASS', appReadback: 'PASS' };

test('KPI PASS remains independent when awards is blocked', () => {
  const result = evaluateDailyPublicationGate({ KPI: pass, awards: { ...pass, publish: false } });
  assert.equal(result.result, 'BLOCKED');
  assert.equal(result.kpiIndependentPass, true);
  assert.equal(result.awardsIndependentPass, false);
  assert.equal(result.components.awards.firstFailed, 'publish');
});

test('resume after verified mail plans only unfinished publish and readbacks', () => {
  const expected = { reportDate: '2026-08-27', cutoff: '2026-08-26', runId: 'run-1', sha256: 'abc' };
  const result = planPublicationResume({
    component: 'KPI',
    state: { source: true, build: true, mail: 'verified', publish: false, websiteReadback: false, appReadback: false },
    artifact: expected,
    expected,
  });
  assert.deepEqual(result.actions, ['publish', 'website-readback', 'app-readback']);
  assert.ok(result.forbiddenActions.includes('send-mail'));
});

test('resume fails closed on hash mismatch or unverified mail', () => {
  assert.throws(() => planPublicationResume({
    component: 'awards',
    state: { source: true, build: true, mail: true },
    artifact: { sha256: 'bad' }, expected: { sha256: 'good' },
  }), /sha256 mismatch/);
  assert.throws(() => planPublicationResume({
    component: 'KPI', state: { source: true, build: true, mail: false }, artifact: {}, expected: {},
  }), /mail verification/);
});
