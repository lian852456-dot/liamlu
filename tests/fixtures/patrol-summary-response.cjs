'use strict';

const model = require('../../patrol-read-model.js');

const stores = [
  { code:'DNB10059', name:'台北通化' }, { code:'DNB10062', name:'台北酒泉' },
  { code:'DNB10307', name:'台北三創' }, { code:'DNB10xxx_wanda', name:'台北萬大' },
  { code:'DNB10440', name:'台北六張犁' }, { code:'DNB10094', name:'台北復興南' },
  { code:'DNB10082', name:'台北永吉' }, { code:'DNB10284', name:'台北大稻埕' },
  { code:'DNB10146', name:'台北杭州南' }
];

function patrolSummaryResponse(month = '2026-08', rows = [], now = new Date('2026-08-13T12:00:00+08:00'), configuredStores = stores) {
  return {
    status:'ok',
    stores:configuredStores,
    title:'北一二B區 · 33 項檢核追蹤',
    summary:model.summaryContract(rows, configuredStores, month, now, {
      sourceVersion:'fixture', sourceUpdatedAt:'2026/8/13 12:00', generatedAt:'2026-08-13T12:00:00+08:00'
    })
  };
}

module.exports = { stores, patrolSummaryResponse };
