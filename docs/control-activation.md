# North12B mail control-plane candidate

This document describes a review-only candidate. The transformer stages candidate files and does not install them, change schedules, call Outlook, or publish data.

## Owners and live targets

| Owner | Current control plane | Candidate responsibility |
|---|---|---|
| Scheduled primary | `/Users/liamlu/.codex/automations/b-2/automation.toml` (active, local Mac, daily 09:45) | Sole scheduled sender after its prompt and runbook are reviewed and separately activated. Existing status, RRULE, project, cwd, model, and recipient text are preserved by the transformer. |
| Scheduled recovery | `/Users/liamlu/.codex/automations/b-10-00/automation.toml` (active, local Mac, daily 10:00) | Read-only reconcile of the same Mac ledger. It does not reserve or send. |
| Manual workflow | ChatGPT conversation `6aa35d1f-a438-83e8-81b2-77074837f7fc` (`北一二B正式發布`) | Must materialize and execute on the same Mac, using the same sealed manifest, gate, and ledger as b-2. If it cannot access the Mac, it retains the draft and stops. This candidate is not sent to or installed in the conversation. |
| Shared runbook | `/Users/liamlu/Downloads/liam-agent/report-automation/docs/B2_DAILY_AUTOMATION_RUNBOOK.md` | Candidate addendum sets one mail protocol and 13 KPI + 6 awards direct attachment contract against the approved manifest. The live runbook remains unchanged. |

The fixed Mac ledger candidate is `/Users/liamlu/Downloads/liam-agent/report-automation/work/final-mail-ledger`. Candidate prompts call the Mac-local bridge at `/Users/liamlu/Downloads/liam-agent/report-automation/work/entrypoint_gate.mjs`; it fixes the ledger internally and rejects caller-supplied ledger paths. b-2 uses entrypoint `b-2`; the manual conversation uses `manual:6aa35d1f-a438-83e8-81b2-77074837f7fc`. The bridge may not yet be installed at that runtime path; verify its presence and CLI contract during activation. A direct Outlook call may use only fields and paths from a successful one-shot `authorize` permit.

## Candidate behavior

- A fresh, complete Sent Items query is required before reserve and after send. Raw proof includes query completeness, date, subject, checked time, message IDs/recipients, and materialized body/attachment paths; the bridge computes hashes for message, body, source/config provenance, and every direct attachment. The query must be no older than 60 seconds.
- `reserve` creates a reservation but never authorizes send (`sendAllowed=false`). Immediately call `authorize` with the returned token. Only the one-shot permit supplies the direct Outlook `to`, `subject`, `text_content`, `attachment_files`, and `save_to_sent_items` values. After send, download the sent body and attachments and call `complete` with a new fresh complete query and the same token. Source/config identity must come from the sealed body's provenance line.
- A same-day mail that differs from the approved sealed manifest blocks sending. No replacement or partial resend is allowed.
- Any reservation in flight, timeout, crash, uncertain send or readback, incomplete query, or hash mismatch blocks retries. Preserve the reservation and draft for read-only reconciliation.
- b-10-00 may read the ledger and reconcile; it cannot reserve, authorize, call a sender, rebuild, or write the website.
- The manual conversation is tied to the exact ID above and cannot use a cloud-local lock. If it lacks access to the Mac gate/ledger or Outlook connector, it stops with the draft preserved.

## Generate a private review bundle

From this repository, run:

```sh
python3 scripts/north12b/prepare_control_plane_candidate.py
```

The transformer reads only the three live inputs in the table, verifies their current SHA-256 values and expected automation identity/schedule, then writes a new directory under `/Users/liamlu/Documents/Codex/2026-10-12/task-2/control-plane-candidate-20261013/`. It changes only the TOML `prompt` field in candidate copies; all other TOML values are checked for exact preservation. It writes a runbook addendum, exact-thread manual instruction candidate, unified diffs, and a receipt with hashes and zero side-effect counts. It refuses an existing output directory, any changed source hashes, or an output path outside that private root.

To validate only the synthetic transformer contract:

```sh
python3 -m unittest discover -s tests -p 'test_control_plane_candidate.py'
```

## Activation boundary

No live TOML, runbook, or ChatGPT conversation is changed by this PR. Activation requires separate review and explicit authorization for the actual control-plane changes. Before activation, confirm the Mac gate/bridge is installed at the candidate path and that both send-capable entrypoints use the same ledger. The repository's local file reservation alone does not coordinate a cloud host. Until an atomic Mac-local bridge and shared ledger are available to both senders, the manual workflow must fail closed instead of sending from cloud.
