'use strict';

const GAS_URL='https://script.google.com/macros/s/AKfycbznzoWOzzPJLEh8PCwTLw8UfWEyiCXwawd0T49JXpK4MP70vTdrrfTMN1G2Grghd-Mv/exec';
const DRAFT_KEY='bei12b_audit_draft_v1';
const PT_TOKEN_KEY='bei12b_pt_session_token';
const EMPLOYEE_ID_KEY='bei12b_audit_employee_id';
const LEGACY_EMPLOYEE_ID_KEY='north12b_private_dashboard_employee_id';
const DB_NAME='bei12b-audit-drafts';
const DB_STORE='photos';
const MAX_PHOTOS=10;
const MAX_DIMENSION=2048;
const JPEG_QUALITY=.9;
const CONTRACT='audit-cleaning-v2-self-report';
const GAS_MESSAGE_TYPE='north12b-gas-response-v1';
const GAS_MESSAGE_ORIGINS=new Set(['https://script.google.com','https://script.googleusercontent.com']);
const STATUS_LABELS={missing:'未回報',draft:'未回報',submitted:'已回報待檢查',rework:'待補件',approved:'驗收完成',cancelled:'已取消'};

const state={
  config:null,
  draft:null,
  server:null,
  submitting:false,
  mode:'store',
  ptToken:sessionStorage.getItem(PT_TOKEN_KEY)||'',
  overview:null,
  reviewDetail:null,
  reauthPromise:null,
  reauthResolve:null,
  privatePhotoUrls:new Set(),
  photoViewer:{photos:[],index:0,returnFocus:null}
};

function uid(prefix){
  const bytes=new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return `${prefix}_${Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')}`;
}

function blankDraft(){
  return {
    batch_id:'',store_id:'',inspector_name:'',employee_id:'',
    submission_id:uid('submission'),edit_token:uid('edit'),notes:{},items:{},updated_at:''
  };
}

function loadDraft(){
  try{
    const value=JSON.parse(localStorage.getItem(DRAFT_KEY)||'null');
    state.draft=value&&typeof value==='object'
      ?{...blankDraft(),...value,submission_id:value.submission_id||uid('submission'),edit_token:value.edit_token||uid('edit')}
      :blankDraft();
  }catch{
    state.draft=blankDraft();
  }
  if(/[*＊]/.test(String(state.draft.inspector_name||'')))state.draft.inspector_name='';
  state.draft.employee_id=String(
    state.draft.employee_id||localStorage.getItem(EMPLOYEE_ID_KEY)||sessionStorage.getItem(LEGACY_EMPLOYEE_ID_KEY)||''
  ).trim().toUpperCase();
  state.draft.notes=state.draft.notes||{};
  state.draft.items=state.draft.items||{};
  Object.values(state.draft.items).forEach(item=>(item.photos||[]).forEach(photo=>{
    photo.objectUrl='';
    photo.privateObjectUrl=false;
  }));
}

function saveDraft(){
  state.draft.updated_at=new Date().toISOString();
  localStorage.setItem(DRAFT_KEY,JSON.stringify(state.draft));
  if(state.draft.employee_id)localStorage.setItem(EMPLOYEE_ID_KEY,state.draft.employee_id);
  const el=document.getElementById('draftState');
  if(el){
    el.textContent='草稿已保存';
    window.clearTimeout(saveDraft.timer);
    saveDraft.timer=window.setTimeout(()=>el.textContent='草稿將自動保存',1200);
  }
}

function openDb(){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(DB_STORE);
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}

async function dbPut(key,value){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(DB_STORE,'readwrite');
    tx.objectStore(DB_STORE).put(value,key);
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error);};
  });
}

async function dbGet(key){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(DB_STORE,'readonly');
    const request=tx.objectStore(DB_STORE).get(key);
    request.onsuccess=()=>resolve(request.result||null);
    request.onerror=()=>reject(request.error);
    tx.oncomplete=()=>db.close();
  });
}

async function dbDelete(key){
  const db=await openDb();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(DB_STORE,'readwrite');
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete=()=>{db.close();resolve();};
    tx.onerror=()=>{db.close();reject(tx.error);};
  });
}

function blobKey(photoId){return `${state.draft.submission_id}|${photoId}`;}

async function migrateDraftBatch(nextBatchId){
  const previousBatchId=String(state.draft.batch_id||'');
  if(!previousBatchId||previousBatchId===nextBatchId){
    state.draft.batch_id=nextBatchId;
    return;
  }
  const previousSubmissionId=state.draft.submission_id;
  const nextSubmissionId=uid('submission');
  const photos=Object.values(state.draft.items||{}).flatMap(item=>item.photos||[]);
  for(const photo of photos){
    if(photo.deleted)continue;
    const stored=await dbGet(`${previousSubmissionId}|${photo.id}`).catch(()=>null);
    if(stored?.bytes){
      await dbPut(`${nextSubmissionId}|${photo.id}`,stored);
      photo.server=null;
      photo.status='pending';
      photo.error='';
      photo.locked=false;
      photo.migrationMissing=false;
    }else{
      photo.server=null;
      photo.status='failed';
      photo.error='舊批次照片檔案無法重新上傳，請刪除此張後重新選取';
      photo.locked=false;
      photo.migrationMissing=true;
    }
  }
  state.server=null;
  state.draft.batch_id=nextBatchId;
  state.draft.submission_id=nextSubmissionId;
  state.draft.edit_token=uid('edit');
  saveDraft();
  message('已保留舊草稿資料並切換至目前批次；若照片顯示需重新選取，請只補該張。','success');
}

function allowedGasMessageOrigin(origin){
  if(typeof origin!=='string'||!origin)return false;
  try{
    const parsed=new URL(origin);
    return parsed.protocol==='https:'&&!parsed.port&&(
      GAS_MESSAGE_ORIGINS.has(parsed.origin)||parsed.hostname.endsWith('-script.googleusercontent.com')
    );
  }catch{return false;}
}

async function api(payload){
  return new Promise((resolve,reject)=>{
    const requestId=uid('audit_request');
    let endpoint;
    try{
      endpoint=new URL(GAS_URL,window.location.href);
      endpoint.searchParams.set('transport','iframe');
      endpoint.searchParams.set('requestId',requestId);
      endpoint.searchParams.set('origin',window.location.origin||'null');
    }catch{
      reject(new Error('稽核服務網址格式錯誤'));
      return;
    }
    const frame=document.createElement('iframe');
    const form=document.createElement('form');
    const field=document.createElement('textarea');
    const frameName=`audit_transport_${requestId}`;
    let finished=false;
    const cleanup=()=>{
      window.removeEventListener('message',onMessage);
      window.clearTimeout(timeoutId);
      frame.remove();
      form.remove();
    };
    const finish=(error,result)=>{
      if(finished)return;
      finished=true;
      cleanup();
      if(error)reject(error);else resolve(result);
    };
    const onMessage=event=>{
      const message=event.data;
      if(!allowedGasMessageOrigin(event.origin)||!event.source||!message||message.type!==GAS_MESSAGE_TYPE||message.requestId!==requestId)return;
      const result=message.body;
      if(!result||result.status!=='ok'){
        const error=new Error(result?.message||'稽核服務回應失敗');
        error.unauthorized=result?.message==='unauthorized';
        finish(error);
        return;
      }
      finish(null,result);
    };
    const timeoutId=window.setTimeout(()=>finish(new Error('稽核服務連線逾時，請稍後再試')),30000);
    frame.name=frameName;
    frame.title='稽核服務傳輸';
    frame.hidden=true;
    form.method='POST';
    form.action=endpoint.toString();
    form.target=frameName;
    form.enctype='application/x-www-form-urlencoded';
    form.acceptCharset='UTF-8';
    form.hidden=true;
    field.name='payload';
    field.value=JSON.stringify(payload);
    form.appendChild(field);
    window.addEventListener('message',onMessage);
    document.body.append(frame,form);
    try{form.submit();}catch{finish(new Error('無法連上稽核服務，請確認網路後再試'));}
  });
}

function storeCall(payload){return api(payload);}

function message(text,type=''){
  const box=document.getElementById('globalMessage');
  box.hidden=!text;
  box.textContent=text||'';
  box.className=`message ${type}`.trim();
  if(text)box.scrollIntoView({behavior:'smooth',block:'nearest'});
}

function itemState(itemId){
  const current=state.draft.items[itemId]||(state.draft.items[itemId]={photos:[]});
  current.photos=current.photos||[];
  return current;
}

function itemPhotos(itemId){return itemState(itemId).photos.filter(photo=>!photo.deleted);}
function storeById(storeId){return state.config?.stores.find(store=>store.store_id===storeId);}
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));}

function renderConfig(){
  const {batch,stores}=state.config;
  document.getElementById('batchMeta').textContent=`${batch.batch_name}｜${batch.starts_on} 至 ${batch.due_on}`;
  const storeSelect=document.getElementById('storeSelect');
  storeSelect.innerHTML='<option value="">請選擇門市</option>'+stores.map(store=>`<option value="${escapeHtml(store.store_id)}">${escapeHtml(store.store_name)}</option>`).join('');
  storeSelect.disabled=false;
  storeSelect.setAttribute('aria-readonly','false');
  document.getElementById('storeFilter').innerHTML='<option value="">全部店點</option>'+stores.map(store=>`<option value="${escapeHtml(store.store_id)}">${escapeHtml(store.store_name)}</option>`).join('');
  state.draft.batch_id=batch.batch_id;
  storeSelect.value=state.draft.store_id||'';
  document.getElementById('inspectorName').value=state.draft.inspector_name||'';
  document.getElementById('storeEmployeeId').value=state.draft.employee_id||'';
  renderItems();
  saveDraft();
}

function renderItems(){
  const list=document.getElementById('itemList');
  list.replaceChildren();
  const template=document.getElementById('itemTemplate');
  const returned=new Set((state.server?.items||[]).filter(item=>item.status==='rework').map(item=>item.item_id));
  const rework=state.server?.submission_status==='rework';
  state.config.items.forEach((item,index)=>{
    const node=template.content.cloneNode(true);
    const section=node.querySelector('.audit-item');
    section.dataset.itemId=item.item_id;
    node.querySelector('.card-number').textContent=String(index+2).padStart(2,'0');
    node.querySelector('h3').textContent=item.item_name;
    const note=node.querySelector('.item-note');
    note.value=state.draft.notes[item.item_id]||'';
    note.addEventListener('input',()=>{state.draft.notes[item.item_id]=note.value;saveDraft();});
    const serverItem=state.server?.items?.find(row=>row.item_id===item.item_id);
    const reason=node.querySelector('.return-reason');
    if(serverItem?.status==='rework'){
      reason.hidden=false;
      reason.textContent=`退回原因：${serverItem.reviewer_comment||'請補充照片'}`;
    }
    const locked=rework&&!returned.has(item.item_id);
    section.classList.toggle('locked',locked);
    const input=node.querySelector('.photo-input');
    input.disabled=locked;
    input.addEventListener('change',event=>addPhotos(item.item_id,Array.from(event.target.files||[])).finally(()=>{input.value='';}));
    note.disabled=locked;
    list.appendChild(node);
    renderItemPhotos(item.item_id);
  });
  updateCompletion();
}

async function hydratePhotoUrls(){
  for(const item of state.config.items){
    for(const photo of itemState(item.item_id).photos){
      if(!photo.objectUrl&&!photo.deleted&&!photo.server){
        const stored=await dbGet(blobKey(photo.id));
        if(stored?.bytes)photo.objectUrl=URL.createObjectURL(new Blob([stored.bytes],{type:stored.type||photo.type||'image/jpeg'}));
      }
    }
  }
}

async function addPhotos(itemId,files){
  if(!files.length)return;
  const item=itemState(itemId);
  const active=item.photos.filter(photo=>!photo.deleted);
  const seen=new Set(active.map(photo=>photo.fingerprint));
  const unique=[];
  for(const file of files){
    if(!String(file.type||'').startsWith('image/')){
      message(`${file.name||'選取的檔案'} 不是照片，已略過`,'error');
      continue;
    }
    const fingerprint=`${file.name}|${file.size}|${file.lastModified}`;
    if(!seen.has(fingerprint)){seen.add(fingerprint);unique.push({file,fingerprint});}
  }
  if(active.length+unique.length>MAX_PHOTOS){
    message(`單項最多 ${MAX_PHOTOS} 張；目前已有 ${active.length} 張，本次只能再加入 ${MAX_PHOTOS-active.length} 張。`,'error');
    return;
  }
  for(const entry of unique){
    const id=uid('photo');
    const bytes=await entry.file.arrayBuffer();
    await dbPut(blobKey(id),{bytes,name:entry.file.name,type:entry.file.type,lastModified:entry.file.lastModified});
    item.photos.push({
      id,name:entry.file.name,type:entry.file.type,size:entry.file.size,lastModified:entry.file.lastModified,
      fingerprint:entry.fingerprint,status:'pending',error:'',server:null,objectUrl:URL.createObjectURL(entry.file)
    });
  }
  saveDraft();
  renderItemPhotos(itemId);
  updateCompletion();
}

async function removePhoto(itemId,photoId){
  const item=itemState(itemId);
  const photo=item.photos.find(row=>row.id===photoId);
  if(!photo||photo.locked)return;
  if(photo.status==='uploaded'){
    try{
      await storeCall({action:'audit_photo_delete',submission_id:state.draft.submission_id,edit_token:state.draft.edit_token,client_photo_id:photo.id});
    }catch(error){message(error.message,'error');return;}
  }
  if(photo.objectUrl){
    URL.revokeObjectURL(photo.objectUrl);
    state.privatePhotoUrls.delete(photo.objectUrl);
    photo.objectUrl='';
  }
  photo.deleted=true;
  await dbDelete(blobKey(photo.id)).catch(()=>{});
  saveDraft();
  renderItemPhotos(itemId);
  updateCompletion();
}

function privatePhotoObjectUrl(mimeType,base64){
  if(!/^image\//.test(String(mimeType||'')))throw new Error('照片格式不正確');
  const binary=atob(String(base64||''));
  const bytes=new Uint8Array(binary.length);
  for(let index=0;index<binary.length;index++)bytes[index]=binary.charCodeAt(index);
  const url=URL.createObjectURL(new Blob([bytes],{type:mimeType}));
  state.privatePhotoUrls.add(url);
  return url;
}

async function ensurePrivatePhoto(photo,scope,submissionId){
  if(photo.objectUrl)return photo.objectUrl;
  if(photo.readPromise)return await photo.readPromise;
  const meta=photo.server||photo;
  if(!meta?.client_photo_id)throw new Error('照片識別資料不完整');
  const request={action:'audit_photo_read',submission_id:submissionId,client_photo_id:meta.client_photo_id};
  photo.readPromise=(async()=>{
    const result=await(scope==='supervisor'
      ?supervisorCall(request)
      :storeCall({...request,edit_token:state.draft.edit_token}));
    photo.objectUrl=privatePhotoObjectUrl(result.mime_type,result.base64);
    photo.privateObjectUrl=true;
    return photo.objectUrl;
  })();
  try{return await photo.readPromise;}finally{photo.readPromise=null;}
}

function revokePrivatePhotos(photos){
  (photos||[]).forEach(photo=>{
    if(photo.privateObjectUrl&&photo.objectUrl){
      URL.revokeObjectURL(photo.objectUrl);
      state.privatePhotoUrls.delete(photo.objectUrl);
      photo.objectUrl='';
      photo.privateObjectUrl=false;
    }
  });
}

function revokeDraftPhotos(photos){
  (photos||[]).forEach(photo=>{
    if(photo.objectUrl){
      URL.revokeObjectURL(photo.objectUrl);
      state.privatePhotoUrls.delete(photo.objectUrl);
      photo.objectUrl='';
      photo.privateObjectUrl=false;
    }
  });
}

function loadTilePhoto(tile,img,photo,scope,submissionId){
  const loading=document.createElement('span');
  loading.className='photo-loading';
  loading.textContent='照片載入中…';
  tile.insertBefore(loading,tile.firstChild);
  ensurePrivatePhoto(photo,scope,submissionId).then(url=>{
    if(!tile.isConnected)return;
    img.src=url;
    loading.replaceWith(img);
  }).catch(error=>{
    if(tile.isConnected)loading.textContent=error.message||'照片載入失敗';
  });
}

function renderItemPhotos(itemId){
  const section=document.querySelector(`.audit-item[data-item-id="${itemId}"]`);
  if(!section)return;
  const photos=itemPhotos(itemId);
  section.querySelector('.photo-count').textContent=`${photos.length}／${MAX_PHOTOS} 張`;
  const grid=section.querySelector('.photo-grid');
  grid.replaceChildren();
  photos.forEach((photo,index)=>{
    const tile=document.createElement('div');
    tile.className='photo-tile';
    const img=document.createElement('img');
    img.alt=`第 ${index+1} 張照片`;
    if(photo.objectUrl){img.src=photo.objectUrl;tile.appendChild(img);}
    else if(photo.server)loadTilePhoto(tile,img,photo,'store',state.draft.submission_id);
    else if(photo.migrationMissing){
      const fallback=document.createElement('span');
      fallback.className='photo-loading';
      fallback.textContent='需重新選取此張照片';
      tile.appendChild(fallback);
    }else tile.appendChild(img);
    const preview=document.createElement('button');
    preview.type='button';
    preview.className='preview-button';
    preview.disabled=Boolean(photo.migrationMissing);
    preview.setAttribute('aria-label',`放大預覽第 ${index+1} 張照片`);
    preview.addEventListener('click',async()=>{
      try{
        await Promise.all(photos.filter(row=>row.server&&!row.objectUrl).map(row=>ensurePrivatePhoto(row,'store',state.draft.submission_id)));
        openPhotoViewer(photos,index,preview);
      }catch(error){message(error.message,'error');}
    });
    tile.appendChild(preview);
    if(!photo.locked&&!state.submitting){
      const del=document.createElement('button');
      del.type='button';
      del.className='delete-button';
      del.textContent='×';
      del.setAttribute('aria-label',`刪除第 ${index+1} 張照片`);
      del.addEventListener('click',()=>removePhoto(itemId,photo.id));
      tile.appendChild(del);
    }
    const badge=document.createElement('span');
    badge.className=`photo-state ${photo.status||''}`;
    badge.textContent=photo.migrationMissing?'需重新選取':photo.status==='uploaded'?'已上傳':photo.status==='failed'?'上傳失敗':photo.status==='uploading'?'上傳中':'待上傳';
    tile.appendChild(badge);
    grid.appendChild(tile);
  });
  const status=section.querySelector('.item-status');
  const usable=photos.filter(photo=>!photo.migrationMissing);
  const ready=usable.length>0;
  status.textContent=ready?`${usable.length} 張`:'未完成';
  status.className=`item-status ${ready?'ready':''}`;
}

function requiredItemIds(){
  if(state.server?.submission_status==='rework')return state.server.items.filter(item=>item.status==='rework').map(item=>item.item_id);
  return state.config.items.map(item=>item.item_id);
}

function validation(){
  const errors=[];
  if(!state.draft.store_id||!storeById(state.draft.store_id))errors.push('門市店點');
  if(!String(state.draft.inspector_name||'').trim())errors.push('檢查人員姓名');
  const employeeId=String(state.draft.employee_id||'').trim().toUpperCase();
  if(!employeeId)errors.push('員工編號');
  else if(!/^[A-Z0-9_-]{4,20}$/.test(employeeId))errors.push('員工編號格式（4–20 碼英數字）');
  requiredItemIds().forEach(itemId=>{
    if(!itemPhotos(itemId).some(photo=>!photo.migrationMissing))errors.push(state.config.items.find(item=>item.item_id===itemId).item_name);
  });
  return errors;
}

function updateCompletion(){
  if(!state.config)return;
  const missing=validation();
  const itemsMissing=requiredItemIds().filter(itemId=>!itemPhotos(itemId).some(photo=>!photo.migrationMissing));
  const completion=document.getElementById('completionText');
  const detail=document.getElementById('missingText');
  completion.textContent=itemsMissing.length?`尚未完成 ${itemsMissing.length} 個項目`:(missing.length?'基本資料尚未完成':'三項照片已備妥');
  detail.textContent=missing.length?`缺少：${missing.join('、')}`:'送出後會逐張上傳並做雲端讀回確認。';
  document.getElementById('submitButton').disabled=state.submitting||missing.length>0;
}

async function compressPhoto(file){
  let bitmap;
  try{bitmap=await createImageBitmap(file);}catch{return file;}
  const scale=Math.min(1,MAX_DIMENSION/Math.max(bitmap.width,bitmap.height));
  if(scale===1&&file.size<=3*1024*1024){bitmap.close();return file;}
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));
  canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  canvas.getContext('2d',{alpha:false}).drawImage(bitmap,0,0,canvas.width,canvas.height);
  bitmap.close();
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',JPEG_QUALITY));
  return blob||file;
}
