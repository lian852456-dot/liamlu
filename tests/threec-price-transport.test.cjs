'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const T=require('../threec-price-transport.js');
function fixture(){return {status:'ok',snapshot:{kind:'shopping',row_count:2,source_version_date:'2026-10-01',snapshot_hash:'same-hash',rows:[0,1].map(i=>({source_sheet:'企客／手機',brand:'APPLE',code:'C'+i,model:'iPhone 銀'+i,colorless_model:'iPhone',retail_price:'0',project_prices:Object.fromEntries([['榮耀之星999H(24)_iPhone','26300'],['空白',''],['小數','00.50'],['__proto__','0']])}))},changeSet:null,changesDeferred:true,updateCheck:null};}
test('columnar roundtrip keeps row order, all names, zero, missing and exact price strings',()=>{
 const before=fixture(),original=JSON.stringify(before),packed=T.encode(before);
 assert.deepEqual(T.decode(packed),before);assert.equal(JSON.stringify(before),original);assert.equal(packed.priceColumns.length,1);
 assert.ok(Object.hasOwn(T.decode(packed).snapshot.rows[0].project_prices,'__proto__'));
});
test('legacy full responses, unpublished snapshots and tradein are compatible',()=>{
 for(const response of [fixture(),{status:'ok',snapshot:null},{status:'ok',snapshot:{kind:'tradein',rows:[]}}]){
  assert.equal(T.decode(response),response);if(!response.snapshot||response.snapshot.kind==='tradein')assert.equal(T.encode(response),response);
 }
});
test('incomplete, wrong-version or malformed compact response fails closed',()=>{
 const changes=[x=>x.priceEncoding='unknown',x=>x.snapshot.row_count++,x=>x.snapshot.rows[0][6]=-1,x=>x.snapshot.rows[0][7].pop(),x=>x.priceColumns[0].push(x.priceColumns[0][0]),x=>x.snapshot.rows[0][7][0]=null];
 for(const change of changes){const x=T.encode(fixture());change(x);assert.throws(()=>T.decode(x),/格式不符/);}
});
test('approved actual full snapshot roundtrip is exact and byte size decreases', {skip:!process.env.THREEC_ACTUAL_PUBLIC_SNAPSHOT},()=>{
 const before=JSON.parse(fs.readFileSync(process.env.THREEC_ACTUAL_PUBLIC_SNAPSHOT)),packed=T.encode(before);
 assert.equal(before.snapshot.rows.length,14976);assert.deepEqual(T.decode(packed),before);
 assert.ok(Buffer.byteLength(JSON.stringify(packed))<Buffer.byteLength(JSON.stringify(before))*.25);
});
