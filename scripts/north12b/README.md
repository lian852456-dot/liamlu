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

## Independent insurance consultation source

`extract.py` prepares two additional files in the private run's `main` directory: `insurance-source-MMDD.json` and `insurance-publish-MMDD.json` (mode 0600). They are excluded from ordinary KPI JSON, attachment manifests and the public share build. The source contains private individual identities/rates. Store H and personal M use their own independently verified periods; personal D3 must never supply a missing store cutoff. Exact employee ID and same-workbook roster matching remain required.

The intent carries source SHA256, report date, payload filename/hash and outcome. A failed extraction produces a failed intent without changing ordinary KPI outputs. If the private output itself is unavailable, the ordinary build continues but publication remains unconfirmed. Do not publish leftover payload files without verifying the current intent and original bytes.

The existing authorized private publisher explicitly invokes `publishInsuranceIntent` from `insurance_publish.mjs`, supplying its existing authorized `request`, exact endpoint, original `sourcePath`, private `intentPath` and unique private `receiptPath`. The module loads no credentials and performs no network requests on import. The adapter and its local JS dependencies must accompany the existing publisher; nothing is uploaded to a public site. This repository does not configure the external 09:45 runner or change schedules/email/images.

The backend stores `north12b-insurance-source-private.json` separately from KPI latest. Admin authorization, the existing owner lock, CAS, two-phase pending/complete state, readback and rollback guard publication. Valid individual values update independently. A missing/failed batch or invalid row preserves earlier values/dates as reference-only pending. Same input retry is idempotent; a corrected original file has a different hash. Only authenticated B projection reveals a caller's authorized tasks, without employee IDs. Weekly medals are untouched. See `docs/insurance-progress-consultation.md` for deployment and rollback gates.
