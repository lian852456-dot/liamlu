/* Durable submission journal. A timeout is an unknown outcome, never permission to resend. */
(function (scope) {
  'use strict';
  const schema = 'report-save-v1';
  const copy = value => JSON.parse(JSON.stringify(value));
  const revision = record => record ? JSON.stringify(Object.keys(record).filter(k => k !== '_report_revision').sort().map(k => [k, record[k]])) : '';
  function create({storage, post, getEndpoint, getContext, timeoutMs = 30000, onChange = () => {}}) {
    const active = new Map();
    const key = (p, endpoint = getEndpoint()) => JSON.stringify([endpoint, p.action, p.date, p.store, Number(p.seg), p.name || '']);
    const storageKey = (p, endpoint = getEndpoint()) => 'bei12b_pending_report_v1:' + key(p, endpoint);
    const content = p => JSON.stringify(p.action === 'write' ? {...p.data, savedAt:undefined} : p.record);
    const load = p => JSON.parse(storage.getItem(storageKey(p)) || 'null');
    const notify = (p, state, detail = '') => onChange(copy(p), state, detail);
    async function request(payload, context, endpoint) {
      let timer;
      try {
        const result = await Promise.race([
          Promise.resolve().then(() => post(payload)),
          new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('連線超過 30 秒；結果尚未確認')), timeoutMs); }),
        ]);
        if (getContext() !== context || getEndpoint() !== endpoint) throw new Error('登入或服務已變更；請在原入口確認結果');
        return result;
      } finally { clearTimeout(timer); }
    }
    function validReceipt(receipt, operation) {
      const p = operation.payload;
      const row = receipt?.readback;
      const valuesMatch = p.action === 'pwrite'
        ? !!row && Object.keys(p.record).every(k => JSON.stringify(row[k]) === JSON.stringify(p.record[k]))
        : !!row && Object.keys(p.data).filter(k => k !== 'savedAt' && p.data[k] != null).every(k =>
          typeof p.data[k] === 'object' ? JSON.stringify(row[k]) === JSON.stringify(p.data[k]) : String(row[k]) === String(p.data[k]));
      return valuesMatch && receipt?.status === 'ok' && receipt.schema === schema && receipt.rowWritten === true &&
        receipt.readbackMatches === true && receipt.commitId === operation.id && !!receipt.committedAt &&
        receipt.date === p.date && receipt.store === p.store && Number(receipt.seg) === Number(p.seg) &&
        (p.action !== 'pwrite' || receipt.name === p.name);
    }
    async function run(payload, baseRevision, retryOnly) {
      const context = getContext(), endpoint = getEndpoint();
      const journalKey = storageKey(payload, endpoint);
      let operation = JSON.parse(storage.getItem(journalKey) || 'null');
      const same = operation && content(operation.payload) === content(payload);
      if (operation && !same && !retryOnly) throw new Error('上一筆結果尚未確認；請先按「確認／重試原送出」，目前修改已保留');
      if (retryOnly && !operation) throw new Error('沒有待確認的送出，請重新確認表單');
      const target = operation?.payload || payload;
      notify(target, 'checking');
      const status = await request({action:'report_save_status', kind:target.action, date:target.date, store:target.store, seg:target.seg, name:target.name || ''}, context, endpoint);
      if (status?.schema !== schema || status.status !== 'ok') throw new Error('服務尚未支援安全送出；草稿已保留，請聯絡管理者更新服務');
      if (operation && status.commitId === operation.id) {
        if (!validReceipt(status.receipt, operation)) throw new Error('提交讀回不完整，請保留草稿並聯絡管理者');
        if (JSON.parse(storage.getItem(journalKey) || 'null')?.id === operation.id) storage.removeItem(journalKey);
        notify(target, 'confirmed', status.committedAt);
        return status.receipt;
      }
      const expected = operation ? operation.baseRevision : baseRevision === undefined ? status.revision : baseRevision;
      if (status.revision !== expected) {
        notify(target, 'conflict');
        const error = new Error('雲端已有不同版本；未覆蓋。請保留草稿並重新讀取、核對後再送出');
        error.code = 'REPORT_CONFLICT'; throw error;
      }
      if (!operation) {
        operation = {id:scope.crypto.randomUUID(), baseRevision:expected, payload:copy(payload)};
        storage.setItem(journalKey, JSON.stringify(operation)); // Must succeed before any mutation.
      }
      notify(target, 'uploading');
      const result = await request({...operation.payload, mutation:{schema, id:operation.id, baseRevision:operation.baseRevision}}, context, endpoint);
      if (!validReceipt(result, operation)) throw new Error('寫入回應尚未通過提交讀回確認');
      if (JSON.parse(storage.getItem(journalKey) || 'null')?.id === operation.id) storage.removeItem(journalKey);
      notify(target, 'confirmed', result.committedAt);
      return result;
    }
    function save(payload, baseRevision, retryOnly = false) {
      const k = key(payload);
      const journalKey = storageKey(payload);
      if (active.has(k)) return active.get(k);
      const task = run(copy(payload), baseRevision, retryOnly).catch(error => {
        if (error.code !== 'REPORT_CONFLICT' && !storage.getItem(journalKey)) error.code = 'REPORT_NOT_SENT';
        notify(payload, error.code === 'REPORT_CONFLICT' ? 'conflict' : error.code === 'REPORT_NOT_SENT' ? 'failed' : 'unconfirmed', error.message); throw error;
      }).finally(() => active.delete(k));
      active.set(k, task); return task;
    }
    async function reviewLatest(payload) {
      if (active.has(key(payload))) throw new Error('原送出仍在確認中，請稍候');
      const status = await request({action:'report_save_status',kind:payload.action,date:payload.date,store:payload.store,seg:payload.seg,name:payload.name || ''}, getContext(), getEndpoint());
      if (status?.schema !== schema || status.status !== 'ok') throw new Error('無法確認雲端版本');
      const operation = load(payload);
      if (operation) {
        if (status.commitId === operation.id || status.revision === operation.baseRevision) throw new Error('請先按「確認／重試原送出」核對原提交');
        // The old compare-and-set can no longer succeed. Preserve evidence before starting afresh.
        storage.setItem(storageKey(payload) + ':superseded:' + operation.id, JSON.stringify(operation));
        storage.removeItem(storageKey(payload));
      }
      return status;
    }
    return Object.freeze({save, reviewLatest, pending:load, busy:p => active.has(key(p))});
  }
  scope.ReportSaveRecovery = Object.freeze({create, revision});
})(globalThis);
