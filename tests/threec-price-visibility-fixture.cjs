'use strict';
// Synthetic screenshot-shaped prices; never a formal snapshot.
const iphone='5G_iPhone_XH(36)-新申裝/續約／1399H';
const general='5G_XH(24)-新申裝/續約／999H';
const missing='5G_XH(60)-新申裝/續約／999H_加碼版';
const enterprise='(企客_5G)榮耀之星999H(24)_iPhone';
const row=(model,prices)=>({source_sheet:'本機合成示範',brand:'APPLE',model,colorless_model:model,retail_price:null,project_prices:prices});
const shopping={status:'ok',changesDeferred:true,snapshot:{kind:'shopping',row_count:4,source_version_date:'2026-10-07',snapshot_hash:'synthetic-visibility-only',rows:[
  row('iPhone 18 Pro 2TB',{[iphone]:70300,[general]:null,[missing]:' ',[enterprise]:0}),
  row('iPhone 18 Pro Max 256GB',{[iphone]:'31,300',[general]:'',[missing]:undefined,[enterprise]:null}),
  {...row('Galaxy 示範機 256GB',{[general]:0,[missing]:'未列此條件'}),brand:'Samsung'},
  row('全缺價機 512GB',{[iphone]:null,[general]:' ',[missing]:'', [enterprise]:null}),
]}};
const tradein={status:'ok',changesDeferred:true,snapshot:{kind:'tradein',row_count:0,snapshot_hash:'synthetic-empty-tradein',rows:[]}};
module.exports={iphone,general,missing,enterprise,row,shopping,tradein};
