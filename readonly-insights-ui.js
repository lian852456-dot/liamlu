(function(root,factory){
  const api=factory(typeof module==='object'&&module.exports?require('./readonly-insights-core.js'):root.ReadonlyInsightsCore);
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.ReadonlyInsightsUI=api;
})(typeof globalThis==='object'?globalThis:this,function(Engine){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>v==null||!Number.isFinite(v)?'—':Math.round(v).toLocaleString('zh-TW');
  const pct=v=>v==null||!Number.isFinite(v)?'—':(100*v).toFixed(1)+'%';
  const pp=v=>v==null||!Number.isFinite(v)?'—':(v>=0?'+':'')+(v*100).toFixed(1)+'pp';
  const grow=v=>v==null||!Number.isFinite(v)?'—':(v>=0?'+':'')+(v*100).toFixed(1)+'%';
  const kpi=(label,value,detail)=>'<article class="insight-kpi"><span>'+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(detail)+'</small></article>';
  const formatRow=row=>'<tr><th scope="row">'+esc(row.short)+'</th><td>'+num(row.now.rt_d)+'</td><td>'+num(row.now.rt_n)+'</td><td>'+pct(row.now.rt_rate)+'</td><td class="'+(row.gapPP!=null&&row.gapPP<=-0.05?'insight-danger':'')+'">'+pp(row.gapPP)+'</td><td>'+pp(row.mom?.ratePP)+'</td><td>'+grow(row.mom?.traffic)+'</td><td>'+num(row.achievable)+'</td></tr>';
  function render(result,{store='all'}={}){
    const selected=store==='all'?null:result.stores.find(r=>r.id===store);
    const shown=selected?[selected]:result.stores;
    const total=selected?selected.now:result.total;
    const previous=selected?selected.prev:result.previous;
    const mom=selected?selected.mom:result.mom;
    const important=selected?shown:result.prioritized.slice(0,3);
    const outcome=selected?(selected.achievable==null?'樣本不足':num(selected.achievable)+' 件'):num(result.opportunity)+' 件';
    const cards=[
      kpi('RT 有效來客',num(total.rt_d)+' 人次', '來自現行已驗證締結率來源'),
      kpi('RT 續約件數',num(total.rt_n)+' 件','本期合計'),
      kpi('RT 締結率',pct(total.rt_rate), '分子母加總重算'),
      kpi('締結率 MOM',pp(mom?.ratePP),previous?'上月相同期間':'缺少可比較同期'),
      kpi('有效來客 MOM',grow(mom?.traffic),previous?'同口徑有效來客':'缺少可比較同期'),
      kpi('估算改善空間',outcome, '追至區平均；非成交預測')
    ].join('');
    let suggestions='';
    if(!important.length)suggestions='<div class="insight-neutral">九店目前沒有觸發可比資料的優先異常條件。持續檢視來源截止與每週變化，並以 Tier 結構核對後再作成因判斷。</div>';
    for(const row of important){
      const acts=Engine.actions(row);
      suggestions+='<article class="insight-advice"><div class="insight-advice-head"><h4>'+esc(row.short)+' · '+esc(row.trigger||'本店改善檢視')+'</h4><span>'+esc(row.achievable==null?'需更多樣本':'試算 +'+num(row.achievable)+' 件')+'</span></div><p class="insight-evidence">本期 '+num(row.now.rt_n)+' / '+num(row.now.rt_d)+'（'+pct(row.now.rt_rate)+'）；與區平均 '+pp(row.gapPP)+'；締結率 MOM '+pp(row.mom?.ratePP)+'</p><ol>'+acts.map(a=>'<li><strong>'+esc(a.title)+'</strong>：'+esc(a.detail)+'</li>').join('')+'</ol></article>';
    }
    const note='改善件數＝max(0,⌈區域締結率 × 該店符合資格來客⌉－該店續約件數)，僅對有效來客≥'+result.sampleMinimum+'且低於區平均的店試算，未校正 Tier、原 TWM／TST 結構，並非承諾成果。';
    const textCopy=important.map(r=>r.short+'｜'+(r.trigger||'檢視')+'｜RT '+pct(r.now.rt_rate)+'；區差 '+pp(r.gapPP)+'；試算 '+(r.achievable==null?'—':r.achievable+'件')+'\n'+Engine.actions(r).map((a,i)=>(i+1)+'. '+a.title+'：'+a.detail).join('\n')).join('\n\n');
    return {html:
      '<section class="insight-header"><div><h3>續約洞察與智慧經營建議</h3><p>僅分析已授權的北一二B私有彙總；不新增背景讀取，也不公開客戶資料。</p></div><span>本期 '+esc(result.period_start)+'～'+esc(result.cutoff)+'</span></section>'+
      '<section class="insight-grid">'+cards+'</section>'+
      '<section class="panel insight-panel"><h3>九店締結率與 MOM 比較</h3><p class="sub">區平均是以九店分子母加權；門市差距為百分點（pp），來客變化為百分比（%）。'+(!result.hasPrior?'本次無上月同期，MOM 不顯示。':'')+'</p><div class="table-scroll"><table class="insight-table"><thead><tr><th>店點</th><th>RT來客</th><th>續約</th><th>締結率</th><th>區差</th><th>MOM 締結率</th><th>MOM 來客</th><th>改善件數</th></tr></thead><tbody>'+shown.map(formatRow).join('')+'</tbody></table></div><p class="sub">'+esc(note)+'</p></section>'+
      '<section class="panel insight-panel"><div class="insight-suggest-title"><h3>本週建議作法</h3>'+(important.length?'<button type="button" id="copy-insights" class="quiet">複製改善指令</button>':'')+'</div>'+suggestions+'<p id="copy-insight-status" class="sub" role="status"></p></section>'+
      '<section class="insight-pending"><article class="panel"><h3>Tier A～F 掌握分析</h3><p>尚未接入已授權且核實的 Tier × 九店分子母彙總。待私有來源整合後顯示 A～F 續約率、TWM／TST、D tier↑ 及同 Tier 店間差異；目前不以總 RT 推定 Tier。</p></article><article class="panel"><h3>原方案未續約 TOP 5</h3><p>尚未接入去識別化的「未續約明細」方案統計。完成私有彙總及去重、最低樣本數核對後才顯示方案、流失類型與改善建議；不將原始用戶明細公開到 GitHub Pages。</p></article></section>'
      ,copyText:textCopy};
  }
  return Object.freeze({render});
});