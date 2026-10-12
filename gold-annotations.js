(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let generation = 0, active, notes = null, selectedPeriod = '';
  function element(tag, value, className) {
    const node = document.createElement(tag);
    if (value != null) node.textContent = value;
    if (className) node.className = className;
    return node;
  }
  function updateWeeks() {
    const select = $('goldNotesWeek'), fragment = document.createDocumentFragment();
    const placeholder = element('option','選擇週別（收起明細）');
    placeholder.value = '';fragment.append(placeholder);
    const periods = new Set();
    const months = [...new Set(notes.batches.map(batch => batch.period.slice(0,7)))].sort().reverse();
    months.forEach(month => {
      const group = element('optgroup');
      group.label = `${month.slice(0,4)}年${Number(month.slice(5))}月`;
      const weeks = new Set(['W1','W2','W3']);
      notes.batches.filter(batch => batch.period.startsWith(month+'-')).forEach(batch => weeks.add(batch.period.slice(8)));
      [...weeks].sort().forEach(week => {
        const option = element('option',week);
        option.value = `${month}-${week}`;periods.add(option.value);group.append(option);
      });
      fragment.append(group);
    });
    select.replaceChildren(fragment);
    selectedPeriod = periods.has(selectedPeriod) ? selectedPeriod : '';
    select.value = selectedPeriod;select.disabled = !months.length;
  }
  function clearNotes() {
    notes = null;
    $('goldNotesWeek').disabled = true;
    $('goldNotesBatches').replaceChildren();
    $('goldNotesBatches').hidden = true;
  }
  function render() {
    if (!notes) return;
    const batches = notes.batches.filter(batch => batch.period === selectedPeriod);
    const fragment = document.createDocumentFragment();
    batches.forEach(batch => {
      const section = element('section',null,'gold-note-batch');
      section.append(element('h4',batch.title));
      section.append(element('p',`${batch.rows.length} 筆｜已扣說明額合計 ${batch.descriptionTotal.toLocaleString('zh-TW')}｜本次追加扣牌 0`,'gold-note-summary'));
      const scroll = element('div',null,'table-scroll'), table = element('table');
      const head = element('thead'), heading = element('tr');
      const labels = ['店點','同仁','保險銷售','搭售率','已扣說明額','扣牌條件'];
      labels.forEach(label => heading.append(element('th',label)));
      head.append(heading);table.append(head);
      const body = element('tbody');
      batch.rows.forEach(row => {
        const tr = element('tr');
        [row.store,row.displayName,row.insuranceSales,row.attachRate,row.descriptionAmount.toLocaleString('zh-TW'),row.criterion].forEach((value,index) => {
          const cell = element('td',String(value),index === 4 ? 'number down' : '');
          cell.dataset.label = labels[index];tr.append(cell);
        });
        body.append(tr);
      });
      table.append(body);scroll.append(table);section.append(scroll);fragment.append(section);
    });
    $('goldNotesBatches').replaceChildren(fragment);
    $('goldNotesBatches').hidden = !batches.length;
    $('goldNotesBatches').scrollTop = 0;
    $('goldNotesStatus').textContent = !notes.batches.length ? '目前沒有已扣金牌備註。' : !selectedPeriod ? '請選擇週別查看，已扣除的金牌不再扣牌。' : batches.length ? '已扣除，僅補記說明；不再扣牌。' : `${selectedPeriod.slice(0,4)}年${Number(selectedPeriod.slice(5,7))}月 ${selectedPeriod.slice(8)}：該週尚無資料。`;
    $('goldNotesStatus').className = 'message success';
  }
  async function refresh() {
    const current = ++generation;
    active?.abort();active = new AbortController();
    const controller = active, timeout = setTimeout(() => controller.abort(),15000);
    clearNotes();
    $('goldNotesStatus').textContent = '正在讀取已扣金牌備註…';
    $('goldNotesStatus').className = 'message';
    try {
      const response = await fetch('gold-annotations-public.json?v=20261012-w1-1',{cache:'no-store',credentials:'omit',signal:controller.signal});
      if (!response.ok) throw new Error('備註讀取失敗，請重新整理。');
      const result = North12BGoldAnnotations.validate(await response.json());
      if (current !== generation) return;
      notes = result;updateWeeks();render();
    } catch (error) {
      if (current !== generation) return;
      clearNotes();
      $('goldNotesStatus').textContent = error.name === 'AbortError' ? '備註讀取逾時，請重新整理。' : (error.message || '備註讀取失敗，請重新整理。');
      $('goldNotesStatus').className = 'message error';
    } finally { clearTimeout(timeout); }
  }
  $('goldNotesWeek').addEventListener('change',() => {selectedPeriod = $('goldNotesWeek').value;render();});
  $('refreshButton').addEventListener('click',refresh);
  window.addEventListener('pagehide',() => {generation++;active?.abort();clearNotes();});
  window.addEventListener('pageshow',event => {if (event.persisted) refresh();});
  refresh();
})();
