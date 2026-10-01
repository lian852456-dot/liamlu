/* Public numeric settlements. No private identity or explanation fields. */
var North12BGoldPublic = (function () {
  'use strict';
  const SCHEMA = 'north12b-public-gold/v1';
  const STORES = ['三創','萬大','通化','杭州南','復興南','酒泉','大稻埕','六張犁','永吉'];
  function validate(source) {
    if (!source || source.schema !== SCHEMA || !Array.isArray(source.settlements) || !source.settlements.length) throw new Error('公開日結格式不正確');
    const dates = new Set();
    const settlements = source.settlements.map(item => {
      if (!/^20\d{2}-\d{2}-\d{2}$/.test(item.date) || new Date(item.date+'T00:00:00Z').toISOString().slice(0,10)!==item.date || dates.has(item.date) || !Array.isArray(item.rows) || !item.rows.length) throw new Error('公開日結日期或人數不正確');
      dates.add(item.date);
      const people = new Set();
      const rows = item.rows.map(row => {
        const key = JSON.stringify([row.store,row.alias]);
        if (!STORES.includes(row.store) || typeof row.alias!=='string' || !row.alias.trim() || row.alias.length>30 || people.has(key) || !Number.isSafeInteger(row.balance) || Math.abs(row.balance)>10000 || (row.delta!==null && !Number.isSafeInteger(row.delta))) throw new Error('公開日結欄位不正確');
        people.add(key);
        return {store:row.store,alias:row.alias,balance:row.balance,delta:row.delta};
      });
      return {date:item.date,rows};
    }).sort((a,b)=>a.date.localeCompare(b.date));
    return {schema:SCHEMA,settlements};
  }
  function latest(ledger,day) {return ledger.settlements.filter(item=>!day||item.date<=day).slice(-1)[0]||null;}
  function changes(ledger) {return ledger.settlements.flatMap(item=>item.rows.map(row=>({...row,date:item.date,status:'已確認'})));}
  return {SCHEMA,STORES,validate,latest,changes};
})();
if (typeof module!=='undefined' && module.exports) module.exports=North12BGoldPublic;
