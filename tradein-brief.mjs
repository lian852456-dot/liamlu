import {createSupervisorAccess} from './tradein-supervisor-auth.mjs?v=20261012-supervisor-1';
import {createPublicReader,readPublicFrame} from './tradein-public-read.mjs?v=20261010-date-read-1';
import {buildBrief} from './tradein-brief-core.mjs?v=20261012-targets-1';
import {buildDeck} from './tradein-brief-pptx.mjs?v=20261012-targets-1';
const API='https://script.google.com/macros/s/AKfycbwf_ms5rkOIg92FOZwZuHCft3JWpC7ENPUN6c6ebPb1Jd6eqKYfa_2tmrI8onDIl4Mi/exec',$=id=>document.getElementById(id);
let model=null,epoch=0,controller=null,busy=false,vendor=null;
let access;
access=createSupervisorAccess({onRevoke:()=>lockView()});
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const read=createPublicReader({endpoint:API,frame:(p,signal)=>readPublicFrame(API,p,signal),post:async(url,p,signal)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(p),credentials:'omit',cache:'no-store',signal});if(!r.ok)throw Error('服務暫時無回應');return r.json();}});
function trendSvg(m){const known=m.trend.map((d,i)=>({...d,x:58+i*89})),max=Math.max(1,...known.map(d=>d.units||0)),y=v=>185-v/max*145;
 const points=known.filter(d=>d.units!==null).map(d=>`${d.x},${y(d.units)}`).join(' ');
 return `<svg viewBox="0 0 460 224" role="img" aria-label="${esc(m.trend.map(d=>d.date+'：'+(d.units===null?'未提供':d.units+'台')).join('，'))}"><path d="M45 32V185H430" fill="none" stroke="#cbd5df"/><text x="10" y="40">${max}</text><text x="20" y="191">0</text><polyline points="${points}" fill="none" stroke="#257eb1" stroke-width="3"/>${known.map(d=>`<text x="${d.x}" y="215" text-anchor="middle">${d.date.slice(5)}</text>${d.units===null?'':`<circle cx="${d.x}" cy="${y(d.units)}" r="5" fill="#257eb1"/><text x="${d.x}" y="${y(d.units)-12}" text-anchor="middle">${d.units}</text>`}`).join('')}</svg>`;}
function render(m){access.requireCurrent();const cols=m.ranking.length>45?6:5,per=Math.ceil(m.ranking.length/cols);
 $('briefPreview').innerHTML=`<section class="brief-slide ${cols===6?'compact':''}"><div class="brief-header"><img src="assets/brand/twm-logo.png" alt="台灣大哥大LOGO"><div><h2>北一二B舊換新成效</h2><p>${m.month}　來源 ${m.sourceStart}–${m.cutoff}　${esc(m.personalRule)}</p></div></div><div class="brief-metrics">${[['累積上線',m.actual+' 台',`店目標 ${m.target} 台，達成 ${m.attainment}%`],['人員動員',m.mobilizedPeople+' / '+m.totalPeople+' 人',`佔比 ${m.peopleShare}%，個人合計 ${m.personalTotal} 台`],['門市動員',m.mobilizedStores+' / '+m.totalStores+' 店',`佔比 ${m.storeShare}%`],['近五天上線',m.trend.reduce((n,d)=>n+(d.units||0),0)+' 台',m.trend[0].date.slice(5)+'–'+m.cutoff.slice(5)]].map(v=>`<article><h3>${v[0]}</h3><strong>${v[1]}</strong><p>${v[2]}</p></article>`).join('')}</div><div class="brief-middle"><section><h3>TOP 回收機款</h3><table><thead><tr><th>機款</th><th>台</th><th>佔比</th></tr></thead><tbody>${m.topModels.map(p=>`<tr><td>${esc(p.model)}</td><td>${p.units}</td><td>${p.share}%</td></tr>`).join('')}</tbody></table></section><section class="brief-trend"><h3>近五天回收上線</h3>${trendSvg(m)}</section><section class="brief-reminders"><h3>回收必查與管理提醒</h3>${m.reminders.map((r,i)=>`<p>${i<3?(i+1)+'. ':''}${esc(r)}</p>`).join('')}</section></div><section class="brief-ranking"><h3>個人上線數排序<small>全部 ${m.totalPeople} 人，同筆數並列</small></h3><div class="ranking-columns" style="grid-template-columns:repeat(${cols},1fr)">${Array.from({length:cols},(_,c)=>`<table><thead><tr><th>名次</th><th>人員／門市</th><th>台</th></tr></thead><tbody>${m.ranking.slice(c*per,(c+1)*per).map(p=>`<tr><td>${p.rank}</td><td>${esc(p.name)}／${esc(p.store)}</td><td>${p.units}</td></tr>`).join('')}</tbody></table>`).join('')}</div></section><p class="brief-footer">${esc(m.targetRule)}人員動員＝有上線人數／全員人數。</p></section>`;$('briefPreview').hidden=false;
}
function controls(value){
 busy=value;
 const locked=!access?.current();
 $('readBrief').disabled=value||locked;$('briefMonth').disabled=value||locked;
 $('downloadPptx').disabled=value||locked||!model;$('printBrief').disabled=value||locked||!model;
 $('verifyBriefSupervisor').disabled=value;
}
function lockView(message='簡報產出僅限督導使用，請重新完成督導驗證。'){
 epoch++;controller?.abort();controller=null;model=null;busy=false;
 document.body.dataset.briefAccess='locked';delete document.body.dataset.briefPrintAuthorized;
 $('briefWorkspace').hidden=true;$('briefWorkspace').inert=true;$('briefAuth').hidden=false;
 $('briefPreview').hidden=true;$('briefPreview').replaceChildren();$('briefStatus').textContent='';
 $('briefSessionStatus').textContent='';$('briefPasscode').value='';$('briefAuthStatus').textContent=message;
 document.querySelectorAll('[data-supervisor-brief]').forEach(link=>link.hidden=true);
 ['readBrief','briefMonth','downloadPptx','printBrief'].forEach(id=>$(id).disabled=true);
 $('verifyBriefSupervisor').disabled=false;
}
function unlockView(session){
 access.requireCurrent();document.body.dataset.briefAccess='verified';
 $('briefWorkspace').hidden=false;$('briefWorkspace').inert=false;$('briefAuth').hidden=true;
 document.querySelectorAll('[data-supervisor-brief]').forEach(link=>link.hidden=false);
 const deadline=new Date(session.expiresAt).toLocaleTimeString('zh-TW',{timeZone:'Asia/Taipei',hour:'2-digit',minute:'2-digit'});
 $('briefSessionStatus').textContent='督導已驗證 · '+deadline+' 到期（台灣時間）';
}
async function load({key}={}){
 if(busy)return;
 const ticket=++epoch;controller?.abort();controller=new AbortController();
 const signal=controller.signal;
 model=null;controls(true);$('briefPreview').hidden=true;$('briefPreview').replaceChildren();
 $('briefAuthStatus').textContent='正在驗證督導權限…';$('briefStatus').textContent='正在驗證督導權限…';
 try{
  const session=await access.verify({key,signal});
  if(ticket!==epoch)return;access.requireCurrent();unlockView(session);
  $('briefStatus').textContent='正在讀取已核對資料…';
  const month=$('briefMonth').value;
  const r=await read({action:'tradein_performance_public_read',month,includeDays:true},{signal});
  if(ticket!==epoch)return;access.requireCurrent();
  if(!r.snapshot)throw Error('選定月份尚未提供資料');
  model=buildBrief(r.snapshot,window.TradeinPublicCore.validate,month);render(model);
  $('briefStatus').textContent=`來源截止 ${model.cutoff}，已核對 ${model.actual} 台。文字、圖表及排行可在 PowerPoint 編輯。`;
 }catch(error){
  if(ticket!==epoch)return;
  model=null;$('briefPreview').hidden=true;$('briefPreview').replaceChildren();
  if(!access.current())lockView('督導驗證未完成，請確認通行碼或重新驗證。');
  else $('briefStatus').textContent='簡報尚未產出：'+error.message;
 }finally{if(ticket===epoch)controls(false);}
}
async function loadVendor(){if(vendor)return vendor;vendor=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='assets/vendor/store-presentation/pptxgenjs-4.0.1.bundle.js';s.onload=()=>{const ctor=window.pptxgen||window.PptxGenJS;typeof ctor==='function'?resolve(ctor):reject(Error('簡報套件初始化失敗'));};s.onerror=()=>{vendor=null;s.remove();reject(Error('簡報套件載入失敗，請確認網路後重試'));};document.head.append(s);});return vendor;}
async function logo(){const r=await fetch('assets/brand/twm-logo.png');if(!r.ok)throw Error('LOGO讀取失敗');const blob=await r.blob();return new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=()=>reject(Error('LOGO讀取失敗'));f.readAsDataURL(blob);});}
async function download(){
 if(!model||busy||!access.current())return;
 const ticket=epoch,m=model;controls(true);$('briefStatus').textContent='正在驗證並產生一頁可編輯簡報…';
 try{
  await access.verify();if(ticket!==epoch)return;access.requireCurrent();
  const [Pptx,data]=await Promise.all([loadVendor(),logo()]);
  if(ticket!==epoch)return;access.requireCurrent();
  const deck=buildDeck(m,Pptx,data),blob=await deck.write({outputType:'blob',compression:true});
  if(ticket!==epoch)return;
  // Revalidate after asynchronous generation as well: revoked sessions must not release a file.
  await access.verify();if(ticket!==epoch)return;access.requireCurrent();
  if(blob.size<1000)throw Error('簡報尚未完成');
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`北一二B_舊換新成效_${m.month}_截至${m.cutoff}.pptx`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  $('briefStatus').textContent='一頁簡報已交給瀏覽器下載，請在下載列表確認。';
 }catch(error){
  if(ticket!==epoch)return;
  if(!access.current())lockView();else $('briefStatus').textContent='簡報未完成：'+error.message;
 }finally{if(ticket===epoch)controls(false);}
}
async function print(){
 if(!model||busy||!access.current())return;
 const ticket=epoch;controls(true);
 try{
  await access.verify();if(ticket!==epoch)return;access.requireCurrent();
  document.body.dataset.briefPrintAuthorized='true';window.print();
 }catch(error){
  if(ticket===epoch){if(!access.current())lockView();else $('briefStatus').textContent='列印未完成：'+error.message;}
 }finally{delete document.body.dataset.briefPrintAuthorized;if(ticket===epoch)controls(false);}
}
const requested=new URL(location.href).searchParams.get('month');
$('briefMonth').value=/^20\d{2}-(0[1-9]|1[0-2])$/.test(requested||'')?requested:new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}).slice(0,7);
$('briefAuthForm').addEventListener('submit',event=>{
 event.preventDefault();if(busy)return;
 const key=$('briefPasscode').value;$('briefPasscode').value='';
 if(!key)return;load({key});
});
$('readBrief').addEventListener('click',()=>load());$('briefMonth').addEventListener('change',()=>load());
$('downloadPptx').addEventListener('click',download);$('printBrief').addEventListener('click',print);
$('briefLock').addEventListener('click',()=>{access.clear();lockView('簡報已鎖定，請重新驗證督導權限。');});
window.addEventListener('beforeprint',()=>{if(!access.current()||!model)delete document.body.dataset.briefPrintAuthorized;});
window.addEventListener('afterprint',()=>{delete document.body.dataset.briefPrintAuthorized;});
// A restored page must verify again; no hidden-tab or bfcache preview is retained.
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!busy)load();});
window.addEventListener('pageshow',event=>{if(event.persisted&&!busy)load();});
window.addEventListener('portal-login-changed',()=>{if(!access.current()&&!busy)load();});
load();
