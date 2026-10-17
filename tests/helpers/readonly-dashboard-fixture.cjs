'use strict';
const C=require('../../readonly-dashboard-core.js'),Catalog=require('../../award-model-catalog.js');
function fixture(){
 const keys=['AQ V+D 999 (含)以上','AQ V+D 1399 (含)以上','好速案銷售點數','RT V+D 1399 (含)以上',...Array.from({length:21},(_,i)=>'合成來源指標'+(i+5))];
 const metric=i=>Object.fromEntries(keys.map(key=>[key,{a:i+1,t:10,w:.04,reportRate:(i+1)/10}]));
 const data={meta:{month:'2026-10',snapshotDay:13,monthDays:31,sourceFile:'1014.xlsx',period:'2026/10/01 ~10/13',aggregateOfficialCorrected:1.25},items:keys.map(key=>({key})),aggregateRates:Object.fromEntries(keys.map(key=>[key,1.2])),stores:C.STORES.map((s,i)=>({code:s.id,name:s.name,official:.8+i/10,items:metric(i)})),persons:C.STORES.map((s,i)=>({store:s.id,pname:'合成同仁'+(i+1),role:i%2?'業務代表':'店長',official:1,items:metric(i)}))};
 const base={report_date:'2026-10-13',report_run_date:'2026-10-14',data_as_of_date:'2026-10-13',source_file:'1014.xlsx',processing_run_id:'SYNTHETIC-20261014',aggregate:{overall_kpi:1.25,company_rank:10},stores:[],personal:[]};
 const item=Catalog.definitions('2026-10-13').map((row,i)=>({name:row.sourceName||row.shortName,display_name:row.sourceName||row.shortName,actual:i,target:10,rate:i/10}));
 const awards={...base,phone_items:10,store_rows:10,supervisor:{actual_total:1000,projected:2000},overall:{items:item,award:{actual_total:1000,projected:2000}},stores:C.STORES.map(s=>({store:s.name,items:structuredClone(item),award:{actual_total:100,projected:200}}))};
 const conversion=C.validateConversion({schema:C.SCHEMA,period_start:'2026-10-01',cutoff:'2026-10-11',sha256:'c'.repeat(64),source_name:'SYNTHETIC-1013.xlsx',source_bytes:1,records:C.STORES.flatMap((s,i)=>Array.from({length:11},(_,j)=>({store:s.id,date:'2026-10-'+String(j+1).padStart(2,'0'),aq_n:j===4?0:1,aq_d:j===4?0:10+i,rt_n:1,rt_d:4+i}))),prior:C.STORES.map(s=>({store:s.id,aq_n:5,aq_d:100,rt_n:5,rt_d:20})),prior_period:{start:'2026-09-01',end:'2026-09-11'}});
 const profile={maskedName:'合成主管',store:'酒泉',role:'employee',isTrusted:false};
 return {privateResult:{status:'ok',trustSource:'password-bound',profile,snapshot:{publishedAt:'2026-10-14T10:00:00+08:00',kpiBattle:base,awardsBattle:awards,conversionBattle:conversion}},kpiResult:{status:'ok',trustSource:'password-bound',profile,data}};
}
module.exports={fixture};
