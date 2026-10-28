(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./readonly-dashboard-core.js'):root.ReadonlyDashboardCore,node?require('./readonly-store-export-assets.js'):root.ReadonlyStoreExportAssets);
  if(node)module.exports=api;else root.ReadonlyStoreSnapshot=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Core,Assets){
  'use strict';
  const SCHEMA='north12b-store-snapshot/v1';
  // Explicit business-metric allowlist: no personnel, awards or supervisor-only fields.
  const KPI_KEYS=Object.freeze([
    '5G銷售數','HBO Max&Disney+&Prime Video銷售數','Netflix多享組銷售數','TTL AQ上線點數',
    '自退數','解約後NP OUT','AQ V+D 999 (含)以上','AQ V+D 1399 (含)以上','預付卡開卡面額',
    'RT上線點數','特殊維繫用戶續約數','高高特維用戶續約數','RT V+D 999 (含)以上','RT V+D 1399 (含)以上',
    'Device專案銷售數','重點Device銷售量','好速案銷售點數','換約淨新增金額','空機、3C、物聯網及門市購營收',
    '配件及其他營收','包膜與保貼營收','手機保險服務點數','MyVideo&KKBOX','Apple&Google服務及雜誌週刊開通數'
  ]);
  const allowed=new Set(KPI_KEYS),finite=v=>typeof v==='number'&&Number.isFinite(v)?v:null;
  const text=(v,max=180)=>typeof v==='string'?v.slice(0,max):'';
  function iso(v){return typeof v==='string'&&/^20\d\d-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}
  function period(value,cutoff){
    const m=String(value||'').match(/(20\d\d)[/-](\d{1,2})[/-](\d{1,2})\s*[~～–—]\s*(?:(20\d\d)[/-])?(\d{1,2})[/-](\d{1,2})/);
    if(!m)throw Error('KPI來源缺少可核實的統計起訖，未產生快照。');
    const start=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');
    const end=(m[4]||m[1])+'-'+m[5].padStart(2,'0')+'-'+m[6].padStart(2,'0');
    if(!iso(start)||!iso(end)||start>end||end!==cutoff)throw Error('KPI統計期間與截止不一致，未產生快照。');
    return {start,end};
  }
  function unit(row,items){
    if(!row||typeof row!=='object')throw Error('KPI來源不完整，未產生快照。');
    const raw=new Map((row.fullMetrics||[]).map(m=>[m.key,m]));
    return {overall_kpi:finite(row.overall_kpi),company_rank:finite(row.company_rank),fullMetrics:items.map(item=>{
      const m=raw.get(item.key)||{};
      return {key:item.key,label:item.key,actual:finite(m.actual),target:finite(m.target),rate:finite(m.rate)};
    })};
  }
  function fromModel(model,options={}){
    const p=model?.kpi;
    if(!p?.available||!iso(p.cutoff))throw Error('尚未取得已核驗KPI資料，未產生快照。');
    const dates=period(p.period,p.cutoff),items=(p.items||[]).filter(item=>allowed.has(item.key)).map(item=>({key:item.key,label:item.key}));
    if(!items.length||new Set(items.map(item=>item.key)).size!==items.length)throw Error('沒有可分享的KPI項目，未產生快照。');
    const rows=p.stores||[],ids=new Set(rows.map(row=>row.id));
    if(rows.length!==9||ids.size!==9||Core.STORES.some(store=>!ids.has(store.id)))throw Error('九店KPI來源不完整，未產生快照。');
    const stamp=options.generatedAt||new Date().toISOString();
    if(typeof stamp!=='string'||!Number.isFinite(Date.parse(stamp)))throw Error('匯出時間不合法。');
    let conversion=null;
    if(model.conversion)conversion=Core.validateConversion(model.conversion);
    return {schema:SCHEMA,region:'北一二B',generatedAt:new Date(stamp).toISOString(),exampleLabel:text(options.exampleLabel,120),
      kpi:{available:true,cutoff:p.cutoff,period:dates.start+'～'+dates.end,reportDate:iso(p.reportDate)?p.reportDate:null,
        sourceName:text(p.sourceName),version:text(p.version),items,data:{aggregate:unit(p.data?.aggregate,items)},
        stores:Core.STORES.map(store=>({id:store.id,store:store.name,...unit(rows.find(row=>row.id===store.id),items)}))},
      conversion,conversionReason:conversion?'':'尚未取得已核實的締結率／來客來源；本快照未包含此表，缺值不補零。'};
  }
  function validate(snapshot){
    if(snapshot?.schema!==SCHEMA)throw Error('門市快照格式不符。');
    return fromModel(snapshot,{generatedAt:snapshot.generatedAt,exampleLabel:snapshot.exampleLabel});
  }
  // This pure renderer is serialized into the downloaded file. It has no API or storage access.
  function snapshotView(data,C){
    const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const num=v=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('zh-TW',{maximumFractionDigits:2});
    const pct=v=>v==null||!Number.isFinite(v)?'—':(v*100).toFixed(1)+'%';
    const signed=(v,format=num)=>v==null?'—':(v>0?'+':'')+format(v);
    const scope=state=>C.STORES.find(s=>s.id===state.store)?.name||'北一二B · 全區與九店';
    const context=(state,title,start,end)=>'<div class="context"><div><h2>'+esc(scope(state))+' · '+title+'</h2><p>統計 '+esc(start)+' ～ '+esc(end)+'</p></div><span class="cutoff">資料截止 '+esc(end)+'</span></div>';
    const card=(label,value,note,cls='')=>'<article class="metric '+cls+'"><h3>'+esc(label)+'</h3><div class="value">'+esc(value)+'</div><small>'+esc(note)+'</small></article>';
    function bars(rows){
      const values=rows.filter(row=>row.value!=null),max=Math.max(1,...values.map(row=>row.value));
      return '<div class="bar-chart">'+rows.map(row=>'<div class="bar-row"><span>'+esc(row.label)+'</span><div class="bar-track"><i style="width:'+Math.max(0,(row.value??0)/max*100)+'%"></i></div><strong>'+pct(row.value)+'</strong></div>').join('')+'</div>';
    }
    function kpi(state){
      const p=data.kpi,rows=p.stores.filter(r=>state.store==='all'||r.id===state.store),headline=state.store==='all'?p.data.aggregate:rows[0],dates=p.period.split('～');
      const metric=state.kpiMetric||'overall';
      const metricOptions='<option value="overall"'+(metric==='overall'?' selected':'')+'>總進度達成率</option>'+p.items.map(item=>'<option value="'+esc(item.key)+'"'+(metric===item.key?' selected':'')+'>'+esc(item.label)+'</option>').join('');
      const full=headline.fullMetrics;
      return context(state,'KPI',dates[0],dates[1])+'<section class="metrics">'+card('原報總進度達成率',pct(headline.overall_kpi),'採原報口徑，不平均門市分數')+card('公司排名',num(headline.company_rank),'原來源已核實欄位')+'</section>'+
        '<section class="charts"><article class="panel"><h3>重點指標 · 進度達成率</h3>'+bars(full.slice(0,6).map(m=>({label:m.label,value:m.rate})))+'</article><article class="panel"><h3>門市比較</h3><div class="controls"><label>比較指標 <select data-kpi-metric>'+metricOptions+'</select></label></div>'+bars(rows.map(row=>({label:C.STORES.find(s=>s.id===row.id).short,value:metric==='overall'?row.overall_kpi:row.fullMetrics.find(m=>m.key===metric)?.rate??null})).sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity)))+'</article></section>'+
        '<section class="panel distribution table-scroll"><h3>九店與區整體</h3><table class="person-table"><thead><tr><th>門市</th><th>KPI達成率</th><th>公司排名</th></tr></thead><tbody>'+rows.map(row=>'<tr><td>'+esc(C.STORES.find(s=>s.id===row.id).name)+'</td><td data-label="KPI達成率">'+pct(row.overall_kpi)+'</td><td data-label="公司排名">'+num(row.company_rank)+'</td></tr>').join('')+'</tbody></table></section>'+
        '<section class="panel distribution"><h3>KPI明細 · '+full.length+'項</h3><div class="table-scroll"><table class="kpi-table"><thead><tr><th>項目</th><th>實績</th><th>目標</th><th>進度達成率</th></tr></thead><tbody>'+full.map(m=>'<tr><td><strong>'+esc(m.label)+'</strong></td><td data-label="實績">'+num(m.actual)+'</td><td data-label="目標">'+num(m.target)+'</td><td data-label="進度達成率">'+pct(m.rate)+'</td></tr>').join('')+'</tbody></table></div><p class="sub">進度達成率沿用原報；缺少欄位顯示 —，不補零。</p></section>'+source(p);
    }
    function source(p){return '<aside class="notes page-source">資料統計至 '+esc(p.cutoff)+' · 來源 '+esc(p.sourceName||p.source_name||'來源未提供檔名')+(p.reportDate?' · 來源標示戰報日 '+esc(p.reportDate):'')+' · 資料版本 '+esc(p.version||p.sha256?.slice(0,12)||'來源未提供')+'</aside>';}
    function comparison(d,state){
      const current=C.aggregate(d.records.filter(row=>(state.store==='all'||row.store===state.store)&&row.date>=state.start&&row.date<=state.end));
      const available=!!d.prior&&state.start===d.period_start&&state.end===d.cutoff;
      const prior=available?C.aggregate(d.prior.filter(row=>state.store==='all'||row.store===state.store)):null;
      return {current,prior,available};
    }
    function chart(points,{id,label,rate=false,mode='daily',period=false,channel,width=320}){
      const height=260,left=55,right=32,top=30,bottom=56,max=Math.max(rate?.05:1,...points.map(p=>p.value??0));
      const inset=period?28:0,x=i=>left+inset+(points.length===1?(width-left-right-2*inset)/2:i*(width-left-right-2*inset)/(points.length-1));
      const y=v=>top+(height-top-bottom)*(1-v/max),format=rate?pct:num;
      let svg='<svg role="img" aria-label="'+esc(label)+'" viewBox="0 0 '+width+' '+height+'">';
      for(let i=0;i<4;i++){const v=max*i/3;svg+='<line x1="'+left+'" x2="'+(width-right)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="#dce4eb"/><text x="'+(left-8)+'" y="'+(y(v)+4)+'" text-anchor="end" fill="#516475" font-size="12">'+esc(rate?pct(v):num(Math.round(v)))+'</text>';}
      let path='',pen=false;for(let i=0;i<points.length;i++){const v=points[i].value;if(v==null){pen=false;continue;}path+=(pen?' L':' M')+x(i)+' '+y(v);pen=true;}
      if(path)svg+='<path d="'+path+'" fill="none" stroke="'+(channel==='rt'?'#087f83':'#be5814')+'" stroke-width="3"/>';
      const stride=period?1:Math.max(1,Math.ceil(points.length/5));
      points.forEach((point,i)=>{
        if(point.value!=null)svg+='<circle tabindex="0" role="button" aria-label="'+esc(point.label+' '+format(point.value))+'" data-readout="'+esc((period?'':mode==='cumulative'?'自起日累計 ':'當日 ')+point.label+'｜'+format(point.value))+'" cx="'+x(i)+'" cy="'+y(point.value)+'" r="5" fill="'+(channel==='rt'?'#087f83':'#be5814')+'"><title>'+esc(point.label+' '+format(point.value))+'</title></circle>';
        if(period&&point.value!=null)svg+='<text class="period-value" x="'+x(i)+'" y="'+(y(point.value)-14)+'" text-anchor="middle" font-size="14">'+esc(format(point.value))+'</text>';
        if(i%stride===0||i===points.length-1)svg+='<text x="'+x(i)+'" y="'+(height-27)+'" text-anchor="middle" fill="#516475" font-size="12">'+esc(point.label)+'</text>';
      });
      return '<div id="'+id+'" class="chart '+(period?'period-chart':'')+'">'+svg+'</svg></div><div class="day-readout" data-chart-readout>選取資料點查看'+(period?'同期區間':'日期與數值')+'</div>';
    }
    function weeklyVisitors(rows,c){
    return '<section class="weekly-visitors" aria-label="'+c.toUpperCase()+' 每週來客數"><h4>每週來客數</h4><p class="sub">週一至週日 · 所選區間實際人次</p><dl>'+C.weeklySeries(rows).map(w=>'<div><dt>'+w.start.slice(5).replace('-','/')+'–'+w.end.slice(5).replace('-','/')+(w.partial?'<small>部分週 · 累計至 '+w.end.slice(5).replace('-','/')+'</small>':'')+'</dt><dd>'+num(w[c+'_d'])+'<small>人次</small></dd></div>').join('')+'</dl></section>';
  }
    function trends(state,rate){
      const d=data.conversion,title=rate?'締結率':'來客數';
      if(!d)return '<div class="empty"><h2>'+esc(data.conversionReason)+'</h2><p>缺資料不補零。</p></div>';
      const rows=d.records.filter(row=>(state.store==='all'||row.store===state.store)&&row.date>=state.start&&row.date<=state.end);
      if(!rows.length)return '<div class="empty"><h2>所選區間沒有已核實資料</h2><p>缺資料不補零。</p></div>';
      const comp=comparison(d,state),series=C.dailySeries(rows,state.mode);
      const controls='<div class="controls"><div class="field datebox"><label>起日<input data-start type="date" min="'+d.period_start+'" max="'+d.cutoff+'" value="'+state.start+'"></label></div><div class="field datebox"><label>迄日<input data-end type="date" min="'+d.period_start+'" max="'+d.cutoff+'" value="'+state.end+'"></label></div><div class="seg"><button data-mode="daily" aria-pressed="'+(state.mode==='daily')+'">每日</button><button data-mode="cumulative" aria-pressed="'+(state.mode==='cumulative')+'">累計</button></div></div>';
      let html=context(state,title,d.period_start,d.cutoff)+controls+'<p class="comparison-status">目前選取 '+state.start+' ～ '+state.end+'。'+(comp.available?'上月同期 '+d.prior_period.start+' ～ '+d.prior_period.end+'。':'來源'+(d.prior?'只有整段同期總量；此日期範圍無法計算MoM。':'未提供上月同期資料。')+' <button data-restore type="button" class="quiet">恢復來源完整期間</button>')+'</p><section class="metrics">';
      for(const c of ['aq','rt']){
        const key=c+(rate?'_rate':'_d'),now=comp.current[key],before=comp.prior?.[key]??null,delta=now==null||before==null?null:now-before,growth=now==null||before==null||before===0?null:(now-before)/before;
        html+=card(c.toUpperCase()+' '+title,rate?pct(now):num(now),rate?'由所選分子／分母合計重算':'所選期間來客合計',c==='rt'?'rt':'');
        if(comp.available)html+='<article class="metric '+(c==='rt'?'rt':'')+'"><h3>'+c.toUpperCase()+' 上月同期／MoM</h3><div class="period-comparison"><div><span>上月同期</span><strong>'+esc(rate?pct(before):num(before))+'</strong></div><div><span>同期差異</span><strong>'+esc(rate?signed(delta==null?null:delta*100)+' 個百分點':signed(delta))+'</strong></div><p>MoM '+esc(growth==null?'—（上月為零或無有效分母）':signed(growth,v=>(v*100).toFixed(2)+'%'))+'</p></div></article>';
      }
      html+='</section><section class="charts">';
      for(const c of ['aq','rt']){
        const key=c+(rate?'_rate':'_d');html+='<article class="panel"><h3>'+c.toUpperCase()+' '+title+'</h3>';
        if(comp.available)html+='<p class="sub">同期MoM：兩個已觀測區間總量</p>'+chart([{label:'上月同期',value:comp.prior[key]},{label:'本月同期',value:comp.current[key]}],{id:(state.chartPrefix||'')+c+'-mom-chart',label:c.toUpperCase()+' 同期MoM比較',rate,period:true,channel:c,width:state.chartWidth});
        html+='<p class="sub">本月'+(state.mode==='cumulative'?'累計':'逐日')+'趨勢；未繪製上月逐日趨勢。</p>'+chart(series.map(row=>({label:row.date.slice(5).replace('-','/'),value:row[key]})),{id:(state.chartPrefix||'')+c+'-chart',label:c.toUpperCase()+' '+title+'本月趨勢',rate,mode:state.mode,channel:c,width:state.chartWidth})+weeklyVisitors(rows,c)+'</article>';
      }
      return html+'</section><p class="comparison-note">零分母或缺少可比資料顯示 —；上月只有期間總量，不編造逐日數據。</p>'+source(d);
    }
    function render(state){return state.tab==='kpi'?kpi(state):trends(state,state.tab==='conversion');}
    return {render,scope,esc};
  }
  function mount(data,viewFactory){
    const view=viewFactory(data,window.ReadonlyDashboardCore),d=data.conversion;
    const state={tab:'kpi',store:'all',kpiMetric:'overall',mode:'daily',start:d?.period_start||'',end:d?.cutoff||''};
    const content=document.getElementById('snapshot-content');
    function paint(){const columns=window.matchMedia('(max-width:700px)').matches?1:2;state.chartWidth=Math.max(240,Math.min(700,(content.clientWidth-(columns-1)*18)/columns-40));content.innerHTML=view.render(state);document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===state.tab)));}
    document.documentElement.classList.add('interactive');
    document.querySelectorAll('[data-tab]').forEach(b=>{b.disabled=false;b.addEventListener('click',()=>{state.tab=b.dataset.tab;paint();});});
    const store=document.getElementById('store');store.disabled=false;store.addEventListener('change',()=>{state.store=store.value;paint();});
    content.addEventListener('change',event=>{
      const e=event.target;if(e.matches('[data-kpi-metric]'))state.kpiMetric=e.value;
      else if(e.matches('[data-start],[data-end]')){
        if(!e.value){state.start=d.period_start;state.end=d.cutoff;}
        else{state[e.hasAttribute('data-start')?'start':'end']=e.value;if(state.start<d.period_start||state.end>d.cutoff||state.start>state.end){state.start=d.period_start;state.end=d.cutoff;}}
      }else return;paint();
    });
    function inspect(target){const p=target.closest('[data-readout]');if(p){const readout=p.closest('.chart')?.nextElementSibling;if(readout)readout.textContent=p.dataset.readout;return true;}return false;}
    content.addEventListener('click',event=>{if(inspect(event.target))return;const b=event.target.closest('button');if(!b)return;if(b.hasAttribute('data-mode'))state.mode=b.dataset.mode;else if(b.hasAttribute('data-restore')){state.start=d.period_start;state.end=d.cutoff;}else return;paint();});
    content.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)&&inspect(event.target))event.preventDefault();});
    window.addEventListener('resize',paint);
    paint();
  }
  function buildHtml(input){
    const data=validate(input),view=snapshotView(data,Core),d=data.conversion,state={store:'all',kpiMetric:'overall',mode:'daily',start:d?.period_start||'',end:d?.cutoff||''};
    const esc=view.esc,stamp=new Date(data.generatedAt).toLocaleString('zh-TW',{timeZone:'Asia/Taipei',hour12:false});
    const json=JSON.stringify(data).replace(/[<>&\u2028\u2029]/g,c=>'\\u'+c.charCodeAt(0).toString(16).padStart(4,'0'));
    const scripts=[Assets.core,'('+mount.toString()+')(JSON.parse(document.getElementById("snapshot-data").textContent),'+snapshotView.toString()+');'].map(s=>s.replace(/<\/script/gi,'<\\/script'));
    const extra='.tabs{grid-template-columns:repeat(3,minmax(0,1fr));margin-top:20px}.snapshot-range{margin:20px 0}.snapshot-range td:first-child{font-weight:800}.snapshot-fallback{margin-top:26px}.interactive .snapshot-fallback{display:none}button:disabled,select:disabled{cursor:default}.bar-row{display:grid;grid-template-columns:minmax(90px,1fr) minmax(45px,1fr) 68px;gap:10px;align-items:center;margin:12px 0;font-size:14px}.bar-row>span{overflow-wrap:anywhere}.bar-track{height:9px;background:#e3eaf0;border-radius:6px;overflow:hidden}.bar-track i{display:block;height:100%;background:var(--nav);border-radius:6px}.chart{overflow:hidden}.chart svg{width:100%;height:auto}.person-table{min-width:0;width:100%}.person-table td{overflow-wrap:anywhere}.snapshot-fallback .controls{display:none}@media(max-width:700px){.person-table td[data-label]::before{content:attr(data-label);display:block;font-size:12px;color:var(--muted);margin-bottom:4px}}@media(max-width:500px){.shell{padding:18px 14px 30px}.tabs .tab{font-size:16px}.snapshot-range th,.snapshot-range td{font-size:13px;padding:9px}.context{flex-wrap:wrap}.bar-row{grid-template-columns:minmax(80px,1fr) minmax(35px,.7fr) 62px}.metric .value{font-size:34px}}@media print{.tabs,.controls,.quiet{display:none}.snapshot-fallback{display:block!important}.snapshot-note{break-inside:avoid}.panel,.metric{break-inside:avoid}}';
    const ranges='<section class="panel snapshot-range table-scroll"><h2>各表統計期間</h2><table class="person-table"><thead><tr><th>資料表</th><th>統計起訖</th><th>資料截止</th></tr></thead><tbody><tr><td>KPI</td><td data-label="統計起訖">'+esc(data.kpi.period)+'</td><td data-label="資料截止">'+esc(data.kpi.cutoff)+'</td></tr><tr><td>締結率／來客數</td><td data-label="統計起訖">'+(d?esc(d.period_start+'～'+d.cutoff):'未取得已核實來源')+'</td><td data-label="資料截止">'+(d?esc(d.cutoff):'—')+'</td></tr></tbody></table></section>';
    return '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; object-src \'none\'; base-uri \'none\'; form-action \'none\'"><title>北一二B｜門市唯讀快照</title><style>'+Assets.css+extra+'</style></head><body><main class="shell"><header class="header"><div><div class="eyebrow">北一二B · 全區與九店</div><h1>門市唯讀快照</h1><p class="header-note">KPI、締結率與來客數比較</p></div><span class="pill">離線HTML</span></header><aside class="demo snapshot-note"><div><strong>匯出時間 '+esc(stamp)+'（台灣時間）</strong><p>這是下載當下的資料快照，不會自動更新；不含個人資料或獎金。</p><p>郵件預覽若無法篩選，請下載後用瀏覽器開啟。</p>'+(data.exampleLabel?'<p>'+esc(data.exampleLabel)+'</p>':'')+'</div></aside>'+ranges+
      '<nav class="tabs" role="tablist" aria-label="門市快照內容"><button class="tab" data-tab="kpi" role="tab" aria-selected="true" disabled>KPI</button><button class="tab" data-tab="conversion" role="tab" aria-selected="false" disabled>締結率</button><button class="tab" data-tab="traffic" role="tab" aria-selected="false" disabled>來客數</button></nav><div class="controls"><div class="field"><label for="region">區域</label><select id="region" disabled><option>北一二B</option></select></div><div class="field scope"><label for="store">門市</label><select id="store" disabled><option value="all">全區與九店比較</option>'+Core.STORES.map(s=>'<option value="'+s.id+'">'+esc(s.name)+'</option>').join('')+'</select></div></div>'+
      '<noscript><p class="demo">目前為靜態預覽，下面列出完整期間的全區資料；互動篩選請用允許JavaScript的瀏覽器開啟。</p></noscript><section id="snapshot-content" aria-live="polite">'+view.render({...state,tab:'kpi'})+'</section><section class="snapshot-fallback">'+view.render({...state,tab:'conversion',chartPrefix:'static-conversion-'})+view.render({...state,tab:'traffic',chartPrefix:'static-traffic-'})+'</section><footer class="footer">門市唯讀快照 · 已分享的區店指標 · 無編輯或回寫功能</footer></main>'+
      '<script id="snapshot-data" type="application/json">'+json+'</script>'+scripts.map(s=>'<script>'+s+'</script>').join('')+'</body></html>';
  }
  function filename(snapshot){return '北一二B_門市唯讀快照_'+snapshot.kpi.cutoff.replaceAll('-','')+'_'+snapshot.generatedAt.replace(/[-:.TZ]/g,'').slice(0,14)+'.html';}
  return Object.freeze({SCHEMA,KPI_KEYS,fromModel,validate,buildHtml,filename});
});

