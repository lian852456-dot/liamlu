(function(scope){
  'use strict';
  // Presentation only. Keep the accepted prices, filters and clearing lifecycle unchanged.
  // Each existing item becomes one aligned comparison panel; distinct items are never merged.
  const target=document.getElementById('tradeinResults')||document.getElementById('results');
  if(!target)return;
  const ORDER=['S','A','B','C','未分級'];
  const node=(tag,cls,value)=>{const el=document.createElement(tag);el.className=cls;if(value!=null)el.textContent=value;return el;};
  const grade=value=>String(value||'').includes('未分級')?'未分級':(String(value||'').match(/^\s*([SABC])\s*級?\s*$/)||[])[1];
  function providerLabel(heading){
    const full=heading.textContent;
    const plain=full.replace(/[（(]\s*獨立報價\s*[）)]/g,'').trim();
    const short=/FutureDial|FDI/i.test(plain)?'FDI':plain;
    const original=node('span','tc-sr',full),display=node('span','tc-provider-label',short);
    display.setAttribute('aria-hidden','true');
    heading.replaceChildren(original,display);heading.title=plain;
    heading.classList.add('tc-provider');
  }
  function priceCell(cell,g){
    const value=cell.textContent;
    const match=value.match(/^(.*?)\s*(元)\s*$/);
    if(match){cell.replaceChildren(node('span','tc-number',match[1]),node('span','tc-sr',' 元'));}
    cell.classList.add('tc-cell');cell.dataset.grade=g;
    // No numeric parsing, rounding, currency conversion or zero/missing substitution.
  }
  function enhance(card){
    if(card.dataset.compactVersion)return;
    const external=card.classList.contains('model-card');
    const blocks=Array.from(card.querySelectorAll(external?':scope > .provider-block':':scope > .table-scroll'));
    if(!blocks.length)return;
    const rows=[];
    for(const block of blocks){
      const heading=block.querySelector(external?'.provider-title':'thead tr:first-child th');
      if(!heading)return;
      const cells=[];
      if(external){
        for(const item of block.querySelectorAll('.price-item')){
          const g=grade(item.querySelector('.grade')?.textContent),cell=item.querySelector('strong');
          if(!g||!cell)return;
          cells.push({g,cell});
        }
      }else{
        const headers=Array.from(block.querySelectorAll('thead tr:last-child th')).slice(1);
        const prices=Array.from(block.querySelectorAll('tbody tr:first-child td')).slice(1);
        if(headers.length!==prices.length)return;
        for(let i=0;i<headers.length;i++){
          const g=grade(headers[i].textContent);if(!g)return;cells.push({g,cell:prices[i]});
        }
      }
      if(!cells.length)return;
      rows.push({block,heading,cells});
    }
    const columns=ORDER.filter(g=>rows.some(row=>row.cells.some(cell=>cell.g===g)));
    if(!columns.length)return;
    // Only enhance a completely recognized render, before modifying any original nodes.
    card.dataset.compactVersion='20261012-1';card.classList.add('tc-item');
    const title=card.querySelector('h3');
    if(title){
      const parts=title.textContent.split(/\s*·\s*/);
      if(parts.length===2&&parts[1].toLocaleLowerCase().startsWith(parts[0].toLocaleLowerCase()+' '))title.textContent=parts[1];
    }
    const wrap=node('div','tc-prices'),matrix=node('div','tc-matrix');
    matrix.style.setProperty('--tc-columns',String(columns.length));
    const wide=columns.length>4||rows.some(row=>row.cells.some(({cell})=>cell.textContent.replace(/\s*元\s*$/,'').length>6));
    if(wide){matrix.classList.add('tc-wide');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','回收價比較，可左右滑動');}
    const header=node('div','tc-grade-head');header.setAttribute('aria-hidden','true');
    header.append(node('span','tc-heading-provider','回收商'));
    columns.forEach(g=>header.append(node('span','tc-heading-grade',g==='未分級'?'未分級':g+'級')));
    matrix.append(header);wrap.append(matrix);
    const note=node('p','tc-unit','單位：元；－ 表示該等級未提供報價');
    const first=rows[0].block;
    card.insertBefore(note,first);card.insertBefore(wrap,first);
    for(const {block,heading,cells} of rows){
      block.classList.add('tc-provider-row');providerLabel(heading);
      if(!external){
        const table=block.querySelector('table');table.classList.add('tc-original-table');
        table.setAttribute('aria-label',(title?.textContent||'機款')+' '+heading.title+' 報價');
        block.querySelector('thead tr:last-child').classList.add('tc-original-grades');
        block.querySelector('tbody tr:first-child td').classList.add('tc-repeat-model');
      }
      for(const {g,cell} of cells){priceCell(cell,g);cell.style.gridColumn=String(columns.indexOf(g)+2);}
      const missingParent=external?block.querySelector('.price-grid'):block.querySelector('tbody tr');
      for(const g of columns){
        if(cells.some(cell=>cell.g===g))continue;
        const missing=node(external?'span':'td','tc-cell tc-missing','－');
        missing.dataset.grade=g;missing.style.gridColumn=String(columns.indexOf(g)+2);
        missing.setAttribute('aria-label',g+'級未提供報價');missingParent.append(missing);
      }
      matrix.append(block);
    }
    const source=card.querySelector(':scope > .group-note');
    if(source){const details=node('details','tc-source');details.append(node('summary','','來源資訊'),source);card.append(details);}
    if(wide)card.append(node('p','tc-scroll-tip','左右滑動比較完整等級與金額'));
  }
  function update(){
    target.querySelectorAll('article.provider, article.model-card').forEach(enhance);
  }
  document.body.dataset.tradeinCompact='true';
  // Observe only the result root. Our own nested layout changes cannot trigger a loop.
  const observer=new MutationObserver(update);observer.observe(target,{childList:true});
  update();
})(window);
