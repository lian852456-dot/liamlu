(function () {
  'use strict';
  const C=window.DepartmentScoresCore, $=id=>document.getElementById(id);
  if (!$('scoreFile')) return;
  const URL='https://script.google.com/macros/s/AKfycbxqBtW2yQw_u4qqJ9Knz6CK34hAiunaa6lIQu4pMa8Ff2voJZCWKEh8MXTJ6qAoGTax/exec';
  const KEY='bei12b_patrol_session_token_v2';
  let snapshot=null,pending=null,restore=null,busy=false,verifiedToken='',loaded=false,locked=false;
  const escape=v=>String(v==null?'':v).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const number=(v,places=2)=>v==null?'缺資料':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:places});
  const msg=(v,error=false)=>{$('scoreMessage').textContent=v;$('scoreMessage').className='message'+(error?' error':'');};
  const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(v=>v.toString(16).padStart(2,'0')).join('');
  const monthHash=m=>digest(new TextEncoder().encode(C.canonical(m)));
  function lock(message) {
    snapshot=null;pending=null;restore=null;verifiedToken='';loaded=false;locked=true;
    sessionStorage.removeItem(KEY);$('scoreDashboard').hidden=true;$('scorePreview').hidden=true;$('scoreRestorePreview').hidden=true;
    for(const id of ['scoreSummary','scoreRegions','scoreTrend','scoreBody','scoreDetail','scoreHistory','scoreDiff','scoreRestoreDiff','scoreRestoreMeta','scorePreviewMeta','scoreMonthChoices','scoreErrors','scoreSourceMeta','scoreHead','scoreWarnings'])$(id).replaceChildren();$('scoreFile').value='';
    $('workspace').hidden=true;$('authPanel').hidden=false;$('securityBadge').textContent='請重新驗證';$('authMessage').textContent=message||'督導驗證已到期，請重新登入。';
    msg('請重新驗證督導權限。',true);
  }
  async function request(action,body) {
    const token=sessionStorage.getItem(KEY);
    if(!token||$('workspace').hidden)throw new Error('請先完成督導驗證');
    const readonly=['department_scores_read','department_scores_history_read'].includes(action);
    const count=readonly?3:1;let failure;
    for(let attempt=0;attempt<count;attempt++){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
      try{
        const response=await fetch(URL,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action,token,...body}),cache:'no-store',signal:controller.signal});
        if(!response.ok){const e=new Error(`成績服務 HTTP ${response.status}`);e.httpStatus=response.status;throw e;}
        const result=await response.json();
        if(result.status!=='ok'){
          if(/AUTH_|SESSION|token/i.test(String(result.code||'')+' '+String(result.message||'')))lock();
          throw new Error(result.message||result.code||'成績服務回傳失敗');
        }
        if(result.contract!==C.CONTRACT)throw new Error('成績服務尚未部署此版本，請保留原檔');
        if(sessionStorage.getItem(KEY)!==token||$('workspace').hidden)throw new Error('驗證已變更，請重新載入成績');
        return result;
      }catch(e){failure=e;if(!readonly||!([404,429,500,502,503,504].includes(e.httpStatus)||['AbortError','TypeError'].includes(e.name))||attempt===count-1)break;await new Promise(resolve=>setTimeout(resolve,800*(attempt+1)));}
      finally{clearTimeout(timer);}
    }
    throw failure;
  }
  function setBusy(value){busy=value;for(const id of ['scoreImport','scorePublish','scoreRefresh','scoreRestore','scoreHistoryPreview'])$(id).disabled=value;updatePublish();}
  function selectedKeys(){return Array.from(document.querySelectorAll('[data-score-month]:checked')).map(e=>e.value);}
  function updatePublish(){ $('scorePublish').disabled=busy||!pending||!loaded||!selectedKeys().length||!$('scoreConfirm').checked; $('scoreRestore').disabled=busy||!restore||!$('scoreRestoreConfirm').checked; }
  async function read() {
    snapshot=null;loaded=false;$('scoreDashboard').hidden=true;
    const result=await request('department_scores_read');
    if(!Array.isArray(result.months)||!Number.isInteger(result.generation))throw new Error('持久成績資料格式不完整');
    result.months=result.months.map(slot=>({...slot,month:C.validateMonth(slot.month)}));
    snapshot=result;loaded=true;initializeFilters();render();return result;
  }
  async function load(){if(busy)return;setBusy(true);msg('正在讀取已保存成績…');try{await read();pending=null;restore=null;$('scorePreview').hidden=true;$('scoreRestorePreview').hidden=true;msg(snapshot.available?'已讀取私有保存版本；更新資料時才需要選檔。':'尚未初始化成績。請選原檔、預覽並確認保存。');}catch(e){msg(e.message,true);}finally{setBusy(false);}}
  function selectedMonths(){return snapshot?C.periodMonths(snapshot.months.map(s=>s.month),$('scorePeriod').value):[];}
  function initializeFilters(){
    const months=snapshot.months.map(s=>s.month),old=$('scorePeriod').value;
    $('scorePeriod').innerHTML='<option value="half">近半年（以最新資料月為止）</option>'+C.quarterInfo(months).reverse().map(q=>`<option value="quarter:${q.key}">${escape(q.key)}（${q.complete?'完整':'不完整 '+q.present.length+'/3月'}）</option>`).join('')+months.slice().reverse().map(m=>`<option value="${m.monthKey}">${m.monthKey}</option>`).join('');
    if(Array.from($('scorePeriod').options).some(o=>o.value===old))$('scorePeriod').value=old;
    $('scoreRegion').innerHTML='<option value="">A–D 全部</option>'+C.REGIONS.map(r=>`<option value="${r}">${r}</option>`).join('');updateStores();
    $('scoreHistory').innerHTML='<option value="">選擇月份歷史版本</option>'+snapshot.months.flatMap(s=>s.history.slice().reverse().map(v=>`<option value="${escape(s.month.monthKey+'|'+v.revision)}">${escape(s.month.monthKey+'｜'+v.publishedAt+'｜'+v.sourceName)}</option>`)).join('');
  }
  function updateStores(){const previous=$('scoreStore').value,region=$('scoreRegion').value;const stores=[...new Set(selectedMonths().flatMap(m=>m.records.filter(r=>!region||r.region===region).map(r=>r.store)))].sort();$('scoreStore').innerHTML='<option value="">全部店點</option>'+stores.map(s=>`<option value="${escape(s)}">${escape(s)}</option>`).join('');if(stores.includes(previous))$('scoreStore').value=previous;}
  const filters=()=>({region:$('scoreRegion').value,store:$('scoreStore').value});
  const filtered=m=>m.records.filter(r=>(!filters().region||r.region===filters().region)&&(!filters().store||r.store===filters().store));
  function trend(months){
    const points=months.map(m=>({key:m.monthKey,value:C.summarize(filtered(m)).mean}));if(!points.length)return '';
    const low=Math.min(95,...points.filter(p=>p.value!=null).map(p=>Math.floor(p.value)-1)),high=100;
    const x=i=>110+(i*Math.max(1,600/Math.max(1,points.length-1))),y=v=>35+(high-v)*155/(high-low);
    const valid=points.map((p,i)=>p.value==null?null:{...p,x:x(i),y:y(p.value)});
    const lines=valid.slice(1).map((p,i)=>p&&valid[i]?`<line x1="${valid[i].x}" y1="${valid[i].y}" x2="${p.x}" y2="${p.y}" stroke="#ed6600" stroke-width="4"/>`:'').join('');
    return `<svg viewBox="0 0 800 255" role="img" aria-label="各月份門市平均成績，縱軸 ${low} 到100分"><line x1="70" y1="190" x2="755" y2="190" stroke="#c9c2b9"/><text x="12" y="40">100分</text><text x="12" y="190">${low}分</text>${lines}${points.map((p,i)=>`<text x="${x(i)}" y="238" text-anchor="middle">${p.key.slice(5)}月</text>${p.value==null?'':`<circle cx="${x(i)}" cy="${y(p.value)}" r="6" fill="#ed6600"/><text x="${x(i)}" y="${y(p.value)-15}" text-anchor="middle">${number(p.value)}</text>`}`).join('')}</svg>`;
  }
  function render(){
    const months=selectedMonths(),rows=months.flatMap(filtered),summary=C.summarize(rows);$('scoreDashboard').hidden=!snapshot.available;
    if(!snapshot.available)return;
    const keys=months.map(m=>m.monthKey);let complete=keys.length===6&&months.every(m=>m.available!==false);
    for(let i=1;i<keys.length;i++){const a=new Date(keys[i-1]+'-01T00:00:00Z'),b=new Date(keys[i]+'-01T00:00:00Z');if((b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth()!==1)complete=false;}
    const scope=$('scorePeriod').value==='half'?`近半年資料${complete?'完整':'不完整'}（${months.filter(m=>m.available!==false).length}/6月）`:$('scorePeriod').value.startsWith('quarter:')?C.quarterInfo(months).map(q=>`${q.key} ${q.complete?'完整':'不完整 '+q.present.length+'/3月'}`).join('、'):'單月明細';
    $('scoreSourceMeta').textContent=`${keys.join('、')}｜${scope}｜保存版本 ${snapshot.generation}｜門市原檔 G 成績，E 缺失與 F 扣分分開`;
    const cards=[['門市平均分',number(summary.mean),`${summary.storeMonths} 店月等權平均`],['原總缺失 E',number(summary.defects),'依原表統計口徑，未含回收'],['原扣分 F',number(summary.deduction),'直接讀取原值'],['有扣分店月',number(summary.deductedStores,0),summary.missingDeduction?`${summary.missingDeduction} 店月扣分缺資料`:'依 F > 0 判定']];
    $('scoreSummary').innerHTML=cards.map(([label,value,note])=>`<article class="summary-card"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
    const regionRows=months.flatMap(m=>m.records);
    $('scoreRegions').innerHTML=C.REGIONS.map(region=>{const s=C.summarize(regionRows.filter(r=>r.region===region));return `<article><h4>${region}</h4><strong>${number(s.mean)}</strong><span>門市平均分</span><small>${s.storeMonths} 店月｜原扣分 ${number(s.deduction)}</small></article>`;}).join('');
    $('scoreTrend').innerHTML=trend(months)+'<div class="score-trend-labels">'+months.map(m=>`<div><span>${m.monthKey}</span><strong>${number(C.summarize(filtered(m)).mean)}</strong></div>`).join('')+'</div>';
    const allStores=[...new Set(rows.map(r=>r.store))];
    $('scoreHead').innerHTML=`<tr><th>店點／部區</th>${months.map(m=>`<th>${m.monthKey}</th>`).join('')}<th>門市平均分</th><th>原總缺失 E</th><th>原扣分 F</th><th>部內／全國名次<br>（单月）</th><th>缺失明細</th></tr>`;
    const ranked=months.length===1?C.rank(months[0].records):[];
    $('scoreBody').innerHTML=allStores.map(store=>{const sr=rows.filter(r=>r.store===store),s=C.summarize(sr),latest=sr[sr.length-1],rank=ranked.find(r=>r.store===store);return `<tr><td><strong>${escape(store)}</strong><small>${escape(latest.region)}</small></td>${months.map(m=>{const r=m.records.find(v=>v.store===store);return `<td class="number ${r?.deduction>0?'down':''}">${number(r?.score)}</td>`;}).join('')}<td class="number">${number(s.mean)}</td><td class="number">${number(s.defects)}</td><td class="number">${number(s.deduction)}</td><td>${rank?number(rank.departmentRank,0)+'／'+number(rank.nationalRank,0):'—'}</td><td><button class="secondary-button" data-score-detail="${escape(store)}">查看</button></td></tr>`;}).join('');
    $('scoreDetail').replaceChildren();$('scoreDetail').hidden=true;
    const warnings=months.filter(m=>m.available!==false).flatMap(m=>m.warnings),missing=months.filter(m=>m.available===false).map(m=>m.monthKey);$('scoreWarnings').textContent=(missing.length?'未提供月份 '+missing.join('、')+'；缺資料不補零。':'')+(warnings.length?`分項缺資料 ${warnings.length} 項。點進門市可核對原錯誤；原成績仍保留。`:'原成績均有快取值。沒有改善紀錄，不推定已改善。');
  }
  function detail(store){
    const records=selectedMonths().flatMap(m=>m.records.filter(r=>r.store===store).map(r=>({m,r})));
    $('scoreDetail').hidden=false;
    $('scoreDetail').innerHTML=`<h3>${escape(store)}｜缺失項目與來源</h3><p>下列為原檔項目，沒有個案事件或改善紀錄；頁次、店數與各原表單位分開呈現。</p>`+records.map(({m,r})=>`<details ${records.length===1?'open':''}><summary>${m.monthKey}｜原成績 ${number(r.score)}｜E ${number(r.defects)}｜F ${number(r.deduction)}｜${escape(m.sheetName)}!${r.source.score.cell}</summary><p>來源店名：${escape(r.sourceStore)}。舊機回收缺失：${m.layout==='warning-no-recycle'?'此月未提供（缺資料）':number(r.recycleDefects)}。</p><div class="table-scroll"><table><thead><tr><th>分類</th><th>原項目</th><th>原值／狀態</th><th>單位</th><th>来源儲存格</th></tr></thead><tbody>${r.metrics.filter(v=>v.kind!=='verification').map(v=>`<tr><td>${escape(v.group)}</td><td class="score-long">${escape(v.label)}${v.kind==='rank'?'（排名）':v.kind==='warning'?'（預警不扣分）':v.kind==='total'?'（原合計）':''}</td><td>${v.value==null?escape(v.status==='blank'?'空白／缺資料':String(v.raw)+'／缺資料'):number(v.value)}</td><td>${escape(v.unit)}</td><td>${escape(m.sheetName+'!'+v.cell)}</td></tr>`).join('')}</tbody></table></div></details>`).join('');
    $('scoreDetail').scrollIntoView({behavior:'auto',block:'start'});
  }
  async function preview(){
    if(!loaded)return msg('請先成功讀取保存版本，才能比較更新。',true);
    const file=$('scoreFile').files?.[0];if(!file)return msg('請先選擇固定格式的店務 XLSX。',true);
    pending=null;restore=null;$('scorePreview').hidden=true;$('scoreRestorePreview').hidden=true;setBusy(true);msg('正在本機讀取快取值與比較差異…');
    try{
      if(!/\.xlsx$/i.test(file.name)||file.size>10*1024*1024)throw new Error('請選擇10 MB以內的原格式 XLSX');
      const bytes=await file.arrayBuffer(),sourceHash=await digest(bytes),workbook=XLSX.read(bytes,{type:'array',cellFormula:true});
      const parsed=C.parseWorkbook(workbook,{year:$('scoreYear').value.trim()});
      pending={...parsed,sourceHash,sourceName:file.name,expectedGeneration:snapshot.generation,requestId:crypto.randomUUID()};
      const items=await Promise.all(parsed.months.map(async m=>{const before=snapshot.months.find(s=>s.month.monthKey===m.monthKey);return {month:m,before,changed:!before||before.active.contentHash!==await monthHash(m),diff:C.diff(before?.month,m)};}));
      pending.items=items;
      $('scoreConfirm').checked=false;
      $('scorePreviewMeta').textContent=`${file.name}｜可更新 ${items.length} 月｜停止 ${parsed.errors.length} 月｜${parsed.referenceNote||'以月份頁籤為準'}。未選月份及未上傳舊月份均保留。`;
      $('scoreMonthChoices').innerHTML=items.map(i=>`<label><input type="checkbox" data-score-month value="${i.month.monthKey}" ${i.changed?'checked':''}>${i.month.monthKey}｜${i.before?(i.changed?'更正版本':'相同資料，略過'):'新增月份'}｜${i.month.records.length}店｜${i.diff.length}欄差異</label>`).join('');
      $('scoreErrors').textContent=parsed.errors.map(e=>e.monthKey+'：'+e.message).concat(parsed.months.flatMap(m=>m.warnings)).join('\n');
      $('scoreDiff').innerHTML=items.map(i=>`<details><summary>${i.month.monthKey}｜平均分 ${number(C.summarize(i.before?.month.records||[]).mean)} → ${number(C.summarize(i.month.records).mean)}｜原缺失 ${number(C.summarize(i.before?.month.records||[]).defects)} → ${number(C.summarize(i.month.records).defects)}｜原扣分 ${number(C.summarize(i.before?.month.records||[]).deduction)} → ${number(C.summarize(i.month.records).deduction)}</summary><div class="table-scroll"><table><thead><tr><th>店點</th><th>變更欄位</th><th>目前</th><th>新版</th></tr></thead><tbody>${i.diff.map(d=>`<tr><td>${escape(d.store)}</td><td class="score-long">${escape(({score:'原成績 G',defects:'原缺失 E',deduction:'原扣分 F',nationalRank:'全國排名 H',region:'部區',sourceStore:'來源店名'}[d.field])||d.field)}</td><td>${escape(d.before??'缺資料')}</td><td>${escape(d.after??'缺資料')}</td></tr>`).join('')}</tbody></table></div></details>`).join('');
      $('scorePreview').hidden=false;msg(items.some(i=>i.changed)?'預覽完成。核對差異並勾選確認後，才會持久保存。':'檔案內容與已保存月份相同，無需重複保存。');
    }catch(e){pending=null;msg(e.message,true);}finally{setBusy(false);}
  }
  async function publish(){
    if(busy||!pending||!$('scoreConfirm').checked||!selectedKeys().length)return;
    const keys=selectedKeys(),intended=pending.months.filter(m=>keys.includes(m.monthKey));setBusy(true);msg('正在保存勾選月份並讀回對帳…');
    try{
      const receipt=await request('department_scores_publish',{contract:C.CONTRACT,confirm:true,requestId:pending.requestId,expectedGeneration:pending.expectedGeneration,selectedMonthKeys:keys,months:intended,sourceName:pending.sourceName,sourceHash:pending.sourceHash});
      await read();
      if(snapshot.generation!==receipt.generation||intended.some(m=>C.canonical(snapshot.months.find(s=>s.month.monthKey===m.monthKey)?.month)!==C.canonical(m)))throw new Error('持久讀回與預覽不一致，請先重新讀取保存版本');
      pending=null;$('scorePreview').hidden=true;$('scoreFile').value='';msg(receipt.deduplicated?'相同資料已去重，保存版本未增加。':'保存及逐項讀回對帳完成；重新登入即可查看。');
    }catch(e){pending=null;$('scorePublish').disabled=true;msg(e.message+'。若回應逾時，請先按「重新讀取保存版本」確認結果，再做新版預覽。',true);}finally{setBusy(false);}
  }
  async function previewHistory(){
    const value=$('scoreHistory').value;if(!value||busy)return;setBusy(true);restore=null;$('scoreRestorePreview').hidden=true;
    try{const [monthKey,revision]=value.split('|'),result=await request('department_scores_history_read',{monthKey,revision});const month=C.validateMonth(result.month),active=snapshot.months.find(s=>s.month.monthKey===monthKey);const changes=C.diff(active.month,month);$('scoreRestoreDiff').innerHTML='<div class="table-scroll"><table><thead><tr><th>店點</th><th>變更欄位</th><th>目前</th><th>歷史版本</th></tr></thead><tbody>'+changes.map(d=>`<tr><td>${escape(d.store)}</td><td class="score-long">${escape(d.field)}</td><td>${escape(d.before??'缺資料')}</td><td>${escape(d.after??'缺資料')}</td></tr>`).join('')+'</tbody></table></div>';restore={month,monthKey,revision,expectedGeneration:result.generation,requestId:crypto.randomUUID()};$('scoreRestoreConfirm').checked=false;$('scoreRestoreMeta').textContent=`${monthKey}｜回復到 ${result.active.publishedAt} ${result.active.sourceName}｜${C.diff(active.month,month).length}欄差異；目前版本保留在歷史。`;$('scoreRestorePreview').hidden=false;msg('已讀取歷史版本，請核對後確認回復。');}catch(e){msg(e.message,true);}finally{setBusy(false);}
  }
  async function restoreHistory(){
    if(!restore||busy||!$('scoreRestoreConfirm').checked)return;const intended=restore.month;setBusy(true);msg('正在回復並讀回對帳…');
    try{const receipt=await request('department_scores_restore',{confirm:true,requestId:restore.requestId,expectedGeneration:restore.expectedGeneration,monthKey:restore.monthKey,revision:restore.revision});await read();if(snapshot.generation!==receipt.generation||C.canonical(snapshot.months.find(s=>s.month.monthKey===intended.monthKey)?.month)!==C.canonical(intended))throw new Error('回復讀回不一致');restore=null;$('scoreRestorePreview').hidden=true;msg('歷史回復與讀回對帳完成。');}catch(e){restore=null;msg(e.message+'；請先重新讀取保存版本。',true);}finally{setBusy(false);}
  }
  function exportData(json){const months=selectedMonths(),data=C.brief(months,filters());if(json){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=window.URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='北一二部_店務簡報資料.json';a.click();setTimeout(()=>window.URL.revokeObjectURL(url),1000);return;}
    const workbook=XLSX.utils.book_new(),sheet=[['月份','部區','店點','原成績G','原缺失E','原扣分F','全國排名H','原回收缺失','來源工作表','成績儲存格'],...data.records.map(r=>[r.monthKey,r.region,r.store,r.score,r.defects,r.deduction,r.nationalRank,r.recycleDefects,months.find(m=>m.monthKey===r.monthKey).sheetName,r.source.score.cell])];
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet(sheet),'門市月成績');XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['月份','部區','店點','分類','原項目','原值','原值狀態','單位','來源儲存格'],...data.records.flatMap(r=>r.metrics.map(m=>[r.monthKey,r.region,r.store,m.group,m.label,m.value,m.status,m.unit,months.find(v=>v.monthKey===r.monthKey).sheetName+'!'+m.cell]))]),'原缺失項目');XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([['限制'],...data.limitations.map(v=>[v])]),'說明');XLSX.writeFile(workbook,'北一二部_店務成績.xlsx');}
  $('scoreImport').addEventListener('click',preview);$('scorePublish').addEventListener('click',publish);$('scoreRefresh').addEventListener('click',load);$('scoreConfirm').addEventListener('change',updatePublish);$('scoreMonthChoices').addEventListener('change',updatePublish);
  $('scoreFile').addEventListener('change',()=>{pending=null;$('scorePreview').hidden=true;updatePublish();});$('scoreYear').addEventListener('input',()=>{pending=null;$('scorePreview').hidden=true;updatePublish();});
  $('scorePeriod').addEventListener('change',()=>{updateStores();render();});$('scoreRegion').addEventListener('change',()=>{updateStores();render();});$('scoreStore').addEventListener('change',render);
  $('scoreBody').addEventListener('click',e=>{const b=e.target.closest('[data-score-detail]');if(b)detail(b.dataset.scoreDetail);});
  $('scoreHistoryPreview').addEventListener('click',previewHistory);$('scoreRestore').addEventListener('click',restoreHistory);$('scoreRestoreConfirm').addEventListener('change',updatePublish);$('scoreHistory').addEventListener('change',()=>{restore=null;$('scoreRestorePreview').hidden=true;updatePublish();});
  $('scoreExport').addEventListener('click',()=>exportData(false));$('scoreBrief').addEventListener('click',()=>exportData(true));
  function observeAuth(){const token=sessionStorage.getItem(KEY);if($('workspace').hidden){if(verifiedToken&&!locked){snapshot=null;pending=null;verifiedToken='';loaded=false;$('scoreDashboard').hidden=true;$('scorePreview').hidden=true;$('scoreRestorePreview').hidden=true;for(const id of ['scoreSummary','scoreRegions','scoreTrend','scoreBody','scoreDetail','scoreHistory','scoreDiff','scoreRestoreDiff','scoreRestoreMeta','scorePreviewMeta','scoreMonthChoices','scoreErrors','scoreSourceMeta','scoreHead','scoreWarnings'])$(id).replaceChildren();$('scoreFile').value='';}return;}if(token&&token!==verifiedToken){verifiedToken=token;locked=false;load();}}
  new MutationObserver(observeAuth).observe($('workspace'),{attributes:true,attributeFilter:['hidden']});
  window.addEventListener('pageshow',observeAuth);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&verifiedToken)load();});
  window.addEventListener('department-session-cleared',()=>lock('驗證已結束，請重新登入。'));
  setInterval(()=>{if(!verifiedToken)return;if(sessionStorage.getItem(KEY)!==verifiedToken)return lock('督導驗證已變更，請重新登入。');try{const part=verifiedToken.split('.')[0].replace(/-/g,'+').replace(/_/g,'/'),claims=JSON.parse(atob(part));if(Number.isFinite(claims.exp)&&claims.exp*1000<=Date.now())lock();}catch{}},10000);
  observeAuth();updatePublish();
})();
