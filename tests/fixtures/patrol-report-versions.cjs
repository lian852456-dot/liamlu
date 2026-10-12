'use strict';
// Synthetic only: mirrors the verified counts, never copies formal inspectors/reasons.
const stores = ['酒泉','萬大','大稻埕','復興南','三創','杭州南','永吉','通化','六張犁']
  .map((name, index) => ({name:'台北' + name, code:'SYNTHETIC-' + index}));
const row = (store, item, result, date, extra = {}) => ({
  store:store.name, code:store.code, item, result, fillTime:date + ' 10:00',
  arriveTime:date + ' 09:00', month:date.slice(0,7).replace('/', '-'), reason:'', savedAt:'', ...extra
});
const october = [0,4,7].flatMap(index => Array.from({length:25}, (_, i) =>
  row(stores[index], i + 1, [1,3,10].includes(i + 1) ? 'na' : 'v', index === 0 ? '2026/10/01' : '2026/10/02')));
const september = stores.flatMap((store, index) => {
  const dates = {0:'2026/09/04', 2:'2026/09/01', 4:'2026/09/07', 8:'2026/09/16'};
  return [row(store, 10, dates[index] ? 'v' : 'na', dates[index] || '2026/09/08'),
    row(store, 18, 'v', dates[index] || '2026/09/08')];
});
module.exports = {stores, row, october, september};
