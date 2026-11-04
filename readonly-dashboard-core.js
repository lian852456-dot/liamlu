(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.ReadonlyDashboardCore=api;})(typeof globalThis==='object'?globalThis:this,function(){
  'use strict';
  const SCHEMA='north12-conversion/v1';
  const STORES=[['DNB10062','酒泉','台北酒泉'],['DNB10082','永吉','台北永吉'],['DNB10094','復興南','台北復興南'],['DNB10146','杭州南','台北杭州南'],['DNB10168','萬大','台北萬大'],['DNB10174','通化','台北通化'],['DNB10284','大稻埕','台北大稻埕'],['DNB10307','三創','台灣大哥大數位生活台北三創'],['DNB10440','六張犁','台北六張犁']].map(([id,short,name])=>Object.freeze({id,short,name,region:'北一二B'}));
  const FIELDS=['aq_n','aq_d','rt_n','rt_d'],norm=value=>String(value??'').replace(/\s+/g,'');
  function fail(message){throw Error(message);}
  function count(value,label){if(!Number.isSafeInteger(value)||value<0||value>100000000)fail(label+' 必須是非負整數，缺值不能當零');return value;}
  function iso(value){if(typeof value!=='string'||!/^20\d\d-\d\d-\d\d$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail('來源日期不合法');return value;}
  function dateSerial(value){if(!Number.isSafeInteger(value)||value<40000||value>90000)fail('來源日期不是已核實的 Excel 日序');return new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10);}
  function ratio(n,d){return d===0?null:n/d;}
  function aggregate(records){const out=Object.fromEntries(FIELDS.map(k=>[k,0]));for(const row of records)for(const key of FIELDS)out[key]+=count(row[key],key);return {...out,aq_rate:ratio(out.aq_n,out.aq_d),rt_rate:ratio(out.rt_n,out.rt_d)};}
  function dedupe(records){const rows=new Map();for(const row of records){const key=row.date+'|'+row.store,prior=rows.get(key);if(prior&&FIELDS.some(k=>prior[k]!==row[k]))fail('重複店日包含衝突，已停止整批');rows.set(key,row);}return [...rows.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.store.localeCompare(b.store));}
  function validateConversion(value){
    if(!value||![SCHEMA,1].includes(value.schema))fail('締結率資料契約不符');
    const start=iso(value.period_start),cutoff=iso(value.cutoff);if(start.slice(0,7)!==cutoff.slice(0,7)||start.slice(-2)!=='01'||cutoff<start)fail('來源月份與截止不一致');
    if(!/^[a-f0-9]{64}$/.test(value.sha256||''))fail('來源缺少 SHA-256');
    const ids=new Set(STORES.map(s=>s.id));if(!Array.isArray(value.records)||value.records.length>9*31)fail('店日資料不完整');
    const records=dedupe(value.records.map(row=>{
      if(!ids.has(row.store)||row.region&&row.region!=='北一二B')fail('締結率含有未核定門市或區域');
      const date=iso(row.date);if(date<start||date>cutoff)fail('截止以後的預填資料不得作實績');
      const r={store:row.store,date};for(const key of FIELDS)r[key]=count(row[key],key);
      if(r.aq_d===0&&r.aq_n!==0||r.rt_d===0&&r.rt_n!==0)fail('零分母但有上線實績');return r;
    }));
    const days=Number(cutoff.slice(-2));if(records.length!==9*days)fail('缺少店日，不補零');
    for(let day=1;day<=days;day++)for(const id of ids)if(!records.some(r=>r.store===id&&r.date===start.slice(0,8)+String(day).padStart(2,'0')))fail('缺少店日，不補零');
    let prior=null;
    if(value.prior!=null){
      if(!Array.isArray(value.prior)||value.prior.length!==9||new Set(value.prior.map(r=>r.store)).size!==9)fail('同期店點不完整');
      prior=value.prior.map(row=>{if(!ids.has(row.store))fail('同期含未知門市');const r={store:row.store};for(const key of FIELDS)r[key]=count(row[key],key);if(r.aq_d===0&&r.aq_n||r.rt_d===0&&r.rt_n)fail('同期零分母衝突');return r;});
      if(!value.prior_period||iso(value.prior_period.start)>iso(value.prior_period.end)||Number(value.prior_period.start.slice(-2))!==1||Number(value.prior_period.end.slice(-2))!==days||value.prior_period.start.slice(0,7)!==value.prior_period.end.slice(0,7))fail('同期起迄尚未核實');
      const p=new Date(start+'T00:00:00Z');p.setUTCMonth(p.getUTCMonth()-1);if(p.toISOString().slice(0,7)!==value.prior_period.start.slice(0,7))fail('同期不是前一個月');
    }
    return {schema:SCHEMA,period_start:start,cutoff,sha256:value.sha256,source_bytes:count(value.source_bytes||0,'來源大小'),source_name:String(value.source_name||value.file_name||'已驗證締結率來源').slice(0,160),stores:STORES.map(s=>({...s})),records,prior,prior_period:prior?{start:value.prior_period.start,end:value.prior_period.end}:null,definition:'AQ 上線合計／AQ 來客合計；RT 為符合續約資格之原 TWM＋原 TST；同期只有區間總量。'};
  }
  function dailySeries(records,mode='daily',start,end){
    if(!['daily','cumulative'].includes(mode))fail('未知趨勢模式');const byDate=new Map();for(const r of records){if(start&&r.date<start||end&&r.date>end)continue;if(!byDate.has(r.date))byDate.set(r.date,[]);byDate.get(r.date).push(r);}
    let accumulated=[];return [...byDate.keys()].sort().map(date=>{const rows=byDate.get(date);accumulated=accumulated.concat(rows);return {date,...aggregate(mode==='cumulative'?accumulated:rows)};});
  }
  // Calendar weeks start Monday; totals always use daily observations, never cumulative points.
  function weeklySeries(records){
    const weeks=new Map();
    for(const row of records){
      const date=iso(row.date),day=new Date(date+'T00:00:00Z');
      day.setUTCDate(day.getUTCDate()-(day.getUTCDay()+6)%7);
      const weekStart=day.toISOString().slice(0,10);day.setUTCDate(day.getUTCDate()+6);
      if(!weeks.has(weekStart))weeks.set(weekStart,{weekStart,weekEnd:day.toISOString().slice(0,10),rows:[]});
      weeks.get(weekStart).rows.push(row);
    }
    return [...weeks.values()].sort((a,b)=>a.weekStart.localeCompare(b.weekStart)).map(week=>{
      const dates=week.rows.map(row=>row.date).sort(),start=dates[0],end=dates[dates.length-1];
      return {start,end,partial:start!==week.weekStart||end!==week.weekEnd,...aggregate(week.rows)};
    });
  }
  function diff(before,after){const current=validateConversion(after),old=before?validateConversion(before):null;if(old&&(old.period_start!==current.period_start||current.cutoff<old.cutoff))fail('新月份請另建版本；截止不得倒退');const a=new Map((old?.records||[]).map(r=>[r.date+'|'+r.store,r])),b=new Map(current.records.map(r=>[r.date+'|'+r.store,r]));const changed=[];for(const [key,r]of b)if(a.has(key)&&FIELDS.some(k=>a.get(key)[k]!==r[k]))changed.push({store:r.store,date:r.date,before:a.get(key),after:r});return {same_source:old?.sha256===current.sha256,added:[...b.keys()].filter(k=>!a.has(k)).length,removed:[...a.keys()].filter(k=>!b.has(k)).length,changed:changed.length,changes:changed,unique_keys:b.size};}
  function workbookRows(workbook,XLSX,name){if(!workbook.Sheets[name])fail('缺少必要工作表：'+name);return XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,raw:true,defval:null,blankrows:true});}
  function equal(value,expected,label){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value-expected)>Math.max(1e-8,Math.abs(expected)*1e-8))fail(label+' 與逐日加總不一致');}
  // Resolve monthly columns from their headings; every daily block must cover
  // the actual calendar month. Never reuse October's rate/prior column numbers.
  function header(rows,label){const columns=[];(rows[0]||[]).forEach((v,i)=>{if(norm(v)===label)columns.push(i);});if(columns.length!==1)fail('來源欄位缺少或重複：'+label);return columns[0];}
  function subheader(rows,group,label){const start=header(rows,group);let end=start+1;while(end<(rows[0]||[]).length&&!norm(rows[0][end]))end++;const columns=[];for(let c=start;c<end;c++)if(norm(rows[1]?.[c])===label)columns.push(c);if(columns.length!==1)fail(group+' 的分子母欄位不符：'+label);return columns[0];}
  function datesAt(rows,index,dates){dates.forEach((d,i)=>{if(dateSerial(rows[1]?.[index+i])!==d)fail('日期欄位不連續、重複或分子母錯位');});if(Number.isSafeInteger(rows[1]?.[index+dates.length]))fail('日期欄位超出來源月份');}
  function aqLayout(rows){
    const n=header(rows,'AQ上線數'),d=header(rows,'AQ來客數'),rate=header(rows,'AQ締結率');
    const begin=dateSerial(rows[1]?.[n]),year=Number(begin.slice(0,4)),month=Number(begin.slice(5,7)),days=new Date(Date.UTC(year,month,0)).getUTCDate();
    if(begin.slice(-2)!=='01')fail('來源日期必須由月初開始');
    const dates=Array.from({length:days},(_,i)=>begin.slice(0,8)+String(i+1).padStart(2,'0'));
    for(const c of [n,d,rate]){datesAt(rows,c,dates);if(norm(rows[1]?.[c+days])!=='TTL')fail('AQ逐日總計欄位不符');}
    return {begin,year,month,days,dates,n,d,rate,priorN:subheader(rows,'上月同期','上線數'),priorD:subheader(rows,'上月同期','來客數')};
  }
  function workbookLayout(aq,rt,totals){
    const a=aqLayout(aq),{begin,year,days,dates}=a;
    function period(rows){const m=String(rows[0]?.[0]||'').match(/(\d+)\/(\d+)\s*~\s*(\d+)\/(\d+)/);if(!m)fail('來源沒有可核實的資料起迄');const [,sm,sd,em,ed]=m.map(Number);const start=iso(year+'-'+String(sm).padStart(2,'0')+'-'+String(sd).padStart(2,'0')),end=iso(year+'-'+String(em).padStart(2,'0')+'-'+String(ed).padStart(2,'0'));if(start!==begin||end<begin||start.slice(0,7)!==end.slice(0,7))fail('截止與欄位日期不同');return end;}
    const cutoff=period(aq);if(period(rt)!==cutoff||period(totals)!==cutoff)fail('AQ／RT 三張來源期間不同');
    const twN=header(rt,'原TWM用戶上線數'),twD=header(rt,'原TWM用戶來客數'),tsN=header(rt,'原TST用戶'),tsD=tsN+days+1,rate=header(rt,'RT締結率');
    for(const c of [twN,twD,tsN,tsD,rate])datesAt(rt,c,dates);
    for(const [c,label]of [[twN,'TTL'],[twD,'TTL'],[tsN,'上線'],[tsD,'來客'],[rate,'TTL']])if(norm(rt[1]?.[c+days])!==label)fail('RT逐日總計欄位不符：'+label);
    const t={twN:subheader(totals,'原TWM用戶','上線數'),twD:subheader(totals,'原TWM用戶','來客數'),tsN:subheader(totals,'原TST用戶','上線數'),tsD:subheader(totals,'原TST用戶','來客數'),n:subheader(totals,'符合續約資格TTL','上線數'),d:subheader(totals,'符合續約資格TTL','來客數'),rate:subheader(totals,'符合續約資格TTL','締結率'),priorN:subheader(totals,'上月同期','TTL上線數'),priorD:subheader(totals,'上月同期','TTL來客數')};
    return {...a,cutoff,aq:a,rt:{twN,twD,tsN,tsD,rate},totals:t};
  }
  function parseWorkbook(workbook,XLSX,{sha256,source_name,source_bytes}={}){
    const aq=workbookRows(workbook,XLSX,'AQ締結率'),rt=workbookRows(workbook,XLSX,'RT每日'),totals=workbookRows(workbook,XLSX,'RT締結率');
    const layout=workbookLayout(aq,rt,totals),{begin,year,month,days,dates,cutoff}=layout,A=layout.aq,R=layout.rt,T=layout.totals;
    function groups(rows,name){const found=new Map();for(const row of rows){const s=STORES.find(s=>s.id===row[3]);if(!s)continue;if(row[2]!=='北一二B'||norm(row[4])!==norm(s.name))fail(name+' 的店碼／店名／區域不一致');const old=found.get(s.id);if(old&&JSON.stringify(old)!==JSON.stringify(row))fail(name+' 店點重複且衝突');found.set(s.id,row);}if(found.size!==9)fail(name+' 缺店');return found;}
    const ag=groups(aq,'AQ締結率'),rg=groups(rt,'RT每日'),tg=groups(totals,'RT締結率'),valid=Number(cutoff.slice(-2)),records=[],prior=[];
    for(const s of STORES){const a=ag.get(s.id),r=rg.get(s.id),t=tg.get(s.id),current=[];
      for(let j=0;j<days;j++){const row={store:s.id,date:dates[j],aq_n:count(a[A.n+j],'AQ上線'),aq_d:count(a[A.d+j],'AQ來客'),rt_n:count(r[R.twN+j],'原TWM上線')+count(r[R.tsN+j],'原TST上線'),rt_d:count(r[R.twD+j],'原TWM來客')+count(r[R.tsD+j],'原TST來客')};if(j>=valid){if(FIELDS.some(k=>row[k]!==0))fail('截止以後有非零實績，來源口徑衝突');continue;}equal(a[A.rate+j],ratio(row.aq_n,row.aq_d)||0,'AQ每日率');equal(r[R.rate+j],ratio(row.rt_n,row.rt_d)||0,'RT每日率');current.push(row);records.push(row);}
      const total=aggregate(current);for(const [value,expected,label]of [[a[A.n+days],total.aq_n,'AQ分子TTL'],[a[A.d+days],total.aq_d,'AQ分母TTL'],[t[T.n],total.rt_n,'RT分子'],[t[T.d],total.rt_d,'RT分母'],[t[T.rate],total.rt_rate||0,'RT總率']])equal(value,expected,label);
      for(const key of ['twN','twD','tsN','tsD'])equal(r[R[key]+days],t[T[key]],'RT每日與總表');
      prior.push({store:s.id,aq_n:count(a[A.priorN],'同期AQ上線'),aq_d:count(a[A.priorD],'同期AQ來客'),rt_n:count(t[T.priorN],'同期RT上線'),rt_d:count(t[T.priorD],'同期RT來客')});
    }
    const previous=new Date(Date.UTC(year,month-2,1)).toISOString().slice(0,7),priorStart=previous+'-01',priorEnd=previous+'-'+String(valid).padStart(2,'0');
    const pivot=workbookRows(workbook,XLSX,'樞紐'),label=Number(previous.slice(5,7))+'/1';if(!pivot.flat().some(v=>typeof v==='string'&&v.includes(label)&&new RegExp('~\\s*'+Number(previous.slice(5,7))+'/'+valid+'(?:\\D|$)').test(v)))fail('同期區間文字尚未核實');
    return validateConversion({schema:SCHEMA,period_start:begin,cutoff,sha256,source_name,source_bytes,records,prior,prior_period:{start:priorStart,end:priorEnd}});
  }
  function storeId(value){const n=norm(value);return STORES.find(s=>[s.id,s.short,s.name,'台北'+s.short,'台灣大哥大台北'+s.short].map(norm).includes(n))?.id||null;}
  return Object.freeze({SCHEMA,STORES,FIELDS,aggregate,ratio,dedupe,validateConversion,dailySeries,weeklySeries,diff,parseWorkbook,storeId,aqLayout,workbookLayout});
});
