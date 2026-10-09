'use strict';
// Invented test identities. Never use this fixture to generate production maps.
const C=require('../tradein-performance-core.js');
const IDS=Object.freeze({'12345':'ZX00001','12344':'ZX00002','12346':'ZX00003','12347':'ZX00004','12348':'ZX00008','54321':'ZX00005','0A1B2':'ZX00006','0A1B3':'ZX00007'});
function reference(source){
 const grouped=new Map();
 source.records.forEach(r=>{if(!grouped.has(r.source_employee_id))grouped.set(r.source_employee_id,[]);grouped.get(r.source_employee_id).push({trade_date:r.trade_date,store_code:r.store_code});});
 return {schema_version:'tradein-private-reference/v1',source_sha256:source.source_sha256,source_start:source.source_start,source_end:source.source_end,
  stores:C.STORES.map(([store_code,store])=>({store_code,store})),employees:[...grouped].map(([source_employee_id,observations])=>({source_employee_id,employee_key:IDS[source_employee_id],observations}))};
}
module.exports={IDS,reference};
