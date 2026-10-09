import {rulesForMonth,hasMonthlySource,buildExportModel,reminderText,createReminderCanvas,createXlsx} from './tradein-export-core.mjs';
const $=id=>document.getElementById(id);
let contextReader,revision=0,busy=false,canvas=null;
export function currentRules(){return contextReader?.().rules || rulesForMonth($('periodMonth').value);}
function rules(){return currentRules();}
function model(){return buildExportModel(contextReader(),$('exportScope').value,rules());}
function feedback(text,error=false){$('exportFeedback').textContent=text;$('exportFeedback').className='export-feedback'+(error?' error':'');}
function buttons(disabled){['copyReminder','downloadReminderPng','downloadReminderXlsx'].forEach(id=>$(id).disabled=disabled);}
function current(ticket){if(ticket!==revision||!contextReader().active)throw new Error('畫面或匯出範圍已變更，請重新操作。');}
function download(blob,name){
  if(!blob||!blob.size)throw new Error('沒有可下載的內容。');
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  try{link.href=url;link.download=name;document.body.appendChild(link);link.click();}catch(error){URL.revokeObjectURL(url);throw error;}finally{link.remove();}
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function stamp(){return (rules().isDemo?'示意_':'')+'舊換新_'+rules().month+'_截至'+rules().cutoff+'_'+($('exportScope').value==='self'?'本人':'授權範圍');}
async function operate(kind){
  if(busy)return;
  const ticket=revision;let snapshot;
  try{snapshot=model();}catch(error){feedback(error.message,true);buttons(true);return;}
  busy=true;buttons(true);feedback(kind==='copy'?'正在複製提醒…':'正在產生匯出檔…');
  try{
    if(kind==='copy'){
      if(!navigator.clipboard?.writeText)throw new Error('瀏覽器未提供一鍵複製。');
      current(ticket);await navigator.clipboard.writeText(reminderText(snapshot));current(ticket);feedback('已複製目前範圍的提醒，可貼上使用。');
    }else if(kind==='png'){
      if(document.fonts)await document.fonts.ready;current(ticket);
      const built=createReminderCanvas(snapshot);canvas=built.canvas;
      const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG 圖片產生失敗。')),'image/png'));
      current(ticket);download(blob,stamp()+'.png');feedback('PNG 已交給瀏覽器處理，請在下載列表確認；尚未確認存檔完成。');
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
    const snapshot=model();$('reminderText').value=reminderText(snapshot);$('exportScopeLabel').textContent='目前範圍：'+snapshot.scopeLabel;
    const r=snapshot.rules;$('periodMeta').textContent=`本月 ${r.start}–${r.end}（每月 3 台${r.isDemo?'；實績示意':''}） · 來源期間 ${r.sourceStart}–${r.sourceEnd} · 來源截止 ${r.cutoff} · 台北時間${hasMonthlySource(r)?'':' · 選定月份來源未提供，實績未知'}`;
    buttons(busy);
    Promise.resolve(document.fonts?.ready).then(()=>{
      current(ticket);const built=createReminderCanvas(snapshot);canvas=built.canvas;
      $('reminderImage').src=canvas.toDataURL('image/png');$('reminderImage').hidden=false;
    }).catch(error=>{if(ticket===revision){$('reminderImage').removeAttribute('src');$('reminderImage').hidden=true;feedback('PNG 預覽產生失敗：'+error.message,true);}});
  }catch(error){$('reminderText').value='';$('reminderImage').removeAttribute('src');$('reminderImage').hidden=true;buttons(true);feedback(error.message,true);}
}
export function clearExports(){revision++;canvas=null;feedback('');$('reminderText').value='';$('reminderImage').removeAttribute('src');$('reminderImage').hidden=true;buttons(true);}
export function bindExports(reader){
  contextReader=reader;
  $('copyReminder').addEventListener('click',()=>operate('copy'));
  $('downloadReminderPng').addEventListener('click',()=>operate('png'));
  $('downloadReminderXlsx').addEventListener('click',()=>operate('xlsx'));
  $('exportScope').addEventListener('change',updatePreview);
}
