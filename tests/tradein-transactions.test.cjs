const test = require('node:test');
const assert = require('node:assert/strict');
const {csv, createRuntime, parsed} = require('./helpers/tradein-synthetic-runtime.cjs');

function detailedFixture({includeSales=false}={}) {
  const lines = csv().toString().split('\n');
  const header = lines[1].split(',');
  header[7] = '專案代碼';
  header[8] = '舊機折抵金額';
  if (includeSales) {
    header[19] = '銷貨單金額';
    header[22] = '專案機品名';
  }
  const rows = lines.slice(2).map((line, i) => {
    const fields = line.split(',');
    fields[6] = i ? '單銷' : 'RT';
    fields[7] = i ? '' : 'VK720';
    fields[8] = ['"4,200"', '0', '', '7900'][i];
    if (includeSales) {
      fields[19] = ['"19,900"', '0', '', '15000'][i];
      fields[22] = ['APPLE iPhone 18_256G-(白)(5G)', '', '', '【OP響樂】55吋顯示器(55M70H)'][i];
    }
    return fields.join(',');
  });
  return parsed(Buffer.from([lines[0], header.join(','), ...rows].join('\n')));
}
function publish(runtime, source) {
  const authorization = {employeeId: runtime.operator, adminSecret: runtime.secret};
  const plan = runtime.a.tradeinPerformancePreview({...authorization, source});
  return runtime.a.tradeinPerformancePublish({...authorization, source, rosterHash: plan.rosterHash,
    previewHash: plan.previewHash, expectedActiveHash: plan.expectedActiveHash});
}

test('SAR74 uses the actual credit column, preserves zero and keeps missing values unknown', () => {
  const details = detailedFixture();
  assert.equal(details.has_transaction_details, true);
  assert.deepEqual(details.records.slice(0, 3).map(r => [r.project_code, r.tradein_credit]), [['VK720',4200],[null,0],[null,null]]);
  const runtime = createRuntime();
  runtime.configure(details);
  const conflict = {...details, records:[...details.records, {...details.records[0], tradein_credit:1}]};
  assert.throws(() => publish(runtime, conflict), /折抵金額衝突/);
});

test('old snapshot can receive details without double counting or widening its public projection', () => {
  const detailed = detailedFixture();
  const {has_transaction_details, records, ...source} = detailed;
  const old = {...source, records: records.map(({project_code, tradein_credit, ...row}) => row)};
  const runtime = createRuntime();
  runtime.configure(detailed);
  const read = args => JSON.parse(JSON.stringify(runtime.a.tradeinPerformanceTransactionsRead({month: detailed.month, deviceId: runtime.device, ...args})));
  assert.throws(() => read({employeeId:'UNKNOWN'}), /TRADEIN_AUTH_REQUIRED/);
  const self = {employeeId:'ZX00001'};
  assert.equal(read(self).rows, null);
  const first = publish(runtime, old);
  assert.equal(read(self).rows, null);
  const upgraded = publish(runtime, detailed);
  assert.equal(upgraded.status, 'published');
  assert.notEqual(upgraded.snapshotHash, first.snapshotHash);
  assert.equal(upgraded.snapshot.summary.total_units, first.snapshot.summary.total_units);
  assert.equal(publish(runtime, detailed).status, 'unchanged');
  assert.equal(publish(runtime, old).status, 'unchanged');
  assert.throws(() => read({employeeId:runtime.operator,adminSecret:'wrong'}), /驗證失敗/);
  assert.throws(() => read({...self, deviceId:'other-device'}), /TRADEIN_DEVICE_NOT_APPROVED/);
  assert.throws(() => read({employeeId:runtime.operator, deviceId:'other-device'}), /TRADEIN_DEVICE_NOT_APPROVED/);
  const own = read(self);
  assert.equal(own.scope, 'self');
  assert.equal(own.rows.length, 1);
  assert.deepEqual(own.rows[0], {date:'2026-10-02',store:'萬大',staff:'合＊5',project:'RT',projectCode:'VK720',model:'i15PM 256G',credit:4200});
  const supervisor = read({employeeId:runtime.operator});
  assert.equal(supervisor.rows.length, first.snapshot.summary.total_units);
  assert.equal(supervisor.stores.length, 9);
  assert.deepEqual(read({employeeId:runtime.operator, adminSecret:runtime.secret}), supervisor);
  runtime.accessRows.get(runtime.operator).status = 'revoked';
  assert.throws(() => read({employeeId:runtime.operator}), /TRADEIN_AUTH_REQUIRED/);
  assert.deepEqual(Object.keys(supervisor.rows[0]).sort(), ['credit','date','model','project','projectCode','staff','store']);
  assert.equal(upgraded.snapshot.transactions, undefined);
  const published = runtime.a.tradeinPerformancePublicPublish({employeeId:runtime.operator,adminSecret:runtime.secret,month:detailed.month,
    expectedActiveHash:upgraded.snapshotHash,sourceHash:detailed.source_sha256,includeReadback:true});
  assert.equal(published.readback.snapshot.summary.actual_units, first.snapshot.summary.total_units);
  assert.doesNotMatch(JSON.stringify(published.readback), /VK720|tradein_credit|projectCode|transactions/);
});

test('same-file backfill adds sales fields while preserving read scope and effective units', () => {
  const source = detailedFixture({includeSales:true});
  const legacy = {...source, records:source.records.map(({project_model, sales_order_amount, ...row}) => row)};
  const runtime = createRuntime();
  runtime.configure(source);
  const first = publish(runtime, legacy);
  const next = publish(runtime, source);
  assert.equal(next.status, 'published');
  assert.equal(next.snapshot.summary.total_units, first.snapshot.summary.total_units);
  assert.equal(publish(runtime, legacy).status, 'unchanged');
  const viewer = runtime.a.tradeinPerformanceTransactionsViewer_('ZX00001');
  const {rows} = runtime.a.tradeinPerformanceTransactionsForViewer_(source.month, viewer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].projectModel, 'APPLE iPhone 18 256G');
  assert.equal(rows[0].orderAmount, 19900);
  assert.doesNotMatch(JSON.stringify(next), /sales_order_amount|project_model|SYNTHETIC-ORDER/);
  const mixedChange = {...source, records:source.records.map((r, i) => i ? r : {...r, tradein_credit:1})};
  assert.throws(() => publish(runtime, mixedChange), /相同來源雜湊/);
});
