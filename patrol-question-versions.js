(function exposePatrolQuestionVersions(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PatrolQuestionVersions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildPatrolQuestionVersions() {
  'use strict';

  const EFFECTIVE_DATE = '2026-09-01';
  const EFFECTIVE_MONTH = '2026-09';
  const LEGACY_TOTAL = 33;
  const SEP25_TOTAL = 25;
  const MONTHLY_VISIT_TARGET = 2;
  const MIN_VISIT_GAP_DAYS = 7;

  const SEP25_ITEMS = Object.freeze([
    { no:1, group:'monthly', rule:'monthly', label:'每月執行1次', text:'督導打卡' },
    { no:2, group:'monthly', rule:'monthly', label:'每月執行1次', text:'(第一次巡檢)，1.檢查店格陳列(含招牌、布旗、中島、電視是否有聲音…等)2.展機、配件防盜功能皆正常 3.確認門市前後場環境整潔且無非公司商品' },
    { no:3, group:'monthly', rule:'monthly', label:'每月執行1次', text:'(第二次巡檢)，1.檢查店格陳列(含招牌、布旗、中島、電視是否有聲音…等)2.展機、配件防盜功能皆正常 3.確認門市前後場環境整潔且無非公司商品' },
    { no:4, group:'monthly', rule:'monthly', label:'每月執行1次', text:'每月1次，1.觀察同仁服裝儀容及服務過程是否熱情並符合規範2.人員出勤與班表一致並詳載休息時間' },
    { no:5, group:'monthly', rule:'monthly', label:'每月執行1次', text:'每月1次，人員面談及輔導（營業績管理重點指導、帳務缺失、客訴案件關懷輔導、遠端祕客查核常見缺失輔導、QIS…等）' },
    { no:6, group:'monthly', rule:'monthly', label:'每月執行1次', text:'每月1次，1.門市安全檢查:所有同仁不可於門市承租範圍抽菸及進行任何有火源的私人活動2.檢查門市現場/回放監控設備運作正常(須清晰不可模糊/麥克風須正常收音)' },
    { no:7, group:'monthly', rule:'monthly', label:'每月執行1次', text:'每月1次，抽查前台一台電腦及後場店長桌電腦是否含有個資並立即刪除；檢查紙本文件與電腦各資料夾及mail，含個資資料需加密；否則一律刪除；且上傳系統之文件，無須紙本回送，就地銷毀無須保留' },
    { no:8, group:'monthly', rule:'monthly', label:'每月執行1次', text:'每月1次，1.確認門市落實填寫店務日誌及安全衛生檢查表2.確認待銷毀文件以信封袋或紙袋打包歸檔(不可使用塑膠袋提醒迴紋針需移除)，上鎖於監視器可涵蓋範圍的文件櫃，並符合保存期限 3.檢查放置手機、平板、配件…等有價商品的櫃子是否有鑰匙' },
    { no:9, group:'monthly', rule:'monthly', label:'每月執行1次', text:'每月1次，保全金、零找金、當日營收現金盤點、查核金庫登記表' },
    { no:10, group:'bimonthly', rule:'bimonthly', label:'每2月執行1次', text:'2個月1次，督導到店全盤作業（含手機、配件、卡類…等POS所有庫存）並落實商品盤差登載' },
    { no:11, group:'ncc', rule:'monthly', label:'NCC每月宣導1次', text:'(以下15項NCC宣導每月1次) 請確認同仁知悉：國家通訊傳播委員會業於114年9月26日公布「電信事業提供電信服務風險管理機制指引」。' },
    { no:12, group:'ncc', rule:'monthly', label:'NCC每月宣導1次', text:'請確認同仁知悉：受理電信服務申請時，需檢核之證件包含申請人（法人及自然人）及其委託代理人，均應納入KYC審核。' },
    { no:13, group:'ncc', rule:'monthly', label:'NCC每月宣導1次', text:'請確認同仁知悉：申請人或其委託代理人拒絕提供相關資料、不配合者應拒絕其辦理。' },
    { no:14, group:'ncc', rule:'monthly', label:'NCC每月宣導1次', text:'請確認同仁知悉：公司已成立查核部門，並將每月辦理抽測查核。' },
    { no:15, group:'ncc', rule:'monthly', label:'NCC每月宣導1次', text:'請確認同仁知悉：自然人申請電信服務時，應出示雙證件正本供業者核對及留存影本或影像檔。雙證件規範須依行動寬頻服務契約辦理。' },
    { no:16, group:'ncc', rule:'monthly', label:'NCC每月宣導1次', text:'請確認同仁知悉：法人、團體或商號申請電信服務時，應出示法人代表人、團體代表人或商號負責人之身分證明文件正本、政府主管機關核發之法人證明文件、商業登記證明文件供業者核對及留存影本或影像檔。雙證件規範須依行動寬頻服務契約辦理。' },
    { no:17, group:'ncc', rule:'monthly', label:'NCC每月宣導1次', text:'請確認同仁知悉：法人、團體或商號申請以不得逾員工人數為原則。企業客戶應說明使用用途、製作使用清冊，以備查證，應實地查看經營業務與其申請門號及用途是否相符，相關實地查訪紀錄應以書面留存。' },
    { no:18, group:'ncc', rule:'monthly', label:'NCC每月宣導1次', text:'請確認同仁知悉：委託代理人申請辦理時，該代理人並應出示身分證正本及已得合法授權之資料或文件供核對及留存影本或影像檔。' },
    { no:19, group:'ncc', rule:'monthly', label:'NCC每月宣導1次', text:'請確認同仁知悉：初次申辦行動電信門號者，須臨櫃辦理，或以符合電子簽章法之數位簽章方式簽署，或派員親訪申辦。' },
    { no:20, group:'ncc', rule:'monthly', label:'NCC每月宣導1次', text:'請確認同仁知悉：對於初次申辦行動通信門號者應即時拍照留存。受理電信服務所保留的影本、照片或影像檔，應至少保存至服務契約終止後一年，以供查核。' },
    { no:21, group:'ncc', rule:'monthly', label:'NCC每月宣導1次', text:'請確認同仁知悉：非本國籍人士申辦30天內短效期預付卡，於採取相當風險管控措施下，始得不須現場拍照留存。' },
    { no:22, group:'ncc', rule:'monthly', label:'NCC每月宣導1次', text:'請確認同仁知悉：非本國籍人士申辦門號以1門為原則，申請逾1門者應說明使用目的並提出相關證明文件或切結書，應依KYC實質審核其用途及目的並予以酌核。' },
    { no:23, group:'ncc', rule:'monthly', label:'NCC每月宣導1次', text:'請確認同仁知悉：非本國籍人士提出簽證期日資料，倘申請人簽證期日少於1個月，僅能申辦提供30天內之短效期預付卡。' },
    { no:24, group:'ncc', rule:'monthly', label:'NCC每月宣導1次', text:'請確認同仁知悉：曾因使用或提供電信服務進行詐欺，受司法警察機關通知限制或停止電信服務之法人、非法人團體、商號，其代表人再以不同法人、非法人團體、商號之名義向同一電信事業申請電信服務時，該電信事業應於受限制或停止通知之日起三年內限制其至多申請一門用戶號碼或一項電信服務。但法人、非法人團體、商號仍有該電信事業提供之其他用戶號碼或電信服務時，電信事業於受限制或停止通知之日起三年內不得受理其申請。' },
    { no:25, group:'ncc', rule:'monthly', label:'NCC每月宣導1次', text:'請確認同仁知悉：受電信事業限制或停止電信服務之用戶，向同一電信事業再度申請電信服務時，該電信事業應於受限制或停止通知之日起三年內限制其至多申請一門用戶號碼或一項電信服務。但用戶仍有該電信事業提供之其他用戶號碼或電信服務時，電信事業於受限制或停止通知之日起三年內不得受理其申請。' }
  ].map(Object.freeze));

  const SEP25_BY_NO = Object.freeze(Object.fromEntries(SEP25_ITEMS.map(item => [item.no, item])));
  const SEP25_GROUPS = Object.freeze({
    monthly:Object.freeze(SEP25_ITEMS.filter(item => item.group === 'monthly').map(item => item.no)),
    bimonthly:Object.freeze(SEP25_ITEMS.filter(item => item.group === 'bimonthly').map(item => item.no)),
    ncc:Object.freeze(SEP25_ITEMS.filter(item => item.group === 'ncc').map(item => item.no))
  });

  function pad(value) { return String(value).padStart(2, '0'); }
  function rowIsoDate(row) {
    const raw = typeof row === 'string' ? row : String(row && (row.fillTime || row.arriveTime || row.date) || '');
    const match = raw.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    return match ? `${match[1]}-${pad(Number(match[2]))}-${pad(Number(match[3]))}` : '';
  }
  function rowVisitIsoDate(row) {
    if (typeof row === 'string') return rowIsoDate(row);
    return rowIsoDate(String(row && (row.arriveTime || row.fillTime || row.date) || ''));
  }
  function rowMonth(row) {
    const explicit = typeof row === 'object' ? String(row && row.month || '').slice(0, 7) : '';
    if (/^\d{4}-\d{2}$/.test(explicit)) return explicit;
    return rowIsoDate(row).slice(0, 7);
  }
  function isSep25Date(value) { const date = rowIsoDate(value); return Boolean(date && date >= EFFECTIVE_DATE); }
  function isSep25Month(month) { return /^\d{4}-\d{2}$/.test(String(month || '')) && String(month) >= EFFECTIVE_MONTH; }
  function totalForRow(row) { return isSep25Date(row) ? SEP25_TOTAL : LEGACY_TOTAL; }
  function itemAllowedForRow(row, item) {
    const number = Number(item);
    return Number.isInteger(number) && number >= 1 && number <= totalForRow(row);
  }
  function itemRangeLabelForRow(row) { return `1 至 ${totalForRow(row)}`; }

  function bimWindow(monthKey) {
    const [year, month] = String(monthKey || '').split('-').map(Number);
    if (!year || month < 1 || month > 12) return { months:[], label:'' };
    const start = month % 2 === 1 ? month : month - 1;
    return { months:[`${year}-${pad(start)}`, `${year}-${pad(start + 1)}`], label:`${start}–${start + 1}月` };
  }
  function normalizedStoreName(value) {
    return String(value || '').replace('台灣大哥大數位生活', '').replace(/^台北/, '').trim();
  }
  function rowsForStore(rows, store) {
    const code = String(store && store.code || '');
    const name = normalizedStoreName(store && (store.name || store.store));
    return (Array.isArray(rows) ? rows : []).filter(row =>
      (code && String(row && row.code || '') === code) || normalizedStoreName(row && row.store) === name
    );
  }
  function checked(row) {
    const result = String(row && row.result || '').trim().toLowerCase();
    const reason = String(row && row.reason || '').trim().toLowerCase();
    return result === 'v' || result === 'na' || reason === 'na';
  }
  function addIsoDays(value, days) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return '';
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }
  function isoDayGap(first, second) {
    const start = Date.parse(`${first}T00:00:00Z`);
    const end = Date.parse(`${second}T00:00:00Z`);
    return Number.isFinite(start) && Number.isFinite(end) ? Math.round((end - start) / 86400000) : 0;
  }
  function visitCadence(rows, store, month) {
    const dates = [...new Set(rowsForStore(rows, store)
      .filter(row => rowMonth(row) === month)
      .map(rowVisitIsoDate)
      .filter(Boolean))].sort();
    const firstVisit = dates[0] || '';
    const nextEligibleDate = firstVisit ? addIsoDays(firstVisit, MIN_VISIT_GAP_DAYS) : '';
    const secondVisit = firstVisit ? (dates.find(date => isoDayGap(firstVisit, date) >= MIN_VISIT_GAP_DAYS) || '') : '';
    const gapDays = secondVisit ? isoDayGap(firstVisit, secondVisit) : 0;
    return {
      target:MONTHLY_VISIT_TARGET,
      minGapDays:MIN_VISIT_GAP_DAYS,
      recordedVisits:dates.length,
      qualifyingVisits:secondVisit ? MONTHLY_VISIT_TARGET : (firstVisit ? 1 : 0),
      completed:Boolean(secondVisit),
      firstVisit,
      secondVisit,
      nextEligibleDate,
      gapDays,
      dates
    };
  }
  function itemStatus(rows, month, itemNo) {
    const item = SEP25_BY_NO[itemNo];
    if (!item) return { status:'miss' };
    const relevantMonths = item.rule === 'bimonthly' ? bimWindow(month).months : [month];
    const match = (Array.isArray(rows) ? rows : []).find(row =>
      Number(row && row.item) === item.no && relevantMonths.includes(rowMonth(row)) && checked(row)
    );
    return match ? { status:'done', date:rowIsoDate(match) } : {
      status:'miss', detail:item.rule === 'bimonthly' ? `本期(${bimWindow(month).label})未完成` : item.label
    };
  }
  function groupProgress(rows, month, itemNumbers) {
    const items = itemNumbers.map(no => ({ no, ...itemStatus(rows, month, no) }));
    const completed = items.filter(item => item.status === 'done').length;
    return { completed, total:items.length, missing:items.length - completed, missingItems:items.filter(item => item.status !== 'done').map(item => item.no) };
  }
  function storeSummary(rows, store, month) {
    const storeRows = rowsForStore(rows, store);
    const currentRows = storeRows.filter(row => rowMonth(row) === month);
    const visits = visitCadence(rows, store, month);
    const monthly = groupProgress(storeRows, month, SEP25_GROUPS.monthly);
    const bimonthly = groupProgress(storeRows, month, SEP25_GROUPS.bimonthly);
    const ncc = groupProgress(storeRows, month, SEP25_GROUPS.ncc);
    const missingItemNumbers = [...monthly.missingItems, ...bimonthly.missingItems, ...ncc.missingItems];
    const done = SEP25_TOTAL - missingItemNumbers.length;
    const visited = currentRows.length > 0;
    const questionsComplete = missingItemNumbers.length === 0;
    const dates = currentRows.map(rowIsoDate).filter(Boolean).sort();
    return {
      name:String(store && (store.name || store.store) || ''), code:String(store && store.code || ''), visited,
      done, missingItems:missingItemNumbers.length, missingItemNumbers, pct:Math.round(done / SEP25_TOTAL * 100),
      status:visited ? (questionsComplete && visits.completed ? 'complete' : 'attention') : 'pending',
      questionsComplete, visits,
      lastVisit:dates.at(-1) || '', monthly, bimonthly, ncc
    };
  }
  function overview(rows, configuredStores, month) {
    if (!isSep25Month(month)) throw new Error('sep25_overview_requires_2026_09_or_later');
    const stores = (Array.isArray(configuredStores) ? configuredStores : []).map(store => storeSummary(rows, store, month));
    const visited = stores.filter(store => store.visited);
    return {
      month, totalStores:stores.length, visitedStores:visited.length,
      fullyDoneStores:visited.filter(store => store.status === 'complete').length,
      questionCompleteStores:visited.filter(store => store.questionsComplete).length,
      visitCadenceCompleteStores:visited.filter(store => store.visits.completed).length,
      totalMissingItems:visited.reduce((sum, store) => sum + store.missingItems, 0),
      unvisitedStores:stores.filter(store => !store.visited).map(store => store.name),
      stores, groups:SEP25_GROUPS, window:bimWindow(month), totalItems:SEP25_TOTAL
    };
  }

  return Object.freeze({
    EFFECTIVE_DATE, EFFECTIVE_MONTH, LEGACY_TOTAL, SEP25_TOTAL, MONTHLY_VISIT_TARGET, MIN_VISIT_GAP_DAYS,
    SEP25_ITEMS, SEP25_BY_NO, SEP25_GROUPS,
    rowIsoDate, rowVisitIsoDate, rowMonth, isSep25Date, isSep25Month, totalForRow, itemAllowedForRow, itemRangeLabelForRow,
    bimWindow, itemStatus, groupProgress, visitCadence, storeSummary, overview
  });
});
