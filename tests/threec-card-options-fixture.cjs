'use strict';
// Synthetic prices and identities only; shaped like the public query contract.
const rents=['599','799','999','1199','1399','1599','1899','2699'],terms=['24','30','48'];
const consumer=rents.flatMap(rent=>terms.map(term=>`4G_XH(${term})-新申裝/續約／${rent}H`));
const consumerLast='5G手機_XH(48)-新申裝/續約／999H_加碼版';
consumer.push(consumerLast);
const earlyEnterprise=['599','799','999','1399'].flatMap(rent=>terms.map(term=>`(企客_5G)榮耀之星${rent}H(${term})`));
const force=(term,suffix='')=>`企客5G員工眷5力全開_XH(${term})-新申裝/續約／(企客_5G)5力全開999H(${term})${suffix}`;
const enterprise=[...earlyEnterprise,...earlyEnterprise.map(key=>key+'_iPhone'),...terms.flatMap(term=>[force(term),force(term,'_iPhone_新申裝'),force(term,'_iPhone_續約')])];
const missing='5G手機_XH(60)-新申裝/續約／2699H_全缺價';
function row(brand,model,capacity){
  const prices=Object.fromEntries(consumer.map((key,i)=>[key,i===0?0:100+i]));
  Object.assign(prices,Object.fromEntries(enterprise.map(key=>[key,''])));
  for(const key of earlyEnterprise)prices[key]=brand==='APPLE'?'':500;
  for(const key of earlyEnterprise)prices[key+'_iPhone']=brand==='APPLE'?600:'';
  for(const term of terms){
    prices[force(term)]=brand==='Samsung'?700:'';
    prices[force(term,'_iPhone_新申裝')]=brand==='APPLE'?0:'';
    prices[force(term,'_iPhone_續約')]=brand==='APPLE'?1000:'';
  }
  prices[consumerLast]=brand==='APPLE'?0:900;
  prices[missing]=null;
  return {source_sheet:'合成卡片驗收',brand,model:model+' '+capacity,colorless_model:model+' '+capacity,code:brand+'-'+capacity,retail_price:'20000',project_prices:prices};
}
const shopping={status:'ok',changesDeferred:true,snapshot:{kind:'shopping',source_version_date:'2026-10-12',snapshot_hash:'synthetic-full-card-options',row_count:3,rows:[row('APPLE','iPhone 合成機','256GB'),row('APPLE','iPhone 合成機','512GB'),row('Samsung','Galaxy 合成機','256GB')]}};
const tradein={status:'ok',changesDeferred:true,snapshot:{kind:'tradein',snapshot_hash:'synthetic-empty-tradein',row_count:0,rows:[]}};
module.exports={consumer,consumerLast,enterprise,force,missing,shopping,tradein};
