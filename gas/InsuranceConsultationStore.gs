// Called only from the existing B session transaction, after native eligibility checks.
// A separate private daily file: no legacy report rows or historical submissions are overwritten.
function insuranceConsultKey_(kind,id) {
  return Utilities.computeHmacSha256Signature(kind+'|'+id,privateDashboardRequiredProperty('DASHBOARD_ADMIN_SECRET'))
    .map(function(b){return ('0'+(b&255).toString(16)).slice(-2);}).join('');
}
function insuranceConsultSource_() {
  return insuranceSourceLoad_().data;
}
function insuranceConsultState_(dataDate) {
  const files=privateDashboardFolder().getFilesByName('insurance-consultation-'+dataDate+'.json');
  if(!files.hasNext())return {file:null,data:{schema:'insurance-consultation-records/v1',dataDate:dataDate,records:[]}};
  const file=files.next();if(files.hasNext())throw Error('INSURANCE_STORAGE_AMBIGUOUS');
  const data=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if(data.schema!=='insurance-consultation-records/v1'||data.dataDate!==dataDate||!Array.isArray(data.records))throw Error('INSURANCE_STORAGE_INVALID');
  const seen={};data.records.forEach(function(r){if(!r||r.dataDate!==dataDate||!r.subjectKey||seen[r.subjectKey]||InsuranceConsultation.missing(r.values).length)throw Error('INSURANCE_STORAGE_INVALID');seen[r.subjectKey]=true;});
  return {file:file,data:data};
}
function insuranceConsultPersist_(state) {
  const text=JSON.stringify(state.data);
  const file=state.file||privateDashboardFolder().createFile(Utilities.newBlob(text,'application/json','insurance-consultation-'+state.data.dataDate+'.json'));
  if(state.file)file.setContent(text);
  if(file.getBlob().getDataAsString('UTF-8')!==text)throw Error('INSURANCE_READBACK_UNCONFIRMED');
}
// Directory rows are independent of the daily replies and their opaque submission keys.
function insuranceConsultDirectory_(actor, rows) {
  const roles=['店長','代理店長','副店長','資深業務代表','業代','銷售人員','同仁','業務代表','業務代表(I)','業務代表(II)','業務代表(III)'];
  const members=actor.members;
  function eligible(id,store,role) {
    return members && Object.prototype.hasOwnProperty.call(members,id) && members[id]===store &&
      PRIVATE_DASHBOARD_B_STORES_.includes(store) && roles.includes(role);
  }
  if(!actor.supervisor && !eligible(actor.id,InsuranceConsultation.store(actor.store),actor.role))return null;
  const sheet=privateDashboardRoster().getSheetByName(PRIVATE_DASHBOARD_USERS_SHEET);
  // Strict native eligibility just validated the sheet header under this session lock.
  const roster=sheet.getRange(2,1,sheet.getLastRow()-1,5).getValues();
  const counts=new Map(),source=new Map();
  for(const row of roster) {
    const id=String(row[0]).trim().toUpperCase();
    counts.set(id,(counts.get(id)||0)+1);
  }
  for(const row of rows)if(row.kind==='personal')source.set(row.id,source.has(row.id)?null:row);
  const directory={current:[],retained:[],missing:[]};
  for(const [rawId,rawName,rawStore,role,status] of roster) {
    const id=String(rawId),store=InsuranceConsultation.store(rawStore),name=String(rawName||'').trim();
    if(counts.get(id)!==1 || status!=='active' || !eligible(id,store,role))continue;
    // Publish the existing roster display name only. Never use an ID as a fallback.
    if(!name || name.length>60 || /[0-9@:/<>]/.test(name) || name.includes(id))continue;
    const row=source.get(id);
    const progress=row && row.store===store ? row.progress : null;
    const valid=progress && InsuranceConsultation.classify(progress,progress.publicationDate)!=='pending';
    const group=valid && progress.freshness==='current'?'current':valid && progress.referenceOnly?'retained':'missing';
    directory[group].push({store,name,rate:group==='current'?progress.rate:null,cutoff:valid?progress.cutoff:null});
  }
  directory.current.sort((a,b)=>b.rate-a.rate || a.store.localeCompare(b.store,'zh-TW') || a.name.localeCompare(b.name,'zh-TW'));
  return directory;
}
function insuranceConsultOperation_(p,actor) {
  const C=InsuranceConsultation,today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
  if(!C.day(p.dataDate)||p.dataDate>today||!actor||!actor.id)throw Error('INSURANCE_REQUEST_INVALID');
  const manager=['店長','代理店長'].indexOf(actor.role)>=0;
  let data=null;try{data=insuranceConsultSource_();}catch(_){/* Explicit source-pending state; no fallback. */}
  const all=data?InsuranceSourceCore.project(data,p.dataDate,C):[],unique={};
  let rows=all.filter(function(r){return actor.supervisor||r.kind==='personal'&&r.id===actor.id||r.kind==='store'&&manager&&r.store===C.store(actor.store);})
    .filter(function(r){const k=r.kind+'|'+r.id;if(unique[k])return false;unique[k]=true;return true;});
  if(!rows.some(function(r){return r.kind==='personal'&&r.id===actor.id;}))rows.unshift({kind:'personal',id:actor.id,store:C.store(actor.store),label:'本人',progress:null,requirement:'pending'});
  rows.forEach(function(r){
    if(r.kind==='personal'&&r.id===actor.id&&r.store!==C.store(actor.store)){r.requirement='pending';r.progress=null;}
    r.subjectKey=insuranceConsultKey_(r.kind,r.id);
  });
  const state=insuranceConsultState_(p.dataDate);
  function maySubmit(r) { return r.kind==='personal'?r.id===actor.id:manager&&r.store===C.store(actor.store); }
  function project(r) {
    const saved=state.data.records.filter(function(x){return x.subjectKey===r.subjectKey;})[0]||null;
    return {subjectKey:r.subjectKey,kind:r.kind,store:r.store,displayName:r.id===actor.id&&r.kind==='personal'?'本人':r.label,isSelf:r.kind==='personal'&&r.id===actor.id,
      dataDate:p.dataDate,canSubmit:maySubmit(r),requirement:r.requirement,status:r.requirement==='required'&&saved?'completed':r.requirement,
      progress:r.progress,submission:saved?{submissionId:saved.submissionId,submittedAt:saved.submittedAt,values:saved.values,sourceVersion:saved.sourceVersion,progress:saved.progress}:null,
      sourceChanged:Boolean(saved&&saved.sourceVersion!==r.progress?.sourceVersion)};
  }
  if(p.action==='employee_insurance_submit') {
    if(p.dataDate!==today)throw Error('INSURANCE_TODAY_ONLY');
    const target=rows.filter(function(r){return r.subjectKey===p.subjectKey;})[0];
    if(!target||!maySubmit(target))throw Error('INSURANCE_SCOPE_DENIED');
    if(!p.values||typeof p.values!=='object'||Array.isArray(p.values)||Object.keys(p.values).some(function(k){return !C.fields.some(function(f){return f[0]===k;});})||C.missing(p.values).length)throw Error('INSURANCE_FIVE_FIELDS_REQUIRED');
    if(typeof p.submissionId!=='string'||!/^[A-Za-z0-9_-]{16,80}$/.test(p.submissionId))throw Error('INSURANCE_REQUEST_INVALID');
    const prior=state.data.records.filter(function(r){return r.subjectKey===target.subjectKey;})[0];
    if(!prior){
      if(target.requirement!=='required'||p.sourceVersion!==target.progress.sourceVersion)throw Error('INSURANCE_SOURCE_PENDING_OR_CHANGED');
      state.data.records.push({subjectKey:target.subjectKey,kind:target.kind,dataDate:p.dataDate,submissionId:p.submissionId,submittedAt:new Date().toISOString(),sourceVersion:target.progress.sourceVersion,progress:target.progress,values:C.parse(p.values)});
      insuranceConsultPersist_(state);
    }
    return {status:'ok',schema:'insurance-consultation/v1',dataDate:p.dataDate,alreadySubmitted:Boolean(prior),item:project(target)};
  }
  if(p.action!=='employee_insurance_read')throw Error('INSURANCE_REQUEST_INVALID');
  return {status:'ok',schema:'insurance-consultation/v1',dataDate:p.dataDate,scope:actor.supervisor?'supervisor':manager?'store-manager':'self',sourceStatus:data?'available':'pending',items:rows.map(project),directory:p.dataDate===today?insuranceConsultDirectory_(actor,all):null,weekly:insuranceConsultWeeklyPending_()};
}

// Existing relay ledger has no verified employee-ID insurance-week mapping;
// monthly company Final is a different ledger. Neither can be guessed into weekly awards.
// Keep this independent pending projection until the original gold pipeline supplies a reviewed mapping.
function insuranceConsultWeeklyPending_() {
  return {schema:'insurance-weekly-self/v1',sourceStatus:'pending',cumulativeReward:null,cumulativeStatus:'待結',weeks:[
    {week:'W1',rate:null,cutoff:null,adjustment:null,postingStatus:'待結',rule:'沿用既有正式結果，不補造新獎'},
    {week:'W2',rate:null,cutoff:null,adjustment:null,postingStatus:'待結',rule:'個人 55%（含）以上 ＋5'},
    {week:'W3',rate:null,cutoff:null,adjustment:null,postingStatus:'待結',rule:'持續 55%（含）以上 ＋3；自 W2 達標累計 8'},
    {week:'W4',rate:null,cutoff:null,adjustment:null,postingStatus:'待結',rule:'持續 55%（含）以上 ＋3；自 W2 達標累計 11'}
  ]};
}
