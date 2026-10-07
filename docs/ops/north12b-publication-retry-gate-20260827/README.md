# North12B publication retry and completion gate — 2026-08-27

## Incident

The 2026-08-27 report run (`20260827-preflight-8d97e742`, KPI source run `gdrive-20260827-main`, cutoff `2026-08-26`) built and verified both Outlook messages. Publication did not make an outbound GAS call because the orchestration environment lacked `REPORT_UPLOAD_EMPLOYEE_ID`; it recorded Website/App publication as not attempted. This was not an observed 404, redirect, 429, 5xx, network exception, timeout, or readback propagation failure.

The incident repair reused the immutable verified artifacts and did not fetch or parse source files, rebuild the mailed report/images, or resend mail. Existing Drive file IDs were updated in place and exact remote bytes were read back. Protected Website UI remains a separate login-gated acceptance state.

## Runtime changes

- P0 pre-mail credential/environment gate runs before cloud source, build, Outlook, publish, and readback.
- The 09:45 runtime loads `REPORT_UPLOAD_EMPLOYEE_ID` from macOS Login Keychain service `North12BReportUploadEmployeeId`; the value is never stored in automation TOML, prompt, Git, JSON/JSONL, manifest, stdout, argv, or shell history.
- Missing/invalid identity, Keychain, endpoint, runtime, or connector auth is a non-retryable configuration failure and exits with code 78 before source/build/mail.
- Publication wrappers can load the same Keychain identity directly, so they no longer depend on an interactive shell export.
- A clean-environment fixture uses the same Keychain wrapper and proves `env preflight → source → build → send gate → publish invoked → readback gate` without mail, network, or production writes.
- Bounded retry for publish and Website/Supervisor readback only: attempts 1/2/3 with 2s and 5s waits.
- Retry allowlist: 404, 429, 500, 502, 503, 504, network exception, timeout.
- No retry for authentication/authorization, source date/hash/schema, single-sided awards, or business validation failures.
- KPI and awards six-stage completion gates are independent.
- Resume planning starts at unfinished publish/readback after verified artifact and mail evidence; resend/rebuild/source work is forbidden.
- JSONL failure evidence is allowlisted and strips URL query/hash; no request body or credential fields are logged.
- A fixture-only 8/28 flow proves transient recovery and fail-closed data validation without network, mail, or production mutation.

`runtime-after/` is the reviewable snapshot of the authoritative local automation files changed for this incident.

## Verification

- Publication, retry, completion-gate, credential-preflight, and fixture dry-run tests: 41/41 PASS.
- Credential regression: persistent env PASS; missing/invalid identity is non-retryable and blocks source/build/send/publish/readback at 0 invocations; serialized evidence contains no credential value.
- Google Drive and Outlook connector profile/auth checks: PASS (read-only; profile values suppressed).
- Full repository Playwright regression: 187/193 PASS. The six failures are existing Patrol/half-month read fixtures outside this docs-only branch; this branch does not modify their product or test files.
- Live clean-environment Keychain dry-run remains pending until the one-time secure Login Keychain entry is completed. Do not claim the 8/28 root cause closed before that result is PASS.

## Rollback

Restore the corresponding runtime files from the pre-change backup or revert this commit's review snapshot, then remove the P0 preflight paragraph from automation `b-2`. If the identity Keychain item must be retired, delete only service `North12BReportUploadEmployeeId`; do not delete the administrator Keychain item. The 8/27 Drive content can be restored in place from the mode-0600 rollback copies under `report-automation/outputs/p0-rollback-20260827-before-publish/`; do not create replacement file IDs.
