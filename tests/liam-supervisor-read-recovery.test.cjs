const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const app = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('app.html', 'utf8');
const sw = fs.readFileSync('service-worker.js', 'utf8');
const patrol = fs.readFileSync('patrol.html', 'utf8');

const patrolEndpoint = 'AKfycbxqBtW2yQw_u4qqJ9Knz6CK34hAiunaa6lIQu4pMa8Ff2voJZCWKEh8MXTJ6qAoGTax';
const legacyPatrolEndpoint = 'AKfycbznzoWOzzPJLEh8PCwTLw8UfWEyiCXwawd0T49JXpK4MP70vTdrrfTMN1G2Grghd-Mv';
const privateEndpoint = 'AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6';

function extractFunction(source, name) {
  const marker = `async function ${name}`;
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

test('private summary and patrol reads use separate current formal deployments', () => {
  assert.equal((app.match(new RegExp(privateEndpoint, 'g')) || []).length, 1);
  assert.ok(app.includes(patrolEndpoint), 'App uses isolated Patrol deployment');
  assert.doesNotMatch(app, new RegExp(legacyPatrolEndpoint));
  assert.match(patrol, new RegExp(patrolEndpoint));
  assert.match(app, /PATROL_TOKEN_KEY\s*=\s*['"]bei12b_patrol_session_token_v2['"]/);
  assert.match(app, /postReadOnly[\s\S]*fetchJsonWithRecovery\(DAILY_REPORT_API/);
  assert.match(app, /postDeviceAccess[\s\S]*fetchJsonWithRecovery\(DAILY_REPORT_API/);
  assert.match(app, /postPatrolAuth[\s\S]*fetchJsonAttempt\(/);
  assert.doesNotMatch(extractFunction(app, 'postPatrolAuth'), /fetchPatrolReadWithRecovery|fetchJsonWithRecovery/);
  assert.match(extractFunction(app, 'postPatrolAuth'), /(?:60_000|60000)/);
  assert.match(extractFunction(app, 'patrolRead'), /fetchPatrolReadWithRecovery\(/);
  assert.doesNotMatch(extractFunction(app, 'patrolRead'), /fetchJsonWithRecovery\(/);
});

test('WKWebView read transport uses encoded string URL and independent bounded timeouts', () => {
  const read = app.match(/async function patrolRead[\s\S]+?async function patrolVisitWrite/)?.[0] || '';
  assert.doesNotMatch(read, /new URL\(|URLSearchParams/);
  assert.match(read, /encodeURIComponent\(key\)/);
  assert.match(read, /encodeURIComponent\(value\)/);
  assert.match(read, /action === 'ptsummary' \|\| action === 'ptdetail' \|\| action === 'ptmileage2'[\s\S]*body:JSON\.stringify/);
  assert.match(app, /PRIVATE_TIMEOUT_MS = 20_000/);
  assert.match(app, /sread:30_000, ptsummary:20_000, ptdetail:60_000, ptmileage2:30_000, hread:90_000, ptvisit_read:30_000/);
  assert.doesNotMatch(app, /patrolRead\('ptread'/);
  assert.match(read, /const timeoutMs = PATROL_TIMEOUT_MS\[action\]/);
  assert.match(read, /巡店資料讀取逾時/);
});

test('App patrol reads use a finite 3-attempt 2s/5s retry contract', () => {
  const read = extractFunction(app, 'fetchPatrolReadWithRecovery');
  assert.match(app, /PATROL_RETRY_STATUSES\s*=\s*new Set\(\[404,429,500,502,503,504\]\)/);
  assert.match(read, /(?:attempt\s*<=\s*3|attempt\s*<\s*3)/);
  assert.match(read, /2000/);
  assert.match(read, /5000/);
  assert.match(read, /PATROL_RETRY_STATUSES/);
  assert.match(app, /error instanceof TypeError/);
  assert.match(app, /patrol && PATROL_RETRY_STATUSES\.has\(response\.status\)/);
  assert.match(app, /patrol && patrolApiReason\(body\)[\s\S]*return \{ response, body \}/);
  assert.doesNotMatch(read, /setTimeout\([^,]+,\s*1000\)/);
  assert.doesNotMatch(extractFunction(app, 'patrolVisitWrite'), /fetchPatrolReadWithRecovery/);
});

test('synthetic patrol read recovers once and stops after three transient failures', async () => {
  const read = extractFunction(app, 'fetchPatrolReadWithRecovery');
  const context = vm.createContext({
    Promise,
    delays: [],
    PATROL_READ_ACTIONS: new Set(['ptsummary', 'ptdetail', 'ptmileage2', 'sread', 'hread']),
    PATROL_RETRY_STATUSES: new Set([404, 429, 500, 502, 503, 504]),
    PATROL_READ_UNAVAILABLE: '巡店後端暫時無回應，已自動重試3次。session仍保留，可按重新連線，不需要登出。',
    ReadTransportError: class ReadTransportError extends Error {
      constructor(kind, message, retryable = false, status = 0) {
        super(message);
        this.kind = kind;
        this.retryable = retryable;
        this.status = status;
      }
    },
    scope: {
      setTimeout: (callback, delay) => { context.delays.push(delay); callback(); return delay; },
      clearTimeout: () => {}
    }
  });
  const harness = `
    var outcomes = [];
    async function fetchJsonAttempt() {
      const outcome = outcomes.shift();
      if (outcome instanceof Error) throw outcome;
      if (outcome && outcome.error) throw Object.assign(new Error(outcome.error), outcome);
      return outcome;
    }
    ${read}
  `;
  vm.runInContext(harness, context);

  context.outcomes = [{error:'temporary', status:404, retryable:true}, {body:{status:'ok'}, response:{ok:true}}];
  const recovered = await context.fetchPatrolReadWithRecovery('ptsummary', {}, 60_000, 'timeout');
  assert.deepEqual(recovered, {body:{status:'ok'}, response:{ok:true}});
  assert.deepEqual(context.delays, [2000]);

  for (const status of [404, 429, 500, 502, 503, 504]) {
    context.delays.length = 0;
    context.outcomes = [{error:'temporary', status, retryable:true}, {body:{status:'ok'}, response:{ok:true}}];
    const result = await context.fetchPatrolReadWithRecovery('ptsummary', {}, 60_000, 'timeout');
    assert.deepEqual(result, {body:{status:'ok'}, response:{ok:true}}, `HTTP ${status} recovery`);
    assert.deepEqual(context.delays, [2000], `HTTP ${status} delay`);
  }

  context.delays.length = 0;
  context.outcomes = [{error:'network', retryable:true}, {body:{status:'ok'}, response:{ok:true}}];
  const networkRecovered = await context.fetchPatrolReadWithRecovery('ptdetail', {}, 60_000, 'timeout');
  assert.deepEqual(networkRecovered, {body:{status:'ok'}, response:{ok:true}});
  assert.deepEqual(context.delays, [2000], 'network exception recovery');

  context.delays.length = 0;
  context.outcomes = [
    {error:'temporary', status:500, retryable:true},
    {error:'temporary', status:503, retryable:true},
    {error:'temporary', status:504, retryable:true}
  ];
  await assert.rejects(
    context.fetchPatrolReadWithRecovery('ptsummary', {}, 60_000, 'timeout'),
    error => error && (error.retryExhausted === true || error.httpStatus === 504 || error.status === 504)
  );
  assert.deepEqual(context.delays, [2000, 5000]);

  context.delays.length = 0;
});

test('synthetic explicit auth expiry is returned once and never treated as a transient read failure', async () => {
  const attempt = extractFunction(app, 'fetchJsonAttempt');
  const read = extractFunction(app, 'fetchPatrolReadWithRecovery');
  const context = vm.createContext({
    Promise,
    JSON,
    URL,
    delays: [],
    calls: [],
    PATROL_RETRY_STATUSES: new Set([404, 429, 500, 502, 503, 504]),
    ReadTransportError: class ReadTransportError extends Error {
      constructor(kind, message, retryable = false, status = 0) {
        super(message);
        this.kind = kind;
        this.retryable = retryable;
        this.status = status;
      }
    },
    AbortController: class AbortController {
      constructor() { this.signal = {}; }
      abort() {}
    },
    patrolApiReason: value => String(value && (value.auth && value.auth.reason || value.reason) || ''),
    scope: {
      setTimeout: (callback, delay) => { context.delays.push(delay); return {delay}; },
      clearTimeout: () => {}
    },
    fetch: async (url, options) => {
      context.calls.push({url:String(url), options});
      return {
        status: 404,
        ok: false,
        url: 'https://script.googleusercontent.com/macros/s/synthetic/exec',
        redirected: true,
        headers: {get: name => String(name).toLowerCase() === 'content-type' ? 'application/json' : null},
        text: async () => JSON.stringify({status:'error', reason:'AUTH_SESSION_EXPIRED', message:'reauth required'})
      };
    }
  });
  vm.runInContext(`${attempt}\n${read}`, context);
  const result = await context.fetchPatrolReadWithRecovery('ptsummary', {}, 60_000, 'timeout');
  assert.equal(result.body.reason, 'AUTH_SESSION_EXPIRED');
  assert.equal(context.calls.length, 1);
  assert.deepEqual(context.delays.filter(delay => delay === 2000 || delay === 5000), []);
});

test('transport failures fail closed and do not become zero-shaped formal data', () => {
  assert.match(app, /resetPrivateSummary\(state,note\)/);
  assert.match(app, /PRIVATE_MODULE_KEYS\.forEach\(key => \{ contract\[key\] = statusModule\(key,status,null,note\); \}\)/);
  assert.match(app, /return statusModule\(key,'error',null,note\)/);
  assert.match(app, /status:'stale',stale:true,note:`上次成功資料/);
  assert.match(app, /reportRows\[segment\]=null/);
  assert.doesNotMatch(app, /reportResult\.status==='rejected'[\s\S]{0,300}adaptReport\(segment,\{\}/);
});

test('recovery release is cache-busted and formal half-month write remains disabled', () => {
  const appVersion = html.match(/app\.js\?v=([^"'&]+)/)?.[1];
  const workerVersion = app.match(/service-worker\.js\?v=([^"'&]+)/)?.[1];
  assert.ok(appVersion, 'App script is versioned');
  assert.equal(workerVersion, appVersion, 'App and service worker registration versions match');
  assert.notEqual(appVersion, 'manager-personal-source-fix-20260909', 'release must bump the stale App shell version');
  assert.doesNotMatch(sw, /liam-supervisor-app-1-2-manager-personal-source-fix-20260909-v1/);
  assert.doesNotMatch(app, /PATROL_WRITE_ACTIONS = new Set\(\[[^\]]*hwrite/);
  assert.doesNotMatch(app, /halfMonthWriteRows|patrolRead\(['"]hwrite|half_media_upload/);
  assert.match(app, /if\(!PREVIEW_MODE\) return/);
});

test('passcode input is cleared only after successful auth or explicit credential rejection', () => {
  const handlerStart = app.indexOf("dom('#patrolAccessForm').addEventListener");
  const handlerEnd = app.indexOf("dom('#patrolLogout').addEventListener", handlerStart);
  assert.ok(handlerStart >= 0 && handlerEnd > handlerStart, 'patrol access handler is present');
  const handler = app.slice(handlerStart, handlerEnd);
  assert.match(handler, /await unlockPatrol\(passcode\)/);
  assert.match(handler, /AUTH_CREDENTIAL_INVALID/);
  const tryStart = handler.indexOf('try');
  assert.ok(tryStart >= 0, 'auth handler has a guarded success path');
  assert.doesNotMatch(handler.slice(0, tryStart), /input\.value\s*=\s*['"]['"]/);
  assert.match(handler.slice(tryStart), /input\.value\s*=\s*['"]['"]/);
});
