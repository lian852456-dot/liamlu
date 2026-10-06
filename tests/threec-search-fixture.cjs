'use strict';
// Synthetic catalog only. Price patterns intentionally cover zero, missing and absent conditions.
const plans=Array.from({length:16},(_,i)=>`一般5G${i%2?'_VIP':''}_XH(${24+i})-續約／${i%2?'1399':'999'}H`);
const enterprise=['(企客_5G)榮耀之星999H(24)_iPhone','(企客_5G)榮耀之星1399H(30)_iPhone','(企客_5G)榮耀之星999H(48)_Android'];
function shopping({count=44,version=1}={}){
 const rows=Array.from({length:count},(_,i)=>{
  const name=version===1?(i%2?'中文示範機 ':'iPhone 合成機 '):'新版目錄機 ';
  const model=name+i+' '+(i%3?'256':'512')+'GB';
  return {source_sheet:'合成手機',brand:i%2?'示範牌':'APPLE',code:'SYN-'+version+'-'+i,model:model+'(黑)',colorless_model:model,retail_price:String(version===1?29900:39900),project_prices:Object.fromEntries([...plans,...enterprise].map((p,j)=>[p,j===0?'0':j===1?'':j>=16&&((i%2===0&&j===18)||(i%2===1&&j!==18))?'':String(version*10000+i*100+j)]).filter((_,j)=>i%7!==0||j!==2))};
 });
 rows.push({...rows[0],model:rows[0].colorless_model+'(白)',code:'SYN-'+version+'-WHITE'});
 return {status:'ok',snapshot:{schema_version:'threec-normalized-snapshot/v1',kind:'shopping',source_version_date:version===1?'2026-10-01':'2026-10-02',snapshot_hash:'synthetic-search-'+version,source_file_sha256:String(version).repeat(64),published_at:'synthetic',row_count:rows.length,rows},changeSet:null,changesDeferred:true};
}
function tradein(){return {status:'ok',snapshot:{kind:'tradein',row_count:1,source_version_date:'2026-10-01',snapshot_hash:'synthetic-tradein',rows:[{source_sheet:'合成回收',brand:'示範牌',model:'示範回收 256GB',quotes:{'點子行動':{S:'0',A:'1000',B:'',C:''}}}]},changeSet:null,changesDeferred:true};}
module.exports={shopping,tradein,plans,enterprise};
