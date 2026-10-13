// Keep the two existing definitions explicit; do not infer a numerator from Y/N.
export function closureMailLines(audit, contact, { sourceSha256, cutoffDate } = {}) {
  if (audit?.sourceSha256 !== sourceSha256 || audit?.latest?.date !== cutoffDate
      || !Array.isArray(audit.daily) || !audit.daily.length) {
    throw new Error('CLOSURE_SOURCE_IDENTITY_MISMATCH');
  }
  const lines = ['【締結率｜來源分子／分母】',
    '口徑：續約率(分子)用戶人數 ÷ 續約率(分母)全部用戶人數；包含無續約。'];
  for (const row of audit.daily) {
    const cell = row.cells?.at(-1);
    const n = cell?.numerator, d = cell?.denominator;
    if (!Number.isFinite(n) || !Number.isFinite(d) || n < 0 || d < n) throw new Error('CLOSURE_VALUE_INVALID');
    lines.push(`${row.store}｜${cutoffDate}｜分子 ${n}／分母 ${d}｜締結率 ${d ? (n / d * 100).toFixed(1) + '%' : '尚未有資料'}`);
  }
  const total = audit.daily[0].cells.at(-1);
  if (total.numerator !== audit.latest.numerator || total.denominator !== audit.latest.denominator) {
    throw new Error('CLOSURE_TOTAL_MISMATCH');
  }
  if (contact) {
    if (contact.cutoff_date !== cutoffDate || contact.definitions?.contact_count !== 'closed + unclosed'
        || contact.definitions?.no_renewal !== 'excluded from contact_count and close_rate') {
      throw new Error('CONTACT_DEFINITION_MISMATCH');
    }
    const a = contact.aggregate;
    if (!a || a.closed + a.unclosed !== a.contact_count
        || a.contact_count + a.no_renewal !== total.denominator || a.closed !== total.numerator) {
      throw new Error('CONTACT_CLOSURE_RECONCILIATION_MISMATCH');
    }
    lines.push('【接客續約比｜排除無續約】',
      `接客 Y＋N ${a.contact_count}｜Y ${a.closed}｜N ${a.unclosed}｜接客續約比 ${a.contact_count ? (a.closed / a.contact_count * 100).toFixed(1) + '%' : '尚未有資料'}｜另列無續約 ${a.no_renewal}（未納入此比率）`);
  }
  return lines;
}
