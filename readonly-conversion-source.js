(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./readonly-dashboard-core.js'):root.ReadonlyDashboardCore,
    node?require('./store-renewal-evidence.js'):root.StoreRenewalEvidence);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ReadonlyConversionSource=api;
})(typeof globalThis==='object'?globalThis:this,function(core,evidence){
  'use strict';
  const summarySheets=['AQ締結率','RT每日','RT締結率','樞紐'];
  const analysisSheets=['Tier觀察','RT用戶進店行為_店','未續約明細','續約率(分母)'];
  const normalizeSheet=name=>name.normalize('NFKC').replace(/[\s\u200B-\u200D\u2060]+/g,'');
  function readSource(bytes,XLSX,type){
    const names=XLSX.read(bytes,{type,bookSheets:true}).SheetNames;
    return XLSX.read(bytes,{type,bookVBA:false,sheets:names.filter(name=>
      summarySheets.includes(name)||analysisSheets.includes(normalizeSheet(name)))});
  }
  function parseEvidence(workbook,XLSX,source,{supplement=false}={}){
    const names=Object.keys(workbook.Sheets).map(normalizeSheet);
    if(supplement&&!names.some(name=>['RT用戶進店行為_店','未續約明細','續約率(分母)'].includes(name)))
      throw Error('補充檔案沒有門市 Tier、未續約明細或續約率(分母)');
    if(!names.some(name=>['RT用戶進店行為_店','未續約明細','續約率(分母)'].includes(name)))return null;
    return evidence.parse(workbook,XLSX,source);
  }
  function parseWorkbook(workbook,XLSX,options){
    const includePrior=Boolean(workbook.Sheets['樞紐']);
    const parseOptions={...options,allowMissingRtRate:true,includePrior};
    const sheet=workbook.Sheets['AQ締結率'];
    if(!sheet)return core.parseWorkbook(workbook,XLSX,parseOptions);
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null,blankrows:true});
    const layout=core.aqLayout(rows,{includePrior});
    let normalized=null;
    for(let r=0;r<rows.length;r++){
      if(!core.STORES.some(store=>store.id===rows[r][3]))continue;
      for(let day=0;day<layout.days;day++){
        const at=c=>XLSX.utils.encode_cell({r,c}),rate=sheet[at(layout.rate+day)],n=sheet[at(layout.n+day)],d=sheet[at(layout.d+day)];
        // The reviewed export uses exact text "0" for an observed AQ 0/0 placeholder.
        // Never coerce blanks, other strings, formula caches or the source count cells.
        if(rate?.t==='s'&&rate.v==='0'&&!rate.f&&n?.t==='n'&&n.v===0&&d?.t==='n'&&d.v===0){
          if(!normalized)normalized={...sheet};
          normalized[at(layout.rate+day)]={...rate,t:'n',v:0};
        }
      }
    }
    const input=normalized?{...workbook,Sheets:{...workbook.Sheets,'AQ締結率':normalized}}:workbook;
    // The existing parser still verifies dates, layout, all counts, daily rates, TTL and prior period.
    // Output keeps the original numeric counts; zero-denominator rates remain null / —.
    return core.parseWorkbook(input,XLSX,parseOptions);
  }
  return Object.freeze({parseWorkbook,readSource,parseEvidence});
});
