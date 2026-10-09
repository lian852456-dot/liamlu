'use strict';
// Offline service double. No connector, Google service, credential or real record.
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const Core=require('../../tradein-performance-core.js'),Ref=require('../tradein-reference-fixture.cjs');
const OPERATOR='SYNTH01',DEVICE='SYNTHETIC_APPROVED_DEVICE';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function employee(id,role='業務代表(I)',store='萬大'){
 return {employee_id:Ref.IDS[id],masked_name:'合＊'+id.slice(-1),store,role,status:'active',effective_from:'2026-01-01',effective_to:null};
}
function csv(){
 const header=Array.from({length:29},(_,i)=>'合成欄'+i);header[15]='';header[18]='';
 Object.assign(header,{0:'序號',1:'店點代碼',3:'區域別',4:'日期',6:'專案類別',11:'回收代碼/IMEI',17:'銷貨單號',23:'員工編號',26:'取消交易日期'});
 const rows=[['REC-A','12345','DNB10168'],['REC-B','12346','DNB10168'],['REC-C','12346','DNB10168'],['REC-D','12347','DNB10146']].map(([code,id,store],i)=>{
  const row=Array(29).fill('');Object.assign(row,{0:String(i+1),1:store,3:'北一二B',4:'1151002',6:'單銷',11:'SYNTHETIC-'+code,17:'SYNTHETIC-ORDER-'+i,23:id});return row.join(',');
 });
 return Buffer.from('日期 :,115/10/01 - 115/10/07,列印日期 :,26年10月08日 11:23\n'+header.join(',')+'\n'+rows.join('\n'),'utf8');
}
function parsed(bytes=csv()){
 let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('big5',{fatal:true}).decode(bytes);}
 const value=Core.parseSar74(text);value.source_sha256=hash(bytes);value.complete_nine_stores=true;return value;
}
function createRuntime(options={}){
 const files=new Map(),configs=new Map(),writes=[];let counter=0,held=false;
 const fakeSecret=options.adminSecret||'SYNTHETIC_ADMIN_ONLY';
 function file(id,name,initial){let text=initial;return {getId:()=>id,getName:()=>name,getBlob:()=>({getDataAsString:()=>text}),
  setContent:value=>{assert.ok(held,'synthetic registry writes require the original lock');text=value;writes.push({operation:'update',name});},
  tamperForTest:value=>{text=value;},
  getParents:()=>{let remaining=true;return {hasNext:()=>remaining,next:()=>{remaining=false;return folder;}};}};}
 const folder={getId:()=> 'SYNTHETIC_PRIVATE_FOLDER',getSharingAccess:()=> 'PRIVATE',getSharingPermission:()=> 'NONE',
  getFilesByName:name=>{const found=[...configs.values(),...files.values()].filter(f=>f.getName()===name);return {hasNext:()=>found.length>0,next:()=>found.shift()};},
  createFile:(name,text)=>{assert.ok(held);const id='SYNTHETIC_FILE_'+(++counter),value=file(id,name,text);files.set(id,value);writes.push({operation:'create',name});return value;}};
 const accessRows=new Map([[OPERATOR,{employee_id:OPERATOR,masked_name:'合＊督',store:'北一二B',role:'督導',status:'active',device_id:DEVICE}]]);
 for(const id of Object.values(Ref.IDS))accessRows.set(id,{employee_id:id,masked_name:'合＊員',store:id==='ZX00004'?'杭州南':id==='ZX00008'?'三創':'萬大',role:'業務代表(I)',status:'active',device_id:DEVICE});
 const context=vm.createContext({TradeinPerformanceCore:Core,
  privateDashboardCleanEmployeeId:v=>String(v||'').trim().toUpperCase(),privateDashboardCleanDeviceId:v=>{if(!v)throw Error('裝置缺漏');return String(v);},
  privateDashboardIsTrustedEmployee:id=>id===OPERATOR,privateDashboardUserByEmployeeId:id=>({user:accessRows.get(id)}),
  privateDashboardHash:hash,privateDashboardNow:()=> '2026-10-09T12:00:00+08:00',privateDashboardFolder:()=>folder,
  reportUploadAuthorize_:p=>{if(p.adminSecret!==fakeSecret || options.operatorRequired!==false&&p.employeeId!==OPERATOR)throw Error('合成管理者驗證失敗');return OPERATOR;},
  DriveApp:{Access:{PRIVATE:'PRIVATE'},Permission:{NONE:'NONE'},getFileById:id=>{if(!files.has(id))throw Error('未知合成檔案');return files.get(id);}},
  MimeType:{PLAIN_TEXT:'text'},Utilities:{formatDate:(_d,_t,format)=>format==='yyyy-MM'?'2026-10':'2026-11-10'},
  LockService:{getScriptLock:()=>({waitLock:()=>{assert.equal(held,false);held=true;},releaseLock:()=>{assert.ok(held);held=false;}})}});
 const gas=fs.readFileSync(require.resolve('../../gas/Code.gs'),'utf8');
 vm.runInContext(gas.slice(gas.indexOf('// Auth ownership candidate.')),context);
 vm.runInContext(fs.readFileSync(require.resolve('../../gas/TradeinPerformance.gs'),'utf8'),context);
 function setConfig(name,value){configs.set(name,file('SYNTHETIC_CONFIG_'+name,name,JSON.stringify(value)));}
 function setMonthlyRoster(month,people,patch={}){
  setConfig('north12b-tradein-monthly-roster-'+month+'.json',{schema_version:'tradein-monthly-roster/v1',month,review_status:'verified',rule_id:Core.RULE_ID,source_sha256:'d'.repeat(64),people:people.map(p=>({...p,effective_from:p.effective_from||'2026-01-01',effective_to:p.effective_to===undefined?null:p.effective_to})),...patch});
 }
 function configure(source,patch={}){
  setConfig('north12b-tradein-reference-'+source.source_sha256+'.json',{...Ref.reference(source),counting_review_status:'verified',counting_rule_id:Core.RULE_ID,counting_policy:'monthly-reset-no-cancellations/v1',...patch});
 }
 const people=options.monthlyRoster||[employee('12345'),employee('12346','店長'),employee('12347','代理店長','杭州南'),employee('12348','資深業務代表','三創')];
 setMonthlyRoster('2026-10',people);setMonthlyRoster('2026-11',people);
 function dispatch(payload){
  try{
   const method={tradein_performance_read:'tradeinPerformanceRead',tradein_performance_preview:'tradeinPerformancePreview',tradein_performance_publish:'tradeinPerformancePublish',tradein_performance_rollback:'tradeinPerformanceRollback'}[payload.action];
   if(!method)throw Error('未允許的合成API');const result=context[method](payload);return {status:'ok',...result};
  }catch(error){return {status:'error',message:error.message};}
 }
 return {a:context,files,configs,writes,folder,accessRows,configure,setMonthlyRoster,setConfig,dispatch,held:()=>held,operator:OPERATOR,device:DEVICE,secret:fakeSecret};
}
module.exports={createRuntime,employee,csv,parsed,hash,OPERATOR,DEVICE};
