const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const code = fs.readFileSync(path.join(__dirname, '..', 'gas', 'Code.gs'), 'utf8');

function body(name) {
  const start = code.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const brace = code.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < code.length; index += 1) {
    if (code[index] === '{') depth += 1;
    if (code[index] === '}') depth -= 1;
    if (depth === 0) return code.slice(brace + 1, index);
  }
  throw new Error(`unterminated ${name}`);
}

function loadSummary() {
  const script = `
    const STORES=['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
    function reportSummaryNumber_(value) {${body('reportSummaryNumber_')}}
    function reportSummaryClock_(value) {${body('reportSummaryClock_')}}
    function reportSummaryManagement_(value) {${body('reportSummaryManagement_')}}
    function reportSummaryFromData_(data,date,seg) {${body('reportSummaryFromData_')}}
    module.exports=reportSummaryFromData_;
  `;
  const context=vm.createContext({module:{exports:{}},exports:{},String,Number,Boolean,Math,Object,Array,JSON,isFinite});
  vm.runInContext(script,context);
  return context.module.exports;
}

test('captured partial fixture yields the canonical v2 summary and LINE contract', () => {
  const summarize=loadSummary();
  const management=JSON.stringify({
    schemaVersion:'management-focus-v1',month:'2026-10',
    items:[
      {id:'op',label:'OP 上線／累積／目標',values:{online:1,cumulative:3,target:10}},
      {id:'mycharge-ebm',label:'⚡ MyCharge EBM系統貼標點選',values:{clicked:2,taggedToday:4,rate:50}}
    ]
  });
  const rows={
    通化:{aq999:0,aq1399:0,haosu:0,rt1399:1,rt999:1,insurance_num:5,insurance_den:8,insurance_pct:62.5,management_json:management,savedAt:'下午 5:01:02'},
    酒泉:{aq999:1,aq1399:1,haosu:0,rt1399:1,rt999:2,insurance_num:7,insurance_den:10,insurance_pct:70,savedAt:'下午 5:03:04'},
    台北三創:{aq999:0,aq1399:0,haosu:1,rt1399:0,rt999:1,insurance_num:29,insurance_den:50,insurance_pct:58,savedAt:'下午 5:05:06'},
    六張犁:{aq999:0,aq1399:1,haosu:0,rt1399:1,rt999:2,insurance_num:33,insurance_den:50,insurance_pct:66,savedAt:'下午 5:07:08'},
    復興南:{aq999:1,aq1399:0,haosu:0,rt1399:0,rt999:1,insurance_num:61,insurance_den:100,insurance_pct:61,savedAt:'下午 5:09:10'},
    永吉:{aq999:0,aq1399:1,haosu:1,rt1399:1,rt999:1,insurance_num:69,insurance_den:100,insurance_pct:69,savedAt:'下午 5:11:12'},
    大稻埕:{aq999:0,aq1399:0,haosu:0,rt1399:1,rt999:2,insurance_num:653,insurance_den:1000,insurance_pct:65.3,savedAt:'下午 5:13:14'},
    杭州南:{aq999:0,aq1399:0,haosu:0,rt1399:0,rt999:1,insurance_num:65,insurance_den:100,insurance_pct:65,savedAt:'下午 5:17:33'}
  };
  const result=summarize(rows,'2026-10-02',16);
  assert.equal(result.completedStores,8);
  assert.deepEqual(Array.from(result.missingStores),['萬大']);
  assert.equal(result.updatedAt,'17:17:33');
  assert.equal(result.metrics.A999.value,2);
  assert.equal(result.metrics.A1399.value,3);
  assert.equal(result.metrics['好速'].value,2);
  assert.equal(result.metrics.R1399.value,5);
  assert.equal(result.metrics.R999.value,11);
  assert.equal(result.metrics['保險搭售率'].value,64.6);
  assert.equal(Object.hasOwn(result.metrics,'設備案佔比'),false);
  assert.deepEqual({...result.insurance},{numerator:922,denominator:1418,percent:65});
  assert.equal(result.semantics,'formal-index-summary-v2');
  assert.equal(result.lineReport.contract,'north12b-line-closing-v2');
  assert.deepEqual(Array.from(result.lineReport.fields),['A999','A1399','好速','R999','R1399','保險搭售','管理重點']);
  assert.equal(result.lineReport.stores[0].management.schemaVersion,'management-focus-v1');
  assert.equal(result.lineReport.stores[0].metrics.A1399,0);
  assert.deepEqual({...result.lineReport.stores[0].insurance},{numerator:5,denominator:8,percent:62.5});
});

test('read routes include the formal summary without changing write actions', () => {
  assert.match(code,/return jsonResponse\(\{ status: 'ok', data, summary: reportSummaryFromData_\(data, date, seg\) \}, cb\)/);
  assert.match(code,/return \{ status: 'ok', data:data, summary:reportSummaryFromData_\(data, payload\.date, seg\) \}/);
  assert.match(code,/else if \(action === 'write'\) result = reportWritePayload_\(payload\)/);
  assert.match(code,/else if \(action === 'pwrite'\) result = personalWritePayload_\(payload\)/);
  assert.match(code,/management_json/);
  assert.match(code,/north12b-line-closing-v2/);
});

test('a segment with fewer formal fields omits absent metrics instead of inventing zero', () => {
  const summarize=loadSummary();
  const result=summarize({通化:{aq999:1,savedAt:'下午 9:05:00'}},'2026-10-02',21);
  assert.equal(result.metrics.A999.value,1);
  assert.equal(Object.hasOwn(result.metrics,'A1399'),false);
  assert.equal(Object.hasOwn(result.metrics,'好速'),false);
  assert.equal(Object.hasOwn(result.metrics,'保險搭售率'),false);
  assert.equal(result.lineReport.stores[0].metrics.A1399,null);
});
