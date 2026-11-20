// A dedicated private source file is never selected by the KPI latest-file scanner.
const INSURANCE_SOURCE_FILE_='north12b-insurance-source-private.json';
function insuranceSourceLoad_(){
 const files=privateDashboardFolder().getFilesByName(INSURANCE_SOURCE_FILE_);
 if(!files.hasNext())return {file:null,text:null,data:InsuranceSourceCore.empty()};
 const file=files.next();if(files.hasNext())throw Error('INSURANCE_SOURCE_AMBIGUOUS');
 const text=file.getBlob().getDataAsString('UTF-8'),data=InsuranceSourceCore.assertState(JSON.parse(text));
 const unsigned=JSON.parse(text);delete unsigned.version;
 if(!(data.revision===0&&data.version===''&&data.entries.length===0&&data.lastAttempt===null)&&data.version!==privateDashboardGasAuthDigest_(InsuranceSourceCore.canonical(unsigned)))throw Error('INSURANCE_SOURCE_HASH_MISMATCH');
 return {file,text,data};
}
function insuranceSourceSave_(before,next){
 const text=JSON.stringify(next);let file=before.file;
 try{
  if(file)file.setContent(text);else file=privateDashboardFolder().createFile(Utilities.newBlob(text,'application/json',INSURANCE_SOURCE_FILE_));
  if(file.getBlob().getDataAsString('UTF-8')!==text)throw Error('INSURANCE_SOURCE_READBACK_FAILED');
 }catch(error){
  // Completion failure restores the durable pending attempt and the prior valid rates.
  if(file){try{const rollback=before.text||JSON.stringify(InsuranceSourceCore.empty());file.setContent(rollback);if(file.getBlob().getDataAsString('UTF-8')!==rollback)throw Error('rollback');}catch(_){throw Error('INSURANCE_SOURCE_OUTCOME_UNCERTAIN');}}
  throw error;
 }
}
function insuranceSourcePublication_(p){
 privateDashboardAdminAuthorized(p);
 return privateDashboardRosterTransaction_(function(){
  const prior=insuranceSourceLoad_(),K=InsuranceSourceCore;
  if(p.action==='insurance_source_status')return Object.assign({status:'ok'},K.receipt(prior.data));
  if(!['insurance_source_begin','insurance_source_complete'].includes(p.action)||typeof p.expectedVersion!=='string'||p.expectedVersion!==prior.data.version)throw Error('INSURANCE_SOURCE_CAS_CHANGED');
  const next=p.action==='insurance_source_begin'?K.begin(prior.data,p.attempt,InsuranceConsultation,privateDashboardGasAuthDigest_,Utilities.formatDate(new Date(),'Asia/Taipei','yyyy-MM-dd')):
   K.finish(prior.data,{attemptId:p.attemptId,outcome:p.outcome,payload:p.payload},InsuranceConsultation,privateDashboardGasAuthDigest_);
  if(next.version!==prior.data.version)insuranceSourceSave_(prior,next);
  return Object.assign({status:'ok'},K.receipt(next));
 });
}
