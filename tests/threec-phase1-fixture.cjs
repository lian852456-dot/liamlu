'use strict';
// Synthetic prices and product names for isolated UI QA; no formal snapshots.
const prefix='5G_XH',p=(rent,term,version='')=>`${prefix}(${term})-新申裝/續約／${rent}H${version?'_'+version:''}`;
const prices={[p(999,24)]:'8,900',[p(999,36)]:'5,900',[p(1399,24)]:'5,900',[p(1399,36)]:'2,900',[p(1399,48)]:'0',[p(1399,48,'加碼版')]:'',[p(999,24,'VIP')]:'7,900',[p(599,24)]:'12,900'};
const row=(model,colourless,extra={})=>({source_sheet:'測試專案表',brand:'Apple',model,colorless_model:colourless,code:'QA',retail_price:'29,900',project_prices:{...prices},...extra});
const rows=[row('iPhone 示範機 256GB 黑色','iPhone 示範機 256GB'),row('iPhone 示範機 256GB 白色','iPhone 示範機 256GB'),row('iPhone 示範機 256GB 藍色','iPhone 示範機 256GB',{project_prices:{...prices,[p(599,24)]:'13,900'}}),row('iPhone 示範機 512GB 黑色','iPhone 示範機 512GB',{retail_price:'34,900',project_prices:{...prices,[p(999,24)]:'12,900'}}),row('Mac 示範機 16G/512GB 星光','Mac 示範機 16G/512GB',{project_prices:{[p(999,24)]:'19,900'}}),row('Galaxy 示範機 256GB','Galaxy 示範機 256GB',{brand:'Samsung',project_prices:{...prices,[p(999,24)]:'4,900'}})];
const shopping={status:'ok',snapshot:{kind:'shopping',source_version_date:'2026-10-01',snapshot_hash:'synthetic-qa-v1',source_file_sha256:'a'.repeat(64),published_at:'2026-10-01T09:00:00Z',row_count:rows.length,rows}};
const tradein={status:'ok',snapshot:{kind:'tradein',source_version_date:'2026-10-01',snapshot_hash:'synthetic-tradein-v1',source_file_sha256:'b'.repeat(64),rows:[{source_sheet:'示範回收',brand:'Samsung',model:'Galaxy 示範機 256GB',quotes:{'點子行動':{S:'8,000',A:'6,000',B:'',C:0},'FutureDial（FDI）':{S:'7,800',A:'5,900',B:'3,000',C:null}}}]}};
module.exports={shopping,tradein,p};
