const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const {runtime}=require('./helpers/department-ops-integration-runtime.cjs'),Scores=require('../department-scores-core.js'),Gold=require('../department-gold-monthly-core.js'),F=require('./helpers/department-scores-synthetic.cjs');
function setup(){const r=runtime(),token=r.post({action:'ptauth',key:'synthetic-passcode'}).token;
 const post=body=>r.post({...body,token});
 post({action:'department_scores_publish',contract:Scores.CONTRACT,confirm:true,requestId:crypto.randomUUID(),expectedGeneration:0,selectedMonthKeys:['2026-06','2026-07'],months:[F.month({month:6}),F.month({month:7})],sourceName:'synthetic.xlsx',sourceHash:'a'.repeat(64)});
 const month=Gold.validateMonth({schema:Gold.SCHEMA,monthKey:'2026-09',sheetName:'動員(全員)',sourceName:'synthetic.xlsx',sourceHash:'b'.repeat(64),dateRange:{start:'2026-09-01',end:'2026-09-28',cutoff:'2026-09-28'},settlementStatus:'provisional',records:[{employeeId:'SYN001',employeeName:'合成甲',region:'北一二B',storeCode:'SYN-B',store:'合成店',role:'合成職稱',medal:10,sourceRow:4,sourceFields:[]}],validation:{sourceTotal:10}});
 const revision=post({action:'department_ops_read'}).monthly.revision,p={action:'department_ops_publish',contract:'north12-monthly-write/v2',mode:'plan',operationId:crypto.randomUUID(),expectedRevision:revision,months:[month]},plan=post(p);
 post({...p,mode:'commit',confirm:true,planReceipt:plan.planReceipt});
 for(const file of r.files.values())file.getLastUpdated=()=>new Date('2026-10-13T00:00:00Z');
 return {r,post};
}
for(const action of ['department_scores_read','department_ops_read']){
 test(`${action}: matching versions retain auth/ACL and skip active data blobs without writes`,()=>{
  const {r,post}=setup(),writes=r.writes,before=r.reads,full=post({action}),fullReads=r.reads-before,after=r.reads,hit=post({action,knownVersion:full.readVersion});
  assert.equal(hit.status,'ok');assert.equal(hit.notModified,true);assert.equal(hit.readVersion,full.readVersion);assert.equal(hit.readContract,'department-version-read/v1');assert.ok(r.reads-after<fullReads);assert.equal(r.writes,writes);assert.equal(hit.months,undefined);assert.equal(hit.gold,undefined);
  const fallback=post({action,knownVersion:'old'});assert.equal(fallback.notModified,undefined);assert.ok(fallback.months||fallback.gold);
  const drives=r.reads,denied=r.post({action,token:'forged',knownVersion:full.readVersion});assert.equal(denied.status,'error');assert.equal(r.reads,drives);assert.equal(r.writes,writes);
 });
 test(`${action}: file permission changes fail closed even when the generation is unchanged`,()=>{
  const {r,post}=setup(),full=post({action}),prefix=action==='department_scores_read'?'north12-scores-':'north12-department-gold-month-';
  const file=[...r.files.values()].find(f=>f.name.startsWith(prefix));assert.ok(file,JSON.stringify([...r.files.values()].map(f=>f.name)));
  file.getViewers=()=>[{getEmail:()=> 'unexpected@synthetic.test'}];const hit=post({action,knownVersion:full.readVersion});assert.equal(hit.status,'error');assert.equal(hit.notModified,undefined);
 });
 test(`${action}: modified source bytes invalidate the version and still undergo original integrity checks`,()=>{
  const {r,post}=setup(),full=post({action}),prefix=action==='department_scores_read'?'north12-scores-':'north12-department-gold-month-';
  const file=[...r.files.values()].find(f=>f.name.startsWith(prefix));assert.ok(file);file.getLastUpdated=()=>new Date('2026-10-13T01:00:00Z');file.content='{}';
  const hit=post({action,knownVersion:full.readVersion});assert.equal(hit.status,'error');assert.equal(hit.notModified,undefined);
 });
}
test('operation receipt readback always returns complete gold data',()=>{const {post}=setup(),full=post({action:'department_ops_read'}),result=post({action:'department_ops_read',knownVersion:full.readVersion,operationId:'synthetic-readback'});assert.equal(result.notModified,undefined);assert.ok(result.gold.months.length);});
test('shared source and Patrol delivery copies retain the same version-read contract',()=>{for(const file of ['DepartmentScores.gs','DepartmentGoldMonthly.gs'])assert.equal(fs.readFileSync('gas/'+file,'utf8'),fs.readFileSync('patrol-gas/'+file,'utf8'));});
