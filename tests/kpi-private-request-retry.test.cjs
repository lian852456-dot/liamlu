const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const KpiBattleController = require('../kpi-battle-controller.js');

const root = path.join(__dirname, '..');

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) || '',
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

function httpError(status, overrides = {}) {
  return Object.assign(new Error(`HTTP ${status}`), {
    kind: 'http',
    httpStatus: status,
    responseUrl: KpiBattleController.DEFAULT_GAS_URL,
    responseRedirected: false,
    responseContentType: 'text/html; charset=utf-8',
  }, overrides);
}

function businessError(message) {
  return Object.assign(new Error(message), { kind: 'business' });
}

function privateAccessResult() {
  return {
    status: 'ok',
    profile: { maskedName: '測＊員', store: '台北大稻埕', role: '業代' },
    snapshot: {
      kpiBattle: {
        report_date: '2026-08-25',
        data_as_of_date: '2026-08-25',
        source_file: '0826.xlsx',
        aggregate: {},
        stores: [],
        personal: [],
      },
    },
  };
}

function kpicalcResult() {
  return {
    status: 'ok',
    data: {
      meta: {
        month: '2026-08',
        monthDays: 31,
        snapshotDay: 25,
        sourceFile: '0826.xlsx',
        period: '2026/08/01～08/25',
      },
      items: [],
      stores: [],
      persons: [],
      aggregateRates: {},
    },
  };
}

function harness(sequence) {
  const employeeInput = { value: 'EMPLOYEE-SENSITIVE', offsetParent: {} };
  const status = { textContent: '', style: {} };
  const note = { textContent: '', innerHTML: '' };
  const content = { innerHTML: '' };
  const localStorage = memoryStorage();
  const sessionStorage = memoryStorage();
  const logs = [];
  const delays = [];
  const document = {
    addEventListener() {},
    getElementById(id) {
      if (id === 'kpiBattleContent') return content;
      if (id === 'kpiBattleSourceNote') return note;
      return null;
    },
    querySelector(selector) {
      if (selector === '#privateEmployeeId') return employeeInput;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '#privateEmployeeId') return [employeeInput];
      if (selector === '.private-lock-status') return [status];
      return [];
    },
  };
  const window = {
    document,
    localStorage,
    sessionStorage,
    crypto: { randomUUID: () => 'DEVICE-SENSITIVE' },
    setTimeout,
  };
  let calls = 0;
  const post = async payload => {
    const item = sequence[calls++];
    if (typeof item === 'function') return item(payload);
    if (item instanceof Error) throw item;
    return item;
  };
  const logger = {
    warn: (label, detail) => logs.push({ level: 'warn', label, detail }),
    error: (label, detail) => logs.push({ level: 'error', label, detail }),
    info: (label, detail) => logs.push({ level: 'info', label, detail }),
  };
  const controller = KpiBattleController.create({
    window,
    document,
    post,
    logger,
    retryDelaysMs: [2000, 5000],
    sleep: async delay => { delays.push(delay); },
  });
  return { controller, calls: () => calls, delays, logs, status, sessionStorage };
}

async function expectLoginSuccess(sequence, expectedCalls, expectedDelays) {
  const env = harness([...sequence, privateAccessResult(), kpicalcResult()]);
  await env.controller.login();
  assert.equal(env.calls(), expectedCalls);
  assert.deepEqual(env.delays, expectedDelays);
  assert.ok(env.controller.getData(), 'retry recovery should complete KPI login');
  assert.equal(env.sessionStorage.getItem('north12b_private_dashboard_employee_id'), 'EMPLOYEE-SENSITIVE');
  assert.ok(env.logs.some(entry => entry.level === 'info' && entry.detail.retrySucceeded === true));
  assert.equal(env.logs.some(entry => entry.level === 'error'), false);
  assert.equal(env.status.style.color, 'var(--text-muted)');
  return env;
}

test('第一次 404、第二次成功後正常登入', async () => {
  await expectLoginSuccess([httpError(404)], 3, [2000]);
});

test('404、404、第三次成功後正常登入', async () => {
  await expectLoginSuccess([httpError(404), httpError(404)], 4, [2000, 5000]);
});

test('503、第二次成功後正常登入', async () => {
  await expectLoginSuccess([httpError(503)], 3, [2000]);
});

test('network exception、第二次成功後正常登入', async () => {
  await expectLoginSuccess([new TypeError('Failed to fetch')], 3, [2000]);
});

test('主站 KPI 改走 controller scoped retry，每日回報 transport 保持獨立', () => {
  const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const createBlock = index.match(/const kpiBattleController = KpiBattleController\.create\(\{([\s\S]*?)\}\);/)?.[1] || '';
  assert.doesNotMatch(createBlock, /post:\s*privateDashboardPost/);
  assert.match(index, /async function privateDashboardPost\(payload\)/);
  for (const action of ['read', 'write', 'pread', 'pwrite']) {
    assert.match(index, new RegExp(`privateDashboardPost\\(\\{ action: '${action}'`));
  }
});

test('暫時性 HTTP status 清單固定為 404/429/500/502/503/504', async () => {
  for (const status of [404, 429, 500, 502, 503, 504]) {
    const env = harness([httpError(status), { status: 'ok' }]);
    await env.controller.post({ action: 'private_access' });
    assert.equal(env.calls(), 2, `HTTP ${status} should retry once`);
  }
});

test('連續三次 404 才顯示最終服務錯誤', async () => {
  const env = harness([httpError(404), httpError(404), httpError(404)]);
  await env.controller.login();
  assert.equal(env.calls(), 3);
  assert.deepEqual(env.delays, [2000, 5000]);
  assert.equal(env.status.textContent, '服務暫時無法連線（HTTP 404），請稍後再試。');
  assert.equal(env.status.style.color, 'var(--red)');
  const final = env.logs.find(entry => entry.level === 'error');
  assert.equal(final.detail.failureTarget, 'original-exec');
  assert.equal(final.detail.httpStatus, 404);
});

test('private_access 成功後 kpicalc_access 連續三次 404 也顯示最終服務錯誤', async () => {
  const env = harness([privateAccessResult(), httpError(404), httpError(404), httpError(404)]);
  await env.controller.login();
  assert.equal(env.calls(), 4);
  assert.deepEqual(env.delays, [2000, 5000]);
  assert.equal(env.status.textContent, '服務暫時無法連線（HTTP 404），請稍後再試。');
  assert.equal(env.status.style.color, 'var(--red)');
  assert.equal(env.controller.getData(), null);
  assert.equal(env.sessionStorage.getItem('north12b_private_dashboard_employee_id'), 'EMPLOYEE-SENSITIVE');
});

for (const [name, message] of [
  ['裝置未核准', '這台裝置尚未核准'],
  ['員編錯誤', '員編不存在'],
]) {
  test(`${name}屬業務驗證錯誤，不 retry`, async () => {
    const env = harness([businessError(message)]);
    await env.controller.login();
    assert.equal(env.calls(), 1);
    assert.deepEqual(env.delays, []);
    assert.equal(env.status.textContent, message);
    assert.equal(env.logs.length, 0);
  });
}

test('session 驗證失敗不 retry，且不保留 KPI 資料', async () => {
  const env = harness([privateAccessResult(), businessError('session 無效')]);
  await env.controller.login();
  assert.equal(env.calls(), 2);
  assert.deepEqual(env.delays, []);
  assert.equal(env.controller.getData(), null);
  assert.equal(env.status.textContent, 'session 無效');
  assert.equal(env.logs.length, 0);
});

test('綁定與管理者寫入 action 即使遇到 503 也不自動 retry', async () => {
  for (const action of ['private_request', 'private_admin_approve']) {
    const env = harness([httpError(503)]);
    await assert.rejects(env.controller.post({ action }), /HTTP 503/);
    assert.equal(env.calls(), 1);
    assert.deepEqual(env.delays, []);
  }
});

test('retry 診斷只記錄非敏感欄位，且辨識 redirect 後端點', async () => {
  const redirected404 = httpError(404, {
    responseUrl: 'https://example-script.googleusercontent.com/macros/echo?user_content_key=redacted',
    responseRedirected: true,
  });
  const env = harness([redirected404, { status: 'ok' }]);
  await env.controller.post({
    action: 'private_access',
    employeeId: 'EMPLOYEE-SENSITIVE',
    bootstrapCode: 'BOOTSTRAP-SENSITIVE',
    deviceId: 'DEVICE-SENSITIVE',
    sessionToken: 'SESSION-SENSITIVE',
    adminSecret: 'ADMIN-SENSITIVE',
    privateData: 'DRIVE-CONTENT-SENSITIVE',
  });
  const serialized = JSON.stringify(env.logs);
  for (const secret of ['EMPLOYEE-SENSITIVE', 'BOOTSTRAP-SENSITIVE', 'DEVICE-SENSITIVE', 'SESSION-SENSITIVE', 'ADMIN-SENSITIVE', 'DRIVE-CONTENT-SENSITIVE']) {
    assert.doesNotMatch(serialized, new RegExp(secret));
  }
  assert.doesNotMatch(serialized, /employeeId|bootstrapCode|deviceId|sessionToken|adminSecret|privateData|body/i);
  assert.doesNotMatch(serialized, /user_content_key|\?redacted|\?user_/i);
  assert.ok(env.logs.some(entry => entry.detail.failureTarget === 'redirect-target'));
  assert.ok(env.logs.some(entry => entry.detail.retrySucceeded === true));
  assert.equal(env.logs[0].detail.action, 'private_access');
  assert.equal(env.logs[0].detail.responseUrl, 'https://example-script.googleusercontent.com/macros/echo');
  assert.equal(env.logs[0].detail.responseContentType, 'text/html; charset=utf-8');
});

test('network final failure diagnostics identify network exception without HTTP status', async () => {
  const env = harness([new TypeError('Failed to fetch'), new TypeError('Failed to fetch'), new TypeError('Failed to fetch')]);
  await assert.rejects(
    env.controller.post({ action: 'kpicalc_access' }),
    /服務暫時無法連線（網路錯誤），請稍後再試。/
  );
  const final = env.logs.find(entry => entry.level === 'error');
  assert.equal(final.detail.failureTarget, 'network-exception');
  assert.equal(final.detail.httpStatus, null);
  assert.equal(final.detail.exceptionType, 'TypeError');
});
