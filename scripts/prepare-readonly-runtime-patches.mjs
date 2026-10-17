// Prepare only UI-selected, credential-free function fragments. Never read or
// replace a whole production Code.gs, manifest, property store or credential.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [input,output]=process.argv.slice(2);
if(!input||!output||![input,output].every(path.isAbsolute))throw Error('Usage: node scripts/prepare-readonly-runtime-patches.mjs ABS_SCOPED_FUNCTION_DIR NEW_ABS_PRIVATE_OUTPUT_DIR');
if(!path.relative(root,output).startsWith('..'+path.sep)||fs.existsSync(output))throw Error('Use a new output directory outside the public repository');
const code=fs.readFileSync(path.join(root,'gas/Code.gs'),'utf8');
const extract=(source,name)=>{const start=source.indexOf('function '+name+'('),end=source.indexOf('\n}',start);if(start<0||end<0)throw Error('Missing function '+name);return source.slice(start,end+2);};
const hash=text=>crypto.createHash('sha256').update(text).digest('hex');
const read=name=>{const text=fs.readFileSync(path.join(input,name+'.before.gs'),'utf8');if(!text.startsWith('function '+name+'(')||!text.endsWith('\n}')||text.includes('\nfunction '))throw Error('Input is not the one scoped function '+name);return text;};
const guards=['reportUploadAuthorize_','privateDashboardAdminAuthorized'];
for(const name of guards)if(read(name)!==extract(code,name))throw Error('Original authorization differs from the tested implementation: '+name);
const post=read('doPost'),reader=read('privateDashboardSnapshot');
if(reader!==extract(code,'privateDashboardSnapshot').replace("return typeof readonlyConversionAttach_ === 'function' ? readonlyConversionAttach_(snapshot) : snapshot;",'return snapshot;'))throw Error('Private snapshot reader drift; do not replace it');
const anchor="    else if (action === 'report_upload_rollback') result = reportUploadRollback(payload);";
if(post.split(anchor).length!==2||post.includes('readonly_conversion_'))throw Error('POST route anchor drift or feature already present');
const routes=['Status','Preview','Publish','Rollback'].map(name=>"    else if (action === 'readonly_conversion_"+name.toLowerCase()+"') result = readonlyConversion"+name+"(payload);").join('\n');
const nextPost=post.replace(anchor,anchor+'\n'+routes);
const nextReader=reader.replace('  return snapshot;',"  return typeof readonlyConversionAttach_ === 'function' ? readonlyConversionAttach_(snapshot) : snapshot;");
fs.mkdirSync(path.join(output,'candidate'),{recursive:true});fs.mkdirSync(path.join(output,'rollback'));
for(const [name,before,after]of [['doPost',post,nextPost],['privateDashboardSnapshot',reader,nextReader]]){
  fs.writeFileSync(path.join(output,'candidate',name+'.gs'),after);fs.writeFileSync(path.join(output,'rollback',name+'.gs'),before);
}
for(const name of ['ReadonlyConversion.gs','ReadonlyDashboardCore.gs'])fs.copyFileSync(path.join(root,'gas',name),path.join(output,'candidate',name));
const receipt={status:'PREPARED_ONLY',wholeCodeReadOrReplaced:false,authGuardsUnchanged:true,existingRoutesPreserved:true,
  edits:{doPost:{before:hash(post),after:hash(nextPost),addedLines:4},privateDashboardSnapshot:{before:hash(reader),after:hash(nextReader),changedLines:1}},
  newModules:['ReadonlyConversion.gs','ReadonlyDashboardCore.gs'],credentialsRead:false,productionWrites:0};
fs.writeFileSync(path.join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
