import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const {origin}=JSON.parse(fs.readFileSync(resolve(root,'.private-preview/gateway.json')));
const files=['index.html','preview.js','li-shuhuan-outline.js','jialing-head-sample.js','portrait-config.js','portrait-hair-library.js','assets/portrait-hair/p5.glb'];
const rows=[];
for(const file of files){const expected=fs.readFileSync(resolve(root,'public',file));const res=await fetch(origin+'/'+file);const actual=Buffer.from(await res.arrayBuffer());const match=res.status===200&&expected.equals(actual);rows.push({file,status:res.status,match,sha256:createHash('sha256').update(expected).digest('hex')});if(!match)throw Error('PUBLIC_MISMATCH:'+file);}
const denied=[];for(const path of ['/.private-preview/gateway.json','/runtime/core/.private-v42-li-shuhuan-outline/','/server.mjs']){const res=await fetch(origin+path);if(res.status!==404)throw Error('PRIVATE_PATH_VISIBLE');denied.push({path,status:res.status});}
const receipt={at:new Date().toISOString(),origin,pass:true,release:'20261104-li-shuhuan-outline.1',files:rows,denied,formalDeployment:false,originalWorldsOpened:false,physicalIphoneUat:false};fs.writeFileSync(resolve(root,'evidence/public-readback.json'),JSON.stringify(receipt,null,2));console.log(JSON.stringify({pass:true,origin,files:rows.length,privatePathsDenied:true}));
