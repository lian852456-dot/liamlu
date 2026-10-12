'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../gas/Code.gs'), 'utf8');
const questions = require('../patrol-question-versions.js');
const {stores, row, october, september} = require('./fixtures/patrol-report-versions.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
function runtime(rows = [], day = 5, month = '2026-10') {
  const mails = [], sheets = [], effects = [];
  const api = {};
  const context = vm.createContext({
    PropertiesService:{getScriptProperties:() => ({getProperty:() => 'SYNTHETIC@example.invalid'})},
    Utilities:{formatDate:(date, tz, format) => ({'yyyy-MM':month,'yyyy-MM-dd':month + '-' + String(day).padStart(2,'0'),d:String(day)})[format]},
    SpreadsheetApp:{create:() => {
      effects.push('temporary workbook');
      const newSheet = () => {
        const sheet = {name:'',grid:[],formats:[], setName(name){this.name=name;}, setFrozenRows(){},
          getRange(...range){return {setNumberFormat:format => {assert.equal(sheet.grid.length,0); sheet.formats.push({range,format});},
            setValues:grid => {sheet.grid=plain(grid);}};}};
        sheets.push(sheet); return sheet;
      };
      const first = newSheet();
      return {getSheets:() => [first],insertSheet:newSheet,getId:() => 'SYNTHETIC-ONLY'};
    },flush:() => effects.push('flush')},
    UrlFetchApp:{fetch:() => ({getBlob:() => ({setName:() => ({synthetic:true})})})},
    ScriptApp:{getOAuthToken:() => 'SYNTHETIC-NOT-A-TOKEN'},
    MailApp:{sendEmail:(...args) => mails.push(plain(args))},
    DriveApp:{getFileById:id => ({setTrashed:value => effects.push([id,value])})},
  });
  vm.runInContext(source + '\n globalThis.api = {ptReportVersion_, ptReportText_, ptReportMonth_, ptReportStoreRows_, ptReportItem_, ptReportAware_, ptReportVisits_, buildWeeklyPatrolReportModel_, texts:PT_REPORT_SEP25_TEXT};', context);
  Object.assign(api, context.api);
  context.fixtureRows = rows;
  context.fixtureStores = stores;
  vm.runInContext(`readPatrol = () => fixtureRows;
    buildWeeklyHalfCheckTab = () => ({rows:[['synthetic half-check']],sourceCount:0,photoCount:0});
    formatWeeklyHalfCheckSheet = () => {};
    getPatrolSheet = () => ({getDataRange:() => ({getValues:() => {
      const headers = ['store','code','item','result','month','fillTime'];
      return [headers].concat(fixtureRows.map(row => headers.map(header => row[header])));
    }})});`, context);
  return {api,context,mails,sheets,effects};
}

test('pure date policy and exact labels switch at 8/31 -> 9/1; canonical texts match', () => {
  const {api} = runtime();
  assert.deepEqual(plain(api.texts), Object.fromEntries(questions.SEP25_ITEMS.map(item => [item.no,item.text])));
  assert.equal(api.ptReportText_(row(stores[0],3,'na','2026/08/31')), '中島展示機無不當資訊且開機恆亮');
  assert.match(api.ptReportText_(row(stores[0],3,'na','2026/09/01')), /第二次巡檢/);
  assert.deepEqual(plain(api.ptReportVersion_('2026-08').ncc), Array.from({length:15},(_,i)=>i+19));
  assert.deepEqual(plain(api.ptReportVersion_('2026-09').ncc), questions.SEP25_GROUPS.ncc);
  assert.throws(()=>api.ptReportVersion_('2026-13'));
});

test('same 75 October rows produce three 15／15題 and 3/9; details preserve data', () => {
  const {api} = runtime();
  const before = JSON.stringify(october);
  const model = api.buildWeeklyPatrolReportModel_(october,stores,'2026-10',5);
  assert.equal(model.doneAware,3);
  assert.equal(model.monthlyDone,0,'second inspection question3 is NA, cannot claim monthly full completion');
  assert.equal(model.tabs[0][1].length,75 + 1);
  assert.deepEqual(plain(model.aware.filter(r=>r.complete).map(r=>r.progress)), ['15／15題','15／15題','15／15題']);
  for(const record of october) {
    const detail = model.tabs[0][1].find(r=>r[0]===record.fillTime && r[1]===record.store && r[2]===record.item);
    assert.equal(detail[4],record.result);
    assert.equal(detail[5],record.reason);
    assert.equal(detail[3],questions.SEP25_BY_NO[record.item].text);
  }
  assert.equal(JSON.stringify(october),before);
  assert.equal(model.tabs[3][1][1][9].startsWith('✓'),true,'cash question9 remains v');
});

test('bimonthly is 4/9; September v survives October na; old18 cannot complete modern10', () => {
  const {api} = runtime();
  const model = api.buildWeeklyPatrolReportModel_([...september,...october],stores,'2026-10',5);
  assert.equal(model.done18,4);
  assert.equal(model.tabs[4][0],'雙月全盤10');
  assert.match(model.tabs[4][1][1][1],/已完成/);
  assert.match(model.tabs[4][1][2][1],/NA/);
  assert.doesNotMatch(model.tabs[4][1][2][1],/逾期|不合格|✗/);
  const next = api.buildWeeklyPatrolReportModel_([...september,...october],stores,'2026-11',5);
  assert.equal(next.done18,0);
  assert.equal(next.tabs[4][1].slice(1).filter(r=>r[3] !== '—').length,4,'previous period uses question10');
  const septemberModel = api.buildWeeklyPatrolReportModel_([row(stores[0],18,'v','2026/08/31'),row(stores[0],10,'v','2026/09/01')],stores,'2026-09',5);
  assert.equal(septemberModel.tabs[4][1][1][3],'08/31','previous July/August uses old18');
});

test('NA, pending and no matching records remain distinguishable; incomplete date stays dash', () => {
  const {api} = runtime();
  assert.equal(api.ptReportItem_([row(stores[0],10,'na','2026/10/01')],10,['2026-10']).status,'na');
  assert.equal(api.ptReportItem_([row(stores[0],10,'x','2026/10/01')],10,['2026-10']).status,'pending');
  assert.equal(api.ptReportItem_([],10,['2026-10']).status,'missing');
  const result = api.ptReportAware_([row(stores[0],11,'na','2026/10/01')],'2026-10',15);
  assert.match(result.state,/NA.*未查到紀錄/);
  assert.doesNotMatch(result.state,/逾期|不合格/);
  assert.equal(result.date,'—');
});

test('modern visit cadence counts different arrival dates at seven days, no half-month rule', () => {
  const {api} = runtime();
  const first = row(stores[0],1,'na','2026/10/02',{arriveTime:'2026/10/01'});
  const six = row(stores[0],1,'na','2026/10/08',{arriveTime:'2026/10/07'});
  const seven = row(stores[0],1,'na','2026/10/09',{arriveTime:'2026/10/08'});
  assert.equal(api.ptReportVisits_([first,six,six],'2026-10')[0],'1／2次');
  assert.equal(api.ptReportVisits_([first,seven],'2026-10')[0],'2／2次');
});

test('August keeps old groups, half-month checks and two-month18 accumulation', () => {
  const {api} = runtime();
  const legacy = [1,20].flatMap(day=>Array.from({length:33},(_,i)=>row(stores[0],i+1,'v',`2026/08/${String(day).padStart(2,'0')}`)));
  const model = api.buildWeeklyPatrolReportModel_(legacy,stores,'2026-08',31);
  assert.equal(model.monthlyDone,1); assert.equal(model.doneAware,1); assert.equal(model.done18,1);
  assert.deepEqual(plain(model.tabs.map(t=>t[0])), ['巡店紀錄','未巡店','上下半月2-13','每月盤點14-17','雙月全盤18','知悉20日前19-33']);
  assert.equal(model.tabs[2][1][1].slice(1).every(x=>x==='完成'),true);
});

test('mocked weekly export sets text BEFORE values; all seven tabs and subject use modern policy', () => {
  const runtimeData = runtime([...september,...october]);
  vm.runInContext('sendWeeklyPatrolReport()',runtimeData.context);
  assert.equal(runtimeData.sheets.length,7);
  const sheet = runtimeData.sheets.find(s=>s.name==='知悉20日前11-25');
  assert.deepEqual(sheet.formats,[{range:[2,2,9,1],format:'@'}]);
  assert.equal(runtimeData.sheets.filter(s=>s.formats.length).length,1,'text format scoped to progress column');
  const completeRow = sheet.grid.find(r=>r[0]===stores[0].name);
  assert.equal(completeRow[1],'15／15題');
  assert.equal(typeof completeRow[1],'string');
  assert.equal(sheet.grid.find(r=>r[0]===stores[1].name)[3],'—');
  assert.match(runtimeData.mails[0][1],/25 項/);
  assert.match(runtimeData.mails[0][2],/知悉\(11-25\).*3\/9/);
  assert.match(runtimeData.mails[0][2],/雙月全盤10.*4\/9/);
  assert.doesNotMatch(runtimeData.mails[0][2],/14-17|19-33|全盤\(18\)/);
});

test('mocked reminder at15 and20 never includes completed stores in incomplete list', () => {
  for(const day of [15,20]) {
    const data = runtime(october,day);
    vm.runInContext('checkAwareAndNotify()',data.context);
    const body = data.mails[0][2];
    const incomplete = body.split('🔴 未完成')[1].split('✅ 已完成')[0];
    for(const index of [0,4,7]) assert.equal(incomplete.includes(stores[index].name),false);
    assert.match(body,/題11-25/);
    assert.match(body,/20日前/);
    assert.doesNotMatch(body,/逾期/);
    assert.equal(data.effects.length,0,'reminder test has no sheet creation or remote write');
  }
});

test('completed after20 cannot falsely claim completion before deadline', () => {
  const all = stores.flatMap(store=>Array.from({length:15},(_,i)=>row(store,i+11,'v','2026/10/21')));
  const data = runtime(all,22);
  vm.runInContext('checkAwareAndNotify()',data.context);
  assert.match(data.mails[0][2],/逾20日/);
  assert.doesNotMatch(data.mails[0][2],/皆已於期限前/);
});

test('native Sheet Date values use Asia/Taipei date in progress and labels', () => {
  const {api} = runtime();
  const rows = Array.from({length:15},(_,i)=>row(stores[0],i+11,'v','2026/10/01',{
    fillTime:new Date('2026-09-30T16:30:00Z')
  }));
  assert.equal(api.ptReportAware_(rows,'2026-10',5).date,'10/01');
  assert.match(api.ptReportText_({item:3,fillTime:new Date('2026-08-31T16:30:00Z'),month:'2026-09'}),/第二次巡檢/);
});

test('missing month falls back to arrival/fill date consistently in details, progress and reminders', () => {
  const rows = october.map(r=>({...r,month:''}));
  const data=runtime(rows,15);
  const model=data.api.buildWeeklyPatrolReportModel_(rows,stores,'2026-10',15);
  assert.equal(model.doneAware,3);
  assert.equal(model.tabs[0][1].length,76);
  assert.equal(data.api.ptReportMonth_({month:'2026-09',fillTime:'2026/10/01'}),'2026-09','explicit valid month wins');
  assert.equal(data.api.ptReportMonth_({month:'',arriveTime:'2026/09/30',fillTime:'2026/10/01'}),'2026-09','arrival fallback wins');
  vm.runInContext('checkAwareAndNotify()',data.context);
  const incomplete=data.mails[0][2].split('🔴 未完成')[1].split('✅ 已完成')[0];
  for(const index of [0,4,7]) assert.equal(incomplete.includes(stores[index].name),false);
});

test('same ISO instant and native Date select Taipei September policy at boundary', () => {
  const {api}=runtime();
  for(const fillTime of ['2026-08-31T16:30:00Z','2026-08-31T09:30:00-07:00',new Date('2026-08-31T16:30:00Z')]) {
    assert.equal(api.ptReportMonth_({fillTime}),'2026-09');
    assert.match(api.ptReportText_({fillTime,item:3}),/第二次巡檢/);
  }
  const legacy=[row(stores[0],2,'v','2026/08/01',{fillTime:'2026-08-01T01:00:00Z'}),
    row(stores[0],2,'v','2026/08/20',{fillTime:new Date('2026-08-20T01:00:00Z')})];
  assert.equal(api.buildWeeklyPatrolReportModel_(legacy,stores,'2026-08',31).tabs[2][1][1][1],'完成');
});

test('ambiguous short alias cannot mark nine stores complete; exact normalized names and code remain valid', () => {
  const {api}=runtime();
  const ambiguous=Array.from({length:15},(_,i)=>row(stores[0],i+11,'v','2026/10/01',{store:'台北',code:''}));
  const model=api.buildWeeklyPatrolReportModel_(ambiguous,stores,'2026-10',15);
  assert.equal(model.doneAware,0);
  assert.equal(model.notVisited.length,9);
  for(const store of ['酒泉','台北酒泉','台灣大哥大數位生活台北酒泉']) {
    assert.equal(api.ptReportStoreRows_([{store,code:''}],stores[0]).length,1);
  }
  assert.equal(api.ptReportStoreRows_([{store:'',code:stores[0].code}],stores[0]).length,1);
  assert.equal(api.ptReportStoreRows_([{store:'台北',code:''}],stores[0]).length,0);
  const data=runtime(ambiguous,15);
  vm.runInContext('checkAwareAndNotify()',data.context);
  assert.match(data.mails[0][1],/尚有 9 店未完成/);
});
