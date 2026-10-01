// Local-only original workbook reconciliation. Never place input / report in public fixtures.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),XLSX=require('../assets/vendor/xlsx.full.min.js'),C=require('../department-scores-core.js');
const args=process.argv.slice(2),source=args[0],reportPath=args[1],payloadPath=args[2];
if(!source)throw new Error('Usage: node scripts/qa-department-scores-source.mjs PRIVATE_INPUT [PRIVATE_REPORT] [PRIVATE_INITIALIZATION_PAYLOAD]');
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
for(const output of [reportPath,payloadPath].filter(Boolean))if(path.resolve(output).startsWith(root+path.sep)&&!path.resolve(output).startsWith(path.join(root,'private-data')+path.sep))throw new Error('Private output must stay outside public repo or under ignored private-data');
const bytes=fs.readFileSync(source),workbook=XLSX.read(bytes,{type:'buffer',cellFormula:true}),parsed=C.parseWorkbook(workbook);
if(parsed.errors.length)throw new Error('Month blocked: '+parsed.errors.map(e=>e.monthKey+':'+e.message).join(';'));
let coreCells=0,metricCells=0,externalCached=0;
for(const month of parsed.months){const sheet=workbook.Sheets[month.sheetName];for(const row of month.records){
 for(const [key,s] of Object.entries(row.source)){const original=sheet[s.cell];if(key==='region'||key==='store'){if(String(original?.v||'').replace(/\s+/g,' ').trim()!==s.raw)throw new Error('Source identity mismatch');}else if(original?.t==='e'){if(s.value!==null||s.status!=='error')throw new Error('Core error conflated');}else if(typeof original?.v==='number'&&original.v!==s.value)throw new Error('Core cached value mismatch');coreCells++;if(original?.f?.includes('[')&&typeof original.v==='number')externalCached++;}
 for(const m of row.metrics){const original=sheet[m.cell];if(original?.t==='e'){if(m.status!=='error'||m.value!==null)throw new Error('Metric error conflated');}else if(typeof original?.v==='number'&&original.v!==m.value)throw new Error('Metric cached value mismatch');else if(!original&&m.status!=='blank')throw new Error('Blank conflated');metricCells++;if(original?.f?.includes('[')&&typeof original.v==='number')externalCached++;}
 if(Math.abs(row.score-(100-row.deduction))>1e-7)throw new Error('G/F reconciliation failed');
}}
const report={contract:C.CONTRACT,sourceSha256:crypto.createHash('sha256').update(bytes).digest('hex'),months:parsed.months.map(m=>({monthKey:m.monthKey,stores:m.records.length,regions:m.expectedCounts,summary:C.summarize(m.records),warnings:m.warnings.length,contentHash:crypto.createHash('sha256').update(C.canonical(m)).digest('hex')})),storeMonths:parsed.months.reduce((n,m)=>n+m.records.length,0),coreCells,metricCells,externalCached,formulasRecalculated:0,personReferenceMixed:false,coreReconciliation:'PASS',metricsReconciliation:'PASS'};
if(reportPath){fs.writeFileSync(reportPath,JSON.stringify(report,null,2),{mode:0o600});}
if(payloadPath)fs.writeFileSync(payloadPath,JSON.stringify({contract:C.CONTRACT,sourceName:path.basename(source),sourceHash:report.sourceSha256,selectedMonthKeys:parsed.months.map(m=>m.monthKey),months:parsed.months,confirm:false,expectedGeneration:null,requestId:null}),{mode:0o600});
console.log(JSON.stringify({months:report.months.map(m=>m.monthKey),storeMonths:report.storeMonths,coreCells,metricCells,externalCached,result:'PASS',reportSaved:Boolean(reportPath),payloadPrepared:Boolean(payloadPath)}));
