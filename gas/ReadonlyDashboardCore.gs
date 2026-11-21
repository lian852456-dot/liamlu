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
  function verifyRtTotalRate(value,total,location){
    const blank=value==null||value==='';
    if(blank&&total.rt_n===0&&total.rt_d===0)return;
    const source=blank?'空白':Number.isFinite(value)?(value*100).toFixed(6)+'%':'非數字';
    equal(value,total.rt_rate??0,`RT總率（${location}，總表 ${source}，逐日 ${total.rt_n}/${total.rt_d}）`);
  }
  // Resolve monthly columns from their headings; every daily block must cover
  // the actual calendar month. Short-month templates may retain all 31 slots.
  function header(rows,label){const columns=[];(rows[0]||[]).forEach((v,i)=>{if(norm(v)===label)columns.push(i);});if(columns.length!==1)fail('來源欄位缺少或重複：'+label);return columns[0];}
  function subheader(rows,group,label){const start=header(rows,group);let end=start+1;while(end<(rows[0]||[]).length&&!norm(rows[0][end]))end++;const columns=[];for(let c=start;c<end;c++)if(norm(rows[1]?.[c])===label)columns.push(c);if(columns.length!==1)fail(group+' 的分子母欄位不符：'+label);return columns[0];}
  function dateBlockTotal(rows,index,dates,label){
    const headings=rows[1]||[];
    dates.forEach((date,i)=>{if(dateSerial(headings[index+i])!==date)fail('日期欄位不連續、重複或分子母錯位');});
    const end=index+dates.length,total=index+31;
    if(norm(headings[end])===label)return end;
    if(end===total||norm(headings[total])!==label)fail('逐日總計欄位不符：'+label);
    for(let c=end;c<total;c++){
      const offset=c-index,value=headings[c];
      if(norm(rows[0]?.[c])||(value!=null&&value!==''&&value!==0&&value!==offset+1&&value!==headings[index]+offset))fail('日期欄位超出來源月份');
    }
    return total;
  }
  function rtRateColumn(rows,dates,allowMissing){
    const label='RT締結率',candidates=[];
    (rows[0]||[]).forEach((value,index)=>{
      const heading=norm(String(value??'').normalize('NFKC').replace(/[\u200B-\u200D\u2060]/g,''));
      if(heading===label)candidates.push(index);
    });
    if(!candidates.length){
      if(allowMissing)return null;
      fail('RT每日第 1 列缺少「RT締結率」欄位');
    }
    const headings=rows[1]||[];
    const dated=candidates.filter(index=>dates.every((date,i)=>{
      const value=headings[index+i];
      return Number.isSafeInteger(value)&&value>=40000&&value<=90000&&dateSerial(value)===date;
    }));
    if(dated.length===1)return dated[0];
    if(dated.length>1)fail('RT每日「RT締結率」有重複的逐日欄位');
    fail('RT每日「RT締結率」日期欄位與來源月份不符');
  }
  function validatePadding(rows,layout,days,storeIds){
    const columns=Object.entries(layout.total).flatMap(([key,end])=>{
      const start=layout[key]+days;
      return Array.from({length:end-start},(_,i)=>start+i);
    });
    if(!columns.length)return;
    for(const row of rows){
      if(!storeIds.has(row[3]))continue;
      if(columns.some(c=>row[c]!=null&&row[c]!==''&&row[c]!==0&&row[c]!=='0'))fail('月底後的占位欄含有資料，請核對來源月份');
    }
  }
  function aqLayout(rows,{includePrior=true}={}){
    const n=header(rows,'AQ上線數'),d=header(rows,'AQ來客數'),rate=header(rows,'AQ締結率');
    const begin=dateSerial(rows[1]?.[n]),year=Number(begin.slice(0,4)),month=Number(begin.slice(5,7)),days=new Date(Date.UTC(year,month,0)).getUTCDate();
    if(begin.slice(-2)!=='01')fail('來源日期必須由月初開始');
    const dates=Array.from({length:days},(_,i)=>begin.slice(0,8)+String(i+1).padStart(2,'0'));
    const total={n:dateBlockTotal(rows,n,dates,'TTL'),d:dateBlockTotal(rows,d,dates,'TTL'),rate:dateBlockTotal(rows,rate,dates,'TTL')};
    return {begin,year,month,days,dates,n,d,rate,total,priorN:includePrior?subheader(rows,'上月同期','上線數'):null,priorD:includePrior?subheader(rows,'上月同期','來客數'):null};
  }
  function workbookLayout(aq,rt,totals,stores=STORES,{allowMissingRtRate=false,includePrior=true}={}){
    const a=aqLayout(aq,{includePrior}),{begin,year,days,dates}=a;
    function period(rows){const m=String(rows[0]?.[0]||'').match(/(\d+)\/(\d+)\s*~\s*(\d+)\/(\d+)/);if(!m)fail('來源沒有可核實的資料起迄');const [,sm,sd,em,ed]=m.map(Number);const start=iso(year+'-'+String(sm).padStart(2,'0')+'-'+String(sd).padStart(2,'0')),end=iso(year+'-'+String(em).padStart(2,'0')+'-'+String(ed).padStart(2,'0'));if(start!==begin||end<begin||start.slice(0,7)!==end.slice(0,7))fail('截止與欄位日期不同');return end;}
    const cutoff=period(aq);if(period(rt)!==cutoff||period(totals)!==cutoff)fail('AQ／RT 三張來源期間不同');
    const twN=header(rt,'原TWM用戶上線數'),twD=header(rt,'原TWM用戶來客數'),tsN=header(rt,'原TST用戶'),rate=rtRateColumn(rt,dates,allowMissingRtRate);
    const tsNTotal=dateBlockTotal(rt,tsN,dates,'上線'),tsD=tsNTotal+1;
    const r={twN,twD,tsN,tsD,rate,total:{twN:dateBlockTotal(rt,twN,dates,'TTL'),twD:dateBlockTotal(rt,twD,dates,'TTL'),tsN:tsNTotal,tsD:dateBlockTotal(rt,tsD,dates,'來客')}};
    if(rate!==null)r.total.rate=dateBlockTotal(rt,rate,dates,'TTL');
    const storeIds=new Set(stores.map(store=>store.id));
    validatePadding(aq,a,days,storeIds);
    validatePadding(rt,r,days,storeIds);
    const t={twN:subheader(totals,'原TWM用戶','上線數'),twD:subheader(totals,'原TWM用戶','來客數'),tsN:subheader(totals,'原TST用戶','上線數'),tsD:subheader(totals,'原TST用戶','來客數'),n:subheader(totals,'符合續約資格TTL','上線數'),d:subheader(totals,'符合續約資格TTL','來客數'),rate:subheader(totals,'符合續約資格TTL','締結率'),priorN:includePrior?subheader(totals,'上月同期','TTL上線數'):null,priorD:includePrior?subheader(totals,'上月同期','TTL來客數'):null};
    return {...a,cutoff,aq:a,rt:r,totals:t};
  }
  function parseWorkbook(workbook,XLSX,{sha256,source_name,source_bytes,allowMissingRtRate=false,includePrior=true}={}){
    const aq=workbookRows(workbook,XLSX,'AQ締結率'),rt=workbookRows(workbook,XLSX,'RT每日'),totals=workbookRows(workbook,XLSX,'RT締結率');
    const layout=workbookLayout(aq,rt,totals,STORES,{allowMissingRtRate,includePrior});
    const {begin,year,month,days,dates,cutoff}=layout,A=layout.aq,R=layout.rt,T=layout.totals;
    function groups(rows,name){const found=new Map();for(const row of rows){const s=STORES.find(s=>s.id===row[3]);if(!s)continue;if(row[2]!=='北一二B'||norm(row[4])!==norm(s.name))fail(name+' 的店碼／店名／區域不一致');const old=found.get(s.id);if(old&&JSON.stringify(old)!==JSON.stringify(row))fail(name+' 店點重複且衝突');found.set(s.id,row);}if(found.size!==9)fail(name+' 缺店');return found;}
    const ag=groups(aq,'AQ締結率'),rg=groups(rt,'RT每日'),tg=groups(totals,'RT締結率'),valid=Number(cutoff.slice(-2)),records=[],prior=[];
    for(const s of STORES){const a=ag.get(s.id),r=rg.get(s.id),t=tg.get(s.id),current=[];
      const rtCounts={twN:0,twD:0,tsN:0,tsD:0};
      for(let j=0;j<days;j++){
        const twN=count(r[R.twN+j],'原TWM上線'),twD=count(r[R.twD+j],'原TWM來客');
        const tsN=count(r[R.tsN+j],'原TST上線'),tsD=count(r[R.tsD+j],'原TST來客');
        const row={store:s.id,date:dates[j],aq_n:count(a[A.n+j],'AQ上線'),aq_d:count(a[A.d+j],'AQ來客'),rt_n:twN+tsN,rt_d:twD+tsD};
        if(j>=valid){
          if(FIELDS.some(k=>row[k]!==0))fail('截止以後有非零實績，來源口徑衝突');
          continue;
        }
        equal(a[A.rate+j],ratio(row.aq_n,row.aq_d)||0,'AQ每日率');
        if(R.rate!==null)equal(r[R.rate+j],ratio(row.rt_n,row.rt_d)||0,'RT每日率');
        rtCounts.twN+=twN;
        rtCounts.twD+=twD;
        rtCounts.tsN+=tsN;
        rtCounts.tsD+=tsD;
        current.push(row);
        records.push(row);
      }
      const total=aggregate(current);for(const [value,expected,label]of [[a[A.total.n],total.aq_n,'AQ分子TTL'],[a[A.total.d],total.aq_d,'AQ分母TTL'],[t[T.n],total.rt_n,'RT分子'],[t[T.d],total.rt_d,'RT分母']])equal(value,expected,label);
      for(const key of Object.keys(rtCounts)){
        equal(r[R.total[key]],t[T[key]],'RT每日與總表');
        if(R.rate===null)equal(t[T[key]],rtCounts[key],s.short+' RT每日分項與總表');
      }
      verifyRtTotalRate(t[T.rate],total,`${s.short} RT締結率!${XLSX.utils.encode_cell({r:totals.indexOf(t),c:T.rate})}`);
      if(includePrior)prior.push({store:s.id,aq_n:count(a[A.priorN],'同期AQ上線'),aq_d:count(a[A.priorD],'同期AQ來客'),rt_n:count(t[T.priorN],'同期RT上線'),rt_d:count(t[T.priorD],'同期RT來客')});
    }
    let priorPeriod=null;
    if(includePrior){
      const previous=new Date(Date.UTC(year,month-2,1)).toISOString().slice(0,7);
      const pivot=workbookRows(workbook,XLSX,'樞紐'),label=Number(previous.slice(5,7))+'/1';
      if(!pivot.flat().some(v=>typeof v==='string'&&v.includes(label)&&new RegExp('~\\s*'+Number(previous.slice(5,7))+'/'+valid+'(?:\\D|$)').test(v)))fail('同期區間文字尚未核實');
      priorPeriod={start:previous+'-01',end:previous+'-'+String(valid).padStart(2,'0')};
    }
    return validateConversion({schema:SCHEMA,period_start:begin,cutoff,sha256,source_name,source_bytes,records,prior:includePrior?prior:null,prior_period:priorPeriod});
  }
  function storeId(value){const n=norm(value);return STORES.find(s=>[s.id,s.short,s.name,'台北'+s.short,'台灣大哥大台北'+s.short].map(norm).includes(n))?.id||null;}
  return Object.freeze({SCHEMA,STORES,FIELDS,aggregate,ratio,dedupe,validateConversion,dailySeries,weeklySeries,diff,parseWorkbook,storeId,aqLayout,workbookLayout,verifyRtTotalRate});
});

(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ReadonlyRenewalDetail=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const SHEETS=['Tier觀察','RT用戶進店行為_店','未續約明細'],TIERS=['A','B','C','D','E','F'];
const norm=v=>String(v??'').normalize('NFKC').replace(/[\s\u200B-\u200D\u2060]+/g,''),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fail(s){throw Error(s);}
function count(v){if(!Number.isSafeInteger(v)||v<0)fail('續約分析人次須為非負整數');return v;}
function signedCount(v){if(!Number.isSafeInteger(v)||Math.abs(v)>100000000)fail('來源行為數格式不符');return v;}
function sheetNames(w,name){return Object.keys(w.Sheets||{}).filter(n=>norm(n)===norm(name));}
function rows(w,X,name){
 const names=sheetNames(w,name);if(names.length>1)fail(name+' 有多張同名來源，請保留一份');if(!names.length)return null;
 const raw=X.utils.sheet_to_json(w.Sheets[names[0]],{header:1,raw:true,defval:null,blankrows:true});
 // Locate only recognized semantic headers; do not guess similar table names.
 if(name===SHEETS[2]){
  const at=raw.findIndex(r=>r.some(v=>norm(v)==='進店店點代碼'));
  return at<0?raw:raw.slice(at);
 }
 const marker=name===SHEETS[0]?'原TWM用戶':'符合續約資格進店用戶數';
 const at=raw.findIndex(r=>r.some(v=>norm(v)===marker));if(at<0)return raw;
 const col=raw[at].findIndex(v=>norm(v)===marker),shift=col-(name===SHEETS[0]?3:4);
 if(shift<0)return raw;
 const move=r=>r.slice(shift);
 if(name===SHEETS[0]){
  const labels=raw.slice(0,at).filter(r=>r.some(v=>/\d+\/\d+\s*[~～]\s*\d+\/\d+/.test(String(v))));
  if(labels.length!==1)fail('Tier觀察期間標題缺少或重複');
  const rest=raw.slice(at+1).filter(r=>r.some(v=>norm(v)));
  return [move(labels[0]),move(raw[at]),...rest.map(move)];
 }
 const tierRow=raw.slice(0,at).filter(r=>TIERS.every((t,i)=>norm(r[col+5*i])===t));
 if(tierRow.length!==1)fail('RT用戶進店行為_店 Tier 表頭缺少或重複');
 return [[],move(tierRow[0]),[],move(raw[at]),...raw.slice(at+1).map(move)];
}
function validate(value,stores,start,cutoff){
 if(value==null)return null;if(value.schema!=='north12-renewal-detail/v1'||value.period_start!==start||value.cutoff!==cutoff)fail('續約分析期間不一致');
 const ids=new Set(stores.map(s=>s.id)),regions=new Set(stores.map(s=>s.region)),unique=new Set();
 function list(key,max,project){
  const label={tiers:'RT用戶進店行為_店',observation:'Tier觀察',plans:'未續約明細'}[key];
  if(!Array.isArray(value[key]))fail(label+' 的彙總資料格式不符');
  if(value[key].length>max)fail(label+' 有 '+value[key].length+' 筆彙總，超過本次區店可核對的 '+max+' 筆，請檢查重複資料或混入不同期間');
  return value[key].map(project);
 }
 function once(key){if(unique.has(key))fail('續約分析彙總鍵重複');unique.add(key);}
 const tiers=list('tiers',stores.length*6,r=>{if(!ids.has(r.store)||!TIERS.includes(r.tier))fail('Tier 店點不符');once('t|'+r.store+'|'+r.tier);const out={store:r.store,tier:r.tier};for(const k of ['visitors','renewals','npOut','terminated','visitOnly'])out[k]=k==='visitOnly'?signedCount(r[k]):count(r[k]);if(out.renewals+out.npOut+out.terminated+out.visitOnly!==out.visitors)fail('Tier 行為合計不符');return out;});
 if(tiers.length&&tiers.length!==stores.length*6)fail('Tier 店點缺漏');
 const observation=list('observation',regions.size*10,r=>{if(!regions.has(r.region)||!['A','B','C','D','E'].includes(r.tier)||!['TWM','TST'].includes(r.origin))fail('Tier觀察分組不符');once('o|'+r.region+'|'+r.origin+'|'+r.tier);const out={region:r.region,origin:r.origin,tier:r.tier,renewals:count(r.renewals),visitors:count(r.visitors)};if(out.renewals>out.visitors)fail('Tier觀察分子超過分母');return out;});
 if(observation.length&&observation.length!==regions.size*10)fail('Tier觀察區域缺漏');
 const plans=list('plans',200000,r=>{if(!ids.has(r.store)||typeof r.plan!=='string'||!r.plan.trim()||r.plan.length>500)fail('未續約方案分組不符');once('p|'+r.store+'|'+r.plan);return {store:r.store,plan:r.plan,unrenewed:count(r.unrenewed)};});
 const coverage={tiers:value.coverage?.tiers===true,observation:value.coverage?.observation===true,plans:value.coverage?.plans===true};
 if(coverage.tiers&&!tiers.length||!coverage.tiers&&tiers.length||coverage.observation&&!observation.length||!coverage.observation&&observation.length||!coverage.plans&&plans.length)fail('續約分析來源完整性不符');
 const issues={};
 for(const key of ['tiers','observation','plans']){
  if(value.issues?.[key]&&!coverage[key])issues[key]=String(value.issues[key]).slice(0,400);
 }
 return {schema:'north12-renewal-detail/v1',period_start:start,cutoff,tiers,observation,plans,coverage,...(Object.keys(issues).length?{issues}:{})};
}
function parse(w,X,data){
 const stores=data.stores,byId=new Map(stores.map(s=>[s.id,s])),regions=new Set(stores.map(s=>s.region)),tiers=[],observation=[],plans=new Map();
 const b=rows(w,X,SHEETS[1]),o=rows(w,X,SHEETS[0]),p=rows(w,X,SHEETS[2]);
 if(b){for(const [i,tier]of TIERS.entries()){const c=4+5*i;if(norm(b[1]?.[c])!==tier||norm(b[3]?.[c])!=='符合續約資格進店用戶數'||norm(b[3]?.[c+1])!=='1.續約'||norm(b[3]?.[c+2])!=='2.NPOUT'||norm(b[3]?.[c+3])!=='3.退租'||norm(b[3]?.[c+4])!=='4.單純進店')fail('RT用戶進店行為_店 欄位版型不符');}
  for(const r of b.slice(4)){const s=byId.get(r[2]);if(!s)continue;if(r[1]!==s.region||norm(r[3])!==norm(s.name))fail('Tier 店碼／區域／店名不一致');const group=TIERS.map((tier,i)=>({store:s.id,tier,visitors:count(r[4+5*i]),renewals:count(r[5+5*i]),npOut:count(r[6+5*i]),terminated:count(r[7+5*i]),visitOnly:signedCount(r[8+5*i])}));for(const [i,k]of ['visitors','renewals','npOut','terminated','visitOnly'].entries())if(group.reduce((n,t)=>n+t[k],0)!==(k==='visitOnly'?signedCount(r[34+i]):count(r[34+i])))fail('Tier A～F 與 TTL 不一致');tiers.push(...group);}
 }
 if(o){const label=norm(o[0]?.[1]),m=label.match(/\((\d+)\/(\d+)~(\d+)\/(\d+)\)/);if(!m||Number(m[1])!==Number(data.period_start.slice(5,7))||Number(m[2])!==1||Number(m[3])!==Number(data.cutoff.slice(5,7))||Number(m[4])!==Number(data.cutoff.slice(-2)))fail('Tier觀察期間不符');
  for(const [origin,offset]of [['TWM',3],['TST',21]]){if(norm(o[1]?.[offset])!=='原'+origin+'用戶')fail('Tier觀察用戶來源不符');for(let i=0;i<5;i++){const c=offset+3*i;if(norm(o[2]?.[c])!==TIERS[i]||norm(o[3]?.[c])!=='上線數'||norm(o[3]?.[c+1])!=='來客數')fail('Tier觀察欄位版型不符');}}
  for(const r of o.slice(4)){if(!regions.has(r[1])||/^DNB\d{5}$/.test(norm(r[0])))continue;for(const [origin,offset]of [['TWM',3],['TST',21]])for(let i=0;i<5;i++)observation.push({region:r[1],origin,tier:TIERS[i],renewals:count(r[offset+3*i]),visitors:count(r[offset+3*i+1])});}
 }
 if(p){const h=(p[0]||[]).map(norm),column=(...names)=>{const matches=h.flatMap((v,i)=>names.includes(v)?[i]:[]);if(matches.length!==1)fail('未續約明細缺少或重複 '+names[0]);return matches[0];};
  const si=column('進店店點代碼'),ri=column('進店課別'),di=column('進店日期'),pi=column('方案描述(含換約案)','方案描述'),yi=column('續約Y/N'),ei=column('@是否符合續約資格_進店(含提前續約)_E-15'),ui=column('SubscrId(2T)');const seen=new Map();
  for(const r of p.slice(1)){const s=byId.get(r[si]);if(!s)continue;if(r[ri]!==s.region)fail('未續約明細店碼與區域不符');if(norm(r[ei])!=='1.符合續約資格')continue;if(!['Y','N'].includes(norm(r[yi])))fail('未續約明細續約標記不符');
   const serial=r[di];if(!Number.isSafeInteger(serial)||serial<40000||serial>90000)fail('未續約明細進店日期不符');const date=new Date(Date.UTC(1899,11,30)+serial*86400000).toISOString().slice(0,10);if(date<data.period_start||date>data.cutoff)fail('未續約明細日期超出來源期間');
   if(r[ui]==null||String(r[ui]).trim()==='')fail('未續約明細缺少去重識別');const plan=String(r[pi]??'').trim()||'方案描述未提供',key=s.id+'|'+date+'|'+String(r[ui]),signature=JSON.stringify([plan,norm(r[yi])]);if(seen.has(key)){if(seen.get(key)!==signature)fail('未續約明細同店日用戶重複且衝突');continue;}seen.set(key,signature);if(norm(r[yi])!=='N')continue;const pk=JSON.stringify([s.id,plan]);if(!plans.has(pk))plans.set(pk,{store:s.id,plan,unrenewed:0});plans.get(pk).unrenewed++;
  }
 }
 // Repeated copies of the same aggregate must not inflate totals.
 function uniqueRows(items,keyOf,label){
  const unique=new Map();
  for(const item of items){
   const key=keyOf(item),old=unique.get(key);
   if(old&&JSON.stringify(old)!==JSON.stringify(item))fail(label+' 同一區店與 Tier 出現不同數值，請核對重複區塊');
   unique.set(key,item);
  }
  return [...unique.values()];
 }
 return validate({schema:'north12-renewal-detail/v1',period_start:data.period_start,cutoff:data.cutoff,tiers:uniqueRows(tiers,r=>r.store+'|'+r.tier,SHEETS[1]),observation:uniqueRows(observation,r=>r.region+'|'+r.origin+'|'+r.tier,SHEETS[0]),plans:[...plans.values()],coverage:{tiers:!!b,observation:!!o,plans:!!p}},stores,data.period_start,data.cutoff);
}
function parseAvailable(workbook,XLSX,data){
 const result=parse({Sheets:{}},XLSX,data),issues={};
 for(const [key,name] of [['tiers',SHEETS[1]],['observation',SHEETS[0]],['plans',SHEETS[2]]]){
  const names=sheetNames(workbook,name);if(!names.length)continue;
  try{
   const part=parse({Sheets:Object.fromEntries(names.map(n=>[n,workbook.Sheets[n]]))},XLSX,data);
   result[key]=part[key];
   result.coverage[key]=part.coverage[key];
  }catch(error){
   issues[key]=error.message;
  }
 }
 return validate({...result,issues},data.stores,data.period_start,data.cutoff);
}
function importSummary(detail){
 if(!detail)return '';
 return [['tiers',SHEETS[1]],['observation',SHEETS[0]],['plans',SHEETS[2]]].map(([key,name])=>
  name+' — '+(detail.coverage[key]?'已載入':detail.issues?.[key]?'未載入，'+detail.issues[key]:'未提供')
 ).join('\n');
}
function unavailable(detail,key,name){
 return '<p>'+esc(detail.issues?.[key]?name+' 未通過核對，本項未載入。原因為 '+detail.issues[key]:'原報未提供 '+name+'。')+'</p>';
}
const n=v=>v.toLocaleString('zh-TW'),pct=(a,b)=>b?(100*a/b).toFixed(1)+'%':'—';
function table(head,body){return '<div class="table-scroll scroll"><table class="insight-table"><thead><tr>'+head.map(v=>'<th>'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div>';}
function concentration(detail,stores){
 const ids=new Set(stores.map(s=>s.id)),rows=detail.tiers.filter(t=>ids.has(t.store));
 if(!detail.coverage.tiers||!rows.length)return '';
 const lost=t=>t.visitors-t.renewals,total=rows.reduce((v,t)=>v+lost(t),0);
 if(total<=0||rows.some(t=>lost(t)<0||t.visitOnly<0))return '';
 const losses=TIERS.map(tier=>{
  const group=rows.filter(t=>t.tier===tier);
  return {tier,visitors:group.reduce((v,t)=>v+t.visitors,0),renewals:group.reduce((v,t)=>v+t.renewals,0),loss:group.reduce((v,t)=>v+lost(t),0)};
 }).sort((a,b)=>b.loss-a.loss);
 const leaders=losses.filter(t=>t.loss>0).slice(0,2),combined=leaders.reduce((v,t)=>v+t.loss,0);
 const visitorCount=rows.reduce((v,t)=>v+t.visitors,0),renewalCount=visitorCount-total;
 const leaderVisitors=leaders.reduce((v,t)=>v+t.visitors,0),leaderRenewals=leaderVisitors-combined;
 const otherVisitors=visitorCount-leaderVisitors;
 const actions=[['單純進店','visitOnly'],['NP OUT','npOut'],['退租','terminated']].map(([label,key])=>label+' '+n(rows.reduce((v,t)=>v+t[key],0))+' 人次');
 return '<p class="insight-evidence"><strong>未續約集中在哪裡？</strong> '+n(total)+' 人次未續約，其中 Tier '+leaders.map(t=>t.tier+'（'+n(t.loss)+'）').join('、')+' 合計 '+n(combined)+' 人次，占 '+pct(combined,total)+'。'+
  '這些 Tier 占來客 '+pct(leaderVisitors,visitorCount)+'，締結率 '+pct(leaderRenewals,leaderVisitors)+(otherVisitors?'，其餘 Tier 為 '+pct(renewalCount-leaderRenewals,otherVisitors):'')+'。</p>'+
  '<p>進店行為為'+actions.join('、')+'。原報記錄進店結果與原方案，顧客未接受續約的原因須由服務紀錄確認。</p>';
}
function render(data,selectedStores,{start=data.period_start,end=data.cutoff}={}){
 const d=data.renewalDetail;if(!d)return '<section class="panel"><h3>Tier／未續約方案資料</h3><p>目前快照未包含分析頁籤；請匯入包含 Tier觀察、RT用戶進店行為_店、未續約明細 的完整原報。</p></section>';
 if(start!==data.period_start||end!==data.cutoff)return '<section class="panel"><h3>Tier／原方案未續約</h3><p>這三張來源為整段期間統計，請恢復 '+esc(data.period_start)+' 至 '+esc(data.cutoff)+' 查看，避免套用到不同日期。</p></section>';
 const ids=new Set(selectedStores.map(s=>s.id)),regions=new Set(selectedStores.map(s=>s.region)),ts=d.tiers.filter(t=>ids.has(t.store)),ps=d.plans.filter(p=>ids.has(p.store));
 const groups=TIERS.map(tier=>{const rows=ts.filter(t=>t.tier===tier),out={tier,visitors:0,renewals:0,npOut:0,terminated:0,visitOnly:0};for(const r of rows)for(const k of ['visitors','renewals','npOut','terminated','visitOnly'])out[k]+=r[k];return out;});
 let html='<section class="panel insight-panel"><h3>Tier A～F 掌握分析</h3><p class="sub">來源：RT用戶進店行為_店｜'+esc(data.period_start)+'～'+esc(data.cutoff)+'｜所選 '+selectedStores.length+' 店；締結率＝續約／符合資格進店人次。</p>';
 html+=concentration(d,selectedStores);
 html+=d.coverage.tiers?table(['Tier','來客','續約','締結率','未續約','NP OUT','退租','單純進店'],groups.map(t=>'<tr><th>'+t.tier+'</th><td>'+n(t.visitors)+'</td><td>'+n(t.renewals)+'</td><td>'+pct(t.renewals,t.visitors)+'</td><td>'+n(t.visitors-t.renewals)+'</td><td>'+n(t.npOut)+'</td><td>'+n(t.terminated)+'</td><td>'+n(t.visitOnly)+'</td></tr>').join('')):unavailable(d,'tiers',SHEETS[1]);
 if(ts.some(t=>t.visitOnly<0))html+='<p class="sub">資料提示：原報有單純進店負值，保留原值並列為待核對，不補零；不以此推定原因。</p>';
 if(ts.length){const weak=groups.filter(t=>t.visitors>=30).sort((a,b)=>a.renewals/a.visitors-b.renewals/b.visitors)[0];if(weak)html+='<p class="sub">優先檢視 Tier '+weak.tier+'：'+n(weak.renewals)+'／'+n(weak.visitors)+'（'+pct(weak.renewals,weak.visitors)+'）。可先檢查單純進店未續約案件，再核對 NP OUT／退租原因；此為檢查方向。</p>';html+='<details><summary>各店同 Tier 比較</summary>'+table(['區域／門市','Tier','來客','續約','締結率'],ts.map(t=>{const s=selectedStores.find(s=>s.id===t.store);return '<tr><td>'+esc(s.region+'／'+s.short)+'</td><td>'+t.tier+'</td><td>'+n(t.visitors)+'</td><td>'+n(t.renewals)+'</td><td>'+pct(t.renewals,t.visitors)+'</td></tr>';}).join(''))+'</details>';}
 html+='</section><section class="panel insight-panel"><h3>原 TWM／TST・Tier 觀察</h3><p class="sub">來源：Tier觀察。原報此表提供區級 A～E 彙總；F 與單店 TWM／TST 分拆未提供。區級資料只於整區完整選取時顯示。</p>';
 const whole=[...regions].every(region=>data.stores.filter(s=>s.region===region).every(s=>ids.has(s.id)));
 if(!whole)html+='<p>目前選取單店，區級 TWM／TST 不套用為該店數值。</p>';
 else if(!d.coverage.observation)html+=unavailable(d,'observation',SHEETS[0]);
 else{const obs=d.observation.filter(t=>regions.has(t.region));html+=table(['用戶','A～E 來客','續約','締結率'],['TWM','TST'].map(origin=>{const rs=obs.filter(t=>t.origin===origin),v=rs.reduce((s,t)=>s+t.visitors,0),r=rs.reduce((s,t)=>s+t.renewals,0);return '<tr><td>'+origin+'</td><td>'+n(v)+'</td><td>'+n(r)+'</td><td>'+pct(r,v)+'</td></tr>';}).join(''))+'<details><summary>展開四區與各 Tier 明細</summary>'+table(['區域','用戶','Tier','來客','續約','締結率'],obs.map(t=>'<tr><td>'+esc(t.region)+'</td><td>'+t.origin+'</td><td>'+t.tier+'</td><td>'+n(t.visitors)+'</td><td>'+n(t.renewals)+'</td><td>'+pct(t.renewals,t.visitors)+'</td></tr>').join(''))+'</details>'; }
 html+='</section><section class="panel insight-panel"><h3>原方案未續約 TOP 5</h3><p class="sub">來源：未續約明細 → 方案描述(含換約案)。限「1.符合續約資格」且續約 N；以同店／進店日／用戶去重。顯示未續約件數及占比，非方案未續約率。</p>';
 const byPlan=new Map();for(const p of ps)byPlan.set(p.plan,(byPlan.get(p.plan)||0)+p.unrenewed);const top=[...byPlan].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-TW')).slice(0,5),total=ps.reduce((s,p)=>s+p.unrenewed,0);
 html+=!d.coverage.plans?unavailable(d,'plans',SHEETS[2]):!top.length?'<p>所選範圍無符合條件的未續約紀錄。</p>':table(['方案描述','未續約件數','占未續約紀錄'],top.map(([plan,c])=>'<tr><td>'+esc(plan)+'</td><td>'+n(c)+'</td><td>'+pct(c,total)+'</td></tr>').join(''))+'<p class="sub">優先檢視首位方案的費用、設備與合約需求；原方案名稱無法直接判斷未續約原因，請以實際回訪紀錄核對。</p>';
 return html+'</section>';
}
return Object.freeze({SHEETS,TIERS,concentration,parse,parseAvailable,importSummary,validate,render});
});

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
  function originRows(rows){
    if(!Array.isArray(rows)||rows.length>ids.size*2)throw Error('原用戶別資料格式不符');
    const seen=new Set();
    return rows.map(({store,origin,visitors,renewals})=>{
      const key=store+'|'+origin;
      requireValue(ids.has(store)&&['TWM','TST'].includes(origin)&&!seen.has(key),'原用戶別店點、來源或重複鍵無法核對');
      seen.add(key);count(visitors);count(renewals);
      requireValue(renewals<=visitors,'原用戶別續約超過來客');
      return {store,origin,visitors,renewals};
    });
  }
  function totalsSection(section,kind){
    if(!section)return null;
    const {source,start,end,rows}=section;
    requireValue(typeof source==='string'&&iso(start)&&iso(end)&&start<=end&&start.slice(0,7)===end.slice(0,7),'續約來源期間無法核對');
    const origin=section.origins==null?{}:{origins:originRows(section.origins)};
    if(kind==='detail')return {source:source.slice(0,180),start,end,...origin,detail:Detail.validate(section.detail,Core.STORES,start,end)};
    const seen=new Set();
    requireValue(Array.isArray(rows),'原方案彙總格式不符');
    return {source:source.slice(0,180),start,end,...origin,rows:rows.map(r=>{
      const key=JSON.stringify([r.store,r.label]);
      requireValue(ids.has(r.store)&&typeof r.label==='string'&&r.label.length>0&&r.label.length<=500&&!seen.has(key),'原方案彙總店點、名稱或重複鍵無法核對');
      seen.add(key);return {store:r.store,label:r.label,yes:count(r.yes),no:count(r.no),none:count(r.none)};
    })};
  }
  function validate(e){return {detail:totalsSection(e?.detail,'detail'),tariffs:totalsSection(e?.tariffs),daily:totalsSection(e?.daily)};}
  function fromConversion(data){
    if(data?.renewalEvidence)return validate(data.renewalEvidence);
    if(!data?.renewalDetail)return {};
    return {detail:totalsSection({source:data.source_name,start:data.period_start,end:data.cutoff,detail:data.renewalDetail},'detail')};
  }
  function sourceStatus(e){
    const detail=e?.detail,coverage=detail?.detail?.coverage;
    return [
      '門市 Tier '+(coverage?.tiers?'至 '+detail.end:'未取得'),
      '未續約原方案 '+(e?.daily?'日報至 '+e.daily.end:coverage?.plans?'至 '+detail.end:'未取得')
    ].join(' · ');
  }
  function parseDaily(book,X,source){
    const [header,...rows]=rowsOf(book,X,'續約率(分母)');
    const [store,day,plan,status,weight]=columns(header,['營業店點代碼','統計日期','用戶最後續約之專案','是否已續約','用戶人數']);
    const origin=header.findIndex(v=>norm(v)==='用戶別'),origins=new Map(),groups=new Map(),dates=new Set();
    let completeOrigins=origin>=0;
    for(const r of rows){
      if(!ids.has(r[store]))continue;
      const flag=({Y:'yes',N:'no','無續約':'none'})[r[status]];
      requireValue(['yes','no','none'].includes(flag),'未識別的續約標記');
      const id=r[store],weightValue=count(r[weight]),tag=norm(r[origin]);
      dates.add(date(r[day]));add(groups,id,String(r[plan]??'').trim()||'原專案未填',flag,weightValue);
      if(['TWM','TST'].includes(tag))add(origins,id,tag,flag,weightValue);else completeOrigins=false;
    }
    const sorted=[...dates].sort();requireValue(sorted.length,'本報表沒有北一二B紀錄');
    const originTotals=completeOrigins?{origins:[...origins.values()].map(r=>({store:r.store,origin:r.label,visitors:r.yes+r.no+r.none,renewals:r.yes}))}:{};
    return {daily:totalsSection({source,start:sorted[0],end:sorted.at(-1),rows:[...groups.values()],...originTotals})};
  }
  function parseAQ(book,X,source){
    const totals=rowsOf(book,X,'RT締結率');
    const meta=Core.workbookLayout(rowsOf(book,X,'AQ締結率'),rowsOf(book,X,'RT每日'),totals,Core.STORES,{includePrior:false,allowMissingRtRate:true});
    const data={stores:Core.STORES,period_start:meta.begin,cutoff:meta.cutoff};
    const d=Detail.parseAvailable(book,X,data);
    requireValue(d.coverage.tiers||d.coverage.plans,'缺少可核對的門市 Tier 或原方案明細');
    const origins=[];
    for(const s of Core.STORES){
        const group=d.tiers.filter(r=>r.store===s.id),official=totals.find(r=>r[3]===s.id);
        if(d.coverage.tiers)requireValue(official&&group.reduce((a,r)=>a+r.visitors,0)===official[meta.totals.d]&&group.reduce((a,r)=>a+r.renewals,0)===official[meta.totals.n],s.short+' Tier 與 RT 總表不符');
        const {twN,twD,tsN,tsD,d:ttlD,n:ttlN}=meta.totals;
        if(official&&[twN,twD,tsN,tsD].every(key=>Number.isSafeInteger(official[key])&&official[key]>=0)
          &&official[twN]+official[tsN]===official[ttlN]&&official[twD]+official[tsD]===official[ttlD]){
          origins.push({store:s.id,origin:'TWM',visitors:official[twD],renewals:official[twN]},
            {store:s.id,origin:'TST',visitors:official[tsD],renewals:official[tsN]});
        }
    }
    const period={source,start:meta.begin,end:meta.cutoff};
    const out={detail:totalsSection({...period,detail:d,...(origins.length===ids.size*2?{origins}:{})},'detail')};
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
  function originsHtml(section,ids,label){
    const rows=section?.origins?.filter(r=>ids.has(r.store));
    if(!rows?.length)return '';
    const groups=['TWM','TST'].map(origin=>rows.filter(r=>r.origin===origin).reduce((a,r)=>({origin,visitors:a.visitors+r.visitors,renewals:a.renewals+r.renewals}),{origin,visitors:0,renewals:0}));
    return '<p class="insight-evidence"><strong>'+label+'原用戶別</strong>　'+groups.map(r=>'原 '+r.origin+' '+r.renewals+'／'+r.visitors+'（'+percent(r.renewals,r.visitors)+'），未續約 '+(r.visitors-r.renewals)+' 人次').join('。')+'。</p>';
  }
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
      '<p><strong>'+esc(top.filter(r=>loss(r)===loss(top[0])).map(r=>r.label).join('、'))+'</strong>　各 '+loss(top[0])+' 筆，占此表未續約 '+percent(loss(top[0]),total)+'。'+
      (!tariff?'此表未續約合計 '+total+' 筆（N 與無續約），依 KPI 日報口徑。':'')+'</p><div class="table-scroll"><table class="insight-table"><thead><tr><th>'+(tariff?'原資費':'原專案')+'</th><th>續約 Y</th><th>未續約 N</th>'+(tariff?'':'<th>無續約</th>')+'<th>占本表未續約</th></tr></thead><tbody>'+top.map(r=>'<tr><th>'+esc(r.label)+'</th><td>'+r.yes+'</td><td>'+r.no+'</td>'+(tariff?'':'<td>'+r.none+'</td>')+'<td>'+percent(loss(r),total)+'</td></tr>').join('')+'</tbody></table></div>')+'</section>';
  }
  function compareCutoffs(d,conversion,records,official,prior){
    if(!official||!prior.visitors||d.start!==conversion.period_start||d.end>=conversion.cutoff)return '';
    const visitors=official.rt_d-prior.visitors,renewals=official.rt_n-prior.renewals;
    if(visitors<=0||renewals<0||renewals>visitors)return '';
    const rate=official.rt_n/official.rt_d,previous=prior.renewals/prior.visitors,delta=(rate-previous)*100;
    const next=new Date(Date.parse(d.end)+86400000).toISOString().slice(0,10);
    const daily=Core.dailySeries(records,'daily',next,conversion.cutoff);
    const dailyNote=daily.length<=7?'每日續約／來客為 '+daily.map(r=>esc(r.date.slice(5).replace('-','/'))+' '+r.rt_n+'／'+r.rt_d).join('、')+'。':'';
    return '<p class="insight-evidence"><strong>新增來客締結率 '+percent(renewals,visitors)+'</strong>　'+esc(next)+'～'+esc(conversion.cutoff)+' 新增 '+visitors+' 人次、續約 '+renewals+' 件、未續約 '+(visitors-renewals)+' 人次。'+dailyNote+'累計締結率由 '+percent(prior.renewals,prior.visitors)+' 變為 '+percent(official.rt_n,official.rt_d)+'（'+(delta>0?'+':'')+delta.toFixed(1)+' 個百分點）。此區間各 Tier 與原方案需另有同期明細才能歸因。</p>';
  }
  function render(evidence,stores,conversion,{showTotal=true}={}){
    const e=evidence||{},ids=new Set(stores.map(s=>s.id));
    const records=conversion?.records.filter(r=>ids.has(r.store)),official=records?Core.aggregate(records):null;
    let html='<h2>續約洞察｜'+esc(stores.length===1?stores[0].short:'北一二B 九店')+'</h2>';
    if(showTotal&&official){
      const r=official;
      html+='<p>'+esc(conversion.period_start)+'～'+esc(conversion.cutoff)+' · 續約 '+r.rt_n+'／有效來客 '+r.rt_d+'，締結率 '+percent(r.rt_n,r.rt_d)+'，未續約 '+(r.rt_d-r.rt_n)+' 人次。</p>';
    }
    if(e.detail?.detail){
      const d=e.detail;
      if(d.detail.coverage.tiers){
        const rows=d.detail.tiers.filter(t=>ids.has(t.store)),n=rows.reduce((v,t)=>v+t.renewals,0),v=rows.reduce((v,t)=>v+t.visitors,0);
        const samePeriod=records&&Core.aggregate(records.filter(r=>r.date<=d.end));
        html+='<p>'+esc(d.start)+'～'+esc(d.end)+' · '+esc(d.source)+' · 進店行為表續約 '+n+'／'+v+'，締結率 '+percent(n,v)+'。</p>';
        if(samePeriod&&samePeriod.rt_d===v&&samePeriod.rt_n===n)html+=compareCutoffs(d,conversion,records,official,{visitors:v,renewals:n});
        html+=originsHtml(d,ids,'RT 總表');
      }
      html+=Detail.render({period_start:d.start,cutoff:d.end,stores:Core.STORES,renewalDetail:d.detail},stores);
    }else html+='<section class="panel"><h3>門市 Tier 與原方案來源</h3><p>本次來源缺少門市 Tier 進店行為明細。</p></section>';
    html+=ranked(e.tariffs,stores,true)+ranked(e.daily,stores,false)+originsHtml(e.daily,ids,'KPI 日報');
    if(!e.daily&&!e.detail?.detail?.coverage.plans)html+='<p class="sub">本次來源缺少可核對的原專案未續約紀錄。</p>';
    if(e.tariffs||e.daily)html+='<p class="sub">各表獨立計算。資費或專案集中情形與 Tier 是否重疊，需以同期間、同用戶的服務紀錄核對。</p>';
    return html;
  }
  const sheets=['AQ締結率','RT每日','RT締結率',...Detail.SHEETS,'續約率(分母)'];
  return {validate,fromConversion,sourceStatus,parse,sheets,render};
});
