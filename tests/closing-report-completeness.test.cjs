'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const helpers = html.slice(html.indexOf('function closingReportNumber('), html.indexOf('function getFormData('));
const storage = html.slice(html.indexOf('async function saveToStorage('), html.indexOf('function pct('));
const valid = { aq999:0, haosu:0, rt1399:0, rt999:0, insurance_num:0, insurance_den:2, insurance_pct:0, awardModels:{'pixel-11':0} };
function api(extra = {}) {
  const context = { ...extra };
  vm.runInNewContext(helpers, context);
  return context;
}

test('empty counts are blocked while explicitly entered zero counts are accepted', () => {
  const c = api();
  assert.equal(c.closingReportIssues(valid, 21).length, 0);
  for (const key of ['aq999','haosu','rt1399','rt999','insurance_num','insurance_den']) {
    for (const value of [null, undefined, '', ' ', NaN, Infinity, -1, true]) {
      assert.ok(c.closingReportIssues({...valid, [key]:value}, 21).some(issue => issue.key === key), key);
    }
  }
  assert.equal(c.closingReportIssues({}, 16).length, 0, 'afternoon partial reports remain available');
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

test('formal readback must match the requested date, store, segment and all closing fields', () => {
  const c = api();
  const date = '2099-10-02', store = '酒泉';
  const row = {...valid, date, store, seg:21};
  const response = {status:'ok', data:{[store]:row}};
  c.assertClosingReportReadback(response, date, store, 21, valid);
  for (const patch of [{date:'2099-10-01'}, {store:'永吉'}, {seg:16}, {aq999:''}, {haosu:2}, {insurance_pct:50}]) {
    assert.throws(() => c.assertClosingReportReadback({status:'ok', data:{[store]:{...row,...patch}}}, date, store, 21, valid));
  }
  assert.throws(() => c.assertClosingReportReadback({status:'error', data:{[store]:row}}, date, store, 21, valid));
});

test('award-model success alone cannot update local shadow or report a successful save', async () => {
  const date = '2099-10-02', store = '酒泉';
  let writes = 0, calls = 0;
  const c = api({
    GAS_URL:'mock', _cache:{}, showToast() {}, cacheKey:()=> 'mock',
    writeLocalShadow() { writes++; },
    async privateDashboardPost(payload) {
      calls++;
      if (payload.action === 'write') return {
        status:'ok', rowWritten:true, spreadsheetId:'mock', sheetName:'ReportAwardModels',
        date, store, seg:21, readbackMatches:true, readback:{awardModels:valid.awardModels}
      };
      return {status:'ok', data:{[store]:{...valid,date,store,seg:21,aq999:''}}};
    }
  });
  vm.runInNewContext(storage, c);
  await assert.rejects(c.saveToStorage(date, store, 21, valid), /讀回不一致/);
  assert.equal(calls, 2);
  assert.equal(writes, 0);
  assert.equal(Object.keys(c._cache).length, 0);
});

test('missing closing fields are rejected before writing any formal data', async () => {
  let calls = 0;
  const c = api({GAS_URL:'mock', privateDashboardPost() { calls++; }});
  vm.runInNewContext(storage, c);
  await assert.rejects(c.saveToStorage('2099-10-02','酒泉',21,{...valid,aq999:null}), /A999/);
  assert.equal(calls, 0);
});

test('complete persisted closing report updates local state only after readback', async () => {
  const date='2099-10-02', store='酒泉';
  const actions=[];
  const c=api({
    GAS_URL:'mock', _cache:{}, cacheKey:()=> 'mock',
    writeLocalShadow() { actions.push('shadow'); },
    async privateDashboardPost(payload) {
      actions.push(payload.action);
      return payload.action === 'write' ? {
        status:'ok', rowWritten:true, spreadsheetId:'mock', sheetName:'ReportAwardModels',
        date,store,seg:21,readbackMatches:true,readback:{awardModels:valid.awardModels}
      } : {status:'ok',data:{[store]:{...valid,date,store,seg:21}}};
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
      if(id==='fillDate') return {value:'2099-10-02'};
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
