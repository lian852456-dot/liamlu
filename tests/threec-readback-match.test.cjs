'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const page = fs.readFileSync(path.join(__dirname, '../gas/ReportUpload.html'), 'utf8');
const start = page.indexOf('function threecTradeinComparableRows(');
const end = page.indexOf('async function previewThreec(', start);
assert.ok(start >= 0 && end > start);
const source = fs.readFileSync(process.env.THREEC_READBACK_SCHEMA_PATH || path.join(__dirname, '../gas/Code.gs'), 'utf8');
const schemaStart = source.indexOf('const THREEC_PRIVATE_FOLDER_PROPERTY');
const schemaEnds = ['function privateDashboardAdminRequests', '// Auth ownership candidate.'].map(marker => source.indexOf(marker, schemaStart)).filter(index => index > schemaStart);
assert.ok(schemaStart >= 0 && schemaEnds.length);
const schema = source.slice(schemaStart, Math.min(...schemaEnds));
const clone = value => JSON.parse(JSON.stringify(value));
function snapshot() {
  const row = (model, price) => ({source_sheet:'合成報價',brand:'合成品牌',model,quotes:{
    '點子行動':{S:null,A:price,B:'0',C:null},
    'FutureDial（FDI）':{S:'1200',A:'1000',B:'200',C:null},
    '愛鋒派':{S:null,A:null,B:null,C:null,'未分級':'50'}
  }});
  return {schema_version:'threec-normalized-snapshot/v1',kind:'tradein',source_version_date:'2026-10-15',source_file_name:'合成20261015.xlsx',source_file_sha256:'a'.repeat(64),parser_version:'2026.10.01-source-format-4',internal_source_dates:[],source_row_count:16,row_count:2,excluded_no_price_count:0,query_model_count:2,quote_conflict_count:0,rows:[row('合成機_8G/128G(5G)','100'),row('合成機_8G/256G(5G)','200')]};
}
function runtime(readback) {
  const context = vm.createContext({window:{ThreecPriceDiffCore:require('../threec-price-diff-core.js')},
    call:async name => { assert.ok(['threec_readback','threec_changes_read'].includes(name)); return name === 'threec_readback' ? readback : {changeSet:{}}; },
    payload:value=>value, renderThreecRegistry:()=>{},renderThreecDiff:()=>{},threecPreviewBasis:null,
    threecFormalChangeMode:false,threecFormalSnapshotHash:''
  });
  vm.runInContext(page.slice(start,end),context);
  vm.runInContext(schema,context);
  return context;
}
function matches(a,b) {const c=runtime();return JSON.stringify(c.threecComparableRows(a))===JSON.stringify(c.threecComparableRows(b));}

test('schema-valid multi-provider snapshot preserves all prices after row and key permutations', () => {
  const a=snapshot(),b=clone(a);b.rows.reverse();
  for (const r of b.rows) r.quotes=Object.fromEntries(Object.entries(r.quotes).reverse().map(([p,g])=>[p,Object.fromEntries(Object.entries(g).reverse())]));
  assert.equal(matches(a,b),true);
  assert.equal(JSON.stringify(a.rows)===JSON.stringify(b.rows),false);
});
test('comparison matches the deployed normalization of formatted prices and blank/null quotes', () => {
  const a=snapshot();a.rows[0].quotes['FutureDial（FDI）'].S='1,200';a.rows[0].quotes['點子行動'].S='';
  const c=runtime(),normalized=c.threecNormalizeIncomingSnapshot_(clone(a));
  assert.equal(matches(a,normalized),true);
  assert.equal(normalized.rows[0].quotes['點子行動'].S,null);
  assert.equal(normalized.rows[0].quotes['點子行動'].B,'0');
});
for (const [name,mutate] of [
  ['one-dollar price change',s=>{s.rows[0].quotes['點子行動'].A='101';}],
  ['zero changed to missing',s=>{s.rows[0].quotes['點子行動'].B=null;}],
  ['missing changed to zero',s=>{s.rows[0].quotes['點子行動'].S='0';}],
  ['third-provider ungraded price change',s=>{s.rows[0].quotes['愛鋒派']['未分級']='51';}],
  ['third-provider graded price change',s=>{s.rows[0].quotes['愛鋒派'].A='100';}],
  ['capacity change',s=>{s.rows[0].model='合成機_8G/512G(5G)';}],
  ['RAM change',s=>{s.rows[0].model='合成機_12G/128G(5G)';}],
  ['network change',s=>{s.rows[0].model='合成機_8G/128G(4G)';}],
  ['source-sheet condition change',s=>{s.rows[0].source_sheet='另一合成條件';}],
  ['brand change',s=>{s.rows[0].brand='另一合成品牌';}],
  ['grade prices swapped',s=>{const g=s.rows[0].quotes['FutureDial（FDI）'];[g.S,g.A]=[g.A,g.S];}],
  ['optional third provider removed',s=>{delete s.rows[0].quotes['愛鋒派'];}]
]) test('rejects '+name,()=>{const a=snapshot(),b=clone(a);mutate(b);assert.equal(matches(a,b),false);});

for (const [name,mutate] of [
  ['missing row with old row_count',s=>{s.rows.pop();}],
  ['duplicate identity with identical quotes',s=>{s.rows[1]=clone(s.rows[0]);}],
  ['duplicate identity with conflicting quotes',s=>{s.rows[1]=clone(s.rows[0]);s.rows[1].quotes['點子行動'].A='999';}],
  ['missing required provider',s=>{delete s.rows[0].quotes['點子行動'];}],
  ['unknown provider',s=>{s.rows[0].quotes['未知商']={S:'100',A:null,B:null,C:null};}],
  ['missing null grade',s=>{delete s.rows[0].quotes['點子行動'].S;}],
  ['missing ungraded slot',s=>{delete s.rows[0].quotes['愛鋒派']['未分級'];}],
  ['undefined grade value',s=>{s.rows[0].quotes['點子行動'].S=undefined;}],
  ['invalid price format',s=>{s.rows[0].quotes['點子行動'].A='1,00';}],
  ['unsupported schema',s=>{s.schema_version='unknown/v2';}]
]) test('fails closed for '+name,()=>{const b=snapshot();mutate(b);assert.throws(()=>runtime().threecComparableRows(b));});

test('a removed row cannot be hidden by correcting row_count',()=>{const a=snapshot(),b=clone(a);b.rows.pop();b.row_count=1;assert.equal(matches(a,b),false);});
test('already_current requires the exact source check and active snapshot binding',()=>{
  const a=snapshot(),b=clone(a);b.source_version_date='2026-10-01';b.source_file_sha256='b'.repeat(64);b.snapshot_hash='active';b.rows.reverse();
  const updateCheck={status:'already_current',source_version_date:a.source_version_date,source_file_sha256:a.source_file_sha256,row_count:2,snapshot_hash:'active'};
  const c=runtime();assert.equal(c.threecAlreadyCurrentReadbackMatches(a,b,{updateCheck}),true);
  assert.equal(c.threecAlreadyCurrentReadbackMatches(a,b,{updateCheck:{...updateCheck,source_file_sha256:'c'.repeat(64)}}),false);
  assert.equal(c.threecAlreadyCurrentReadbackMatches(a,b,{updateCheck:{...updateCheck,snapshot_hash:'other'}}),false);
  assert.equal(c.threecAlreadyCurrentReadbackMatches(a,null,{updateCheck}),false);
  b.rows[0].quotes['點子行動'].A='999';assert.equal(c.threecAlreadyCurrentReadbackMatches(a,b,{updateCheck}),false);
});
test('strict readback accepts an equivalent reordered snapshot',async()=>{const a=snapshot(),b=clone(a);b.rows.reverse();b.snapshot_hash='active';const c=runtime({snapshot:b,registry:{},changeSet:{}});const result=await c.verifyThreecReadback(a);assert.equal(result.snapshot.snapshot_hash,'active');});
for (const [field,value] of [['source_version_date','2026-10-01'],['source_file_sha256','b'.repeat(64)],['row_count','2'],['kind','shopping']]) {
  test('strict readback rejects mismatched '+field,async()=>{const a=snapshot(),b=clone(a);b[field]=value;const c=runtime({snapshot:b,registry:{},changeSet:{}});await assert.rejects(c.verifyThreecReadback(a));});
}
