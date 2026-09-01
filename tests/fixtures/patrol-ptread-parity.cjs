'use strict';

const stores = [
  { code:'DNB10059', name:'台北通化' },
  { code:'DNB10062', name:'台北酒泉' },
  { code:'DNB10307', name:'台北三創' },
  { code:'DNB10168', name:'台北萬大' },
  { code:'DNB10440', name:'台北六張犁' },
  { code:'DNB10094', name:'台北復興南' },
  { code:'DNB10082', name:'台北永吉' },
  { code:'DNB10284', name:'台北大稻埕' },
  { code:'DNB10146', name:'台北杭州南' }
];

const rows = [];
function add(store, item, fillTime, result = 'v') {
  const config = stores.find(candidate => candidate.name === store);
  rows.push({ store, code:config.code, item, fillTime, result, reason:'' });
}

add('台北通化', 1, '2026/8/3', 'na');
for (let item = 2; item <= 13; item += 1) {
  add('台北通化', item, '2026/8/3');
  add('台北通化', item, '2026/8/18');
}
for (let item = 14; item <= 17; item += 1) add('台北通化', item, '2026/8/3');
add('台北通化', 18, '2026/7/31');
for (let item = 19; item <= 33; item += 1) add('台北通化', item, '2026/8/18');

add('台北酒泉', 1, '2026/8/5');
for (let item = 2; item <= 13; item += 1) add('台北酒泉', item, '2026/8/5');
for (let item = 14; item <= 17; item += 1) add('台北酒泉', item, '2026/8/5');
for (let item = 19; item <= 25; item += 1) add('台北酒泉', item, '2026/8/5');

add('台北三創', 1, '2026/8/2');
for (let item = 2; item <= 13; item += 1) {
  add('台北三創', item, '2026/8/2');
  add('台北三創', item, '2026/8/22');
}
for (let item = 14; item <= 18; item += 1) add('台北三創', item, '2026/8/2');
for (let item = 19; item <= 33; item += 1) add('台北三創', item, '2026/8/22');

module.exports = { currentMonth:'2026-08', now:new Date('2026-08-11T12:00:00+08:00'), stores, rows };
