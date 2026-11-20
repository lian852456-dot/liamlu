import {priceTop3Text} from './tradein-price-top3.mjs?v=20261105-1';
import './offline-html.js';
import {formatDifference,formatRecoveredModels,reminderText,regionProgressLine} from './tradein-export-core.mjs?v=20261120-store-trend';
import {renderStoreTrend,trendCss,trendScript} from './tradein-export-trend.mjs?v=20261120-store-trend';
const H=globalThis.OfflineHtml;
const count=value=>value===null?'待核':value+' 台';
const name=row=>row.name?row.store+'｜'+row.name:row.store;
// Rank only known counts in the selected scope. Unknowns never become zero.
export function rankings(rows){
  const known=rows.filter(r=>Number.isSafeInteger(r.actual)&&r.actual>=0);
  const sorted=[...known].sort((a,b)=>b.actual-a.actual||name(a).localeCompare(name(b),'zh-Hant'));
  if(!sorted.length)return {top:[],bottom:[],unknown:rows.length,equal:false,total:0};
  const ranked=sorted.map(r=>({...r,rank:1+sorted.filter(x=>x.actual>r.actual).length}));
  const top=ranked.slice(0,3),topIds=new Set(top);
  const bottom=[...ranked].reverse().filter(r=>!topIds.has(r)).sort((a,b)=>a.actual-b.actual||name(a).localeCompare(name(b),'zh-Hant')).slice(0,3);
  return {top,bottom,unknown:rows.length-known.length,equal:sorted.every(r=>r.actual===sorted[0].actual),total:sorted.length,
    tiedTop:sorted.filter(r=>r.actual===top.at(-1)?.actual).length-top.filter(r=>r.actual===top.at(-1)?.actual).length,
    tiedBottom:bottom.length?sorted.filter(r=>r.actual===bottom.at(-1).actual).length-bottom.filter(r=>r.actual===bottom.at(-1).actual).length:0};
}
function rankingText(title,rows){
  const rank=rankings(rows),line=r=>`${r.rank}. ${name(r)} ${count(r.actual)}${r.target==null?(r.status==='不設目標'?'（不設目標）':''):`（差異 ${formatDifference(r.actual,r.target)}）`}`;
  if(!rank.total)return [title+'｜資料待核'];
  if(rank.equal)return [title+`｜${rank.total} ${title==='店點'?'店':'人'}同為 ${count(rank.top[0].actual)}，並列`,...rank.top.map(line),...(rank.total>3?[`另 ${rank.total-3} 筆同台數並列`]:[]),...(rank.unknown?[`${rank.unknown} 筆實績待核，未列入排名`]:[])];
  return [title+' TOP3',...rank.top.map(line),...(rank.tiedTop?[`末位另有 ${rank.tiedTop} 筆同台數並列`]:[]),
    ...(rank.bottom.length?[title+' BOT3',...rank.bottom.map(line),...(rank.tiedBottom?[`末位另有 ${rank.tiedBottom} 筆同台數並列`]:[])]:[]),
    ...(rank.unknown?[`${rank.unknown} 筆實績待核，未列入排名`]:[])];
}
export function reminderBrief(model){
  const r=model.rules;
  const models=new Map();for(const row of model.rows)for(const m of row.recoveredModels||[])models.set(m.model,(models.get(m.model)||0)+m.units);
  const focus=[...models].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-Hant')).slice(0,3);
  return [r.isDemo?'【舊換新提醒｜示意資料】':'【舊換新重點提醒】',
    `${r.selectedDate?'單日 '+r.selectedDate:r.month+'｜截至 '+r.cutoff}｜${model.scopeLabel}`,
    ...(model.region?[regionProgressLine(model.region)]:[]),
    r.selectedDate?'依當日回收台數排序；月目標請切回整月。':`依累積回收台數排序；個人月目標 ${r.staffTarget} 台（${r.actingManager==='included'?'含店長及代理店長':'免目標者另列'}）；店／個人目標分開計算。`,
    '',...(model.stores?.length?rankingText('店點',model.stores):['店點排名｜目前範圍無完整店點彙總，待核']),
    '',...rankingText('個人',model.rows),'',
    '回收機款／參考價補充',...(focus.length?['本範圍回收機款：'+focus.map(([n,u])=>n+' × '+u).join('、')]:['目前範圍未提供回收機款。']),
    ...priceTop3Text(model.priceTop3),
    '同台數並列；TOP／BOT各列至多3筆，已列TOP不重列BOT。零值照列，待核不當0。',
    `來源 ${r.sourceStart}～${r.sourceEnd}（${r.timezone}）；僅代表來源截止快照。`
  ].join('\n');
}
const statusIcons={
  met:['✓','已達標','met'],
  over:['★','超標','met'],
  progress:['◔','追趕中','progress'],
  exempt:['—','不設目標','neutral'],
  pending:['?','待核','pending']
};
function statusIcon(person,escape){
  const key=person.actual===null?'pending':person.target===null?
    (person.status==='不設目標'?'exempt':'pending'):
    person.actual>person.target?'over':person.actual===person.target?'met':'progress';
  const [icon,label,tone]=statusIcons[key];
  return `<span class="status-icon ${tone}" title="${escape(label)}"><span aria-hidden="true">${icon}</span><span class="sr-only">${escape(label)}</span></span>`;
}

function renderStoreSummary(stores,daily,escape){
  if(!stores.length)return '';
  const sorted=[...stores].sort((a,b)=>(b.actual??-1)-(a.actual??-1));
  const ranked=sorted.filter(s=>s.actual!==null);
  const showRank=ranked.length>1;
  const headers=[...(showRank?['排名']:[]),'店點',daily?'當日回收':'實績',...(daily?[]:['月目標','達成率']),...(showRank?['超越所需']:[])];
  const rows=sorted.map(s=>{
    const ahead=s.actual===null?[]:ranked.filter(r=>r.actual>s.actual);
    const rank=s.actual===null?null:1+ahead.length;
    const next=ahead.at(-1);
    const rate=s.actual!==null&&s.target>0?Math.round(s.actual/s.target*1000)/10:null;
    const icon=s.actual>0&&rank<=3?['🥇','🥈','🥉'][rank-1]:'';
    const badge=rank===null?'—':`<span class="rank">${icon?`<span aria-hidden="true">${icon}</span> `:''}${rank}</span>`;
    const gap=next?`<strong>+${next.actual-s.actual+1} 台</strong>`:rank===1?'領先':'—';
    return `<tr>${showRank?`<td>${badge}</td>`:''}<th scope="row">${escape(s.store)}</th>
      <td><strong>${count(s.actual)}</strong></td>
      ${daily?'':`<td>${count(s.target)}</td><td>${rate===null?'—':`<span class="attainment"><progress max="100" value="${Math.min(rate,100)}" aria-label="${escape(s.store)}達成率"></progress><strong>${rate}%</strong></span>`}</td>`}
      ${showRank?`<td class="gap">${gap}</td>`:''}</tr>`;
  }).join('');
  return `<section><h2>店點進度</h2><div class="scroll" tabindex="0" aria-label="店點進度，可橫向捲動">
    <table class="stores"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
    ${showRank?'<p class="table-note">同台數並列 · ＋台數為超越最近領先店點所需的回收量</p>':''}</section>`;
}

const exportCss=`
*{box-sizing:border-box}
body{margin:0;background:#f5f7fa;color:#182333;font:16px/1.55 "Microsoft YaHei",system-ui,"Microsoft JhengHei",sans-serif}
main{max-width:1240px;margin:auto;padding:24px}
h1{border-left:5px solid #ff6900;padding-left:14px;margin:6px 0 12px;font-size:clamp(1.65rem,4.5vw,2.25rem)}
h2{margin:0 0 8px;font-size:1.35rem}
p{margin:6px 0}
.source-dates{white-space:nowrap}
.snapshot-note,.table-note{font-size:.88rem;color:#526276}
section,details{background:#fff;border:1px solid #dce3ea;border-radius:12px;padding:18px;margin:14px 0}
summary{font-weight:700;cursor:pointer}
pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}
.scroll{position:relative;overflow-x:auto}
table{width:100%;border-collapse:collapse;min-width:620px}
td,th{padding:8px 10px;text-align:left;border-bottom:1px solid #e0e7ef}
thead th{background:#edf2f8;color:#31465e;white-space:nowrap;font-size:.88rem}
tbody th{white-space:nowrap}
tbody tr:nth-child(even){background:#f8fafd}
.stores{min-width:530px}
.rank,.gap,.number{white-space:nowrap;font-variant-numeric:tabular-nums}
.gap strong{color:#155c81}
.attainment{display:flex;align-items:center;gap:8px;white-space:nowrap}
progress{width:clamp(64px,10vw,110px);height:8px;accent-color:#147b68}
#people tbody td:nth-child(-n+3),#people .delta{white-space:nowrap}
.status-icon{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:50%;font-weight:800}
.status-icon.met,.delta.met{color:#08614d}
.status-icon.met{background:#daf2e9}
.status-icon.progress,.delta.progress{color:#965019}
.status-icon.progress{background:#ffecd8}
.status-icon.pending{color:#6f4410;background:#fff1c7}
.role-icon,.status-icon.neutral{color:#475569;background:#edf2f8}
.status-key{display:flex;flex-wrap:wrap;gap:4px 12px;margin:8px 0;font-size:.85rem;color:#526276}
.status-key .status-icon{margin-right:4px;width:20px;height:20px}
.person-tools{display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;margin:6px 0}
input[type=search]{font:inherit;padding:6px 9px;width:min(230px,100%);border:1px solid #a9b8c9;border-radius:6px}
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
[hidden]{display:none!important}
@media(max-width:640px){
 main{padding:12px}
 section,details{padding:12px}
 td,th{padding:7px 8px}
 .stores{min-width:0;font-size:.85rem}
 .stores th,.stores td{padding:7px 4px;font-size:inherit;white-space:nowrap}
 .attainment{display:grid;gap:1px}
 .attainment progress{width:100%;max-width:46px;height:5px;grid-row:2}
 #people{min-width:490px}
 #people th,#people td{font-size:.85rem;padding:7px 5px}
}
@media print{input,label[for=query],#count{display:none}main{max-width:none;padding:0}.scroll{overflow:visible}table,.stores{font-size:11px;min-width:0}}
`;

export function createTradeinHtml(model){
  const e=H.escape,r=model.rules,daily=Boolean(r.selectedDate);
  const headers=daily?['店點','同仁','當日回收','回收機款']:['店點','同仁','狀態','實績／月目標','差異','尚缺','回收機款'];
  const rows=model.rows.map(p=>{
    const target=p.target!==null?p.target:(p.status==='不設目標'?'—':'待核');
    const actual=p.actual===null?'待核':p.actual;
    const tally=daily?count(p.actual):`${actual}／${target}`;
    const delta=p.actual===null||p.target===null?formatDifference(p.actual,p.target):formatDifference(p.actual,p.target).replace(' 台','');
    const deltaTone=p.actual===null||p.target===null?'':p.actual<p.target?'progress':'met';
    const roleIcon=p.role==='店長'?'◆':p.role==='代理店長'?'◇':'';
    return `<tr><td>${e(p.store)}</td><th scope="row"><strong>${e(p.name)}</strong> ${roleIcon?`<span class="role-icon" title="${e(p.role)}" aria-hidden="true">${roleIcon}</span>`:''}<span class="sr-only"> ${e(p.role)}</span></th>
      ${daily?'':`<td>${statusIcon(p,e)}</td>`}<td class="number"><strong>${e(tally)}</strong></td>
      ${daily?'':`<td class="delta ${deltaTone}">${e(delta)}</td><td>${p.remaining??'—'}</td>`}
      <td>${e(formatRecoveredModels(p.actual,p.recoveredModels))}</td></tr>`;
  }).join('');
  const statusKey=daily?'':`<div class="status-key" aria-hidden="true">${Object.values(statusIcons).map(([icon,label,tone])=>
    `<span><span class="status-icon ${tone}">${icon}</span>${label}</span>`).join('')}</div>`;
  const priceProof=model.priceTop3?.rows?.length?'<details><summary>回收價來源、列號與料號</summary><pre>'+e('匯入檔：'+model.priceTop3.fileName+'\n匯入檔 SHA-256：'+model.priceTop3.sha256+'\n'+model.priceTop3.rows.map(p=>p.model+' '+p.capacity+'｜'+p.vendor+' '+p.grade+'｜'+p.sourceFile+'／'+p.sourceSheet+' 第 '+p.sourceRows.join('、')+' 列\n來源檔 SHA-256：'+p.sourceSha256+'\n原始規格／色款：'+p.rawModels.join('、')+'\n料號：'+p.parts.join('、')).join('\n\n'))+'</pre></details>':'';
  const body=`<main><header><h1>舊換新｜${daily?'單日回收':'每月進度'}</h1><p>${e(model.scopeLabel)}｜來源 <span class="source-dates">${e(r.sourceStart)}～${e(r.sourceEnd)}</span></p>
    <p class="snapshot-note">唯讀快照 · ${r.isDemo?'合成示意資料':'同仁姓名已遮罩'}</p>
    ${model.region?`<p><strong>${e(regionProgressLine(model.region))}</strong></p>`:''}</header>
    ${renderStoreTrend(model.storeTrend,e)}
    ${renderStoreSummary(model.stores||[],daily,e)}
    <section><h2>完整人員明細（${model.rows.length} 人）</h2>
    <div class="person-tools"><label for="query">搜尋店點／人員／機款</label><input id="query" type="search"><span id="count" class="snapshot-note" aria-live="polite"></span></div>
    ${statusKey}<div class="scroll" tabindex="0" aria-label="同仁明細，可橫向捲動"><table id="people"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></section>
    <details${model.priceTop3?.rows?.length?' open':''}><summary>重點提醒與回收參考價</summary><pre>${e(reminderBrief(model))}</pre></details>
    ${priceProof}<details><summary>來源與統計規則</summary><pre>${e(reminderText(model))}</pre></details></main>`;
  return H.create({title:'舊換新｜'+r.month+'唯讀快照',body,css:exportCss+trendCss,script:`
const q=document.getElementById('query'),rows=[...document.querySelectorAll('#people tbody tr')];
function filter(){
  const term=q.value.trim().toLocaleLowerCase();
  let n=0;
  for(const row of rows){
    row.hidden=!row.textContent.toLocaleLowerCase().includes(term);
    if(!row.hidden)n++;
  }
  document.getElementById('count').textContent='顯示 '+n+'／'+rows.length+' 人';
}
q.addEventListener('input',filter);filter();`+trendScript});
}
