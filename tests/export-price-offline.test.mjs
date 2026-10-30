import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {publicPriceResponse,buildHtml} from '../scripts/export-price-offline.mjs';
const require=createRequire(import.meta.url),Transport=require('../threec-price-transport.js');
function fixture(){
 const meta={schema_version:'threec-normalized-snapshot/v1',source_version_date:'2026-10-21',source_file_sha256:'a'.repeat(64),source_row_count:1,row_count:1,excluded_no_price_count:0,query_model_count:1,quote_conflict_count:0,published_at:'2026-10-21T08:00:00+08:00',snapshot_hash:'b'.repeat(32)};
 return {
  shopping:{status:'ok',snapshot:{...meta,kind:'shopping',rows:[{source_sheet:'合成方案',brand:'APPLE',code:'SYNTHETIC',model:'合成手機 128GB-(白)',colorless_model:'合成手機 128GB',retail_price:'1000',project_prices:{'5G_XH(24)-續約／999H':'0','原表缺價':''}}]}},
  tradein:{status:'ok',snapshot:{...meta,kind:'tradein',rows:[{source_sheet:'合成回收',brand:'Samsung',model:'合成手機 128GB',quotes:{'點子行動':{S:null,A:'1000',B:'800',C:'0'},'FutureDial（FDI）':{S:'1100',A:'900',B:'400',C:null}}}]}}
 };
}
test('only price and source allowlists survive, preserving original zero and missing',()=>{
 const data=fixture();data.shopping.adminToken='SHOULD_NOT_SURVIVE';data.shopping.snapshot.operator_hash='SHOULD_NOT_SURVIVE';data.shopping.snapshot.rows[0].customer='SHOULD_NOT_SURVIVE';
 const s=Transport.decode(publicPriceResponse(data.shopping,'shopping'));
 assert.equal(s.snapshot.rows[0].project_prices['5G_XH(24)-續約／999H'],'0');assert.equal(s.snapshot.rows[0].project_prices['原表缺價'],'');
 assert.ok(!JSON.stringify(s).includes('SHOULD_NOT_SURVIVE'));
 assert.deepEqual(publicPriceResponse(data.tradein,'tradein').snapshot.rows[0].quotes,data.tradein.snapshot.rows[0].quotes);
});
test('bad schema, partial source, conflicting active version and invalid prices fail closed',()=>{
 const mutations=[x=>x.status='error',x=>x.snapshot=null,x=>x.snapshot.row_count++,x=>x.snapshot.source_row_count++,x=>x.snapshot.source_version_date='2026-02-31',x=>x.snapshot.schema_version='wrong',x=>x.snapshot.snapshot_hash='',x=>x.snapshot.rows[0].retail_price=null,x=>x.snapshot.rows[0].project_prices.bad='-1',x=>x.updateCheck={status:'blocked'},x=>x.updateCheck={snapshot_hash:'c'.repeat(32)}];
 for(const mutate of mutations){const x=fixture().shopping;mutate(x);assert.throws(()=>publicPriceResponse(x,'shopping'));}
 for(const mutate of [x=>delete x.snapshot.rows[0].quotes['FutureDial（FDI）'],x=>delete x.snapshot.rows[0].quotes['點子行動'].S,x=>x.snapshot.rows[0].quotes.unknown={A:'100'}]){const x=fixture().tradein;mutate(x);assert.throws(()=>publicPriceResponse(x,'tradein'));}
});
test('self-contained HTML reuses both query panes and has no network, credential or persistence paths',()=>{
 const {html}=buildHtml(fixture(),{generatedAt:'2026-10-27T00:00:00Z',sourceCommit:'test-only'});
 assert.match(html,/id="shoppingPane"/);assert.match(html,/id="tradeinPane"/);assert.match(html,/id="tradeinReset"/);assert.doesNotMatch(html,/id="changeCard"/);
 assert.match(html,/版本日期不等於生效日期；未到適用日請依公司公告/);
 assert.match(html,/connect-src 'none'/);assert.doesNotMatch(html,/https?:\/\/|fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|localStorage|sessionStorage|employeeId|deviceId|adminSecret|script\.google|<iframe|<form/);
 assert.doesNotMatch(html,/@@PRICE_OFFLINE_/);
 assert.doesNotMatch(html,/<(?:script|link)[^>]+(?:src|href)=/);
 const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].filter(m=>!m[1].includes('application/json'));
 for(const [, ,source]of scripts)new vm.Script(source);
});
test('repeat export is deterministic with pinned generation time and payload escapes closing script tags',()=>{
 const data=fixture();data.shopping.snapshot.rows[0].model='</script><img src=x onerror=alert(1)>';
 const options={generatedAt:'2026-10-27T00:00:00Z',sourceCommit:'test-only'},a=buildHtml(data,options),b=buildHtml(data,options);
 assert.equal(a.html,b.html);assert.equal(a.manifest.payloadSha256,b.manifest.payloadSha256);
 const payload=JSON.parse(a.html.match(/id="price-data">([\s\S]*?)<\/script>/)[1]);
 assert.equal(Transport.decode(payload.shopping).snapshot.rows[0].model,data.shopping.snapshot.rows[0].model);
 assert.ok(!a.html.includes('</script><img src=x'));
});
