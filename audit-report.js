(function(){
'use strict';

const GAS_URL='https://script.google.com/macros/s/AKfycbznzoWOzzPJLEh8PCwTLw8UfWEyiCXwawd0T49JXpK4MP70vTdrrfTMN1G2Grghd-Mv/exec';
const DRAFT_KEY='bei12b_audit_draft_v1';
const PT_TOKEN_KEY='bei12b_pt_session_token';
const DB_NAME='bei12b-audit-drafts';
const DB_STORE='photos';
const MAX_PHOTOS=10;
const MAX_DIMENSION=2048;
const JPEG_QUALITY=.9;
const STATUS_LABELS={missing:'未回報',draft:'未回報',submitted:'已回報待檢查',rework:'待補件',approved:'驗收完成'};

const state={config:null,draft:null,server:null,submitting:false,mode:'store',ptToken:sessionStorage.getItem(PT_TOKEN_KEY)||'',overview:null,reauthPromise:null,reauthResolve:null,photoViewer:{photos:[],index:0}};

function uid(prefix){
  const bytes=new Uint8Array(18);crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}`;
}

function blankDraft(){
  return {batch_id:'',store_id:'',inspector_name:'',submission_id:uid('submission'),edit_token:uid('edit'),notes:{},items:{},updated_at:''};
}

function loadDraft(){
  try{const value=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');state.draft=value&&value.submission_id&&value.edit_token?value:blankDraft();}
  catch{state.draft=blankDraft();}
  state.draft.notes=state.draft.notes||{};state.draft.items=state.draft.items||{};
}

function saveDraft(){
  state.draft.updated_at=new Date().toISOString();
  localStorage.setItem(DRAFT_KEY,JSON.stringify(state.draft));
  const el=document.getElementById('draftState');if(el){el.textContent='草稿已保存';window.clearTimeout(saveDraft.timer);saveDraft.timer=window.setTimeout(()=>el.textContent='草稿將自動保存',1200);}
}

function openDb(){
  return new Promise((resolve,reject)=>{const request=indexedDB.open(DB_NAME,1);request.onupgradeneeded=()=>request.result.createObjectStore(DB_STORE);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
}

async function dbPut(key,value){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(value,key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
async function dbGet(key){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readonly');const request=tx.objectStore(DB_STORE).get(key);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>reject(request.error);tx.oncomplete=()=>db.close();});}
async function dbDelete(key){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).delete(key);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>{db.close();reject(tx.error);};});}
function blobKey(photoId){return `${state.draft.submission_id}|${photoId}`;}

async function api(payload){
  let response;
  try{response=await fetch(GAS_URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),cache:'no-store'});}catch{throw new Error('無法連上稽核服務，請確認網路後再試');}
  const raw=await response.text();let result;
  try{result=JSON.parse(raw);}catch{throw new Error('稽核服務回應無法辨識，請稍後再試');}
  if(!response.ok||result.status!=='ok'){const error=new Error(result.message||`服務暫時無法使用（${response.status}）`);error.unauthorized=result.message==='unauthorized';throw error;}
  return result;
}

function message(text,type=''){
  const box=document.getElementById('globalMessage');box.hidden=!text;box.textContent=text||'';box.className=`message ${type}`.trim();
  if(text) box.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function itemState(itemId){
  const current=state.draft.items[itemId]||(state.draft.items[itemId]={photos:[]});current.photos=current.photos||[];return current;
}

function storeById(storeId){return state.config?.stores.find(store=>store.store_id===storeId);}

function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}

function renderConfig(){
  const {batch,stores}=state.config;
  document.getElementById('batchMeta').textContent=`${batch.batch_name}｜${batch.starts_on} 至 ${batch.due_on}`;
  const storeSelect=document.getElementById('storeSelect');
  storeSelect.innerHTML='<option value="">請選擇店點</option>'+stores.map(store=>`<option value="${escapeHtml(store.store_id)}">${escapeHtml(store.store_name)}</option>`).join('');
  document.getElementById('storeFilter').innerHTML='<option value="">全部店點</option>'+stores.map(store=>`<option value="${escapeHtml(store.store_id)}">${escapeHtml(store.store_name)}</option>`).join('');
  state.draft.batch_id=batch.batch_id;
  storeSelect.value=state.draft.store_id||'';
  document.getElementById('inspectorName').value=state.draft.inspector_name||'';
  renderItems();saveDraft();
}

function renderItems(){
  const list=document.getElementById('itemList');list.replaceChildren();
  const template=document.getElementById('itemTemplate');
  const returned=new Set((state.server?.items||[]).filter(item=>item.status==='rework').map(item=>item.item_id));
  const rework=state.server?.submission_status==='rework';
  state.config.items.forEach((item,index)=>{
    const node=template.content.cloneNode(true);const section=node.querySelector('.audit-item');section.dataset.itemId=item.item_id;
    node.querySelector('.card-number').textContent=String(index+2).padStart(2,'0');node.querySelector('h3').textContent=item.item_name;
    const note=node.querySelector('.item-note');note.value=state.draft.notes[item.item_id]||'';note.addEventListener('input',()=>{state.draft.notes[item.item_id]=note.value;saveDraft();});
    const serverItem=state.server?.items?.find(row=>row.item_id===item.item_id);const reason=node.querySelector('.return-reason');
    if(serverItem?.status==='rework'){reason.hidden=false;reason.textContent=`退回原因：${serverItem.reviewer_comment||'請補充照片'}`;}
    const locked=rework&&!returned.has(item.item_id);section.classList.toggle('locked',locked);
    const input=node.querySelector('.photo-input');input.disabled=locked;input.addEventListener('change',event=>addPhotos(item.item_id,Array.from(event.target.files||[])).finally(()=>{input.value='';}));
    note.disabled=locked;
    list.appendChild(node);renderItemPhotos(item.item_id);
  });
  updateCompletion();
}

async function hydratePhotoUrls(){
  for(const item of state.config.items){for(const photo of itemState(item.item_id).photos){if(!photo.objectUrl&&!photo.server&&!photo.deleted){const stored=await dbGet(blobKey(photo.id));if(stored?.bytes) photo.objectUrl=URL.createObjectURL(new Blob([stored.bytes],{type:stored.type||photo.type||'image/jpeg'}));}}}
}

async function addPhotos(itemId,files){
  if(!files.length)return;const item=itemState(itemId);const active=item.photos.filter(photo=>!photo.deleted);
  const seen=new Set(active.map(photo=>photo.fingerprint));const unique=[];
  for(const file of files){if(!String(file.type||'').startsWith('image/')){message(`${file.name||'選取的檔案'} 不是照片，已略過`,'error');continue;}const fingerprint=`${file.name}|${file.size}|${file.lastModified}`;if(!seen.has(fingerprint)){seen.add(fingerprint);unique.push({file,fingerprint});}}
  if(active.length+unique.length>MAX_PHOTOS){message(`單項最多 ${MAX_PHOTOS} 張；目前已有 ${active.length} 張，本次只能再加入 ${MAX_PHOTOS-active.length} 張。`,'error');return;}
  for(const entry of unique){const id=uid('photo');const bytes=await entry.file.arrayBuffer();await dbPut(blobKey(id),{bytes,name:entry.file.name,type:entry.file.type,lastModified:entry.file.lastModified});item.photos.push({id,name:entry.file.name,type:entry.file.type,size:entry.file.size,lastModified:entry.file.lastModified,fingerprint:entry.fingerprint,status:'pending',error:'',server:null,objectUrl:URL.createObjectURL(entry.file)});}
  saveDraft();renderItemPhotos(itemId);updateCompletion();
}

async function removePhoto(itemId,photoId){
  const item=itemState(itemId);const photo=item.photos.find(row=>row.id===photoId);if(!photo||photo.locked)return;
  if(photo.status==='uploaded'){
    try{await api({action:'audit_photo_delete',submission_id:state.draft.submission_id,edit_token:state.draft.edit_token,client_photo_id:photo.id});}
    catch(error){message(error.message,'error');return;}
  }
  if(photo.objectUrl)URL.revokeObjectURL(photo.objectUrl);photo.deleted=true;await dbDelete(blobKey(photo.id));saveDraft();renderItemPhotos(itemId);updateCompletion();
}

function itemPhotos(itemId){return itemState(itemId).photos.filter(photo=>!photo.deleted);}

function renderItemPhotos(itemId){
  const section=document.querySelector(`.audit-item[data-item-id="${itemId}"]`);if(!section)return;const photos=itemPhotos(itemId);section.querySelector('.photo-count').textContent=`${photos.length}／${MAX_PHOTOS} 張`;
  const grid=section.querySelector('.photo-grid');grid.replaceChildren();
  photos.forEach((photo,index)=>{
    const tile=document.createElement('div');tile.className='photo-tile';const img=document.createElement('img');img.alt=`第 ${index+1} 張照片`;img.src=photo.objectUrl||photo.server?.private_url||'';tile.appendChild(img);
    const preview=document.createElement('button');preview.type='button';preview.className='preview-button';preview.setAttribute('aria-label',`放大預覽第 ${index+1} 張照片`);preview.addEventListener('click',()=>openPhotoViewer(photos,index));tile.appendChild(preview);
    if(!photo.locked&&!state.submitting){const del=document.createElement('button');del.type='button';del.className='delete-button';del.textContent='×';del.setAttribute('aria-label',`刪除第 ${index+1} 張照片`);del.addEventListener('click',()=>removePhoto(itemId,photo.id));tile.appendChild(del);}
    const badge=document.createElement('span');badge.className=`photo-state ${photo.status||''}`;badge.textContent=photo.status==='uploaded'?'已上傳':photo.status==='failed'?'上傳失敗':'待上傳';tile.appendChild(badge);grid.appendChild(tile);
  });
  const status=section.querySelector('.item-status');const ready=photos.length>0;status.textContent=ready?`${photos.length} 張`:'未完成';status.className=`item-status ${ready?'ready':''}`;
}

function requiredItemIds(){
  if(state.server?.submission_status==='rework')return state.server.items.filter(item=>item.status==='rework').map(item=>item.item_id);
  return state.config.items.map(item=>item.item_id);
}

function validation(){
  const errors=[];if(!state.draft.store_id)errors.push('門市店點');if(!String(state.draft.inspector_name||'').trim())errors.push('檢查人員姓名');
  requiredItemIds().forEach(itemId=>{if(!itemPhotos(itemId).length)errors.push(state.config.items.find(item=>item.item_id===itemId).item_name);});return errors;
}

function updateCompletion(){
  if(!state.config)return;const missing=validation();const itemsMissing=requiredItemIds().filter(itemId=>!itemPhotos(itemId).length);const completion=document.getElementById('completionText');const detail=document.getElementById('missingText');
  completion.textContent=itemsMissing.length?`尚未完成 ${itemsMissing.length} 個項目`:(missing.length?'基本資料尚未完成':'三項照片已備妥');detail.textContent=missing.length?`缺少：${missing.join('、')}`:'送出後會逐張上傳並做雲端讀回確認。';
  document.getElementById('submitButton').disabled=state.submitting||missing.length>0;
}

async function compressPhoto(file){
  let bitmap;try{bitmap=await createImageBitmap(file);}catch{return file;}
  const scale=Math.min(1,MAX_DIMENSION/Math.max(bitmap.width,bitmap.height));if(scale===1&&file.size<=3*1024*1024){bitmap.close();return file;}
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',JPEG_QUALITY));return blob||file;
}

async function ensureSubmission(){
  return api({action:'audit_start',batch_id:state.config.batch.batch_id,submission_id:state.draft.submission_id,edit_token:state.draft.edit_token,store_id:state.draft.store_id,inspector_name:String(state.draft.inspector_name||'').trim()});
}

async function uploadPending(){
  const targets=[];requiredItemIds().forEach(itemId=>itemPhotos(itemId).filter(photo=>photo.status!=='uploaded'&&!photo.server).forEach(photo=>targets.push({itemId,photo})));
  const failures=[];
  for(let index=0;index<targets.length;index++){
    const {itemId,photo}=targets[index];message(`正在上傳第 ${index+1}／${targets.length} 張：${photo.name}`);photo.status='uploading';renderItemPhotos(itemId);
    try{
      const stored=await dbGet(blobKey(photo.id));if(!stored?.bytes)throw new Error('本機照片暫存遺失，請刪除後重新選取');const source=new Blob([stored.bytes],{type:stored.type||photo.type||'image/jpeg'});const compressed=await compressPhoto(source);const base64=await blobToBase64(compressed);
      const result=await api({action:'audit_upload',submission_id:state.draft.submission_id,edit_token:state.draft.edit_token,item_id:itemId,client_photo_id:photo.id,note:state.draft.notes[itemId]||'',file:{name:photo.name,type:compressed.type||photo.type||'image/jpeg',size:compressed.size,base64}});
      photo.status='uploaded';photo.error='';photo.server=result.photo;saveDraft();
    }catch(error){photo.status='failed';photo.error=error.message;failures.push(photo);saveDraft();}
    renderItemPhotos(itemId);
  }
  if(failures.length)throw new Error(`${failures.length} 張照片上傳失敗；成功照片已保留，請只重試失敗照片。`);
}

function blobToBase64(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('讀取照片失敗'));reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');reader.readAsDataURL(blob);});}

async function submitReport(event){
  event.preventDefault();if(state.submitting)return;state.draft.store_id=document.getElementById('storeSelect').value;state.draft.inspector_name=document.getElementById('inspectorName').value.trim();saveDraft();const missing=validation();if(missing.length){message(`請先完成：${missing.join('、')}`,'error');updateCompletion();return;}
  state.submitting=true;renderItems();updateCompletion();
  try{await ensureSubmission();await uploadPending();message('照片已上傳，正在寫入回報並讀回確認…');const result=await api({action:'audit_submit',submission_id:state.draft.submission_id,edit_token:state.draft.edit_token,notes:state.draft.notes});if(result.readback_verified!==true)throw new Error('雲端讀回尚未確認，請稍後重試');applyServerStatus(result);message('全部寫入並讀回確認完成。','success');}
  catch(error){message(error.message,'error');}
  finally{state.submitting=false;renderItems();updateCompletion();}
}

function mergeServerPhotos(server){
  server.items.forEach(item=>{const local=itemState(item.item_id);item.photos.forEach(photo=>{let existing=local.photos.find(row=>row.id===photo.client_photo_id);if(existing){existing.server=photo;existing.status='uploaded';existing.locked=Number(photo.revision)<Number(server.revision)||server.submission_status!=='draft';}else local.photos.push({id:photo.client_photo_id,name:photo.photo_name,type:'image/*',size:0,lastModified:0,fingerprint:`server:${photo.client_photo_id}`,status:'uploaded',error:'',server:photo,objectUrl:'',locked:true});});});saveDraft();
}

function applyServerStatus(result){
  state.server=result;state.draft.batch_id=result.batch_id;state.draft.store_id=result.store_id;state.draft.inspector_name=result.inspector_name;result.items.forEach(item=>{state.draft.notes[item.item_id]=item.note||state.draft.notes[item.item_id]||'';});mergeServerPhotos(result);renderServerState();
}

function renderServerState(){
  const server=state.server;if(!server)return;document.getElementById('storeSelect').value=server.store_id;document.getElementById('inspectorName').value=server.inspector_name;
  const closed=['submitted','approved'].includes(server.submission_status);document.getElementById('auditForm').hidden=closed;document.getElementById('completionCard').hidden=!closed&&server.submission_status!=='rework';
  const store=storeById(server.store_id);const counts=server.items.map(item=>`${item.item_name} ${item.photo_count} 張`).join('、');
  document.getElementById('completionTitle').textContent=server.submission_status==='approved'?'驗收完成':server.submission_status==='rework'?'待補件':'回報完成';
  document.getElementById('completionSummary').innerHTML=`<dt>門市</dt><dd>${escapeHtml(store?.store_name||server.store_name)}</dd><dt>檢查人員</dt><dd>${escapeHtml(server.inspector_name)}</dd><dt>首次回報時間</dt><dd>${escapeHtml(server.submitted_at||'尚未正式送出')}</dd><dt>照片</dt><dd>${escapeHtml(counts)}</dd>`;
  renderTimeline(server.timeline||[]);renderItems();
  if(server.submission_status==='rework'){document.getElementById('auditForm').hidden=false;message('督導已退回指定項目；只需補件紅色項目，原照片與退回原因均已保留。','error');}
}

function renderTimeline(entries){
  const labels={created:'建立草稿',submitted:'首次送出',returned:'退回補件',resubmitted:'補件送出',approved:'項目通過'};document.getElementById('timeline').innerHTML='<h3>處理時間軸</h3>'+entries.map(entry=>`<div class="timeline-entry"><strong>${escapeHtml(labels[entry.event_type]||entry.event_type)}</strong> ${escapeHtml(entry.item_name||'')}<br><small>${escapeHtml(entry.created_at)}${entry.comment?`・${escapeHtml(entry.comment)}`:''}</small></div>`).join('');
}

async function restoreOwnSubmission(){
  try{const result=await api({action:'audit_status',submission_id:state.draft.submission_id,edit_token:state.draft.edit_token});applyServerStatus(result);}catch(error){if(!/找不到本次回報/.test(error.message))message(error.message,'error');}
}

function openPhotoViewer(photos,index){
  state.photoViewer={photos,index};renderPhotoViewer();document.getElementById('photoDialog').showModal();
}

function renderPhotoViewer(){
  const {photos,index}=state.photoViewer;const photo=photos[index];if(!photo)return;document.getElementById('dialogImage').src=photo.objectUrl||photo.server?.private_url||photo.private_url||'';document.getElementById('dialogCaption').textContent=`第 ${index+1}／${photos.length} 張｜${photo.name||photo.photo_name||''}`;document.getElementById('previousPhoto').disabled=index===0;document.getElementById('nextPhoto').disabled=index===photos.length-1;
}

function switchMode(){
  state.mode=state.mode==='store'?'supervisor':'store';document.getElementById('storeView').hidden=state.mode!=='store';document.getElementById('supervisorView').hidden=state.mode!=='supervisor';document.getElementById('modeSwitch').textContent=state.mode==='store'?'督導驗收':'返回門市填報';if(state.mode==='supervisor')restoreSupervisor();
}

function setSupervisorAuthMessage(text){document.getElementById('supervisorAuthMessage').textContent=text||'';}

async function restoreSupervisor(){
  if(!state.ptToken){showSupervisorGate();return;}
  try{const result=await api({action:'ptauth',token:state.ptToken});state.ptToken=result.token;sessionStorage.setItem(PT_TOKEN_KEY,state.ptToken);showSupervisorWorkspace();await loadOverview();}
  catch{clearSupervisorAuth();showSupervisorGate();setSupervisorAuthMessage('session 已失效，請重新輸入督導通行碼');}
}

async function supervisorLogin(event){
  event.preventDefault();const button=document.getElementById('supervisorLoginButton');const key=document.getElementById('supervisorPasscode').value.trim();if(!key){setSupervisorAuthMessage('請輸入督導通行碼');return;}button.disabled=true;setSupervisorAuthMessage('正在驗證…');
  try{const result=await api({action:'ptauth',key});state.ptToken=result.token;sessionStorage.setItem(PT_TOKEN_KEY,state.ptToken);document.getElementById('supervisorPasscode').value='';showSupervisorWorkspace();await loadOverview();}
  catch(error){setSupervisorAuthMessage(error.unauthorized?'督導通行碼錯誤':error.message);}
  finally{button.disabled=false;}
}

function clearSupervisorAuth(){state.ptToken='';sessionStorage.removeItem(PT_TOKEN_KEY);}
function showSupervisorGate(){document.getElementById('supervisorGate').hidden=false;document.getElementById('supervisorWorkspace').hidden=true;}
function showSupervisorWorkspace(){document.getElementById('supervisorGate').hidden=true;document.getElementById('supervisorWorkspace').hidden=false;}

function supervisorCall(payload,retried=false){
  return api({...payload,token:state.ptToken}).catch(async error=>{if(!error.unauthorized||retried)throw error;const ok=await waitForReauth();if(!ok)throw new Error('督導驗證未完成；草稿與待送資料仍保留');return supervisorCall(payload,true);});
}

function waitForReauth(){
  if(state.reauthPromise)return state.reauthPromise;clearSupervisorAuth();document.getElementById('reauthModal').hidden=false;document.getElementById('reauthPasscode').focus();state.reauthPromise=new Promise(resolve=>{state.reauthResolve=resolve;});return state.reauthPromise;
}

function finishReauth(ok){document.getElementById('reauthModal').hidden=true;const resolve=state.reauthResolve;state.reauthPromise=null;state.reauthResolve=null;if(resolve)resolve(ok);}

async function reauthenticate(event){
  event.preventDefault();const key=document.getElementById('reauthPasscode').value.trim();const button=document.getElementById('reauthButton');if(!key){document.getElementById('reauthMessage').textContent='請輸入督導通行碼';return;}button.disabled=true;
  try{const result=await api({action:'ptauth',key});state.ptToken=result.token;sessionStorage.setItem(PT_TOKEN_KEY,state.ptToken);document.getElementById('reauthPasscode').value='';finishReauth(true);}
  catch{document.getElementById('reauthMessage').textContent='督導驗證未成功，請確認通行碼後再試';}
  finally{button.disabled=false;}
}

async function loadOverview(){
  try{state.overview=await supervisorCall({action:'audit_overview'});renderOverview();}
  catch(error){document.getElementById('overviewGrid').innerHTML=`<div class="message error">${escapeHtml(error.message)}</div>`;}
}

function rowDisplayStatus(row){return row.status==='draft'?'missing':row.status;}

function renderOverview(){
  const statusFilter=document.getElementById('statusFilter').value;const storeFilter=document.getElementById('storeFilter').value;const rows=(state.overview?.stores||[]).filter(row=>(!statusFilter||rowDisplayStatus(row)===statusFilter)&&(!storeFilter||row.store_id===storeFilter));
  document.getElementById('overviewGrid').innerHTML=rows.map(row=>{const status=rowDisplayStatus(row);return `<article class="paper-card store-review-card" data-store-id="${escapeHtml(row.store_id)}"><span class="status-chip ${escapeHtml(status)}">${escapeHtml(STATUS_LABELS[status]||status)}</span><h3>${escapeHtml(row.store_name)}</h3><p>檢查人員：${escapeHtml(row.inspector_name||'—')}</p><p>首次回報：${escapeHtml(row.submitted_at||'—')}</p><p>最後補件：${escapeHtml(row.last_rework_at||'—')}</p>${row.items.map(item=>`<button type="button" class="review-item-button" data-submission-id="${escapeHtml(row.submission_id)}" data-item-id="${escapeHtml(item.item_id)}" ${row.submission_id?'':'disabled'}><span>${escapeHtml(item.item_name)}<br><small>${item.photo_count} 張照片</small></span><span class="status-chip ${escapeHtml(item.status==='draft'?'missing':item.status)}">${escapeHtml(STATUS_LABELS[item.status]||item.status)}</span></button>`).join('')}</article>`;}).join('')||'<div class="paper-card store-review-card">沒有符合篩選條件的門市。</div>';
  document.querySelectorAll('.review-item-button[data-submission-id]:not([data-submission-id=""])').forEach(button=>button.addEventListener('click',()=>openReview(button.dataset.submissionId,button.dataset.itemId)));
}

async function openReview(submissionId,focusItemId){
  try{const detail=await supervisorCall({action:'audit_detail',submission_id:submissionId});renderReviewDetail(detail,focusItemId);document.getElementById('reviewDialog').showModal();}
  catch(error){window.alert(error.message);}
}

function renderReviewDetail(detail,focusItemId){
  document.getElementById('reviewDetail').innerHTML=`<h2>${escapeHtml(detail.store_name)}｜督導驗收</h2><p>檢查人員：${escapeHtml(detail.inspector_name)}｜首次回報：${escapeHtml(detail.submitted_at||'—')}｜最後更新：${escapeHtml(detail.updated_at||'—')}</p>`+detail.items.map(item=>`<section class="review-section" data-review-item="${escapeHtml(item.item_id)}"><h3>${escapeHtml(item.item_name)} <span class="status-chip ${escapeHtml(item.status)}">${escapeHtml(STATUS_LABELS[item.status]||item.status)}</span></h3><p>備註：${escapeHtml(item.note||'—')}</p><div class="photo-grid">${(item.photos||[]).map((photo,index)=>`<button type="button" class="photo-tile supervisor-photo" data-item-id="${escapeHtml(item.item_id)}" data-photo-index="${index}"><img src="${escapeHtml(photo.private_url)}" alt="${escapeHtml(item.item_name)}第 ${index+1} 張"><span class="photo-state uploaded">revision ${photo.revision}</span></button>`).join('')}</div>${item.reviewer_comment?`<p class="return-reason">退回原因：${escapeHtml(item.reviewer_comment)}</p>`:''}<label class="review-comment"><span>退回原因</span><textarea rows="2" maxlength="300" placeholder="選擇退回補件時必填"></textarea></label><div class="review-actions"><button type="button" class="approve-button" data-decision="approve">通過</button><button type="button" class="return-button" data-decision="return">退回補件</button></div></section>`).join('')+`<div class="timeline"><h3>時間軸</h3>${(detail.timeline||[]).map(event=>`<div class="timeline-entry">${escapeHtml(event.created_at)}｜${escapeHtml(event.item_name||'整筆')}｜${escapeHtml(event.event_type)}${event.comment?`｜${escapeHtml(event.comment)}`:''}</div>`).join('')}</div>`;
  document.querySelectorAll('.supervisor-photo').forEach(button=>button.addEventListener('click',()=>{const item=detail.items.find(row=>row.item_id===button.dataset.itemId);openPhotoViewer(item.photos.map(photo=>({name:photo.photo_name,server:photo})),Number(button.dataset.photoIndex));}));
  document.querySelectorAll('[data-review-item] [data-decision]').forEach(button=>button.addEventListener('click',()=>reviewItem(detail,button.closest('[data-review-item]'),button.dataset.decision)));
  if(focusItemId)document.querySelector(`[data-review-item="${focusItemId}"]`)?.scrollIntoView({block:'start'});
}

async function reviewItem(detail,section,decision){
  const itemId=section.dataset.reviewItem;const comment=section.querySelector('textarea').value.trim();if(decision==='return'&&!comment){section.querySelector('textarea').focus();window.alert('退回補件必須輸入原因');return;}
  section.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{const updated=await supervisorCall({action:'audit_review',submission_id:detail.submission_id,item_id:itemId,decision,comment});renderReviewDetail(updated,itemId);await loadOverview();}
  catch(error){window.alert(error.message);section.querySelectorAll('button').forEach(button=>button.disabled=false);}
}

async function copyPending(){
  const rows=(state.overview?.stores||[]).filter(row=>['missing','rework','draft'].includes(row.status));const text=rows.map(row=>`${row.store_name}｜${rowDisplayStatus(row)==='rework'?'待補件':'未回報'}`).join('\n')||'目前沒有未回報或待補件門市';await navigator.clipboard.writeText(text);const button=document.getElementById('copyPendingButton');const original=button.textContent;button.textContent='已複製';button.classList.add('copy-flash');setTimeout(()=>{button.textContent=original;button.classList.remove('copy-flash');},1200);
}

async function logoutSupervisor(){const token=state.ptToken;clearSupervisorAuth();showSupervisorGate();state.overview=null;document.getElementById('overviewGrid').replaceChildren();if(token)api({action:'ptlogout',token}).catch(()=>{});}

function bindEvents(){
  document.getElementById('modeSwitch').addEventListener('click',switchMode);document.getElementById('auditForm').addEventListener('submit',submitReport);document.getElementById('storeSelect').addEventListener('change',event=>{state.draft.store_id=event.target.value;saveDraft();updateCompletion();});document.getElementById('inspectorName').addEventListener('input',event=>{state.draft.inspector_name=event.target.value;saveDraft();updateCompletion();});
  document.getElementById('supervisorLoginForm').addEventListener('submit',supervisorLogin);document.getElementById('reauthForm').addEventListener('submit',reauthenticate);document.getElementById('statusFilter').addEventListener('change',renderOverview);document.getElementById('storeFilter').addEventListener('change',renderOverview);document.getElementById('copyPendingButton').addEventListener('click',copyPending);document.getElementById('supervisorLogoutButton').addEventListener('click',logoutSupervisor);
  document.getElementById('closePhotoDialog').addEventListener('click',()=>document.getElementById('photoDialog').close());document.getElementById('previousPhoto').addEventListener('click',()=>{state.photoViewer.index=Math.max(0,state.photoViewer.index-1);renderPhotoViewer();});document.getElementById('nextPhoto').addEventListener('click',()=>{state.photoViewer.index=Math.min(state.photoViewer.photos.length-1,state.photoViewer.index+1);renderPhotoViewer();});
}

async function boot(){
  loadDraft();bindEvents();
  try{state.config=await api({action:'audit_config'});if(state.config.contract!=='audit-cleaning-v1')throw new Error('稽核服務版本不相容');if(state.draft.batch_id&&state.draft.batch_id!==state.config.batch.batch_id)state.draft=blankDraft();state.draft.batch_id=state.config.batch.batch_id;renderConfig();await hydratePhotoUrls();renderItems();await restoreOwnSubmission();}
  catch(error){message(error.message,'error');document.getElementById('auditForm').hidden=true;}
}

window.AuditReportApp={uid,validation,requiredItemIds,MAX_PHOTOS,STATUS_LABELS};
document.addEventListener('DOMContentLoaded',boot);
})();
