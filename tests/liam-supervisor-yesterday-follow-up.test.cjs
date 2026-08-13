const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const model = require(path.join(root, 'yesterday-follow-up-model.js'));
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');

function store(name, { failed = [], feedback = {} } = {}) {
  return {
    name, storeFeedback:{ reason:'',consult:'',method:'',plan:'',...feedback },
    people:failed.map((person,index) => ({ name:person.name || `人員${index+1}`,status:'fail',failed:person.metrics || [],reason:person.reason || '',improvePlan:person.plan || '' }))
  };
}

test('yesterday model preserves formal 21:00 text and counts only explicit failures or feedback', () => {
  const report={completedStores:9,stores:[
    store('酒泉',{failed:[{name:'王＊明',metrics:['A999','好速'],reason:'原始原因',plan:'原始改善計畫'}]}),
    store('通化',{feedback:{consult:'請益對象原文',method:'改善做法原文',plan:'明日計劃原文'}}),
    store('永吉')
  ]};
  const result=model.adapt({date:'2026-08-12',report});
  assert.equal(result.segment,21);
  assert.equal(result.failedStoreCount,1);
  assert.equal(result.failedPeopleCount,1);
  assert.equal(result.feedbackStoreCount,1);
  assert.equal(result.trackingStoreCount,2);
  assert.equal(result.stores[0].name,'酒泉');
  assert.deepEqual(result.stores[0].failedMetrics,['A999','好速']);
  assert.equal(result.stores[0].failedPeople[0].reason,'原始原因');
  assert.equal(result.stores[1].storeFeedback.consult,'請益對象原文');
  assert.equal(result.stores[1].storeFeedback.method,'改善做法原文');
  assert.equal(result.stores[1].storeFeedback.plan,'明日計劃原文');
});

test('no formal yesterday 21:00 rows stays explicit no-data and never borrows 16:00', () => {
  const result=model.adapt({date:'2026-08-12',report:{completedStores:0,stores:[]}});
  assert.equal(result.formalDataAvailable,false);
  assert.equal(result.trackingStoreCount,0);
  assert.match(app, /postReadOnly\(\{action:'read',date,seg:21,/);
  assert.match(app, /postReadOnly\(\{action:'pread',date,seg:21,/);
  const loader=app.slice(app.indexOf('async function loadYesterdayFollowUp'),app.indexOf('async function requestDeviceBinding'));
  assert.doesNotMatch(loader,/seg:16/);
  assert.match(app,/昨日 21:00 無正式資料/);
});

test('yesterday loading is independent from current report tasks and is visible on home/report', () => {
  assert.match(app, /loadYesterdayFollowUp\(credential\);/);
  assert.doesNotMatch(app, /await loadYesterdayFollowUp\(credential\)/);
  assert.match(html, /id="yesterdayFollowUpHome"/);
  assert.match(html, /id="yesterdayFollowUpPanel"/);
  assert.match(html, /正式 21:00 原文/);
  assert.match(app, /renderYesterdayFollowUp\(\)/);
});
