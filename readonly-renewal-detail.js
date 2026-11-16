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
 const cross=value.coverage?.cross===true?validateCross(value.cross,stores,start,cutoff):[];
 if(value.coverage?.cross!==true&&value.cross?.length)fail('同源交叉來源完整性不符');
 if(value.coverage?.cross!==undefined)coverage.cross=value.coverage.cross===true;
 const issues={};
 for(const key of ['tiers','observation','plans','cross']){
  if(value.issues?.[key]&&!coverage[key])issues[key]=String(value.issues[key]).slice(0,400);
 }
 return {schema:'north12-renewal-detail/v1',period_start:start,cutoff,tiers,observation,plans,coverage,...(coverage.cross?{cross}:{}),...(Object.keys(issues).length?{issues}:{})};
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
// Cross only fields that coexist on the same eligible visit. Independent
// Tier and plan totals never produce a joint distribution.
function parseCross(workbook,XLSX,data,detail){
 const p=rows(workbook,XLSX,SHEETS[2]);if(!p)fail('原報未提供未續約明細，無法交叉 Tier 與原資費／專案');
 const h=(p[0]||[]).map(norm),column=(...names)=>{
  const found=h.flatMap((label,index)=>names.includes(label)?[index]:[]);
  if(found.length!==1)fail('同源交叉缺少或重複 '+names[0]);return found[0];
 };
 const si=column('進店店點代碼'),ri=column('進店課別'),di=column('進店日期'),
  pi=column('方案描述(含換約案)','方案描述'),ti=column('Tier'),
  fi=column('方案時專案V+D資費(含換約案)'),yi=column('續約Y/N'),
  ei=column('@是否符合續約資格_進店(含提前續約)_E-15'),ui=column('SubscrId(2T)');
 const stores=new Map(data.stores.map(store=>[store.id,store])),seen=new Map(),groups=new Map();
 for(const row of p.slice(1)){
  const store=stores.get(row[si]);if(!store)continue;
  if(row[ri]!==store.region)fail('同源交叉店碼與區域不符');
  if(norm(row[ei])!=='1.符合續約資格')continue;
  const serial=row[di];if(!Number.isSafeInteger(serial)||serial<40000||serial>90000)fail('同源交叉進店日期不符');
  const date=new Date(Date.UTC(1899,11,30)+serial*86400000).toISOString().slice(0,10);
  if(date<data.period_start||date>data.cutoff)fail('同源交叉日期超出來源期間');
  const tier=norm(row[ti]),plan=String(row[pi]??'').trim(),tariff=String(row[fi]??'').trim(),renewed=norm(row[yi]);
  if(!TIERS.includes(tier)||!plan||plan.length>500||!tariff||tariff.length>100||!['Y','N'].includes(renewed))fail('同源交叉 Tier／專案／資費／續約標記不完整');
  if(row[ui]==null||!String(row[ui]).trim())fail('同源交叉缺少去重識別');
  const key=JSON.stringify([store.id,date,String(row[ui])]),signature=JSON.stringify([tier,plan,tariff,renewed]);
  if(seen.has(key)){if(seen.get(key)!==signature)fail('同源交叉同店日用戶重複且衝突');continue;}seen.set(key,signature);
  const groupKey=JSON.stringify([store.id,date,tier,plan,tariff]);
  if(!groups.has(groupKey))groups.set(groupKey,{store:store.id,date,tier,plan,tariff,visitors:0,renewals:0,unrenewed:0});
  const group=groups.get(groupKey);group.visitors++;if(renewed==='Y')group.renewals++;else group.unrenewed++;
 }
 const cross=[...groups.values()];
 // Reject N-only extracts and incomplete visit populations before rates exist.
 const totals=new Map();for(const row of cross){const key=row.store+'|'+row.date;if(!totals.has(key))totals.set(key,{visitors:0,renewals:0});const total=totals.get(key);total.visitors+=row.visitors;total.renewals+=row.renewals;}
 for(const row of data.records){const total=totals.get(row.store+'|'+row.date)||{visitors:0,renewals:0};if(total.visitors!==row.rt_d||total.renewals!==row.rt_n)fail('同源交叉未與 RT 每日同店日分子／分母核平；不推估締結率');}
 if(detail.coverage.tiers)for(const row of detail.tiers){const match=cross.filter(item=>item.store===row.store&&item.tier===row.tier);if(match.reduce((sum,item)=>sum+item.visitors,0)!==row.visitors||match.reduce((sum,item)=>sum+item.renewals,0)!==row.renewals)fail('同源交叉未與 Tier 店表核平；不拼接不同母體');}
 return cross;
}
function validateCross(rows,stores,start,end){
 if(!Array.isArray(rows)||rows.length>200000)fail('同源交叉彙總格式不符');
 const ids=new Set(stores.map(store=>store.id)),seen=new Set();
 return rows.map(row=>{
  if(!ids.has(row.store)||!TIERS.includes(row.tier)||typeof row.date!=='string'||!/^20\d\d-\d\d-\d\d$/.test(row.date)||!Number.isFinite(Date.parse(row.date+'T00:00:00Z'))||new Date(row.date+'T00:00:00Z').toISOString().slice(0,10)!==row.date||row.date<start||row.date>end||typeof row.plan!=='string'||!row.plan.trim()||row.plan.length>500||typeof row.tariff!=='string'||!row.tariff.trim()||row.tariff.length>100)fail('同源交叉分組不符');
  const clean={store:row.store,date:row.date,tier:row.tier,plan:row.plan,tariff:row.tariff,visitors:count(row.visitors),renewals:count(row.renewals),unrenewed:count(row.unrenewed)};
  if(!clean.visitors||clean.renewals+clean.unrenewed!==clean.visitors)fail('同源交叉分子／分母不符');
  const key=JSON.stringify([clean.store,clean.date,clean.tier,clean.plan,clean.tariff]);if(seen.has(key))fail('同源交叉彙總鍵重複');seen.add(key);return clean;
 });
}
function renderCross(data,stores,{start=data.period_start,end=data.cutoff}={}){
 const detail=data.renewalDetail;
 let html='<section class="panel insight-panel"><h3>每週 Tier × 原資費／專案</h3><p class="sub">同源：未續約明細；同店／進店日／用戶去重，符合資格 Y＋N 為分母、Y 為分子。匯入時核對 RT 每日及已提供的 Tier 店表。F 依原表另列。本次未提供可核對的同仁集中來源。</p>';
 if(!detail?.coverage.cross)return html+'<p>'+esc(detail?.issues?.cross||'來源未提供可核對的同源交叉欄位；無法從各自彙總推算。')+'</p></section>';
 const ids=new Set(stores.map(store=>store.id)),groups=new Map();
 for(const row of detail.cross){if(!ids.has(row.store)||row.date<start||row.date>end)continue;
  const monday=new Date(row.date+'T00:00:00Z');monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);const week=monday.toISOString().slice(0,10),key=JSON.stringify([row.store,week,row.tier,row.plan,row.tariff]);
  if(!groups.has(key))groups.set(key,{...row,start:row.date,end:row.date,visitors:0,renewals:0,unrenewed:0});const total=groups.get(key);total.start=total.start<row.date?total.start:row.date;total.end=total.end>row.date?total.end:row.date;for(const field of ['visitors','renewals','unrenewed'])total[field]+=row[field];
 }
 const values=[...groups.values()].sort((a,b)=>b.unrenewed-a.unrenewed||a.store.localeCompare(b.store)||a.start.localeCompare(b.start));
 const label=date=>date.slice(5)+'（'+'日一二三四五六'[new Date(date+'T00:00:00Z').getUTCDay()]+'）';
 if(!values.length)return html+'<p>所選日期與門市沒有符合條件的進件。</p></section>';
 html+=table(['區／門市','週內觀測日','Tier','原資費','原專案','符合資格進店','已締結','未締結','締結率'],values.map(row=>{const store=stores.find(store=>store.id===row.store);return '<tr><td>'+esc(store.region+'／'+store.short)+'</td><td>'+label(row.start)+'～'+label(row.end)+'</td><td>'+row.tier+'</td><td>'+esc(row.tariff)+'</td><td>'+esc(row.plan)+'</td><td>'+n(row.visitors)+'</td><td>'+n(row.renewals)+'</td><td>'+n(row.unrenewed)+'</td><td>'+pct(row.renewals,row.visitors)+'</td></tr>';}).join(''));
 html+='<p class="sub">週一至週日分組；觀測日只列有符合資格進件的日期，不代表完整週。原表未提供獨立申請進件欄；進店人次不代替申請件數。</p>';
 for(const row of values.filter(row=>row.unrenewed>0&&row.tier!=='F').slice(0,3)){const store=stores.find(store=>store.id===row.store);html+='<div class="action"><strong>'+esc(store.short+'／Tier '+row.tier+'／原資費 '+row.tariff)+'</strong><p>'+esc(row.plan)+'：'+n(row.renewals)+'／'+n(row.visitors)+'（'+pct(row.renewals,row.visitors)+'），未締結 '+n(row.unrenewed)+' 筆。先按原合約、月費與使用需求核對這批未締結的回訪紀錄；下週核對同客群未締結件數與締結率。未締結原因須由實際紀錄確認。</p></div>';}
 return html+'</section>';
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
 try{result.cross=parseCross(workbook,XLSX,data,result);result.coverage.cross=true;}catch(error){result.coverage.cross=false;issues.cross=error.message;}
 return validate({...result,issues},data.stores,data.period_start,data.cutoff);
}
function importSummary(detail){
 if(!detail)return '';
 return [['tiers',SHEETS[1]],['observation',SHEETS[0]],['plans',SHEETS[2]],['cross','同源 Tier × 資費／專案']].map(([key,name])=>
  name+' — '+(detail.coverage[key]?'已載入':detail.issues?.[key]?'未載入，'+detail.issues[key]:'未提供')
 ).join('\n');
}
function unavailable(detail,key,name){
 return '<p>'+esc(detail.issues?.[key]?name+' 未通過核對，本項未載入。原因為 '+detail.issues[key]:'原報未提供 '+name+'。')+'</p>';
}
const n=v=>v.toLocaleString('zh-TW'),pct=(a,b)=>b?(100*a/b).toFixed(1)+'%':'—';
function table(head,body){return '<div class="table-scroll scroll"><table class="insight-table"><thead><tr>'+head.map(v=>'<th>'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div>';}
function render(data,selectedStores,{start=data.period_start,end=data.cutoff}={}){
 const d=data.renewalDetail;if(!d)return '<section class="panel"><h3>Tier／未續約方案資料</h3><p>目前快照未包含分析頁籤；請匯入包含 Tier觀察、RT用戶進店行為_店、未續約明細 的完整原報。</p></section>';
 if(start!==data.period_start||end!==data.cutoff)return '<section class="panel"><h3>Tier／原方案未續約</h3><p>這三張來源為整段期間統計，請恢復 '+esc(data.period_start)+' 至 '+esc(data.cutoff)+' 查看，避免套用到不同日期。</p></section>'+renderCross(data,selectedStores,{start,end});
 const ids=new Set(selectedStores.map(s=>s.id)),regions=new Set(selectedStores.map(s=>s.region)),ts=d.tiers.filter(t=>ids.has(t.store)),ps=d.plans.filter(p=>ids.has(p.store));
 const groups=TIERS.map(tier=>{const rows=ts.filter(t=>t.tier===tier),out={tier,visitors:0,renewals:0,npOut:0,terminated:0,visitOnly:0};for(const r of rows)for(const k of ['visitors','renewals','npOut','terminated','visitOnly'])out[k]+=r[k];return out;});
 let html='<section class="panel insight-panel"><h3>Tier A～F 掌握分析</h3><p class="sub">來源：RT用戶進店行為_店｜'+esc(data.period_start)+'～'+esc(data.cutoff)+'｜所選 '+selectedStores.length+' 店；締結率＝續約／符合資格進店人次。</p>';
 html+=d.coverage.tiers?table(['Tier','來客','續約','締結率','NP OUT','退租','單純進店'],groups.map(t=>'<tr><th>'+t.tier+'</th><td>'+n(t.visitors)+'</td><td>'+n(t.renewals)+'</td><td>'+pct(t.renewals,t.visitors)+'</td><td>'+n(t.npOut)+'</td><td>'+n(t.terminated)+'</td><td>'+n(t.visitOnly)+'</td></tr>').join('')):unavailable(d,'tiers',SHEETS[1]);
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
 return html+'</section>'+renderCross(data,selectedStores,{start,end});
}
return Object.freeze({SHEETS,TIERS,parse,parseAvailable,importSummary,validate,render,parseCross,renderCross});
});
