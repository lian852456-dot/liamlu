'use strict';
function switchMode(){
  state.mode=state.mode==='store'?'supervisor':'store';
  document.getElementById('storeView').hidden=state.mode!=='store';
  document.getElementById('supervisorView').hidden=state.mode!=='supervisor';
  document.getElementById('modeSwitch').textContent=state.mode==='store'?'督導驗收':'返回門市填報';
  if(state.mode==='supervisor')restoreSupervisor();
}

function setSupervisorAuthMessage(text){document.getElementById('supervisorAuthMessage').textContent=text||'';}

async function restoreSupervisor(){
  if(!state.ptToken){showSupervisorGate();return;}
  try{
    const result=await api({action:'ptauth',token:state.ptToken});
    state.ptToken=result.token;
    sessionStorage.setItem(PT_TOKEN_KEY,state.ptToken);
    showSupervisorWorkspace();
    await loadOverview();
  }catch{
    clearSupervisorAuth();
    showSupervisorGate();
    setSupervisorAuthMessage('session 已失效，請重新輸入督導通行碼');
  }
}

async function supervisorLogin(event){
  event.preventDefault();
  const button=document.getElementById('supervisorLoginButton');
  const key=document.getElementById('supervisorPasscode').value.trim();
  if(!key){setSupervisorAuthMessage('請輸入督導通行碼');return;}
  button.disabled=true;
  setSupervisorAuthMessage('正在驗證…');
  try{
    const result=await api({action:'ptauth',key});
    state.ptToken=result.token;
    sessionStorage.setItem(PT_TOKEN_KEY,state.ptToken);
    document.getElementById('supervisorPasscode').value='';
    showSupervisorWorkspace();
    await loadOverview();
  }catch(error){
    setSupervisorAuthMessage(error.unauthorized?'督導通行碼錯誤':error.message);
  }finally{button.disabled=false;}
}

function clearSupervisorAuth(){state.ptToken='';sessionStorage.removeItem(PT_TOKEN_KEY);}
function showSupervisorGate(){document.getElementById('supervisorGate').hidden=false;document.getElementById('supervisorWorkspace').hidden=true;}
function showSupervisorWorkspace(){document.getElementById('supervisorGate').hidden=true;document.getElementById('supervisorWorkspace').hidden=false;}

function supervisorCall(payload,retried=false){
  return api({...payload,token:state.ptToken}).catch(async error=>{
    if(!error.unauthorized||retried)throw error;
    const ok=await waitForReauth();
    if(!ok)throw new Error('督導驗證未完成；門市資料仍保留');
    return supervisorCall(payload,true);
  });
}

function waitForReauth(){
  if(state.reauthPromise)return state.reauthPromise;
  clearSupervisorAuth();
  document.getElementById('reauthModal').hidden=false;
  document.getElementById('reauthPasscode').focus();
  state.reauthPromise=new Promise(resolve=>{state.reauthResolve=resolve;});
  return state.reauthPromise;
}

function finishReauth(ok){
  document.getElementById('reauthModal').hidden=true;
  const resolve=state.reauthResolve;
  state.reauthPromise=null;
  state.reauthResolve=null;
  if(resolve)resolve(ok);
}

async function reauthenticate(event){
  event.preventDefault();
  const key=document.getElementById('reauthPasscode').value.trim();
  const button=document.getElementById('reauthButton');
  if(!key){document.getElementById('reauthMessage').textContent='請輸入督導通行碼';return;}
  button.disabled=true;
  try{
    const result=await api({action:'ptauth',key});
    state.ptToken=result.token;
    sessionStorage.setItem(PT_TOKEN_KEY,state.ptToken);
    document.getElementById('reauthPasscode').value='';
    document.getElementById('reauthMessage').textContent='';
    finishReauth(true);
  }catch{
    document.getElementById('reauthMessage').textContent='督導驗證未成功，請確認通行碼後再試';
  }finally{button.disabled=false;}
}

async function loadOverview(){
  try{
    state.overview=await supervisorCall({action:'audit_overview'});
    renderOverview();
  }catch(error){
    document.getElementById('overviewGrid').innerHTML=`<div class="message error">${escapeHtml(error.message)}</div>`;
  }
}

function rowDisplayStatus(row){return row.status==='draft'?'missing':row.status;}

function renderOverview(){
  const statusFilter=document.getElementById('statusFilter').value;
  const storeFilter=document.getElementById('storeFilter').value;
  const rows=(state.overview?.stores||[]).filter(row=>(!statusFilter||rowDisplayStatus(row)===statusFilter)&&(!storeFilter||row.store_id===storeFilter));
  document.getElementById('overviewGrid').innerHTML=rows.map(row=>{
    const status=rowDisplayStatus(row);
    return `<article class="paper-card store-review-card" data-store-id="${escapeHtml(row.store_id)}">`+
      `<span class="status-chip ${escapeHtml(status)}">${escapeHtml(STATUS_LABELS[status]||status)}</span>`+
      `<h3>${escapeHtml(row.store_name)}</h3>`+
      `<p>檢查人員：${escapeHtml(row.inspector_name||'—')}</p>`+
      `<p>員編：${escapeHtml(row.employee_id||'—')}</p>`+
      `<p>首次回報：${escapeHtml(row.submitted_at||'—')}</p>`+
      `<p>最後補件：${escapeHtml(row.last_rework_at||'—')}</p>`+
      row.items.map(item=>`<button type="button" class="review-item-button" data-submission-id="${escapeHtml(row.submission_id)}" data-item-id="${escapeHtml(item.item_id)}" ${row.submission_id?'':'disabled'}><span>${escapeHtml(item.item_name)}<br><small>${item.photo_count} 張照片</small></span><span class="status-chip ${escapeHtml(item.status==='draft'?'missing':item.status)}">${escapeHtml(STATUS_LABELS[item.status]||item.status)}</span></button>`).join('')+
      `</article>`;
  }).join('')||'<div class="paper-card store-review-card">沒有符合篩選條件的門市。</div>';
  document.querySelectorAll('.review-item-button[data-submission-id]:not([data-submission-id=""])').forEach(button=>
    button.addEventListener('click',()=>openReview(button.dataset.submissionId,button.dataset.itemId)));
}

async function openReview(submissionId,focusItemId){
  try{
    const detail=await supervisorCall({action:'audit_detail',submission_id:submissionId});
    renderReviewDetail(detail,focusItemId);
    document.getElementById('reviewDialog').showModal();
  }catch(error){window.alert(error.message);}
}

function renderReviewDetail(detail,focusItemId){
  if(state.reviewDetail)revokePrivatePhotos(state.reviewDetail.items.flatMap(item=>item.photos||[]));
  state.reviewDetail=detail;
  const cancelled=detail.submission_status==='cancelled';
  document.getElementById('reviewDetail').innerHTML=
    `<h2>${escapeHtml(detail.store_name)}｜督導驗收</h2>`+
    `<p>檢查人員：${escapeHtml(detail.inspector_name)}｜員編：${escapeHtml(detail.employee_id||'—')}｜首次回報：${escapeHtml(detail.submitted_at||'—')}｜最後更新：${escapeHtml(detail.updated_at||'—')}</p>`+
    detail.items.map(item=>
      `<section class="review-section" data-review-item="${escapeHtml(item.item_id)}">`+
      `<h3>${escapeHtml(item.item_name)} <span class="status-chip ${escapeHtml(item.status)}">${escapeHtml(STATUS_LABELS[item.status]||item.status)}</span></h3>`+
      `<p>備註：${escapeHtml(item.note||'—')}</p>`+
      `<div class="photo-grid">${(item.photos||[]).map((photo,index)=>`<button type="button" class="photo-tile supervisor-photo" data-item-id="${escapeHtml(item.item_id)}" data-photo-index="${index}" aria-label="放大查看${escapeHtml(item.item_name)}第 ${index+1} 張"><span class="photo-loading">照片載入中…</span><span class="photo-state uploaded">revision ${photo.revision}</span></button>`).join('')}</div>`+
      `${item.reviewer_comment?`<p class="return-reason">退回原因：${escapeHtml(item.reviewer_comment)}</p>`:''}`+
      `${cancelled?'':`<label class="review-comment"><span>退回原因</span><textarea rows="2" maxlength="300" placeholder="選擇退回補件時必填"></textarea></label><div class="review-actions"><button type="button" class="approve-button" data-decision="approve">通過</button><button type="button" class="return-button" data-decision="return">退回補件</button></div>`}`+
      `</section>`
    ).join('')+
    `<div class="timeline"><h3>時間軸</h3>${(detail.timeline||[]).map(event=>`<div class="timeline-entry">${escapeHtml(event.created_at)}｜${escapeHtml(event.item_name||'整筆')}｜${escapeHtml(event.event_type)}${event.comment?`｜${escapeHtml(event.comment)}`:''}</div>`).join('')}</div>`+
    `${cancelled?'<p class="message error">此回報已取消；原照片與事件紀錄仍保留。</p>':'<button type="button" class="secondary-button cancel-submission-button">取消／重設此門市回報</button>'}`;

  document.querySelectorAll('.supervisor-photo').forEach(button=>{
    const item=detail.items.find(row=>row.item_id===button.dataset.itemId);
    const photo=item.photos[Number(button.dataset.photoIndex)];
    const loading=button.querySelector('.photo-loading');
    ensurePrivatePhoto(photo,'supervisor',detail.submission_id).then(url=>{
      if(!button.isConnected)return;
      const img=document.createElement('img');
      img.src=url;
      img.alt=`${item.item_name}第 ${Number(button.dataset.photoIndex)+1} 張`;
      loading.replaceWith(img);
    }).catch(error=>{if(button.isConnected)loading.textContent=error.message||'照片載入失敗';});
    button.addEventListener('click',async()=>{
      try{
        await Promise.all(item.photos.map(row=>ensurePrivatePhoto(row,'supervisor',detail.submission_id)));
        openPhotoViewer(item.photos,Number(button.dataset.photoIndex),button);
      }catch(error){setSupervisorActionMessage(error.message,'error');}
    });
  });
  document.querySelectorAll('[data-review-item] [data-decision]').forEach(button=>
    button.addEventListener('click',()=>reviewItem(detail,button.closest('[data-review-item]'),button.dataset.decision)));
  document.querySelector('.cancel-submission-button')?.addEventListener('click',()=>cancelSubmission(detail));
  if(focusItemId)document.querySelector(`[data-review-item="${focusItemId}"]`)?.scrollIntoView({block:'start'});
}

function setSupervisorActionMessage(text,type='success'){
  const box=document.getElementById('supervisorActionMessage');
  box.hidden=!text;
  box.textContent=text||'';
  box.className=`message ${type}`.trim();
}

async function cancelSubmission(detail){
  if(!window.confirm(`確認取消 ${detail.store_name} 本次回報？\n\n照片與事件證據會保留，門市將可建立新的回報。`))return;
  const button=document.querySelector('.cancel-submission-button');
  if(button)button.disabled=true;
  try{
    const cancelled=await supervisorCall({action:'audit_cancel',submission_id:detail.submission_id,comment:'督導取消並開放門市重新回報'});
    renderReviewDetail(cancelled);
    await loadOverview();
    setSupervisorActionMessage(`${detail.store_name} 舊回報已取消並保留證據，門市現在可重新回報。`);
  }catch(error){
    setSupervisorActionMessage(error.message,'error');
    if(button)button.disabled=false;
  }
}

async function reviewItem(detail,section,decision){
  const itemId=section.dataset.reviewItem;
  const comment=section.querySelector('textarea').value.trim();
  if(decision==='return'&&!comment){section.querySelector('textarea').focus();window.alert('退回補件必須輸入原因');return;}
  section.querySelectorAll('button').forEach(button=>button.disabled=true);
  try{
    const updated=await supervisorCall({action:'audit_review',submission_id:detail.submission_id,item_id:itemId,decision,comment});
    renderReviewDetail(updated,itemId);
    await loadOverview();
  }catch(error){
    window.alert(error.message);
    section.querySelectorAll('button').forEach(button=>button.disabled=false);
  }
}

async function copyPending(){
  const rows=(state.overview?.stores||[]).filter(row=>['missing','rework','draft'].includes(row.status));
  const text=rows.map(row=>`${row.store_name}｜${rowDisplayStatus(row)==='rework'?'待補件':'未回報'}`).join('\n')||'目前沒有未回報或待補件門市';
  await navigator.clipboard.writeText(text);
  const button=document.getElementById('copyPendingButton');
  const original=button.textContent;
  button.textContent='已複製';
  button.classList.add('copy-flash');
  setTimeout(()=>{button.textContent=original;button.classList.remove('copy-flash');},1200);
}

async function logoutSupervisor(){
  const token=state.ptToken;
  if(state.reviewDetail)revokePrivatePhotos(state.reviewDetail.items.flatMap(item=>item.photos||[]));
  state.reviewDetail=null;
  clearSupervisorAuth();
  showSupervisorGate();
  state.overview=null;
  document.getElementById('overviewGrid').replaceChildren();
  if(token)api({action:'ptlogout',token}).catch(()=>{});
}

function bindEvents(){
  document.getElementById('modeSwitch').addEventListener('click',switchMode);
  document.getElementById('auditForm').addEventListener('submit',submitReport);
  document.getElementById('storeSelect').addEventListener('change',event=>{
    state.draft.store_id=event.target.value;
    saveDraft();
    updateCompletion();
  });
  document.getElementById('inspectorName').addEventListener('input',event=>{
    state.draft.inspector_name=event.target.value;
    saveDraft();
    updateCompletion();
  });
  document.getElementById('storeEmployeeId').addEventListener('input',event=>{
    state.draft.employee_id=event.target.value.trim().toUpperCase();
    saveDraft();
    updateCompletion();
  });
  document.getElementById('newSubmissionButton').addEventListener('click',resetCancelledSubmission);
  document.getElementById('supervisorLoginForm').addEventListener('submit',supervisorLogin);
  document.getElementById('reauthForm').addEventListener('submit',reauthenticate);
  document.getElementById('statusFilter').addEventListener('change',renderOverview);
  document.getElementById('storeFilter').addEventListener('change',renderOverview);
  document.getElementById('copyPendingButton').addEventListener('click',copyPending);
  document.getElementById('supervisorLogoutButton').addEventListener('click',logoutSupervisor);
  const photoDialog=document.getElementById('photoDialog');
  document.getElementById('qualityReminderButton').addEventListener('click',openQualityReminder);
  document.getElementById('qualityReminderImage').addEventListener('error',showQualityReminderFallback);
  document.getElementById('closePhotoDialog').addEventListener('click',()=>photoDialog.close());
  photoDialog.addEventListener('close',()=>{
    const target=state.photoViewer.returnFocus;
    state.photoViewer.returnFocus=null;
    if(target?.isConnected)requestAnimationFrame(()=>target.focus());
  });
  document.getElementById('previousPhoto').addEventListener('click',()=>{
    state.photoViewer.index=Math.max(0,state.photoViewer.index-1);
    renderPhotoViewer();
  });
  document.getElementById('nextPhoto').addEventListener('click',()=>{
    state.photoViewer.index=Math.min(state.photoViewer.photos.length-1,state.photoViewer.index+1);
    renderPhotoViewer();
  });
}

async function boot(){
  loadDraft();
  bindEvents();
  try{
    state.config=await api({action:'audit_config'});
    if(state.config.contract!==CONTRACT)throw new Error('稽核服務尚未切換為簡化填報版，請稍後重新整理');
    if(state.draft.batch_id&&state.draft.batch_id!==state.config.batch.batch_id){
      state.draft=blankDraft();
    }
    state.draft.batch_id=state.config.batch.batch_id;
    renderConfig();
    await hydratePhotoUrls();
    renderItems();
    await restoreOwnSubmission();
  }catch(error){
    message(error.message,'error');
    document.getElementById('auditForm').hidden=true;
  }
}

window.AuditReportApp={uid,validation,requiredItemIds,MAX_PHOTOS,STATUS_LABELS};
function releasePrivatePhotoUrls(){state.privatePhotoUrls.forEach(url=>URL.revokeObjectURL(url));state.privatePhotoUrls.clear();}
window.addEventListener('pagehide',releasePrivatePhotoUrls);
window.addEventListener('beforeunload',releasePrivatePhotoUrls);
document.addEventListener('DOMContentLoaded',boot);
