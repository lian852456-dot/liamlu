import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {entrypointGate,ENTRYPOINTS} from '../scripts/north12b/entrypoint_gate.mjs';
import {dailyBaseNames,awardNames,hash,mailProvenanceLine} from '../scripts/north12b/final_mail_batch.mjs';

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'entrypoint-gate-'));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const batch={schema:'north12b-final-mail-batch/v1',reportDate:'2026-10-13',runId:'mock',configHash:'a'.repeat(64),
    sourceIdentity:{reportDate:'2026-10-13',cutoffDate:'2026-10-12',sources:['k','s','p'].map(id=>({id,sha256:'b'.repeat(64)}))},mails:{}};
  const body='Local mock only\n'+mailProvenanceLine(batch)+'\n';
  for(const [type,names] of [['daily',[...dailyBaseNames(batch.reportDate),`TWM_North12B_Goodspeed_Detail_${batch.reportDate}.png`]],['phone_awards',awardNames]]){
    const dir=path.join(root,type);await fs.mkdir(dir);
    const body_path=path.join(dir,'body.txt');await fs.writeFile(body_path,body);
    const attachments=[];
    for(const name of names){
      const data=Buffer.concat([name.endsWith('.png')?Buffer.from([137,80,78,71,13,10,26,10]):Buffer.from('PK\x03\x04'),Buffer.from(name)]);
      const p=path.join(dir,name);await fs.writeFile(p,data);attachments.push({name,path:p,bytes:data.length,sha256:hash(data)});
    }
    batch.mails[type]={subject:type+' '+batch.reportDate,body_path,bodyHash:hash(body),attachments};
  }
  batch.digest=hash(JSON.stringify(batch));const manifestPath=path.join(root,'sealed.json');await fs.writeFile(manifestPath,JSON.stringify(batch));
  const query={complete:true,folder:'Sent Items',reportDate:batch.reportDate,subject:batch.mails.daily.subject,checkedAt:new Date().toISOString()};
  const req={entrypoint:ENTRYPOINTS[0],manifestPath,type:'daily',rawSentEvidence:{query,messages:[]}};
  const m=batch.mails.daily;
  const message={id:'mock-only',subject:m.subject,recipients:['lian852456@gmail.com'],cc:[],bcc:[],body_path:m.body_path,
    attachments:m.attachments.map(a=>({name:a.name,materialized_path:a.path,inline:false}))};
  return {req,message,binding:{testHost:true,ledgerRoot:path.join(root,'ledger')}};
}

test('scheduled and manual callers share one durable reservation and exact readback',async t=>{
  const {req,message,binding}=await fixture(t);let connectorCalls=0;
  const reservation=await entrypointGate('reserve',req,binding);assert.equal(reservation.sendAllowed,false);
  await assert.rejects(entrypointGate('reserve',{...req,entrypoint:ENTRYPOINTS[1]},binding),/EEXIST/);
  const permit=await entrypointGate('authorize',{...req,token:reservation.token},binding);
  assert.equal(permit.sendAllowed,true);assert.equal(permit.attachment_files.length,13);assert.equal(permit.to[0].email,'lian852456@gmail.com');
  connectorCalls++; // Local fixture capture only; never calls a real connector.
  await assert.rejects(entrypointGate('authorize',{...req,token:reservation.token},binding),/SEND_PERMIT_ALREADY_ISSUED/);
  const proof={...req,entrypoint:ENTRYPOINTS[1],token:reservation.token,rawSentEvidence:{query:req.rawSentEvidence.query,messages:[message]}};
  assert.equal((await entrypointGate('complete',proof,binding)).status,'VERIFIED');
  assert.equal((await entrypointGate('reserve',proof,binding)).status,'ALREADY_PRESENT');assert.equal(connectorCalls,1);
});
test('concurrent authorizations issue exactly one send permit',async t=>{
  const {req,binding}=await fixture(t),reservation=await entrypointGate('reserve',req,binding);
  const r=await Promise.allSettled([entrypointGate('authorize',{...req,token:reservation.token},binding),entrypointGate('authorize',{...req,token:reservation.token},binding)]);
  assert.equal(r.filter(x=>x.status==='fulfilled').length,1);
});
test('legacy mail lacking provenance or missing four attachments blocks both entrypoints',async t=>{
  const {req,message,binding}=await fixture(t);
  for(const entrypoint of ENTRYPOINTS){
    await assert.rejects(entrypointGate('reserve',{...req,entrypoint,rawSentEvidence:{query:req.rawSentEvidence.query,messages:[{...message,attachments:message.attachments.slice(0,9)}]}},binding),/SAME_DAY_CONTENT_OR_IDENTITY_MISMATCH/);
  }
  const legacy=message.body_path+'.legacy';await fs.writeFile(legacy,'Legacy without source provenance');
  await assert.rejects(entrypointGate('reserve',{...req,rawSentEvidence:{query:req.rawSentEvidence.query,messages:[{...message,body_path:legacy}]}},binding),/SAME_DAY_CONTENT_OR_IDENTITY_MISMATCH/);
});
test('unregistered callers, ledger override and failed post-send proof stay blocked',async t=>{
  const {req,binding}=await fixture(t);
  await assert.rejects(entrypointGate('reserve',{...req,entrypoint:'b-10-00'},binding),/ENTRYPOINT_NOT_REGISTERED/);
  await assert.rejects(entrypointGate('reserve',{...req,ledgerRoot:'/tmp/other'},binding),/LEDGER_OVERRIDE_FORBIDDEN/);
  const r=await entrypointGate('reserve',req,binding);await entrypointGate('authorize',{...req,token:r.token},binding);
  await assert.rejects(entrypointGate('complete',{...req,token:r.token},binding),/POST_SEND_NOT_FOUND_OR_UNCERTAIN/);
  await assert.rejects(entrypointGate('reserve',{...req,entrypoint:ENTRYPOINTS[1]},binding),/EEXIST/);
});
