# Audit Weekly Batch and Replay Design (Draft)

## Status and safety boundary

This is a design-only change. It does not alter Audit routes, data, deployment,
or employee flow. It is independent from Patrol PR-A and PR-B.

The current production batch, `audit-cleaning-202608`, remains an immutable
legacy month batch. Its submissions, photo files, review state, and event rows
must never be rewritten as part of weekly rollout.

Store employee flow remains permanently unauthenticated:
`select store -> name -> employee ID -> photos -> submit`.
`employee_id` is an audit-record field, not a credential. This design does not
introduce Approved Device, roster verification, employee/store enforcement, an
Audit login token, or an employee session. Supervisor-only reads and review
operations remain protected.

## Batch contract

New batches use the ISO-week key `audit-cleaning-YYYY-Www`. For example, ISO
week 34 of 2026 is `audit-cleaning-2026-W34`. The first rollout creates weekly
batches only from the next complete week after approval; it does not backfill,
rename, or remove monthly batches.

| Field | Meaning |
| --- | --- |
| `batch_id` | Weekly ISO key or existing monthly legacy key |
| `batch_kind` | `weekly` or `legacy_month` |
| `starts_on` / `ends_on` | Taiwan boundaries captured at batch creation |
| `store_ids` | The nine configured stores at creation time |
| `config_snapshot` | Immutable checklist and labels used for that batch |
| `created_at` | Server creation time |

The active-submission uniqueness rule is `(batch_id, store_id)`: a store may
have one active submission in one weekly batch. Historic submissions are not
overwritten when a later batch starts.

## Append-only events and photos

Replay is built from append-only facts rather than a current submission status.
New weekly writes append versioned records; no existing row is rewritten.

| Field | Required on new event and photo records |
| --- | --- |
| `event_version` | Schema version for safe future readers |
| `batch_id` / `submission_id` / `store_id` | Immutable identity linkage |
| `item_id` | Checklist item for photo/item-level events |
| `revision` | `1` on first submit; increments only for rework |
| `event_type` | `created`, `submitted`, `returned`, `resubmitted`, `approved`, or `cancelled` |
| `occurred_at` / `actor_role` | Server time and `store` or `supervisor` |
| `payload_snapshot` | Minimum immutable state needed to replay |

Photo metadata is append-only. A replay reader selects photos by `batch_id`,
`submission_id`, `store_id`, `item_id`, and `revision`, so first submission and
later rework never collapse into a “latest” image. Drive stays private; replay
uses a supervisor-authorized photo read, never a public raw link.

## Read-only replay experience

The supervisor UI adds a separate **Audit Replay** entry, not a store-page
change.

1. Batch selector: year and ISO week, plus legacy month batches such as
   `2026/08`.
2. Batch overview: all nine stores and batch state (unreported, submitted,
   returned-for-rework, resubmitted, approved).
3. Store replay: submitted name, employee ID, server times, three item states,
   per-item photos, decision, return reason, and final approval time.
4. Timeline: `created -> submitted -> returned -> resubmitted -> approved`,
   with revision markers and the photos for that revision.

Replay makes no write calls. It cannot change review state, cancel a submission,
edit identity fields, replace/delete photos, submit a revision, or recompute
historic state from present-day configuration.

## Backend routing and authorization proposal

The eventual implementation may add supervisor-protected read routes:

`audit_replay_batches`, `audit_replay_overview`, `audit_replay_detail`, and
`audit_photo_read`.

All require the supervisor authorization boundary. Store-facing routes remain
owner/edit-token based and do not gain identity login. Anonymous `audit_overview`
continues to return `unauthorized`.

## Migration plan

1. Add a batch reader that recognizes both `legacy_month` and `weekly` keys.
2. Add only new columns or append-only event records for weekly data; never
   bulk-rewrite existing Sheet rows.
3. Snapshot the nine-store configuration and checklist at weekly creation.
4. Start weekly creation at the next complete ISO week after explicit approval.
5. Default overview to the current active week; expose closed weeks and legacy
   months through read-only replay.
6. Retain `audit-cleaning-202608` and all existing submissions/photos exactly
   as stored, using a legacy adapter where historical fields are absent.

## Required regression matrix

- Weekly creation and Taiwan ISO-week rollover.
- Nine-store snapshot and same-store/same-week single active submission.
- Legacy `audit-cleaning-202608` replay.
- Submitted, returned, resubmitted, approved, and cancelled playback.
- First-submission versus rework photo revisions.
- Replay causes no Sheet, Drive, or submission mutation.
- Employee no-auth and absence of Approved Device, roster validation,
  employee/store mapping, employee token, and employee session.
- Supervisor route authorization and anonymous `audit_overview` denial.
- iPhone Safari reload for store flow and supervisor replay.

## Release gate

This must be a dedicated Audit Draft PR, never part of Patrol isolation or
mileage repair. Any future deployment requires separate Audit UAT, existing
submission/photo readback, migration dry run, supervisor authorization testing,
and a rollback that removes new replay UI/routes without changing historical
data. No deployment is authorized by this document.
