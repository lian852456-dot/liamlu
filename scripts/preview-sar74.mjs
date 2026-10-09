// Source-structure preview only. Never prints transaction/employee/customer values.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import Core from '../tradein-performance-core.js';
const index=process.argv.indexOf('--file'),file=index<0?null:process.argv[index+1];
if(!file){console.error('Usage: node scripts/preview-sar74.mjs --file <local CSV>');process.exit(2);}
try{
 const bytes=await readFile(file);let text,encoding='utf-8';
 try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{encoding='big5';text=new TextDecoder('big5',{fatal:true}).decode(bytes);}
 const parsed=Core.parseSar74(text);
 console.log(JSON.stringify({status:'source-structure-preview-only',encoding,source_sha256:createHash('sha256').update(bytes).digest('hex'),
  month:parsed.month,source_start:parsed.source_start,source_end:parsed.source_end,status_as_of_date:parsed.status_as_of_date,
  header_column_count:parsed.header_column_count,row_count:parsed.records.length,employee_count:new Set(parsed.records.map(r=>r.source_employee_id)).size,
  store_count:new Set(parsed.records.map(r=>r.store_code)).size,rows_with_cancel_date:parsed.records.filter(r=>r.cancel_date!==null).length,
  complete_scope_confirmed:false,actual_units:null,target_units:null,remaining_units:null,
  blocked_until:['original CSV provenance and complete schema verified','owner-private batch crosswalk loaded','authoritative monthly roster and HR effective periods loaded','any cancellation attribution approved before canceled batches','owner runtime and formal-write approval verified']},null,2));
}catch(error){console.error('Source preview rejected: '+error.message);process.exit(1);}
