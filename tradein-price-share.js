(function(scope){
  'use strict';
  // Read-only price view. The authenticated management upload remains on the existing GAS page.
  // Do not add an upload route, admin token, employee/device ID, goals or private dashboards here.
  const API='https://script.google.com/macros/s/AKfycbzkvUUKtaFvEi7gaYWp8M98M_5fAmSD8a7g0ds5WarG5ikiOETTwalHattGKDMfqOfq/exec';
  const Core=scope.ThreecQueryCore;
  const $=id=>document.getElementById(id);
  const els={status:$('queryStatus'),meta:$('sourceMeta'),results:$('results'),count:$('resultCount')};
  const MAX_INITIAL=60;
  let current=null;
  let generation=0;
  const escapeHtml=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const status=(message,kind)=>{els.status.textContent=message;els.status.className='status'+(kind?' '+kind:'');};
  function assertPublicResponse(body){
    if(!body||body.status!=='ok') {
      const error=new Error(body&&body.message||'正式價格讀取失敗');
      error.authoritative=true;
      throw error;
    }
    const snapshot=body.snapshot;
    if(snapshot==null)return null;
    if(typeof snapshot!=='object'||snapshot.kind!=='tradein'||!Array.isArray(snapshot.rows)||snapshot.rows.length>10000||
       (snapshot.row_count!=null&&Number(snapshot.row_count)!==snapshot.rows.length)) {
      const error=new Error('正式回收價資料格式不符，請稍後再試');
      error.authoritative=true;
      throw error;
    }
    return {snapshot};
  }
  function readByFrame(payload){
    return new Promise((resolve,reject)=>{
      const requestId=scope.crypto.randomUUID();
      const endpoint=new URL(API);
      endpoint.searchParams.set('transport','iframe');
      endpoint.searchParams.set('requestId',requestId);
      endpoint.searchParams.set('origin',scope.location.origin);
      const frame=document.createElement('iframe');
      const form=document.createElement('form');
      const field=document.createElement('textarea');
      let finished=false;
      const timer=scope.setTimeout(()=>finish(new Error('正式資料讀取逾時')),35000);
      function finish(error,body){
        if(finished)return;
        finished=true;
        scope.clearTimeout(timer);
        scope.removeEventListener('message',onMessage);
        form.remove();frame.remove();
        if(error)reject(error);else resolve(body);
      }
      function onMessage(event){
        let parsed;
        try{parsed=new URL(event.origin);}catch{return;}
        const host=parsed.hostname;
        if(parsed.protocol!=='https:'||parsed.port||
          !(host==='script.google.com'||host==='script.googleusercontent.com'||host.endsWith('-script.googleusercontent.com')))return;
        if(event.source!==frame.contentWindow)return;
        const message=event.data;
        if(!message||message.type!=='north12b-gas-response-v1'||message.requestId!==requestId)return;
        try{resolveValidated(message.body);}catch(error){finish(error);}
      }
      function resolveValidated(body){const data=assertPublicResponse(body);finish(null,data);}
      frame.name='public_tradein_'+requestId;
      frame.title='正式回收價讀取';
      frame.hidden=true;
      form.method='POST';
      form.action=endpoint.toString();
      form.target=frame.name;
      form.enctype='application/x-www-form-urlencoded';
      form.hidden=true;
      field.name='payload';
      field.value=JSON.stringify(payload);
      form.append(field);
      scope.addEventListener('message',onMessage);
      document.body.append(frame,form);
      try{form.submit();}catch{finish(new Error('正式價格連線失敗'));}
    });
  }
  async function readSnapshot(){
    // Exactly one price category and one read-only GAS action: never request shopping or changes.
    const payload={action:'threec_snapshot_read',kind:'tradein',includeChanges:false};
    const controller=new AbortController();
    const timer=scope.setTimeout(()=>controller.abort(),15000);
    try{
      const response=await scope.fetch(API+'?readAttempt='+Date.now().toString(36),{
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify(payload),
        cache:'no-store',
        credentials:'omit',
        signal:controller.signal
      });
      const body=await response.json();
      if(!response.ok)throw new Error('正式價格服務無法連線');
      return assertPublicResponse(body);
    }catch(error){
      if(error.authoritative)throw error;
      return readByFrame(payload);
    }finally{scope.clearTimeout(timer);}
  }
  function clear(){
    current=null;
    $('model').innerHTML='<option value="">全部機款</option>';
    els.meta.textContent='';
    els.count.textContent='';
    els.results.innerHTML='<p class="empty">尚無正式回收價格。</p>';
  }
  function render(){
    if(!current||!current.snapshot)return;
    const filters={
      query:$('keyword').value.trim(),
      modelKey:$('model').value,
      provider:$('provider').value,
      grade:$('grade').value
    };
    const all=Core.filterTradeinByModel(current.snapshot,filters);
    // Search never invents a missing price; Core filters to quoted grades/providers.
    const shown=all.slice(0,filters.modelKey?all.length:MAX_INITIAL);
    els.count.textContent=all.length+' 筆符合';
    if(!shown.length){
      els.results.innerHTML='<p class="empty">沒有符合條件且有報價的機款，請調整搜尋或等級。</p>';
      return;
    }
    els.results.innerHTML='<div class="result-list">'+shown.map(row=>{
      const blocks=Core.quotedProviders(row,filters.provider,filters.grade).map(provider=>{
        const grades=Core.quotedGrades(row,provider,filters.grade);
        return '<section class="provider-block"><h4 class="provider-title">'+escapeHtml(provider)+'</h4><div class="price-grid">'+grades.map(grade=>{
          const price=row.quotes[provider][grade];
          return '<div class="price-item'+(Core.priceState(price).zero?' zero':'')+'"><span class="grade">'+escapeHtml(Core.gradeLabel(grade))+'</span><strong>'+escapeHtml(Core.formatPrice(price))+'</strong></div>';
        }).join('')+'</div></section>';
      }).join('');
      return '<article class="model-card"><div class="model-head"><h3>'+escapeHtml([row.brand,row.model].filter(Boolean).join(' · ')||'未命名機款')+'</h3></div>'+blocks+'</article>';
    }).join('')+'</div>'+(shown.length<all.length?'<p class="result-more">目前顯示前 '+shown.length+' 筆，共 '+all.length+' 筆。請搜尋或選擇機款以查看完整結果。</p>':'');
  }
  function setModelOptions(snapshot){
    $('model').innerHTML='<option value="">全部機款</option>'+Core.modelOptions(snapshot,'tradein').map(option=>
      '<option value="'+escapeHtml(option.value)+'">'+escapeHtml(option.label)+'</option>'
    ).join('');
  }
  async function refresh(){
    const token=++generation;
    clear();
    $('refreshBtn').disabled=true;
    status('正在讀取正式回收價格…');
    try{
      const next=await readSnapshot();
      if(token!==generation)return;
      if(!next){
        status('目前尚未發布正式回收價，請稍後重新讀取。','warn');
        return;
      }
      current=next;
      setModelOptions(next.snapshot);
      const meta=Core.sourceMeta(next.snapshot,{},'tradein');
      els.meta.innerHTML='正式來源日期：<strong>'+escapeHtml(meta.sourceVersionDate||'未提供')+
        '</strong>　｜　來源機款：'+escapeHtml(meta.rowCount)+' 筆　｜　發布時間：'+
        escapeHtml(meta.publishedAt||'未提供');
      status('已讀取正式回收價，可開始查詢。','ok');
      render();
    }catch(error){
      if(token!==generation)return;
      clear();
      status('回收價格讀取失敗：'+(error&&error.message||'未知錯誤')+'。請按「重新讀取報價」重試。','error');
    }finally{
      if(token===generation)$('refreshBtn').disabled=false;
    }
  }
  $('searchForm').addEventListener('submit',event=>event.preventDefault());
  $('keyword').addEventListener('input',render);
  ['model','provider','grade'].forEach(id=>$(id).addEventListener('change',render));
  $('resetBtn').addEventListener('click',()=>{
    ['keyword','model','provider','grade'].forEach(id=>$(id).value='');
    render();
    $('keyword').focus();
  });
  $('refreshBtn').addEventListener('click',refresh);
  $('copyBtn').addEventListener('click',async()=>{
    try{
      await scope.navigator.clipboard.writeText(scope.location.href.split('#')[0]);
      status('查價連結已複製。','ok');
    }catch{status('無法自動複製，請從瀏覽器網址列複製連結。','warn');}
  });
  scope.addEventListener('pagehide',()=>{
    generation++;
    clear();
  });
  scope.addEventListener('pageshow',event=>{if(event.persisted)refresh();});
  refresh();
})(window);
