'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {setup}=require('./fixtures/report-save-gas.cjs');
const target={action:'write',date:'2099-10-02',store:'隔離門市',seg:16,data:{aq999:2,haosu:0}};
const mutation=(id,baseRevision='')=>({schema:'report-save-v1',id,baseRevision});
const id1='submission-000000000001',id2='submission-000000000002';
test('Date-valued rows and duplicates update the canonical last row without appending',()=>{
 const {api}=setup();const sh=api.getSheet(),headers=sh.rows[0];
 const row=n=>headers.map(h=>h==='date'?new Date('2099-10-02T00:00:00Z'):h==='store'?target.store:h==='seg'?16:h==='aq999'?n:'');
 sh.appendRow(row(1));sh.appendRow(row(3));api.writeData(target.date,target.store,16,target.data);
 assert.equal(sh.getLastRow(),3);assert.equal(sh.rows[1][headers.indexOf('aq999')],1);assert.equal(api.readData(target.date,16)[target.store].aq999,2);
});
test('same submission has one mutation, server commit evidence, and stale retry cannot overwrite newer data',()=>{
 const s=setup(),{api}=s;const p={...target,mutation:mutation(id1)};
 const first=api.reportWritePayload_(p);assert.equal(first.commitId,id1);assert.match(first.committedAt,/^\d{4}-/);assert.equal(first.readback.aq999,2);
 const sh=s.sheets.get('回報資料'),writes=sh.writes;assert.equal(api.reportWritePayload_(p).commitId,id1);assert.equal(sh.writes,writes);
 const state=api.reportSaveStatus_({...target,kind:'write'});const newer={...target,data:{aq999:9},mutation:mutation(id2,state.revision)};
 api.reportWritePayload_(newer);assert.throws(()=>api.reportWritePayload_(p),/未覆蓋/);assert.equal(api.readData(target.date,16)[target.store].aq999,9);assert.equal(s.held,false);
});
test('personal duplicate rows, context validation, and saved record readback use the same row',()=>{
 const {api}=setup();const sh=api.getPersonalSheet();const record={date:target.date,store:target.store,seg:21,name:'合成同仁',data:{a999:0},extra:{fail_reason:'合成原因'},ts:123};
 const p={action:'pwrite',date:target.date,store:target.store,seg:21,name:record.name,record};
 sh.appendRow([p.date,p.seg,p.store,p.name,JSON.stringify({...record,ts:1}),'old']);sh.appendRow([p.date,p.seg,p.store,p.name,JSON.stringify({...record,ts:2}),'old']);
 const revision=api.reportSaveStatus_({...p,kind:'pwrite'}).revision;
 const saved=api.personalWritePayload_({...p,mutation:mutation(id1,revision)});assert.equal(sh.getLastRow(),3);assert.equal(saved.readback.ts,123);assert.equal(saved.readback._report_commit.id,id1);
 assert.equal(JSON.parse(sh.rows[1][4]).ts,1);
 const current=api.reportSaveStatus_({...p,kind:'pwrite'});assert.throws(()=>api.personalWritePayload_({...p,record:{...record,seg:16},mutation:mutation(id2,current.revision)}),/不一致/);
});
test('award duplicate rows also write the final matching row',()=>{
 const {api,sheets}=setup();api.writeReportAwardModels_(target.date,target.store,16,{});
 const sh=sheets.get('ReportAwardModels');sh.appendRow([...sh.rows[1]]);const count=sh.getLastRow();api.writeReportAwardModels_(target.date,target.store,16,{'pixel-10-family':2});
 assert.equal(sh.getLastRow(),count);assert.equal(JSON.parse(sh.rows[count-1][3])['pixel-10-family'],2);
});
