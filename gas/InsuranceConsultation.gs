/* Shared source and five-field rules; no daily sales or shift inputs. */
var InsuranceConsultation=(function(){
 'use strict';
 const fields=[['advisor','請益對象'],['icebreaker','破冰方式'],['tools','運用工具'],['approach','建議話術／作法'],['followup','執行提醒／待確認']];
 const states={required:'今日需回覆',completed:'已完成',exempt:'達標免回覆',pending:'資料待核'};
 const store=v=>String(v||'').replace(/\s+/g,'').replace(/^台灣大哥大數位生活台北|^台灣大哥大台北|^台北/,'');
 function day(v){return typeof v==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;}
 function parse(v){v=v&&typeof v==='object'&&!Array.isArray(v)?v:{};return Object.fromEntries(fields.map(([k])=>[k,typeof v[k]==='string'?v[k].trim():'']));}
 function missing(v){const a=parse(v);return fields.filter(([k])=>!a[k]||a[k].length>2000);}
 function rateText(v){return typeof v==='number'&&Number.isFinite(v)?(v<.5&&(v*100).toFixed(2)==='50.00'?'低於 50%':(v*100).toFixed(2)+'%'):'待核';}
 function classify(p,dataDate){
  if(!p||p.identityStatus!=='verified'||p.status!=='verified'||typeof p.rate!=='number'||!Number.isFinite(p.rate)||p.rate<0||p.rate>1||
    !day(dataDate)||!day(p.publicationDate)||p.publicationDate>dataDate||p.publicationDate.slice(0,7)!==dataDate.slice(0,7)||!day(p.periodStart)||!p.periodStart.endsWith('-01')||!day(p.cutoff)||p.periodStart.slice(0,7)!==dataDate.slice(0,7)||p.cutoff.slice(0,7)!==dataDate.slice(0,7)||p.cutoff<p.periodStart||p.cutoff>p.publicationDate||!p.periodEvidence?.cell||!p.periodEvidence?.text)return 'pending';
  return p.rate<.5?'required':'exempt';
 }
 function source(data,dataDate){
  const m=data?.meta||{},s=m.insuranceConsultationSource;
  if(!s||s.schema!=='insurance-consultation-source/v2'||s.sourceFile!==m.sourceFile||s.sourceSha256!==m.sourceSha256||s.publicationDate!==m.reportDate||!/^[a-f0-9]{64}$/.test(s.version||'')||!/^[a-f0-9]{64}$/.test(s.sourceSha256||''))return [];
  const out=[];
  for(const kind of ['store','personal']){
   const part=kind==='store'?s.stores:s.personal, sheet='搭售達成率 (手機保險)'+(kind==='personal'?' _個人':'');
   if(!part||part.sheet!==sheet||part.column!==(kind==='store'?'H':'M'))continue;
   for(const row of Array.isArray(part.rows)?part.rows:[]){
    if(!row||typeof row!=='object')continue;
    const id=String(kind==='store'?row.code||'':row.subjectId||'');if(!id)continue;
    const names=(Array.isArray(data.stores)?data.stores:[]).filter(x=>x&&x.code===(kind==='store'?id:row.storeCode)&&store(x.name)===store(row.store));
    const evidence=part.periodEvidence;
    const p={status:part.status,identityStatus:kind==='personal'?row.identityStatus:'verified',rate:row.rate,publicationDate:s.publicationDate,periodStart:part.periodStart,cutoff:part.cutoff,periodEvidence:evidence,
      sourceFile:s.sourceFile,sourceSha256:s.sourceSha256,sourceVersion:s.version,sheet,column:part.column};
    if(names.length!==1||evidence?.sheet!==sheet)p.identityStatus='pending';
    out.push({kind,id,store:store(row.store),label:kind==='store'?row.store:(/[*＊]/.test(row.maskedName||'')?row.maskedName:'同仁'),progress:p,requirement:classify(p,dataDate)});
   }
  }
  // Ambiguous IDs must not become eligible tasks, even if one row is low.
  return out.map(r=>out.filter(x=>x.kind===r.kind&&x.id===r.id).length===1?r:{...r,requirement:'pending',progress:{...r.progress,identityStatus:'pending',rate:null}});
 }
 return {fields,states,store,day,parse,missing,rateText,classify,source};
})();
if(typeof module==='object'&&module.exports)module.exports=InsuranceConsultation;
