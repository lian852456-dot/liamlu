// Rank-only preparation and reconciliation. This module never loads credentials.
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export function canonical(value) {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export const digest=value=>createHash('sha256').update(canonical(value)).digest('hex');
export function nonRank(snapshot) {
  const value=structuredClone(snapshot);delete value._read_integrity;delete value.publishedAt;
  if(value.components?.kpi)delete value.components.kpi.published_at;
  delete value.kpiBattle.personal_rank_semantics;delete value.kpiBattle.personal_rank_source;
  for(const row of value.kpiBattle.personal||[]) {delete row.rank;delete row.rank_dod;row.name=String(row.name||'').replace(/［來源缺字］/g,'?');}
  return value;
}
const fail=message=>{throw Error(message);};
const store=value=>String(value||'').replace(/\s+/g,'').replace(/^(台灣大哥大數位生活台北|台灣大哥大台北|台北)/,'');
const name=value=>String(value||'').trim().replace(/＊/g,'*').replace(/［來源缺字］/g,'?');
function keyed(rows,stores={}) {
  const map=new Map(),visible=new Set();
  for(const row of rows||[]) {
    const key=JSON.stringify([store(stores[row.store]||row.store),name(row.name||row.pname),String(row.role||'')]);
    const displayKey=JSON.stringify(JSON.parse(key).slice(0,2));
    if(!row.role||!store(stores[row.store]||row.store)||!name(row.name||row.pname)||map.has(key)||visible.has(displayKey))fail('RANK_IDENTITY_AMBIGUOUS');
    visible.add(displayKey);
    map.set(key,row);
  }
  return map;
}
function assertSame(left,right,label) {if(canonical(left)!==canonical(right))fail(label);}
export function prepareRankRepair({snapshot,protectedKpi,candidate,reportRunDate,cutoff}) {
  if(!snapshot?.kpiBattle||!snapshot.awardsBattle||!snapshot.components?.kpi||!candidate?.kpiBattle||!protectedKpi?.meta)fail('RANK_PARENT_MISSING');
  const current=snapshot.kpiBattle,next=candidate.kpiBattle,meta=protectedKpi.meta;
  const protectedCutoff=String(meta.month||'')+'-'+String(meta.snapshotDay||'').padStart(2,'0');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(reportRunDate)||protectedCutoff!==cutoff||current.data_as_of_date!==cutoff||next.data_as_of_date!==cutoff||
    current.report_date!==cutoff||next.report_date!==cutoff||current.source_as_of_date!==cutoff||next.source_as_of_date!==cutoff||
    current.source_file!==meta.sourceFile||next.source_file!==meta.sourceFile)fail('RANK_SOURCE_MISMATCH');
  if(!current.kpi_run_id||next.kpi_run_id!==current.kpi_run_id||meta.processingRunId&&meta.processingRunId!==current.kpi_run_id)fail('RANK_RUN_MISMATCH');
  if(protectedKpi.stores?.length!==9||protectedKpi.items?.length!==25||protectedKpi.persons?.length<10)fail('RANK_PROTECTED_SCHEMA');
  const stores=Object.fromEntries(protectedKpi.stores.map(s=>[s.code,s.name]));
  const approved=keyed(protectedKpi.persons,stores),rows=keyed(next.personal),prior=keyed(current.personal);
  assertSame([...approved.keys()].sort(),[...rows.keys()].sort(),'RANK_IDENTITY_SET');
  assertSame([...approved.keys()].sort(),[...prior.keys()].sort(),'RANK_IDENTITY_SET');
  const proof=next.personal_rank_source;
  if(next.personal_rank_semantics!=='individual-rank-v1'||proof?.sheet!=='上線數KPI_個人達成率_明細'||proof.column!=='I'||
    proof.source_file!==meta.sourceFile||proof.data_as_of_date!==cutoff||!/^[a-f0-9]{64}$/.test(proof.sha256||''))fail('RANK_SOURCE_PROOF');
  const oldPart={...snapshot,kpiBattle:current},newPart={...snapshot,kpiBattle:next};
  assertSame(nonRank(oldPart),nonRank(newPart),'RANK_OTHER_VALUES_CHANGED');
  const personal=[];
  for(const [key,row] of rows) {
    const auth=approved.get(key),old=prior.get(key);
    if(row.name!==auth.pname||row.name!==old.name&&String(old.name).replace(/［來源缺字］/g,'?')!==row.name)fail('RANK_NAME_NOT_PROTECTED');
    if(row.rank!==null&&(!Number.isSafeInteger(row.rank)||row.rank<1)||row.rank_dod!==null&&!Number.isSafeInteger(row.rank_dod)||
      row.rank===null&&row.rank_dod!==null||row.rank_dod!==null&&!/^[a-f0-9]{64}$/.test(proof.previous_sha256||''))fail('RANK_VALUE_INVALID');
    if(Number(row.overall_rate)!==Number(auth.official))fail('RANK_OFFICIAL_RATE_MISMATCH');
    personal.push({store:row.store,role:row.role,name:row.name,rank:row.rank,rank_dod:row.rank_dod});
  }
  const patch={schema:'north12b-personal-rank-patch/v1',report_run_date:reportRunDate,source_file:meta.sourceFile,data_as_of_date:cutoff,
    kpi_run_id:current.kpi_run_id,personal_rank_semantics:next.personal_rank_semantics,personal_rank_source:proof,personal};
  const parent=structuredClone(snapshot);delete parent._read_integrity;
  return {payload:{action:'private_publish_kpi_component',rankPatchBase64:Buffer.from(JSON.stringify(patch)).toString('base64'),
    expectedKpiPayloadHash:digest(current),expectedProtectedKpiPayloadHash:digest(protectedKpi),expectedSnapshotPayloadHash:digest(parent)},
    expectedKpiHash:digest(next),protectedHash:digest(protectedKpi),nonRankHash:digest(nonRank(snapshot)),awardsHash:digest(snapshot.awardsBattle),people:approved.size};
}
export function verifyRankReadback(plan,{snapshot,protectedKpi}) {
  assertSame(digest(protectedKpi),plan.protectedHash,'RANK_PROTECTED_CHANGED');
  assertSame(digest(nonRank(snapshot)),plan.nonRankHash,'RANK_OTHER_VALUES_CHANGED');
  assertSame(digest(snapshot.awardsBattle),plan.awardsHash,'RANK_AWARDS_CHANGED');
  assertSame(digest(snapshot.kpiBattle),plan.expectedKpiHash,'RANK_RESULT_NOT_CONFIRMED');
  return {status:'ok',people:plan.people,kpiPayloadHash:plan.expectedKpiHash,nonRankPayloadHash:plan.nonRankHash,awardsPayloadHash:plan.awardsHash,protectedKpiPayloadHash:plan.protectedHash};
}
export async function publishRankOnce({plan,write,readback}) {
  let writeError=null,receipt=null;
  try {receipt=await write(plan.payload);}catch(error){writeError=error;}
  let observed;
  try {observed=await readback();}catch(error){throw Error('RANK_OUTCOME_UNCERTAIN_READBACK_REQUIRED');}
  const verified=verifyRankReadback(plan,observed);
  return {...verified,writeReceiptConfirmed:!writeError,reconciledAfterUncertainResponse:Boolean(writeError),publishedAt:observed.snapshot.publishedAt||receipt?.publishedAt||null};
}
export async function runPreparedRankRepair({manifestPath,reportRunDate,cutoff,request,accessEndpoint,dashboardEndpoint,setRunId}) {
  const manifest=JSON.parse(await fs.readFile(manifestPath,'utf8'));
  if(manifest.schema!=='north12b-personal-rank-intent/v1'||manifest.report_run_date!==reportRunDate||manifest.data_as_of_date!==cutoff)fail('RANK_INTENT_INVALID');
  const candidate=JSON.parse(await fs.readFile(manifest.candidate_path,'utf8'));
  const source=await fs.readFile(manifest.source_path);
  if(path.basename(manifest.source_path)!==candidate.kpiBattle.source_file||createHash('sha256').update(source).digest('hex')!==candidate.kpiBattle.personal_rank_source?.sha256)fail('RANK_SOURCE_BYTES_CHANGED');
  if(candidate.kpiBattle.personal_rank_source?.previous_sha256) {
    if(!manifest.previous_source_path)fail('RANK_PREVIOUS_SOURCE_REQUIRED');
    const previous=await fs.readFile(manifest.previous_source_path);
    if(createHash('sha256').update(previous).digest('hex')!==candidate.kpiBattle.personal_rank_source.previous_sha256)fail('RANK_PREVIOUS_BYTES_CHANGED');
  }
  const run=candidate.kpiBattle.kpi_run_id;if(!run)fail('RANK_RUN_REQUIRED');setRunId(run);
  const readback=async()=>{
    const [kpi,priv]=await Promise.all([request(accessEndpoint,{action:'kpicalc_access'}),request(accessEndpoint,{action:'private_access'})]);
    if(!kpi.data||!priv.snapshot)fail('RANK_AUTHENTICATED_READ_REQUIRED');
    return {protectedKpi:kpi.data,snapshot:priv.snapshot};
  };
  const before=await readback();
  const plan=prepareRankRepair({...before,candidate,reportRunDate,cutoff});
  await fs.access(manifest.receipt_path).then(()=>fail('RANK_RECEIPT_ALREADY_EXISTS'),error=>{if(error.code!=='ENOENT')throw error;});
  await fs.mkdir(path.dirname(manifest.receipt_path),{recursive:true});
  const backupPath=manifest.receipt_path+'.before.json';
  await fs.writeFile(backupPath,JSON.stringify(before),{flag:'wx',mode:0o600});
  const result=await publishRankOnce({plan,write:payload=>request(dashboardEndpoint,payload,{delaysMs:[]}),readback});
  await fs.writeFile(manifest.receipt_path,JSON.stringify({...result,mode:'personal-ranks-only',backupPath,checkedAt:new Date().toISOString()},null,2),{flag:'wx',mode:0o600});
  return result;
}
