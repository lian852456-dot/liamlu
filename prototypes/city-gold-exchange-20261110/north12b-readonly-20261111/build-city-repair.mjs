import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url));
const once=(s,a,b)=>{if(s.indexOf(a)<0||s.indexOf(a)!==s.lastIndexOf(a))throw Error('CITY_SOURCE_ANCHOR_MISMATCH');return s.replace(a,b);};
export function buildCityRepair({addon,backend,client}){
  addon=once(addon,"import {createStaffOwnerBinding,CITY_OWNER_DEADLINE} from './staff-owner-binding.mjs';",
    "import {createStaffOwnerBinding} from './staff-owner-binding.mjs';\nimport {createOwnerPolicyProvider} from './owner-policy-provider.mjs';");
  addon=once(addon,'  let crowd;','  let crowd;\n  const ownerPolicy=createOwnerPolicyProvider({info:remote.info,now});');
  addon=once(addon,'createStaffOwnerBinding({db,worldId,now,','createStaffOwnerBinding({db,worldId,now,readPolicy:ownerPolicy.read,');
  addon=once(addon,"      if(path==='/api/employee/link/status'",
    "      if(path.startsWith('/api/employee/link/')||path==='/api/employee/me')await ownerPolicy.refresh();\n      if(path==='/api/employee/link/status'");
  backend=once(backend,"formalOwnerProofDeadline:'2026-10-31T15:59:00.000Z'","formalOwnerProofPolicy:'original-b-authority',formalOwnerProofMaxLeaseMs:1800000");
  client=once(client,'const messages={CITY_CLOCK_UNAVAILABLE:',
    "const messages={OWNER_SERVICE_UNAVAILABLE:'目前無法驗證原員工核身服務，請稍後再試；原角色與進度未變更。',OWNER_POLICY_INACTIVE:'員工核身授權目前無效，請主管確認；原角色與進度未變更。',OWNER_POLICY_ROLLBACK:'員工核身授權版本不一致，請主管確認；原角色與進度未變更。',EMPLOYEE_REVERIFY_REQUIRED:'本人核身已到期，請由原員工登入頁重新驗證；不用另建角色。',CITY_CLOCK_UNAVAILABLE:");
  const binding=once(fs.readFileSync(path.join(here,'../connection-20261111/owner/staff-owner-binding.mjs'),'utf8'),
    "from '../../../city-interactions-release-20261110/runtime/employee/formal-contract.mjs'","from './formal-contract.mjs'");
  return {'runtime/employee/employee-city-addon.mjs':addon,'runtime/employee/staff-owner-binding.mjs':binding,
    'runtime/employee/owner-policy-provider.mjs':fs.readFileSync(path.join(here,'owner-policy-provider.mjs'),'utf8'),
    'backend-main.mjs':backend,'public/employee-city-link.js':client};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [source,destination]=process.argv.slice(2);
  if(!source||!destination||fs.existsSync(destination))throw Error('FRESH_OUTPUT_DIRECTORY_REQUIRED');
  const read=f=>fs.readFileSync(path.join(source,f),'utf8');
  const output=buildCityRepair({addon:read('runtime/employee/employee-city-addon.mjs'),backend:read('backend-main.mjs'),client:read('public/employee-city-link.js')});
  const hash=x=>createHash('sha256').update(x).digest('hex');
  const records=[];
  for(const [file,text] of Object.entries(output)){
    const p=path.join(destination,file);fs.mkdirSync(path.dirname(p),{recursive:true,mode:0o700});fs.writeFileSync(p,text,{mode:0o600});
    records.push({file,before:fs.existsSync(path.join(source,file))?hash(read(file)):null,after:hash(text)});
  }
  fs.writeFileSync(path.join(destination,'patch-manifest.json'),JSON.stringify({schema:'city-owner-patch/v1',files:records},null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({files:records.length,applied:false}));
}
