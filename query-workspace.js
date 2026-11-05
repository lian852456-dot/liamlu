(function(scope){
  'use strict';
  function init(){
    const card=document.getElementById('queryCard'),pane=document.getElementById('shoppingPane');if(!card||!pane)return;
    let arranged=false;
    function arrange(response){
      document.body.classList.add('query-workspace');
      if(!arranged){
        arranged=true;
        const main=document.querySelector('main'),resources=document.createElement('section');resources.id='queryResources';resources.setAttribute('aria-label','活動及來源資料');card.after(resources);
        for(const id of ['promotionCatalog','quoteReference']){const el=document.getElementById(id);if(el)resources.append(el);}
        const layout=document.createElement('div');layout.className='query-shopping-layout';
        const aside=document.createElement('aside');aside.className='query-shopping-filters';aside.setAttribute('aria-label','手機價格篩選');
        const results=document.createElement('div');results.className='query-shopping-quotes';
        const toolbar=pane.querySelector('.shopping-toolbar'),extra=document.createElement('details'),specs=document.createElement('div');extra.className='query-extra-filters';extra.open=!scope.matchMedia('(max-width:800px)').matches;
        extra.innerHTML='<summary>品牌、機款、容量與資費篩選</summary>';specs.className='query-spec-filters';
        for(const field of [...toolbar.children])if(!field.classList.contains('search-field'))specs.append(field);
        extra.append(specs);const plan=pane.querySelector('.filter-details');if(plan)extra.append(plan);
        aside.append(toolbar,extra);const shortcuts=pane.querySelector('.shortcut-bar');if(shortcuts)aside.append(shortcuts);
        const description=document.getElementById('shoppingSectionDescription');if(description)aside.append(description);
        for(const selector of ['.comparison-toolbar','#cardConditionField','#shoppingResults','.comparison-pagination']){const el=pane.querySelector(selector);if(el)results.append(el);}
        layout.append(aside,results);pane.append(layout);
        const legacy=document.querySelector('#tradeinPane .tref-legacy');
        if(legacy&&document.body.dataset.queryKind==='tradein'&&new URLSearchParams(location.search).get('view')!=='source'){
          const layout=document.createElement('div'),filters=document.createElement('aside');layout.className='query-tradein-layout';filters.className='query-tradein-filters';filters.setAttribute('aria-label','舊換新篩選');
          const toolbars=[...legacy.querySelectorAll(':scope>.toolbar')],advanced=document.createElement('details');advanced.className='query-tradein-advanced';advanced.open=!scope.matchMedia('(max-width:800px)').matches;advanced.innerHTML='<summary>品牌、機款與報價篩選</summary>';
          toolbars.forEach((toolbar,i)=>(i?advanced:filters).append(toolbar));filters.append(advanced);
          const results=document.getElementById('tradeinResults');layout.append(filters,results);legacy.append(layout);
        }
        const meta=document.getElementById('shoppingMeta');if(meta){const details=document.createElement('details');details.className='query-price-source';details.innerHTML='<summary>手機價格來源及完整版本</summary>';details.append(meta);resources.append(details);}
        if(document.body.dataset.priceMode!=='reference'){const meta=document.getElementById('tradeinMeta');if(meta){const details=document.createElement('details');details.className='query-tradein-source';details.innerHTML='<summary>舊換新資料與說明</summary><p>金額單位：元；－表示未提供該等級報價。正式來源未提供的有效期、料號或分級定義不補猜；參考HTML仍可另外載入核對。</p>';details.append(meta);resources.append(details);}}
        const history=document.getElementById('changeCard');if(history){const details=document.createElement('details');details.className='query-history';details.open=new URLSearchParams(location.search).get('view')==='source';details.innerHTML='<summary>本次異動與版本檢查</summary>';details.append(history);resources.append(details);}
        for(const link of document.querySelectorAll('a[href="#promotionCatalog"]'))link.addEventListener('click',()=>{const el=document.getElementById('promotionCatalog');if(el)el.open=true;});
        document.getElementById('tableModeBtn')?.click();
        scope.dispatchEvent(new Event('query-workspace:ready'));
      }
      if(!response?.shopping?.localReference)return;
      const sourceDate=response.shopping?.snapshot?.source_version_date||'來源日未提供';
      const periods=response.tradein?.validThrough?.map(x=>`${/\(Mac\)/i.test(x.file)?'Mac':'手機／平板'} ${x.date}～${x.validThrough}`).join('；');
      const status=document.getElementById('queryStatus');status.textContent='本機參考｜手機價 '+sourceDate+'；回收價 '+(periods||'有效期待確認')+'。資料未同步正式站。';status.classList.add('query-status-ready');
      const title=card.querySelector('.topbar h2');if(title)title.textContent='手機／舊機回收查價';
    }
    scope.addEventListener('quote-reference:load',e=>{if(e.detail?.shopping?.localReference)arrange(e.detail);});
    setTimeout(()=>arrange(),0);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
