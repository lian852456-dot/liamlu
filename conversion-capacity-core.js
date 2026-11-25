(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.ConversionCapacity = api;
})(globalThis, function () {
  'use strict';
  const demand = (ok, message) => { if (!ok) throw Error(message); };
  const clean = v => String(v ?? '').replace(/\s+/g, '');
  const iso = date => date.toISOString().slice(0, 10);
  function read(book, X, kind, stores) {
    const sheet = book.Sheets[kind + '量能'];
    demand(sheet, '找不到「' + kind + '量能」分頁，請核對所選檔案。');
    const rows = X.utils.sheet_to_json(sheet, {header:1, raw:true, blankrows:true, defval:null});
    const group = rows[1] || [], header = rows[2] || [];
    const at = label => group.findIndex(v => clean(v) === label);
    const current = at('本月'), prior = group.findIndex(v => clean(v).startsWith('上月同期'));
    demand(current >= 0 && prior > current && clean(header[current]) === '實際數' &&
      clean(header[current+1]) === '點數TTL' && clean(header[prior]) === '實際數', '量能欄位版型不符。');
    const target = header.findIndex((v,i) => i >= current && i < prior && clean(v) === '目標');
    const week = at('WoW') + 1;
    demand(target >= 0 && week > 0, '缺少量能目標或逐日欄。');
    const serial = group[week];
    demand(Number.isInteger(serial) && serial > 40000 && serial < 90000, '量能截止日期無法核對。');
    const date = new Date(Date.UTC(1899,11,30) + serial * 86400000);
    const day = date.getUTCDate(), month = date.getUTCMonth()+1;
    demand(clean(group[prior]).replace(/～/g,'~')==='上月同期(~'+day+'日)', '量能上月同期截止不符。');
    demand(clean(header[0]) === month+'/1~'+month+'/'+day, '量能統計區間與逐日欄不符。');
    const days = Math.min(14,day);
    for (let i=0;i<days;i++) demand(group[week+i]===serial-i && header[week+i]===serial-i, '量能日期欄不連續。');
    const numeric = (r,i,integer=false) => {
      const v = r[i];
      demand(Number.isFinite(v) && v>=0 && (!integer || Number.isSafeInteger(v)), '量能實績、目標或逐日欄缺值／格式異常。');
      return v;
    };
    function extract(row) {
      const daily=Array.from({length:days},(_,i)=>numeric(row,week+i,true));
      return {actual:numeric(row,current,true),points:numeric(row,current+1),target:numeric(row,target),
        prior:numeric(row,prior,true),recent:daily.slice(0,7).reduce((a,b)=>a+b,0),
        previous:days===14 ? daily.slice(7).reduce((a,b)=>a+b,0) : null};
    }
    const district=rows.filter(r=>r[0]==='北一二B'&&r[1]==='北一二B');
    const storeRows=rows.filter(r=>r[0]==='北一二B'&&r[1]!=='北一二B');
    demand(district.length===1 && storeRows.length===stores.length, '九店或區合計列不完整。');
    const entries=stores.map(s=>{
      const matched=storeRows.filter(r=>r[1]===s.id && clean(r[2])===clean(s.name));
      demand(matched.length===1, s.short+' 店碼或店名無法核對。');
      return {id:s.id,name:s.short,...extract(matched[0])};
    });
    const total=extract(district[0]);
    for(const key of Object.keys(total)){
      if(total[key]!==null) demand(Math.abs(entries.reduce((n,r)=>n+r[key],0)-total[key])<0.0001, '量能九店加總與區合計不符。');
    }
    return {kind,cutoff:iso(date),day,monthDays:new Date(Date.UTC(date.getUTCFullYear(),month,0)).getUTCDate(),
      entries:[{id:'all',name:'北一二B',...total},...entries]};
  }
  function reminder(report, row, conversion) {
    const gap=Math.max(0,row.target-row.points),left=report.monthDays-report.day;
    const daily=left ? gap/left : null;
    const lines=[];
    const fmt=n=>n.toLocaleString('zh-TW',{maximumFractionDigits:2});
    if (!row.target) lines.push('月目標為 0，請確認是否適用。');
    else if(!gap) lines.push('月點數已達標。');
    else if(!left) lines.push('已結月，尚差 '+fmt(gap)+' 點。');
    else if(daily>row.points/report.day) lines.push('日需高於本月日均 '+fmt(row.points/report.day)+' 點。');
    else lines.push('維持本月點數節奏可達標。');
    if(row.previous!==null) lines.push('近七日上線 '+row.previous+' → '+row.recent+' 件。');
    let rate=null;
    if(conversion && conversion.cutoff===report.cutoff) {
      const prefix=report.kind.toLowerCase(), rows=conversion.records.filter(r=>row.id==='all'||r.store===row.id);
      const tally=rs=>rs.reduce((o,r)=>[o[0]+r[prefix+'_n'],o[1]+r[prefix+'_d']],[0,0]);
      const [n,d]=tally(rows);rate=d?n/d:null;
      if(report.day>=14) {
        const period=(a,b)=>rows.filter(r=>{const day=Number(r.date.slice(-2));return day>=a&&day<=b;});
        const [pn,pd]=tally(period(report.day-13,report.day-7)),[cn,cd]=tally(period(report.day-6,report.day));
        lines.push('近七日來客 '+pd+' → '+cd+'。');
        if(pd && cd){
          const delta=(cn/cd-pn/pd)*100;
          lines.push('締結率 '+(delta>0?'+':'')+delta.toFixed(1)+' 個百分點。');
          if(gap && cd<pd) lines.push('優先追蹤回店預約。');
          if(gap && delta<0) lines.push('複盤已來店未締結案件。');
        }else lines.push('週分母為零，無法比較締結率。');
      }
    }
    return {gap,daily,rate,text:lines.join(' ')};
  }
  return {read,reminder};
});
