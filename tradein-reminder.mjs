import {priceTop3Text} from './tradein-price-top3.mjs?v=20261105-1';
import './offline-html.js';
import {formatDifference,formatRecoveredModels,reminderText,regionProgressLine} from './tradein-export-core.mjs?v=20261106-region-154';
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
export function createTradeinHtml(model){
  const e=H.escape,r=model.rules,daily=Boolean(r.selectedDate),headers=daily?['店點','人員','職務','當日回收','回收機款']:['店點','人員','職務','實績','月目標','目前差異','尚缺','狀態','回收機款'];
  const rows=model.rows.map(p=>'<tr>'+[p.store,p.name,p.role,count(p.actual),...(daily?[]:[p.target===null?(p.status==='不設目標'?'不設目標':'待核'):count(p.target),formatDifference(p.actual,p.target),p.remaining===null?'不適用／待核':count(p.remaining),p.status]),formatRecoveredModels(p.actual,p.recoveredModels)].map(v=>'<td>'+e(v)+'</td>').join('')+'</tr>').join('');
  const stores=(model.stores||[]).map(s=>'<tr><td>'+e(s.store)+'</td><td>'+e(count(s.actual))+'</td><td>'+e(count(s.target))+'</td></tr>').join('');
  const priceProof=model.priceTop3?.rows?.length?'<details><summary>回收價來源、列號與料號</summary><pre>'+e('匯入檔：'+model.priceTop3.fileName+'\n匯入檔 SHA-256：'+model.priceTop3.sha256+'\n'+model.priceTop3.rows.map(p=>p.model+' '+p.capacity+'｜'+p.vendor+' '+p.grade+'｜'+p.sourceFile+'／'+p.sourceSheet+' 第 '+p.sourceRows.join('、')+' 列\n來源檔 SHA-256：'+p.sourceSha256+'\n原始規格／色款：'+p.rawModels.join('、')+'\n料號：'+p.parts.join('、')).join('\n\n'))+'</pre></details>':'';
  const body='<main><h1>舊換新｜'+e(daily?'單日回收':'每月進度')+'</h1><p>'+e(model.scopeLabel)+'｜來源 '+e(r.sourceStart)+'～'+e(r.sourceEnd)+'</p><p>唯讀快照；完整明細保留於本檔，資料不會自動更新。'+(r.isDemo?'本檔為合成示意資料。':'姓名沿用已授權畫面的遮罩。')+'</p><section><h2>重點提醒</h2><pre>'+e(reminderBrief(model))+'</pre></section>'+
    (stores?'<section><h2>店點彙總</h2><div class="scroll"><table><thead><tr><th>店點</th><th>實績</th><th>月目標</th></tr></thead><tbody>'+stores+'</tbody></table></div></section>':'')+
    '<section><h2>完整人員明細（'+model.rows.length+' 人）</h2><label>搜尋店點／人員／機款 <input id="query" type="search"></label><p id="count"></p><div class="scroll"><table id="people"><thead><tr>'+headers.map(h=>'<th>'+e(h)+'</th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table></div></section>'+priceProof+'<details><summary>來源與統計規則</summary><pre>'+e(reminderText(model))+'</pre></details></main>';
  return H.create({title:'舊換新｜'+r.month+'唯讀快照',body,css:'*{box-sizing:border-box}body{margin:0;background:#f6f7fa;color:#182333;font:16px/1.65 system-ui,"Microsoft JhengHei",sans-serif}main{max-width:1280px;margin:auto;padding:24px}h1{border-left:5px solid #ff6900;padding-left:16px}section,details{background:white;border:1px solid #dce3ea;border-radius:12px;padding:20px;margin:20px 0}pre{font:inherit;white-space:pre-wrap;overflow-wrap:anywhere}.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:650px}td,th{padding:10px;text-align:left;border-bottom:1px solid #dce3ea}input{font:inherit;padding:8px;max-width:100%}[hidden]{display:none!important}@media(max-width:600px){main{padding:14px}section{padding:14px}}@media print{input,label,#count{display:none}main{max-width:none;padding:0}.scroll{overflow:visible}table{font-size:11px;min-width:0}}',script:'const q=document.getElementById("query"),rows=[...document.querySelectorAll("#people tbody tr")];function filter(){let n=0;for(const row of rows){row.hidden=!row.textContent.toLocaleLowerCase().includes(q.value.toLocaleLowerCase());if(!row.hidden)n++;}document.getElementById("count").textContent="顯示 "+n+"／"+rows.length+" 人";}q.addEventListener("input",filter);filter();'});
}
