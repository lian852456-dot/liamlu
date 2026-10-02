(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DepartmentStorePresentation = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const CONTRACT = 'north12-store-presentation-v1';
  const REGIONS = ['北一二A', '北一二B', '北一二C', '北一二D'];
  const COLORS = ['#159B5B', '#EA4050', '#7651D5', '#2879D8'];
  const numeric = v => typeof v === 'number' && Number.isFinite(v);
  const validMonth = v => /^\d{4}-(0[1-9]|1[0-2])$/.test(v || '');
  const monthIndex = v => Number(v.slice(0, 4)) * 12 + Number(v.slice(5)) - 1;
  const monthAt = i => `${Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`;
  const average = rows => {
    const values = rows.map(r => r.score).filter(numeric);
    return { mean: values.length ? values.reduce((n, v) => n + v, 0) / values.length : null,
      valid: values.length, rows: rows.length, missing: rows.length - values.length };
  };
  const fmt = (v, places = 2) => numeric(v) ? String(Number(v.toFixed(places))) : '—';
  const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function category(m) {
    const t = `${m.group || ''} ${m.label || ''}`;
    if (/文件回送/.test(t)) return '文件回送缺失';
    if (/CSMO/.test(t)) return 'CSMO服務查核';
    if (/保全金/.test(t)) return '保全金疏失';
    if (/作廢憑證/.test(t)) return '作廢憑證未回送';
    if (/電腦未關機/.test(t)) return '電腦未關機';
    if (/出勤|排班|登入SCMS|登出時間/.test(t)) return '出勤紀錄異常';
    if (/店務日誌/.test(t)) return '店務日誌缺失';
    return `${m.group || ''} ${m.label || ''}`.trim() || '未分類分項';
  }
  function reasons(record) {
    const metrics = Array.isArray(record.metrics) ? record.metrics : [];
    return metrics.filter(m => m.kind === 'defect' && m.status === 'number' && numeric(m.value) && m.value > 0)
      .map(m => {
        const cat = category(m);
        const check = cat === 'CSMO服務查核' ? metrics.find(v => v.kind === 'checkScore' && /CSMO/.test(v.group || '')) : null;
        return {category:cat, label:m.label, group:m.group, value:m.value, unit:m.unit || '未載明單位', cell:m.cell,
          checkScore: numeric(check?.value) ? check.value : null, checkScoreCell:check?.cell || null};
      });
  }
  function reasonText(row) {
    if (!row.reasons.length) return '原表有扣分，未提供可辨識分項';
    return row.reasons.map(r => `${r.category} ${fmt(r.value)}${r.unit === '原表單位' ? '' : ` ${r.unit}`}${r.checkScore == null ? '' : `（${fmt(r.checkScore)}分）`}`).join('；');
  }
  function buildModel(brief, options = {}) {
    if (brief?.contract !== 'north12-scores-brief-v1' || !Array.isArray(brief.records)) throw new Error('需要已讀回的 north12-scores-brief-v1 資料');
    const available = [...new Set([...(brief.period || []), ...brief.records.map(r => r.monthKey)])].sort();
    if (!available.length || available.some(m => !validMonth(m))) throw new Error('月份格式無效');
    const end = options.endMonth || available.at(-1), start = options.startMonth || available[0];
    if (!validMonth(start) || !validMonth(end) || monthIndex(end) < monthIndex(start)) throw new Error('日期範圍無效');
    const count = monthIndex(end) - monthIndex(start) + 1;
    if (count > 6) throw new Error('趨勢模板最多6個月，請縮小日期範圍');
    const target = options.targetMonth || end;
    if (!validMonth(target) || target < start || target > end) throw new Error('單月檢視必須位於日期範圍內');
    const region = options.region ?? brief.filters?.region ?? '', store = options.store ?? brief.filters?.store ?? '';
    if (region && !REGIONS.includes(region)) throw new Error('區域無效');
    if ((brief.filters?.region && region !== brief.filters.region) || (brief.filters?.store && store !== brief.filters.store)) throw new Error('已篩選資料不能擴張範圍，請重新讀取完整成績');
    const months = Array.from({length:count}, (_,i) => monthAt(monthIndex(start)+i));
    const seen = new Set();
    const rows = brief.records.filter(r => r.monthKey >= start && r.monthKey <= end && (!region || r.region === region) && (!store || r.store === store));
    for (const r of rows) {
      if (!validMonth(r.monthKey) || !REGIONS.includes(r.region) || typeof r.store !== 'string' || !r.store.trim()) throw new Error('店月身分不完整');
      if (r.score !== null && (!numeric(r.score) || r.score < 0 || r.score > 100)) throw new Error('成績必須為0–100數值或null');
      for (const key of ['deduction','defects']) if (r[key] != null && (!numeric(r[key]) || r[key] < 0)) throw new Error('缺失及扣分格式無效');
      const key = `${r.monthKey}\0${r.store}`;
      if (seen.has(key)) throw new Error('同店同月資料重複，停止生成');
      seen.add(key);
    }
    if (!rows.length) throw new Error('所選範圍沒有店務資料');
    const targetRows = rows.filter(r => r.monthKey === target), lookup = new Map(rows.map(r => [`${r.monthKey}\0${r.store}`,r]));
    const stores = [...new Set(rows.map(r => r.store))].sort((a,b) => a.localeCompare(b,'zh-Hant'));
    const storeRows = stores.map(name => {
      const rr = rows.filter(r => r.store === name), latest = lookup.get(`${target}\0${name}`) || rr.toSorted((a,b)=>a.monthKey.localeCompare(b.monthKey)).at(-1);
      const cells = months.map(month => { const r = lookup.get(`${month}\0${name}`); return {month,score:numeric(r?.score)?r.score:null,status:r?(numeric(r.score)?'number':'missing'):'missing',sourceCell:r?.source?.score?.cell || null}; });
      const a = average(rr), sixPerfect = count === 6 && cells.every(c => c.status === 'number' && c.score === 100);
      return {store:name,region:latest.region,cells,mean:a.mean,valid:a.valid,missing:count-a.valid,sixPerfect};
    });
    const lowScores = targetRows.filter(r => numeric(r.score) && r.score < 100).toSorted((a,b) => a.score-b.score || a.region.localeCompare(b.region) || a.store.localeCompare(b.store,'zh-Hant')).map((r,i) => {
      let streak = 0;
      for (let m=monthIndex(target);m>=monthIndex(start);m--) {
        const previous=lookup.get(`${monthAt(m)}\0${r.store}`);
        if (!previous || !numeric(previous.score) || previous.score >= 100) break;
        streak++;
      }
      return {order:i+1,region:r.region,store:r.store,score:r.score,deduction:r.deduction ?? null,defects:r.defects ?? null,streak,streakWindowLimited:streak===monthIndex(target)-monthIndex(start)+1,reasons:reasons(r),source:r.source || {}};
    });
    const summary = average(rows), single=average(targetRows), perfect=targetRows.filter(r=>r.score===100).length;
    const regions=REGIONS.filter(r=>!region || r===region).map((r,i)=>{
      const monthly=targetRows.filter(v=>v.region===r), half=rows.filter(v=>v.region===r), a=average(monthly);
      return {region:r,color:COLORS[REGIONS.indexOf(r)],rows:storeRows.filter(s=>s.region===r),half:average(half),single:{...a,perfect:monthly.filter(v=>v.score===100).length,rate:a.valid?monthly.filter(v=>v.score===100).length/a.valid:null}};
    });
    const top=new Map();
    for(const r of lowScores)for(const name of new Set(r.reasons.map(x=>x.category)))top.set(name,(top.get(name)||0)+1);
    return {contract:CONTRACT,period:months,targetMonth:target,filters:{region,store},scope:region || '北一二部',storeCount:stores.length,summary,
      single:{...single,perfect,rate:single.valid?perfect/single.valid:null,low:lowScores.length,continuous:lowScores.filter(r=>r.streak>=2).length,missingStores:stores.length-single.valid},
      regions,storeRows,lowScores,sixPerfect:storeRows.filter(r=>r.sixPerfect),sixMonthEligibilityEvaluated:count===6,
      reasonTop:[...top].map(([category,stores])=>({category,stores})).sort((a,b)=>b.stores-a.stores||a.category.localeCompare(b.category,'zh-Hant')),
      notices:['平均以有效店月原G成績計算，缺值不補0或100。','滿分率分母為當月有效成績店數，缺資料另列。','連續未滿100以當月往前逐月檢查，缺月或缺成績即中斷，無須同原因。','原因TOP按涉及店數統計，同店可多類，扣分未換算案件數。','連6月滿分只列資料資格，SPE規則及核定由管理者確認。','未提供每月店長身分來源，採店舖歷史，不回填現任店長。']};
  }
  function assertCapacity(model) {
    planPages(model);
  }
  const textHeight = (text, width, font, minimum) => Math.max(minimum, Math.ceil([...String(text)].reduce((n,c)=>n+font*(c.charCodeAt(0)>127?1:0.56),0)/width)*font*1.05+2);
  function fitPages(rows, limit, available, height) {
    const pages=[];let page=[],used=0;
    for(const row of rows){const h=height(row);if(h>available)throw new Error('單一項目文字超過一頁可讀高度，請先檢查來源文字');if(page.length&&(page.length===limit||used+h>available)){pages.push(page);page=[];used=0;}page.push(row);used+=h;}
    if(page.length)pages.push(page);return pages.length?pages:[[]];
  }
  function planPages(model) {
    if(model?.contract!==CONTRACT)throw new Error('簡報model契約不符');
    const limits=model.regions.map((_,i)=>i<2?9:10),pages=[],trends=Math.max(1,...model.regions.map((r,i)=>Math.ceil(r.rows.length/limits[i])),Math.ceil(model.sixPerfect.length/6));
    for(let i=0;i<trends;i++)pages.push({kind:'trend',part:i+1,model:{...model,regions:model.regions.map((r,j)=>({...r,rows:r.rows.slice(i*limits[j],(i+1)*limits[j])})),sixPerfect:model.sixPerfect.slice(i*6,(i+1)*6),sixPerfectTotal:model.sixPerfect.length}});
    const lows=fitPages(model.lowScores,11,464,r=>textHeight(reasonText(r),505,18,42));
    const reasons=fitPages(model.reasonTop,7,208,r=>textHeight(r.category,315,21,28));
    for(let i=0;i<Math.max(lows.length,reasons.length);i++){
      const lowScores=lows[i]||[],reasonTop=reasons[i]||[];
      pages.push({kind:'monthly',part:i+1,model:{...model,lowScores,lowScoresTotal:model.lowScores.length,reasonTop,lowRowHeights:lowScores.map(r=>textHeight(reasonText(r),505,18,42)),reasonRowHeights:reasonTop.map(r=>textHeight(r.category,315,21,28))}});
    }
    return pages.map((p,i)=>({...p,pageNumber:i+1,totalPages:pages.length,firstMonthlyPage:trends+1}));
  }
  function renderPrintPage(model, page) {
    if(model?.contract!==CONTRACT)throw new Error('簡報model契約不符');
    const table=(headers,rows,cls='',heights=[])=>`<table class="${cls}">${cls==='low'?'<colgroup>'+[42,98,146,76,90,76,558].map(w=>'<col style="width:'+(w/1186*100)+'%">').join('')+'</colgroup>':''}<thead><tr>${headers.map(v=>`<th>${escape(v)}</th>`).join('')}</tr></thead><tbody>${rows.map((r,i)=>`<tr${heights[i]?' style="height:'+heights[i]+'px"':''}>${r.map(v=>`<td>${escape(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const month=model.targetMonth.slice(5).replace(/^0/,''), period=model.period.map(v=>v.replace('-','.'));
    const kpis=(single)=>`<div class="kpis"><div><label>${single?month+'月':model.period.length===6?'近半年':'所選期間'}平均</label><strong>${fmt(single?model.single.mean:model.summary.mean)}</strong><small>有效${single?model.single.valid:model.summary.valid}筆${single?'店成績':'店月'}</small></div><div><label>${single?'100分店數':month+'月平均'}</label><strong>${single?`${model.single.perfect} / ${model.single.valid}`:fmt(model.single.mean)}</strong><small>${single?'滿分率 '+fmt((model.single.rate==null?null:model.single.rate*100),1)+'%':'當月原G成績'}</small></div><div><label>${single?'未達100分':month+'月滿分'}</label><strong>${single?model.single.low:`${model.single.perfect} / ${model.single.valid}`}</strong><small>${single?'當月缺資料 '+model.single.missingStores+'店':'滿分率 '+fmt((model.single.rate==null?null:model.single.rate*100),1)+'%'}</small></div><div><label>${single?'連續未滿100':'連續6月滿分'}</label><strong>${single?model.single.continuous:model.sixMonthEligibilityEvaluated?model.sixPerfectTotal:'未評估'}</strong><small>${single?'往前連續至少2月':'完整6月資料資格'}</small></div></div>`;
    const colored=(v)=>`<td class="${v==null?'missing':v===100?'perfect':'loss'}">${escape(fmt(v))}</td>`;
    const halfTables=model.regions.map(r=>`<section class="region" style="--region:${r.color}"><h2>${escape(r.region)} <span>平均 ${fmt(r.half.mean)}</span></h2><table class="half"><thead><tr><th>店舖</th>${model.period.map(m=>`<th>${m.slice(5)}</th>`).join('')}<th>平均</th></tr></thead><tbody>${r.rows.map(s=>`<tr><td>${escape(s.store)}</td>${s.cells.map(c=>colored(c.score)).join('')}${colored(s.mean)}</tr>`).join('')}</tbody></table></section>`).join('');
    const lowTable=table(['序','區域','店舖',month+'月','連續','扣分','缺失原因'],model.lowScores.map(r=>[r.order,r.region,r.store,fmt(r.score),r.streak>=2?`連${r.streak}月`:'—',fmt(r.deduction),reasonText(r)]),'low',model.lowRowHeights);
    const regionSummary=table(['區','平均','滿分/有效','%'],model.regions.map(r=>[r.region,fmt(r.single.mean),`${r.single.perfect}/${r.single.valid}`,fmt((r.single.rate==null?null:r.single.rate*100),1)]));
    const top=table(['原因TOP（涉及店數）','店'],model.reasonTop.map(r=>[r.category,r.stores]),'',model.reasonRowHeights);
    return `<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><title>店務管理簡報</title><style>@page{size:16.666667in 9.375in;margin:0}*{box-sizing:border-box}body{margin:0;font-family:"PingFang TC","Microsoft JhengHei",sans-serif;color:#1D3B60;background:#E6EBF2}.page{width:1600px;height:900px;padding:30px 38px;background:white;page-break-after:always;overflow:hidden}h1{font-size:44px;margin:0 0 8px;text-align:center;color:#173C6A}.sub{font-size:20px;color:#6C7F98}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:12px 0 24px}.kpis>div{border:1px solid #D7E2EF;border-radius:8px;padding:10px 20px}.kpis label,.kpis small{display:block;font-size:24px;line-height:1}.kpis strong{display:block;font-size:48px;line-height:1}.kpis small{font-size:18px;color:#71839B}.body{align-items:start;display:grid;grid-template-columns:1220px 284px;gap:20px}.regions{display:grid;grid-template-columns:1fr 1fr;grid-template-rows:284px 284px;gap:16px}.region{border:1px solid var(--region);padding:8px;border-radius:8px}.region h2{margin-bottom:6px}h2{line-height:1;font-size:28px;margin:0 0 8px;color:var(--region,#1D3B60)}h2 span{float:right;font-size:20px}table{width:100%;border-collapse:collapse;font-size:17px;line-height:1}th{background:#EDF3F8}td,th{border:1px solid #E5ECF3;text-align:center;padding:1px 4px;height:21px}td:first-child{text-align:left}.half td:first-child{width:165px}.half td{font-weight:600}.half td.perfect{color:#178F54;background:#E6F4E9}.half td.loss{color:#DD414A;background:#FBE9E9}.half td.missing{color:#73849B;background:#EEF1F5}.low{font-size:19px;table-layout:fixed}.low td:not(:last-child){white-space:nowrap}.low td{height:inherit;min-height:42px}.low td:last-child{font-size:18px;text-align:left}.low td:nth-child(4),.low td:nth-child(6){color:#DD414A}.low td:nth-child(3){white-space:nowrap}.sidebar{font-size:21px}.sidebar h2{font-size:25px;margin-top:14px}.sidebar p{line-height:1.2;margin:12px 0}.footer{font-size:17px;color:#617791;margin-top:12px;line-height:1.2}.page{position:relative}.page-number{position:absolute;bottom:5px;right:38px;font-size:16px;color:#73849B}.page:last-child{page-break-after:auto}.actions{padding:10px;background:#173C6A;color:white}.actions button{font-size:20px}@media print{.actions{display:none}body{background:white}.page{width:1600px;height:900px}}</style><div class="actions"><button onclick="window.print()">列印 / 儲存為 PDF（16:9橫向）</button></div>${page.kind==='trend'?`<main class="page"><h1>店舖近${model.period.length===6?'半年':model.period.length+'月'}店務管理成績表現${page.part>1?`（續${page.part}）`:""}</h1><div class="sub">TWM 店務管理月報　${escape(model.scope)}　${period[0]}–${period.at(-1)}　${model.storeCount}家店</div>${kpis(false)}<div class="body"><div class="regions">${halfTables}</div><aside class="sidebar"><h2>連續6月滿分</h2>${model.sixMonthEligibilityEvaluated?model.sixPerfect.map(r=>`<p>${escape(r.store)}</p>`).join('')||(model.sixPerfectTotal?'<p>本頁無續列名單</p>':'<p>無符合店點</p>'):'<p>資料不足6月，未評估</p>'}<p>依完整6月原G成績判定。SPE +1規則及核定待管理者確認。</p><h2>${month}月重點</h2><p>未滿100分 ${model.single.low}店<br>連續未滿100分 ${model.single.continuous}店<br>缺資料 ${model.single.missingStores}店</p></aside></div><div class="footer">平均採有效店月等權，缺值不補零。店舖歷史未回填現任店長。灰色—代表缺資料。</div><div class="page-number">${page.pageNumber} / ${page.totalPages}</div></main>`:`<main class="page"><h1>${model.targetMonth.slice(0,4)}年${month}月店務成績表現${page.part>1?`（續${page.part}）`:""}</h1><div class="sub">${escape(model.scope)}　${model.storeCount}家店　成績由低至高排列</div>${kpis(true)}<div class="body"><section><h2>未達100分店點排序</h2>${lowTable}${!model.lowScores.length?`<p>${model.lowScoresTotal?"未滿分店點已列於前頁，本頁續列其他資訊。":"當月無未滿100分店點。"}</p>`:""}<div class="footer">連續以當月往前逐月未滿100檢查，缺月即中斷。除台日/頁次/查核分數另列，其餘分項為原表單位。扣分是原F值，未換算件數。</div></section><aside class="sidebar"><h2>區域表現</h2>${regionSummary}<h2>缺失原因TOP</h2>${top}<p>同店可多類，總數不必等於未滿分店數。</p></aside></div><div class="page-number">${page.pageNumber} / ${page.totalPages}</div></main>`}</html>`;
  }
  function renderPrintHtml(model) {
    const pages=planPages(model), first=renderPrintPage(pages[0].model,pages[0]);
    const prefix=first.slice(0,first.indexOf('<main class="page">'));
    return prefix+pages.map(page=>{const html=renderPrintPage(page.model,page);return html.slice(html.indexOf('<main class="page">'),html.indexOf('</html>'));}).join('')+'</html>';
  }
  return {CONTRACT,REGIONS,COLORS,buildModel,assertCapacity,planPages,renderPrintHtml,reasons,reasonText,fmt};
});
