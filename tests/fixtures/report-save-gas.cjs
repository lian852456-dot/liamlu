'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const gas=fs.readFileSync(process.env.REPORT_SAVE_GAS_SOURCE || require('node:path').join(__dirname,'../../gas/Code.gs'),'utf8');
class Sheet {
  constructor(){this.rows=[];this.writes=0;}
  getLastRow(){return this.rows.length;} getLastColumn(){return this.rows.reduce((n,r)=>Math.max(n,r.length),0);}
  appendRow(row){this.rows.push([...row]);this.writes++;} setFrozenRows(){}
  getDataRange(){return this.getRange(1,1,Math.max(1,this.getLastRow()),Math.max(1,this.getLastColumn()));}
  getRange(row,col,n=1,w=1){
    const get=()=>Array.from({length:n},(_,i)=>Array.from({length:w},(_,j)=>this.rows[row-1+i]?.[col-1+j]??''));
    return {getValues:get,getDisplayValues:()=>get().map(r=>r.map(v=>String(v))),setNumberFormat(){},setValue:v=>this.getRange(row,col).setValues([[v]]),setValues:values=>{values.forEach((r,i)=>{this.rows[row-1+i]||=[];r.forEach((v,j)=>{this.rows[row-1+i][col-1+j]=v;});});this.writes++;}};
  }
}
function setup(){
 const sheets=new Map();let held=false,locks=0;
 const ss={getSheetByName:n=>sheets.get(n)||null,insertSheet:n=>{const sh=new Sheet();sheets.set(n,sh);return sh;}};
 const SpreadsheetApp={openById:()=>ss,flush(){}};
 const Utilities={formatDate:d=>d.toISOString().slice(0,10),getUuid:()=>crypto.randomUUID()};
 const LockService={getScriptLock:()=>({waitLock(){assert.equal(held,false);held=true;locks++;},releaseLock(){held=false;}})};
 const api=new Function('SpreadsheetApp','Utilities','LockService','PropertiesService',gas+'\nreturn {reportWritePayload_,personalWritePayload_,reportSaveStatus_,readData,readPersonal,getSheet,getPersonalSheet,writePersonal,writeData,writeReportAwardModels_};')(SpreadsheetApp,Utilities,LockService,{getScriptProperties:()=>({getProperty:()=>''})});
 return {api,sheets,get locks(){return locks;},get held(){return held;}};
}
exports.setup=setup;
