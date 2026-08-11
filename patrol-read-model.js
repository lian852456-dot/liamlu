(function exposePatrolReadModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PatrolReadModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildPatrolReadModel() {
  'use strict';

  const ITEM_RULES = {};
  for (let item = 1; item <= 33; item += 1) {
    if (item === 1) ITEM_RULES[item] = { type:'station', label:'駐點' };
    else if (item <= 13) ITEM_RULES[item] = { type:'twice', label:'上下月各1次' };
    else if (item <= 17) ITEM_RULES[item] = { type:'monthly', label:'每月1次' };
    else if (item === 18) ITEM_RULES[item] = { type:'bimonthly', label:'2月1次' };
    else ITEM_RULES[item] = { type:'monthly', label:'每月1次' };
  }
  Object.freeze(ITEM_RULES);

  function pad(value) { return String(value).padStart(2, '0'); }

  function rebuildFromRaw(rawDetails) {
    const records = {};
    (Array.isArray(rawDetails) ? rawDetails : []).forEach(item => {
      const match = String(item && item.fillTime || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
      if (!match || !item || !item.store) return;
      const day = Number(match[3]);
      const store = String(item.store);
      const code = String(item.code || '');
      if (!records[store]) records[store] = { code, entries:[] };
      if (code && !records[store].code) records[store].code = code;
      records[store].entries.push({
        month:String(item.month || `${match[1]}-${pad(Number(match[2]))}`),
        date:`${match[1]}/${Number(match[2])}/${day}`,
        half:day <= 15 ? 'H1' : 'H2',
        item:Number(item.item),
        result:String(item.result || '').toLowerCase()
      });
    });
    return records;
  }

  function bimWindow(monthKey) {
    const [year, month] = String(monthKey).split('-').map(Number);
    const start = month % 2 === 1 ? month : month - 1;
    return { months:[`${year}-${pad(start)}`, `${year}-${pad(start + 1)}`], label:`${start}–${start + 1}月` };
  }

  function prevBimWindow(monthKey) {
    const [year, month] = String(monthKey).split('-').map(Number);
    const start = month % 2 === 1 ? month : month - 1;
    return start === 1 ? bimWindow(`${year - 1}-11`) : bimWindow(`${year}-${pad(start - 2)}`);
  }

  function itemStatus(records, currentMonth, storeName, itemNo) {
    const record = records && records[storeName];
    const rule = ITEM_RULES[itemNo];
    if (!record || !rule) return { status:'miss' };
    const monthEntries = record.entries.filter(entry => entry.month === currentMonth && entry.item === Number(itemNo));
    if (!monthEntries.length && rule.type !== 'bimonthly') return { status:'miss' };
    if (rule.type === 'station') return { status:'done' };
    if (rule.type === 'twice') {
      const first = monthEntries.some(entry => entry.half === 'H1' && entry.result === 'v');
      const second = monthEntries.some(entry => entry.half === 'H2' && entry.result === 'v');
      if (first && second) return { status:'done' };
      if (first || second) return { status:'miss', detail:first ? '缺下半月' : '缺上半月' };
      return { status:'miss', detail:'上下半月皆缺' };
    }
    if (rule.type === 'monthly') return monthEntries.some(entry => entry.result === 'v') ? { status:'done' } : { status:'miss' };
    const window = bimWindow(currentMonth);
    const complete = record.entries.some(entry => window.months.includes(entry.month) && entry.item === Number(itemNo) && entry.result === 'v');
    return complete ? { status:'done' } : { status:'miss', detail:`本期(${window.label})未完成` };
  }

  function storeSummary(records, currentMonth, storeName) {
    let done = 0;
    let miss = 0;
    const missItems = [];
    for (let item = 1; item <= 33; item += 1) {
      const state = itemStatus(records, currentMonth, storeName, item);
      if (state.status === 'done') done += 1;
      else {
        miss += 1;
        missItems.push({ no:item, detail:state.detail });
      }
    }
    return { done, miss, total:33, missItems, pct:Math.round(done / 33 * 100) };
  }

  function findRecordStore(records, store) {
    const target = store || {};
    const name = String(target.name || target.store || '');
    const shortName = name.replace('台北', '');
    return Object.keys(records || {}).find(recordName =>
      (target.code && records[recordName].code === String(target.code)) ||
      recordName.includes(shortName) || name.includes(recordName)
    ) || null;
  }

  function entryIsoDate(entry) {
    const match = String(entry && entry.date || '').match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    return match ? `${match[1]}-${pad(Number(match[2]))}-${pad(Number(match[3]))}` : '';
  }

  function rowIsoDate(row) {
    const value = String(row && (row.arriveTime || row.fillTime) || '');
    const match = value.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    return match ? `${match[1]}-${pad(Number(match[2]))}-${pad(Number(match[3]))}` : '';
  }

  function rowMonth(row) {
    const explicit = String(row && row.month || '').slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(explicit)) return explicit;
    return rowIsoDate(row).slice(0, 7);
  }

  function rowsForStore(rawRows, store, records) {
    const recordName = findRecordStore(records, store);
    if (!recordName) return [];
    const code = String(store && store.code || '');
    return (Array.isArray(rawRows) ? rawRows : []).filter(row =>
      (code && String(row && row.code || '') === code) || String(row && row.store || '') === recordName
    );
  }

  function visitSummary(rawRows, configuredStores, currentMonth) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const stores = (Array.isArray(configuredStores) ? configuredStores : []).map(store => typeof store === 'string' ? { name:store } : store);
    const records = rebuildFromRaw(rows);
    const visits = [];
    const storeCounts = stores.map(store => {
      const grouped = new Map();
      rowsForStore(rows, store, records).forEach(row => {
        const date = rowIsoDate(row);
        if (!date || rowMonth(row) !== currentMonth) return;
        if (!grouped.has(date)) grouped.set(date, []);
        grouped.get(date).push(row);
      });
      grouped.forEach((visitRows, date) => {
        const byItem = new Map();
        visitRows.forEach(row => {
          const item = Number(row && row.item);
          if (item >= 1 && item <= 33) byItem.set(item, String(row && row.result || '').toLowerCase());
        });
        const missing = [...byItem].filter(([item, result]) => ITEM_RULES[item].type !== 'station' && result !== 'v').map(([item]) => item);
        visits.push({
          date,
          store:String(store.name || store.store || ''),
          complete:byItem.size > 0 && missing.length === 0,
          missingItems:missing.length,
          missingItemNumbers:missing
        });
      });
      return {
        name:String(store.name || store.store || ''),
        count:grouped.size,
        basis:'unique-store-date',
        sameDayMultipleVisitsDistinguishable:false
      };
    });
    visits.sort((left, right) => right.date.localeCompare(left.date) || left.store.localeCompare(right.store));
    return { storeCounts, recent:visits.slice(0, 10), basis:'unique-store-date', sameDayMultipleVisitsDistinguishable:false };
  }

  function inventoryProgress(records, configuredStores, currentMonth) {
    const stores = (Array.isArray(configuredStores) ? configuredStores : []).map(store => typeof store === 'string' ? { name:store } : store);
    const items = [14, 15, 16, 17];
    const rows = stores.map(store => {
      const recordName = findRecordStore(records, store);
      const states = {};
      items.forEach(item => { states[item] = Boolean(recordName && itemStatus(records, currentMonth, recordName, item).status === 'done'); });
      return { name:String(store.name || store.store || ''), items:states, complete:items.every(item => states[item]) };
    });
    return { items, completedStores:rows.filter(row => row.complete).length, total:rows.length, stores:rows };
  }

  function item18Progress(records, configuredStores, currentMonth) {
    const stores = (Array.isArray(configuredStores) ? configuredStores : []).map(store => typeof store === 'string' ? { name:store } : store);
    const window = bimWindow(currentMonth);
    const previousWindow = prevBimWindow(currentMonth);
    const rows = stores.map(store => {
      const recordName = findRecordStore(records, store);
      const entries = recordName ? records[recordName].entries.filter(entry => entry.item === 18 && entry.result === 'v') : [];
      const current = entries.find(entry => window.months.includes(entry.month));
      const previous = entries.find(entry => previousWindow.months.includes(entry.month));
      return {
        name:String(store.name || store.store || ''),
        current:{ done:Boolean(current), date:current ? entryIsoDate(current) : '' },
        previous:{ done:Boolean(previous), date:previous ? entryIsoDate(previous) : '' }
      };
    });
    return { window, previousWindow, completedStores:rows.filter(row => row.current.done).length, total:rows.length, stores:rows };
  }

  function awarenessProgress(records, currentMonth, storeName, now) {
    const record = records && records[storeName];
    const completionDays = [];
    let count = 0;
    for (let item = 19; item <= 33; item += 1) {
      const days = (record ? record.entries : [])
        .filter(entry => entry.month === currentMonth && entry.item === item && entry.result === 'v')
        .map(entry => Number(String(entry.date).split('/')[2]))
        .filter(Number.isFinite);
      if (days.length) {
        count += 1;
        completionDays.push(Math.min(...days));
      }
    }
    const all = count === 15;
    const completedDay = all ? Math.max(...completionDays) : null;
    const today = now instanceof Date ? now : new Date(now || Date.now());
    const realMonth = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
    const daysLeft = 20 - today.getDate();
    let status = 'not_complete';
    if (all) status = completedDay <= 20 ? 'complete' : 'late';
    else if (currentMonth === realMonth) status = daysLeft >= 0 ? 'due' : 'overdue';
    return { count, total:15, all, completedDay, status, daysLeft:currentMonth === realMonth ? daysLeft : null };
  }

  function daysSinceDate(dateValue, now) {
    if (!dateValue) return null;
    const end = Date.parse(`${dateValue}T00:00:00+08:00`);
    const current = now instanceof Date ? now.getTime() : new Date(now || Date.now()).getTime();
    return Number.isFinite(end) && Number.isFinite(current) ? Math.max(0, Math.floor((current - end) / 86400000)) : null;
  }

  function overview(rawRows, configuredStores, currentMonth, now) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const stores = (Array.isArray(configuredStores) ? configuredStores : []).map(store => typeof store === 'string' ? { name:store } : store);
    const records = rebuildFromRaw(rows);
    const visitedRecordNames = Object.keys(records).filter(name => records[name].entries.some(entry => entry.month === currentMonth));
    const storeRows = stores.map(store => {
      const recordName = findRecordStore(records, store);
      const visited = Boolean(recordName && records[recordName].entries.some(entry => entry.month === currentMonth));
      const summary = recordName ? storeSummary(records, currentMonth, recordName) : { done:0, miss:33, total:33, missItems:Array.from({ length:33 }, (_, index) => ({ no:index + 1 })), pct:0 };
      const dates = recordName ? records[recordName].entries.map(entryIsoDate).filter(Boolean).sort() : [];
      const lastVisit = dates.at(-1) || '';
      const awareness = recordName ? awarenessProgress(records, currentMonth, recordName, now) : { count:0, total:15, all:false, completedDay:null, status:'not_complete', daysLeft:null };
      const item18 = recordName ? itemStatus(records, currentMonth, recordName, 18) : { status:'miss', detail:`本期(${bimWindow(currentMonth).label})未完成` };
      return {
        name:String(store.name || store.store || recordName || ''), code:String(store.code || ''), recordName, visited,
        done:summary.done, missingItems:summary.miss, missingItemNumbers:summary.missItems.map(item => item.no),
        lastVisit, daysSince:daysSinceDate(lastVisit, now),
        status:visited ? (summary.miss ? 'attention' : 'complete') : 'pending',
        result:visited ? (summary.miss ? `缺 ${summary.miss} 項` : '全項完成') : '本月未巡',
        item18, awareness
      };
    });
    const visited = visitedRecordNames.length;
    const fullyDone = visitedRecordNames.filter(name => storeSummary(records, currentMonth, name).miss === 0).length;
    const totalMissingItems = visitedRecordNames.reduce((sum, name) => sum + storeSummary(records, currentMonth, name).miss, 0);
    const unvisited = storeRows.filter(store => !store.visited).map(store => store.name);
    const attention = storeRows.filter(store => store.status === 'attention').map(store => store.name);
    const visits = visitSummary(rows, stores, currentMonth);
    const inventory = inventoryProgress(records, stores, currentMonth);
    const item18ProgressData = item18Progress(records, stores, currentMonth);
    return {
      currentMonth, statisticsPeriod:`${currentMonth.replace('-', ' 年 ')} 月`, periodVerified:true,
      visited, total:stores.length, expected:stores.length, remaining:unvisited.length,
      completionRate:stores.length ? visited / stores.length : 0,
      fullyDone, totalMissingItems, unvisited, attention, attentionCount:attention.length,
      stores:storeRows, recent:visits.recent, visitCounts:visits.storeCounts,
      visitCountBasis:visits.basis, sameDayMultipleVisitsDistinguishable:visits.sameDayMultipleVisitsDistinguishable,
      inventory, item18Progress:item18ProgressData, records,
      item18Window:bimWindow(currentMonth), awarenessDeadlineDay:20
    };
  }

  return Object.freeze({
    ITEM_RULES, rebuildFromRaw, itemStatus, storeSummary, findRecordStore,
    bimWindow, prevBimWindow, awarenessProgress, visitSummary, inventoryProgress, item18Progress, overview
  });
});
