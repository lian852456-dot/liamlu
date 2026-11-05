const {test}=require('node:test'),assert=require('node:assert/strict');
function fixture(){return {sources:[{file:'SYNTHETIC.xlsx',sheet:'價格設定',date:'2026-11-01',validThrough:'2026-11-14',sha256:'a'.repeat(64)}],devices:[300,700,500,700,0,null].map((price,i)=>({id:'synthetic-'+i,brand:'合成品牌',category:'手機',model:'合成機 '+i,capacity:'128G',sourceFile:'SYNTHETIC.xlsx',variants:[{rawModel:'合成機 '+i+' 黑',items:[{vendor:'dianzi',grade:'A',price,row:i+2,part:'SYNTH-'+i},{vendor:'fdi',grade:'A',price:price===null?null:price+100,row:i+20,part:'SYNTH-F'+i}]}]}))};}
test('TOP3 uses one vendor/grade, preserves ties, rows and validity, and never treats zero as a price',async()=>{
 const P=await import('../tradein-price-top3.mjs'),raw=fixture(),catalog=P.parsePriceSource(JSON.stringify({recycle:raw}),{fileName:'SYNTHETIC.html',sha256:'b'.repeat(64)}),before=JSON.stringify(catalog);
 const r=P.buildPriceTop3(catalog,{vendor:'dianzi',grade:'A',category:'手機',asOf:'2026-11-05'});
 assert.deepEqual(r.rows.map(r=>[r.model,r.price,r.rank]),[['合成機 1',700,1],['合成機 3',700,1],['合成機 2',500,3]]);assert.equal(r.excluded.pending,1);assert.equal(r.excluded.missing,1);assert.deepEqual(r.rows[0].sourceRows,[3]);assert.equal(r.rows[0].validThrough,'2026-11-14');assert.equal(JSON.stringify(catalog),before);
 const f=P.buildPriceTop3(catalog,{vendor:'fdi',grade:'A',category:'手機',asOf:'2026-11-05'});assert.equal(f.rows[0].price,800);assert.ok(P.priceTop3Text(f).join('\n').includes('不代表同機款跨廠價差'));
});
test('expired, variant prices, missing grade and Mac/S do not become false price advantages',async()=>{
 const P=await import('../tradein-price-top3.mjs'),raw=fixture();raw.devices[0].variants.push({...raw.devices[0].variants[0],items:[{vendor:'dianzi',grade:'A',price:400,row:42,part:'OTHER'}]});const c=P.parsePriceSource(JSON.stringify(raw));
 const opts={vendor:'dianzi',grade:'A',category:'手機',asOf:'2026-11-05'};assert.equal(P.buildPriceTop3(c,opts).excluded.variant,1);assert.equal(P.buildPriceTop3(c,{...opts,asOf:'2026-11-15'}).rows.length,0);assert.equal(P.buildPriceTop3(c,{...opts,grade:'C'}).rows.length,0);assert.equal(P.buildPriceTop3(c,{...opts,category:'Mac',vendor:'fdi',grade:'S'}).rows.length,0);
 assert.throws(()=>P.buildPriceTop3(c,{...opts,asOf:'2026-02-30'}));
});
test('HTML import extracts only one inert DATA JSON and rejects source mismatches',async()=>{
 const P=await import('../tradein-price-top3.mjs'),raw=fixture(),json=JSON.stringify({recycle:raw}),html='<html><img src="https://must-not-fetch.invalid/x"><script>throw Error("must not execute")</script><script id="DATA" type="application/json">'+json+'</script></html>';
 assert.equal(P.parsePriceSource(html).devices.length,6);assert.throws(()=>P.parsePriceSource(html+'<script id="DATA" type="application/json">'+json+'</script>'));
 raw.devices[0].sourceFile='UNKNOWN.xlsx';assert.throws(()=>P.parsePriceSource(JSON.stringify(raw)),/未對應/);
});
