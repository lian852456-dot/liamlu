// The private release owner substitutes a frozen, reviewed batch descriptor in an isolated copy.
const INSURANCE_FIXED_DESCRIPTOR_ = null;
const INSURANCE_DRIVE_NAME_='north12b-insurance-consult-source-v1.json';

function insuranceFixedMetadata_(pin) {
  const meta=Drive.Files.get(pin.fileId,{fields:'id,name,mimeType,version,size,parents,driveId,shared,trashed,owners(me,emailAddress,permissionId),permissions(id,type,role),permissionIds'});
  const owner=(meta.owners||[])[0],permission=(meta.permissions||[])[0];
  if(meta.id!==pin.fileId || meta.name!==INSURANCE_DRIVE_NAME_ || meta.mimeType!=='application/json' ||
     meta.driveId || meta.trashed!==false || meta.shared!==false || !meta.version ||
     !(Number(meta.size)>0 && Number(meta.size)<=2*1024*1024) ||
     meta.parents?.length!==1 || meta.parents[0]!==DriveApp.getRootFolder().getId() ||
     meta.owners?.length!==1 || owner.me!==true || !owner.permissionId || owner.emailAddress!==pin.ownerEmail ||
     meta.permissions?.length!==1 || permission.type!=='user' || permission.role!=='owner' || permission.id!==owner.permissionId ||
     meta.permissionIds?.length!==1 || meta.permissionIds[0]!==owner.permissionId)throw Error('INSURANCE_FILE_NOT_PRIVATE');
  return meta;
}

function insuranceFixedLoad_() {
  const pin=INSURANCE_FIXED_DESCRIPTOR_;
  const today=Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd');
  const digest=privateDashboardGasAuthDigest_,K=InsuranceSourceCore,C=InsuranceConsultation;
  if(!pin || !Object.isFrozen(pin) ||
     Object.keys(pin).sort().join('|')!=='cutoff|fileId|ownerEmail|payloadSha256|people|reportDate|sourceSha256' ||
     typeof pin.fileId!=='string' || !/^[A-Za-z0-9_-]{10,200}$/.test(pin.fileId) ||
     typeof pin.ownerEmail!=='string' || !/^[^\s@]+@[^\s@]+$/.test(pin.ownerEmail) ||
     typeof pin.payloadSha256!=='string' || !/^[a-f0-9]{64}$/.test(pin.payloadSha256) ||
     typeof pin.sourceSha256!=='string' || !/^[a-f0-9]{64}$/.test(pin.sourceSha256) ||
     pin.reportDate!==today || !C.day(pin.cutoff) || pin.cutoff>today || pin.cutoff.slice(0,7)!==today.slice(0,7) ||
     !Number.isSafeInteger(pin.people) || pin.people<1 || pin.people>10000)throw Error('INSURANCE_SOURCE_NOT_CURRENT');
  const before=insuranceFixedMetadata_(pin);
  const blob=DriveApp.getFileById(pin.fileId).getBlob();
  const actual=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,blob.getBytes())
    .map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');
  if(actual!==pin.payloadSha256)throw Error('INSURANCE_SOURCE_BYTES_CHANGED');
  const payload=JSON.parse(blob.getDataAsString('UTF-8'));
  const attempt={reportDate:today,sourceSha256:pin.sourceSha256,sourceFile:today.slice(5).replace('-','')+'.xlsx'};
  const pending=K.begin(K.empty(),attempt,C,digest,today);
  const data=K.finish(pending,{attemptId:pending.lastAttempt.id,outcome:'complete',payload},C,digest);
  const people=data.entries.filter(r=>r.kind==='personal');
  const sheet=privateDashboardRoster().getSheetByName(PRIVATE_DASHBOARD_USERS_SHEET);
  if(!sheet || sheet.getLastRow()<2 || sheet.getLastRow()>10001 ||
     sheet.getRange(1,1,1,5).getValues()[0].join('|')!=='employee_id|masked_name|store|role|status')throw Error('INSURANCE_ROSTER_INVALID');
  const roster=new Map(),seen=new Set();
  for(const row of sheet.getRange(2,1,sheet.getLastRow()-1,5).getValues()){
    if(row.every(v=>v==='' || v===null))continue;
    const id=String(row[0]||'').trim(),store=C.store(row[2]);
    if(!id || seen.has(id))throw Error('INSURANCE_ROSTER_INVALID');
    seen.add(id);
    if(row[4]==='active' && PRIVATE_DASHBOARD_B_STORES_.includes(store))roster.set(id,store);
  }
  if(people.length!==pin.people || people.length!==roster.size ||
     new Set(people.map(r=>r.store)).size!==PRIVATE_DASHBOARD_B_STORES_.length ||
     people.some(r=>roster.get(r.id)!==r.store || r.progress?.cutoff!==pin.cutoff ||
       !['required','exempt'].includes(r.requirement)) ||
     data.entries.some(r=>!PRIVATE_DASHBOARD_B_STORES_.includes(r.store)))throw Error('INSURANCE_SOURCE_COVERAGE_CHANGED');
  if(insuranceFixedMetadata_(pin).version!==before.version ||
     Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd')!==today)throw Error('INSURANCE_SOURCE_CHANGED_DURING_READ');
  return data;
}
