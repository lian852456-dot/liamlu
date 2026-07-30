const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'gas/Code.gs'), 'utf8');
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const kpi = fs.readFileSync(path.join(root, 'kpi.html'), 'utf8');
const patrol = fs.readFileSync(path.join(root, 'patrol.html'), 'utf8');

function functionBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated ${name}`);
}

test('GET read and write routes fail closed without returning protected fields', () => {
  const doGet = functionBody(code, 'doGet');
  assert.match(doGet, /\['read', 'write', 'pread', 'pwrite'\]\.includes\(action\)/);
  assert.match(doGet, /message: 'unauthorized', code: 403/);
  for (const sink of ['readData(', 'writeData(', 'readPersonal(', 'writePersonal(']) {
    assert.doesNotMatch(doGet.slice(0, doGet.indexOf("if (action === 'ptwrite')")), new RegExp(sink.replace('(', '\\(')));
  }
});

test('POST report routes authorize before every protected read or write sink', () => {
  const routes = {
    reportReadPayload_: ['reportSessionRequired_', 'readData('],
    reportWritePayload_: ['reportSessionRequired_', 'writeData('],
    reportPersonalReadPayload_: ['reportSessionRequired_', 'readPersonal('],
    reportPersonalWritePayload_: ['reportSessionRequired_', 'writePersonal('],
  };
  for (const [name, expected] of Object.entries(routes)) {
    const body = functionBody(code, name);
    for (const marker of expected) assert.match(body, new RegExp(marker.replace('(', '\\(')));
    assert.ok(body.indexOf(expected[0]) < body.indexOf(expected[1]), `${name} must authorize before data access`);
  }
});

test('employee report sessions require active roster membership and exact approved device', () => {
  const auth = functionBody(code, 'reportAuthenticatePayload_');
  assert.match(auth, /lookup\.user\.status !== 'active'/);
  assert.match(auth, /lookup\.user\.device_id !== deviceId/);
  assert.doesNotMatch(auth, /privateDashboardIsTrustedEmployee/);
  assert.match(functionBody(code, 'reportSessionRequired_'), /CacheService\.getScriptCache\(\)/);
  assert.match(code, /REPORT_SESSION_TTL_SECONDS = 1800/);
});

test('trusted employee property no longer bypasses device binding', () => {
  for (const name of ['privateDashboardAccess', 'kpiCalcAccess']) {
    const body = functionBody(code, name);
    assert.match(body, /lookup\.user\.device_id !== deviceId/);
    assert.doesNotMatch(body.slice(0, body.indexOf('throw new Error')), /privateDashboardIsTrustedEmployee/);
  }
});

test('protected frontend calls use fixed endpoint, POST body, and no URL credentials', () => {
  const protectedPost = functionBody(index, 'protectedGasPost');
  assert.match(protectedPost, /fetch\(DEFAULT_GAS_URL/);
  assert.match(protectedPost, /method: 'POST'/);
  assert.doesNotMatch(index, /\?action=(?:read|write|pread|pwrite)/);
  assert.doesNotMatch(kpi, /localStorage\.getItem\('bei12b_gas_url'\)/);
});

test('PII and private attachment records are not persisted in browser storage', () => {
  for (const key of [
    'north12b_private_dashboard_employee_id',
    'bei12b_kpi_emp',
    'bei12b_kpi_v1',
    'personal_last_name',
    'perfDay_',
  ]) {
    assert.doesNotMatch(index + kpi, new RegExp(`(?:localStorage|sessionStorage)\\.(?:getItem|setItem)\\([^\\n]*${key}`));
  }
  assert.doesNotMatch(patrol, /sessionStorage\.setItem\('bei12b_half_checks'/);
});

test('report logout removes both report and supervisor tokens server-side', () => {
  const body = functionBody(code, 'reportLogoutPayload_');
  assert.match(body, /remove\(reportSessionCacheKey_\(token\)\)/);
  assert.match(body, /remove\(ptSessionCacheKey_\(token\)\)/);
  assert.match(index, /action: 'report_logout'/);
  assert.match(kpi, /action: 'report_logout'/);
});
