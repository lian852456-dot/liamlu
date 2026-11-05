(function(scope){
  'use strict';
  const Core=scope.PromotionCatalogCore;
  const escape=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function mount(host){
    let catalog=null,epoch=0,currentImage='',limit=12,lastFilter='';
    const defaultType=document.body.dataset.queryKind==='tradein'?'tradein':'';
    host.innerHTML=`<summary>當月購機優惠與舊換新加碼</summary><div class="promo-body">
      <p class="promo-intro">依機款核對購機折價、舊換新加碼、老客戶及回娘家條件。金額不會自動扣進售價或回收價。</p>
      <div class="promo-import"><label>載入活動資料檔（JSON）<input data-promo="file" type="file" accept=".json,application/json"></label><button data-promo="clear" type="button" disabled>清除活動資料</button></div>
      <p class="promo-message" data-promo="message" role="status">尚未載入活動資料。僅在本頁使用所選檔案，離頁後清除。</p>
      <div data-promo="content" hidden>
        <div class="promo-heading"><h2 data-promo="title"></h2><span data-promo="version"></span></div>
        <details class="promo-coverage"><summary>資料涵蓋範圍與待核項目</summary><ul data-promo="coverage"></ul></details>
        <div class="promo-filters">
          <label class="promo-search">搜尋機款、容量或專案屬性<input data-promo="search" type="search" placeholder="例如：機款名稱、容量、屬性代碼" autocomplete="off"></label>
          <label>優惠類型<select data-promo="type"><option value="">全部優惠</option>${Object.entries(Core.TYPES).map(([v,n])=>`<option value="${v}">${n}</option>`).join('')}</select></label>
          <label>品牌<select data-promo="brand"><option value="">全部品牌</option></select></label>
          <label>通路<select data-promo="channel"><option value="">全部通路</option><option>DS</option><option>FS</option><option>CS</option></select></label>
          <label>查詢日期<input data-promo="date" type="date"></label>
        </div>
        <div class="promo-options"><label><input data-promo="inactive" type="checkbox"> 包含關閉、已到期與尚未開始</label><button data-promo="current" type="button">帶入目前機款搜尋</button><button data-promo="reset" type="button">重設篩選</button></div>
        <p data-promo="count" class="promo-count" role="status"></p><div data-promo="results" class="promo-results"></div><button data-promo="more" type="button" hidden>顯示更多活動</button>
        <details class="promo-sources"><summary>來源圖片與檔案核對</summary><div data-promo="sources"></div></details>
      </div>
      <dialog data-promo="dialog" class="promo-dialog"><button data-promo="close" type="button">關閉原圖</button><h2 data-promo="image-title"></h2><p data-promo="image-sha"></p><img data-promo="image" alt="活動原圖"></dialog>
    </div>`;
    const $=name=>host.querySelector(`[data-promo="${name}"]`);
    $('type').value=defaultType;$('date').value=Core.taipeiDate();
    function clear(message='活動資料已清除，重新載入檔案即可查詢。'){
      epoch++;catalog=null;currentImage='';$('file').value='';$('content').hidden=true;$('results').replaceChildren();$('sources').replaceChildren();$('coverage').replaceChildren();$('title').textContent='';$('version').textContent='';$('count').textContent='';$('image').removeAttribute('src');$('image-title').textContent='';$('image-sha').textContent='';if($('dialog').open)$('dialog').close();$('clear').disabled=true;$('message').textContent=message;
    }
    function showSource(id,trigger){
      const source=catalog?.sources.find(x=>x.id===id);if(!source)return;
      currentImage=id;$('image-title').textContent=source.title;$('image-sha').textContent=source.fileName+' · SHA-256 '+source.sha256;
      if(source.image){$('image').src=source.image;$('image').alt=source.title;}else $('image').removeAttribute('src');
      $('dialog').showModal();$('close').focus();$('dialog').addEventListener('close',()=>{currentImage='';$('image').removeAttribute('src');trigger?.focus();},{once:true});
    }
    function render(){
      if(!catalog)return;
      let rows;try{rows=Core.filter(catalog,{query:$('search').value,type:$('type').value,brand:$('brand').value,channel:$('channel').value,date:$('date').value,includeInactive:$('inactive').checked});}catch(error){$('count').textContent=error.message;$('results').replaceChildren();return;}
      const signature=JSON.stringify(['search','type','brand','channel','date','inactive'].map(name=>name==='inactive'?$(name).checked:$(name).value));if(signature!==lastFilter){limit=12;lastFilter=signature;}
      $('count').textContent=`符合 ${rows.length} 筆／資料檔共 ${catalog.rows.length} 筆；顯示前 ${Math.min(limit,rows.length)} 筆。查詢日 ${$('date').value}；仍須核對申辦資格與疊加條件。`;
      $('more').hidden=rows.length<=limit;
      $('results').innerHTML=rows.length?rows.slice(0,limit).map(row=>{
        const status=Core.validity(row,$('date').value);
        return `<article class="promo-card" data-promo-id="${escape(row.id)}"><div class="promo-card-top"><span class="promo-type">${escape(Core.TYPES[row.type])}</span><span class="promo-validity ${status}">${escape(Core.validityLabel[status])} · ${escape(Core.STATUSES[row.status])}</span></div><h3>${escape(row.model)}</h3><p class="promo-brand">${escape(row.brand)} · ${escape(row.start)} ～ ${escape(row.end)}</p><div class="promo-benefits">${row.benefits.map(b=>`<div><strong>${escape(Core.amountLabel(b))}</strong><p>${escape(b.condition)}</p>${b.codes.length?`<p class="promo-code">屬性 ${escape(b.codes.join('／'))}</p>`:''}</div>`).join('')}</div><dl><dt>適用對象</dt><dd>${escape(row.audience)}</dd><dt>適用通路</dt><dd>${escape(row.channels.join('／'))}</dd><dt>適用專案</dt><dd>${escape(row.plans)}</dd><dt>專案屬性</dt><dd>${escape(row.codes.join('／')||'來源未列')}</dd><dt>100MHz</dt><dd>${row.band100==='yes'?'支援':row.band100==='no'?'不支援':'來源未註明'}</dd></dl><p class="promo-note">${escape(row.notes)}</p><button type="button" data-source="${escape(row.sourceId)}">核對原圖 · ${escape(row.sourceRow)}</button></article>`;
      }).join(''):'<p class="promo-empty">沒有符合條件的活動。請調整機款、通路或日期，或勾選包含非活動中項目。</p>';
    }
    async function loadFile(file){
      if(!file)return;const ticket=++epoch;
      if(file.size>12*1024*1024){clear('活動資料檔超過 12MB，未載入。');return;}
      $('message').textContent='正在核對活動資料檔…';
      try{
        const next=Core.normalize(JSON.parse(await file.text()));if(ticket!==epoch)return;
        catalog=next;$('content').hidden=false;$('clear').disabled=false;$('title').textContent=catalog.title;$('version').textContent='版本 '+catalog.version+' · 圖片核對日 '+catalog.reviewDate;
        $('coverage').innerHTML=catalog.coverageNotes.map(note=>`<li>${escape(note)}</li>`).join('');
        $('brand').innerHTML='<option value="">全部品牌</option>'+[...new Set(catalog.rows.map(row=>row.brand))].sort().map(brand=>`<option>${escape(brand)}</option>`).join('');
        $('sources').innerHTML=catalog.sources.map(source=>`<p><button type="button" data-source="${escape(source.id)}">${escape(source.title)}</button><small>${escape(source.fileName)} · SHA-256 ${escape(source.sha256)}</small></p>`).join('');
        $('type').value=defaultType;$('search').value='';$('channel').value='';$('inactive').checked=false;
        $('message').textContent=`已載入 ${catalog.sources.length} 張來源、${catalog.rows.length} 筆活動；資料檔僅保留於本頁記憶體。`;render();
      }catch(error){if(ticket===epoch)clear('未載入：'+error.message);}
    }
    $('file').addEventListener('change',()=>loadFile($('file').files[0]));
    $('clear').addEventListener('click',()=>clear());
    $('more').addEventListener('click',()=>{limit+=12;render();});
    ['search','date'].forEach(name=>$(name).addEventListener('input',render));
    ['type','brand','channel','inactive'].forEach(name=>$(name).addEventListener('change',render));
    $('reset').addEventListener('click',()=>{for(const name of ['search','type','brand','channel'])$(name).value='';$('inactive').checked=false;$('date').value=Core.taipeiDate();render();});
    $('current').addEventListener('click',()=>{const tradeinVisible=!document.getElementById('tradeinPane')?.classList.contains('hidden');const rich=tradeinVisible?document.querySelector('#tradeinReferencePanel:not([hidden])'):null;const input=rich?.querySelector('[data-tref=search]')||document.getElementById(tradeinVisible?'tradeinSearch':'shoppingSearch');$('search').value=input?.value||rich?.querySelector('[data-tref=selected-name]')?.textContent||'';render();$('search').focus();});
    host.addEventListener('click',event=>{const button=event.target.closest('[data-source]');if(button)showSource(button.dataset.source,button);});
    $('close').addEventListener('click',()=>$('dialog').close());
    scope.addEventListener('pagehide',()=>clear());
    scope.addEventListener('north12b:logout',()=>clear());
    // Optional embed is generated only in a private standalone deliverable,
    // never committed to the public repository.
    const embedded=document.getElementById('privatePromotionCatalog');
    if(embedded){const value=embedded.textContent;embedded.remove();loadFile(new File([value],'private-catalog.json',{type:'application/json'}));}
  }
  function init(){const host=document.getElementById('promotionCatalog');if(host&&Core)mount(host);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
