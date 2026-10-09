'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const Core=require('../tradein-performance-core.js'),{csv,hash}=require('./helpers/tradein-synthetic-runtime.cjs');
function source29(){
 const lines=csv().toString('utf8').split('\n');
 const h=lines[1].split(',').slice(0,29);h[15]='';h[18]='';lines[1]=h.join(',');
 for(let i=2;i<lines.length;i++){const r=lines[i].split(',').slice(0,29);r[2]='"合成,商品"';r[17]='"SYNTHETIC,SHARED-ORDER"';lines[i]=r.join(',');}
 return lines.join('\r\n');
}
test('29-column synthetic layout keeps placeholders and quoted commas, without order-based deduplication',()=>{
 const parsed=Core.parseSar74(source29());assert.equal(parsed.header_column_count,29);assert.equal(parsed.records.length,4);
 assert.equal(new Set(parsed.records.map(r=>r.order_number)).size,1);assert.equal(parsed.records[0].order_number,'SYNTHETIC,SHARED-ORDER');
});
test('29-column placeholder drift rejects instead of shifting identities',()=>{
 const text=source29(),h=text.split('\r\n')[1];
 assert.throws(()=>Core.parseSar74(text.replace(h,h.replace(',,',',unexpected,'))),/欄位/);
 assert.throws(()=>Core.parseSar74(text.replace(h,h.split(',').filter(Boolean).join(','))),/欄位/);
});
for(const encoding of ['utf-8','big5'])test('structure-only CLI '+encoding+' retains source hash and discloses no identifiers',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tradein-synthetic-preview-')),file=path.join(dir,'SYNTHETIC.csv');
 try{
  fs.writeFileSync(file,source29(),{mode:0o600});
  if(encoding==='big5'){
   const result=spawnSync('python3',['-c','import pathlib,sys;p=pathlib.Path(sys.argv[1]);p.write_bytes(p.read_text(encoding="utf-8").encode("cp950"))',file],{encoding:'utf8'});assert.equal(result.status,0);
  }
  const bytes=fs.readFileSync(file),result=spawnSync(process.execPath,['scripts/preview-sar74.mjs','--file',file],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const out=JSON.parse(result.stdout);
  assert.equal(out.encoding,encoding);assert.equal(out.source_sha256,hash(bytes));assert.equal(out.header_column_count,29);assert.equal(out.row_count,4);
  for(const key of ['actual_units','target_units','remaining_units'])assert.equal(out[key],null);
  for(const value of ['12345','SYNTHETIC,SHARED-ORDER','SYNTHETIC-REC',file])assert.equal(result.stdout.includes(value),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('CLI rejects malformed bytes without exposing private source path',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tradein-synthetic-preview-')),file=path.join(dir,'SYNTHETIC.csv');
 try{fs.writeFileSync(file,Buffer.from([0xff]));const r=spawnSync(process.execPath,['scripts/preview-sar74.mjs','--file',file],{cwd:path.resolve(__dirname,'..'),encoding:'utf8'});assert.equal(r.status,1);assert.equal(r.stderr.includes(file),false);}
 finally{fs.rmSync(dir,{recursive:true,force:true});}
});
