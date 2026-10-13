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

## Concrete control-plane candidate

`entrypoint_gate.mjs` now connects the scheduled `b-2` and exact manual conversation
`6aa35d1f-a438-83e8-81b2-77074837f7fc` to the same Mac-local ledger. Its production
CLI requires macOS and the real `/Users/liamlu/Downloads/liam-agent` checkout,
fixes `work/final-mail-ledger` internally and rejects caller ledger overrides.
It never calls Outlook itself. The provider's direct Outlook tools remain external;
the reviewed prompt/runbook candidates are the binding that must be installed.
See [control activation](../../control-activation.md) for exact owners and targets.

`prepare_control_plane_candidate.py` reads the current b-2/b-10 TOML and runbook,
checks their exact hashes/identity and emits private review copies plus diffs.
Only candidate prompt fields change; schedule/status/recipients remain preserved.
The manual instruction candidate is tied to the exact conversation. A cloud manual
flow without access to this same Mac stops with its draft; a separate cloud lock
cannot coordinate with the Mac. b-10 is a read-only reconciler, never a second sender.

1. Finish existing v4 build, independent source checks and actual final-file visual
   review, then run the guarded current-runtime preflight. It emits only
   `sealed_pending_sent_reconcile` with all final 13+6 immutable copies.
2. Resolve Outlook Sent Items using folder discovery. List by exact same-day
   subject and sent date, paginate to completion, fetch full messages and download
   every direct attachment. Supply `rawSentEvidence` containing complete query,
   fresh checkedAt, real recipients/CC/BCC and downloaded body/attachment paths.
   The bridge computes hashes and derives source/config identity from a version
   line sealed into the body. Missing identity, old/partial/multiple mails or
   unverified body extraction block sending. CRLF/HTML conversion that prevents
   exact body verification also remains blocked; no normalization is guessed.
3. Call `entrypoint_gate.mjs reserve request.json` with the registered entrypoint,
   type and manifest. A reservation returns `sendAllowed:false`. Immediately call
   `authorize` with its token; an atomic one-shot permit returns the exact `to`,
   `subject`, `text_content`, `attachment_files`, `save_to_sent_items` parameters.
   Only those fields may be sent once through the already-authorized connector.
   Repeat authorize is blocked, including concurrent calls. Query/download again,
   then call `complete` with the token and fresh raw evidence. Only exact unique
   readback returns VERIFIED. The common ledger persists across all run/source IDs.

Crashed locks and issued permits never expire into an automatic retry. Same-day
mismatch retains the draft, without replacement or partial resend. No direct tool
invocation was performed during this task. These candidates are not yet active;
installation/activation requires separate explicit approval.

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

31 Node and 26 Python regressions pass, covering full attachment contracts,
immutable seals, source/config mismatch, both registered entrypoints, concurrent
one-shot permits, uncertain readback, crash blocking, workbook source semantics,
DOD, Goodspeed pagination and guarded control-plane candidates. No external test mail.

The real 1013 source (SHA `2fffcbcd…e69a`) plus verified 1012 baseline ran the existing
seven-stage builder using an existing accepted v4 workbook as template. All stages
passed, all 11 daily PNGs were visually reviewed, and the two workbooks passed
independent cell/source verification. Existing generated sheets are reused so the
existing v4 template can be rebuilt without duplicate-sheet errors. The renderer's
positive difference missing glyph and crowded headers were corrected and reviewed.

The isolated current-Mac preflight successfully sealed 13+6 attachments. A local
mock transport using those actual sealed bytes blocked the early 9-item/old-body
corpus for both entrypoints (4 blocks), verified one fixture delivery per mail type,
and skipped duplicates from the other entrypoint (2 skips). External sends and
production writes were zero. This is not a live Outlook round-trip acceptance.

An independent awards check passed all 160 approved prices and 60 main-sheet price
formulas. Existing source errors outside the changed award price cells were
preserved, with zero new Excel error cells. The Mac's current awards producer still
emits one unnamed blank person alongside 40 named people / 4 real zero awards.
The separately delivered 10:07 Library PNGs correctly retain those 40 people and
were reused unchanged for this integration rehearsal, pinned to their known hashes.
This task does not replace or deploy the other owner's person-row fix. Before
activation, reconcile/install that owner's reviewed patch against the actual Mac
producer and rerun final visual review; do not overwrite it with a historical copy.

Before release approval: review the prepared current-runtime minimal patch and the
exact control-plane diffs, then approve merge plus Mac installation and manual
workflow activation separately. Neither bridge nor ledger currently exists at the
formal target path. Preserve current awards/config and other owners' changes.
Do not regenerate or resend today's already-delivered reports or retained drafts.

Authenticated UI acceptance for home KPI, home awards, app KPI and app awards remains
blocked: the Mac is locked and Chrome's tab-focus command times out. Connector/hash
readback does not replace rendered login UI acceptance. The bounded CI workflow is saved as `north12b-mail-contract.workflow-candidate.yml`: the current GitHub OAuth connection lacks workflow scope and cannot install it. No credential or permission changes were attempted. Existing workflow path filters do not run these contracts. A pre-existing Cloudflare Pages failure is separate from the passing local contract tests; GitHub CI acceptance remains unverified until an authorized maintainer installs the workflow candidate.
