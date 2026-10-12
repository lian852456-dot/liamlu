(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let generation = 0, active;
  function element(tag, value, className) {
    const node = document.createElement(tag);
    if (value != null) node.textContent = value;
    if (className) node.className = className;
    return node;
  }
  function render(notes) {
    const fragment = document.createDocumentFragment();
    notes.batches.forEach(batch => {
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
  }
  async function refresh() {
    const current = ++generation;
    active?.abort();active = new AbortController();
    const controller = active, timeout = setTimeout(() => controller.abort(),15000);
    $('goldNotesBatches').replaceChildren();
    $('goldNotesStatus').textContent = '正在讀取已扣金牌備註…';
    $('goldNotesStatus').className = 'message';
    try {
      const response = await fetch('gold-annotations-public.json?v=20261012-w1-1',{cache:'no-store',credentials:'omit',signal:controller.signal});
      if (!response.ok) throw new Error('備註讀取失敗，請重新整理。');
      const notes = North12BGoldAnnotations.validate(await response.json());
      if (current !== generation) return;
      render(notes);
      $('goldNotesStatus').textContent = notes.batches.length ? '已扣除，僅補記說明；不再扣牌。' : '目前沒有已扣金牌備註。';
      $('goldNotesStatus').className = 'message success';
    } catch (error) {
      if (current !== generation) return;
      $('goldNotesBatches').replaceChildren();
      $('goldNotesStatus').textContent = error.name === 'AbortError' ? '備註讀取逾時，請重新整理。' : (error.message || '備註讀取失敗，請重新整理。');
      $('goldNotesStatus').className = 'message error';
    } finally { clearTimeout(timeout); }
  }
  $('refreshButton').addEventListener('click',refresh);
  window.addEventListener('pagehide',() => {generation++;active?.abort();$('goldNotesBatches').replaceChildren();});
  window.addEventListener('pageshow',event => {if (event.persisted) refresh();});
  refresh();
})();
