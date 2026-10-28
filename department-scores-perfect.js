(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./department-scores-core.js'):root.DepartmentScoresCore);if(typeof module==='object'&&module.exports)module.exports=api;else root.DepartmentScoresPerfect=api;})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const {REGIONS,periodMonths}=C;
  function perfectSummary(all, filters = {}) {
    const months = periodMonths(all, 'half'), keys = months.map(m => m.monthKey);
    const rows = months.flatMap(m => m.records.map(r => ({...r, monthKey:m.monthKey})));
    const stores = [...new Set(rows.map(r => r.store))].filter(s => !filters.store || s === filters.store);
    const regions = REGIONS.filter(r => !filters.region || r === filters.region).map(region => {
      const monthly = months.map(m => {
        const records = m.records.filter(r => r.region === region && (!filters.store || r.store === filters.store));
        return {monthKey:m.monthKey, available:m.available !== false,
          valid:records.filter(r => Number.isFinite(r.score)).length,
          missing:records.filter(r => !Number.isFinite(r.score)).length,
          stores:records.filter(r => r.score === 100).map(r => r.store).sort((a,b)=>a.localeCompare(b,'zh-Hant'))};
      });
      const sixPerfect = stores.filter(store => {
        const history = keys.map(key => rows.find(r => r.store === store && r.monthKey === key));
        return keys.length === 6 && history.every(r => r?.score === 100) && history.at(-1).region === region;
      }).sort((a,b)=>a.localeCompare(b,'zh-Hant'));
      return {region, monthly, sixPerfect};
    });
    return {keys, regions};
  }
  function renderPerfectSummary(all, filters = {}) {
    const model = perfectSummary(all, filters);
    const esc = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    return `<p class="source-meta">${[model.keys[0], model.keys.at(-1)].filter(Boolean).join(' ～ ')}｜以最新資料月為止，依目前部區／店點篩選</p><div class="score-perfect-grid">${model.regions.map((r,i)=>`<article class="score-perfect-region" data-region="${esc(r.region)}"><h4>${esc(r.region)}</h4><p class="score-perfect-six"><strong>連續6個月100分：${r.sixPerfect.length}店</strong><span>${r.sixPerfect.map(esc).join('、') || '無符合門市'}</span></p><div class="score-perfect-months">${r.monthly.map(m=>`<details><summary>${m.monthKey} <strong>${m.available && m.valid ? m.stores.length+'店' : '缺資料'}</strong></summary><p>${m.stores.map(esc).join('、') || (m.available && m.valid ? '無100分門市' : '此月無有效成績')}</p>${m.missing?`<small>另有 ${m.missing} 店缺成績</small>`:''}</details>`).join('')}</div></article>`).join('')}</div><p class="score-limits">各月依當月部區歸屬；連續6個月須每月原G成績均為100分，缺月或缺成績不列入，依最新月歸區。SPE資格及核定由管理者確認。</p>`;
  }
  return {build:perfectSummary,render:renderPerfectSummary};
});
