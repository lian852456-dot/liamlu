import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
const repo=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
test('fresh upload candidate preserves isolated A code and manifest, but rejects page drift',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'price-offline-prepare-'));
 try{
  const baseline=path.join(folder,'baseline'),candidate=path.join(folder,'candidate');fs.mkdirSync(baseline);
  for(const [target,source] of [['Code.gs','gas/Code.gs'],['ThreecPriceTransport.js','threec-price-transport.js']])fs.copyFileSync(path.join(repo,source),path.join(baseline,target));
  const codeFile=path.join(baseline,'Code.gs');fs.writeFileSync(codeFile,fs.readFileSync(codeFile,'utf8').replace('\nfunction privateDashboardAdminRequests(', '\nconst PRESERVED_UNRELATED_GLOBAL = true;\nfunction privateDashboardAdminRequests('));
  fs.writeFileSync(path.join(baseline,'ReportUpload.html'),execFileSync('git',['show','a945bf5d7ce839ab324a5e8f09190a7cac86e801:gas/ReportUpload.html'],{cwd:repo}));
  const isolated='var IsolatedA=(function(){function privateDashboardAdminAuthorized(){} function reportUploadAuthorize_(){} return {};})();\n';
  fs.writeFileSync(path.join(baseline,'IsolatedA.js'),isolated);fs.writeFileSync(path.join(baseline,'appsscript.json'),'{"runtimeVersion":"V8"}');
  const run=target=>spawnSync(process.execPath,['scripts/prepare-price-offline-upload.mjs',baseline,target],{cwd:repo,encoding:'utf8'});
  const ok=run(candidate);assert.equal(ok.status,0,ok.stderr);
  for(const name of ['Code.gs','IsolatedA.js','ThreecPriceTransport.js','appsscript.json'])assert.deepEqual(fs.readFileSync(path.join(candidate,name)),fs.readFileSync(path.join(baseline,name)));
  assert.equal(fs.readFileSync(path.join(candidate,'IsolatedA.js'),'utf8'),isolated);
  fs.appendFileSync(path.join(baseline,'ReportUpload.html'),'OTHER_EDITOR_CHANGE');
  const denied=path.join(folder,'must-not-exist'),bad=run(denied);assert.notEqual(bad.status,0);assert.match(bad.stderr,/page drift/);assert.equal(fs.existsSync(denied),false);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
