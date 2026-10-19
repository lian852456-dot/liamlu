const OWNER='https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
const KEY='north12b_password_session_v1',LOGOUT='north12b_portal_logout_event_v1';
const $=id=>document.getElementById(id),today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
let rows=[],profile=null,editing=null,epoch=0,pending=null,loaded=false,leaseTimer,attempt=null,needsReadback=false;
const message=text=>{$('shareMessage').textContent=text;};
function proof(){
  const p=JSON.parse(sessionStorage.getItem(KEY)||'null'),logout=JSON.parse(localStorage.getItem(LOGOUT)||'null')?.id||'';
  if(!p||p.v!==1||p.owner!==OWNER||p.expiresAt<=Date.now()||p.logoutEpoch!==logout||!p.deviceId||!p.token||window.PortalLogout?.isLocked())throw Error('請先登入同仁專區，再查看舊分享或編輯案例。');return p;
}
function optionalProof(){try{return proof();}catch{return null;}}
function range(){
  if($('shareView').value==='legacy'){const month=$('shareLegacyMonth').value;if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month))throw Error('請選擇有效的原分享月份。');const end=new Date(month+'-01T00:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);return {start:month+'-01',end:end.toISOString().slice(0,10)};}
  const start=$('shareView').value==='daily'?$('shareDay').value:$('shareStart').value,end=$('shareView').value==='daily'?start:$('shareEnd').value;
  if(!/^20\d{2}-\d{2}-\d{2}$/.test(start)||!/^20\d{2}-\d{2}-\d{2}$/.test(end)||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(end))||end<start||Date.parse(end)-Date.parse(start)>92*86400000)throw Error('請選擇有效起訖，最多 93 個日曆日。');
  return {start,end};
}
function resetEditor(){editing=null;attempt=null;needsReadback=false;$('shareForm').reset();$('shareEditorTitle').textContent='＋新增分享';$('shareIdentity').hidden=false;$('shareConsentWrap').hidden=false;$('shareRemoveImageWrap').hidden=true;for(const id of ['shareInputStore','shareInputAuthor','shareConsent'])$(id).required=true;}
function option(value,label){const el=document.createElement('option');el.value=value;el.textContent=label;return el;}
function busy(value){$('shareWorkspace').setAttribute('aria-busy',String(value));$('shareForm').querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=value);$('shareRefresh').disabled=value;$('shareList').querySelectorAll('button').forEach(el=>el.disabled=value);}
function clear(note='分享畫面已清除，請重新讀取。',dropPrivate=false){
  epoch++;pending?.abort();pending=null;clearTimeout(leaseTimer);rows=[];profile=null;loaded=false;editing=null;
  // An ambiguous submission stays in memory until readback; never silently resend it.
  const savedAttempt=attempt,savedReadback=needsReadback;resetEditor();if(!dropPrivate||!savedAttempt?.authenticated){attempt=savedAttempt;needsReadback=savedReadback;}
  $('shareList').replaceChildren();$('shareCount').textContent='';$('shareAuthor').textContent='';$('shareStore').replaceChildren(option('','全部門市'));$('shareStaff').replaceChildren(option('','全部同仁'));busy(false);message(note);
}
const errors={SHARE_VERSION_CONFLICT:'案例或提交內容已變更，請重新讀取確認。',SHARE_RATE_LIMIT:'分享請求暫時過多，請稍後再試。',SHARE_CAPACITY:'分享容量已滿，請洽督導。',SHARE_IMAGE_INVALID:'圖片格式或容量不符。',SHARE_INPUT_INVALID:'欄位不符，請檢查內容與公開同意。',SHARE_RANGE_INVALID:'請選擇有效起訖，最多 93 個日曆日。'};
async function request(action,extra={},authenticated=false){
  if(pending)throw Error('請等待目前操作完成。');
  const p=authenticated?proof():null,ticket=epoch,selection=JSON.stringify(range()),controller=new AbortController();pending=controller;busy(true);
  const timer=setTimeout(()=>controller.abort(),60000);
  try{
    const payload=authenticated?{action:'employee_tradein_sharing_'+action,deviceId:p.deviceId,token:p.token,...extra}:{action:'tradein_sharing_public_'+action,...extra};
    const response=await fetch(OWNER,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},credentials:'omit',cache:'no-store',signal:controller.signal,body:JSON.stringify(payload)});
    const current=()=>ticket===epoch&&selection===JSON.stringify(range())&&(!p||proof().token===p.token);
    if(!current())throw Error('登入或分享日期已變更，請重新讀取。');if(!response.ok)throw Error('連線未完成，請先重新讀取確認結果。');
    const body=await response.json();if(!current())throw Error('登入或分享日期已變更，請重新讀取。');
    if(body?.status!=='ok')throw Error(errors[body?.code]||'分享服務尚未開放或驗證未通過，請稍後再試。');return body;
  }finally{clearTimeout(timer);if(pending===controller){pending=null;busy(false);}}
}
function filters(){
  const store=$('shareStore').value,staff=$('shareStaff').value,stores=[...new Set(rows.map(r=>r.store))].sort();
  $('shareStore').replaceChildren(option('','全部門市'),...stores.map(s=>option(s,s)));if(stores.includes(store))$('shareStore').value=store;
  const authors=[...new Set(rows.filter(r=>!$('shareStore').value||r.store===$('shareStore').value).map(r=>r.store+'｜'+r.author))].sort();
  $('shareStaff').replaceChildren(option('','全部同仁'),...authors.map(s=>option(s,s)));if(authors.includes(staff))$('shareStaff').value=staff;
}
function node(tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
function showError(error){message(error.name==='AbortError'?'連線已取消；若正在儲存，請按「讀取分享」先確認結果，勿重複提交。':error.message);}
function button(label,fn){const el=node('button',label,'secondary');el.type='button';el.onclick=()=>void fn().catch(showError);return el;}
function render(){
  const list=$('shareList'),selected=rows.filter(r=>(!$('shareStore').value||r.store===$('shareStore').value)&&(!$('shareStaff').value||r.store+'｜'+r.author===$('shareStaff').value)&&(!$('shareFilterType').value||r.type===$('shareFilterType').value)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||b.id.localeCompare(a.id));
  list.replaceChildren();$('shareCount').textContent=selected.length+' 則分享';if(!selected.length){list.append(node('p','目前沒有符合條件的分享，歡迎新增案例。'));return;}
  for(const row of selected){
    const card=node('article','','sharing-card');card.dataset.hidden=String(row.hidden);
    card.append(node('h3',(row.featured?'★ 優良案例 · ':'')+row.type+(row.hidden?'（已隱藏）':'')),node('p',row.store+' · '+row.author+(row.authorUnverified?'（自填未驗證）':'')+' · 建立日 '+row.createdDate+'（台灣時間）','meta'));
    for(const [title,value] of [['客戶情境',row.scenario],['推薦方式與話術',row.approach],['結果與改善心得',row.outcome]])card.append(node('strong',title),node('p',value));
    const actions=node('div','','export-actions'),authenticated=$('sharePrivate').checked;
    if(row.hasImage)actions.append(button('查看圖片',async()=>{
      const result=await request('detail',{month:row.month,id:row.id},authenticated);
      if(!result.item?.image)return;if(!/^data:image\/(png|jpeg|webp);base64,/.test(result.item.image))throw Error('圖片格式不符。');
      let img=card.querySelector('img');if(!img){img=document.createElement('img');img.alt='案例分享圖片';card.append(img);}img.src=result.item.image;
    }));
    if(row.editable)actions.append(button('編輯',async()=>{
      if(needsReadback)throw Error('請先讀取分享，確認上次提交結果。');resetEditor();editing={id:row.id,version:row.version,month:row.month};
      for(const [id,key] of [['shareType','type'],['shareScenario','scenario'],['shareApproach','approach'],['shareOutcome','outcome']])$(id).value=row[key];
      $('shareIdentity').hidden=true;$('shareConsentWrap').hidden=true;$('shareRemoveImageWrap').hidden=false;for(const id of ['shareInputStore','shareInputAuthor','shareConsent'])$(id).required=false;$('shareAuthor').textContent=row.store+' · '+row.author+(row.authorUnverified?'（自填未驗證）':'');$('shareEditorTitle').textContent='編輯分享（建立日不變）';$('shareEditor').open=true;$('shareScenario').focus();
    }));
    if(profile?.supervisor){const moderate=async(featured,hidden)=>{await request('moderate',{month:row.month,id:row.id,version:row.version,featured,hidden},true);await load();message('案例管理設定已儲存。');};actions.append(button(row.featured?'取消優良案例':'標記優良案例',()=>moderate(!row.featured,row.hidden)),button(row.hidden?'恢復顯示':'隱藏分享',()=>moderate(row.featured,!row.hidden)));}
    card.append(actions);list.append(card);
  }
}
async function reconcile(){
  if(!needsReadback||!attempt)return;
  let item;
  if(attempt.authenticated){
    const p=attempt.payload,r=await request('list',{month:p.month},true),found=r.cases.find(row=>row.id===p.id);
    if(found&&found.version!==p.version){
      if(found.version!==p.version+1||['type','scenario','approach','outcome'].some(k=>found[k]!==p[k].trim())){needsReadback=false;throw Error('案例已被其他操作更新；請清空／取消編輯後，以重新讀取的版本為準。');}
      if(p.image!==null){const detail=await request('detail',{month:p.month,id:p.id},true);if(detail.item.image!==p.image){needsReadback=false;throw Error('圖片已變更；請取消編輯後重新讀取。');}}
      item=found;
    }
  }
  else {const r=await request('receipt',{requestId:attempt.payload.requestId});if(r.found)item=r.item;}
  needsReadback=false;if(item){resetEditor();$('shareEditor').open=false;message('已讀回上次提交；未重送。');}else message('未找到上次提交，可用原內容再次按儲存；未自動重送。');
}
async function load(){
  const ticket=epoch;message('正在讀取同仁分享…');
  try{
    await reconcile();const r=range(),authenticated=$('sharePrivate').checked,legacy=$('shareView').value==='legacy';let result;if(legacy&&!authenticated)throw Error('原月份檢視需要原同仁登入權限。');
    if(authenticated){proof();const months=[];let cursor=r.start.slice(0,7);while(cursor<=r.end.slice(0,7)){months.push(cursor);const d=new Date(cursor+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+1);cursor=d.toISOString().slice(0,7);}const cases=[];
      for(const month of months){result=await request('list',{month},true);cases.push(...result.cases);}rows=legacy?cases:cases.filter(row=>row.createdDate>=r.start&&row.createdDate<=r.end);profile=result.profile;
      clearTimeout(leaseTimer);leaseTimer=setTimeout(()=>{ $('sharePrivate').checked=false;clear('登入已到期，私有分享已清除；可重新讀取公開分享。',true);},Math.max(0,proof().expiresAt-Date.now()));
    }else{result=await request('list',r);rows=result.cases;profile=null;}
    if(ticket!==epoch)return false;loaded=true;filters();render();message(legacy?`已讀取原分享月份 ${r.start.slice(0,7)}；每則另列首次建立日（台灣時間）。`:`已讀取 ${r.start} 至 ${r.end} 的${authenticated?'登入可見':'公開'}分享（台灣時間）。`);return true;
  }catch(error){if(ticket===epoch){clear();showError(error);}return false;}
}
async function imageData(file){if(!file)return '';if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>800*1024)throw Error('請選擇 800 KB 以內的 PNG、JPEG 或 WebP 圖片。');return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('圖片讀取失敗。'));reader.readAsDataURL(file);});}
$('shareForm').addEventListener('submit',async event=>{
  event.preventDefault();if(pending)return;
  try{
    if(needsReadback)throw Error('上次提交結果不明，請先按「讀取分享」確認；不會自動重送。');
    const ticket=epoch,uploaded=await imageData($('shareImage').files[0]);if(ticket!==epoch)return;
    const content={type:$('shareType').value,scenario:$('shareScenario').value,approach:$('shareApproach').value,outcome:$('shareOutcome').value,image:editing?(uploaded||($('shareRemoveImage').checked?'':null)):uploaded};
    const authenticated=Boolean(editing||optionalProof());
    if(!editing&&!$('shareConsent').checked)throw Error('請確認分享將公開給持連結者查看。');
    const form=JSON.stringify([editing,content,$('shareInputStore').value,$('shareInputAuthor').value]);
    if(attempt&&attempt.form!==form)throw Error('上次提交已讀回為未找到；請用原內容重試，或按清空後另填。');
    if(!attempt){
      const identity={store:$('shareInputStore').value,author:$('shareInputAuthor').value};
      const payload=editing?{...editing,...content}:authenticated?{month:today().slice(0,7),id:crypto.randomUUID(),version:0,...content,publicConsent:true,publicStore:identity.store,publicAuthor:identity.author}:{requestId:crypto.randomUUID(),submittedAt:Date.now(),...identity,consent:true,...content};
      attempt={authenticated,payload,form};
    }
    needsReadback=true;const result=await request(attempt.authenticated?'save':'create',attempt.payload,attempt.authenticated);
    resetEditor();$('shareEditor').open=false;await load();message('分享已儲存；建立日 '+result.item.createdDate+'（台灣時間）。'+(!authenticated?'免登入提交無自行編輯權限，需修改請洽督導。':''));
  }catch(error){showError(error);}
});
$('shareCancel').onclick=()=>{if(needsReadback){message('請先讀取分享確認上次提交結果，再清空內容。');return;}resetEditor();};$('shareRefresh').onclick=()=>void load();
for(const id of ['shareStore','shareStaff','shareFilterType'])$(id).addEventListener('change',()=>{if(id==='shareStore')filters();render();});
function datesChanged(){clear('分享日期已變更，請重新讀取。');if($('scope-sharing').getAttribute('aria-selected')==='true')void load();}
for(const id of ['shareView','shareDay','shareStart','shareEnd','sharePrivate','shareLegacyMonth'])$(id).addEventListener('change',()=>{if(!$('sharePrivate').checked&&$('shareView').value==='legacy')$('shareView').value='daily';$('shareLegacyOption').disabled=!$('sharePrivate').checked;$('shareDailyControls').hidden=$('shareView').value!=='daily';$('shareRangeControls').hidden=$('shareView').value!=='range';$('shareLegacyControls').hidden=$('shareView').value!=='legacy';datesChanged();});
$('scope-sharing').addEventListener('click',()=>{if(!loaded&&!pending)void load();});
$('scope-sharing').addEventListener('focus',()=>{if($('scope-sharing').getAttribute('aria-selected')==='true'&&!loaded&&!pending)void load();});
window.addEventListener('pagehide',()=>clear());document.addEventListener('visibilitychange',()=>{if(document.hidden)clear('已暫停分享，返回後請重新讀取。');});
for(const name of ['portal-before-logout','portal-login-changed'])window.addEventListener(name,()=>{$('sharePrivate').checked=false;clear('登入狀態已變更，私有分享已清除。',true);});
window.addEventListener('storage',event=>{if(event.key===LOGOUT||event.key===null){$('sharePrivate').checked=false;clear('登入狀態已變更，私有分享已清除。',true);}});
const day=today();$('shareLegacyMonth').value=day.slice(0,7);$('shareDay').value=day;$('shareStart').value=day.slice(0,7)+'-01';const end=new Date(day.slice(0,7)+'-01T00:00:00Z');end.setUTCMonth(end.getUTCMonth()+1);end.setUTCDate(0);$('shareEnd').value=end.toISOString().slice(0,10);
$('shareInputStore').replaceChildren(option('','選擇店點'),...window.TradeinPerformanceCore.STORES.map(s=>option(s[1],s[1])));
