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

  function dashboardProgress(rows, expectedItems) {
    const source = Array.isArray(rows) ? rows : [];
    const done = item => source.some(row => Number(row && row.item) === item && String(row && row.result || '').toLowerCase() === 'v');
    const abnormal = item => !done(item) && source.some(row => {
      const reason = String(row && row.reason || '').trim();
      return Number(row && row.item) === item && reason && !/^na$/i.test(reason);
    });
    const completed = expectedItems.filter(done).length;
    const issues = expectedItems.filter(abnormal).length;
    const missing = expectedItems.length - completed;
    return {
      completed, total:expectedItems.length, missing, issues,
      status:issues ? 'issue' : missing ? 'miss' : 'done'
    };
  }

  // Existing patrol.html dashboard semantics, represented as a compact server-ready contract.
  function halfDashboardSummary(rawRows, configuredStores, currentMonth) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const stores = (Array.isArray(configuredStores) ? configuredStores : []).map(store => typeof store === 'string' ? { name:store } : store);
    const records = rebuildFromRaw(rows);
    const visits = visitSummary(rows, stores, currentMonth);
    const visitCount = new Map(visits.storeCounts.map(row => [row.name, row.count]));
    const window = bimWindow(currentMonth);
    const twiceItems = Array.from({ length:12 }, (_, index) => index + 2);
    const monthlyItems = [14, 15, 16, 17];
    const storeRows = stores.map(store => {
      const storeName = String(store.name || store.store || '');
      const sourceRows = rowsForStore(rows, store, records);
      const monthRows = sourceRows.filter(row => rowMonth(row) === currentMonth);
      const h1Rows = monthRows.filter(row => {
        const match = String(row && row.fillTime || '').match(/\d{4}\/\d{1,2}\/(\d{1,2})/);
        return match && Number(match[1]) <= 15;
      });
      const h2Rows = monthRows.filter(row => {
        const match = String(row && row.fillTime || '').match(/\d{4}\/\d{1,2}\/(\d{1,2})/);
        return match && Number(match[1]) > 15;
      });
      const checkedItems = new Set(monthRows.filter(row => {
        const reason = String(row && row.reason || '').trim();
        return String(row && row.result || '').toLowerCase() === 'v' || /^na$/i.test(reason);
      }).map(row => Number(row && row.item)).filter(item => item >= 1 && item <= 33)).size;
      return {
        store:storeName,
        h1:dashboardProgress(h1Rows, twiceItems),
        h2:dashboardProgress(h2Rows, twiceItems),
        inventory14to17:dashboardProgress(monthRows, monthlyItems),
        item18:dashboardProgress(sourceRows.filter(row => window.months.includes(rowMonth(row))), [18]),
        visitCount:visitCount.get(storeName) || 0,
        checkedItems,
        eligibleForIssues:checkedItems >= 10 && (visitCount.get(storeName) || 0) > 4
      };
    });
    const completed = key => storeRows.filter(store => store[key].status === 'done').length;
    const abnormalItems = storeRows.filter(store => store.eligibleForIssues).reduce((sum, store) =>
      sum + store.h1.issues + store.h2.issues + store.inventory14to17.issues + store.item18.issues, 0);
    return {
      month:currentMonth, window,
      completedH1Stores:completed('h1'), completedH2Stores:completed('h2'),
      completedInventoryStores:completed('inventory14to17'), completedItem18Stores:completed('item18'),
      abnormalItems, stores:storeRows
    };
  }

  function halfMonthPeriod(dateValue) {
    const match = String(dateValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    if (!year || month < 1 || month > 12 || day < 1 || day > lastDay) return null;
    const half = day <= 15 ? 'H1' : 'H2';
    const startDay = half === 'H1' ? 1 : 16;
    const endDay = half === 'H1' ? 15 : lastDay;
    return {
      date:`${year}-${pad(month)}-${pad(day)}`,
      month:`${year}-${pad(month)}`,
      year,
      monthNumber:month,
      half,
      label:half === 'H1' ? '上半月' : '下半月',
      startDay,
      endDay,
      subtitle:`${year} 年 ${pad(month)} 月｜${half === 'H1' ? '上半月' : '下半月'} ${month}/${startDay}–${month}/${endDay}`
    };
  }

  function halfMonthProgress(summary, dateValue) {
    const source = summary && typeof summary === 'object' ? summary : {};
    const period = halfMonthPeriod(dateValue);
    const sourceMonth = String(source.currentMonth || source.month || '');
    const stores = Array.isArray(source.stores) ? source.stores : [];
    const dashboard = source.halfDashboard && Array.isArray(source.halfDashboard.stores)
      ? source.halfDashboard.stores : [];
    const total = Number(source.totalStores != null ? source.totalStores : (source.total != null ? source.total : stores.length));
    if (!period || source.periodVerified !== true || sourceMonth !== period.month || !Number.isInteger(total) || total < 1 || stores.length !== total || dashboard.length !== total) {
      return { verified:false, period, reason:'half-month patrol summary is incomplete' };
    }

    const names = stores.map(store => String(store && (store.name || store.store) || ''));
    if (names.some(name => !name) || new Set(names).size !== total) {
      return { verified:false, period, reason:'half-month patrol stores are incomplete' };
    }
    const knownNames = new Set(names);
    const completedByHalf = { H1:new Set(), H2:new Set() };

    const dashboardByStore = new Map();
    dashboard.forEach(store => {
      const name = String(store && (store.store || store.name) || '');
      dashboardByStore.set(name, store);
      ['H1', 'H2'].forEach(half => {
        const state = store && store[half.toLowerCase()];
        const hasInspectionEvidence = state && (
          state.status === 'done' || Number(state.completed || 0) > 0 || Number(state.issues || 0) > 0
        );
        if (knownNames.has(name) && hasInspectionEvidence) completedByHalf[half].add(name);
      });
    });
    if (dashboardByStore.size !== total || names.some(name => !dashboardByStore.has(name))) {
      return { verified:false, period, reason:'half-month patrol dashboard stores do not align' };
    }

    const currentKey = period.half.toLowerCase();
    const currentStates = names.map(name => dashboardByStore.get(name)[currentKey]);
    if (currentStates.some(state => !state || !Number.isFinite(Number(state.missing)))) {
      return { verified:false, period, reason:'half-month patrol item progress is incomplete' };
    }
    const inventorySource = source.inventory14to17 || source.inventory;
    const item18Source = source.item18 || source.item18Progress;
    const awarenessSource = source.items19to33;
    const inventoryRows = inventorySource && Array.isArray(inventorySource.stores) ? inventorySource.stores : [];
    const item18Rows = item18Source && Array.isArray(item18Source.stores) ? item18Source.stores : [];
    const awarenessRows = awarenessSource && Array.isArray(awarenessSource.stores) ? awarenessSource.stores : [];
    const rowMap = (rows, key) => new Map(rows.map(row => [String(row && (row[key] || row.name || row.store) || ''), row]));
    const inventoryByStore = rowMap(inventoryRows, 'name');
    const item18ByStore = rowMap(item18Rows, 'name');
    const awarenessByStore = rowMap(awarenessRows, 'store');
    if ([inventoryByStore, item18ByStore, awarenessByStore].some(map => map.size !== total || names.some(name => !map.has(name)))) {
      return { verified:false, period, reason:'active-cycle patrol rules do not align' };
    }
    const currentVisited = completedByHalf[period.half];
    const h1Completed = completedByHalf.H1.size;
    const h2Completed = completedByHalf.H2.size;
    const currentCompleted = currentVisited.size;
    const activeMissingByStore = names.map(name => {
      const halfState = dashboardByStore.get(name)[currentKey];
      const inventory = inventoryByStore.get(name);
      const item18 = item18ByStore.get(name);
      const awareness = awarenessByStore.get(name);
      const inventoryItems = inventory && inventory.items || {};
      const inventoryMissing = [14, 15, 16, 17].filter(item => inventoryItems[item] !== true).length;
      const awarenessTotal = Number(awareness && awareness.total);
      const awarenessCount = Number(awareness && awareness.count);
      if (!Number.isFinite(awarenessTotal) || !Number.isFinite(awarenessCount)) return null;
      return (currentVisited.has(name) ? 0 : 1) + Number(halfState.missing) + inventoryMissing + (item18 && item18.current && item18.current.done ? 0 : 1) + Math.max(0, awarenessTotal - awarenessCount);
    });
    if (activeMissingByStore.some(value => value == null || !Number.isFinite(value))) {
      return { verified:false, period, reason:'active-cycle patrol item progress is incomplete' };
    }
    const currentFullyDone = activeMissingByStore.filter(value => value === 0).length;
    const currentMissingItems = activeMissingByStore.reduce((sum, value) => sum + value, 0);
    return {
      verified:true,
      period,
      total,
      currentCompleted,
      currentRemaining:Math.max(0, total - currentCompleted),
      currentRate:currentCompleted / total,
      currentFullyDone,
      currentMissingItems,
      currentUnvisited:names.filter(name => !currentVisited.has(name)),
      h1Completed,
      h2Completed,
      wholeCompleted:h1Completed + h2Completed,
      wholeTotal:total * 2
    };
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

  // Stable read-only transport contract shared by the App, patrol.html and GAS parity tests.
  // All business calculations remain in overview(); this function only renames/shapes fields.
  function summaryContract(rawRows, configuredStores, currentMonth, now, metadata) {
    const model = overview(rawRows, configuredStores, currentMonth, now);
    const meta = metadata && typeof metadata === 'object' ? metadata : {};
    const awarenessStores = model.stores.map(store => ({
      store:store.name,
      count:store.awareness.count,
      total:store.awareness.total,
      completedDay:store.awareness.completedDay,
      status:store.awareness.status,
      daysLeft:store.awareness.daysLeft
    }));
    return {
      month:model.currentMonth,
      statisticsPeriod:model.statisticsPeriod,
      periodVerified:model.periodVerified,
      totalStores:model.total,
      visitedStores:model.visited,
      unvisitedStores:model.unvisited.slice(),
      completionRate:model.completionRate,
      fullyDoneStores:model.fullyDone,
      totalMissingItems:model.totalMissingItems,
      attentionStores:model.attention.slice(),
      item18:{
        window:model.item18Progress.window,
        previousWindow:model.item18Progress.previousWindow,
        completedStores:model.item18Progress.completedStores,
        total:model.item18Progress.total,
        stores:model.item18Progress.stores
      },
      inventory14to17:model.inventory,
      items19to33:{
        deadlineDay:model.awarenessDeadlineDay,
        completedStores:awarenessStores.filter(store => store.count === store.total).length,
        total:model.total,
        stores:awarenessStores
      },
      halfDashboard:halfDashboardSummary(rawRows, configuredStores, currentMonth),
      visitCounts:model.visitCounts.map(row => ({
        store:row.name,
        count:row.count,
        basis:row.basis,
        sameDayMultipleVisitsDistinguishable:row.sameDayMultipleVisitsDistinguishable
      })),
      recentVisits:model.recent,
      stores:model.stores,
      visitCountBasis:model.visitCountBasis,
      sameDayMultipleVisitsDistinguishable:model.sameDayMultipleVisitsDistinguishable,
      sourceVersion:String(meta.sourceVersion || ''),
      sourceUpdatedAt:String(meta.sourceUpdatedAt || ''),
      generatedAt:String(meta.generatedAt || '')
    };
  }

  return Object.freeze({
    ITEM_RULES, rebuildFromRaw, itemStatus, storeSummary, findRecordStore,
    bimWindow, prevBimWindow, awarenessProgress, visitSummary, inventoryProgress, item18Progress,
    dashboardProgress, halfDashboardSummary, halfMonthPeriod, halfMonthProgress, overview, summaryContract
  });
});
