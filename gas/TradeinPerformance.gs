// Monthly performance has its own private registry; it never enters public price data.
function tradeinPerformanceAuthorize_(payload) {
  return privateDashboardTradeinReadBoundary_(payload, function() {

  const id=privateDashboardCleanEmployeeId((payload || {}).employeeId);
  const device=privateDashboardCleanDeviceId((payload || {}).deviceId);
  const lookup=privateDashboardUserByEmployeeId(id);
  const trusted=privateDashboardIsTrustedEmployee(id);
  if(!lookup.user || lookup.user.status!=='active' || !trusted && lookup.user.device_id!==device)
    throw new Error('此員編或裝置尚未核准，無法讀取個人舊換新');
  if(!trusted && !TradeinPerformanceCore.storeName(lookup.user.store))throw new Error('此員編不在九店範圍');
  return {id:id,user:lookup.user,supervisor:trusted && lookup.user.role==='督導'};

  });
}
function tradeinPerformanceRoster_() {
  return privateDashboardRows(privateDashboardSheet(PRIVATE_DASHBOARD_USERS_SHEET,PRIVATE_DASHBOARD_USERS_HEADERS),PRIVATE_DASHBOARD_USERS_HEADERS)
    .map(function(r){return {employee_id:r.employee_id,masked_name:r.masked_name,store:r.store,role:r.role,status:r.status};});
}
function tradeinPerformanceMonthRoster_(month,body) {
  // Access roster authorizes viewing; it is not an HR/monthly-target source.
  const period=TradeinPerformanceCore.monthPeriod(month);
  if(body===undefined){
    const file=tradeinPerformanceFile_('north12b-tradein-monthly-roster-'+month+'.json');
    if(!file)throw new Error('本月正式名冊／職務生效期間尚未核實，不能用登入名冊推算目標');
    body=file.getBlob().getDataAsString('UTF-8');
  }
  if(body===null)throw new Error('本月正式名冊／職務生效期間尚未核實，不能用登入名冊推算目標');
  const basis=JSON.parse(body);
  if(basis.schema_version!=='tradein-monthly-roster/v1' || basis.month!==month || basis.review_status!=='verified' ||
     basis.rule_id!==TradeinPerformanceCore.RULE_ID || !/^[a-f0-9]{64}$/.test(basis.source_sha256 || '') || (!Array.isArray(basis.people) || !basis.people.length || basis.people.length>5000))
    throw new Error('月名冊來源、月份或核定狀態不符');
  const seen={},roles=['店長','代理店長','副店長','資深業務代表','業代','銷售人員','同仁','業務代表(I)','業務代表(II)','業務代表(III)'];
  function validDate(v){return typeof v==='string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v+'T00:00:00Z')) && new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}
  return basis.people.map(function(p){
    if(typeof p.employee_id!=='string' || !/^[A-Z0-9]{7}$/.test(p.employee_id) || seen[p.employee_id] ||
       !TradeinPerformanceCore.storeName(p.store) || !roles.includes(p.role) || !['active','inactive'].includes(p.status) ||
       typeof p.masked_name!=='string' || !p.masked_name.trim() || !validDate(p.effective_from) ||
       p.effective_to!==null && (!validDate(p.effective_to) || p.effective_to<p.effective_from))
      throw new Error('月名冊身份、店點、職務或生效期間缺漏／衝突');
    seen[p.employee_id]=true;
    // Partial-month employment/role changes require an explicit reviewed policy.
    // No proration, role inference or automatic monthly target is introduced here.
    if(p.status==='active' && (p.effective_from>period.start || p.effective_to!==null && p.effective_to<period.end))
      throw new Error('月中到離職／職務異動尚待核定，本批停止目標計算');
    return {employee_id:p.employee_id,masked_name:p.masked_name,store:p.store,role:p.role,status:p.status,
      effective_from:p.effective_from,effective_to:p.effective_to,monthly_basis_sha256:basis.source_sha256};
  });
}
function tradeinPerformanceReferencePolicy_(value) {
  if(!value || value.counting_review_status!=='verified' || value.counting_rule_id!==TradeinPerformanceCore.RULE_ID ||
     !['monthly-reset-no-cancellations/v1','monthly-reset-same-month-net/v2'].includes(value.counting_policy))
    throw new Error('每月重新計數口徑尚未核定，停止實績計算');
}
function tradeinPerformancePrivateReference_(source,roster) {
  if(!source || !/^[a-f0-9]{64}$/.test(source.source_sha256 || ''))throw new Error('來源雜湊無效');
  const file=tradeinPerformanceFile_('north12b-tradein-reference-'+source.source_sha256+'.json');
  const cancelled=tradeinPerformanceSameMonthCancellations_(source);
  const value=file?JSON.parse(file.getBlob().getDataAsString('UTF-8')):
    tradeinPerformanceReuseReference_(source,roster || tradeinPerformanceMonthRoster_(source.month));
  tradeinPerformanceReferencePolicy_(value);
  if(cancelled.length && value.counting_policy!=='monthly-reset-same-month-net/v2')
    throw new Error('本批私有對照尚未核定同月成交 +1／取消 −1，請管理者核對後重新預覽');
  return value;
}
function tradeinPerformanceSameMonthCancellations_(source) {
  if(!Array.isArray(source.records))throw new Error('來源明細格式無效');
  return source.records.filter(function(r){
    if(r.cancel_date===null || r.cancel_date===undefined || r.cancel_date==='')return false;
    if(typeof r.cancel_date!=='string' || typeof r.trade_date!=='string' ||
       !/^\d{4}-\d{2}-\d{2}$/.test(r.cancel_date) || !/^\d{4}-\d{2}-\d{2}$/.test(r.trade_date))
      throw new Error('交易／取消日期格式無效');
    if(r.cancel_date.slice(0,7)!==source.month || r.trade_date.slice(0,7)!==source.month)
      throw new Error('本批含跨月取消交易；沖回月份尚待核定，整批停止同步');
    return true;
  });
}
// Private immutable snapshot evidence, not an increment/decrement API. Stable
// transaction keys exclude export hashes/row numbers and never leave this owner.
function tradeinPerformanceCancellationEvidence_(source,reference) {
  const ids=new Map(reference.employees.map(function(e){return [TradeinPerformanceCore.sourceEmployeeId(e.source_employee_id),e.employee_key];})),events=new Map();
  tradeinPerformanceSameMonthCancellations_(source).forEach(function(r){
    const key=tradeinPerformanceHash_([r.store_code,r.trade_date,r.order_number.trim(),r.recycle_code.trim()]);
    const pair={transaction_key:key,store_code:r.store_code,employee_key:ids.get(TradeinPerformanceCore.sourceEmployeeId(r.source_employee_id)),
      metadata_hash:tradeinPerformanceHash_([r.project,TradeinPerformanceCore.shortModel(r.recycle_model)]),
      sale:{event_id:tradeinPerformanceDigest_(key+':sale'),date:r.trade_date,quantity:1},
      cancellation:{event_id:tradeinPerformanceDigest_(key+':cancel'),date:r.cancel_date,quantity:-1}};
    if(events.has(key) && JSON.stringify(events.get(key))!==JSON.stringify(pair))throw new Error('同筆取消交易的日期或歸屬衝突，整批停止同步');
    events.set(key,pair);
  });
  return {schema_version:'tradein-same-month-cancellation/v1',policy:'sale-plus-cancel-minus/same-month/v1',
    pairs:[...events.values()].sort(function(a,b){return a.transaction_key.localeCompare(b.transaction_key);})};
}
function tradeinPerformanceReuseReference_(source,roster) {
  // Only reuse the owner-held crosswalk behind this month's published version.
  // Only the approved optional-55 rule can extend identities from the verified
  // monthly roster. Client mapping, login roster and name matching remain unused.
  const active=(tradeinPerformanceRegistry_().months[source.month] || {}).active;
  if(!active)throw new Error('本批私有員編／店碼對照尚未配置，請先核定本月首次來源');
  if(active.roster_hash!==tradeinPerformanceHash_(roster))throw new Error('核定月名冊已變更，請先核對員編及店點異動');
  const snapshot=tradeinPerformanceSnapshot_(active);
  if(snapshot.period_key!==source.month || snapshot.source_sha256!==active.source_sha256 ||
     snapshot.source_period.start!==source.source_start || source.source_end<snapshot.source_cutoff_date)
    throw new Error('來源月份或期間與已核定版本不符，請使用完整本月新檔');
  const file=tradeinPerformanceFile_('north12b-tradein-reference-'+active.source_sha256+'.json');
  if(!file)throw new Error('已發布版本的私有員編／店碼對照缺漏，請管理者核對');
  const prior=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if(active.reference_hash && tradeinPerformanceHash_(prior)!==active.reference_hash)
    throw new Error('已發布版本的私有對照已變更，請管理者核對');
  tradeinPerformanceReferencePolicy_(prior);
  // Validate all identifiers, store mappings and original observations before reuse.
  TradeinPerformanceCore.build({month:source.month,source_start:snapshot.source_period.start,
    source_end:snapshot.source_period.end,status_as_of_date:snapshot.status_as_of_date,
    source_sha256:active.source_sha256,rule_id:TradeinPerformanceCore.RULE_ID,complete_nine_stores:true,records:[]},roster,prior);
  const next=JSON.parse(JSON.stringify(prior)),identities=new Map(next.employees.map(function(p){return [TradeinPerformanceCore.sourceEmployeeId(p.source_employee_id),p];}));
  const people=new Map(roster.filter(function(p){return p.status==='active';}).map(function(p){return [p.employee_id,p];}));
  const published=new Map(snapshot.people.map(function(p){return [p.employee_key,p];}));
  const stores=new Map(next.stores.map(function(p){return [p.store_code,TradeinPerformanceCore.storeName(p.store)];}));
  const pending=new Set();
  source.records.forEach(function(record){
    const sourceId=TradeinPerformanceCore.sourceEmployeeId(record.source_employee_id);
    let identity=identities.get(sourceId);
    if(!identity && people.has('55'+sourceId))
      identity={source_employee_id:sourceId,employee_key:'55'+sourceId,observations:[]};
    const person=identity && people.get(identity.employee_key),
      confirmed=identity && published.get(identity.employee_key),store=stores.get(record.store_code);
    if(!store)throw new Error('來源含九店範圍以外或未知店碼');
    if(!person || !confirmed || confirmed.identity_status!=='confirmed' ||
       TradeinPerformanceCore.storeName(person.store)!==store || confirmed.store!==store ||
       identity.observations.some(function(o){return stores.get(o.store_code)!==store;})){
      pending.add(JSON.stringify([record.source_employee_id,record.store_code]));return;
    }
    if(!identities.has(sourceId)){identities.set(sourceId,identity);next.employees.push(identity);}
    if(!identity.observations.some(function(o){return o.trade_date===record.trade_date && o.store_code===record.store_code;}))
      identity.observations.push({trade_date:record.trade_date,store_code:record.store_code});
  });
  if(pending.size)throw new Error('新檔有 '+pending.size+' 組新增員編或店點異動待核，請管理者更新私有對照後重新預覽');
  next.source_sha256=source.source_sha256;next.source_start=source.source_start;next.source_end=source.source_end;
  next.employee_id_policy='optional-55-prefix/v1';
  // Only a new source reference derived from the verified active monthly basis
  // adopts the narrow same-month policy. Existing exact references are not rewritten.
  if(tradeinPerformanceSameMonthCancellations_(source).length)next.counting_policy='monthly-reset-same-month-net/v2';
  return next;
}
function tradeinPerformanceSaveReference_(source,reference) {
  const name='north12b-tradein-reference-'+source.source_sha256+'.json',hash=tradeinPerformanceHash_(reference);
  let file=tradeinPerformanceFile_(name);
  if(file){
    if(tradeinPerformanceHash_(JSON.parse(file.getBlob().getDataAsString('UTF-8')))!==hash)
      throw new Error('本批私有對照已變更，請重新預覽');
  }else file=tradeinPerformanceFolder_().createFile(name,JSON.stringify(reference),MimeType.PLAIN_TEXT);
  if(tradeinPerformanceHash_(JSON.parse(file.getBlob().getDataAsString('UTF-8')))!==hash)
    throw new Error('私有對照保存後核對失敗');
  return hash;
}
function tradeinPerformanceFolder_() {
  const folder=privateDashboardFolder();
  if(folder.getSharingAccess()!==DriveApp.Access.PRIVATE || folder.getSharingPermission()!==DriveApp.Permission.NONE)
    throw new Error('舊換新資料夾必須維持私有');
  return folder;
}
function tradeinPerformanceFile_(name) {
  const files=tradeinPerformanceFolder_().getFilesByName(name);let found=null;
  while(files.hasNext()){if(found)throw new Error('舊換新私有資料檔重複');found=files.next();}return found;
}
function tradeinPerformanceRegistry_() {
  const file=tradeinPerformanceFile_('north12b-tradein-performance-registry.json');
  if(!file)return {schema_version:'tradein-performance-registry/v1',months:{}};
  const registry=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if(!registry || registry.schema_version!=='tradein-performance-registry/v1' || !registry.months)throw new Error('舊換新 registry 格式無效');
  return registry;
}
// Business hashes use UTF-8 explicitly; legacy authentication hashing is untouched.
function tradeinPerformanceDigest_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ''), Utilities.Charset.UTF_8)
    .map(function(byte){return ('0'+((byte+256)%256).toString(16)).slice(-2);}).join('');
}
function tradeinPerformanceHash_(value) {return tradeinPerformanceDigest_(JSON.stringify(value));}
function tradeinPerformanceSnapshot_(entry) {
  if(!entry)return null;
  const file=DriveApp.getFileById(entry.file_id),parents=file.getParents(),folderId=tradeinPerformanceFolder_().getId();
  let inFolder=false;while(parents.hasNext()){if(parents.next().getId()===folderId)inFolder=true;}
  if(!inFolder)throw new Error('舊換新快照不屬於指定私有資料夾');
  const value=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if(value.schema_version!=='tradein-performance/v1' || value.rule_id!==TradeinPerformanceCore.RULE_ID ||
      tradeinPerformanceHash_(value)!==entry.snapshot_hash)throw new Error('舊換新私有快照版本或雜湊核對失敗');
  return value;
}
function tradeinPerformanceProjection_(snapshot,auth) {
  if(!snapshot)return null;
  const people=snapshot.people.filter(function(p){return auth.supervisor || p.employee_key===auth.id;});
  return {
    schema_version:snapshot.schema_version,period_key:snapshot.period_key,rule_id:snapshot.rule_id,
    target_period:snapshot.target_period,source_period:snapshot.source_period,source_cutoff_date:snapshot.source_cutoff_date,
    cutoff_precision:snapshot.cutoff_precision,timezone:snapshot.timezone,published_at:snapshot.published_at,status_as_of_date:snapshot.status_as_of_date,
    people:people.map(function(p){return {store:p.store,masked_name:p.masked_name,role:p.role,original_role:p.original_role,
      actual_units:p.actual_units,target_units:p.target_units,remaining_units:p.remaining_units,attainment_status:p.attainment_status};}),
    stores:auth.supervisor?snapshot.stores:[],summary:auth.supervisor?snapshot.summary:null
  };
}
function tradeinPerformanceRead(payload) {
  return privateDashboardTradeinReadBoundary_(payload, function() {

  const auth=tradeinPerformanceAuthorize_(payload);
  TradeinPerformanceCore.monthPeriod(payload.month);
  const registry=tradeinPerformanceRegistry_(),entry=(registry.months[payload.month] || {}).active;
  if(entry && entry.roster_hash!==tradeinPerformanceHash_(tradeinPerformanceMonthRoster_(payload.month)))throw new Error('核定月名冊已變更，請管理者重新核對來源與月份；不以登入名冊回填');
  const snapshot=tradeinPerformanceSnapshot_(entry);
  return {snapshot:tradeinPerformanceProjection_(snapshot,auth),snapshotHash:entry?entry.snapshot_hash:null,
    access:{mode:auth.supervisor?'supervisor':'self',allowedStores:auth.supervisor?TradeinPerformanceCore.STORES.map(function(s){return s[1];}):[],
      maskedName:auth.user.masked_name,role:auth.user.role,store:TradeinPerformanceCore.storeName(auth.user.store)},
    availableMonths:Object.keys(registry.months).sort()};

  });
}
function tradeinPerformancePreview(payload) {
  const bundled=payload.includeCheckpointState===true;
  if(bundled)tradeinPerformanceCheckpointAuthorize_({...payload,month:payload.source.month,sourceHash:payload.source.source_sha256});
  else reportUploadAuthorize_(payload);
  const lock=bundled?LockService.getScriptLock():null;if(lock)lock.waitLock(10000);
  try{
    const state=bundled?tradeinPerformanceCheckpointState_({month:payload.source.month,sourceHash:payload.source.source_sha256}):null;
    const roster=tradeinPerformanceMonthRoster_(payload.source.month,state?state.monthly.body:undefined),snapshot=tradeinPerformanceBuild_(payload.source,roster);
    const current=((state?state.registry:tradeinPerformanceRegistry_()).months[snapshot.period_key] || {}).active;
    const result={snapshot:tradeinPerformanceProjection_(snapshot,{supervisor:true}),expectedActiveHash:current?current.snapshot_hash:null,
      rosterHash:tradeinPerformanceHash_(roster),previewHash:tradeinPerformanceHash_(snapshot),sourceHash:snapshot.source_sha256};
    if(state)result.checkpointState={...tradeinPerformanceCheckpointSummary_(state),month:snapshot.period_key,sourceHash:snapshot.source_sha256};
    return result;
  }finally{if(lock)lock.releaseLock();}
}
function tradeinPerformanceBuild_(source,roster,reference) {
  const today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
  if(source.source_end>today || source.status_as_of_date>today)throw new Error('來源或取消核對日期不可晚於今天');
  const basis=reference || tradeinPerformancePrivateReference_(source,roster),value=TradeinPerformanceCore.build(source,roster,basis),
    evidence=tradeinPerformanceCancellationEvidence_(source,basis),active=(tradeinPerformanceRegistry_().months[source.month] || {}).active,
    prior=active?tradeinPerformanceSnapshot_(active):null;
  if(prior && prior.cancellation_evidence){
    const current=new Map(evidence.pairs.map(function(p){return [p.transaction_key,JSON.stringify(p)];}));
    prior.cancellation_evidence.pairs.forEach(function(p){
      if(current.get(p.transaction_key)!==JSON.stringify(p))throw new Error('已核取消交易在新來源缺漏或被改寫，請管理者核對原檔；整批停止同步');
    });
  }
  if(evidence.pairs.length){
    if(evidence.pairs.length!==value.summary.cancelled_units)throw new Error('取消交易去重與事件對帳失敗');
    value.cancellation_evidence=evidence;
  }
  return value;
}
function tradeinPerformanceSaveRegistry_(registry) {
  const name='north12b-tradein-performance-registry.json',file=tradeinPerformanceFile_(name),body=JSON.stringify(registry);
  if(file)file.setContent(body);else tradeinPerformanceFolder_().createFile(name,body,MimeType.PLAIN_TEXT);
}
function tradeinPerformancePublish(payload) {
  const operator=reportUploadAuthorize_(payload),lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const roster=tradeinPerformanceMonthRoster_(payload.source.month);
    if(tradeinPerformanceHash_(roster)!==payload.rosterHash)throw new Error('名冊已變更，請重新預覽');
    const reference=tradeinPerformancePrivateReference_(payload.source,roster),
      value=tradeinPerformanceBuild_(payload.source,roster,reference),registry=tradeinPerformanceRegistry_();
    if(payload.previewHash!==tradeinPerformanceHash_(value))throw new Error('來源或計算結果與預覽不同，請重新預覽');
    const current=registry.months[value.period_key] || {active:null,previous:null};
    const activeHash=current.active?current.active.snapshot_hash:null;
    if(payload.expectedActiveHash!==activeHash)throw new Error('同期版本已變更，請重新預覽');
    if(current.active && current.active.source_sha256===value.source_sha256 && current.active.roster_hash===payload.rosterHash) {
      const saved=tradeinPerformanceSnapshot_(current.active);
      if(current.active.preview_hash!==payload.previewHash){
        // A legacy snapshot may lack only the newly added safe aggregates.
        // Compare every original calculation field before preserving the no-op.
        const legacy=JSON.parse(JSON.stringify(value));
        ['recovered_models','recovered_days'].forEach(function(key){
          if(saved.people.every(p=>!Object.prototype.hasOwnProperty.call(p,key)))legacy.people.forEach(p=>delete p[key]);
          else if(!saved.people.every(p=>Object.prototype.hasOwnProperty.call(p,key)))throw new Error('舊快照聚合欄位不完整');
        });
        if(current.active.preview_hash!==tradeinPerformanceHash_(legacy))throw new Error('相同來源雜湊的計算結果不同，請核對原檔後重新預覽');
      }
      return {status:'unchanged',snapshotHash:activeHash,snapshot:tradeinPerformanceProjection_(saved,{supervisor:true})};
    }
    if(current.active && value.source_cutoff_date<current.active.source_cutoff_date)throw new Error('來源比目前版本舊，請使用回復功能');
    const referenceHash=tradeinPerformanceSaveReference_(payload.source,reference);
    value.published_at=privateDashboardNow();
    const hash=tradeinPerformanceHash_(value),file=tradeinPerformanceFolder_().createFile(
      'north12b-tradein-performance-'+value.period_key+'-'+hash.slice(0,16)+'.json',JSON.stringify(value),MimeType.PLAIN_TEXT);
    const entry={file_id:file.getId(),snapshot_hash:hash,source_sha256:value.source_sha256,
      source_cutoff_date:value.source_cutoff_date,roster_hash:payload.rosterHash,preview_hash:payload.previewHash,
      reference_hash:referenceHash,operator_hash:tradeinPerformanceDigest_(operator)};
    // Validate bytes before switching active. All historical files are retained.
    tradeinPerformanceSnapshot_(entry);
    registry.months[value.period_key]={active:entry,previous:current.active};
    tradeinPerformanceSaveRegistry_(registry);
    const readback=tradeinPerformanceRegistry_().months[value.period_key].active;
    if(readback.snapshot_hash!==hash)throw new Error('保存後版本回讀核對失敗');
    return {status:'published',snapshotHash:hash,snapshot:tradeinPerformanceProjection_(tradeinPerformanceSnapshot_(readback),{supervisor:true})};
  } finally {lock.releaseLock();}
}
function tradeinPerformanceRollback(payload) {
  reportUploadAuthorize_(payload);TradeinPerformanceCore.monthPeriod(payload.month);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const registry=tradeinPerformanceRegistry_(),current=registry.months[payload.month];
    if(!current || !current.active || current.active.snapshot_hash!==payload.expectedActiveHash)throw new Error('版本已變更，請重新讀取');
    if(!current.previous)throw new Error('本月沒有可回復的前一版');
    tradeinPerformanceSnapshot_(current.previous);
    const prior=current.active;current.active=current.previous;current.previous=prior;
    tradeinPerformanceSaveRegistry_(registry);
    const readback=tradeinPerformanceRegistry_().months[payload.month].active;
    if(readback.snapshot_hash!==current.active.snapshot_hash)throw new Error('回復後版本核對失敗');
    return {status:'rolled_back',snapshotHash:readback.snapshot_hash};
  } finally {lock.releaseLock();}
}

// Checkpoints are owner-held business-data backups, never auth-state backups.
// These operations do not enable the auth gate, initialize eligibility, or grant access.
function tradeinPerformanceCheckpointAuthorize_(payload) {
  const operator=reportUploadAuthorize_(payload);
  const owner=String(privateDashboardProperties().getProperty('TRADEIN_PERFORMANCE_OWNER_SCRIPT_ID') || '');
  if(!/^[A-Za-z0-9_-]{12,120}$/.test(owner) || owner!==String(ScriptApp.getScriptId()))
    throw new Error('檢查點只能在已明確配置的同一 owner 執行');
  TradeinPerformanceCore.monthPeriod(payload.month);
  if(!/^[a-f0-9]{64}$/.test(payload.sourceHash || ''))throw new Error('檢查點來源雜湊無效');
  return {operator:operator,owner:owner};
}
function tradeinPerformanceCheckpointConfig_(name) {
  const file=tradeinPerformanceFile_(name),body=file?file.getBlob().getDataAsString('UTF-8'):null;
  if(body!==null && body.length>1000000)throw new Error('檢查點配置超過容量');
  return {name:name,exists:!!file,body:body,sha256:body===null?null:tradeinPerformanceDigest_(body)};
}
function tradeinPerformanceCheckpointRegistryValue_(body) {
  if(typeof body!=='string' || body.length>1000000)throw new Error('檢查點 registry 容量／內容無效');
  const value=JSON.parse(body);
  if(!value || value.schema_version!=='tradein-performance-registry/v1' ||
      !value.months || typeof value.months!=='object' || Array.isArray(value.months))
    throw new Error('檢查點 registry 格式無效');
  Object.keys(value.months).forEach(function(month){TradeinPerformanceCore.monthPeriod(month);});
  return value;
}
function tradeinPerformanceCheckpointState_(payload) {
  const registryFile=tradeinPerformanceFile_('north12b-tradein-performance-registry.json');
  const registryBody=registryFile?registryFile.getBlob().getDataAsString('UTF-8'):
    JSON.stringify({schema_version:'tradein-performance-registry/v1',months:{}});
  const registry=tradeinPerformanceCheckpointRegistryValue_(registryBody);
  const slotPresent=Object.prototype.hasOwnProperty.call(registry.months,payload.month);
  const slot=slotPresent?registry.months[payload.month]:null;
  if(slotPresent && (!slot || typeof slot!=='object' || Array.isArray(slot)))throw new Error('本月指標格式無效');
  const publicFile=tradeinPerformanceFile_('north12b-tradein-public-registry.json');
  const publicBody=publicFile?publicFile.getBlob().getDataAsString('UTF-8'):JSON.stringify({schema_version:'tradein-public-registry/v1',months:{}});
  const publicRegistry=tradeinPerformancePublicRegistry_(publicBody);
  return {registry:registry,registryBody:registryBody,registryExists:!!registryFile,
    publicRegistry:publicRegistry,publicRegistryBody:publicBody,publicRegistryExists:!!publicFile,publicRegistryHash:tradeinPerformanceDigest_(publicBody),
    registryHash:tradeinPerformanceDigest_(registryBody),slotPresent:slotPresent,slot:slot,
    activeHash:slot && slot.active?slot.active.snapshot_hash:null,
    monthly:tradeinPerformanceCheckpointConfig_('north12b-tradein-monthly-roster-'+payload.month+'.json'),
    reference:tradeinPerformanceCheckpointConfig_('north12b-tradein-reference-'+payload.sourceHash+'.json')};
}
function tradeinPerformanceCheckpointSummary_(state) {
  return {registryExists:state.registryExists,registryHash:state.registryHash,slotPresent:state.slotPresent,
    publicRegistryExists:state.publicRegistryExists,publicRegistryHash:state.publicRegistryHash,
    activeHash:state.activeHash,monthlyHash:state.monthly.sha256,referenceHash:state.reference.sha256};
}
function tradeinPerformanceCheckpointCompare_(state,payload) {
  const expected=['expectedRegistryHash','expectedPublicRegistryHash','expectedActiveHash','expectedMonthlyHash','expectedReferenceHash'];
  expected.forEach(function(key){
    if(!Object.prototype.hasOwnProperty.call(payload,key) ||
        !(payload[key]===null && !['expectedRegistryHash','expectedPublicRegistryHash'].includes(key)) && !/^[a-f0-9]{64}$/.test(payload[key] || ''))
      throw new Error('檢查點必須明確提供完整預期雜湊');
  });
  if(typeof payload.expectedRegistryExists!=='boolean' || payload.expectedRegistryExists!==state.registryExists ||
      typeof payload.expectedPublicRegistryExists!=='boolean' || payload.expectedPublicRegistryExists!==state.publicRegistryExists ||
      payload.expectedPublicRegistryHash!==state.publicRegistryHash ||
      payload.expectedRegistryHash!==state.registryHash || payload.expectedActiveHash!==state.activeHash ||
      payload.expectedMonthlyHash!==state.monthly.sha256 || payload.expectedReferenceHash!==state.reference.sha256)
    throw new Error('registry／本月指標或配置已變更，請重新讀取檢查點狀態');
}
function tradeinPerformanceCheckpointSlot_(slot,month,monthly) {
  if(slot===null)return;
  if(!slot || typeof slot!=='object' || Array.isArray(slot) ||
      !Object.prototype.hasOwnProperty.call(slot,'active') || !Object.prototype.hasOwnProperty.call(slot,'previous') ||
      slot.previous && !slot.active)throw new Error('檢查點本月指標格式無效');
  ['active','previous'].forEach(function(key){
    const entry=slot[key];if(entry===null)return;
    if(!entry || typeof entry.file_id!=='string' || !entry.file_id ||
        !['snapshot_hash','source_sha256','roster_hash','preview_hash'].every(function(k){return /^[a-f0-9]{64}$/.test(entry[k] || '');}))
      throw new Error('檢查點快照指標格式無效');
    const snapshot=tradeinPerformanceSnapshot_(entry);
    if(snapshot.period_key!==month)throw new Error('檢查點快照月份不符');
    if(key==='active'){
      if(!monthly.exists)throw new Error('檢查點缺少原月名冊');
      const basis=JSON.parse(monthly.body);
      if(basis.month!==month || basis.review_status!=='verified')throw new Error('檢查點原月名冊未核定');
      // The canonical validated roster hash was captured while this exact file was active.
      if(entry.roster_hash!==monthly.rosterHash)throw new Error('檢查點原名冊與快照不符');
    }
  });
}
function tradeinPerformanceCheckpointStatus(payload) {
  tradeinPerformanceCheckpointAuthorize_(payload);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{return tradeinPerformanceCheckpointSummary_(tradeinPerformanceCheckpointState_(payload));}
  finally{lock.releaseLock();}
}
function tradeinPerformanceCheckpointCapture(payload) {
  const auth=tradeinPerformanceCheckpointAuthorize_(payload);
  if(!['C0','C1'].includes(payload.stage))throw new Error('檢查點階段無效');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const state=tradeinPerformanceCheckpointState_(payload);tradeinPerformanceCheckpointCompare_(state,payload);
    if(state.monthly.exists)state.monthly.rosterHash=tradeinPerformanceHash_(tradeinPerformanceMonthRoster_(payload.month));
    tradeinPerformanceCheckpointSlot_(state.slot,payload.month,state.monthly);
    const publicEntry=state.publicRegistry.months[payload.month];
    if(publicEntry){
      if(!state.slot || !state.slot.active || publicEntry.private_snapshot_hash!==state.slot.active.snapshot_hash)throw new Error('公開／私人本月版本不一致，停止檢查點');
      tradeinPerformancePublicSnapshot_(publicEntry,payload.month);
    }
    let previewHash=null;
    if(payload.stage==='C1'){
      if(!payload.source || payload.source.month!==payload.month || payload.source.source_sha256!==payload.sourceHash)
        throw new Error('C1 必須核對本批來源');
      const snapshot=tradeinPerformanceBuild_(payload.source,tradeinPerformanceMonthRoster_(payload.month));
      previewHash=tradeinPerformanceHash_(snapshot);
      if(payload.previewHash!==previewHash || payload.rosterHash!==state.monthly.rosterHash)
        throw new Error('C1 來源／名冊與預覽不符');
    }
    const value={schema_version:'tradein-checkpoint/v1',stage:payload.stage,month:payload.month,
      source_sha256:payload.sourceHash,owner_script_id:auth.owner,folder_id:tradeinPerformanceFolder_().getId(),
      captured_at:privateDashboardNow(),operator_hash:tradeinPerformanceDigest_(auth.operator),
      registry_exists:state.registryExists,registry_body:state.registryBody,registry_sha256:state.registryHash,
      public_registry_exists:state.publicRegistryExists,public_registry_body:state.publicRegistryBody,public_registry_sha256:state.publicRegistryHash,
      slot_present:state.slotPresent,slot:state.slot,monthly:state.monthly,reference:state.reference,preview_hash:previewHash};
    const body=JSON.stringify(value),hash=tradeinPerformanceDigest_(body);
    const file=tradeinPerformanceFolder_().createFile('north12b-tradein-checkpoint-'+payload.month+'-'+payload.stage+'-'+hash.slice(0,16)+'.json',body,MimeType.PLAIN_TEXT);
    if(tradeinPerformanceDigest_(file.getBlob().getDataAsString('UTF-8'))!==hash)throw new Error('檢查點保存後內容核對失敗');
    return {status:'checkpoint_saved',checkpointId:file.getId(),checkpointHash:hash,stage:payload.stage,
      state:tradeinPerformanceCheckpointSummary_(state),previewHash:previewHash};
  } finally{lock.releaseLock();}
}
function tradeinPerformanceCheckpointRestore(payload) {
  const auth=tradeinPerformanceCheckpointAuthorize_(payload);
  if(payload.restoreMonth!==true || typeof payload.checkpointId!=='string' ||
      !/^[a-f0-9]{64}$/.test(payload.checkpointHash || ''))throw new Error('必須明確確認本月檢查點恢復');
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try {
    const current=tradeinPerformanceCheckpointState_(payload);tradeinPerformanceCheckpointCompare_(current,payload);
    const file=DriveApp.getFileById(payload.checkpointId),parents=file.getParents(),folderId=tradeinPerformanceFolder_().getId();
    let inFolder=false;while(parents.hasNext()){if(parents.next().getId()===folderId)inFolder=true;}
    if(!inFolder)throw new Error('檢查點不在指定私有 owner 資料夾');
    const body=file.getBlob().getDataAsString('UTF-8');
    if(body.length>3000000 || tradeinPerformanceDigest_(body)!==payload.checkpointHash)throw new Error('檢查點完整性核對失敗');
    const saved=JSON.parse(body);
    if(saved.schema_version!=='tradein-checkpoint/v1' || !['C0','C1'].includes(saved.stage) || saved.month!==payload.month ||
        saved.source_sha256!==payload.sourceHash || saved.owner_script_id!==auth.owner || saved.folder_id!==folderId ||
        typeof saved.registry_exists!=='boolean' || typeof saved.slot_present!=='boolean' ||
        typeof saved.public_registry_exists!=='boolean' || tradeinPerformanceDigest_(saved.public_registry_body)!==saved.public_registry_sha256 ||
        tradeinPerformanceDigest_(saved.registry_body)!==saved.registry_sha256)
      throw new Error('檢查點 owner／月份／來源或 registry 核對失敗');
    const prior=tradeinPerformanceCheckpointRegistryValue_(saved.registry_body);
    if(Object.prototype.hasOwnProperty.call(prior.months,payload.month)!==saved.slot_present ||
        JSON.stringify(saved.slot_present?prior.months[payload.month]:null)!==JSON.stringify(saved.slot))
      throw new Error('檢查點本月指標與原 registry 不符');
    [['monthly',current.monthly.name],['reference',current.reference.name]].forEach(function(pair){
      const config=saved[pair[0]];
      if(!config || config.name!==pair[1] || typeof config.exists!=='boolean' ||
          config.exists && (typeof config.body!=='string' || config.body.length>1000000 || tradeinPerformanceDigest_(config.body)!==config.sha256) ||
          !config.exists && (config.body!==null || config.sha256!==null))throw new Error('檢查點配置完整性核對失敗');
    });
    tradeinPerformanceCheckpointSlot_(saved.slot,payload.month,saved.monthly);
    const priorPublic=JSON.parse(saved.public_registry_body);
    if(!priorPublic || priorPublic.schema_version!=='tradein-public-registry/v1' || !priorPublic.months || typeof priorPublic.months!=='object' || Array.isArray(priorPublic.months))throw new Error('公開檢查點 registry 格式無效');
    Object.keys(priorPublic.months).forEach(function(month){TradeinPerformanceCore.monthPeriod(month);});
    const priorPublicEntry=priorPublic.months[payload.month];
    if(priorPublicEntry){
      if(!saved.slot || !saved.slot.active || priorPublicEntry.private_snapshot_hash!==saved.slot.active.snapshot_hash)throw new Error('公開檢查點本月快照版本不符');
      tradeinPerformancePublicSnapshot_(priorPublicEntry,payload.month);
    }
    // Only the captured month and its two fixed configuration names are mutable.
    // New files from a first import are retained. No auth property or roster is written.
    const retained=[];
    ['monthly','reference'].forEach(function(key){
      const config=saved[key],existing=tradeinPerformanceFile_(config.name);
      if(!config.exists){if(existing)retained.push(key);return;}
      if(existing){if(tradeinPerformanceDigest_(existing.getBlob().getDataAsString('UTF-8'))!==config.sha256)existing.setContent(config.body);}
      else tradeinPerformanceFolder_().createFile(config.name,config.body,MimeType.PLAIN_TEXT);
      if(tradeinPerformanceCheckpointConfig_(config.name).sha256!==config.sha256)throw new Error('檢查點配置恢復後核對失敗');
    });
    if(saved.slot && saved.slot.active && tradeinPerformanceHash_(tradeinPerformanceMonthRoster_(payload.month))!==saved.slot.active.roster_hash)
      throw new Error('恢復名冊與原月快照不符；尚未切换 registry');
    const next=JSON.parse(JSON.stringify(current.registry));
    if(saved.slot_present)next.months[payload.month]=saved.slot;else delete next.months[payload.month];
    const nextBody=JSON.stringify(next);
    tradeinPerformanceSaveRegistry_(next);
    const nextPublic=JSON.parse(JSON.stringify(current.publicRegistry));
    if(priorPublicEntry)nextPublic.months[payload.month]=priorPublicEntry;else delete nextPublic.months[payload.month];
    const nextPublicBody=JSON.stringify(nextPublic),publicFile=tradeinPerformanceFile_('north12b-tradein-public-registry.json');
    if(publicFile)publicFile.setContent(nextPublicBody);
    else if(saved.public_registry_exists)tradeinPerformanceFolder_().createFile('north12b-tradein-public-registry.json',nextPublicBody,MimeType.PLAIN_TEXT);
    const restored=tradeinPerformanceCheckpointState_(payload);
    if(restored.registryHash!==tradeinPerformanceDigest_(nextBody) || restored.slotPresent!==saved.slot_present ||
        restored.publicRegistryHash!==tradeinPerformanceDigest_(nextPublicBody) ||
        JSON.stringify(restored.slot)!==JSON.stringify(saved.slot))throw new Error('檢查點恢復後完整 registry 核對失敗');
    return {status:'checkpoint_restored',stage:saved.stage,state:tradeinPerformanceCheckpointSummary_(restored),
      retainedNewConfigurationFiles:retained,historyRetained:true};
  } finally{lock.releaseLock();}
}
