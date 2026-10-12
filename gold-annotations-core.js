/* Already-applied explanations are separate from daily settlements. */
var North12BGoldAnnotations = (function () {
  'use strict';
  const SCHEMA = 'north12b-public-gold-annotations/v1';
  const STORES = ['三創','萬大','通化','杭州南','復興南','酒泉','大稻埕','六張犁','永吉'];
  function keys(value, allowed) {
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw new Error('備註包含不支援的欄位');
  }
  function text(value, limit) {
    if (typeof value !== 'string' || !value.trim() || value.length > limit) throw new Error('備註文字格式不正確');
    return value.trim();
  }
  function validate(source) {
    keys(source, ['schema','mode','batches']);
    if (source.schema !== SCHEMA || source.mode !== 'annotation-only' || !Array.isArray(source.batches) || source.batches.length > 100) throw new Error('金牌備註格式不正確');
    const ids = new Set();
    const batches = source.batches.map(batch => {
      keys(batch, ['id','period','title','alreadyApplied','applyToBalance','descriptionTotal','rows']);
      const id = text(batch.id,100), period = text(batch.period,20);
      if (ids.has(id) || !/^20\d{2}-(0[1-9]|1[0-2])-W[1-5]$/.test(period) || batch.alreadyApplied !== true || batch.applyToBalance !== false || !Array.isArray(batch.rows) || !batch.rows.length || batch.rows.length > 300) throw new Error('備註必須是已扣除且不再扣牌的唯一批次');
      ids.add(id);
      const people = new Set();
      const rows = batch.rows.map(row => {
        keys(row, ['store','displayName','insuranceSales','attachRate','descriptionAmount','criterion']);
        const displayName = text(row.displayName,30), attachRate = text(row.attachRate,12);
        const key = JSON.stringify([row.store,displayName]);
        if (!STORES.includes(row.store) || people.has(key) || /\d{7}/.test(displayName) || !Number.isSafeInteger(row.insuranceSales) || row.insuranceSales < 0 || !/^\d{1,3}\.\d{2}%$/.test(attachRate) || Number(attachRate.slice(0,-1)) > 100 || !Number.isSafeInteger(row.descriptionAmount) || row.descriptionAmount >= 0 || row.descriptionAmount < -10000) throw new Error('備註人員或說明額格式不正確');
        people.add(key);
        return {store:row.store,displayName,insuranceSales:row.insuranceSales,attachRate,descriptionAmount:row.descriptionAmount,criterion:text(row.criterion,100)};
      });
      const total = rows.reduce((sum,row) => sum + row.descriptionAmount,0);
      if (!Number.isSafeInteger(batch.descriptionTotal) || total !== batch.descriptionTotal) throw new Error('備註說明額合計不符');
      return {id,period,title:text(batch.title,200),alreadyApplied:true,applyToBalance:false,descriptionTotal:total,rows};
    });
    return {schema:SCHEMA,mode:'annotation-only',batches};
  }
  return {SCHEMA,validate};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = North12BGoldAnnotations;
