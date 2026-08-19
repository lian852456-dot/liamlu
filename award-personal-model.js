(function attachAwardPersonalModel(scope) {
  'use strict';

  const STORES = Object.freeze(['酒泉','永吉','復興南','杭州南','萬大','通化','大稻埕','台北三創','六張犁']);

  function numberOrNull(value) {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function eligibleOrNull(value) {
    const normalized = String(value == null ? '' : value).trim().toUpperCase();
    return normalized === 'Y' || normalized === 'N' ? normalized : null;
  }

  function adaptSnapshot(snapshot, normalizeStore) {
    const kpi = snapshot && snapshot.kpiBattle || {};
    const awards = snapshot && snapshot.awardsBattle || {};
    const kpiDate = String(kpi.report_date || '');
    const awardDate = String(awards.report_date || '');
    if (!kpiDate || !awardDate || kpiDate !== awardDate) {
      return {
        status:'no_data',
        reportDate:awardDate || kpiDate,
        rows:[],
        note:kpiDate && awardDate ? '台獎日期與 KPI 日期不一致' : '正式個人台獎尚未提供可對齊的資料日期'
      };
    }
    const normalize = typeof normalizeStore === 'function' ? normalizeStore : value => String(value || '').trim();
    const rows = (Array.isArray(kpi.personal) ? kpi.personal : []).map(row => ({
      name:String(row && row.name || ''),
      store:normalize(row && row.store),
      role:String(row && row.role || ''),
      category:String(row && row.category || ''),
      actual:numberOrNull(row && row.phone_award_actual),
      projected:numberOrNull(row && row.phone_award_projected),
      rank:numberOrNull(row && row.phone_award_rank),
      eligible:eligibleOrNull(row && row.phone_award_eligible)
    })).filter(row => row.name && row.store);
    return { status:rows.length ? 'ok' : 'no_data', reportDate:awardDate, rows, note:rows.length ? '' : '正式來源尚無個人台獎資料。' };
  }

  function tieBreak(a, b) {
    if (a.rank != null && b.rank != null && a.rank !== b.rank) return a.rank - b.rank;
    if (a.rank != null && b.rank == null) return -1;
    if (a.rank == null && b.rank != null) return 1;
    return a.name.localeCompare(b.name, 'zh-Hant');
  }

  function compareAmount(a, b, direction) {
    if (a.actual == null && b.actual == null) return tieBreak(a,b);
    if (a.actual == null) return 1;
    if (b.actual == null) return -1;
    if (a.actual !== b.actual) return direction === 'asc' ? a.actual - b.actual : b.actual - a.actual;
    return tieBreak(a,b);
  }

  function selectRows(rows, storeFilter = 'all', sortMode = 'amount-desc') {
    const filtered = (Array.isArray(rows) ? rows : []).filter(row => storeFilter === 'all' || row.store === storeFilter);
    return filtered.slice().sort((a,b) => {
      if (sortMode === 'amount-asc') return compareAmount(a,b,'asc');
      if (sortMode === 'name') return a.name.localeCompare(b.name,'zh-Hant') || tieBreak(a,b);
      return compareAmount(a,b,'desc');
    });
  }

  function rankLabel(rank) {
    return rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank == null ? '—' : String(rank);
  }

  const api = { STORES, numberOrNull, eligibleOrNull, adaptSnapshot, selectRows, rankLabel };
  scope.LiamAwardPersonalModel = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
