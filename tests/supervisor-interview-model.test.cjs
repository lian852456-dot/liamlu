const test=require('node:test');
const assert=require('node:assert/strict');
const model=require('../supervisor-interview-model.js');

const headers=['填報人員','面談人員組織','面談人員編號','面談人員','面談原因','表單狀態','面談日期','填表日期','結案日期','建議與指導','同仁回饋'];

test('七月照片對應的十一欄可正規化，員編不進雲端 payload',()=>{
  const parsed=model.parseMatrix([
    ['季度面談匯出'],
    headers,
    ['督導A','台北測試店','123456','同仁A','例行人員訪談','已結案','2026/7/29','2026/7/29','2026/7/30','指導內容','回饋內容']
  ]);
  assert.equal(parsed.blocked,false);
  assert.equal(parsed.rows.length,1);
  assert.equal(parsed.employeeIdsDiscarded,1);
  assert.equal(parsed.rows[0].sourceMonth,'2026-07');
  assert.equal(parsed.rows[0].quarter,'2026-Q3');
  assert.equal(Object.hasOwn(parsed.rows[0],'employeeId'),false);
  assert.equal(JSON.stringify(parsed.rows).includes('123456'),false);
});

test('七八九月皆歸入第三季，最近三個月按月份完整產生',()=>{
  assert.equal(model.quarterForDate('2026/7/8'),'2026-Q3');
  assert.equal(model.quarterForDate('2026/8/12'),'2026-Q3');
  assert.equal(model.quarterForDate('2026/9/30'),'2026-Q3');
  assert.deepEqual(model.monthsEnding('2026-09',3),['2026-07','2026-08','2026-09']);
  assert.deepEqual(model.quarterMonths('2026-Q3'),['2026-07','2026-08','2026-09']);
  assert.deepEqual(model.quarterMonths('2026-Q4'),['2026-10','2026-11','2026-12']);
  assert.equal(model.currentQuarter(new Date(2026,8,30)),'2026-Q3');
  assert.equal(model.currentQuarter(new Date(2026,9,1)),'2026-Q4');
});

test('缺欄或無效日期整批停止，不留下部分資料',()=>{
  const missing=model.parseMatrix([headers.slice(0,-1),['督導A','台北測試店','123456','同仁A','例行人員訪談','已結案','2026/7/29','2026/7/29','2026/7/30','指導內容']]);
  assert.equal(missing.blocked,true);
  const invalid=model.parseMatrix([headers,['督導A','台北測試店','123456','同仁A','例行人員訪談','已結案','########','2026/7/29','2026/7/30','指導內容','回饋內容']]);
  assert.equal(invalid.blocked,true);
  assert.deepEqual(invalid.rows,[]);
});

test('新季度只計算本季已結案紀錄，十月自動全員重設',()=>{
  const roster=[
    {name:'同仁 A',store:'台北測試店',role:'業代'},
    {name:'同仁B',store:'台北測試店',role:'副店'},
    {name:'同仁C',store:'台北另一店',role:'店長'}
  ];
  const records=[
    {interviewee:'同仁A',quarter:'2026-Q3',formStatus:'已結案',interviewDate:'2026-08-12'},
    {interviewee:'同仁B',quarter:'2026-Q3',formStatus:'處理中',interviewDate:'2026-09-01'},
    {interviewee:'同仁C',quarter:'2026-Q2',formStatus:'已結案',interviewDate:'2026-06-30'}
  ];
  const q3=model.quarterProgress(roster,records,'2026-Q3');
  assert.deepEqual({total:q3.total,completed:q3.completed,inProgress:q3.inProgress,missing:q3.missing},{total:3,completed:1,inProgress:1,missing:1});
  const q4=model.quarterProgress(roster,records,'2026-Q4');
  assert.deepEqual({total:q4.total,completed:q4.completed,inProgress:q4.inProgress,missing:q4.missing},{total:3,completed:0,inProgress:0,missing:3});
  assert.deepEqual(q4.rows.map(row=>row.status),['not_interviewed','not_interviewed','not_interviewed']);
});
