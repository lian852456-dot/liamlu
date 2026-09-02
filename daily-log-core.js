(function exposeDailyLogCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DailyLogCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function buildDailyLogCore() {
  'use strict';

  const STORES = Object.freeze([
    '台北酒泉', '台北永吉', '台北復興南', '台北杭州南', '台北萬大',
    '台北通化', '台北大稻埕', '台北三創', '台北六張犁'
  ]);

  const FIELD_ALIASES = Object.freeze({
    store: ['店點', '門市', '營業點', '檢查店點'],
    submitter: ['填寫人員', '填表人員', '填寫者', '檢查人員'],
    submittedAt: ['填寫時間', '填表時間', '最後填寫日期', '完成時間'],
    formName: ['檢查項目', '表單名稱', '檢查表', '檢查表名稱'],
    status: ['處理狀態', '完成狀態', '狀態'],
    section: ['大項名稱', '大項', '分類'],
    itemText: ['細項名稱', '檢查內容', '細項', '題目', '項目內容']
  });

  const REQUIRED_FIELDS = Object.freeze(['store', 'formName', 'status', 'itemText']);
  const CALENDAR_FIELD_ALIASES = Object.freeze({
    date:['檢查日期', '日期'],
    store:['店點名稱', '店點', '門市名稱', '門市'],
    storeCode:['營業點代碼', '店點代碼', '門市代碼'],
    submitter:['檢查人員', '填寫人員', '填表人員'],
    submittedAt:['填寫時間', '完成時間'],
    status:['處理狀態', '完成狀態', '狀態']
  });

  const FORM_DEFINITIONS = Object.freeze([
    { id:'calendar', cadence:'daily', label:'店務行事曆', shortLabel:'行事曆', dueLabel:'每日' },
    { id:'opening', cadence:'daily', label:'每日營業前檢查表', shortLabel:'營業前', dueLabel:'每日' },
    { id:'midday', cadence:'daily', label:'每日營業中檢查表', shortLabel:'營業中', dueLabel:'每日' },
    { id:'closing', cadence:'daily', label:'每日打烊後檢查表', shortLabel:'打烊後', dueLabel:'每日' },
    { id:'environment-w1', cadence:'weekly', week:1, label:'門市環境檢查表（第一週）', shortLabel:'第一週', dueLabel:'第一週週日前' },
    { id:'environment-w2', cadence:'weekly', week:2, label:'門市環境檢查表（第二週）', shortLabel:'第二週', dueLabel:'第二週週日前' },
    { id:'environment-w3', cadence:'weekly', week:3, label:'門市環境檢查表（第三週）', shortLabel:'第三週', dueLabel:'第三週週日前' },
    { id:'environment-w4', cadence:'weekly', week:4, label:'門市環境檢查表（第四週）', shortLabel:'第四週', dueLabel:'第四週週日前' },
    { id:'inventory', cadence:'monthly', dueDay:1, label:'重要店務物品清點表', shortLabel:'物品清點', dueLabel:'每月 1 日' },
    { id:'security', cadence:'monthly', dueDay:10, label:'資安個資檢查表', shortLabel:'資安個資', dueLabel:'每月 10 日' }
  ]);

  function text(value) { return String(value == null ? '' : value).trim(); }
  function pad(value) { return String(value).padStart(2, '0'); }
  function normalizeHeader(value) {
    return text(value).replace(/^\uFEFF/, '').replace(/[\s　_＿：:()（）／/\-]+/g, '').toLowerCase();
  }

  function aliasIndex(row, aliases) {
    const normalized = (Array.isArray(row) ? row : []).map(normalizeHeader);
    return normalized.findIndex(value => aliases.some(alias => value === normalizeHeader(alias)));
  }

  function detectHeader(matrix, maxRows) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const limit = Math.min(rows.length, Number(maxRows || 40));
    let best = null;
    for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
      const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
      const map = {};
      let hits = 0;
      Object.keys(FIELD_ALIASES).forEach(field => {
        const index = aliasIndex(row, FIELD_ALIASES[field]);
        if (index >= 0) { map[field] = index; hits += 1; }
      });
      const requiredHits = REQUIRED_FIELDS.filter(field => Number.isInteger(map[field])).length;
      const score = requiredHits * 100 + hits;
      if (requiredHits === REQUIRED_FIELDS.length && (!best || score > best.score)) {
        best = { rowIndex, map, hits, requiredHits, score };
      }
    }
    return best;
  }

  function excelSerialToDate(serial, date1904) {
    const numeric = Number(serial);
    if (!Number.isFinite(numeric)) return '';
    const epoch = Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30);
    const date = new Date(epoch + Math.round(numeric * 86400000));
    if (Number.isNaN(date.getTime())) return '';
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  }

  function normalizeDate(value, options) {
    const settings = options || {};
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return excelSerialToDate(value, Boolean(settings.date1904));
    let raw = text(value);
    if (!raw) return '';
    if (/^\d{5}(?:\.\d+)?$/.test(raw)) return excelSerialToDate(Number(raw), Boolean(settings.date1904));
    raw = raw.replace(/[年\.]/g, '-').replace(/月/g, '-').replace(/日/g, ' ')
      .replace(/[／/]/g, '-').replace(/[ＴT]/g, ' ').replace(/[\s　]+/g, ' ').trim();
    const match = raw.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
    if (!match) return '';
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const check = new Date(Date.UTC(year, month - 1, day));
    if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return '';
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  function normalizeDateTime(value, options) {
    const date = normalizeDate(value, options);
    if (!date) return '';
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${date} ${pad(value.getHours())}:${pad(value.getMinutes())}`;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      const fraction = Math.abs(value % 1);
      if (fraction < 1e-9) return date;
      const minutes = Math.round(fraction * 1440) % 1440;
      return `${date} ${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
    }
    const raw = text(value).replace(/[：]/g, ':');
    const timeMatch = raw.match(/(?:\s|T)(\d{1,2}):(\d{1,2})/i);
    return timeMatch ? `${date} ${pad(Number(timeMatch[1]))}:${pad(Number(timeMatch[2]))}` : date;
  }

  function canonicalStore(value) {
    const key = normalizeHeader(value)
      .replace(/台灣大哥大/g, '')
      .replace(/數位生活/g, '')
      .replace(/直營/g, '');
    const codeAliases = {
      dnb10062:'台北酒泉', dnb10082:'台北永吉', dnb10094:'台北復興南',
      dnb10146:'台北杭州南', dnb10168:'台北萬大', dnb10174:'台北通化',
      dnb10284:'台北大稻埕', dnb10307:'台北三創', dnb10440:'台北六張犁'
    };
    if (codeAliases[key]) return codeAliases[key];
    const aliases = [
      ['台北酒泉', ['台北酒泉', '酒泉']],
      ['台北永吉', ['台北永吉', '永吉']],
      ['台北復興南', ['台北復興南', '復興南', '復興']],
      ['台北杭州南', ['台北杭州南', '杭州南', '杭州']],
      ['台北萬大', ['台北萬大', '萬大']],
      ['台北通化', ['台北通化', '通化']],
      ['台北大稻埕', ['台北大稻埕', '大稻埕', '大稻']],
      ['台北三創', ['台北三創', '三創']],
      ['台北六張犁', ['台北六張犁', '六張犁', '六張']]
    ];
    const found = aliases.find(([, names]) => names.some(name => key.includes(normalizeHeader(name))));
    return found ? found[0] : '';
  }

  function classifyForm(value) {
    const raw = text(value);
    const key = normalizeHeader(raw);
    if (!key) return null;
    if (key.includes('門市環境檢查表')) {
      const weekMap = [['第一週',1],['第1週',1],['第二週',2],['第2週',2],['第三週',3],['第3週',3],['第四週',4],['第4週',4]];
      const week = (weekMap.find(([label]) => key.includes(normalizeHeader(label))) || [null, null])[1];
      return week ? FORM_DEFINITIONS.find(item => item.id === `environment-w${week}`) : null;
    }
    if (key.includes('重要店務物品清點表')) return FORM_DEFINITIONS.find(item => item.id === 'inventory');
    if ((key.includes('資安') && key.includes('個資')) || key.includes('資安個資檢查表')) return FORM_DEFINITIONS.find(item => item.id === 'security');
    if (key.includes('行事曆')) return FORM_DEFINITIONS.find(item => item.id === 'calendar');
    if ((key.includes('每日') || key.includes('日誌')) && (key.includes('營業前') || key.includes('開店'))) return FORM_DEFINITIONS.find(item => item.id === 'opening');
    if ((key.includes('每日') || key.includes('日誌')) && key.includes('營業中')) return FORM_DEFINITIONS.find(item => item.id === 'midday');
    if ((key.includes('每日') || key.includes('日誌')) && (key.includes('打烊後') || key.includes('營業後') || key.includes('閉店'))) return FORM_DEFINITIONS.find(item => item.id === 'closing');
    return null;
  }

  function normalizeStatus(value) {
    const key = normalizeHeader(value);
    const done = new Set(['已完成', '完成', '已填寫', '已填', '合格', '符合', '是', 'yes', 'y', 'true', 'v', '✅', '✓', '✔']);
    const pending = new Set(['未完成', '待完成', '未填寫', '未填', '逾期', '否', 'no', 'n', 'false', 'x', '待處理']);
    if (done.has(key)) return 'done';
    if (!key || pending.has(key)) return 'pending';
    return 'unknown';
  }

  function rowHasContent(row) {
    return (Array.isArray(row) ? row : []).some(value => text(value));
  }

  function isRepeatedHeader(row, map) {
    if (!Array.isArray(row)) return false;
    return normalizeHeader(row[map.store]) === normalizeHeader('店點') && normalizeHeader(row[map.formName]) === normalizeHeader('檢查項目');
  }

  function normalizeMatrix(matrix, options) {
    const settings = options || {};
    const rows = Array.isArray(matrix) ? matrix : [];
    const detected = detectHeader(rows, settings.maxHeaderRows || 40);
    if (!detected) {
      return { rows:[], errors:['找不到日誌報表表頭；至少需要店點、檢查項目、處理狀態及細項名稱。'], warnings:[], unknownForms:[], meta:{ headerRow:-1, map:null } };
    }
    const output = [];
    const errors = [];
    const warnings = [];
    const unknownForms = [];
    for (let index = detected.rowIndex + 1; index < rows.length; index += 1) {
      const source = Array.isArray(rows[index]) ? rows[index] : [];
      if (!rowHasContent(source) || isRepeatedHeader(source, detected.map)) continue;
      const storeRaw = text(source[detected.map.store]);
      const formRaw = text(source[detected.map.formName]);
      const itemText = text(source[detected.map.itemText]);
      const statusRaw = text(source[detected.map.status]);
      if (!storeRaw && !formRaw && !itemText && !statusRaw) continue;
      const store = canonicalStore(storeRaw);
      if (!store) {
        errors.push(`第 ${index + 1} 列店點無法對應北一二B九店：${storeRaw || '空白'}`);
        continue;
      }
      const form = classifyForm(formRaw);
      if (!form) {
        unknownForms.push({ sourceRow:index + 1, store, formName:formRaw || '空白', itemText });
        continue;
      }
      const submittedAtRaw = Number.isInteger(detected.map.submittedAt) ? source[detected.map.submittedAt] : '';
      const submittedAt = normalizeDateTime(submittedAtRaw, settings);
      const date = normalizeDate(submittedAtRaw, settings) || normalizeDate(settings.asOfDate, settings);
      if (!date) {
        errors.push(`第 ${index + 1} 列無法判定資料日期；請在上傳前選擇資料基準日。`);
        continue;
      }
      const status = normalizeStatus(statusRaw);
      if (status === 'unknown') warnings.push(`第 ${index + 1} 列使用未定義狀態「${statusRaw}」，暫列待確認。`);
      output.push({
        sourceRow:index + 1,
        store,
        submitter:Number.isInteger(detected.map.submitter) ? text(source[detected.map.submitter]) : '',
        submittedAt,
        date,
        month:date.slice(0, 7),
        formId:form.id,
        cadence:form.cadence,
        formName:formRaw,
        formLabel:form.label,
        status,
        statusRaw,
        section:Number.isInteger(detected.map.section) ? text(source[detected.map.section]) : '',
        itemText
      });
    }
    if (unknownForms.length) warnings.push(`有 ${unknownForms.length} 列不屬於目前確認的 10 項日誌表單，正式發布前需確認。`);
    return {
      rows:errors.length ? [] : output,
      errors,
      warnings,
      unknownForms,
      meta:{ headerRow:detected.rowIndex, map:detected.map, parsedRows:output.length }
    };
  }

  function chooseBestSheet(sheets, options) {
    const candidates = (Array.isArray(sheets) ? sheets : []).map(sheet => {
      const parsed = normalizeMatrix(sheet.rows, options);
      return { ...sheet, parsed, score:parsed.rows.length * 100 + (parsed.meta.map ? Object.keys(parsed.meta.map).length : 0) - parsed.errors.length * 1000 };
    }).filter(sheet => sheet.parsed.meta.map);
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  function detectCalendarHeader(matrix, maxRows) {
    const rows = Array.isArray(matrix) ? matrix : [];
    const limit = Math.min(rows.length, Number(maxRows || 40));
    let best = null;
    for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
      const row = Array.isArray(rows[rowIndex]) ? rows[rowIndex] : [];
      const map = {};
      Object.keys(CALENDAR_FIELD_ALIASES).forEach(field => {
        const index = aliasIndex(row, CALENDAR_FIELD_ALIASES[field]);
        if (index >= 0) map[field] = index;
      });
      const hasStore = Number.isInteger(map.store) || Number.isInteger(map.storeCode);
      const requiredHits = [Number.isInteger(map.date), hasStore, Number.isInteger(map.status)].filter(Boolean).length;
      const score = requiredHits * 100 + Object.keys(map).length;
      if (requiredHits === 3 && (!best || score > best.score)) best = { rowIndex, map, score };
    }
    return best;
  }

  function normalizeCalendarMatrix(matrix, options) {
    const settings = options || {};
    const rows = Array.isArray(matrix) ? matrix : [];
    const detected = detectCalendarHeader(rows, settings.maxHeaderRows || 40);
    if (!detected) {
      return { rows:[], errors:['找不到行事曆報表表頭；至少需要檢查日期、店點名稱（或營業點代碼）及處理狀態。'], warnings:[], meta:{ headerRow:-1, map:null } };
    }
    const output = [];
    const errors = [];
    const warnings = [];
    for (let index = detected.rowIndex + 1; index < rows.length; index += 1) {
      const source = Array.isArray(rows[index]) ? rows[index] : [];
      if (!rowHasContent(source)) continue;
      const date = normalizeDate(source[detected.map.date], settings);
      const storeRaw = Number.isInteger(detected.map.store) ? text(source[detected.map.store]) : '';
      const codeRaw = Number.isInteger(detected.map.storeCode) ? text(source[detected.map.storeCode]) : '';
      if (normalizeHeader(source[detected.map.date]) === normalizeHeader('檢查日期')) continue;
      const store = canonicalStore(storeRaw) || canonicalStore(codeRaw);
      if (!date) {
        errors.push(`第 ${index + 1} 列無法判定檢查日期。`);
        continue;
      }
      if (!store) {
        errors.push(`第 ${index + 1} 列店點無法對應北一二B九店：${storeRaw || codeRaw || '空白'}`);
        continue;
      }
      const statusRaw = text(source[detected.map.status]);
      const status = normalizeStatus(statusRaw);
      if (status === 'unknown') warnings.push(`第 ${index + 1} 列使用未定義狀態「${statusRaw}」，暫列待確認。`);
      const submittedAtRaw = Number.isInteger(detected.map.submittedAt) ? source[detected.map.submittedAt] : '';
      output.push({
        sourceRow:index + 1,
        store,
        submitter:Number.isInteger(detected.map.submitter) ? text(source[detected.map.submitter]) : '',
        submittedAt:normalizeDateTime(submittedAtRaw, settings),
        date,
        month:date.slice(0, 7),
        formId:'calendar',
        cadence:'daily',
        formName:'店務行事曆',
        formLabel:'店務行事曆',
        status,
        statusRaw,
        section:'店務行事曆',
        itemText:'完成當日店務行事曆'
      });
    }
    return { rows:errors.length ? [] : output, errors, warnings, meta:{ headerRow:detected.rowIndex, map:detected.map, parsedRows:output.length } };
  }

  function chooseBestCalendarSheet(sheets, options) {
    const candidates = (Array.isArray(sheets) ? sheets : []).map(sheet => {
      const parsed = normalizeCalendarMatrix(sheet.rows, options);
      return { ...sheet, parsed, score:parsed.rows.length * 100 + (parsed.meta.map ? Object.keys(parsed.meta.map).length : 0) - parsed.errors.length * 1000 };
    }).filter(sheet => sheet.parsed.meta.map);
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0] || null;
  }

  function mergeLogAndCalendarRows(logRows, calendarRows) {
    const calendar = Array.isArray(calendarRows) ? calendarRows : [];
    const overrideKeys = new Set(calendar.map(row => `${row.store}|${row.date}`));
    const log = (Array.isArray(logRows) ? logRows : []).filter(row => row.formId !== 'calendar' || !overrideKeys.has(`${row.store}|${row.date}`));
    return [...log, ...calendar];
  }

  function latest(values) {
    return (values || []).filter(Boolean).sort().slice(-1)[0] || '';
  }

  function summarizeForm(rows, definition) {
    const matches = (rows || []).filter(row => row.formId === definition.id);
    if (!matches.length) return { ...definition, status:'missing', doneItems:0, totalItems:0, rows:[] };
    const doneItems = matches.filter(row => row.status === 'done').length;
    const unknownItems = matches.filter(row => row.status === 'unknown').length;
    const status = doneItems === matches.length ? 'done' : unknownItems ? 'unknown' : 'pending';
    return {
      ...definition,
      status,
      doneItems,
      totalItems:matches.length,
      rows:matches,
      submittedAt:latest(matches.map(row => row.submittedAt)),
      submitters:[...new Set(matches.map(row => row.submitter).filter(Boolean))]
    };
  }

  function dueDateFor(definition, selectedDate) {
    const date = normalizeDate(selectedDate);
    if (!date || !definition) return '';
    if (definition.cadence === 'daily') return date;
    const [year, month] = date.split('-').map(Number);
    if (definition.cadence === 'monthly') {
      return `${year}-${pad(month)}-${pad(definition.dueDay)}`;
    }
    if (definition.cadence === 'weekly') {
      const firstDay = new Date(Date.UTC(year, month - 1, 1));
      const firstSunday = 1 + ((7 - firstDay.getUTCDay()) % 7);
      const day = firstSunday + ((definition.week - 1) * 7);
      return `${year}-${pad(month)}-${pad(day)}`;
    }
    return '';
  }

  function withDueState(form, selectedDate) {
    const dueDate = dueDateFor(form, selectedDate);
    const isDue = form.cadence === 'daily' || Boolean(dueDate && selectedDate >= dueDate);
    return {
      ...form,
      dueDate,
      isDue,
      status:!isDue && form.status === 'missing' ? 'upcoming' : form.status
    };
  }

  function buildDashboard(rows, selectedDate) {
    const date = normalizeDate(selectedDate);
    if (!date) throw new Error('資料日期格式錯誤。');
    const month = date.slice(0, 7);
    const sourceRows = Array.isArray(rows) ? rows : [];
    const dailyDefinitions = FORM_DEFINITIONS.filter(item => item.cadence === 'daily');
    const weeklyDefinitions = FORM_DEFINITIONS.filter(item => item.cadence === 'weekly');
    const monthlyDefinitions = FORM_DEFINITIONS.filter(item => item.cadence === 'monthly');
    const stores = STORES.map(store => {
      const storeRows = sourceRows.filter(row => row.store === store);
      const dailyRows = storeRows.filter(row => row.date === date);
      const monthRows = storeRows.filter(row => row.month === month);
      const daily = dailyDefinitions.map(definition => withDueState(summarizeForm(dailyRows, definition), date));
      const weekly = weeklyDefinitions.map(definition => withDueState(summarizeForm(monthRows, definition), date));
      const monthly = monthlyDefinitions.map(definition => withDueState(summarizeForm(monthRows, definition), date));
      const all = [...daily, ...weekly, ...monthly];
      return {
        store,
        daily,
        weekly,
        monthly,
        dailyDone:daily.filter(item => item.status === 'done').length,
        weeklyDone:weekly.filter(item => item.status === 'done').length,
        monthlyDone:monthly.filter(item => item.status === 'done').length,
        exceptions:all.filter(item => item.isDue && item.status !== 'done'),
        sourceRows:storeRows.length
      };
    });
    return {
      date,
      month,
      stores,
      dailyDone:stores.reduce((sum, store) => sum + store.dailyDone, 0),
      dailyExpected:stores.length * dailyDefinitions.length,
      weeklyDone:stores.reduce((sum, store) => sum + store.weeklyDone, 0),
      weeklyExpected:stores.length * weeklyDefinitions.length,
      monthlyDone:stores.reduce((sum, store) => sum + store.monthlyDone, 0),
      monthlyExpected:stores.length * monthlyDefinitions.length,
      exceptionCount:stores.reduce((sum, store) => sum + store.exceptions.length, 0)
    };
  }

  function buildGroupReminder(model, unknownForms) {
    if (!model || !Array.isArray(model.stores) || !normalizeDate(model.date)) {
      throw new Error('缺少可匯出的日誌儀表板資料。');
    }
    const cadenceLabels = { daily:'每日', weekly:'每週', monthly:'每月' };
    const statusLabels = { pending:'未完成', missing:'缺資料', unknown:'待確認' };
    const unknownByStore = new Map();
    (Array.isArray(unknownForms) ? unknownForms : []).forEach(item => {
      const store = canonicalStore(item && item.store) || text(item && item.store);
      if (!store) return;
      if (!unknownByStore.has(store)) unknownByStore.set(store, []);
      unknownByStore.get(store).push(text(item.formName) || '未命名表單');
    });

    const storeLines = [];
    model.stores.forEach(store => {
      const groups = ['daily', 'weekly', 'monthly'].map(cadence => {
        const forms = (store[ cadence ] || []).filter(form => form.isDue && form.status !== 'done');
        if (!forms.length) return '';
        const items = forms.map(form => `${form.shortLabel}（${statusLabels[form.status] || '待確認'}）`);
        return `${cadenceLabels[cadence]}：${items.join('、')}`;
      }).filter(Boolean);
      const unknown = unknownByStore.get(store.store) || [];
      if (unknown.length) groups.push(`未定義表單：${[...new Set(unknown)].join('、')}`);
      if (groups.length) storeLines.push(`• ${store.store}｜${groups.join('｜')}`);
    });

    unknownByStore.forEach((forms, store) => {
      if (model.stores.some(item => item.store === store)) return;
      storeLines.push(`• ${store}｜未定義表單：${[...new Set(forms)].join('、')}`);
    });

    const dateLabel = model.date.replace(/-/g, '/');
    const unknownCount = (Array.isArray(unknownForms) ? unknownForms : []).length;
    const trackingCount = model.exceptionCount + unknownCount;
    const lines = [
      `📋 北一二B每日日誌提醒｜${dateLabel}`,
      `📊 完成：每日 ${model.dailyDone}/${model.dailyExpected}｜每週 ${model.weeklyDone}/${model.weeklyExpected}｜每月 ${model.monthlyDone}/${model.monthlyExpected}`
    ];
    if (!storeLines.length) {
      lines.push('✅ 今日已到期項目皆完成。');
    } else {
      lines.push(`⚠️ 需追蹤 ${trackingCount} 項，請以下門市完成／確認：`, ...storeLines, '完成後請於群組回覆，謝謝。');
    }
    return lines.join('\n');
  }

  return {
    STORES,
    FIELD_ALIASES,
    CALENDAR_FIELD_ALIASES,
    FORM_DEFINITIONS,
    normalizeHeader,
    detectHeader,
    normalizeDate,
    normalizeDateTime,
    canonicalStore,
    classifyForm,
    normalizeStatus,
    normalizeMatrix,
    chooseBestSheet,
    detectCalendarHeader,
    normalizeCalendarMatrix,
    chooseBestCalendarSheet,
    mergeLogAndCalendarRows,
    summarizeForm,
    dueDateFor,
    withDueState,
    buildDashboard,
    buildGroupReminder
  };
});
