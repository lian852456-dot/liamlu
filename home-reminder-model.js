(function exposeHomeReminderModel(root, factory) {
  const questions = typeof module === 'object' && module.exports
    ? require('./patrol-question-versions.js') : root.PatrolQuestionVersions;
  const api = factory(questions);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HomeReminderModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildHomeReminderModel(Questions) {
  'use strict';

  // These IDs intentionally match patrol.html / the isolated Patrol contract.
  // Audit uses a different Tonghua ID and must not replace this read mapping.
  const STORES = Object.freeze([
    { name:'通化', code:'DNB10059' }, { name:'酒泉', code:'DNB10062' },
    { name:'台北三創', code:'DNB10307' }, { name:'萬大', code:'DNB10168' },
    { name:'六張犁', code:'DNB10440' }, { name:'復興南', code:'DNB10094' },
    { name:'永吉', code:'DNB10082' }, { name:'大稻埕', code:'DNB10284' },
    { name:'杭州南', code:'DNB10146' }
  ].map(Object.freeze));
  const SALES_FIELDS = Object.freeze([
    { id:'sales-a999', key:'A999', field:'aq999', unit:'count' },
    { id:'sales-haosu', key:'好速', field:'haosu', unit:'points' }
  ]);
  const STORE_NAMES = new Set(STORES.map(store => store.name));
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

  function taipeiDate(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) throw new Error('invalid_reminder_date');
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone:'Asia/Taipei', year:'numeric', month:'2-digit', day:'2-digit'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  }

  function dateContext(now = new Date()) {
    const today = taipeiDate(now);
    const yesterday = taipeiDate(new Date(`${today}T12:00:00+08:00`).getTime() - 86400000);
    const month = today.slice(0, 7);
    if (!Questions || typeof Questions.bimWindow !== 'function') throw new Error('patrol_question_contract_missing');
    const bimonthly = Questions.bimWindow(month);
    return { today, yesterday, month, bimonthly, bimonthlyMonths:bimonthly.months.slice(), bimonthlyLabel:bimonthly.label };
  }

  function storeName(value) {
    const normalized = String(value == null ? '' : value).replace(/^台灣大哥大數位生活/, '').replace(/^台北/, '').trim();
    return normalized === '三創' ? '台北三創' : normalized;
  }

  function contextValid(context) {
    if (!context || !DATE_PATTERN.test(context.today) || !DATE_PATTERN.test(context.yesterday)) return false;
    try {
      const expected = dateContext(`${context.today}T12:00:00+08:00`);
      return context.month === expected.month && context.yesterday === expected.yesterday
        && JSON.stringify(context.bimonthly) === JSON.stringify(expected.bimonthly);
    } catch (_) { return false; }
  }

  function item(id, kind, title, text, period, href, status, updatedAt) {
    const result = { id, kind, title, text, period, href, status };
    if (updatedAt) result.updatedAt = String(updatedAt);
    return result;
  }

  function pendingSales(context, reason) {
    return SALES_FIELDS.map(definition => item(definition.id, 'sales', `昨日 ${definition.key} 待更新`,
      reason || '待更新：請先以既有員編與核准裝置登入，再讀取昨日 21:00 正式回報。',
      `${context && context.yesterday || '昨日'} 21:00`, 'kpi-battle.html', 'pending'));
  }

  function pendingPatrol(context, reason) {
    const month = context && typeof context.month === 'string' ? context.month : '';
    return [
      item('patrol-visits', 'patrol', '本月巡店待更新', reason || '待更新：請先至 Liam 情報站驗證督導身分，再返回更新。',
        month || '本月', 'patrol.html', 'pending'),
      item('patrol-inventory', 'patrol', '雙月大盤待更新', reason || '待更新：尚未取得本期完整正式資料。',
        month && context.bimonthly ? `${month.slice(0, 4)} 年 ${context.bimonthly.label}` : '本期（每兩月一次）', 'patrol.html', 'pending')
    ];
  }

  function pendingItems(context, reason) {
    return [...pendingSales(context, reason), ...pendingPatrol(context, reason)];
  }

  function canonicalStoreMap(rows) {
    if (!Array.isArray(rows) || rows.length !== STORES.length) return null;
    const map = new Map();
    for (const row of rows) {
      const name = storeName(row && row.name);
      if (!row || !STORE_NAMES.has(name) || map.has(name)) return null;
      map.set(name, row);
    }
    return map;
  }

  // This pure adapter never authorizes a read. Its caller must successfully verify
  // private_access using the existing stored employee/device pair before fetching.
  function fromSales(response, context) {
    const unavailable = () => pendingSales(context, '待更新：昨日 21:00 正式回報尚未完整確認，未回報或缺值不列為零業績。');
    if (!contextValid(context) || !response || response.status !== 'ok') return unavailable();
    const summary = response.summary;
    if (!summary || summary.semantics !== 'formal-index-summary-v1' || summary.date !== context.yesterday
      || summary.segment !== 21 || summary.totalStores !== 9 || !Number.isInteger(summary.completedStores)
      || summary.completedStores < 0 || summary.completedStores > 9) return unavailable();
    const rows = canonicalStoreMap(summary.stores);
    if (!rows || [...rows.values()].some(row => typeof row.reported !== 'boolean')) return unavailable();
    const missing = STORES.filter(store => !rows.get(store.name).reported).map(store => store.name);
    if (!Array.isArray(summary.missingStores) || summary.missingStores.length !== missing.length
      || new Set(summary.missingStores.map(storeName)).size !== missing.length
      || summary.missingStores.some(name => !missing.includes(storeName(name)))
      || summary.completedStores !== 9 - missing.length || !summary.completedStores) return unavailable();
    const period = `${context.yesterday} 21:00`;
    const pendingFields = new Set();
    const results = SALES_FIELDS.map(definition => {
      const confirmed = [];
      let known = 0;
      for (const store of STORES) {
        const row = rows.get(store.name);
        if (!row.reported) continue;
        const metric = row.metrics && row.metrics[definition.key];
        // Blank, null, booleans, numeric strings, negatives and nonfinite values
        // are not canonical summary numbers and must never become a zero.
        if (!metric || typeof metric.value !== 'number' || !Number.isFinite(metric.value) || metric.value < 0
          || metric.sourceField !== definition.field || metric.unit !== definition.unit
          || (definition.key === 'A999' && !Number.isInteger(metric.value))) {
          pendingFields.add(store.name);
          continue;
        }
        known += 1;
        if (metric.value === 0) confirmed.push(store.name);
      }
      const text = confirmed.length ? `已確認 ${confirmed.length} 店：${confirmed.join('、')}`
        : known === 9 ? '九店均已有銷售紀錄'
        : '待更新：尚有未回報或欄位缺值；已確認資料中暫無零業績';
      return item(definition.id, 'sales', `昨日 ${definition.key} 零業績`, text, period, 'index.html',
        confirmed.length ? 'warning' : known === 9 ? 'ok' : 'pending', summary.updatedAt);
    });
    if (missing.length || pendingFields.size) {
      const parts = [];
      if (missing.length) parts.push(`未回報：${missing.join('、')}`);
      if (pendingFields.size) parts.push(`欄位待補：${[...pendingFields].join('、')}`);
      results.push(item('sales-incomplete', 'sales', '昨日回報待更新', `${parts.join('；')}。不計為零業績`, period, 'index.html', 'pending', summary.updatedAt));
    }
    return results;
  }

  function patrolCode(row) {
    return storeName(row && row.name) === '萬大' && row.code === 'DNB10xxx_wanda' ? 'DNB10168' : String(row && row.code || '');
  }

  function validGroup(group, expectedItems) {
    return Boolean(group && group.total === expectedItems.length && Number.isInteger(group.completed)
      && group.completed >= 0 && group.completed <= group.total && group.missing === group.total - group.completed
      && Array.isArray(group.missingItems) && group.missingItems.length === group.missing
      && new Set(group.missingItems).size === group.missing && group.missingItems.every(number => expectedItems.includes(number)));
  }

  function validCalendarDate(date) {
    if (!DATE_PATTERN.test(date)) return false;
    const parsed = new Date(`${date}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }

  function validVisits(visits, context) {
    const month = context.month;
    if (!visits || visits.target !== 2 || visits.minGapDays !== 7 || !Number.isInteger(visits.recordedVisits)
      || visits.recordedVisits < 0 || !Array.isArray(visits.dates) || visits.dates.length !== visits.recordedVisits
      || new Set(visits.dates).size !== visits.recordedVisits
      || visits.dates.some(date => !validCalendarDate(date) || date.slice(0, 7) !== month || date > context.today)) return false;
    const rows = visits.dates.map(date => ({ store:'contract', month, arriveTime:date }));
    const expected = Questions.visitCadence(rows, { name:'contract' }, month);
    return visits.qualifyingVisits === expected.qualifyingVisits && visits.completed === expected.completed;
  }

  function validatedPatrol(response, context) {
    if (!contextValid(context) || context.month < Questions.EFFECTIVE_MONTH || !response || response.status !== 'ok'
      || response.contract !== 'patrol-dashboard-sep25-v1' || response.version !== 1 || response.month !== context.month
      || response.storeCount !== 9 || response.maxRows !== 5000
      || !Number.isInteger(response.rowCount) || response.rowCount < 1 || response.rowCount > 5000
      || !Number.isInteger(response.sourceRowCount) || response.sourceRowCount < response.rowCount || response.sourceRowCount > 5000
      || JSON.stringify(response.months) !== JSON.stringify(context.bimonthly.months.filter(month => month <= context.month))) return null;
    const definitions = canonicalStoreMap(response.stores);
    const model = response.summary;
    const rows = canonicalStoreMap(model && model.stores);
    if (!definitions || !rows || model.month !== context.month || model.totalStores !== 9 || model.totalItems !== 25
      || JSON.stringify(model.window) !== JSON.stringify(context.bimonthly)) return null;
    for (const store of STORES) {
      const row = rows.get(store.name);
      if (patrolCode(definitions.get(store.name)) !== store.code || patrolCode(row) !== store.code
        || typeof row.visited !== 'boolean' || !validVisits(row.visits, context)
        || row.visited !== (row.visits.recordedVisits > 0)
        || !validGroup(row.monthly, Questions.SEP25_GROUPS.monthly)
        || !validGroup(row.bimonthly, Questions.SEP25_GROUPS.bimonthly)
        || !validGroup(row.ncc, Questions.SEP25_GROUPS.ncc)) return null;
      const missing = [...row.monthly.missingItems, ...row.bimonthly.missingItems, ...row.ncc.missingItems];
      if (!Array.isArray(row.missingItemNumbers) || JSON.stringify(row.missingItemNumbers) !== JSON.stringify(missing)
        || row.missingItems !== missing.length || row.done !== 25 - missing.length
        || row.questionsComplete !== (missing.length === 0)
        || row.status !== (!row.visited ? 'pending' : row.questionsComplete && row.visits.completed ? 'complete' : 'attention')) return null;
    }
    const all = [...rows.values()];
    const expectedCounts = {
      visitedStores:all.filter(row => row.visited).length,
      fullyDoneStores:all.filter(row => row.visited && row.status === 'complete').length,
      questionCompleteStores:all.filter(row => row.visited && row.questionsComplete).length,
      visitCadenceCompleteStores:all.filter(row => row.visited && row.visits.completed).length
    };
    if (Object.entries(expectedCounts).some(([key, value]) => model[key] !== value)) return null;
    // The source itself may legitimately have no new rows for several days.
    // Freshness is established by this read's generatedAt, never sourceUpdatedAt.
    try {
      if (!response.sourceVersion || !response.generatedAt || taipeiDate(response.generatedAt) !== context.today) return null;
    } catch (_) { return null; }
    return rows;
  }

  // Only compact session-protected ptdashboard is accepted. Legacy weekly or
  // 33-item summaries and partial raw-detail batches are deliberately rejected.
  function fromPatrol(response, context) {
    const rows = validatedPatrol(response, context);
    if (!rows) return pendingPatrol(context, '待更新：本期巡店正式資料尚未完整確認，請至 Liam 情報站檢查或重新整理。');
    const visits = STORES.filter(store => rows.get(store.name).visits.recordedVisits < 2)
      .map(store => `${store.name} ${rows.get(store.name).visits.recordedVisits}/2`);
    const inventory = STORES.filter(store => rows.get(store.name).bimonthly.missing === 1).map(store => store.name);
    const updatedAt = response.generatedAt;
    return [
      item('patrol-visits', 'patrol', '本月巡店未達 2 次', visits.length ? visits.join('、') : '九店均已記錄至少兩個到店日',
        context.month, 'patrol.html', visits.length ? 'warning' : 'ok', updatedAt),
      item('patrol-inventory', 'patrol', '本期雙月大盤未完成', inventory.length ? inventory.join('、') : '九店本期大盤皆已完成',
        `${context.month.slice(0, 4)} 年 ${context.bimonthly.label}（每兩月一次）`, 'patrol.html', inventory.length ? 'warning' : 'ok', updatedAt)
    ];
  }

  return Object.freeze({ STORES, dateContext, fromSales, fromPatrol, pendingItems });
});
