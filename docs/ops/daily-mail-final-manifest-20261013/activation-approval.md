# PR #233 activation and approval record

This is a proposed activation scope only. PR #233 is still a draft. No repository workflow, Mac runtime, automation prompt, manual conversation, report, website, or mail action has been activated by this proposal.

## Current CI blocker and exact action

- PR: [#233 — Fix North12B final mail/source contracts and shared Mac send gate](https://github.com/lian852456-dot/liamlu/pull/233). The CI permission evidence was captured at `f875b7d` (`Bind scheduled and manual mail candidates to one-shot Mac gate`); the PR now also carries the existing owner-patch integration. The PR page remains Draft.
- Check page: [PR #233 checks, selecting check run 115121865250](https://github.com/lian852456-dot/liamlu/pull/233/checks?check_run_id=115121865250). Check `115121865250` is the Cloudflare Pages build failure on head `f875b7d`; it is a separate existing Cloudflare check (also present at base `119`), not a failure from this mail-contract workflow. No formal deployment was performed by this task.
- GitHub rejected installing the workflow under `.github/workflows` because the connected GitHub OAuth App lacks the `workflow` scope. This is a file-install permission blocker, not a missing `workflow_dispatch` invocation. A manual trigger cannot run a workflow file that has not been installed in the repository's workflow directory.
- The bounded candidate is currently at [`north12b-mail-contract.workflow-candidate.yml`](./north12b-mail-contract.workflow-candidate.yml). An authorized repository maintainer with permission to add/update workflow files must promote it to `.github/workflows/north12b-mail-contract.yml` through an authorized repository change. The workflow requests only `contents: read`, runs local contract tests, and has no Outlook/Drive connectors or mail credentials. No credential or GitHub access change is proposed.
- Until that file is installed, existing path filters do not cover these contracts and PR #233 has **zero runs of its own Actions workflow**. The retained 57 baseline tests and post-integration 67 distinct local regressions are local evidence, not GitHub CI acceptance. The Cloudflare failure remains a separate red check and must not be described as the mail tests failing.

## Who approves each boundary

| Boundary | Required authorization | Effect |
|---|---|---|
| Merge PR #233 | Liam's explicit review/merge approval and the repository's normal maintainer review | Adds the reviewed code/docs/tests to the repository. It does not install the Mac runtime or send mail. |
| Install bounded GitHub Actions workflow | An authorized repo owner/maintainer who can add `.github/workflows` content; Liam reviews the proposed workflow change | Enables bounded CI on matching pull requests. No secrets, connector access, write permissions, or mail action are needed. Do not broaden the OAuth App scope as a workaround. |
| Install Mac runtime bundle and create the shared ledger directory | Liam's separate explicit approval for the exact runtime file manifest and before/after hashes | Installs code only. It must not run the daily producer, publish website data, or invoke Outlook. |
| Change b-2/b-10 prompts, runbook, and exact manual workflow instructions | Liam's separate explicit approval of the prompt/runbook/manual diffs | Changes operating instructions. Preserve both schedules, statuses, project/cwd, and recipient; prompt text changes themselves still require review. b-10 remains read-only. |
| First real end-to-end send acceptance | Liam's separate explicit approval of the exact report date, sealed manifest digest, and side effects | Permits one normal unsent daily email and one normal unsent awards email under the checks below. Installation approval alone is not send approval. |

No credentials are requested, generated, printed, or changed by these steps. Do not add employee or customer records to this document or the public repository.

## Full proposed formal install scope

The following pieces form one activation package; none is active until individually reviewed and approved:

1. **Repository package.** Review and, if approved, merge PR #233, including the sealed-mail contracts, closure metrics, local gate/bridge, source/build regressions, control-plane candidate transformer, tests, and this activation record. Promote the bounded workflow candidate separately to `.github/workflows/north12b-mail-contract.yml`; retain its read-only permissions and bounded test commands. Do not add credentials or provider connectors to CI.
2. **Current Mac mail/runtime helpers.** Re-run the guarded minimal transformer against the then-current `/Users/liamlu/Downloads/liam-agent/report-automation/work/prepare_send_payloads.mjs`; install only after checking the current source hash and complete candidate receipt. Install the reviewed `entrypoint_gate.mjs`, `mail_gate.mjs`, `final_mail_batch.mjs`, and `closure_mail_metrics.mjs` together with their exact declared runtime dependencies. The gate must keep fixed Mac entrypoints `b-2` and `manual:6aa35d1f-a438-83e8-81b2-77074837f7fc`, validate its real Mac project path, reject caller-selected ledger roots, and share `/Users/liamlu/Downloads/liam-agent/report-automation/work/final-mail-ledger`. Do not cherry-pick a stale mail-preparation patch that predates the bridge's reserve/authorize/complete interface.
3. **Versioned v4 builder library.** Place the already reviewed North12B v4 producer/build helpers in an isolated versioned library under `/Users/liamlu/Downloads/liam-agent/report-automation/lib/`. Preserve the accepted v4 workbook template, approved formal configuration, and verified Chinese font assets used by the rehearsed build. Install the exact dependencies and hashes from the final candidate manifest; do not overwrite the live builder with a historical runtime snapshot or replace the formal template/config/fonts. A final module/dependency receipt must list each source, target, SHA-256, version, and rollback copy before installation.
4. **Preserve the other owner's award-row fix.** The approved native Library patch is `apply_person_award_fix_20261009.py`, Library file ID `libfile_6092496c98788191ae0a89aab113df6d`, SHA-256 `70fcd55724f912ff8f472a11159c5cfcf7ccf20ea1f4e5e85a04db8e0e72904d`. The exact patch has been integrated into a guarded candidate only: runtime source SHA `dac7eba2e5a8b7ab5aff05aeda6d822c79f16c70e533b7df64678660df5c21cc`, candidate SHA `57c046e01c727bec554d5a9665b6c43a44bd12c3dc916191556978bd563bff6f`; six owner regressions passed. Before install, re-check the live producer hash and apply this immutable patch without replacing unrelated source changes; rerun its six tests and final visual review. If the source hash differs, stop and reconcile the owner patch against the live file before proceeding.
5. **Control plane.** Review the exact b-2 and b-10 TOML prompt candidates, the runbook candidate, and the manual instruction tied to conversation `6aa35d1f-a438-83e8-81b2-77074837f7fc`. They preserve status, schedule/RRULE, model, project, cwd, and the existing recipient text; b-2 and manual instructions change, so they need explicit approval. b-2 is the sole scheduled sender. The manual workflow runs only on the same Mac and fails closed while retaining the draft if Mac bridge/ledger access is absent. b-10 only reconciles the shared ledger and never reserves, authorizes, or sends.
6. **Code-only installation boundary.** Installing code, workflow, or approved prompts must result in zero Outlook sends, zero website/Drive writes, zero LINE actions, and zero report regeneration. Do not run the formal runner as part of installation. Preserve the prior runtime under a hash-verified rollback copy and keep any in-flight reservation intact.

The current formal Mac targets `/Users/liamlu/Downloads/liam-agent/report-automation/work/entrypoint_gate.mjs` and `/Users/liamlu/Downloads/liam-agent/report-automation/work/final-mail-ledger` do not yet exist. The final runtime manifest and dependency list are attached to the Library approval packet. Their absence confirms installation is still pending; it does not authorize a cloud-local substitute. The complete private `install-inventory.json` now lists 24 code/control file targets, their before/after hashes, two new directories and a dependency symlink. It is included in the Library review packet.

## Exact versioned builder and dependency targets

The versioned library proposed in the private inventory is
`/Users/liamlu/Downloads/liam-agent/report-automation/lib/north12b-mail-20261013/`.
It contains `scripts/north12b/{run_report.py,extract.py,build_kpi_report.mjs,
upgrade_v4_0908.mjs,render_xlsx_cjk.py,verify_artifacts.py,dod.mjs,
report_source_contract.mjs,semantic-format.mjs,sales_sheet.mjs,sales_metrics.py,
source_semantics.py}` and `scripts/render_goodspeed_detail.py`. Preserve that relative
layout. It adds project-local `fonts/NotoSansTC-Regular.ttf` and
`fonts/NotoSansTC-Bold.ttf`; it does not install system fonts. Its `node_modules`
symlink points only to the already verified bundled dependency directory. The
rehearsal used Node 24.19.0, Python 3.12.14, artifact-tool 2.8.91, openpyxl 3.1.5 and
Pillow 12.3.0; verify the actual installed versions before activation, without
installing global packages. The template is read unchanged from the existing
`incident-20260909/visual-audit/originals/TWM_North12B_Daily_Report_2026-09-09.xlsx`
(SHA `806f52ba…976e`); approved October config remains SHA `36e4f424…ef51`.

Both producers and preflight run in a new run-specific project/work/output/logs
copy, with verified current/previous staged source paths and the approved config.
The b-2 prompt candidate now includes the concrete versioned v4 `run_report.py`
invocation before final-mail preparation. This avoids taking a mail body or file
from another run's shared outputs. Installation itself does not execute that
invocation or overwrite current report data. The manual workflow must delegate
all local production/send steps to this same Mac; absent that execution route,
it retains its draft and performs no send.

## Separate real-send acceptance

The first real send is a separate, explicitly approved acceptance on the next normal report date that has not already been sent, using that date's fresh, source-verified data. It is **not** a resend or correction for 2026-10-13.

- **Recipient:** the existing single recipient `lian852456@gmail.com`; no CC or BCC. The sealed permit, not a prompt or hand-edited request, supplies recipient, subject, body, attachments, and Sent Items behavior.
- **Daily KPI mail:** use the exact reviewed manifest. The current standard set is 2 XLSX plus 11 PNGs, normally 13 direct attachments. Goodspeed detail is page-dynamic, so additional pages can increase the attachment count; the sealed manifest is authoritative and must contain every page. Never force the count to 13 by dropping a page.
- **Awards mail:** 6 direct attachments, as listed in the same approved, date-specific source-checked manifest.
- **Before send:** verify report/cutoff dates, source/config hashes, final-render review, complete attachment names/bytes/SHA-256, and a fresh complete Sent Items query for each mail type. One exact same-day message matching the same sealed manifest is `ALREADY_PRESENT` and is skipped. Any same-day message with a count, body, source, config, name, or hash mismatch blocks that mail type; do not send a duplicate or partial correction.
- **Send protocol:** one run ID and the fixed Mac ledger. `reserve` is not permission to send; `authorize` must return its one-shot permit immediately before the direct Outlook call. Use only permit-provided values and paths. Download the sent body and attachments, perform a new complete Sent Items readback, and call `complete`; only one exact message with all hashes proven counts as accepted. After b-2 completes, the manual counterpart performs read-only reconciliation only.
- **Acceptance counts:** for the next unsent date, at most one KPI message and one awards message to that single recipient, with exact manifest-derived attachment counts (normally KPI 13, dynamically more when Goodspeed paginates; awards 6). If either message already exists exactly, send count for that type is zero. If either is mismatched or uncertain, stop; no automatic second attempt. Confirm Sent Items readback and the normal recipient-side receipt check before declaring acceptance.
- **2026-10-13 exception:** today's 9-item KPI and 6-item awards messages are already present and do not match the final 13+6 candidate. This install proposal sends nothing for that date. A corrected 10/13 message would be a duplicate-risk exception requiring a separate explicit user approval and a separately reviewed replacement/correction protocol; the current gate intentionally blocks it, and no override is included here.

## Rollback and stop conditions

- Before any activation, retain the previous runtime files and verify their hashes. If the code-only installation fails before a send, restore only from the recorded backup after the owner approves rollback; do not touch existing data or messages.
- After any reservation, send attempt, crash, timeout, or uncertain readback, never delete the ledger receipt, clear a lock, reset the counter, or retry. Reconcile Sent Items and the same sealed manifest read-only first; an `IN_FLIGHT` state remains blocked until reviewed.
- Stop if the source hash or owner-patch base hash differs; the live bridge/ledger path is missing; an attachment is missing, duplicated, mutable, or hash-mismatched; an existing same-day message is not exact; UI/visual acceptance fails; or source/config provenance is unavailable. Do not continue by switching host, ledger, template, recipient, or report date.

## Evidence snapshot

The permission/check snapshot at `f875b7d` shows the Cloudflare Pages build failure; the dedicated mail-contract workflow has not run because its workflow file has not been installed. Current local test success and simulated transport do not replace GitHub Actions acceptance or the later live Outlook round-trip. Formal installation and the separate first-send acceptance remain pending.
