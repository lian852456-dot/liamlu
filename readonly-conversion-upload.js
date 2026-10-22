'use strict';
const auth={employeeId:'',adminSecret:''},$=id=>document.getElementById(id);
let authEpoch=0;
const requests=new Set();
function payload(extra){return Object.assign({employeeId:auth.employeeId,adminSecret:auth.adminSecret},extra||{});}
function message(id,text,tone){const node=$(id);node.textContent=text;node.className='message '+(tone||'');}
const OWNER='https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
async function call(action,body){
  if(location.protocol==='file:')throw Error('請由情報站開啟更新頁；離線副本不提供上傳。');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);requests.add(controller);
  try{const response=await fetch(OWNER,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...body,action}),credentials:'omit',cache:'no-store',signal:controller.signal});
    if(!response.ok)throw Error('原服務暫時無法連線');const result=await response.json();
    if(!result||!['ok','published','already_current','rolled_back'].includes(result.status))throw Error(result?.message||'主管驗證未通過');return result;
  }finally{clearTimeout(timer);requests.delete(controller);}
}
$('loginBtn').addEventListener('click',async()=>{const ticket=++authEpoch,button=$('loginBtn');auth.employeeId=$('employeeId').value.trim().toUpperCase();auth.adminSecret=$('adminSecret').value;if(!auth.employeeId||!auth.adminSecret)return message('authMessage','請輸入既有員編與管理者驗證碼。','bad');button.disabled=true;
try{const result=await call('readonly_conversion_status',payload());if(ticket!==authEpoch)return;if(result.status!=='ok'||!result.live)throw Error('版本讀回不完整');$('authCard').classList.add('hidden');$('app').classList.remove('hidden');$('conversionRefreshBtn').click();$('adminSecret').value='';}
catch(error){if(ticket!==authEpoch)return;auth.employeeId='';auth.adminSecret='';message('authMessage',error.message,'bad');}finally{button.disabled=false;}});
window.addEventListener('pagehide',()=>{authEpoch++;for(const request of requests)request.abort();requests.clear();auth.employeeId='';auth.adminSecret='';$('adminSecret').value='';$('authMessage').textContent='';$('app').classList.add('hidden');$('authCard').classList.remove('hidden');});
(function() {
  'use strict';
  const core = window.ReadonlyDashboardCore;
  let live = null, preview = null, generation = 0, busy = false;
  const ids = ['conversionFile','conversionPreviewBtn','conversionRefreshBtn','conversionPublishBtn','conversionRollbackBtn'];
  function controls() {
    ids.forEach(id => { $(id).disabled = busy; });
    $('conversionConfirm').disabled = busy;
    $('conversionPublishBtn').disabled = busy || !preview || !$('conversionConfirm').checked;
    $('conversionRollbackBtn').disabled = busy || !live?.canRollback;
  }
  function invalidate() {
    generation++; preview = null; $('conversionConfirm').checked = false;
    $('conversionPreview').classList.add('hidden'); controls();
  }
  function renderLive(value) {
    live = value;
    $('conversionLive').textContent = value?.activeHash
      ? '正式截止 ' + value.cutoff + ' · ' + value.sourceName + ' · 版本 ' + value.revision + ' · ' + value.activeHash.slice(0,12)
      : '尚無正式締結率元件' + (value ? ' · 版本 ' + value.revision : '');
    controls();
  }
  async function refresh(ticket = generation) {
    const result = await call('readonly_conversion_status', payload());
    if (ticket !== generation) throw Error('頁面狀態已變更，請重新讀取版本');
    if (result.status !== 'ok' || !result.live) throw Error('版本讀回不完整');
    renderLive(result.live); return result.live;
  }
  $('conversionFile').addEventListener('change', invalidate);
  $('conversionConfirm').addEventListener('change', controls);
  $('conversionRefreshBtn').addEventListener('click', async () => {
    if (busy) return; invalidate(); busy = true; controls();
    try { await refresh(); message('conversionMessage', '已讀回目前締結率版本。', 'ok'); }
    catch (error) { live = null; message('conversionMessage', error.message, 'bad'); }
    finally { busy = false; controls(); }
  });
  $('conversionPreviewBtn').addEventListener('click', async () => {
    if (busy) return; invalidate(); const ticket = generation;
    const file = $('conversionFile').files[0];
    if (!file || !/\.xlsx$/i.test(file.name) || !file.size || file.size > 40 * 1024 * 1024) {
      return message('conversionMessage', '請選擇 40 MB 以內的原始締結率 .xlsx。', 'bad');
    }
    busy = true; controls(); message('conversionMessage', '正在本機核對四張彙總表…');
    try {
      const bytes = await file.arrayBuffer();
      const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2,'0')).join('');
      const workbook = XLSX.read(bytes, {type:'array', sheets:['AQ締結率','RT每日','RT締結率','樞紐']});
      const snapshot = window.ReadonlyConversionSource.parseWorkbook(workbook, XLSX, {sha256, source_name:file.name, source_bytes:file.size});
      if (ticket !== generation) return;
      const result = await call('readonly_conversion_preview', payload({snapshot}));
      if (ticket !== generation) return;
      if (result.status !== 'ok' || !result.token || !result.preview) throw Error('來源預覽回應不完整');
      preview = result; renderLive(result.live);
      const p = result.preview;
      $('conversionPreviewText').textContent = p.sourceName + ' · ' + p.periodStart + ' 至 ' + p.cutoff +
        ' · ' + p.storeDateKeys + ' 店日 · 新增 ' + p.added + '／更正 ' + p.changed + '／移除 ' + p.removed +
        ' · 原始檔 SHA-256 ' + p.sourceHash + (p.sameSource ? ' · 同一原始檔，不累加' : '');
      $('conversionPreview').classList.remove('hidden');
      message('conversionMessage', '預覽通過；尚未發布。只送出已核實的九店逐日彙總。', 'ok');
    } catch (error) { if (ticket === generation) { preview = null; message('conversionMessage', error.message, 'bad'); } }
    finally { busy = false; controls(); }
  });
  $('conversionPublishBtn').addEventListener('click', async () => {
    if (busy || !preview || !$('conversionConfirm').checked) return;
    const expected = preview.preview.hash, token = preview.token, ticket = generation;
    busy = true; controls(); message('conversionMessage', '正在發布並讀回私有版本…');
    try {
      const result = await call('readonly_conversion_publish', payload({previewToken:token, confirm:true}));
      if (ticket !== generation) return;
      if (!['published','already_current'].includes(result.status) || result.live?.activeHash !== expected) throw Error('發布結果或內容雜湊不符，請讀取版本核對');
      const verified = await refresh();
      if (ticket !== generation) return;
      if (verified.activeHash !== expected || verified.revision !== result.live.revision) throw Error('發布後版本已改變，請重新核對');
      invalidate(); message('conversionMessage', result.status === 'already_current'
        ? '正式資料已是這個版本；未重複寫入或累加。'
        : '已完成私有版本讀回。請從情報站重新核驗儀表板，核對截止與趨勢。', 'ok');
    } catch (error) { invalidate(); message('conversionMessage', error.message, 'bad'); }
    finally { busy = false; controls(); }
  });
  $('conversionRollbackBtn').addEventListener('click', async () => {
    if (busy || !live?.canRollback) return;
    if (!window.confirm('回復上一個締結率元件？只切換此元件，KPI、台獎與個績維持原版本。')) return;
    const expected = live.previousHash, revision = live.revision, hash = live.activeHash;
    invalidate(); const ticket = generation; busy = true; controls();
    try {
      const result = await call('readonly_conversion_rollback', payload({confirm:true, expectedRevision:revision, expectedActiveHash:hash}));
      if (ticket !== generation) return;
      if (result.status !== 'rolled_back' || result.live?.activeHash !== expected) throw Error('回復回應不完整');
      const verified = await refresh();
      if (verified.activeHash !== expected || verified.revision !== result.live.revision) throw Error('回復後版本已改變，請重新核對');
      message('conversionMessage', '已回復並完成私有指標讀回。', 'ok');
    } catch (error) { live = null; message('conversionMessage', error.message, 'bad'); }
    finally { busy = false; controls(); }
  });
  window.addEventListener('pagehide', () => { invalidate(); $('conversionFile').value = ''; live = null;
    $('conversionLive').textContent = '尚未核對版本。'; $('conversionPreviewText').textContent = '';
    $('conversionMessage').textContent = ''; controls(); });
})();
