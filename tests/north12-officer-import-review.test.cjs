const test=require('node:test'),assert=require('node:assert/strict');
const X=require('../assets/vendor/xlsx.full.min.js'),C=require('../north12-officer-core.js'),D=require('../readonly-renewal-detail.js');
const {source}=require('./helpers/renewal-detail-workbook.cjs');
const opts={sha256:'e'.repeat(64),source_name:'synthetic-review.xlsx'};
const parse=w=>C.parseWorkbook(w,X,opts);
function duplicate(w,name,conflict=false){
 const rows=X.utils.sheet_to_json(w.Sheets[name],{header:1,raw:true,defval:null});
 const extra=rows[4].slice();
 if(conflict)extra[name==='Tier觀察'?3:4]++;
 rows.push(extra);w.Sheets[name]=X.utils.aoa_to_sheet(rows);
}
test('identical repeated Tier blocks are idempotent and conflicting blocks are identified',()=>{
 const w=source(),expected=parse(w);
 for(const name of ['Tier觀察','RT用戶進店行為_店'])duplicate(w,name);
 assert.deepEqual(parse(w),expected);
 duplicate(w,'Tier觀察',true);
 const d=parse(w);
 assert.deepEqual(d.records,expected.records);
 assert.equal(d.renewalDetail.coverage.observation,false);
 assert.match(d.renewalDetail.issues.observation,/不同數值/);
 assert.equal(d.renewalDetail.coverage.tiers,true);
 assert.equal(d.renewalDetail.coverage.plans,true);
});
test('every combination of unavailable or invalid optional sheets preserves only verified sections',()=>{
 const cases=['valid','missing','invalid'],names=D.SHEETS,keys=['observation','tiers','plans'];
 for(const a of cases)for(const b of cases)for(const c of cases){
  const w=source(),states=[a,b,c];
  states.forEach((state,i)=>{
   if(state==='missing')delete w.Sheets[names[i]];
   if(state==='invalid')w.Sheets[names[i]]=X.utils.aoa_to_sheet([['invalid heading']]);
  });
  const d=parse(w);
  states.forEach((state,i)=>{
   assert.equal(d.renewalDetail.coverage[keys[i]],state==='valid',states.join(',')+' '+names[i]);
   assert.equal(!!d.renewalDetail.issues?.[keys[i]],state==='invalid');
   if(state!=='valid')assert.deepEqual(d.renewalDetail[keys[i]],[]);
  });
  const checked=C.validate(d);
  assert.deepEqual(checked,d);
  const summary=D.importSummary(d.renewalDetail);
  for(const name of names)assert(summary.includes(name));
 }
});
test('diagnostics survive offline validation and escape text, while bad core counts still reject',()=>{
 const w=source();w.Sheets['Tier觀察']=X.utils.aoa_to_sheet([['bad']]);
 const d=parse(w);d.renewalDetail.issues.observation='<img src=x onerror=alert(1)>';
 const html=D.render(C.validate(d),d.stores);
 assert(!html.includes('<img'));assert(html.includes('&lt;img'));
 w.Sheets['RT締結率'].P3.v++;
 assert.throws(()=>parse(w),/RT分子/);
});

test('mixed regional and store-level Tier rows never double count regional totals',()=>{
 const w=source(),expected=parse(w);
 const rows=X.utils.sheet_to_json(w.Sheets['Tier觀察'],{header:1,raw:true,defval:null});
 for(const store of expected.stores){
  const regional=rows.find(r=>r[1]===store.region);
  const row=regional.slice();row[0]=store.id;row[2]=store.name;
  row[3]=1;rows.push(row);
 }
 w.Sheets['Tier觀察']=X.utils.aoa_to_sheet(rows);
 assert.deepEqual(parse(w).renewalDetail,expected.renewalDetail);
});

test('spacing, full-width headings, banner rows, blank rows and leading columns retain identical results',()=>{
 const expected=parse(source()),w=source();
 for(const name of ['AQ締結率','RT每日','RT締結率',...D.SHEETS]){
  const rows=X.utils.sheet_to_json(w.Sheets[name],{header:1,raw:true,defval:null,blankrows:true});
  for(const row of rows)for(let c=0;c<row.length;c++)if(typeof row[c]==='string'&&/原TWM用戶|符合續約資格TTL|進店店點代碼/.test(row[c]))row[c]=row[c].replace(/[A-Z]/g,c=>String.fromCharCode(c.charCodeAt(0)+65248))+'　';
  const shifted=[['合成報表說明'],[],...rows.flatMap(row=>[[],[null,null,...row]])];
  const renamed='　'+name.replace('RT','RT ')+' ';
  w.Sheets[renamed]=X.utils.aoa_to_sheet(shifted);delete w.Sheets[name];
  w.SheetNames[w.SheetNames.indexOf(name)]=renamed;
 }
 assert.deepEqual(parse(w),expected);
});
test('ambiguous source names and duplicate detail columns cannot silently select first match',()=>{
 const w=source();w.Sheets[' AQ締結率 ']=w.Sheets['AQ締結率'];
 assert.throws(()=>parse(w),/多張同名來源/);delete w.Sheets[' AQ締結率 '];
 w.Sheets[' Tier觀察 ']=w.Sheets['Tier觀察'];
 assert.equal(parse(w).renewalDetail.coverage.observation,false);
 assert.match(parse(w).renewalDetail.issues.observation,/多張同名來源/);
 const rows=X.utils.sheet_to_json(w.Sheets['未續約明細'],{header:1,raw:true,defval:null});
 rows[0].push('進店店點代碼');w.Sheets['未續約明細']=X.utils.aoa_to_sheet(rows);
 assert.match(parse(w).renewalDetail.issues.plans,/重複/);
});
test('corrected replacement of all regions restores previously unavailable sections',()=>{
 const bad=source();bad.Sheets['Tier觀察']=X.utils.aoa_to_sheet([['bad']]);
 const good=parse(source());assert.deepEqual(C.merge(parse(bad),good),good);
});

test('regional and store tables may repeat column headers without repeating the report period',()=>{
 const w=source(),expected=parse(w);
 for(const name of ['AQ締結率','RT每日','RT締結率']){
  const rows=X.utils.sheet_to_json(w.Sheets[name],{header:1,raw:true,defval:null,blankrows:true});
  const header=rows[0].slice();header[0]=null;
  rows.splice(2,0,header,rows[1].slice());w.Sheets[name]=X.utils.aoa_to_sheet(rows);
 }
 assert.deepEqual(parse(w),expected);
});
