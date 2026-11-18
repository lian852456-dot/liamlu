/* Store-only monthly insurance progress. Daily pairs are deliberately not inputs. */
var InsuranceConsultation = (function(){
  'use strict';
  const fields=[['advisor','請益對象'],['icebreaker','破冰方式'],['tools','運用工具'],['approach','建議話術／作法'],['followup','執行提醒／待確認']];
  const sheet='搭售達成率 (手機保險)';
  function object(raw){try {const v=typeof raw==='string'?JSON.parse(raw):raw;return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch(_){return {};}}
  function day(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;}
  function canonicalStore(v){return String(v||'').replace(/\s+/g,'').replace(/^台灣大哥大數位生活台北|^台灣大哥大台北|^台北/,'');}
  function pending(reason,details){return Object.assign({status:'pending',reason:reason,rate:null},details||{});}
  function resolve(data,store,date){
    const meta=data&&data.meta||{},s=meta.storeInsuranceProgress;
    if(!s||s.schema!=='store-insurance-progress/v1')return pending('尚未取得正式門市保險進度');
    const source={sourceFile:s.sourceFile,sourceSha256:s.sourceSha256,version:s.version,publicationDate:s.publicationDate,
      sheet:s.sheet,column:s.column,periodStart:s.periodStart||null,cutoff:s.cutoff||null,periodEvidence:s.periodEvidence||null,store:store,reportDate:date};
    if(s.sourceFile!==meta.sourceFile||s.sourceSha256!==meta.sourceSha256||s.publicationDate!==meta.reportDate||
      !/^[a-f0-9]{64}$/.test(s.sourceSha256||'')||!/^[a-f0-9]{64}$/.test(s.version||'')||s.sheet!==sheet||s.column!=='H')return pending('來源批次不一致');
    const rows=(Array.isArray(s.rows)?s.rows:[]).filter(r=>r&&canonicalStore(r.store)===canonicalStore(store));
    if(rows.length!==1)return pending('門市來源缺漏或重複',source);
    const row=rows[0],rate=row.rate;
    const roster=(Array.isArray(data.stores)?data.stores:[]).filter(r=>r&&r.code===row.code&&canonicalStore(r.name)===canonicalStore(store));
    if(roster.length!==1)return pending('門市代碼未核對',source);
    if(typeof rate!=='number'||!Number.isFinite(rate)||rate<0||rate>1)return pending('門市搭售率未提供或不適用',source);
    source.rate=rate;source.code=row.code;
    if(s.status!=='verified'||!day(s.periodStart)||!day(s.cutoff)||!day(date)||!day(s.publicationDate)||
      !s.periodStart.endsWith('-01')||s.periodStart.slice(0,7)!==s.cutoff.slice(0,7)||s.cutoff<s.periodStart||s.cutoff>s.publicationDate||
      !s.periodEvidence||s.periodEvidence.sheet!==sheet||!s.periodEvidence.cell||!s.periodEvidence.text)return pending('店級統計期間待核',source);
    if(s.cutoff.slice(0,7)!==date.slice(0,7)||s.publicationDate>date||s.cutoff>date)return pending('來源月份或截止不適用本次回報',source);
    if(s.publicationDate<date)return pending('目前僅有較早發布批次，日期明示供參考',source);
    return Object.assign({status:'verified',reason:''},source);
  }
  function saved(record){const v=object(record&&record.insurance_consult_json);return v.schema==='insurance-consult/v1'&&v.progress?v:null;}
  function required(record){const p=saved(record)?.progress;return p?.status==='verified'&&typeof p.rate==='number'&&p.rate>=0&&p.rate<0.5;}
  function parse(raw){const v=object(raw);const values=v.schema==='insurance-consult/v1'?object(v.values):v;return Object.fromEntries(fields.map(([k])=>[k,typeof values[k]==='string'?values[k].trim():'']));}
  function serialize(progress,values){const v={schema:'insurance-consult/v1',progress:progress||pending('尚未取得正式門市保險進度'),values:{}};if(required({insurance_consult_json:v}))v.values=parse(values);return JSON.stringify(v);}
  function assess(record){const applies=required(record),values=parse(record?.insurance_consult_json);return {applies,values,missing:applies?fields.filter(([k])=>!values[k]):[]};}
  function label(p){if(!p)return '門市保險進度待核；未啟用必填。';const value=typeof p.rate==='number'?(p.rate<0.5&&(p.rate*100).toFixed(2)==='50.00'?'低於 50%':(p.rate*100).toFixed(2)+'%'):'未提供';return '門市保險進度 '+value+'｜統計截止 '+(p.cutoff||'待核')+'｜發布 '+(p.publicationDate||'未取得')+(p.status==='verified'?'':'｜'+p.reason+'；未啟用必填。');}
  return {fields,resolve,pending,saved,required,parse,serialize,assess,label};
})();
if(typeof module==='object'&&module.exports)module.exports=InsuranceConsultation;
