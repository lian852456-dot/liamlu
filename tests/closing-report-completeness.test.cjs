'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const helpers = html.slice(html.indexOf('function managementDefinitionsForDate('), html.indexOf('function getFormData('));
const storage = html.slice(html.indexOf('async function saveToStorage('), html.indexOf('function pct('));
const MANAGEMENT_FOCUS_MONTHS = {
  '2026-10': [
    {id:'op',label:'OP 上線／累積／目標',fields:[
      {key:'online',label:'OP 上線',unit:'筆'},{key:'cumulative',label:'OP 累積',unit:'筆'},{key:'target',label:'OP 目標',unit:'筆'}
    ]},
    {id:'mycharge-ebm',label:'⚡ MyCharge EBM系統貼標點選',fields:[
      {key:'clicked',label:'已點選',unit:'筆'},{key:'taggedToday',label:'今日貼標數',unit:'筆'}
    ],ratio:{key:'rate',numerator:'clicked',denominator:'taggedToday',label:'點選率'}}
  ]
};
const management = JSON.stringify({
  schemaVersion:'management-focus-v1',month:'2026-10',items:[
    {id:'op',label:'OP 上線／累積／目標',values:{online:0,cumulative:3,target:10}},
    {id:'mycharge-ebm',label:'⚡ MyCharge EBM系統貼標點選',values:{clicked:2,taggedToday:4,rate:50}}
  ]
});
const valid = {
  date:'2026-10-02', aq999:0, aq1399:0, haosu:0, rt1399:0, rt999:0,
  insurance_num:0, insurance_den:2, insurance_pct:0, management_json:management
};
function api(extra = {}) {
  const context = { MANAGEMENT_FOCUS_MONTHS, ...extra };
  vm.runInNewContext(helpers, context);
  return context;
}

test('empty closing counts are blocked while explicitly entered zero counts are accepted', () => {
  const c = api();
  assert.equal(c.closingReportIssues(valid, 21).length, 0);
  for (const key of ['aq999','aq1399','haosu','rt1399','rt999','insurance_num','insurance_den']) {
    for (const value of [null, undefined, '', ' ', NaN, Infinity, -1, true]) {
      assert.ok(c.closingReportIssues({...valid, [key]:value}, 21).some(issue => issue.key === key), key);
    }
  }
  assert.equal(c.closingReportIssues({}, 16).length, 0, 'afternoon partial reports remain available');
});

test('management focus is mandatory at 21:00 and validates MyCharge numerator/denominator', () => {
  const c = api();
  assert.equal(c.closingReportIssues(valid,21).length,0);
  const parsed=JSON.parse(management);
  parsed.items[0].values.target=null;
  assert.ok(c.closingReportIssues({...valid,management_json:JSON.stringify(parsed)},21).some(issue=>/OP 目標/.test(issue.label)));
  parsed.items[0].values.target=10;
  parsed.items[1].values.clicked=5;
  parsed.items[1].values.taggedToday=4;
  assert.ok(c.closingReportIssues({...valid,management_json:JSON.stringify(parsed)},21).some(issue=>/不可大於/.test(issue.label)));
});

test('insurance zero numerator/denominator is valid without inventing a zero percentage', () => {
  const c = api();
  const data = {...valid, insurance_den:0, insurance_pct:null};
  assert.equal(c.closingReportIssues(data, 21).length, 0);
  assert.equal(data.insurance_pct, null);
  assert.ok(c.closingReportIssues({...data, insurance_pct:100}, 21).length);
});

test('inconsistent insurance data cannot be submitted as a complete report', () => {
  const c = api();
  assert.ok(c.closingReportIssues({...valid, insurance_num:3}, 21).length);
  assert.ok(c.closingReportIssues({...valid, insurance_num:1, insurance_pct:0}, 21).length);
  assert.equal(c.closingReportIssues({...valid, insurance_num:1, insurance_den:3, insurance_pct:33.3}, 21).length, 0);
});

test('formal readback must match the requested identity, closing fields and management focus', () => {
  const c = api();
  const date = '2026-10-02', store = '酒泉';
  const row = {...valid, date, store, seg:21};
  const response = {status:'ok', data:{[store]:row}};
  c.assertClosingReportReadback(response, date, store, 21, valid);
  for (const patch of [{date:'2026-10-01'}, {store:'永吉'}, {seg:16}, {aq999:''}, {aq1399:2}, {haosu:2}, {insurance_pct:50}, {management_json:'{}'}]) {
    assert.throws(() => c.assertClosingReportReadback({status:'ok', data:{[store]:{...row,...patch}}}, date, store, 21, valid));
  }
  assert.throws(() => c.assertClosingReportReadback({status:'error', data:{[store]:row}}, date, store, 21, valid));
});

test('16:00 readback protects KPI achievement and company rank for 21:00 carry-over', () => {
  const c=api();
  const date='2026-10-02', store='酒泉';
  const expected={kpi:92.5,rank:188};
  c.assertClosingReportReadback({status:'ok',data:{[store]:{...expected,date,store,seg:16}}},date,store,16,expected);
  assert.throws(()=>c.assertClosingReportReadback({status:'ok',data:{[store]:{...expected,rank:189,date,store,seg:16}}},date,store,16,expected));
});

test('write success without report readback cannot update local shadow', async () => {
  const date = '2026-10-02', store = '酒泉';
  let writes = 0, calls = 0;
  const c = api({
    GAS_URL:'mock', _cache:{}, showToast() {}, cacheKey:()=> 'mock',
    writeLocalShadow() { writes++; },
    async privateDashboardPost(payload) {
      calls++;
      return {status:'ok',rowWritten:true,date,store,seg:21};
    }
  });
  vm.runInNewContext(storage, c);
  await assert.rejects(c.saveToStorage(date, store, 21, valid), /讀回驗證/);
  assert.equal(calls, 1);
  assert.equal(writes, 0);
  assert.equal(Object.keys(c._cache).length, 0);
});

test('missing closing fields are rejected before writing any formal data', async () => {
  let calls = 0;
  const c = api({GAS_URL:'mock', privateDashboardPost() { calls++; }});
  vm.runInNewContext(storage, c);
  await assert.rejects(c.saveToStorage('2026-10-02','酒泉',21,{...valid,aq999:null}), /A999/);
  assert.equal(calls, 0);
});

test('complete persisted closing report updates local state only after readback', async () => {
  const date='2026-10-02', store='酒泉';
  const actions=[];
  const row={...valid,date,store,seg:21};
  const c=api({
    GAS_URL:'mock', _cache:{}, cacheKey:()=> 'mock',
    writeLocalShadow() { actions.push('shadow'); },
    async privateDashboardPost(payload) {
      actions.push(payload.action);
      return payload.action === 'write'
        ? {status:'ok',rowWritten:true,date,store,seg:21,reportReadback:row}
        : {status:'ok',data:{[store]:row}};
    }
  });
  vm.runInNewContext(storage,c);
  assert.equal(await c.saveToStorage(date,store,21,valid),true);
  assert.deepEqual(actions,['write','read','shadow']);
  assert.equal(c._cache.mock[store].aq999,0);
});

test('save button stops missing data before the zero-case explanation modal', async () => {
  let modal=0, saves=0, focused;
  const error={hidden:true,textContent:''};
  const c=api({
    GAS_URL:'mock',currentSeg:21,_zeroPending:null,
    getSelectedStore:()=> '酒泉',getFormData:()=> ({...valid,aq999:null}),
    document:{getElementById(id) {
      if(id==='closingReportError') return error;
      if(id==='fillDate') return {value:'2026-10-02'};
      return {focus() {focused=id;}};
    }},
    showToast() {}, openZeroModal() {modal++;}, _doSave() {saves++;}
  });
  const start=html.lastIndexOf('async function saveData()');
  vm.runInNewContext(html.slice(start,html.indexOf('async function _doSave(',start)),c);
  await c.saveData();
  assert.equal(modal,0);
  assert.equal(saves,0);
  assert.equal(error.hidden,false);
  assert.match(error.textContent,/A999/);
  assert.equal(focused,'f_aq999');
});
