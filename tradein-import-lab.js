(() => {
  'use strict';

  const Core = window.TradeInImportCore;
  const $ = id => document.getElementById(id);

  function element(tag, className, textContent) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (textContent != null) node.textContent = textContent;
    return node;
  }

  function appendFieldGroup(host, title, values, className) {
    const group = element('section', 'field-group');
    group.append(element('h4', '', title));
    const list = element('ul', 'chips' + (className ? ' ' + className : ''));
    (values.length ? values : ['無']).forEach(value => list.append(element('li', '', value)));
    group.append(list);
    host.append(group);
  }

  function appendRawPreview(host, result) {
    if (!result.previewRows.length) return;
    host.append(element('h4', 'preview-heading', '原始資料預覽'));
    const wrap = element('div', 'preview-wrap');
    const table = element('table');
    const thead = document.createElement('thead');
    const heading = document.createElement('tr');
    heading.append(element('th', '', '來源列'));
    result.fieldNames.forEach(name => heading.append(element('th', '', name)));
    thead.append(heading);
    const tbody = document.createElement('tbody');
    result.previewRows.forEach(row => {
      const tr = document.createElement('tr');
      tr.append(element('td', '', String(row.rowNumber)));
      result.fieldNames.forEach(name => tr.append(element('td', '', row.values[name] || '')));
      tbody.append(tr);
    });
    table.append(thead, tbody);
    wrap.append(table);
    host.append(wrap);
    host.append(element('p', 'preview-caption', '顯示原始資料前 ' + String(result.previewRows.length) + ' 筆；空白欄位保留為空白。'));
  }

  const NORMALIZED_COLUMNS = [
    ['sourceSheet', '來源工作表'], ['sourceRowNumber', '來源列'], ['vendor', '回收商'], ['grade', '等級'],
    ['brand', '品牌'], ['code', '商品代碼'], ['sku', '料號'], ['sourceModel', '原始機型'],
    ['colorlessModel', '無色機款'], ['product', '品名'], ['retailPrice', '單機價'],
    ['tradeInPrice', '回收價'], ['status', '解析狀態'], ['issues', '異常／空值']
  ];
  const STATUS_LABELS = { success:'成功', partial:'部分成功', failed:'失敗', unrecognized:'無法辨識' };

  function appendMapping(host, result) {
    const mapping = result.fieldMapping || [];
    host.append(element('h4', 'preview-heading', '欄位映射'));
    const wrap = element('div', 'preview-wrap mapping-wrap');
    const table = element('table');
    const thead = document.createElement('thead');
    const heading = document.createElement('tr');
    ['原始欄位', '對應標準欄位', '回收商', '等級', '結果'].forEach(label => heading.append(element('th', '', label)));
    thead.append(heading);
    const tbody = document.createElement('tbody');
    mapping.forEach(field => {
      const tr = document.createElement('tr');
      tr.append(
        element('td', '', field.sourceName),
        element('td', '', field.label || '—'),
        element('td', '', field.vendor || '—'),
        element('td', '', field.grade || '—'),
        element('td', field.status === 'mapped' ? 'status-text success' : (field.status === 'preserved' ? 'status-text partial' : 'status-text unrecognized'), field.status === 'mapped' ? '已映射' : (field.status === 'preserved' ? '原始保留' : '無法辨識'))
      );
      tbody.append(tr);
    });
    table.append(thead, tbody);
    wrap.append(table);
    host.append(wrap);
  }

  function appendQuality(host, result) {
    host.append(element('h4', 'preview-heading', '資料品質與解析異常'));
    const standardized = result.standardized || { summary:{} };
    const quality = element('div', 'normalization-summary quality-summary');
    [
      ['被忽略空白列', result.blankRowCount || 0], ['缺值／部分成功', standardized.summary.partial || result.partialRowCount || 0],
      ['重複資料', result.duplicateRowCount || 0], ['金額格式異常', result.invalidCurrencyCount || 0],
      ['標準化失敗', standardized.summary.failed || 0], ['無法辨識', standardized.summary.unrecognized || 0]
    ].forEach(pair => {
      const card = element('div', '');
      card.append(element('span', '', pair[0]), element('strong', '', String(pair[1])));
      quality.append(card);
    });
    host.append(quality);
  }

  function normalizedCellValue(row, key) {
    if (key === 'status') return STATUS_LABELS[row.status] || row.status;
    if (key === 'issues') return row.issues && row.issues.length ? row.issues.join('；') : '—';
    const value = row[key];
    if ((key === 'retailPrice' || key === 'tradeInPrice') && /^-?\d+$/.test(String(value || ''))) return Number(value).toLocaleString('en-US');
    return value || '—';
  }

  function appendAcceptanceSummary(host, kind, result) {
    const acceptance = result.acceptance;
    if (!acceptance) return;
    host.append(element('h4', 'preview-heading', '解析驗收摘要'));
    const summary = element('div', 'normalization-summary acceptance-summary');
    const values = kind === 'shopping'
      ? [
          ['原始資料列', acceptance.rawDataRows], ['有效資料列', acceptance.validDataRows],
          ['標準化成功', acceptance.success], ['部分成功', acceptance.partial], ['未辨識', acceptance.unrecognized],
          ['忽略空白列', acceptance.ignoredBlankRows], ['重複資料', acceptance.duplicateRows],
          ['金額格式異常', acceptance.invalidCurrencyCount], ['無色機款', acceptance.uniqueColorlessModels], ['缺單機價', acceptance.missingRetailPriceCount]
        ]
      : [
          ['原始機型列', acceptance.rawModelRows], ['展開等級筆數', acceptance.expandedGradeRows],
          ['A 級', acceptance.gradeCounts && acceptance.gradeCounts.A], ['B 級', acceptance.gradeCounts && acceptance.gradeCounts.B],
          ['C 級', acceptance.gradeCounts && acceptance.gradeCounts.C], ['S 級', acceptance.gradeCounts && acceptance.gradeCounts.S],
          ['缺報價', acceptance.missingQuoteCount], ['缺料號', acceptance.missingSkuCount], ['缺品名', acceptance.missingProductCount],
          ['空白等級略過', acceptance.skippedEmptyGradeCount], ['無法辨識', acceptance.unrecognized],
          ['等級錯位', acceptance.gradeMismatchCount], ['回收商錯位', acceptance.providerMismatchCount]
        ];
    values.forEach(pair => {
      const card = element('div', '');
      card.append(element('span', '', pair[0]), element('strong', '', String(pair[1] == null ? 0 : pair[1])));
      summary.append(card);
    });
    host.append(summary);
    if (kind === 'shopping') host.append(element('p', 'preview-caption', '「無色機款」僅用於門市拉選；原始機型、色別、代碼與各專案價欄位仍完整保留。'));
  }

  function reportText(report) {
    return JSON.stringify(report, null, 2);
  }

  function selectManualCopy(textarea, status) {
    textarea.focus();
    textarea.select();
    status.textContent = '無法自動複製；報告已選取，請使用 Ctrl／⌘ + C 手動複製。';
    status.className = 'report-status warning';
  }

  function downloadReport(kind, report, status) {
    const blob = new Blob([reportText(report)], { type:'application/json;charset=utf-8' });
    const link = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    link.href = URL.createObjectURL(blob);
    link.download = 'local-' + kind + '-acceptance-' + date + '.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
    status.textContent = '已下載去識別化驗收報告 JSON；原始資料不會包含在檔案中。';
    status.className = 'report-status ok';
  }

  function appendAcceptanceReport(host, kind, result) {
    const report = Core.buildAcceptanceReport(kind, result);
    const section = element('section', 'acceptance-report');
    section.append(element('h4', 'preview-heading', '本機完整驗收報告'));
    section.append(element('p', 'report-intro', '複製前請先檢查下方內容：它只包含檔案雜湊／大小、工作表與欄位結構、彙總統計、來源列號與最多 3 筆遮罩範例；不包含檔名、原始列、完整商品、料號或精確價格。'));
    const stateClass = report.acceptance.status === 'PASS' ? 'ok' : (report.acceptance.status === 'PARTIAL_READY' ? 'partial' : 'blocked');
    const stateText = report.acceptance.status === 'PASS'
      ? '驗收通過：可複製本去識別化報告進行 review。'
      : (report.acceptance.status === 'PARTIAL_READY' ? '部分可發布：無任何價格的商品已排除，請查看筆數與來源工作表分布。' : '驗收待處理：請先查看報告內的阻擋原因與下一步。');
    const state = element('p', 'report-result ' + stateClass, stateText);
    const controls = element('div', 'report-controls');
    const copy = element('button', 'report-button primary', '一鍵複製驗收報告');
    copy.type = 'button';
    const download = element('button', 'report-button', '下載驗收報告 JSON');
    download.type = 'button';
    const status = element('p', 'report-status', '報告僅保留在目前頁面；重新整理後即消失。');
    const textarea = document.createElement('textarea');
    textarea.className = 'report-box';
    textarea.readOnly = true;
    textarea.rows = 18;
    textarea.value = reportText(report);
    textarea.setAttribute('aria-label', '去識別化驗收報告內容');
    copy.addEventListener('click', async () => {
      try {
        if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') throw new Error('clipboard unavailable');
        await navigator.clipboard.writeText(textarea.value);
        status.textContent = '已複製去識別化驗收報告。';
        status.className = 'report-status ok';
      } catch (_) {
        selectManualCopy(textarea, status);
      }
    });
    download.addEventListener('click', () => downloadReport(kind, report, status));
    controls.append(copy, download);
    section.append(state, controls, status, textarea);
    host.append(section);
  }

  function makeSelect(label, id, values, emptyLabel) {
    const field = element('label', 'candidate-filter');
    field.append(element('span', '', label));
    const select = document.createElement('select');
    select.id = id;
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = emptyLabel;
    select.append(empty);
    values.forEach(value => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value;
      select.append(option);
    });
    field.append(select);
    return { field, select };
  }

  function candidateMeta(host, candidate) {
    const metadata = candidate.metadata;
    const grid = element('dl', 'candidate-meta');
    [
      ['候選版本', metadata.version],
      ['來源檔日期', metadata.sourceDateLabel],
      ['解析時間', metadata.parsedAt || '未提供'],
      ['驗收狀態', metadata.acceptanceStatus]
    ].forEach(pair => {
      const item = document.createElement('div');
      item.append(element('dt', '', pair[0]), element('dd', '', pair[1]));
      grid.append(item);
    });
    host.append(grid);
    const stateClass = metadata.acceptanceStatus === 'BLOCKED' ? 'blocked' : (metadata.acceptanceStatus === 'PARTIAL_READY' ? 'ready' : 'ok');
    const state = element('p', 'candidate-state ' + stateClass, metadata.publication.reason);
    host.append(state);
    const publish = element('button', 'candidate-publish', metadata.publication.disabled ? '正式發布（驗收未通過）' : (metadata.acceptanceStatus === 'PARTIAL_READY' ? '發布條件通過（PARTIAL_READY）' : '發布條件通過（PASS）'));
    publish.type = 'button';
    publish.disabled = metadata.publication.disabled;
    publish.dataset.candidatePublish = candidate.kind;
    publish.setAttribute('aria-describedby', 'candidate-' + candidate.kind + '-publication-note');
    state.id = 'candidate-' + candidate.kind + '-publication-note';
    host.append(publish);
    const publishNote = element('p', 'preview-caption', '此控制只顯示候選發布 gate；本頁不會上傳、寫入或發布資料。');
    if (!publish.disabled) publish.addEventListener('click', () => {
      publishNote.textContent = '候選發布條件已確認；請依受控網站 release 流程處理，原始資料仍只在目前瀏覽器記憶體。';
    });
    host.append(publishNote);
    if (metadata.presentation) {
      const presentation = metadata.presentation;
      const distribution = presentation.excludedNoPriceBySheet.map(entry => entry.sheet + '：' + String(entry.count) + ' 筆').join('；');
      host.append(element('p', 'candidate-exclusion', '本版共 ' + String(presentation.sourceRows) + ' 筆來源資料，呈現 ' + String(presentation.presentedRows) + ' 筆；' + String(presentation.excludedNoPriceRows) + ' 筆商品因無任何價格未顯示。' + (distribution ? ' 來源工作表分布：' + distribution + '。' : '')));
    }
    if (metadata.blockers.length || metadata.warnings.length) {
      const notices = element('ul', 'candidate-notices');
      metadata.blockers.forEach(message => notices.append(element('li', 'blocked', '阻擋：' + message)));
      metadata.warnings.forEach(message => notices.append(element('li', 'warning', '警告：' + message)));
      host.append(notices);
    }
  }

  function candidateTable(host, headings, rows) {
    const wrap = element('div', 'preview-wrap candidate-results');
    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const heading = document.createElement('tr');
    headings.forEach(value => heading.append(element('th', '', value)));
    thead.append(heading);
    const tbody = document.createElement('tbody');
    table.append(thead, tbody);
    wrap.append(table);
    host.append(wrap);
    return tbody;
  }

  function emptyCandidateRow(tbody, count, textContent) {
    const tr = document.createElement('tr');
    const cell = element('td', 'empty-cell', textContent);
    cell.colSpan = count;
    tr.append(cell);
    tbody.append(tr);
  }

  function appendShoppingCandidatePreview(host, result) {
    const candidate = Core.buildShoppingCandidate(result);
    const section = element('section', 'candidate-preview shopping-candidate');
    section.append(element('h4', 'preview-heading', '門市查詢候選預覽（未發布）'));
    section.append(element('p', 'report-intro', '只使用驗收成功列。顏色不作查詢條件；容量、版本、來源工作表與專案方案仍各自保留，絕不跨方案合併價格。'));
    candidateMeta(section, candidate);
    if (candidate.priceMatrixConflictCount) section.append(element('p', 'candidate-state blocked', String(candidate.priceMatrixConflictCount) + ' 組去色後價格矩陣不一致，已從查詢候選排除。'));
    const filters = element('div', 'candidate-filters');
    const brand = makeSelect('品牌', 'shoppingCandidateBrand', candidate.brands, '全部品牌');
    const sourceSheet = makeSelect('方案來源', 'shoppingCandidateSource', candidate.sourceSheets, '全部來源工作表');
    const plan = makeSelect('資費／方案', 'shoppingCandidatePlan', candidate.plans, '請選擇完整方案');
    const queryField = element('label', 'candidate-filter');
    queryField.append(element('span', '', '機型／容量／版本'));
    const query = document.createElement('input');
    query.type = 'search';
    query.id = 'shoppingCandidateQuery';
    query.placeholder = '例如機型、容量或版本；不需輸入顏色';
    query.setAttribute('aria-label', '搜尋手機專案價候選資料');
    queryField.append(query);
    filters.append(brand.field, queryField, sourceSheet.field, plan.field);
    section.append(filters);
    const count = element('p', 'preview-caption');
    const tbody = candidateTable(section, ['方案來源', '品牌', '機型／容量／版本', '色別合併', '單機價', '已選方案', '方案價'], []);
    function render() {
      const matched = Core.filterShoppingCandidate(candidate, { brand:brand.select.value, sourceSheet:sourceSheet.select.value, plan:plan.select.value, query:query.value });
      tbody.replaceChildren();
      if (!matched.length) emptyCandidateRow(tbody, 7, '沒有符合的可查詢候選資料。');
      else matched.slice(0, Core.NORMALIZED_PREVIEW_LIMIT || 50).forEach(row => {
        const tr = document.createElement('tr');
        tr.append(
          element('td', '', row.sourceSheet || '未提供'),
          element('td', '', row.brand),
          element('td', '', row.model),
          element('td', '', row.colorVariantCount > 1 ? '已合併 ' + String(row.colorVariantCount) + ' 個色別' : '不分色'),
          element('td', '', row.retailPrice || '來源未提供'),
          element('td', '', row.selectedPlan || '請選擇完整方案'),
          element('td', '', row.selectedPlan ? (row.selectedPlanPrice || '來源未提供') : '未選方案，不顯示方案價')
        );
        tbody.append(tr);
      });
      count.textContent = '可查詢候選 ' + String(matched.length) + ' 組；只顯示同一來源工作表與已選完整方案的價格，前 ' + String(Math.min(matched.length, Core.NORMALIZED_PREVIEW_LIMIT || 50)) + ' 組。';
    }
    [brand.select, sourceSheet.select, plan.select].forEach(control => control.addEventListener('change', render));
    query.addEventListener('input', render);
    section.append(count);
    render();
    host.append(section);
  }

  function quoteCell(row, vendor, grade) {
    if (row.quoteConflicts.includes(vendor + '／' + grade)) return '需確認（多筆不同報價）';
    const value = row.quotes[vendor] && row.quotes[vendor][grade];
    return value == null || value === '' ? '來源未提供' : value;
  }

  function appendTradeInCandidatePreview(host, result) {
    const candidate = Core.buildTradeInCandidate(result);
    const section = element('section', 'candidate-preview tradein-candidate');
    section.append(element('h4', 'preview-heading', '舊換新比較候選預覽（未發布）'));
    section.append(element('p', 'report-intro', '同一機型畫面並列兩家回收商的 S／A／B／C；來源缺少的回收商或等級一律標示「來源未提供」，不補零、不估價。'));
    candidateMeta(section, candidate);
    if (candidate.quoteConflictCount) section.append(element('p', 'candidate-state blocked', String(candidate.quoteConflictCount) + ' 組比較資料有同回收商／等級的不同報價，需先確認，未自動取值。'));
    const filters = element('div', 'candidate-filters');
    const brand = makeSelect('品牌', 'tradeinCandidateBrand', candidate.brands, '全部品牌');
    const sourceSheet = makeSelect('來源工作表', 'tradeinCandidateSource', candidate.sourceSheets, '全部來源工作表');
    const queryField = element('label', 'candidate-filter');
    queryField.append(element('span', '', '機型／容量／版本'));
    const query = document.createElement('input');
    query.type = 'search';
    query.id = 'tradeinCandidateQuery';
    query.placeholder = '搜尋品牌或機型';
    query.setAttribute('aria-label', '搜尋舊換新候選資料');
    queryField.append(query);
    filters.append(brand.field, queryField, sourceSheet.field);
    section.append(filters);
    const headings = ['來源', '品牌', '機型／容量／版本'].concat(candidate.providers.flatMap(vendor => Core.GRADE_ORDER.map(grade => vendor + ' ' + grade)));
    const count = element('p', 'preview-caption');
    const tbody = candidateTable(section, headings, []);
    function render() {
      const matched = Core.filterTradeInCandidate(candidate, { brand:brand.select.value, sourceSheet:sourceSheet.select.value, query:query.value });
      tbody.replaceChildren();
      if (!matched.length) emptyCandidateRow(tbody, headings.length, '沒有符合的舊換新候選資料。');
      else matched.slice(0, Core.NORMALIZED_PREVIEW_LIMIT || 50).forEach(row => {
        const tr = document.createElement('tr');
        tr.append(element('td', '', row.sourceSheet || '未提供'), element('td', '', row.brand || '未提供'), element('td', '', row.model));
        candidate.providers.forEach(vendor => Core.GRADE_ORDER.forEach(grade => tr.append(element('td', '', quoteCell(row, vendor, grade)))));
        tbody.append(tr);
      });
      count.textContent = '符合 ' + String(matched.length) + ' 組，顯示前 ' + String(Math.min(matched.length, Core.NORMALIZED_PREVIEW_LIMIT || 50)) + ' 組。';
    }
    [brand.select, sourceSheet.select].forEach(control => control.addEventListener('change', render));
    query.addEventListener('input', render);
    section.append(count);
    render();
    host.append(section);
  }

  function appendCandidatePreview(host, kind, result) {
    if (kind === 'tradein') appendTradeInCandidatePreview(host, result);
    else appendShoppingCandidatePreview(host, result);
  }

  function appendSheetSummaries(host, result) {
    if (!result.sheetSummaries || !result.sheetSummaries.length) return;
    host.append(element('h4', 'preview-heading', '工作表驗收明細'));
    const wrap = element('div', 'preview-wrap');
    const table = element('table');
    const thead = document.createElement('thead');
    const heading = document.createElement('tr');
    ['工作表', '原始列', '有效列', '成功', '部分成功', '金額格式異常'].forEach(label => heading.append(element('th', '', label)));
    thead.append(heading);
    const tbody = document.createElement('tbody');
    result.sheetSummaries.forEach(sheet => {
      const tr = document.createElement('tr');
      [sheet.name, sheet.rawDataRows, sheet.validDataRows, sheet.success, sheet.partial, sheet.invalidCurrencyCount].forEach(value => tr.append(element('td', '', String(value))));
      tbody.append(tr);
    });
    table.append(thead, tbody);
    wrap.append(table);
    host.append(wrap);
  }

  function appendIgnoredRows(host, result) {
    const rows = result.ignoredRows || [];
    if (!rows.length) return;
    host.append(element('h4', 'preview-heading', '已標記、未正規化的來源列'));
    const wrap = element('div', 'preview-wrap');
    const table = element('table');
    const thead = document.createElement('thead');
    const heading = document.createElement('tr');
    ['來源列', '原因'].forEach(label => heading.append(element('th', '', label)));
    thead.append(heading);
    const tbody = document.createElement('tbody');
    rows.slice(0, 50).forEach(row => {
      const tr = document.createElement('tr');
      tr.append(element('td', '', String(row.sourceRowNumber)), element('td', '', row.reason));
      tbody.append(tr);
    });
    table.append(thead, tbody);
    wrap.append(table);
    host.append(wrap);
  }

  function appendNormalizedPreview(host, result) {
    const standardized = result.standardized;
    if (!standardized) return;
    const rows = standardized.rows || [];
    host.append(element('h4', 'preview-heading', '標準化資料預覽（Wide → Long）'));
    const summary = element('div', 'normalization-summary');
    [
      ['原始資料', standardized.summary.sourceRows], ['標準化', standardized.summary.normalizedRows],
      ['成功', standardized.summary.success], ['部分成功', standardized.summary.partial || 0], ['失敗', standardized.summary.failed], ['無法辨識', standardized.summary.unrecognized]
    ].forEach(pair => {
      const card = element('div', '');
      card.append(element('span', '', pair[0]), element('strong', '', String(pair[1])));
      summary.append(card);
    });
    host.append(summary);

    const filter = element('label', 'search-label');
    filter.append(element('span', '', '搜尋標準化資料'));
    const input = document.createElement('input');
    input.type = 'search';
    input.placeholder = '輸入品牌、回收商、機型、無色機款、等級、料號或價格';
    input.setAttribute('aria-label', '搜尋標準化資料');
    filter.append(input);
    const count = element('p', 'preview-caption');
    const wrap = element('div', 'preview-wrap normalized-wrap');
    const table = element('table');
    const thead = document.createElement('thead');
    const heading = document.createElement('tr');
    NORMALIZED_COLUMNS.forEach(column => heading.append(element('th', '', column[1])));
    thead.append(heading);
    const tbody = document.createElement('tbody');
    table.append(thead, tbody);
    wrap.append(table);

    function renderRows() {
      const query = input.value.trim().toLocaleLowerCase();
      const matched = rows.filter(row => !query || NORMALIZED_COLUMNS.some(column => String(normalizedCellValue(row, column[0])).toLocaleLowerCase().includes(query)));
      const preview = matched.slice(0, Core.NORMALIZED_PREVIEW_LIMIT || 50);
      tbody.replaceChildren();
      if (!preview.length) {
        const tr = document.createElement('tr');
        const empty = element('td', 'empty-cell', '沒有符合的資料。');
        empty.colSpan = NORMALIZED_COLUMNS.length;
        tr.append(empty);
        tbody.append(tr);
      } else {
        preview.forEach(row => {
          const tr = document.createElement('tr');
          NORMALIZED_COLUMNS.forEach(column => {
            const key = column[0];
            const className = key === 'status' ? 'status-text ' + row.status : '';
            tr.append(element('td', className, String(normalizedCellValue(row, key))));
          });
          tbody.append(tr);
        });
      }
      count.textContent = '符合 ' + String(matched.length) + ' 筆，顯示前 ' + String(preview.length) + ' 筆標準化資料。';
    }
    input.addEventListener('input', renderRows);
    host.append(filter, count, wrap);
    renderRows();
  }

  function renderResult(kind, result) {
    const host = $(kind + 'Analysis');
    host.replaceChildren();
    host.hidden = false;
    const title = element('div', 'analysis-title');
    title.append(element('h3', '', '本機解析結果'));
    title.append(element('span', 'status-badge ok', '已完成'));
    host.append(title);

    const meta = element('dl', 'file-meta');
    [
      ['檔案名稱', result.fileName],
      ['檔案類型', result.fileType],
      ['資料筆數', String(result.recordCount) + ' 筆'],
      ['使用工作表', result.sheetName],
      ['偵測表頭列', '第 ' + String(result.headerRow + 1) + ' 列'],
      ['工作表數', String(result.sheetCount)]
    ].forEach(pair => {
      const item = document.createElement('div');
      item.append(element('dt', '', pair[0]), element('dd', '', pair[1]));
      meta.append(item);
    });
    host.append(meta);
    appendFieldGroup(host, '偵測到的欄位', result.recognizedFields.map(field => field.label + ' ← ' + field.sourceName));
    appendFieldGroup(host, '原始欄位名稱', result.fieldNames);
    if (result.unknownFields.length) appendFieldGroup(host, '原始保留欄位（尚未標準化）', result.unknownFields, 'warning');
    appendAcceptanceSummary(host, kind, result);
    appendAcceptanceReport(host, kind, result);
    appendCandidatePreview(host, kind, result);
    appendSheetSummaries(host, result);
    appendMapping(host, result);
    appendQuality(host, result);
    if (result.warnings.length) {
      const warnings = element('ul', 'warning-list');
      result.warnings.forEach(message => warnings.append(element('li', '', message)));
      host.append(warnings);
    }
    appendIgnoredRows(host, result);
    appendRawPreview(host, result);
    appendNormalizedPreview(host, result);
  }

  function renderError(kind, message) {
    const host = $(kind + 'Analysis');
    host.replaceChildren();
    host.hidden = false;
    const title = element('div', 'analysis-title');
    title.append(element('h3', '', '無法完成解析'));
    title.append(element('span', 'status-badge bad', '請確認檔案'));
    host.append(title, element('p', 'empty-state', message));
  }

  async function inspectFile(kind, file) {
    const name = $(kind + 'FileName');
    if (!file) return;
    name.textContent = file.name;
    const host = $(kind + 'Analysis');
    host.replaceChildren(element('p', 'helper', '正在本機解析檔案…'));
    host.hidden = false;
    try {
      renderResult(kind, await Core.parseFile(file, window.XLSX, kind));
    } catch (error) {
      renderError(kind, error && error.message ? error.message : '檔案解析失敗。');
    }
  }

  document.querySelectorAll('[data-import-file]').forEach(input => {
    input.addEventListener('change', event => inspectFile(event.target.dataset.importFile, event.target.files && event.target.files[0]));
  });
})();
