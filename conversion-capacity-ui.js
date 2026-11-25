'use strict';
window.createCapacityPanel = function createCapacityPanel(host, getConversion, getScope=()=>'all', {crossDistrict=false}={}) {
  const el = tag=>document.createElement(tag);
  const add=(parent,tag,text)=>{const node=el(tag);node.textContent=text;parent.append(node);return node;};
  add(host,'h2','AQ／RT 量能與締結率重點提醒');
  add(host,'p','選擇一份或兩份量能原檔。資料與密碼僅供本頁使用，按量能報表完整月份累計至截止日分析。');
  const inputs={};
  function input(label,type){const field=add(host,'label',label),box=el('input');box.type=type;field.append(box);return box;}
  for(const kind of ['AQ','RT']){
    const box=input(kind+' 量能 Excel','file');box.accept='.xlsx,.xlsm';inputs[kind]=box;
  }
  const password=input('Excel 開啟密碼（加密量能檔使用）','password');password.autocomplete='off';
  const button=add(host,'button','本機分析量能與締結率');button.type='button';
  const exportBtn=add(host,'button','一鍵匯出 AQRT 重點截圖（PNG）');exportBtn.type='button';exportBtn.disabled=true;
  const regionLabel=add(host,'label','亮點分區'),regionSelect=el('select');regionLabel.append(regionSelect);regionLabel.hidden=true;
  const status=add(host,'p','');status.setAttribute('role','status');
  const output=el('div');host.append(output);
  let generation=0, reports=[], conversion=null;
  const workers=new Map();
  let briefing=[],renderVersion=0;
  const fmt=n=>n==null?'—':n.toLocaleString('zh-TW',{maximumFractionDigits:2});
  function clearResults(){
    generation++;for(const [worker,cancel] of workers){worker.terminate();cancel(Error('已取消'));}workers.clear();
    reports=[];conversion=null;briefing=[];renderVersion++;exportBtn.disabled=true;regionLabel.hidden=true;regionSelect.replaceChildren();output.replaceChildren();status.textContent='';button.disabled=false;
  }
  function reset(){clearResults();for(const box of Object.values(inputs))box.value='';password.value='';}
  function hasFiles(){return Object.values(inputs).some(box=>box.files.length);}
  function draw(scope=getScope()){
    output.replaceChildren();
    renderVersion++;briefing=[];exportBtn.disabled=!reports.length;
    const selected=regionSelect.value, regions=new Set(reports.flatMap(r=>(r.mix?.regions||[]).map(u=>u.name)));
    regionSelect.replaceChildren();regionSelect.add(new Option('全部分區','all'));
    for(const name of regions)regionSelect.add(new Option(name,name));
    if(regions.has(selected))regionSelect.value=selected;
    regionLabel.hidden=!crossDistrict || regions.size<2;
    for(const report of reports){
      const title=report.kind+' 量能 · 截至 '+report.cutoff;
      const groups=[];
      const same=conversion?.cutoff===report.cutoff;
      add(output,'h3',title);
      const row=report.entries.find(r=>r.id===scope);
      if(!row)continue;
      const result=ConversionCapacity.reminder(report,row,conversion);
      const tracking=[['上線與點數',fmt(row.actual)+' 件 · '+fmt(row.points)+'／'+fmt(row.target)+' 點'],
        ['追量', '缺 '+fmt(result.gap)+' 點'+(result.daily===null?'（已結月）':'，日均需 '+fmt(result.daily)+' 點。')],
        ['締結率',same?(result.rate===null?'分母為零':(result.rate*100).toFixed(1)+'%'):
          conversion?'締結率截止 '+conversion.cutoff+'，日期不同。':'尚無同期間締結率明細。']];
      const stores=report.entries.filter(r=>r.id!=='all'&&(scope==='all'||r.id===scope));
      const most=stores.reduce((top,r)=>!top||r.target-r.points>top.target-top.points?r:top,null);
      if(most && most.target>most.points){
        const hint=ConversionCapacity.reminder(report,most,conversion);
        tracking.push(['優先追量',most.name+' 尚缺 '+fmt(hint.gap)+' 點'+(hint.daily===null?'。':'，日均需 '+fmt(hint.daily)+' 點。')]);
      }
      if(!crossDistrict || regionSelect.value==='all' || regionSelect.value===row.name)
        groups.push({title:row.name+' · 日目標',lines:tracking});
      const basis=report.kind==='AQ'?'含通轉手':'含換約及通轉手';
      const units=scope==='all'?(report.mix?.regions||[]).filter(u=>!crossDistrict || regionSelect.value==='all'||u.name===regionSelect.value):
        [report.mix?.stores?.[scope]].filter(Boolean);
      if(!units.length)groups.push({title:'專案／商品亮點',lines:[['資料核對',report.mix?.issue||'所選範圍缺少可核對的明細。']]});
      else{
        groups.push({title:'上線亮點 · 統計口徑',lines:[['資料來源','RS_Voice'+report.kind+' 本月截至 '+report.cutoff+'，'+basis+'。以表定資費分級、用戶人數計件。並列首位取一例；商品只排有品名的紀錄。動店相關依品名或專案關鍵字辨識。']]});
        for(const u of units)groups.push({title:u.name+' · 專案／商品亮點',lines:CapacityMix.lines(u,report.kind)});
      }
      briefing.push({title,groups});
      const cards=add(output,'div','');cards.className='capacity-highlights';
      for(const g of groups){
        const card=add(cards,'section','');add(card,'h4',g.title);
        const list=add(card,'dl','');
        for(const [label,value] of g.lines){add(list,'dt',label);add(list,'dd',value);}
      }
      add(output,'h4',row.name+' · 量能與日目標明細');
      const wrap=el('div');wrap.className='capacity-table';output.append(wrap);
      const table=el('table');wrap.append(table);const head=table.createTHead().insertRow();
      for(const label of ['門市','上線件','上月同期件','件數月增減','累計點','月目標點','缺口點','日需點','月締結率','重點提醒'])add(head,'th',label);
      const body=table.createTBody();
      for(const row of report.entries.filter(r=>scope==='all'||r.id===scope)){
        const result=ConversionCapacity.reminder(report,row,conversion),tr=body.insertRow();
        for(const value of [row.name,row.actual,row.prior,row.prior?((row.actual/row.prior-1)*100).toFixed(1)+'%':'—',fmt(row.points),fmt(row.target),fmt(result.gap),fmt(result.daily),
          result.rate==null?'—':(result.rate*100).toFixed(1)+'%',result.text])add(tr,'td',value);
      }
    }
  }
  function read(file,kind,secret){
    if(!file.size || file.size>40*1024*1024 || !/\.xls[xm]$/i.test(file.name))throw Error(kind+' 請選擇 40 MB 以內的 .xlsx 或 .xlsm。');
    return new Promise((resolve,reject)=>{
      const worker=new Worker('conversion-capacity-worker.js?v=regional-1');workers.set(worker,reject);
      function finish(fn,value){workers.delete(worker);worker.terminate();fn(value);}
      worker.onmessage=({data})=>data.error?finish(reject,Error(kind+'：'+data.error)):finish(resolve,data.report);
      worker.onerror=()=>finish(reject,Error(kind+' 本機讀取失敗。'));
      worker.postMessage({file,kind,password:secret,crossDistrict});
    });
  }
  async function analyze(snapshot){
    if(reports.length && snapshot===undefined){
      const ticket=generation;
      try{const ref=await getConversion();if(ticket===generation){conversion=ref;draw();}}
      catch(error){if(ticket===generation){conversion=null;draw();status.textContent=error.message;}}
      return;
    }
    clearResults();if(!hasFiles())return;
    const ticket=generation,secret=password.value;button.disabled=true;status.textContent='正在本機核對量能報表…';
    try {
      const result=[];
      for(const [kind,box] of Object.entries(inputs))if(box.files[0]){
        result.push(await read(box.files[0],kind,secret));if(ticket!==generation)return;
      }
      const reference=snapshot===undefined?await getConversion():snapshot;
      if(ticket!==generation)return;
      reports=result;conversion=reference;draw();password.value='';
      status.textContent='本機分析完成。日需按截止次日至月底的日曆日平均計算。';
    }catch(error){if(ticket===generation)status.textContent=error.message;}
    finally{if(ticket===generation)button.disabled=false;}
  }
  regionSelect.addEventListener('change',()=>draw());
  exportBtn.addEventListener('click',async()=>{
    if(!briefing.length || exportBtn.disabled)return;
    const ticket=renderVersion;exportBtn.disabled=true;
    try{
      const blob=await capacityBriefingImage(briefing);
      if(ticket!==renderVersion)return;
      const url=URL.createObjectURL(blob),a=el('a');
      const area=crossDistrict?(regionSelect.value==='all'?'各區':regionSelect.value):(reports[0].entries.find(r=>r.id===getScope())?.name||'');
      a.href=url;a.download='AQRT重點_'+area+'_'+reports.map(r=>r.kind+'_'+r.cutoff).join('_')+'.png';
      host.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      status.textContent='已匯出本次分析重點 PNG。';
    }catch(error){if(ticket===renderVersion)status.textContent=error.message;}
    finally{if(ticket===renderVersion)exportBtn.disabled=false;}
  });
  Object.values(inputs).forEach(box=>box.addEventListener('change',clearResults));
  button.addEventListener('click',()=>hasFiles()?analyze():status.textContent='請選擇 AQ 或 RT 量能原檔。');
  return {referenceChanged(){if(!reports.length)clearResults();else {generation++;conversion=null;draw();}},ready:()=>reports.length>0,draw,analyze,reset,clearResults,hasFiles,setConversion(value){conversion=value;draw();}};
};
