(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./readonly-dashboard-core.js'):root.ReadonlyDashboardCore);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.ReadonlyConversionSource=api;
})(typeof globalThis==='object'?globalThis:this,function(core){
  'use strict';
  function parseWorkbook(workbook,XLSX,options){
    const sheet=workbook.Sheets['AQ締結率'];
    if(!sheet)return core.parseWorkbook(workbook,XLSX,options);
    const rows=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:null,blankrows:true});
    let normalized=null;
    for(let r=0;r<rows.length;r++){
      if(!core.STORES.some(store=>store.id===rows[r][3]))continue;
      for(let day=0;day<31;day++){
        const at=c=>XLSX.utils.encode_cell({r,c}),rate=sheet[at(69+day)],n=sheet[at(5+day)],d=sheet[at(37+day)];
        // The reviewed export uses exact text "0" for an observed AQ 0/0 placeholder.
        // Never coerce blanks, other strings, formula caches or the source count cells.
        if(rate?.t==='s'&&rate.v==='0'&&!rate.f&&n?.t==='n'&&n.v===0&&d?.t==='n'&&d.v===0){
          if(!normalized)normalized={...sheet};
          normalized[at(69+day)]={...rate,t:'n',v:0};
        }
      }
    }
    const input=normalized?{...workbook,Sheets:{...workbook.Sheets,'AQ締結率':normalized}}:workbook;
    // The existing parser still verifies dates, layout, all counts, daily rates, TTL and prior period.
    // Output keeps the original numeric counts; zero-denominator rates remain null / —.
    return core.parseWorkbook(input,XLSX,options);
  }
  return Object.freeze({parseWorkbook});
});
