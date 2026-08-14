const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const model = require(path.join(root, 'yesterday-follow-up-model.js'));
const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8');

function store(name, { reported = true, failed = [], feedback = {} } = {}) {
  return {
    name, reported, storeFeedback:{ reason:'',consult:'',method:'',plan:'',...feedback },
    people:failed.map((person,index) => ({
      name:person.name || `人員${index+1}`, status:'fail', failed:person.metrics || [],
      reason:person.reason || '', improvePlan:person.plan || ''
    }))
  };
}

test('yesterday 21:00 model preserves formal text and separates consult from other feedback', () => {
  const report={stores:[
    store('酒泉',{failed:[{name:'王＊明',metrics:['A999','好速'],reason:'正式未過原因',plan:'正式個人追蹤'}]}),
    store('通化',{feedback:{consult:'正式請益對象',method:'正式改善做法',plan:'正式明日計畫'}}),
    store('永吉',{feedback:{reason:'正式零報原因'}}),
    store('萬大')
  ]};
  const result=model.adapt({date:'2026-08-13',report});
  assert.equal(result.segment,21);
  assert.equal(result.formalDataAvailable,true);
  assert.equal(result.failedStoreCount,1);
  assert.equal(result.failedPeopleCount,1);
  assert.equal(result.consultStoreCount,1);
  assert.equal(result.trackingStoreCount,3);
  assert.equal(result.stores[0].name,'酒泉');
  assert.deepEqual(result.stores[0].failedMetrics,['A999','好速']);
  assert.equal(result.stores[0].failedPeople[0].reason,'正式未過原因');
  assert.equal(result.stores[0].failedPeople[0].improvePlan,'正式個人追蹤');
  assert.equal(result.stores[1].storeFeedback.consult,'正式請益對象');
  assert.equal(result.stores[2].storeFeedback.reason,'正式零報原因');
});

test('no reported yesterday 21:00 rows is explicit no-data', () => {
  const result=model.adapt({date:'2026-08-13',report:{stores:[store('酒泉',{reported:false})]}});
  assert.equal(result.formalDataAvailable,false);
  assert.equal(result.trackingStoreCount,0);
  assert.match(app,/昨日 21:00 尚無正式資料/);
});

test('loader reads yesterday 21:00 only and never falls back to 16:00', () => {
  const loader=app.slice(app.indexOf('async function loadYesterdayFollowUp'),app.indexOf('async function requestDeviceBinding'));
  assert.match(loader,/postReadOnly\(\{action:'read',date,seg:21,/);
  assert.match(loader,/postReadOnly\(\{action:'pread',date,seg:21,/);
  assert.doesNotMatch(loader,/seg:16|report1600/);
  assert.match(loader,/await Promise\.all\(\[/);
});

test('transport failure is fail-closed and cannot render zero-shaped follow-up', () => {
  const loader=app.slice(app.indexOf('async function loadYesterdayFollowUp'),app.indexOf('async function requestDeviceBinding'));
  assert.match(loader,/catch\(error\) \{\s*yesterdayFollowUpModule=yesterdayFailureModule\(error\)/);
  assert.doesNotMatch(loader,/Promise\.allSettled/);
  assert.match(app,/return statusModule\('yesterdayFollowUp','error',null,note\)/);
  assert.match(app,/readErrorNote\(error,'昨日 21:00 正式資料'\)/);
  assert.doesNotMatch(loader,/\|\|\s*0/);
});

test('yesterday loading is independent from current 16:00 and 21:00 report tasks', () => {
  assert.match(app,/loadYesterdayFollowUp\(credential\);/);
  assert.doesNotMatch(app,/await loadYesterdayFollowUp\(credential\)/);
  assert.match(html,/id="yesterdayFollowUpHome"/);
  assert.match(html,/id="yesterdayFollowUpPanel"/);
  assert.match(html,/僅讀正式 21:00/);
});

test('feature remains read-only and does not add backend or native behavior', () => {
  assert.doesNotMatch(app,/action:'(?:write|pwrite|hwrite|half_media_upload)'/);
  assert.doesNotMatch(app,/ptauth_device|private_patrol_assertion|app-runtime-config/);
});
