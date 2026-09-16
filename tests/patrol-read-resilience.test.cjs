'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const patrol = fs.readFileSync(path.join(__dirname, '..', 'patrol.html'), 'utf8');

function extractFunction(source, name) {
  const asyncMarker = `async function ${name}`;
  const plainMarker = `function ${name}`;
  const asyncStart = source.indexOf(asyncMarker);
  const marker = asyncStart >= 0 ? asyncMarker : plainMarker;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} is present`);
  let parenDepth = 0;
  let quote = '';
  let escaped = false;
  let brace = -1;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '(') parenDepth += 1;
    else if (character === ')') parenDepth -= 1;
    else if (character === '{' && parenDepth === 0) {
      brace = index;
      break;
    }
  }
  assert.ok(brace > start, `${name} has a body`);
  let depth = 0;
  quote = '';
  escaped = false;
  for (let index = brace; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = '';
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      quote = character;
      continue;
    }
    if (character === '{') depth += 1;
    if (character === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} body is unterminated`);
}

const readStart = patrol.indexOf('const PATROL_READ_ACTIONS =');
const readEnd = patrol.indexOf('function patrolReauthFailure', readStart);
assert.ok(readStart >= 0 && readEnd > readStart, 'patrolReadRequest source is present');
const readTransportSource = patrol.slice(readStart, readEnd);

const writeStart = patrol.indexOf('function cloudWrite(details){');
const writeEnd = patrol.indexOf('\nfunction setCloudStatus', writeStart);
assert.ok(writeStart >= 0 && writeEnd > writeStart, 'cloudWrite source is present');
const writeSource = patrol.slice(writeStart, writeEnd);

const READ_ACTIONS = [
  'ping', 'pthealth', 'ptsummary', 'ptdetail', 'ptmileage', 'ptmileage2',
  'sread', 'hread', 'ptdashboard'
];
const RETRY_STATUSES = [404, 429, 500, 502, 503, 504];
const RETRY_DELAYS = [2000, 5000];

function response(status, payload, options = {}) {
  const body = options.rawBody === undefined ? JSON.stringify(payload) : options.rawBody;
  const contentType = options.contentType || 'application/json; charset=utf-8';
  return {
    status,
    ok: status >= 200 && status < 300,
    redirected: options.redirected === undefined ? true : options.redirected,
    url: options.url || `https://script.google.com/macros/s/test/exec?action=ptsummary&token=TOKEN_CANARY#HASH_CANARY`,
    headers: { get: name => String(name).toLowerCase() === 'content-type' ? contentType : null },
    text: async () => body
  };
}

function namedError(name, message = `${name} CANARY`) {
  const error = new Error(message);
  error.name = name;
  return error;
}

function harness(outcomes) {
  let clock = 0;
  let nextTimerId = 0;
  const calls = [];
  const logs = [];
  const timers = [];
  const clearedTimers = [];
  const queue = [...outcomes];
  const cachedSummaryKey = 'bei12b_patrol_summary_v2:sep25-v-only-two-visits-7d-v1:2026-09';
  const sessionValues = new Map([[cachedSummaryKey, JSON.stringify({
    month: '2026-09', contract: 'sep25-v-only-two-visits-7d-v1', updatedAt: '2026-09-15T09:00:00+08:00',
    totalStores: 9, visitedStores: 4, fullyDoneStores: 1
  })]]);
  const sessionStorage = {
    removeCalls: [],
    setCalls: [],
    getItem: key => sessionValues.get(key) || null,
    setItem: (key, value) => { sessionStorage.setCalls.push(key); sessionValues.set(key, String(value)); },
    removeItem: key => { sessionStorage.removeCalls.push(key); sessionValues.delete(key); }
  };

  class FakeAbortController {
    constructor() { this.signal = {aborted: false}; }
    abort() { this.signal.aborted = true; }
  }

  const context = vm.createContext({
    AbortController: FakeAbortController,
    Date,
    JSON,
    URL,
    Promise,
    PT_TOKEN: 'SESSION_CANARY',
    sessionStorage,
    performance: {now: () => ++clock},
    patrolAuthReason: value => String(value?.reason || value?.auth?.reason || value?.authReason || ''),
    setTimeout: (callback, delay) => {
      const timer = {id: ++nextTimerId, callback, delay, cleared: false};
      timers.push(timer);
      // Retry sleeps are virtualized; request timeout timers never fire in these tests.
      if (RETRY_DELAYS.includes(delay)) Promise.resolve().then(callback);
      return timer;
    },
    clearTimeout: timer => {
      if (timer) timer.cleared = true;
      clearedTimers.push(timer);
    },
    console: {info: (...args) => logs.push(args[1] === undefined ? args[0] : args[1])},
    fetch: async (url, options) => {
      calls.push({url: String(url), options});
      assert.ok(queue.length > 0, 'unexpected extra request');
      const outcome = queue.shift();
      if (outcome instanceof Error) throw outcome;
      return outcome;
    }
  });

  vm.runInContext(readTransportSource, context);
  return {
    context,
    calls,
    logs,
    sessionStorage,
    cachedSummaryKey,
    timers,
    clearedTimers,
    retryDelays: () => timers.filter(timer => RETRY_DELAYS.includes(timer.delay)).map(timer => timer.delay)
  };
}

test('every allowlisted read action retries each transient HTTP status once and stops on success', async () => {
  for (const action of READ_ACTIONS) {
    for (const status of RETRY_STATUSES) {
      const env = harness([
        response(status, {status: 'error', message: `temporary ${status}`}),
        response(200, {status: 'ok', action})
      ]);
      const result = await env.context.patrolReadRequest(action, 'https://synthetic.invalid/read', {
        method: 'POST',
        body: JSON.stringify({token: 'TOKEN_CANARY', name: 'NAME_CANARY'})
      });
      assert.deepEqual(result, {status: 'ok', action});
      assert.equal(env.calls.length, 2, `${action} HTTP ${status}`);
      assert.deepEqual(env.retryDelays(), [2000], `${action} HTTP ${status} delay`);
      assert.deepEqual(env.logs.map(entry => entry.attempt), [1, 2], `${action} HTTP ${status} attempts`);
      assert.equal(env.logs[1].retrySucceeded, true, `${action} HTTP ${status} recovery`);
    }
  }
});

test('three transient failures are finite, wait 2 seconds then 5 seconds, and expose the required unavailable error', async () => {
  const env = harness([
    response(500, {status: 'error'}),
    response(500, {status: 'error'}),
    response(500, {status: 'error'})
  ]);
  await assert.rejects(
    env.context.patrolReadRequest('ptsummary', 'https://synthetic.invalid/read'),
    error => {
      assert.equal(error.message, '巡店後端暫時無回應，已自動重試3次。session仍保留，可按重新連線，不需要登出。');
      assert.equal(error.httpStatus, 500);
      assert.equal(error.retryExhausted, true);
      return true;
    }
  );
  assert.equal(env.calls.length, 3);
  assert.deepEqual(env.retryDelays(), [2000, 5000]);
  assert.deepEqual(env.logs.map(entry => entry.attempt), [1, 2, 3]);
  assert.equal(env.logs.every(entry => entry.action === 'ptsummary'), true);
  assert.equal(env.context.PT_TOKEN, 'SESSION_CANARY');
  assert.deepEqual(env.sessionStorage.removeCalls, []);
  assert.deepEqual(env.sessionStorage.setCalls, []);
  assert.match(env.sessionStorage.getItem(env.cachedSummaryKey), /"month":"2026-09"/);
});

test('network TypeError and AbortError are retried once and recover without clearing session state', async () => {
  for (const networkError of [namedError('TypeError'), namedError('AbortError')]) {
    const env = harness([networkError, response(200, {status: 'ok', recovered: true})]);
    const result = await env.context.patrolReadRequest('ptdetail', 'https://synthetic.invalid/read');
    assert.deepEqual(result, {status: 'ok', recovered: true});
    assert.equal(env.calls.length, 2);
    assert.deepEqual(env.retryDelays(), [2000]);
    assert.equal(env.logs[0].exceptionType, networkError.name);
    assert.equal(env.logs[1].retrySucceeded, true);
  }
});

test('explicit AUTH reasons in an HTTP 404 response win over transport retry classification', async () => {
  for (const reason of [
    'AUTH_SESSION_EXPIRED', 'AUTH_SESSION_REVOKED',
    'AUTH_TOKEN_INVALID', 'AUTH_DEPLOYMENT_MISMATCH'
  ]) {
    const env = harness([response(404, {
      status: 'error', reason, message: `${reason} TOKEN_CANARY NAME_CANARY`
    })]);
    const result = await env.context.patrolReadRequest(
      'ptsummary',
      'https://synthetic.invalid/read?action=ptsummary&token=TOKEN_CANARY#HASH_CANARY'
    );
    assert.equal(result.reason, reason);
    assert.equal(env.calls.length, 1, reason);
    assert.deepEqual(env.retryDelays(), [], reason);
  }
});

test('HTTP 200 with non-JSON content fails once as SyntaxError and is never retried', async () => {
  const env = harness([response(200, null, {rawBody: '<html>404 CANARY</html>', contentType: 'text/html'})]);
  await assert.rejects(
    env.context.patrolReadRequest('ptsummary', 'https://synthetic.invalid/read'),
    error => error.name === 'SyntaxError'
  );
  assert.equal(env.calls.length, 1);
  assert.deepEqual(env.retryDelays(), []);
  assert.equal(env.logs[0].exceptionType, 'SyntaxError');
});

test('write and auth/media actions never enter the read retry loop', async () => {
  for (const action of [
    'ptwrite', 'hwrite', 'ptauth', 'ptlogout', 'ptvisit_write',
    'half_media_upload', 'media', 'unknown-write'
  ]) {
    const env = harness([response(500, {status: 'error', message: 'write failed'})]);
    await assert.rejects(env.context.patrolReadRequest(action, 'https://synthetic.invalid/write'));
    assert.equal(env.calls.length, 1, action);
    assert.deepEqual(env.retryDelays(), [], action);
    assert.equal(env.logs.length, 0, `${action} must not emit read diagnostics`);
  }
});

test('cloudWrite sends a failed batch exactly once and does not replay the ambiguous write', async () => {
  const calls = [];
  const messages = [];
  const context = vm.createContext({
    Promise,
    JSON,
    encodeURIComponent,
    cloudOn: true,
    secureUnlocked: true,
    privateAccount: {username: 'synthetic'},
    PT_TOKEN: 'TOKEN_CANARY',
    cloudCallJsonp: async (...args) => {
      calls.push(args);
      throw new Error('synthetic write failure');
    },
    waitForPatrolReadback: () => { throw new Error('readback must not run'); },
    showMsg: message => messages.push(String(message))
  });
  vm.runInContext(writeSource, context);
  const details = [{
    fillTime: '2026/9/15 10:00', arriveTime: '2026/9/15 10:01', leaveTime: '',
    district: 'synthetic', code: 'DNB00000', store: 'SYNTHETIC_STORE',
    inspector: 'SYNTHETIC_INSPECTOR', item: 1, result: 'V', reason: '', month: '2026-09'
  }];
  await assert.rejects(context.cloudWrite(details), /synthetic write failure/);
  assert.equal(calls.length, 1);
  assert.deepEqual(messages, []);
});

test('read diagnostics use an exact safe allowlist and never expose URL query, hash, request body, or canaries', async () => {
  const env = harness([
    response(404, {status: 'error', message: 'temporary'}, {
      url: 'https://synthetic.invalid/exec?action=ptsummary&token=TOKEN_CANARY&name=NAME_CANARY#HASH_CANARY'
    }),
    response(200, {status: 'ok'}, {
      redirected: false,
      url: 'https://synthetic.invalid/exec?action=ptsummary&token=TOKEN_CANARY&name=NAME_CANARY#HASH_CANARY'
    })
  ]);
  await env.context.patrolReadRequest('ptsummary', 'https://synthetic.invalid/exec?action=ptsummary&token=TOKEN_CANARY#HASH_CANARY', {
    method: 'POST',
    body: JSON.stringify({key: 'PASSWORD_CANARY', token: 'TOKEN_CANARY', name: 'NAME_CANARY', store: 'STORE_CANARY'})
  });
  const expectedKeys = [
    'timestamp', 'action', 'attempt', 'durationMs', 'httpStatus', 'redirected',
    'contentType', 'responseUrl', 'exceptionType', 'retrySucceeded'
  ].sort();
  assert.deepEqual(Object.keys(env.logs[0]).sort(), expectedKeys);
  assert.deepEqual(Object.keys(env.logs[1]).sort(), expectedKeys);
  assert.equal(env.logs[0].httpStatus, 404);
  assert.equal(env.logs[0].responseUrl, 'https://synthetic.invalid/exec');
  assert.equal(env.logs[1].httpStatus, 200);
  assert.equal(env.logs[1].responseUrl, 'https://synthetic.invalid/exec');
  const serializedLogs = JSON.stringify(env.logs);
  for (const canary of ['PASSWORD_CANARY', 'TOKEN_CANARY', 'NAME_CANARY', 'STORE_CANARY', 'HASH_CANARY']) {
    assert.equal(serializedLogs.includes(canary), false, `diagnostics leak ${canary}`);
  }
});

test('Patrol sign-in keeps passcode on transient failure, clears on success or bad credential, and auth uses one 60s request', async () => {
  const privateSignIn = extractFunction(patrol, 'privateSignIn');
  const unlockPatrol = extractFunction(patrol, 'unlockPatrol');
  const privateAuthPost = extractFunction(patrol, 'privateAuthPost');
  const input = {value:'PASSCODE_CANARY'};
  const button = {disabled:false};
  const messages = [];
  const sessionStorage = {
    setCalls: [],
    setItem: (key, value) => sessionStorage.setCalls.push([key, value])
  };
  const context = vm.createContext({
    Promise,
    String,
    Error,
    PT_SESSION_TOKEN_STORAGE: 'bei12b_patrol_session_token_v2',
    PRIVATE_GAS_URL: 'https://synthetic.invalid/patrol',
    sessionStorage,
    document: {getElementById: id => id === 'patrolPasscode' ? input : id === 'patrolAuthSubmit' ? button : null},
    setPatrolAuthMessage: message => messages.push(String(message)),
    patrolAuthReason: value => String(value?.reason || value?.auth?.reason || value?.authReason || ''),
    patrolAuthReasonText: value => String(value?.message || value?.reason || value || 'auth failure'),
    privateAuthErrorText: error => String(error?.message || error),
    privateHealthCheck: async () => {},
    privateAuthPost: async () => ({status:'ok', token:'SESSION_CANARY'}),
    mountPatrolApp: () => {},
    patrolReadRequest: async (...args) => ({args})
  });
  vm.runInContext(`let PT_KEY=''; let PT_TOKEN=''; let secureUnlocked=false; let privateAccount=null; let appMounted=false; ${privateAuthPost}\n${privateSignIn}\n${unlockPatrol}`, context);

  context.privateHealthCheck = async () => { const error = new Error('temporary network'); error.name = 'TypeError'; throw error; };
  await context.unlockPatrol({preventDefault(){}});
  assert.equal(input.value, 'PASSCODE_CANARY', 'temporary auth failure preserves the input for retry');
  assert.equal(button.disabled, false);

  input.value = 'PASSCODE_CANARY';
  context.privateHealthCheck = async () => {};
  context.privateAuthPost = async () => ({status:'ok', token:'SESSION_CANARY'});
  await context.unlockPatrol({preventDefault(){}});
  assert.equal(input.value, '', 'successful auth clears the input');
  assert.deepEqual(sessionStorage.setCalls, [['bei12b_patrol_session_token_v2', 'SESSION_CANARY']]);

  input.value = 'PASSCODE_CANARY';
  context.privateAuthPost = async () => ({status:'error', reason:'AUTH_CREDENTIAL_INVALID'});
  await context.unlockPatrol({preventDefault(){}});
  assert.equal(input.value, '', 'explicit credential rejection clears the input');

  const authCalls = [];
  const authContext = vm.createContext({
    Promise,
    String,
    PRIVATE_GAS_URL: 'https://synthetic.invalid/patrol',
    patrolReadRequest: async (...args) => { authCalls.push(args); return {status:'ok'}; }
  });
  vm.runInContext(privateAuthPost, authContext);
  await authContext.privateAuthPost({action:'ptauth', key:'PASSCODE_CANARY'});
  assert.equal(authCalls.length, 1);
  assert.equal(authCalls[0][3], 60_000);
  assert.equal(authCalls[0][2].method, 'POST');
});

test('detail POST unknown action uses same-endpoint GET once, preserving the three-request budget and redacted diagnostics', async () => {
  const env=harness([response(200,{status:'error',message:'unknown patrol action'}),response(200,{status:'ok',rows:[],totalRows:0})]);
  const result=await env.context.patrolReadRequest('ptdetail','https://synthetic.invalid/exec',{method:'POST',body:JSON.stringify({action:'ptdetail',token:'SESSION_CANARY',month:'2026-07',store:'synthetic',page:1,limit:100})});
  assert.equal(result.status,'ok');assert.equal(env.calls.length,2);
  assert.equal(env.calls[1].options.method,'GET');
  const url=new URL(env.calls[1].url);assert.equal(url.searchParams.get('action'),'ptdetail');assert.equal(url.searchParams.get('month'),'2026-07');
  assert.equal(JSON.stringify(env.logs).includes('SESSION_CANARY'),false);
  const exhausted=harness([response(200,{status:'error',message:'unknown patrol action'}),response(503,{}),response(503,{})]);
  await assert.rejects(exhausted.context.patrolReadRequest('ptdetail','https://synthetic.invalid/exec',{method:'POST',body:'{}'}));
  assert.equal(exhausted.calls.length,3);
});

test('detail compatibility never falls back for auth errors or writes and never loops on GET unknown action', async () => {
  for(const [action,payload] of [['ptdetail',{status:'error',reason:'AUTH_SESSION_EXPIRED'}],['ptwrite',{status:'error',message:'unknown patrol action'}]]){
    const env=harness([response(200,payload)]);
    await env.context.patrolReadRequest(action,'https://synthetic.invalid/exec',{method:'POST',body:'{}'});
    assert.equal(env.calls.length,1);
  }
  const env=harness([response(200,{status:'error',message:'unknown patrol action'}),response(200,{status:'error',message:'unknown patrol action'})]);
  assert.equal((await env.context.patrolReadRequest('ptdetail','https://synthetic.invalid/exec',{method:'POST',body:'{}'})).status,'error');
  assert.equal(env.calls.length,2);
});
