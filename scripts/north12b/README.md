# North12B v4 artifact entry

`run_report.py` builds a source-driven private daily workbook, closure workbook and PNGs. It does not publish website data or send mail. Existing source identity, roster, reconciliation, website, duplicate-mail and post-send gates still apply.

```sh
python scripts/north12b/run_report.py \
  --source /private/current/MMDD.xlsx \
  --previous-source /private/previous/MMDD.xlsx \
  --previous-kpi /private/previous/verified-kpicalc.json \
  --template /private/template-v4.xlsx \
  --run-dir /private/current-run \
  --report-date YYYY-MM-DD \
  --font-dir /private/verified-font-assets
```

The current source and template are required. Previous source/KPI arguments are optional. Omit missing inputs; do not manufacture prior records. The personal detailed roster in today's source is authoritative. A store-section export requires a verified roster for role and identity resolution.

Missing prior values never block current-day artifacts. DOD is `暫不比較` when the baseline is absent, untrusted or from another month. Explicit zero with an independently valid baseline remains comparable. A month-start export with no valid KPI targets cannot supply an achievement baseline. Source read failures and malformed files remain errors, distinct from missing data.

Insurance uses the core source's canonical nine-store order. Missing stores retain `尚未有資料`; other stores retain source numbers, including zero. Insurance cutoff comes from the personal insurance sheet's actual period. Unknown cutoffs remain pending and cannot support DOD. QIS values are retained even if only the full-month reporting interval is supplied; the actual cutoff remains pending.

Final PNGs are rendered once after v4 layout. Goodspeed uses `../render_goodspeed_detail.py`, including its private receipt, verification and dynamic pages. Manifest rows follow the generated worksheets and receipt files. `PENDING_VISUAL_REVIEW` must be replaced only after actual visual review. No publisher may treat workbook creation or an unreviewed manifest as permission to publish.

Outputs and processing records belong in the private run directory. Never commit private source, roster, report, template, receipt or snapshot files to this repository.

The `配件包膜影音` worksheet and `Sales_Overview` PNG add a single ten-row view: latest actual day accessory/film revenue, combined MyVideo/KKBOX distinct contract count, and current-month automatic film applicator compatible item sales quantity through the core cutoff. Revenue uses `上線數KPI_每日上線`; sparse blanks become zero only when that item's supplied month total reconciles. Monthly applicator quantities sum signed `銷售筆數` where `商品名稱` contains `自動保貼機適用款` in `AQ其他-包膜與保貼營收`.

VK requires a transaction table with explicit contract ID, statistical date, store, 5G plan and customer classification. It excludes corporate/non-5G cases and deduplicates contracts across both services. Unknown eligibility, blank contracts and conflicting store ownership retain null/`待補明細`; KPI points and `Subscr_Id` are never substituted. No new 599 threshold is imposed on this requested count. Missing VK detail does not block available revenue or existing KPI artifacts. The new PNG is included in the dynamic manifest (normally 2 XLSX + 11 PNG) and requires the same visual and delivery checks. Regression: `python -m unittest discover -s tests -p 'test_north12b_sales.py'`.

Regression: `node --test tests/north12b-dod.test.mjs`. The source-to-artifact run must also be verified against the actual daily source, including a missing-prior case, zero values, missing store rows, closure reconciliation and CJK visuals.
The optional repeatable `--vk-source /private/current/AQ-or-RT.xlsx` adds same-batch VK transaction files to the private parser. Their filenames/hashes are recorded; both services share one deduplication set. A prior-day-only table does not supply a current-day zero. Auxiliary sheets are referenced in the sales manifest, never published as raw data.
