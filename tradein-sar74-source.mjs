// Local source checks only. Identity/roster approval remains on the existing owner.
import {boundedOperation} from './tradein-admin-operation.mjs?v=20261015-preview-recovery-1';

export const MAX_SOURCE_BYTES=20*1024*1024;

function tabRows(text){
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){
   if(quoted&&text[i+1]==='"'){cell+='"';i++;}
   else if(!quoted&&cell.length)cell+='"';
   else quoted=!quoted;
  }else if(c==='\t'&&!quoted){row.push(cell);cell='';}
  else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(quoted)throw Error('貼上表格的引號未完整結束');
 if(cell||row.length){row.push(cell);rows.push(row);}
 return rows;
}

export function parseSourceText(text,core){
 try{return {source:core.parseSar74(text),format:'CSV'};}
 catch(error){
  if(!text.includes('\t'))throw error;
  const rows=tabRows(text.replace(/^\uFEFF/,''));
  if(!rows.some(row=>row.includes('序號')&&row.includes('店點代碼')))throw error;
  const csv=rows.map(row=>row.map(cell=>/[",\r\n]/.test(cell)?'"'+cell.replace(/"/g,'""')+'"':cell).join(',')).join('\n');
  return {source:core.parseSar74(csv),format:'貼上表格'};
 }
}

export function summarizeSource(source,core){
 const unique=new Map();let duplicates=0;
 for(const row of source.records){
  if(!core.STORES.some(([code])=>code===row.store_code))throw Error('來源含九店範圍以外或未知店碼');
  const key=row.recycle_code.trim(),item={store:row.store_code,date:row.trade_date,
   employee:core.sourceEmployeeId(row.source_employee_id),order:row.order_number.trim(),
   project:row.project,model:core.shortModel(row.recycle_model),cancel:row.cancel_date};
  const prior=unique.get(key);
  if(prior){
   if(['store','date','employee','order','project','model'].some(field=>prior[field]!==item[field]))throw Error('同回收碼的交易、人員、店點或機款衝突');
   if(item.cancel&&prior.cancel&&item.cancel!==prior.cancel)throw Error('同筆取消交易的日期衝突');
   if(item.cancel)prior.cancel=item.cancel;
   duplicates++;
  }else unique.set(key,item);
 }
 const rows=[...unique.values()];
 return {rows:source.records.length,unique:rows.length,duplicates,
  cancelled:rows.filter(row=>row.cancel).length,
  sameMonthCancelled:rows.filter(row=>row.cancel&&row.date.slice(0,7)===source.month&&row.cancel.slice(0,7)===source.month).length,
  crossMonthCancelled:rows.filter(row=>row.cancel&&(row.date.slice(0,7)!==source.month||row.cancel.slice(0,7)!==source.month)).length,
  active:rows.filter(row=>!row.cancel).length,
  stores:core.STORES.map(([code,store])=>({store,rows:rows.filter(row=>row.store===code&&!row.cancel).length}))};
}

export async function prepareSource({file,text,mode='file',core,signal,onStage=()=>{}}){
 if(typeof core?.parseSar74!=='function')throw Error('解析程式未載入，請重新整理頁面');
 let bytes,decoded,encoding;
 if(mode==='paste'){
  if(!text?.trim())throw Error('請貼上完整 SAR74 表格，包含查詢期間、列印日期及全部欄位');
  if(text.length>MAX_SOURCE_BYTES)throw Error('來源內容超過 20MB');
  bytes=new TextEncoder().encode(text);decoded=text;encoding='UTF-8 貼上文字';
 }else{
  if(!file)throw Error('請選擇完整九店 SAR74 CSV');
  if(file.size>MAX_SOURCE_BYTES)throw Error('來源檔案超過 20MB');
  onStage('正在讀取 CSV 檔案…');
  bytes=await boundedOperation(()=>file.arrayBuffer(),{signal,timeoutMs:10000,timeoutMessage:'讀取檔案逾時，請重新選擇原 CSV'});
 }
 if(bytes.byteLength>MAX_SOURCE_BYTES)throw Error('來源內容超過 20MB');
 onStage('正在解析 CSV 編碼、期間與欄位…');
 if(decoded===undefined){
  try{decoded=new TextDecoder('utf-8',{fatal:true}).decode(bytes);encoding='UTF-8';}
  catch{decoded=new TextDecoder('big5',{fatal:true}).decode(bytes);encoding='Big5';}
 }
 const {source,format}=parseSourceText(decoded,core),summary=summarizeSource(source,core);
 if(source.records.length>20000)throw Error('來源明細超過 20000 筆，停止同步');
 const digest=await boundedOperation(()=>crypto.subtle.digest('SHA-256',bytes),{signal,timeoutMs:10000,timeoutMessage:'來源完整性核對逾時，請重新預覽'});
 source.source_sha256=Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
 return {source,summary,format,encoding,mode,bytes:bytes.byteLength};
}
