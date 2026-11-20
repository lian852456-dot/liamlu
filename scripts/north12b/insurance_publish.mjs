// Explicit private publication adapter. Importing/building artifacts never sends requests.
// The existing publisher supplies its authorized request function; this module loads no credentials.
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import C from '../../insurance-consultation.js';
import K from '../../insurance-source-core.js';
const hash=v=>createHash('sha256').update(v).digest('hex');
export function prepareInsurancePublication({sourceBytes,sourceFile,reportDate,payload=null,outcome='complete'}){
 const attempt={reportDate,sourceFile,sourceSha256:hash(sourceBytes)};
 const begun=K.begin(K.empty(),attempt,C,hash,reportDate);
 // Validate with the exact same transition rules before any request.
 K.finish(begun,{attemptId:begun.lastAttempt.id,outcome,payload},C,hash);
 return {attempt,attemptId:begun.lastAttempt.id,payload,outcome,payloadHash:payload?hash(K.canonical(payload)):null};
}
function verifyStatus(r){if(r?.status!=='ok'||r.schema!=='insurance-source-state/v1'||typeof r.version!=='string')throw Error('INSURANCE_PUBLICATION_STATUS_INVALID');return r;}
export async function publishInsuranceOnce({plan,request,endpoint}){
 const read=async()=>verifyStatus(await request(endpoint,{action:'insurance_source_status'}));
 const before=await read();
 const matching=r=>r.lastAttempt?.id===plan.attemptId;
 const complete=r=>matching(r)&&r.lastAttempt.status===plan.outcome&&r.lastAttempt.payloadHash===plan.payloadHash;
 if(complete(before))return {...before,alreadyPublished:true};
 let beginError=null;
 try{await request(endpoint,{action:'insurance_source_begin',expectedVersion:before.version,attempt:plan.attempt},{delaysMs:[]});}catch(e){beginError=e;}
 // Reconcile, never blindly repeat a write after transport uncertainty.
 const begun=await read();if(complete(begun))return {...begun,alreadyPublished:true};
 if(!matching(begun)||begun.lastAttempt.status!=='pending')throw Error(beginError?'INSURANCE_BEGIN_UNCONFIRMED':'INSURANCE_ATTEMPT_CHANGED');
 let writeError=null;
 try{await request(endpoint,{action:'insurance_source_complete',expectedVersion:begun.version,attemptId:plan.attemptId,outcome:plan.outcome,payload:plan.payload},{delaysMs:[]});}catch(e){writeError=e;}
 const after=await read();if(!complete(after))throw Error('INSURANCE_PUBLICATION_UNCONFIRMED_RETAINED_PENDING');
 return {...after,reconciledAfterUncertainResponse:Boolean(writeError||beginError)};
}
export async function runPreparedInsurancePublication({sourcePath,payloadPath,reportDate,outcome='complete',request,endpoint,receiptPath}){
 const sourceBytes=await fs.readFile(sourcePath),sourceFile=path.basename(sourcePath);
 const payload=outcome==='complete'?JSON.parse(await fs.readFile(payloadPath,'utf8')):null;
 const plan=prepareInsurancePublication({sourceBytes,sourceFile,reportDate,payload,outcome});
 const result=await publishInsuranceOnce({plan,request,endpoint});
 if(receiptPath)await fs.writeFile(receiptPath,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
 return result;
}
// The daily publisher explicitly calls this after source validation. The intent
// and source stay private; nothing is added to the mail/public attachment list.
export async function publishInsuranceIntent({intentPath,sourcePath,request,endpoint,receiptPath}){
 const intent=JSON.parse(await fs.readFile(intentPath,'utf8')),sourceBytes=await fs.readFile(sourcePath);
 if(intent.schema!=='insurance-source-intent/v1'||intent.sourceFile!==path.basename(sourcePath)||intent.sourceSha256!==hash(sourceBytes)||!['complete','missing','failed'].includes(intent.outcome))throw Error('INSURANCE_INTENT_INVALID');
 let payload=null;
 if(intent.outcome==='complete'){
  const expected='insurance-source-'+path.parse(intent.sourceFile).name+'.json';
  if(intent.payloadFile!==expected)throw Error('INSURANCE_INTENT_PATH_INVALID');
  const bytes=await fs.readFile(path.join(path.dirname(intentPath),expected));
  if(hash(bytes)!==intent.payloadSha256)throw Error('INSURANCE_INTENT_HASH_CHANGED');
  payload=JSON.parse(bytes);
 }else if(intent.payloadFile!==null||intent.payloadSha256!==null)throw Error('INSURANCE_INTENT_INVALID');
 const plan=prepareInsurancePublication({sourceBytes,sourceFile:intent.sourceFile,reportDate:intent.reportDate,payload,outcome:intent.outcome});
 const result=await publishInsuranceOnce({plan,request,endpoint});
 if(receiptPath)await fs.writeFile(receiptPath,JSON.stringify(result,null,2),{flag:'wx',mode:0o600});
 return result;
}
