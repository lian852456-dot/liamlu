const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('App loads the shared September question model before its read adapters',()=>{
  const html=read('app.html');
  const questionIndex=html.indexOf('patrol-question-versions.js?v=app-sep25-20260903-2');
  const halfIndex=html.indexOf('half-month-check-read-model.js?v=app-sep25-20260903-2');
  const appIndex=html.indexOf('app.js?v=app-sep25-20260903-2');
  assert.ok(questionIndex>0&&questionIndex<halfIndex&&halfIndex<appIndex);
  assert.match(html,/id="patrolMileage"/);
  assert.match(html,/督導到店檢查/);
});

test('September App patrol reads ptdetail and mileage without adding a patrol write route',()=>{
  const app=read('app.js');
  assert.match(app,/Q\.isSep25Month\(month\)/);
  assert.match(app,/Q\.overview\(rows,definitions,month\)/);
  assert.match(app,/patrolRead\('ptdetail',\{month:task\.month,store:task\.store,page,limit:100\}\)/);
  assert.match(app,/patrolRead\('ptmileage2',\{month\}\)/);
  assert.match(app,/新版 25 項進度/);
  assert.match(app,/兩次間隔 <b>至少 7 天<\/b>/);
  assert.match(app,/每日移動里程/);
  assert.match(app,/ptdetail:60_000/);
  assert.doesNotMatch(app,/PATROL_WRITE_ACTIONS = new Set\(\[[^\]]*(?:ptwrite|hwrite|ptmileage)/);
});

test('App mileage keeps Taipei dates and the controlled three-store route distances',()=>{
  const app=read('app.js');
  const source=app.match(/function mileageVisitDateTime\(value\) \{[\s\S]+?\n  \}\n\n  function adaptPatrolMileage/)?.[0].replace(/\n\n  function adaptPatrolMileage[\s\S]*$/,'');
  assert.ok(source);
  const parse=Function(`${source}; return mileageVisitDateTime;`)();
  assert.deepEqual(parse('2026-09-02T16:30:00Z'),{date:'2026-09-03',time:'00:30'});
  assert.match(app,/\['台北三創\|通化',3\.6\]/);
  assert.match(app,/\['通化\|萬大',7\.4\]/);
  assert.match(app,/patrol-mileage-visits-v2/);
});

test('App supervisor visit adapter switches to questions 1–9 on September 1 and preserves August 18 items',()=>{
  const context=vm.createContext({globalThis:{},window:{}});
  context.window=context.globalThis;
  vm.runInContext(read('patrol-question-versions.js'),context);
  vm.runInContext(read('half-month-check-read-model.js'),context);
  const model=context.globalThis.LiamHalfMonthCheckReadModel;
  const rows=Array.from({length:10},(_,index)=>({
    store:'通化',month:'2026-09',date:'2026-09-03',period:'H1',item:index+1,
    result:'ok',savedAt:`2026-09-03T0${Math.min(index,9)}:00:00+08:00`
  }));
  const september=model.adapt({rows,stores:['通化'],date:'2026-09-03',period:'H1'});
  assert.equal(september.questions.length,9);
  assert.equal(september.stores[0].answeredItems,9);
  assert.equal(september.stores[0].fillState,'filled');
  assert.equal(september.questions[0].title,'督導打卡');
  assert.equal(september.questions.some(question=>question.item===10),false);
  const august=model.adapt({rows:[],stores:['通化'],date:'2026-08-31',period:'H2'});
  assert.equal(august.questions.length,18);
});
