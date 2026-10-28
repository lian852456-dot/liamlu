// This parser returns aggregates only. Order identifiers never leave this module.
export const GOOD_SPEED_RULE = Object.freeze({longTermMonths:36,source36mComponent:0.5,battleBandwidthBonus:0.5,battleBonusSince:'2026-08-26',version:'daily-good-speed-2026-08-26'});
const groups=['北一二A','北一二B','北一二C','北一二D'];
const text=v=>String(v??'').trim();
const norm=v=>text(v).replace(/[\s()（）]/g,'');
const num=(v,label,integer=false)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<0||integer&&!Number.isInteger(v))throw Error(label+'缺值或格式不符；不以0代替');return v;};
const equal=(a,b,label)=>{if(Math.abs(a-b)>1e-7)throw Error(label+'加總不一致');};
function day(v){
  if(typeof v==='number'&&v>30000&&v<90000)return new Date(Date.UTC(1899,11,30)+Math.floor(v)*86400000).toISOString().slice(0,10);
  const m=text(v).match(/(20\d{2})[年/.-](\d{1,2})[月/.-](\d{1,2})/);if(!m)return null;
  const s=`${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;return new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s?s:null;
}
const month=(v,m)=>new RegExp(`^(?:${Number(m)}月|${Number(m)}|20\\d{2}[-/]${m})$`).test(text(v));
function header(rows,checks,label){
  // Verify the supplied version's column identities; shifted/renamed layouts stop.
  const first=rows.slice(0,10);
  for(const [column,pattern]of checks)if(!first.some(r=>pattern.test(norm(r[column]))))throw Error(label+'標題待對映：第'+(column+1)+'欄');
}
// Only known standard categories can be exported; free notes may contain PII.
const reasonLabels={C032:'資料錯誤',B033:'待客連絡',B01G:'未說明原因',B01A:'客戶言未申裝只是考慮、詢價',C061:'既有用戶',C022:'裝機時間無法配合',B019:'客與前業者綁約未到期',B018:'客戶最近沒空/出國',B011:'無暗管-客戶不拉明線',B031:'客手機、電話不通',C081:'門號於預約裝機前一日未開通，無法安排裝機'};
function reason(value){const s=text(value),code=s.match(/^([A-Z][0-9A-Z]{3})(?:\s|$)/)?.[1];return reasonLabels[code]?code+' '+reasonLabels[code]:s==='TWM取消交易'?s:'未對映標準分類（不匯出原文）';}
export function parseGoodSpeedSheets(sheets){
  const storeRows=sheets['BB店點'],quantity=sheets['BB量能'],detail=sheets['BB明細'];
  if(![storeRows,quantity,detail].every(Array.isArray))throw Error('需同一來源的BB店點、BB量能、BB明細三表');
  if(storeRows.length>10000||quantity.length>10000||detail.length>100000)throw Error('好速資料超出支援範圍');
  header(storeRows,[[1,/督導區/],[2,/店點代碼/],[3,/店點/],[8,/12M/i],[9,/24M/i],[10,/36M/i],[17,/合計.*筆數|筆數.*合計/],[32,/好速成雙.*點數|點數/],[43,/好速加掛.*點數|點數/],[54,/好速合計.*點數|合計點數/]],'BB店點');
  header(quantity,[[1,/督導區/],[2,/店名|店點/],[3,/月份/],[10,/總目標/],[11,/總進度/],[12,/月底推估/],[36,/同期點數/]],'BB量能');
  header(detail,[[1,/月份/],[2,/進件日/],[4,/認列分類/],[6,/單號/],[9,/業務分區/],[10,/進件店點代碼/],[48,/取消派工原因1/],[49,/取消派工原因2/],[50,/取消派工原因3/],[58,/重複.*取消/]],'BB明細');
  const cutoff=day(detail[0]?.[65]),dailyDates=(quantity[1]||[]).slice(38,65).map(day).filter(Boolean);
  if(!cutoff||!dailyDates.length||dailyDates.sort().at(-1)!==cutoff||dailyDates.some(d=>d.slice(0,7)!==cutoff.slice(0,7)))throw Error('好速截止日缺少或BB量能／BB明細不一致');
  const ym=cutoff.slice(0,7),m=cutoff.slice(5,7),seen=new Set(),stores=[];
  for(let i=0;i<storeRows.length;i++){const r=storeRows[i],group=text(r[1]);if(!groups.includes(group))continue;
    const code=text(r[2]);if(!/^DNB\d{5}$/.test(code)||seen.has(code))throw Error('BB店點店碼缺少或重複');seen.add(code);
    const store=text(r[3]);if(!store||store.length>60)throw Error('BB店點店名缺少或過長');
    const count12=num(r[8],'12M筆數',true),count24=num(r[9],'24M筆數',true),count36=num(r[10],'36M筆數',true),count=num(r[17],'合計筆數',true),paired=num(r[32],'成雙點數'),addon=num(r[43],'加掛點數'),points=num(r[54],'合計點數');
    equal(count,count12+count24+count36,'約期筆數');equal(points,paired+addon,'來源點數');
    stores.push({group,code,store,sourceRow:i+1,count12,count24,count36,count,paired,addon,points,longTermShare:count?count36/count:null});
  }
  const summaries=groups.map(group=>{
    const members=stores.filter(s=>s.group===group);if(!members.length)throw Error(group+'缺少店點資料');
    const matches=quantity.flatMap((r,i)=>text(r[1])===group&&!text(r[2])&&month(r[3],m)?[{r,i}]:[]);
    if(matches.length!==1)throw Error(group+'當月區合計不唯一');const {r,i}=matches[0];
    const result={group,storeCount:members.length,stores:members,quantityRow:i+1,target:num(r[10],'總目標'),sourceProgress:num(r[11],'來源總進度'),forecast:num(r[12],'月底推估'),previousSamePeriodPoints:num(r[36],'同期點數')};
    for(const k of ['points','count12','count24','count36','count','paired','addon'])result[k]=members.reduce((n,s)=>n+s[k],0);
    result.pointsTargetRatio=result.target?result.points/result.target:null;result.longTermShare=result.count?result.count36/result.count:null;
    const orders=new Map();let failureRows=0,flagged=0;const reasonCounts={},reasonRows={};
    for(let j=0;j<detail.length;j++){const d=detail[j];if(!month(d[1],m)||text(d[4])!=='失敗件'||text(d[9])!=='直營'+group)continue;
      const dt=day(d[2]);if(!dt||dt.slice(0,7)!==ym||dt>cutoff)throw Error(group+'失敗件日期超出來源截止');
      const order=text(d[6]);if(!order)throw Error(group+'失敗件缺少本機去重識別');failureRows++;if(text(d[58])==='V')flagged++;
      const label=reason(d[50]),signature=[text(d[10]),dt,label,text(d[58])].join('|');
      if(orders.has(order)){if(orders.get(order)!==signature)throw Error('同一失敗訂單分類衝突，需核對');continue;}orders.set(order,signature);
      reasonCounts[label]=(reasonCounts[label]||0)+1;(reasonRows[label]??=[]).push(j+1);
    }
    result.failures={rows:failureRows,uniqueOrders:orders.size,duplicateCancelFlagged:flagged,reasonCounts,reasonRows,status:failureRows?'有來源紀錄':'當期未找到失敗紀錄；不等於0失敗'};
    return result;
  });
  return {contract:'operations-goodspeed-bbtbc-v1',cutoff,period:ym+'-01 至 '+cutoff,scope:'北一二A／B／C／D',storeCount:stores.length,regions:summaries,rule:GOOD_SPEED_RULE,
    caveats:['來源總進度原值與累計點數／目標分列；未推定公司計算方式。','36M長約占比的分母是BB店點12／24／36M合計筆數；非全公司上線件數。','36M的0.5點已含來源點數，不能重加；500M／1G戰報加碼不回灌KPI。','失敗僅BB明細涵蓋之業者，不作所有業者成敗率；唯一訂單不等於唯一客戶。','重複取消V旗標分列；分類去重以單號在本機處理，不匯出單號。','排除TBC明細舊期資料；缺店不補零，不能套用其他來源店數。'],
    evidence:{cutoff:'BB明細!BN1；BB量能!AM2:BM2',points:'BB店點!AG、AR、BC',term:'BB店點!I:K、R',progress:'BB量能!K:M，D當月且C空白之區合計',failures:'BB明細!B/C/E/G/J/AY/BG；只匯出標準分類與來源列'}};
}
