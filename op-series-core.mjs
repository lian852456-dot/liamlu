export const categories = ['OP影音', 'OP遊戲玩家', 'OP智慧家庭', 'OP科技生活'];
const region = '北一二B';
const names = ['永吉', '復興南', '六張犁', '酒泉', '萬大', '大稻埕', '三創', '杭州南', '通化'];
const clean = value => String(value ?? '').trim();
function requireValue(ok, message) {
  if (!ok) throw new Error(message);
}
function count(value, label) {
  requireValue(typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, label + '缺少有效件數');
  return value;
}
function columns(header, required) {
  // The summary repeats 合計 after the date columns. Use the leading series total.
  const map = new Map();
  header.forEach((value,index) => {
    const key = clean(value);
    if (!map.has(key)) map.set(key,index);
  });
  for (const key of required) requireValue(map.has(key), '報表缺少欄位「' + key + '」');
  return Object.fromEntries(required.map(key => [key, map.get(key)]));
}
function categoryOf(name, player, video) {
  if (video === 'Y' && name.includes(categories[0])) return 0;
  if (player !== 'Y') return -1;
  if (name.includes(categories[1]) || name.includes('掌機')) return 1;
  if (name.includes(categories[2])) return 2;
  if (name.includes(categories[3])) return 3;
  return -1;
}
function masked(value) {
  const name = clean(value);
  if (!name) return '待確認同仁';
  if (/[*＊○]/.test(name)) return name;
  return name.length > 2 ? name[0] + '＊' + name.slice(-1) : name[0] + '＊';
}

export function parseWorkbook(book, XLSX) {
  function rows(sheet) {
    requireValue(book.Sheets[sheet], '缺少工作表「' + sheet + '」');
    return XLSX.utils.sheet_to_json(book.Sheets[sheet], {header:1, defval:null, blankrows:false});
  }
  const summary = rows('OP全系列');
  const headerIndex = summary.findIndex(row => row.includes('店點') && row.includes('營業點代碼'));
  requireValue(headerIndex > 0, '找不到門市進度表');
  const fields = ['目標', ...categories, '合計', '進度達成率', '連續未動店天數'];
  const cols = columns(summary[headerIndex], ['督導區', '營業點代碼', '店點', ...fields]);
  const districtHeader = summary.findIndex(row => row.includes('區域') && row.includes('督導區'));
  requireValue(districtHeader >= 0, '找不到區彙總');
  const dc = columns(summary[districtHeader], ['督導區', '店數', ...fields]);
  const district = summary.slice(districtHeader + 1, headerIndex).find(r => r[dc['督導區']] === region);
  requireValue(district && district[dc['店數']] === names.length, '北一二B區彙總未涵蓋九店');
  const dateColumn = summary[districtHeader].findIndex((v,i) => i > dc['連續未動店天數'] && typeof v === 'number');
  const serial = summary[districtHeader][dateColumn];
  const date = XLSX.SSF.parse_date_code(serial, {date1904:!!book.Workbook?.WBProps?.date1904});
  requireValue(date && date.y >= 2000, '報表缺少有效截止日期');
  const iso = [date.y, date.m, date.d].map(n => String(n).padStart(2, '0')).join('-');
  function progress(row, c) {
    const qty = categories.map(k => count(row[c[k]], k));
    const target = count(row[c['目標']], '目標');
    const total = count(row[c['合計']], '合計');
    requireValue(qty.reduce((a,b) => a + b, 0) === total, '四系列與合計不符');
    const rate = row[c['進度達成率']];
    requireValue((typeof rate === 'number' && Number.isFinite(rate) && rate >= 0) || (!target && rate === '排除名單'), '進度達成率無效');
    const idle = clean(row[c['連續未動店天數']]).match(/^(?:未動店)?\s*(\d+)\s*天$/);
    requireValue(idle, '缺少連續未動店天數');
    return {qty, target, total, rate:target ? rate : null, idle:Number(idle[1])};
  }
  const area = progress(district, dc);
  const stores = summary.slice(headerIndex + 1).filter(r => r[cols['督導區']] === region)
    .map(r => ({code:clean(r[cols['營業點代碼']]), name:clean(r[cols['店點']]).replace(/^.*台北/, ''), ...progress(r,cols)}));
  const storeMap = new Map(stores.map(s => [s.code, s]));
  requireValue(storeMap.size === names.length && stores.length === names.length && names.every(n => stores.some(s => s.name === n)), '九店名單缺漏或重複');
  requireValue(stores.reduce((s,r) => s+r.target, 0) === area.target && area.qty.every((n,i) => n === stores.reduce((s,r) => s+r.qty[i], 0)), '九店件數或目標與區彙總不符');

  const [rosterHeader,...roster] = rows('個人');
  const rc = columns(rosterHeader,['督導區','店代','員編','姓名']);
  const people = [];
  const ids = new Map();
  for (const r of roster) {
    if (r[rc['督導區']] !== region) continue;
    const id = clean(r[rc['員編']]);
    const store = clean(r[rc['店代']]);
    requireValue(id && !ids.has(id) && storeMap.has(store), '個人名冊的店點或員編無法核對');
    ids.set(id, people.length);
    people.push({store, name:masked(r[rc['姓名']])});
  }
  requireValue(people.length && stores.every(s => people.some(p => p.store === s.code)), '個人名冊未涵蓋九店');
  const [detailHeader,...detail] = rows('全機款');
  const c = columns(detailHeader,['營業店點代碼','OP玩家','OP影音','OP系列','資料來源註記','商品名稱','V_D_V認列','新員編','筆數','統計日期']);
  const groups = new Map();
  const totals = new Map(stores.map(s => [s.code,[0,0,0,0]]));
  for (const r of detail) {
    const store = clean(r[c['營業店點代碼']]);
    if (!storeMap.has(store) || r[c['OP系列']] !== 'Y') continue;
    const source = clean(r[c['資料來源註記']]);
    if (source === 'POS' || source.startsWith('配件')) continue;
    const product = clean(r[c['商品名稱']]);
    const category = categoryOf(product, r[c['OP玩家']], r[c['OP影音']]);
    if (category < 0) continue;
    requireValue(source && typeof r[c['統計日期']] === 'number' && r[c['統計日期']] >= serial-date.d+1 && r[c['統計日期']] < serial+1, '成交來源或日期與當期報表不符');
    const qty = count(r[c['筆數']], '成交');
    const tariff = clean(r[c['V_D_V認列']]) || '未列資費';
    const person = ids.get(clean(r[c['新員編']])) ?? -1;
    const key = JSON.stringify([store,category,product,tariff,person]);
    groups.set(key,(groups.get(key) || 0) + qty);
    totals.get(store)[category] += qty;
  }
  for (const s of stores) requireValue(s.qty.every((n,i) => n === totals.get(s.code)[i]), s.name + '的成交明細與四系列件數不符');
  const sales = [...groups].map(([k,qty]) => {
    const [store,category,product,tariff,person] = JSON.parse(k);
    return {store,category,product,tariff,person,qty};
  });
  return {version:1,date:iso,area,stores,people,sales};
}
