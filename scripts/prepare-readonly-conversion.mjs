#!/usr/bin/env node
// Local aggregate preparation only. No HTTP, credentials, uploads or formal writes.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),XLSX=require('../assets/vendor/xlsx.full.min.js'),Core=require('../readonly-dashboard-core.js');
const [sourceArg,outputArg,baselineArg]=process.argv.slice(2);
if(!sourceArg||!outputArg||![sourceArg,outputArg,...(baselineArg?[baselineArg]:[])].every(path.isAbsolute))throw Error('Usage: node scripts/prepare-readonly-conversion.mjs ABSOLUTE_SOURCE_XLSX NEW_ABSOLUTE_PRIVATE_JSON [ABSOLUTE_PRIOR_JSON]');
if(!/\.xlsx$/i.test(sourceArg))throw Error('Source must be XLSX');
const output=path.resolve(outputArg),relative=path.relative(root,output);
if(!relative.startsWith('..'+path.sep)&&relative!=='..')throw Error('Aggregate output must stay outside the public repository');
if(fs.existsSync(output))throw Error('Output exists; source and prior version will not be overwritten');
const bytes=fs.readFileSync(sourceArg);if(bytes.length>40*1024*1024)throw Error('Source exceeds reviewed 40 MB limit');
const sourceSha256=crypto.createHash('sha256').update(bytes).digest('hex');
// Customer/phone/renewal detail sheets are deliberately not parsed.
const workbook=XLSX.read(bytes,{type:'buffer',sheets:['AQ締結率','RT每日','RT締結率','樞紐']});
const snapshot=Core.parseWorkbook(workbook,XLSX,{sha256:sourceSha256,source_name:path.basename(sourceArg),source_bytes:bytes.length});
const baseline=baselineArg?JSON.parse(fs.readFileSync(baselineArg,'utf8')):null,diff=Core.diff(baseline,snapshot);
if(diff.removed)throw Error('New snapshot removes existing store/date keys; stop and review the source');
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({status:'PREPARED_LOCAL_ONLY',file:output,sourceSha256,cutoff:snapshot.cutoff,storeDateKeys:snapshot.records.length,diff:{sameSource:diff.same_source,added:diff.added,changed:diff.changed,removed:diff.removed},customerDetailParsed:false,productionWrites:0}));
