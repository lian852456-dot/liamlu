(function(scope){
  'use strict';
  /*
   * Standalone, public-price-only viewer.
   * This file must run on a separate origin from the supervisor portal.
   * It has zero dependencies on portal scripts, credentials, storage or navigation.
   */
  const API='https://script.google.com/macros/s/AKfycbzkvUUKtaFvEi7gaYWp8M98M_5fAmSD8a7g0ds5WarG5ikiOETTwalHattGKDMfqOfq/exec';
  const PROVIDERS=['點子行動','FutureDial（FDI）','愛鋒派'];
  const $=id=>document.getElementById(id);
  const els={status:$('queryStatus'),meta:$('sourceMeta'),results:$('results'),count:$('resultCount')};
  const INITIAL_LIMIT=60;
  let snapshot=null,generation=0;
  const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  const text=value=>value==null?'':String(value).trim();
  const status=(message,kind)=>{els.status.textContent=message;els.status.className='status'+(kind?' '+kind:'');};
  function priceState(value){
    const original=text(value);
    if(value==null||original==='')return {missing:true,zero:false,label:''};
    const normalized=original.replace(/,/g,'');
    const valid=/^\d+(?:,\d{3})*(?:\.\d+)?$/.test(original);
    const number=valid?Number(normalized):NaN;
    if(!Number.isFinite(number)||number<0)return {missing:true,zero:false,label:''};
    return {missing:false,zero:number===0,label:number.toLocaleString('en-US')+' 元'};
  }
  function allowedGrades(provider){return provider==='愛鋒派'?['S','A','B','C','未分級']:['S','A','B','C'];}
  function quotedGrades(row,provider,filter){
    const quotes=row.quotes&&row.quotes[provider];
    if(!quotes||typeof quotes!=='object')return [];
    return allowedGrades(provider).filter(grade=>(!filter||filter===grade)&&!priceState(quotes[grade]).missing);
  }
  const modelKey=row=>[text(row.brand),text(row.colorless_model||row.model)].join('\u0001');
  const hasAnyPrice=row=>PROVIDERS.some(p=>quotedGrades(row,p,'').length);
  function options(rows){
    const seen=new Set();
    return rows.filter(hasAnyPrice).filter(row=>{
      const key=modelKey(row);
      if(seen.has(key))return false;
      seen.add(key);
      return true;
    }).map(row=>({value:modelKey(row),label:[text(row.brand),text(row.colorless_model||row.model)].filter(Boolean).join(' · ')}));
  }
  function filteredRows(){
    if(!snapshot)return [];
    const query=text($('keyword').value).toLocaleLowerCase();
    const model=$('model').value;
    const provider=$('provider').value;
    const grade=$('grade').value;
    return snapshot.rows.filter(row=>{
      if(model&&modelKey(row)!==model)return false;
      if(query&&![row.brand,row.model,row.colorless_model].map(text).join(' ').toLocaleLowerCase().includes(query))return false;
      return PROVIDERS.some(p=>(!provider||provider===p)&&quotedGrades(row,p,grade).length);
    });
  }
  function validate(body){
    if(!body||body.status!=='ok'){
      const error=new Error(body&&body.message||'正式價格讀取失敗');
      error.authoritative=true;
      throw error;
    }
    const data=body.snapshot;
    if(data==null)return null;
    if(typeof data!=='object'||data.kind!=='tradein'||!Array.isArray(data.rows)||data.rows.length>10000||
       (data.row_count!=null&&Number(data.row_count)!==data.rows.length)||
       data.rows.some(row=>!row||typeof row!=='object'||Array.isArray(row)||typeof row.brand!=='string'||typeof row.model!=='string'||!row.quotes||typeof row.quotes!=='object')){
      const error=new Error('正式回收價資料格式不符，請稍後再試');
      error.authoritative=true;
      throw error;
    }
    return data;
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
      function finish(error,data){
        if(finished)return;
        finished=true;scope.clearTimeout(timer);
        scope.removeEventListener('message',onMessage);
        form.remove();frame.remove();
        error?reject(error):resolve(data);
      }
      function onMessage(event){
        let origin;
        try{origin=new URL(event.origin);}catch{return;}
        const host=origin.hostname;
        if(origin.protocol!=='https:'||origin.port||
           !(host==='script.google.com'||host==='script.googleusercontent.com'||host.endsWith('-script.googleusercontent.com')))return;
        if(event.source!==frame.contentWindow)return;
        const message=event.data;
        if(!message||message.type!=='north12b-gas-response-v1'||message.requestId!==requestId)return;
        try{finish(null,validate(message.body));}catch(error){finish(error);}
      }
      frame.name='public_tradein_'+requestId;
      frame.title='正式回收價讀取';frame.hidden=true;
      form.method='POST';form.action=endpoint.toString();form.target=frame.name;
      form.enctype='application/x-www-form-urlencoded';form.hidden=true;
      field.name='payload';field.value=JSON.stringify(payload);form.append(field);
      scope.addEventListener('message',onMessage);
      document.body.append(frame,form);
      try{form.submit();}catch{finish(new Error('正式價格連線失敗'));}
    });
  }
  async function read(){
    // Only the pre-existing public read-only action. No other API call is allowed.
    const payload={action:'threec_snapshot_read',kind:'tradein',includeChanges:false};
    const abort=new AbortController();
    const timeout=scope.setTimeout(()=>abort.abort(),15000);
    try{
      const response=await scope.fetch(API+'?readAttempt='+Date.now().toString(36),{
        method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify(payload),cache:'no-store',credentials:'omit',signal:abort.signal
      });
      if(!response.ok)throw new Error('正式價格服務無法連線');
      return validate(await response.json());
    }catch(error){
      if(error.authoritative)throw error;
      return readByFrame(payload);
    }finally{scope.clearTimeout(timeout);}
  }
  function clear(){
    snapshot=null;$('model').innerHTML='<option value="">全部機款</option>';
    els.meta.textContent='';els.count.textContent='';
    els.results.innerHTML='<p class="empty">尚無正式回收價格。</p>';
  }
  function render(){
    if(!snapshot)return;
    const rows=filteredRows();
    const selected=$('provider').value,gradeFilter=$('grade').value;
    const shown=rows.slice(0,$('model').value?rows.length:INITIAL_LIMIT);
    els.count.textContent=rows.length+' 筆符合';
    if(!shown.length){
      els.results.innerHTML='<p class="empty">沒有符合條件且有報價的機款，請調整搜尋或等級。</p>';
      return;
    }
    els.results.innerHTML='<div class="result-list">'+shown.map(row=>{
      const blocks=PROVIDERS.filter(p=>(!selected||selected===p)&&quotedGrades(row,p,gradeFilter).length).map(provider=>{
        const grades=quotedGrades(row,provider,gradeFilter);
        return '<section class="provider-block"><h4 class="provider-title">'+esc(provider)+'</h4><div class="price-grid">'+grades.map(grade=>{
          const price=priceState(row.quotes[provider][grade]);
          return '<div class="price-item'+(price.zero?' zero':'')+'"><span class="grade">'+esc(grade==='未分級'?'來源未分級':grade+' 級')+'</span><strong>'+esc(price.label)+'</strong></div>';
        }).join('')+'</div></section>';
      }).join('');
      return '<article class="model-card"><div class="model-head"><h3>'+esc([row.brand,row.model].filter(Boolean).join(' · ')||'未命名機款')+'</h3></div>'+blocks+'</article>';
    }).join('')+'</div>'+(shown.length<rows.length?'<p class="result-more">目前顯示前 '+shown.length+' 筆，共 '+rows.length+' 筆。請搜尋或選擇機款以查看完整結果。</p>':'');
  }
  async function refresh(){
    const token=++generation;
    clear();$('refreshBtn').disabled=true;status('正在讀取正式回收價格…');
    try{
      const incoming=await read();
      if(token!==generation)return;
      if(!incoming){status('目前尚未發布正式回收價，請稍後重新讀取。','warn');return;}
      snapshot=incoming;
      $('model').innerHTML='<option value="">全部機款</option>'+options(incoming.rows).map(o=>
        '<option value="'+esc(o.value)+'">'+esc(o.label)+'</option>').join('');
      els.meta.innerHTML='正式來源日期：<strong>'+esc(incoming.source_version_date||'未提供')+
        '</strong>　｜　來源機款：'+esc(incoming.row_count||incoming.rows.length)+' 筆　｜　發布時間：'+esc(incoming.published_at||'未提供');
      status('已讀取正式回收價，可開始查詢。','ok');render();
    }catch(error){
      if(token!==generation)return;
      clear();status('回收價格讀取失敗：'+(error&&error.message||'未知錯誤')+'。請按「重新讀取報價」重試。','error');
    }finally{if(token===generation)$('refreshBtn').disabled=false;}
  }
  $('searchForm').addEventListener('submit',event=>event.preventDefault());
  $('keyword').addEventListener('input',render);
  ['model','provider','grade'].forEach(id=>$(id).addEventListener('change',render));
  $('resetBtn').addEventListener('click',()=>{
    ['keyword','model','provider','grade'].forEach(id=>$(id).value='');
    render();$('keyword').focus();
  });
  $('refreshBtn').addEventListener('click',refresh);
  $('copyBtn').addEventListener('click',async()=>{
    try{
      await scope.navigator.clipboard.writeText(scope.location.href.split('#')[0]);
      status('查價連結已複製。','ok');
    }catch{status('無法自動複製，請從瀏覽器網址列複製連結。','warn');}
  });
  scope.addEventListener('pagehide',()=>{generation++;clear();});
  scope.addEventListener('pageshow',event=>{if(event.persisted)refresh();});
  refresh();
})(window);
