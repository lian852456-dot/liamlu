const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const app = fs.readFileSync(path.resolve(__dirname, '..', 'app.js'), 'utf8');

function loadFmtSigned() {
  const match = app.match(/function fmtSigned\(value\) \{[^\n]+\}/);
  assert.ok(match, 'fmtSigned must remain available to KPI renderers');
  const context = vm.createContext({ module: { exports: null }, Number, Math });
  vm.runInContext(`${match[0]}; module.exports = fmtSigned;`, context);
  return context.module.exports;
}

test('ranking change renders formal zero as 0, not missing data', () => {
  const fmtSigned = loadFmtSigned();

  assert.equal(fmtSigned(0), '0');
  assert.equal(fmtSigned('0'), '0');
  assert.equal(fmtSigned(null), '—');
  assert.equal(fmtSigned(undefined), '—');
  assert.equal(fmtSigned(3), '↑3');
  assert.equal(fmtSigned(-2), '↓2');
});
