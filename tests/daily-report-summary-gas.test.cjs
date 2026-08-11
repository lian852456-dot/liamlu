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
    function reportSummaryFromData_(data,date,seg) {${body('reportSummaryFromData_')}}
    module.exports=reportSummaryFromData_;
  `;
  const context=vm.createContext({module:{exports:{}},exports:{},String,Number,Boolean,Math,Object,Array,isFinite});
  vm.runInContext(script,context);
  return context.module.exports;
}

test('captured 2026-08-11 16:00 partial fixture yields the canonical summary', () => {
  const summarize=loadSummary();
  const rows={
    通化:{aq999:0,haosu:0,rt1399:1,rt999:1,insurance_pct:62.5,device_ratio:55,savedAt:'下午 5:01:02'},
    酒泉:{aq999:1,haosu:0,rt1399:1,rt999:2,insurance_pct:70,device_ratio:60,savedAt:'下午 5:03:04'},
    台北三創:{aq999:0,haosu:1,rt1399:0,rt999:1,insurance_pct:58,device_ratio:48,savedAt:'下午 5:05:06'},
    六張犁:{aq999:0,haosu:0,rt1399:1,rt999:2,insurance_pct:66,device_ratio:63,savedAt:'下午 5:07:08'},
    復興南:{aq999:1,haosu:0,rt1399:0,rt999:1,insurance_pct:61,device_ratio:58,savedAt:'下午 5:09:10'},
    永吉:{aq999:0,haosu:1,rt1399:1,rt999:1,insurance_pct:69,device_ratio:64,savedAt:'下午 5:11:12'},
    大稻埕:{aq999:0,haosu:0,rt1399:1,rt999:2,insurance_pct:65.3,device_ratio:62,savedAt:'下午 5:13:14'},
    杭州南:{aq999:0,haosu:0,rt1399:0,rt999:1,insurance_pct:65,device_ratio:62,savedAt:'下午 5:17:33'}
  };
  const result=summarize(rows,'2026-08-11',16);
  assert.equal(result.completedStores,8);
  assert.deepEqual(Array.from(result.missingStores),['萬大']);
  assert.equal(result.updatedAt,'17:17:33');
  assert.equal(result.metrics.A999.value,2);
  assert.equal(result.metrics['好速'].value,2);
  assert.equal(result.metrics.R1399.value,5);
  assert.equal(result.metrics.R999.value,11);
  assert.equal(result.metrics['保險搭售率'].value,64.6);
  assert.equal(result.metrics['設備案佔比'].value,59);
  assert.equal(result.semantics,'formal-index-summary-v1');
});

test('read routes include the formal summary without changing write actions', () => {
  assert.match(code,/return jsonResponse\(\{ status: 'ok', data, summary: reportSummaryFromData_\(data, date, seg\) \}, cb\)/);
  assert.match(code,/return \{ status: 'ok', data:data, summary:reportSummaryFromData_\(data, payload\.date, seg\) \}/);
  assert.match(code,/else if \(action === 'write'\) result = reportWritePayload_\(payload\)/);
  assert.match(code,/else if \(action === 'pwrite'\) result = personalWritePayload_\(payload\)/);
});

test('a segment with fewer formal fields omits absent metrics instead of inventing zero', () => {
  const summarize=loadSummary();
  const result=summarize({通化:{aq999:1,savedAt:'下午 9:05:00'}},'2026-08-11',21);
  assert.equal(result.metrics.A999.value,1);
  assert.equal(Object.hasOwn(result.metrics,'好速'),false);
  assert.equal(Object.hasOwn(result.metrics,'保險搭售率'),false);
});
