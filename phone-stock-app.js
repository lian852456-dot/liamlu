(() => {
  'use strict';
  const Core = window.PhoneStockCore;
  const PRIVATE_API = 'https://script.google.com/macros/s/AKfycbxVAnQy9VnKF03CwZlwCENHs-GVAwpS4yGXjhFIn-t0jAon5nKcp-pRVFBZjUBogdW6/exec';
  const KEY = 'north12b_phone_stock_local_snapshot_v1';
  const byId = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  let snapshot = null;
  let remote = false;
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (stored && stored.version === 1 && Array.isArray(stored.rows)) snapshot = stored;
  } catch (_) { /* Invalid local data cannot be displayed as a current stock snapshot. */ }

  function render() {
    const model = byId('stockModel').value.trim().toLocaleLowerCase('zh-Hant');
    const store = byId('stockStore').value;
    const rows = snapshot ? snapshot.rows.filter(row => (!store || row.store === store) && (!model || `${row.model} ${Core.shortModel(row.model)}`.toLocaleLowerCase('zh-Hant').includes(model))) : [];
    byId('stockMeta').textContent = snapshot ? `庫存快照：${snapshot.date || '來源未提供日期'} · ${remote ? '私有服務更新' : '此裝置本機匯入'} ${new Date(snapshot.importedAt).toLocaleString('zh-TW')}` : '尚無庫存資料。';
    byId('stockTotal').textContent = snapshot ? `符合條件 ${rows.reduce((sum, row) => sum + row.quantity, 0)} 台` : '—';
    byId('stockResults').innerHTML = rows.length ? rows.sort((a,b) => b.quantity - a.quantity || a.model.localeCompare(b.model,'zh-Hant')).map(row => `<div class="stock-item"><span><strong title="${escape(row.model)}">${escape(Core.shortModel(row.model))}</strong><small>${escape(row.store.replace(/^台北/,''))}</small></span><b>${row.quantity}</b></div>`).join('') : `<div class="empty-state">${snapshot ? '沒有符合條件的庫存。' : '尚未匯入庫存檔。'}</div>`;
  }

  async function importFile(file) {
    if (!file) return;
    const message = byId('stockImportMessage');
    if (!/\.(xlsx|xls|csv|tsv)$/i.test(file.name) || !file.size || file.size > 20 * 1024 * 1024) {
      message.textContent = '請選擇 20 MB 以內的 XLSX、XLS、CSV 或 TSV 庫存檔。'; return;
    }
    try {
      message.textContent = '正在解析庫存檔…';
      const buffer = await file.arrayBuffer();
      let workbook;
      if (/\.(csv|tsv)$/i.test(file.name)) {
        const utf8 = new TextDecoder('utf-8').decode(buffer);
        let content = utf8;
        try { const big5 = new TextDecoder('big5').decode(buffer); if ((big5.match(/店點|門市|庫存|品名/g)||[]).length > (utf8.match(/店點|門市|庫存|品名/g)||[]).length) content = big5; } catch (_) { /* UTF-8 remains available. */ }
        workbook = window.XLSX.read(content, {type:'string',cellDates:true,FS:/\.tsv$/i.test(file.name)?'\t':','});
      } else workbook = window.XLSX.read(buffer, {type:'array',cellDates:true});
      const selected = Core.chooseBestSheet(workbook.SheetNames.map(name => ({name,rows:window.XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,raw:true,defval:'',blankrows:false})})), 'stock', '');
      if (!selected) throw new Error('找不到店點、機型及庫存數，請確認庫存檔欄位。');
      const dated = selected.parsed.rows.filter(row => row.date).map(row => row.date).sort();
      const date = dated[dated.length - 1] || '';
      const latest = selected.parsed.rows.filter(row => date ? row.date === date : !row.date);
      const grouped = new Map();
      latest.forEach(row => { const key = JSON.stringify([row.store,row.model]); grouped.set(key, (grouped.get(key)||0) + row.quantity); });
      const next = {version:1,date,importedAt:new Date().toISOString(),rows:[...grouped].map(([key,quantity]) => { const [store,model] = JSON.parse(key); return {store,model,quantity}; })};
      localStorage.setItem(KEY,JSON.stringify(next));
      snapshot = next; remote = false; message.textContent = `已匯入 ${next.rows.length} 筆庫存；資料保存在此裝置。`;
      render();
    } catch (error) { message.textContent = `匯入失敗：${error.message}`; }
  }
  async function refreshFromService() {
    const message = byId('stockImportMessage');
    const employeeId = localStorage.getItem('north12b_private_dashboard_employee_id') || '';
    const deviceId = localStorage.getItem('north12b_private_dashboard_device_id') || '';
    if (!employeeId || !deviceId) { message.textContent = '請先從個人與系統設定完成這台手機的正式裝置核准。'; return; }
    message.textContent = '正在讀取電腦發布的最新庫存…';
    try {
      const response = await fetch(PRIVATE_API,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'phone_stock_read',employeeId,deviceId}),cache:'no-store'});
      const body = await response.json();
      if (!response.ok || body.status !== 'ok') throw new Error(body.message || '正式庫存讀取失敗');
      if (!body.snapshot) { if (remote) { snapshot = null; remote = false; render(); } message.textContent = '尚未從電腦同步庫存檔。'; return; }
      const data = body.snapshot;
      if (data.version !== 1 || !Array.isArray(data.rows) || !data.rows.every(row => Core.STORE_NAMES.includes(row.store) && typeof row.model === 'string' && Number.isSafeInteger(row.quantity) && row.quantity >= 0)) throw new Error('正式庫存資料格式不正確');
      snapshot = data; remote = true; message.textContent = '已從私有服務讀取最新庫存。'; render();
    } catch (error) {
      if (remote) { snapshot = null; remote = false; render(); }
      message.textContent = `無法同步：${error.message}${snapshot ? '；目前顯示此裝置本機匯入資料。' : ''}`;
    }
  }
  byId('stockFile').addEventListener('change', event => importFile(event.target.files[0]));
  byId('stockModel').addEventListener('input', render);
  byId('stockStore').addEventListener('change', render);
  byId('stockRefresh').addEventListener('click',refreshFromService);
  document.querySelector('[data-battle-kind="stock"]').addEventListener('click',refreshFromService);
  window.addEventListener('storage', event => { if (event.key === KEY) { try { snapshot = JSON.parse(event.newValue); } catch (_) { snapshot = null; } render(); } });
  render();
})();
