/* Shared renderer for confirmed relay balances. Snapshot balances are never summed across days. */
(function(){
  'use strict';
  let CORE=North12BGoldDaily;
  let publicView=false;
  const $=id=>document.getElementById(id);
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const fmt=value=>Number(value).toLocaleString('zh-TW');
  let ledger;
  function options(id,items,label){const select=$(id),current=select.value;select.innerHTML=`<option value="">${esc(label)}</option>`+items.map(x=>`<option value="${esc(x.value)}">${esc(x.label)}</option>`).join('');if(items.some(x=>x.value===current))select.value=current;}
  function dateFrom(){return $('viewerDateFrom').value;}
  function dateTo(){return $('viewerDateTo')?.value||'';}
  function validRange(){return !dateTo()||!dateFrom()||dateFrom()<=dateTo();}
  function inRange(day){return (!dateFrom()||day>=dateFrom())&&(!dateTo()||day<=dateTo());}
  function chosen(){
    if(!$('viewerDateTo'))return CORE.latest(ledger,$('viewerMonth').value);
    if(!validRange())return null;
    const day=$('viewerMonth').value;
    return ledger.settlements.filter(item=>inRange(item.date)&&(!day||item.date===day)).slice(-1)[0]||null;
  }
  function personValue(row){return publicView?JSON.stringify([row.store,row.alias]):row.personKey;}
  function matches(row){return (!$('viewerStore').value||row.store===$('viewerStore').value)&&(!$('viewerEmployee').value||personValue(row)===$('viewerEmployee').value);}
  function refresh(){const item=chosen();const rows=item?.rows||[];if($('viewerDateTo')&&!item)return;options('viewerStore',CORE.STORES.filter(s=>rows.some(row=>row.store===s)).map(value=>({value,label:value})),'九店全部');options('viewerEmployee',rows.filter(row=>!$('viewerStore').value||row.store===$('viewerStore').value).map(row=>({value:personValue(row),label:`${row.alias}｜${row.store}`})),'全部同仁');}
  function render(){
    const item=chosen();
    const rows=(item?.rows||[]).filter(matches).slice().sort((a,b)=>b.balance-a.balance);
    $('viewerSummary').innerHTML=[['結算總牌數',rows.reduce((n,row)=>n+row.balance,0)],['目前人數',rows.length],['正牌總數',rows.filter(row=>row.balance>0).reduce((n,row)=>n+row.balance,0)],['負牌總數',rows.filter(row=>row.balance<0).reduce((n,row)=>n+row.balance,0)]].map(([label,value])=>`<article class="summary-card"><span>${label}</span><strong>${fmt(value)}</strong></article>`).join('');
    $('viewerHead').innerHTML='<tr><th>排名</th><th>店點</th><th>接龍代稱</th><th class="number">結算總牌數</th><th>結算日期</th><th>狀態</th></tr>';
    $('viewerBody').innerHTML=rows.map((row,i)=>`<tr><td data-label="排名">${i+1}</td><td data-label="店點">${esc(row.store)}</td><td data-label="接龍代稱"><strong>${esc(row.alias)}</strong></td><td data-label="結算總牌數" class="number ${row.balance<0?'down':'up'}">${fmt(row.balance)}</td><td data-label="結算日期">${esc(item.date)}</td><td data-label="狀態">已確認</td></tr>`).join('')||'<tr><td colspan="6">目前篩選沒有資料。</td></tr>';
    const changes=CORE.changes(ledger).filter(row=>validRange()&&matches(row)&&inRange(row.date)&&(!$('viewerMonth').value||row.date===$('viewerMonth').value)).reverse();
    $('viewerDailyBody').innerHTML=changes.map(row=>`<tr><td data-label="日期">${esc(row.date)}</td><td data-label="店點">${esc(row.store)}</td><td data-label="同仁">${esc(row.alias)}</td><td data-label="增減" class="number ${row.delta!==null&&row.delta<0?'down':''}">${row.delta===null?'—':(row.delta>0?'+':'')+fmt(row.delta)}</td>${publicView?'':`<td data-label="原因／免扣">${esc([row.reason,row.exemption].filter(Boolean).join('／')||(row.delta===null?'尚未建立前一日基準':'未提供原因'))}</td>`}<td data-label="狀態">${row.delta===null?'總牌數已確認':esc(row.status)}</td></tr>`).join('')||`<tr><td colspan="${publicView?5:6}">目前篩選沒有日結紀錄。</td></tr>`;
    $('viewerMeta').textContent=item?`${item.date} 結算｜${rows.length} 人${publicView?'':`｜${item.source||''}`}`:'目前篩選沒有結算資料';
    const status=$('viewerFilterStatus');if(status){status.hidden=validRange();status.textContent=validRange()?'':'紀錄起日不能晚於迄日，請調整日期。';status.className='message error';}
  }
  window.openGoldDaily=function(result){publicView=result.ledger?.schema==='north12b-public-gold/v1';CORE=publicView?North12BGoldPublic:North12BGoldDaily;ledger=CORE.validate(result.ledger);$('goldViewer').hidden=false;$('viewerMonth').innerHTML='<option value="">最新結算</option>'+ledger.settlements.slice().reverse().map(item=>`<option value="${item.date}">${esc(item.date)} 結算</option>`).join('');refresh();render();};
  $('viewerMonth').addEventListener('change',()=>{refresh();render();});$('viewerStore').addEventListener('change',()=>{refresh();render();});$('viewerEmployee').addEventListener('change',render);$('viewerDateFrom').addEventListener('change',()=>{if($('viewerDateTo'))refresh();render();});
  $('viewerDateTo')?.addEventListener('change',()=>{refresh();render();});
  $('viewerReset')?.addEventListener('click',()=>{['viewerMonth','viewerStore','viewerEmployee','viewerDateFrom','viewerDateTo'].forEach(id=>{$(id).value='';});refresh();render();});
})();
