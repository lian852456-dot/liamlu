import {parseFocus,tasks,families,standing} from './focus-tasks-core.mjs';
const $ = id=>document.getElementById(id);
const bands=['落後','全部','優異'];
const cacheKey='north12b.focus-tasks.v1';
let report, revision=0;
const pct=v=>v==null?'—':(100*v).toLocaleString('zh-TW',{maximumFractionDigits:1})+'%';
function el(tag,value,cls) {
  const n=document.createElement(tag);
  if(value!=null)n.textContent=value;
  if(cls)n.className=cls;
  return n;
}
function row(parent,values,tag='td') {
  const tr=parent.insertRow();
  for(const value of values) {
    const cell=el(tag);
    if(value instanceof Node) cell.append(value); else cell.textContent=value;
    tr.append(cell);
  }
  return tr;
}
function badge(text,cls) { return el('span',text,cls); }
function progress(s,i) {
  if(i===4) return s===report.area ? badge(s.x500Missing+' 店未達動店目標',s.x500Missing?'bad':'good') :
    badge(s.x500Met?'達動店目標':'未達動店目標',s.x500Met?'good':'bad');
  const v=s.rates[i];
  if(v==null)return badge(s.targets[i]==null?'無門市目標':'無進度率','neutral');
  return badge((v>=1?'達進度 ':'落後 ')+pct(v),v>=1?'good':'bad');
}
function numbers(s,i){return s.actual[i]+'／'+(s.targets[i]??'—');}
function renderPeople() {
  const band=bands[+$('band').value], code=$('store').value;
  $('band').setAttribute('aria-valuetext',band);
  const all=report.people.filter(p=>!code || p.code===code);
  const selected=all.filter(p=>band==='全部'||standing(p.idle)===band)
    .sort((a,b)=>(band==='落後'?b.idle-a.idle:a.idle-b.idle)||a.code.localeCompare(b.code)||a.name.localeCompare(b.name,'zh-Hant'));
  $('personCount').textContent=band+' · 顯示 '+selected.length+'／'+all.length+' 位';
  $('people').replaceChildren();
  for(const p of selected) {
    const grade=standing(p.idle), shop=report.stores.find(s=>s.code===p.code);
    row($('people'),[shop.name,p.name,badge(grade,grade==='優異'?'good':grade==='落後'?'bad':'middle'),(5-p.idle)+'／5',p.iphone,
      ...p.actual.map(n=>badge(n,n?'good':'bad'))]);
  }
  if(!selected.length){
    const cell=row($('people'),[all.length?'此門市沒有符合條件的同仁。':'個人表未列此門市同仁。']).cells[0];
    cell.colSpan=10;cell.className='empty';
  }
}
function renderInventory() {
  $('inventory').replaceChildren();
  for(const s of report.stores) {
    const [stock,sales,rate]=s.inventory[$('family').value];
    row($('inventory'),[s.name,stock,sales,pct(rate)]);
  }
}
function display(r) {
  report=r;
  $('period').textContent='北一二B ｜ '+r.dates.join(' ～ ')+' ｜ 九店・'+r.people.length+' 位同仁';
  $('metrics').replaceChildren();$('shops').replaceChildren();
  for(const [i,task] of tasks.entries()) {
    const card=el('div',null,'metric');
    card.append(el('small',task),el('strong',numbers(r.area,i)),progress(r.area,i));
    $('metrics').append(card);
  }
  const previous=$('store').value;
  $('store').replaceChildren(new Option('北一二B 全區',''));
  for(const s of r.stores) {
    $('store').add(new Option(s.name,s.code));
    row($('shops'),[s.name,...tasks.map((_,i)=>{
      const block=el('div',numbers(s,i)),hint=el('small');
      hint.append(progress(s,i));block.append(hint);return block;
    })]);
  }
  if(r.stores.some(s=>s.code===previous))$('store').value=previous;
  const missing=r.stores.filter(s=>!r.people.some(p=>p.code===s.code)).map(s=>s.name);
  const total=r.people.reduce((a,p)=>a+p.iphone,0);
  $('coverage').textContent=(missing.length?'個人表未列 '+missing.join('、')+'，無法判定該店同仁表現。 ':'')+
    'iPhone 門市表合計 '+r.area.actual[0]+' 台，個人表合計 '+total+' 台。';
  renderPeople();renderInventory();$('report').hidden=false;
}
row($('shopHead'),['門市',...tasks],'th');
row($('personHead'),['門市','同仁','表現','已動項目','iPhone 合計','i18',...tasks.slice(1)],'th');
for(const [key,label] of Object.entries(families))$('family').add(new Option(label,key));
$('band').oninput=renderPeople;$('store').onchange=renderPeople;$('family').onchange=renderInventory;

function activeProof() {
  if(!window.frameElement?.closest('#panel-focus-tasks') || !parent.DashboardB?.active())return null;
  const proof=JSON.parse(sessionStorage.getItem('north12b_password_session_v1')||'null');
  return proof?.token && (proof.battleExpiresAt||proof.expiresAt)>Date.now()?proof:null;
}
function boot(){
  const proof=activeProof();
  if(!proof){$('importBox').hidden=true;$('status').textContent='請從 KPI 戰情登入後開啟重點任務進度。';return;}
  try {
    const old=JSON.parse(sessionStorage.getItem(cacheKey)||'null');
    if(old?.token===proof.token){display(old.report);$('status').textContent='';}
    else sessionStorage.removeItem(cacheKey);
  }catch{sessionStorage.removeItem(cacheKey);}
  $('file').onchange=async()=>{
    const version=++revision, file=$('file').files[0];
    if(!file)return;
    $('status').textContent='正在核對九店與個人明細…';
    try {
      const bytes=await file.arrayBuffer();
      if(version!==revision || activeProof()?.token!==proof.token)return;
      const next=parseFocus(window.XLSX.read(bytes,{type:'array'}),window.XLSX);
      if(report && next.dates[1]<report.dates[1])throw Error('所選報表早於目前資料');
      sessionStorage.setItem(cacheKey,JSON.stringify({token:proof.token,report:next}));
      display(next);$('status').textContent='已更新本次登入的重點任務報表。';
    }catch(e){if(version===revision)$('status').textContent='未更新：'+e.message;}
    finally{if(version===revision)$('file').value='';}
  };
}
boot();
