// Independent anonymous read. Never calls or exposes the private reader.
function tradeinPerformancePublicRegistry_(){
  const file=tradeinPerformanceFile_('north12b-tradein-public-registry.json');
  const value=file?JSON.parse(file.getBlob().getDataAsString('UTF-8')):{schema_version:'tradein-public-registry/v1',months:{}};
  if(!value||value.schema_version!=='tradein-public-registry/v1'||!value.months||typeof value.months!=='object'||Array.isArray(value.months))throw Error('公開績效版本索引無效');
  Object.keys(value.months).forEach(function(month){TradeinPerformanceCore.monthPeriod(month);});
  return value;
}
function tradeinPerformancePublicSnapshot_(entry,month){
  if(!entry||!entry.file_id||!/^[a-f0-9]{64}$/.test(entry.snapshot_hash||''))throw Error('公開績效快照指標無效');
  const file=DriveApp.getFileById(entry.file_id),parents=file.getParents(),folder=tradeinPerformanceFolder_().getId();
  let present=false;while(parents.hasNext())if(parents.next().getId()===folder)present=true;
  if(!present)throw Error('公開投影來源位置不符');
  const value=JSON.parse(file.getBlob().getDataAsString('UTF-8'));
  if(tradeinPerformanceHash_(value)!==entry.snapshot_hash||value.month!==month)throw Error('公開投影內容雜湊不符');
  return TradeinPublicCore.validate(value);
}
function tradeinPerformancePublicRead(payload){
  TradeinPerformanceCore.monthPeriod(payload.month);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const registry=tradeinPerformancePublicRegistry_(),entry=registry.months[payload.month];
    if(!entry)return {snapshot:null,availableMonths:Object.keys(registry.months).sort()};
    const current=(tradeinPerformanceRegistry_().months[payload.month]||{}).active;
    if(!current||current.snapshot_hash!==entry.private_snapshot_hash)throw Error('本月公開進度待重新核對');
    if(tradeinPerformanceHash_(tradeinPerformanceMonthRoster_(payload.month))!==current.roster_hash)throw Error('本月公開基線待重新核對');
    const value=tradeinPerformancePublicSnapshot_(entry,payload.month);
    // Reconstruct the response from a strict validated allowlist, never spread registry/entry/private JSON.
    return {snapshot:value,availableMonths:Object.keys(registry.months).sort()};
  }catch(error){throw Error('公開目標進度尚未完成核對，請稍後重新讀取');}
  finally{lock.releaseLock();}
}
function tradeinPerformancePublicPublish(payload){
  tradeinPerformanceCheckpointAuthorize_(payload);
  const lock=LockService.getScriptLock();lock.waitLock(10000);
  try{
    const current=(tradeinPerformanceRegistry_().months[payload.month]||{}).active;
    if(!current||current.snapshot_hash!==payload.expectedActiveHash)throw Error('私人月版本已變更，停止公開投影');
    if(current.source_sha256!==payload.sourceHash)throw Error('公開投影來源雜湊不符');
    const registry=tradeinPerformancePublicRegistry_(),previous=registry.months[payload.month];
    if(previous&&previous.private_snapshot_hash===current.snapshot_hash){
      tradeinPerformancePublicSnapshot_(previous,payload.month);return {status:'unchanged'};
    }
    const source=tradeinPerformanceSnapshot_(current);
    if(tradeinPerformanceHash_(tradeinPerformanceMonthRoster_(payload.month))!==current.roster_hash)throw Error('核定月名冊已變更，停止公開投影');
    const value=TradeinPublicCore.project(source,function(){return Utilities.getUuid();}),hash=tradeinPerformanceHash_(value);
    const file=tradeinPerformanceFolder_().createFile('north12b-tradein-public-'+payload.month+'-'+hash.slice(0,16)+'.json',JSON.stringify(value),MimeType.PLAIN_TEXT);
    const entry={file_id:file.getId(),snapshot_hash:hash,private_snapshot_hash:current.snapshot_hash};
    tradeinPerformancePublicSnapshot_(entry,payload.month);registry.months[payload.month]=entry;
    const name='north12b-tradein-public-registry.json',registryFile=tradeinPerformanceFile_(name),body=JSON.stringify(registry);
    if(registryFile)registryFile.setContent(body);else tradeinPerformanceFolder_().createFile(name,body,MimeType.PLAIN_TEXT);
    if(JSON.stringify(tradeinPerformancePublicRegistry_())!==body)throw Error('公開投影版本保存後核對失敗');
    return {status:'published'};
  }finally{lock.releaseLock();}
}
