const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../insurance-consultation.js'),F=require('./fixtures/insurance-progress.cjs'),{setup}=require('./helpers/insurance-runtime.cjs');
const read=(f,p,date=F.date)=>f.handle({action:'employee_insurance_read',...p,dataDate:date});
function submit(f,p,row,values=F.values){return f.handle({action:'employee_insurance_submit',...p,dataDate:row.dataDate,subjectKey:row.subjectKey,sourceVersion:row.progress?.sourceVersion,values,submissionId:'SYNTHETIC_SUBMISSION_001'});}
test('shared core: 49.99 / 50 / 0 / invalid; store and personal independent; no daily sales inputs',()=>{
 assert.equal(fs.readFileSync('insurance-consultation.js','utf8'),fs.readFileSync('gas/InsuranceConsultation.gs','utf8'));
 for(const [v,expected] of [[.4999,'required'],[.5,'exempt'],[0,'required'],[null,'pending'],['0','pending'],['','pending'],[-1,'pending']]){
  const s=C.source(F.data(v,.5),F.date);assert.equal(s.find(x=>x.kind==='personal').requirement,expected);assert.equal(s.find(x=>x.kind==='store').requirement,'exempt');
 }
 const d=F.data();d.meta.insuranceConsultationSource.stores.status='pending';assert.equal(C.source(d,F.date).find(x=>x.kind==='personal').requirement,'required');
});
test('real B session/native route projects self only; no employee ID or other store information',()=>{
 const f=setup(),p=f.login(),r=read(f,p);assert.equal(r.status,'ok');assert.equal(r.scope,'self');assert.equal(r.items.length,1);assert.equal(r.items[0].isSelf,true);assert.equal(r.items[0].progress.rate,.42857);
 const txt=JSON.stringify(r);for(const forbidden of ['SYNTH002','subjectId','employeeId','合*成0','台北三創'])assert.ok(!txt.includes(forbidden));
 assert.equal(read(f,{...p,token:'B1_a_'+'e'.repeat(64)}).status,'error');assert.equal(read(f,{...p,deviceId:'SYNTHETIC_OTHER_DEVICE'}).status,'error');
});
test('store managers see own store and self; supervisor can reconcile approved store/person set; cross-scope submit denied',()=>{
 const f=setup();f.rows.DashboardUsers[2][3]='店長';const manager=f.login(),r=read(f,manager);assert.equal(r.items.length,2);assert.ok(r.items.every(x=>x.store==='永吉'));assert.equal(r.items.find(x=>x.kind==='store').status,'exempt');assert.equal(r.items.find(x=>x.kind==='personal').status,'required');
 const supervisor=f.login('SYNTHBOSS','SYNTHETIC_BOSS_DEVICE'),all=read(f,supervisor);assert.equal(all.scope,'supervisor');assert.equal(all.items.filter(x=>x.kind==='store').length,9);
 const other=all.items.find(x=>x.kind==='personal'&&!x.isSelf&&x.store==='通化');assert.equal(other.canSubmit,false);assert.equal(submit(f,supervisor,other).status,'error');assert.equal(submit(f,manager,other).status,'error');assert.equal(f.fileWrites,0);
});
test('all five trimmed fields enforced by backend; successful submit/readback and daily unique key never overwrite',()=>{
 const f=setup(),p=f.login(),row=read(f,p).items[0];
 for(const [key] of C.fields){assert.equal(submit(f,p,row,{...F.values,[key]:' \n '}).status,'error');assert.equal(f.fileWrites,0);}
 const done=submit(f,p,row,Object.fromEntries(Object.entries(F.values).map(([k,v])=>[k,' '+v+' '])));assert.equal(done.status,'ok');assert.equal(done.item.status,'completed');assert.deepEqual(done.item.submission.values,F.values);assert.equal(f.fileWrites,1);
 const again=submit(f,p,row,{...F.values,advisor:'不可覆蓋'});assert.equal(again.alreadySubmitted,true);assert.deepEqual(again.item.submission.values,F.values);assert.equal(f.fileWrites,1);assert.equal(read(f,p).items[0].status,'completed');
});
test('yesterday submission is not today; older publication is retained for reference, never silently required today',()=>{
 const f=setup(),p=f.login(),row=read(f,p).items[0];submit(f,p,row);const saved=JSON.parse([...f.files.values()][0]);const yesterday=new Date(Date.parse(F.date)-86400000).toISOString().slice(0,10);
 f.files.clear();saved.dataDate=yesterday;saved.records.forEach(r=>r.dataDate=yesterday);f.files.set('insurance-consultation-'+yesterday+'.json',JSON.stringify(saved));
 assert.equal(read(f,p).items[0].status,'required');
 if(yesterday.slice(0,7)===F.date.slice(0,7)){const d=F.data();d.meta.reportDate=yesterday;d.meta.insuranceConsultationSource.publicationDate=yesterday;for(const k of ['stores','personal'])d.meta.insuranceConsultationSource[k].cutoff=yesterday;f.source=d;const r=read(f,p);assert.equal(r.items[0].status,'pending');assert.equal(r.items[0].progress.referenceOnly,true);assert.equal(r.items[0].progress.publicationDate,yesterday);}
});
test('source corrections freeze valid same-day submission, reject stale first submit, and never fabricate eligibility',()=>{
 const f=setup(),p=f.login(),row=read(f,p).items[0];f.source.meta.insuranceConsultationSource.version='c'.repeat(64);assert.equal(submit(f,p,row).status,'error');assert.equal(f.fileWrites,0);
 const current=read(f,p).items[0];assert.equal(submit(f,p,current).status,'ok');f.source.meta.insuranceConsultationSource.version='d'.repeat(64);assert.equal(read(f,p).items[0].status,'completed');assert.equal(read(f,p).items[0].sourceChanged,true);
});
test('50% and pending cannot submit; revoked account fails; weekly unknown never blocks eligible daily flow',()=>{
 for(const rate of [.5,null]){const f=setup(F.data(rate)),p=f.login(),r=read(f,p);assert.equal(submit(f,p,r.items[0]).status,'error');assert.equal(f.fileWrites,0);}
 const f=setup(),p=f.login(),r=read(f,p);assert.equal(r.weekly.cumulativeReward,null);assert.ok(r.weekly.weeks.every(w=>w.postingStatus==='待結'&&w.adjustment===null));assert.match(r.weekly.weeks[2].rule,/累計 8/);assert.match(r.weekly.weeks[3].rule,/累計 11/);assert.equal(submit(f,p,r.items[0]).status,'ok');
 f.rows.DashboardUsers[2][4]='revoked';assert.equal(read(f,p).status,'error');
});
test('new private source is removed from legacy/B KPI projections; ordinary daily report contains no insurance consultation gate',()=>{
 const code=fs.readFileSync('gas/Code.gs','utf8'),html=fs.readFileSync('index.html','utf8');assert.equal((code.match(/delete data.meta.insuranceConsultationSource/g)||[]).length,2);
 assert.doesNotMatch(code,/reportInsuranceConsultData_|insurance_consult_json/);assert.doesNotMatch(html,/insuranceConsultSection|validateInsuranceConsultForm|insurance_consult_json/);assert.match(html,/href="insurance-consultation.html"/);
});
test('ambiguous identity or stats period stays pending, with no personal-rate substitution for stores',()=>{
 const d=F.data();d.meta.insuranceConsultationSource.personal.rows.push({...d.meta.insuranceConsultationSource.personal.rows[1]});d.meta.insuranceConsultationSource.stores.periodEvidence=null;
 const rows=C.source(d,F.date);assert.ok(rows.filter(x=>x.kind==='store'||x.id==='SYNTH002').every(x=>x.requirement==='pending'));
});

test('actual B KPI response strips private insurance identities while dedicated self read remains available',()=>{
 const f=setup(),p=f.login(),r=f.handle({action:'employee_kpi_read',...p});assert.equal(r.status,'ok');assert.ok(!Object.hasOwn(r.data.meta,'insuranceConsultationSource'));assert.ok(f.source.meta.insuranceConsultationSource);assert.equal(read(f,p).items[0].status,'required');
});
test('unverified dates, mismatched batch and corrupt saved state never become an eligible write',()=>{
 const previous=new Date(Date.parse(F.date.slice(0,7)+'-01')-86400000).toISOString().slice(0,10);
 for(const change of [d=>d.meta.insuranceConsultationSource.sourceSha256='c'.repeat(64),d=>d.meta.insuranceConsultationSource.personal.cutoff='2099-12-31',d=>d.meta.insuranceConsultationSource.personal.periodStart=previous.slice(0,7)+'-01',d=>d.meta.insuranceConsultationSource.personal.periodEvidence=null]){
  const d=F.data();change(d);const f=setup(d),p=f.login(),r=read(f,p);assert.equal(r.items[0].status,'pending');assert.equal(submit(f,p,r.items[0]).status,'error');assert.equal(f.fileWrites,0);
 }
 const f=setup(),p=f.login();f.files.set('insurance-consultation-'+F.date+'.json','{}');assert.equal(read(f,p).status,'error');assert.equal(f.fileWrites,0);
});
test('own store and personal daily submissions have independent keys and preserve each other',()=>{
 const f=setup(F.data(.42857,.4));f.rows.DashboardUsers[2][3]='店長';const p=f.login(),rows=read(f,p).items,store=rows.find(r=>r.kind==='store'),self=rows.find(r=>r.kind==='personal');
 assert.equal(store.canSubmit,true);assert.equal(store.status,'required');assert.notEqual(store.subjectKey,self.subjectKey);
 assert.equal(submit(f,p,store).item.status,'completed');assert.equal(read(f,p).items.find(r=>r.kind==='personal').status,'required');
 assert.equal(submit(f,p,self,{...F.values,advisor:'合成本人請益'}).item.status,'completed');const saved=read(f,p).items;
 assert.equal(saved.find(r=>r.kind==='store').submission.values.advisor,F.values.advisor);assert.equal(saved.find(r=>r.kind==='personal').submission.values.advisor,'合成本人請益');assert.equal(f.fileWrites,2);
 assert.equal(submit(f,p,store).alreadySubmitted,true);assert.equal(f.fileWrites,2);
});

test('deputy or unrecognized native role does not gain store consultation access',()=>{
 for(const role of ['副店長','SYNTHETIC_UNKNOWN_ROLE']){const f=setup();f.rows.DashboardUsers[2][3]=role;const p=f.login(),r=read(f,p);assert.equal(r.scope,'self');assert.equal(r.items.length,1);assert.equal(r.items[0].kind,'personal');}
});

test('nine-store directory contains four display fields only, with separate current, stale and unavailable rows',()=>{
 const d=F.data(),people=d.meta.insuranceConsultationSource.personal.rows;
 people[0].rate=.85;people[1].rate=0;people[2].rate=null;
 const f=setup(d),session=f.login(),self=read(f,session).items[0];
 submit(f,session,self,{...F.values,advisor:'PRIVATE_REPLY_ONLY'});
 const other=f.login('SYNTH003','SYNTHETIC_DIRECTORY_DEVICE'),result=read(f,other);
 assert.equal(result.items.length,1);assert.ok(!JSON.stringify(result).includes('PRIVATE_REPLY_ONLY'));
 const directory=result.directory;
 assert.deepEqual(directory.current.map(r=>r.rate),[.85,...Array(6).fill(.42857),0]);
 assert.deepEqual(directory.missing,[{store:'復興南',name:'示＊澄',rate:null,cutoff:null}]);
 for(const row of [...directory.current,...directory.missing])assert.deepEqual(Object.keys(row).sort(),['cutoff','name','rate','store']);
 const day=new Date(Date.parse(F.date)-86400000).toISOString().slice(0,10);
 if(day.slice(0,7)===F.date.slice(0,7)){
  d.meta.reportDate=day;d.meta.insuranceConsultationSource.publicationDate=day;d.meta.insuranceConsultationSource.personal.cutoff=day;
  const stale=read(f,other).directory;assert.equal(stale.current.length,0);assert.equal(stale.retained.length,8);
  assert.ok(stale.retained.every(r=>r.rate===null&&r.cutoff===day));
 }
 assert.equal(read(f,other,day).directory,null);
});
test('directory enforces native actor and target eligibility independently; client cannot request more fields',()=>{
 const f=setup(),p=f.login();
 for(const role of ['外部顧問','督導']){f.rows.DashboardUsers[2][3]=role;assert.equal(read(f,p).directory,null);}
 f.rows.DashboardUsers[2][3]='同仁';f.rows.DashboardUsers[1][4]='inactive';f.rows.DashboardUsers[3][2]='外區';
 f.rows.DashboardUsers[4][3]='其他';f.rows.DashboardUsers[5][1]='SYNTH005';f.rows.DashboardUsers.push([...f.rows.DashboardUsers[6]]);
 const all=read(f,p).directory;assert.equal(all.current.length,4);
 assert.ok(all.current.every(row=>['永吉','大稻埕','三創','六張犁'].includes(row.store)));
 for(const extra of [{store:'外區'},{role:'督導'},{employeeId:'SYNTH003'}])assert.equal(read(f,{...p,...extra}).status,'error');
 f.rows.DashboardUsers[2][2]='外區';assert.equal(read(f,p).status,'error');
 assert.equal(read(f,{}).status,'error');assert.equal(f.fileWrites,0);
});
