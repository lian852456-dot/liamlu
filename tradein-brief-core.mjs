import {applyTargets,targetPolicy} from './tradein-target-policy.mjs?v=20261012-targets-1';
export const REMINDERS=Object.freeze([
 '登出 iCloud／Google，確認尋找功能與其他帳號已解除。',
 '恢復原廠設定。',
 '確認可正常開關機，無螢幕鎖、密碼鎖或 ID 鎖。',
 '疏失須開立工作紀錄表。年度首件 SPE −0.5 分，第二件起每件 SPE −1 分。',
 '管理指標：店長 −0.5 分／件，督導 −0.25 分／件。'
]);
export function percent(n,d){return d?Math.round(n/d*1000)/10:0;}
export function buildBrief(raw,validate,expectedMonth=raw?.month){
 if(typeof validate!=='function')throw Error('未提供來源核對');validate(raw);
 if(raw.month!==expectedMonth)throw Error('來源月份不符，請重新讀取');
 const s=applyTargets(raw),policy=targetPolicy(s.month);
 if(s.people.some(p=>p.actual_units===null))throw Error('個人實績尚有待核資料，請先完成核對');
 if(s.people.some(p=>!Array.isArray(p.recovered_models)||!Array.isArray(p.recovered_days)))throw Error('回收機款或逐日資料尚未提供，請先更新來源');
 const people=s.people.slice().sort((a,b)=>b.actual_units-a.actual_units||a.store.localeCompare(b.store,'zh-TW')||a.masked_name.localeCompare(b.masked_name,'zh-TW'));
 if(people.length>54)throw Error('一頁簡報最多呈現 54 人，請縮小資料範圍');
 let prior=-1,rank=0;const ranking=people.map((p,i)=>{if(p.actual_units!==prior){rank=i+1;prior=p.actual_units;}return {rank,store:p.store,name:p.masked_name,units:p.actual_units,target:p.target_units};});
 const models=new Map();people.forEach(p=>p.recovered_models.forEach(m=>models.set(m.model,(models.get(m.model)||0)+m.units)));
 const topModels=[...models].map(([model,units])=>({model,units,share:percent(units,s.summary.actual_units)})).sort((a,b)=>b.units-a.units||a.model.localeCompare(b.model,'en')).slice(0,5);
 const byDay=new Map();people.forEach(p=>p.recovered_days.forEach(d=>byDay.set(d.date,(byDay.get(d.date)||0)+d.actual_units)));
 const cutoff=new Date(s.source_cutoff_date+'T00:00:00Z');const trend=Array.from({length:5},(_,i)=>{const d=new Date(cutoff);d.setUTCDate(d.getUTCDate()-4+i);const date=d.toISOString().slice(0,10);return {date,units:date<s.source_period.start?null:byDay.get(date)||0};});
 const mobilizedPeople=people.filter(p=>p.actual_units>0).length,mobilizedStores=s.stores.filter(p=>p.actual_units>0).length;
 const assigned=people.reduce((n,p)=>n+p.actual_units,0);
 if(assigned!==s.summary.actual_units)throw Error('區與個人台數未完整對帳，停止產出簡報');
 return {month:s.month,cutoff:s.source_cutoff_date,sourceStart:s.source_period.start,actual:s.summary.actual_units,target:s.summary.target_units,
  personalTarget:policy?.personalTarget||3,personalTotal:s.summary.personal_target_units??s.summary.target_units,
  personalRule:policy?'全員每月 4 台，含店長與代理':'同仁每月 3 台，店長與代理免目標',
  targetRule:policy?'店目標為十月重點Device目標 ×12%逐店進位，合計159台。':'店目標依來源核定同仁人數 ×3台，店長與代理免目標。',
  attainment:percent(s.summary.actual_units,s.summary.target_units),mobilizedPeople,totalPeople:people.length,peopleShare:percent(mobilizedPeople,people.length),
  mobilizedStores,totalStores:s.stores.length,storeShare:percent(mobilizedStores,s.stores.length),ranking,topModels,trend,reminders:[...REMINDERS],
  stores:s.stores.map(p=>({store:p.store,actual:p.actual_units,target:p.target_units,share:percent(p.actual_units,s.summary.actual_units)}))};
}
