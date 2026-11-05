const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../tradein-public-core.js');
const {createRuntime,parsed,csv,OPERATOR}=require('./helpers/tradein-synthetic-runtime.cjs');
function raw(month='2026-10'){const r=createRuntime(),source=month==='2026-11'?parsed(Buffer.from(csv().toString().replaceAll('115/10/','115/11/').replaceAll('11510','11511').replace('26年10月','26年11月'))):parsed();r.configure(source);const auth={employeeId:OPERATOR,adminSecret:r.secret};const p=r.a.tradeinPerformancePreview({source,...auth});const v=r.a.tradeinPerformancePublish({source,...auth,...p});r.a.tradeinPerformancePublicPublish({...auth,month:source.month,sourceHash:source.source_sha256,expectedActiveHash:v.snapshotHash});return JSON.parse(JSON.stringify(r.dispatch({action:'tradein_performance_public_read',month:source.month,includeDays:true}).snapshot));}
test('October store quotas use each rounded 12% device target, independently of all-person 4-unit quotas',async()=>{
 const {applyTargets,OCTOBER_POLICY}=await import('../tradein-target-policy.mjs'),source=raw(),before=JSON.stringify(source),s=applyTargets(source);
 assert.deepEqual(s.stores.map(s=>s.target_units),[12,8,19,20,18,22,12,35,13]);assert.equal(s.summary.target_units,159);
 assert.equal(OCTOBER_POLICY.stores.every(s=>Math.ceil(s.device*.12)===s.target),true);
 assert.equal(s.people.every(p=>p.target_units===4),true);assert.equal(s.summary.target_people,4);assert.equal(s.summary.personal_target_units,16);assert.equal(s.summary.remaining_units,155);
 assert.equal(JSON.stringify(source),before);assert.equal(source.people.filter(p=>p.target_units===null).length,2);
 assert.equal(applyTargets({...source,month:'2026-09'}).people[1].target_units,source.people[1].target_units);
});
test('one-page brief reconciles people, stores, tied ranks, models and five calendar days from the source cutoff',async()=>{
 const {buildBrief}=await import('../tradein-brief-core.mjs'),s=buildBrief(raw(),P.validate);
 assert.equal(s.actual,4);assert.equal(s.target,159);assert.equal(s.personalTotal,16);assert.equal(s.mobilizedPeople,3);assert.equal(s.peopleShare,75);assert.equal(s.mobilizedStores,2);assert.equal(s.storeShare,22.2);
 assert.deepEqual(s.ranking.map(p=>p.units),[2,1,1,0]);assert.deepEqual(s.ranking.map(p=>p.rank),[1,2,2,4]);assert.equal(s.topModels[0].units,4);assert.equal(s.topModels[0].share,100);
 assert.deepEqual(s.trend.map(p=>p.date),['2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07']);assert.equal(s.trend.every(p=>p.units===0),true);
 assert.match(s.reminders.join('\n'),/iCloud／Google/);assert.match(s.reminders.join('\n'),/ID 鎖/);assert.match(s.reminders.join('\n'),/SPE −0.5/);assert.match(s.reminders.join('\n'),/第二件起每件 SPE −1/);assert.match(s.reminders.join('\n'),/督導 −0.25/);
});
test('brief retains unprovided calendar dates and refuses incomplete identity, model or daily sources',async()=>{
 const {buildBrief}=await import('../tradein-brief-core.mjs');const s=raw();s.source_cutoff_date='2026-10-03';s.source_period.end=s.source_cutoff_date;const m=buildBrief(s,P.validate);assert.deepEqual(m.trend.slice(0,2).map(p=>p.units),[null,null]);
 const missing=raw();delete missing.people[0].recovered_days;assert.throws(()=>buildBrief(missing,P.validate),/逐日/);
 const wrong=raw();wrong.people[0].employee_id='SYNTHETIC_PRIVATE';assert.throws(()=>buildBrief(wrong,P.validate),/白名單/);
 assert.throws(()=>buildBrief(raw(),P.validate,'2026-09'),/來源月份不符/);
});
test('public reminder and spreadsheet use 4-unit personal targets for managers too',async()=>{
 const E=await import('../tradein-export-core.mjs');const rules={...E.rulesForMonth('2026-10'),isDemo:false};const people=[['萬大','合＊甲','店長',2],['萬大','合＊乙','代理店長',1],['萬大','合＊丙','同仁',0]];
 const s=E.buildExportModel({active:true,mode:'public',allowedStores:['萬大'],people},'all',rules);
 assert.deepEqual(s.rows.map(p=>p.target),[4,4,4]);assert.match(E.reminderText(s),/每人每月 4 台/);assert.match(E.workbookRows(s)[2][0],/含店長及代理店長/);
});
test('November includes managers in all personal, store and region targets without changing transactions',async()=>{
 const {applyTargets,personalRules}=await import('../tradein-target-policy.mjs'),E=await import('../tradein-export-core.mjs');
 const source=raw('2026-11'),before=JSON.stringify(source),s=applyTargets(source);
 assert.deepEqual(personalRules('2026-11'),{staffTarget:3,actingManager:'included'});
 assert.equal(s.people.every(p=>p.target_units===3),true);
 assert.equal(s.summary.target_people,4);assert.equal(s.summary.target_units,12);assert.equal(s.summary.personal_target_units,12);
 assert.equal(s.summary.actual_units,4);assert.equal(s.summary.remaining_units,8);assert.equal(s.summary.met_people,0);
 assert.deepEqual(s.stores.filter(p=>p.target_people).map(p=>[p.store,p.target_people,p.target_units]),[['杭州南',1,3],['萬大',2,6],['三創',1,3]]);
 const manager=s.people.find(p=>p.actual_units===2);assert.equal(manager.target_units,3);assert.equal(manager.remaining_units,1);assert.equal(E.formatDifference(manager.actual_units,manager.target_units),'−1 台');
 assert.equal(JSON.stringify(source),before);assert.deepEqual(s.people.map(p=>p.recovered_days),source.people.map(p=>p.recovered_days));
 const met=applyTargets({...source,people:source.people.map(p=>p===source.people.find(p=>p.actual_units===2)?{...p,actual_units:3}:p)});
 assert.equal(met.summary.met_people,1);assert.equal(met.stores.find(p=>p.store==='萬大').met_people,1);
 const unknown=applyTargets({...source,people:source.people.map(p=>p.actual_units===2?{...p,actual_units:null}:p)}).people.find(p=>p.actual_units===null);
 assert.equal(unknown.target_units,3);assert.equal(unknown.remaining_units,null);assert.equal(unknown.attainment_status,'pending');
});
test('November reminder, workbook and brief all include managers at 3 units',async()=>{
 const E=await import('../tradein-export-core.mjs'),{buildBrief}=await import('../tradein-brief-core.mjs');
 const rules={...E.rulesForMonth('2026-11'),sourceStart:'2026-11-01',sourceEnd:'2026-11-07',cutoff:'2026-11-07',isDemo:false};
 const people=[['萬大','合＊甲','店長',2],['萬大','合＊乙','代理店長',3],['萬大','合＊丙','同仁',0]];
 const model=E.buildExportModel({active:true,mode:'public',allowedStores:['萬大'],people},'all',rules);
 assert.deepEqual(model.rows.map(p=>p.target),[3,3,3]);assert.deepEqual(model.rows.map(p=>p.remaining),[1,0,3]);
 assert.match(E.reminderText(model),/每人每月 3 台/);assert.doesNotMatch(E.reminderText(model),/不設目標/);assert.match(E.workbookRows(model)[2][0],/每月 3 台；含店長及代理店長/);
 const brief=buildBrief(raw('2026-11'),P.validate);assert.equal(brief.personalTarget,3);assert.equal(brief.personalTotal,12);assert.equal(brief.target,12);
 assert.equal(brief.ranking.every(p=>p.target===3),true);assert.match(brief.personalRule,/全員每月 3 台，含店長與代理/);assert.doesNotMatch(brief.targetRule,/免目標|159/);
});
