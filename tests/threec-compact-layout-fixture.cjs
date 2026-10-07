'use strict';
// Dense synthetic matrix, including larger amounts, zero and long qualifications.
const p=(rent,term,version='')=>`5G_XH(${term})-新申裝/續約／${rent}H${version?'_'+version:''}`;
const consumer=[];for(const rent of [999,1399])for(const term of [24,30,36,48])for(const version of ['','VIP'])consumer.push(p(rent,term,version));
const enterprise='企客特殊專案(2)／(企客_5G)榮耀之星999H(24)_iPhone';
const enterpriseLong='企業員工與眷屬專案／月租1399元(48)_限指定iPhone機型與員工資格_VIP';
const rows=[];for(let i=0;i<24;i++)for(const color of ['黑色','白色','藍色']){
 const model=`iPhone 合成機 ${i} 256GB`;
 rows.push({source_sheet:'合成密集版面',brand:'APPLE',model:model+' '+color,colorless_model:model,retail_price:79900,project_prices:{...Object.fromEntries(consumer.map((k,j)=>[k,j===0?199999:j===3?0:70300])),[enterprise]:0,[enterpriseLong]:70300}});
}
const shopping={status:'ok',changesDeferred:true,snapshot:{kind:'shopping',source_version_date:'2026-10-07',snapshot_hash:'synthetic-compact-layout',rows,row_count:rows.length}};
const tradein={status:'ok',changesDeferred:true,snapshot:{kind:'tradein',rows:[],row_count:0}};
module.exports={shopping,tradein,consumer,enterprise,enterpriseLong};
