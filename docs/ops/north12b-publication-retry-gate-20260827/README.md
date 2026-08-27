# North12B publication retry and completion gate — 2026-08-27

## Incident

The 2026-08-27 report run (`20260827-preflight-8d97e742`, KPI source run `gdrive-20260827-main`, cutoff `2026-08-26`) built and verified both Outlook messages. Publication did not make an outbound GAS call because the orchestration environment lacked `REPORT_UPLOAD_EMPLOYEE_ID`; it recorded Website/App publication as not attempted. This was not an observed 404, redirect, 429, 5xx, network exception, timeout, or readback propagation failure.

The incident repair reused the immutable verified artifacts and did not fetch or parse source files, rebuild the mailed report/images, or resend mail. Existing Drive file IDs were updated in place and exact remote bytes were read back. Protected Website UI remains a separate login-gated acceptance state.

## Runtime changes

- Bounded retry for publish and Website/Supervisor readback only: attempts 1/2/3 with 2s and 5s waits.
- Retry allowlist: 404, 429, 500, 502, 503, 504, network exception, timeout.
- No retry for authentication/authorization, source date/hash/schema, single-sided awards, or business validation failures.
- KPI and awards six-stage completion gates are independent.
- Resume planning starts at unfinished publish/readback after verified artifact and mail evidence; resend/rebuild/source work is forbidden.
- JSONL failure evidence is allowlisted and strips URL query/hash; no request body or credential fields are logged.
- A fixture-only 8/28 flow proves transient recovery and fail-closed data validation without network, mail, or production mutation.

`runtime-after/` is the reviewable snapshot of the authoritative local automation files changed for this incident.

## Rollback

Restore the corresponding runtime files from the pre-change backup or revert this commit's review snapshot, then disable the new publication stage in the automation prompt. The 8/27 Drive content can be restored in place from the mode-0600 rollback copies under `report-automation/outputs/p0-rollback-20260827-before-publish/`; do not create replacement file IDs.
