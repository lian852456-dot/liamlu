(function(){
 'use strict';
 const C=InsuranceConsultation,$=id=>document.getElementById(id),owner='https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
 const today=()=>new Date(Date.now()+8*3600000).toISOString().slice(0,10);
 let client,epoch=0,rows=[],selected=null,attempt=null,busy=false,weekly=null;
 $('insuranceDate').value=today();$('insuranceDate').max=today();
 function text(id,v){$(id).textContent=v;}
 function clear(){epoch++;rows=[];selected=null;attempt=null;client?.suspend();$('insuranceWorkspace').hidden=true;$('insuranceForm').reset();$('insuranceForm').hidden=true;$('insuranceList').replaceChildren();$('insuranceWeeks').replaceChildren();weekly=null;text('selfTitle','登入後查看本人進度');text('selfRate','—');text('selfState','資料待核');text('selfCutoff','統計截止：待核');text('selfDataDate','每天獨立核對，不綁 16:00／21:00');$('insuranceHero').dataset.state='pending';}
 function restore(){
  client??=createDashboardBClient(owner,{storage:sessionStorage,logoutEpoch:()=>JSON.parse(localStorage.getItem('north12b_portal_logout_event_v1')||'null')?.id||''});
  if(!client.restore(localStorage.getItem('north12b_private_dashboard_device_id')))throw Error('LOGIN_REQUIRED');
 }
 function sourceLabel(row){return '統計截止：'+(row.progress?.cutoff||'待核')+'｜來源發布：'+(row.progress?.publicationDate||'未取得')+'｜資料日：'+row.dataDate;}
 function open(row){
  selected=row;attempt=null;$('insuranceForm').reset();text('insuranceError','');
  const existing=row.submission,editable=row.status==='required'&&row.canSubmit===true&&!existing;
  $('insuranceForm').hidden=!editable&&!existing;if($('insuranceForm').hidden)return;
  text('insuranceFormTitle',existing?'已完成的保險搭售請益':'保險搭售率低於 50%：請填寫以下五項');
  text('insuranceFormSource',sourceLabel(row)+(row.sourceChanged?'｜來源已更正，保留本日原提交。':''));
  C.fields.forEach(([k])=>{const el=$('insuranceForm').elements[k];el.value=existing?.values[k]||'';el.readOnly=!editable;el.required=editable;el.removeAttribute('aria-invalid');});
  $('insuranceSubmit').hidden=!editable;
 }
 function render(result){
  if(result.schema!=='insurance-consultation/v1'||result.dataDate!==$('insuranceDate').value||!Array.isArray(result.items))throw Error('RESPONSE_MISMATCH');
  if(result.weekly)weekly=result.weekly;
  $('insuranceWeeks').replaceChildren();
  for(const w of weekly?.weeks||[]){const el=document.createElement('article');el.className='task';const h=document.createElement('h3');h.textContent=w.week;const p=document.createElement('p');p.textContent='正式比率：'+C.rateText(w.rate)+'｜截止：'+(w.cutoff||'待核')+'｜加扣：'+(w.adjustment??'待核')+'｜'+w.postingStatus;const rule=document.createElement('p');rule.textContent=w.rule;el.append(h,p,rule);$('insuranceWeeks').append(el);}
  text('insuranceRewards','累計獎勵：'+(weekly?.cumulativeReward??'待結')+'（只顯示核實入帳）');
  rows=result.items;const self=rows.find(r=>r.isSelf),hero=$('insuranceHero');
  text('selfTitle','本人月累計保險搭售率');text('selfRate',C.rateText(self?.progress?.rate));text('selfState',C.states[self?.status]||C.states.pending);
  text('selfCutoff','統計截止：'+(self?.progress?.cutoff||'待核'));text('selfDataDate','資料日：'+result.dataDate+'｜來源發布：'+(self?.progress?.publicationDate||'未取得'));hero.dataset.state=self?.status||'pending';
  $('insuranceWorkspace').hidden=false;$('insuranceList').replaceChildren();
  for(const row of rows){
   const box=document.createElement('article');box.className='task';box.dataset.kind=row.kind;
   const h=document.createElement('h3');h.textContent=(row.kind==='store'?'門市｜':'個人｜')+row.displayName;
   const state=document.createElement('p');state.textContent=C.rateText(row.progress?.rate)+' · '+C.states[row.status];
   const source=document.createElement('p');source.textContent=sourceLabel(row);box.append(h,state,source);
   if(row.status==='required'&&row.canSubmit===true||row.submission){const b=document.createElement('button');b.type='button';b.textContent=row.submission?'查看今日回覆':'填寫今日請益';b.onclick=()=>open(row);box.append(b);}
   else{const p=document.createElement('p');p.textContent=row.status==='exempt'?'已達 50%，今日不用填五欄。':row.status==='required'?'待本人或所屬門市管理者回覆。':'來源或身分待核；不影響一般回報。';box.append(p);}
   $('insuranceList').append(box);
  }
  open(self||rows[0]||{status:'pending'});
 }
 async function load(){
  const generation=++epoch;selected=null;attempt=null;$('insuranceForm').hidden=true;text('insuranceMessage','讀取當日正式來源及已填狀態…');
  try{restore();const date=$('insuranceDate').value,r=await client.insuranceRead(date);if(generation!==epoch)return;render(r);text('insuranceMessage','每人／每店每資料日一次；一般銷售過關不會代替本項回覆。');}
  catch(_){if(generation!==epoch)return;clear();text('selfTitle','資料讀取待核');text('insuranceMessage','未取得可核對資料，請重新登入或重新讀取；沒有判定達標或未完成。');}
 }
 $('insuranceForm').addEventListener('submit',async event=>{
  event.preventDefault();if(busy||!selected||selected.status!=='required'||selected.canSubmit!==true)return;
  const values=Object.fromEntries(C.fields.map(([k])=>[k,$('insuranceForm').elements[k].value]));const missing=C.missing(values);
  C.fields.forEach(([k])=>$('insuranceForm').elements[k].removeAttribute('aria-invalid'));
  if(missing.length){text('insuranceError','請填寫：'+missing.map(([,l])=>l).join('、'));missing.forEach(([k])=>$('insuranceForm').elements[k].setAttribute('aria-invalid','true'));$('insuranceForm').elements[missing[0][0]].focus();return;}
  const generation=epoch;attempt??={dataDate:selected.dataDate,subjectKey:selected.subjectKey,sourceVersion:selected.progress.sourceVersion,values:C.parse(values),submissionId:crypto.randomUUID()};
  busy=true;$('insuranceSubmit').disabled=true;text('insuranceError','正在送出並核對讀回…');
  try{restore();const r=await client.insuranceSubmit(attempt);if(generation!==epoch)return;
   if(r.schema!=='insurance-consultation/v1'||r.item?.subjectKey!==attempt.subjectKey||r.dataDate!==attempt.dataDate||!r.item.submission)throw Error('READBACK_UNCONFIRMED');
   render({schema:r.schema,dataDate:r.dataDate,items:rows.map(row=>row.subjectKey===r.item.subjectKey?r.item:row)});text('insuranceMessage',r.alreadySubmitted?'今日已有有效回覆，已讀回原提交。':'今日請益已儲存並讀回確認。');
  }catch(_){if(generation===epoch)text('insuranceError','尚未確認送出結果或來源已變更；請重新讀取核對。重試會核對同一每日鍵，不重複新增。');}
  finally{busy=false;$('insuranceSubmit').disabled=false;}
 });
 $('insuranceRefresh').onclick=load;$('insuranceDate').onchange=load;
 window.DashboardBHost={sessionOnly:true,refreshOnResume:true,mountSelector:'#insuranceLogin',compactMobileLogin:true,clear,accept:()=>void load(),navigate:module=>{location.href=module==='return'?'index.html':module==='awards'?'awards-battle.html':'kpi-battle.html';}};
 window.addEventListener('portal-before-logout',clear);
})();
