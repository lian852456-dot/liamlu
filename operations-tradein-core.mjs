// Only the supplied store-aggregate layout is supported. Never expose customer rows.
const norm=v=>String(v??'').replace(/\s/g,'').replace(/[()（）*＊]/g,'').toLowerCase();
const fields={region:'督導區',code:'代碼',store:'店點',apple:'Apple商品',android:'Android系統機款&其他商品',creditOnly:'僅折抵金額，未換新機',total:'舊機換新機(a)',device:'Device(b)*含Mac*',rate:'舊換新%(a/b)',previous:'舊機換新機(上月同期)',previousFullMonthRate:'舊換新%(上月整月)'};
const regions=['北一二A','北一二B','北一二C','北一二D'];
const countKeys=['apple','android','creditOnly','total','device','previous'];
const targetLabels=['舊換新目標','回收目標','目標回收數'].map(norm);
function parsePeriod(value) {
  const match = value.match(/資料日期\s*[:：]\s*(?:(20\d{2})[/.-年])?(\d{1,2})[/.-月](\d{1,2})日?\s*[~～–至-]\s*(?:(20\d{2})[/.-年])?(\d{1,2})[/.-月](\d{1,2})日?(?![\d/])/);
  if (!match) throw Error('來源期間缺少或跨區段不一致');
  const [, startYear, startMonth, startDay, endYear, endMonth, endDay] = match;
  const date = (year, month, day) => {
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    if (new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString().slice(0, 10) !== iso) {
      throw Error('來源起訖日期無效');
    }
    return iso;
  };
  if (!startYear) {
    date('2024', startMonth, startDay);
    date('2024', endMonth, endDay);
    return { year: null, periodStart: '', cutoff: '' };
  }
  const periodStart = date(startYear, startMonth, startDay);
  const cutoff = date(endYear || startYear, endMonth, endDay);
  if (periodStart > cutoff) throw Error('來源起日晚於截止日');
  return { year: Number(startYear), periodStart, cutoff };
}
function columns(row,summary=false){
  const labels=row.map(norm),out={};
  for(const [key,label]of Object.entries(fields)){
    if(summary&&['region','code','store'].includes(key))continue;
    const hits=labels.flatMap((v,i)=>v===norm(label)?[i]:[]);
    if(hits.length!==1)throw Error('舊換新缺欄或重複欄：'+label);out[key]=hits[0];
  }
  const targets=labels.flatMap((v,i)=>targetLabels.includes(v)?[i]:[]);
  if(targets.length>1)throw Error('舊換新目標欄重複，請核對當期目標。');
  if(targets.length)out.target=targets[0];
  if(summary){const candidates=labels.flatMap((v,i)=>v==='區域'?[i]:[]);if(!candidates.length)throw Error('找不到正式區域小計欄');out.region=candidates.at(-1);}
  return out;
}
function numbers(row,col,where){const result={};for(const key of countKeys){const v=row[col[key]];if(typeof v!=='number'||!Number.isFinite(v)||v<0||!Number.isInteger(v))throw Error(where+'：'+fields[key]+'缺值或不是非負整數');result[key]=v;}
  if(col.target!==undefined){const target=row[col.target];result.target=Number.isInteger(target)&&target>=0?target:null;}
  if(result.total!==result.apple+result.android+result.creditOnly)throw Error(where+'：分類加總不等於H合計');
  result.rate=result.device===0?null:result.total/result.device;
  const sourceRate=row[col.rate];if(result.rate!==null&&(typeof sourceRate!=='number'||Math.abs(sourceRate-result.rate)>1e-8))throw Error(where+'：正式比率與件數不一致');
  result.mom=result.previous===0?null:(result.total-result.previous)/result.previous;
  return result;
}
export function parseTradeinRows(rows){
  if(!Array.isArray(rows)||rows.length>20000)throw Error('舊換新資料範圍不符');
  const headerRows=rows.flatMap((r,i)=>r.map(norm).includes(norm('督導區'))&&r.map(norm).includes(norm('代碼'))?[i]:[]);
  if(headerRows.length!==1)throw Error('找不到唯一店級明細標題；格式待重新對映');
  const header=headerRows[0],col=columns(rows[header]);
  const dateTexts=[...new Set(rows.slice(0,header).flat().filter(v=>typeof v==='string'&&/資料日期\s*[:：]/.test(v)).map(v=>v.trim()))];
  if(dateTexts.length!==1)throw Error('來源期間缺少或跨區段不一致');
  const period=parsePeriod(dateTexts[0]);
  const sh=rows.findIndex((r,i)=>i<header&&r.map(norm).includes(norm('長官'))&&r.map(norm).includes(norm(fields.total)));
  if(sh<0)throw Error('缺少正式四區小計區段');const sc=columns(rows[sh],true),seen=new Set(),stores=[];
  for(let i=header+1;i<rows.length;i++){const row=rows[i],region=String(row[col.region]??'').trim();if(!regions.includes(region))continue;
    const code=String(row[col.code]??'').trim();if(!/^DNB\d{5}$/.test(code))throw Error('四區明細店碼不符，來源第'+(i+1)+'列');
    if(seen.has(code))throw Error('同店代碼重複，請先核對來源');seen.add(code);
    const store=String(row[col.store]??'').trim();if(!store||store.length>40)throw Error('店名缺少或過長');stores.push({region,code,store,sourceRow:i+1,...numbers(row,col,'來源第'+(i+1)+'列')});
  }
  const summaries=regions.map(region=>{
    const matches=rows.slice(sh+1,header).filter(r=>String(r[sc.region]??'').trim()===region);if(matches.length!==1)throw Error(region+'正式小計不唯一');
    const members=stores.filter(s=>s.region===region);if(!members.length)throw Error(region+'沒有完整店級明細');
    const value=numbers(matches[0],sc,region+'正式小計');for(const key of countKeys){if(members.reduce((n,s)=>n+s[key],0)!==value[key])throw Error(region+'明細／小計不一致，請保留含零值的完整範圍');}
    if(value.target!=null&&members.every(s=>s.target!=null)&&members.reduce((n,s)=>n+s.target,0)!==value.target)throw Error(region+'目標明細／小計不一致');
    const previousFullMonthRate=matches[0][sc.previousFullMonthRate];if(typeof previousFullMonthRate!=='number'||!Number.isFinite(previousFullMonthRate))throw Error(region+'缺少正式上月整月比率');
    return {region,storeCount:members.length,...value,previousFullMonthRate,rateDeltaPp:value.rate===null?null:(value.rate-previousFullMonthRate)*100,stores:members.sort((a,b)=>(b.rate??-1)-(a.rate??-1)||a.code.localeCompare(b.code))};
  });
  const totals=Object.fromEntries(countKeys.map(k=>[k,summaries.reduce((n,s)=>n+s[k],0)]));
  totals.rate=totals.device===0?null:totals.total/totals.device;totals.mom=totals.previous===0?null:(totals.total-totals.previous)/totals.previous;
  const hasTarget=summaries.every(r=>r.target!=null&&r.stores.every(s=>s.target!=null));
  if(hasTarget)totals.target=summaries.reduce((n,s)=>n+s.target,0);
  return {contract:'operations-tradein-store-aggregate-v1',periodText:dateTexts[0],...period,yearStatus:period.year?'來源標明年份':'原表未列年份，待確認',scope:'北一二A／B／C／D',storeCount:stores.length,regions:summaries,totals,hasTarget,
    caution:'H合計包含僅折抵未換新，不代表全部都是買新機；0分母為N/A；上月整月比率只採正式區小計，不平均店比率。'};
}
