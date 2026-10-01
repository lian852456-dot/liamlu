// Protected score module. Integrate the dispatcher into the existing Patrol doPost;
// never expose these actions via department_gold_access or an anonymous GET.
const DEPARTMENT_SCORES_MANIFEST = 'north12-department-store-scores-v2.json';

function departmentScoresFolder_() {
  const folder = departmentOpsFolder_();
  // Bind to the existing spreadsheet owner using the existing Drive authorization.
  // Do not introduce Session/userinfo.email consent to add score storage.
  const sourceOwner = DriveApp.getFileById(SPREADSHEET_ID).getOwner();
  const owner = String(sourceOwner && sourceOwner.getEmail() || '').toLowerCase();
  if (!owner || !folder.getOwner() || String(folder.getOwner().getEmail()).toLowerCase() !== owner) throw new Error('SCORES_OWNER_DOMAIN_UNVERIFIED');
  if (/Liam.*勿動/i.test(folder.getName())) throw new Error('SCORES_PROTECTED_FOLDER');
  if (folder.getSharingAccess() !== DriveApp.Access.PRIVATE || folder.getEditors().length || folder.getViewers().length) throw new Error('SCORES_FOLDER_NOT_PRIVATE');
  return folder;
}

function departmentScoresHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8).map(function(b){return ('0' + ((b+256)%256).toString(16)).slice(-2);}).join('');
}

function departmentScoresState_(folder) {
  const files = folder.getFilesByName(DEPARTMENT_SCORES_MANIFEST);
  let file = null;
  while (files.hasNext()) { if (file) throw new Error('SCORES_MANIFEST_AMBIGUOUS'); file=files.next(); }
  if (!file) return {file:null, state:{contract:DepartmentScoresCore.CONTRACT,generation:0,months:{},receipts:[]}};
  departmentScoresPrivateFile_(file,folder);
  const state=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if(state.contract!==DepartmentScoresCore.CONTRACT||!Number.isInteger(state.generation)||!state.months||!Array.isArray(state.receipts)) throw new Error('SCORES_MANIFEST_INVALID');
  return {file:file,state:state};
}

function departmentScoresPrivateFile_(file,folder) {
  let contained=false;const parents=file.getParents();while(parents.hasNext()) if(parents.next().getId()===folder.getId()) contained=true;
  if(!contained||file.getSharingAccess()!==DriveApp.Access.PRIVATE||file.getEditors().length||file.getViewers().length||file.getOwner().getEmail()!==folder.getOwner().getEmail()) throw new Error('SCORES_REVISION_OUTSIDE_PRIVATE_DOMAIN');
}

function departmentScoresRevision_(folder,entry) {
  const file=DriveApp.getFileById(entry.fileId);departmentScoresPrivateFile_(file,folder);
  const data=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  const month=DepartmentScoresCore.validateMonth(data.month);
  if(data.contract!==DepartmentScoresCore.CONTRACT||data.revision!==entry.revision||month.monthKey!==entry.monthKey||departmentScoresHash_(DepartmentScoresCore.canonical(month))!==entry.contentHash) throw new Error('SCORES_REVISION_READBACK_MISMATCH');
  return month;
}

function departmentScoresPublicEntry_(entry) {
  return {monthKey:entry.monthKey,revision:entry.revision,contentHash:entry.contentHash,sourceHash:entry.sourceHash,sourceName:entry.sourceName,publishedAt:entry.publishedAt,restoredFrom:entry.restoredFrom||''};
}

function departmentScoresRead_(body) {
  ptRequireSession_(body.token,'department_scores_read');
  const folder=departmentScoresFolder_(),state=departmentScoresState_(folder).state;
  const months=Object.keys(state.months).sort().map(function(key){const slot=state.months[key];return {month:departmentScoresRevision_(folder,slot.active),active:departmentScoresPublicEntry_(slot.active),history:slot.history.map(departmentScoresPublicEntry_)};});
  return {contract:DepartmentScoresCore.CONTRACT,available:months.length>0,generation:state.generation,months:months};
}

function departmentScoresHistoryRead_(body) {
  ptRequireSession_(body.token,'department_scores_history_read');
  const folder=departmentScoresFolder_(),state=departmentScoresState_(folder).state,slot=state.months[String(body.monthKey||'')];
  const entry=slot&&[slot.active].concat(slot.history).find(function(v){return v.revision===body.revision;});
  if(!entry) throw new Error('SCORES_REVISION_NOT_FOUND');
  return {contract:DepartmentScoresCore.CONTRACT,generation:state.generation,month:departmentScoresRevision_(folder,entry),active:departmentScoresPublicEntry_(entry)};
}

function departmentScoresWrite_(body,restore) {
  ptRequireSession_(body.token,restore?'department_scores_restore':'department_scores_publish');
  if(JSON.stringify(body).length>8000000) throw new Error('SCORES_PAYLOAD_SIZE_LIMIT');
  if(body.confirm!==true||!/^[-A-Za-z0-9]{16,80}$/.test(String(body.requestId||''))) throw new Error('SCORES_EXPLICIT_CONFIRM_REQUIRED');
  if(!Number.isInteger(body.expectedGeneration)||body.expectedGeneration<0) throw new Error('SCORES_PREVIEW_GENERATION_REQUIRED');
  const folder=departmentScoresFolder_(),lock=LockService.getScriptLock();lock.waitLock(20000);
  try {
    const current=departmentScoresState_(folder),state=current.state;
    let months,sourceHash,sourceName,restoredFrom='';
    if(restore){
      const slot=state.months[String(body.monthKey||'')],entry=slot&&slot.history.find(function(v){return v.revision===body.revision;});
      if(!entry) throw new Error('SCORES_REVISION_NOT_FOUND');
      months=[departmentScoresRevision_(folder,entry)];sourceHash=entry.sourceHash;sourceName=entry.sourceName;restoredFrom=entry.revision;
    }else{
      if(body.contract!==DepartmentScoresCore.CONTRACT||!Array.isArray(body.months)||!Array.isArray(body.selectedMonthKeys)||body.selectedMonthKeys.length<1||body.selectedMonthKeys.length>24||body.months.length!==body.selectedMonthKeys.length) throw new Error('SCORES_MONTH_SELECTION_INVALID');
      months=body.months.map(DepartmentScoresCore.validateMonth);
      const keys=months.map(function(m){return m.monthKey;}).sort(),selected=body.selectedMonthKeys.slice().sort();
      if(new Set(keys).size!==keys.length||JSON.stringify(keys)!==JSON.stringify(selected)) throw new Error('SCORES_MONTH_SELECTION_INVALID');
      sourceHash=String(body.sourceHash||'');sourceName=String(body.sourceName||'').trim();
      if(!/^[a-f0-9]{64}$/.test(sourceHash)||!sourceName||sourceName.length>160) throw new Error('SCORES_SOURCE_INVALID');
    }
    const signature=departmentScoresHash_(JSON.stringify({restore:restore,months:months.map(DepartmentScoresCore.canonical),sourceHash:sourceHash,restoredFrom:restoredFrom}));
    const receipt=state.receipts.find(function(r){return r.requestId===body.requestId;});
    if(receipt){if(receipt.signature!==signature) throw new Error('SCORES_REQUEST_ID_REUSED');return receipt.result;}
    if(state.generation!==body.expectedGeneration) throw new Error('SCORES_PREVIEW_STALE');
    const changed=months.filter(function(m){const slot=state.months[m.monthKey];return !slot||slot.active.contentHash!==departmentScoresHash_(DepartmentScoresCore.canonical(m));});
    if(!changed.length) return {contract:DepartmentScoresCore.CONTRACT,generation:state.generation,changed:[],deduplicated:true};
    const publishedAt=new Date().toISOString(),entries=[];
    changed.forEach(function(month){
      const revision=Utilities.getUuid(),contentHash=departmentScoresHash_(DepartmentScoresCore.canonical(month));
      const file=folder.createFile('north12-scores-'+month.monthKey+'-'+revision+'.json',JSON.stringify({contract:DepartmentScoresCore.CONTRACT,revision:revision,month:month}),MimeType.PLAIN_TEXT);
      const entry={monthKey:month.monthKey,revision:revision,contentHash:contentHash,sourceHash:sourceHash,sourceName:sourceName,publishedAt:publishedAt,restoredFrom:restoredFrom,fileId:file.getId()};
      departmentScoresRevision_(folder,entry); // verify bytes before exposing any month in the manifest
      entries.push(entry);
    });
    entries.forEach(function(entry){const prior=state.months[entry.monthKey];state.months[entry.monthKey]={active:entry,history:prior?prior.history.concat([prior.active]):[]};});
    state.generation+=1;
    const result={contract:DepartmentScoresCore.CONTRACT,generation:state.generation,changed:entries.map(departmentScoresPublicEntry_),deduplicated:false};
    state.receipts.push({requestId:body.requestId,signature:signature,result:result});state.receipts=state.receipts.slice(-200);
    const content=JSON.stringify(state);if(content.length>2000000) throw new Error('SCORES_MANIFEST_SIZE_LIMIT');
    if(current.file) current.file.setContent(content);else folder.createFile(DEPARTMENT_SCORES_MANIFEST,content,MimeType.PLAIN_TEXT);
    const readback=departmentScoresState_(folder).state;
    if(readback.generation!==state.generation||JSON.stringify(readback.months)!==JSON.stringify(state.months)) throw new Error('SCORES_MANIFEST_READBACK_MISMATCH');
    return result;
  }finally{lock.releaseLock();}
}

function departmentScoresDispatch_(body) {
  if(body.action==='department_scores_read')return departmentScoresRead_(body);
  if(body.action==='department_scores_history_read')return departmentScoresHistoryRead_(body);
  if(body.action==='department_scores_publish')return departmentScoresWrite_(body,false);
  if(body.action==='department_scores_restore')return departmentScoresWrite_(body,true);
  throw new Error('unknown protected scores action');
}
