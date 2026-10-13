import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { mailGate } from '../scripts/north12b/mail_gate.mjs';
import { dailyBaseNames, awardNames, hash } from '../scripts/north12b/final_mail_batch.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mail-gate-'));
  t.after(() => fs.rm(root, {recursive:true,force:true}));
  const batch = { schema:'north12b-final-mail-batch/v1', reportDate:'2026-10-13', runId:'fixture',
    configHash:'a'.repeat(64), sourceIdentity:{reportDate:'2026-10-13', cutoffDate:'2026-10-12',
      sources:['k','s','p'].map(id=>({id,sha256:'b'.repeat(64)}))}, mails:{} };
  for (const [type,names] of [['daily',[...dailyBaseNames(batch.reportDate), `TWM_North12B_Goodspeed_Detail_${batch.reportDate}.png`]],['phone_awards',awardNames]]) {
    const dir = path.join(root,type); await fs.mkdir(dir);
    const body_path = path.join(dir,'body.txt'); await fs.writeFile(body_path,'body');
    const attachments=[];
    for (const name of names) {
      const data=Buffer.concat([name.endsWith('.png')?Buffer.from([137,80,78,71,13,10,26,10]):Buffer.from('PK\u0003\u0004'),Buffer.from(name)]);
      const file=path.join(dir,name); await fs.writeFile(file,data);
      attachments.push({name,path:file,bytes:data.length,sha256:hash(data)});
    }
    batch.mails[type]={subject:type+' 2026-10-13',body_path,bodyHash:hash('body'),attachments};
  }
  batch.digest=hash(JSON.stringify(batch));
  const manifestPath=path.join(root,'sealed.json');await fs.writeFile(manifestPath,JSON.stringify(batch));
  const query={complete:true,folder:'Sent Items',reportDate:batch.reportDate,subject:batch.mails.daily.subject,checkedAt:new Date().toISOString()};
  const req={type:'daily',manifestPath,ledgerRoot:path.join(root,'ledger'),sentEvidence:{query,messages:[]}};
  const message={id:'synthetic-message',subject:query.subject,recipient:'lian852456@gmail.com',bodySha256:hash('body'),
    sourceIdentitySha256:hash(JSON.stringify(batch.sourceIdentity)),configHash:batch.configHash,
    attachments:batch.mails.daily.attachments.map(a=>({...a,inline:false}))};
  return {req,message};
}

test('reserve complete persists receipt, then exact same-day reconciliation skips sending',async t=>{
  const {req,message}=await fixture(t);
  const first=await mailGate('reserve',req);assert.equal(first.sendAllowed,true);assert.equal(first.attachment_files.length,13);
  const proof={...req,token:first.token,sentEvidence:{query:req.sentEvidence.query,messages:[message]}};
  assert.equal((await mailGate('complete',proof)).status,'VERIFIED');
  assert.equal((await mailGate('reserve',proof)).status,'ALREADY_PRESENT');
  assert.equal((await mailGate('reserve',proof)).sendAllowed,false);
});
test('parallel reservations have a single winner and a crash cannot expire into resend',async t=>{
  const {req}=await fixture(t);const r=await Promise.allSettled([mailGate('reserve',req),mailGate('reserve',req)]);
  assert.equal(r.filter(v=>v.status==='fulfilled').length,1);
  await assert.rejects(mailGate('reserve',req),/EEXIST/);
});
test('missing, stale or incomplete Sent Items evidence cannot grant send',async t=>{
  const {req}=await fixture(t);
  await assert.rejects(mailGate('reserve',{...req,sentEvidence:{}}),/SENT_QUERY_INCOMPLETE/);
  req.sentEvidence.query.checkedAt='2026-01-01T00:00:00Z';
  await assert.rejects(mailGate('reserve',req),/SENT_QUERY_STALE/);
});
test('same-day old version, inline attachment, duplicate or changed body blocks without reservation',async t=>{
  const {req,message}=await fixture(t);
  for (const changed of [{...message,bodySha256:'c'.repeat(64)},
    {...message,attachments:message.attachments.slice(0,9)},
    {...message,attachments:message.attachments.map(a=>({...a,inline:true}))}]) {
    await assert.rejects(mailGate('reserve',{...req,sentEvidence:{query:req.sentEvidence.query,messages:[changed]}}),/SAME_DAY_CONTENT_OR_IDENTITY_MISMATCH/);
  }
  await assert.rejects(mailGate('reserve',{...req,sentEvidence:{query:req.sentEvidence.query,messages:[message,message]}}),/SAME_DAY_MULTIPLE_MAILS/);
});
test('uncertain post-send or bad reservation token does not release sending lock',async t=>{
  const {req}=await fixture(t);const r=await mailGate('reserve',req);
  await assert.rejects(mailGate('complete',{...req,token:'bad'}),/RESERVATION_TOKEN_MISMATCH/);
  await assert.rejects(mailGate('complete',{...req,token:r.token}),/POST_SEND_NOT_FOUND_OR_UNCERTAIN/);
  await assert.rejects(mailGate('reserve',req),/EEXIST/);
});
