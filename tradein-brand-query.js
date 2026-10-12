(function(scope){
  'use strict';
  // Page-scoped adapter: reuse the existing price renderer and read-only transport.
  // The shopping page and the independently deployed public share site do not load this file.
  const core=scope.ThreecQueryCore;
  const brand=document.getElementById('tradeinBrand');
  const model=document.getElementById('tradeinModel');
  if(!core||!brand||!model||document.body.dataset.queryKind!=='tradein')return;
  const clean=value=>value==null?'':String(value).trim();
  // Normalize only the Samsung filter identity; source rows and model keys stay exact.
  const canonicalBrand=value=>{const label=clean(value);return /^samsung$/i.test(label)?'Samsung':label;};
  let activeSnapshot=null;

  function fill(select,choices,prompt,selected){
    const fragment=document.createDocumentFragment();
    fragment.append(new Option(prompt,''));
    choices.forEach(choice=>fragment.append(new Option(choice.label,choice.value)));
    select.replaceChildren(fragment);
    select.value=choices.some(choice=>choice.value===selected)?selected:'';
  }
  function clear(){
    activeSnapshot=null;
    fill(brand,[],'全部廠牌','');
    fill(model,[],'全部機款','');
    brand.disabled=true;
  }
  function buildView(kind,response,filters){
    if(kind!=='tradein')return core.buildView(kind,response,filters);
    const source=response&&response.snapshot;
    if(!source){clear();return core.buildView(kind,response,filters);}
    // Options come from all quoted rows, not the first displayed page or the current keyword.
    if(source!==activeSnapshot){
      const selected=canonicalBrand(brand.value);
      const brands=Array.from(new Set(core.filterTradein(source,{}).map(row=>canonicalBrand(row.brand)).filter(Boolean)))
        .sort((a,b)=>a.localeCompare(b,'zh-Hant'));
      fill(brand,brands.map(value=>({value,label:value})),'全部廠牌',selected);
      brand.disabled=false;
      activeSnapshot=source;
    }
    const selectedBrand=canonicalBrand(brand.value);
    const scopedRows=core.rowList(source).filter(row=>!selectedBrand||canonicalBrand(row.brand)===selectedBrand);
    // Build a view-only projection without changing the official snapshot or source metadata.
    const scopedSnapshot=Object.assign({},source,{rows:scopedRows});
    const choices=core.modelOptions(scopedSnapshot,'tradein');
    fill(model,choices,'全部機款',model.value);
    const scopedResponse=Object.assign({},response,{snapshot:scopedSnapshot});
    const scopedFilters=Object.assign({},filters,{modelKey:model.value});
    const view=core.buildView(kind,scopedResponse,scopedFilters);
    return Object.assign({},view,{
      snapshot:source,
      meta:core.sourceMeta(source,response.registry||{},'tradein')
    });
  }
  // This adapter is installed before threec-query-ui.js captures its Core reference.
  // The original frozen core and its price/grade rules remain unchanged.
  scope.ThreecQueryCore=Object.freeze(Object.assign({},core,{buildView}));
  brand.addEventListener('change',()=>model.dispatchEvent(new Event('change',{bubbles:true})));
  // The existing renderer skips buildView while clearing an absent response.
  // Clear dependent options before refresh and on leave so old catalogs cannot linger.
  document.getElementById('refreshBtn').addEventListener('click',clear,true);
  scope.addEventListener('pagehide',clear);
  clear();
})(window);
