# North12B final mail gate

2026-10-13 incident: the active Mac b-2 path built and sent its older 9-item daily
contract at 09:54:35, then its 6-item awards mail at 09:55:12 (Asia/Taipei).
The 10:00 reconciliation verified those exact same-run bytes. A separate completed
batch at 10:07:41 required the v4 daily set (13 items on this date), found an
existing same-day mail, and retained its completed drafts without resending.
This proves contract/version divergence and late reconciliation, not a demonstrated
race between threads of one runner. The raw source was identical. Several shared
attachment names also had different bytes; the v4 Goodspeed filename differs.

## Candidate scope and release boundary

This change is a draft, not a production deployment. No schedule, recipient,
credential, permission, website, current report artifact or employee-row patch is
changed. The current formal awards producer and approved October config stay intact.
Do not replace the Mac runtime with the historical `runtime-after` snapshot: it
predates several authorized changes. `prepare_mail_runtime_patch.py` transplants
only the new gate against the current file with exact-context and digest guards.
Its output is a candidate and patch; it never installs files.

For dates from 2026-10-13, preflight cannot emit a sendable legacy payload. It
requires the existing v4 artifact builder's completed build receipt, daily and
awards manifests, and a separate visual receipt tied to every final file hash.
The v4 builder's `PENDING_VISUAL_REVIEW` entries are deliberately insufficient.
The attachment contract includes all twelve fixed items and every actual Goodspeed
page (`Goodspeed_Detail_DATE.png` or contiguous `_p1`, `_p2`, …).
The current date therefore has 13 KPI attachments and 6 awards attachments.
No old `Good_Speed` alias, missing attachment or same-name changed byte is accepted.

`REPORT_FINAL_MAIL_INPUT` names a private JSON file containing `reportDate`, `runId`,
`artifactRunId`, `configHash`, `dailyManifestPath`, `awardsManifestPath`,
`buildReceiptPath`, `visualReceiptPath`, `sourceContractReceiptPath`, `closureAuditPath`, `dailyDir`, `awardsDir`.
The visual receipt is `{status:"pass",runId,artifactRunId,sourceSha256,configHash,
artifacts:[{name,sha256},…]}` and must follow review of the actual final bytes.
The separate source-contract receipt must be emitted by `verify_artifacts.py` after
checking the actual workbook cells. Its hash is pinned by the attachment manifest;
the final gate also checks its report/source identity and every daily attachment hash.
The existing `scripts/north12b/run_report.py` remains the layout/build entrypoint;
no new report template is introduced. Its closure audit now records source filename
and SHA in addition to the existing keyed numerator/denominator data.

Preflight copies validated bytes and mail bodies into a new run-scoped seal and
records its digest. It never overwrites an existing seal or same-day run manifest.
Subsequent sends consume those copied paths, not shared `outputs/`.

## Direct connector integration that must accompany deployment

The active b-2 sends through direct Outlook tools, not the historical P1 shell
sender. Deploying a helper alone does not intercept those tools. Before production
activation, update the read-before-run runbook's build and send instructions to
require this gate for **both** the 09:45 path and any later recovery/manual path.
Keep the schedule and recipient unchanged. The older automation prompt's 8/9-item
instruction must not authorize a bypass; the finalized contract is the gate.

1. Complete the existing v4 build, current awards patch/verification, and visual
   review. Prepare `REPORT_FINAL_MAIL_INPUT` and run the patched preflight. Its
   mail status is `sealed_pending_sent_reconcile`, not a send authorization.
2. Query Outlook **Sent Items by exact same-day subject**, including all versions;
   download the direct attachments and body for comparison. Record a normalized
   private evidence JSON with a complete query (`folder:"Sent Items"`, `reportDate`,
   `subject`, `complete:true`, `checkedAt`), and `messages`. For each message record
   `id`, `subject`, `recipient`, downloaded `bodySha256`, `configHash`,
   `sourceIdentitySha256`, and `attachments:[{name,bytes,sha256,inline:false},…]`.
   Missing source identity must remain blocked. A fresh `NOT_FOUND` means a complete
   empty same-day-subject query, not a query for only the new digest/version.
3. Call `node mail_gate.mjs reserve request.json`, where request supplies
   `manifestPath`, `type` (`daily` or `phone_awards`), the same durable `ledgerRoot`
   for all entrypoints, and `sentEvidence`. Only `RESERVED/sendAllowed:true` may
   invoke the already-authorized direct connector once with the returned body and
   attachment paths. Reverify seal bytes immediately before connector invocation.
   `ALREADY_PRESENT` skips send; old/partial/multiple/uncertain matches stop.
4. Immediately read back Sent Items and call `mail_gate.mjs complete request.json`
   with the reservation token and verified evidence. Only `VERIFIED` is success.
   Keep the per-mail durable receipt beside the shared ledger; final processing
   references these receipts rather than resetting a `mailIds:[]` manifest.

Reservations are atomic across report date + mail type, independent of source/run
IDs. In-flight receipts and crashed locks never expire into automatic resend.
Reconcile uncertain sends read-only; a stale lock needs explicit reviewed recovery.
Two connector sends are sequential. Publication and other channels keep their
existing gates; this patch does not grant publishing or sending permission.

## Closure definitions

The source `續約率(分子)` uses its named `用戶人數` as numerator, and
`續約率(分母)` uses **all** its named `用戶人數` as denominator. Current v4 code
explicitly forbids substituting the denominator's status column as numerator.
The older contact helper instead calculates Y/(Y+N), excluding `無續約`.
On 10/12 these are respectively 62/154 = 40.3% and 62/121 = 51.2%, with 33
`無續約` cases. Both computations are preserved, with distinct definitions/labels
and same-source/cutoff reconciliation. This does not infer which historic user
approval selected a single universal denominator; that exact approval transcript
was not retrievable. No numeric policy is silently changed.

## Other source differences in this incident

The v4 manager category started from personal rows, then replaced `official` and
`items` with the matching store row; its DOD also selected previous store KPI.
September onward now retains the employee's personal KPI and employee-key DOD;
missing personal KPI blocks instead of falling back to store KPI. Pre-September
behavior remains unchanged. Source-backed personal totals and each personal metric
are checked independently from store totals; an apparently complete manifest is
not sufficient to approve substituting one for the other.

The v4 QIS score keeps source aggregate F13 = 97.21333. The older supplemental
helper missed that aggregate and used a case-weighted 97.457… fallback; final mail
body now uses the same source-contract receipt as the attachment. The source gate
rejects weighted-score substitution. The final add-on company ranks were already
restored by the v4 upgrade, but the earlier build used 1–9 physical-row ordinals;
both stages now use source company ranks, with a clear company-rank label.
`YT/天下` was a misleading label for the Apple/Google service and magazine weekly
source group; its label is corrected, with sufficient header height. Main prepaid
values are checked independently for aggregate and store headers (115% vs 116.2%
in the investigated source), so an RT rate cannot pass under the prepaid label.
The prior 13-item manifest without this semantic verification version is blocked;
latest manifest presence alone cannot authorize a source-policy change.

## Validation and remaining acceptance

23 new Node regressions cover completeness, visual/build receipts, immutable copies,
tampering, dynamic Goodspeed pages, simultaneous reservations, crashes, uncertain
post-send state, old same-day mail and explicit closure/source definitions. Five
new Python tests independently reject manager store substitution, QIS weighting,
ordinal ranks, service-label and prepaid/RT confusion in workbook cells. Existing DOD
4 and sales/GoodSpeed Python 15 tests pass. Real 1013 source key/subset and count
reconciliation pass. Current Mac candidate without a final input fails before data
loads or payload emission. These tests use local fixtures; no external test mail.

Before release approval: inspect the exact minimal runtime patch and configure the
existing v4 build/visual receipts in an isolated rehearsal; bind both direct connector
entrypoints to the shared ledger; preserve the current producer/config hashes;
approve merge + installation separately. Do not regenerate or resend today's
already-delivered report images or retained drafts.

Authenticated UI acceptance for home KPI, home awards, app KPI and app awards remains
blocked: the CUA inventory reports the Mac locked and Chrome's tab-focus command
times out. Connector data/hash readback is not a substitute for rendered login UI.
