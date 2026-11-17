const test=require('node:test'),assert=require('node:assert/strict');
const X=require('../assets/vendor/xlsx.full.min.js'),O=require('../north12-officer-core.js'),D=require('../readonly-renewal-detail.js'),P=require('../conversion-publication-core.js');
const {source}=require('./helpers/renewal-detail-workbook.cjs');
function parse(){
 const w=source(),p=X.utils.sheet_to_json(w.Sheets['未續約明細'],{header:1});
 p[0].push('Tier','方案時專案V+D資費(含換約案)');
 for(const row of p.slice(1))row.push('AB',199);
 const yes=p[1].slice();yes[4]='Y';yes[6]='SYNTHETIC_SECOND';p.push(yes,p[1].slice());
 w.Sheets['未續約明細']=X.utils.aoa_to_sheet(p);
 return O.parseWorkbook(w,X,{sha256:'a'.repeat(64),source_name:'synthetic.xlsx',source_bytes:1});
}
test('cohorts preserve grouped Tier and fee, count Y/N and dedupe per store/day/customer',()=>{
 const d=parse(),c=d.renewalDetail.cohorts.find(r=>r.store===d.stores[0].id);
 assert.equal(c.tier,'AB');assert.equal(c.fee,199);assert.equal(c.visitors,2);assert.equal(c.renewals,1);
 assert(!JSON.stringify(d).includes('SYNTHETIC_SECOND'));
 const html=D.render(d,d.stores,{start:d.period_start,end:d.cutoff});assert.match(html,/門市追蹤指令/);assert.match(html,/同仁欄位未提供/);assert.match(html,/AB、DE 無法再拆/);
});
test('regional publication cannot leak another region cohort or duplicate cross tabs',()=>{
 const d=parse(),p=P.fromOfficer(d),b=p.regions['北一二B'];
 assert(b.renewalDetail.cohorts.every(r=>b.stores.some(s=>s.id===r.store)));
 const bad=structuredClone(d.renewalDetail);bad.cohorts.push({...bad.cohorts[0]});
 assert.throws(()=>D.validate(bad,d.stores,d.period_start,d.cutoff),/重複/);
});
