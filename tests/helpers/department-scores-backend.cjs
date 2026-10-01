const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const clone=x=>JSON.parse(JSON.stringify(x));
function backend(){
 const files=new Map();let index=0,failCreateAt=0,created=0,access='PRIVATE',shared=0,owner='owner@example.test';
 const iterator=xs=>{let i=0;return {hasNext:()=>i<xs.length,next:()=>xs[i++]};};
 const folder={getId:()=> 'folder',getName:()=> 'Existing private domain',getOwner:()=>({getEmail:()=>owner}),getSharingAccess:()=>access,getEditors:()=>Array(shared).fill({}),getViewers:()=>[],getFilesByName:name=>iterator([...files.values()].filter(f=>f.name===name)),createFile(name,content){created++;if(failCreateAt&&created===failCreateAt)throw new Error('injected create failure');const id='f'+(++index),f={name,content,getId:()=>id,getParents:()=>iterator([folder]),getSharingAccess:()=>access,getEditors:()=>[],getViewers:()=>[],getOwner:()=>({getEmail:()=>owner}),getBlob:()=>({getDataAsString:()=>f.content}),setContent:value=>{f.content=value;}};files.set(id,f);return f;}};
 const context=vm.createContext({console,Date,SPREADSHEET_ID:'sheet',DriveApp:{Access:{PRIVATE:'PRIVATE'},getFileById:id=>{if(id==='sheet')return {getOwner:()=>({getEmail:()=> 'owner@example.test'})};if(!files.has(id))throw new Error('missing file');return files.get(id);}},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(alg,value)=>[...crypto.createHash('sha256').update(value).digest()],getUuid:()=>crypto.randomUUID()},MimeType:{PLAIN_TEXT:'text/plain'},LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},departmentOpsFolder_:()=>folder,ptRequireSession_:token=>{if(token!=='authorized')throw new Error('AUTH_SESSION_INVALID');}});
 vm.runInContext(fs.readFileSync('department-scores-core.js','utf8'),context);vm.runInContext(fs.readFileSync('gas/DepartmentScores.gs','utf8'),context);
 return {invoke:body=>clone(context.departmentScoresDispatch_(clone(body))),files,setAccess:v=>{access=v;},setShared:v=>{shared=v;},setOwner:v=>{owner=v;},failAfter:n=>{failCreateAt=created+n;},folder};
}
module.exports=backend;
