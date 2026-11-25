(function(root){
  'use strict';
  const T=root.North12Trends,C=root.North12OfficerCore,esc=C.safe;
  const fmt=v=>v==null?'—':v.toLocaleString('zh-TW',{maximumFractionDigits:2});
  const pct=v=>v==null?'—':(100*v).toFixed(2)+'%';
  const signed=(v,unit='')=>v==null?'—':(v>0?'+':'')+v.toFixed(2)+unit;
  const dates=p=>p.start+' ～ '+p.end;
  const rate=(v,ch)=>!v?'缺資料':!v[ch+'_d']?'無有效基數':pct(v[ch+'_rate']);
  const table=(headers,rows)=>'<div class="scroll"><table><thead><tr>'+headers.map(h=>'<th>'+esc(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(c=>'<td>'+esc(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  const fold=(label,body)=>'<details><summary>'+esc(label)+'</summary>'+body+'</details>';
  const p=text=>'<p class="notes">'+esc(text)+'</p>';
  const colors=['#b45108','#166c9c','#6744a4','#00775c'];
  const seriesColor=(id,m)=>colors[Math.max(0,C.REGIONS.indexOf(id.length===4?id:m.comparisons.find(r=>r.id===id)?.region))];
  function summary(m,ch){
    const selected=m.comparisons[0],t=selected.summary.total;
    const tiles=[['AQ 來客',fmt(t?.aq_d)],['AQ 締結率',rate(t,'aq')],['RT 合格來客',fmt(t?.rt_d)],['RT 締結率',rate(t,'rt')]];
    const overview='<div class="kpis">'+tiles.map(([k,v])=>'<article>'+esc(k)+'<b>'+esc(v)+'</b></article>').join('')+'</div>';
    const rows=m.comparisons.filter(r=>!r.region||r.id===m.scope).map(r=>[r.label,fmt(r.summary.stores),fmt(r.summary.total?.aq_d),rate(r.summary.total,'aq'),fmt(r.summary.total?.rt_d),rate(r.summary.total,'rt'),r.summary.complete?'涵蓋店日齊備':r.summary.gaps.join('、')||'缺資料']);
    const compare=[['每週 WoW',selected.wow],[m.whole?'整月 MoM':'MoM 同期',selected.mom]].map(([n,v])=>{
      const d=T.changes(v.a,v.b,ch);
      return [n,dates(v.now),dates(v.before),fmt(d.delta),pct(d.growth),signed(d.points,' 個百分點'),v.complete?'共同 '+v.count+' 店':'可比資料不足'];
    });
    return [overview+p(m.label+' ｜ '+m.month+' ～ '+m.end+' ｜ 來源列報實際總量')+table(['範圍','店數','AQ 來客','AQ 締結率','RT 合格來客','RT 締結率','涵蓋'],rows),
      table(['比較','本期','前期',ch.toUpperCase()+' 來客增減','成長率','締結率差','狀態'],compare)];
  }
  function comparison(m,opt){
    const {ch,period}=opt;
    const data=m.comparisons.map(r=>{
      const v=r[period],d=T.changes(v.a,v.b,ch),den=ch+'_d';
      return [r.label,dates(v.now),dates(v.before),fmt(v.actual?.[den]),fmt(v.previousActual?.[den]),fmt(v.a?.[den]),fmt(v.b?.[den]),
        fmt(d.delta),v.b?.[den]===0?'成長率不適用':pct(d.growth),rate(v.a,ch),rate(v.b,ch),signed(d.points),
        v.complete?v.count+' 共同店':v.gaps.join('、')||'沒有可比店日'];
    });
    const exceptions=m.comparisons.flatMap(r=>r[period].exclusions.map(reason=>[r.label,reason]));
    const v=m.comparisons[0][period];
    return p('本期 '+dates(v.now)+'（'+v.now.days+' 天） ／ 前期 '+dates(v.before)+'（'+v.before.days+' 天）。僅本期／前期列報可能涉及開撤店，營業狀態以名冊確認。')+
      table(['區／店','本期','前期','本期實際來客','前期實際來客','本期共同店來客','前期共同店來客','增減人次','成長率','本期共同店率','前期共同店率','差距（百分點）','資料完整性'],data)+
      fold('店碼異動與排除（'+exceptions.length+'）',exceptions.length?table(['範圍','店碼／原因'],exceptions):p('目前無可辨識的異動。樞紐同期只涵蓋本期列報店碼，先前已撤店須以上月原報核對。'))+
      fold('逐日分子與分母',table(['日期','AQ 上線','AQ 來客','RT 續約','RT 合格來客','完整性'],m.daily.map(r=>[r.date,fmt(r.total?.aq_n),fmt(r.total?.aq_d),fmt(r.total?.rt_n),fmt(r.total?.rt_d),r.complete?'齊備':r.gaps.join('、')])));
  }
  function trend(m,opt){
    const {base,ch,kind}=opt,baseName=base==='office'?m.office?.name||'處級基準未提供':T.ALL;
    const unit=kind==='level'?'%':' 個百分點',value=v=>kind==='level'?fmt(v):pct(v),rows=[],lines={};
    const label=id=>m.comparisons.find(r=>r.id===id)?.label||id;
    for(const id of m.children)lines[id]=[];
    for(const w of m.series){
      const b=w[base]?.[ch];
      for(const id of m.children){
        const a=w.values[id][ch],diff=T.gap(a[kind],b?.[kind],kind);
        const text=dates(w.period)+(w.partial?'（本週截至 '+w.period.end+'）':'')+' '+label(id)+' '+value(a[kind])+' ／ '+baseName+' '+value(b?.[kind])+' ／ 差距 '+signed(diff,unit)+' ／ '+a.days+' 店日；基準 '+fmt(b?.days)+' 店日';
        lines[id].push({diff,text});
        const reading=kind==='growth'&&a.growth<0&&b?.growth<0&&diff>0?'衰退幅度較小':'';
        rows.push([dates(w.period)+(w.partial?'（部分週）':w.incomplete?'（缺店日）':''),label(id),value(a[kind]),baseName,value(b?.[kind]),signed(diff,unit),a.days+' ／ '+fmt(b?.days),reading||(diff==null?'缺可比資料或有效基數':'可核對')]);
      }
    }
    const max=Math.max(1,...Object.values(lines).flatMap(l=>l.map(v=>Math.abs(v.diff||0))));
    const left=70,right=830,mid=104,high=77;
    const x=i=>m.series.length===1?(left+right)/2:left+i*(right-left)/Math.max(1,m.series.length-1);
    const y=v=>mid-high*v/max;
    let svg='<svg class="plot" viewBox="0 0 900 242" role="img" aria-label="每週與'+esc(baseName)+'差距，中央零線為基準">';
    for(const v of [max,max/2,0,-max/2,-max]){
      svg+='<line x1="'+left+'" x2="'+right+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="'+(v?'#dfe4e6':'#5b6872')+'"/><text x="60" y="'+(y(v)+4)+'" text-anchor="end">'+signed(v)+'</text>';
    }
    for(const [id,line] of Object.entries(lines)){
      let previous=null;
      line.forEach((v,i)=>{
        if(v.diff==null){previous=null;return;}
        const color=seriesColor(id,m);
        if(previous!==null&&T.shift(m.series[i-1].period.start,7)===m.series[i].period.start)svg+='<line x1="'+x(i-1)+'" y1="'+y(previous)+'" x2="'+x(i)+'" y2="'+y(v.diff)+'" stroke="'+color+'" stroke-width="2.5"/>';
        svg+='<circle tabindex="0" cx="'+x(i)+'" cy="'+y(v.diff)+'" r="4" fill="'+color+'"><title>'+esc(v.text)+'</title></circle>';
        previous=v.diff;
      });
    }
    m.series.forEach((w,i)=>{svg+='<text x="'+x(i)+'" y="207" text-anchor="middle">'+w.period.start.slice(5)+'～'+w.period.end.slice(5)+'</text>'+((w.partial||w.incomplete)?'<text x="'+x(i)+'" y="225" text-anchor="middle">'+(w.partial?'截至當日':'缺店日')+'</text>':'');});
    svg+='</svg>';
    const legend=m.children.map(id=>'<span class="swatch"><svg width="13" height="12"><circle cx="6" cy="6" r="4" fill="'+seriesColor(id,m)+'"/></svg>'+esc(label(id))+'</span>').join('');
    const note=kind==='level'?'每店日均＝來客合計 ÷ 完整店日；差異＝（實際 ÷ 基準 − 1）× 100%。':kind==='growth'?'成長差＝共同門市來客成長率減基準成長率，單位為百分點。':'締結率差＝區／店加權締結率減基準加權締結率，單位為百分點。';
    const hasPoints=Object.values(lines).some(l=>l.some(v=>v.diff!=null));
    return [legend,p(baseName+' ｜ '+note)+(base==='office'&&!m.office?p('處級基準未提供，可在上方比較基準選取北一二部。'):'')+
      (hasPoints?'<div class="chart-scroll">'+svg+'</div>':p('此指標沒有通過核對的比較點。'))+fold('圖表對照表（'+rows.length+' 筆）',table(['週期間','區／店','實際值','基準','基準值','差距','實際／基準店日','判讀'],rows))];
  }
  function tier(m,opt){
    const {base,threshold,heatMetric,tierSource}=opt,store=tierSource==='store',groups=store?m.heat:m.originHeat[tierSource],rows=[];
    const letters=store?'ABCDEF':'ABCDE';
    const mark=t=>t.visitors==null?'缺來源':t.visitors<threshold?'樣本偏少':t.unrenewed<0||t.visitOnly<0?'行為數待核':'達觀察門檻';
    let matrix='<div class="scroll"><table><thead><tr>'+['區／店',...letters].map(v=>'<th>'+v+'</th>').join('')+'</tr></thead><tbody>';
    for(const g of groups){
      matrix+='<tr><th>'+esc(g.label)+'</th>';
      for(const letter of letters){
        const t=g.rows?.find(v=>v.tier===letter),gap=T.gap(t?.rate,t?.[base],'rate');
        const val=!t?null:heatMetric==='gap'?gap:t[heatMetric];
        const shown=val==null?'缺值':heatMetric==='rate'?pct(val):heatMetric==='gap'?signed(val):fmt(val);
        matrix+='<td class="'+(val==null?'na':gap!=null&&t.visitors>=threshold?(gap<0?'neg':gap>0?'pos':''):'')+'">'+shown+(t&&t.visitors!=null&&t.visitors<threshold?' ¹':'')+'</td>';
        if(t)rows.push([g.label,letter,fmt(t.visitors),fmt(t.renewals),pct(t.rate),pct(t.share),fmt(t.unrenewed),pct(t[base]),signed(gap),pct(t.previous?.rate),pct(t.previous?.share),mark(t)]);
      }
      matrix+='</tr>';
    }
    const structure=[];
    for(const g of groups.filter(v=>v.id===m.scope||m.children.includes(v.id))){
      if(!g.rows?.every(t=>[t.rate,t.share,t.previous?.rate,t.previous?.share].every(Number.isFinite)))continue;
      const mix=g.rows.reduce((sum,t)=>sum+(t.share-t.previous.share)*t.previous.rate,0)*100;
      const conversion=g.rows.reduce((sum,t)=>sum+t.share*(t.rate-t.previous.rate),0)*100;
      structure.push([g.label,signed(mix+conversion),signed(mix),signed(conversion)]);
    }
    const basis=base==='office'?m.office?.name||'處級基準未提供':T.ALL;
    return p((store?'RT用戶進店行為_店・Tier A～F':'Tier觀察・原 '+tierSource+' 區級 A～E')+' ｜ '+m.month+' ～ '+m.end+' ｜ 同 Tier 基準 '+basis+'。¹ 低於自訂觀察門檻，自訂門檻供查核排序，非公司標準或統計顯著門檻。')+
      matrix+'</tbody></table></div>'+p(rows.length?'綠／橘表示同 Tier 基準以上／以下，斜紋為缺值。月累計只在來源起訖完全相符時顯示。':'選取範圍或期間缺對應的 Tier 分子分母。區級來源僅供整區比較。')+
      fold('來客結構、基準差距與上月同期',table(['區／店','Tier','合格來客','續約','締結率','來客占比','未續約','同 Tier 基準','差距（百分點）','前期率','前期占比','樣本'],rows)+p('缺可比前期時僅顯示本期。月累計無法拆算 Tier WoW。'))+
      fold('整體變動拆解（百分點）',structure.length?table(['範圍','整體率變化','來客占比變化影響','同 Tier 締結率變化影響'],structure)+p('占比影響採各 Tier 占比變化乘以前期率，轉換影響採本期占比乘以各 Tier 率差；兩者合計為本來源整體率變化。'):p('兩期須有相同可比門市、完整 Tier 占比與有效分母，才可拆解。'))+
      fold('Tier觀察・原 TWM／TST 區級 A～E',m.observation.length?table(['區域','用戶別','Tier','合格來客','續約','締結率'],m.observation.map(t=>[t.region,t.origin,t.tier,fmt(t.visitors),fmt(t.renewals),pct(t.visitors?t.renewals/t.visitors:null)])):p('未提供所選期間的區級資料，單店無 TWM／TST 拆分。'))+
      fold('原方案未續約 TOP 5',m.plans.length?table(['原方案','未續約件數'],m.plans):p('缺來源或沒有符合條件的案件。'));
  }
  function advice(m,opt){
    const {ch,base,period,threshold}=opt,items=[];
    const candidates=m.comparisons.filter(r=>m.children.includes(r.id));
    for(const row of candidates){
      const c=row[period],d=T.changes(c.a,c.b,ch);
      if(!c.complete||d.points==null||d.growth==null)continue;
      let title='',action='',strength=false;
      if(d.growth<0&&Math.abs(d.points)<0.005){title='來客減少，締結率持平';action='核對邀約、到店與改期紀錄。';}
      else if(d.growth>0&&d.points<0){title='來客增加，締結率下降';action='抽查增量時段的未締結案件與回訪紀錄。';}
      else if(d.growth<0&&d.points<0){title='來客與締結率同時下降';action='分別核對邀約到店、各 Tier 來客占比與同 Tier 締結率。';}
      else if(d.growth>=0&&d.points>0){title='締結率提高';action='抽查當期成功案件，整理可供同區參考的作法。';strength=true;}
      if(title)items.push({strength,title:row.label+'・'+title,fact:dates(c.now)+' 對 '+dates(c.before)+'，'+ch.toUpperCase()+' 共同店來客 '+fmt(c.b[ch+'_d'])+' → '+fmt(c.a[ch+'_d'])+'（'+pct(d.growth)+'），締結率 '+rate(c.b,ch)+' → '+rate(c.a,ch)+'（'+signed(d.points,' 個百分點')+'）。',action,track:'下期同店來客、締結率及 Tier 結構。',weight:Math.abs(d.delta)});
    }
    for(const g of (opt.tierSource==='store'?m.heat:m.originHeat[opt.tierSource]).filter(g=>m.children.includes(g.id))){
      for(const t of g.rows||[]){
        const gap=T.gap(t.rate,t[base],'rate');if(t.visitors<threshold||gap==null||Math.abs(gap)<0.005||t.unrenewed<0||t.visitOnly<0)continue;
        const strength=gap>0,kind=[['NP OUT',t.npOut],['退租',t.terminated],['單純進店',t.visitOnly]].sort((a,b)=>b[1]-a[1])[0];
        items.push({strength,title:g.label+'・Tier '+t.tier+' 較基準'+(strength?'高':'低'),fact:dates({start:m.month,end:m.end})+' 續約 '+fmt(t.renewals)+'／合格來客 '+fmt(t.visitors)+'（'+pct(t.rate)+'），'+(base==='office'?m.office?.name:T.ALL)+' 同 Tier '+pct(t[base])+'，相差 '+signed(gap,' 個百分點')+'。',action:strength?'抽查成交與回訪紀錄，整理可複製的接待作法。':kind[1]==null?'抽查本區該 Tier 未續約案件，核對回訪紀錄。':'原報中'+kind[0]+' '+fmt(kind[1])+' 人次，優先抽查該類未續約案件及回訪紀錄。',track:'下期同 Tier 來客占比、續約率與基準差。',weight:t.visitors});
      }
    }
    return [true,false].map(strength=>{const list=items.filter(i=>i.strength===strength).sort((a,b)=>b.weight-a.weight).slice(0,3);
      return '<h3>'+(strength?'優勢':'改善重點')+'</h3>'+(list.length?'<div class="cards">'+list.map(i=>'<article><b>'+esc(i.title)+'</b><p>'+esc(i.fact)+'</p><p>查核動作｜'+esc(i.action)+'</p><p>追蹤｜'+esc(i.track)+'</p></article>').join('')+'</div>':p('此範圍沒有符合可比期間及樣本條件的項目。'));}).join('');
  }
  root.North12TrendView={summary,comparison,trend,tier,advice,table,p,dates};
})(globalThis);
