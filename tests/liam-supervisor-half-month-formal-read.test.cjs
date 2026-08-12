const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const model=require('../half-month-check-read-model.js');
const fixture=require('./fixtures/half-month-hread-fixture.cjs');

const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
const patrol=fs.readFileSync(path.join(root,'patrol.html'),'utf8');

test('formal period rule remains parity with patrol.html canonical H1 and H2',()=>{
  const source=patrol.match(/function halfPeriod\(date\)\{[^}]+\}/)?.[0];
  const canonical=Function(`${source}; return halfPeriod;`)();
  for(const date of ['2026-08-01','2026-08-15','2026-08-16','2026-08-31']) assert.equal(model.periodForDate(date),canonical(date));
  assert.deepEqual(model.periodMeta('2026-08','H1'),{key:'H1',month:'2026-08',label:'2026 年 8 月上半月',dateRange:'8/1–8/15'});
  assert.deepEqual(model.periodMeta('2026-08','H2'),{key:'H2',month:'2026-08',label:'2026 年 8 月下半月',dateRange:'8/16–8/31'});
});

test('formal hread adapter maps blank and na without inventing abnormal or completed',()=>{
  assert.equal(model.resultValue('blank'),'');
  const data=model.adapt({rows:fixture.rows,stores:fixture.STORES,date:'2026-08-12',period:'H1'});
  assert.deepEqual(data.summary,{filledStores:5,totalStores:9,abnormalStores:3,abnormalItems:4,emptyStores:2});
  const liquor=data.stores.find(row=>row.name==='酒泉');
  assert.equal(liquor.answeredItems,18);
  assert.equal(liquor.abnormalCount,0);
  assert.equal(liquor.questions[17].result,'na');
  assert.equal(liquor.questions[17].resultLabel,'不適用');
  const empty=data.stores.find(row=>row.name==='杭州南');
  assert.equal(empty.answeredItems,0);
  assert.equal(empty.questions[0].resultLabel,'尚未填寫');
  assert.equal(Object.prototype.hasOwnProperty.call(liquor,'completed'),false);
});

test('nine stores sort by empty, in progress, full abnormal, then full clean',()=>{
  const data=model.adapt({rows:fixture.rows,stores:fixture.STORES,date:'2026-08-12',period:'H1'});
  assert.deepEqual(data.stores.map(row=>row.name),['通化','杭州南','六張犁','永吉','台北三創','復興南','酒泉','萬大','大稻埕']);
  assert.deepEqual(data.stores.map(row=>row.answeredItems),[0,0,5,12,18,18,18,18,18]);
});

test('three-store item parity preserves status, text, media, period and store',()=>{
  const data=model.adapt({rows:fixture.rows,stores:fixture.STORES,date:'2026-08-12',period:'H1'});
  for(const name of ['酒泉','台北三創','六張犁']){
    const mapped=data.stores.find(row=>row.name===name);
    const source=fixture.rows.filter(row=>row.store===name);
    for(const question of mapped.questions){
      const row=source.find(item=>item.item===question.item)||{};
      assert.equal(question.item,Number(row.item||question.item));
      assert.equal(question.result,String(row.result||''));
      assert.equal(question.note,String(row.note||''));
      assert.equal(question.evidence,String(row.evidenceNames||''));
    }
  }
  assert.equal(data.period.key,'H1');
});

test('runtime uses existing hread and hwrite only, without media upload',()=>{
  assert.match(app,/const PATROL_READ_ACTIONS = new Set\(\['sread','ptread','ptvisit_read','hread'\]\)/);
  assert.match(app,/const PATROL_WRITE_ACTIONS = new Set\(\['ptvisit_write','hwrite'\]\)/);
  assert.match(app,/async function halfMonthWriteRows\(rows\)/);
  assert.doesNotMatch(app,/patrolRead\(['"]half_media_upload['"]/);
});

test('formal recent date is date-only and never fabricates midnight',()=>{
  assert.match(app,/function formatReliableDateOnly\(value, fallback = '—'\)/);
  const halfOverview=app.match(/function renderHalfMonthOverview[\s\S]+?function renderHalfMonthForm/)?.[0]||'';
  assert.match(halfOverview,/formatReliableDateOnly\(store\.latestDate\)/);
  assert.doesNotMatch(halfOverview,/0:00/);
});
