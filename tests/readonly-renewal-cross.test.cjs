'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),X=require('../assets/vendor/xlsx.full.min.js');
const D=require('../readonly-renewal-detail.js'),O=require('../north12-officer-core.js'),P=require('../conversion-publication-core.js');
const {fixture}=require('./helpers/readonly-conversion-runtime.cjs');
function source() {
 const data=O.validate({...fixture({days:5}),schema:O.SCHEMA,stores:require('../readonly-dashboard-core.js').STORES,records:require('../readonly-dashboard-core.js').STORES.flatMap(store=>Array.from({length:5},(_,i)=>({store:store.id,date:'2026-10-0'+(i+1),aq_n:0,aq_d:0,rt_n:i>=3?1:0,rt_d:i>=3?3:0})))});
 const header=['進店店點代碼','進店課別','進店日期','方案描述(含換約案)','Tier','方案時專案V+D資費(含換約案)','續約Y/N','@是否符合續約資格_進店(含提前續約)_E-15','Subscr Id(2T)','客戶電話','同仁姓名'];
 const rows=[header];
 for(const store of data.stores)for(const day of [4,5])for(let i=0;i<3;i++)rows.push([store.id,store.region,Math.round((Date.parse('2026-10-0'+day+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000),'合成專案 <標準>',i===2?'B':'A',i===2?199:129,i===0?'Y':'N','1.符合續約資格','PRIVATE_USER_'+store.id+'_'+day+'_'+i,'PRIVATE_PHONE','PRIVATE_EMPLOYEE']);
 const workbook={Sheets:{未續約明細:X.utils.aoa_to_sheet(rows)}};
 data.renewalDetail=D.parseAvailable(workbook,X,data);
 return {data,workbook,rows};
}
test('same visits produce Tier × tariff × plan counts and weekly store actions without raw identities',()=>{
 const {data}=source();assert.equal(data.renewalDetail.coverage.cross,true);
 assert.equal(data.renewalDetail.cross.reduce((n,r)=>n+r.visitors,0),54);
 assert.equal(data.renewalDetail.cross.reduce((n,r)=>n+r.renewals,0),18);
 const html=D.renderCross(data,[data.stores[0]]);assert.match(html,/10-04（日）/);assert.match(html,/10-05（一）/);
 assert.match(html,/50.0%/);assert.match(html,/129/);assert.match(html,/199/);assert.match(html,/未締結 1 筆/);assert.match(html,/合成專案 &lt;標準&gt;/);assert.match(html,/未提供可核對的同仁集中來源/);
 assert.doesNotMatch(JSON.stringify(data),/PRIVATE_|Subscr|客戶電話|同仁姓名/);
 const week=D.renderCross(data,[data.stores[0]],{start:'2026-10-05',end:'2026-10-05'});assert.doesNotMatch(week,/10-04（日）/);assert.match(week,/10-05（一）/);
});
test('N-only data and a different Tier population cannot invent a conversion denominator',()=>{
 const {data,rows}=source();const notRenewed=rows.filter((r,i)=>i===0||r[6]==='N');const workbook={Sheets:{未續約明細:X.utils.aoa_to_sheet(notRenewed)}};
 const d=D.parseAvailable(workbook,X,data);assert.equal(d.coverage.plans,true);assert.equal(d.coverage.cross,false);assert.match(d.issues.cross,/RT 每日/);assert.equal(d.cross,undefined);
 const detail={coverage:{tiers:true},tiers:[{store:data.stores[0].id,tier:'A',visitors:999,renewals:2}]};
 assert.throws(()=>D.parseCross(source().workbook,X,data,detail),/Tier 店表/);
});
test('duplicates are counted once and conflicting joint attributes reject the inconsistent source',()=>{
 const {data,rows}=source();rows.push(rows[1].slice());const workbook={Sheets:{未續約明細:X.utils.aoa_to_sheet(rows)}};
 assert.equal(D.parseAvailable(workbook,X,data).cross.reduce((sum,row)=>sum+row.visitors,0),54);
 rows[rows.length-1][4]='C';workbook.Sheets.未續約明細=X.utils.aoa_to_sheet(rows);
 const d=D.parseAvailable(workbook,X,data);assert.equal(d.coverage.cross,false);assert.match(d.issues.cross,/重複且衝突/);assert.equal(d.coverage.plans,false);
});
test('cross tables survive department projection, a same-cutoff optional omission, and strict aggregate validation',()=>{
 const {data}=source(),old=P.fromOfficer(data);assert.equal(old.regions['北一二B'].renewalDetail.cross.length,data.renewalDetail.cross.length);
 const incoming={...data,sha256:'b'.repeat(64),renewalDetail:undefined};const next=P.combine(old,P.fromOfficer(incoming)).snapshot;
 assert.deepEqual(next.regions['北一二B'].renewalDetail.cross,data.renewalDetail.cross);assert.ok(next.retained_sources.some(r=>r.kind==='cross'));
 const bad=structuredClone(data.renewalDetail);bad.cross[0].renewals++;
 assert.throws(()=>D.validate(bad,data.stores,data.period_start,data.cutoff),/分子／分母/);
 bad.cross[0].renewals--;bad.cross[0].customerId='PRIVATE_SECRET';assert.doesNotMatch(JSON.stringify(D.validate(bad,data.stores,data.period_start,data.cutoff)),/PRIVATE_SECRET/);
});
