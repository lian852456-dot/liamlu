import {applyTargets,personalRules,targetPolicy} from './tradein-target-policy.mjs?v=20261012-targets-1';
import {bindExports,refreshExports,clearExports} from './tradein-export-ui.mjs?v=20261012-targets-1';
import {formatDifference,formatRecoveredModels,isDate} from './tradein-export-core.mjs?v=20261012-targets-1';
import {createPublicReader,readPublicFrame} from './tradein-public-read.mjs?v=20261010-date-read-1';
import {boundedOperation} from './tradein-admin-operation.mjs?v=20261015-preview-recovery-1';
import {prepareSource} from './tradein-sar74-source.mjs?v=20261017-paste-speed-1';
const $=id=>document.getElementById(id),CORE=window.TradeinPerformanceCore,PUBLIC=window.TradeinPublicCore;
const API='https://script.google.com/macros/s/AKfycbwf_ms5rkOIg92FOZwZuHCft3JWpC7ENPUN6c6ebPb1Jd6eqKYfa_2tmrI8onDIl4Mi/exec';
let snapshot=null,readEpoch=0,controller=null,source=null,plan=null,admin=null,checkpoint=null,busy=false,uploadEpoch=0,reading=false;
let uploadController=null,uploadKind=null;
let localSource=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const units=n=>n===null?'未提供':n+' 台';
const selectedCounts=new Set();
let selectedDate='';
const personTuple=p=>[p.store,p.masked_name,p.target_units===null?'免目標':'同仁',p.actual_units,p.recovered_models??null];
function sourceDateRange(){return snapshot?.source_period||null;}
function dateInSource(date){const range=sourceDateRange();return Boolean(range&&isDate(date)&&date>=range.start&&date<=range.end);}
function dayEntry(person){
 if(!selectedDate||!dateInSource(selectedDate)||!Array.isArray(person.recovered_days))return null;
 const entry=person.recovered_days.find(day=>day&&day.date===selectedDate);
 return entry?{actual_units:entry.actual_units,recovered_models:entry.recovered_models??null}:{actual_units:0,recovered_models:[]};
}
function dailyAvailable(){return Boolean(selectedDate&&dateInSource(selectedDate)&&Array.isArray(snapshot?.people)&&snapshot.people.every(p=>Array.isArray(p.recovered_days)));}
function visiblePeople(){
 if(!selectedDate)return snapshot?.people||[];
 if(!dailyAvailable())return [];
 return snapshot.people.map(person=>{const day=dayEntry(person);return {...person,actual_units:day.actual_units,recovered_models:day.recovered_models};});
}
function filteredPeople(){const store=$('staffStore').value;return visiblePeople().filter(p=>(!store||p.store===store)&&(!selectedCounts.size||selectedCounts.has(p.actual_units===null?'unknown':String(p.actual_units))));}
function modelsText(p){return esc(formatRecoveredModels(p.actual_units,p.recovered_models));}
async function request(payload,{signal,onSlow}={}){
 return boundedOperation(async attemptSignal=>{
  const response=await fetch(API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),cache:'no-store',credentials:'omit',signal:attemptSignal});
  if(!response.ok)throw Error('服務暫時無回應（HTTP '+response.status+'）');const body=await response.json();if(!body||body.status==='error')throw Error(body?.message||'讀取未完成');return body;
 },{signal,onSlow,timeoutMessage:'服務核對逾時（60 秒），請稍後再試'});
}
function context(){const period=CORE.monthPeriod($('periodMonth').value),people=visiblePeople();return {active:!!snapshot,mode:'public',dailyAvailable:dailyAvailable(),people:(selectedDate?people:snapshot?.people||[]).map(personTuple),currentPeople:filteredPeople().map(personTuple),countFilterLabel:selectedCounts.size?'回收 '+[...selectedCounts].map(n=>n==='unknown'?'待核':n+' 筆').join('、'):'',allowedStores:snapshot?.stores.map(s=>s.store)||[],selectedStore:$('staffStore').value,rules:{...period,month:$('periodMonth').value,periodStatus:'confirmed',cadence:'monthly',...personalRules($('periodMonth').value),storeTarget:snapshot?.target_policy?snapshot.summary.target_units:null,isDemo:false,sourceStart:snapshot?.source_period.start,sourceEnd:snapshot?.source_period.end,cutoff:snapshot?.source_cutoff_date,timezone:'Asia/Taipei',selectedDate}};}
function wipe(){snapshot=null;selectedCounts.clear();clearExports();$('dateModeNote').hidden=true;$('publicWorkspace').hidden=true;['stats','storeRows','staffRows','staffCounts'].forEach(id=>$(id).replaceChildren());$('staffResultCount').textContent='';$('periodMeta').textContent='';$('updatedLabel').textContent='';$('staffStore').replaceChildren();$('recoveryDate').disabled=true;$('clearRecoveryDate').disabled=true;}
function renderPeople(){const people=filteredPeople(),daily=Boolean(selectedDate);$('staffResultCount').textContent=daily&&!dailyAvailable()?'顯示未知':'顯示 '+people.length+' 人';$('allStaffCounts').setAttribute('aria-pressed',String(!selectedCounts.size));$('staffRows').innerHTML=people.length?people.map(p=>daily?`<tr data-public-id="${p.public_id}"><td data-label="人員"><strong>${esc(p.masked_name)}</strong><small>${esc(p.store)}</small></td><td data-label="當日回收">${units(p.actual_units)}</td><td data-label="回收機款" class="recovered-models">${modelsText(p)}</td></tr>`:`<tr data-public-id="${p.public_id}"><td data-label="人員"><strong>${esc(p.masked_name)}</strong><small>${esc(p.store)}</small></td><td data-label="實績">${units(p.actual_units)}</td><td data-label="目標">${p.target_units===null?'不設目標':units(p.target_units)}</td><td data-label="目前差異">${formatDifference(p.actual_units,p.target_units)}</td><td data-label="回收機款" class="recovered-models">${modelsText(p)}</td></tr>`).join(''):`<tr class="empty-people"><td colspan="${daily?3:5}">${daily&&!dailyAvailable()?'選定日期資料尚未提供，明細保留未知。':'沒有符合篩選條件的人員'}</td></tr>`;}
function renderCounts(){const people=visiblePeople();if(selectedDate&&!dailyAvailable()){ $('staffCounts').replaceChildren();$('allStaffCounts').disabled=true;return; }$('allStaffCounts').disabled=false;const values=[...new Set(['0','1','2','3','4',...people.filter(p=>p.actual_units!==null).map(p=>String(p.actual_units))])].sort((a,b)=>Number(a)-Number(b));if(people.some(p=>p.actual_units===null))values.push('unknown');$('staffCounts').innerHTML=values.map(n=>`<label class="count-choice"><input type="checkbox" name="staffCount" value="${n}"><span>${n==='unknown'?'待核':n+' 筆'}</span></label>`).join('');}
function setHeaders(daily){
 const store=$('storeHead').querySelectorAll('th'),person=$('personHead').querySelectorAll('th');
 store[1].textContent=daily?'當日回收':'實績';store[2].textContent=daily?'':snapshot?.target_policy?'店目標':'同仁目標';store[3].textContent=daily?'':'門市尚缺';store[4].textContent=daily?'':'達成率';store[5].textContent=daily?'':'達標人數';
 person[1].textContent=daily?'當日回收':'實績';person[2].textContent=daily?'回收機款':'目標';person[3].textContent=daily?'':'目前差異';person[4].textContent=daily?'':'回收機款';
 store.forEach((cell,index)=>{cell.hidden=daily&&index>1;});
 person.forEach((cell,index)=>{cell.hidden=daily&&index>2;});
 }
function dailyRows(){const byStore=new Map(snapshot.stores.map(s=>[s.store,0]));visiblePeople().forEach(p=>byStore.set(p.store,(byStore.get(p.store)||0)+p.actual_units));return [...byStore.entries()].map(([store,actual_units])=>({store,actual_units}));}
function renderUnknownDay(){
 $('readMessage').textContent='選定日期資料尚未提供，當日回收、店點與人員明細保留未知。';$('dateModeNote').hidden=false;$('periodMeta').textContent=`${snapshot.month} · 統計日期 ${selectedDate||'未選定'} · 來源 ${snapshot.source_period.start}–${snapshot.source_cutoff_date}`;
 $('stats').innerHTML=[['當日回收','未提供','選定日期資料未知'],['有回收店數','未提供','選定日期資料未知'],['有回收人數','未提供','選定日期資料未知'],['統計日期',selectedDate||'未選定','台北時間']].map(v=>`<article class="kpi"><span>${v[0]}</span><strong>${v[1]}</strong><small>${v[2]}</small></article>`).join('');
 $('storeRows').innerHTML='<tr class="empty-people"><td colspan="2">選定日期資料尚未提供，明細保留未知。</td></tr>';$('staffRows').innerHTML='<tr class="empty-people"><td colspan="3">選定日期資料尚未提供，明細保留未知。</td></tr>';$('staffResultCount').textContent='顯示未知';$('staffCounts').replaceChildren();$('allStaffCounts').disabled=true;refreshExports();
 }
function render(){const s=snapshot.summary,daily=Boolean(selectedDate);$('publicWorkspace').hidden=document.getElementById('scope-sharing')?.getAttribute('aria-selected')==='true';$('readMessage').textContent='';$('updatedLabel').textContent='更新於 '+snapshot.published_at;$('recoveryDate').disabled=false;$('clearRecoveryDate').disabled=false;$('recoveryDate').min=snapshot.source_period.start;$('recoveryDate').max=snapshot.source_period.end;$('dateModeNote').hidden=!daily;$('personRuleNote').textContent=daily?'當日只顯示回收數與回收機款；每月目標與達標請切回整月查看。':'目前差異＝實績－月目標；負數為未達，0 為達標，正數為超標。'+(snapshot.target_policy?'含店長及代理店長，每人每月4台。':'免目標人員不計差異。')+'';setHeaders(daily);
 if(daily&&!dailyAvailable()){renderUnknownDay();return;}
 if(daily){const people=visiblePeople(),stores=dailyRows(),actual=people.reduce((n,p)=>n+p.actual_units,0),storeCount=stores.filter(p=>p.actual_units>0).length,personCount=people.filter(p=>p.actual_units>0).length;$('periodMeta').textContent=`${snapshot.month} · 統計日期 ${selectedDate} · 來源 ${snapshot.source_period.start}–${snapshot.source_cutoff_date}`;$('stats').innerHTML=[['當日回收',units(actual),'只統計所選日期'],['有回收店數',storeCount+' 店','當日實績大於 0'],['有回收人數',personCount+' 人','當日實績大於 0'],['統計日期',selectedDate,'台北時間']].map(v=>`<article class="kpi"><span>${v[0]}</span><strong>${v[1]}</strong><small>${v[2]}</small></article>`).join('');$('storeRows').innerHTML=stores.map(p=>`<tr><td data-label="店點"><strong>${esc(p.store)}</strong></td><td data-label="當日回收">${units(p.actual_units)}</td></tr>`).join('');
 }else{$('periodMeta').textContent=`${snapshot.month} · 來源 ${snapshot.source_period.start}–${snapshot.source_cutoff_date} · 每人每月 ${personalRules(snapshot.month).staffTarget} 台`;$('stats').innerHTML=[['全區實績',units(s.actual_units),'含店長與代理店長實績'],[snapshot.target_policy?'門市月目標':'同仁月目標',units(s.target_units),snapshot.target_policy?'重點Device ×12%逐店進位；個人合計 '+s.personal_target_units+' 台':s.target_people+' 人 × 3 台'],['達標人數',s.met_people+' / '+s.target_people,s.target_people+' 人 × '+personalRules(snapshot.month).staffTarget+' 台'],['門市尚缺',units(s.remaining_units),'達成率 '+(s.target_units?Math.round(s.actual_units/s.target_units*1000)/10:0)+'%']].map(v=>`<article class="kpi"><span>${v[0]}</span><strong>${v[1]}</strong><small>${v[2]}</small></article>`).join('');$('storeRows').innerHTML=snapshot.stores.map(s=>`<tr><td data-label="店點"><strong>${esc(s.store)}</strong></td><td data-label="實績">${units(s.actual_units)}</td><td data-label="店目標">${units(s.target_units)}</td><td data-label="門市尚缺">${units(s.remaining_units)}</td><td data-label="達成率">${s.target_units?Math.round(s.actual_units/s.target_units*1000)/10:0}%</td><td data-label="達標人數">${s.met_people} / ${s.target_people}</td></tr>`).join('');}
 const selectedStore=$('staffStore').value;$('staffStore').replaceChildren(...[['','全區九店'],...snapshot.stores.map(s=>[s.store,s.store])].map(([value,text])=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o;}));if(selectedStore&&snapshot.stores.some(s=>s.store===selectedStore))$('staffStore').value=selectedStore;renderCounts();renderPeople();refreshExports();}
const readPublic=createPublicReader({endpoint:API,frame:(payload,signal)=>readPublicFrame(API,payload,signal),post:async(url,payload,signal)=>{
 const response=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),cache:'no-store',credentials:'omit',signal});
 if(!response.ok)throw Error('服務暫時無回應（HTTP '+response.status+'）');return response.json();
}});
function readControls(){const button=$('refreshData');button.disabled=busy||reading;button.textContent=reading?'讀取中…':'重新讀取';$('publicWorkspace').setAttribute('aria-busy',String(reading));}
async function load({allowBusy=false}={}){if(busy&&!allowBusy)return false;const ticket=++readEpoch,month=$('periodMonth').value;controller?.abort();controller=new AbortController();reading=true;readControls();wipe();$('readMessage').textContent='正在讀取已核對資料…';
 try{const result=await readPublic({action:'tradein_performance_public_read',month,includeDays:true},{signal:controller.signal,onFallback:()=>{if(ticket===readEpoch)$('readMessage').textContent='連線較慢，正在自動重新連線…';}});if(ticket!==readEpoch)return false;if(!result.snapshot){$('readMessage').textContent='選定月份尚未提供來源，實績、目標與缺口保留未知。';return false;}PUBLIC.validate(result.snapshot);if(result.snapshot.month!==month)throw Error('來源月份不符');snapshot=applyTargets(result.snapshot);snapshot.people.sort((a,b)=>(b.actual_units??-1)-(a.actual_units??-1)||a.masked_name.localeCompare(b.masked_name));render();return true;}
 catch(error){if(ticket===readEpoch){wipe();$('readMessage').textContent='讀取未完成：'+(error.name==='TimeoutError'?'服務連線較慢，請稍後重新讀取':error.name==='AbortError'?'讀取已取消':error.message);}return false;}finally{if(ticket===readEpoch){reading=false;readControls();}}}

function scope(value){$('exportPanel').hidden=value==='sharing';$('maintenance').hidden=value==='sharing';$('publicWorkspace').hidden=value==='sharing'||!snapshot;document.querySelectorAll('[data-public-scope]').forEach(b=>{const chosen=b.dataset.publicScope===value;b.setAttribute('aria-selected',String(chosen));b.tabIndex=chosen?0:-1;$('actual-'+b.dataset.publicScope).hidden=!chosen;});}
function setBusy(value){busy=value;['adminEmployeeId','adminSecret','sourceMode','sourcePaste','validateSource','sourceFile','completeScope','previewUpload','publishUpload','rollbackUpload','periodMonth','recoveryDate','clearRecoveryDate','refreshData'].forEach(id=>$(id).disabled=value);$('cancelPreview').hidden=!value||uploadKind!=='preview';$('cancelPreview').disabled=!value||uploadKind!=='preview';$('maintenance').setAttribute('aria-busy',String(value));if(!value){$('publishUpload').disabled=!plan;$('rollbackUpload').disabled=!checkpoint;$('recoveryDate').disabled=!snapshot;$('clearRecoveryDate').disabled=!snapshot;}readControls();}
function beginUpload(kind){uploadController=new AbortController();uploadKind=kind;const task={ticket:++uploadEpoch,signal:uploadController.signal};setBusy(true);return task;}
function currentUpload(task){return task.ticket===uploadEpoch&&!task.signal.aborted;}
function finishUpload(task){if(task.ticket!==uploadEpoch)return;uploadController=null;uploadKind=null;setBusy(false);}
function cancelPreview(){if(!busy||uploadKind!=='preview')return;uploadEpoch++;uploadController?.abort();uploadController=null;uploadKind=null;source=null;plan=null;admin=null;$('uploadPreview').replaceChildren();$('uploadMessage').textContent='已取消預覽，尚未同步資料。';setBusy(false);}
function stage(task,message){if(!currentUpload(task))throw new DOMException('操作已取消','AbortError');$('uploadMessage').textContent=message;return {signal:task.signal,onSlow:()=>{if(currentUpload(task))$('uploadMessage').textContent=message+' 連線較慢，等待回覆中（最多 60 秒）…';}};}
function invalidate(clearLocal=false){if(busy){if(uploadKind==='preview')cancelPreview();else return;}uploadEpoch++;source=null;plan=null;admin=null;$('publishUpload').disabled=true;$('uploadPreview').replaceChildren();if(clearLocal){localSource=null;$('uploadLocalPreview').replaceChildren();}}
function sourceSelection(){const mode=$('sourceMode').value;return {mode,key:mode==='paste'?$('sourcePaste').value:$('sourceFile').files[0]};}
function renderLocal(value){
 const s=value.summary,host=$('uploadLocalPreview');host.replaceChildren();
 for(const text of [
  `本機檢查完成（尚未同步）：${value.source.month}，來源期間 ${value.source.source_start}–${value.source.source_end}，取消核對日 ${value.source.status_as_of_date}。`,
  `${s.rows} 列；${s.unique} 個回收碼；重複列 ${s.duplicates} 列；未取消 ${s.active} 筆；取消 ${s.cancelled} 筆。個人歸屬及正式台數仍須管理者核對。`,
  s.stores.map(store=>store.store+' '+store.rows).join('／'),
  `${value.format} · ${value.encoding} · ${value.bytes} bytes；來源 SHA-256：${value.source.source_sha256}`,
  value.mode==='paste'?'貼上來源雜湊以本次原文字的 UTF-8 計算；與原 CSV 檔案雜湊可能不同。':'保留原 CSV 位元組的來源雜湊。',
  s.cancelled?'本批含取消交易；依現行規則，取消／跨月沖回月份尚待核定，不能同步。':'請確認來源涵蓋完整九店、所有人員及專案（含單銷）；缺席店點不以列數推定為零。'
 ]){const p=document.createElement('p');p.textContent=text;host.append(p);}
}
async function readLocal(task){
 const selection=sourceSelection();
 if(localSource&&localSource.mode===selection.mode&&localSource.key===selection.key){renderLocal(localSource.value);return localSource.value;}
 const value=await prepareSource({mode:selection.mode,file:selection.mode==='file'?selection.key:null,text:selection.mode==='paste'?selection.key:null,core:CORE,signal:task.signal,onStage:message=>stage(task,message)});
 if(!currentUpload(task))throw new DOMException('操作已取消','AbortError');
 localSource={...selection,value};renderLocal(value);return value;
}
async function validateLocal(){if(busy)return;invalidate();const task=beginUpload('preview');
 try{await readLocal(task);$('uploadMessage').textContent='本機檢查完成，尚未連線核對或同步資料。';}
 catch(error){if(currentUpload(task)){$('uploadMessage').textContent='本機檢查停止：'+error.message;}}
 finally{finishUpload(task);}
}
function credentials(){const employeeId=$('adminEmployeeId').value.trim().toUpperCase(),adminSecret=$('adminSecret').value;if(!employeeId||!adminSecret)throw Error('請提供管理者員編與密碼');return {employeeId,adminSecret};}
function expected(s){return {expectedRegistryExists:s.registryExists,expectedRegistryHash:s.registryHash,expectedPublicRegistryExists:s.publicRegistryExists,expectedPublicRegistryHash:s.publicRegistryHash,expectedActiveHash:s.activeHash,expectedMonthlyHash:s.monthlyHash,expectedReferenceHash:s.referenceHash};}
async function preview(){if(busy)return;let task;source=null;plan=null;admin=null;$('publishUpload').disabled=true;$('uploadPreview').replaceChildren();
 try{if(!$('completeScope').checked)throw Error('請提供完整九店 SAR74 並確認涵蓋範圍');const authorization=credentials();$('adminSecret').value='';task=beginUpload('preview');const local=await readLocal(task);if(local.summary.cancelled)throw Error('本批含取消交易；取消／跨月沖回月份尚待核定，整批停止同步');const parsed={...local.source,complete_nine_stores:true};
 const result=await request({action:'tradein_performance_preview',source:parsed,includeCheckpointState:true,...authorization},stage(task,'檔案已讀取，正在核對管理者與本月資料…'));if(!currentUpload(task))return;source=parsed;plan=result;admin=authorization;const s=result.snapshot.summary,policy=targetPolicy(parsed.month),targetPeople=policy?result.snapshot.people.length:s.target_staff_count,personalTarget=policy?.personalTarget||3;
 $('uploadPreview').textContent=`${parsed.month}：有效回收 ${s.total_units} 台；已對應 ${s.assigned_units} 台；待核 ${s.pending_identity_units} 台。目標 ${targetPeople} 人 × ${personalTarget} ＝ ${targetPeople*personalTarget} 台。${policy?"門市目標合計 159 台，與個人目標分別計算。":""}`;$('uploadMessage').textContent='預覽核對完成，確認後同步本月。';
 }catch(error){if(task&&!currentUpload(task))return;source=null;plan=null;admin=null;$('uploadMessage').textContent='預覽停止：'+error.message+'。尚未同步資料，請重新預覽。';}finally{if(task)finishUpload(task);}}
async function publish(){if(busy||!source||!plan||!admin)return;const task=beginUpload('publish');let publicVerified=false,readAttempted=false;
 try{const base={...admin,month:source.month,sourceHash:source.source_sha256};let state=plan.checkpointState;
 if(state!==undefined){if(!state||state.month!==base.month||state.sourceHash!==base.sourceHash||state.activeHash!==plan.expectedActiveHash)throw Error('預覽檢查點來源或版本不符，請重新預覽');}
 else state=await request({action:'tradein_performance_checkpoint_status',...base},stage(task,'正在核對更新前版本…'));
 checkpoint={month:base.month,sourceHash:base.sourceHash,...await request({action:'tradein_performance_checkpoint_capture',...base,...expected(state),stage:'C1',source,previewHash:plan.previewHash,rosterHash:plan.rosterHash},stage(task,'正在保存更新前狀態…'))};
 const result=await request({action:'tradein_performance_publish',...admin,source,rosterHash:plan.rosterHash,previewHash:plan.previewHash,expectedActiveHash:plan.expectedActiveHash},stage(task,'正在同步本月資料並核對回覆…'));
 if(!['published','unchanged'].includes(result.status)||!result.snapshotHash||JSON.stringify(result.snapshot.summary)!==JSON.stringify(plan.snapshot.summary))throw Error('同步台數尚未確認');
 const projected=await request({action:'tradein_performance_public_publish',...base,expectedActiveHash:result.snapshotHash,includeReadback:true},stage(task,'正在核對公開進度…'));if(!currentUpload(task))return;if(!['published','unchanged'].includes(projected.status))throw Error('公開進度尚未確認');
 if(Object.prototype.hasOwnProperty.call(projected,'readback')){
  const value=projected.readback?.snapshot;PUBLIC.validate(value);
  if(projected.privateSnapshotHash!==result.snapshotHash||projected.sourceHash!==base.sourceHash||value.month!==source.month||value.summary.actual_units!==plan.snapshot.summary.total_units)throw Error('公開讀回的來源、版本或台數不符');
  $('periodMonth').value=source.month;readEpoch++;controller?.abort();reading=false;snapshot=applyTargets(value);snapshot.people.sort((a,b)=>(b.actual_units??-1)-(a.actual_units??-1)||a.masked_name.localeCompare(b.masked_name));render();publicVerified=true;
 }
 if(!publicVerified){
  $('periodMonth').value=source.month;stage(task,'發布已回覆，正在完整讀回公開進度…');readAttempted=true;
  if(!await load({allowBusy:true})||snapshot?.summary.actual_units!==plan.snapshot.summary.total_units)throw Error('公開讀回未完成核對，請先重新讀取目前版本');
  publicVerified=true;
 }
 $('periodMonth').value=source.month;$('uploadMessage').textContent='同步成功，已核對資料與公開進度；相同來源不重複累加。';source=null;plan=null;admin=null;localSource=null;$('sourceFile').value='';$('sourcePaste').value='';$('completeScope').checked=false;$('uploadPreview').replaceChildren();$('uploadLocalPreview').replaceChildren();
 }catch(error){if(!currentUpload(task))return;$('uploadMessage').textContent='同步未確認：'+error.message+'。系統未自動重送；請先重新預覽同一原檔核對目前版本，必要時回復本次更新前狀態。';source=null;plan=null;admin=null;}finally{finishUpload(task);}if(currentUpload(task)&&!publicVerified&&!readAttempted)await load();}
async function restore(){if(busy||!checkpoint)return;let task;try{const base={...credentials(),month:checkpoint.month,sourceHash:checkpoint.sourceHash};$('adminSecret').value='';task=beginUpload('restore');const state=await request({action:'tradein_performance_checkpoint_status',...base},stage(task,'正在核對回復前版本…'));const result=await request({action:'tradein_performance_checkpoint_restore',...base,...expected(state),checkpointId:checkpoint.checkpointId,checkpointHash:checkpoint.checkpointHash,restoreMonth:true},stage(task,'正在回復並核對本月版本…'));if(!currentUpload(task))return;if(result.status!=='checkpoint_restored')throw Error('回復尚未確認');$('periodMonth').value=checkpoint.month;checkpoint=null;source=null;plan=null;admin=null;$('uploadMessage').textContent='已回復本次更新前的月版本，其他月份保留。';}catch(error){if(task&&!currentUpload(task))return;$('uploadMessage').textContent='回復未確認：'+error.message+'。系統未自動重送，請先重新讀取核對。';}finally{if(task)finishUpload(task);}if(task&&currentUpload(task))await load();}
bindExports(context);$('periodMonth').value=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}).slice(0,7);$('recoveryDate').value='';$('recoveryDate').disabled=true;$('clearRecoveryDate').disabled=true;
const tabs=[...document.querySelectorAll('[data-public-scope]')];tabs.forEach((b,i)=>{b.tabIndex=b.getAttribute('aria-selected')==='true'?0:-1;b.addEventListener('click',()=>scope(b.dataset.publicScope));b.addEventListener('keydown',e=>{const d=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;if(d){e.preventDefault();const next=tabs[(i+d+tabs.length)%tabs.length];scope(next.dataset.publicScope);next.focus();}});});
$('refreshData').addEventListener('click',()=>{if(!reading)load();});$('periodMonth').addEventListener('change',()=>{selectedDate='';$('recoveryDate').value='';selectedCounts.clear();invalidate();load();});$('recoveryDate').addEventListener('change',()=>{selectedDate=$('recoveryDate').value;selectedCounts.clear();if(snapshot)render();});$('clearRecoveryDate').addEventListener('click',()=>{$('recoveryDate').value='';selectedDate='';selectedCounts.clear();if(snapshot)render();});$('staffStore').addEventListener('change',()=>{renderPeople();refreshExports();});
$('staffCounts').addEventListener('change',e=>{if(e.target.name!=='staffCount')return;e.target.checked?selectedCounts.add(e.target.value):selectedCounts.delete(e.target.value);renderPeople();refreshExports();});
$('allStaffCounts').addEventListener('click',()=>{selectedCounts.clear();$('staffCounts').querySelectorAll('input').forEach(input=>input.checked=false);renderPeople();refreshExports();});
for(const id of ['adminEmployeeId','adminSecret','completeScope'])$(id).addEventListener('change',()=>invalidate());
$('sourceMode').addEventListener('change',()=>{invalidate(true);$('sourceFileWrap').hidden=$('sourceMode').value!=='file';$('sourcePasteWrap').hidden=$('sourceMode').value!=='paste';});
$('sourceFile').addEventListener('change',()=>invalidate(true));$('sourcePaste').addEventListener('input',()=>invalidate(true));
$('validateSource').addEventListener('click',validateLocal);
$('previewUpload').addEventListener('click',preview);$('publishUpload').addEventListener('click',publish);$('rollbackUpload').addEventListener('click',restore);
$('cancelPreview').addEventListener('click',cancelPreview);
window.addEventListener('pagehide',()=>{readEpoch++;controller?.abort();reading=false;uploadEpoch++;uploadController?.abort();uploadController=null;uploadKind=null;admin=null;checkpoint=null;source=null;plan=null;localSource=null;$('adminSecret').value='';$('sourcePaste').value='';$('uploadLocalPreview').replaceChildren();$('uploadPreview').replaceChildren();$('uploadMessage').textContent=busy?'操作回覆未確認，請重新預覽原檔核對目前版本。':'';setBusy(false);});load();
