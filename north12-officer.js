(function(){
  'use strict';
  const C=window.North12OfficerCore,T=window.North12Trends,R=window.North12TrendReport,V=window.North12TrendView;
  const $=id=>document.getElementById(id), esc=C.safe, offline=$('report-snapshot');
  let history=new Map(),sessionBatch='',model=null,scope=T.ALL,generation=0,packet=null,compact=false;
  let options={ch:'rt',base:'office',kind:'level',period:'wow',heatMetric:'rate',tierSource:'store',threshold:30};
  const option=(v,label=v)=>'<option value="'+esc(v)+'">'+esc(label)+'</option>';
  const parts=()=>[...history.values()].filter(p=>p.region!==T.OFFICE);
  function populate(){
    const active=parts(),latest=active.map(p=>p.cutoff).sort().at(-1);
    const months=T.unique(active.map(p=>p.period_start)).sort().reverse();
    $('month').innerHTML=months.map(m=>option(m,m.slice(0,7))).join('');
    $('month').value=T.first(latest);changeMonth();
  }
  function changeMonth(){
    const m=$('month').value,inputs=parts().filter(p=>p.period_start===m),end=inputs.map(p=>p.cutoff).sort().at(-1);
    $('end').min=m;$('end').max=end;$('end').value=end;
    $('region').innerHTML=option(T.ALL)+C.REGIONS.map(r=>option(r)).join('');
    populateStores();refresh();
  }
  function populateStores(){
    const region=$('region').value,stores=parts().filter(p=>p.period_start===$('month').value&&(region===T.ALL||region===p.region)).flatMap(p=>p.stores);
    $('store').innerHTML=option('all','全部門市')+stores.map(s=>option(s.id,s.region+'／'+s.short)).join('');
  }
  function refresh(){
    if(packet){model=packet.models.find(m=>m.scope===scope)||packet.models[0];}
    else{
      scope=$('store').value==='all'?$('region').value:$('store').value;
      model=R.build(history,$('end').value,scope,$('monthMode').value==='whole');
      $('monthMode').options[1].disabled=!model.full;
      if(!model.full)$('monthMode').value='same';
    }
    draw();
  }
  function draw(){
    if(!model)return;
    $('view').hidden=false;
    const m=model;
    $('base').options[0].textContent=m.office?m.office.name+'（處級）':'處級基準未提供';
    const [overview,summary]=V.summary(m,options.ch);$('overview').innerHTML=overview;$('summary').innerHTML=summary;
    const [legend,chart]=V.trend(m,options);$('legend').innerHTML=legend;$('chart').innerHTML=chart;
    $('comparison').innerHTML=V.comparison(m,options);$('tierBody').innerHTML=V.tier(m,options);
    $('advice').innerHTML=V.advice(m,options);
    const ledger=m.sources.map(s=>[s.region,s.name,s.start+' ～ '+s.end,s.stores.length+' 店・'+s.grain,s.hash]);
    $('sourceBody').innerHTML=V.table(['區域','來源檔名','有效期間','涵蓋','SHA-256'],ledger)+
      V.p((m.provenance||[]).join(' ／ '))+V.p('有效批次 '+sessionBatch+'。期間比較使用 '+m.historicalSources.join('、')+'。')+
      m.sources.map(s=>V.p(s.region+' ｜ '+s.stores.join('、')+' ｜ '+['tiers','observation','plans'].map((key,i)=>['店級 Tier','區級 Tier','原方案'][i]+' '+(s.coverage[key]?'已載入':s.issues?.[key]||'未提供')).join(' ／ '))).join('')+
      V.p(m.office?'處級涵蓋 '+m.office.name+'，共 '+m.office.stores+' 店，'+m.office.regions.join('、')+'。來源 '+m.office.source+'，截至 '+m.office.cutoff+'。':'處級基準未提供。'+T.unique(m.sources.map(s=>s.officeIssue).filter(Boolean)).join('、'))+
      V.p('北一二部已提供 '+m.available.join('、')+'。店數依來源名冊，未列報且無歷史名冊的門市無法辨識。');
    if($('export'))$('export').disabled=false;
    if(!document.body.classList.contains('import-error'))$('status').textContent=(packet?'離線快照　':'有效批次　')+sessionBatch+' ｜ '+m.sources.map(s=>s.name).filter((v,i,a)=>a.indexOf(v)===i).join('、')+' ｜ 統計截至 '+m.end;
  }
  const controls={channel:'ch',base:'base',metric:'kind',period:'period',heatMetric:'heatMetric',threshold:'threshold',tierSource:'tierSource'};
  for(const [id,key] of Object.entries(controls))$(id).onchange=()=>{
    const val=$(id).value;
    if(id==='threshold'&&(!Number.isSafeInteger(+val)||+val<1||+val>100000)){$(id).value=options.threshold;return;}
    options[key]=id==='threshold'?+val:val;draw();
  };
  $('month').onchange=changeMonth;
  $('region').onchange=()=>{
    if(packet){scope=$('region').value;configureOfflineStores();refresh();return;}
    populateStores();refresh();
  };
  $('store').onchange=()=>{if(packet)scope=$('store').value==='all'?$('region').value:$('store').value;refresh();};
  $('monthMode').onchange=refresh;
  $('end').onchange=()=>{
    if(!$('end').value||!$('end').validity.valid){$('end').value=model.end;return;}refresh();
  };
  function configureOfflineStores(){
    const parent=$('region').value;
    const stores=packet.models.filter(m=>/^DNB\d+$/.test(m.scope)&&(parent===T.ALL||parent===m.scope||m.comparisons[0].region===parent));
    $('store').innerHTML=(packet.models.some(m=>m.scope===parent)?option('all','所選範圍'):'')+stores.map(m=>option(m.scope,m.label)).join('');
    if(!packet.models.some(m=>m.scope===parent)&&stores[0])scope=stores[0].scope;
  }
  function loadPacket(value){
    if(value.schema!=='north12-trend-snapshot/v1'||!value.models?.length)throw Error('離線版本格式不符');
    packet=value;scope=packet.models[0].scope;model=packet.models[0];options={...options,...packet.options};sessionBatch=packet.batch;
    $('month').innerHTML=option(model.month,model.month.slice(0,7));$('month').disabled=true;
    $('end').value=model.end;$('end').disabled=true;
    $('monthMode').value=model.whole?'whole':'same';$('monthMode').disabled=true;
    let regions=packet.models.filter(m=>m.scope===T.ALL||C.REGIONS.includes(m.scope));
    if(!regions.length)regions=[model];
    $('region').innerHTML=regions.map(m=>option(m.scope,m.label)).join('');configureOfflineStores();
    for(const [id,key] of Object.entries(controls))$(id).value=options[key];draw();
  }
  async function parseFile(file){
    if(!/\.xls[xm]$/i.test(file.name)||!file.size||file.size>40*1024*1024)throw Error('需為 40 MB 以內的 XLSX／XLSM');
    const bytes=await file.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',bytes);
    const sha256=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
    const wanted=new Set(['部區月累計','AQ締結率','RT每日','RT締結率','樞紐',...window.ReadonlyRenewalDetail.SHEETS]);
    const names=XLSX.read(bytes,{type:'array',bookSheets:true}).SheetNames.filter(s=>wanted.has(s.normalize('NFKC').replace(/[\s\u200B-\u200D\u2060]+/g,'')));
    const w=XLSX.read(bytes,{type:'array',bookVBA:false,sheets:names});
    const data=C.parseWorkbook(w,XLSX,{sha256,source_name:file.name,source_bytes:file.size});
    if(!data.monthlyTotals)try{data.office=window.North12OfficeSource.read(w,XLSX,data);}catch(e){data.officeIssue=e.message;}
    return data;
  }
  if($('files'))$('files').onchange=async event=>{
    const files=Array.from(event.target.files);event.target.value='';if(!files.length)return;
    const token=++generation,loaded=[];let filename='';
    $('status').textContent='正在本機核對 '+files.length+' 份原報…';
    try{
      for(const file of files){filename=file.name;loaded.push(await parseFile(file));if(token!==generation)return;}
      const next=T.apply(history,loaded);
      const ids=T.unique([...next.values()].map(p=>p.period_start+'|'+p.region+'|'+Object.values(p.tierSnapshots||{}).map(s=>s.sha256).sort().join(','))).sort().join('\n');
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ids));
      if(token!==generation)return;
      sessionBatch=Array.from(new Uint8Array(digest).slice(0,6),v=>v.toString(16).padStart(2,'0')).join('');
      history=next;document.body.classList.remove('import-error');populate();
    }catch(error){
      if(token!==generation)return;document.body.classList.add('import-error');
      $('status').textContent=filename+' 匯入失敗：'+error.message+'。'+(model?'沿用批次 '+sessionBatch+'，目前檢視截至 '+model.end:'目前尚無有效資料。');
    }
  };
  if($('clear'))$('clear').onclick=()=>{
    generation++;history=new Map();model=null;$('view').hidden=true;$('export').disabled=true;
    for(const id of ['overview','summary','sourceBody','chart','comparison','tierBody','advice','legend','region','store','month'])$(id).replaceChildren();
    document.body.classList.remove('import-error');$('status').textContent='本次來源與分析資料已清除。';
  };
  if($('export'))$('export').onclick=()=>{
    if(!model)return;
    try{
      const models=[model,...model.comparisons.filter(r=>r.id!==model.scope&&r.summary.stores).map(r=>R.build(history,model.end,r.id,model.whole))];
      const value={schema:'north12-trend-snapshot/v1',batch:sessionBatch,models,options};
      window.OfflineHtml.download(C.snapshotHtml(value,window.North12OfficerExportAssets),'北一二部_'+model.label+'_'+model.end+'.html');
    }catch(e){$('status').textContent='匯出失敗：'+e.message;}
  };
  if(offline)loadPacket(JSON.parse(offline.textContent));
  const legacy=$('officer-data');
  if(legacy){const d=C.validate(JSON.parse(legacy.textContent));history=T.apply(new Map(),[d]);sessionBatch=d.sha256.slice(0,12);populate();}
  if(window.parent!==window && location.hash==='#summary'){
    compact=true;document.body.classList.add('embedded','compact');
    window.North12ReportDisplay=expanded=>{compact=!expanded;document.body.classList.toggle('compact',compact);};
    new ResizeObserver(()=>{window.frameElement?.setAttribute('height',String(document.querySelector('main').offsetHeight+10));}).observe(document.querySelector('main'));
  }
})();
