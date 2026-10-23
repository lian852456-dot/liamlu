(function(scope) {
  'use strict';
  const $=id=>document.getElementById(id),core=scope.PlatformUsageCore;
  // No production transport is installed. A separately reviewed adapter is required.
  const adapter=scope.PlatformUsageAdapter;
  let generation=0,controller=null,scheduled=null,refreshTimer=null;
  const stores=['酒泉','萬大','大稻埕','復興南','三創','杭州南','永吉','通化','六張犁'];
  stores.forEach(s=>{const x=document.createElement('option');x.value=s;x.textContent=s;$('store').append(x);});
  function text(id,value){$(id).textContent=value;}
  function node(tag,value){const x=document.createElement(tag);x.textContent=value;return x;}
  const amount=(n,unit='')=>n===null||n===undefined?'—':Number(n).toLocaleString('zh-TW',{maximumFractionDigits:1})+unit;
  const minutes=ms=>amount(ms===null||ms===undefined?null:ms/60000,' 分');
  function range(){
    const end=core.midnight(core.dateKey(Date.now()));
    if($('period').value!=='custom'){$('end').value=core.dateKey(end);$('start').value=core.dateKey(end-(Number($('period').value)-1)*core.DAY);}
    return {start:$('start').value,end:$('end').value,store:$('store').value,feature:$('feature').value};
  }
  function clear(message){
    clearTimeout(refreshTimer);['rate','dau','wau','median'].forEach(id=>text(id,'—'));
    text('denominator','需日期化正式名冊分母');text('updated','尚未取得資料');text('status',message);
    text('trend','啟用並累積資料後顯示');$('trend').className='empty';
    text('distribution','依功能呈現，不做員工排名');$('distribution').className='empty';
    $('features').replaceChildren();const row=document.createElement('tr');row.append(node('td','全部功能'));const cell=node('td','未取得');cell.colSpan=6;row.append(cell);$('features').append(row);
    text('people','本人核驗通過後才可讀取。');text('quality','資料未取得；不能當作 0。');$('errors').replaceChildren();
  }
  function render(r){
    if(!r||r.v!==1||!r.summary||!Array.isArray(r.features)||!Array.isArray(r.people)||r.timezone!=='Asia/Taipei')throw Error('FORMAT');
    text('mode',adapter?.environment==='synthetic'?'合成資料預覽 ／ 尚未上線':'已啟用收集');
    const s=r.summary;
    text('rate',s.usageRate===null?'—':amount(s.usageRate*100,'%'));text('denominator',s.eligible===null?'無法計算：日期化名冊待確認':`本期觀測 ${s.active} ／ 適用 ${s.eligible} 個帳號`);
    text('dau',amount(s.dau));text('wau',amount(s.wau));text('median',minutes(s.medianMs));
    const today=core.dateKey(Date.now()),historical=r.filters.end!==today;
    text('dau-label',historical?`${r.filters.end} 活躍帳號`:'已驗證帳號去重');text('wau-label',`截至 ${r.filters.end}，近 7 日去重`);
    text('updated',`更新 ${new Date(r.updatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})}`);
    text('status',(adapter?.environment==='synthetic'?'此頁僅含合成帳號，無正式使用紀錄。':'已通過本次本人後端核驗。')+(r.coverage.partial?' 選取期間早於起算日，數值僅代表已覆蓋時段。':''));
    $('features').replaceChildren();
    r.features.forEach(f=>{const tr=document.createElement('tr');[f.label,amount(f.active),amount(f.count),amount(f.weeklyFrequency,' 次'),minutes(f.activeMs)+(f.ambiguousMs?'（有未歸屬）':''),`${minutes(f.medianMs)}／${minutes(f.p75Ms)}`,f.status==='connected'?'已接入':f.status==='disabled'?'未啟用':'尚未接入'].forEach(v=>tr.append(node('td',v)));$('features').append(tr);});
    const other=document.createElement('tr');other.append(node('td','其他工作窗口'));const unknown=node('td','尚未接入；外部網站停留未知');unknown.colSpan=6;other.append(unknown);$('features').append(other);
    $('trend').replaceChildren();$('trend').className='bars';const max=Math.max(1,...r.daily.map(d=>d.active||0));
    r.daily.forEach(d=>{const bar=document.createElement('div');bar.className='bar';bar.append(node('span',d.active===null?'未取得':String(d.active)));const i=document.createElement('i');i.style.height=(d.active===null?2:Math.max(2,d.active/max*90))+'px';bar.append(i,node('span',d.date.slice(5)));bar.title=d.date+(d.partial?'（部分覆蓋）':'');$('trend').append(bar);});
    $('distribution').className='';$('distribution').replaceChildren();const largest=Math.max(1,...r.features.map(f=>f.active||0));
    r.features.forEach(f=>{const row=document.createElement('div');row.className='dist-row';row.append(node('span',f.label));const track=document.createElement('div');track.className='dist-track';const fill=document.createElement('i');fill.style.width=(f.active||0)/largest*100+'%';track.append(fill);row.append(track,node('span',amount(f.active)));$('distribution').append(row);});
    $('people').replaceChildren();
    if(!r.people.length)$('people').append(node('p','本期沒有觀測到合格使用，不能據此判斷是否上班。'));
    r.people.forEach(p=>{const detail=document.createElement('details');detail.className='person';detail.append(node('summary',`${p.actor} · ${p.store} · 活躍 ${p.activeDays} 天`),node('p',`${p.identity} ｜ 合格 ${p.count} 次 ｜ 有效 ${minutes(p.activeMs)} ｜ 最近 ${p.lastDate||'本期沒有觀測到使用'}`));p.features.forEach(f=>detail.append(node('p',`${f.label}：${f.count} 次／${minutes(f.activeMs)}`)));$('people').append(detail);});
    text('quality',`統計起算 ${new Date(r.since).toLocaleString('zh-TW',{timeZone:'Asia/Taipei'})} ｜ 已接入 ${r.coverage.connected}／${r.coverage.total} 個第一期窗口 ｜ 名冊 ${r.coverage.roster==='verified'?r.coverage.rosterVersion:'未取得'} ｜ 重複 ${amount(r.quality?.duplicate)} ｜ 拒收 ${amount(r.quality?.rejected)} ｜ 跨功能重疊未歸屬 ${minutes(s.unassignedMs)}。功能停留排除無法歸屬的重疊，平台取聯集。`);
    $('errors').replaceChildren();r.features.forEach(f=>$('errors').append(node('p',`${f.label}：載入樣本 ${f.loadSamples}，P50 ${amount(f.loadP50,' ms')}／P95 ${amount(f.loadP95,' ms')}；錯誤 ${amount(f.errors)}，已觀測錯誤率 ${f.errorRate===null?'—':amount(f.errorRate*100,'%')}。`)));
    $('errors').append(node('p','僅代表接入頁面的已觀測載入與錯誤；尚未啟動 JavaScript 的失敗、舊版或阻擋追蹤不在樣本內。'));
  }
  async function load(){
    const id=++generation;controller?.abort();controller=new AbortController();
    clear('正在核驗本人權限與讀取；完成前不顯示舊資料。');$('refresh').disabled=true;
    if(!adapter?.read){clear('本人獨立驗證尚未配置；尚未啟用收集，沒有正式使用紀錄。');$('refresh').disabled=false;return;}
    try {
      const filters=range();core.filters(filters,Date.now());
      const value=await adapter.read(filters,{signal:controller.signal});
      if(id!==generation||document.hidden)return;
      if(value?.status!=='ok'||!Number.isSafeInteger(value.expiresAt)||value.expiresAt<=Date.now()||value.expiresAt>Date.now()+1800000)throw Error('DENIED');render(value.report);
      refreshTimer=setTimeout(()=>{suspend();if(!document.hidden)void load();},Math.min(60000,value.expiresAt-Date.now()));
    } catch(error){if(id===generation)clear(error.message==='USAGE_INVALID'?'日期需有效、不可晚於今日，範圍最多 30 天。':'本次查詢未取得資料或本人權限未通過；請稍後重試。');}
    finally{if(id===generation)$('refresh').disabled=false;}
  }
  function suspend(){generation++;controller?.abort();$('refresh').disabled=false;clear('畫面已清除；返回時將重新核驗本人權限。');}
  $('filters').addEventListener('submit',e=>{e.preventDefault();void load();});
  ['period','store','feature','start','end'].forEach(id=>$(id).addEventListener('change',()=>{
    $('dates').hidden=$('period').value!=='custom';range();clearTimeout(scheduled);scheduled=setTimeout(()=>void load(),100);
  }));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else void load();});
  scope.addEventListener('pagehide',suspend);scope.addEventListener('pageshow',e=>{if(e.persisted)void load();});
  scope.addEventListener('storage',e=>{if(e.key==='north12b_portal_logout_event_v1')suspend();});
  scope.addEventListener('platform-usage-revoked',suspend);
  range();void load();
})(window);
