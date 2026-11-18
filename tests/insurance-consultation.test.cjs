const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const C=require('../insurance-consultation.js'),F=require('./fixtures/insurance-progress.cjs'),{setup}=require('./fixtures/report-save-gas.cjs');
const record=(data,values=F.values)=>({insurance_consult_json:C.serialize(C.resolve(data,F.store,F.date),values)});
test('browser and GAS share exactly the same rule, only formal monthly H rate triggers',()=>{
 assert.equal(fs.readFileSync('insurance-consultation.js','utf8'),fs.readFileSync('gas/InsuranceConsultation.gs','utf8'));
 for(const [rate,required] of [[0,true],[0.49999,true],[0.5,false],[0.9,false],[null,false],['',false]]){
  assert.equal(C.required({...record(F.data(rate)),insurance_num:0,insurance_den:10,insurance_pct:0}),required);
  assert.equal(C.required({...record(F.data(rate)),insurance_num:10,insurance_den:10,insurance_pct:100}),required);
 }
 assert.equal(C.required({insurance_num:0,insurance_den:10}),false);
});
test('missing, cross month, newer or older publications and mixed source stay pending',()=>{
 for(const change of [s=>s.rows=[],s=>s.rows[0].rate=null,s=>s.status='pending',s=>s.cutoff='2099-09-30',s=>s.publicationDate='2099-10-03',s=>s.publicationDate='2099-10-01',s=>s.sourceSha256='c'.repeat(64),s=>s.periodEvidence=null,s=>s.column='G']){
  const data=F.data();change(data.meta.storeInsuranceProgress);assert.equal(C.resolve(data,F.store,F.date).status,'pending');assert.equal(C.assess(record(data,{})).missing.length,0);
 }
});
test('both segments enforce five trimmed fields, persist independent values, preserve OP/card and duplicate receipts',()=>{
 let source=F.data();const {api}=setup({insuranceData:()=>source});
 for(const seg of [16,21]){
  const p={action:'write',date:F.date,store:F.store,seg,data:{...record(source),insurance_num:9,insurance_den:10,insurance_pct:90,cobranded_card:0,management_focus_json:JSON.stringify({op_online:5,op_accum:9,op_target:14})}};
  for(const [key] of C.fields){const bad={...p,data:record(source,{...F.values,[key]:' \n '})};assert.throws(()=>api.reportWritePayload_(bad),/五項/);}
  const values={...F.values,advisor:'  合成 '+seg+'  '};p.data={...p.data,...record(source,values)};
  p.mutation={schema:'report-save-v1',id:'synthetic-insurance-'+seg,baseRevision:api.reportSaveStatus_({...p,action:'report_save_status',kind:'write'}).revision};
  const receipt=api.reportWritePayload_(p);assert.equal(receipt.rowWritten,true);
  assert.equal(api.reportWritePayload_(p).commitId,receipt.commitId);
  const row=api.readData(F.date,seg)[F.store];assert.equal(C.parse(row.insurance_consult_json).advisor,'合成 '+seg);assert.equal(row.cobranded_card,0);assert.equal(JSON.parse(row.management_focus_json).op_target,14);
 }
 source=F.data(0.8);source.meta.storeInsuranceProgress.version='c'.repeat(64);
 const row=api.readData(F.date,16)[F.store];assert.equal(C.saved(row).progress.rate,0.4);
 const edited={...row,insurance_consult_json:C.serialize(C.saved(row).progress,{...F.values,advisor:'再請益'})};
 api.reportWritePayload_({action:'write',date:F.date,store:F.store,seg:16,data:edited});assert.equal(C.saved(api.readData(F.date,16)[F.store]).progress.rate,0.4);
});
test('source changes before first save reject stale proof; inactive text removed; legacy absence and personal remain unchanged',()=>{
 let source=F.data();const {api}=setup({insuranceData:()=>source}),old=record(source);source=F.data(.6);
 const p={action:'write',date:F.date,store:F.store,seg:16,data:old};assert.throws(()=>api.reportWritePayload_(p),/來源已更新/);
 p.data=record(source);api.reportWritePayload_(p);assert.deepEqual(C.saved(api.readData(F.date,16)[F.store]).values,{});
 const legacy=setup();legacy.api.reportWritePayload_({...p,data:{insurance_num:0,insurance_den:10}});assert.equal(legacy.api.readData(F.date,16)[F.store].insurance_consult_json,'');
 assert.equal(C.saved({insurance_num:0,insurance_den:10}),null);
});
test('partial store missing does not borrow another store or personal rates',()=>{
 const data=F.data(null);data.persons=[{store:F.store,rate:0.1}];data.meta.storeInsuranceProgress.rows.push({code:'DNB-OTHER',store:'合成別店',rate:.1});assert.equal(C.resolve(data,F.store,F.date).status,'pending');
});
test('malformed optional source is pending, no namespace or private-source expansion',()=>{
 for(const key of ['rows']){const d=F.data();d.meta.storeInsuranceProgress[key]={};assert.equal(C.resolve(d,F.store,F.date).status,'pending');}
 const d=F.data();d.stores={};assert.equal(C.resolve(d,F.store,F.date).status,'pending');
 const html=fs.readFileSync('index.html','utf8');assert.match(html,/insuranceProgressData=bundle\.kpiResult\?\.data\|\|null/);assert.match(html,/clear\(\)\{insuranceProgressData=null;loadInsuranceConsultForm\(null\)/);
 const code=fs.readFileSync('gas/Code.gs','utf8');assert.doesNotMatch(code,/action === 'insurance_progress_(read|publish)'/);
});
test('source outage does not hard-block pending reports or promote pending to formal proof',()=>{
 const d=F.data();d.meta.storeInsuranceProgress.status='pending';d.meta.storeInsuranceProgress.cutoff=null;
 const {api}=setup();const p={action:'write',date:F.date,store:F.store,seg:16,data:record(d,{advisor:'殘留'})};api.reportWritePayload_(p);
 const v=C.saved(api.readData(F.date,16)[F.store]);assert.equal(v.progress.status,'pending');assert.deepEqual(v.values,{});
 assert.throws(()=>setup().api.reportWritePayload_({...p,data:record(F.data())}),/來源已更新/);
});
