const test = require('node:test');
const assert = require('node:assert/strict');
const {csv, createRuntime, parsed} = require('./helpers/tradein-synthetic-runtime.cjs');

function detailedFixture() {
  const lines = csv().toString().split('\n');
  const header = lines[1].split(',');
  header[7] = '專案代碼';
  header[8] = '舊機折抵金額';
  const rows = lines.slice(2).map((line, i) => {
    const fields = line.split(',');
    fields[6] = i ? '單銷' : 'RT';
    fields[7] = i ? '' : 'VK720';
    fields[8] = ['"4,200"', '0', '', '7900'][i];
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
  assert.throws(() => read({employeeId:'UNKNOWN'}), /裝置|核准|員編/);
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
  assert.throws(() => read({employeeId:runtime.operator}), /九店本人裝置/);
  assert.throws(() => read({employeeId:runtime.operator,adminSecret:'wrong'}), /驗證失敗/);
  assert.throws(() => read({...self, deviceId:'other-device'}), /尚未核准/);
  const own = read(self);
  assert.equal(own.scope, 'self');
  assert.equal(own.rows.length, 1);
  assert.deepEqual(own.rows[0], {date:'2026-10-02',store:'萬大',staff:'合＊5',project:'RT',projectCode:'VK720',model:'i15PM 256G',credit:4200});
  const supervisor = read({employeeId:runtime.operator, adminSecret:runtime.secret});
  assert.equal(supervisor.rows.length, first.snapshot.summary.total_units);
  assert.equal(supervisor.stores.length, 9);
  assert.deepEqual(Object.keys(supervisor.rows[0]).sort(), ['credit','date','model','project','projectCode','staff','store']);
  assert.equal(upgraded.snapshot.transactions, undefined);
  const published = runtime.a.tradeinPerformancePublicPublish({employeeId:runtime.operator,adminSecret:runtime.secret,month:detailed.month,
    expectedActiveHash:upgraded.snapshotHash,sourceHash:detailed.source_sha256,includeReadback:true});
  assert.equal(published.readback.snapshot.summary.actual_units, first.snapshot.summary.total_units);
  assert.doesNotMatch(JSON.stringify(published.readback), /VK720|tradein_credit|projectCode|transactions/);
});
