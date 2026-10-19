const OWNER='https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
const KEY='north12b_password_session_v1',LOGOUT='north12b_portal_logout_event_v1';
const $=id=>document.getElementById(id);
let rows=[],profile=null,editing=null,epoch=0,pending=null,loadedMonth='',leaseTimer;
const message=text=>{$('shareMessage').textContent=text;};
function proof(){
  const p=JSON.parse(sessionStorage.getItem(KEY)||'null');
  const logout=JSON.parse(localStorage.getItem(LOGOUT)||'null')?.id||'';
  if(!p||p.v!==1||p.owner!==OWNER||p.expiresAt<=Date.now()||p.logoutEpoch!==logout||!p.deviceId||!p.token||window.PortalLogout?.isLocked())throw Error('請先登入同仁專區，再返回填寫分享。');
  return p;
}
function resetEditor(){editing=null;$('shareForm').reset();$('shareEditorTitle').textContent='＋新增分享';}
function clear(note='請先登入同仁專區，再讀取分享。'){
  epoch++;pending?.abort();pending=null;clearTimeout(leaseTimer);rows=[];profile=null;loadedMonth='';resetEditor();$('shareType').value='成功成交';$('shareAuthor').textContent='';$('shareCount').textContent='';$('shareStore').replaceChildren(option('','全部門市'));$('shareStaff').replaceChildren(option('','全部同仁'));$('shareFilterType').value='';$('shareList').replaceChildren();$('shareWorkspace').hidden=true;$('shareLogin').hidden=false;busy(false);message(note);
}
function busy(value){$('shareWorkspace').setAttribute('aria-busy',String(value));$('shareForm').querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=value);$('shareRefresh').disabled=value;$('shareList').querySelectorAll('button').forEach(el=>el.disabled=value);}
async function request(action,extra={}){
  if(pending)throw Error('請等待目前操作完成。');
  const p=proof(),ticket=epoch,month=$('periodMonth').value,controller=new AbortController();pending=controller;busy(true);
  const timer=setTimeout(()=>controller.abort(),60000);
  try{
    const response=await fetch(OWNER,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},credentials:'omit',cache:'no-store',signal:controller.signal,
      body:JSON.stringify({action:'employee_tradein_sharing_'+action,deviceId:p.deviceId,token:p.token,month,...extra})});
    if(ticket!==epoch||month!==$('periodMonth').value||proof().token!==p.token)throw Error('登入或月份已變更，請重新讀取。');
    if(!response.ok)throw Error('連線未完成，請稍後重新讀取。');
    const body=await response.json();
    if(ticket!==epoch||month!==$('periodMonth').value||proof().token!==p.token)throw Error('登入或月份已變更，請重新讀取。');
    if(body?.status!=='ok')throw Error(body?.code==='SHARE_VERSION_CONFLICT'?'案例已被更新，請重新讀取後編輯。':'服務尚未開放或登入驗證未通過，請重新登入後再試。');
    return body;
  }finally{clearTimeout(timer);if(pending===controller){pending=null;busy(false);}}
}
function option(value,label){const el=document.createElement('option');el.value=value;el.textContent=label;return el;}
function filters(){
  const store=$('shareStore').value,staff=$('shareStaff').value;
  const stores=[...new Set(rows.map(r=>r.store))].sort();
  $('shareStore').replaceChildren(option('','全部門市'),...stores.map(s=>option(s,s)));
  if(stores.includes(store))$('shareStore').value=store;
  const authors=[...new Set(rows.filter(r=>!$('shareStore').value||r.store===$('shareStore').value).map(r=>r.store+'｜'+r.author))].sort();
  $('shareStaff').replaceChildren(option('','全部同仁'),...authors.map(s=>option(s,s)));
  if(authors.includes(staff))$('shareStaff').value=staff;
}
function node(tag,text,className){const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;}
function button(label,fn){const el=node('button',label,'secondary');el.type='button';el.onclick=()=>void fn().catch(showError);return el;}
function showError(error){if(error.name!=='AbortError')message(error.message);else message('連線已取消；若正在儲存，請重新讀取確認結果後再操作。');}
function render(){
  const list=$('shareList');list.replaceChildren();
  const selected=rows.filter(r=>(!$('shareStore').value||r.store===$('shareStore').value)&&(!$('shareStaff').value||r.store+'｜'+r.author===$('shareStaff').value)&&(!$('shareFilterType').value||r.type===$('shareFilterType').value))
    .sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||b.id.localeCompare(a.id));
  $('shareCount').textContent=selected.length+' 則分享';
  if(!selected.length){list.append(node('p','目前沒有符合條件的分享，歡迎新增第一則案例。'));return;}
  for(const row of selected){
    const card=node('article','','sharing-card');card.dataset.hidden=String(row.hidden);
    card.append(node('h3',(row.featured?'★ 優良案例 · ':'')+row.type+(row.hidden?'（已隱藏）':'')),node('p',row.store+' · '+row.author+' · '+new Date(row.updatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'}),'meta'));
    for(const [title,value] of [['客戶情境',row.scenario],['推薦方式與話術',row.approach],['結果與改善心得',row.outcome]])card.append(node('strong',title),node('p',value));
    const actions=node('div','','export-actions');
    if(row.hasImage)actions.append(button('查看圖片',async()=>{
      const result=await request('detail',{id:row.id});
      if(!result.item?.image)return;
      // The server accepts raster data URLs only; never render HTML or remote URLs.
      if(!/^data:image\/(png|jpeg|webp);base64,/.test(result.item.image))throw Error('圖片格式不符。');
      let img=card.querySelector('img');if(!img){img=document.createElement('img');img.alt='案例分享圖片';card.append(img);}img.src=result.item.image;
    }));
    if(row.editable)actions.append(button('編輯',async()=>{resetEditor();editing={id:row.id,version:row.version};$('shareType').value=row.type;$('shareScenario').value=row.scenario;$('shareApproach').value=row.approach;$('shareOutcome').value=row.outcome;$('shareEditorTitle').textContent='編輯分享';$('shareEditor').open=true;$('shareScenario').focus();}));
    if(profile.supervisor){
      const moderate=async(featured,hidden)=>{await request('moderate',{id:row.id,version:row.version,featured,hidden});const refreshed=await load();message(refreshed?'案例管理設定已儲存。':'管理設定已儲存，但列表未更新，請重新讀取。');};
      actions.append(button(row.featured?'取消優良案例':'標記優良案例',()=>moderate(!row.featured,row.hidden)),button(row.hidden?'恢復顯示':'隱藏分享',()=>moderate(row.featured,!row.hidden)));
    }
    card.append(actions);list.append(card);
  }
}
async function load(){
  message('正在讀取同仁分享…');
  try{const result=await request('list');rows=result.cases;profile=result.profile;loadedMonth=$('periodMonth').value;
    $('shareAuthor').textContent=profile.store+' · '+profile.author+'（自動帶入）';$('shareWorkspace').hidden=false;$('shareLogin').hidden=true;
    clearTimeout(leaseTimer);leaseTimer=setTimeout(()=>clear('登入已到期，請重新登入。'),Math.max(0,proof().expiresAt-Date.now()));
    filters();render();message('已讀取 '+loadedMonth+' 的同仁分享。');return true;
  }catch(error){clear();showError(error);return false;}
}
async function imageData(file){
  if(!file)return null;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>800*1024)throw Error('請選擇 800 KB 以內的 PNG、JPEG 或 WebP 圖片。');
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('圖片讀取失敗。'));reader.readAsDataURL(file);});
}
$('shareForm').addEventListener('submit',async event=>{
  event.preventDefault();if(pending)return;
  const ticket=epoch,month=$('periodMonth').value;
  try{
    proof();
    const uploaded=await imageData($('shareImage').files[0]);
    if(ticket!==epoch||month!==$('periodMonth').value)return;
    // Keep a generated ID on ambiguous transport failure; no automatic write retry.
    editing??={id:crypto.randomUUID(),version:0};
    await request('save',{...editing,type:$('shareType').value,scenario:$('shareScenario').value,approach:$('shareApproach').value,outcome:$('shareOutcome').value,image:uploaded??($('shareRemoveImage').checked?'':null)});
    resetEditor();$('shareEditor').open=false;const refreshed=await load();message(refreshed?'分享已儲存，可由其他同仁查看。':'分享已儲存，但列表未更新，請重新讀取。');
  }catch(error){showError(error);}
});
$('shareCancel').onclick=resetEditor;$('shareRefresh').onclick=()=>void load();
for(const id of ['shareStore','shareStaff','shareFilterType'])$(id).addEventListener('change',()=>{if(id==='shareStore')filters();render();});
$('scope-sharing').addEventListener('click',()=>{if(!profile&&!pending)void load();});
$('scope-sharing').addEventListener('focus',()=>{if($('scope-sharing').getAttribute('aria-selected')==='true'&&!profile&&!pending)void load();});
$('periodMonth').addEventListener('change',()=>{clear('月份已變更，請重新讀取分享。');if($('scope-sharing').getAttribute('aria-selected')==='true')void load();});
window.addEventListener('pagehide',()=>clear());
document.addEventListener('visibilitychange',()=>{if(document.hidden){clear('已暫停分享，返回後請重新讀取。');busy(false);}});
window.addEventListener('portal-before-logout',()=>clear('已登出，請重新登入。'));
window.addEventListener('portal-login-changed',()=>clear('登入已變更，請重新讀取分享。'));
window.addEventListener('storage',event=>{if(event.key===LOGOUT||event.key===null)clear('登入狀態已變更，請重新登入。');});
