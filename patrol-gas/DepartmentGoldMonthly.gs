// Monthly company gold is independent of the North12B relay ledger.
const DEPARTMENT_GOLD_REGISTRY = 'north12-department-gold-monthly-registry-v2.json';
const DEPARTMENT_GOLD_REGISTRY_SCHEMA = 'north12-department-gold-registry/v2';

function departmentGoldMonthlyPrivate_(item) {
  if (item.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('GOLD_STORAGE_NOT_PRIVATE');
  const owner = item.getOwner();
  if (!owner) throw new Error('GOLD_STORAGE_OWNER_MISSING');
  const email = owner.getEmail();
  if (item.getEditors().concat(item.getViewers()).some(function(user){return user.getEmail() !== email;})) throw new Error('GOLD_STORAGE_SHARED');
  return item;
}

function departmentGoldMonthlyFolder_() {
  return departmentGoldMonthlyPrivate_(departmentOpsFolder_());
}

function departmentGoldMonthlyFile_(id, folder) {
  const file = departmentGoldMonthlyPrivate_(DriveApp.getFileById(id));
  const parents = file.getParents();
  if (!parents.hasNext() || parents.next().getId() !== folder.getId() || parents.hasNext()) throw new Error('GOLD_STORAGE_PARENT_MISMATCH');
  return file;
}

function departmentGoldMonthlyRegistry_(folder) {
  const files = folder.getFilesByName(DEPARTMENT_GOLD_REGISTRY);
  if (!files.hasNext()) {
    const legacy = departmentOpsLatestSnapshot_();
    // Existing source months, including the reported Q2, are copied untouched.
    const baseMonths = legacy && Array.isArray(legacy.months) ? legacy.months : [];
    return {file:null, state:{schema:DEPARTMENT_GOLD_REGISTRY_SCHEMA,revision:'legacy-' + ptHashHex_(JSON.stringify(baseMonths)),baseMonths:baseMonths,activeByMonth:{},historyByMonth:{},operations:{}}};
  }
  const file = departmentGoldMonthlyFile_(files.next().getId(),folder);
  if (files.hasNext()) throw new Error('GOLD_REGISTRY_AMBIGUOUS');
  const state = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if (!state || state.schema !== DEPARTMENT_GOLD_REGISTRY_SCHEMA || !state.revision || !Array.isArray(state.baseMonths) || !state.activeByMonth || !state.historyByMonth || !state.operations) throw new Error('GOLD_REGISTRY_INVALID');
  return {file:file,state:state};
}

function departmentGoldMonthlyVersion_(entry, registry, folder) {
  if (entry.legacyMonth) {
    const month = registry.baseMonths.find(function(m){return m.monthKey === entry.legacyMonth;});
    if (!month) throw new Error('GOLD_LEGACY_VERSION_MISSING');
    return {...month,versionId:entry.versionId,settlementStatus:month.monthKey < '2026-07' ? 'archived' : 'provisional',legacy:true};
  }
  const file = departmentGoldMonthlyFile_(entry.fileId,folder);
  const stored = JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if (!stored || stored.versionId !== entry.versionId || stored.contentHash !== entry.contentHash) throw new Error('GOLD_VERSION_INVALID');
  const m = DepartmentGoldMonthlyCore.validateMonth(stored.month);
  if (ptHashHex_(JSON.stringify(m)) !== entry.contentHash) throw new Error('GOLD_VERSION_HASH_MISMATCH');
  return {...m,versionId:entry.versionId,publishedAt:entry.publishedAt};
}

function departmentGoldMonthlyMonths_(state, folder) {
  const result = new Map();
  state.baseMonths.forEach(function(m){
    if (result.has(m.monthKey)) throw new Error('GOLD_LEGACY_MONTH_DUPLICATE');
    result.set(m.monthKey,{...m,versionId:'legacy-' + ptHashHex_(JSON.stringify(m)),settlementStatus:m.monthKey < '2026-07'?'archived':'provisional',legacy:true});
  });
  Object.keys(state.activeByMonth).forEach(function(key){
    const m = departmentGoldMonthlyVersion_(state.activeByMonth[key],state,folder);
    if (m.monthKey !== key) throw new Error('GOLD_MONTH_POINTER_MISMATCH');
    result.set(key,m);
  });
  return Array.from(result.values()).sort(function(a,b){return a.monthKey.localeCompare(b.monthKey);});
}

function departmentGoldMonthlyRead_(body) {
  const folder = departmentGoldMonthlyFolder_(), registry = departmentGoldMonthlyRegistry_(folder), state=registry.state;
  const months = departmentGoldMonthlyMonths_(state,folder);
  const history = {};
  Object.keys(state.historyByMonth).forEach(function(k){history[k]=state.historyByMonth[k].map(function(e){return {versionId:e.versionId,publishedAt:e.publishedAt,sourceName:e.sourceName,cutoff:e.cutoff,status:e.status,total:e.total};});});
  return {available:months.length>0,gold:{type:'north12-monthly-v2',months:months},monthly:{revision:state.revision,history:history,operation:body.operationId ? state.operations[body.operationId] || null : null}};
}

function departmentGoldMonthlyReceipt_(claims) {
  const encoded = Utilities.base64EncodeWebSafe(JSON.stringify(claims)).replace(/=+$/g,'');
  const signature = ptBase64UrlEncode_(Utilities.computeHmacSha256Signature('department-gold-plan:' + encoded,ptSessionSigningKey_()));
  return encoded + '.' + signature;
}

function departmentGoldMonthlyCheckReceipt_(receipt, claims) {
  const parts=String(receipt||'').split('.');
  if(parts.length!==2)throw new Error('GOLD_PREVIEW_REQUIRED');
  const signature=ptBase64UrlEncode_(Utilities.computeHmacSha256Signature('department-gold-plan:' + parts[0],ptSessionSigningKey_()));
  if(!ptConstantTimeEqual_(signature,parts[1]))throw new Error('GOLD_PREVIEW_INVALID');
  const prior=JSON.parse(ptBase64UrlDecodeText_(parts[0]));
  if(prior.expires<=ptSessionNowSeconds_())throw new Error('GOLD_PREVIEW_EXPIRED');
  for(const k of ['revision','payloadHash','sessionHash','operationId','kind'])if(prior[k]!==claims[k])throw new Error('GOLD_PREVIEW_CHANGED');
}

function departmentGoldMonthlyPublish_(body) {
  if(body.contract!=='north12-monthly-write/v2')throw new Error('GOLD_REFRESH_REQUIRED');
  if(!['plan','commit','restore-plan','restore'].includes(body.mode))throw new Error('GOLD_MODE_INVALID');
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(body.operationId||''))throw new Error('GOLD_OPERATION_INVALID');
  const restoring=body.mode.indexOf('restore')===0;
  const core=DepartmentGoldMonthlyCore;
  const candidates=restoring?[]:(Array.isArray(body.months)?body.months:[]).map(core.validateMonth);
  if(!restoring&&(candidates.length<1||candidates.length>12))throw new Error('GOLD_MONTH_COUNT_INVALID');
  if(JSON.stringify(candidates).length>6000000)throw new Error('GOLD_PAYLOAD_TOO_LARGE');
  const keys=restoring?[body.monthKey]:candidates.map(function(m){return m.monthKey;});
  if(new Set(keys).size!==keys.length)throw new Error('GOLD_MONTH_DUPLICATE');
  keys.forEach(function(k){core.quarter(k);if(k<'2026-07')throw new Error('GOLD_REPORTED_HISTORY_LOCKED');});
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const folder=departmentGoldMonthlyFolder_(), registry=departmentGoldMonthlyRegistry_(folder), state=registry.state;
    const payloadHash=ptHashHex_(JSON.stringify(restoring?{monthKey:body.monthKey,versionId:body.versionId}:candidates));
    const known=state.operations[body.operationId];
    if(known){if(known.payloadHash!==payloadHash)throw new Error('GOLD_OPERATION_CONFLICT');return {result:'already-committed',receipt:known,...departmentGoldMonthlyRead_(body)};}
    if(body.expectedRevision!==state.revision)throw new Error('GOLD_VERSION_CONFLICT');
    const existing=departmentGoldMonthlyMonths_(state,folder), byMonth=new Map(existing.map(function(m){return [m.monthKey,m];}));
    let restoreEntry=null;
    if(restoring){restoreEntry=(state.historyByMonth[body.monthKey]||[]).find(function(e){return e.versionId===body.versionId;});if(!restoreEntry)throw new Error('GOLD_HISTORY_MISSING');candidates.push(departmentGoldMonthlyVersion_(restoreEntry,state,folder));}
    const changes=candidates.map(function(m){
      const old=byMonth.get(m.monthKey);
      const sameData=!!old&&!old.legacy&&core.contentKey(old)===core.contentKey(m);
      if(old&&!old.legacy&&old.sourceHash===m.sourceHash&&!sameData)throw new Error('GOLD_SOURCE_HASH_CONFLICT');
      return {monthKey:m.monthKey,beforeCutoff:old?.dateRange?.cutoff||null,cutoff:m.dateRange.cutoff,beforeTotal:old?core.summarize(old.records).total:null,total:core.summarize(m.records).total,changedPeople:core.diff(old,m).length,same:sameData&&old.settlementStatus===m.settlementStatus&&(!restoring||old.versionId===body.versionId),older:!!old&&m.dateRange.cutoff<old.dateRange.cutoff,finalDowngrade:old?.settlementStatus==='final'&&m.settlementStatus!=='final'};
    });
    const claims={revision:state.revision,payloadHash:payloadHash,sessionHash:ptHashHex_(body.token),operationId:body.operationId,kind:restoring?'restore':'commit',expires:ptSessionNowSeconds_()+600};
    if(body.mode==='plan'||body.mode==='restore-plan')return {result:'preview',planReceipt:departmentGoldMonthlyReceipt_(claims),changes:changes,differences:candidates.map(function(m){return {monthKey:m.monthKey,rows:core.diff(byMonth.get(m.monthKey),m)};}),revision:state.revision};
    if(body.confirm!==true)throw new Error('GOLD_CONFIRMATION_REQUIRED');
    departmentGoldMonthlyCheckReceipt_(body.planReceipt,claims);
    if(changes.some(function(c){return c.older||c.finalDowngrade;})&&body.confirmRegression!==true)throw new Error('GOLD_REGRESSION_CONFIRMATION_REQUIRED');
    if(changes.every(function(c){return c.same;}))return {result:'unchanged',...departmentGoldMonthlyRead_(body)};
    const next=JSON.parse(JSON.stringify(state)), stamp=new Date().toISOString();
    candidates.forEach(function(m,i){
      if(changes[i].same)return;
      let entry=restoreEntry;
      if(!restoring){
        const versionId=Utilities.getUuid(),contentHash=ptHashHex_(JSON.stringify(m));
        const file=folder.createFile('north12-department-gold-month-v2-'+versionId+'.json',JSON.stringify({versionId:versionId,contentHash:contentHash,month:m}),MimeType.PLAIN_TEXT);
        entry={versionId:versionId,fileId:file.getId(),contentHash:contentHash,publishedAt:stamp,sourceName:m.sourceName,cutoff:m.dateRange.cutoff,status:m.settlementStatus,total:m.validation.total};
        departmentGoldMonthlyVersion_(entry,next,folder);
      }
      if(!next.historyByMonth[m.monthKey]){
        next.historyByMonth[m.monthKey]=[];
        const base=state.baseMonths.find(function(x){return x.monthKey===m.monthKey;});
        if(base)next.historyByMonth[m.monthKey].push({legacyMonth:m.monthKey,versionId:'legacy-'+ptHashHex_(JSON.stringify(base)),sourceName:'既有保存版本',status:'provisional',cutoff:base.dateRange.cutoff,total:core.summarize(base.records).total,publishedAt:''});
      }
      if(!restoring)next.historyByMonth[m.monthKey].push(entry);
      next.activeByMonth[m.monthKey]=entry;
    });
    next.revision=Utilities.getUuid();
    next.operations[body.operationId]={operationId:body.operationId,payloadHash:payloadHash,revision:next.revision,kind:claims.kind,months:keys,publishedAt:stamp};
    const text=JSON.stringify(next);
    if(text.length>6000000)throw new Error('GOLD_REGISTRY_TOO_LARGE');
    const previous=registry.file?registry.file.getBlob().getDataAsString('UTF-8'):null;
    const backup=folder.createFile('north12-department-gold-registry-backup-'+next.revision+'.json',JSON.stringify(state),MimeType.PLAIN_TEXT);
    departmentGoldMonthlyFile_(backup.getId(),folder);
    const target=registry.file||folder.createFile(DEPARTMENT_GOLD_REGISTRY,JSON.stringify(state),MimeType.PLAIN_TEXT);
    try {
      target.setContent(text);
      if(target.getBlob().getDataAsString('UTF-8')!==text)throw new Error('GOLD_READBACK_MISMATCH');
      const read=departmentGoldMonthlyRead_(body);
      if(read.monthly.revision!==next.revision)throw new Error('GOLD_READBACK_MISMATCH');
      return {result:'committed',receipt:next.operations[body.operationId],...read};
    } catch(error) {
      try {
        const priorText=previous||JSON.stringify(state);
        target.setContent(priorText);
        if(target.getBlob().getDataAsString('UTF-8')!==priorText)throw new Error('GOLD_RECOVERY_READBACK_MISMATCH');
      }
      catch(restoreError){throw new Error('GOLD_READBACK_AND_RECOVERY_FAILED');}
      throw new Error('GOLD_READBACK_FAILED_PREVIOUS_RESTORED');
    }
  } finally {lock.releaseLock();}
}
