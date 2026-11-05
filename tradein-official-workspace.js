(function(scope){
  'use strict';
  const C=scope.ThreecQueryCore,M=scope.PriceModelView;
  const enabled=document.body.dataset.queryKind==='tradein'&&new URLSearchParams(location.search).get('view')!=='source';
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={'點子行動':'點子','FutureDial（FDI）':'FDI','愛鋒派':'愛鋒派'};
  let current=null,rows=[],page=0,selected=0,basis='',capacity='',grades={},epoch=0;
  const $=id=>document.getElementById(id);
  const price=(row,provider,grade)=>C.priceState(row?.quotes?.[provider]?.[grade]);
  const amount=(row,provider,grade)=>{const q=price(row,provider,grade);return q.missing?null:Number(String(q.value).replace(/,/g,''));};
  const formatted=(row,provider,grade)=>price(row,provider,grade).missing?'—':C.formatPrice(row.quotes[provider][grade]);
  function clear(){epoch++;current=null;rows=[];page=0;selected=0;basis='';capacity='';grades={};document.querySelector('#tradeinOfficialDialog[open]')?.close();}
  function render(view){
    if(!enabled)return false;
    if(!view?.available){clear();return false;}
    epoch++;
    current=view;
    const brand=$('tradeinBrand')?.value||'',query=$('tradeinSearch').value,modelKey=$('tradeinModel').value,provider=$('tradeinProvider').value,grade=$('tradeinGrade').value;
    const nextBasis=JSON.stringify([view.meta.snapshotHash,brand,query,modelKey,provider,grade]);
    if(nextBasis!==basis){page=0;selected=0;capacity='';basis=nextBasis;}
    const scoped=Object.assign({},view.snapshot,{rows:C.rowList(view.snapshot).filter(row=>!brand||M.canonicalBrand(row.brand)===brand)});
    const all=C.filterTradeinByModel(scoped,{query,modelKey,provider,grade});
    const capacities=[...new Set(all.map(row=>M.specification(row).capacity).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    if(!capacities.includes(capacity))capacity='';
    rows=all.filter(row=>!capacity||M.specification(row).capacity===capacity);
    const providers=C.PROVIDERS.filter(p=>(!provider||provider===p)&&rows.some(row=>C.quotedGrades(row,p,grade).length));
    for(const p of providers){const available=C.providerGrades(p).filter(g=>(!grade||g===grade)&&rows.some(row=>!price(row,p,g).missing));if(!available.includes(grades[p]))grades[p]=available.includes('A')?'A':available[0];}
    const pages=Math.max(1,Math.ceil(rows.length/20));page=Math.min(page,pages-1);selected=Math.min(selected,Math.max(0,rows.length-1));
    const chosen=rows[selected],target=$('tradeinResults');target.classList.add('official-workspace','tref');
    const picked=providers.map(p=>({provider:p,grade:grades[p],value:chosen?amount(chosen,p,grades[p]):null}));
    const left=picked.find(q=>q.provider==='點子行動'),right=picked.find(q=>q.provider==='FutureDial（FDI）');
    const difference=left&&right&&Number.isFinite(left.value)&&Number.isFinite(right.value)?(left.value===right.value?'點子／FDI 同價':(left.value>right.value?'點子':'FDI')+' 多 '+Math.abs(left.value-right.value).toLocaleString('en-US')+' 元'):'點子／FDI 所選等級缺價，無法比較';
    target.innerHTML=`<div class="official-tools"><label>容量<select data-oq="capacity"><option value="">全部容量</option>${capacities.map(c=>`<option${c===capacity?' selected':''}>${esc(c)}</option>`).join('')}</select></label>${providers.map(p=>`<label>${esc(labels[p])}分級<select data-oq-grade="${esc(p)}">${C.providerGrades(p).filter(g=>(!grade||g===grade)&&rows.some(row=>!price(row,p,g).missing)).map(g=>`<option value="${esc(g)}"${grades[p]===g?' selected':''}>${esc(C.gradeLabel(g))}</option>`).join('')}</select></label>`).join('')}</div>
      ${chosen?`<section class="tref-summary"><div class="tref-summary-head"><div><h3>${esc(chosen.model)}</h3><p>${esc(chosen.brand)}${chosen.priceVariant?' · 此機款有不同原始報價':''}</p></div><div class="tref-actions"><button type="button" data-oq="copy">複製報價</button><button type="button" data-oq="detail">來源／分級明細</button></div></div><div class="tref-quotes">${picked.map(q=>`<div><span>${esc(labels[q.provider])} ${esc(C.gradeLabel(q.grade))}</span><strong>${esc(formatted(chosen,q.provider,q.grade))}</strong></div>`).join('')}</div><p class="official-difference">${esc(difference)}</p><p data-oq="copy-status" role="status"></p><textarea data-oq="manual-copy" aria-label="手動複製正式參考報價" readonly hidden></textarea></section>`:'<p class="empty">沒有符合搜尋條件的正式機款。</p>'}
      <nav class="tref-detection" aria-label="回收檢測入口"><a href="https://twm.phonedoctorbiz.com/app/download.html" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">點子檢測（需權限）</a><a href="https://smi-wpi.futuredial.com/zh/" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">FDI 手機檢測</a><a href="https://smi-wpi.futuredial.com/pc/" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">FDI Mac／筆電檢測</a></nav>
      <div class="tref-list-top"><p role="status">${rows.length} 組 · 本頁 ${Math.min(20,Math.max(0,rows.length-page*20))} 組</p><div><button data-oq="prev"${page===0?' disabled':''}>上一頁</button><span>${page+1}／${pages} 頁</span><button data-oq="next"${page+1>=pages?' disabled':''}>下一頁</button></div></div>
      <div class="tref-scroll official-price-table" role="region" tabindex="0" aria-label="三家回收價比較"><table><caption class="visually-hidden">正式回收價（元），各家分級獨立</caption><thead><tr><th scope="col">機型／容量</th>${providers.map(p=>`<th scope="col">${esc(labels[p])} ${esc(C.gradeLabel(grades[p]))}</th>`).join('')}</tr></thead><tbody>${rows.slice(page*20,page*20+20).map((row,i)=>`<tr${page*20+i===selected?' class="tref-selected"':''}><th scope="row"><button type="button" data-oq-select="${page*20+i}">${esc(row.model)}</button><small>${esc(row.brand)}${row.priceVariant?' · 不同報價':''}</small></th>${providers.map(p=>`<td data-provider="${esc(p)}" data-grade="${esc(grades[p])}">${esc(formatted(row,p,grades[p]))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <details class="query-secondary-notes official-notes"><summary>資料與完整說明</summary><p>來源日期 ${esc(view.meta.sourceVersionDate||'未提供')}；有效期、料號、商品分類及 Mac 分級定義以來源為準，未提供時不補猜。各家同字母等級不代表相同檢測結果，回收價不含促案加碼。檢測入口另依回收商權限；本頁不傳送客戶或裝置資料、不建立交易。</p><p>完整 S／A／B／C／來源未分級報價，可從上方各家分級切換，或開啟所選機款的來源／分級明細。</p><a href="tradein-query.html?view=source">原始報價卡片</a></details><dialog id="tradeinOfficialDialog" class="tref-dialog" aria-labelledby="tradeinOfficialDialogTitle"><div><h2 id="tradeinOfficialDialogTitle">來源／分級明細</h2><button type="button" data-oq="close">關閉明細</button></div><div data-oq="dialog-body"></div></dialog>`;
    target.querySelector('[data-oq=capacity]').addEventListener('change',e=>{capacity=e.target.value;page=0;selected=0;render(current);});
    target.querySelectorAll('[data-oq-grade]').forEach(select=>select.addEventListener('change',()=>{grades[select.dataset.oqGrade]=select.value;render(current);}));
    target.querySelector('[data-oq=prev]').addEventListener('click',()=>{page--;selected=page*20;render(current);});target.querySelector('[data-oq=next]').addEventListener('click',()=>{page++;selected=page*20;render(current);});
    target.querySelectorAll('[data-oq-select]').forEach(button=>button.addEventListener('click',()=>{selected=Number(button.dataset.oqSelect);render(current);}));
    if(chosen){
      target.querySelector('[data-oq=detail]').addEventListener('click',()=>{
        target.querySelector('[data-oq=dialog-body]').innerHTML=`<p>${esc(chosen.model)}<br>來源日期 ${esc(view.meta.sourceVersionDate||'未提供')}；工作表 ${esc(chosen.sourceSheet||'未提供')}<br>原始機型：${chosen.sourceModels.map(esc).join('／')}<br>有效期及回收料號：正式來源未提供</p><div class="tref-scroll"><table><thead><tr><th>回收商</th><th>分級</th><th>報價</th></tr></thead><tbody>${C.providersForRow(chosen).flatMap(p=>C.quotedGrades(chosen,p,'').map(g=>`<tr><th>${esc(p)}（獨立報價）</th><td>${esc(C.gradeLabel(g))}</td><td>${esc(formatted(chosen,p,g))}</td></tr>`)).join('')}</tbody></table></div>`;
        $('tradeinOfficialDialog').showModal();target.querySelector('[data-oq=close]').focus();
      });
      target.querySelector('[data-oq=copy]').addEventListener('click',async()=>{
        const message=['【舊換新參考報價】',chosen.model,...picked.map(q=>q.provider+' '+C.gradeLabel(q.grade)+'：'+formatted(chosen,q.provider,q.grade)),difference,'來源日期：'+(view.meta.sourceVersionDate||'未提供'),'有效期：正式來源未提供','版本：'+view.meta.snapshotHash,'各家等級以實際檢測為準；不含促案加碼，非成交承諾。'].join('\n');
        const ticket=epoch;
        try{await navigator.clipboard.writeText(message);if(ticket===epoch)target.querySelector('[data-oq=copy-status]').textContent='已複製報價。';}
        catch{if(ticket!==epoch)return;const area=target.querySelector('[data-oq=manual-copy]');area.hidden=false;area.value=message;area.focus();area.select();target.querySelector('[data-oq=copy-status]').textContent='請複製下方已選取文字。';}
      });
    }
    target.querySelector('[data-oq=close]').addEventListener('click',()=>$('tradeinOfficialDialog').close());
    $('tradeinOfficialDialog').addEventListener('close',()=>target.querySelector('[data-oq=detail]')?.focus());
    return true;
  }
  scope.TradeinOfficialWorkspace=Object.freeze({render,clear});
})(window);
