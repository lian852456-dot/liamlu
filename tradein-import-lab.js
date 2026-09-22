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

  function appendPreview(host, result) {
    if (!result.previewRows.length) return;
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
    host.append(element('p', 'preview-caption', '顯示前 ' + String(result.previewRows.length) + ' 筆；空白欄位保留為空白。'));
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
    if (result.unknownFields.length) appendFieldGroup(host, '無法分類的欄位', result.unknownFields, 'warning');
    if (result.warnings.length) {
      const warnings = element('ul', 'warning-list');
      result.warnings.forEach(message => warnings.append(element('li', '', message)));
      host.append(warnings);
    }
    appendPreview(host, result);
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
