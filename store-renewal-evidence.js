(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./readonly-dashboard-core.js'):root.ReadonlyDashboardCore,node?require('./readonly-renewal-detail.js'):root.ReadonlyRenewalDetail);
  if(node)module.exports=api;else root.StoreRenewalEvidence=api;
})(globalThis,function(Core,Detail){
  'use strict';
  const ids=new Set(Core.STORES.map(store=>store.id));
  const norm=v=>String(v??'').normalize('NFKC').replace(/\s+/g,'');
  function requireValue(ok,message){if(!ok)throw Error(message);}
  function iso(v){return typeof v==='string'&&/^20\d\d-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;}
  function date(v){
    if(Number.isSafeInteger(v)&&v>=40000&&v<=90000)return new Date(Date.UTC(1899,11,30)+v*86400000).toISOString().slice(0,10);
    if(iso(v))return v;
    throw Error('進店或統計日期無法核對');
  }
  function rowsOf(book,X,name){
    const matches=Object.keys(book.Sheets).filter(n=>norm(n)===norm(name));
    requireValue(matches.length===1,'缺少或重複工作表 '+name);
    return X.utils.sheet_to_json(book.Sheets[matches[0]],{header:1,raw:true,blankrows:false});
  }
  function columns(header,labels){return labels.map(label=>{
    const matches=header.flatMap((v,i)=>norm(v)===norm(label)?[i]:[]);
    requireValue(matches.length===1,'缺少或重複欄位 '+label);return matches[0];
  });}
  function count(v){requireValue(Number.isSafeInteger(v)&&v>=0,'原方案件數無法核對');return v;}
  function add(map,store,label,flag,weight){
    const key=JSON.stringify([store,label]);
    if(!map.has(key))map.set(key,{store,label,yes:0,no:0,none:0});
    map.get(key)[flag]+=weight;
  }
  function totalsSection(section,kind){
    if(!section)return null;
    const {source,start,end,rows}=section;
    requireValue(typeof source==='string'&&iso(start)&&iso(end)&&start<=end&&start.slice(0,7)===end.slice(0,7),'續約來源期間無法核對');
    if(kind==='detail')return {source:source.slice(0,180),start,end,detail:Detail.validate(section.detail,Core.STORES,start,end)};
    const seen=new Set();
    requireValue(Array.isArray(rows),'原方案彙總格式不符');
    return {source:source.slice(0,180),start,end,rows:rows.map(r=>{
      const key=JSON.stringify([r.store,r.label]);
      requireValue(ids.has(r.store)&&typeof r.label==='string'&&r.label.length>0&&r.label.length<=500&&!seen.has(key),'原方案彙總店點、名稱或重複鍵無法核對');
      seen.add(key);return {store:r.store,label:r.label,yes:count(r.yes),no:count(r.no),none:count(r.none)};
    })};
  }
  function validate(e){return {detail:totalsSection(e?.detail,'detail'),tariffs:totalsSection(e?.tariffs),daily:totalsSection(e?.daily)};}
  function fromConversion(data){
    if(!data?.renewalDetail)return {};
    return {detail:totalsSection({source:data.source_name,start:data.period_start,end:data.cutoff,detail:data.renewalDetail},'detail')};
  }
  function parseDaily(book,X,source){
    const [header,...rows]=rowsOf(book,X,'續約率(分母)');
    const [store,day,plan,status,weight]=columns(header,['營業店點代碼','統計日期','用戶最後續約之專案','是否已續約','用戶人數']);
    const groups=new Map(),dates=new Set();
    for(const r of rows){
      if(!ids.has(r[store]))continue;
      const flag=({Y:'yes',N:'no','無續約':'none'})[r[status]];
      requireValue(['yes','no','none'].includes(flag),'未識別的續約標記');
      dates.add(date(r[day]));add(groups,r[store],String(r[plan]??'').trim()||'原專案未填',flag,count(r[weight]));
    }
    const sorted=[...dates].sort();requireValue(sorted.length,'本報表沒有北一二B紀錄');
    return {daily:totalsSection({source,start:sorted[0],end:sorted.at(-1),rows:[...groups.values()]})};
  }
  function parseAQ(book,X,source){
    const totals=rowsOf(book,X,'RT締結率');
    const meta=Core.workbookLayout(rowsOf(book,X,'AQ締結率'),rowsOf(book,X,'RT每日'),totals,Core.STORES,{includePrior:false,allowMissingRtRate:true});
    const data={stores:Core.STORES,period_start:meta.begin,cutoff:meta.cutoff};
    const d=Detail.parseAvailable(book,X,data);
    requireValue(d.coverage.tiers||d.coverage.plans,'缺少可核對的門市 Tier 或原方案明細');
    if(d.coverage.tiers){
      for(const s of Core.STORES){
        const group=d.tiers.filter(r=>r.store===s.id),official=totals.find(r=>r[3]===s.id);
        requireValue(official&&group.reduce((a,r)=>a+r.visitors,0)===official[meta.totals.d]&&group.reduce((a,r)=>a+r.renewals,0)===official[meta.totals.n],s.short+' Tier 與 RT 總表不符');
      }
    }
    const period={source,start:meta.begin,end:meta.cutoff};
    const out={detail:totalsSection({...period,detail:d},'detail')};
    if(!d.coverage.plans)return out;
    const all=rowsOf(book,X,'未續約明細'),h=all.findIndex(r=>r.some(v=>norm(v)==='進店店點代碼'));
    if(!all[h]?.some(v=>norm(v)==='方案時專案V+D資費(含換約案)'))return out;
    const [si,di,ui,ei,fi,yi]=columns(all[h],['進店店點代碼','進店日期','Subscr Id(2T)','@是否符合續約資格_進店(含提前續約)_E-15','方案時專案V+D資費(含換約案)','續約Y/N']);
    const seen=new Map(),groups=new Map();
    for(const r of all.slice(h+1)){
      if(!ids.has(r[si])||norm(r[ei])!=='1.符合續約資格')continue;
      const key=JSON.stringify([r[si],date(r[di]),String(r[ui])]),label=String(r[fi]??'').trim()||'未填',flag=norm(r[yi]);
      const signature=JSON.stringify([label,flag]);
      if(seen.has(key)){requireValue(seen.get(key)===signature,'同店日原資費紀錄衝突');continue;}
      seen.set(key,signature);add(groups,r[si],label,flag==='Y'?'yes':'no',1);
    }
    out.tariffs=totalsSection({...period,rows:[...groups.values()]});return out;
  }
  function parse(book,X,source){return Object.keys(book.Sheets).some(n=>norm(n)==='RT締結率')?parseAQ(book,X,source):parseDaily(book,X,source);}
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const percent=(n,d)=>d?(100*n/d).toFixed(1)+'%':'—';
  function ranked(section,stores,tariff){
    if(!section)return '';
    const selected=new Set(stores.map(s=>s.id)),groups=new Map();
    for(const r of section.rows){
      if(!selected.has(r.store))continue;
      const g=groups.get(r.label)||{label:r.label,yes:0,no:0,none:0};
      g.yes+=r.yes;g.no+=r.no;g.none+=r.none;groups.set(r.label,g);
    }
    const records=[...groups.values()],loss=r=>r.no+r.none;
    const sorted=records.filter(r=>loss(r)>0).sort((a,b)=>loss(b)-loss(a)||a.label.localeCompare(b.label,'zh-TW'));
    const top=sorted.filter(r=>loss(r)>=loss(sorted[Math.min(4,sorted.length-1)]));
    const title=tariff?'原資費未續約':'原專案未續約',total=records.reduce((v,r)=>v+loss(r),0);
    return '<section class="panel"><h3>'+title+'</h3><p>'+esc(section.start)+'～'+esc(section.end)+' · '+esc(section.source)+' · '+(tariff?'未續約明細，符合資格、同店日用戶去重':'續約率(分母)，按原報用戶人數加總')+'</p>'+
      (!records.length?'<p>所選門市沒有來源紀錄。</p>':!sorted.length?'<p>該來源的所選紀錄皆已續約。</p>':
      '<p><strong>優先檢視 '+esc(sorted[0].label)+'</strong>　'+loss(sorted[0])+' 筆，占此表未續約 '+percent(loss(sorted[0]),total)+'。請核對當次提供的方案及客人回應。</p><div class="table-scroll"><table class="insight-table"><thead><tr><th>'+(tariff?'原資費':'原專案')+'</th><th>續約 Y</th><th>未續約 N</th>'+(tariff?'':'<th>無續約</th>')+'<th>占本表未續約</th></tr></thead><tbody>'+top.map(r=>'<tr><th>'+esc(r.label)+'</th><td>'+r.yes+'</td><td>'+r.no+'</td>'+(tariff?'':'<td>'+r.none+'</td>')+'<td>'+percent(loss(r),total)+'</td></tr>').join('')+'</tbody></table></div>')+'</section>';
  }
  function render(evidence,stores,conversion){
    const e=evidence||{},ids=new Set(stores.map(s=>s.id));
    let html='<h2>續約洞察｜'+esc(stores.length===1?stores[0].short:'北一二B 九店')+'</h2>';
    if(conversion){
      const r=Core.aggregate(conversion.records.filter(r=>ids.has(r.store)));
      html+='<p>'+esc(conversion.period_start)+'～'+esc(conversion.cutoff)+' · 續約 '+r.rt_n+'／有效來客 '+r.rt_d+'，締結率 '+percent(r.rt_n,r.rt_d)+'，未續約 '+(r.rt_d-r.rt_n)+' 人次。</p>';
    }
    if(e.detail?.detail){
      const d=e.detail;
      if(d.detail.coverage.tiers){
        const rows=d.detail.tiers.filter(t=>ids.has(t.store)),n=rows.reduce((v,t)=>v+t.renewals,0),v=rows.reduce((v,t)=>v+t.visitors,0);
        html+='<p>'+esc(d.start)+'～'+esc(d.end)+' · '+esc(d.source)+' · 進店行為表續約 '+n+'／'+v+'，締結率 '+percent(n,v)+'。</p>';
      }
      html+=Detail.render({period_start:d.start,cutoff:d.end,stores:Core.STORES,renewalDetail:d.detail},stores);
    }else html+='<p class="sub">本次來源缺少門市 Tier 進店行為明細。</p>';
    html+=ranked(e.tariffs,stores,true)+ranked(e.daily,stores,false);
    if(!e.daily&&!e.detail?.detail?.coverage.plans)html+='<p class="sub">本次來源缺少可核對的原專案未續約紀錄。</p>';
    if(e.tariffs||e.daily)html+='<p class="sub">各表獨立計算。資費或專案集中情形與 Tier 是否重疊，需以同期間、同用戶的服務紀錄核對。</p>';
    return html;
  }
  const sheets=['AQ締結率','RT每日','RT締結率',...Detail.SHEETS,'續約率(分母)'];
  return {validate,fromConversion,parse,sheets,render};
});
