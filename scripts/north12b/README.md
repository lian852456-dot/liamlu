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

The `配件包膜銷售` worksheet and `Sales_Overview` PNG add a single ten-row, four-column view: store, latest actual day accessory revenue, latest actual day film revenue, and current-month automatic film applicator compatible item sales quantity through the core cutoff. Revenue uses `上線數KPI_每日上線`; sparse blanks become zero only when that item's supplied month total reconciles. Monthly applicator quantities sum signed `銷售筆數` where `商品名稱` contains `自動保貼機適用款` in `AQ其他-包膜與保貼營收`.

The newly added MyVideo/KKBOX contract count is disabled per the user's 2026-10-04 follow-up. Do not collect auxiliary VK detail or show a pending-detail notice for this summary. Existing company KPI reporting is unchanged. The new PNG remains included in the dynamic manifest (normally 2 XLSX + 11 PNG) and requires the same visual and delivery checks. Regression: `python -m unittest discover -s tests -p 'test_north12b_sales.py'`.

Regression: `node --test tests/north12b-dod.test.mjs`. The source-to-artifact run must also be verified against the actual daily source, including a missing-prior case, zero values, missing store rows, closure reconciliation and CJK visuals.
The optional `--vk-source` parser remains available for future explicit reactivation; it is unused by the active morning summary and its manifest.

## Store insurance consultation source

The extractor now adds `meta.storeInsuranceProgress` to the private KPI payload consumed by the existing authorized publication path. It contains only canonical store codes/names and column H (手機保險搭售率), never column G (進度達成率) or personal rates. The source bytes, publication date, and stable content version accompany the rows; partial/missing values remain null. Reprocessing identical input is deterministic; source corrections change the version. No new publisher, schedule, email, image or historical-row writer is introduced.

This sidecar **does not reuse the renderer's personal-sheet cutoff described above**. It accepts only an unambiguous explicit statistical range on the store worksheet, beginning on the first of the month and ending no later than publication. A missing store-level range remains pending. Future alternative period evidence requires its own reviewed source binding; a period from a personal sheet or KPI cannot be promoted by editing metadata.

The form consumes this field only through its existing authenticated B KPI bundle. Until the private daily pipeline actually publishes the extended KPI payload, the form reports the source as pending. Same-day source changes require a fresh read before a first save. Older publications remain clearly dated reference only, and cross-month/future sources cannot require consultation. No public static report JSON is generated.
