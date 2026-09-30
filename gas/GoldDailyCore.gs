/* Shared private daily-gold contract. Contains no production data. */
var North12BGoldDaily = (function () {
  'use strict';
  const SCHEMA = 'north12b-daily-gold/v1';
  const STORES = ['三創','萬大','通化','杭州南','復興南','酒泉','大稻埕','六張犁','永吉'];
  function date(value) {
    if (typeof value !== 'string' || !/^20\d{2}-\d{2}-\d{2}$/.test(value)) throw new Error('日結日期格式不正確');
    const d = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0,10) !== value) throw new Error('日結日期不存在');
    return value;
  }
  function text(value, limit, required) {
    if (typeof value !== 'string' || value.length > limit || (required && !value.trim())) throw new Error('日結文字欄位不正確');
    return value.trim();
  }
  function validate(source) {
    if (!source || source.schema !== SCHEMA || source.region !== '北一二B' || !Array.isArray(source.settlements) || !source.settlements.length || source.settlements.length > 1000) throw new Error('北一二B 日結資料格式不正確');
    const days = new Set();
    const settlements = source.settlements.map(item => {
      const day = date(item.date);
      if (days.has(day) || item.status !== 'confirmed' || !Array.isArray(item.rows) || !item.rows.length || item.rows.length > 300) throw new Error('日結日期重複、未確認或人數不正確');
      days.add(day);
      const people = new Set();
      const rows = item.rows.map(row => {
        const personKey = text(row.personKey,80,true);
        if (!/^[a-zA-Z0-9_-]{8,80}$/.test(personKey) || people.has(personKey) || !STORES.includes(row.store) || typeof row.balance !== 'number' || !Number.isSafeInteger(row.balance) || Math.abs(row.balance)>10000) throw new Error('日結人員或總牌數不正確');
        people.add(personKey);
        return {personKey,store:row.store,alias:text(row.alias,30,true),balance:row.balance,reason:text(row.reason || '',1000,false),exemption:text(row.exemption || '',100,false)};
      });
      return {date:day,status:'confirmed',source:text(item.source,200,true),recordedAt:text(item.recordedAt,40,true),rows};
    }).sort((a,b)=>a.date.localeCompare(b.date));
    return {schema:SCHEMA,region:'北一二B',updatedAt:text(source.updatedAt,40,true),settlements};
  }
  function changes(ledger) {
    // A missing calendar day or person is not a zero balance or a daily change.
    return ledger.settlements.flatMap((item,index) => {
      const previous = ledger.settlements[index-1];
      const adjacent = previous && (new Date(item.date+'T00:00:00Z') - new Date(previous.date+'T00:00:00Z')) === 86400000;
      const people = new Map((adjacent ? previous.rows : []).map(row=>[row.personKey,row]));
      return item.rows.map(row=>({ ...row,date:item.date,previousBalance:people.has(row.personKey)?people.get(row.personKey).balance:null,delta:people.has(row.personKey)?row.balance-people.get(row.personKey).balance:null,status:'已確認' }));
    });
  }
  function latest(ledger,day) {return ledger.settlements.filter(item=>!day||item.date<=day).slice(-1)[0] || null;}
  return {SCHEMA,STORES,validate,changes,latest};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = North12BGoldDaily;
