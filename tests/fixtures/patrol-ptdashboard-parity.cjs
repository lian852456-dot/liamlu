'use strict';

// Synthetic-only fixture. It intentionally contains canary fields that the dashboard
// response must drop before returning rows.
const stores = Array.from({ length:9 }, (_, index) => ({
  code:`SYNTH-STORE-${String(index + 1).padStart(2, '0')}`,
  name:`合成店${String(index + 1).padStart(2, '0')}`
}));

const rows = [];
function add(store, item, date, result = 'v', reason = '') {
  rows.push({
    fillTime:`${date} 10:00`, arriveTime:`${date} 09:00`, leaveTime:'',
    district:'synthetic', code:store.code, store:store.name, inspector:'SYNTHETIC_INSPECTOR',
    item, result, reason, content:'SYNTHETIC_CONTENT_CANARY', month:date.slice(0, 7), savedAt:'synthetic'
  });
}

// Store 01: complete 25 questions with two qualifying visits in September and
// a bimonthly item in October for the October parity check.
stores[0] && Array.from({ length:25 }, (_, index) => add(stores[0], index + 1, '2026/09/01'));
add(stores[0], 1, '2026/09/08');
add(stores[0], 10, '2026/10/03');

// Store 02: NA never counts as completed, even when stored in result/reason.
Array.from({ length:25 }, (_, index) => {
  const item = index + 1;
  if (item === 1) add(stores[1], item, '2026/09/02', 'na');
  else if (item === 3) add(stores[1], item, '2026/09/02', '', 'NA');
  else if (item === 10) add(stores[1], item, '2026/09/02', 'NA');
  else add(stores[1], item, '2026/09/02', 'v', item === 2 ? 'NA' : '');
});
add(stores[1], 2, '2026/09/09');

// Store 03: all questions are complete but one visit leaves cadence incomplete.
Array.from({ length:25 }, (_, index) => add(stores[2], index + 1, '2026/09/03'));

module.exports = { stores, rows, septemberRows:rows.filter(row => row.month <= '2026-09') };
