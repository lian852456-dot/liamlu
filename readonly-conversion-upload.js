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
  let live = null, preview = null, generation = 0, busy = false;
  async function readConversion(file){
    if(!file.size||file.size>40*1024*1024||!/^.+\.xls[xm]$/i.test(file.name))throw Error('請選擇 40 MB 以內的締結率 Excel。');
    const source=window.ReadonlyConversionSource;
    const bytes=await file.arrayBuffer();
    const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),b=>b.toString(16).padStart(2,'0')).join('');
    const workbook=source.readSource(bytes,XLSX,'array');
    const snapshot=source.parseWorkbook(workbook,XLSX,{sha256,source_name:file.name,source_bytes:file.size});
    return {snapshot,workbook};
  }
  const capacity=window.createCapacityPanel($('capacity-panel'),async()=>{
    const file=$('conversionFile').files[0];
    return file?(await readConversion(file)).snapshot:null;
  });
  const ids = ['conversionFile','renewalEvidenceFiles','conversionPreviewBtn','conversionRefreshBtn','conversionPublishBtn','conversionRollbackBtn'];
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
    if (value?.renewalEvidence) $('conversionLive').textContent += ' · ' + evidenceDates(value.renewalEvidence);
    controls();
  }
  const evidenceLabels={tiers:'門市 Tier',plans:'未續約方案',tariffs:'原資費',daily:'日報原專案'};
  function evidenceDates(value){
    return Object.entries(evidenceLabels).map(([key,label])=>
      label+(value?.[key]?' 至 '+value[key]:'尚無已核對資料')).join(' · ');
  }
  async function refresh(ticket = generation) {
    const result = await call('readonly_conversion_status', payload());
    if (ticket !== generation) throw Error('頁面狀態已變更，請重新讀取版本');
    if (result.status !== 'ok' || !result.live) throw Error('版本讀回不完整');
    renderLive(result.live); return result.live;
  }
  $('conversionFile').addEventListener('change', ()=>{invalidate();capacity.referenceChanged();});
  $('renewalEvidenceFiles').addEventListener('change', invalidate);
  $('conversionConfirm').addEventListener('change', controls);
  $('conversionRefreshBtn').addEventListener('click', async () => {
    if (busy) return; invalidate(); busy = true; controls();
    try { await refresh(); message('conversionMessage', '已讀回目前締結率版本。', 'ok'); }
    catch (error) { live = null; message('conversionMessage', error.message, 'bad'); }
    finally { busy = false; controls(); }
  });
  $('conversionPreviewBtn').addEventListener('click', async () => {
    if (busy) return; invalidate(); const ticket = generation;
    const file = $('conversionFile').files[0], supplements = [...$('renewalEvidenceFiles').files];
    const files = [file, ...supplements].filter(Boolean);
    if (!files.length && capacity.hasFiles()) return capacity.analyze();
    if (!files.length || files.some(source=>!/\.xls[xm]$/i.test(source.name))) {
      return message('conversionMessage', '請選擇締結率原報或續約洞察補充 Excel（.xlsx 或 .xlsm）。', 'bad');
    }
    if (files.length>5 || files.some(source=>!source.size||source.size>40*1024*1024)) {
      return message('conversionMessage', '請選擇最多五份有內容的 Excel，每份 40 MB 以內。', 'bad');
    }
    busy = true; controls(); message('conversionMessage', '正在本機核對 AQ／RT、Tier 與未續約方案…');
    try {
      const source=window.ReadonlyConversionSource, renewalEvidence=[];
      let snapshot=null, analysisIssue='';
      if(file){
        const parsed=await readConversion(file);
        snapshot=parsed.snapshot;
        const workbook=parsed.workbook;
        try{
          const verified=source.parseEvidence(workbook,XLSX,file.name);
          if(verified)renewalEvidence.push(verified);
        }catch(error){analysisIssue=' · 原報洞察未更新：'+error.message;}
      }
      if(ticket!==generation)return;
      if(capacity.hasFiles()){
        if(capacity.ready())capacity.setConversion(snapshot);
        else await capacity.analyze(snapshot);
      }
      for(const extra of supplements){
        const workbook=source.readSource(await extra.arrayBuffer(),XLSX,'array');
        renewalEvidence.push(source.parseEvidence(workbook,XLSX,extra.name,{supplement:true}));
      }
      if (ticket !== generation) return;
      const result = await call('readonly_conversion_preview', payload({
        ...(snapshot?{snapshot}:{}),...(renewalEvidence.length?{renewalEvidence}:{})
      }));
      if (ticket !== generation) return;
      if (result.status !== 'ok' || !result.token || !result.preview?.totals) throw Error('來源預覽回應不完整');
      preview = result; renderLive(result.live);
      const p = result.preview;
      const percent = value => value == null ? '—（分母 0）' : (value * 100).toFixed(2) + '%';
      $('conversionPreviewText').textContent = p.sourceName + ' · ' + p.periodStart + ' 至 ' + p.cutoff +
        ' · ' + p.storeDateKeys + ' 店日 · 北一二B AQ ' + percent(p.totals.aq_rate) + '／RT ' + percent(p.totals.rt_rate) +
        ' · 新增 ' + p.added + '／更正 ' + p.changed + '／移除 ' + p.removed +
        (snapshot&&!snapshot.prior ? ' · 來源未提供同期核對依據' : '') +
        ' · 原始檔 SHA-256 ' + p.sourceHash + (p.sameSource ? ' · 同一原始檔，不累加' : '') +
        (p.renewalEvidence?' · '+evidenceDates(p.renewalEvidence):' · 未取得門市 Tier 或未續約方案彙總。')+
        analysisIssue;
      $('conversionPreview').classList.remove('hidden');
      message('conversionMessage', '預覽通過。確認後發布已核對的門市彙總。', 'ok');
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
        : '已完成私有版本讀回。返回 KPI 戰情可核對同一版本與截止。', 'ok');
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
  window.addEventListener('pagehide', () => { capacity.reset(); invalidate(); $('conversionFile').value = ''; $('renewalEvidenceFiles').value = ''; live = null;
    $('conversionLive').textContent = '尚未核對版本。'; $('conversionPreviewText').textContent = '';
    $('conversionMessage').textContent = ''; controls(); });
})();
