import {bindExports,refreshExports,clearExports} from './tradein-export-ui.mjs';
const CORE=window.TradeinPerformanceCore,$=id=>document.getElementById(id);
const EMPLOYEE_KEY='north12b_private_dashboard_employee_id',DEVICE_KEY='north12b_private_dashboard_device_id';
const API='https://script.google.com/macros/s/AKfycbwf_ms5rkOIg92FOZwZuHCft3JWpC7ENPUN6c6ebPb1Jd6eqKYfa_2tmrI8onDIl4Mi/exec';
let snapshot=null,access=null,active=false,epoch=0,uploadEpoch=0,source=null,plan=null,adminSecret='',snapshotHash=null,writing=false;
const pending=new Set();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const units=n=>n===null||n===undefined?'未提供':n+' 台';
function setWriting(value){writing=value;['periodMonth','refreshData','sourceFile','completeScope','adminSecret','previewUpload','publishUpload','rollbackUpload'].forEach(id=>$(id).disabled=value);if(!value){$('publishUpload').disabled=!plan;$('rollbackUpload').disabled=!snapshotHash;}}
function deviceId(){let id=localStorage.getItem(DEVICE_KEY);if(!id){id=crypto.randomUUID().replace(/-/g,'');localStorage.setItem(DEVICE_KEY,id);}return id;}
function credential(){return {employeeId:$('employeeId').value.trim().toUpperCase(),deviceId:deviceId()};}
async function request(payload){
  window.PortalLogout?.assertActive();
  const controller=new AbortController(),ticket=epoch;pending.add(controller);
  const timer=setTimeout(()=>controller.abort(),30000);
  try{
    const url=new URL(localStorage.getItem('bei12b_gas_url')||API);url.searchParams.set('_request',crypto.randomUUID());
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),cache:'no-store',credentials:'omit',signal:controller.signal});
    if(!response.ok)throw new Error('服務暫時無回應（HTTP '+response.status+'）');
    const body=await response.json();
    if(ticket!==epoch)throw new Error('登入或月份已變更');
    if(!body||body.status==='error')throw new Error(body?.message||'讀取失敗');
    return body;
  }finally{clearTimeout(timer);pending.delete(controller);}
}
function rules(){
  const period=CORE.monthPeriod($('periodMonth').value);
  return {month:$('periodMonth').value,...period,periodStatus:'confirmed',cadence:'monthly',staffTarget:3,actingManager:'exempt',isDemo:false,
    sourceStart:snapshot?.source_period.start,sourceEnd:snapshot?.source_period.end,cutoff:snapshot?.source_cutoff_date,statusAsOf:snapshot?.status_as_of_date,timezone:'Asia/Taipei'};
}
const row=p=>[p.store,p.masked_name,p.role,p.actual_units];
function context(){return {active:active&&!!snapshot,mode:access?.mode,self:access?.mode==='self'?snapshot?.people[0]&&row(snapshot.people[0]):null,
  people:(snapshot?.people||[]).map(row),allowedStores:access?.allowedStores||[],selectedStore:$('staffStore').value,rules:rules()};}
function wipeData(){snapshot=null;snapshotHash=null;clearExports();['self','stats','storeRows','staffRows'].forEach(id=>$(id).replaceChildren());$('exportPanel').hidden=true;$('supervisorArea').hidden=true;$('maintenance').hidden=true;}
function clearPrivate(){
  epoch++;uploadEpoch++;pending.forEach(c=>c.abort());pending.clear();active=false;access=null;source=null;plan=null;adminSecret='';wipeData();
  $('sourceFile').value='';$('completeScope').checked=false;$('adminSecret').value='';$('bootstrapCode').value='';$('uploadPreview').replaceChildren();$('uploadMessage').textContent='';
  $('publishUpload').disabled=true;$('rollbackUpload').disabled=true;$('profileLabel').textContent='';$('updatedLabel').textContent='';
  $('privateWorkspace').hidden=true;$('locked').hidden=false;
}
function personHtml(p){
  const exempt=['店長','代理店長'].includes(p.role),unknown=p.actual_units===null,pendingTarget=!exempt&&p.target_units===null;
  return `<div><span class="badge">${esc(p.masked_name)} · ${esc(p.store)}</span><div class="self-value">${unknown?'未提供':p.actual_units}<small> ${p.target_units===null?'台實績':'／3 台（月目標）'}</small></div></div><div><strong>${exempt?p.role+'保留實績，不設目標':pendingTarget?'職務待核，目標與尚缺尚未判定':unknown?'來源未提供，尚缺未判定':'本月尚缺 '+p.remaining_units+' 台'}</strong><p>${esc(p.original_role)} · ${exempt?'免目標':p.attainment_status==='pending'?'資料待核':p.actual_units>=3?'已達標':'進行中'}</p></div>`;
}
function renderPeople(){
  const store=$('staffStore').value;
  $('staffRows').innerHTML=(snapshot?.people||[]).filter(p=>!store||p.store===store).map(p=>`<tr><td data-label="人員"><strong>${esc(p.masked_name)}</strong><small>${esc(p.store)}</small></td><td data-label="職務">${esc(p.original_role)}</td><td data-label="實績">${units(p.actual_units)}</td><td data-label="目標">${p.target_units===null?(p.attainment_status==='exempt'?'不設目標':'待核'):units(p.target_units)}</td><td data-label="尚缺">${p.remaining_units===null?'不適用／待核':units(p.remaining_units)}</td><td data-label="進度"><span class="tag ${p.attainment_status==='met'?'green':'orange'}">${({met:'已達標',in_progress:'進行中',exempt:'實績追蹤',pending:'待核'})[p.attainment_status]}</span></td></tr>`).join('');
}
function render(){
  $('locked').hidden=true;$('privateWorkspace').hidden=false;
  $('profileLabel').textContent=access.maskedName+' · '+access.role;
  $('updatedLabel').textContent=snapshot?.published_at?'同步於 '+snapshot.published_at:'尚無本月來源';
  const supervisor=access.mode==='supervisor';$('maintenance').hidden=!supervisor;
  if(!snapshot){$('self').textContent='選定月份尚未有資料，實績及缺口保留未知。';$('periodMeta').textContent=$('periodMonth').value+' · 每月3台';return;}
  if(snapshot.period_key!==$('periodMonth').value || snapshot.schema_version!=='tradein-performance/v1')throw new Error('來源月份或格式不符');
  $('exportPanel').hidden=false;$('supervisorArea').hidden=!supervisor;
  if(supervisor){
    $('self').textContent='九店整體實績含店長與代理；逐人目標與尚缺只計有目標同仁。';
    const s=snapshot.summary;
    $('stats').innerHTML=[['九店實績',s.total_units+' 台','含人員待核 '+s.pending_identity_units+' 台'],['同仁月達標',s.met_staff_count+' / '+s.target_staff_count,'每人每月3台；實績待核 '+s.pending_staff_count+' 人'],['逐人尚缺',s.staff_gap_units+' 台',s.pending_staff_count?'已核同仁缺口；其餘待核':'超標不替其他人達標'],['有實績門市',s.mobilized_stores+' / 9','完整九店來源']].map(v=>`<article class="kpi"><span>${v[0]}</span><strong>${v[1]}</strong><small>${v[2]}</small></article>`).join('');
    $('storeRows').innerHTML=snapshot.stores.map(s=>`<tr><td data-label="店點"><strong>${esc(s.store)}</strong></td><td data-label="總實績">${units(s.total_units)}${s.pending_identity_units?'<small class="warning">其中 '+s.pending_identity_units+' 台人員待核</small>':''}</td><td data-label="同仁／目標">${s.target_staff_actual_units} / ${s.staff_target_units}${s.pending_staff_count?'<small class="warning">實績待核 '+s.pending_staff_count+' 人</small>':''}</td><td data-label="達標同仁">${s.met_staff_count} / ${s.target_staff_count}</td><td data-label="店長／代理實績">${units(s.manager_actual_units===null||s.acting_manager_actual_units===null?null:s.manager_actual_units+s.acting_manager_actual_units)}</td><td data-label="涵蓋狀態">${s.coverage==='complete'?'九店來源完整':'人員／職務待核'}</td></tr>`).join('');
    $('staffStore').replaceChildren(...[['','全部授權店點'],...access.allowedStores.map(s=>[s,s])].map(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;return o;}));renderPeople();
  }else{
    if(snapshot.people.length!==1)throw new Error('本人資料尚未對應，請管理者確認名冊');
    $('self').innerHTML=personHtml(snapshot.people[0]);
  }
  refreshExports();
  $('periodMeta').textContent+=` · 取消狀態核對至 ${snapshot.status_as_of_date||snapshot.source_cutoff_date}（報表日期精度）`;
  $('rollbackUpload').disabled=!supervisor||!snapshotHash;
}
async function load(){
  if(writing)return;epoch++;pending.forEach(c=>c.abort());const ticket=epoch;active=false;wipeData();$('loginMessage').textContent='正在驗證並讀取本月資料…';
  try{
    const result=await request({action:'tradein_performance_read',month:$('periodMonth').value,...credential()});
    if(ticket!==epoch)return;
    if(!['self','supervisor'].includes(result.access?.mode))throw new Error('後端未回傳有效授權範圍');
    access=result.access;snapshot=result.snapshot;snapshotHash=result.snapshotHash;active=true;
    localStorage.setItem(EMPLOYEE_KEY,credential().employeeId);window.PortalLogout?.notifyLogin();render();$('loginMessage').textContent='';
  }catch(error){if(ticket===epoch){clearPrivate();$('loginMessage').textContent='讀取未完成：'+error.message;}}
}
function previewHtml(s){return `<p><strong>${esc(s.period_key)}</strong> · 報表 ${esc(s.source_period.start)}–${esc(s.source_period.end)}</p><p>有效回收 ${s.summary.total_units} 台；已對應 ${s.summary.assigned_units} 台；人員待核 ${s.summary.pending_identity_units} 台；取消排除 ${s.summary.cancelled_units} 台；重複列去重 ${s.summary.duplicate_rows} 列。</p><p>月目標：${s.summary.target_staff_count} 人 × 3 ＝ ${s.summary.staff_target_units} 台。${s.summary.pending_identity_units?'待核台數保留店實績，不歸入任何個人。':''}</p>`;}
async function previewUpload(){
  if(writing)return;
  const file=$('sourceFile').files[0];if(!file){$('uploadMessage').textContent='請選擇完整九店 SAR74 CSV。';return;}
  if(!$('completeScope').checked){$('uploadMessage').textContent='請先確認此檔含完整九店、所有人員及專案。';return;}
  if(file.size>20*1024*1024){$('uploadMessage').textContent='檔案超過20MB，請縮小來源月份範圍。';return;}
  const ticket=epoch,uploadTicket=++uploadEpoch;source=null;plan=null;$('publishUpload').disabled=true;
  adminSecret=$('adminSecret').value||adminSecret;$('adminSecret').value='';
  $('uploadMessage').textContent='正在辨識期間、核對名冊與台數…';
  try{
    const bytes=await file.arrayBuffer();let text;
    try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{text=new TextDecoder('big5',{fatal:true}).decode(bytes);}
    const parsed=CORE.parseSar74(text);parsed.complete_nine_stores=true;parsed.source_sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
    if(ticket!==epoch||uploadTicket!==uploadEpoch)return;
    const result=await request({action:'tradein_performance_preview',source:parsed,employeeId:credential().employeeId,adminSecret});
    if(ticket!==epoch||uploadTicket!==uploadEpoch)return;source=parsed;plan=result;
    $('uploadPreview').innerHTML=previewHtml(result.snapshot);$('uploadMessage').textContent='預覽核對完成。確認後將更新 '+parsed.month+'，其他月份保留。';$('publishUpload').disabled=false;
  }catch(error){if(ticket===epoch&&uploadTicket===uploadEpoch){source=null;plan=null;adminSecret='';$('uploadPreview').replaceChildren();$('uploadMessage').textContent='預覽停止：'+error.message;}}
}
async function publishUpload(){
  if(!source||!plan||writing)return;
  setWriting(true);const endWrite=window.PortalLogout?.beginWrite();
  $('uploadMessage').textContent='正在同步並核對保存結果…';
  try{
    const result=await request({action:'tradein_performance_publish',source,rosterHash:plan.rosterHash,previewHash:plan.previewHash,expectedActiveHash:plan.expectedActiveHash,employeeId:credential().employeeId,adminSecret});
    if(!['published','unchanged'].includes(result.status))throw new Error('未取得保存成功狀態');
    if(JSON.stringify(result.snapshot.summary)!==JSON.stringify(plan.snapshot.summary)||!result.snapshotHash)throw new Error('同步後台數與預覽不一致');
    $('periodMonth').value=source.month;source=null;plan=null;adminSecret='';$('sourceFile').value='';$('completeScope').checked=false;$('uploadPreview').replaceChildren();
    $('uploadMessage').textContent=result.status==='unchanged'?'來源相同，已確認不重複累加。':'同步成功，版本與台數回讀核對通過。';
  }catch(error){$('uploadMessage').textContent='同步未確認：'+error.message+'。請重新預覽確認目前版本後再操作。';source=null;plan=null;adminSecret='';}
  finally{setWriting(false);endWrite?.();}
  await load();
}
bindExports(context);
$('periodMonth').value=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}).slice(0,7);
$('employeeId').value=localStorage.getItem(EMPLOYEE_KEY)||'';
$('loginForm').addEventListener('submit',e=>{e.preventDefault();window.PortalLogout?.notifyLogin();load();});
$('refreshData').addEventListener('click',load);
$('periodMonth').addEventListener('change',()=>{uploadEpoch++;source=null;plan=null;adminSecret='';$('publishUpload').disabled=true;load();});
$('staffStore').addEventListener('change',()=>{renderPeople();refreshExports();});
$('employeeId').addEventListener('input',clearPrivate);
function invalidateUpload(){uploadEpoch++;source=null;plan=null;adminSecret='';$('publishUpload').disabled=true;$('uploadPreview').replaceChildren();}
$('sourceFile').addEventListener('change',()=>{$('completeScope').checked=false;invalidateUpload();});
$('completeScope').addEventListener('change',invalidateUpload);
$('previewUpload').addEventListener('click',previewUpload);$('publishUpload').addEventListener('click',publishUpload);
$('logout').addEventListener('click',()=>{if(window.PortalLogout)window.PortalLogout.request();else{localStorage.removeItem(EMPLOYEE_KEY);clearPrivate();}});
$('bindForm').addEventListener('submit',async e=>{e.preventDefault();const code=$('bootstrapCode').value;$('bootstrapCode').value='';window.PortalLogout?.notifyLogin();try{const r=await request({action:'private_request',...credential(),bootstrapCode:code});$('loginMessage').textContent=r.message||'已提出裝置申請';}catch(error){$('loginMessage').textContent=error.message;}});
$('checkBinding').addEventListener('click',async()=>{window.PortalLogout?.notifyLogin();try{const r=await request({action:'private_request_status',...credential()});$('loginMessage').textContent=r.message||r.requestStatus;if(r.requestStatus==='approved')load();}catch(error){$('loginMessage').textContent=error.message;}});
$('rollbackUpload').addEventListener('click',async()=>{
  if(writing||!snapshotHash)return;adminSecret=$('adminSecret').value||adminSecret;$('adminSecret').value='';setWriting(true);const endWrite=window.PortalLogout?.beginWrite();
  try{const result=await request({action:'tradein_performance_rollback',month:$('periodMonth').value,expectedActiveHash:snapshotHash,employeeId:credential().employeeId,adminSecret});if(result.status!=='rolled_back')throw new Error('回復未確認');$('uploadMessage').textContent='已回復本月前一版，其他月份保留。';}catch(error){$('uploadMessage').textContent=error.message;}finally{setWriting(false);adminSecret='';endWrite?.();}await load();
});
window.addEventListener('portal-before-logout',clearPrivate);window.addEventListener('pagehide',clearPrivate);
window.PortalLogout?.setWorkState(()=>({busy:writing,unsaved:!!plan}));
if($('employeeId').value&&!window.PortalLogout?.isLocked())load();
