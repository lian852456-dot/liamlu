'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),STATE='READONLY_CONVERSION_STATE_V1';
function runtime({post=false}={}){
  const properties=new Map(),cache=new Map(),files=new Map(),events=[];
  let serial=0,time=Date.now(),corruptNew=false,failStateRead=false;
  const owner={getEmail:()=> 'synthetic-owner@example.test'};
  const iterator=values=>{let i=0;return{hasNext:()=>i<values.length,next:()=>values[i++]};};
  const folder={getId:()=> 'synthetic-private-folder',getOwner:()=>owner,
    getSharingAccess:()=> 'PRIVATE',getSharingPermission:()=> 'NONE',
    createFile(blob){events.push('create');const id='synthetic-'+(++serial),file={text:blob.text,parent:folder,sharing:'PRIVATE',
      getId:()=>id,getParents:()=>iterator([file.parent]),getOwner:()=>owner,isTrashed:()=>false,
      getSharingAccess:()=>file.sharing,getSharingPermission:()=> 'NONE',
      getBlob(){events.push('blob');return{getDataAsString:()=>corruptNew?file.text+' ':file.text};}};
      files.set(id,file);return file;}};
  const props={getProperty(key){events.push('state-read');if(failStateRead){failStateRead=false;return '{}';}return properties.get(key)??null;},
    setProperty(key,value){events.push('state-write');properties.set(key,String(value));},deleteProperty:key=>properties.delete(key)};
  const context=vm.createContext({console,Date:class extends Date{constructor(...args){super(...(args.length?args:[time]));}static now(){return time;}},
    privateDashboardProperties:()=>props,privateDashboardFolder:()=>{events.push('folder');return folder;},
    reportUploadAuthorize_(payload){events.push('auth');if(payload?.employeeId!=='SYN001'||payload?.adminSecret!=='synthetic-admin-proof')throw Error('denied');return 'SYN001';},
    CacheService:{getScriptCache:()=>({put:(k,v)=>cache.set(k,v),get:k=>cache.get(k)||null,remove:k=>cache.delete(k)})},
    LockService:{getScriptLock:()=>({waitLock(){events.push('lock');},releaseLock(){events.push('unlock');}})},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'},getFileById(id){events.push('getFile');if(!files.has(id))throw Error('missing');return files.get(id);}},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'UTF8'},computeDigest:(_,text)=>[...crypto.createHash('sha256').update(text,'utf8').digest()],
      getUuid:()=>crypto.randomUUID(),newBlob:(text,type,name)=>({text,type,name})}});
  for(const relative of ['gas/ReadonlyDashboardCore.gs','gas/ReadonlyConversion.gs'])vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context,{filename:relative});
  const auth={employeeId:'SYN001',adminSecret:'synthetic-admin-proof'};
  if(post){
    const code=fs.readFileSync(path.join(root,'gas/Code.gs'),'utf8');
    const fn=name=>{const start=code.indexOf('function '+name+'('),end=code.indexOf('\n}',start);if(start<0||end<0)throw Error('Missing production function '+name);return code.slice(start,end+2);};
    properties.set('DASHBOARD_ADMIN_SECRET',auth.adminSecret);properties.set('REPORT_UPLOAD_ALLOWED_EMPLOYEES',auth.employeeId);
    context.PropertiesService={getScriptProperties:()=>props};context.ScriptApp={getService:()=>({getUrl:()=> 'https://synthetic-owner.invalid/exec'})};
    context.ContentService={MimeType:{JSON:'json',JAVASCRIPT:'javascript'},createTextOutput:text=>({text,setMimeType(){return this;}})};
    const whitelist=code.match(/const REPORT_UPLOAD_ALLOWED_ACTIONS = \[[\s\S]*?\];/)[0];vm.runInContext(whitelist,context);
    for(const name of ['privateDashboardRequiredProperty','privateDashboardCleanEmployeeId','privateDashboardHash','privateDashboardAdminAuthorized','reportUploadAuthorize_','reportUploadIsUploadDeployment_','privateDashboardPostRawPayload','privateDashboardParsePostPayload','privateDashboardPostIsIframeTransport','privateDashboardPostResponse','jsonResponse','privateDashboardGasBMaybePost_','privateDashboardGasAuthMaybeRpcPost_','doPost'])vm.runInContext(fn(name),context,{filename:name});
    const original=context.reportUploadAuthorize_;context.reportUploadAuthorize_=payload=>{events.push('auth');return original(payload);};
  }
  const call=(operation,payload={})=>JSON.parse(JSON.stringify(context['readonlyConversion'+operation]({...auth,...payload})));
  const http=body=>JSON.parse(context.doPost({parameter:{},postData:{type:'text/plain;charset=utf-8',contents:JSON.stringify(body)}}).text);
  return{context,call,post:http,auth,events,files,properties,cache,folder,advance:ms=>time+=ms,
    corruptNew:value=>{corruptNew=value;},failStateReadback(){const original=props.setProperty;props.setProperty=(...args)=>{original(...args);failStateRead=true;props.setProperty=original;};},
    get state(){return properties.has(STATE)?JSON.parse(properties.get(STATE)):null;}};
}
function fixture({days=3,hash='a',month='10'}={}){
  const C=require('../../readonly-dashboard-core.js');
  return{schema:C.SCHEMA,period_start:'2026-'+month+'-01',cutoff:'2026-'+month+'-'+String(days).padStart(2,'0'),
    sha256:hash.repeat(64),source_bytes:1234,source_name:'synthetic-conversion.xlsx',
    records:C.STORES.flatMap((s,i)=>Array.from({length:days},(_,j)=>({store:s.id,date:'2026-'+month+'-'+String(j+1).padStart(2,'0'),aq_n:j,aq_d:10+i,rt_n:j,rt_d:20+i}))),prior:null};
}
module.exports={runtime,fixture};
