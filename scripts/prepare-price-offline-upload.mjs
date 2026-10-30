// Prepare a local candidate from a fresh private pull of the existing upload
// project. Does not push, deploy, change Properties, or replace shared Code.gs.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const [baselineArg,destinationArg]=process.argv.slice(2);
if(!baselineArg||!destinationArg)throw Error('Usage: node scripts/prepare-price-offline-upload.mjs FRESH_PRIVATE_BASELINE NEW_PRIVATE_CANDIDATE');
const baseline=fs.realpathSync(baselineArg),destination=path.resolve(destinationArg);
if(destination===baseline||destination.startsWith(baseline+path.sep)||fs.existsSync(destination))throw Error('Use a new separate private candidate directory.');
const read=p=>fs.readFileSync(p,'utf8'),hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const originalPage=read(path.join(baseline,'ReportUpload.html'));
const baseCommit='a945bf5d7ce839ab324a5e8f09190a7cac86e801';
const knownPage=execFileSync('git',['show',baseCommit+':gas/ReportUpload.html'],{cwd:root,encoding:'utf8'});
if(originalPage.replace(/\r\n/g,'\n')!==knownPage)throw Error('Upload page drift: review the current private baseline before applying this UI patch.');
const names=fs.readdirSync(baseline).filter(name=>fs.statSync(path.join(baseline,name)).isFile());
const code=names.filter(name=>/\.(gs|js)$/.test(name)).map(name=>read(path.join(baseline,name))).join('\n');
const current=read(path.join(root,'gas/Code.gs'));
function declaration(source,name){const a=source.indexOf('function '+name+'(');if(a<0||source.indexOf('function '+name+'(',a+1)>=0)throw Error('Missing or duplicate '+name);const next=source.slice(a+1).search(/^function /m);return source.slice(a,next<0?undefined:a+1+next).trim().replace(/\r\n/g,'\n');}
for(const name of ['privateDashboardAdminAuthorized','reportUploadAuthorize_','threecReadActive_','threecPublicResult_'])if(declaration(code,name)!==declaration(current,name))throw Error('Existing authentication or price-read contract drift: '+name);
const additions=['ThreecPriceOfflineCore.gs','ThreecPriceOfflineAssets.gs','ThreecPriceOfflineExport.gs'];
if(code.includes('function threec_export_readonly(')||additions.some(name=>names.includes(name)))throw Error('Export module is already present; inspect its version before updating.');
const transport=names.find(name=>read(path.join(baseline,name)).includes("const ENCODING='shopping-columns/v1'"));
if(!transport)throw Error('Existing verified price transport is required.');
fs.mkdirSync(destination);
for(const name of names)fs.copyFileSync(path.join(baseline,name),path.join(destination,name));
fs.copyFileSync(path.join(root,'gas/ReportUpload.html'),path.join(destination,'ReportUpload.html'));
for(const name of additions)fs.copyFileSync(path.join(root,'gas',name),path.join(destination,name));
const receipt={baseline:baseCommit,changed:['ReportUpload.html'],added:additions,unchanged:names.filter(name=>name!=='ReportUpload.html'),files:{}};
for(const name of [...names,...additions])receipt.files[name]={before:names.includes(name)?hash(path.join(baseline,name)):null,after:hash(path.join(destination,name))};
for(const name of receipt.unchanged)if(receipt.files[name].before!==receipt.files[name].after)throw Error('Unrelated file changed: '+name);
fs.writeFileSync(destination+'.receipt.json',JSON.stringify(receipt,null,2),{flag:'wx'});
console.log(JSON.stringify({changed:receipt.changed,added:receipt.added,unchangedFiles:receipt.unchanged.length,candidate:destination}));
