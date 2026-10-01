'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const clone=value=>JSON.parse(JSON.stringify(value));
const rules=()=>({contract:'store-rule-reminders-v1',scope:'store-daily-reminders',revision:'synthetic-v1',context:'合成版本說明',rules:[{id:'combined-a',category:'合成分類',title:'合成提醒',instruction:'SYNTHETIC_COMBINED_RULE',frequency:'合成頻率',audience:'合成對象',exceptions:[],sources:[{shortName:'合成來源',pages:[1]}]}]});
function runtime(){
  const files=new Map(),properties=new Map([['PT_KEY','synthetic-passcode']]),cache=new Map();
  const owner={getEmail:()=> 'owner@example.test'};
  let serial=0,reads=0,writes=0,now=Math.floor(Date.now()/1000);
  const iterator=values=>{let index=0;return {hasNext:()=>index<values.length,next:()=>values[index++]};};
  function file(name,content){
    const id='synthetic-file-'+(++serial);
    const result={name,content,getId:()=>id,getName:()=>name,getOwner:()=>owner,getSharingAccess:()=> 'PRIVATE',getEditors:()=>[],getViewers:()=>[],getParents:()=>iterator([folder]),getSize:()=>Buffer.byteLength(result.content),getBlob:()=>{reads++;return {getDataAsString:()=>result.content};},setContent:value=>{writes++;result.content=value;return result;}};
    files.set(id,result);return result;
  }
  const folder={getId:()=> 'synthetic-folder',getName:()=> 'Existing private domain',getOwner:()=>owner,getSharingAccess:()=> 'PRIVATE',getEditors:()=>[],getViewers:()=>[],getFilesByName:name=>{reads++;return iterator([...files.values()].filter(f=>f.name===name));},createFile:(name,content)=>{writes++;return file(name,content);}};
  const bytes=value=>Buffer.from(Array.isArray(value)?value.map(n=>n<0?n+256:n):value);
  const context=vm.createContext({console,Date,MimeType:{PLAIN_TEXT:'text/plain'},Logger:{log(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key)||null,setProperty:(key,value)=>properties.set(key,String(value))})},
    CacheService:{getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,value)=>cache.set(key,String(value)),remove:key=>cache.delete(key)})},
    LockService:{getScriptLock:()=>({waitLock(){},releaseLock(){}})},
    DriveApp:{Access:{PRIVATE:'PRIVATE'},getFileById:id=>{reads++;if(id==='10MqzAWOPc4UPE-g5ZZPNZG3tYAndKW-DApLuuhIpQWA')return {getOwner:()=>owner,getParents:()=>iterator([folder])};if(!files.has(id))throw new Error('missing synthetic file');return files.get(id);}},
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,value)=>[...crypto.createHash('sha256').update(String(value)).digest()],computeHmacSha256Signature:(value,key)=>[...crypto.createHmac('sha256',String(key)).update(String(value)).digest()],base64EncodeWebSafe:value=>bytes(value).toString('base64url'),base64DecodeWebSafe:value=>[...Buffer.from(value,'base64url')],newBlob:value=>({getBytes:()=>[...bytes(value)],getDataAsString:()=>bytes(value).toString()}),getUuid:()=>crypto.randomUUID()},
    ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:text=>({text,setMimeType(){return this;}})}
  });
  for(const relative of ['patrol-gas/PatrolCode.gs','gas/DepartmentGoldMonthlyCore.gs','gas/DepartmentGoldMonthly.gs','gas/DepartmentScoresCore.gs','gas/DepartmentScores.gs','gas/StoreRules.gs'])vm.runInContext(fs.readFileSync(path.join(root,relative),'utf8'),context,{filename:relative});
  const q2={monthKey:'2026-06',dateRange:{start:'2026-06-01',end:'2026-06-30',cutoff:'2026-06-30'},records:[{employeeId:'SYN-Q2',employeeName:'合成保留',region:'北一二A',storeCode:'SYN-Q2',store:'合成歷史店',role:'合成職稱',medal:77}]};
  context.departmentOpsLatestSnapshot_=()=>({version:1,months:[clone(q2)]});
  context.ptSessionNowSeconds_=()=>now;
  file('north12-store-rule-reminders-private.json',JSON.stringify(rules()));
  const post=payload=>JSON.parse(context.doPost({postData:{contents:JSON.stringify(payload)}}).text);
  return {context,post,files,q2:clone(q2),get reads(){return reads;},get writes(){return writes;},advance:seconds=>{now+=seconds;}};
}
module.exports={runtime,rules,clone};
