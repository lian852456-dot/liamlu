# P0 Google Drive cloud production source — 2026-08-24

## Outcome

- b-2 remains `ACTIVE` at 09:45 Asia/Taipei and now requires the Google Drive folder `1zs4flckF4uysz55tXkAxojM5-yB6a9sH` as the sole production source.
- Production accepts only `provider=google-drive-cloud`; OneDrive, local CloudStorage, staging, outputs, cache, old files and mixed-provider input are forbidden fallbacks.
- The connector creates a credential-free handoff. Runtime revalidates the exact folder/file IDs, canonical basenames, modified times, sizes and downloaded SHA-256 values before creating 0600 run-scoped immutable staging.
- KPI and both awards Excel files must expose the same parsed business cutoff. Both awards raw hashes must advance together.
- Awards-only publication accepts provider-specific Google Drive identity without inventing an eTag, preserves KPI payload/component metadata byte-for-byte, and restores the previous container text if post-write verification fails.
- The Keychain wrapper now routes `--awards-component-only` to the component publisher, and that publisher accepts `REPORT_MANIFEST_PATH` so a fresh run cannot overwrite the earlier same-day manifest.

## Production preflight evidence

- run_id: `gdrive-20260824-224101-c8b5a8f4`
- cutoff: `2026-08-23`
- KPI: `0824.xlsx`, Drive ID `1Fc23jygTzTybM-2_te0tUeA7xYTWv04B`, SHA-256 `0808c89a5b122caa4096098a7a8119a53f5f480761c3acabccc2c31832414422`
- store awards: canonical `01-08-03`, Drive ID `1SbFb6qegjXsaiqGt2UaB-JFsWKV7gEHM`, SHA-256 `c8b5a8f407de02a54efc414698d7b326965b2d33a2be00881df9640e3633ab11`
- person awards: canonical `01-08-04`, Drive ID `1IF_RH7KWzYtoLmft1RT6nXcLkkAglfwx`, SHA-256 `2e00cbe2b694718ef351834212d03403c3e9c8b44b8a30e4d17f00b0e4e09363`
- fresh build: 13 models, 10 rows including district aggregate, nine stores, same run_id and cutoff.

## Formal acceptance evidence

- Apps Script deployment `v35` published the provider-specific awards component route; `v34` remains the immediate code rollback.
- Awards-only protected publication completed at `2026-08-24T22:57:41+08:00`; KPI report date, run ID, source file and KPI payload hash were preserved.
- Website protected readback: `2026-08-23`, 13 models, 10 rows (district aggregate plus nine stores).
- Liam Supervisor App protected readback: KPI `103.5%`, company rank `33`, nine stores, and 13 models on the selected-store awards view.
- A clearly marked correction mail was sent from the fresh run and verified in Sent Items with six direct attachments; the earlier mail was retained and KPI mail was not resent.

## Regression

- Runtime source/publish tests: Node 43/43 and Python 10/10 passed.
- Repository contract tests: 260/260 passed.
- Covered cloud-new/local-old, cloud failure with local file present, immutable identity change with unchanged raw SHA, one-sided awards update, aligned two-file update, source/date mismatch, mixed provider, no fake eTag, KPI preservation and stale top-level timestamp.

## Rollback

- Runtime/config backup: `report-automation/audit-backups/google-drive-cloud-20260824-before/` plus `report-automation/audit-backups/google-drive-20260824-automation.toml.candidate`.
- Code rollback: revert this commit and redeploy the prior Apps Script deployment version. Reverting must not be used to re-enable silent fallback.
- Data rollback: awards-only publisher preserves the pre-write container text and restores it on verification failure; KPI is not part of this release.
