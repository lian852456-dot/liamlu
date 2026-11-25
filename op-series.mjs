import {downloadReadonly,section,table} from './store-readonly-export.mjs';
import {categories} from './op-series-core.mjs';
if (window.parent !== window && new URLSearchParams(location.search).get('view') === 'battle') {
  document.querySelector('main > nav').hidden = true;
}
const $ = id => document.getElementById(id);
const storageKey = 'north12b.op-series.v1';
function requestedStore() {
  if (window.parent === window || new URLSearchParams(location.search).get('view') !== 'battle') return null;
  try {
    const parentUrl = new URL(window.parent.location.href);
    if (parentUrl.origin === location.origin && parentUrl.pathname.endsWith('/kpi-battle.html')) {
      return parentUrl.searchParams.get('nori');
    }
  } catch { /* Embedding pages on another origin do not supply helper requests. */ }
  return null;
}
const helperRequest = requestedStore();
const helperProgress = $('nori-progress');
function showHelperEmpty() {
  if (!helperRequest) return;
  helperProgress.hidden = false;
  helperProgress.textContent = '海苔：這台裝置尚無可讀取的 OP 報表。請在下方匯入「OP 劇院遊戲機達成率」Excel 並確認更新。';
}
showHelperEmpty();
const labels = ['系列','商品','資費','店點','同仁'];
let report, pending, worker, revision = 0, dimension = '系列';
const percent = value => value == null ? '—' : Math.round(value * 100) + '%';
function element(tag,text) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = String(text);
  return el;
}
function tr(parent, values, tag = 'td') {
  const row = parent.insertRow();
  for (const value of values) row.append(element(tag,value));
  return row;
}
function breakdown(code,dimension) {
  const groups = new Map();
  const storeName = key => report.stores.find(s => s.code === key)?.name || '待核對';
  function ensure(key,label) {
    if (!groups.has(key)) groups.set(key,{label,qty:0});
    return groups.get(key);
  }
  function employee(index) {
    const p = report.people[index];
    return p ? storeName(p.store) + '・' + p.name : '名冊外／待核對';
  }
  if (dimension === '系列') categories.forEach((label,i) => ensure(i,label));
  if (dimension === '店點') report.stores.filter(s => !code || code === s.code).forEach(s => ensure(s.code,s.name));
  if (dimension === '同仁') report.people.forEach((p,i) => { if (!code || p.store === code) ensure(i,employee(i)); });
  for (const sale of report.sales) {
    if (code && sale.store !== code) continue;
    let key, label;
    switch (dimension) {
      case '系列': key=sale.category; label=categories[key]; break;
      case '商品': key=label=sale.product; break;
      case '資費': key=label=sale.tariff; break;
      case '店點': key=sale.store; label=storeName(key); break;
      case '同仁': key=sale.person; label=employee(key); break;
    }
    ensure(key,label).qty += sale.qty;
  }
  return [...groups.values()].sort((a,b) => b.qty-a.qty || a.label.localeCompare(b.label,'zh-Hant'));
}
function storeCells(s) {
  return [s.name,s.total+'／'+s.target,percent(s.rate),...s.qty,s.idle+' 天'];
}
function render() {
  const code = $('store').value;
  const current = report.stores.find(s => s.code === code) || report.area;
  const scope = current.name || '北一二B';
  $('exportReadonly').textContent = '一鍵匯出唯讀版（' + (code ? scope : '全區') + '）';
  $('period').textContent = '北一二B・' + report.date.slice(0,7) + '-01 至 ' + report.date + '・排除空機';
  if (helperRequest) {
    const today = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Taipei'}).format(new Date());
    const prevDay = new Date(today + 'T00:00:00Z');
    prevDay.setUTCDate(prevDay.getUTCDate() - 1);
    const period = report.date === prevDay.toISOString().slice(0,10) ? '前日累計' : '資料截止';
    const result = current.target === 0 ? '未設月目標' : current.total >= current.target ? '已達標' : '還差 ' + (current.target - current.total) + ' 件';
    const complete = [current.target, current.total].every(n => Number.isSafeInteger(n) && n >= 0)
      && /^\d{4}-\d{2}-\d{2}$/.test(report.date) && report.date <= today;
    helperProgress.textContent = !complete ? '海苔：報表日期或件數不完整，請重新匯入核對。' : code
      ? '海苔：' + scope + ' OP 月目標 ' + current.target + ' 件，已完成 ' + current.total + ' 件，' + result + '。' + period + ' ' + report.date + '。'
      : '海苔：請從「查看範圍」選擇門市，即可查看目標差額。報表截止 ' + report.date + '。';
  }
  $('metrics').replaceChildren();
  for (const [key,value] of [['累計上線',current.total + ' 件'],['月目標',current.target + ' 件'],['進度達成率',percent(current.rate)],['月目標達成率',percent(current.target ? current.total/current.target : null)]]) {
    const tile = element('div');
    tile.className = 'metric';
    tile.append(element('small',key),element('strong',value)); $('metrics').append(tile);
  }
  $('stores').replaceChildren();
  for (const s of report.stores) {
    const row = tr($('stores'),storeCells(s));
    const button = element('button',s.name);
    button.type = 'button'; button.onclick = () => { $('store').value = s.code; render(); };
    row.cells[0].replaceChildren(button);
    if (s.rate !== null) row.cells[2].className = s.rate >= 1 ? 'on' : 'behind';
    if (s.code === code) row.classList.add('chosen');
  }
  $('structureTitle').textContent = scope + '｜上線結構';
  for (const button of $('tabs').children) button.setAttribute('aria-pressed',String(button.textContent === dimension));
  const entries = breakdown(code,dimension);
  $('basis').textContent = scope + '共 ' + current.total + ' 件' + (dimension === '資費' ? '，依報表認列資費統計。' : dimension === '同仁' ? '，按成交店點及推薦同仁歸戶，含名冊內零件數同仁。' : '。');
  $('breakHead').replaceChildren(); $('breakRows').replaceChildren();
  tr($('breakHead'),[dimension,'上線件數','占比'],'th');
  for (const g of entries) tr($('breakRows'),[g.label,g.qty,percent(current.total ? g.qty/current.total : null)]);
  if (!entries.length) tr($('breakRows'),['此範圍尚無上線',0,'—']);
}
function structureSection(code,label) {
  const group=section(label+'｜上線結構',true);
  const current=report.stores.find(s=>s.code===code) || report.area;
  for(const dim of labels){
    const part=section(dim,true);
    const grid=table([dim,'上線件數','占比']);
    const entries=breakdown(code,dim);
    for(const entry of entries)tr(grid.body,[entry.label,entry.qty,percent(current.total?entry.qty/current.total:null)]);
    if(!entries.length)tr(grid.body,['此範圍尚無上線',0,'—']);
    if(dim==='同仁')part.append(element('p','依成交店點計件，姓名前的門市為推薦同仁所屬門市。'));
    part.append(grid.wrapper);group.append(part);
  }
  return group;
}
$('exportReadonly').onclick=()=>{
  if(!report)return;
  const code=$('store').value;
  const stores=report.stores.filter(s=>!code || s.code===code);
  const scope=code?stores[0].name:'全區';
  const summary=section(scope+'進度');
  summary.append($('metrics').cloneNode(true));
  const progress=section(code?'門市進度':'九店進度');
  const headers=document.querySelectorAll('.overview thead th');
  const grid=table(Array.from(headers,th=>th.textContent));
  for(const s of stores){
    const row=tr(grid.body,storeCells(s));
    if(s.rate!=null)row.cells[2].className=s.rate>=1?'on':'behind';
  }
  progress.append(grid.wrapper);
  const sections=[summary,progress];
  if(!code)sections.push(structureSection('','全區'));
  for(const s of stores)sections.push(structureSection(s.code,s.name));
  if(code)sections.at(-1).open=true;
  downloadReadonly('OP系列',scope,$('period').textContent,report.date,sections);
};
function show(value) {
  const selected = report ? $('store').value : value.stores.find(s => s.name === helperRequest)?.code;
  report = value;
  $('store').replaceChildren(new Option('北一二B（全區）',''));
  for (const s of report.stores) $('store').add(new Option(s.name,s.code));
  $('store').value = report.stores.some(s => s.code === selected) ? selected : '';
  $('dashboard').hidden = false;
  render();
  $('exportReadonly').hidden = false;
}
for (const label of labels) {
  const button = element('button',label); button.type='button';
  button.onclick = () => { dimension=label; render(); };
  $('tabs').append(button);
}
$('store').onchange = render;
function saved() { return JSON.parse(localStorage.getItem(storageKey) || 'null'); }
try {
  const last = saved();
  if (last) { show(last); $('status').textContent = '本機資料截止 ' + last.date; }
} catch { $('status').textContent = '無法讀取本機資料，請重新選擇報表。'; }
$('file').onchange = async () => {
  const token = ++revision;
  worker?.terminate(); worker = null; pending = null; $('apply').hidden = true;
  const file = $('file').files[0];
  if (!file) { $('status').textContent = '尚未選擇報表'; return; }
  $('status').textContent = '正在核對區彙總、九店與成交明細…';
  try {
    const buffer = await file.arrayBuffer();
    if (token !== revision) return;
    worker = new Worker('./op-series-worker.js');
    worker.onerror = () => { if (token === revision) $('status').textContent = '讀取失敗，請重新選擇 Excel。'; worker?.terminate(); };
    worker.onmessage = ({data}) => {
      if (token !== revision) return;
      worker.terminate(); worker = null;
      if (data.error) { $('status').textContent = '未更新：' + data.error; return; }
      const r = data.report;
      if (report && r.date < report.date) { $('status').textContent = '未更新：所選報表早於目前資料。'; return; }
      pending = r;
      $('status').textContent = r.date + '｜九店核對一致，共 ' + r.area.total + ' 件，月目標 ' + r.area.target + ' 件。';
      $('apply').hidden = false;
    };
    worker.postMessage(buffer,[buffer]);
  } catch { $('status').textContent = '無法讀取檔案，請重新選擇。'; }
};
$('apply').onclick = () => {
  if (!pending) return;
  try {
    const previous = saved();
    if (previous && previous.date > pending.date) throw new Error('本機已有較新的報表');
    localStorage.setItem(storageKey,JSON.stringify(pending));
    show(pending); pending = null;
    $('apply').hidden = true; $('file').value = '';
    $('status').textContent = '已更新本機資料，截止 ' + report.date + '。';
    $('dashboard').scrollIntoView({block:'start'});
  } catch (e) { $('status').textContent = '未更新：' + e.message; }
};
window.addEventListener('storage', e => {
  if (e.key !== storageKey && e.key !== null) return;
  const latest = saved();
  if (latest) show(latest);
  else { report = null; showHelperEmpty(); $('exportReadonly').hidden = true; $('dashboard').hidden = true; $('period').textContent = '北一二B・排除空機'; }
});
