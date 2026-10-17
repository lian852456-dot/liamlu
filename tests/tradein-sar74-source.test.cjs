'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const C=require('../tradein-performance-core.js');
const {csv}=require('./helpers/tradein-synthetic-runtime.cjs');
const sourceModule=import('../tradein-sar74-source.mjs');
const text=()=>csv().toString('utf8');
const tsv=()=>text().replaceAll(',','\t');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');

test('paste TSV and CSV use the same strict 29-column parser and preserve identifiers',async()=>{
 const M=await sourceModule;
 assert.deepEqual(M.parseSourceText(tsv(),C).source,C.parseSar74(text()));
 assert.deepEqual(M.parseSourceText(text(),C).source,C.parseSar74(text()));
 const withZeros=tsv().replaceAll('12345','="0A1B2"');
 assert.equal(M.parseSourceText(withZeros,C).source.records[0].source_employee_id,'0A1B2');
});
test('TSV quoting preserves comma, tab and newline in a quoted non-identity cell',async()=>{
 const M=await sourceModule,rows=tsv().split('\n'),cells=rows[2].split('\t');
 cells[2]='"合成,商品\t含tab\n及換行"';rows[2]=cells.join('\t');
 assert.equal(M.parseSourceText(rows.join('\n'),C).source.records.length,4);
});
test('paste hash is the exact UTF-8 text, not a claimed original CSV file hash',async()=>{
 const M=await sourceModule,raw='\uFEFF'+tsv().replaceAll('\n','\r\n');
 const result=await M.prepareSource({mode:'paste',text:raw,core:C});
 assert.equal(result.source.source_sha256,digest(raw));assert.notEqual(result.source.source_sha256,digest(text()));
 assert.equal(result.source.complete_nine_stores,false);assert.equal(result.summary.active,4);
});
test('file hash uses unchanged raw bytes and file byte read happens once',async()=>{
 const M=await sourceModule,raw=Buffer.from(text());let reads=0;
 const result=await M.prepareSource({file:{size:raw.length,arrayBuffer:async()=>{reads++;return raw;}},core:C});
 assert.equal(reads,1);assert.equal(result.source.source_sha256,digest(raw));assert.equal(result.encoding,'UTF-8');
});
test('metadata, columns, partial paste, duplicate serial and malformed quoting fail locally',async()=>{
 const M=await sourceModule;
 for(const raw of [tsv().split('\n').slice(1).join('\n'),tsv().replace('員工編號',''),tsv().split('\n').slice(0,3).map((line,i)=>i===2?line.split('\t').slice(0,28).join('\t'):line).join('\n'),tsv().replace('\n2\t','\n1\t'),tsv()+'\n"unfinished'])
  assert.throws(()=>M.parseSourceText(raw,C));
});
test('missing source, excessive text and excessive file fail without byte reads',async()=>{
 const M=await sourceModule;
 await assert.rejects(M.prepareSource({mode:'paste',text:'',core:C}),/請貼上/);
 await assert.rejects(M.prepareSource({mode:'paste',text:'x'.repeat(M.MAX_SOURCE_BYTES+1),core:C}),/20MB/);
 await assert.rejects(M.prepareSource({file:{size:M.MAX_SOURCE_BYTES+1,arrayBuffer:()=>{throw Error('must not read');}},core:C}),/20MB/);
});
test('local summary deduplicates by recycle code rather than sales order',async()=>{
 const M=await sourceModule,s=C.parseSar74(text());s.records[1].order_number=s.records[0].order_number;
 s.records.push({...s.records[0]});const summary=M.summarizeSource(s,C);
 assert.equal(summary.active,4);assert.equal(summary.duplicates,1);assert.equal(summary.rows,5);
 assert.equal(JSON.stringify(summary).includes('SYNTHETIC-REC'),false);assert.equal(JSON.stringify(summary).includes('12345'),false);
});
for(const key of ['store_code','trade_date','source_employee_id','order_number','project','recycle_model'])test('local duplicate conflict in '+key+' stops the whole batch',async()=>{
 const M=await sourceModule,s=C.parseSar74(text()),copy={...s.records[0]};
 copy[key]={store_code:'DNB10146',trade_date:'2026-10-03',source_employee_id:'12346',order_number:'SYNTHETIC-OTHER',project:'RT',recycle_model:'APPLE iPhone 16 Pro 256G'}[key];
 s.records.push(copy);assert.throws(()=>M.summarizeSource(s,C),/衝突/);
});
test('local cancellation summary keeps the original month and does not subtract twice',async()=>{
 const M=await sourceModule,s=C.parseSar74(text());s.records.push({...s.records[0],cancel_date:'2026-11-02'});
 const summary=M.summarizeSource(s,C);assert.equal(s.month,'2026-10');assert.equal(summary.cancelled,1);assert.equal(summary.active,3);assert.equal(summary.duplicates,1);
});
test('unknown store fails before any server call',async()=>{
 const M=await sourceModule,s=C.parseSar74(text());s.records[0].store_code='DNB19999';assert.throws(()=>M.summarizeSource(s,C),/店碼/);
});
