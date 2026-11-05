(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./offline-html.js'):root.OfflineHtml,node?require('./kpi-battle-controller.js'):root.KpiBattleController);
  if(node)module.exports=api;
  if(root)root.BattleHtmlExport=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(H,K){
  'use strict';
  const e=H.escape,n=K.formatNumber,pct=K.formatPercent,money=K.formatMoney;
  const value=v=>v==null||v===''?'尚未有資料':n(v);
  const table=(headers,rows)=>'<div class="scroll"><table><thead><tr>'+headers.map(h=>'<th>'+e(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+e(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
  const source=d=>table(['戰報日期','發布日期','資料截止','來源檔','統計區間'],[[d.report_date||'未提供',d.report_run_date||d.report_date||'未提供',d.data_as_of_date||d.source_as_of_date||'未提供',d.source_file||'未提供',d.source_date_range||'未提供']]);
  const css='*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#182333;font:16px/1.65 system-ui,"Microsoft JhengHei",sans-serif}main{max-width:1440px;margin:auto;padding:24px}h1{border-left:5px solid #ff6900;padding-left:16px}section,details{background:white;padding:20px;border:1px solid #dce3ea;border-radius:12px;margin:20px 0}h2{margin-top:0}.scroll{overflow:auto}table{border-collapse:collapse;width:100%}td,th{text-align:left;vertical-align:top;padding:10px;border-bottom:1px solid #dce3ea;white-space:nowrap}input{font:inherit;padding:8px;max-width:100%}[hidden]{display:none!important}@media(max-width:600px){main{padding:12px}section{padding:12px}}@media print{label,input{display:none}main{max-width:none;padding:0}.scroll{overflow:visible}table{font-size:10px}td,th{white-space:normal;padding:5px}}';
  function document(title,data,body){
    return H.create({title,css,body:'<main><h1>'+e(title)+'</h1><p>已授權資料的離線唯讀快照｜匯出 '+e(new Date().toISOString())+'。不會自動更新；持有此檔即可查看，請妥善保管。</p>'+source(data)+'<label>搜尋店點／人員／機款 <input id="search" type="search"></label>'+body+'</main>',script:'const q=document.getElementById("search"),rows=[...document.querySelectorAll("section tbody tr")];q.addEventListener("input",()=>{for(const r of rows)r.hidden=!r.textContent.toLocaleLowerCase().includes(q.value.toLocaleLowerCase());});'});
  }
  function metrics(rows){
    return table(['店點／人員','指標','實績','目標','達成率','日均差異','DOD'],rows.flatMap(row=>Object.entries(row.metrics||{}).map(([key,m])=>[row.name?row.store+'｜'+row.name:row.store,key,value(m?.actual),value(m?.target),pct(m?.rate),value(m?.daily_gap),pct(m?.dod)])));
  }
  function buildKpi(data){
    if(!data||!data.aggregate||!Array.isArray(data.stores)||!data.stores.length||!Array.isArray(data.personal))throw Error('KPI 來源尚未核對');
    const stores=[{...data.aggregate,store:'北一二B整體'},...[...data.stores].sort((a,b)=>(a.company_rank||9999)-(b.company_rank||9999))],people=[...data.personal].sort((a,b)=>Number(b.overall_rate||-1)-Number(a.overall_rate||-1));
    const a=data.aggregate,below=data.stores.every(r=>r.overall_kpi!=null&&r.overall_kpi!=='')?data.stores.filter(r=>Number(r.overall_kpi)<1).length:null;
    const summary='<section><h2>全區摘要</h2>'+table(['KPI總達成','公司排名','加掛得分','保險搭售率','KPI未達100%店數'],[[pct(a.overall_kpi),value(a.company_rank),value(a.addon_score),pct(a.insurance_attach_rate),value(below)]])+'</section>';
    const body='<section><h2>區／店 KPI</h2>'+table(['店點','公司排名','排名DOD','KPI總達成','KPI DOD','加掛','加掛DOD','保險搭售率'],stores.map(r=>[r.store,value(r.company_rank),value(r.company_rank_dod),pct(r.overall_kpi),pct(r.overall_kpi_dod),value(r.addon_score),value(r.addon_score_dod),pct(r.insurance_attach_rate)]))+'</section><section><h2>全區及各店全部 KPI 指標</h2>'+metrics(stores)+'</section><section><h2>個人績效（姓名沿用來源遮罩）</h2>'+table(['店點','姓名','職類','總達成率','總達成DOD','KPI排名','排名DOD','個人台獎實際','個人台獎推估','台獎排名','領獎資格','保險搭售率'],people.map(r=>[r.store,r.name,r.role||r.category||'—',pct(r.overall_rate),pct(r.overall_rate_dod),value(r.rank),value(r.rank_dod),money(r.phone_award_actual),money(r.phone_award_projected),value(r.phone_award_rank),r.phone_award_eligible??'尚未有資料',pct(r.insurance_attach_rate)]))+'</section><section><h2>個人全部 KPI 指標</h2>'+metrics(people)+'</section><p>'+e(data.supplement_status||'缺項沿用來源的尚未有資料狀態；未補零。')+'</p>';
    return document('KPI／個績｜北一二B',data,summary+body);
  }
  function buildAwards(data){
    if(!data?.supervisor||!data.overall||!Array.isArray(data.stores)||!data.stores.length)throw Error('台獎來源尚未核對');
    const units=[data.overall,...data.stores];
    const award=r=>[money(r.actual_total),money(r.projected),value(r.rank),r.award??'尚未有資料'];
    const eligibleKnown=data.stores.every(r=>r.award&&['Y','N'].includes(r.award.award)),eligible=data.stores.filter(r=>r.award?.award==='Y').length;
    let body='<section><h2>台獎摘要</h2>'+table(['重點機款','店點及整體列數','有領獎店','未領獎店'],[[value(data.phone_items),value(data.store_rows),eligibleKnown?value(eligible):'尚未有資料',eligibleKnown?value(data.stores.length-eligible):'尚未有資料']])+'</section><section><h2>督導區台獎</h2>'+table(['實際獎金','推估獎金','排名','領獎資格'],[award(data.supervisor)])+'</section><section><h2>區／店獎金</h2>'+table(['店點','實際獎金','推估獎金','排名','領獎資格'],units.map(r=>[r.store,...award(r.award||{})]))+'</section>';
    for(const [i,r] of units.entries()){
      if(!Array.isArray(r.items))throw Error('台獎機款明細尚未核對');
      const district=i===0;
      body+='<section><h2>'+e(r.store)+'｜'+(district?'督導80%／100%':'店長50%／100%')+'</h2>'+table(['機款','實際','目標','達成率','差異','門檻目標',district?'80%獎金':'50%獎金','100%獎金'],r.items.map(m=>[m.display_name,value(m.actual),value(m.target),pct(m.rate),value(m.difference??m.gap),value(m.threshold_target),money(district?m.district_reward_80:m.store_reward_50),money(district?m.district_reward_100:m.store_reward_100)]))+'<h3>原前三優先機款</h3>'+table(['機款','實際','目標','達成率','差異','增加獎金','下一獎階'],(r.priorities||[]).map(m=>[m.display_name,value(m.actual),value(m.target),pct(m.rate),value(m.difference??m.gap),money(m.incremental_award),m.next_label||'—']))+'</section>';
    }
    return document('台獎｜北一二B',data,body);
  }
  return Object.freeze({buildKpi,buildAwards});
});
