#!/usr/bin/env python3
"""Prepare a guarded minimal patch against the *current* Mac producer; never install it."""
import argparse, hashlib, json, re, shutil, difflib
from pathlib import Path

CODE = Path(__file__).resolve().parent
def digest(p): return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    p=argparse.ArgumentParser();p.add_argument('--runtime-work',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    a=p.parse_args();a.output.mkdir(parents=True,exist_ok=False)
    file=a.runtime_work/'prepare_send_payloads.mjs'; before=file.read_text(); after=before
    def replace(old,new):
        nonlocal after
        if after.count(old)!=1:raise ValueError('RUNTIME_PATCH_CONTEXT_CHANGED: '+old[:70])
        after=after.replace(old,new,1)
    replace('const checks = [];', '''const checks = [];
const finalMailRequired = reportDateIso >= FINAL_MAIL_EFFECTIVE_DATE;
if (finalMailRequired && !process.env.REPORT_FINAL_MAIL_INPUT) throw new Error("FINAL_MAIL_INPUT_REQUIRED");
const finalMailInput = finalMailRequired ? JSON.parse(await fs.readFile(process.env.REPORT_FINAL_MAIL_INPUT, "utf8")) : null;''')
    after='import { FINAL_MAIL_EFFECTIVE_DATE, sealFinalMailBatch, validateArtifactLists } from "./final_mail_batch.mjs";\nimport { closureMailLines } from "./closure_mail_metrics.mjs";\n'+after
    replace('const dailyBody = await buildDailyBody(report);', '''const finalSourceContract = finalMailRequired ? JSON.parse(await fs.readFile(finalMailInput.sourceContractReceiptPath, "utf8")) : null;
if (finalMailRequired && (finalSourceContract.version !== 'north12b-source-contract/v2' || finalSourceContract.sourceSha256 !== sourceBatch.kpi.sha256 || finalSourceContract.dataCutoffDate !== dataCutoffDate)) throw new Error('SOURCE_CONTRACT_RECEIPT_MISMATCH');
const finalClosureLines = finalMailRequired ? closureMailLines(
  JSON.parse(await fs.readFile(finalMailInput.closureAuditPath, "utf8")), report.contact_close,
  { sourceSha256: sourceBatch.kpi.sha256, cutoffDate: dataCutoffDate }) : [];
const dailyBody = await buildDailyBody(report);''')
    replace('...contactCloseMailLines(report.contact_close),','...(finalMailRequired ? finalClosureLines : contactCloseMailLines(report.contact_close)),')
    replace('const dailyBodyRequiredText = ["【KPI呈現區】", "【接客與締結】",',
      'const dailyBodyRequiredText = ["【KPI呈現區】", finalMailRequired ? "【締結率｜來源分子／分母】" : "【接客與締結】",')
    replace('Number(supplementalSummary.qis?.score ?? 0).toFixed(2)', "(finalMailRequired && finalSourceContract.qisRawScore == null ? '尚未有資料' : Number(finalMailRequired ? finalSourceContract.qisRawScore : supplementalSummary.qis?.score ?? 0).toFixed(2))")
    replace('const dailyAttachments = dailyAttachmentBasenames(reportDateIso).map((name) => path.join(outputDir, name));','''const finalLists = finalMailRequired ? validateArtifactLists(
  JSON.parse(await fs.readFile(finalMailInput.dailyManifestPath, "utf8")),
  JSON.parse(await fs.readFile(finalMailInput.awardsManifestPath, "utf8")), reportDateIso) : null;
const dailyAttachments = finalLists ? finalLists.daily.map(e => path.join(finalMailInput.dailyDir, e.name))
  : dailyAttachmentBasenames(reportDateIso).map((name) => path.join(outputDir, name));''')
    replace('const phoneAttachments = [','const legacyPhoneAttachments = [')
    replace('const dailyAttachmentMetadata = await Promise.all(dailyAttachments.map(requireFile));','''const phoneAttachments = finalLists ? finalLists.phone_awards.map(e => path.join(finalMailInput.awardsDir, e.name)) : legacyPhoneAttachments;
const dailyAttachmentMetadata = await Promise.all(dailyAttachments.map(requireFile));''')
    replace('const dailyAttachmentContract = validateDailyAttachmentMetadata(dailyAttachmentMetadata, reportDateIso);','''const dailyAttachmentContract = finalMailRequired
  ? {count: dailyAttachmentMetadata.length, names: dailyAttachments.map(p => path.basename(p))}
  : validateDailyAttachmentMetadata(dailyAttachmentMetadata, reportDateIso);''')
    replace('const manifest = {','''if (finalMailRequired) {
  const sealed = await sealFinalMailBatch({ input: finalMailInput, payload, sourceBatch,
    configHash: activeAwardConfig._hash, sealRoot: path.join(logsDir, "mail-batches") });
  for (const type of ["daily", "phone_awards"]) payload[type] = {status: "sealed_pending_sent_reconcile", ...sealed.mails[type]};
  payload.final_mail_manifest = sealed.manifestPath;
  payload.final_mail_digest = sealed.digest;
  payload.dispatch_gate = "entrypoint_gate.mjs reserve/authorize/complete";
}
const manifest = {''')
    replace('  mailIds: [],','  mailIds: [],\n  finalMailManifest: payload.final_mail_manifest || null,\n  finalMailDigest: payload.final_mail_digest || null,')
    replace('await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");','await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), {encoding: "utf8", ...(finalMailRequired ? {flag: "wx"} : {})});')
    target=a.output/'work';target.mkdir()
    (target/file.name).write_text(after)
    # Copy dependencies without changing their bytes or following unrelated runtime trees.
    pending=[file.name];copied=set(pending)
    while pending:
        name=pending.pop();text=(target/name).read_text()
        for dep in re.findall(r'from [\'"]\./([^\'"]+\.mjs)[\'"]',text):
            if dep in copied:continue
            origin=CODE/dep if dep in {'final_mail_batch.mjs','closure_mail_metrics.mjs','mail_gate.mjs'} else a.runtime_work/dep
            shutil.copy2(origin,target/dep);copied.add(dep);pending.append(dep)
    shutil.copy2(CODE/'mail_gate.mjs',target/'mail_gate.mjs')
    shutil.copy2(CODE/'entrypoint_gate.mjs',target/'entrypoint_gate.mjs')
    (a.output/'runtime-minimal.patch').write_text(''.join(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='work/'+file.name,tofile='work/'+file.name)))
    # Reject if another owner changed the producer during preparation.
    if file.read_text()!=before:raise ValueError('LIVE_RUNTIME_CHANGED_DURING_PREPARATION')
    receipt={'status':'prepared_not_installed','runtime_file':str(file),'before_sha256':digest(file),
      'candidate_sha256':digest(target/file.name),'new_modules':{name:digest(target/name) for name in ['final_mail_batch.mjs','closure_mail_metrics.mjs','mail_gate.mjs','entrypoint_gate.mjs']},
      'preserved_dependencies':{name:digest(target/name) for name in sorted(copied) if name not in {'prepare_send_payloads.mjs','final_mail_batch.mjs','closure_mail_metrics.mjs'}},
      'external_sends':0,'production_writes':0}
    (a.output/'candidate-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2))
    print(json.dumps(receipt,ensure_ascii=False))
if __name__=='__main__':main()
