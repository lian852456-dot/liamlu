(function(){
'use strict';
const data=JSON.parse(document.getElementById('departmentSnapshot').textContent),$=id=>document.getElementById(id);
$('snapshotMeta').textContent='匯出時間（台灣）：'+new Date(data.capturedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false})+'｜只含已保存來源；快照不自動更新。';
const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function tab(key){for(const b of document.querySelectorAll('[data-tab]')){const active=b.dataset.tab===key;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}$('goldPanel').hidden=key!=='gold';$('storePanel').hidden=key!=='store';}
for(const b of document.querySelectorAll('[data-tab]')){b.addEventListener('click',()=>tab(b.dataset.tab));b.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();tab(e.key==='Home'?'gold':e.key==='End'?'store':b.dataset.tab==='gold'?'store':'gold');document.querySelector('[data-tab][aria-selected="true"]').focus();}});}
(function(){
const C=window.DepartmentScoresCore,snapshot=data.scores,escape=esc,number=(v,places=2)=>v==null?'缺資料':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:places});
if(!snapshot){$('scoreDashboard').hidden=true;$('scoreMessage').textContent='本檔未包含可核對的店務保存來源。';return;}
snapshot.available=true;
  function selectedMonths(){return snapshot?C.periodMonths(snapshot.months.map(s=>s.month),$('scorePeriod').value):[];}
  function initializeFilters(){
    const months=snapshot.months.map(s=>s.month),old=$('scorePeriod').value,oldRegion=$('scoreRegion').value;
    $('scorePeriod').innerHTML='<option value="half">近半年（以最新資料月為止）</option>'+C.quarterInfo(months).reverse().map(q=>`<option value="quarter:${q.key}">${escape(q.key)}（${q.complete?'完整':'不完整 '+q.present.length+'/3月'}）</option>`).join('')+months.slice().reverse().map(m=>`<option value="${m.monthKey}">${m.monthKey}</option>`).join('');
    if(Array.from($('scorePeriod').options).some(o=>o.value===old))$('scorePeriod').value=old;
    $('scoreRegion').innerHTML='<option value="">A–D 全部</option>'+C.REGIONS.map(r=>`<option value="${r}">${r}</option>`).join('');if(C.REGIONS.includes(oldRegion))$('scoreRegion').value=oldRegion;updateStores();
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
  function issueClass(value,kind='defect'){
    if(value==null)return 'score-missing';
    const n=Number(value);if(!Number.isFinite(n))return 'score-missing';
    return (kind==='checkScore'?n<100:n>0)?'score-issue':'';
  }
  function metricTone(v){
    if(v.kind==='rank'||v.kind==='verification')return '';
    if(v.value==null)return 'score-missing';
    if(v.kind==='warning')return Number(v.value)>0?'score-warning':'';
    if(v.kind==='storeCount'&&!/缺失/.test(v.label))return '';
    return issueClass(v.value,v.kind);
  }
  function recordTone(r){return r.defects>0||r.deduction>0||r.metrics.some(v=>metricTone(v)==='score-issue')?'score-has-issue':'';}
  function render(){
    const months=selectedMonths(),rows=months.flatMap(filtered),summary=C.summarize(rows);$('scoreDashboard').hidden=!snapshot.available;
    if(!snapshot.available)return;
    const keys=months.map(m=>m.monthKey);let complete=keys.length===6&&months.every(m=>m.available!==false);
    for(let i=1;i<keys.length;i++){const a=new Date(keys[i-1]+'-01T00:00:00Z'),b=new Date(keys[i]+'-01T00:00:00Z');if((b.getUTCFullYear()-a.getUTCFullYear())*12+b.getUTCMonth()-a.getUTCMonth()!==1)complete=false;}
    const scope=$('scorePeriod').value==='half'?`近半年資料${complete?'完整':'不完整'}（${months.filter(m=>m.available!==false).length}/6月）`:$('scorePeriod').value.startsWith('quarter:')?C.quarterInfo(months).map(q=>`${q.key} ${q.complete?'完整':'不完整 '+q.present.length+'/3月'}`).join('、'):'單月明細';
    $('scoreSourceMeta').textContent=`${keys.join('、')}｜${scope}｜保存版本 ${snapshot.generation}｜門市原檔 G 成績，E 缺失與 F 扣分分開`;
    const cards=[['門市平均分',number(summary.mean),`${summary.storeMonths} 店月等權平均`,issueClass(summary.mean,'checkScore')],['原總缺失 E',number(summary.defects),'依原表統計口徑，未含回收',issueClass(summary.defects)],['原扣分 F',number(summary.deduction),'直接讀取原值',issueClass(summary.deduction)],['有扣分店月',number(summary.deductedStores,0),summary.missingDeduction?`${summary.missingDeduction} 店月扣分缺資料`:'依 F > 0 判定',issueClass(summary.deductedStores)]];
    $('scoreSummary').innerHTML=cards.map(([label,value,note,tone])=>`<article class="summary-card ${tone||''}"><span>${label}</span><strong>${value}</strong><small>${note}</small></article>`).join('');
    const regionRows=months.flatMap(m=>m.records);
    $('scoreRegions').innerHTML=C.REGIONS.map(region=>{const s=C.summarize(regionRows.filter(r=>r.region===region));return `<article><h4>${region}</h4><strong class="${issueClass(s.mean,'checkScore')}">${number(s.mean)}</strong><span>門市平均分</span><small class="${issueClass(s.deduction)}">${s.storeMonths} 店月｜原扣分 ${number(s.deduction)}</small></article>`;}).join('');
    $('scoreTrend').innerHTML=trend(months)+'<div class="score-trend-labels">'+months.map(m=>`<div><span>${m.monthKey}</span><strong>${number(C.summarize(filtered(m)).mean)}</strong></div>`).join('')+'</div>';
    const allStores=[...new Set(rows.map(r=>r.store))];
    $('scoreHead').innerHTML=`<tr><th>店點／部區</th>${months.map(m=>`<th>${m.monthKey}</th>`).join('')}<th>門市平均分</th><th>原總缺失 E</th><th>原扣分 F</th><th>部內／全國名次<br>（单月）</th><th>缺失明細</th></tr>`;
    const ranked=months.length===1?C.rank(months[0].records):[];
    $('scoreBody').innerHTML=allStores.map(store=>{const sr=rows.filter(r=>r.store===store),s=C.summarize(sr),latest=sr[sr.length-1],rank=ranked.find(r=>r.store===store);return `<tr class="${sr.some(r=>recordTone(r))?'score-has-issue':''}"><td><strong>${escape(store)}</strong><small>${escape(latest.region)}</small></td>${months.map(m=>{const r=m.records.find(v=>v.store===store);return `<td class="number ${issueClass(r?.score,'checkScore')}">${number(r?.score)}</td>`;}).join('')}<td class="number ${issueClass(s.mean,'checkScore')}">${number(s.mean)}</td><td data-score-field="defects" class="number ${issueClass(s.defects)}">${number(s.defects)}</td><td data-score-field="deduction" class="number ${issueClass(s.deduction)}">${number(s.deduction)}</td><td>${rank?number(rank.departmentRank,0)+'／'+number(rank.nationalRank,0):'—'}</td><td><button class="secondary-button" data-score-detail="${escape(store)}">查看</button></td></tr>`;}).join('');
    $('scoreDetail').replaceChildren();$('scoreDetail').hidden=true;
    const warnings=months.filter(m=>m.available!==false).flatMap(m=>m.warnings),missing=months.filter(m=>m.available===false).map(m=>m.monthKey);$('scoreWarnings').textContent=(missing.length?'未提供月份 '+missing.join('、')+'；缺資料不補零。':'')+(warnings.length?`來源與分項提示 ${warnings.length} 項。點進門市可核對原值；原成績仍保留。`:'原成績均有快取值。沒有改善紀錄，不推定已改善。');
  }
  function detail(store){
    const records=selectedMonths().flatMap(m=>m.records.filter(r=>r.store===store).map(r=>({m,r})));
    $('scoreDetail').hidden=false;
    $('scoreDetail').innerHTML=`<h3>${escape(store)}｜缺失項目與來源</h3><p>下列為原檔項目，沒有個案事件或改善紀錄；頁次、店數與各原表單位分開呈現。</p><p class="score-legend"><span class="score-issue">紅色：有缺失／扣分</span><span class="score-warning">橘色：預警不扣分</span><span class="score-missing">橘色框：缺資料</span>　0 代表無缺失；分類不顯示排名。</p>`+records.map(({m,r})=>`<details ${records.length===1?'open':''}><summary>${m.monthKey}｜原成績 ${number(r.score)}｜<span class="${issueClass(r.defects)}">E ${number(r.defects)}</span>｜<span class="${issueClass(r.deduction)}">F ${number(r.deduction)}</span>｜${escape(m.sheetName)}!${r.source.score.cell}</summary><p>來源店名：${escape(r.sourceStore)}。<span class="${issueClass(r.recycleDefects)}">舊機回收缺失：${m.layout==='warning-no-recycle'?'此月未提供（缺資料）':number(r.recycleDefects)}</span>。</p><div class="table-scroll"><table><thead><tr><th>分類</th><th>原項目</th><th>原值／狀態</th><th>單位</th><th>来源儲存格</th></tr></thead><tbody>${r.metrics.filter(v=>!['verification','rank'].includes(v.kind)&&!/排名|名次/.test(v.label)).map(v=>`<tr class="${metricTone(v)}" data-metric-kind="${escape(v.kind)}"><td>${escape(v.group)}</td><td class="score-long">${escape(v.label)}${v.kind==='warning'?'（預警不扣分）':v.kind==='total'?'（原合計）':''}</td><td>${v.value==null?escape(v.status==='blank'?'空白／缺資料':String(v.raw)+'／缺資料'):number(v.value)}</td><td>${escape(v.unit)}</td><td>${escape(m.sheetName+'!'+v.cell)}</td></tr>`).join('')}</tbody></table></div></details>`).join('');
    $('scoreDetail').scrollIntoView({behavior:'auto',block:'start'});
  }

initializeFilters();render();
$('scoreSourceVersions').innerHTML=snapshot.months.map(s=>'<p>'+escape(s.month.monthKey+'｜'+s.active.sourceName+'｜保存時間 '+(s.active.publishedAt||'未提供')+'｜版本 '+s.active.revision+'｜原檔 SHA-256 '+s.active.sourceHash)+'</p>').join('');
for(const id of ['scorePeriod','scoreRegion'])$(id).addEventListener('change',()=>{updateStores();render();});
$('scoreStore').addEventListener('change',render);$('scoreBody').addEventListener('click',e=>{const b=e.target.closest('[data-score-detail]');if(b)detail(b.dataset.scoreDetail);});
})();
(function(){
const C=window.DepartmentGoldMonthlyCore,saved=data.gold?.months||[],fmt=v=>v==null?'無來源':Number(v).toLocaleString('zh-TW',{maximumFractionDigits:2});
if(!saved.length){$('goldDashboard').hidden=true;$('goldMissing').hidden=false;return;}
$('goldDashboard').hidden=false;
    function selected(){const key=$('monthFilter').value;return key.startsWith('quarter:')?C.quarterMonths(key.slice(8)):[key];}
    function filters(){return {region:$('regionFilter').value,store:$('storeFilter').value,employee:$('employeeFilter').value};}
    function setOptions(el, entries, first){const old=el.value;el.innerHTML=(first?`<option value="">${esc(first)}</option>`:'')+entries.map(x=>`<option value="${esc(x.value)}">${esc(x.label)}</option>`).join('');if(entries.some(x=>x.value===old))el.value=old;}
    function initialize(){
      const quarters=Array.from(new Set(saved.map(m=>C.quarter(m.monthKey)))).sort().reverse();
      setOptions($('monthFilter'),[...quarters.map(q=>({value:'quarter:'+q,label:q.replace('-',' ')+' 季度'+(q==='2026-Q2'?'（已呈報保留）':'')})),...saved.slice().reverse().map(m=>({value:m.monthKey,label:m.monthKey+' 月報'}))]);
      setOptions($('regionFilter'),C.REGIONS.map(r=>({value:r,label:r})),'A–D 全部');
      dependent();
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

initialize();render();
$('goldVersionMeta').textContent='保存版本 '+data.gold.revision;
$('goldSourceVersions').innerHTML=saved.map(m=>'<p>'+esc(m.monthKey+'｜資料截至 '+m.dateRange.cutoff+'｜'+(m.sourceName||m.sheetName)+'｜'+(m.settlementStatus==='archived'?'已呈報封存':m.settlementStatus==='final'?'已結算':'暫定')+'｜保存時間 '+(m.publishedAt||'既有來源未提供')+'｜版本 '+m.versionId+'｜原檔 SHA-256 '+(m.sourceHash||'既有來源未提供'))+'</p>').join('');
for(const id of ['monthFilter','regionFilter','storeFilter'])$(id).addEventListener('change',()=>{dependent();render();});$('employeeFilter').addEventListener('change',render);
})();
tab(data.scores?'store':'gold');
})();
