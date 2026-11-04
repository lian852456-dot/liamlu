(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ReadonlyRenewalDetail=api;})(typeof globalThis==='object'?globalThis:this,function(){
'use strict';
const SHEETS=['Tier觀察','RT用戶進店行為_店','未續約明細'],TIERS=['A','B','C','D','E','F'];
const norm=v=>String(v??'').replace(/\s+/g,''),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function fail(s){throw Error(s);}
function count(v){if(!Number.isSafeInteger(v)||v<0)fail('續約分析人次須為非負整數');return v;}
function signedCount(v){if(!Number.isSafeInteger(v)||Math.abs(v)>100000000)fail('來源行為數格式不符');return v;}
function rows(w,X,name){return w.Sheets[name]?X.utils.sheet_to_json(w.Sheets[name],{header:1,raw:true,defval:null,blankrows:true}):null;}
function validate(value,stores,start,cutoff){
 if(value==null)return null;if(value.schema!=='north12-renewal-detail/v1'||value.period_start!==start||value.cutoff!==cutoff)fail('續約分析期間不一致');
 const ids=new Set(stores.map(s=>s.id)),regions=new Set(stores.map(s=>s.region)),unique=new Set();
 function list(key,max,project){if(!Array.isArray(value[key])||value[key].length>max)fail('續約分析格式不符');return value[key].map(project);}
 function once(key){if(unique.has(key))fail('續約分析彙總鍵重複');unique.add(key);}
 const tiers=list('tiers',stores.length*6,r=>{if(!ids.has(r.store)||!TIERS.includes(r.tier))fail('Tier 店點不符');once('t|'+r.store+'|'+r.tier);const out={store:r.store,tier:r.tier};for(const k of ['visitors','renewals','npOut','terminated','visitOnly'])out[k]=k==='visitOnly'?signedCount(r[k]):count(r[k]);if(out.renewals+out.npOut+out.terminated+out.visitOnly!==out.visitors)fail('Tier 行為合計不符');return out;});
 if(tiers.length&&tiers.length!==stores.length*6)fail('Tier 店點缺漏');
 const observation=list('observation',regions.size*10,r=>{if(!regions.has(r.region)||!['A','B','C','D','E'].includes(r.tier)||!['TWM','TST'].includes(r.origin))fail('Tier觀察分組不符');once('o|'+r.region+'|'+r.origin+'|'+r.tier);const out={region:r.region,origin:r.origin,tier:r.tier,renewals:count(r.renewals),visitors:count(r.visitors)};if(out.renewals>out.visitors)fail('Tier觀察分子超過分母');return out;});
 if(observation.length&&observation.length!==regions.size*10)fail('Tier觀察區域缺漏');
 const plans=list('plans',200000,r=>{if(!ids.has(r.store)||typeof r.plan!=='string'||!r.plan.trim()||r.plan.length>500)fail('未續約方案分組不符');once('p|'+r.store+'|'+r.plan);return {store:r.store,plan:r.plan,unrenewed:count(r.unrenewed)};});
 const coverage={tiers:value.coverage?.tiers===true,observation:value.coverage?.observation===true,plans:value.coverage?.plans===true};
 if(coverage.tiers&&!tiers.length||!coverage.tiers&&tiers.length||coverage.observation&&!observation.length||!coverage.observation&&observation.length||!coverage.plans&&plans.length)fail('續約分析來源完整性不符');
 return {schema:'north12-renewal-detail/v1',period_start:start,cutoff,tiers,observation,plans,coverage};
}
function parse(w,X,data){
 const stores=data.stores,byId=new Map(stores.map(s=>[s.id,s])),regions=new Set(stores.map(s=>s.region)),tiers=[],observation=[],plans=new Map();
 const b=rows(w,X,SHEETS[1]),o=rows(w,X,SHEETS[0]),p=rows(w,X,SHEETS[2]);
 if(b){for(const [i,tier]of TIERS.entries()){const c=4+5*i;if(norm(b[1]?.[c])!==tier||norm(b[3]?.[c])!=='符合續約資格進店用戶數'||norm(b[3]?.[c+1])!=='1.續約'||norm(b[3]?.[c+2])!=='2.NPOUT'||norm(b[3]?.[c+3])!=='3.退租'||norm(b[3]?.[c+4])!=='4.單純進店')fail('RT用戶進店行為_店 欄位版型不符');}
  for(const r of b.slice(4)){const s=byId.get(r[2]);if(!s)continue;if(r[1]!==s.region||norm(r[3])!==norm(s.name))fail('Tier 店碼／區域／店名不一致');const group=TIERS.map((tier,i)=>({store:s.id,tier,visitors:count(r[4+5*i]),renewals:count(r[5+5*i]),npOut:count(r[6+5*i]),terminated:count(r[7+5*i]),visitOnly:signedCount(r[8+5*i])}));for(const [i,k]of ['visitors','renewals','npOut','terminated','visitOnly'].entries())if(group.reduce((n,t)=>n+t[k],0)!==(k==='visitOnly'?signedCount(r[34+i]):count(r[34+i])))fail('Tier A～F 與 TTL 不一致');tiers.push(...group);}
 }
 if(o){const label=String(o[0]?.[1]||''),m=label.match(/\((\d+)\/(\d+)\s*~\s*(\d+)\/(\d+)\)/);if(!m||Number(m[1])!==Number(data.period_start.slice(5,7))||Number(m[2])!==1||Number(m[3])!==Number(data.cutoff.slice(5,7))||Number(m[4])!==Number(data.cutoff.slice(-2)))fail('Tier觀察期間不符');
  for(const [origin,offset]of [['TWM',3],['TST',21]]){if(norm(o[1]?.[offset])!=='原'+origin+'用戶')fail('Tier觀察用戶來源不符');for(let i=0;i<5;i++){const c=offset+3*i;if(norm(o[2]?.[c])!==TIERS[i]||norm(o[3]?.[c])!=='上線數'||norm(o[3]?.[c+1])!=='來客數')fail('Tier觀察欄位版型不符');}}
  for(const r of o.slice(4)){if(!regions.has(r[1]))continue;for(const [origin,offset]of [['TWM',3],['TST',21]])for(let i=0;i<5;i++)observation.push({region:r[1],origin,tier:TIERS[i],renewals:count(r[offset+3*i]),visitors:count(r[offset+3*i+1])});}
 }
 if(p){const h=p[0].map(norm),column=(...names)=>{const i=h.findIndex(v=>names.includes(v));if(i<0)fail('未續約明細缺少 '+names[0]);return i;};
  const si=column('進店店點代碼'),ri=column('進店課別'),di=column('進店日期'),pi=column('方案描述(含換約案)','方案描述'),yi=column('續約Y/N'),ei=column('@是否符合續約資格_進店(含提前續約)_E-15'),ui=column('SubscrId(2T)');const seen=new Map();
  for(const r of p.slice(1)){const s=byId.get(r[si]);if(!s)continue;if(r[ri]!==s.region)fail('未續約明細店碼與區域不符');if(norm(r[ei])!=='1.符合續約資格')continue;if(!['Y','N'].includes(norm(r[yi])))fail('未續約明細續約標記不符');
   const serial=r[di];if(!Number.isSafeInteger(serial)||serial<40000||serial>90000)fail('未續約明細進店日期不符');const date=new Date(Date.UTC(1899,11,30)+serial*86400000).toISOString().slice(0,10);if(date<data.period_start||date>data.cutoff)fail('未續約明細日期超出來源期間');
   if(r[ui]==null||String(r[ui]).trim()==='')fail('未續約明細缺少去重識別');const plan=String(r[pi]??'').trim()||'方案描述未提供',key=s.id+'|'+date+'|'+String(r[ui]),signature=JSON.stringify([plan,norm(r[yi])]);if(seen.has(key)){if(seen.get(key)!==signature)fail('未續約明細同店日用戶重複且衝突');continue;}seen.set(key,signature);if(norm(r[yi])!=='N')continue;const pk=JSON.stringify([s.id,plan]);if(!plans.has(pk))plans.set(pk,{store:s.id,plan,unrenewed:0});plans.get(pk).unrenewed++;
  }
 }
 return validate({schema:'north12-renewal-detail/v1',period_start:data.period_start,cutoff:data.cutoff,tiers,observation,plans:[...plans.values()],coverage:{tiers:!!b,observation:!!o,plans:!!p}},stores,data.period_start,data.cutoff);
}
const n=v=>v.toLocaleString('zh-TW'),pct=(a,b)=>b?(100*a/b).toFixed(1)+'%':'—';
function table(head,body){return '<div class="table-scroll scroll"><table class="insight-table"><thead><tr>'+head.map(v=>'<th>'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+body+'</tbody></table></div>';}
function render(data,selectedStores,{start=data.period_start,end=data.cutoff}={}){
 const d=data.renewalDetail;if(!d)return '<section class="panel"><h3>Tier／未續約方案資料</h3><p>目前快照未包含分析頁籤；請匯入包含 Tier觀察、RT用戶進店行為_店、未續約明細 的完整原報。</p></section>';
 if(start!==data.period_start||end!==data.cutoff)return '<section class="panel"><h3>Tier／原方案未續約</h3><p>這三張來源為整段期間統計，請恢復 '+esc(data.period_start)+' 至 '+esc(data.cutoff)+' 查看，避免套用到不同日期。</p></section>';
 const ids=new Set(selectedStores.map(s=>s.id)),regions=new Set(selectedStores.map(s=>s.region)),ts=d.tiers.filter(t=>ids.has(t.store)),ps=d.plans.filter(p=>ids.has(p.store));
 const groups=TIERS.map(tier=>{const rows=ts.filter(t=>t.tier===tier),out={tier,visitors:0,renewals:0,npOut:0,terminated:0,visitOnly:0};for(const r of rows)for(const k of ['visitors','renewals','npOut','terminated','visitOnly'])out[k]+=r[k];return out;});
 let html='<section class="panel insight-panel"><h3>Tier A～F 掌握分析</h3><p class="sub">來源：RT用戶進店行為_店｜'+esc(data.period_start)+'～'+esc(data.cutoff)+'｜所選 '+selectedStores.length+' 店；締結率＝續約／符合資格進店人次。</p>';
 html+=d.coverage.tiers?table(['Tier','來客','續約','締結率','NP OUT','退租','單純進店'],groups.map(t=>'<tr><th>'+t.tier+'</th><td>'+n(t.visitors)+'</td><td>'+n(t.renewals)+'</td><td>'+pct(t.renewals,t.visitors)+'</td><td>'+n(t.npOut)+'</td><td>'+n(t.terminated)+'</td><td>'+n(t.visitOnly)+'</td></tr>').join('')):'<p>原報未提供 RT用戶進店行為_店。</p>';
 if(ts.some(t=>t.visitOnly<0))html+='<p class="sub">資料提示：原報有單純進店負值，保留原值並列為待核對，不補零；不以此推定原因。</p>';
 if(ts.length){const weak=groups.filter(t=>t.visitors>=30).sort((a,b)=>a.renewals/a.visitors-b.renewals/b.visitors)[0];if(weak)html+='<p class="sub">優先檢視 Tier '+weak.tier+'：'+n(weak.renewals)+'／'+n(weak.visitors)+'（'+pct(weak.renewals,weak.visitors)+'）。可先檢查單純進店未續約案件，再核對 NP OUT／退租原因；此為檢查方向。</p>';html+='<details><summary>各店同 Tier 比較</summary>'+table(['區域／門市','Tier','來客','續約','締結率'],ts.map(t=>{const s=selectedStores.find(s=>s.id===t.store);return '<tr><td>'+esc(s.region+'／'+s.short)+'</td><td>'+t.tier+'</td><td>'+n(t.visitors)+'</td><td>'+n(t.renewals)+'</td><td>'+pct(t.renewals,t.visitors)+'</td></tr>';}).join(''))+'</details>';}
 html+='</section><section class="panel insight-panel"><h3>原 TWM／TST・Tier 觀察</h3><p class="sub">來源：Tier觀察。原報此表提供區級 A～E 彙總；F 與單店 TWM／TST 分拆未提供。區級資料只於整區完整選取時顯示。</p>';
 const whole=[...regions].every(region=>data.stores.filter(s=>s.region===region).every(s=>ids.has(s.id)));
 if(!whole)html+='<p>目前選取單店，區級 TWM／TST 不套用為該店數值。</p>';
 else if(!d.coverage.observation)html+='<p>原報未提供 Tier觀察。</p>';
 else{const obs=d.observation.filter(t=>regions.has(t.region));html+=table(['用戶','A～E 來客','續約','締結率'],['TWM','TST'].map(origin=>{const rs=obs.filter(t=>t.origin===origin),v=rs.reduce((s,t)=>s+t.visitors,0),r=rs.reduce((s,t)=>s+t.renewals,0);return '<tr><td>'+origin+'</td><td>'+n(v)+'</td><td>'+n(r)+'</td><td>'+pct(r,v)+'</td></tr>';}).join(''))+'<details><summary>展開四區與各 Tier 明細</summary>'+table(['區域','用戶','Tier','來客','續約','締結率'],obs.map(t=>'<tr><td>'+esc(t.region)+'</td><td>'+t.origin+'</td><td>'+t.tier+'</td><td>'+n(t.visitors)+'</td><td>'+n(t.renewals)+'</td><td>'+pct(t.renewals,t.visitors)+'</td></tr>').join(''))+'</details>'; }
 html+='</section><section class="panel insight-panel"><h3>原方案未續約 TOP 5</h3><p class="sub">來源：未續約明細 → 方案描述(含換約案)。限「1.符合續約資格」且續約 N；以同店／進店日／用戶去重。顯示未續約件數及占比，非方案未續約率。</p>';
 const byPlan=new Map();for(const p of ps)byPlan.set(p.plan,(byPlan.get(p.plan)||0)+p.unrenewed);const top=[...byPlan].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-TW')).slice(0,5),total=ps.reduce((s,p)=>s+p.unrenewed,0);
 html+=!d.coverage.plans?'<p>原報未提供 未續約明細。</p>':!top.length?'<p>所選範圍無符合條件的未續約紀錄。</p>':table(['方案描述','未續約件數','占未續約紀錄'],top.map(([plan,c])=>'<tr><td>'+esc(plan)+'</td><td>'+n(c)+'</td><td>'+pct(c,total)+'</td></tr>').join(''))+'<p class="sub">優先檢視首位方案的費用、設備與合約需求；原方案名稱無法直接判斷未續約原因，請以實際回訪紀錄核對。</p>';
 return html+'</section>';
}
return Object.freeze({SHEETS,TIERS,parse,validate,render});
});
