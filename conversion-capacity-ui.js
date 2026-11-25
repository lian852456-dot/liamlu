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
  const status=add(host,'p','');status.setAttribute('role','status');
  const output=el('div');host.append(output);
  let generation=0, reports=[], conversion=null;
  const workers=new Map();
  let briefing=[],renderVersion=0;
  const fmt=n=>n==null?'—':n.toLocaleString('zh-TW',{maximumFractionDigits:2});
  function clearResults(){
    generation++;for(const [worker,cancel] of workers){worker.terminate();cancel(Error('已取消'));}workers.clear();
    reports=[];conversion=null;briefing=[];renderVersion++;exportBtn.disabled=true;output.replaceChildren();status.textContent='';button.disabled=false;
  }
  function reset(){clearResults();for(const box of Object.values(inputs))box.value='';password.value='';}
  function hasFiles(){return Object.values(inputs).some(box=>box.files.length);}
  function draw(scope=getScope()){
    output.replaceChildren();
    renderVersion++;briefing=[];exportBtn.disabled=!reports.length;
    for(const report of reports){
      const title=(report.kind==='AQ'?'AQ 新辦／攜碼':'RT 續約')+' · 截至 '+report.cutoff;
      add(output,'h3',title);
      const mix=report.mix;
      const unit=scope==='all'?mix?.overall:mix?.stores?.[scope];
      const groups=CapacityMix.groups(unit||{issue:mix?.issue||'缺少可核對的上線明細。'},report.kind);
      briefing.push({title,groups});
      const cards=add(output,'div','');cards.className='capacity-highlights';
      for(const g of groups){
        const card=add(cards,'section','');add(card,'h4',g.title);
        const list=add(card,'dl','');
        for(const [label,value] of g.lines){add(list,'dt',label);add(list,'dd',value);}
      }
      const details=add(output,'details','');add(details,'summary','查看量能與締結率明細');
      const wrap=el('div');wrap.className='capacity-table';details.append(wrap);
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
      const worker=new Worker('conversion-capacity-worker.js?v=store-products-2');workers.set(worker,reject);
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
      status.textContent='本機分析完成。商品依同一筆上線資費計件，同款可辨識的容量與顏色合計。';
    }catch(error){if(ticket===generation)status.textContent=error.message;}
    finally{if(ticket===generation)button.disabled=false;}
  }
  exportBtn.addEventListener('click',async()=>{
    if(!briefing.length || exportBtn.disabled)return;
    const ticket=renderVersion;exportBtn.disabled=true;
    try{
      const blob=await capacityBriefingImage(briefing);
      if(ticket!==renderVersion)return;
      const url=URL.createObjectURL(blob),a=el('a');
      a.href=url;a.download='門市資費商品提醒_'+ reports.map(r=>r.kind+'_'+r.cutoff).join('_')+'.png';
      host.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
      status.textContent='已匯出本次分析重點 PNG。';
    }catch(error){if(ticket===renderVersion)status.textContent=error.message;}
    finally{if(ticket===renderVersion)exportBtn.disabled=false;}
  });
  Object.values(inputs).forEach(box=>box.addEventListener('change',clearResults));
  button.addEventListener('click',()=>hasFiles()?analyze():status.textContent='請選擇 AQ 或 RT 量能原檔。');
  return {referenceChanged(){if(!reports.length)clearResults();else {generation++;conversion=null;draw();}},ready:()=>reports.length>0,draw,analyze,reset,clearResults,hasFiles,setConversion(value){conversion=value;draw();}};
};
