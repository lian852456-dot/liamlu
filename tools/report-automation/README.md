# Official Report Ingest Consumer

This directory is the version-controlled host side of the official report-ingest loop. It does not contain KPI formulas, award formulas, mail templates, credentials, receipts, or runtime report files.

## Runtime chain

`report_official_ingest_consumer.mjs` claims a GAS job and calls the existing Mac automation processors through `REPORT_AUTOMATION_DIR`:

1. `run_daily_north12b_report.mjs`
2. `update_phone_awards.py`
3. `prepare_send_payloads.mjs`
4. `outlook_bridge_host_adapter.sh`
5. `build_github_pages_data.py`
6. the existing private publisher and formal readback

The consumer uses `runId:sourceHash` as the idempotency key. Exact promoted files are downloaded by File ID and verified by SHA-256 before any processor runs.

## Outlook host adapter

The adapter reads the unmodified `prepare_send_payloads.mjs` payload from the mode-`0600` request file. Formal mode starts an ephemeral, read-only Codex host invocation which may use only the installed Microsoft Outlook connector. The host must:

- reuse an exact Sent Items match for the same idempotency request;
- otherwise send the two existing bodies with their exact direct attachments;
- query Sent Items and list attachment metadata after each send;
- return real Outlook message IDs, exact attachment names, and the real sent time;
- fail closed if either send or either readback is incomplete.

SMTP, local Graph tokens, browser automation, generated message IDs, and rewritten mail templates are forbidden by both the host prompt and receipt validation.

Dry-run validates the actual request without invoking Codex or Outlook:

```sh
node tools/report-automation/outlook_bridge_host_adapter.mjs --dry-run /absolute/runtime/mail-request.json
```

Formal execution additionally requires the explicit runtime gate `REPORT_OUTLOOK_BRIDGE_ALLOW_SEND=YES`, the recipient, and the existing automation directory. The consumer wrapper obtains the GAS administrator secret from macOS Keychain. Outlook authorization remains inside the installed Codex Outlook connector; no Outlook token is read or stored by these scripts.

## Runtime configuration

Provide these through the automation host environment, never source control:

- `REPORT_AUTOMATION_DIR`
- `REPORT_WEBSITE_REPO_DIR` when the checkout cannot be inferred
- `REPORT_UPLOAD_GAS_URL`
- `REPORT_UPLOAD_EMPLOYEE_ID`
- `REPORT_OUTLOOK_RECIPIENT`
- `REPORT_OUTLOOK_BRIDGE_ALLOW_SEND=YES` only for an authorized formal run

The Keychain service remains `North12BPrivateDashboardAdminSecret`. Receipts and attempt evidence stay under the external runtime state directory with mode `0600` and are ignored by Git.

## Tests

```sh
node --test tools/report-automation/*.test.mjs
node --check tools/report-automation/report_official_ingest_consumer.mjs
node --check tools/report-automation/outlook_bridge_host_adapter.mjs
bash -n tools/report-automation/*.sh
```
