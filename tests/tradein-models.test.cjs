'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../tradein-performance-core.js'),P=require('../tradein-public-core.js');
const {createRuntime,parsed,OPERATOR}=require('./helpers/tradein-synthetic-runtime.cjs');
const plain=v=>JSON.parse(JSON.stringify(v));
function setup(legacy=false){const r=createRuntime(),source=parsed();r.configure(source);if(legacy)r.a.TradeinPublicCore={...P,project:(snapshot,random)=>{const value=P.project(snapshot,random);value.people.forEach(p=>delete p.recovered_models);return value;}};const auth={employeeId:OPERATOR,adminSecret:r.secret},preview=r.a.tradeinPerformancePreview({...auth,source});const published=r.a.tradeinPerformancePublish({...auth,source,...preview});r.a.tradeinPerformancePublicPublish({...auth,month:source.month,sourceHash:source.source_sha256,expectedActiveHash:published.snapshotHash});return {r,source,auth};}
test('short names retain generation, variant and capacity while removing colour, recycler and grade',()=>{
 const cases=[['(舊機)APPLE iPhone 17 Pro_256G-(宇宙橙)(5G)_(點子)_A等','i17P 256G'],['(舊機)APPLE iPhone 15 Pro Max_512G-(鈦)(5G)_(FDI)_S等','i15PM 512G'],['(舊機)Google Pixel 7 Pro_12GB/128GB(5G)_(FDI)_C等','Pixel 7P 128G'],['(舊機)Samsung Galaxy A55_8GB/256GB(5G)_(點子)_A等','A55 256G'],['APPLE iPhone SE(2020)_128G','iSE 2020 128G']];
 for(const [raw,short] of cases)assert.equal(C.shortModel(raw),short);
 for(const raw of ['<script>','123456789012345','iPhone\n17'])assert.throws(()=>C.shortModel(raw));
});
test('same recycler duplicates count once, cancellation contributes no models, and mismatched model fails',()=>{
 const {r,source}=setup();source.records.push({...source.records[0]});r.configure(source);let value=r.a.tradeinPerformanceBuild_(source,r.a.tradeinPerformanceMonthRoster_(source.month));assert.equal(value.people[0].actual_units,1);assert.deepEqual(plain(value.people[0].recovered_models),[{model:'i15PM 256G',units:1}]);
 source.records[source.records.length-1].recycle_model='APPLE iPhone 14_128G';assert.throws(()=>r.a.tradeinPerformanceBuild_(source,r.a.tradeinPerformanceMonthRoster_(source.month)),/機款衝突/);
 const roster=r.a.tradeinPerformanceMonthRoster_(source.month),clean={...source,records:[{...source.records[0],cancel_date:'2026-10-03'}]};value=C.build(clean,roster,JSON.parse(r.configs.get('north12b-tradein-reference-'+source.source_sha256+'.json').getBlob().getDataAsString()));assert.equal(value.people[0].actual_units,0);assert.deepEqual(plain(value.people[0].recovered_models),[]);
});
test('public model aggregates expose only model and units, and mismatched totals or private fields are rejected',()=>{
 const {r,source}=setup(),out=plain(r.a.tradeinPerformancePublicRead({month:source.month}).snapshot);assert.deepEqual(out.people[1].recovered_models,[{model:'i15PM 256G',units:2}]);assert.equal(P.validate(out),out);
 for(const change of [m=>m.units++,m=>m.employee_key='ZX00001',m=>m.model='123456789012345',m=>m.model='<b>i15PM</b>']){const altered=plain(out);change(altered.people[0].recovered_models[0]);assert.throws(()=>P.validate(altered));}
 const legacy=plain(out);legacy.people.forEach(p=>delete p.recovered_models);assert.equal(P.validate(legacy),legacy);
});
test('uploading the same legacy source remains a no-op only when all original calculation fields match',()=>{
 const r=createRuntime(),source=parsed(),auth={employeeId:OPERATOR,adminSecret:r.secret};r.configure(source);
 const build=r.a.tradeinPerformanceBuild_;r.a.tradeinPerformanceBuild_=(...args)=>{const value=build(...args);value.people.forEach(p=>delete p.recovered_models);return value;};
 const first=r.a.tradeinPerformancePreview({...auth,source}),saved=r.a.tradeinPerformancePublish({...auth,source,...first});r.a.tradeinPerformanceBuild_=build;
 const writes=r.writes.length,preview=r.a.tradeinPerformancePreview({...auth,source}),result=r.a.tradeinPerformancePublish({...auth,source,...preview});assert.equal(result.status,'unchanged');assert.equal(result.snapshotHash,saved.snapshotHash);assert.equal(r.writes.length,writes);
 const changed={...source,records:source.records.slice(0,1)},different=r.a.tradeinPerformancePreview({...auth,source:changed});assert.throws(()=>r.a.tradeinPerformancePublish({...auth,source:changed,...different}),/相同來源雜湊/);assert.equal(r.writes.length,writes);
});
test('reviewed historical model supplement binds exact source and checks every person against private counts',()=>{
 const {r,source}=setup(true),current=r.a.tradeinPerformanceRegistry_().months[source.month].active,privateSource=plain(r.a.tradeinPerformanceSnapshot_(current));const basis={schema_version:'tradein-recovered-models/v1',review_status:'verified',source_sha256:source.source_sha256,month:source.month,source_start:source.source_start,source_end:source.source_end,people:privateSource.people.map(p=>({employee_key:p.employee_key,store:p.store,actual_units:p.actual_units,recovered_models:p.recovered_models}))};
 const name='north12b-tradein-models-'+source.source_sha256+'.json';r.setConfig(name,basis);const writes=r.writes.length,out=plain(r.a.tradeinPerformancePublicRead({month:source.month}).snapshot);assert.equal(r.writes.length,writes);assert.equal(JSON.stringify(out).includes('employee_key'),false);
 for(const mutate of [b=>b.source_sha256='f'.repeat(64),b=>b.source_end='2026-10-08',b=>b.people[0].store='酒泉',b=>b.people[0].actual_units++,b=>b.people.splice(0,1),b=>b.people.push(b.people[0])]){const bad=plain(basis);mutate(bad);r.setConfig(name,bad);assert.throws(()=>r.a.tradeinPerformancePublicRead({month:source.month}),/尚未完成核對/);}
});
