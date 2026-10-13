export const SOURCE_CONTRACT_VERSION = 'north12b-source-contract/v2';

export function personalPresentationRow(person, { category, reportDate, store } = {}) {
  if (category === 'manager' && reportDate < '2026-09-01') {
    return {...person, official:store?.official ?? person.official, items:store?.items ?? person.items};
  }
  if (!person.employee_id || !Number.isFinite(person.official) || !person.items) {
    throw new Error('PERSONAL_KPI_SOURCE_MISSING');
  }
  // September onward managers have their own KPI: never replace it with store KPI.
  return {...person};
}

export function personalPreviousRow(person, { category, reportDate, byEmployee, byStore } = {}) {
  return category === 'manager' && reportDate < '2026-09-01'
    ? byStore.get(person.store) : byEmployee.get(person.employee_id ?? `${person.store}|${person.pname}`);
}

export function qisSourceScore(stores, aggregate) {
  if (stores.length !== 9 || !Number.isFinite(aggregate?.[5])
      || stores.some(r => !Number.isFinite(r[8]) || !Number.isFinite(r[9]) || !Number.isFinite(r[10]))) {
    throw new Error('QIS_SOURCE_SCORE_MISSING');
  }
  const mean = index => stores.reduce((total, row) => total + row[index], 0) / stores.length;
  if (Math.abs(mean(10) - aggregate[5]) > 0.05
      || Math.abs((mean(8) + mean(9)) / 2 - aggregate[5]) > 0.05) {
    throw new Error('QIS_SOURCE_SCORE_RECONCILIATION_FAILED');
  }
  return aggregate[5]; // literal source aggregate F; never a case-weighted score
}

export function companyRank(row) {
  if (row.rank == null) return '尚未有資料';
  if (!Number.isInteger(row.rank) || row.rank < 1) throw new Error('COMPANY_RANK_INVALID');
  return row.rank;
}
