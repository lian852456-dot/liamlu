/* Supervisor view only. The supplied readers retain the existing read/pread transport. */
(function (scope) {
  'use strict';
  const M = scope.DailyReportSummaryModel;
  const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = value => value === null || value === undefined ? '—' : new Intl.NumberFormat('zh-TW',{maximumFractionDigits:2}).format(value);
  const pct = value => value === null || value === undefined ? '—' : value.toFixed(1)+'%';
  function create(options) {
    const {root,stores,readDay,readPersonal,localPersonal,today,onSegmentChange,assertActive} = options;
    const byId = id => root.querySelector('#'+id);
    const state = {date:today(),seg:16,group:'sales',store:'all',filter:'all',status:'idle',rows:[],people:null,personalStatus:'idle',receivedAt:null};
    let generation = 0, personalGeneration = 0, locked = false;
    let dayController, personalController;
    const visible = () => root.classList.contains('active');
    const dateInput = byId('sumDate'); dateInput.value = state.date;
    for (const name of stores) {const option = document.createElement('option');option.value=name;option.textContent=name;byId('sumStore').append(option);}
    function active() {if(locked)throw new Error('連線已失效');assertActive?.();}
    function visibleRows() {return M.select(state.rows,state.store,state.filter);}
    function scopeLabel() {return state.store === 'all' && state.filter === 'all' ? 'N12B 全區摘要' : '篩選範圍摘要';}
    function metric(label,value,note='') {return `<div class="sum-metric"><dl><dt>${escape(label)}</dt><dd class="sum-num">${value}<small>${escape(note)}</small></dd></dl></div>`;}
    function coverage(value) {return `涵蓋 ${value.coverage} / ${value.total} 店`;}
    function ratioText(value) {return `${fmt(value.n)} / ${fmt(value.d)} · ${value.notApplicable?'無適用案件':pct(value.rate)}`;}
    function summary(rows) {
      byId('sumTitle').textContent=scopeLabel();
      byId('summaryDateLabel').textContent=`${state.date} ${state.seg}:00`;
      byId('sumCoverage').textContent=state.status==='ready'?`已回報 ${state.rows.filter(row=>row.status==='reported').length} / ${stores.length} 店`:'填報狀態未確認';
      if(state.status !== 'ready') {byId('summaryCards').innerHTML=empty(state.status);return;}
      const missing=state.rows.filter(row=>row.status==='missing').map(row=>row.name),unknown=state.rows.filter(row=>row.status==='unknown').map(row=>row.name);
      const incomplete=state.rows.filter(row=>row.status==='reported' && M.attention(row)).map(row=>row.name);
      const notice=[missing.length?`未回報：${missing.join('、')}`:'',unknown.length?`來源未取得：${unknown.join('、')}`:'',incomplete.length?`欄位待確認：${incomplete.join('、')}`:''].filter(Boolean).join('；');
      const ins=M.ratio(rows,'insurance_pct'),my=M.ratio(rows,'mycharge_pct');
      byId('summaryCards').innerHTML=`${notice?`<p class="sum-notice">${escape(notice)}。已回報不代表欄位完整。</p>`:'<p class="sum-note">資料已取得；各欄位涵蓋店數列於合計下方。</p>'}<div class="sum-totals">${M.core.map(([key,label,unit])=>{const total=M.sum(rows,key);return `<div><span>${label} <small>${unit}</small></span><strong class="sum-num" data-summary-total="${key}">${fmt(total.value)}</strong><small>${coverage(total)}</small></div>`;}).join('')}</div><div class="sum-rates"><div>保險 <strong>${ratioText(ins)}</strong><small>${coverage(ins)}，只計有效配對分子／分母</small></div>${state.group==='management'?`<div>OP ${M.management.slice(0,3).map(([key,label])=>{const total=M.sum(rows,key);return `<strong>${label.replace('OP ','')} ${fmt(total.value)}</strong> <small>${coverage(total)}</small>`;}).join(' · ')}</div><div>MyCharge <strong>${ratioText(my)}</strong><small>${coverage(my)}，已點選／今日貼標</small></div>`:''}</div><p class="sum-source">來源：本日期／時段的門市回報原始欄位；${state.store==='all'?'九店':escape(state.store)}／${state.filter==='all'?'全部狀態':state.filter==='reported'?'已回報':'待確認'}<br>來源最新回報：${escape(M.latest(rows)||'未提供時間')} · 本次取得：${escape(state.receivedAt)}（臺北）</p>`;
    }
    function empty(status) {
      const title=status==='loading'?'正在讀取本時段資料':status==='locked'?'連線已失效':status==='timeout'?'讀取超過 30 秒':'回報資料未取得';
      const note=status==='loading'?'資料完成前不顯示上次數字，也不判斷未回報。':status==='locked'?'請依既有登入流程重新驗證；此頁不保留舊摘要或個人明細。':status==='timeout'?'請稍後手動重新讀取；本頁不會自動重送，也不以舊資料代替。':'讀取失敗或來源格式不符，不以舊快取、影子資料或 0 代替。';
      return `<div class="sum-empty"><h3>${title}</h3><p>${note}</p>${status!=='loading'&&status!=='locked'?'<button type="button" data-summary-retry>重新讀取</button>':''}</div>`;
    }
    function fields(title,columns,row) {return `<section class="sum-fields"><h4>${title}</h4><dl>${columns.map(([key,label,unit])=>`<div><dt>${label}${unit?'（'+unit+'）':''}</dt><dd class="sum-num">${unit==='%'?pct(row.values[key]):fmt(row.values[key])}</dd></div>`).join('')}</dl></section>`;}
    function consultation(row,index) {
      const record=row.record || {};
      const keys=[['zero_reason','未開市原因'],['zero_consult','請益對象'],['zero_method','請益做法'],['zero_plan','明日計畫']];
      const storeSection=state.seg===16?'<p class="sum-note">下午時段不判斷晚間零報；請切換 21:00 查看。</p>':`<section class="sum-consult"><h4>店點零報說明</h4><dl>${keys.map(([key,label])=>`<dt>${label}</dt><dd>${escape(record[key] || '未取得／未填寫')}</dd>`).join('')}</dl></section>`;
      const people=state.people?.[row.name] || [];
      const personalSection=state.personalStatus==='loading'?'<p class="sum-note" role="status">個人明細讀取中…</p>':state.personalStatus==='error'?'<p class="sum-notice">個人明細未取得或權限失效；不顯示本機或先前明細。</p>':state.personalStatus!=='ready'?'<p class="sum-note">個人明細僅沿用原授權來源。</p>':!people.length?'<p class="sum-note">本日期／時段尚無可核對的個人回報記錄。</p>':people.map(({name,record:person})=>{
        const extra=person.extra && typeof person.extra==='object'?person.extra:{};
        const failed=Array.isArray(person.failed)?person.failed:[];
        return `<section class="sum-person"><h4>${escape(name)}</h4><p>${failed.length?`未過關項目：${failed.map(key=>{const item=options.personalItems.find(item=>item.key===key);const value=M.number(person.data?.[key]);return `${escape(item?.label||key)} ${item?.type==='pct'?pct(value):fmt(value)}`;}).join('、')}`:'本回報無未過關項目'}</p><dl>${[['customers','接客數'],['sold_items','上線項目'],['fail_reason','未過關原因'],['improve_plan','明日改善'],['consult_store','請益門市'],['consult_person','請益對象'],['consult_method','請益做法']].map(([key,label])=>`<dt>${label}</dt><dd>${escape(extra[key] === 0 ? 0 : extra[key] || '未取得／未填寫')}</dd>`).join('')}</dl></section>`;
      }).join('');
      return storeSection+`<details class="sum-private" id="sum-private-${index}"><summary>個人回報明細（原授權區）</summary>${personalSection}</details>`;
    }
    function metrics(row) {
      const values=row.values;
      if(state.group==='sales')return M.core.map(([key,label,unit])=>metric(label,fmt(values[key]),unit+(row.status==='reported'&&values[key]===null?' · 欄位未取得':''))).join('');
      if(state.group==='insurance'){const p=M.pair(values,M.ratios.insurance_pct);return metric('保險分子',fmt(p.n),'搭售件數')+metric('保險分母',fmt(p.d),'適用件數')+metric('搭售率',pct(p.rate),p.notApplicable?'無適用案件':!p.valid?'配對欄位待確認':'分子 ÷ 分母');}
      if(state.group==='management'){const p=M.pair(values,M.ratios.mycharge_pct);return M.management.slice(0,3).map(([key,label])=>metric(label,fmt(values[key]),'筆')).join('')+metric('MyCharge',`${fmt(p.n)} / ${fmt(p.d)}`,'已點選／今日貼標')+metric('點選率',pct(p.rate),p.notApplicable?'無適用案件':row.managementMissing?'晚間管理待確認':state.seg===16&&!p.valid?'下午非必填':!p.valid?'配對欄位待確認':'分子 ÷ 分母');}
      return `<p class="sum-teaser">${row.status!=='reported'?'來源未確認，暫不判斷請益。':state.seg===16?'下午不顯示晚間零報結論。':row.record.zero_reason?'已填店點零報說明；展開查看原因、做法與明日計畫。':'本記錄無店點零報說明；個人明細仍依原授權來源。'}</p>`;
    }
    function card(row) {
      const index=stores.indexOf(row.name),label={reported:'已回報',missing:'未回報',unknown:'來源未取得'}[row.status];
      const notes=row.status==='reported'?(M.attention(row)?'欄位待確認':''):'';
      const detail=state.group==='consult'?consultation(row,index):state.group==='management'?fields('當月管理重點',M.management,row):state.group==='insurance'?fields('保險搭售',M.main.filter(([key])=>key.startsWith('insurance_')),row):fields('主力 KPI',M.main,row);
      return `<article class="sum-store" data-summary-store="${escape(row.name)}"><div class="sum-store-row"><div class="sum-store-name"><h3>${escape(row.name)}</h3><span class="sum-status ${row.status}">${label}</span>${notes?`<span class="sum-status unknown">${row.managementMissing?'管理待確認':notes}</span>`:''}<small>${row.status==='reported'?'回報 '+escape(row.record.savedAt||'時間未提供'):row.status==='missing'?'本時段無回報記錄':'日期／時段／門市來源不符'}</small></div><div class="sum-metrics sum-${state.group}">${metrics(row)}</div></div><details class="sum-store-detail" id="sum-detail-${index}"><summary>${escape(row.name)} · 展開完整明細</summary>${row.status==='reported'?`<p class="sum-note">KPI ${pct(row.values.kpi)} · 公司排名 ${fmt(row.values.rank)}${state.seg===21?'；沿用既有晚間承接欄位':''}。</p>${detail}<details class="sum-other" id="sum-other-${index}"><summary>其他全部欄位與請益</summary>${state.group!=='sales'?fields('主力 KPI',M.main,row):''}${fields('加掛類',M.addon,row)}${state.group!=='management'?fields('當月管理重點',M.management,row):''}${state.group!=='consult'?consultation(row,index):''}</details>`:`<p class="sum-note">${row.status==='missing'?'讀取已成功，本時段沒有此店回報。':'未取得可核對來源，不判定零業績或未回報。'}</p>`}</details></article>`;
    }
    function totalCell(rows,key,unit) {
      if(key==='rank')return '不加總';
      if(M.ratios[key]){const value=M.ratio(rows,key);return (value.notApplicable?'無適用案件':pct(value.rate))+`（${value.coverage}/${value.total}店）`;}
      const value=M.sum(rows,key);
      if(key==='kpi')return value.coverage?pct(value.value/value.coverage)+`（店均值 ${value.coverage}店）`:'—';
      return fmt(value.value)+`（${value.coverage}/${value.total}店）`;
    }
    function table(rows) {
      if(state.status!=='ready')return '<p class="sum-note">資料未取得，暫不顯示合計或店點數字。</p>';
      return `<table><caption>${escape(scopeLabel())} · ${state.date} ${state.seg}:00</caption><thead><tr><th scope="col">店點／狀態</th>${M.fields.map(([,label,unit])=>`<th scope="col">${label}${unit?'（'+unit+'）':''}</th>`).join('')}</tr></thead><tbody><tr class="sum-total-row"><th scope="row">${escape(scopeLabel())}</th>${M.fields.map(([key,,unit])=>`<td>${totalCell(rows,key,unit)}</td>`).join('')}</tr>${rows.map(row=>`<tr><th scope="row">${escape(row.name)}／${row.status==='reported'?'已回報':row.status==='missing'?'未回報':'未取得'}</th>${M.fields.map(([key,,unit])=>`<td>${unit==='%'?pct(row.values[key]):fmt(row.values[key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    }
    function render() {
      if(!root.isConnected)return;
      const open=new Set([...root.querySelectorAll('details[open][id]')].map(el=>el.id));
      const focused=root.contains(document.activeElement)?document.activeElement.id:null;
      const rows=visibleRows();summary(rows);
      byId('sumStoreCount').textContent=state.status==='ready'?`顯示 ${rows.length} / ${stores.length} 店；摘要使用目前篩選的有效原始值`:'尚未取得可核對資料';
      byId('sumGroupNote').textContent={sales:'固定比較 A999、A1399、好速、R999、R1399；其他 KPI 與加掛類可點店展開。',insurance:'全區率使用有效配對分子合計／分母合計，不平均店比率；0／0 為無適用案件。',management:state.seg===16?'OP 三值分開列示；MyCharge 為已點選／今日貼標。下午非必填，空值不補 0。':'OP 與 MyCharge 沿用晚間必填規則；已回報仍可能有缺漏，不視為完整。',consult:'先看店點原因、請益對象、做法、明日計畫；個人明細保持在原授權來源區。'}[state.group];
      byId('sumStores').innerHTML=state.status!=='ready'?empty(state.status):rows.length?rows.map(card).join(''):'<p class="sum-empty">此篩選沒有符合門市；未取得值不補 0。</p>';
      byId('sumFullTable').innerHTML=table(rows);
      root.querySelectorAll('[data-summary-group]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.summaryGroup===state.group)));
      root.querySelectorAll('[data-summary-seg]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.summarySeg)===state.seg)));
      for(const id of open)byId(id)?.setAttribute('open','');
      if(focused)byId(focused)?.focus({preventScroll:true});
      byId('sumAnnounce').textContent=`${state.date} ${state.seg}:00；${byId('sumCoverage').textContent}；${byId('sumStoreCount').textContent}`;
    }
    async function loadPeople() {
      if(!visible()||state.status!=='ready'||state.personalStatus!=='idle'||state.group!=='consult')return;
      const token=++personalGeneration,dayToken=generation,date=state.date,seg=state.seg;
      state.personalStatus='loading';render();
      personalController = new AbortController();
      try {
        active();const response=await readPersonal(date,seg,{signal:personalController.signal});active();
        if(token!==personalGeneration||dayToken!==generation)return;
        state.people=M.personal(response,date,seg,stores,localPersonal(date,seg));state.personalStatus='ready';
      } catch (_) {if(token!==personalGeneration||dayToken!==generation)return;state.people=null;state.personalStatus='error';}
      render();
    }
    async function refresh({force=false}={}) {
      if(!visible())return;
      const samePending=state.status==='loading'&&!force&&!dayController?.signal.aborted;
      if(!samePending)dayController?.abort();
      personalController?.abort();
      const controller=samePending?dayController:new AbortController();dayController=controller;
      const token=++generation;personalGeneration++;const date=state.date,seg=state.seg;
      state.status=locked?'locked':'loading';state.rows=[];state.people=null;state.personalStatus='idle';state.receivedAt=null;render();
      if(locked)return;
      try {
        active();const response=await readDay(date,seg,{signal:controller.signal,force});active();
        if(token!==generation)return;
        state.rows=M.project(response,date,seg,stores);state.status='ready';
        state.receivedAt=new Date().toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
      } catch (error) {if(token!==generation)return;state.rows=[];state.people=null;state.status=error.name==='TimeoutError'?'timeout':'error';}
      render();await loadPeople();
    }
    function setSegment(seg) {if(![16,21].includes(Number(seg)))return;if(state.seg!==Number(seg))dayController?.abort();state.seg=Number(seg);onSegmentChange(state.seg);return refresh();}
    dateInput.addEventListener('change',()=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(dateInput.value))return;if(state.date!==dateInput.value)dayController?.abort();state.date=dateInput.value;refresh();});
    byId('sumStore').addEventListener('change',event=>{state.store=event.target.value;render();});
    byId('sumStatus').addEventListener('change',event=>{state.filter=event.target.value;render();});
    root.addEventListener('click',event=>{const group=event.target.closest('[data-summary-group]'),seg=event.target.closest('[data-summary-seg]');if(group){state.group=group.dataset.summaryGroup;render();loadPeople();}else if(seg)setSegment(seg.dataset.summarySeg);else if(event.target.closest('[data-summary-retry]'))refresh({force:true});});
    function deactivate() {generation++;personalGeneration++;dayController?.abort();personalController?.abort();state.rows=[];state.people=null;state.status=locked?'locked':'idle';state.personalStatus='idle';render();}
    window.addEventListener('portal-before-logout',()=>{locked=true;deactivate();});
    window.addEventListener('portal-login-changed',()=>{locked=false;refresh();});
    render();return Object.freeze({refresh,setSegment,deactivate});
  }
  scope.DailyReportSummaryController=Object.freeze({create});
})(globalThis);
