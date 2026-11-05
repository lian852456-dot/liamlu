(function(root,factory){
  const api=factory(root,typeof module==='object'&&module.exports?require('./offline-html.js'):root.OfflineHtml,typeof module==='object'&&module.exports?require('./tradein-reference-core.js'):root.TradeinReferenceCore);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ThreecQueryExport=api;
})(typeof window!=='undefined'?window:null,function(root,H,Reference){
  'use strict';
  const text=v=>typeof v==='string'?v:typeof v==='number'&&Number.isFinite(v)?String(v):'';
  function scalar(v){if(v==null||typeof v==='string'||typeof v==='number'&&Number.isFinite(v))return v;throw Error('價格欄位格式不完整，停止匯出');}
  const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value[k]!==undefined).map(k=>[k,scalar(value[k])]));
  function project(kind,response){
    if(!['shopping','tradein'].includes(kind)||response?.status!=='ok'||!response.snapshot)throw Error('請先完整讀取價格再匯出');
    const check=response.updateCheck;if(check&&(check.blocked||check.status==='blocked'||check.ok===false||check.matches===false))throw Error('來源版本核對未通過，請重新整理後匯出');
    const raw=response.snapshot,rows=Array.isArray(raw.rows)?raw.rows:raw.data?.rows;
    if(!Array.isArray(rows)||!rows.length||raw.kind!==kind||!/^20\d{2}-\d{2}-\d{2}$/.test(raw.source_version_date||'')||!text(raw.snapshot_hash))throw Error('價格來源、日期或版本不完整，停止匯出');
    if(raw.row_count!=null&&Number(raw.row_count)!==rows.length)throw Error('價格筆數不符，停止匯出');
    const snapshot=pick(raw,['schema_version','kind','source_version_date','source_file_name','source_file_sha256','snapshot_hash','published_at']);
    snapshot.row_count=rows.length;
    snapshot.rows=rows.map(row=>{
      const result=pick(row,['source_sheet','sourceSheet','source_row_number','sourceRowNumber','brand','code','model','source_model','colorless_model','colorlessModel']);
      if(kind==='shopping'){
        const prices=row.project_prices??row.projectPrices;
        if(!prices||Array.isArray(prices)||typeof prices!=='object')throw Error('缺少完整專案價格，停止匯出');
        result.retail_price=scalar(row.retail_price??row.retailPrice??null);
        result.project_prices=Object.fromEntries(Object.entries(prices).map(([condition,value])=>[condition,scalar(value)]));
      }else{
        if(!row.quotes||typeof row.quotes!=='object'||Array.isArray(row.quotes))throw Error('缺少回收商分級價格，停止匯出');
        result.quotes=Object.fromEntries(Object.entries(row.quotes).map(([vendor,grades])=>{
          if(!['點子行動','FutureDial（FDI）','愛鋒派'].includes(vendor)||!grades||typeof grades!=='object'||Array.isArray(grades))throw Error('回收商格式不支援，停止匯出');
          return [vendor,Object.fromEntries(Object.entries(grades).map(([grade,value])=>{if(!['S','A','B','C','未分級'].includes(grade))throw Error('分級格式不支援，停止匯出');return [grade,scalar(value)];}))];
        }));
      }
      return result;
    });
    const output={status:'ok',snapshot,changesDeferred:true};
    if(response.localReference){
      output.localReference=true;
      if(kind==='tradein'){
        const reference=Reference||root?.TradeinReferenceCore;
        if(!reference||!response.referenceCatalog)throw Error('參考檔的完整分級與有效期未載入，停止匯出');
        output.referenceCatalog=reference.normalize(response.referenceCatalog);
        output.validThrough=output.referenceCatalog.sources.map(s=>({file:s.file,date:s.date,validThrough:s.validThrough}));
      }
    }
    return {kind,response:output};
  }
  function projectPair(sources){
    const shopping=project('shopping',sources?.shopping).response,tradein=project('tradein',sources?.tradein).response;
    if(Boolean(shopping.localReference)!==Boolean(tradein.localReference)||(shopping.localReference&&shopping.snapshot.snapshot_hash!==tradein.snapshot.snapshot_hash))throw Error('兩類價格來源不同，請重新載入同一來源後匯出');
    return {shopping,tradein};
  }
  function build(kind,sources,assets){
    const payload={initialKind:kind==='tradein'?'tradein':'shopping',responses:projectPair(sources)},asset=assets?.tradein;
    if(!H||!asset?.body||!asset?.script||!asset?.css)throw Error('離線匯出元件尚未載入');
    const json=JSON.stringify(payload).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    const body=asset.body.replace('<!--QUERY_OFFLINE_INFO-->', '<p class="offline-info">手機專案 '+payload.responses.shopping.snapshot.row_count+' 筆／舊換新 '+payload.responses.tradein.snapshot.row_count+' 筆完整來源資料 · 唯讀快照</p>');
    // Body attributes are applied before the bundled display-only runtime starts.
    return H.create({title:'手機專案與舊換新查價｜整合唯讀版',body,css:asset.css,script:'document.body.dataset.queryKind="combined";document.body.dataset.queryRelease="6";document.body.dataset.priceMode="offline";window.ThreecReadonlyPayload='+json+';\n'+asset.script});
  }
  let read=null,current=null,loading=null,busy=false;
  const same=(a,b)=>a?.shopping===b?.shopping&&a?.tradein===b?.tradein;
  function update(sources){current=sources;const button=root?.document?.getElementById('downloadQueryHtml');if(button){const ready=!!sources?.shopping?.snapshot&&!!sources?.tradein?.snapshot;button.disabled=busy||!ready;button.title=ready?'一次下載一個可離線切換兩種查價的 HTML':'手機專案與舊換新資料皆完整載入後可匯出';}}
  function assets(){
    if(root.ThreecReadonlyAssets)return Promise.resolve(root.ThreecReadonlyAssets);
    if(!loading)loading=new Promise((resolve,reject)=>{const script=root.document.createElement('script');script.src='threec-readonly-assets.js?v=20261105-integrated-1';script.onload=()=>root.ThreecReadonlyAssets?resolve(root.ThreecReadonlyAssets):reject(Error('匯出元件不完整'));script.onerror=()=>reject(Error('匯出元件下載失敗，請重試'));root.document.head.append(script);}).catch(error=>{loading=null;throw error;});
    return loading;
  }
  function bind(getResponse){
    read=getResponse;const button=root.document.getElementById('downloadQueryHtml'),status=root.document.getElementById('queryExportStatus');if(!button)return;
    button.addEventListener('click',async()=>{
      if(busy)return;const source=read(),kind=root.document.body.dataset.queryKind;busy=true;update(source);status.hidden=false;status.textContent='正在建立完整唯讀 HTML…';
      try{
        projectPair(source);const bundle=await assets();
        if(!same(read(),source)||!same(current,source))throw Error('價格來源已切換，請完成讀取後重新匯出');
        const html=build(kind,source,bundle),name='手機專案與舊換新_整合唯讀_'+source.shopping.snapshot.source_version_date+'_'+source.tradein.snapshot.source_version_date+'.html';
        root.OfflineHtml.download(html,name);
        status.textContent='已匯出一個整合唯讀 HTML；開啟下載檔即可切換手機專案與舊換新，離線查詢完整價格。';
      }catch(error){status.textContent=error.message||'匯出失敗，請重新整理後重試';}
      finally{busy=false;update(read());}
    });
    update(read());
  }
  return Object.freeze({project,projectPair,build,bind,update});
});
