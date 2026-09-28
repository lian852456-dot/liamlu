const test = require('node:test');
const assert = require('node:assert/strict');

function loadContract() {
  const path = require.resolve('../app-data-contract.js');
  delete require.cache[path];
  return require(path);
}

const SOURCE = { label: '正式 KPI kpicalc', href: 'kpi.html' };
const WARNING = '正式 kpicalc 未完整提供 9 店 × 25 項 rate';

function regionWithMissing(key) {
  return Array.from({ length: 25 }, (_, index) => ({
    key: index === 6 ? key : `metric-${index}`,
    rate: index === 6 ? null : 1
  }));
}

function storeMap(count = 9) {
  return Object.fromEntries(Array.from({ length: count }, (_, index) => [
    `store-${index}`,
    Array.from({ length: 25 }, () => ({ rate: 1 }))
  ]));
}

function storeRows(count = 9) {
  return Array.from({ length: count }, () => ({
    fullKpis: Array.from({ length: 25 }, () => ({ rate: 1 }))
  }));
}

test('known region-only NP OUT supervisor rate gap does not raise 9x25 warning', () => {
  const C = loadContract();
  const region = regionWithMissing('解約後NP OUT(督導績)');
  const summary = C.moduleState({ status: 'partial', source: SOURCE, data: { kpi: 1.0591, companyRank: 11, fullKpis: region }, note: WARNING });
  const stores = C.moduleState({ status: 'partial', source: SOURCE, data: storeRows(), note: WARNING });
  const full = C.moduleState({ status: 'partial', source: SOURCE, data: { region, stores: storeMap() }, note: WARNING });

  assert.equal(summary.status, 'ok');
  assert.equal(stores.status, 'ok');
  assert.equal(full.status, 'ok');
  assert.equal(summary.note, '');
  assert.equal(stores.note, '');
  assert.equal(full.note, '');
});

test('unexpected KPI rate gap remains fail-closed', () => {
  const C = loadContract();
  const region = regionWithMissing('其他KPI');
  const summary = C.moduleState({ status: 'partial', source: SOURCE, data: { kpi: 1.0591, companyRank: 11, fullKpis: region }, note: WARNING });
  C.moduleState({ status: 'partial', source: SOURCE, data: storeRows(), note: WARNING });
  const full = C.moduleState({ status: 'partial', source: SOURCE, data: { region, stores: storeMap() }, note: WARNING });

  assert.equal(summary.status, 'partial');
  assert.equal(summary.note, WARNING);
  assert.equal(full.status, 'partial');
  assert.equal(full.note, WARNING);
});

test('missing store remains fail-closed even for known region-only gap', () => {
  const C = loadContract();
  const region = regionWithMissing('解約後NP OUT(督導績)');
  const summary = C.moduleState({ status: 'partial', source: SOURCE, data: { kpi: 1.0591, companyRank: 11, fullKpis: region }, note: WARNING });
  C.moduleState({ status: 'partial', source: SOURCE, data: storeRows(8), note: WARNING });
  const full = C.moduleState({ status: 'partial', source: SOURCE, data: { region, stores: storeMap(8) }, note: WARNING });

  assert.equal(summary.status, 'partial');
  assert.equal(summary.note, WARNING);
  assert.equal(full.status, 'partial');
  assert.equal(full.note, WARNING);
});
