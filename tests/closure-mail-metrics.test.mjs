import assert from 'node:assert/strict';
import test from 'node:test';
import { closureMailLines } from '../scripts/north12b/closure_mail_metrics.mjs';

const DATE = '2026-10-12';
const SOURCE_SHA = 'a'.repeat(64);

function fixture({ numerator = 62, denominator = 154, sourceSha256 = SOURCE_SHA, auditDate = DATE,
  contactCount = 121, closed = 62, unclosed = 59, noRenewal = 33, contactCutoff = DATE } = {}) {
  return {
    audit: {
      sourceSha256,
      latest: { date: auditDate, numerator, denominator },
      daily: [{ store: '合成全區', cells: [{ numerator: 0, denominator: 0 }, { numerator, denominator }] }],
    },
    contact: {
      cutoff_date: contactCutoff,
      definitions: {
        contact_count: 'closed + unclosed',
        no_renewal: 'excluded from contact_count and close_rate',
      },
      aggregate: { contact_count: contactCount, closed, unclosed, no_renewal: noRenewal },
    },
  };
}

test('prints both denominators with explicit inclusion/exclusion definitions', () => {
  const { audit, contact } = fixture();
  const lines = closureMailLines(audit, contact, { sourceSha256: SOURCE_SHA, cutoffDate: DATE });
  assert.ok(lines.includes('口徑：續約率(分子)用戶人數 ÷ 續約率(分母)全部用戶人數；包含無續約。'));
  assert.ok(lines.some(line => line.includes('分子 62／分母 154｜締結率 40.3%')));
  assert.ok(lines.includes('【接客續約比｜排除無續約】'));
  assert.ok(lines.some(line => line.includes('接客 Y＋N 121｜Y 62｜N 59｜接客續約比 51.2%｜另列無續約 33（未納入此比率）')));
});

test('blocks source SHA or cutoff mismatch', () => {
  const wrongSha = fixture();
  assert.throws(() => closureMailLines(wrongSha.audit, wrongSha.contact,
    { sourceSha256: 'f'.repeat(64), cutoffDate: DATE }), /CLOSURE_SOURCE_IDENTITY_MISMATCH/);
  const wrongDate = fixture({ auditDate: '2026-10-11' });
  assert.throws(() => closureMailLines(wrongDate.audit, wrongDate.contact,
    { sourceSha256: SOURCE_SHA, cutoffDate: DATE }), /CLOSURE_SOURCE_IDENTITY_MISMATCH/);
  const contactWrongDate = fixture({ contactCutoff: '2026-10-11' });
  assert.throws(() => closureMailLines(contactWrongDate.audit, contactWrongDate.contact,
    { sourceSha256: SOURCE_SHA, cutoffDate: DATE }), /CONTACT_DEFINITION_MISMATCH/);
});

test('blocks inconsistent closure source totals and Y/N reconciliation', () => {
  const wrongAuditTotal = fixture();
  wrongAuditTotal.audit.latest.denominator = 153;
  assert.throws(() => closureMailLines(wrongAuditTotal.audit, wrongAuditTotal.contact,
    { sourceSha256: SOURCE_SHA, cutoffDate: DATE }), /CLOSURE_TOTAL_MISMATCH/);

  const wrongContactSum = fixture({ unclosed: 58 });
  assert.throws(() => closureMailLines(wrongContactSum.audit, wrongContactSum.contact,
    { sourceSha256: SOURCE_SHA, cutoffDate: DATE }), /CONTACT_CLOSURE_RECONCILIATION_MISMATCH/);

  const wrongContactDenominator = fixture({ noRenewal: 32 });
  assert.throws(() => closureMailLines(wrongContactDenominator.audit, wrongContactDenominator.contact,
    { sourceSha256: SOURCE_SHA, cutoffDate: DATE }), /CONTACT_CLOSURE_RECONCILIATION_MISMATCH/);
});
