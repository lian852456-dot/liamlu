(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.ThreecPriceTransport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const ENCODING='shopping-columns/v1';
 // Encode only a public projection. Shared column names replace repeated keys;
 // values, row order and source identities stay exact, including zero/missing.
 function encode(response){
  const snapshot=response&&response.snapshot;
  if(!snapshot||snapshot.kind!=='shopping')return response;
  const tables=[],known=new Map();
  const rows=snapshot.rows.map(row=>{
   const names=Object.keys(row.project_prices),key=JSON.stringify(names);
   let index=known.get(key);if(index===undefined){index=tables.length;tables.push(names);known.set(key,index);}
   return [row.source_sheet,row.brand,row.code,row.model,row.colorless_model,row.retail_price,index,names.map(name=>row.project_prices[name])];
  });
  return Object.assign({},response,{priceEncoding:ENCODING,priceColumns:tables,snapshot:Object.assign({},snapshot,{rows})});
 }
 function decode(response){
  if(!response||response.priceEncoding==null)return response;
  const snapshot=response.snapshot,tables=response.priceColumns;
  if(response.priceEncoding!==ENCODING||!snapshot||snapshot.kind!=='shopping'||!Array.isArray(snapshot.rows)||snapshot.rows.length!==snapshot.row_count||!Array.isArray(tables))throw new Error('正式價格傳輸格式不符');
  for(const names of tables){if(!Array.isArray(names)||names.length>120||names.some(name=>typeof name!=='string')||new Set(names).size!==names.length)throw new Error('正式價格欄位格式不符');}
  const rows=snapshot.rows.map(row=>{
   if(!Array.isArray(row)||row.length!==8||row.slice(0,6).some(value=>typeof value!=='string')||!Number.isSafeInteger(row[6])||!tables[row[6]]||!Array.isArray(row[7])||row[7].length!==tables[row[6]].length||row[7].some(value=>typeof value!=='string'))throw new Error('正式價格列格式不符');
   return {source_sheet:row[0],brand:row[1],code:row[2],model:row[3],colorless_model:row[4],retail_price:row[5],project_prices:Object.fromEntries(tables[row[6]].map((name,index)=>[name,row[7][index]]))};
  });
  const result=Object.assign({},response,{snapshot:Object.assign({},snapshot,{rows})});delete result.priceEncoding;delete result.priceColumns;return result;
 }
 return Object.freeze({ENCODING,encode,decode});
});
