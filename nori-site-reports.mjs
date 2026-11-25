import './daily-log-core.js?v=20260902-6';
const todayTW=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Taipei'}).format(new Date());
const strip=s=>s.normalize('NFKC').toLowerCase().replace(/[\s，、。？！?!：「」]/g,'');
const dayOnly=/昨天|昨日|上週|上周|上月|上個月|\d[/-]\d|\d+[月日]|去年/;
export function goldAnswer(ledger,question,today=todayTW()){
  const q=strip(question);
  if(dayOnly.test(q))return '指定歷史日期可在金牌明細選擇日結日期。';
  const record=globalThis.North12BGoldPublic.latest(ledger,today);
  if(!record)return '目前沒有已確認的金牌日結。';
  if(/今天|今日|當日/.test(q) && record.date!==today)return '今天尚無已確認日結，最新結算日為 '+record.date+'。';
  const stores=globalThis.North12BGoldPublic.STORES.filter(store=>q.includes(store));
  if(stores.length>1)return '請指定一家門市或一位同仁的金牌代稱。';
  const store=stores[0],area=/全區|九店|北一二b/.test(q);
  const remaining=q.replace(store || /^$/,'').replace(/請幫我查|幫我查|請問|幫我|查詢|查一下|目前|現在|今天|今日|最新|本月|累計|總共|全區|九店|北一二b|門市|同仁|金牌|扣牌|加牌|總牌數|增減|加減|餘額|怎麼扣|為什麼|幾枚|幾張|幾個|多少|幾|原因|的|有|是|嗎/g,'');
  let rows=record.rows.filter(r=>!store || store===r.store);
  if(remaining)rows=rows.filter(r=>strip(r.alias)===remaining);
  if(!rows.length)return '這次結算查無對應紀錄。個人金牌請用金牌表上的同仁代稱及門市。';
  if(!remaining && !store && !area)return '想查哪家門市或哪位同仁？個人金牌請使用金牌表上的代稱。';
  if(remaining && rows.length>1)return '這個代稱對應多家門市，請加上門市名稱再問。';
  const sum=rows.reduce((n,r)=>n+r.balance,0);
  const delta=rows.every(r=>Number.isSafeInteger(r.delta))?rows.reduce((n,r)=>n+r.delta,0):null;
  const label=remaining?rows[0].store+'「'+rows[0].alias+'」':(store || '全區')+'已列入結算的 '+rows.length+' 位同仁';
  return label+'合計 '+sum+' 枚金牌，當日增減'+(delta===null?'未列':(delta>0?' +':' ')+delta+' 枚')+'。結算日 '+record.date+'。'+(remaining && /原因|為什麼|怎麼扣/.test(q)?'日結原因為'+(rows[0].reason || '未列')+'。':'');
}
export async function readGold(question,signal) {
  const response=await fetch('https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec',{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'department_gold_access'}),credentials:'omit',cache:'no-store',signal});
  if(!response.ok)throw Error('讀取失敗');
  const result=await response.json();
  if(result?.status!=='ok')throw Error('日結未確認');
  return goldAnswer(globalThis.North12BGoldPublic.validate(result.ledger),question);
}
export function logAnswer(question,snapshot,today=todayTW()) {
  const core=globalThis.DailyLogCore, q=strip(question);
  if(!Array.isArray(snapshot?.rows) || !snapshot.rows.length)return '這台裝置尚無日誌資料。請先在每日日誌檢查選檔，並按「套用至本機預覽」。';
  const date=core.normalizeDate(snapshot.asOfDate);
  if(!date || date>today)return '日誌報表的基準日待核對。';
  if(dayOnly.test(q) || (/今天|今日/.test(q) && date!==today))return '本機日誌報表的基準日是 '+date+'。若要看指定日期，請在日誌檢查切換日期。';
  const model=core.buildDashboard(snapshot.rows,date);
  const match=model.stores.filter(r=>q.includes(r.store.replace(/^.*台北/,'')));
  const scope=match.length?match:model.stores;
  const cadence=/週|周/.test(q)?'weekly':/每月|月表/.test(q)?'monthly':'daily';
  const counts=scope.flatMap(r=>r[cadence]).filter(x=>x.isDue);
  const label=match.length?match.map(r=>r.store).join('、'):'九店';
  const cadenceLabel={daily:'每日',weekly:'每週',monthly:'每月'}[cadence];
  const gaps=scope.map(r=>{
    const pending=r[cadence].filter(x=>x.isDue && x.status!=='done');
    return pending.length?r.store+' '+pending.map(x=>x.shortLabel+'（'+({pending:'未完成',missing:'缺資料',unknown:'待確認'}[x.status] || '待核對')+'）').join('、'):'';
  }).filter(Boolean);
  return date+' '+label+cadenceLabel+'日誌，到期 '+counts.length+' 項，已完成 '+counts.filter(x=>x.status==='done').length+' 項。'+(gaps.length?'需追蹤：'+gaps.join('；')+'。':'');
}
