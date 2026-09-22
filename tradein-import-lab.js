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
