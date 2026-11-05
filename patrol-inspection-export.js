(function(root,factory){
  const checklist=typeof module==='object'&&module.exports?require('./supervisor-visit-checklist.js'):root.SupervisorVisitChecklist;
  const api=factory(checklist,typeof module==='object'&&module.exports?require('./offline-html.js'):root.OfflineHtml);
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.PatrolInspectionExport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(checklist,Html){
  'use strict';
  const CONTRACT='patrol-inspection-export-v1';
  const MAX_EMBEDDED_CHARS=80*1024*1024;
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const labels={ok:'符合',abnormal:'缺失／異常',na:'不適用','':'待填'};
  function driveLink(value){
    try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='drive.google.com'&&!u.username&&!u.password?u.href:'';}catch{return '';}
  }
  function photoData(value){return /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value||'')?value:'';}
  function project(snapshot){
    if(snapshot?.contract!==CONTRACT||!/^\d{4}-(0[1-9]|1[0-2])$/.test(snapshot.month)||!Array.isArray(snapshot.stores)||!Array.isArray(snapshot.rows))throw new Error('檢查匯出資料版本不相容');
    const stores=[...new Set(snapshot.stores.map(String))];
    const rows=snapshot.rows.map(r=>{
      if(!stores.includes(r.store)||!/^\d{4}-\d{2}-\d{2}$/.test(r.date)||r.date.slice(0,7)!==snapshot.month||!Object.hasOwn(labels,r.result)||!checklist.isValidItem(r.item,r.date))throw new Error('檢查匯出範圍不一致');
      return {date:r.date,store:r.store,inspector:String(r.inspector||''),item:Number(r.item),number:checklist.labelFor(r.item),category:checklist.BY_ID[r.item]?.category||'',deduction:checklist.BY_ID[r.item]?.deduction||'',result:r.result,title:String(checklist.BY_ID[r.item]?.text||r.title||`檢查項目 ${r.item}`),note:String(r.note||''),improvement:String(r.improvement||''),savedAt:String(r.savedAt||''),media:(r.media||[]).map(m=>{
        const data=photoData(m.dataUrl);
        if(/^image\//.test(m.mimeType||'')&&!data)throw new Error(`照片尚未完整嵌入：${m.name||'附件'}`);
        return data?{name:String(m.name||'照片'),dataUrl:data}:{name:String(m.name||'附件'),viewUrl:driveLink(m.viewUrl)};
      })};
    });
    rows.sort((a,b)=>b.date.localeCompare(a.date)||a.store.localeCompare(b.store,'zh-Hant')||a.item-b.item);
    return {contract:CONTRACT,month:snapshot.month,stores,rows,readAt:String(snapshot.readAt||''),exportedAt:String(snapshot.exportedAt||new Date().toISOString()),demo:snapshot.demo===true};
  }
  async function collect({request,scope,assertActive,onProgress=()=>{},titleFor=()=>''}){
    assertActive();
    const snapshot=await request('half_export_snapshot',scope);assertActive();
    if(snapshot.status!=='ok'||snapshot.contract!==CONTRACT)throw new Error(snapshot.message==='unknown patrol action'||snapshot.message==='unknown action'?'巡店服務尚未部署 HTML 匯出功能，請先更新正式後端':snapshot.message||'無法讀取正式匯出資料');
    if(snapshot.month!==scope.month||!Array.isArray(snapshot.rows)||!snapshot.rows.length)throw new Error('所選範圍沒有已儲存的檢查紀錄');
    const rows=snapshot.rows.map(r=>({...r,title:titleFor(r.item,r.date),media:(r.media||[]).map(m=>({...m}))}));
    const photos=rows.flatMap(r=>r.media.filter(m=>m.id&&m.kind!=='video').map(m=>({r,m})));
    let total=0;
    for(let i=0;i<photos.length;i++){
      const {r,m}=photos[i];assertActive();onProgress(`正在嵌入照片 ${i+1}/${photos.length}：${r.store} 第 ${checklist.labelFor(r.item)||checklist.BY_ID[r.item]?.text||r.item} 項`);
      const res=await request('half_export_photo',{...scope,revision:snapshot.revision,checkId:r.checkId,item:r.item,fileId:m.id});assertActive();
      if(res.status==='ok'&&res.contract===CONTRACT&&['video','attachment'].includes(res.kind)){m.mimeType=res.mimeType;continue;}
      if(res.status!=='ok'||res.contract!==CONTRACT||!photoData(res.dataUrl))throw new Error(`${r.store} 第 ${checklist.labelFor(r.item)||checklist.BY_ID[r.item]?.text||r.item} 項照片讀取失敗：${res.message||'無法嵌入照片'}`);
      total+=res.dataUrl.length;if(total>MAX_EMBEDDED_CHARS)throw new Error('照片總量超過 80 MB，請改為分店匯出');
      m.dataUrl=res.dataUrl;m.mimeType=res.mimeType;
    }
    const latest=await request('half_export_snapshot',scope);assertActive();
    if(latest.status!=='ok'||latest.revision!==snapshot.revision)throw new Error('匯出期間雲端檢查已更新，請重新匯出');
    const groups=new Map();
    rows.forEach(r=>{const key=`${r.date}|${r.store}|${checklist.versionFor(r)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);});
    for(const group of groups.values()){
      const first=group[0];
      for(const item of checklist.idsForRecord(first))if(!group.some(r=>r.item===item))rows.push({...first,item,title:titleFor(item,first.date),result:'',note:'尚無已儲存紀錄',improvement:'',savedAt:'',media:[]});
    }
    return project({...snapshot,rows});
  }
  function viewer(){
    const $=id=>document.getElementById(id);
    const checks=[...document.querySelectorAll('.check')];
    const cards=[...document.querySelectorAll('.store-summary')];
    function apply(){
      const store=$('store').value,status=$('status').value,term=$('query').value.trim().toLocaleLowerCase();let visible=0;
      for(const c of checks){
        let matched=0;
        for(const r of c.querySelectorAll('.item')){
          const show=(!store||c.dataset.store===store)&&(!status||r.dataset.result===status||(status==='pending'&&r.dataset.result===''))&&(!term||r.textContent.toLocaleLowerCase().includes(term)||c.dataset.store.toLocaleLowerCase().includes(term)||c.dataset.inspector.toLocaleLowerCase().includes(term));r.hidden=!show;if(show)matched++;
        }
        c.hidden=!matched;if(matched){visible++;if(status||term)c.open=true;}
      }
      cards.forEach(c=>c.hidden=Boolean(store&&c.dataset.store!==store));
      $('visible').textContent=`目前顯示 ${visible} 次檢查／匯出共 ${checks.length} 次`;
      $('empty').hidden=visible>0;
    }
    ['store','status','query'].forEach(id=>$(id).addEventListener('input',apply));
    $('reset').addEventListener('click',()=>{['store','status','query'].forEach(id=>$(id).value='');apply();});
    $('expand').addEventListener('click',()=>checks.filter(c=>!c.hidden).forEach(c=>c.open=true));
    $('collapse').addEventListener('click',()=>checks.forEach(c=>c.open=false));
    $('print').addEventListener('click',()=>window.print());
    let printState=[];
    window.addEventListener('beforeprint',()=>{printState=checks.map(c=>c.open);checks.filter(c=>!c.hidden).forEach(c=>c.open=true);});
    window.addEventListener('afterprint',()=>checks.forEach((c,i)=>c.open=printState[i]));
    let lastPhoto;
    const dlg=$('photo-dialog');
    document.querySelectorAll('.photo-button').forEach(b=>b.addEventListener('click',()=>{lastPhoto=b;const img=b.querySelector('img');$('full-photo').src=img.src;$('photo-caption').textContent=img.alt;dlg.showModal();}));
    $('close-photo').addEventListener('click',()=>dlg.close());
    dlg.addEventListener('click',e=>{if(e.target===dlg)dlg.close();});
    dlg.addEventListener('close',()=>{$('full-photo').removeAttribute('src');lastPhoto?.focus();});
    apply();
  }
  function buildHTML(input){
    const s=project(input),groups=new Map();
    for(const r of s.rows){const k=`${r.date}|${r.store}|${checklist.versionFor(r)}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r);}
    // Missing questions are shown as pending, never as passed.
    for(const rows of groups.values()){
      const first=rows[0];
      for(const item of checklist.idsForRecord(first))if(!rows.some(r=>r.item===item))rows.push({...first,item,number:checklist.labelFor(item),category:checklist.BY_ID[item]?.category||'',deduction:checklist.BY_ID[item]?.deduction||'',title:checklist.BY_ID[item]?.text||`檢查項目 ${item}`,result:'',note:'尚無已儲存紀錄',improvement:'',savedAt:'',media:[]});
      rows.sort((a,b)=>a.item-b.item);
    }
    const all=[...groups.values()].flat(),issues=all.filter(r=>r.result==='abnormal'),pending=all.filter(r=>!r.result),photos=all.flatMap(r=>r.media).filter(m=>m.dataUrl).length;
    const stamp=v=>{const date=new Date(v);return Number.isFinite(+date)?date.toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false}):'未提供';};
    const photoHTML=(m,r)=>m.dataUrl?`<figure><button class="photo-button" type="button" aria-label="放大 ${esc(m.name)}"><img src="${esc(m.dataUrl)}" loading="lazy" alt="${esc(`${r.date} ${r.store} 第 ${checklist.labelFor(r.item)||checklist.BY_ID[r.item]?.text||r.item} 項｜${m.name}`)}"></button><figcaption>${esc(m.name)}</figcaption></figure>`:`<div class="attachment">${esc(m.name)}${m.viewUrl?`<a href="${esc(m.viewUrl)}" target="_blank" rel="noopener noreferrer">開啟私有附件（需網路與權限）</a>`:'<span>此附件未嵌入，請回原系統查看</span>'}</div>`;
    const storeHTML=s.stores.map(store=>{
      const entries=[...groups.values()].filter(rows=>rows[0].store===store),rows=entries.flat();
      return `<article class="store-summary" data-store="${esc(store)}"><strong>${esc(store)}</strong><b>${entries.length} <small>次檢查</small></b><p>${entries.length?`缺失 ${rows.filter(r=>r.result==='abnormal').length} 項 · 待填 ${rows.filter(r=>!r.result).length} 題`:'本月尚無已儲存紀錄'}</p></article>`;
    }).join('');
    const checksHTML=[...groups.values()].map(rows=>{
      const r=rows[0],ab=rows.filter(x=>x.result==='abnormal').length,filled=rows.filter(x=>x.result).length;
      return `<details class="check" data-store="${esc(r.store)}" data-inspector="${esc(r.inspector)}" ${ab?'open':''}><summary><div><span class="date">${esc(r.date)} · ${Number(r.date.slice(-2))<=15?'上半月':'下半月'}</span><h3>${esc(r.store)} <span class="inspector">督導 ${esc(r.inspector||'未填')}</span></h3></div><div class="check-badges"><span>${filled}/${rows.length} 題已填</span><span class="badge ${ab?'abnormal':'ok'}">${ab?`${ab} 項缺失`:'已填項目無異常'}</span><span>展開 ▾</span></div></summary><div class="items">${rows.map(x=>`<article class="item ${x.result==='abnormal'?'issue':''}" data-result="${esc(x.result)}"><div class="item-heading"><span class="item-no">${esc(x.number)}</span><h4>${esc(x.title)}${x.category||x.deduction?`<small class="item-rule">${esc([x.category,x.deduction].filter(Boolean).join(' · '))}</small>`:''}</h4><span class="badge ${x.result||'pending'}">${esc(labels[x.result])}</span></div><div class="notes"><div><label>檢查紀錄／缺失內容</label><p>${esc(x.note||'未填寫')}</p></div><div><label>改善說明${x.result==='abnormal'&&!x.improvement?' · 待補說明':''}</label><p>${esc(x.improvement||'未填寫')}</p></div></div>${x.media.length?`<div class="gallery">${x.media.map(m=>photoHTML(m,x)).join('')}</div>`:'<p class="no-photo">此題未附照片</p>'}${x.savedAt?`<small class="updated">最後儲存：${esc(x.savedAt)}</small>`:''}</article>`).join('')}</div></details>`;
    }).join('');
    return Html.finalize(`<!doctype html><html lang="zh-Hant"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'"><title>${esc(s.month)} 督導巡店檢查｜唯讀儀表板</title><style>
*{box-sizing:border-box}body{margin:0;background:#f6f7fa;color:#182333;font:700 16px/1.65 'Microsoft YaHei','Microsoft JhengHei',system-ui,sans-serif}button,input,select{font:inherit}button,select{cursor:pointer}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #0067c0;outline-offset:3px}button{padding:10px 16px;border:1px solid #d8dfe8;border-radius:9px;background:white;color:#182333}header{background:#191919;color:white;border-top:6px solid #ff6900;padding:32px max(24px,calc((100% - 1440px)/2))}.brand{color:#ffad70;font-size:14px;letter-spacing:2px}h1{font-size:clamp(26px,4vw,38px);margin:8px 0}header p{color:#d7dce1;margin:6px 0}.readonly{display:inline-block;font-size:13px;padding:3px 10px;border:1px solid #6f7377;border-radius:24px;margin-left:10px}main{max-width:1504px;padding:26px 32px 64px;margin:auto}.notice{border-left:4px solid #ff6900;background:#fff3e9;padding:15px 20px;border-radius:6px;margin-bottom:22px}.demo{background:#fff0b9;color:#5d4200}.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:14px;margin:22px 0}.stat,.store-summary{background:white;border:1px solid #e1e5ec;border-radius:12px;padding:20px}.stat b{display:block;font-size:34px;line-height:1.3}.stat span{color:#57677c;font-size:14px}.danger{color:#c43535}.filters{display:flex;gap:12px;align-items:end;flex-wrap:wrap;background:white;padding:20px;border-radius:12px;border:1px solid #e1e5ec}.filters label{display:grid;gap:6px;font-size:14px}.filters input,.filters select{padding:10px;border:1px solid #bdc7d5;border-radius:7px;max-width:100%;background:white;color:#182333}.search{flex:1;min-width:200px}.stores{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.store-summary{padding:16px 20px;display:grid;grid-template-columns:1fr auto;gap:2px}.store-summary b{font-size:22px}.store-summary small,.store-summary p{font-size:14px;color:#647287}.store-summary p{grid-column:1/-1;margin:0}h2{font-size:23px;margin:28px 0 14px}.tools{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin:20px 0 12px}.tools p{margin:0;color:#647287}.check{background:white;border:1px solid #dfe5ed;border-radius:12px;margin:14px 0;overflow:hidden}summary{cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 24px;background:#fff}summary h3{margin:2px 0;font-size:23px}.date{font-size:14px;color:#57677c}.inspector{font-size:15px;color:#57677c;margin-left:14px}.check-badges{display:flex;gap:14px;align-items:center;flex-wrap:wrap;font-size:14px}.badge{display:inline-block;padding:4px 10px;border-radius:7px;white-space:nowrap;font-size:14px;background:#edf0f5;color:#536173}.badge.abnormal{background:#ffebea;color:#b62b2b}.badge.ok{background:#e8f6ed;color:#17653c}.badge.pending{background:#fff3d5;color:#855300}.items{padding:0 20px 20px}.item{padding:20px;border-top:1px solid #e1e5ec}.item.issue{border-left:4px solid #d64740;background:#fffafa;border-radius:8px}.item-heading{display:flex;gap:12px;align-items:flex-start}.item-rule{display:block;font-size:14px;color:#795033;margin-top:6px}.item-heading h4{white-space:pre-line;flex:1;margin:0;font-size:17px}.item-no{background:#eff2f6;min-width:32px;text-align:center;border-radius:7px}.notes{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px}.notes label{font-size:13px;color:#65748a}.notes p{white-space:pre-wrap;margin:5px 0;overflow-wrap:anywhere;font-weight:500}.gallery{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;margin-top:18px}figure{margin:0;min-width:0}.photo-button{padding:0;background:#edf0f5;width:100%;overflow:hidden;border-radius:10px}.photo-button img{display:block;width:100%;height:205px;object-fit:contain}figcaption{font-size:12px;color:#647287;overflow-wrap:anywhere;margin-top:4px}.attachment{font-size:14px;background:#f0f3f7;padding:16px;border-radius:8px}.attachment a,.attachment span{display:block;color:#005c9c}.no-photo,.updated{font-size:12px;color:#69778a}.updated{display:block;margin-top:12px}dialog{border:0;border-radius:12px;padding:20px;max-width:94vw;max-height:94vh}dialog::backdrop{background:#111b}dialog img{display:block;max-width:85vw;max-height:74vh;object-fit:contain;margin:14px auto}dialog p{font-size:14px;overflow-wrap:anywhere}footer{color:#647287;font-size:13px;margin-top:30px;border-top:1px solid #dce2eb;padding-top:18px}#empty{padding:36px;text-align:center;background:white}[hidden]{display:none!important}@media(max-width:760px){main{padding:18px 14px}.stats{grid-template-columns:repeat(2,1fr)}.stat:last-child{grid-column:1/-1}.stat{padding:15px}.stores{grid-template-columns:1fr}.notes{grid-template-columns:1fr;gap:10px}summary{align-items:start;flex-direction:column;padding:18px}.inspector{display:block;margin:0}.items{padding:0 5px 12px}.item{padding:15px}.item-heading{flex-wrap:wrap}.item-heading h4{min-width:65%}.gallery{grid-template-columns:repeat(2,minmax(0,1fr))}.photo-button img{height:160px}.filters label{width:100%}.filters button{flex:1}.filters input,.filters select{width:100%}header{padding:24px 18px}}@media print{header{background:white;color:#182333;padding:12px;border:0}header p{color:#182333}main{padding:0}.filters,.tools button,dialog{display:none!important}details::details-content{content-visibility:visible!important;display:block!important}.check{overflow:visible;break-inside:auto}.item{break-inside:avoid}.stores{grid-template-columns:repeat(3,1fr)}.stats{grid-template-columns:repeat(5,1fr)}.gallery{grid-template-columns:repeat(3,1fr)}[hidden]{display:none!important}body{background:white;font-size:12px}.photo-button img{height:150px}}
</style></head><body><header><div class="brand">LIAM 情報站 · 北一二B</div><h1>督導巡店檢查<span class="readonly">唯讀快照</span></h1><p>${esc(s.month)} ｜ ${esc(s.stores.join('、'))}</p><p>${s.demo?'示範資料時間':'正式資料讀取'}：${esc(stamp(s.readAt))} · 匯出時間：${esc(stamp(s.exportedAt))}（台北）</p></header><main>${s.demo?'<div class="notice demo"><strong>版型示範｜本頁全部紀錄及照片為合成示範，非正式巡店資料。</strong></div>':''}<div class="notice">檢查結果與照片已包含於此檔，可離線查看。這是匯出當下的唯讀快照；持有檔案即可查看內容，請交付給適當對象。影片及其他附件保留私有連結，需網路與原有權限。填寫改善說明不代表已驗收結案。</div><section class="stats" aria-label="匯出範圍總覽"><div class="stat"><b>${s.stores.length}</b><span>匯出門市</span></div><div class="stat"><b>${groups.size}</b><span>已建立檢查</span></div><div class="stat"><b class="danger">${issues.length}</b><span>缺失／異常項目</span></div><div class="stat"><b>${pending.length}</b><span>已建立檢查待填題數</span></div><div class="stat"><b>${photos}</b><span>已嵌入照片</span></div></section><div class="filters"><label>門市<select id="store" aria-label="門市"><option value="">全部匯出門市</option>${s.stores.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></label><label>結果<select id="status" aria-label="結果"><option value="">全部檢查結果</option><option value="abnormal">缺失／異常</option><option value="ok">符合</option><option value="pending">待填</option><option value="na">不適用</option></select></label><label class="search">關鍵字<input id="query" type="search" placeholder="搜尋檢查內容、督導、缺失與改善"></label><button id="reset" type="button">清除篩選</button><button id="print" type="button">列印／存為 PDF</button></div><h2>各店檢查概況</h2><section class="stores">${storeHTML}</section><h2>檢查結果與照片</h2><div class="tools"><p id="visible"></p><div><button id="expand" type="button">全部展開</button> <button id="collapse" type="button">全部收合</button></div></div><p id="empty" hidden>沒有符合篩選的檢查紀錄</p>${checksHTML}<footer>${s.demo?'來源：合成示範資料，非雲端正式紀錄。':'來源：已通過巡店工作階段驗證的雲端已儲存紀錄。'}Y26.11 新版每次 29 項；歷史版本保留原 9 題或 18 題。上方總覽與各店卡片統計整份檔案，篩選僅調整下方明細。無資料的門市顯示尚無紀錄，未填題目不視為符合。</footer></main><dialog id="photo-dialog" aria-label="巡店照片放大檢視"><button id="close-photo" type="button">關閉照片</button><img id="full-photo" alt="放大的巡店照片"><p id="photo-caption"></p></dialog><script>(${viewer.toString()})();</script></body></html>`);
  }
  return {CONTRACT,collect,project,buildHTML};
});
