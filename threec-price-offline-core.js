(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./threec-price-transport.js'):root.ThreecPriceTransport);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ThreecPriceOfflineCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Transport){
  'use strict';
  const VERSION='price-offline/v2';
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.prototype.hasOwnProperty.call(value,key)).map(key=>[key,value[key]]));
const metaKeys=['schema_version','kind','source_version_date','source_file_sha256','source_row_count','row_count','catalog_row_count','excluded_no_price_count','query_model_count','quote_conflict_count','published_at','snapshot_hash'];
const text=(value,label)=>{if(typeof value!=='string'||value.length>2000)throw Error('Invalid '+label);return value;};
const price=(value,label)=>{if(value!==null&&(typeof value!=='string'||! /^(?:\d+(?:\.\d+)?|\d{1,3}(?:,\d{3})+(?:\.\d+)?)?$/.test(value)))throw Error('Invalid price: '+label);return value;};
function publicPriceResponse(raw,kind){
  if(raw?.status!=='ok')throw Error(kind+': formal read unsuccessful');
  const response=Transport.decode(raw),s=response.snapshot,check=response.updateCheck;
  if(!s||s.kind!==kind||s.schema_version!=='threec-normalized-snapshot/v1'||!Array.isArray(s.rows)||!s.rows.length||s.rows.length!==s.row_count)throw Error(kind+': incomplete snapshot');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s.source_version_date)||!Number.isFinite(Date.parse(s.source_version_date+'T00:00:00Z'))||!Number.isFinite(Date.parse(s.published_at))||! /^[a-f0-9]{64}$/.test(s.source_file_sha256)||! /^[a-f0-9]{32,64}$/.test(s.snapshot_hash))throw Error(kind+': invalid formal source metadata');
  if(new Date(s.source_version_date+'T00:00:00Z').toISOString().slice(0,10)!==s.source_version_date)throw Error(kind+': invalid source date');
  if(check&&(check.status==='blocked'||check.blocked||check.ok===false||check.matches===false||check.snapshot_hash&&check.snapshot_hash!==s.snapshot_hash||check.source_version_date&&check.source_version_date!==s.source_version_date||check.source_file_sha256&&check.source_file_sha256!==s.source_file_sha256))throw Error(kind+': source version mismatch');
  if(s.quote_conflict_count)throw Error(kind+': quote conflict');
  for(const key of ['source_row_count','row_count','catalog_row_count','excluded_no_price_count','query_model_count','quote_conflict_count'])if(Object.prototype.hasOwnProperty.call(s,key)&&(!Number.isSafeInteger(s[key])||s[key]<0))throw Error(kind+': invalid count '+key);
  if(s.source_row_count<s.row_count||kind==='shopping'&&s.source_row_count!==s.row_count+(s.catalog_row_count||0)+(s.excluded_no_price_count||0))throw Error(kind+': source row reconciliation failed');
  const snapshot=pick(s,metaKeys);
  snapshot.rows=s.rows.map(row=>{
    const result=pick(row,kind==='shopping'?['source_sheet','brand','code','model','colorless_model','retail_price']:['source_sheet','brand','model']);
    for(const key of kind==='shopping'?['source_sheet','brand','code','model','colorless_model']:['source_sheet','brand','model'])text(result[key],key);
    if(kind==='shopping'){
      text(result.retail_price,'retail price');
      price(result.retail_price,'retail');
      if(!row.project_prices||Array.isArray(row.project_prices)||Object.keys(row.project_prices).length>120)throw Error('Invalid project prices');
      result.project_prices=Object.fromEntries(Object.entries(row.project_prices).map(([key,value])=>[text(key,'plan'),price(text(value,'project price'),key)]));
    }else{
      const providers=['點子行動','FutureDial（FDI）','愛鋒派'];
      if(!row.quotes||providers.slice(0,2).some(p=>!Object.prototype.hasOwnProperty.call(row.quotes,p))||Object.keys(row.quotes).some(p=>!providers.includes(p)))throw Error('Incomplete official providers');
      result.quotes=Object.fromEntries(Object.entries(row.quotes).map(([provider,values])=>{
        const grades=provider==='愛鋒派'?['S','A','B','C','未分級']:['S','A','B','C'];
        if(!values||Object.keys(values).sort().join('|')!==grades.slice().sort().join('|'))throw Error('Incomplete official grades');
        return [provider,Object.fromEntries(grades.map(grade=>[grade,price(values[grade],provider+grade)]))];
      }));
    }
    return result;
  });
  return Transport.encode({status:'ok',snapshot,changesDeferred:true});
}
const json=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function projectResponses(input){return Object.fromEntries(['shopping','tradein'].map(kind=>[kind,publicPriceResponse(input[kind],kind)]));}
function assemble(template,input,options){
  if(typeof template!=='string'||!options||!Number.isFinite(Date.parse(options.generatedAt))||!/^[a-f0-9]{64}$/.test(options.payloadSha256))throw Error('Invalid offline export metadata');
  const responses=projectResponses(input),payloadHash=options.payloadSha256;
  const manifest={version:VERSION,generatedAt:options.generatedAt,sourceCommit:String(options.sourceCommit||''),payloadSha256:payloadHash,sources:Object.fromEntries(Object.entries(responses).map(([kind,response])=>[kind,pick(response.snapshot,metaKeys)]))};
  const values={SHOPPING_DATE:esc(responses.shopping.snapshot.source_version_date),TRADEIN_DATE:esc(responses.tradein.snapshot.source_version_date),GENERATED_AT:esc(manifest.generatedAt),SOURCE_COMMIT:esc(manifest.sourceCommit),PAYLOAD_SHORT:payloadHash.slice(0,12),PAYLOAD_SHA256:payloadHash,DATA:json(responses),MANIFEST:json(manifest)};
  for(const key of Object.keys(values))if(!template.includes('@@PRICE_OFFLINE_'+key+'@@'))throw Error('Incomplete offline template '+key);
  const html=template.replace(/@@PRICE_OFFLINE_([A-Z0-9_]+)@@/g,(_,key)=>{if(!Object.prototype.hasOwnProperty.call(values,key))throw Error('Unknown offline template token');return values[key];});
  if(/\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|\.submit\s*\(|script\.google|https?:\/\/|<iframe|<form|<script[^>]+src=|<link[^>]+href=)/i.test(html))throw Error('Unexpected external dependency or storage/write path in portable HTML');
  return {html,manifest};
}
return Object.freeze({VERSION,publicPriceResponse,projectResponses,assemble});
});
