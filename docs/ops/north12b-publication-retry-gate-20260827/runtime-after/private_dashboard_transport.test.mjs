import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  PrivateDashboardTransportError,
  postPrivateDashboardJson,
  sanitizedResponseUrl,
  withTransientPrivateDashboardRetry,
} from './private_dashboard_transport.mjs';

const endpoint = 'https://script.google.com/macros/s/AKfycbwf_ms5rkOIg92FOZwZuHCft3JWpC7ENPUN6c6ebPb1Jd6eqKYfa_2tmrI8onDIl4Mi/exec';

function responsePath(args) {
  return args[args.indexOf('-o') + 1];
}

test('curl follows one redirect and parses one JSON response', async () => {
  let calls = 0;
  const payload = await postPrivateDashboardJson({
    endpoint,
    payload: { action: 'private_admin_snapshot_status' },
    curlRunner: async (command, args) => {
      calls += 1;
      assert.equal(command, 'curl');
      assert.ok(args.includes('-L'));
      assert.deepEqual(args.slice(args.indexOf('--connect-timeout'), args.indexOf('--connect-timeout') + 2), ['--connect-timeout', '10']);
      assert.deepEqual(args.slice(args.indexOf('--max-time'), args.indexOf('--max-time') + 2), ['--max-time', '30']);
      assert.ok(args.includes('--fail-with-body'));
      assert.ok(args.includes('--data-binary'));
      assert.equal(args.includes('-X'), false, 'redirect must become the single ContentService GET');
      assert.equal(args[args.indexOf('--data-binary') + 1].startsWith('@'), true);
      assert.ok(args.includes(endpoint));
      await fs.writeFile(responsePath(args), JSON.stringify({ status: 'ok', publishedAt: '2026-08-05T16:30:00+08:00' }));
      return {
        code: 0,
        stderr: '',
        stdout: '__PRIVATE_DASHBOARD_HTTP_STATUS__200\n__PRIVATE_DASHBOARD_FINAL_URL__https://script.googleusercontent.com/macros/echo?once\n__PRIVATE_DASHBOARD_CONTENT_TYPE__application/json; charset=utf-8\n',
      };
    },
  });

  assert.equal(calls, 1);
  assert.equal(payload.status, 'ok');
  assert.equal(payload.publishedAt, '2026-08-05T16:30:00+08:00');
});

test('HTML redirect response is blocked with HTTP diagnostics', async () => {
  let calls = 0;
  await assert.rejects(
    () => postPrivateDashboardJson({
      endpoint,
      payload: { action: 'private_publish' },
      curlRunner: async (command, args) => {
        calls += 1;
        await fs.writeFile(responsePath(args), '<!doctype html><title>找不到網頁</title>');
        return {
          code: 22,
          stderr: 'curl: (22) The requested URL returned error: 404',
          stdout: '__PRIVATE_DASHBOARD_HTTP_STATUS__404\n__PRIVATE_DASHBOARD_FINAL_URL__https://script.googleusercontent.com/macros/echo?once\n__PRIVATE_DASHBOARD_CONTENT_TYPE__text/html; charset=utf-8\n',
        };
      },
    }),
    error => {
      assert.ok(error instanceof PrivateDashboardTransportError);
      assert.equal(error.details.status, 404);
      assert.match(error.details.finalUrl, /^https:\/\/script\.googleusercontent\.com\//);
      assert.equal(error.details.contentType, 'text/html; charset=utf-8');
      assert.match(error.details.responsePreview, /找不到網頁/);
      return true;
    }
  );
  assert.equal(calls, 1);
});

test('transient 404 then 503 retries with 2s and 5s delays and succeeds', async () => {
  const delays = [];
  const logs = [];
  let calls = 0;
  const result = await withTransientPrivateDashboardRetry(async () => {
    calls += 1;
    if (calls < 3) {
      throw new PrivateDashboardTransportError('transient', {
        status: calls === 1 ? 404 : 503,
        finalUrl: 'https://example.invalid/exec?token=secret#fragment',
        contentType: 'text/html', redirected: true, exceptionType: '',
      });
    }
    return { status: 'ok' };
  }, {
    sleep: async ms => { delays.push(ms); },
    logAttempt: async record => { logs.push(record); },
    context: { reportDate: '2026-08-27', cutoff: '2026-08-26', runId: 'run-1', component: 'KPI', action: 'publish' },
  });
  assert.equal(result.status, 'ok');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [2000, 5000]);
  assert.equal(logs[0].response_url, 'https://example.invalid/exec');
  assert.equal(logs.at(-1).retry_succeeded, true);
});

test('network and timeout are transient, while auth and ordinary validation errors do not retry', async () => {
  for (const exceptionType of ['NetworkError', 'TimeoutError']) {
    let calls = 0;
    await withTransientPrivateDashboardRetry(async () => {
      calls += 1;
      if (calls === 1) throw new PrivateDashboardTransportError('temporary', { exceptionType });
      return true;
    }, { delaysMs: [0, 0], sleep: async () => {} });
    assert.equal(calls, 2);
  }
  for (const status of [400, 401, 403, 409, 422]) {
    let calls = 0;
    await assert.rejects(() => withTransientPrivateDashboardRetry(async () => {
      calls += 1;
      throw new PrivateDashboardTransportError('permanent', { status });
    }, { delaysMs: [0, 0], sleep: async () => {} }));
    assert.equal(calls, 1);
  }
  let validationCalls = 0;
  await assert.rejects(() => withTransientPrivateDashboardRetry(async () => {
    validationCalls += 1;
    throw new Error('source date mismatch');
  }, { delaysMs: [0, 0], sleep: async () => {} }), /source date mismatch/);
  assert.equal(validationCalls, 1);
});

test('response URL logging removes query and fragment', () => {
  assert.equal(sanitizedResponseUrl('https://example.invalid/exec?a=1#b'), 'https://example.invalid/exec');
});
