const region = '北一二B';
export const tasks = ['iPhone 系列','Mac','充電多','AI 眼鏡套裝','vivo X500'];
export const families = {i17:'iPhone 17',i18:'iPhone 18',mac:'Mac',S26:'Galaxy S26',pixel10:'Pixel 10',pixel11:'Pixel 11'};
const storesExpected = ['永吉','復興南','六張犁','酒泉','萬大','大稻埕','三創','杭州南','通化'];
const clean = v => String(v ?? '').replace(/\s/g,'');
function check(ok, message) { if (!ok) throw Error(message); }
function count(v) {
  check(Number.isSafeInteger(v) && v >= 0,'報表件數缺漏或格式錯誤');
  return v;
}
function rate(v) { return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null; }
function period(v) {
  const match = clean(v).match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})[~～](?:(\d{4})\/)?(\d{1,2})\/(\d{1,2})$/);
  check(match,'缺少報表期間');
  const [,y,m,d,ey,em,ed] = match;
  const iso = (year,month,day) => {
    const date = new Date(Date.UTC(+year,+month-1,+day));
    check(date.getUTCMonth()+1===+month && date.getUTCDate()===+day,'報表日期無效');
    return date.toISOString().slice(0,10);
  };
  const start=iso(y,m,d), end=iso(ey||y,em,ed);
  check(start<=end,'報表起訖日期不符');
  return [start,end];
}
function verifyHeader(row, fields) {
  for (const [i,label] of fields) check(clean(row?.[i])===label,'報表欄位異動，請核對「'+label+'」');
}
export function standing(idle) { return idle<=2 ? '優異' : idle>=4 ? '落後' : '一般'; }
export function parseFocus(book,XLSX) {
  function rows(sheet) {
    check(book.Sheets[sheet],'缺少工作表「'+sheet+'」');
    return XLSX.utils.sheet_to_json(book.Sheets[sheet],{header:1,blankrows:true,defval:null,raw:true});
  }
  const shops=rows('重點機款_店'), staff=rows('重點機款_個人');
  const sh=shops.findIndex(r=>r.includes('店點代碼')), ph=staff.findIndex(r=>r.includes('員編'));
  check(sh>0 && ph>0,'找不到門市或個人明細');
  const dates=period(shops[sh-1][2]);
  function samePeriod(v) { check(period(v).join()===dates.join(),'工作表期間不一致'); }
  samePeriod(staff[ph-1][4]);
  verifyHeader(shops[sh-1],[[5,'iphone系列'],[13,'Mac'],[20,'充電多'],[23,'AI眼鏡套裝'],[26,'vivoX500系列']]);
  verifyHeader(shops[sh],[[2,'儲督'],[3,'店點代碼'],[4,'店點名稱'],[5,'KPI目標'],[11,'合計'],[12,'進度達成率'],[13,'KPI目標'],[18,'合計'],[19,'進度達成率'],[20,'上線數'],[21,'業支目標'],[22,'進度達成率'],[23,'上線數'],[24,'業支目標'],[25,'進度達成率'],[28,'合計'],[29,'動店目標'],[30,'未動店']]);
  verifyHeader(staff[ph-1],[[9,'iphone系列'],[16,'Mac'],[22,'充電多'],[24,'AI眼鏡套裝'],[26,'vivoX500']]);
  verifyHeader(staff[ph],[[1,'督導區'],[2,'代碼'],[5,'員編'],[6,'名字'],[8,'未動店項目數'],[15,'i18未動店'],[20,'合計'],[21,'未動店'],[22,'上線數'],[23,'未動店'],[24,'上線數'],[25,'未動店'],[26,'上線數'],[27,'未動店']]);
  verifyHeader(staff[ph+1],[[13,'i18'],[14,'合計']]);
  function progress(r) {
    return {actual:[11,18,20,23,28].map(i=>count(r[i])),
      targets:[5,13,21,24,29].map(i=>r[i]==null?null:count(r[i])),
      rates:[12,19,22,25].map(i=>rate(r[i]))};
  }
  const district=shops.slice(0,sh).find(r=>r[2]===region);
  check(district && district[3]===9,'找不到北一二B九店區彙總');
  const stores=shops.slice(sh+1).filter(r=>r[2]===region).map(r=>{
    const name=storesExpected.find(n=>clean(r[4]).endsWith(n));
    check(name && r[3] && ['Y','N'].includes(r[30]),'門市名稱、代碼或動店欄位有誤');
    return {name,code:clean(r[3]),...progress(r),x500Met:r[30]==='Y',inventory:{}};
  });
  const byCode=new Map(stores.map(s=>[s.code,s]));
  check(stores.length===9 && byCode.size===9 && new Set(stores.map(s=>s.name)).size===9,'北一二B門市缺漏或重複');
  const area=progress(district);
  area.x500Missing=count(district[30]);
  check(area.actual.every((n,i)=>n===stores.reduce((a,s)=>a+s.actual[i],0)) &&
    area.x500Missing===stores.filter(s=>!s.x500Met).length,'九店與區彙總不一致');
  const ids=new Set();
  const people=staff.slice(ph+2).filter(r=>r[1]===region).map(r=>{
    const code=clean(r[2]), id=clean(r[5]), rawName=clean(r[6]);
    check(byCode.has(code) && id && rawName && !ids.has(id),'同仁歸戶缺漏或員編重複');
    ids.add(id);
    const idle=count(r[8]), flags=[15,21,23,25,27].map(i=>r[i]);
    check(flags.every(f=>['Y','N'].includes(f)) && flags.filter(f=>f==='N').length===idle,'個人五項動店紀錄不一致');
    const name=/[*＊○]/.test(rawName)?rawName:rawName[0]+'＊'+(rawName.length>2?rawName.slice(-1):'');
    return {name,code,idle,iphone:count(r[14]),actual:[13,20,22,24,26].map(i=>count(r[i]))};
  });
  const staffDistrict=staff.slice(0,ph).find(r=>r[4]===region);
  check(staffDistrict && people.length>0,'個人表缺少北一二B紀錄');
  check([14,13,20,22,24,26].every((col,i)=>staffDistrict[col]===people.reduce((a,p)=>a+(i?p.actual[i-1]:p.iphone),0)) &&
    [15,21,23,25,27].every((col,i)=>staffDistrict[col]===people.filter(p=>p.actual[i]===0).length),'個人明細與個人區彙總不一致');
  for (const key of Object.keys(families)) {
    const data=rows(key), h=data.findIndex(r=>r.includes('店點代碼'));
    check(h>=2,'找不到機型明細 '+key);
    samePeriod(data[h-2][2]);
    const col=data[h-2].findIndex((v,i)=>v && data[h-1][i]==='合計' && data[h+1][i]==='庫存' && data[h+1][i+1]==='銷量');
    check(col>=0,'缺少系列庫存與銷量 '+key);
    for (const r of data.slice(h+2).filter(r=>r[2]===region)) {
      const s=byCode.get(clean(r[3]));
      check(s && !s.inventory[key],'機型明細門市有誤 '+key);
      s.inventory[key]=[count(r[col]),count(r[col+1]),rate(r[col+2])];
    }
    check(stores.every(s=>s.inventory[key]),'機型明細未涵蓋九店 '+key);
  }
  return {dates,area,stores,people};
}
