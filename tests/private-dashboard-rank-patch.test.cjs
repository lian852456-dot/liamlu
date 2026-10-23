const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const source=fs.readFileSync(path.join(__dirname,'../gas/Code.gs'),'utf8');
function fn(name){const start=source.indexOf('function '+name+'(');assert.ok(start>=0,name);const open=source.indexOf('{',start);let depth=0;for(let i=open;i<source.length;i++){if(source[i]==='{')depth++;if(source[i]==='}')depth--;if(!depth)return source.slice(start,i+1);}throw Error(name);}
function fixture(count=41,awardDate='2026-10-22'){
 const names=['通化','酒泉','台北三創','萬大','六張犁','復興南','永吉','大稻埕','杭州南'];
 const stores=names.map((name,i)=>({code:'S'+i,name,overall_kpi:1,company_rank:i+1,overall_kpi_dod:0,company_rank_dod:0,addon_score:0}));
 const people=Array.from({length:count},(_,i)=>({store:'S'+(i%9),pname:i===0?'測*?':'測*'+i,role:i%3?'業代':'店長',official:1.25,items:{AQ:{a:1}}}));
 const protectedKpi={meta:{sourceFile:'1023.xlsx',month:'2026-10',snapshotDay:22},stores,persons:people,items:Array.from({length:25},(_,i)=>({key:'K'+i}))};
 const kpi={source_file:'1023.xlsx',report_date:'2026-10-22',data_as_of_date:'2026-10-22',source_as_of_date:'2026-10-22',kpi_run_id:'SYNTH_CURRENT',aggregate:{overall_kpi:1,company_rank:1,overall_kpi_dod:0,company_rank_dod:0,addon_score:0},stores,
 personal:people.map((p,i)=>({store:names[i%9],name:i===0?'測*［來源缺字］':p.pname,role:p.role,rank:null,rank_dod:null,overall_rate:1.25,overall_rate_dod:null,metrics:{AQ:{actual:1,target:2}}}))};
 const snapshot={version:1,publishedAt:'BEFORE',kpiBattle:kpi,awardsBattle:{report_date:awardDate,payload:{money:37}},components:{kpi:{status:'fresh',qis_data_as_of_date:'2026-10-20',insurance_data_as_of_date:'2026-10-21',completeness:{insurance:'partial'}},awards:{status:awardDate==='2026-10-22'?'fresh':'blocked',run_id:'AWARD_RUN',completeness:{x:1}},closure:{status:'fresh',payload:'KEEP'}}};
 const patch={schema:'north12b-personal-rank-patch/v1',report_run_date:'2026-10-23',source_file:'1023.xlsx',data_as_of_date:'2026-10-22',kpi_run_id:'SYNTH_CURRENT',personal_rank_semantics:'individual-rank-v1',personal_rank_source:{sheet:'上線數KPI_個人達成率_明細',column:'I',source_file:'1023.xlsx',data_as_of_date:'2026-10-22',sha256:'a'.repeat(64),previous_sha256:'b'.repeat(64)},personal:people.map((p,i)=>({store:names[i%9],role:p.role,name:p.pname,rank:i+17,rank_dod:i%2?0:-2}))};
 const state={text:JSON.stringify(snapshot),protected:protectedKpi,writes:0,audits:0,locked:false,protectedReads:0,snapshotReads:0};
 const file={getId:()=> 'SYNTH_FILE',getBlob:()=>({getDataAsString:()=>{state.snapshotReads++;state.snapshotHook?.(state);return state.text;}}),setContent:t=>{assert.equal(state.locked,true);state.writes++;state.text=t;}};
 const nativeDate=Date,clock=new Date('2026-10-23T04:00:00Z').getTime();
 class FixedDate extends nativeDate {constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
 const ctx={Date:FixedDate,PRIVATE_DASHBOARD_FILE:'SYNTH_FILE',privateDashboardNow:()=> '2026-10-23T12:00:00+08:00',
 privateDashboardAdminAuthorized:p=>{if(p.adminSecret!=='SYNTH_ADMIN')throw Error('AUTH');},privateDashboardLatestSnapshotFile_:()=>file,
 kpiCalcLatestDataFile:()=>({getBlob:()=>({getDataAsString:()=>{state.protectedReads++;state.protectedHook?.(state);return JSON.stringify(state.protected);}})}),
 reportVersionRecord_:()=>{state.audits++;if(state.auditThrows)throw Error('AUDIT_RESPONSE_LOST');},
 reportVersionHash_:s=>createHash('md5').update(s).digest('hex'),
 reportUploadKpiDate_:m=>m.month+'-'+String(m.snapshotDay).padStart(2,'0'),
 LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(state.locked,false);state.locked=true;},releaseLock:()=>{state.locked=false;}})},
 Utilities:{Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(algo,s,charset)=>[...createHash(algo).update(charset==='utf8'?String(s):String(s).replace(/[^\x00-\x7f]/g,'?')).digest()],base64Decode:s=>Buffer.from(s,'base64'),newBlob:b=>({getDataAsString:()=>Buffer.from(b).toString('utf8')}),formatDate:(d)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(d)}};
 vm.createContext(ctx);
 for(const name of ['privateDashboardHash','privateDashboardSnapshotWriteLocked_','privateDashboardCanonicalKpiSource_','privateDashboardCanonicalKpiStore_','privateDashboardCanonicalKpiPersonName_','privateDashboardKpiPersonKeys_','privateDashboardValidateKpiComponent_','privateDashboardRankCanonical_','privateDashboardRankHash_','privateDashboardRankShape_','privateDashboardRankPersonKey_','privateDashboardRankNonRank_','privateDashboardPublishRankPatch_','privateDashboardPublishKpiComponent'])vm.runInContext(fn(name),ctx);
 const payload=()=>({adminSecret:'SYNTH_ADMIN',rankPatchBase64:Buffer.from(JSON.stringify(patch)).toString('base64'),expectedSnapshotPayloadHash:ctx.privateDashboardRankHash_(snapshot),expectedKpiPayloadHash:ctx.privateDashboardRankHash_(snapshot.kpiBattle),expectedProtectedKpiPayloadHash:ctx.privateDashboardRankHash_(protectedKpi)});
 return {ctx,state,snapshot,patch,payload};
}
for(const count of [40,41])for(const awardDate of ['2026-10-22','2026-10-21'])test(`${count} complete identities and ${awardDate} awards preserve every non-rank field`,()=>{
 const f=fixture(count,awardDate),before=structuredClone(f.snapshot),r=f.ctx.privateDashboardPublishKpiComponent(f.payload()),after=JSON.parse(f.state.text);
 assert.equal(r.people,count);assert.equal(r.result,'updated');assert.equal(f.state.writes,1);assert.equal(f.state.locked,false);
 assert.equal(after.kpiBattle.personal[0].rank,17);assert.equal(after.kpiBattle.personal[0].name,'測*?');
 assert.deepEqual(after.awardsBattle,before.awardsBattle);assert.deepEqual(after.components.awards,before.components.awards);assert.deepEqual(after.components.closure,before.components.closure);
 assert.deepEqual(JSON.parse(JSON.stringify(f.ctx.privateDashboardRankNonRank_(after))),JSON.parse(JSON.stringify(f.ctx.privateDashboardRankNonRank_(before))));
});
test('authorization and missing parent hashes reject before writes',()=>{
 for(const change of [p=>p.adminSecret='WRONG',p=>delete p.expectedKpiPayloadHash,p=>delete p.expectedSnapshotPayloadHash,p=>p.expectedProtectedKpiPayloadHash='bad']) {const f=fixture(),p=f.payload();change(p);assert.throws(()=>f.ctx.privateDashboardPublishKpiComponent(p));assert.equal(f.state.writes,0);}
});
test('missing duplicate wrong-role or wrong-name identity cannot be patched',()=>{
 for(const change of [p=>p.personal.pop(),p=>p.personal.push({...p.personal[0]}),p=>p.personal[0].role='督導',p=>p.personal[0].name='另一人']) {const f=fixture();change(f.patch);assert.throws(()=>f.ctx.privateDashboardPublishKpiComponent(f.payload()),/RANK_IDENTITY/);assert.equal(f.state.writes,0);}
});
test('source mismatch expiry invalid provenance and unauthorized fields reject',()=>{
 for(const change of [p=>p.source_file='1022.xlsx',p=>p.report_run_date='2026-10-22',p=>p.data_as_of_date='2026-10-21',p=>p.personal_rank_source.sheet='店績',p=>p.personal[0].overall_rate=9,p=>p.personal[0].rank=0,p=>p.personal[0].rank_dod=1.2]) {const f=fixture();change(f.patch);assert.throws(()=>f.ctx.privateDashboardPublishKpiComponent(f.payload()));assert.equal(f.state.writes,0);}
});
test('missing source rank remains null and cannot carry an invented rank delta',()=>{
 const f=fixture();f.patch.personal[0].rank=null;f.patch.personal[0].rank_dod=null;f.ctx.privateDashboardPublishKpiComponent(f.payload());assert.equal(JSON.parse(f.state.text).kpiBattle.personal[0].rank,null);
 const g=fixture();g.patch.personal[0].rank=null;assert.throws(()=>g.ctx.privateDashboardPublishKpiComponent(g.payload()),/RANK_VALUE_INVALID/);assert.equal(g.state.writes,0);
});
test('concurrent protected and parent KPI changes reject both initial and late versions',()=>{
 for(const target of ['protected','snapshot','awards','metadata'])for(const when of [1,2]){const f=fixture(),p=f.payload();
  if(target==='protected')f.state.protectedHook=s=>{if(s.protectedReads===when)s.protected.persons[0].official=9;};
  else f.state.snapshotHook=s=>{if(s.snapshotReads===when){const d=JSON.parse(s.text);if(target==='awards')d.awardsBattle.payload.money=999;else if(target==='metadata')d.components.awards.run_id='CONCURRENT';else d.kpiBattle.aggregate.overall_kpi=9;s.text=JSON.stringify(d);}};
  assert.throws(()=>f.ctx.privateDashboardPublishKpiComponent(p),/RANK_PARENT_CHANGED/);assert.equal(f.state.writes,0);assert.equal(f.state.locked,false);
 }
});
test('audit response uncertainty never permits replay of the old parent',()=>{
 const f=fixture(),p=f.payload();f.state.auditThrows=true;assert.throws(()=>f.ctx.privateDashboardPublishKpiComponent(p),/AUDIT_RESPONSE_LOST/);assert.equal(f.state.writes,1);
 assert.throws(()=>f.ctx.privateDashboardPublishKpiComponent(p),/RANK_PARENT_CHANGED/);assert.equal(f.state.writes,1);
});
test('already-applied current-parent request is a read-only no-op',()=>{
 const f=fixture();f.ctx.privateDashboardPublishKpiComponent(f.payload());
 const p=f.payload();p.expectedKpiPayloadHash=f.ctx.privateDashboardRankHash_(JSON.parse(f.state.text).kpiBattle);
 p.expectedSnapshotPayloadHash=f.ctx.privateDashboardRankHash_(JSON.parse(f.state.text));
 const r=f.ctx.privateDashboardPublishKpiComponent(p);assert.equal(r.result,'up-to-date');assert.equal(f.state.writes,1);assert.equal(f.state.audits,1);
});
test('the legacy component route retains the original implementation',()=>{
 const current=fn('privateDashboardPublishKpiComponent').replace("  if (Object.prototype.hasOwnProperty.call(payload || {}, 'rankPatchBase64')) return privateDashboardPublishRankPatch_(payload);\n",'');
 assert.equal(createHash('sha256').update(current.trim()).digest('hex'),'678e7ea0c5402c1e33c783471d7a5f35347bf9b9baf946204cf4a36c959ae6a9');
});
