import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),C=require('../department-readonly-core.js'),assets=require('../department-readonly-assets.js');
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--scores','--gold','--out'].includes(args[i])||!args[i+1])throw Error('Usage: node scripts/export-department-readonly.mjs --scores saved-response.json --gold saved-response.json --out private/output.html');options[args[i].slice(2)]=args[i+1];}
if(!options.out||(!options.scores&&!options.gold))throw Error('An output and at least one verified saved response are required');
const read=file=>file?JSON.parse(fs.readFileSync(path.resolve(file),'utf8')):null;
fs.writeFileSync(path.resolve(options.out),C.createHTML({scores:read(options.scores),gold:read(options.gold)},assets),{mode:0o600});
console.log('Created local readonly HTML. Keep real data outside the repository.');
