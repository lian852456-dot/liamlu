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
function tradeinPerformanceMonthRoster_(month) {
  // Access roster authorizes viewing; it is not an HR/monthly-target source.
  const period=TradeinPerformanceCore.monthPeriod(month);
  const file=tradeinPerformanceFile_('north12b-tradein-monthly-roster-'+month+'.json');
  if(!file)throw new Error('本月正式名冊／職務生效期間尚未核實，不能用登入名冊推算目標');
  const basis=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
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
function tradeinPerformancePrivateReference_(source) {
  if(!source || !/^[a-f0-9]{64}$/.test(source.source_sha256 || ''))throw new Error('來源雜湊無效');
  const file=tradeinPerformanceFile_('north12b-tradein-reference-'+source.source_sha256+'.json');
  if(!file)throw new Error('本批私有員編／店碼對照尚未配置，停止預覽與同步');
  const value=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  // Monthly actuals reset independently. Until cancellation attribution has
  // been approved, this narrow policy only admits batches with no cancellations.
  if(value.counting_review_status!=='verified' || value.counting_rule_id!==TradeinPerformanceCore.RULE_ID ||
     value.counting_policy!=='monthly-reset-no-cancellations/v1')
    throw new Error('每月重新計數口徑尚未核定，停止實績計算');
  if(!Array.isArray(source.records) || source.records.some(function(r){return r.cancel_date!==null && r.cancel_date!==undefined && r.cancel_date!=='';}))
    throw new Error('本批含取消交易；取消／跨月沖回月份尚待核定，整批停止同步');
  return value;
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
function tradeinPerformanceHash_(value) {return privateDashboardHash(JSON.stringify(value));}
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
  reportUploadAuthorize_(payload);
  const roster=tradeinPerformanceMonthRoster_(payload.source.month),snapshot=tradeinPerformanceBuild_(payload.source,roster);
  const current=(tradeinPerformanceRegistry_().months[snapshot.period_key] || {}).active;
  return {snapshot:tradeinPerformanceProjection_(snapshot,{supervisor:true}),expectedActiveHash:current?current.snapshot_hash:null,
    rosterHash:tradeinPerformanceHash_(roster),previewHash:tradeinPerformanceHash_(snapshot),sourceHash:snapshot.source_sha256};
}
function tradeinPerformanceBuild_(source,roster) {
  const today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
  if(source.source_end>today || source.status_as_of_date>today)throw new Error('來源或取消核對日期不可晚於今天');
  return TradeinPerformanceCore.build(source,roster,tradeinPerformancePrivateReference_(source));
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
    const value=tradeinPerformanceBuild_(payload.source,roster),registry=tradeinPerformanceRegistry_();
    if(payload.previewHash!==tradeinPerformanceHash_(value))throw new Error('來源或計算結果與預覽不同，請重新預覽');
    const current=registry.months[value.period_key] || {active:null,previous:null};
    const activeHash=current.active?current.active.snapshot_hash:null;
    if(payload.expectedActiveHash!==activeHash)throw new Error('同期版本已變更，請重新預覽');
    if(current.active && current.active.source_sha256===value.source_sha256 && current.active.roster_hash===payload.rosterHash) {
      if(current.active.preview_hash!==payload.previewHash)throw new Error('相同來源雜湊的計算結果不同，請核對原檔後重新預覽');
      return {status:'unchanged',snapshotHash:activeHash,snapshot:tradeinPerformanceProjection_(tradeinPerformanceSnapshot_(current.active),{supervisor:true})};
    }
    if(current.active && value.source_cutoff_date<current.active.source_cutoff_date)throw new Error('來源比目前版本舊，請使用回復功能');
    value.published_at=privateDashboardNow();
    const hash=tradeinPerformanceHash_(value),file=tradeinPerformanceFolder_().createFile(
      'north12b-tradein-performance-'+value.period_key+'-'+hash.slice(0,16)+'.json',JSON.stringify(value),MimeType.PLAIN_TEXT);
    const entry={file_id:file.getId(),snapshot_hash:hash,source_sha256:value.source_sha256,
      source_cutoff_date:value.source_cutoff_date,roster_hash:payload.rosterHash,preview_hash:payload.previewHash,operator_hash:privateDashboardHash(operator)};
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
