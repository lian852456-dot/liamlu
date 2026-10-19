'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto'),path=require('node:path');
const source=fs.readFileSync(process.env.SHARING_PUBLIC_CODE_PATH||path.join(__dirname,'../../gas/Code.gs'),'utf8');
const STORES=['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','三創','六張犁'];
function fixture({enabled=true,owner=true,upload=false,at='2026-10-19T08:00:00Z'}={}){
  let clock=Date.parse(at),held=false,uuid=0,writes=0;const files=new Map();
  class Clock extends Date{constructor(...a){super(...(a.length?a:[clock]));}static now(){return clock;}}
  const ctx=vm.createContext({Date:Clock,PropertiesService:{getScriptProperties:()=>({getProperty:()=>null})},Utilities:{getUuid:()=>`SYNTHETIC_SERVER_CASE_${++uuid}`},ContentService:{MimeType:{JSON:'application/json'},createTextOutput:text=>({text,setMimeType(){return this;}})},console});
  vm.runInContext(source.replace(/const PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ = (?:false|true);/,`const PRIVATE_DASHBOARD_GAS_AUTH_RELEASE_ENABLED_ = ${enabled};`).replace(/const PRIVATE_DASHBOARD_GAS_PASSWORD_ENABLED_ = (?:false|true);/,`const PRIVATE_DASHBOARD_GAS_PASSWORD_ENABLED_ = ${enabled};`),ctx);
  ctx.TradeinPerformanceCore=undefined;ctx.MimeType={PLAIN_TEXT:'text/plain'};
  ctx.privateDashboardAuthOwnerConfig_=()=>({owner:'SYNTHETIC_OWNER',current:owner?'SYNTHETIC_OWNER':'SYNTHETIC_PEER'});
  ctx.reportUploadIsUploadDeployment_=()=>upload;
  ctx.privateDashboardRosterTransaction_=run=>{assert.equal(held,false);held=true;try{return run();}finally{held=false;}};
  ctx.privateDashboardGasAuthDigest_=value=>crypto.createHash('sha256').update(value).digest('hex');
  const file=name=>({getBlob:()=>{assert.ok(held);return {getDataAsString:()=>files.get(name)};},setContent:body=>{assert.ok(held);writes++;files.set(name,body);}});
  ctx.tradeinPerformanceFile_=name=>{assert.ok(held);return files.has(name)?file(name):null;};
  ctx.tradeinPerformanceFolder_=()=>({createFile:(name,body)=>{assert.ok(held);assert.ok(!files.has(name));writes++;files.set(name,body);}});
  const invoke=p=>JSON.parse(ctx.privateDashboardGasBMaybePost_({postData:{type:'text/plain;charset=utf-8',contents:JSON.stringify(p)}})?.text||'null');
  const draft=(extra={})=>({action:'tradein_sharing_public_create',requestId:'SYNTHETIC_REQUEST_ID_'+(++uuid),submittedAt:clock,store:'永吉',author:'合成自填姓名',consent:true,type:'成功成交',scenario:'合成案例，不含真實個資',approach:'合成話術',outcome:'合成心得',image:'',...extra});
  const list=(start='2026-10-01',end='2026-10-31')=>invoke({action:'tradein_sharing_public_list',start,end});
  const detail=(row,extra={})=>invoke({action:'tradein_sharing_public_detail',month:row.month,id:row.id,...extra});
  const state=(month='2026-10')=>JSON.parse(files.get('north12b-tradein-sharing-'+month+'.json')||'{"cases":[]}');
  const seed=(cases,month='2026-10')=>files.set('north12b-tradein-sharing-'+month+'.json',JSON.stringify({schema:'tradein-sharing/v1',month,revision:1,cases}));
  return {ctx,invoke,draft,list,detail,state,seed,files,time:()=>clock,setTime:value=>clock=Date.parse(value),writes:()=>writes,held:()=>held};
}

module.exports={fixture};
