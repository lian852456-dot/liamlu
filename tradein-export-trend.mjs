const STYLES = [
  ['#1465b5','none'], ['#bd4c08','none'], ['#087d67','none'],
  ['#9b3786','none'], ['#6852b3','8 4'], ['#a52f3c','8 4'],
  ['#6c6100','3 3'], ['#276a87','3 3'], ['#394354','11 4 3 4']
];
const dateLabel = date => date.slice(5).replace('-', '/');

function renderPlot(dates, series, label, escape,compact=false){
  const width=compact?460:960,height=compact?256:292,left=compact?48:62,right=24,top=20,bottom=40;
  const plotWidth=width-left-right,plotHeight=height-top-bottom;
  const maximum=Math.max(1,...series.flatMap(item=>item.values||[]));
  const step=Math.max(1,Math.ceil(maximum/5));
  const axisMax=Math.ceil(maximum/step)*step;
  const x=index=>dates.length===1?left+plotWidth/2:left+index*plotWidth/(dates.length-1);
  const y=value=>top+(1-value/axisMax)*plotHeight;
  const grid=[];
  for(let value=0;value<=axisMax;value+=step){
    grid.push(`<line x1="${left}" y1="${y(value)}" x2="${width-right}" y2="${y(value)}"></line>
      <text x="${left-9}" y="${y(value)+4}" text-anchor="end">${value}</text>`);
  }
  // Keep the axis legible across months, including the first and last source dates.
  const stride=Math.ceil(dates.length/(compact?6:10));
  const labels=dates.map((date,index)=>{
    const last=dates.length-1;
    if(index!==0&&index!==last&&(index%stride!==0||last-index<stride))return '';
    return `<text x="${x(index)}" y="${height-14}" text-anchor="middle">${dateLabel(date)}</text>`;
  }).join('');
  const lines=series.map(({store,values,color,dash,index})=>{
    if(!values)return '';
    const points=values.map((value,i)=>[x(i).toFixed(2),y(value).toFixed(2)]);
    return `<g data-trend-series="${index}" stroke="${color}">
      <polyline points="${points.join(' ')}" stroke-dasharray="${dash}"></polyline>
      ${points.map(([cx,cy],i)=>`<circle cx="${cx}" cy="${cy}" r="3"><title>${escape(store)}｜${dateLabel(dates[i])}｜${values[i]} 台</title></circle>`).join('')}
    </g>`;
  }).join('');
  return `<svg class="trend-${compact?'compact':'wide'}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${label}折線圖，單位為台">
    <g class="trend-grid">${grid.join('')}${labels}<text x="20" y="13">台</text></g>${lines}
  </svg>`;
}

function renderDailyTable(dates,series,label,escape){
  const columns=series.map(({store,index})=>`<th scope="col" data-trend-series="${index}">${escape(store)}</th>`).join('');
  const rows=dates.map((date,day)=>`<tr><th scope="row">${dateLabel(date)}</th>${series.map(({values,index})=>
    `<td data-trend-series="${index}">${values?.[day]??'待核'}</td>`).join('')}</tr>`).join('');
  return `<details class="trend-data"><summary>查看${label}明細</summary><div class="scroll" tabindex="0" aria-label="${label}明細，可橫向捲動">
    <table><caption class="sr-only">${label}（台）</caption><thead><tr><th scope="col">日期</th>${columns}</tr></thead>
    <tbody>${rows}</tbody></table></div></details>`;
}

export function renderStoreTrend(trend,escape){
  if(!trend)return '';
  const {dates}=trend;
  const series=trend.series.map((item,index)=>({...item,index,color:STYLES[index][0],dash:STYLES[index][1]}));
  const known=series.filter(item=>item.daily);
  const missing=series.filter(item=>!item.daily);
  if(!known.length)return '<section><h2>各店日動能</h2><p>來源未提供可核對的逐日回收資料。</p></section>';
  const range=`${dateLabel(dates[0])}–${dateLabel(dates.at(-1))}`;
  const legend=known.map(({store,index,color,dash})=>`<label class="trend-store">
    <input type="checkbox" data-trend-toggle="${index}" checked>
    <svg width="24" height="10" viewBox="0 0 24 10" aria-hidden="true"><line x1="1" y1="5" x2="23" y2="5" stroke="${color}" stroke-width="3" stroke-dasharray="${dash}"/></svg>
    ${escape(store)}</label>`).join('');
  const panes=[['daily','每日回收'],['cumulative','期間累計']].map(([mode,label])=>{
    const values=series.map(item=>{
      let total=0;
      return {...item,values:mode==='daily'?item.daily:item.daily?.map(units=>total+=units)};
    });
    return `<div data-trend-pane="${mode}"${mode==='daily'?'':' hidden'}>
      <div class="trend-plot">${renderPlot(dates,values,label,escape)}${renderPlot(dates,values,label,escape,true)}</div>
      ${renderDailyTable(dates,values,label,escape)}</div>`;
  }).join('');
  return `<section id="trend"><div class="trend-heading"><div><h2>各店日動能</h2><p>${range} · 已核對來源期間</p></div>
    <div class="trend-modes" role="group" aria-label="趨勢圖統計方式">
    <button type="button" data-trend-mode="daily" aria-pressed="true">每日回收</button>
    <button type="button" data-trend-mode="cumulative" aria-pressed="false">期間累計</button></div></div>
    <div class="trend-filters"><div class="trend-legend" role="group" aria-label="選擇要比較的店點">${legend}</div>
    <div class="trend-quick"><button type="button" data-trend-all="true">全選</button><button type="button" data-trend-all="false">清除</button></div></div>
    ${missing.length?`<p class="trend-note">逐日待核 · ${missing.map(item=>escape(item.store)).join('、')}</p>`:''}
    <p id="trend-empty" class="trend-note" role="status" hidden>請勾選要比較的店點。</p>${panes}</section>`;
}

export const trendScript = `
const trend=document.getElementById('trend');
if(trend){
  const toggles=[...trend.querySelectorAll('[data-trend-toggle]')];
  function updateSeries(){
    for(const toggle of toggles){
      for(const item of trend.querySelectorAll('[data-trend-series="'+toggle.dataset.trendToggle+'"]')){
        item.toggleAttribute('hidden',!toggle.checked);
      }
    }
    document.getElementById('trend-empty').hidden=toggles.some(toggle=>toggle.checked);
  }
  for(const toggle of toggles)toggle.addEventListener('change',updateSeries);
  for(const button of trend.querySelectorAll('[data-trend-all]'))button.addEventListener('click',()=>{
    for(const toggle of toggles)toggle.checked=button.dataset.trendAll==='true';
    updateSeries();
  });
  for(const button of trend.querySelectorAll('[data-trend-mode]'))button.addEventListener('click',()=>{
    const mode=button.dataset.trendMode;
    for(const option of trend.querySelectorAll('[data-trend-mode]'))option.setAttribute('aria-pressed',String(option===button));
    for(const pane of trend.querySelectorAll('[data-trend-pane]'))pane.hidden=pane.dataset.trendPane!==mode;
  });
  updateSeries();
}`;

export const trendCss = `
.trend-heading,.trend-filters{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
.trend-heading p{margin:2px 0;color:#475569;font-size:.9rem}
.trend-modes,.trend-quick,.trend-legend{display:flex;gap:6px;flex-wrap:wrap}
.trend-filters{margin:14px 0 8px;gap:8px}
.trend-modes button,.trend-quick button,.trend-store{border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#25364a;padding:5px 9px;font:inherit;font-weight:700}
.trend-modes button,.trend-quick button,.trend-store{cursor:pointer}
.trend-modes button[aria-pressed=true]{background:#152a43;border-color:#152a43;color:#fff}
.trend-quick button{font-size:.85rem}
.trend-store{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;font-size:.9rem}
.trend-store:has(input:not(:checked)){background:#f1f5f9;font-weight:400}
.trend-store input{margin:0;accent-color:#1d4f7b}
.trend-plot svg{display:block;width:100%}
.trend-plot .trend-compact{display:none}
@media(max-width:640px){.trend-plot .trend-wide{display:none}.trend-plot .trend-compact{display:block}}
.trend-grid line{stroke:#dde6ef}
.trend-grid text{fill:#475569;font-size:15px}
.trend-plot polyline{fill:none;stroke-width:2.6;stroke-linejoin:round;stroke-linecap:round}
.trend-plot circle{fill:#fff;stroke-width:1.5}
.trend-plot circle:hover{r:6}
.trend-data{margin:4px 0 0;padding:9px 12px}
.trend-data table{font-variant-numeric:tabular-nums}
.trend-data th,.trend-data td{text-align:center;white-space:nowrap}
.trend-note{color:#775218;margin:8px 0}
@media print{.trend-plot .trend-wide{display:block}.trend-plot .trend-compact,.trend-modes,.trend-quick{display:none}}
`;
