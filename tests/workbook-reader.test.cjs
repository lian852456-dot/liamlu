const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('Excel tools load on demand, share an in-flight download, and retry after failure', async () => {
  const scripts = [], window = {};
  const document = {createElement: () => ({remove() {}}), head: {append: script => scripts.push(script)}};
  vm.runInNewContext(fs.readFileSync(require.resolve('../workbook-reader.js'), 'utf8'), {window, document});
  assert.equal(scripts.length, 0);
  const first = window.loadWorkbookReader();
  assert.equal(window.loadWorkbookReader(), first);
  assert.equal(scripts[0].src, 'assets/vendor/xlsx.full.min.js');
  scripts[0].onerror();
  await assert.rejects(first, /Excel/);
  const second = window.loadWorkbookReader();
  assert.equal(scripts.length, 2);
  window.XLSX = {read() {}};
  scripts[1].onload();
  assert.equal(await second, window.XLSX);
  assert.equal(await window.loadWorkbookReader(), window.XLSX);
  assert.equal(scripts.length, 2);
});
