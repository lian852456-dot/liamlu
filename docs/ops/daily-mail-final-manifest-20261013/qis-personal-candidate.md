# Daily QIS personal follow-up candidate

The existing `TWM_North12B_QIS_<date>.png` keeps its store block and appends the
personal follow-up below it. No additional mail attachment is added. The canvas
grows with the rows; personal rows use 14-point text rather than shrinking to fit.

`QIS個績` metric columns are discovered from the unique `計件數` / `原始分數`
main header. Identity columns are discovered against the current source roster
and stores. Reordered columns are covered by synthetic tests. Missing/ambiguous
headers, duplicate employees, or unavailable source provenance fail closed.
The current source happens to use H6/M6; the implementation does not require
those coordinates in future workbooks.

For a positive integer case count `n` and reported score `s < 98`, the equal-weight
scenario is `k = ceil(n * (98 - s) / 2)` additional 100-score cases. Decimal text
from the original XML is retained in the private extraction receipt. Verification
independently checks `(n*s + 100*k)/(n+k) >= 98` and the preceding case count below
98. This scenario does not recover an employee's original total score. Its caption
states that a boundary can differ by one case and company updates are authoritative.

Zero cases are listed separately as `尚無資料，首筆100即100`, with no displayed
zero score. Missing/invalid counts or scores appear as `待核`. Employees at or above
98 are counted in the source coverage but omitted from the follow-up list. The
actual personal-sheet population is used; absent managers are not manufactured
from the larger core KPI roster. Source names are preserved, including a source
question-mark placeholder, without guessing a replacement name.

The fresh 1013 source matches SHA `2fffcbcd…e69a`. Its scoped personal sheet has 32
employees: 17 positive-count scores below 98, one zero-count row and 14 scores at
least 98. Personal cutoff is **2026-10-09**, store cutoff **2026-10-10**. Both dates
are printed in the same image. The scoped XML contains 32 numeric score values and
zero score formulas; this differs from the earlier assertion of two fixed values.
Numeric XML storage is not evidence that an original total can be reconstructed,
so all follow-up rows remain explicitly reported-score scenarios.

The isolated seven-stage build passed all source/artifact checks, producing the
same 13 daily attachments. The original QIS store block and 6,518 existing main
workbook cells retained values, formulas and styles. All ten other daily PNGs are
byte-identical to the accepted isolated baseline. The closure workbook's 60,520
cells and merges retain values, formulas and styles; its fresh export has different
relationship identifiers and ZIP timestamps, so byte identity is not claimed.
The candidate QIS PNG is 1056 × 3358, SHA
`e94911ffdb4af9473d39546abac5d28f749a8847985f0f5cfbb0237e986fb57e`.

Nine new regressions pass. The combined local evidence is 31 Node tests, 39 Python
tests and the owner's six distinct blank-row regressions (76 distinct tests).
The PNG has been visually reviewed and delivered in native Library as
`libfile_6defd20dfe80819187b15f9bee41608f` for Liam's acceptance. This is still a
draft candidate. No formal runner, control plane, report, website, LINE output or
mail was changed or invoked. The previous 57/67-test evidence and 13+6 seals remain
available in the review packet. A fresh integrated 13+6 seal includes this new QIS
hash (digest `2df4a52c…93787`). The two-entrypoint fixture using those 19 actual files
passes four old-mail mismatch blocks and two cross-entrypoint duplicate skips,
with two local fixture captures and zero external sends. This is still not a live
Outlook round-trip acceptance.

Activation must install `qis_personal.py` with the versioned builder's `extract.py`,
`build_kpi_report.mjs` and `verify_artifacts.py`. The current inventory therefore
contains 25 code/control file targets. The GitHub workflow candidate includes the
new tests but still needs installation by an already authorized repository
maintainer. User visual acceptance, merge, Mac installation and a later normal
unsent-date live-mail acceptance remain separate approval steps.
