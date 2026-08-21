'use strict';
function ensureSubmission(){
  return storeCall({
    action:'audit_start',
    batch_id:state.config.batch.batch_id,
    submission_id:state.draft.submission_id,
    edit_token:state.draft.edit_token,
    store_id:state.draft.store_id,
    inspector_name:state.draft.inspector_name,
    employee_id:state.draft.employee_id
  });
}

async function uploadPending(){
  const targets=[];
  requiredItemIds().forEach(itemId=>itemPhotos(itemId)
    .filter(photo=>photo.status!=='uploaded'&&!photo.server)
    .forEach(photo=>targets.push({itemId,photo})));
  const failures=[];
  for(let index=0;index<targets.length;index++){
    const {itemId,photo}=targets[index];
    message(`正在上傳第 ${index+1}／${targets.length} 張：${photo.name}`);
    photo.status='uploading';
    renderItemPhotos(itemId);
    try{
      const stored=await dbGet(blobKey(photo.id));
      if(!stored?.bytes)throw new Error('本機照片暫存遺失，請刪除後重新選取');
      const source=new Blob([stored.bytes],{type:stored.type||photo.type||'image/jpeg'});
      const compressed=await compressPhoto(source);
      const base64=await blobToBase64(compressed);
      const result=await storeCall({
        action:'audit_upload',
        submission_id:state.draft.submission_id,
        edit_token:state.draft.edit_token,
        item_id:itemId,
        client_photo_id:photo.id,
        note:state.draft.notes[itemId]||'',
        file:{name:photo.name,type:compressed.type||photo.type||'image/jpeg',size:compressed.size,base64}
      });
      photo.status='uploaded';
      photo.error='';
      photo.server=result.photo;
      saveDraft();
    }catch(error){
      photo.status='failed';
      photo.error=error.message;
      failures.push(photo);
      saveDraft();
    }
    renderItemPhotos(itemId);
  }
  if(failures.length)throw new Error(`${failures.length} 張照片上傳失敗；成功照片已保留，請只重試失敗照片。`);
}

function blobToBase64(blob){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('讀取照片失敗'));
    reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
    reader.readAsDataURL(blob);
  });
}

async function submitReport(event){
  event.preventDefault();
  if(state.submitting)return;
  state.draft.store_id=document.getElementById('storeSelect').value;
  state.draft.inspector_name=document.getElementById('inspectorName').value.trim();
  state.draft.employee_id=document.getElementById('storeEmployeeId').value.trim().toUpperCase();
  saveDraft();
  const missing=validation();
  if(missing.length){
    message(`請先完成：${missing.join('、')}`,'error');
    updateCompletion();
    return;
  }
  state.submitting=true;
  renderItems();
  updateCompletion();
  try{
    const started=await ensureSubmission();
    if(started?.employee_id)state.draft.employee_id=started.employee_id;
    await uploadPending();
    message('照片已上傳，正在寫入回報並讀回確認…');
    const result=await storeCall({
      action:'audit_submit',
      submission_id:state.draft.submission_id,
      edit_token:state.draft.edit_token,
      notes:state.draft.notes
    });
    if(result.readback_verified!==true)throw new Error('雲端讀回尚未確認，請稍後重試');
    applyServerStatus(result);
    message('全部寫入並讀回確認完成。','success');
  }catch(error){
    message(error.message,'error');
  }finally{
    state.submitting=false;
    renderItems();
    updateCompletion();
  }
}

function mergeServerPhotos(server){
  server.items.forEach(item=>{
    const local=itemState(item.item_id);
    item.photos.forEach(photo=>{
      let existing=local.photos.find(row=>row.id===photo.client_photo_id);
      if(existing){
        existing.server=photo;
        existing.status='uploaded';
        existing.locked=Number(photo.revision)<Number(server.revision)||server.submission_status!=='draft';
      }else{
        local.photos.push({
          id:photo.client_photo_id,name:photo.photo_name,type:'image/*',size:0,lastModified:0,
          fingerprint:`server:${photo.client_photo_id}`,status:'uploaded',error:'',server:photo,objectUrl:'',locked:true
        });
      }
    });
  });
  saveDraft();
}

function applyServerStatus(result){
  state.server=result;
  state.draft.batch_id=result.batch_id;
  state.draft.store_id=result.store_id;
  state.draft.inspector_name=result.inspector_name;
  if(result.employee_id)state.draft.employee_id=result.employee_id;
  result.items.forEach(item=>{state.draft.notes[item.item_id]=item.note||state.draft.notes[item.item_id]||'';});
  mergeServerPhotos(result);
  renderServerState();
}

function renderServerState(){
  const server=state.server;
  if(!server)return;
  document.getElementById('storeSelect').value=server.store_id;
  document.getElementById('inspectorName').value=server.inspector_name;
  document.getElementById('storeEmployeeId').value=server.employee_id||state.draft.employee_id||'';
  const closed=['submitted','approved','cancelled'].includes(server.submission_status);
  document.getElementById('auditForm').hidden=closed;
  document.getElementById('completionCard').hidden=!closed&&server.submission_status!=='rework';
  const store=storeById(server.store_id);
  const counts=server.items.map(item=>`${item.item_name} ${item.photo_count} 張`).join('、');
  document.getElementById('completionTitle').textContent=server.submission_status==='approved'?'驗收完成':server.submission_status==='rework'?'待補件':server.submission_status==='cancelled'?'回報已取消':'回報完成';
  document.getElementById('completionSummary').innerHTML=
    `<dt>門市</dt><dd>${escapeHtml(store?.store_name||server.store_name)}</dd>`+
    `<dt>檢查人員</dt><dd>${escapeHtml(server.inspector_name)}</dd>`+
    `<dt>員工編號</dt><dd>${escapeHtml(server.employee_id||state.draft.employee_id||'—')}</dd>`+
    `<dt>首次回報時間</dt><dd>${escapeHtml(server.submitted_at||'尚未正式送出')}</dd>`+
    `<dt>照片</dt><dd>${escapeHtml(counts)}</dd>`;
  renderTimeline(server.timeline||[]);
  renderItems();
  document.getElementById('newSubmissionButton').hidden=server.submission_status!=='cancelled';
  if(server.submission_status==='rework'){
    document.getElementById('auditForm').hidden=false;
    message('督導已退回指定項目；只需補件紅色項目，原照片與退回原因均已保留。','error');
  }
  if(server.submission_status==='cancelled')message('督導已取消舊回報並保留證據；請建立新的回報重新填寫。','error');
}

function renderTimeline(entries){
  const labels={created:'建立草稿',submitted:'首次送出',returned:'退回補件',resubmitted:'補件送出',approved:'項目通過',cancelled:'督導取消／重設'};
  document.getElementById('timeline').innerHTML='<h3>處理時間軸</h3>'+entries.map(entry=>
    `<div class="timeline-entry"><strong>${escapeHtml(labels[entry.event_type]||entry.event_type)}</strong> ${escapeHtml(entry.item_name||'')}<br><small>${escapeHtml(entry.created_at)}${entry.comment?`・${escapeHtml(entry.comment)}`:''}</small></div>`
  ).join('');
}

async function resetCancelledSubmission(){
  const photos=Object.values(state.draft.items||{}).flatMap(item=>item.photos||[]);
  revokeDraftPhotos(photos);
  for(const photo of photos)await dbDelete(blobKey(photo.id)).catch(()=>{});
  const employeeId=state.draft.employee_id||localStorage.getItem(EMPLOYEE_ID_KEY)||'';
  state.server=null;
  state.draft=blankDraft();
  state.draft.batch_id=state.config.batch.batch_id;
  state.draft.employee_id=employeeId;
  localStorage.removeItem(DRAFT_KEY);
  document.getElementById('auditForm').hidden=false;
  document.getElementById('completionCard').hidden=true;
  document.getElementById('newSubmissionButton').hidden=true;
  renderConfig();
  message('已建立新的本機回報草稿；舊回報證據仍保留在後端。','success');
}

async function restoreOwnSubmission(){
  if(!state.draft?.submission_id||!state.draft?.edit_token)return;
  try{
    const result=await storeCall({action:'audit_status',submission_id:state.draft.submission_id,edit_token:state.draft.edit_token});
    applyServerStatus(result);
  }catch(error){
    if(!/找不到本次回報|草稿識別已失效/.test(error.message))message(error.message,'error');
  }
}

function openPhotoViewer(photos,index,returnFocus=document.activeElement){
  state.photoViewer={photos,index,returnFocus};
  renderPhotoViewer();
  document.getElementById('photoDialog').showModal();
  document.getElementById('closePhotoDialog').focus();
}

function renderPhotoViewer(){
  const {photos,index}=state.photoViewer;
  const photo=photos[index];
  if(!photo)return;
  const image=document.getElementById('dialogImage');
  image.src=photo.objectUrl||'';
  image.alt=photo.alt||`稽核照片預覽：${photo.name||photo.photo_name||`第 ${index+1} 張`}`;
  document.getElementById('dialogCaption').textContent=`第 ${index+1}／${photos.length} 張｜${photo.name||photo.photo_name||''}`;
  const single=photos.length===1;
  const previous=document.getElementById('previousPhoto');
  const next=document.getElementById('nextPhoto');
  previous.hidden=single;
  next.hidden=single;
  previous.disabled=index===0;
  next.disabled=index===photos.length-1;
}

function openQualityReminder(event){
  openPhotoViewer([{name:'品質管理重點提醒',objectUrl:'assets/audit/quality-management-reminder.png',alt:'品質管理重點提醒：SGS行前清潔及稽核檢查事項'}],0,event.currentTarget);
}

function showQualityReminderFallback(){
  const image=document.getElementById('qualityReminderImage');
  const fallback=document.getElementById('qualityReminderFallback');
  const button=document.getElementById('qualityReminderButton');
  image.hidden=true;
  fallback.hidden=false;
  button.disabled=true;
  button.setAttribute('aria-disabled','true');
}
