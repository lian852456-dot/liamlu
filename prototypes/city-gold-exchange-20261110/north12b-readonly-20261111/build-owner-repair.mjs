import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url));
const once=(s,a,b)=>{if(s.indexOf(a)<0||s.indexOf(a)!==s.lastIndexOf(a))throw Error('OWNER_ANCHOR_MISMATCH');return s.replace(a,b);};
export function buildOwnerRepair(source){
  const marker='function cityEmployeeBridgeRuntime_() {';
  if(source.indexOf(marker)<0||source.indexOf(marker)!==source.lastIndexOf(marker))throw Error('OWNER_RUNTIME_MISMATCH');
  let core=fs.readFileSync(path.join(here,'../connection-20261111/owner/CityEmployeeBridge.gs'),'utf8');
  core=once(core,'policyId:policy.id,deadline:policy.validUntil,',
    "policyId:policy.id,policy:{schema:policy.schema,id:policy.id.split(':')[0],generation:policy.generation,enabled:policy.enabled,notBefore:policy.notBefore,validUntil:policy.validUntil},deadline:policy.validUntil,");
  let runtime=source.slice(source.indexOf(marker));
  runtime=once(runtime,'properties:privateDashboardProperties(),now:function(){return Date.now();},',
    'properties:privateDashboardProperties(),readPolicy:cityOwnerPolicyRead_,now:function(){return Date.now();},');
  return core+'\n'+fs.readFileSync(path.join(here,'OwnerPolicyRuntime.gs'),'utf8')+'\n'+runtime;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [sourceDir,destination]=process.argv.slice(2);
  if(!sourceDir||!destination||fs.existsSync(destination))throw Error('FRESH_OUTPUT_DIRECTORY_REQUIRED');
  fs.mkdirSync(destination,{recursive:true,mode:0o700});
  const manifest=[];
  for(const name of fs.readdirSync(sourceDir)){
    if(name.startsWith('.')&&name!=='.clasp.json')continue;
    const file=path.join(sourceDir,name);if(!fs.statSync(file).isFile())throw Error('UNEXPECTED_SOURCE_DIRECTORY');
    const before=fs.readFileSync(file),after=name==='CityEmployeeBridge.js'?Buffer.from(buildOwnerRepair(before.toString())):before;
    fs.writeFileSync(path.join(destination,name),after,{mode:0o600});
    const hash=x=>createHash('sha256').update(x).digest('hex');
    manifest.push({name,before:hash(before),after:hash(after),changed:!before.equals(after)});
  }
  console.log(JSON.stringify({changed:manifest.filter(f=>f.changed).map(f=>f.name),files:manifest},null,2));
}
