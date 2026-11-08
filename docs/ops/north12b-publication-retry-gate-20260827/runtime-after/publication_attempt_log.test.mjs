import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPublicationAttemptLogger, safePublicationAttemptRecord } from './publication_attempt_log.mjs';

test('publication attempt log keeps only approved non-sensitive fields', async () => {
  const record = safePublicationAttemptRecord({
    timestamp: '2026-08-27T00:00:00Z', report_date: '2026-08-27', cutoff: '2026-08-26',
    run_id: 'run-1', component: 'KPI', action: 'publish', attempt: 1, http_status: 503,
    response_url: 'https://example.invalid/exec', redirected: true, content_type: 'text/html',
    exception_type: 'PrivateDashboardTransportError', retrying: true, retry_succeeded: false,
    employeeId: 'must-not-log', adminSecret: 'must-not-log', token: 'must-not-log', body: { private: true },
  });
  assert.equal('employeeId' in record, false);
  assert.equal('adminSecret' in record, false);
  assert.equal('token' in record, false);
  assert.equal('body' in record, false);
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'publication-log-test-'));
  const file = path.join(dir, 'attempts.jsonl');
  await createPublicationAttemptLogger(file)({ ...record, bootstrapCode: 'must-not-log' });
  const stored = JSON.parse((await fs.readFile(file, 'utf8')).trim());
  assert.deepEqual(stored, record);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  await fs.rm(dir, { recursive: true, force: true });
});
