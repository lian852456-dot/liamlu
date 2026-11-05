import {parsePriceSource,buildPriceTop3} from './tradein-price-top3.mjs?v=20261105-1';
import {reminderBrief,createTradeinHtml} from './tradein-reminder.mjs?v=20261105-1';
import {rulesForMonth,hasMonthlySource,buildExportModel,reminderText,createReminderCanvas,createXlsx} from './tradein-export-core.mjs?v=20261105-html-export-2';
import {copyReminderText} from './tradein-clipboard.mjs?v=20261010-copy-recovery-1';
const $=id=>document.getElementById(id);
let contextReader,revision=0,busy=false,canvas=null,priceCatalog=null,priceEpoch=0;
export function currentRules(){return contextReader?.().rules || rulesForMonth($('periodMonth').value);}
function rules(){return currentRules();}
function model(){
  const snapshot=buildExportModel(contextReader(),$('exportScope').value,rules());
  if(!priceCatalog)return snapshot;
  let priceTop3;try{priceTop3=buildPriceTop3(priceCatalog,{vendor:$('reminderPriceVendor').value,grade:$('reminderPriceGrade').value,category:$('reminderPriceCategory').value,asOf:$('reminderPriceDate').value});}
  catch(error){priceTop3={rows:[],note:error.message,vendor:$('reminderPriceVendor').value,grade:$('reminderPriceGrade').value,category:$('reminderPriceCategory').value,asOf:$('reminderPriceDate').value};}
  return Object.freeze({...snapshot,priceTop3});
}
function feedback(text,error=false){$('exportFeedback').textContent=text;$('exportFeedback').className='export-feedback'+(error?' error':'');}
function buttons(disabled){['copyReminder','downloadReminderPng','downloadReminderXlsx','downloadReminderHtml'].forEach(id=>$(id)&&($(id).disabled=disabled));}
function current(ticket){if(ticket!==revision||!contextReader().active)throw new Error('畫面或匯出範圍已變更，請重新操作。');}
function download(blob,name){
  if(!blob||!blob.size)throw new Error('沒有可下載的內容。');
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  try{link.href=url;link.download=name;document.body.appendChild(link);link.click();}catch(error){URL.revokeObjectURL(url);throw error;}finally{link.remove();}
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function stamp(){const r=rules();return (r.isDemo?'示意_':'')+'舊換新_'+r.month+(r.selectedDate?'_單日'+r.selectedDate:'_截至'+r.cutoff)+'_'+($('exportScope').value==='self'?'本人':'授權範圍');}
async function operate(kind){
  if(busy)return;
  const ticket=revision;let snapshot;
  try{snapshot=model();}catch(error){feedback(error.message,true);buttons(true);return;}
  busy=true;buttons(true);feedback(kind==='copy'?'正在複製提醒…':'正在產生匯出檔…');
  try{
    if(kind==='copy'){
      current(ticket);await copyReminderText(reminderBrief(snapshot));current(ticket);feedback('已複製目前範圍的提醒，可貼上使用。');
    }else if(kind==='png'){
      if(document.fonts)await document.fonts.ready;current(ticket);
      const built=createReminderCanvas(snapshot,{text:reminderBrief(snapshot)});canvas=built.canvas;
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG 圖片產生失敗。')),'image/png'));
      current(ticket);download(blob,stamp()+'.png');feedback('PNG 已交給瀏覽器處理，請在下載列表確認；尚未確認存檔完成。');
    }else if(kind==='html'){
      current(ticket);const html=createTradeinHtml(snapshot);current(ticket);download(new Blob([html],{type:'text/html;charset=utf-8'}),stamp()+'.html');feedback('HTML 已交給瀏覽器下載，可離線查看重點與完整明細。');
    }else{
      current(ticket);const bytes=createXlsx(snapshot);download(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),stamp()+'.xlsx');feedback('Excel 已交給瀏覽器處理，請在下載列表確認；尚未確認存檔完成。');
    }
  }catch(error){
    if(ticket===revision){
      if(kind==='copy'){feedback('未能一鍵複製。可在下方提醒內容手動選取複製；'+(error.message||'請重試。'),true);$('reminderPreview').open=true;$('reminderText').focus();$('reminderText').select();}
      else feedback('下載失敗，未確認檔案已保存：'+(error.message||'請重試。'),true);
    }
  }finally{busy=false;try{model();buttons(false);}catch(_){buttons(true);}}
}
export function refreshExports(){
  revision++;canvas=null;feedback('');
  const context=contextReader();
  const supervisor=['supervisor','public'].includes(context.mode),prior=$('exportScope').value;
  $('exportScope').replaceChildren(...(supervisor?[['current','目前明細範圍'],['all',context.mode==='public'?'全區九店':'全部授權店點']]:[['self','本人']]).map(([value,text])=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;}));
  if(supervisor&&['current','all'].includes(prior))$('exportScope').value=prior;
  updatePreview();
}
function updatePreview(){
  const ticket=++revision;
  canvas=null;feedback('');
  try{
    const snapshot=model();$('reminderText').value=reminderBrief(snapshot);$('exportScopeLabel').textContent='目前範圍：'+snapshot.scopeLabel;
    const r=snapshot.rules;$('periodMeta').textContent=r.selectedDate?`單日 ${r.selectedDate}${r.storeTarget?' · 門市目標 '+r.storeTarget+' 台':''} · 來源期間 ${r.sourceStart}–${r.sourceEnd} · 台北時間`:`本月 ${r.start}–${r.end}（每人每月 ${r.staffTarget} 台${r.isDemo?'；實績示意':''}）${r.storeTarget?' · 門市目標 '+r.storeTarget+' 台':''} · 來源期間 ${r.sourceStart}–${r.sourceEnd} · 來源截止 ${r.cutoff} · 台北時間${hasMonthlySource(r)?'':' · 選定月份來源未提供，實績未知'}`;
    buttons(busy);
    Promise.resolve(document.fonts?.ready).then(()=>{
      current(ticket);const built=createReminderCanvas(snapshot,{text:reminderBrief(snapshot)});canvas=built.canvas;
      $('reminderImage').src=canvas.toDataURL('image/png');$('reminderImage').hidden=false;
    }).catch(error=>{if(ticket===revision){$('reminderImage').removeAttribute('src');$('reminderImage').hidden=true;feedback('PNG 預覽產生失敗：'+error.message,true);}});
  }catch(error){$('reminderText').value='';$('reminderImage').removeAttribute('src');$('reminderImage').hidden=true;buttons(true);feedback(error.message,true);}
}
export function clearExports(){revision++;canvas=null;feedback('');$('reminderText').value='';$('reminderImage').removeAttribute('src');$('reminderImage').hidden=true;buttons(true);}
function priceControls(){
  const vendor=$('reminderPriceVendor'),grade=$('reminderPriceGrade'),category=$('reminderPriceCategory');
  if(category.value==='Mac'){vendor.value='fdi';if(grade.value==='S')grade.value='A';}
  const prior=grade.value;grade.replaceChildren(...(vendor.value==='dianzi'||category.value==='Mac'?['A','B','C']:['S','A','B','C']).map(value=>{const option=document.createElement('option');option.value=value;option.textContent=value+' 等';return option;}));
  if([...grade.options].some(o=>o.value===prior))grade.value=prior;
}
function clearPriceSource(){priceEpoch++;priceCatalog=null;if($('reminderPriceFile')){$('reminderPriceFile').value='';$('reminderPriceStatus').textContent='選取已提供的報價中心 HTML／回收價 JSON，可補上指定廠商與等級的 TOP3 參考價。';}}
function bindPriceSource(){
  const file=$('reminderPriceFile');if(!file)return;
  $('reminderPriceDate').value=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});priceControls();
  file.addEventListener('change',async()=>{
    const selected=file.files[0],ticket=++priceEpoch;priceCatalog=null;updatePreview();if(!selected)return;
    $('reminderPriceStatus').textContent='正在本機核對報價來源與有效期…';
    try{
      if(!/\.(?:html?|json)$/i.test(selected.name)||selected.size>20*1024*1024)throw Error('請選取 20MB 內的原報價 HTML／JSON');
      const bytes=await selected.arrayBuffer(),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join(''),text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
      const catalog=parsePriceSource(text,{fileName:selected.name,sha256});if(ticket!==priceEpoch)return;
      priceCatalog=catalog;$('reminderPriceStatus').textContent='已載入 '+selected.name+'：'+catalog.devices.length+' 組機型；僅在本機讀取，參考價依下方廠商／等級及核對日列出。';updatePreview();
    }catch(error){if(ticket===priceEpoch){priceCatalog=null;$('reminderPriceStatus').textContent='未套用回收價來源：'+error.message;updatePreview();}}
  });
  for(const id of ['reminderPriceVendor','reminderPriceGrade','reminderPriceCategory','reminderPriceDate'])$(id).addEventListener('change',()=>{priceControls();updatePreview();});
  $('clearReminderPrice').addEventListener('click',()=>{clearPriceSource();updatePreview();});
  window.addEventListener('portal-before-logout',clearPriceSource);window.addEventListener('pagehide',clearPriceSource);
}
export function bindExports(reader){
  contextReader=reader;bindPriceSource();
  $('copyReminder').addEventListener('click',()=>operate('copy'));
  $('downloadReminderPng').addEventListener('click',()=>operate('png'));
  $('downloadReminderXlsx').addEventListener('click',()=>operate('xlsx'));
  $('downloadReminderHtml')?.addEventListener('click',()=>operate('html'));
  $('exportScope').addEventListener('change',updatePreview);
}
