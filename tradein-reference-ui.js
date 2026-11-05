(function(scope){
  'use strict';
  const C=scope.TradeinReferenceCore;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function init(){
    const pane=document.getElementById('tradeinPane');if(!pane||!C)return;
    const legacy=document.createElement('div');legacy.className='tref-legacy';while(pane.firstChild)legacy.append(pane.firstChild);pane.append(legacy);
    const host=document.createElement('section');host.className='tref';host.id='tradeinReferencePanel';host.hidden=true;pane.prepend(host);
    let catalog=null,filtered=[],selectedId='',page=0,variant='',epoch=0,previousFocus=null;
    const $=name=>host.querySelector(`[data-tref="${name}"]`);
    const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    function clear(){epoch++;catalog=null;filtered=[];selectedId='';variant='';if($('dialog')?.open)$('dialog').close();host.replaceChildren();host.hidden=true;legacy.hidden=false;}
    function selected(){return catalog?.devices.find(d=>d.id===selectedId);}
    function values(name){return [...$(name).selectedOptions].map(o=>o.value).filter(Boolean);}
    function filters(){return {search:$('search').value,brand:$('brand').value,category:$('category').value,models:values('models'),capacities:values('capacities')};}
    function gradeD(){return $('grade-d').value;}
    function gradeF(){return $('grade-f').value;}
    function optionList(name,values,placeholder,multi=false){
      const prior=multi?new Set([...$(name).selectedOptions].map(o=>o.value)):new Set([$(name).value]);
      $(name).innerHTML=(multi?'':`<option value="">${esc(placeholder)}</option>`)+values.map(v=>`<option value="${esc(v)}"${prior.has(v)?' selected':''}>${esc(v)}</option>`).join('');
    }
    const unique=values=>[...new Set(values)].sort((a,b)=>a.localeCompare(b,'zh-Hant',{numeric:true}));
    function updateOptions(){
      const f=filters(),base=catalog.devices.filter(d=>C.matches(d,{search:f.search,brand:f.brand,category:f.category}));
      optionList('models',unique(base.map(d=>d.model)),'',true);
      const models=values('models');optionList('capacities',unique(base.filter(d=>!models.length||models.includes(d.model)).map(d=>d.capacity)),'',true);
      $('model-count').textContent=models.length?'已選 '+models.length+' 型號':'全部型號';$('capacity-count').textContent=values('capacities').length?'已選 '+values('capacities').length+' 容量／規格':'全部容量／規格';
    }
    function quoteCell(d,vendor,grade){const q=C.quote(d,vendor,grade);return `<td class="${(vendor==='dianzi'?gradeD():gradeF())===grade?'tref-grade-current ':''}${q.kind!=='price'?'tref-unpriced':''}">${esc(q.text)}</td>`;}
    function render(){
      if(!catalog)return;
      const queryDate=$('date').value;if(!/^20\d{2}-\d{2}-\d{2}$/.test(queryDate)||!Number.isFinite(Date.parse(queryDate+'T00:00:00Z'))){$('copy').disabled=true;$('detail').disabled=true;$('period').textContent='請先填入有效核對日期；目前不能複製報價。';$('period').className='tref-period unknown';return;}
      filtered=C.rows(catalog,filters(),gradeD(),gradeF(),$('sort').value);
      if(!filtered.some(d=>d.id===selectedId)){selectedId=filtered[0]?.id||'';variant='';}
      const d=selected(),onlyMac=$('category').value==='Mac'||d?.category==='Mac';
      $('grade-d').disabled=$('category').value==='Mac';$('grade-f').querySelector('[value="S"]').disabled=onlyMac;
      if(onlyMac&&gradeF()==='S'){$('grade-f').value='A';filtered=C.rows(catalog,filters(),gradeD(),gradeF(),$('sort').value);}
      const pages=Math.max(1,Math.ceil(filtered.length/20));page=Math.min(page,pages-1);
      $('count').textContent=`${filtered.length} 組 · 本頁 ${Math.min(20,Math.max(0,filtered.length-page*20))} 組`;
      $('page').textContent=`${page+1}／${pages} 頁`;$('prev').disabled=page===0;$('next').disabled=page+1>=pages;
      const mac=$('category').value==='Mac';
      $('table').innerHTML=`<table><caption>回收價（元）</caption><thead><tr><th scope="col">機型／容量</th>${mac?'':['A','B','C'].map(g=>`<th scope="col" class="${gradeD()===g?'tref-grade-current':''}">點子 ${g}等</th>`).join('')}${(mac?['A','B','C']:['S','A','B','C']).map(g=>`<th scope="col" class="${gradeF()===g?'tref-grade-current':''}">FDI ${g}等</th>`).join('')}<th scope="col">價差</th><th scope="col">明細</th></tr></thead><tbody>`+
        filtered.slice(page*20,page*20+20).map(d=>`<tr data-device="${esc(d.id)}" class="${d.id===selectedId?'tref-selected':''}"><th scope="row"><button type="button" data-select="${esc(d.id)}">${esc(d.model)}</button><small>${esc(d.brand)} · ${esc(d.capacity)}${C.validity(d,$('date').value).state==='expired'?' · 已過期':''}</small></th>${mac?'':['A','B','C'].map(g=>quoteCell(d,'dianzi',g)).join('')}${(mac?['A','B','C']:['S','A','B','C']).map(g=>quoteCell(d,'fdi',g)).join('')}<td>${esc(C.compare(d,gradeD(),gradeF()).text)}</td><td><button type="button" data-details="${esc(d.id)}">料號／分級</button></td></tr>`).join('')+`</tbody></table>${filtered.length?'':'<p class="tref-empty">沒有符合的機款，請重設或調整篩選。</p>'}`;
      summary();
    }
    function summary(){
      const d=selected();$('copy').disabled=!d;$('detail').disabled=!d;$('copy-status').textContent='';$('manual-copy').hidden=true;$('manual-copy').value='';
      if(!d){$('selected-name').textContent='選擇機款開始比價';$('selected-spec').textContent='';$('quotes').replaceChildren();$('period').textContent='';$('variant').innerHTML='';return;}
      const old=variant;optionList('variant',[], '全部色款／料號');$('variant').innerHTML='<option value="">全部色款／料號</option>'+d.variants.map(v=>`<option value="${v.id}">${esc(v.rawModel)}</option>`).join('');
      variant=d.variants.some(v=>v.id===old)?old:'';$('variant').value=variant;
      const c=C.compare(d,gradeD(),gradeF(),variant),valid=C.validity(d,$('date').value);
      $('selected-name').textContent=d.model;$('selected-spec').textContent=d.capacity+(d.category==='Mac'?' · '+C.specText(d):'');
      $('quotes').innerHTML=(d.category==='Mac'?'':`<div><span>點子 ${esc(gradeD())}</span><strong>${esc(c.dianzi.text)}</strong></div>`)+`<div><span>FDI ${esc(gradeF())}</span><strong>${esc(c.fdi.text)}</strong></div><div class="tref-difference"><span>價差</span><strong>${esc(c.text)}</strong></div>`;
      $('period').className='tref-period '+valid.state;$('period').textContent=(valid.state==='active'?'有效期':valid.text)+'｜'+d.sourceDate+'～'+(d.validThrough||'未提供');
      $('phone-links').hidden=d.category==='Mac';$('mac-links').hidden=d.category!=='Mac';
      $('phone-entry-note').hidden=d.category==='Mac';$('mac-entry-note').hidden=d.category!=='Mac';
    }
    function detail(id,trigger){
      if(id!==selectedId){selectedId=id;variant='';render();}
      const d=selected();if(!d)return;previousFocus=trigger;$('dialog-title').textContent=d.model+' '+d.capacity;
      const source=`<p>來源：${esc(d.sourceFile)}／${esc(d.sourceSheet||'頁籤未提供')}；${esc(d.sourceDate)}～${esc(d.validThrough||'有效期未提供')}<br>${esc(C.validity(d,$('date').value).text)}。來源0值為待確認，不能認定零元收購。</p>`;
      const spec=d.category==='Mac'?`<p><strong>${esc(C.specText(d))}</strong></p><h3>Mac 分級條件</h3>${['A','B','C'].map(g=>`<section class="tref-grade-definition"><h4>FDI ${g}等</h4><p>${esc(d.gradeDefinitions[g]||'來源未提供分級條件')}</p></section>`).join('')}`:'';
      const variants=variant===''?d.variants:d.variants.filter(v=>v.id===variant);
      const rows=variants.flatMap(v=>v.items.map(i=>`<tr><td>${esc(i.row??'未提供')}</td><td>${esc(v.rawModel)}<small>${esc(i.name)}</small></td><td>${esc(C.VENDORS[i.vendor])}</td><td>${esc(i.grade)}</td><td>${esc(i.part||'未提供')}</td><td>${esc(i.price===0?'待確認（來源為0）':i.price===null?'未提供報價':i.price.toLocaleString('en-US')+' 元')}</td></tr>`)).join('');
      $('dialog-body').innerHTML=source+spec+`<h3>原始色款、回收料號及報價</h3><div class="tref-scroll" tabindex="0"><table><thead><tr><th>來源列（HTML內嵌）</th><th>原始機款／顏色</th><th>回收商</th><th>等級</th><th>回收料號</th><th>參考報價</th></tr></thead><tbody>${rows}</tbody></table></div>`;
      $('dialog').showModal();$('close').focus();
    }
    async function copy(){
      const d=selected();if(!d)return;const ticket=epoch,basis=JSON.stringify([d.id,gradeD(),gradeF(),variant,$('date').value]),message=C.quoteText(d,gradeD(),gradeF(),variant,$('date').value);
      const stillCurrent=()=>ticket===epoch&&catalog&&basis===JSON.stringify([selectedId,gradeD(),gradeF(),variant,$('date').value]);
      try{if(!navigator.clipboard?.writeText)throw new Error();await navigator.clipboard.writeText(message);if(stillCurrent())$('copy-status').textContent='已複製參考報價（含來源、有效期及分級提醒）。';}
      catch{if(!stillCurrent())return;$('manual-copy').value=message;$('manual-copy').hidden=false;$('manual-copy').focus();$('manual-copy').select();let done=false;try{done=document.execCommand('copy');}catch{}$('copy-status').textContent=done?'已複製參考報價。':'瀏覽器未允許自動複製；請複製下方已選取文字。';}
    }
    function mount(next){
      clear();catalog=next;host.hidden=false;legacy.hidden=true;page=0;
      host.innerHTML=`<div class="tref-top"><div><h2>舊換新查價</h2></div><label>核對日期<input data-tref="date" type="date" value="${today()}"></label></div>
      <div class="tref-layout"><aside class="tref-filters" aria-label="回收價篩選"><label class="tref-search">搜尋機型／容量<input data-tref="search" type="search" placeholder="例如：iphone13 mini、Mac M1" autocomplete="off"></label><div class="tref-filter-pair"><label>商品分類<select data-tref="category"><option value="">全部商品</option></select></label><label>品牌<select data-tref="brand"><option value="">全部品牌</option></select></label></div>
      <details class="tref-multi"><summary data-tref="model-count">全部型號</summary><label>型號<select data-tref="models" multiple size="5"></select></label></details><details class="tref-multi"><summary data-tref="capacity-count">全部容量／規格</summary><label>容量／規格<select data-tref="capacities" multiple size="4"></select></label></details>
      <div class="tref-filter-pair"><label>點子分級<select data-tref="grade-d"><option>A</option><option>B</option><option>C</option></select></label><label>FDI 分級<select data-tref="grade-f"><option value="S">S</option><option value="A" selected>A</option><option value="B">B</option><option value="C">C</option></select></label></div><label>排序<select data-tref="sort"><option value="model">機型名稱</option><option value="difference">所選分級價差大至小</option><option value="highest">所選分級最高報價</option></select></label><button type="button" data-tref="reset">重設篩選</button>
      </aside>
      <div class="tref-main"><section class="tref-summary"><div class="tref-summary-head"><div><h3 data-tref="selected-name"></h3><p data-tref="selected-spec"></p></div><div class="tref-actions"><button data-tref="copy" type="button">複製報價</button><button data-tref="detail" type="button">料號／分級明細</button></div></div><label class="tref-variant-label">色款／料號<select data-tref="variant"></select></label><div data-tref="quotes" class="tref-quotes"></div><p data-tref="period" class="tref-period"></p><p data-tref="copy-status" role="status"></p><textarea data-tref="manual-copy" readonly rows="8" aria-label="手動複製參考報價" hidden></textarea></section>
      <section class="tref-detection" aria-label="回收檢測入口"><div data-tref="phone-links"><a href="${C.LINKS.dianzi}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">點子檢測（需權限）</a><a href="${C.LINKS.fdiPhone}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">FDI 手機檢測</a></div><div data-tref="mac-links" hidden><a href="${C.LINKS.fdiMac}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">FDI Mac／筆電檢測</a></div></section>
      <div class="tref-list-top"><p data-tref="count" role="status"></p><div><button data-tref="prev" type="button">上一頁</button><span data-tref="page"></span><button data-tref="next" type="button">下一頁</button></div></div><div data-tref="table" class="tref-scroll" tabindex="0" role="region" aria-label="回收價比較表，可左右滑動"></div>
      <details class="tref-notes query-secondary-notes"><summary>資料與說明</summary><p class="tref-grade-note">兩家同字母等級不代表相同檢測結果；未報價、來源為0或色款價格不一時，不計算確定價差。點子行動（愛鋒派）／FDI 各自依檢測分級。</p><p>回收價不含舊換新促案加碼及 POS。型號與容量可複選；不選為全部。</p><p data-tref="phone-entry-note">11/5核對：點子入口回401，需確認通路權限；FDI入口可連線，檢測資格須於回收商頁面核對。</p><p data-tref="mac-entry-note" hidden>11/5核對：原筆電專用入口轉至同一FDI入口頁，完成登入後須確認筆電流程。</p><p>僅在你點選後開啟回收商網站；本頁不傳送客戶、員編、裝置序號或報價資料，不建立回收交易。</p><details class="tref-source"><summary>來源資料</summary><div data-tref="source"></div></details><details data-tref="qr-section" hidden><summary>點子檢測 App QR code</summary><img data-tref="qr" alt="原站點子檢測App QR code"></details></details></div></div>
      <dialog data-tref="dialog" class="tref-dialog" aria-labelledby="tradeinReferenceDialogTitle"><div><h2 id="tradeinReferenceDialogTitle" data-tref="dialog-title"></h2><button data-tref="close" type="button">關閉明細</button></div><div data-tref="dialog-body"></div></dialog>`;
      const aside=host.querySelector('.tref-filters'),advanced=document.createElement('details');advanced.className='tref-advanced';advanced.open=!scope.matchMedia('(max-width:800px)').matches;advanced.innerHTML='<summary>分級、型號、容量與排序</summary>';
      for(const child of [...aside.children].slice(2))advanced.append(child);aside.append(advanced);
      optionList('brand',unique(catalog.devices.map(d=>d.brand)),'全部品牌');optionList('category',unique(catalog.devices.map(d=>d.category)),'全部商品');
      $('source').innerHTML=catalog.sources.map(s=>`<p>${esc(s.file)}<br>${esc(s.date)}～${esc(s.validThrough)}<small>頁籤：${esc(s.sheet||'未提供')}<br>來源宣告 SHA-256（未取得原始Excel核驗）：${esc(s.sha256||'來源未提供')}</small></p>`).join('')||`<p>${esc(catalog.source.file)}<br>來源日：${esc(catalog.source.date)}；有效期未提供。</p>`;
      if(catalog.qr){$('qr').src=catalog.qr;$('qr-section').hidden=false;}
      ['brand','category','models','capacities'].forEach(name=>$(name).addEventListener('change',()=>{page=0;variant='';updateOptions();render();}));
      $('search').addEventListener('input',()=>{page=0;variant='';updateOptions();render();});
      ['grade-d','grade-f','sort'].forEach(name=>$(name).addEventListener('change',()=>{page=0;render();}));
      $('date').addEventListener('input',render);
      $('variant').addEventListener('change',()=>{variant=$('variant').value;summary();});
      $('reset').addEventListener('click',()=>{['search','brand','category'].forEach(n=>$(n).value='');for(const n of ['models','capacities'])for(const o of $(n).options)o.selected=false;$('grade-d').value='A';$('grade-f').value='A';$('sort').value='model';page=0;variant='';updateOptions();render();});
      $('prev').addEventListener('click',()=>{page--;render();});$('next').addEventListener('click',()=>{page++;render();});$('copy').addEventListener('click',copy);$('detail').addEventListener('click',()=>detail(selectedId,$('detail')));
      $('table').addEventListener('click',e=>{const pick=e.target.closest('[data-select]'),open=e.target.closest('[data-details]');if(pick){selectedId=pick.dataset.select;variant='';render();[...$('table').querySelectorAll('[data-select]')].find(button=>button.dataset.select===selectedId)?.focus();}if(open)detail(open.dataset.details,open);});
      $('close').addEventListener('click',()=>$('dialog').close());$('dialog').addEventListener('close',()=>{if(previousFocus?.isConnected)previousFocus.focus();else $('detail').focus();});
      updateOptions();render();
    }
    scope.addEventListener('quote-reference:load',e=>{if(e.detail?.tradein?.referenceCatalog)mount(e.detail.tradein.referenceCatalog);else clear();});
    scope.addEventListener('quote-reference:reset',clear);document.getElementById('refreshBtn')?.addEventListener('click',clear);scope.addEventListener('pagehide',clear);scope.addEventListener('north12b:logout',clear);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
