#!/usr/bin/env node
// Local control adapter for direct Outlook tool callers. Never calls a connector.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mailGate} from './mail_gate.mjs';
import {hash,mailProvenanceLine,verifySealedBatch} from './final_mail_batch.mjs';

export const MAC_PROJECT = '/Users/liamlu/Downloads/liam-agent';
export const MAC_LEDGER = MAC_PROJECT + '/report-automation/work/final-mail-ledger';
export const ENTRYPOINTS = Object.freeze(['b-2','manual:6aa35d1f-a438-83e8-81b2-77074837f7fc']);
function need(ok,code){if(!ok)throw new Error(code);}

export async function downloadedSentEvidence(batch,type,raw){
  need(raw?.query && Array.isArray(raw.messages),'DOWNLOADED_SENT_EVIDENCE_REQUIRED');
  const messages=[];
  for(const m of raw.messages){
    need(m.id && m.subject && Array.isArray(m.recipients) && m.recipients.length===1
      && m.recipients[0]==='lian852456@gmail.com' && Array.isArray(m.cc) && m.cc.length===0
      && Array.isArray(m.bcc) && m.bcc.length===0 && m.body_path && Array.isArray(m.attachments),
      'SENT_MESSAGE_METADATA_INCOMPLETE');
    const body=await fs.readFile(m.body_path);
    // Identity comes from the actual downloaded mail body, never asserted by the caller.
    const proven=body.toString('utf8').split(/\r?\n/).includes(mailProvenanceLine(batch));
    const attachments=[];
    for(const a of m.attachments){
      need(a.name && a.materialized_path && a.inline===false,'DIRECT_ATTACHMENT_DOWNLOAD_REQUIRED');
      const bytes=await fs.readFile(a.materialized_path);
      attachments.push({name:a.name,bytes:bytes.length,sha256:hash(bytes),inline:false});
    }
    messages.push({id:m.id,subject:m.subject,recipient:m.recipients[0],bodySha256:hash(body),
      sourceIdentitySha256:proven?hash(JSON.stringify(batch.sourceIdentity)):null,
      configHash:proven?batch.configHash:null,attachments});
  }
  return {query:raw.query,messages};
}

// Tests inject an isolated host binding. The production CLI has no host/ledger override.
export async function entrypointGate(action,request,binding={}){
  need(ENTRYPOINTS.includes(request.entrypoint),'ENTRYPOINT_NOT_REGISTERED');
  need(!Object.hasOwn(request,'ledgerRoot'),'LEDGER_OVERRIDE_FORBIDDEN');
  if(!binding.testHost){
    need(process.platform==='darwin' && await fs.realpath(MAC_PROJECT)===MAC_PROJECT,'SHARED_MAC_EXECUTOR_REQUIRED');
  }
  const batch=await verifySealedBatch(request.manifestPath);
  const sentEvidence=action==='authorize'?undefined:await downloadedSentEvidence(batch,request.type,request.rawSentEvidence);
  const result=await mailGate(action,{...request,ledgerRoot:binding.testHost?path.resolve(binding.ledgerRoot):MAC_LEDGER,sentEvidence});
  // A reservation cannot be used to invoke Outlook; a one-shot authorize is required.
  return action==='reserve' && result.status==='RESERVED'
    ? {status:'RESERVED_PENDING_AUTHORIZE',sendAllowed:false,token:result.token,batchDigest:result.batchDigest}
    : result;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    const request=JSON.parse(await fs.readFile(process.argv[3],'utf8'));
    console.log(JSON.stringify(await entrypointGate(process.argv[2],request),null,2));
  }catch(e){console.error(e.message);process.exitCode=1;}
}
