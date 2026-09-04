'use strict';

const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../gas/Code.gs'),'utf8');
const start=source.indexOf("const SUPERVISOR_INTERVIEW_SHEET = '督導面談紀錄'");
const end=source.indexOf('// 每週一巡店週報',start);
assert.ok(start>=0&&end>start,'supervisor interview GAS block not found');
const block=source.slice(start,end);

function harness(today='2026-09-05'){
  const sheets=new Map();
  let spreadsheetOpens=0;
  let lockHeld=false;
  const makeSheet=()=>{
    const values=[];
    return {
      values,
      getLastRow:()=>values.length,
      getLastColumn:()=>values.reduce((max,row)=>Math.max(max,row.length),0),
      appendRow:row=>values.push(row.slice()),
      setFrozenRows:()=>{},
      deleteRow:index=>values.splice(index-1,1),
      getRange(row,column,rowCount,columnCount){
        if(typeof row==='string')return {setNumberFormat:()=>{}};
        return {
          getDisplayValues:()=>Array.from({length:rowCount},(_,offset)=>Array.from({length:columnCount},(_,cell)=>String(values[row-1+offset]?.[column-1+cell]||''))),
          setValues:rows=>rows.forEach((incoming,offset)=>{
            const target=row-1+offset;
            if(!values[target])values[target]=[];
            incoming.forEach((value,cell)=>{values[target][column-1+cell]=value;});
          }),
          setNumberFormat:()=>{}
        };
      }
    };
  };
  const spreadsheet={
    getSheetByName:name=>sheets.get(name)||null,
    insertSheet:name=>{const sheet=makeSheet();sheets.set(name,sheet);return sheet;}
  };
  const context=vm.createContext({
    Array,Object,String,Number,Date,Math,
    SPREADSHEET_ID:'test-sheet',
    SpreadsheetApp:{openById:()=>{spreadsheetOpens+=1;return spreadsheet;}},
    LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(lockHeld,false);lockHeld=true;},releaseLock:()=>{assert.equal(lockHeld,true);lockHeld=false;}})},
    Utilities:{
      DigestAlgorithm:{SHA_256:'sha256'},
      computeDigest:(_algorithm,value)=>[...crypto.createHash('sha256').update(String(value)).digest()],
      formatDate:(_date,_zone,format)=>format==='yyyy-MM-dd'?today:`${today}T12:00:00+08:00`
    },
    ptRequireSession_:token=>{if(token!=='valid-token')throw new Error('unauthorized');},
    readSchedule:()=>({month:today.slice(0,7),stores:[
      {store:'台北通化',staff:[{name:'同仁甲',role:'業代'},{name:'同仁乙',role:'副店'}]},
      {store:'台北酒泉',staff:[{name:'同仁甲',role:'業代'},{name:'同仁丙',role:'店長'}]}
    ]})
  });
  vm.runInContext(block,context);
  return {context,sheets,get spreadsheetOpens(){return spreadsheetOpens;}};
}

function row(overrides={}){
  return {reporter:'督導',organization:'台北通化',interviewee:'同仁甲',reason:'例行人員訪談',formStatus:'已結案',interviewDate:'2026-08-04',filledDate:'2026-08-04',closedDate:'2026-08-05',guidance:'持續追蹤',feedback:'收到',sourceMonth:'2026-08',quarter:'2026-Q3',...overrides};
}

test('面談 GAS 未授權時在讀寫工作表前停止',()=>{
  const env=harness();
  assert.throws(()=>env.context.supervisorInterviewReadPayload_({token:'bad'}),/unauthorized/);
  assert.throws(()=>env.context.supervisorInterviewWritePayload_({token:'bad',rows:[row()]}),/unauthorized/);
  assert.equal(env.spreadsheetOpens,0);
});

test('面談 GAS 拒收員編與跨季度資料',()=>{
  const env=harness();
  assert.throws(()=>env.context.supervisorInterviewWritePayload_({token:'valid-token',rows:[row({employeeId:'123456'})]}),/不允許欄位/);
  assert.throws(()=>env.context.supervisorInterviewWritePayload_({token:'valid-token',rows:[row({interviewDate:'2026-06-30',sourceMonth:'2026-06',quarter:'2026-Q2'})]}),/目前季度/);
  assert.throws(()=>env.context.supervisorInterviewWritePayload_({token:'valid-token',rows:[row({interviewDate:'2026-09-31',sourceMonth:'2026-09'})]}),/面談日期格式不正確/);
  assert.throws(()=>env.context.supervisorInterviewWritePayload_({token:'valid-token',rows:[row({closedDate:'2026-02-30'})]}),/結案日期格式不正確/);
  assert.equal(env.spreadsheetOpens,0);
});

test('同季面談會新增或更新，讀回名冊去重並列出本季紀錄',()=>{
  const env=harness();
  const first=env.context.supervisorInterviewWritePayload_({token:'valid-token',rows:[row()]});
  assert.equal(first.written,1);
  const second=env.context.supervisorInterviewWritePayload_({token:'valid-token',rows:[row({guidance:'更新後指導'})]});
  assert.equal(second.updated,1);
  const result=env.context.supervisorInterviewReadPayload_({token:'valid-token'});
  assert.equal(result.quarter,'2026-Q3');
  assert.equal(result.roster.length,3);
  assert.equal(result.records.length,1);
  assert.equal(result.records[0].guidance,'更新後指導');
  assert.equal(Object.hasOwn(result.records[0],'employeeId'),false);
});

test('新季度讀取先歸零但不刪舊資料，首次成功寫入後才清除上一季',()=>{
  const q3=harness('2026-09-05');
  q3.context.supervisorInterviewWritePayload_({token:'valid-token',rows:[row()]});
  const interviewSheet=q3.sheets.get('督導面談紀錄');

  const q4=harness('2026-10-01');
  q4.sheets.set('督導面談紀錄',interviewSheet);
  const before=q4.context.supervisorInterviewReadPayload_({token:'valid-token'});
  assert.equal(before.quarter,'2026-Q4');
  assert.equal(before.records.length,0);
  assert.equal(interviewSheet.values.length,2,'read does not delete the Q3 row');

  const saved=q4.context.supervisorInterviewWritePayload_({token:'valid-token',rows:[row({interviewDate:'2026-10-01',sourceMonth:'2026-10',quarter:'2026-Q4'})]});
  assert.equal(saved.written,1);
  assert.equal(interviewSheet.values.length,2,'header plus only the new Q4 row');
  assert.equal(interviewSheet.values[1][1],'2026-Q4');
});
