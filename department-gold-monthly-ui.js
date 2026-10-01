(function() {
  'use strict';
  window.DepartmentGoldMonthlyUI = {create};
  function create({request, readWorkbook, getToken, lockWorkspace}) {
    const C=window.DepartmentGoldMonthlyCore, $=id=>document.getElementById(id);
    const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const fmt=v=>v==null?'無來源':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:2});
    let saved=[], revision='', history={}, candidate=[], plan=null, generation=0, busy=false;
    const codes={SOURCE_TOTAL_MISMATCH:'原表總計與人員淨金牌不符',EMPLOYEE_DUPLICATE:'同月員編重複，請確認原檔',SOURCE_MONTH_CONFLICT:'來源月份與截止日不一致',PRIMARY_GOLD_AMBIGUOUS:'無法唯一辨識全員主表金牌',GOLD_VERSION_CONFLICT:'已保存版本有更新，請重新載入並預覽',GOLD_PREVIEW_EXPIRED:'預覽已逾時，請重新確認',GOLD_READBACK_FAILED_PREVIOUS_RESTORED:'讀回失敗，已保留上一版',GOLD_REFRESH_REQUIRED:'請先更新後端月報版本',GOLD_STORAGE_SHARED:'私有資料權限不符',GOLD_SOURCE_HASH_CONFLICT:'相同原檔識別但內容不同，已停止儲存'};
    function message(id, text, error) {const e=$(id);e.textContent=text||'';e.className='message'+(error?' error':'');}
    function resetCandidate(){candidate=[];plan=null;$('monthlyPreview').hidden=true;$('monthlyPreviewBody').textContent='';$('monthlyConfirm').hidden=true;$('monthlyConfirmText').textContent='';$('monthlyServerDiff').textContent='';$('publishGold').disabled=true;if(!saved.length)$('goldDashboard').hidden=true;$('goldFile').value='';$('excelPassword').value='';}
    function clear(){generation++;saved=[];revision='';history={};resetCandidate();$('goldDashboard').hidden=true;['peopleBody','peopleCount','goldSummary','goldSourceMeta','quarterStrip','monthlyStatus','monthFilter','storeFilter','employeeFilter','monthlyHistoryMonth','monthlyHistoryVersion'].forEach(id=>$(id).textContent='');['goldMessage','publishMessage'].forEach(id=>message(id,''));}
    async function call(payload){
      const result=await request({...payload,token:getToken()});
      if(result?.status!=='ok'){
        if(result?.message==='unauthorized'||result?.authReason){clear();lockWorkspace();}
        throw new Error(codes[result?.message]||result?.message||'資料服務未完成');
      }
      return result;
    }
    function selected(){const key=$('monthFilter').value;return key.startsWith('quarter:')?C.quarterMonths(key.slice(8)):[key];}
    function filters(){return {region:$('regionFilter').value,store:$('storeFilter').value,employee:$('employeeFilter').value};}
    function setOptions(el, entries, first){const old=el.value;el.innerHTML=(first?`<option value="">${esc(first)}</option>`:'')+entries.map(x=>`<option value="${esc(x.value)}">${esc(x.label)}</option>`).join('');if(entries.some(x=>x.value===old))el.value=old;}
    function initialize(){
      const quarters=Array.from(new Set(saved.map(m=>C.quarter(m.monthKey)))).sort().reverse();
      setOptions($('monthFilter'),[...quarters.map(q=>({value:'quarter:'+q,label:q.replace('-',' ')+' 季度'+(q==='2026-Q2'?'（已呈報保留）':'')})),...saved.slice().reverse().map(m=>({value:m.monthKey,label:m.monthKey+' 月報'}))]);
      setOptions($('regionFilter'),C.REGIONS.map(r=>({value:r,label:r})),'A–D 全部');
      dependent();renderHistory();
    }
    function dependent(){
      const keys=new Set(selected()), rows=saved.filter(m=>keys.has(m.monthKey)).flatMap(m=>m.records),region=$('regionFilter').value;
      const storeRows=rows.filter(r=>!region||r.region===region);
      setOptions($('storeFilter'),Array.from(new Map(storeRows.map(r=>[r.storeCode,{value:r.storeCode,label:r.store}])).values()),'全部店點');
      const store=$('storeFilter').value;
      setOptions($('employeeFilter'),Array.from(new Map(storeRows.filter(r=>!store||r.storeCode===store).map(r=>[r.employeeId,{value:r.employeeId,label:r.employeeName+'｜'+r.employeeId}])).values()),'全部人員');
    }
    function render(){
      if(!saved.length)return;
      const expected=selected(), months=saved.filter(m=>expected.includes(m.monthKey)), archived=expected.some(k=>k<'2026-07');
      $('exportGold').disabled=archived;
      $('goldSourceMeta').textContent=archived?'Q2 已呈報，原資料保留；此頁不重新結算。':months.map(m=>`${m.monthKey} 至 ${m.dateRange.cutoff}｜${m.settlementStatus==='final'?'已結算':'未結算／暫定'}`).join('；');
      if(archived){$('peopleBody').innerHTML='<tr><td colspan="12">已呈報月份保留，不重新計算發獎資格或金牌。</td></tr>';$('goldSummary').textContent='';$('quarterStrip').textContent='';$('peopleCount').textContent='已呈報';return;}
      const f=filters(),people=C.aggregate(months,expected,f),all=months.flatMap(m=>m.records),state=expected.length===3?C.quarterStatus(months,expected):months[0]?.settlementStatus||'provisional';
      const cards=[['期間淨金牌',fmt(people.reduce((s,p)=>s+p.total,0)),state==='final'?'已結算':'暫定'],['不同員編',people.length,'每人一列'],['來源月份',`${months.length} / ${expected.length}`,'缺月不補0'],['來源不足同仁',people.filter(p=>p.sourceMonths<expected.length).length,'標示無來源']];
      $('goldSummary').innerHTML=cards.map(c=>`<article class="summary-card"><span>${esc(c[0])}</span><strong>${esc(c[1])}</strong><small>${esc(c[2])}</small></article>`).join('');
      $('peopleCount').textContent=people.length+' 人';
      $('peopleHead').innerHTML=`<tr><th>同仁</th><th>員編</th>${expected.map(k=>`<th class="number">${esc(k)}</th>`).join('')}<th class="number">合計</th><th>來源月份</th></tr>`;
      $('peopleBody').innerHTML=people.map(p=>`<tr><td>${esc(p.employeeName)}</td><td>${esc(p.employeeId)}</td>${expected.map(k=>`<td class="number ${p.months[k]<0?'down':''}">${fmt(p.months[k])}${p.placements[k]?`<small class="month-placement">${esc(p.placements[k].region)}／${esc(p.placements[k].store)}</small>`:''}</td>`).join('')}<td class="number">${fmt(p.total)}</td><td>${p.sourceMonths} / ${expected.length}${p.sourceMonths<expected.length?'（有缺月）':''}</td></tr>`).join('');
      const summaries=months.map(m=>C.summarize(m.records));
      $('quarterStrip').innerHTML=C.REGIONS.map(r=>`<article class="quarter-card"><strong>${fmt(summaries.reduce((s,m)=>s+m.regions[r].total,0))}</strong><span>${r} 按各月店區歸屬</span></article>`).join('');
      $('monthlyStatus').textContent=(state==='final'?'已結算':'暫定：各月份須明示確認最終版')+'。僅採來源淨金牌；本表不判定發獎資格。';
    }
    function adopt(result){
      if(!result.monthly?.revision||!Array.isArray(result.gold?.months))throw new Error('月報服務版本不相符，請更新後端');
      saved=result.gold.months;revision=result.monthly.revision;history=result.monthly.history||{};
      initialize();if(saved.length){render();$('goldDashboard').hidden=false;}else{$('goldDashboard').hidden=true;}
    }
    async function load(operationId){
      const current=++generation;clearCandidateOnly();message('goldMessage','正在讀取已保存月報…');
      try{const result=await call({action:'department_ops_read',operationId});if(current!==generation)return;adopt(result);message('goldMessage',saved.length?'已載入已保存月報；只有更新資料時才需選檔。':'尚無已保存月報。首次選檔確認後，往後登入會自動載入。');return result;}
      catch(error){if(current!==generation)return;clear();message('goldMessage',error.message,true);}
    }
    function clearCandidateOnly(){resetCandidate();}
    function diffRows(rows){return rows.length?rows.map(r=>`<tr><td>${esc(r.employeeName)}</td><td>${esc(r.employeeId)}</td><td>${r.type==='added'?'新增':r.type==='removed'?'移除':'變更'}</td><td>${fmt(r.before?.medal)}</td><td>${fmt(r.after?.medal)}</td><td>${esc(r.before?`${r.before.region}／${r.before.store}`:'無來源')}</td><td>${esc(r.after?`${r.after.region}／${r.after.store}`:'無來源')}</td></tr>`).join(''):'<tr><td colspan="7">人員淨牌與店區無差異</td></tr>';}
    function showPreview(){
      $('monthlyPreview').hidden=false;$('monthlyConfirm').hidden=true;$('goldDashboard').hidden=false;plan=null;
      if(!saved.length)$('goldSourceMeta').textContent='首次月報候選，尚未保存。';
      $('monthlyPreviewBody').innerHTML=candidate.map(m=>{const old=saved.find(s=>s.monthKey===m.monthKey),diff=C.diff(old,m);return `<article class="data-card"><h3>${esc(m.monthKey)}｜截至 ${esc(m.dateRange.cutoff)}</h3><p>${m.validation.people} 人／${m.validation.stores} 有同仁店；原表 ${fmt(m.validation.sourceTotal)}＝解析 ${fmt(m.validation.total)}。主金牌 ${esc(m.mapping.medal)}。</p><label class="final-choice"><input type="checkbox" data-month-final="${esc(m.monthKey)}" ${m.finalConfirmed?'checked':''}> 我確認此月份為助理最終結算版（預設未結算）</label><p>${esc(m.warnings.join(' '))}</p><details><summary>檢視 ${diff.length} 人差異</summary><div class="table-scroll"><table><thead><tr><th>姓名</th><th>員編</th><th>類型</th><th>原牌數</th><th>新版</th><th>原店區</th><th>新店區</th></tr></thead><tbody>${diffRows(diff)}</tbody></table></div></details></article>`;}).join('');
      $('publishGold').disabled=false;
    }
    async function importGold(){
      const file=$('goldFile').files?.[0];if(!file)return message('goldMessage','請先選擇助理原檔。',true);
      if(busy)return;busy=true;$('goldImport').disabled=true;const current=++generation;
      try{
        if(file.size>12*1024*1024)throw new Error('檔案超過12MB');
        message('goldMessage','正在本機辨識原檔與核對主金牌…');
        const bytes=await file.arrayBuffer(),hashBytes=await crypto.subtle.digest('SHA-256',bytes),sourceHash=Array.from(new Uint8Array(hashBytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
        const wb=await readWorkbook(file,$('excelPassword').value);if(current!==generation)return;
        candidate=C.parseWorkbook(wb,window.XLSX,{sourceName:file.name,sourceHash}).filter(m=>m.monthKey>='2026-07');
        if(!candidate.length)throw new Error('已呈報Q2保留，此次沒有可更新月份');
        showPreview();message('goldMessage',`已辨識 ${candidate.length} 個月份。尚未保存；請檢視差異與結算狀態。`);
      }catch(error){candidate=[];plan=null;$('monthlyPreview').hidden=true;$('publishGold').disabled=true;message('goldMessage',codes[error.message]||error.message,true);}
      finally{$('excelPassword').value='';busy=false;$('goldImport').disabled=false;}
    }
    function opId(){return crypto.randomUUID();}
    async function prepare(restoring){
      if(busy)return;if(!restoring&&!candidate.length)return;busy=true;$('publishGold').disabled=true;
      try{
        const payload=restoring?{mode:'restore-plan',monthKey:$('monthlyHistoryMonth').value,versionId:$('monthlyHistoryVersion').value}:{mode:'plan',months:candidate.map(C.validateMonth)};
        const current=generation;
        const operationId=opId(),result=await call({action:'department_ops_publish',contract:'north12-monthly-write/v2',expectedRevision:revision,operationId,...payload});
        if(current!==generation||!getToken())return;
        plan={...payload,operationId,planReceipt:result.planReceipt,changes:result.changes};
        $('monthlyConfirm').hidden=false;$('monthlyConfirmText').textContent=result.changes.map(c=>`${c.monthKey}：${fmt(c.beforeTotal)} → ${fmt(c.total)}；${c.changedPeople} 人差異${c.older?'，截止日較早':''}${c.finalDowngrade?'，已結算轉未結算':''}`).join('；');
        $('monthlyRegressionLabel').hidden=!result.changes.some(c=>c.older||c.finalDowngrade);$('monthlyRegression').checked=false;
        $('monthlyServerDiff').innerHTML=(result.differences||[]).map(d=>`<details><summary>${esc(d.monthKey)} 人員差異</summary><div class="table-scroll"><table><tbody>${diffRows(d.rows)}</tbody></table></div></details>`).join('');
        message('publishMessage','差異確認完成，正式版本尚未變更。');
      }catch(error){plan=null;message('publishMessage',error.message,true);}
      finally{busy=false;$('publishGold').disabled=!candidate.length;}
    }
    async function commit(){
      if(!plan||busy)return;busy=true;$('monthlyCommit').disabled=true;
      const p=plan,current=generation,mode=p.mode==='restore-plan'?'restore':'commit';
      try{
        const result=await call({action:'department_ops_publish',contract:'north12-monthly-write/v2',...p,mode,expectedRevision:revision,confirm:true,confirmRegression:$('monthlyRegression').checked});
        const read=await call({action:'department_ops_read',operationId:p.operationId});
        if(current!==generation||!getToken())return;
        if(result.monthly?.revision!==read.monthly?.revision||JSON.stringify(result.gold)!==JSON.stringify(read.gold))throw new Error('保存回應與重新讀回不一致，請重新載入確認');
        if(mode==='commit')for(const m of p.months){const actual=read.gold.months.find(x=>x.monthKey===m.monthKey);if(!actual||C.contentKey(actual)!==C.contentKey(m)||actual.settlementStatus!==m.settlementStatus)throw new Error('人員逐值讀回不一致，請停止重複操作');}
        adopt(read);resetCandidate();message('publishMessage',result.result==='unchanged'?'內容與狀態相同，未建立重複版本。':'月版本已保存並完成逐值讀回；其他月份保留。');
      }catch(error){
        const receipt=await call({action:'department_ops_read',operationId:p.operationId}).catch(()=>null);
        if(current!==generation||!getToken())return;
        const verified=receipt?.monthly?.operation?.revision===receipt?.monthly?.revision && (mode==='restore' ? receipt.gold.months.find(m=>m.monthKey===p.monthKey)?.versionId===p.versionId : p.months.every(m=>{const actual=receipt.gold.months.find(x=>x.monthKey===m.monthKey);return actual&&C.contentKey(actual)===C.contentKey(m)&&actual.settlementStatus===m.settlementStatus;}));
        if(verified){adopt(receipt);resetCandidate();message('publishMessage','已查到此次保存紀錄並完成逐值讀回。');}
        else{plan=null;$('monthlyConfirm').hidden=true;message('publishMessage',error.message+'；請先重新載入核對，勿重複保存。',true);}
      }finally{busy=false;$('monthlyCommit').disabled=false;}
    }
    function renderHistory(){
      setOptions($('monthlyHistoryMonth'),Object.keys(history).sort().reverse().map(k=>({value:k,label:k})),'選擇月份');historyOptions();
    }
    function historyOptions(){setOptions($('monthlyHistoryVersion'),(history[$('monthlyHistoryMonth').value]||[]).slice().reverse().map(v=>({value:v.versionId,label:`${v.cutoff}｜${fmt(v.total)}｜${v.status==='final'?'已結算':'暫定'}｜${v.sourceName}`})),'選擇歷史版');}
    function exportGold(){
      const keys=selected(),months=saved.filter(m=>keys.includes(m.monthKey));if(keys.some(k=>k<'2026-07'))return;
      const people=C.aggregate(months,keys,filters()),wb=XLSX.utils.book_new(),rows=[['來源姓名','員編',...keys,'合計','來源月數',...keys.map(k=>k+'店區')],...people.map(p=>[p.employeeName,p.employeeId,...keys.map(k=>p.months[k]==null?'無來源':p.months[k]),p.total,p.sourceMonths,...keys.map(k=>p.placements[k]?p.placements[k].region+'／'+p.placements[k].store:'無來源')])];
      XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(rows),'每人月值');XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['月份','截止日','結算狀態','來源檔','版本'],...months.map(m=>[m.monthKey,m.dateRange.cutoff,m.settlementStatus==='final'?'已結算':'暫定',m.sourceName||m.sheetName,m.versionId]),['備註','只採來源淨金牌，不判定發獎資格；缺月不補0']]),'來源與狀態');
      XLSX.writeFile(wb,`北一二部_金牌_${keys[0]}_${C.quarterStatus(months,keys)==='final'?'已結算':'暫定'}.xlsx`);
    }
    function bind(){
      $('monthFilter').addEventListener('change',()=>{dependent();render();});$('regionFilter').addEventListener('change',()=>{dependent();render();});$('storeFilter').addEventListener('change',()=>{dependent();render();});$('employeeFilter').addEventListener('change',render);
      $('monthlyPreviewBody').addEventListener('change',e=>{const key=e.target.dataset.monthFinal;if(!key)return;const m=candidate.find(x=>x.monthKey===key);m.finalConfirmed=e.target.checked;m.settlementStatus=e.target.checked?'final':'provisional';plan=null;$('monthlyConfirm').hidden=true;});
      $('monthlyCommit').addEventListener('click',commit);$('monthlyCancel').addEventListener('click',()=>{resetCandidate();message('goldMessage','已取消預覽，已保存版本保持原狀。');});$('monthlyReload').addEventListener('click',()=>load());
      $('monthlyHistoryMonth').addEventListener('change',historyOptions);$('monthlyRestore').addEventListener('click',()=>prepare(true));
      $('monthlyLogout').addEventListener('click',async()=>{const token=getToken();clear();lockWorkspace();await request({action:'ptlogout',token}).catch(()=>{});});
      window.addEventListener('pagehide',clear);window.addEventListener('pageshow',e=>{if(e.persisted&&getToken())load();});
    }
    return {load,importGold,prepare:()=>prepare(false),exportGold,bind,clear};
  }
})();
